/* 쇼핑몰 검색 주소 목록.
   {q} 자리에 검색어가 encodeURIComponent 로 들어간다.
   주소를 추가·수정하면 `npm run check:links` 로 실제로 열리는지 확인한다 (AGENTS.md 3항).

   blocked: true — 자동 브라우저를 차단(403)해서 check:links 로 확인할 수 없는 곳. 직접 눌러 확인한다.
   frame        — 이 페이지 안(iframe)에 표시되는가. 2026-09-30 실측 (AGENTS.md 3항 "페이지 안에서 넘겨보기")
     true  : 표시된다 → 넘겨보기 패널 안에 띄운다
     false : 쇼핑몰이 X-Frame-Options / frame-ancestors 로 거부한다 → 새 창으로 연다
     없음  : 판별하지 못했다(자동 접속 차단) → 패널에 띄워 보고, 안 되면 "새 창" 을 누르라고 안내한다 */
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

    { id: 'coupang', name: '쿠팡', group: 'open', cats: ALL, url: 'https://www.coupang.com/np/search?q={q}', blocked: true },
    { id: 'gmarket', name: 'G마켓', group: 'open', cats: ALL, frame: false, url: 'https://www.gmarket.co.kr/n/search?keyword={q}', blocked: true },
    { id: 'auction', name: '옥션', group: 'open', cats: ALL, frame: false, url: 'https://www.auction.co.kr/n/search?keyword={q}' },
    { id: '11st', name: '11번가', group: 'open', cats: ALL, frame: true, url: 'https://search.11st.co.kr/pc/total-search?kwd={q}' },

    { id: 'ssg', name: 'SSG닷컴', group: 'mall', cats: ALL, url: 'https://www.ssg.com/search.ssg?target=all&query={q}', blocked: true },
    { id: 'lotteon', name: '롯데ON', group: 'mall', cats: ALL, frame: true, url: 'https://www.lotteon.com/csearch/search/search?render=search&platform=pc&q={q}' },
    { id: 'gsshop', name: 'GS SHOP', group: 'mall', cats: ALL, frame: true, url: 'https://www.gsshop.com/shop/search/main.gs?tq={q}' },
    { id: 'cjonstyle', name: 'CJ온스타일', group: 'mall', cats: ALL, frame: true, url: 'https://display.cjonstyle.com/p/search/searchAllList?k={q}' },

    { id: 'emart', name: '이마트몰', group: 'specialty', cats: ['food', 'goods'], url: 'https://emart.ssg.com/search.ssg?query={q}', blocked: true },
    { id: 'homeplus', name: '홈플러스', group: 'specialty', cats: ['food', 'goods'], frame: true, url: 'https://front.homeplus.co.kr/search?entry=direct&keyword={q}' },
    { id: 'kurly', name: '마켓컬리', group: 'specialty', cats: ['food', 'goods', 'beauty'], frame: true, url: 'https://www.kurly.com/search?sword={q}' },
    { id: 'oliveyoung', name: '올리브영', group: 'specialty', cats: ['beauty', 'goods'], frame: true, url: 'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query={q}' },
    { id: 'daiso', name: '다이소몰', group: 'specialty', cats: ['goods', 'furniture', 'beauty'], frame: true, url: 'https://www.daisomall.co.kr/ssn/search/Search?searchTerm={q}' },
    { id: 'ohou', name: '오늘의집', group: 'specialty', cats: ['furniture', 'goods', 'digital'], frame: false, url: 'https://ohou.se/search/index?query={q}', blocked: true },
    { id: 'ikea', name: '이케아', group: 'specialty', cats: ['furniture', 'goods'], frame: false, url: 'https://www.ikea.com/kr/ko/search/?q={q}' },
    { id: 'musinsa', name: '무신사', group: 'specialty', cats: ['fashion', 'beauty'], frame: true, url: 'https://www.musinsa.com/search/goods?keyword={q}' },
    { id: '29cm', name: '29CM', group: 'specialty', cats: ['fashion', 'furniture'], frame: true, url: 'https://www.29cm.co.kr/store/search?keyword={q}' },
    { id: 'wconcept', name: 'W컨셉', group: 'specialty', cats: ['fashion', 'beauty'], frame: true, url: 'https://display.wconcept.co.kr/search?keyword={q}' },
  ];

  function searchUrl(mall, query) {
    return mall.url.replace('{q}', encodeURIComponent(String(query).trim()));
  }

  global.Malls = { categories, groups, malls, searchUrl };
})(window);
