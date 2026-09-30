// Cesta en el navegador (localStorage). Solo guarda SKU y unidades: nombres, fotos y
// precios llegan de /api/catalogo, y al pagar el servidor lo recalcula todo.
import { costeEnvio, ENVIO_GRATIS_DESDE_CENT, euros, MAX_UNIDADES } from '../lib/pedido.ts';

type Linea = { sku: number; unidades: number };
type Info = {
  sku: number;
  nombre: string;
  formato: string;
  precio_cent: number;
  stock: number | null;
  activo: boolean;
  href: string;
  imagen: string;
  recortada: boolean;
};

const CLAVE = 'gp-cesta';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let catalogo: Map<number, Info> | null = null;
let cargando: Promise<void> | null = null;

function leer(): Linea[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
    return Array.isArray(v)
      ? v.filter((l) => Number.isInteger(l?.sku) && Number.isInteger(l?.unidades) && l.unidades > 0)
      : [];
  } catch {
    return [];
  }
}

function guardar(lineas: Linea[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lineas));
  } catch {
    /* modo privado o almacenamiento lleno: la cesta vive solo en esta página */
  }
  pintar();
}

function cargarCatalogo(): Promise<void> {
  cargando ??= fetch('/api/catalogo')
    .then((r) => (r.ok ? r.json() : []))
    .then((lista: Info[]) => {
      catalogo = new Map(lista.map((i) => [i.sku, i]));
    })
    .catch(() => {
      cargando = null;
    });
  return cargando;
}

function tope(sku: number): number {
  const s = catalogo?.get(sku)?.stock;
  return s == null ? MAX_UNIDADES : Math.min(MAX_UNIDADES, s);
}

export function anadir(sku: number, unidades = 1) {
  const lineas = leer();
  const l = lineas.find((x) => x.sku === sku);
  if (l) l.unidades += unidades;
  else lineas.push({ sku, unidades });
  for (const x of lineas) x.unidades = Math.min(x.unidades, tope(x.sku));
  guardar(lineas.filter((x) => x.unidades > 0));
}

function cambiar(sku: number, delta: number | null) {
  const lineas = leer()
    .map((l) => (l.sku === sku ? { ...l, unidades: delta === null ? 0 : Math.min(l.unidades + delta, tope(sku)) } : l))
    .filter((l) => l.unidades > 0);
  guardar(lineas);
}

function vaciar() {
  guardar([]);
}

// ------------------------------------------------------------------ pintar

function todos<T extends Element>(sel: string) {
  return [...document.querySelectorAll<T>(sel)];
}

