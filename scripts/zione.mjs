// Descubrimiento 2: páginas de equipo de Cumbres Cancún en zione (roster).
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'zcap2'; fs.mkdirSync(OUT, { recursive: true });
const equipos = [
  ['DTS430', 703619], ['DTS430', 703640], ['DTS430', 703565], ['DTS430', 703592], ['DTS430', 703661],
  ['DTS431', 703195], ['DTS433', 703339], ['DTS433', 703355],
];
const browser = await chromium.launch();
for (const [dts, e] of equipos) {
  const page = await browser.newPage();
  const api = [];
  page.on('response', async (r) => {
    const u = r.url(); if (!/consola\.zione/.test(u) || /\.(js|css|png|jpe?g|gif|svg|woff2?)(\?|$)/i.test(u)) return;
    let b = ''; try { b = await r.text(); } catch {}
    api.push({ u, s: r.status(), ct: r.headers()['content-type'] || '', n: b.length, body: /api\//.test(u) ? b.slice(0, 200000) : '' });
  });
  const name = `${dts}_${e}`;
  try {
    await page.goto(`https://consola.zione.com.mx/info.equipo.asp?dts=${dts}&m=1&e=${e}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(5000);
    fs.writeFileSync(`${OUT}/${name}.txt`, await page.evaluate(() => document.body.innerText));
    const links = await page.evaluate(() => [...document.querySelectorAll('a')].map(a => a.textContent.trim().replace(/\s+/g,' ').slice(0,60) + ' => ' + a.href).filter(x => /jugador|plantel|roster|integrantes|equipo/i.test(x)));
    fs.writeFileSync(`${OUT}/${name}.links.txt`, links.join('\n'));
  } catch (err) { fs.writeFileSync(`${OUT}/${name}.err.txt`, String(err)); }
  fs.writeFileSync(`${OUT}/${name}.net.json`, JSON.stringify(api, null, 1));
  await page.close();
}
await browser.close();
