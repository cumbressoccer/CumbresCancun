// Descubrimiento: abre zione con navegador real y guarda las respuestas de red y el texto.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'zcap'; fs.mkdirSync(OUT, { recursive: true });
const urls = {
  rapido_main: 'https://consola.zione.com.mx/main4.asp?dts=DTS433',
  rapido_equipo: 'https://consola.zione.com.mx/rol.juegos.asp?dts=DTS433&m=3&torID=0&v=2',
  f9_main: 'https://consola.zione.com.mx/main4.asp?dts=DTS431',
  f9_equipo: 'https://consola.zione.com.mx/rol.juegos.asp?dts=DTS431&m=3&torID=0&v=2',
  f7_main: 'https://consola.zione.com.mx/main4.asp?dts=DTS430',
  f7_equipo: 'https://consola.zione.com.mx/rol.juegos.asp?dts=DTS430&m=3&torID=0&v=2',
};
const browser = await chromium.launch();
for (const [name, url] of Object.entries(urls)) {
  const page = await browser.newPage();
  const resp = [];
  page.on('response', async (r) => {
    const u = r.url(); const ct = r.headers()['content-type'] || '';
    if (/\.(png|jpe?g|gif|svg|woff2?|ttf|css)(\?|$)/i.test(u) || /google|facebook|gstatic/.test(u)) return;
    let body = ''; try { body = await r.text(); } catch {}
    resp.push({ u, s: r.status(), ct, n: body.length, body: (ct.includes('json') || body.trim().startsWith('{') || body.trim().startsWith('[')) ? body.slice(0, 300000) : body.slice(0, 1500) });
  });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(6000);
    fs.writeFileSync(`${OUT}/${name}.txt`, await page.evaluate(() => document.body.innerText));
    const links = await page.evaluate(() => [...document.querySelectorAll('a')].map(a => a.textContent.trim().slice(0,60) + ' => ' + a.href).filter(x => /Canc|equipo|roster|jugador|plantel|team/i.test(x)));
    fs.writeFileSync(`${OUT}/${name}.links.txt`, links.join('\n'));
  } catch (e) { fs.writeFileSync(`${OUT}/${name}.err.txt`, String(e)); }
  fs.writeFileSync(`${OUT}/${name}.net.json`, JSON.stringify(resp, null, 1));
  await page.close();
}
await browser.close();
