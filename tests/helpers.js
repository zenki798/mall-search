// 콘솔 에러·페이지 에러를 모아 두었다가 테스트 끝에 비어 있는지 확인한다
function trackErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}

// 실제 창을 열지 않도록 window.open 을 가짜 창으로 바꾼다.
//   window.__opened : open 호출 기록 [{ url, name, features }]
//   window.__nav    : 가짜 창의 location.href 에 넣은 주소 (결과 창 이동 기록)
//   window.__windows: 만든 가짜 창들 (closed 를 바꿔 "사용자가 창을 닫음"을 흉내 낸다)
// blockAfter 가 숫자면 그 개수 이후의 호출은 팝업 차단처럼 null 을 돌려준다.
async function stubOpen(page, blockAfter) {
  await page.addInitScript(n => {
    window.__opened = [];
    window.__nav = [];
    window.__windows = [];
    window.open = (url, name, features) => {
      window.__opened.push({ url, name, features });
      if (n != null && window.__opened.length > n) return null;
      let href = url;
      const w = {
        closed: false,
        opener: window,
        close() { this.closed = true; },
        location: {
          get href() { return href; },
          set href(v) { href = v; window.__nav.push(v); },
        },
      };
      window.__windows.push(w);
      return w;
    };
  }, blockAfter == null ? null : blockAfter);
}

async function openApp(page, query) {
  await page.goto(query ? '/?q=' + encodeURIComponent(query) : '/');
  await page.waitForFunction(() => window.__ready === true);
}

const opened = page => page.evaluate(() => window.__opened);
const nav = page => page.evaluate(() => window.__nav);
const malls = page => page.evaluate(() => window.Malls.malls);
const urlOf = (mall, q) => mall.url.replace('{q}', encodeURIComponent(q));

module.exports = { trackErrors, stubOpen, openApp, opened, nav, malls, urlOf };
