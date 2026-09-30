/* 앱 아이콘 PNG 를 만든다 (`npm run make:icons`). 이미지 도구 없이 SVG 를 브라우저로 찍는다.
   - icon-192/512      : 일반 아이콘 (둥근 모서리, 바깥은 투명)
   - icon-maskable-512 : 안드로이드 모양 마스크용 (배경을 끝까지 채우고, 그림은 가운데 안전 영역 안에)
   - apple-touch-icon  : iOS 홈 화면용 180px (배경을 끝까지 채운다. 모서리는 iOS 가 둥글린다) */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'icons');
const BLUE = '#0b6bcb';

// 쇼핑백 + 돋보기. 100×100 좌표계, scale 로 안전 영역에 맞춘다.
function glyph(scale) {
  const t = (100 - 100 * scale) / 2;
  return `
  <g transform="translate(${t} ${t}) scale(${scale})" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 34 h44 l-3 44 a4 4 0 0 1 -4 4 h-30 a4 4 0 0 1 -4 -4 z" stroke-width="6" fill="rgba(255,255,255,.14)"/>
    <path d="M33 34 v-6 a11 11 0 0 1 22 0 v6" stroke-width="6"/>
    <circle cx="64" cy="64" r="13" stroke-width="6" fill="${BLUE}"/>
    <path d="M73.5 73.5 L84 84" stroke-width="7"/>
  </g>`;
}

function svg({ rounded, scale }) {
  const bg = rounded
    ? `<rect x="4" y="4" width="92" height="92" rx="22" fill="${BLUE}"/>`
    : `<rect width="100" height="100" fill="${BLUE}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg}${glyph(scale)}</svg>`;
}

const ICONS = [
  { file: 'icon-192.png', size: 192, rounded: true, scale: 0.86 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 0.86 },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.72 }, // 안전 영역: 가운데 지름 80%
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.8 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const icon of ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${icon.size}px;height:${icon.size}px}</style>${svg(icon)}`);
    await page.locator('svg').screenshot({ path: path.join(OUT, icon.file), omitBackground: true });
    console.log('icons/' + icon.file);
  }
  await browser.close();
})();
