// 사용자는 index.html 을 더블클릭해서 연다 (file://). 서버 없이도 전부 동작해야 한다.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');
const { trackErrors, stubOpen, opened, nav, urlOf } = require('./helpers');

const FILE_URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

test('file:// 로 열어도 링크 만들기·체크·넘겨보기·새 탭 열기가 동작한다', async ({ page }) => {
  const errors = trackErrors(page);
  await stubOpen(page);
  await page.goto(FILE_URL);
  await page.waitForFunction(() => window.__ready === true);
  const all = await page.evaluate(() => window.Malls.malls);

  await page.fill('#q', '빼빼로');
  await expect(page.locator('.mall-link[data-link="11st"]'))
    .toHaveAttribute('href', 'https://search.11st.co.kr/pc/total-search?kwd=' + encodeURIComponent('빼빼로'));
  await page.uncheck('[data-pick="naver"]');
  await page.press('#q', 'Enter');
  await page.click('#next');
  expect(await nav(page)).toEqual([urlOf(all[1], '빼빼로'), urlOf(all[2], '빼빼로')]);

  await page.click('#open-tabs');
  expect((await opened(page)).filter(c => c.name === '_blank')).toHaveLength(all.length - 1);
  expect(errors).toEqual([]);
});

test('file:// 에서 ?q= 주소로 열면 그 검색어로 시작한다', async ({ page }) => {
  await page.goto(FILE_URL + '?q=' + encodeURIComponent('생수'));
  await page.waitForFunction(() => window.__ready === true);
  await expect(page.locator('#q')).toHaveValue('생수');
  await expect(page.locator('.mall-link[href]')).toHaveCount(await page.evaluate(() => window.Malls.malls.length));
});
