/* 막힘 자동 점검 — 쇼핑몰마다 "다른 사이트 안 표시" 를 허락하는지 응답 헤더로 보고 data/frame-status.js 를 갱신한다.
   GitHub Actions(.github/workflows/frame-check.yml)가 매일 실행한다. 손으로도 돌릴 수 있다: `npm run check:frames`
   - 바뀐 것이 없으면 파일을 건드리지 않는다(매일 쓸데없는 커밋을 만들지 않으려고).
   - GitHub Actions 안에서는 결과를 GITHUB_OUTPUT(changed=true/false)과 실행 요약(GITHUB_STEP_SUMMARY)에 남긴다.
   판정 규칙은 scripts/frame-rules.js. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { frameVerdict, nextStatus, renderStatus, parseStatus } = require('./frame-rules');

global.window = {};
require('../data/malls.js');
const { malls, searchUrl } = window.Malls;

const FILE = path.join(__dirname, '..', 'data', 'frame-status.js');
const QUERY = '빼빼로';
const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// 한국 날짜 (GitHub Actions 는 UTC 로 돈다)
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

async function check(ctx, url) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    return res ? frameVerdict(res.status(), res.headers()) : { verdict: 'unknown', why: '응답 없음' };
  } catch (e) {
    return { verdict: 'unknown', why: e.message.split('\n')[0].slice(0, 60) };
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  const pc = await browser.newContext({ locale: 'ko-KR', userAgent: PC_UA });
  const phone = await browser.newContext({ locale: 'ko-KR', userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  // 한꺼번에 몰리지 않게 4곳씩 나눠 확인한다
  const results = {};
  const jobs = [];
  for (const m of malls) {
    jobs.push(async () => {
      const rs = [await check(pc, searchUrl(m, QUERY, PC_UA))];
      if (m.mobileUrl) rs.push(await check(phone, searchUrl(m, QUERY, IPHONE_UA)));
      results[m.id] = rs;
    });
  }
  const queue = jobs.slice();
  await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await queue.shift()(); }));
  await browser.close();

  const oldText = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';
  const prev = parseStatus(oldText);
  const status = nextStatus(prev, malls, results, today);
  const newText = renderStatus(status);
  const changed = newText !== oldText;
  if (changed) fs.writeFileSync(FILE, newText);

  const NAME = { allow: '허용', refuse: '거부', challenge: '차단 화면(판정 보류)', unknown: '판정 불가' };
  const lines = malls.map(m => {
    const rs = results[m.id].map(r => NAME[r.verdict] + (r.why ? ` (${r.why})` : '')).join(' / ');
    const state = m.frame === false ? '새 창(사람이 정함)' : status.blocked[m.id] ? `새 창(자동, ${status.blocked[m.id].since}부터)` : '페이지 안';
    return `| ${m.name} | ${rs} | ${state} |`;
  });
  const report = ['| 쇼핑몰 | 판정 (PC / 휴대폰) | 지금 열리는 방식 |', '|---|---|---|'].concat(lines).join('\n');
  console.log(report);
  console.log(`\n자동으로 새 창: ${Object.keys(status.blocked).join(', ') || '없음'} · 파일 ${changed ? '갱신함' : '그대로'}`);

  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## 쇼핑몰 페이지 안 표시 점검 (${today})\n\n${report}\n\n자동으로 새 창: ${Object.keys(status.blocked).join(', ') || '없음'} · 상태 파일 ${changed ? '**갱신**' : '그대로'}\n`);
  }
})();
