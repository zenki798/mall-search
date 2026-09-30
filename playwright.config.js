const { defineConfig, devices } = require('@playwright/test');

const PORT = 4178;
const BASE_URL = 'http://localhost:' + PORT;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30 * 1000,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    locale: 'ko-KR',
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
    {
      // 아이패드 같은 가로형 태블릿: PC 처럼 분할 화면이지만 터치 전용이다.
      // 기기 목록의 기본 엔진은 webkit 이지만, CI 에는 chromium 만 설치하므로 화면 크기·터치만 흉내 낸다.
      name: 'tablet-landscape',
      use: { ...devices['iPad Pro 11 landscape'], browserName: 'chromium' },
    },
  ],

  webServer: {
    command: 'node server.js',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
});
