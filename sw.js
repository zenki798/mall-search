/* 서비스 워커 — 앱 설치 조건을 채우고, 오프라인에서도 화면이 뜨게 한다.
   네트워크 우선: 새 버전을 올리면 다음 실행 때 바로 반영되고, 연결이 없을 때만 캐시를 쓴다.
   쇼핑몰(다른 출처) 요청은 건드리지 않는다. */
const CACHE = 'mallsearch-v2';
const SHELL = [
  './', 'index.html', 'app.js', 'data/malls.js', 'data/frame-status.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      // ?q=… 처럼 주소 뒤가 달라도 같은 화면이므로 검색어를 무시하고 찾는다
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});
