// 가짜 창·가짜 응답 없이 실제 브라우저 동작을 확인한다.
// 외부 쇼핑몰에 접속하지 않도록 주소를 127.0.0.1(페이지의 localhost 와 다른 출처)의 테스트용 페이지로 바꿔 쓴다.
const { test, expect } = require('@playwright/test');
const { windowed } = require('./helpers');

async function pointMallsToFixture(page) {
  await page.goto('/?q=' + encodeURIComponent('빼빼로'));
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => {
    const base = 'http://127.0.0.1:' + location.port + '/tests/fixtures/mall.html?m=';
    window.Malls.malls.forEach((m, i) => { m.url = base + i + '&q={q}'; });
  });
}
const fixtureFrame = page => page.frames().find(f => f.url().includes('/tests/fixtures/mall.html'));

test('실제 iframe: 다른 출처 페이지가 패널 안에 뜨고, 다음을 누르면 바뀌며, 쇼핑몰이 이 페이지를 빼앗지 못한다', async ({ page }) => {
  await pointMallsToFixture(page);
  const start = page.url();
  const order = await page.evaluate(() => window.Malls.malls.map((m, i) => (m.frame === false ? -1 : i)).filter(i => i >= 0));

  await page.click('#view-start');
  await expect.poll(() => (fixtureFrame(page) || { url: () => '' }).url()).toContain(`m=${order[0]}&`);
  await page.click('#next');
  await expect.poll(() => (fixtureFrame(page) || { url: () => '' }).url()).toContain(`m=${order[1]}&`);
  expect(page.frames().filter(f => f.url().includes('/tests/fixtures/mall.html'))).toHaveLength(1);

  // 사용자가 iframe 안을 눌러(사용자 조작) 바깥 페이지를 옮기려 해도 sandbox 가 막는다.
  const frame = fixtureFrame(page);
  await frame.click('#escape');
  await expect.poll(() => frame.evaluate(() => document.body.dataset.tried)).toBe('1');
  await page.waitForTimeout(500);
  expect(page.url()).toBe(start);
  await expect(page.locator('#panel')).toBeVisible();
});

test('실제 창: 새 창 전용 쇼핑몰 — PC 는 창 하나를 재사용하고 다른 출처로 넘어간 뒤에도 계속 이동, 휴대폰·태블릿은 매번 새로 열고 연결을 끊는다', async ({ page, context }) => {
  await pointMallsToFixture(page);
  const reuse = await windowed(page);
  const ids = ['naver', 'enuri', 'ikea'];
  const index = await page.evaluate(list => list.map(id => window.Malls.malls.findIndex(m => m.id === id)), ids);
  const pages = [];
  context.on('page', p => pages.push(p));

  for (let k = 0; k < ids.length; k++) {
    const i = index[k];
    const before = pages.length;
    await page.click(`.mall-link[data-link="${ids[k]}"]`);
    if (reuse) {
      // PC: opener 를 끊으면 크롬이 두 번째 이동부터 막는다 — 그 회귀를 잡는다 (AGENTS.md 3항 "새 창과 opener")
      await expect.poll(() => pages.length).toBe(1);
      await pages[0].waitForURL(new RegExp(`m=${i}&`));
    } else {
      await expect.poll(() => pages.length).toBe(before + 1);
      const p = pages[pages.length - 1];
      await p.waitForURL(new RegExp(`m=${i}&`));
      expect(await p.evaluate(() => window.opener)).toBeNull();   // 열린 쇼핑몰이 이 페이지를 건드리지 못한다
    }
  }
  expect(pages).toHaveLength(reuse ? 1 : 3);
});
