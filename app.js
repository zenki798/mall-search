/* 쇼핑몰 한번에 검색 — window.Malls 목록으로 검색 링크를 만든다.
   기본은 "페이지 안에서 넘겨보기": 넓은 화면은 오른쪽 패널, 좁은 화면(휴대폰·앱)은 전체 화면.
   페이지 안 표시를 거부하는 쇼핑몰(frame: false)은 새 창으로 연다. 보조로 "모두 새 탭으로 열기". */
(function () {
  'use strict';

  const M = window.Malls;
  // 쇼핑몰 주소는 기기에 맞춰 고른다(휴대폰 전용 주소가 있는 곳). data/malls.js 의 mobileUrl·mobileWhen 참고
  const UA = navigator.userAgent;
  const OFF_KEY = 'mallsearch.off.v1';      // 체크 해제한 쇼핑몰 id
  const RECENT_KEY = 'mallsearch.recent.v1';
  const EXTERNAL_KEY = 'mallsearch.includeExternal.v1';
  const RECENT_MAX = 8;
  const POPUP_NAME = 'mallsearch-viewer';
  // 쇼핑몰 페이지가 이 페이지를 다른 곳으로 이동시키지 못하게 allow-top-navigation 은 주지 않는다.
  // 상품을 새 탭으로 여는 링크는 동작하도록 allow-popups(-to-escape-sandbox) 는 준다.
  const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';

  // 앱 모드: 홈 화면에 설치해서 실행한 경우. manifest 의 start_url 에 ?source=pwa 를 붙여 두었다.
  // 앱 모드에서 새 창은 앱 위에 겹쳐 뜨는 브라우저로 열린다.
  const APP_MODE = (() => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        navigator.standalone === true ||
        new URL(location.href).searchParams.get('source') === 'pwa';
    } catch (e) { return false; }
  })();
  document.documentElement.classList.toggle('app-mode', APP_MODE);

  const state = {
    query: '',
    category: 'all',
    off: new Set(load(OFF_KEY, [])),
    recent: load(RECENT_KEY, []).filter(s => typeof s === 'string').slice(0, RECENT_MAX),
    includeExternal: loadFlag(EXTERNAL_KEY),   // 새 창 전용 쇼핑몰도 넘겨보기 순서에 넣을지
  };
  // active: 넘겨보기 패널이 열려 있는지. entry/len: 뒤로 가기용으로 쌓은 기록 (enterHistory 참고)
  const viewer = { active: false, id: null, entry: false, len: 0 };
  let popup = null;      // PC 에서 "새 창" 으로 여는 창. 하나를 계속 재사용한다
  let loadTimer = 0;

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
  function loadFlag(key) {
    try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
  }
  function saveFlag(key, on) {
    try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) { /* 무시 */ }
  }

  const mallById = id => M.malls.find(m => m.id === id);
  const external = m => m.frame === false;               // 페이지 안 표시를 거부한다 → 새 창으로
  const unverified = m => m.frame !== true && m.frame !== false;
  const visible = () => M.malls.filter(m => state.category === 'all' || m.cats.includes(state.category));
  const targets = () => visible().filter(m => !state.off.has(m.id));
  // 넘겨보기 순서: 체크한 곳. 새 창 전용은 "포함" 을 켰을 때만 넣는다.
  const route = () => targets().filter(m => state.includeExternal || !external(m));
  // 넓고 충분히 높은 화면: 목록 옆에 패널을 붙인다 (index.html 의 같은 조건과 맞춘다).
  // 높이 조건은 큰 휴대폰을 가로로 돌렸을 때(폭 900 넘음, 높이 430 안팎) 분할되지 않게 하려는 것이다.
  const SPLIT_MQ = '(min-width: 900px) and (min-height: 540px)';
  // 터치 전용 기기(휴대폰·태블릿). 아이패드 사파리는 창을 따로 띄우지 못하고 탭으로 연다.
  const TOUCH_MQ = '(hover: none) and (pointer: coarse)';
  // 새 창을 "누를 때마다 탭으로" 열지, PC 처럼 "창 하나 재사용" 할지.
  // 탭만 있는 기기에서 창을 재사용하면 두 번째부터는 뒤쪽 탭만 바뀌어 아무 일도 없는 것처럼 보인다.
  const opensInTabs = () => APP_MODE || !window.matchMedia(SPLIT_MQ).matches || window.matchMedia(TOUCH_MQ).matches;

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
        ? `href="${esc(M.searchUrl(m, q, UA))}" target="_blank" rel="noopener noreferrer"`
        : 'aria-disabled="true"';
      const ext = external(m) ? ' <small class="ext" title="이 쇼핑몰은 새 창으로 열립니다">새 창</small>' : '';
      return `
      <div class="mall${on ? '' : ' off'}" data-mall="${esc(m.id)}">
        <label class="pick"><input type="checkbox" data-pick="${esc(m.id)}" ${on ? 'checked' : ''} aria-label="${esc(m.name)} 포함"></label>
        <a class="mall-link" data-link="${esc(m.id)}" ${link}>
          <strong>${esc(m.name)}${ext}</strong>
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
    const n = route().length;
    const total = targets().length;
    $('view-start').textContent = `${n}곳 넘겨보기`;
    $('view-start').disabled = !state.query || n === 0;
    $('open-tabs').textContent = `모두 새 탭으로 열기 (${total})`;
    $('open-tabs').disabled = !state.query || total === 0;
  }

  // 전체 쇼핑몰 순서(M.malls)에서 현재 위치 앞뒤로, 넘겨보기 순서에 들어 있는 가장 가까운 곳.
  // 현재 쇼핑몰이 체크 해제·건너뛰기 대상이어도 제자리에서 이어 갈 수 있다.
  function neighbor(delta) {
    const list = route();
    const i = M.malls.findIndex(m => m.id === viewer.id);
    for (let j = i + delta; j >= 0 && j < M.malls.length; j += delta) {
      if (list.includes(M.malls[j])) return M.malls[j];
    }
    return null;
  }

  function drawViewer() {
    const on = viewer.active && !!viewer.id;
    document.body.classList.toggle('viewing', on);
    $('panel').hidden = !on;
    document.querySelectorAll('.mall.current').forEach(el => el.classList.remove('current'));
    if (!on) return;
    const list = route();
    const mall = mallById(viewer.id);
    const i = list.indexOf(mall);
    $('viewer-name').textContent = mall.name;
    $('viewer-pos').textContent = i >= 0 ? `${i + 1} / ${list.length}` : `– / ${list.length}`;
    $('prev').disabled = !neighbor(-1);
    $('next').disabled = !neighbor(1);
    const ext = targets().filter(external);
    $('include-external-row').hidden = ext.length === 0;
    $('include-external').checked = state.includeExternal;
    $('include-external-label').textContent =
      `새 창 전용 ${ext.length}곳(${ext.slice(0, 2).map(m => m.name).join('·')}${ext.length > 2 ? ' 등' : ''})도 넘겨보기에 포함`;
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
  // 패널이 열려 있으면 목록 쪽 안내는 가려 보이지 않을 수 있으므로 패널 안에 띄운다
  function panelNote(html) {
    $('panel-note').innerHTML = html;
    $('panel-note').hidden = !html;
  }

  // ── 동작 ──
  function setQuery(q) {
    state.query = String(q || '').trim();
    if ($('q').value.trim() !== state.query) $('q').value = state.query;
    try {
      const url = new URL(location.href);
      if (state.query) url.searchParams.set('q', state.query); else url.searchParams.delete('q');
      history.replaceState(history.state, '', url.href);   // 뒤로 가기용 기록 표시(state)는 지키고 주소만 바꾼다
    } catch (e) { /* file:// 등에서 막혀도 계속한다 */ }
    if (!state.query) closeViewer();
    drawMalls();
  }

  function remember(q) {
    if (!q) return;
    state.recent = [q].concat(state.recent.filter(s => s !== q)).slice(0, RECENT_MAX);
    save(RECENT_KEY, state.recent);
    drawRecent();
  }

  // iframe 은 쇼핑몰을 바꿀 때마다 새로 만든다. src 를 바꾸면 이 탭의 방문 기록이 쌓여서
  // 뒤로 가기가 패널을 닫지 않고 이전 쇼핑몰로 돌아가게 된다. 새 iframe 의 첫 로드는 기록을 남기지 않는다.
  function renderFrame(mall) {
    const f = document.createElement('iframe');
    f.id = 'frame';
    f.className = 'frame';
    f.title = mall ? `${mall.name} 검색 결과` : '쇼핑몰 검색 결과';
    f.setAttribute('sandbox', SANDBOX);
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    clearTimeout(loadTimer);
    const show = !!mall && !external(mall);
    $('frame-blocked').hidden = !(mall && external(mall));
    $('frame-unverified').hidden = !(mall && unverified(mall));
    $('frame-loading').hidden = !show;
    panelNote('');
    if (mall) {
      $('blocked-name').textContent = mall.name;
      $('unverified-name').textContent = mall.name;
    }
    if (show) {
      f.addEventListener('load', () => { $('frame-loading').hidden = true; });
      // 쇼핑몰은 광고까지 다 받아야 load 가 와서 늦다. 안내는 잠깐만 보여 준다.
      loadTimer = setTimeout(() => { $('frame-loading').hidden = true; }, 3000);
      f.src = M.searchUrl(mall, state.query, UA);
    } else {
      f.hidden = true;
    }
    $('frame').replaceWith(f);
  }

  function show(mall) {
    if (!state.query || !mall) return false;
    if (!viewer.active) enterHistory();
    viewer.active = true;
    viewer.id = mall.id;
    renderFrame(mall);
    notice('', '');
    remember(state.query);
    drawViewer();
    return true;
  }

  function step(delta) {
    if (!viewer.active) return;
    const next = neighbor(delta);
    if (next) show(next);
  }

  function closeViewer() {
    if (!viewer.active) return;
    viewer.active = false;
    viewer.id = null;
    renderFrame(null);
    drawViewer();
    // 넘겨보기를 열 때 쌓은 기록을 되돌린다. 단, 쇼핑몰 안에서 링크를 눌러 기록이 더 쌓였으면
    // 되돌리기가 그 쇼핑몰 페이지를 뒤로 보내므로 하지 않는다 (뒤로 가기 한 번이 헛돌 뿐이다).
    if (viewer.entry && history.length === viewer.len && history.state && history.state.mallViewer) {
      viewer.entry = false;
      try { history.back(); } catch (e) { /* 무시 */ }
    }
  }

  // 넘겨보기를 열 때 방문 기록을 하나 쌓는다. 뒤로 가기(안드로이드 뒤로 제스처 포함)가
  // 사이트·앱을 나가 버리는 대신 패널을 닫게 하려는 것이다.
  function enterHistory() {
    if (viewer.entry) return;
    try {
      history.pushState({ mallViewer: true }, '', location.href);
      viewer.entry = true;
      viewer.len = history.length;
    } catch (e) { /* file:// 등에서 막혀도 넘겨보기는 동작한다 */ }
  }
  window.addEventListener('popstate', () => {
    viewer.entry = !!(history.state && history.state.mallViewer);
    if (!viewer.entry && viewer.active) closeViewer();
  });

  // 결과 창은 화면 오른쪽 2/3 에 띄운다.
  function popupFeatures() {
    const s = window.screen || {};
    const aw = s.availWidth || 1280, ah = s.availHeight || 800;
    const left = (s.availLeft || 0) + Math.round(aw * 0.34);
    return `popup,left=${left},top=${s.availTop || 0},width=${aw - Math.round(aw * 0.34)},height=${ah}`;
  }

  // 페이지 안에 띄울 수 없는 쇼핑몰(또는 사용자가 "새 창" 을 누른 곳)을 연다.
  // - 앱·휴대폰·태블릿: 누를 때마다 새로 연다(앱 위에 겹쳐 뜨거나 새 탭으로 가고, 닫으면 돌아온다)
  // - PC: 창 하나를 계속 재사용한다. opener 를 끊지 않는다 — 끊으면 크롬이 다른 사이트로 넘어간
  //   창을 다시 이동시키지 못하게 막는다 (AGENTS.md 3항 "새 창과 opener").
  function openExternal(mall) {
    if (!state.query || !mall) return false;
    const url = M.searchUrl(mall, state.query, UA);
    if (opensInTabs()) {
      const w = window.open(url, '_blank');
      if (!w) return popupBlocked();
      try { w.opener = null; } catch (e) { /* 무시 */ }
    } else {
      if (!popup || popup.closed) {
        // 새로고침으로 참조를 잃었어도 같은 이름의 창이 남아 있으면 그 창을 다시 쓴다
        popup = window.open('', POPUP_NAME, popupFeatures());
        if (!popup) return popupBlocked();
      }
      popup.location.href = url;
      try { popup.focus(); } catch (e) { /* 무시 */ }
    }
    remember(state.query);
    return true;
  }
  function popupBlocked() {
    const html = '<strong>브라우저가 새 창을 막았습니다.</strong> 주소창 오른쪽의 팝업 차단 아이콘에서 "항상 허용"을 고른 뒤 다시 누르세요.';
    if (viewer.active) panelNote(html); else notice('warn', html);
    return false;
  }

  // 한 번의 클릭에 여러 창을 열면 브라우저가 두 번째부터 막을 수 있다. 막힌 개수를 세어 안내한다.
  // 'noopener' 옵션을 주면 성공해도 null 이 돌아와 막힘을 구별할 수 없으므로, 연 뒤에 opener 를 끊는다.
  function openTabs() {
    if (!state.query) return;
    const list = targets();
    let blocked = 0;
    list.forEach(m => {
      const w = window.open(M.searchUrl(m, state.query, UA), '_blank');
      if (w) { try { w.opener = null; } catch (e) { /* 무시 */ } } else blocked++;
    });
    remember(state.query);
    if (blocked) {
      notice('warn', `<strong>브라우저가 팝업 ${blocked}개를 막았습니다.</strong> ` +
        `주소창 오른쪽의 팝업 차단 아이콘에서 "항상 허용"을 고른 뒤 다시 누르세요. 탭이 많은 게 번거로우면 "넘겨보기"를 쓰세요.`);
    } else {
      notice('ok', `${list.length}곳의 ‘${esc(state.query)}’ 검색 결과를 새 탭으로 열었습니다.`);
    }
  }

  // ── 이벤트 ──
  $('q').addEventListener('input', e => { notice('', ''); setQuery(e.target.value); });
  $('search-form').addEventListener('submit', e => {
    e.preventDefault();
    setQuery($('q').value);
    if (show(route()[0])) $('q').blur();   // 검색창에서 빠져나와야 ← → 로 바로 넘길 수 있다
  });
  $('open-tabs').addEventListener('click', openTabs);
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  $('viewer-close').addEventListener('click', closeViewer);
  $('open-external').addEventListener('click', () => openExternal(mallById(viewer.id)));
  $('blocked-open').addEventListener('click', () => openExternal(mallById(viewer.id)));
  $('include-external').addEventListener('change', e => {
    state.includeExternal = e.target.checked;
    saveFlag(EXTERNAL_KEY, state.includeExternal);
    drawButtons();
    drawViewer();
  });

  // ← → 로 넘기고 Esc 로 닫는다. 글자를 입력하는 중에는 방해하지 않는다.
  document.addEventListener('keydown', e => {
    if (!viewer.active || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' && t.type !== 'checkbox' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    if (e.key === 'Escape') { e.preventDefault(); closeViewer(); }
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
  // 쇼핑몰 이름을 누르면 페이지 안에서 보여 준다(거부하는 곳은 새 창). Ctrl·Shift·가운데 클릭은 원래대로 새 탭.
  $('malls').addEventListener('click', e => {
    const a = e.target.closest('.mall-link[href]');
    if (!a) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) { remember(state.query); return; }
    e.preventDefault();
    const mall = mallById(a.dataset.link);
    if (external(mall)) openExternal(mall); else show(mall);
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
  // 아이패드 사파리는 기본으로 Mac 처럼 자신을 밝힌다(User-Agent 에 iPad 가 없다) → 터치 지점 수로 가려낸다.
  const IPAD = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const IOS = IPAD || /iPhone|iPod/.test(navigator.userAgent);
  // file:// 로 연 페이지는 홈 화면에 추가해도 소용없다. (크롬은 file:// 도 isSecureContext 로 보므로 따로 뺀다)
  if (IOS && window.isSecureContext && location.protocol !== 'file:') {
    showInstall(`앱처럼 쓰려면: 사파리 ${IPAD ? '오른쪽 위' : '아래쪽'} 공유 버튼(□↑) → "홈 화면에 추가"`, false);
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
