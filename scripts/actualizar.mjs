// Robot de Cumbres Cancún: lee el rol en vivo de Tagers (rol.json) con un navegador real
// y genera data.json para la página. No toca goles.json.
import { chromium } from 'playwright';
import fs from 'node:fs';

const COLEGIO = 'Cumbres International School Cancún';
const PAGINA = 'https://tagers.com/torneo-de-la-amistad-puebla/?colegio=cumbres-international-school-cancun#horarios';
const ROL = '/torneo-de-la-amistad-puebla/rol.json';

const DEPORTE = { futbol7: 'Futbol 7', futbol9: 'Futbol 9', futbol11: 'Futbol 11', futbolrapido: 'Futbol rápido' };
const SEDE = { andes: 'Andes', anahuac: 'Anáhuac' };

function puebla(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-06:00`, corto: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` };
}

function categoria(p) {
  const anios = String(p.c).replace(/\s*-\s*/g, '–');
  return `${DEPORTE[p.d] || p.d} ${p.r} ${anios}`;
}

async function leerRol() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(PAGINA, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const txt = await page.evaluate(async (u) => {
      const r = await fetch(u + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    }, ROL);
    return JSON.parse(txt);
  } finally {
    await browser.close();
  }
}

const rol = await leerRol();
const C = rol.colegios;
const yo = C.indexOf(COLEGIO);
if (yo < 0 || !Array.isArray(rol.partidos) || rol.partidos.length < 100) {
  console.error('Rol incompleto o sin el colegio; no se actualiza.');
  process.exit(1);
}
const nombre = (p, lado) => (p[lado] !== null && p[lado] !== undefined && C[p[lado]]) ? C[p[lado]] : (p[lado + 'n'] || p[lado + 'e'] || 'Por definir');

const anterior = fs.existsSync('data.json') ? JSON.parse(fs.readFileSync('data.json', 'utf8')) : null;

const mios = rol.partidos.filter(p => p.a === yo || p.b === yo);
const matches = mios.map(p => {
  const local = p.a === yo;
  let gf = null, ga = null;
  if (p.e === 'Jugado' && /^\s*\d+\s*-\s*\d+\s*$/.test(p.m || '')) {
    const [x, y] = p.m.split('-').map(n => parseInt(n, 10));
    gf = local ? x : y; ga = local ? y : x;
  }
  const m = {
    date: p.f, time: p.h, cat: categoria(p), group: p.g || '',
    rival: nombre(p, local ? 'b' : 'a'), field: p.l || '', venue: SEDE[p.s] || p.s || '',
    gf, ga
  };
  if (p.k && p.k !== 'grupos') m.phase = p.j || p.k;
  return m;
}).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

// Tablas: para cada grupo donde juega Cumbres Cancún, con todos los partidos del grupo.
const leido = puebla(new Date(rol.leido || Date.now())).corto;
const grupos = new Map();
for (const p of mios) {
  if (p.k !== 'grupos' || !p.g) continue;
  grupos.set(`${p.d}|${p.r}|${p.c}|${p.g}`, { d: p.d, r: p.r, c: p.c, g: p.g, cat: categoria(p) });
}
const standings = [];
for (const [k, info] of grupos) {
  const delGrupo = rol.partidos.filter(p => `${p.d}|${p.r}|${p.c}|${p.g}` === k && p.k === 'grupos');
  const t = new Map();
  const fila = (n) => { if (!t.has(n)) t.set(n, { team: n, pj: 0, pts: 0, dg: 0, gf: 0 }); return t.get(n); };
  for (const p of delGrupo) {
    const A = fila(nombre(p, 'a')), B = fila(nombre(p, 'b'));
    if (p.e !== 'Jugado' || !/^\s*\d+\s*-\s*\d+\s*$/.test(p.m || '')) continue;
    const [x, y] = p.m.split('-').map(n => parseInt(n, 10));
    A.pj++; B.pj++; A.gf += x; B.gf += y; A.dg += x - y; B.dg += y - x;
    if (x > y) A.pts += 3; else if (y > x) B.pts += 3; else { A.pts += 1; B.pts += 1; }
  }
  const rows = [...t.values()].sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.team.localeCompare(b.team, 'es'))
    .map(({ team, pj, pts, dg }) => ({ team, pj, pts, dg }));
  standings.push({ cat: info.cat, group: info.g, read: leido, rows });
}
const orden = matches.map(m => m.cat);
standings.sort((a, b) => orden.indexOf(a.cat) - orden.indexOf(b.cat));

const ahora = puebla(new Date()).iso;
const contenido = JSON.stringify({ matches, standings });
const antes = anterior ? JSON.stringify({ matches: anterior.matches, standings: anterior.standings }) : '';
const data = {
  updated: contenido === antes && anterior?.updated ? anterior.updated : ahora,
  checked: ahora,
  source: 'https://tagers.com/torneo-de-la-amistad-puebla/?colegio=cumbres-international-school-cancun#horarios',
  rol_leido: rol.leido || null,
  matches, standings
};
fs.writeFileSync('data.json', JSON.stringify(data, null, 1) + '\n');
console.log(`OK: ${matches.length} partidos, ${matches.filter(m => m.gf !== null).length} con marcador, ${standings.length} tablas. Cambió: ${contenido !== antes}`);
