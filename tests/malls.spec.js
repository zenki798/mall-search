// 쇼핑몰 목록 정합성과 검색 주소 만들기
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('쇼핑몰 목록: id 중복 없음, https 주소, {q} 자리 1개, 그룹·카테고리 존재', async ({ page }) => {
  const problems = await page.evaluate(() => {
    const { malls, groups, categories } = window.Malls;
    const out = [];
    const ids = malls.map(m => m.id);
    ids.filter((x, i) => ids.indexOf(x) !== i).forEach(x => out.push(`중복 id ${x}`));
    const names = malls.map(m => m.name);
    names.filter((x, i) => names.indexOf(x) !== i).forEach(x => out.push(`중복 이름 ${x}`));
    const g = new Set(groups.map(x => x.key));
    const c = new Set(categories.map(x => x.key));
    malls.forEach(m => {
      if (!m.url.startsWith('https://')) out.push(`${m.id}: https 아님`);
      if (m.url.split('{q}').length !== 2) out.push(`${m.id}: {q} 자리가 1개가 아님`);
      if (!g.has(m.group)) out.push(`${m.id}: 없는 그룹 ${m.group}`);
      if (!m.cats.length) out.push(`${m.id}: 카테고리 없음`);
      if (!(m.frame === true || m.frame === false || m.frame === undefined)) out.push(`${m.id}: frame 은 true/false/없음 중 하나`);
      m.cats.forEach(k => { if (!c.has(k)) out.push(`${m.id}: 없는 카테고리 ${k}`); });
    });
    categories.forEach(k => { if (!malls.some(m => m.cats.includes(k.key))) out.push(`카테고리 ${k.key} 에 쇼핑몰 없음`); });
    return out;
  });
  expect(problems).toEqual([]);
});

test('사용자가 말한 주요 쇼핑몰이 들어 있다', async ({ page }) => {
  const names = await page.evaluate(() => window.Malls.malls.map(m => m.name));
  for (const n of ['네이버쇼핑', '쿠팡', 'G마켓', '옥션', '11번가', '올리브영']) expect(names).toContain(n);
});

test('검색어는 인코딩되고 앞뒤 공백은 잘린다 (한글·공백·& # + %)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const m = { url: 'https://example.com/s?x=1&q={q}' };
    return [
      window.Malls.searchUrl(m, '  빼빼로  '),
      window.Malls.searchUrl(m, 'a&b #1 + 100%'),
    ];
  });
  expect(r[0]).toBe('https://example.com/s?x=1&q=%EB%B9%BC%EB%B9%BC%EB%A1%9C');
  expect(r[1]).toBe('https://example.com/s?x=1&q=a%26b%20%231%20%2B%20100%25');
});

test('페이지 안 표시 여부(frame): 확인된 곳이 넘겨보기의 대부분을 차지하고, 거부하는 곳은 새 창으로 분류돼 있다', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ms = window.Malls.malls;
    return {
      inPage: ms.filter(m => m.frame === true).length,
      external: ms.filter(m => m.frame === false).map(m => m.id),
    };
  });
  expect(r.inPage).toBeGreaterThanOrEqual(10);
  // 2026-09-30 실측: X-Frame-Options / frame-ancestors 로 거부 (AGENTS.md 3항). 2026-10-05: 11번가·올리브영 추가
  expect(r.external).toEqual(expect.arrayContaining(['naver', 'enuri', 'coupang', 'gmarket', 'auction', '11st', 'oliveyoung', 'ohou', 'ikea']));
});

test.describe('기기별 주소 (휴대폰 전용 주소가 있는 쇼핑몰)', () => {
  // 2026-09-30 실측: 쇼핑몰이 PC 주소를 받았을 때 휴대폰 주소로 넘기는 조건 (AGENTS.md 3항 "기기별 주소")
  const UA = {
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    ipadDefault: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    ipadMobileSite: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    galaxyPhone: 'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    galaxyTab: 'Mozilla/5.0 (Linux; Android 14; SM-X910N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  };
  const expected = {        // [롯데ON, 다이소몰]  PC=PC 주소, M=휴대폰 주소
    windows: ['PC', 'PC'],
    ipadDefault: ['PC', 'PC'],
    ipadMobileSite: ['M', 'M'],
    iphone: ['M', 'M'],
    galaxyPhone: ['M', 'M'],
    galaxyTab: ['M', 'PC'],   // 롯데ON 은 안드로이드면 태블릿도 휴대폰으로 본다. 다이소몰은 Mobile 표시가 있어야 휴대폰
  };

  for (const [name, ua] of Object.entries(UA)) {
    test(`${name}: 롯데ON ${expected[name][0]}, 다이소몰 ${expected[name][1]} 주소`, async ({ page }) => {
      const got = await page.evaluate(u => ['lotteon', 'daiso'].map(id => {
        const m = window.Malls.malls.find(x => x.id === id);
        return window.Malls.urlFor(m, u) === m.mobileUrl ? 'M' : 'PC';
      }), ua);
      expect(got).toEqual(expected[name]);
    });
  }

  test('휴대폰 주소도 https 이고 {q} 자리가 1개다. 다른 쇼핑몰은 기기와 상관없이 같은 주소다', async ({ page }) => {
    const r = await page.evaluate(ua => {
      const out = [];
      window.Malls.malls.forEach(m => {
        if (m.mobileUrl) {
          if (!m.mobileUrl.startsWith('https://')) out.push(`${m.id}: 휴대폰 주소 https 아님`);
          if (m.mobileUrl.split('{q}').length !== 2) out.push(`${m.id}: 휴대폰 주소 {q} 자리`);
          if (!m.mobileWhen) out.push(`${m.id}: mobileWhen 없음`);
        } else if (window.Malls.urlFor(m, ua) !== m.url) out.push(`${m.id}: 휴대폰 주소가 없는데 주소가 바뀜`);
      });
      return out;
    }, UA.iphone);
    expect(r).toEqual([]);
  });

  test('다이소몰 주소는 예전의 데이터(JSON) 주소가 아니다', async ({ page }) => {
    const urls = await page.evaluate(() => { const m = window.Malls.malls.find(x => x.id === 'daiso'); return [m.url, m.mobileUrl]; });
    for (const u of urls) expect(u).not.toContain('/ssn/search/Search');
  });
});
