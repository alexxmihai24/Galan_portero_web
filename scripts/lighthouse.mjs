// Lighthouse sobre el build de producción (`npm run build && npx astro preview`).
// Correrlo contra `astro dev` da números falsos: sin minificar y con HMR dentro.
//
//   node scripts/lighthouse.mjs [http://localhost:4322] [movil|escritorio]

import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4322';
const perfil = process.argv[3] ?? 'movil';

const rutas = ['/', '/vinos', '/vinos/pedro-ximenez-solera-fundador', '/bodega', '/produccion', '/contacto'];

mkdirSync('capturas/lighthouse', { recursive: true });

// El navegador lo abre Playwright, que ya está instalado, y Lighthouse se
// engancha a su puerto de depuración. Así no hace falta un Chrome del sistema.
const navegador = await chromium.launch({ args: ['--remote-debugging-port=9222'] });

const opciones = {
  port: 9222,
  output: 'html',
  logLevel: 'error',
  formFactor: perfil === 'movil' ? 'mobile' : 'desktop',
  screenEmulation:
    perfil === 'movil'
      ? { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false }
      : { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
  throttling:
    perfil === 'movil'
      ? { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 }
      : { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
};

const nota = (r, c) => Math.round((r.categories[c]?.score ?? 0) * 100);
const filas = [];

for (const ruta of rutas) {
  const r = await lighthouse(base + ruta, opciones);
  if (!r) continue;

  writeFileSync(`capturas/lighthouse/${perfil}${ruta.replace(/\//g, '_') || '_home'}.html`, r.report);

  const lhr = r.lhr;
  filas.push({
    ruta,
    rend: nota(lhr, 'performance'),
    a11y: nota(lhr, 'accessibility'),
    bp: nota(lhr, 'best-practices'),
    seo: nota(lhr, 'seo'),
    lcp: lhr.audits['largest-contentful-paint']?.displayValue ?? '-',
    cls: lhr.audits['cumulative-layout-shift']?.displayValue ?? '-',
    tbt: lhr.audits['total-blocking-time']?.displayValue ?? '-',
    fallos: Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative')
      .map((a) => a.title),
  });
}

await navegador.close();

const p = (s, n) => String(s).padEnd(n);
console.log(`\nLIGHTHOUSE (${perfil}) — build de producción\n`);
console.log(p('ruta', 40), p('rend', 6), p('a11y', 6), p('bp', 6), p('seo', 6), p('LCP', 9), p('CLS', 7), 'TBT');
for (const f of filas) {
  console.log(
    p(f.ruta, 40),
    p(f.rend, 6),
    p(f.a11y, 6),
    p(f.bp, 6),
    p(f.seo, 6),
    p(f.lcp, 9),
    p(f.cls, 7),
    f.tbt,
  );
}

const peor = (k) => Math.min(...filas.map((f) => f[k]));
console.log(
  `\nmínimos: rendimiento ${peor('rend')} · accesibilidad ${peor('a11y')} · buenas prácticas ${peor('bp')} · SEO ${peor('seo')}`,
);

const conFallos = filas.filter((f) => f.fallos.length);
if (conFallos.length) {
  console.log('\nauditorías por debajo de 0.9:');
  for (const f of conFallos) console.log(' ', f.ruta, '→', [...new Set(f.fallos)].join(' | '));
}
console.log('\ninformes completos en capturas/lighthouse/');
