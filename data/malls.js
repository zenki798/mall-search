/* 쇼핑몰 검색 주소 목록.
   {q} 자리에 검색어가 encodeURIComponent 로 들어간다.
   주소를 추가·수정하면 `npm run check:links` 로 실제로 열리는지 확인한다 (AGENTS.md 3항).

   blocked: true — 자동 브라우저를 차단(403)해서 check:links 로 확인할 수 없는 곳. 직접 눌러 확인한다.
   frame        — 이 페이지 안(iframe)에 표시되는가. 2026-09-30 실측 (AGENTS.md 3항 "페이지 안에서 넘겨보기")
     true  : 표시된다 → 넘겨보기 패널 안에 띄운다
     false : 쇼핑몰이 X-Frame-Options / frame-ancestors 로 거부한다 → 새 창으로 연다
     없음  : 판별하지 못했다(자동 접속 차단) → 패널에 띄워 보고, 안 되면 "새 창" 을 누르라고 안내한다
   mobileUrl · mobileWhen — 휴대폰에는 다른 주소를 써야 하는 쇼핑몰 (AGENTS.md 3항 "기기별 주소")
     브라우저 정보(User-Agent)가 mobileWhen(정규식)에 걸리면 mobileUrl 을 쓴다. 쇼핑몰마다 "휴대폰" 으로
     보는 기준이 달라서, 각 쇼핑몰이 실제로 휴대폰 주소로 넘기는 조건을 실측해 그대로 적는다.
     기기와 안 맞는 주소를 주면 쇼핑몰이 넘겨주기를 하는데, 페이지 안(iframe)에서는 그 과정이 막혀 빈 화면이 된다. */
