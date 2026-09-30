// 화면 동작 — 검색 링크, 한 창에서 넘겨보기, 모두 새 탭으로, 체크 유지, 카테고리, 최근 검색
const { test, expect } = require('@playwright/test');
const { trackErrors, stubOpen, openApp, opened, nav, malls, urlOf } = require('./helpers');

test('처음 열면 에러 없이 모든 쇼핑몰이 보이고, 검색어 전에는 링크·버튼이 비활성이다', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  const all = await malls(page);
  await expect(page.locator('.mall')).toHaveCount(all.length);
  await expect(page.locator('.mall-link[href]')).toHaveCount(0);
  await expect(page.locator('#view-start')).toBeDisabled();
  await expect(page.locator('#open-tabs')).toBeDisabled();
  await expect(page.locator('#viewer')).toBeHidden();
  await expect(page.locator('#recent')).toBeHidden();   // 기록이 없으면 "최근:" 줄도 없다
  await expect(page.locator('#notice')).toBeHidden();
  expect(errors).toEqual([]);
});

test('검색어를 입력하면 모든 쇼핑몰 링크가 그 검색어의 검색 결과 주소가 된다', async ({ page }) => {
  await openApp(page);
  await page.fill('#q', '빼빼로');
  const all = await malls(page);
  for (const m of all) {
    const a = page.locator(`.mall-link[data-link="${m.id}"]`);
    await expect(a).toHaveAttribute('href', urlOf(m, '빼빼로'));
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', /noopener/);
  }
  await expect(page.locator('#view-start')).toHaveText(`${all.length}곳 한 창에서 넘겨보기`);
  expect(page.url()).toContain('q=' + encodeURIComponent('빼빼로'));
});

