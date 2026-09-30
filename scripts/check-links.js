/* 쇼핑몰 검색 주소가 실제로 열리는지, 페이지 안(iframe)에 표시되는지 확인한다
   (네트워크 필요, `npm run check:links`). 외부 사이트 상태에 따라 결과가 바뀌므로
   `npx playwright test` 에는 넣지 않았다.

   주소 판정
   - OK   : 200 대 응답이고 검색 결과 화면(제목·본문)에 검색어가 나온다
   - 차단 : 403·429 — 자동 접속 차단. 주소 문제가 아닐 수 있다. 짧은 시간에 여러 번 돌리면
            정상이던 곳도 차단으로 바뀐다(2026-09-30 옥션·올리브영에서 겪음). 직접 눌러 확인한다.
   - 주의 : 열렸고 주소에 검색어도 남아 있지만 화면에서 검색어를 못 찾았다. 화면을 늦게 그리는 사이트이거나
            검색 결과가 없는 경우다(2026-09-30 29CM·이케아). 직접 눌러 확인한다. 실패로 세지 않는다.
   - 실패 : 404·접속 불가·주소에서 검색어가 사라짐 — 주소가 바뀌었을 가능성이 높다. 고쳐야 한다.

   페이지 안 표시(frame) 판정 — 응답 헤더로 브라우저가 실제로 적용하는 규칙을 읽는다
   - 허용 : X-Frame-Options·frame-ancestors 가 없다 → malls.js 에 frame: true
   - 거부 : X-Frame-Options DENY/SAMEORIGIN, 또는 frame-ancestors 가 우리 주소를 허락하지 않는다 → frame: false
   - ?    : 차단(403) 응답이라 판별 불가 → frame 을 적지 않는다
   malls.js 의 frame 값과 다르면 "frame 수정" 으로 알린다. */
const { chromium } = require('playwright');
global.window = {};
require('../data/malls.js');
const { malls, searchUrl } = window.Malls;

const QUERY = process.argv[2] || '빼빼로';

function frameVerdict(status, headers) {
  if (status === 403 || status === 429) return '?';
  const xfo = (headers['x-frame-options'] || '').toUpperCase();
  const fa = ((headers['content-security-policy'] || '').match(/frame-ancestors([^;]*)/i) || [])[1];
  if (/DENY|SAMEORIGIN/.test(xfo)) return '거부';
  if (fa != null && !/(^|\s)(\*|https:)(\s|$)/.test(fa.trim())) return '거부';
  return '허용';
}

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
      let urlHas = false;
      try { urlHas = decodeURIComponent(page.url()).includes(QUERY); } catch (e) { /* 무시 */ }
      const verdict = status === 403 || status === 429 ? '차단'
        : status < 400 && hits > 0 ? 'OK'
        : status < 400 && urlHas ? '주의'
        : '실패';
      const frame = res ? frameVerdict(status, res.headers()) : '?';
      return { m, verdict, frame, note: `HTTP ${status}, 검색어 ${hits}회` };
    } catch (e) {
      return { m, verdict: '실패', frame: '?', note: e.message.split('\n')[0] };
    } finally {
      await page.close();
    }
  }));
  await browser.close();

  const declared = m => (m.frame === true ? '허용' : m.frame === false ? '거부' : '?');
  let frameFix = 0;
  for (const { m, verdict, frame, note } of rows) {
    const known = verdict === '차단' && m.blocked ? ' (평소에도 차단)' : '';
    const mismatch = frame !== '?' && frame !== declared(m);
    if (mismatch) frameFix++;
    const f = `페이지 안 ${frame}${mismatch ? ` ← frame 수정 필요 (지금: ${declared(m)})` : ''}`;
    console.log(`${verdict.padEnd(4)}  ${m.name.padEnd(8)}  ${note}${known} | ${f}`);
  }
  const failed = rows.filter(r => r.verdict === '실패').length;
  const blocked = rows.filter(r => r.verdict === '차단').length;
  const warn = rows.filter(r => r.verdict === '주의').length;
  console.log(`\nOK ${rows.length - failed - blocked - warn} · 주의 ${warn}(직접 확인) · 차단 ${blocked}(직접 확인) · 실패 ${failed}(주소 수정 필요) · frame 수정 ${frameFix}`);
  process.exit(failed || frameFix ? 1 : 0);
})();
