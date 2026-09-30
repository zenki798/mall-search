// 콘솔 에러·페이지 에러를 모아 두었다가 테스트 끝에 비어 있는지 확인한다
function trackErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}

// 실제 창을 열지 않도록 window.open 을 가짜 창으로 바꾼다.
//   window.__opened : open 호출 기록 [{ url, name, features }]
//   window.__nav    : 가짜 창의 location.href 에 넣은 주소 (창 이동 기록)
//   window.__windows: 만든 가짜 창들
//   window.__focused: 가짜 창의 focus() 호출 횟수
// blockAfter 가 숫자면 그 개수 이후의 호출은 팝업 차단처럼 null 을 돌려준다.
async function stubOpen(page, blockAfter) {
  await page.addInitScript(n => {
    window.__opened = [];
    window.__nav = [];
    window.__windows = [];
    window.__focused = 0;
    window.open = (url, name, features) => {
      window.__opened.push({ url, name, features });
      if (n != null && window.__opened.length > n) return null;
      let href = url;
      const w = {
        closed: false,
        opener: window,
        close() { this.closed = true; },
        focus() { window.__focused++; },
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

// 쇼핑몰(https) 요청은 실제로 나가지 않게 가짜 페이지로 응답한다. 넘겨보기 패널의 iframe 도 여기에 걸린다.
async function stubMalls(page) {
  await page.context().route(/^https:\/\//, route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>가짜 쇼핑몰</title><p>쇼핑몰 자리</p>',
  }));
}

async function openApp(page, query) {
  await page.goto(query ? '/?q=' + encodeURIComponent(query) : '/');
  await page.waitForFunction(() => window.__ready === true);
}

const opened = page => page.evaluate(() => window.__opened);
const nav = page => page.evaluate(() => window.__nav);
const malls = page => page.evaluate(() => window.Malls.malls);
const urlOf = (mall, q) => mall.url.replace('{q}', encodeURIComponent(q));
const frameSrc = page => page.locator('#frame').getAttribute('src');
// 기본 넘겨보기 순서: 새 창 전용(frame: false)은 뺀다
const inPage = list => list.filter(m => m.frame !== false);

// 화면 종류 (app.js 의 SPLIT_MQ·TOUCH_MQ 와 같은 기준)
//   split   : 목록 옆에 패널이 붙는 넓고 높은 화면 (PC·태블릿 가로)
//   touch   : 터치 전용 기기 (휴대폰·태블릿)
//   windowed: 새 창을 "창 하나 재사용" 으로 여는 PC. 그 밖에는 누를 때마다 탭으로 연다
const split = page => page.evaluate(() => matchMedia('(min-width: 900px) and (min-height: 540px)').matches);
const touch = page => page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches);
const windowed = async page => (await split(page)) && !(await touch(page));

module.exports = { trackErrors, stubOpen, stubMalls, openApp, opened, nav, malls, urlOf, frameSrc, inPage, split, touch, windowed };
