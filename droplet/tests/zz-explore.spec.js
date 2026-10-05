const { test, expect } = require('./helpers/harness');
for (const vp of [{ width: 1280, height: 860 }, { width: 390, height: 844 }, { width: 1000, height: 700 }]) {
  test('toast overlap ' + vp.width, async ({ app, page }) => {
    await page.setViewportSize(vp);
    await app.boot();
    await page.fill('#addIn', 'Sign the DoD page today'); await page.press('#addIn', 'Enter');
    await app.ready();
    for (const id of ['a2-anouk']) {
      await app.openItem(id);
      await page.evaluate(() => { document.getElementById('toastHost').innerHTML = '<div class="toast"><span>Added under Everything else (due thu 08 oct). A longer message here to wrap</span><button data-undo>Undo</button></div>'; });
      const r = await page.evaluate(() => {
        const out = {};
        for (const sel of ['[data-done]', '#sendBtn', '[data-notimp]', '[data-star]', '[data-chat]']) {
          const el = document.querySelector(sel); if (!el) continue;
          const b = el.getBoundingClientRect();
          const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          out[sel] = [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height), el.contains(hit) ? 'ok' : (hit && (hit.className || hit.tagName))];
        }
        const t = document.querySelector('.toast').getBoundingClientRect();
        out.toast = [Math.round(t.x), Math.round(t.y), Math.round(t.width), Math.round(t.height)];
        return out;
      });
      console.log(vp.width, id, JSON.stringify(r));
    }
  });
}
