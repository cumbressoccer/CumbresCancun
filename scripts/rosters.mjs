// Robot: lee el roster de cada equipo de Cumbres Cancún en zione (goles y tarjetas oficiales)
// y escribe roster.json. Si una página falla, conserva lo anterior de ese equipo.
import { chromium } from 'playwright';
import fs from 'node:fs';

const EQUIPOS = [
  ['DTS430', 703565], ['DTS430', 703592], ['DTS430', 703619], ['DTS430', 703640], ['DTS430', 703661],
  ['DTS431', 703195], ['DTS433', 703339], ['DTS433', 703355],
];

function puebla(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-06:00`;
}

function parse(text) {
  const L = text.split('\n').map(s => s.replace(/ /g, ' ')).map(s => s.trim()).filter(Boolean);
  const iName = L.indexOf('Cumbres International School Cancún');
  if (iName < 0) throw new Error('sin equipo');
  const torneo = L[iName + 1].replace(/\s*2026\s*$/, '').replace('Futbol Rápido', 'Futbol rápido');
  const anios = L[iName + 2].replace(/\s*-\s*/g, '–');
  const cat = `${torneo} ${anios}`;
  const r = L.indexOf('Roster');
  const end = L.findIndex((s, k) => k > r && /^Jugadores:\s*\d+/.test(s));
  if (r < 0 || end < 0) throw new Error('sin roster');
  const hdrIdx = L.findIndex((s, k) => k > r && /^Jugador\b/.test(s));
  const cols = L[hdrIdx].split(/\t+|\s{2,}/).slice(1).map(s => s.trim());
  // Re-split header by known tokens if tabs were lost
  const known = ['GOL', 'PNAL', 'SOUT', 'AGOL', 'T. Azul', 'T. Amarilla', 'T. Roja', 'JJE', 'A%', 'A'];
  let header = cols.length > 2 ? cols : [];
  if (header.length < 3) {
    let rest = L[hdrIdx].replace(/^Jugador\s*/, '');
    header = [];
    while (rest.length) {
      const k = known.find(t => rest.startsWith(t));
      if (!k) break;
      header.push(k); rest = rest.slice(k.length).trim();
    }
  }
  const body = L.slice(hdrIdx + 1, end);
  const players = [];
  for (let k = 0; k + 3 < body.length + 1; k++) {
    if (/^[A-ZÁÉÍÓÚÑ]{1,3}$/.test(body[k]) && body[k + 1] && body[k + 2] && body[k + 3] && /^[\d\s%]+$/.test(body[k + 3])) {
      const nums = body[k + 3].split(/\s+/);
      const v = (name) => { const i = header.indexOf(name); return i >= 0 ? parseInt(nums[i] || '0', 10) || 0 : 0; };
      players.push({
        name: body[k + 1],
        gk: /portero/i.test(body[k + 2]),
        goals: v('GOL') + v('PNAL'),
        yellow: v('T. Amarilla'),
        red: v('T. Roja'),
      });
      k += 3;
    }
  }
  if (!players.length) throw new Error('roster vacío');
  return { cat, players };
}

const anterior = fs.existsSync('roster.json') ? JSON.parse(fs.readFileSync('roster.json', 'utf8')) : { teams: [] };
const porCat = new Map(anterior.teams.map(t => [t.cat, t]));
const browser = await chromium.launch();
let ok = 0;
for (const [dts, e] of EQUIPOS) {
  const page = await browser.newPage();
  try {
    await page.goto(`https://consola.zione.com.mx/info.equipo.asp?dts=${dts}&m=1&e=${e}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const t = parse(await page.evaluate(() => document.body.innerText));
    porCat.set(t.cat, { ...t, zione: `https://consola.zione.com.mx/info.equipo.asp?dts=${dts}&m=1&e=${e}` });
    ok++;
  } catch (err) {
    console.error(`Equipo ${dts}/${e}: ${err.message}`);
  }
  await page.close();
  await new Promise(r => setTimeout(r, 1500));
}
await browser.close();
if (!ok) { console.error('Ningún roster leído; no se cambia roster.json'); process.exit(1); }
const teams = [...porCat.values()];

// Goles por partido automáticos: cuando el total de un jugador sube, la diferencia
// se asigna al último partido ya iniciado de su equipo.
try {
  const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
  const auto = fs.existsSync('goles_auto.json') ? JSON.parse(fs.readFileSync('goles_auto.json', 'utf8')) : { snapshot: null, goals: [] };
  const ahora = puebla(new Date()).slice(0, 16);
  const snap = {};
  for (const t of teams) for (const p of t.players) snap[`${t.cat}|${p.name}`] = p.goals || 0;
  let nuevos = 0;
  if (auto.snapshot) {
    for (const t of teams) {
      const iniciados = data.matches.filter(m => m.cat === t.cat && `${m.date}T${m.time}` <= ahora)
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      const objetivo = iniciados[0];
      if (!objetivo) continue;
      for (const p of t.players) {
        const k = `${t.cat}|${p.name}`;
        const antes = auto.snapshot[k];
        if (antes === undefined) continue;
        const delta = (p.goals || 0) - antes;
        if (delta <= 0) continue;
        const e = auto.goals.find(g => g.date === objetivo.date && g.time === objetivo.time && g.cat === t.cat && g.player === p.name);
        if (e) e.n += delta; else auto.goals.push({ date: objetivo.date, time: objetivo.time, cat: t.cat, player: p.name, n: delta });
        nuevos += delta;
      }
    }
  }
  auto.snapshot = snap;
  fs.writeFileSync('goles_auto.json', JSON.stringify(auto, null, 1) + '\n');
  console.log(`Goles automáticos nuevos: ${nuevos}`);
} catch (e) { console.error('goles_auto:', e.message); }

const nuevo = JSON.stringify(teams);
if (nuevo === JSON.stringify(anterior.teams)) { console.log(`Rosters sin cambios (${ok}/8 leídos)`); process.exit(0); }
fs.writeFileSync('roster.json', JSON.stringify({ updated: puebla(new Date()), source: 'zione (TDLA 2026)', teams }, null, 1) + '\n');
console.log(`Rosters actualizados: ${ok}/8 leídos, ${teams.reduce((s, t) => s + t.players.length, 0)} jugadores`);