function pintar() {
  let lineas = leer();
  const n = lineas.reduce((s, l) => s + l.unidades, 0);
  for (const el of todos('[data-cesta-contador]')) el.textContent = String(n);
  for (const el of todos('[data-cesta-contador-texto]')) {
    el.textContent = n === 0 ? ', vacía' : `, ${n} ${n === 1 ? 'producto' : 'productos'}`;
  }

  if (!catalogo) {
    if (lineas.length) cargarCatalogo().then(pintar);
    for (const el of todos<HTMLElement>('[data-cesta-vacia]')) el.hidden = lineas.length > 0;
    return;
  }

  // Lo que ya no se vende sale de la cesta.
  const validas = lineas.filter((l) => catalogo!.get(l.sku)?.activo);
  if (validas.length !== lineas.length) {
    lineas = validas;
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lineas));
    } catch {}
  }

  const plantilla = document.querySelector<HTMLTemplateElement>('[data-plantilla-linea]');
  let subtotal = 0;
  for (const lista of todos<HTMLElement>('[data-cesta-lineas]')) {
    lista.replaceChildren();
    for (const l of lineas) {
      const info = catalogo.get(l.sku)!;
      if (!plantilla) break;
      const li = plantilla.content.firstElementChild!.cloneNode(true) as HTMLElement;
      li.dataset.sku = String(l.sku);
      for (const a of li.querySelectorAll<HTMLAnchorElement>('[data-href]')) a.href = info.href;
      const img = li.querySelector<HTMLImageElement>('[data-img]')!;
      img.src = info.imagen;
      li.querySelector('.linea__foto')!.classList.toggle('es-recorte', info.recortada);
      li.querySelector('[data-nombre]')!.textContent = info.nombre;
      li.querySelector('[data-formato]')!.textContent = info.formato;
      li.querySelector('[data-importe]')!.textContent = euros(info.precio_cent * l.unidades);
      li.querySelector('[data-unidades]')!.textContent = String(l.unidades);
      li.querySelector('[data-menos]')!.setAttribute('aria-label', `Quitar una unidad de ${info.nombre}`);
      const mas = li.querySelector<HTMLButtonElement>('[data-mas]')!;
      mas.setAttribute('aria-label', `Añadir una unidad de ${info.nombre}`);
      mas.disabled = l.unidades >= tope(l.sku);
      li.querySelector('[data-quitar]')!.setAttribute('aria-label', `Quitar ${info.nombre} de la cesta`);
      lista.append(li);
    }
  }
  for (const l of lineas) subtotal += catalogo.get(l.sku)!.precio_cent * l.unidades;

  const envio = lineas.length ? costeEnvio(subtotal) : 0;
  const texto = (sel: string, t: string) => todos(sel).forEach((el) => (el.textContent = t));
  texto('[data-cesta-subtotal]', euros(subtotal));
  texto('[data-cesta-envio-coste]', envio === 0 ? 'Gratis' : euros(envio));
  texto('[data-cesta-total]', euros(subtotal + envio));
  texto(
    '[data-cesta-falta]',
    subtotal >= ENVIO_GRATIS_DESDE_CENT
      ? '¡Tienes el envío gratis a península!'
      : `Te faltan ${euros(ENVIO_GRATIS_DESDE_CENT - subtotal)} para el envío gratis`,
  );
  for (const b of todos<HTMLElement>('[data-cesta-progreso]')) {
    b.style.setProperty('--progreso', String(Math.min(1, subtotal / ENVIO_GRATIS_DESDE_CENT)));
  }
  for (const el of todos<HTMLElement>('[data-cesta-vacia]')) el.hidden = lineas.length > 0;
  for (const el of todos<HTMLElement>('[data-cesta-llena]')) el.hidden = lineas.length === 0;
}

// ------------------------------------------------------------------ efectos

