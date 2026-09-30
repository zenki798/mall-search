// 앱(PWA) 설치 — 홈 화면에 추가하면 주소창·툴바 없이 뜨는지, 앱 모드 넘겨보기가 동작하는지
const { test, expect } = require('@playwright/test');
const { trackErrors, stubOpen, opened, malls, urlOf } = require('./helpers');

test('manifest: 단독 실행(standalone), 시작 주소·범위, 아이콘 3종(일반 192·512, 마스커블)', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.display).toBe('standalone');
  expect(m.start_url).toBe('./?source=pwa');
  expect(m.scope).toBe('./');
  expect(m.name).toBeTruthy();
  expect(m.short_name.length).toBeLessThanOrEqual(12); // 홈 화면 아이콘 아래 잘리지 않게
  const has = (size, purpose) => m.icons.some(i => i.sizes === size && i.type === 'image/png' && (i.purpose || 'any').includes(purpose));
  expect(has('192x192', 'any')).toBe(true);
  expect(has('512x512', 'any')).toBe(true);
  expect(has('512x512', 'maskable')).toBe(true);
});

test('아이콘 파일이 실제로 있고 적힌 크기와 같다 (apple-touch-icon 포함)', async ({ page }) => {
  await page.goto('/');
  const sizes = await page.evaluate(async () => {
    const m = await (await fetch('manifest.webmanifest')).json();
    const list = m.icons.map(i => ({ src: i.src, want: Number(i.sizes.split('x')[0]) }))
      .concat({ src: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'), want: 180 });
    return Promise.all(list.map(({ src, want }) => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ src, want, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ src, want, w: 0, h: 0 });
      img.src = src;
    })));
  });
  for (const s of sizes) expect(s, s.src).toMatchObject({ w: s.want, h: s.want });
});

test('크롬이 설치 가능한 앱으로 인정한다 (설치 불가 사유 0건)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await page.context().newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
  await expect.poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors, { timeout: 10000 })
    .toEqual([]);
  expect(errors).toEqual([]);
});

test('한 번 연 뒤에는 인터넷이 끊겨도 화면이 뜬다 (서비스 워커 캐시)', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();                                   // 서비스 워커가 페이지를 맡은 상태로
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.goto('/?source=pwa&q=' + encodeURIComponent('빼빼로'));
  await page.waitForFunction(() => window.__ready === true);
  await expect(page.locator('.mall-link[href]')).toHaveCount(await page.evaluate(() => window.Malls.malls.length));
  await context.setOffline(false);
});

test('안전 영역(노치) 대응: viewport-fit=cover 와 테마 색상이 있다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', /^#/);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
});

test.describe('앱 모드 (홈 화면에서 실행)', () => {
  async function openAppMode(page, q) {
    await page.goto('/?source=pwa' + (q ? '&q=' + encodeURIComponent(q) : ''));
    await page.waitForFunction(() => window.__ready === true);
  }

  test('앱 모드 표시가 붙고, 설치 안내·"모두 새 탭으로"는 보이지 않는다', async ({ page }) => {
    await openAppMode(page);
    await expect(page.locator('html')).toHaveClass(/app-mode/);
    await expect(page.locator('#install-bar')).toBeHidden();
    await expect(page.locator('#open-tabs')).toBeHidden();
  });

  test('넘겨보기는 한 곳씩 앱 위 브라우저로 열고, 다음을 누르면 다음 쇼핑몰을 연다', async ({ page }) => {
    await stubOpen(page);
    await openAppMode(page, '빼빼로');
    const all = await malls(page);
    await page.click('#view-start');
    await expect(page.locator('#viewer-pos')).toHaveText(`1 / ${all.length}`);
    await expect(page.locator('#viewer-close')).toHaveText('넘겨보기 끝내기');
    await expect(page.locator('#viewer-tip')).toContainText('닫기(✕)로 돌아와');
    await page.click('#next');
    await page.click('#next');
    await page.click('#prev');

    const calls = await opened(page);
    expect(calls.map(c => c.url)).toEqual([0, 1, 2, 1].map(i => urlOf(all[i], '빼빼로')));
    expect(calls.every(c => c.name === '_blank' && !c.features)).toBe(true); // 옆 창(popup) 아님
    await expect(page.locator('#viewer-pos')).toHaveText(`2 / ${all.length}`);
    // 데스크톱처럼 목록을 왼쪽 1/3 로 줄이지 않는다 (결과가 앱 위에 겹쳐 뜨므로)
    expect(await page.locator('.wrap').evaluate(el => getComputedStyle(el).maxWidth)).toBe('960px');
  });

  test('앱 모드에서는 결과 창을 감시하지 않으므로 넘겨보기 막대가 저절로 사라지지 않는다', async ({ page }) => {
    await stubOpen(page);
    await openAppMode(page, '생수');
    await page.click('#view-start');
    await page.waitForTimeout(1500);
    await expect(page.locator('#viewer')).toBeVisible();
    await page.click('#viewer-close');
    await expect(page.locator('#viewer')).toBeHidden();
  });

  test('쇼핑몰 이름을 누르면 그곳이 열리고, 다음은 그 다음 쇼핑몰부터 이어진다', async ({ page }) => {
    await stubOpen(page);
    await page.context().route(/^https:\/\//, r => r.abort()); // 실제 쇼핑몰에는 접속하지 않는다
    await openAppMode(page, '틴트');
    const all = await malls(page);
    const i = all.findIndex(m => m.id === 'oliveyoung');
    const popup = page.waitForEvent('popup');
    await page.click('.mall-link[data-link="oliveyoung"]');   // 링크는 브라우저 기본 동작으로 열린다
    await (await popup).close();
    await expect(page.locator('#viewer-name')).toHaveText('올리브영');
    await page.click('#next');
    expect((await opened(page)).map(c => c.url)).toEqual([urlOf(all[i + 1], '틴트')]);
  });

  test('앱 모드에서도 주소가 ?source=pwa 를 유지해서 검색 후에도 앱 모드가 풀리지 않는다', async ({ page }) => {
    await openAppMode(page);
    await page.fill('#q', '세제');
    expect(page.url()).toContain('source=pwa');
    expect(page.url()).toContain('q=' + encodeURIComponent('세제'));
  });
});

test.describe('설치 안내 (브라우저로 볼 때)', () => {
  test('안드로이드 크롬: 설치 가능 신호가 오면 "앱으로 설치" 버튼을 보이고, 누르면 설치 창을 띄운다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__ready === true);
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__prompted = true; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await expect(page.locator('#install-bar')).toBeVisible();
    await page.click('#install-btn');
    expect(await page.evaluate(() => window.__prompted)).toBe(true);
    await expect(page.locator('#install-bar')).toBeHidden();
  });

  test('닫기를 누르면 다음에 다시 열어도 안내하지 않는다', async ({ page }) => {
    const fire = () => page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => {}; e.userChoice = Promise.resolve({});
      window.dispatchEvent(e);
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__ready === true);
    await fire();
    await page.click('#install-close');
    await page.reload();
    await page.waitForFunction(() => window.__ready === true);
    await fire();
    await expect(page.locator('#install-bar')).toBeHidden();
  });
});
