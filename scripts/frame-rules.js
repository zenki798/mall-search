/* 쇼핑몰이 "다른 사이트 안(iframe) 표시" 를 허락하는지 응답 헤더로 판정하는 규칙과,
   자동 점검 결과(data/frame-status.js)를 만드는 규칙. check-links.js·frame-check.js 가 함께 쓴다.

   왜 헤더로 판정하나: 브라우저는 보안상 이 페이지가 다른 사이트 iframe 안을 들여다보지 못하게 한다.
   그래서 페이지가 "막혔는지" 직접 알 수 없다(2026-10-05 실측 — 작은 창 개수·로드 시간 모두 구별 못 함).
   대신 브라우저가 실제로 적용하는 규칙(X-Frame-Options, CSP frame-ancestors)을 응답에서 읽는다. */

function header(headers, name) {
  const key = Object.keys(headers || {}).find(k => k.toLowerCase() === name);
  return key ? String(headers[key]) : '';
}

// 표시를 거부하면 그 이유(헤더 내용), 아니면 ''
function refusal(headers) {
  const xfo = header(headers, 'x-frame-options').trim().toUpperCase();
  if (/DENY|SAMEORIGIN/.test(xfo)) return 'X-Frame-Options: ' + xfo;
  const m = header(headers, 'content-security-policy').match(/frame-ancestors([^;]*)/i);
  if (m && !/(^|\s)(\*|https:)(\s|$)/.test(m[1].trim())) return 'frame-ancestors' + m[1].replace(/\s+/g, ' ').replace(/\s+$/, '');
  return '';
}

// verdict
//   allow     : 정상 응답이고 거부 헤더가 없다
//   refuse    : 정상 응답인데 거부 헤더가 있다 → 페이지 안에 못 띄운다
//   challenge : 403·429(자동 접속 차단·사람 확인) 화면이고 거기에 거부 헤더가 붙어 있다.
//               점검하는 쪽만 차단당했을 수 있어서 자동 판정에는 쓰지 않는다
//               (2026-09-30 올리브영: 차단 화면에만 SAMEORIGIN 이 붙어 있어 잘못 분류했던 적이 있다)
//   unknown   : 그 밖(차단·오류·접속 실패) → 판정하지 않는다
function frameVerdict(status, headers) {
  const why = refusal(headers);
  if (status === 403 || status === 429) return why ? { verdict: 'challenge', why } : { verdict: 'unknown', why: 'HTTP ' + status };
  if (!status || status >= 400) return { verdict: 'unknown', why: 'HTTP ' + (status || '응답 없음') };
  return why ? { verdict: 'refuse', why } : { verdict: 'allow', why: '' };
}

// 다음 자동 점검 상태.
//   prev    : 이전 상태 { lastChange, blocked: { id: { reason, since } } } (없으면 null)
//   malls   : data/malls.js 의 목록
//   results : { id: [ { verdict, why }, ... ] }  (PC 주소, 휴대폰 주소 각각의 판정)
// 규칙
//   - malls.js 에 frame: false(사람이 새 창 전용으로 정한 곳)는 넣지 않는다 — 이미 새 창이다
//   - 판정 중 하나라도 refuse 면 막힘으로 넣는다 (since 는 처음 막힌 날을 유지)
//   - 전부 allow 면 뺀다 (다시 허용되면 페이지 안 표시로 돌아간다)
//   - 그 밖(unknown·challenge 섞임)은 이전 상태를 그대로 둔다
function nextStatus(prev, malls, results, today) {
  const before = (prev && prev.blocked) || {};
  const blocked = {};
  for (const m of malls) {
    if (m.frame === false) continue;
    const rs = results[m.id] || [];
    const bad = rs.find(r => r.verdict === 'refuse');
    if (bad) blocked[m.id] = { reason: bad.why, since: before[m.id] ? before[m.id].since : today };
    else if (rs.length && rs.every(r => r.verdict === 'allow')) { /* 표시 허용 → 빠진다 */ }
    else if (before[m.id]) blocked[m.id] = before[m.id];
  }
  const same = JSON.stringify(before) === JSON.stringify(blocked);
  return { lastChange: same && prev ? prev.lastChange : today, blocked };
}

const HEADER = '/* 자동 생성 — 직접 고치지 않는다.\n' +
  '   scripts/frame-check.js 가 매일(GitHub Actions: .github/workflows/frame-check.yml) 쇼핑몰의 응답 헤더를 보고,\n' +
  '   페이지 안 표시를 새로 거부하는 쇼핑몰을 blocked 에 적는다. 화면(app.js)은 여기 적힌 곳을 새 창으로 연다.\n' +
  '   AGENTS.md 3항 "막힘 자동 점검" 참고. */\n';

function renderStatus(status) {
  return HEADER + 'window.FrameStatus = ' + JSON.stringify(status, null, 2) + ';\n';
}

// 파일 내용에서 상태를 읽는다 (없거나 깨졌으면 null)
function parseStatus(text) {
  try {
    const w = {};
    new Function('window', String(text))(w);
    return w.FrameStatus && typeof w.FrameStatus === 'object' ? w.FrameStatus : null;
  } catch (e) { return null; }
}

module.exports = { refusal, frameVerdict, nextStatus, renderStatus, parseStatus };
