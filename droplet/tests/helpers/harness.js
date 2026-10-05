/* Serves droplet/ at https://droplet.test inside a minimal artifact-like
   skeleton, installs the runtime stub, fixes the clock, and fails a test on
   any console error, page error or request outside the stub and Google Fonts. */
const fs = require('fs');
const path = require('path');
const base = require('@playwright/test');
const { installDropletStub } = require('./stub');
const { baseConfig } = require('./fixtures');

const ROOT = path.resolve(__dirname, '..', '..');
const ORIGIN = 'https://droplet.test';
const NOW = new Date('2026-10-02T10:00:00+02:00'); // Fri 2 Oct 2026 10:00 Europe/Amsterdam
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };

function wrapper() {
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + page + '</body></html>';
}

const test = base.test.extend({
  app: async ({ page }, use) => {
    const errors = [], external = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === ORIGIN) {
        if (url.pathname === '/' || url.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html', body: wrapper() });
        if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
        const file = path.join(ROOT, path.normalize(url.pathname).replace(/^([/\\])+/, ''));
        if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile()) {
          return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
        }
        return route.fulfill({ status: 404, body: 'not found' });
      }
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (url.hostname === 'fonts.gstatic.com') return route.fulfill({ status: 204, body: '' });
      external.push(url.href);
      return route.abort();
    });
    await page.clock.setFixedTime(NOW);

    const app = {
      page, errors, external,
      async boot(over = {}, opts = {}) {
        await page.addInitScript(installDropletStub, baseConfig(over));
        await page.goto(ORIGIN + '/');
        if (opts.wait !== false) await app.ready();
      },
      async ready() {
        await page.waitForFunction(() => window.Droplet && window.Droplet.state && window.Droplet.state.loaded && !window.Droplet.state.ranking && !window.Droplet.state.loading && !window.Droplet.state.scanning);
      },
      calls: (kind) => page.evaluate((k) => window.__calls.filter((c) => !k || c.kind === k), kind),
      mcpTools: () => page.evaluate(() => window.__calls.filter((c) => c.kind === 'mcp').map((c) => c.tool)),
      writeTools: () => page.evaluate(() => window.__calls.filter((c) => c.kind === 'mcp' && /create|send|update|delete|forward|addComment/i.test(c.tool)).map((c) => c.tool)),
      db: () => page.evaluate(() => window.__db()),
      focusIds: () => page.$$eval('#focus .fi', (els) => els.map((e) => e.getAttribute('data-id'))),
      async openItem(id) { await page.click(`[data-open="${id}"]`); await page.waitForSelector('#ivTitle'); },
      async openRest() { if ((await page.getAttribute('#restToggle', 'aria-expanded')) !== 'true') await page.click('#restToggle'); }
    };
    await use(app);
    base.expect(errors, 'console errors').toEqual([]);
    base.expect(external, 'requests outside the stub and Google Fonts').toEqual([]);
  }
});

module.exports = { test, expect: base.expect, NOW };
