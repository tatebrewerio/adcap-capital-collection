// usage: node shot.js out.png [actions json]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0].split('#')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const port = srv.address().port;
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 414, height: 860 }, deviceScaleFactor: 2 });
  const errs = [];
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  pg.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await pg.goto(`http://localhost:${port}/${process.argv[4] || ''}`);
  await pg.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 60000 }).catch(e => errs.push('timeout loading'));
  await pg.waitForTimeout(1500);
  const acts = JSON.parse(process.argv[3] || '[]');
  for (const a of acts) {
    if (a.click) { await pg.mouse.click(a.click[0], a.click[1]); await pg.waitForTimeout(700); }
    if (a.node) {
      const pt = await pg.evaluate(([name, nth]) => { const c = document.getElementById('screen'), k = c.getBoundingClientRect().width / c.width; const hs = UI.hits.hits.filter(h => h.node && h.node.name === name); const h = hs[nth || 0]; return h ? [c.getBoundingClientRect().left + (h.r.x + h.r.w / 2) * k, c.getBoundingClientRect().top + (h.r.y + h.r.h / 2) * k] : null; }, [a.node, a.nth]);
      if (!pt) errs.push('no node ' + a.node); else { await pg.mouse.click(pt[0], pt[1]); await pg.waitForTimeout(700); }
    }
    if (a.wheel) { await pg.mouse.move(a.wheel[0], a.wheel[1]); await pg.mouse.wheel(0, a.wheel[2]); await pg.waitForTimeout(600); }
    if (a.shot) await pg.screenshot({ path: a.shot });
  }
  await pg.screenshot({ path: process.argv[2] });
  console.log(errs.join('\n'));
  await b.close(); srv.close();
});
