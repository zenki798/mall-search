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
