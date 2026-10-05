// 막힘 자동 점검의 규칙 (scripts/frame-rules.js) — 네트워크 없이 규칙만 확인한다
const { test, expect } = require('@playwright/test');
const { refusal, frameVerdict, nextStatus, renderStatus, parseStatus } = require('../scripts/frame-rules');

test.describe('응답 헤더로 페이지 안 표시 허용 판정', () => {
  test('X-Frame-Options DENY·SAMEORIGIN 은 거부 (대소문자·헤더 이름 무관)', () => {
    expect(frameVerdict(200, { 'x-frame-options': 'DENY' })).toEqual({ verdict: 'refuse', why: 'X-Frame-Options: DENY' });
    expect(frameVerdict(200, { 'X-Frame-Options': 'sameorigin' }).verdict).toBe('refuse');
  });

  test('frame-ancestors 가 자기 사이트만 허락하면 거부, * 나 https: 면 허용', () => {
    expect(frameVerdict(200, { 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }).verdict).toBe('refuse');
    expect(frameVerdict(200, { 'content-security-policy': 'frame-ancestors *.ikea.com *.ingka.com' }).verdict).toBe('refuse');
    expect(frameVerdict(200, { 'content-security-policy': 'frame-ancestors *' }).verdict).toBe('allow');
    expect(frameVerdict(200, { 'content-security-policy': 'frame-ancestors https:' }).verdict).toBe('allow');
    expect(refusal({ 'content-security-policy': "frame-ancestors 'self'  ohou.se" })).toBe("frame-ancestors 'self' ohou.se");
  });

  test('거부 헤더가 없으면 허용 (넘겨주기 3xx 도 정상 응답으로 본다)', () => {
    expect(frameVerdict(200, {})).toEqual({ verdict: 'allow', why: '' });
    expect(frameVerdict(302, { 'content-type': 'text/html' }).verdict).toBe('allow');
  });

  test('자동 접속 차단(403·429)은 판정하지 않는다 — 거부 헤더가 붙어 있어도 "차단 화면" 으로만 둔다', () => {
    expect(frameVerdict(403, { 'x-frame-options': 'SAMEORIGIN' }).verdict).toBe('challenge');
    expect(frameVerdict(403, {}).verdict).toBe('unknown');
    expect(frameVerdict(429, {}).verdict).toBe('unknown');
  });

  test('오류·응답 없음도 판정하지 않는다', () => {
    expect(frameVerdict(500, {}).verdict).toBe('unknown');
    expect(frameVerdict(404, { 'x-frame-options': 'DENY' }).verdict).toBe('unknown');
    expect(frameVerdict(0, {}).verdict).toBe('unknown');
  });
});

test.describe('자동 점검 상태 만들기', () => {
  const malls = [
    { id: 'a', frame: true },
    { id: 'b', frame: true },
    { id: 'c' },                   // 판별 불가 (frame 없음)
    { id: 'n', frame: false },     // 사람이 정한 새 창 전용
  ];
  const allow = { verdict: 'allow', why: '' };
  const refuse = { verdict: 'refuse', why: 'X-Frame-Options: DENY' };
  const challenge = { verdict: 'challenge', why: 'X-Frame-Options: SAMEORIGIN' };
  const unknown = { verdict: 'unknown', why: 'HTTP 403' };

  test('새로 거부하는 곳을 오늘 날짜로 적고, 사람이 정한 새 창 전용은 적지 않는다', () => {
    const s = nextStatus(null, malls, { a: [refuse], b: [allow], c: [allow], n: [refuse] }, '2026-10-05');
    expect(s).toEqual({ lastChange: '2026-10-05', blocked: { a: { reason: 'X-Frame-Options: DENY', since: '2026-10-05' } } });
  });

  test('휴대폰 주소만 거부해도 막힘으로 본다', () => {
    const s = nextStatus(null, malls, { a: [allow, refuse], b: [allow], c: [allow] }, '2026-10-05');
    expect(Object.keys(s.blocked)).toEqual(['a']);
  });

  test('계속 막혀 있으면 처음 막힌 날을 유지하고, 바뀐 게 없으면 lastChange 도 그대로다', () => {
    const prev = { lastChange: '2026-10-01', blocked: { a: { reason: 'X-Frame-Options: DENY', since: '2026-10-01' } } };
    const s = nextStatus(prev, malls, { a: [refuse], b: [allow], c: [allow] }, '2026-10-05');
    expect(s).toEqual(prev);
  });

  test('다시 허용되면 빠진다 (페이지 안 표시로 돌아간다)', () => {
    const prev = { lastChange: '2026-10-01', blocked: { a: { reason: 'X-Frame-Options: DENY', since: '2026-10-01' } } };
    const s = nextStatus(prev, malls, { a: [allow], b: [allow], c: [allow] }, '2026-10-05');
    expect(s).toEqual({ lastChange: '2026-10-05', blocked: {} });
  });

  test('판정 불가·차단 화면이면 이전 상태를 그대로 둔다 — 점검하는 쪽만 막혔을 수 있어서 바꾸지 않는다', () => {
    const prev = { lastChange: '2026-10-01', blocked: { a: { reason: 'X-Frame-Options: DENY', since: '2026-10-01' } } };
    const s = nextStatus(prev, malls, { a: [unknown], b: [challenge], c: [] }, '2026-10-05');
    expect(s).toEqual(prev);                                  // a 는 그대로 막힘, b 는 새로 막지 않음
  });

  test('파일로 썼다 읽으면 같은 상태이고, 같은 상태는 같은 글자로 써진다 (쓸데없는 커밋 방지)', () => {
    const s = { lastChange: '2026-10-05', blocked: { a: { reason: 'X-Frame-Options: DENY', since: '2026-10-05' } } };
    const text = renderStatus(s);
    expect(parseStatus(text)).toEqual(s);
    expect(renderStatus(parseStatus(text))).toBe(text);
    expect(parseStatus('깨진 내용 {')).toBeNull();
  });

  test('저장소의 상태 파일을 읽을 수 있다', () => {
    const fs = require('fs');
    const path = require('path');
    const s = parseStatus(fs.readFileSync(path.join(__dirname, '..', 'data', 'frame-status.js'), 'utf8'));
    expect(s).not.toBeNull();
    expect(typeof s.blocked).toBe('object');
  });
});
