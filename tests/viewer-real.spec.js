// 가짜 창 없이 실제 브라우저 창으로 넘겨보기를 확인한다.
// 결과 창은 쇼핑몰(다른 출처)로 넘어간 뒤에도 계속 이동시킬 수 있어야 한다.
// opener 를 끊으면 크롬이 이 이동을 막는다 — 그 회귀를 잡는 테스트다 (AGENTS.md 3항 "결과 창과 opener").
// 외부 쇼핑몰에 접속하지 않도록 주소를 127.0.0.1(페이지의 localhost 와 다른 출처)로 바꿔 쓴다.
const { test, expect } = require('@playwright/test');

test('실제 창: 결과 창은 하나만 뜨고, 다른 출처로 넘어간 뒤에도 다음·이전으로 이동한다', async ({ page, context }) => {
  await page.goto('/?q=' + encodeURIComponent('빼빼로'));
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => {
    const base = 'http://127.0.0.1:' + location.port + '/data/malls.js?m=';
    window.Malls.malls.forEach((m, i) => { m.url = base + i + '&q={q}'; });
  });

  const popupPromise = context.waitForEvent('page');
  await page.click('#view-start');
  const popup = await popupPromise;
  await popup.waitForURL(/m=0&q=/);

  let extra = 0;
  context.on('page', () => extra++);

  await page.click('#next');
  await popup.waitForURL(/m=1&q=/);
  await page.click('#next');
  await popup.waitForURL(/m=2&q=/);
  await page.click('#prev');
  await popup.waitForURL(/m=1&q=/);
  await page.click('.mall-link[data-link="oliveyoung"]');
  const oy = await page.evaluate(() => window.Malls.malls.findIndex(m => m.id === 'oliveyoung'));
  await popup.waitForURL(new RegExp(`m=${oy}&q=`));

  expect(extra).toBe(0);                     // 새 창·새 탭이 더 뜨지 않았다
  expect(popup.url()).toContain('q=' + encodeURIComponent('빼빼로'));

  await page.click('#viewer-close');
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.locator('#viewer')).toBeHidden();
});
