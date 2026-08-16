// Auditoría responsive real: carga cada ruta en Chromium a varios anchos,
// busca desbordes horizontales y objetivos táctiles pequeños, y guarda capturas.
//
//   node scripts/auditar-responsive.mjs [http://localhost:4321]
//
// El `overflow-x: hidden` del body esconde los desbordes a la vista, así que se
// miden con getBoundingClientRect() en vez de con scrollWidth.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4321';

const rutas = [
  '/',
  '/vinos',
  '/vinos/pedro-ximenez-solera-fundador',
  '/bodega',
  '/produccion',
  '/personalizados',
  '/contacto',
  '/404',
];

const anchos = [
  { w: 320, h: 700, nombre: '320-movil-min' },
  { w: 360, h: 800, nombre: '360-movil' },
  { w: 414, h: 896, nombre: '414-movil-grande' },
  { w: 768, h: 1024, nombre: '768-tablet' },
  { w: 1024, h: 768, nombre: '1024-tablet-h' },
  { w: 1440, h: 900, nombre: '1440-escritorio' },
];

const TOLERANCIA = 1; // px, por redondeos subpíxel
const MIN_TACTIL = 24; // WCAG 2.2 AA (2.5.8) = 24x24 CSS px

mkdirSync('capturas', { recursive: true });

const navegador = await chromium.launch();
const fallos = [];

for (const { w, h, nombre } of anchos) {
  const ctx = await navegador.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce', // capturas estables
  });
  const pagina = await ctx.newPage();

  for (const ruta of rutas) {
    const res = await pagina.goto(base + ruta, { waitUntil: 'networkidle' });
    // /404 debe responder 404: es lo correcto, no un fallo.
    const esperado = ruta === '/404' ? 404 : 200;
    if (res?.status() !== esperado) {
      fallos.push({ ruta, ancho: w, tipo: 'http', detalle: `${res?.status()} (esperado ${esperado})` });
      continue;
    }

    const informe = await pagina.evaluate(
      ({ tol, minTactil }) => {
        const vw = document.documentElement.clientWidth;
        const desbordes = [];
        const tactiles = [];

        const nombrar = (el) => {
          const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
          return el.tagName.toLowerCase() + (el.id ? '#' + el.id : cls ? '.' + cls : '');
        };

        for (const el of document.body.querySelectorAll('*')) {
          const est = getComputedStyle(el);
          if (est.display === 'none' || est.visibility === 'hidden') continue;

          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;

          // Desborde: se sale por la derecha o por la izquierda del viewport.
          // Se ignora lo que esté dentro de un contenedor con scroll propio y
          // lo posicionado fuera a propósito (menú cerrado, decoración).
          const recortado = el.closest('[data-scroll-x]');
          if (!recortado && est.position !== 'fixed') {
            if (r.right > vw + tol || r.left < -tol) {
              desbordes.push({
                el: nombrar(el),
                left: Math.round(r.left),
                right: Math.round(r.right),
                vw,
              });
            }
          }

          // Objetivos táctiles: enlaces y botones visibles
          if (/^(a|button)$/i.test(el.tagName) && el.offsetParent !== null) {
            // Se redondea antes de comparar: un 23.99 subpíxel pinta 24 px reales.
            if (Math.round(r.width) < minTactil || Math.round(r.height) < minTactil) {
              tactiles.push({
                el: nombrar(el),
                txt: (el.textContent || '').trim().slice(0, 28),
                w: Math.round(r.width),
                h: Math.round(r.height),
              });
            }
          }
        }

        return {
          desbordes,
          tactiles,
          scrollW: document.documentElement.scrollWidth,
          vw,
        };
      },
      { tol: TOLERANCIA, minTactil: MIN_TACTIL },
    );

    // Sólo se reporta el ancestro de cada cadena de desbordes: si un padre se
    // sale, sus hijos también, y listarlos todos es ruido.
    const raices = informe.desbordes.filter(
      (d, _i, arr) => !arr.some((o) => o !== d && o.left <= d.left && o.right >= d.right && o.el !== d.el),
    );

    if (raices.length) fallos.push({ ruta, ancho: w, tipo: 'desborde', detalle: raices.slice(0, 6) });
    if (informe.tactiles.length)
      fallos.push({ ruta, ancho: w, tipo: 'tactil', detalle: informe.tactiles.slice(0, 6) });

    const archivo = `capturas/${nombre}${ruta.replace(/\//g, '_') || '_home'}.png`;
    await pagina.screenshot({ path: archivo, fullPage: ruta === '/' });
  }

  await ctx.close();
}

await navegador.close();

if (!fallos.length) {
  console.log('OK — sin desbordes horizontales ni objetivos táctiles pequeños en');
  console.log(`     ${rutas.length} rutas x ${anchos.length} anchos (${rutas.length * anchos.length} vistas).`);
} else {
  for (const f of fallos) {
    console.log(`\n[${f.tipo}] ${f.ruta} @ ${f.ancho}px`);
    for (const d of [].concat(f.detalle)) console.log('   ', JSON.stringify(d));
  }
  console.log(`\n${fallos.length} incidencias.`);
  process.exitCode = 1;
}