(function (global) {
  'use strict';

  const categories = [
    { key: 'food', name: '식품' },
    { key: 'goods', name: '생활·공산품' },
    { key: 'beauty', name: '뷰티' },
    { key: 'furniture', name: '가구·인테리어' },
    { key: 'fashion', name: '패션' },
    { key: 'digital', name: '가전·디지털' },
  ];
  const ALL = categories.map(c => c.key);

  const groups = [
    { key: 'compare', name: '가격비교' },
    { key: 'open', name: '오픈마켓' },
    { key: 'mall', name: '종합몰·홈쇼핑' },
    { key: 'specialty', name: '전문몰' },
  ];

  const malls = [
    { id: 'naver', name: '네이버쇼핑', group: 'compare', cats: ALL, frame: false, url: 'https://search.naver.com/search.naver?ssc=tab.shopping.all&query={q}' },
    { id: 'danawa', name: '다나와', group: 'compare', cats: ALL, frame: true, url: 'https://search.danawa.com/dsearch.php?query={q}' },
    { id: 'enuri', name: '에누리', group: 'compare', cats: ALL, frame: false, url: 'https://price.enuri.com/search?keyword={q}' },

    // 쿠팡: 자동 확인은 늘 차단(403)돼 판별 불가였으나, 사용자 브라우저의 패널에서 "사용 권한이 없습니다" 화면 확인 (2026-09-30)
    { id: 'coupang', name: '쿠팡', group: 'open', cats: ALL, frame: false, url: 'https://www.coupang.com/np/search?q={q}', blocked: true },
    { id: 'gmarket', name: 'G마켓', group: 'open', cats: ALL, frame: false, url: 'https://www.gmarket.co.kr/n/search?keyword={q}', blocked: true },
    { id: 'auction', name: '옥션', group: 'open', cats: ALL, frame: false, url: 'https://www.auction.co.kr/n/search?keyword={q}' },
    { id: '11st', name: '11번가', group: 'open', cats: ALL, frame: true, url: 'https://search.11st.co.kr/pc/total-search?kwd={q}' },

    { id: 'ssg', name: 'SSG닷컴', group: 'mall', cats: ALL, url: 'https://www.ssg.com/search.ssg?target=all&query={q}', blocked: true },
    // 롯데ON: 안드로이드면 태블릿(Mobile 표시 없음)도 휴대폰 주소(platform=m)로 넘긴다 (2026-09-30 실측)
    { id: 'lotteon', name: '롯데ON', group: 'mall', cats: ALL, frame: true,
      url: 'https://www.lotteon.com/csearch/search/search?render=search&platform=pc&q={q}',
      mobileUrl: 'https://www.lotteon.com/csearch/search/search?render=search&platform=m&q={q}',
      mobileWhen: 'iPhone|iPod|iPad|Android' },
    { id: 'gsshop', name: 'GS SHOP', group: 'mall', cats: ALL, frame: true, url: 'https://www.gsshop.com/shop/search/main.gs?tq={q}' },
    { id: 'cjonstyle', name: 'CJ온스타일', group: 'mall', cats: ALL, frame: true, url: 'https://display.cjonstyle.com/p/search/searchAllList?k={q}' },

    { id: 'emart', name: '이마트몰', group: 'specialty', cats: ['food', 'goods'], url: 'https://emart.ssg.com/search.ssg?query={q}', blocked: true },
    { id: 'homeplus', name: '홈플러스', group: 'specialty', cats: ['food', 'goods'], frame: true, url: 'https://front.homeplus.co.kr/search?entry=direct&keyword={q}' },
    { id: 'kurly', name: '마켓컬리', group: 'specialty', cats: ['food', 'goods', 'beauty'], frame: true, url: 'https://www.kurly.com/search?sword={q}' },
    { id: 'oliveyoung', name: '올리브영', group: 'specialty', cats: ['beauty', 'goods'], frame: true, url: 'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query={q}' },
    // 다이소몰: 예전 주소(/ssn/search/Search)는 검색 화면이 아니라 데이터(JSON)였다. 아래는 사이트에서 직접 검색해 얻은 주소.
    // 휴대폰 주소는 사이트가 검색엔진에 알려 주는 공식 검색 주소(SearchAction). "Mobile" 표시가 있어야 휴대폰으로 본다
    // — 갤럭시탭(Mobile 없음)은 PC 주소. 휴대폰에 PC 주소를 주면 새 탭에서도 404 다 (2026-09-30 실측)
    { id: 'daiso', name: '다이소몰', group: 'specialty', cats: ['goods', 'furniture', 'beauty'], frame: true,
      url: 'https://www.daisomall.co.kr/ds/dst/SCR_DST_0015?searchTerm={q}',
      mobileUrl: 'https://m.daisomall.co.kr/main/ds/dsl/SCR_DSL_0015?searchTerm={q}',
      mobileWhen: 'iPhone|iPod|iPad|Mobile' },
    { id: 'ohou', name: '오늘의집', group: 'specialty', cats: ['furniture', 'goods', 'digital'], frame: false, url: 'https://ohou.se/search/index?query={q}', blocked: true },
    { id: 'ikea', name: '이케아', group: 'specialty', cats: ['furniture', 'goods'], frame: false, url: 'https://www.ikea.com/kr/ko/search/?q={q}' },
    { id: 'musinsa', name: '무신사', group: 'specialty', cats: ['fashion', 'beauty'], frame: true, url: 'https://www.musinsa.com/search/goods?keyword={q}' },
    { id: '29cm', name: '29CM', group: 'specialty', cats: ['fashion', 'furniture'], frame: true, url: 'https://www.29cm.co.kr/store/search?keyword={q}' },
    { id: 'wconcept', name: 'W컨셉', group: 'specialty', cats: ['fashion', 'beauty'], frame: true, url: 'https://display.wconcept.co.kr/search?keyword={q}' },
  ];

  // 이 기기(User-Agent)에 맞는 주소 틀. ua 를 안 주면 PC 주소.
  function urlFor(mall, ua) {
    return mall.mobileUrl && ua && new RegExp(mall.mobileWhen, 'i').test(ua) ? mall.mobileUrl : mall.url;
  }

  function searchUrl(mall, query, ua) {
    return urlFor(mall, ua).replace('{q}', encodeURIComponent(String(query).trim()));
  }

  global.Malls = { categories, groups, malls, urlFor, searchUrl };
})(window);
