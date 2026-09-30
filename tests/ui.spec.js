// 화면 동작 — 검색 링크, 페이지 안에서 넘겨보기, 새 창, 모두 새 탭으로, 체크 유지, 카테고리, 최근 검색
const { test, expect } = require('@playwright/test');
const { trackErrors, stubOpen, stubMalls, openApp, opened, nav, malls, urlOf, frameSrc, inPage, split, touch, windowed } = require('./helpers');

test('처음 열면 에러 없이 모든 쇼핑몰이 보이고, 검색어 전에는 링크·버튼이 비활성이다', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  const all = await malls(page);
  await expect(page.locator('.mall')).toHaveCount(all.length);
  await expect(page.locator('.mall-link[href]')).toHaveCount(0);
  await expect(page.locator('#view-start')).toBeDisabled();
  await expect(page.locator('#open-tabs')).toBeDisabled();
  await expect(page.locator('#panel')).toBeHidden();
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
  await expect(page.locator('#view-start')).toHaveText(`${inPage(all).length}곳 넘겨보기`);
  expect(page.url()).toContain('q=' + encodeURIComponent('빼빼로'));
});

test('페이지 안 표시를 거부하는 쇼핑몰에는 "새 창" 표시가 붙는다', async ({ page }) => {
  await openApp(page, '빼빼로');
  for (const m of await malls(page)) {
    await expect(page.locator(`.mall-link[data-link="${m.id}"] .ext`), m.name).toHaveCount(m.frame === false ? 1 : 0);
  }
});

