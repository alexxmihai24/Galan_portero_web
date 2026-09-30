// Captura de pantalla completa de una ruta a uno o varios anchos.
//   node scripts/captura.mjs /vinos 1440,390 [carpeta] [base]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [ruta = '/', anchos = '1440,390', carpeta = 'capturas/revision', base = 'http://localhost:4321'] = process.argv.slice(2);
mkdirSync(carpeta, { recursive: true });
const nav = await chromium.launch();
for (const w of anchos.split(',').map(Number)) {
  const pagina = await nav.newPage({ viewport: { width: w, height: w > 800 ? 900 : 844 }, reducedMotion: process.env.MOVIMIENTO ? 'no-preference' : 'reduce' });
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));
  pagina.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  await pagina.goto(base + ruta, { waitUntil: 'networkidle' });
  // Recorre la página para disparar cargas diferidas y animaciones de entrada.
  await pagina.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  });
  const nombre = `${carpeta}/${ruta.replace(/[^a-z0-9]+/gi, '_') || '_'}-${w}.png`;
  await pagina.screenshot({ path: nombre, fullPage: true });
  console.log(nombre, errores.length ? `ERRORES: ${errores.join(' | ')}` : 'sin errores');
  await pagina.close();
}
await nav.close();
