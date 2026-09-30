/* 쇼핑몰 검색 주소가 실제로 열리는지 확인한다 (네트워크 필요, `npm run check:links`).
   외부 사이트 상태에 따라 결과가 바뀌므로 `npx playwright test` 에는 넣지 않았다.

   판정
   - OK   : 200 대 응답이고 검색 결과 화면(제목·본문)에 검색어가 나온다
   - 차단 : 403·429 — 자동 접속 차단. 주소 문제가 아닐 수 있다. 짧은 시간에 여러 번 돌리면
            정상이던 곳도 차단으로 바뀐다(2026-09-30 옥션·올리브영에서 겪음). 직접 눌러 확인한다.
   - 실패 : 404·접속 불가·검색어 없음 — 주소가 바뀌었을 가능성이 높다. 고쳐야 한다. */
const { chromium } = require('playwright');
global.window = {};
require('../data/malls.js');
const { malls, searchUrl } = window.Malls;

const QUERY = process.argv[2] || '빼빼로';

(async () => {
  const browser = await chromium.launch();
  // 기본 User-Agent 에는 "HeadlessChrome" 이 들어 있어 더 많은 곳이 차단한다. 일반 크롬처럼 보낸다.
  const ctx = await browser.newContext({
    locale: 'ko-KR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  const rows = await Promise.all(malls.map(async m => {
    const page = await ctx.newPage();
    try {
      const res = await page.goto(searchUrl(m, QUERY), { timeout: 25000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      const text = await page.evaluate(() => document.title + '\n' + (document.body ? document.body.innerText : ''));
      const hits = text.split(QUERY).length - 1;
      const status = res ? res.status() : 0;
      const verdict = status === 403 || status === 429 ? '차단' : status < 400 && hits > 0 ? 'OK' : '실패';
      return { m, verdict, note: `HTTP ${status}, 검색어 ${hits}회` };
    } catch (e) {
      return { m, verdict: '실패', note: e.message.split('\n')[0] };
    } finally {
      await page.close();
    }
  }));
  await browser.close();

  for (const { m, verdict, note } of rows) {
    const known = verdict === '차단' && m.blocked ? ' (평소에도 차단)' : '';
    console.log(`${verdict.padEnd(4)}  ${m.name.padEnd(8)}  ${note}${known}`);
  }
  const failed = rows.filter(r => r.verdict === '실패').length;
  const blocked = rows.filter(r => r.verdict === '차단').length;
  console.log(`\nOK ${rows.length - failed - blocked} · 차단 ${blocked}(직접 확인) · 실패 ${failed}(주소 수정 필요)`);
  process.exit(failed ? 1 : 0);
})();