function volar(origen: HTMLImageElement | null | undefined) {
  const destino = document.querySelector('.boton-cesta');
  const saltar = () => todos('.boton-cesta__n').forEach((c) => {
    c.classList.remove('salta');
    void (c as HTMLElement).offsetWidth;
    c.classList.add('salta');
  });
  if (!origen || !destino || reduce()) return saltar();
  const a = origen.getBoundingClientRect();
  const b = destino.getBoundingClientRect();
  if (!a.width) return saltar();
  const clon = origen.cloneNode() as HTMLImageElement;
  Object.assign(clon.style, {
    position: 'fixed',
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    objectFit: 'contain',
    zIndex: '60',
    pointerEvents: 'none',
  });
  clon.removeAttribute('srcset');
  clon.alt = '';
  document.body.append(clon);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  clon
    .animate(
      [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.55}px, ${dy - 80}px) scale(0.55) rotate(-8deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.12) rotate(-16deg)`, opacity: 0.4 },
      ],
      { duration: 750, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
    )
    .finished.then(() => {
      clon.remove();
      saltar();
    });
}

let temporizador: number | undefined;
function avisar(nombre: string) {
  const aviso = document.querySelector<HTMLElement>('[data-aviso-cesta]');
  if (!aviso) return;
  aviso.querySelector('[data-aviso-nombre]')!.textContent = nombre;
  aviso.hidden = false;
  clearTimeout(temporizador);
  temporizador = window.setTimeout(() => (aviso.hidden = true), 4500);
}

function abrirPanel() {
  document.querySelector<HTMLDialogElement>('[data-menu-movil]')?.close();
  document.querySelector<HTMLElement>('[data-aviso-cesta]')?.setAttribute('hidden', '');
  const d = document.querySelector<HTMLDialogElement>('[data-cesta]');
  if (d && !d.open) d.showModal();
  if (!catalogo) cargarCatalogo().then(pintar);
}

async function pagar(boton: HTMLButtonElement) {
  const errores = todos<HTMLElement>('[data-cesta-error]');
  errores.forEach((e) => (e.hidden = true));
  todos<HTMLButtonElement>('[data-pagar]').forEach((b) => (b.disabled = true));
  const textoOriginal = boton.innerHTML;
  boton.textContent = 'Preparando el pago…';
  try {
    const r = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineas: leer() }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && d.entrar) {
      location.href = d.entrar;
      return;
    }
    if (!r.ok || !d.url) throw new Error(d.error ?? 'No se ha podido iniciar el pago. Inténtalo de nuevo.');
    location.href = d.url;
  } catch (e) {
    errores.forEach((el) => {
      el.textContent = (e as Error).message;
      el.hidden = false;
    });
    todos<HTMLButtonElement>('[data-pagar]').forEach((b) => (b.disabled = false));
    boton.innerHTML = textoOriginal;
  }
}

// ------------------------------------------------------------------ eventos (una sola vez)

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;

  // Clic en el velo del panel = cerrar.
  if (t instanceof HTMLDialogElement && t.matches('[data-cesta]')) return t.close();

  if (t.closest('[data-abrir-cesta]')) return abrirPanel();
  if (t.closest('[data-cerrar-cesta]')) return document.querySelector<HTMLDialogElement>('[data-cesta]')?.close();

  const anadirBtn = t.closest<HTMLElement>('[data-anadir]');
  if (anadirBtn && !anadirBtn.closest('form')) {
    e.preventDefault();
    const varios = anadirBtn.dataset.anadirVarios;
    if (varios) {
      for (const l of JSON.parse(varios) as Linea[]) anadir(l.sku, l.unidades);
    } else {
      anadir(Number(anadirBtn.dataset.sku), Number(anadirBtn.dataset.unidades ?? 1));
    }
    volar(anadirBtn.closest('[data-producto]')?.querySelector<HTMLImageElement>('img'));
    avisar(anadirBtn.dataset.nombre ?? 'Producto');
    return;
  }

  const linea = t.closest<HTMLElement>('[data-linea]');
  if (linea) {
    const sku = Number(linea.dataset.sku);
    if (t.closest('[data-mas]')) cambiar(sku, 1);
    else if (t.closest('[data-menos]')) cambiar(sku, -1);
    else if (t.closest('[data-quitar]')) cambiar(sku, null);
    return;
  }

  const pagarBtn = t.closest<HTMLButtonElement>('[data-pagar]');
  if (pagarBtn) pagar(pagarBtn);
});

// Formulario de compra de la ficha: formato (radio `sku`) + unidades.
document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  if (!form.matches('[data-form-compra]')) return;
  e.preventDefault();
  const datos = new FormData(form);
  const sku = Number(datos.get('sku'));
  const unidades = Math.max(1, Math.min(MAX_UNIDADES, Number(datos.get('unidades')) || 1));
  anadir(sku, unidades);
  volar(form.closest('[data-producto]')?.querySelector<HTMLImageElement>('img'));
  avisar(form.dataset.nombre ?? 'Producto');
});

// Otra pestaña cambió la cesta.
window.addEventListener('storage', (e) => e.key === CLAVE && pintar());

document.addEventListener('astro:page-load', () => {
  const params = new URLSearchParams(location.search);
  // Vuelta de Stripe con el pago hecho: la cesta ya es un pedido.
  if (params.get('pagado') === '1' && location.pathname.startsWith('/cuenta/pedidos/')) {
    vaciar();
    // Sin el parámetro, volver a esta página más tarde no vacía la cesta otra vez.
    history.replaceState(history.state, '', location.pathname);
  }
  if (catalogo || leer().length) cargarCatalogo().then(pintar);
  pintar();
});
