import { chromium } from 'playwright';
import fs from 'node:fs';
fs.mkdirSync('zcap3', { recursive: true });
const b = await chromium.launch(); const page = await b.newPage();
await page.goto('https://consola.zione.com.mx/info.equipo.asp?dts=DTS431&m=1&e=703195', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(3000);
const links = await page.evaluate(() => [...document.querySelectorAll('a,[onclick],[data-href]')].map(a => (a.textContent||'').trim().replace(/\s+/g,' ').slice(0,80) + ' => ' + (a.href || a.getAttribute('onclick') || a.getAttribute('data-href'))));
fs.writeFileSync('zcap3/links.txt', links.join('\n'));
const html = await page.content(); fs.writeFileSync('zcap3/equipo.html', html);
// Try clicking first recent result
const cand = links.map(l => l.split(' => ')[1]).filter(u => u && /partido|juego|match|cedula|info\.juego|game/i.test(u));
fs.writeFileSync('zcap3/cand.txt', cand.join('\n'));
let i = 0;
for (const u of [...new Set(cand)].slice(0, 4)) {
  try { const p2 = await b.newPage(); const net=[]; p2.on('response', async r=>{ if(/api\//.test(r.url())){ let t=''; try{t=await r.text()}catch{}; net.push({u:r.url(), body:t.slice(0,100000)});}});
    await p2.goto(u.startsWith('http') ? u : 'https://consola.zione.com.mx/' + u.replace(/^\//,''), { waitUntil: 'networkidle', timeout: 60000 }); await p2.waitForTimeout(3000);
    fs.writeFileSync(`zcap3/detalle${i}.txt`, u + '\n\n' + await p2.evaluate(() => document.body.innerText));
    fs.writeFileSync(`zcap3/detalle${i}.net.json`, JSON.stringify(net,null,1)); await p2.close(); i++; } catch (e) { fs.writeFileSync(`zcap3/err${i++}.txt`, u + ' ' + e); }
}
await b.close();
