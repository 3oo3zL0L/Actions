// Browser tests for Droplet (Chromium only). No server: files are served at an
// intercepted https://droplet.test origin by tests/helpers/harness.js.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 860 },
    timezoneId: 'Europe/Amsterdam',
    locale: 'en-GB',
    serviceWorkers: 'block'
  },
  projects: [{ name: 'chromium' }]
});