test.describe('페이지 안에서 넘겨보기', () => {
  test.beforeEach(async ({ page }) => {
    await stubMalls(page);
    await stubOpen(page);
  });

  test('Enter → 창을 열지 않고 이 페이지 안 패널에 첫 쇼핑몰(새 창 전용 제외)을 띄운다', async ({ page }) => {
    await openApp(page);
    await page.fill('#q', '빼빼로');
    await page.press('#q', 'Enter');
    const list = inPage(await malls(page));
    await expect(page.locator('#panel')).toBeVisible();
    await expect(page.locator('#frame')).toBeVisible();
    await expect(page.locator('#frame')).toHaveAttribute('src', urlOf(list[0], '빼빼로'));
    await expect(page.locator('#viewer-name')).toHaveText(list[0].name);
    await expect(page.locator('#viewer-pos')).toHaveText(`1 / ${list.length}`);
    await expect(page.locator(`.mall[data-mall="${list[0].id}"]`)).toHaveClass(/current/);
    await expect(page.locator('#q')).not.toBeFocused();   // 바로 ← → 로 넘길 수 있게
    expect(await opened(page)).toEqual([]);
  });

  test('다음·이전은 패널 안의 쇼핑몰만 바꾸고, 처음·끝에서는 버튼이 꺼진다', async ({ page }) => {
    await openApp(page, '맨투맨');
    await page.click('#categories [data-category="fashion"]');   // 쇼핑몰 수를 줄여 끝까지 가 본다
    const list = inPage((await malls(page)).filter(m => m.cats.includes('fashion')));
    await page.click('#view-start');
    await expect(page.locator('#prev')).toBeDisabled();
    const seen = [await frameSrc(page)];
    for (let i = 1; i < list.length; i++) {
      await page.click('#next');
      seen.push(await frameSrc(page));
    }
    await expect(page.locator('#next')).toBeDisabled();
    await expect(page.locator('#viewer-pos')).toHaveText(`${list.length} / ${list.length}`);
    expect(seen).toEqual(list.map(m => urlOf(m, '맨투맨')));
    await page.click('#prev');
    await expect(page.locator('#frame')).toHaveAttribute('src', urlOf(list[list.length - 2], '맨투맨'));
    expect(await opened(page)).toEqual([]);
  });

  test('쇼핑몰을 바꿔도 방문 기록이 쌓이지 않고, 뒤로 가기는 사이트를 떠나지 않고 패널만 닫는다', async ({ page }) => {
    await openApp(page, '생수');
    const before = await page.evaluate(() => history.length);
    await page.click('#view-start');
    const withPanel = await page.evaluate(() => history.length);
    expect(withPanel).toBe(before + 1);
    await page.click('#next');
    await page.click('#next');
    await expect(page.locator('#viewer-pos')).toHaveText(/^3 \//);
    expect(await page.evaluate(() => history.length)).toBe(withPanel);
    await page.goBack();
    await expect(page.locator('#panel')).toBeHidden();
    expect(page.url()).toContain('q=' + encodeURIComponent('생수'));
    await expect(page.locator('#q')).toHaveValue('생수');
  });

  test('✕ 를 누르면 패널이 닫히고, 열 때 쌓았던 기록도 되돌린다', async ({ page }) => {
    await openApp(page, '생수');
    await page.click('#view-start');
    expect(await page.evaluate(() => history.state && history.state.mallViewer)).toBe(true);
    await page.click('#viewer-close');
    await expect(page.locator('#panel')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/viewing/);
    await expect.poll(() => page.evaluate(() => !!(history.state && history.state.mallViewer))).toBe(false);
    await page.click('#view-start');                         // 다시 열 수 있다
    await expect(page.locator('#panel')).toBeVisible();
  });

  test('← → 키로 넘기고 Esc 로 닫는다. 검색창에 입력 중일 때는 방해하지 않는다', async ({ page }) => {
    await openApp(page, '생수');
    await page.press('#q', 'Enter');
    const list = inPage(await malls(page));
    await page.evaluate(() => document.getElementById('q').focus());
    await page.keyboard.press('ArrowRight');                  // 검색창 포커스 → 넘기지 않음
    await expect(page.locator('#frame')).toHaveAttribute('src', urlOf(list[0], '생수'));
    await page.evaluate(() => document.getElementById('q').blur());
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#frame')).toHaveAttribute('src', urlOf(list[1], '생수'));
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeHidden();
  });

  test('체크를 푼 쇼핑몰은 건너뛴다', async ({ page }) => {
    await openApp(page, '의자');
    const list = inPage(await malls(page));
    await page.uncheck(`[data-pick="${list[1].id}"]`);
    await page.click('#view-start');
    await page.click('#next');
    await expect(page.locator('#frame')).toHaveAttribute('src', urlOf(list[2], '의자'));
  });

  test('쇼핑몰 이름을 누르면 그곳을 패널에서 보여 주고(창을 열지 않음), 다음은 그 다음부터 이어진다', async ({ page }) => {
    await openApp(page, '틴트');
    const list = inPage(await malls(page));
    const i = list.findIndex(m => m.id === 'musinsa');
    await page.click('.mall-link[data-link="musinsa"]');
    await expect(page.locator('#panel')).toBeVisible();
    await expect(page.locator('#frame')).toHaveAttribute('src', urlOf(list[i], '틴트'));
    await page.click('#next');
    await expect(page.locator('#frame')).toHaveAttribute('src', urlOf(list[i + 1], '틴트'));
    expect(await opened(page)).toEqual([]);
  });

  test('새 창 전용 쇼핑몰을 누르면 새 창으로 연다 — PC 는 창 하나를 재사용하고 앞으로 가져오며, 휴대폰·태블릿은 매번 탭으로 연다', async ({ page }) => {
    await openApp(page, '빼빼로');
    const all = await malls(page);
    const naver = all.find(m => m.id === 'naver');
    const enuri = all.find(m => m.id === 'enuri');
    await page.click('.mall-link[data-link="naver"]');
    await page.click('.mall-link[data-link="enuri"]');
    await expect(page.locator('#panel')).toBeHidden();
    const calls = await opened(page);
    if (await windowed(page)) {
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('mallsearch-viewer');
      expect(calls[0].features).toContain('popup');
      expect(await nav(page)).toEqual([urlOf(naver, '빼빼로'), urlOf(enuri, '빼빼로')]);
      expect(await page.evaluate(() => window.__focused)).toBe(2);
    } else {
      // 휴대폰·태블릿: 누를 때마다 새로 연다. 탭만 있는 기기에서 창을 재사용하면 두 번째부터 뒤쪽 탭만 바뀐다
      expect(calls.map(c => [c.url, c.name])).toEqual([[urlOf(naver, '빼빼로'), '_blank'], [urlOf(enuri, '빼빼로'), '_blank']]);
    }
  });

  test('↗ 새 창 버튼은 지금 보는 쇼핑몰을 새 창으로 연다', async ({ page }) => {
    await openApp(page, '빼빼로');
    await page.click('#view-start');
    const first = inPage(await malls(page))[0];
    await page.click('#open-external');
    const calls = await opened(page);
    expect(calls).toHaveLength(1);
    expect((await windowed(page)) ? (await nav(page))[0] : calls[0].url).toBe(urlOf(first, '빼빼로'));
    await expect(page.locator('#panel')).toBeVisible();      // 패널은 그대로
  });

  test('"새 창 전용도 포함"을 켜면 순서에 들어가고, 그 차례에는 저절로 창을 띄우지 않고 버튼을 보여 준다 (설정 유지)', async ({ page }) => {
    await openApp(page, '빼빼로');
    await page.click('#view-start');
    const all = await malls(page);
    const extCount = all.filter(m => m.frame === false).length;
    await expect(page.locator('#include-external-label')).toContainText(`새 창 전용 ${extCount}곳`);
    await page.check('#include-external');
    await expect(page.locator('#viewer-pos')).toHaveText(`2 / ${all.length}`);   // 다나와는 전체에서 2번째
    await page.click('#prev');                                                  // → 네이버쇼핑 (새 창 전용)
    await expect(page.locator('#viewer-name')).toHaveText('네이버쇼핑');
    await expect(page.locator('#frame-blocked')).toBeVisible();
    await expect(page.locator('#frame')).toBeHidden();
    expect(await opened(page)).toEqual([]);
    await page.click('#blocked-open');
    expect(await opened(page)).toHaveLength(1);

    await page.reload();
    await page.waitForFunction(() => window.__ready === true);
    await expect(page.locator('#view-start')).toHaveText(`${all.length}곳 넘겨보기`);
  });

  test('"불러오는 중" 안내는 쇼핑몰이 뜨면 사라진다', async ({ page }) => {
    await openApp(page, '빼빼로');
    await page.click('#view-start');
    await expect(page.locator('#frame-loading')).toBeHidden({ timeout: 4000 });
  });

  test('판별하지 못한 쇼핑몰(SSG닷컴)은 패널에 띄우되 "오류 화면이 보이면 새 창" 안내를 붙인다', async ({ page }) => {
    await openApp(page, '빼빼로');
    await page.click('.mall-link[data-link="ssg"]');
    await expect(page.locator('#viewer-name')).toHaveText('SSG닷컴');
    await expect(page.locator('#frame')).toBeVisible();
    await expect(page.locator('#frame-unverified')).toBeVisible();
    await expect(page.locator('#frame-unverified')).toContainText('사용 권한이 없습니다');
    await expect(page.locator('#frame-unverified')).toContainText('↗ 새 창');
    await page.click('#next');                                   // 롯데ON (확인된 곳) → 안내 없음
    await expect(page.locator('#viewer-name')).toHaveText('롯데ON');
    await expect(page.locator('#frame-unverified')).toBeHidden();
  });

  test('쿠팡은 사용자 확인으로 새 창 전용이다 — 누르면 패널이 아니라 새 창으로 연다', async ({ page }) => {
    await openApp(page, '빼빼로');
    await expect(page.locator('.mall-link[data-link="coupang"] .ext')).toHaveCount(1);
    await page.click('.mall-link[data-link="coupang"]');
    await expect(page.locator('#panel')).toBeHidden();
    expect(await opened(page)).toHaveLength(1);
  });

  test('패널의 iframe 은 쇼핑몰이 이 페이지를 다른 곳으로 이동시키지 못하게 제한(sandbox)된다', async ({ page }) => {
    await openApp(page, '빼빼로');
    await page.click('#view-start');
    const flags = (await page.locator('#frame').getAttribute('sandbox')).split(/\s+/);
    expect(flags).not.toContain('allow-top-navigation');
    expect(flags).not.toContain('allow-top-navigation-by-user-activation');
    expect(flags).toEqual(expect.arrayContaining(['allow-scripts', 'allow-same-origin', 'allow-popups', 'allow-popups-to-escape-sandbox']));
  });

  test('넓은 화면(PC·태블릿 가로)은 목록 옆에 패널이 붙고, 좁은 화면(휴대폰)은 패널이 화면 전체를 덮는다', async ({ page }) => {
    await openApp(page, '빼빼로');
    await page.click('#view-start');
    const vp = page.viewportSize();
    const box = await page.locator('#panel').boundingBox();
    if (await split(page)) {
      expect(box.x).toBeGreaterThanOrEqual(320);                 // 왼쪽에 목록 기둥
      expect(Math.round(box.x + box.width)).toBe(vp.width);
      expect(Math.round(box.height)).toBe(vp.height);
      await expect(page.locator('#q')).toBeInViewport();         // 목록 쪽 검색창이 가려지지 않는다
    } else {
      expect(Math.round(box.x)).toBe(0);
      expect(Math.round(box.y)).toBe(0);
      expect(Math.round(box.width)).toBe(vp.width);
      expect(Math.round(box.height)).toBe(vp.height);
    }
  });
});

test.describe('화면 크기·입력 방식에 맞춘 표시', () => {
  test.beforeEach(async ({ page }) => {
    await stubMalls(page);
    await stubOpen(page);
  });

  test('큰 휴대폰을 가로로 돌리면(폭 932 × 높이 430) 폭이 넓어도 비좁게 나누지 않고 전체 화면으로 덮는다', async ({ page }) => {
    await page.setViewportSize({ width: 932, height: 430 });
    await openApp(page, '빼빼로');
    await page.click('#view-start');
    const box = await page.locator('#panel').boundingBox();
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.width)).toBe(932);
  });

  test('"← → 키로 넘기고 Esc 로 닫습니다" 안내는 분할 화면이면서 마우스가 있는 기기(PC)에만 보인다', async ({ page }) => {
    await openApp(page, '빼빼로');
    await page.click('#view-start');
    const showTip = (await split(page)) && !(await touch(page));
    if (showTip) await expect(page.locator('#viewer-tip')).toBeVisible();
    else await expect(page.locator('#viewer-tip')).toBeHidden();
  });

  test('터치 기기에서는 결과 화면 위쪽 버튼이 손가락으로 누르기 쉬운 크기(44px 이상)다', async ({ page }) => {
    await openApp(page, '빼빼로');
    await page.click('#view-start');
    const isTouch = await touch(page);
    for (const id of ['#prev', '#next', '#open-external', '#viewer-close']) {
      const box = await page.locator(id).boundingBox();
      if (isTouch) {
        expect(box.height, id).toBeGreaterThanOrEqual(44);
        expect(box.width, id).toBeGreaterThanOrEqual(44);
      } else {
        expect(box.height, id).toBeGreaterThan(20);           // PC 는 원래 크기
      }
    }
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
  const all = await malls(page);
  await page.uncheck('[data-pick="lotteon"]');   // 넘겨보기 대상
  await page.uncheck('[data-pick="ikea"]');      // 새 창 전용 (넘겨보기 대상 아님)
  await expect(page.locator('.mall[data-mall="lotteon"]')).toHaveClass(/off/);
  await expect(page.locator('#view-start')).toHaveText(`${inPage(all).length - 1}곳 넘겨보기`);

  await page.reload();
  await page.waitForFunction(() => window.__ready === true);
  await expect(page.locator('[data-pick="lotteon"]')).not.toBeChecked();
  await expect(page.locator('[data-pick="ikea"]')).not.toBeChecked();
  await page.click('#open-tabs');
  const urls = (await opened(page)).map(c => c.url);
  expect(urls).toHaveLength(all.length - 2);
  expect(urls.some(u => u.includes('lotteon.com') || u.includes('ikea.com'))).toBe(false);
});

test('카테고리를 고르면 그 카테고리를 다루는 쇼핑몰만 보이고, 그곳만 대상이 된다', async ({ page }) => {
  await stubOpen(page);
  await openApp(page, '틴트');
  await page.click('#categories [data-category="beauty"]');
  const beauty = (await malls(page)).filter(m => m.cats.includes('beauty'));
  await expect(page.locator('.mall')).toHaveCount(beauty.length);
  await expect(page.locator('.mall[data-mall="oliveyoung"]')).toBeVisible();
  await expect(page.locator('.mall[data-mall="ikea"]')).toHaveCount(0);
  await expect(page.locator('#view-start')).toHaveText(`${inPage(beauty).length}곳 넘겨보기`);
  await page.click('#open-tabs');
  expect(await opened(page)).toHaveLength(beauty.length);
});

test('모두 해제하면 버튼이 꺼지고, 모두 선택하면 다시 켜진다', async ({ page }) => {
  await openApp(page, '운동화');
  await page.click('#select-none');
  await expect(page.locator('#view-start')).toBeDisabled();
  await expect(page.locator('#open-tabs')).toBeDisabled();
  await expect(page.locator('#view-start')).toHaveText('0곳 넘겨보기');
  await page.click('#select-all');
  await expect(page.locator('#view-start')).toBeEnabled();
});

test('본 검색어는 최근 검색에 남고, 누르면 다시 검색되며, 지울 수 있다', async ({ page }) => {
  await stubMalls(page);
  await openApp(page);
  for (const q of ['빼빼로', '선크림', '빼빼로']) {
    await page.fill('#q', q);
    await page.press('#q', 'Enter');
    await page.keyboard.press('Escape');                     // 패널을 닫고 목록으로
    await expect(page.locator('#panel')).toBeHidden();
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

test('?q= 주소로 열면 그 검색어로 시작한다 (패널·창은 자동으로 열지 않는다)', async ({ page }) => {
  await stubOpen(page);
  await openApp(page, '세제');
  await expect(page.locator('#q')).toHaveValue('세제');
  await expect(page.locator('.mall-link[data-link="naver"]')).toHaveAttribute('href', /query=%EC%84%B8%EC%A0%9C/);
  await expect(page.locator('#panel')).toBeHidden();
  expect(await opened(page)).toEqual([]);
});
