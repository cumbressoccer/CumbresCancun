// Abre la vista de Tagers con un navegador real y guarda lo que la página carga.
// Fase de descubrimiento: guarda las respuestas JSON de la red y el texto visible.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'captures';
fs.mkdirSync(OUT, { recursive: true });
const days = ['2026-11-16', '2026-11-17'];
const browser = await chromium.launch();
const log = [];

for (const dia of days) {
  const page = await browser.newPage();
  const responses = [];
  page.on('response', async (res) => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (/googletagmanager|google-analytics|doubleclick|facebook|fonts\./.test(url)) return;
    if (ct.includes('json') || /\.json(\?|$)|api|wp-json|ajax|data/i.test(url)) {
      let body = '';
      try { body = await res.text(); } catch (e) { body = 'ERR ' + e.message; }
      responses.push({ url, status: res.status(), ct, size: body.length, body: body.slice(0, 400000) });
    } else {
      log.push(`${dia} ${res.status()} ${ct.split(';')[0]} ${url}`);
    }
  });
  const url = `https://tagers.com/torneo-de-la-amistad-puebla/?colegio=cumbres-international-school-cancun&dia=${dia}#horarios`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(5000);
  const text = await page.evaluate(() => {
    const el = document.querySelector('#horarios') || document.body;
    return el.innerText;
  });
  fs.writeFileSync(`${OUT}/texto-${dia}.txt`, text);
  fs.writeFileSync(`${OUT}/red-${dia}.json`, JSON.stringify(responses, null, 1));
  const html = await page.evaluate(() => (document.querySelector('#horarios') || document.body).outerHTML);
  fs.writeFileSync(`${OUT}/html-${dia}.html`, html.slice(0, 600000));
  await page.close();
}
fs.writeFileSync(`${OUT}/otras-peticiones.txt`, log.join('\n'));
await browser.close();
console.log('ok');