test.describe('한 창에서 넘겨보기', () => {
  test('Enter 를 누르면 결과 창을 딱 하나 열고 첫 쇼핑몰을 보여 준다', async ({ page }) => {
    await stubOpen(page);
    await openApp(page);
    await page.fill('#q', '빼빼로');
    await page.press('#q', 'Enter');
    const all = await malls(page);

    const calls = await opened(page);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('mallsearch-viewer');
    expect(calls[0].features).toContain('popup');
    expect(await nav(page)).toEqual([urlOf(all[0], '빼빼로')]);

    await expect(page.locator('#viewer')).toBeVisible();
    await expect(page.locator('#viewer-pos')).toHaveText(`1 / ${all.length}`);
    await expect(page.locator('#viewer-name')).toHaveText(all[0].name);
    await expect(page.locator(`.mall[data-mall="${all[0].id}"]`)).toHaveClass(/current/);
    await expect(page.locator('body')).toHaveClass(/viewing/);
  });

  test('다음·이전은 같은 창의 주소만 바꾸고, 처음·끝에서는 버튼이 꺼진다', async ({ page }) => {
    await stubOpen(page);
    await openApp(page, '선크림');
    await page.click('#categories [data-category="fashion"]'); // 쇼핑몰 수를 줄여 끝까지 가 본다
    await page.click('#view-start');
    const list = (await malls(page)).filter(m => m.cats.includes('fashion'));

    await expect(page.locator('#prev')).toBeDisabled();
    for (let i = 1; i < list.length; i++) await page.click('#next');
    await expect(page.locator('#next')).toBeDisabled();
    await expect(page.locator('#viewer-pos')).toHaveText(`${list.length} / ${list.length}`);
    await page.click('#prev');

    expect(await opened(page)).toHaveLength(1);              // 창은 여전히 하나
    const expected = list.map(m => urlOf(m, '선크림'));
    expect(await nav(page)).toEqual(expected.concat(expected[list.length - 2]));
    await expect(page.locator(`.mall[data-mall="${list[list.length - 2].id}"]`)).toHaveClass(/current/);
  });

  test('← → 키로 넘기되, 검색창에 입력 중일 때는 커서 이동을 방해하지 않는다', async ({ page }) => {
    await stubOpen(page);
    await openApp(page, '생수');
    await page.press('#q', 'Enter');
    const all = await malls(page);

    await page.press('#q', 'ArrowRight');                     // 검색창 포커스 → 넘기지 않음
    expect(await nav(page)).toHaveLength(1);

    await page.locator('#q').blur();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    expect(await nav(page)).toEqual([0, 1, 2, 1].map(i => urlOf(all[i], '생수')));
  });

  test('체크를 푼 쇼핑몰은 건너뛴다', async ({ page }) => {
    await stubOpen(page);
    await openApp(page, '의자');
    const all = await malls(page);
    await page.uncheck(`[data-pick="${all[1].id}"]`);
    await page.click('#view-start');
    await page.click('#next');
    expect(await nav(page)).toEqual([urlOf(all[0], '의자'), urlOf(all[2], '의자')]);
  });

  test('결과 창이 열려 있으면 쇼핑몰 이름을 눌러도 새 탭 대신 그 창에서 보인다', async ({ page }) => {
    await stubOpen(page);
    await openApp(page, '틴트');
    await page.click('#view-start');
    const oy = (await malls(page)).find(m => m.id === 'oliveyoung');
    await page.click('.mall-link[data-link="oliveyoung"]');
    expect(await opened(page)).toHaveLength(1);
    expect((await nav(page)).at(-1)).toBe(urlOf(oy, '틴트'));
    await expect(page.locator('#viewer-name')).toHaveText('올리브영');
  });

  test('결과 창 닫기를 누르면 막대가 사라지고, 다시 Enter 하면 새 창을 연다', async ({ page }) => {
    await stubOpen(page);
    await openApp(page, '세제');
    await page.click('#view-start');
    await page.click('#viewer-close');
    expect(await page.evaluate(() => window.__windows[0].closed)).toBe(true);
    await expect(page.locator('#viewer')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/viewing/);
    await page.press('#q', 'Enter');
    expect(await opened(page)).toHaveLength(2);
  });

  test('사용자가 결과 창을 직접 닫으면 넘겨보기 막대도 곧 사라진다', async ({ page }) => {
    await stubOpen(page);
    await openApp(page, '세제');
    await page.click('#view-start');
    await page.evaluate(() => { window.__windows[0].closed = true; });
    await expect(page.locator('#viewer')).toBeHidden({ timeout: 3000 });
  });

  test('결과 창이 막히면 해결 방법을 안내한다', async ({ page }) => {
    await stubOpen(page, 0);
    await openApp(page, '세제');
    await page.click('#view-start');
    await expect(page.locator('#notice')).toHaveClass(/warn/);
    await expect(page.locator('#notice')).toContainText('결과 창을 막았습니다');
    await expect(page.locator('#viewer')).toBeHidden();
  });
});

test.describe('모두 새 탭으로 열기', () => {
  test('체크한 모든 쇼핑몰을 새 탭으로 연다', async ({ page }) => {
    await stubOpen(page);
    await openApp(page, '선크림');
    await page.click('#open-tabs');
    const all = await malls(page);
    const calls = await opened(page);
    expect(calls.map(c => c.url)).toEqual(all.map(m => urlOf(m, '선크림')));
    expect(calls.every(c => c.name === '_blank')).toBe(true);
    await expect(page.locator('#notice')).toHaveClass(/ok/);
    await expect(page.locator('#notice')).toContainText(`${all.length}곳`);
  });

  test('팝업이 막히면 막힌 개수를 알리고 해결 방법을 안내한다', async ({ page }) => {
    await stubOpen(page, 1); // 첫 창만 열리고 나머지는 차단
    await openApp(page, '생수');
    await page.click('#open-tabs');
    const n = (await malls(page)).length;
    await expect(page.locator('#notice')).toHaveClass(/warn/);
    await expect(page.locator('#notice')).toContainText(`팝업 ${n - 1}개를 막았습니다`);
    await expect(page.locator('#notice')).toContainText('항상 허용');
  });
});

