// 앱(PWA) 설치 — 홈 화면에 추가하면 주소창·툴바 없이 뜨는지, 앱 모드 넘겨보기가 동작하는지
const { test, expect } = require('@playwright/test');
const { trackErrors, stubOpen, stubMalls, opened, malls, urlOf, inPage } = require('./helpers');

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

  test('앱에서도 넘겨보기는 앱 밖으로 나가지 않고 앱 안 패널에 띄운다', async ({ page }) => {
    await stubMalls(page);
    await stubOpen(page);
    await openAppMode(page, '빼빼로');
    const list = inPage(await malls(page));
    await page.click('#view-start');
    await expect(page.locator('#panel')).toBeVisible();
    await expect(page.locator('#frame')).toHaveAttribute('src', urlOf(list[0], '빼빼로'));
    await page.click('#next');
    await expect(page.locator('#frame')).toHaveAttribute('src', urlOf(list[1], '빼빼로'));
    await expect(page.locator('#viewer-pos')).toHaveText(`2 / ${list.length}`);
    expect(await opened(page)).toEqual([]);
  });

  test('앱에서 새 창 전용 쇼핑몰과 ↗ 새 창은 앱 위 브라우저(_blank)로 연다 — 옆 창(popup)을 쓰지 않는다', async ({ page }) => {
    await stubMalls(page);
    await stubOpen(page);
    await openAppMode(page, '빼빼로');
    const all = await malls(page);
    await page.click('.mall-link[data-link="naver"]');
    await page.click('#view-start');
    await page.click('#open-external');
    const calls = await opened(page);
    expect(calls.map(c => c.url)).toEqual([urlOf(all.find(m => m.id === 'naver'), '빼빼로'), urlOf(inPage(all)[0], '빼빼로')]);
    expect(calls.every(c => c.name === '_blank' && !c.features)).toBe(true);
  });

  test('앱에서 뒤로 가기(안드로이드 뒤로 제스처)는 앱을 나가지 않고 패널을 닫는다', async ({ page }) => {
    await stubMalls(page);
    await openAppMode(page, '생수');
    await page.click('#view-start');
    await page.goBack();
    await expect(page.locator('#panel')).toBeHidden();
    expect(page.url()).toContain('source=pwa');
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

test.describe('아이폰·아이패드 설치 안내 (사파리에는 설치 버튼이 없어 글로 안내한다)', () => {
  // 페이지 스크립트가 보는 기기 정보를 바꾼다. 아이패드 사파리는 기본으로 Mac 처럼 자신을 밝힌다.
  async function asDevice(page, { ua, platform, touchPoints }) {
    await page.addInitScript(([u, p, t]) => {
      Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => u });
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => p });
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => t });
    }, [ua, platform, touchPoints]);
    await page.goto('/');
    await page.waitForFunction(() => window.__ready === true);
  }
  const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

  test('아이폰: 아래쪽 공유 버튼으로 홈 화면에 추가하라고 안내한다', async ({ page }) => {
    await asDevice(page, { ua: IPHONE, platform: 'iPhone', touchPoints: 5 });
    await expect(page.locator('#install-bar')).toBeVisible();
    await expect(page.locator('#install-text')).toContainText('아래쪽 공유 버튼');
    await expect(page.locator('#install-btn')).toBeHidden();
  });

  test('아이패드(사파리가 Mac 처럼 밝혀도): 오른쪽 위 공유 버튼으로 안내한다', async ({ page }) => {
    await asDevice(page, { ua: MAC_SAFARI, platform: 'MacIntel', touchPoints: 5 });
    await expect(page.locator('#install-bar')).toBeVisible();
    await expect(page.locator('#install-text')).toContainText('오른쪽 위 공유 버튼');
  });

  test('진짜 Mac(터치 없음)에는 안내하지 않는다', async ({ page }) => {
    await asDevice(page, { ua: MAC_SAFARI, platform: 'MacIntel', touchPoints: 0 });
    await expect(page.locator('#install-bar')).toBeHidden();
  });
});
