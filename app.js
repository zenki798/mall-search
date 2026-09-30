/* 쇼핑몰 한번에 검색 — window.Malls 목록으로 검색 링크를 만든다.
   기본은 "결과 창 하나에서 넘겨보기", 보조로 "모두 새 탭으로 열기". */
(function () {
  'use strict';

  const M = window.Malls;
  const OFF_KEY = 'mallsearch.off.v1';      // 체크 해제한 쇼핑몰 id
  const RECENT_KEY = 'mallsearch.recent.v1';
  const RECENT_MAX = 8;
  const VIEWER_NAME = 'mallsearch-viewer';

  const state = {
    query: '',
    category: 'all',
    off: new Set(load(OFF_KEY, [])),
    recent: load(RECENT_KEY, []).filter(s => typeof s === 'string').slice(0, RECENT_MAX),
  };
  // 앱 모드: 홈 화면에 설치해서 실행한 경우. manifest 의 start_url 에 ?source=pwa 를 붙여 두었다.
  // 앱 모드에서는 결과 창을 옆에 띄워 조종할 수 없다(휴대폰은 창을 나란히 못 띄우고, 앱 밖 주소는
  // 앱 위에 겹쳐 뜨는 브라우저로 열린다). 그래서 쇼핑몰을 하나씩 열고, 닫고 돌아오면 "다음"으로 잇는다.
  const APP_MODE = (() => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        navigator.standalone === true ||
        new URL(location.href).searchParams.get('source') === 'pwa';
    } catch (e) { return false; }
  })();
  document.documentElement.classList.toggle('app-mode', APP_MODE);

  // win: 결과 창(데스크톱). active: 앱 모드에서 넘겨보기 중인지
  const viewer = { win: null, id: null, active: false };

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // localStorage 는 file:// 에서 막힐 수 있다. 실패해도 화면은 동작해야 한다.
  function load(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return Array.isArray(v) ? v : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 무시 */ }
  }

  const visible = () => M.malls.filter(m => state.category === 'all' || m.cats.includes(state.category));
  const targets = () => visible().filter(m => !state.off.has(m.id));
  const viewerOpen = () => APP_MODE ? viewer.active : !!(viewer.win && !viewer.win.closed);

  // ── 렌더링 ──
  function drawCategories() {
    const chip = (key, name) =>
      `<button type="button" class="chip" data-category="${esc(key)}" aria-pressed="${state.category === key}">${esc(name)}</button>`;
    $('categories').innerHTML = chip('all', '전체') + M.categories.map(c => chip(c.key, c.name)).join('');
  }

  function drawMalls() {
    const q = state.query;
    const list = visible();
    $('malls').innerHTML = M.groups.map(g => {
      const items = list.filter(m => m.group === g.key);
      if (!items.length) return '';
      return `
  <section class="group" data-group="${esc(g.key)}">
    <h2>${esc(g.name)}</h2>
    <div class="grid">${items.map(m => {
      const on = !state.off.has(m.id);
      const link = q
        ? `href="${esc(M.searchUrl(m, q))}" target="_blank" rel="noopener noreferrer"`
        : 'aria-disabled="true"';
      return `
      <div class="mall${on ? '' : ' off'}" data-mall="${esc(m.id)}">
        <label class="pick"><input type="checkbox" data-pick="${esc(m.id)}" ${on ? 'checked' : ''} aria-label="${esc(m.name)} 포함"></label>
        <a class="mall-link" data-link="${esc(m.id)}" ${link}>
          <strong>${esc(m.name)}</strong>
          <span>${q ? `‘${esc(q)}’ 검색` : '검색어를 입력하세요'}</span>
        </a>
      </div>`;
    }).join('')}</div>
  </section>`;
    }).join('');
    drawButtons();
    drawViewer();
  }

  function drawButtons() {
    const n = targets().length;
    const off = !state.query || n === 0;
    $('view-start').textContent = `${n}곳 한 창에서 넘겨보기`;
    $('view-start').disabled = off;
    $('open-tabs').textContent = `모두 새 탭으로 열기 (${n})`;
    $('open-tabs').disabled = off;
  }

  function drawViewer() {
    const open = viewerOpen() && viewer.id;
    document.body.classList.toggle('viewing', !!open);
    $('viewer').hidden = !open;
    document.querySelectorAll('.mall.current').forEach(el => el.classList.remove('current'));
    if (!open) return;
    const list = targets();
    const i = list.findIndex(m => m.id === viewer.id);
    const mall = M.malls.find(m => m.id === viewer.id);
    $('viewer-pos').textContent = i >= 0 ? `${i + 1} / ${list.length}` : '–';
    $('viewer-name').textContent = mall ? mall.name : '';
    $('prev').disabled = !(i > 0) && !(i < 0 && list.length);
    $('next').disabled = !(i < list.length - 1);
    $('viewer-close').textContent = APP_MODE ? '넘겨보기 끝내기' : '결과 창 닫기';
    $('viewer-tip').textContent = APP_MODE
      ? '쇼핑몰을 다 봤으면 위쪽 닫기(✕)로 돌아와 다음 ▶ 을 누르세요.'
      : '← → 키로도 넘길 수 있습니다. 아래 쇼핑몰 이름을 누르면 그곳으로 바로 갑니다.';
    const el = document.querySelector(`.mall[data-mall="${viewer.id}"]`);
    if (el) el.classList.add('current');
  }

  function drawRecent() {
    const box = $('recent');
    box.hidden = state.recent.length === 0;
    box.innerHTML = '최근:' + state.recent.map(s =>
      `<button type="button" data-recent="${esc(s)}">${esc(s)}</button>`).join('') +
      '<button type="button" class="clear" data-clear-recent>기록 지우기</button>';
  }

  function notice(kind, html) {
    const n = $('notice');
    n.className = 'note ' + kind;
    n.innerHTML = html;
    n.hidden = !html;
  }

  // ── 동작 ──
  function setQuery(q) {
    state.query = String(q || '').trim();
    if ($('q').value.trim() !== state.query) $('q').value = state.query;
    try {
      const url = new URL(location.href);
      if (state.query) url.searchParams.set('q', state.query); else url.searchParams.delete('q');
      history.replaceState(null, '', url.href);
    } catch (e) { /* file:// 등에서 막혀도 계속한다 */ }
    drawMalls();
  }

  function remember(q) {
    if (!q) return;
    state.recent = [q].concat(state.recent.filter(s => s !== q)).slice(0, RECENT_MAX);
    save(RECENT_KEY, state.recent);
    drawRecent();
  }

  // 결과 창은 화면 오른쪽 2/3 에 띄운다. 이 페이지는 왼쪽에서 목록 역할을 한다.
  function viewerFeatures() {
    const s = window.screen || {};
    const aw = s.availWidth || 1280, ah = s.availHeight || 800;
    const left = (s.availLeft || 0) + Math.round(aw * 0.34);
    return `popup,left=${left},top=${s.availTop || 0},width=${aw - Math.round(aw * 0.34)},height=${ah}`;
  }

  // 결과 창 하나를 계속 재사용한다. 창을 여는 것은 처음 한 번뿐이라 팝업 차단에 걸리지 않는다.
  // opener 는 끊지 않는다 — 끊으면 크롬이 다른 사이트로 넘어간 창을 다시 이동시키지 못하게 막는다
  // (AGENTS.md 3항 "결과 창과 opener").
  function show(mall) {
    if (!state.query || !mall) return false;
    if (APP_MODE) {
      // 앱 모드: 누를 때마다 한 곳씩 연다. 사용자가 닫고 돌아오므로 탭이 쌓이지 않는다.
      const w = window.open(M.searchUrl(mall, state.query), '_blank');
      if (!w) {
        notice('warn', '<strong>쇼핑몰을 열지 못했습니다.</strong> 아래 쇼핑몰 이름을 직접 눌러 주세요.');
        return false;
      }
      try { w.opener = null; } catch (e) { /* 무시 */ }
      viewer.active = true;
      viewer.id = mall.id;
      notice('', '');
      remember(state.query);
      drawViewer();
      return true;
    }
    if (!viewerOpen()) {
      // 새로고침으로 참조를 잃었어도 같은 이름의 창이 남아 있으면 그 창을 다시 쓴다
      const w = window.open('', VIEWER_NAME, viewerFeatures());
      if (!w) {
        notice('warn', '<strong>브라우저가 결과 창을 막았습니다.</strong> 주소창 오른쪽의 팝업 차단 아이콘에서 "항상 허용"을 고른 뒤 다시 누르세요.');
        return false;
      }
      viewer.win = w;
    }
    viewer.win.location.href = M.searchUrl(mall, state.query);
    viewer.id = mall.id;
    notice('', '');
    remember(state.query);
    drawViewer();
    return true;
  }

  function step(delta) {
    if (!viewerOpen()) return;
    const list = targets();
    if (!list.length) return;
    const i = list.findIndex(m => m.id === viewer.id);
    const next = i < 0 ? 0 : i + delta;
    if (next >= 0 && next < list.length) show(list[next]);
  }

  function closeViewer() {
    if (!APP_MODE && viewerOpen()) viewer.win.close();
    viewer.win = null;
    viewer.id = null;
    viewer.active = false;
    drawViewer();
  }

  // 한 번의 클릭에 여러 창을 열면 브라우저가 두 번째부터 막을 수 있다. 막힌 개수를 세어 안내한다.
  // 'noopener' 옵션을 주면 성공해도 null 이 돌아와 막힘을 구별할 수 없으므로, 연 뒤에 opener 를 끊는다.
  function openTabs() {
    if (!state.query) return;
    const list = targets();
    let blocked = 0;
    list.forEach(m => {
      const w = window.open(M.searchUrl(m, state.query), '_blank');
      if (w) { try { w.opener = null; } catch (e) { /* 무시 */ } } else blocked++;
    });
    remember(state.query);
    if (blocked) {
      notice('warn', `<strong>브라우저가 팝업 ${blocked}개를 막았습니다.</strong> ` +
        `주소창 오른쪽의 팝업 차단 아이콘에서 "항상 허용"을 고른 뒤 다시 누르세요. 탭이 많은 게 번거로우면 "한 창에서 넘겨보기"를 쓰세요.`);
    } else {
      notice('ok', `${list.length}곳의 ‘${esc(state.query)}’ 검색 결과를 새 탭으로 열었습니다.`);
    }
  }

  // 결과 창이 닫혔는지 가끔 확인해서 넘겨보기 막대를 정리한다
  if (!APP_MODE) {
    setInterval(() => { if (viewer.id && !viewerOpen()) { viewer.win = null; viewer.id = null; drawViewer(); } }, 1000);
  }

  // ── 이벤트 ──
  $('q').addEventListener('input', e => { notice('', ''); setQuery(e.target.value); });
  $('search-form').addEventListener('submit', e => {
    e.preventDefault();
    setQuery($('q').value);
    show(targets()[0]);
  });
  $('open-tabs').addEventListener('click', openTabs);
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  $('viewer-close').addEventListener('click', closeViewer);

  // ← → 로 넘긴다. 글자를 입력하는 중에는 커서 이동을 방해하지 않는다.
  document.addEventListener('keydown', e => {
    if (!viewerOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' && t.type !== 'checkbox' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
  });

  $('categories').addEventListener('click', e => {
    const b = e.target.closest('[data-category]');
    if (!b) return;
    state.category = b.dataset.category;
    drawCategories();
    drawMalls();
  });

  $('malls').addEventListener('change', e => {
    const id = e.target.dataset.pick;
    if (!id) return;
    if (e.target.checked) state.off.delete(id); else state.off.add(id);
    save(OFF_KEY, Array.from(state.off));
    e.target.closest('.mall').classList.toggle('off', !e.target.checked);
    drawButtons();
    drawViewer();
  });
  $('malls').addEventListener('click', e => {
    const a = e.target.closest('.mall-link[href]');
    if (!a) return;
    // 앱 모드: 링크는 원래대로 열고(앱 위 브라우저), 넘겨보기 위치만 그곳으로 옮긴다
    if (APP_MODE) {
      viewer.active = true;
      viewer.id = a.dataset.link;
      remember(state.query);
      drawViewer();
      return;
    }
    // 결과 창이 열려 있으면 새 탭 대신 그 창에서 보여 준다. Ctrl·가운데 클릭은 원래대로 새 탭.
    if (viewerOpen() && !(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) {
      e.preventDefault();
      show(M.malls.find(m => m.id === a.dataset.link));
      return;
    }
    remember(state.query);
  });

  function bulk(on) {
    visible().forEach(m => { if (on) state.off.delete(m.id); else state.off.add(m.id); });
    save(OFF_KEY, Array.from(state.off));
    drawMalls();
  }
  $('select-all').addEventListener('click', () => bulk(true));
  $('select-none').addEventListener('click', () => bulk(false));

  $('recent').addEventListener('click', e => {
    if (e.target.closest('[data-clear-recent]')) {
      state.recent = [];
      save(RECENT_KEY, state.recent);
      drawRecent();
      return;
    }
    const b = e.target.closest('[data-recent]');
    if (b) { notice('', ''); setQuery(b.dataset.recent); }
  });

  // ── 앱 설치 안내 ──
  // 안드로이드 크롬: 설치 가능하면 beforeinstallprompt 가 온다 → "앱으로 설치" 버튼.
  // 아이폰 사파리: 설치 API 가 없다 → 공유 메뉴에서 추가하는 방법을 글로 안내한다.
  const INSTALL_KEY = 'mallsearch.installHint.v1';
  let installEvent = null;
  function installDismissed() { try { return localStorage.getItem(INSTALL_KEY) === 'off'; } catch (e) { return false; } }
  function showInstall(text, withButton) {
    if (APP_MODE || installDismissed()) return;
    $('install-text').textContent = text;
    $('install-btn').hidden = !withButton;
    $('install-bar').hidden = false;
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installEvent = e;
    showInstall('홈 화면에 설치하면 주소창 없이 앱처럼 쓸 수 있어요.', true);
  });
  window.addEventListener('appinstalled', () => { $('install-bar').hidden = true; });
  $('install-btn').addEventListener('click', () => {
    if (!installEvent) return;
    installEvent.prompt();
    installEvent.userChoice.finally(() => { installEvent = null; $('install-bar').hidden = true; });
  });
  $('install-close').addEventListener('click', () => {
    $('install-bar').hidden = true;
    try { localStorage.setItem(INSTALL_KEY, 'off'); } catch (e) { /* 무시 */ }
  });
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && /^https:$/.test(location.protocol)) {
    showInstall('앱처럼 쓰려면: 사파리 아래쪽 공유 버튼(□↑) → "홈 화면에 추가"', false);
  }

  // 서비스 워커: 설치 조건을 채우고 오프라인에서도 화면을 띄운다. file:// 에서는 쓸 수 없다.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 실패해도 페이지는 동작한다 */ });
  }

  // ── 시작 ──
  let initial = '';
  try { initial = new URL(location.href).searchParams.get('q') || ''; } catch (e) { /* 무시 */ }
  drawCategories();
  drawRecent();
  setQuery(initial);
  window.__ready = true;
})();