test('체크를 풀면 대상에서 빠지고, 새로고침해도 유지된다', async ({ page }) => {
  await stubOpen(page);
  await openApp(page, '의자');
  const n = (await malls(page)).length;
  await page.uncheck('[data-pick="coupang"]');
  await page.uncheck('[data-pick="ikea"]');
  await expect(page.locator('.mall[data-mall="coupang"]')).toHaveClass(/off/);
  await expect(page.locator('#view-start')).toHaveText(`${n - 2}곳 한 창에서 넘겨보기`);

  await page.reload();
  await page.waitForFunction(() => window.__ready === true);
  await expect(page.locator('[data-pick="coupang"]')).not.toBeChecked();
  await expect(page.locator('[data-pick="ikea"]')).not.toBeChecked();
  await page.click('#open-tabs');
  const urls = (await opened(page)).map(c => c.url);
  expect(urls).toHaveLength(n - 2);
  expect(urls.some(u => u.includes('coupang.com') || u.includes('ikea.com'))).toBe(false);
});

test('카테고리를 고르면 그 카테고리를 다루는 쇼핑몰만 보이고, 그곳만 대상이 된다', async ({ page }) => {
  await stubOpen(page);
  await openApp(page, '틴트');
  await page.click('#categories [data-category="beauty"]');
  const beauty = (await malls(page)).filter(m => m.cats.includes('beauty'));
  await expect(page.locator('.mall')).toHaveCount(beauty.length);
  await expect(page.locator('.mall[data-mall="oliveyoung"]')).toBeVisible();
  await expect(page.locator('.mall[data-mall="ikea"]')).toHaveCount(0);
  await expect(page.locator('#view-start')).toHaveText(`${beauty.length}곳 한 창에서 넘겨보기`);
  await page.click('#open-tabs');
  expect(await opened(page)).toHaveLength(beauty.length);
});

test('모두 해제하면 버튼이 꺼지고, 모두 선택하면 다시 켜진다', async ({ page }) => {
  await openApp(page, '운동화');
  await page.click('#select-none');
  await expect(page.locator('#view-start')).toBeDisabled();
  await expect(page.locator('#open-tabs')).toBeDisabled();
  await expect(page.locator('#view-start')).toHaveText('0곳 한 창에서 넘겨보기');
  await page.click('#select-all');
  await expect(page.locator('#view-start')).toBeEnabled();
});

test('본 검색어는 최근 검색에 남고, 누르면 다시 검색되며, 지울 수 있다', async ({ page }) => {
  await stubOpen(page);
  await openApp(page);
  for (const q of ['빼빼로', '선크림', '빼빼로']) {
    await page.fill('#q', q);
    await page.press('#q', 'Enter');
  }
  await page.goto('/');
  await page.waitForFunction(() => window.__ready === true);
  await expect(page.locator('#recent [data-recent]')).toHaveText(['빼빼로', '선크림']); // 중복 없이 최근 순

  await page.click('#recent [data-recent="선크림"]');
  await expect(page.locator('#q')).toHaveValue('선크림');
  await expect(page.locator('.mall-link[data-link="oliveyoung"]')).toHaveAttribute('href', /query=%EC%84%A0%ED%81%AC%EB%A6%BC/);

  await page.click('#recent [data-clear-recent]');
  await expect(page.locator('#recent')).toBeHidden();
});

test('?q= 주소로 열면 그 검색어로 시작한다 (창은 자동으로 열지 않는다)', async ({ page }) => {
  await stubOpen(page);
  await openApp(page, '세제');
  await expect(page.locator('#q')).toHaveValue('세제');
  await expect(page.locator('.mall-link[data-link="naver"]')).toHaveAttribute('href', /query=%EC%84%B8%EC%A0%9C/);
  expect(await opened(page)).toEqual([]);
});
