const { test, expect } = require('./helpers/harness');
for (const vp of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
  test('repro own action ' + vp.width, async ({ app, page }) => {
    await page.setViewportSize(vp);
    await app.boot();
    await page.fill('#addIn', 'Sign the DoD page today'); await page.press('#addIn', 'Enter');
    await app.ready();
    const id = await page.locator('[data-open^="mine:"]').first().getAttribute('data-open');
    await app.openItem(id);
    await page.click('#sendBtn');
    console.log(vp.width, 'mine rows after Done:', await page.locator(`[data-open="${id}"]`).count(), await page.getAttribute('#app', 'data-view'));
  });
  test('repro mail ' + vp.width, async ({ app, page }) => {
    await page.setViewportSize(vp);
    await app.boot();
    await app.openItem('a2-anouk');
    await page.click('[data-done]');
    console.log(vp.width, 'mail rows after Done:', await page.locator('[data-open="a2-anouk"]').count(), await page.locator('[data-id="a2-anouk"]').innerText().catch(() => ''));
  });
}
