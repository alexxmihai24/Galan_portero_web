// Comportamiento común a todas las páginas. Los listeners de `document` se registran
// una vez; lo que depende del DOM de cada página se monta en `astro:page-load`.

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- menú del móvil -------------------------------------------------------------
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-abrir-menu]')) document.querySelector<HTMLDialogElement>('[data-menu-movil]')?.showModal();
  else if (t.closest('[data-cerrar-menu]')) document.querySelector<HTMLDialogElement>('[data-menu-movil]')?.close();
});

// --- revelados: reserva para navegadores sin animation-timeline -------------------
function revelados() {
  if (CSS.supports('animation-timeline', 'view()')) return;
  // ClientRouter copia los atributos de <html> de la página nueva: se vuelve a marcar.
  document.documentElement.classList.add('sin-timeline');
  const io = new IntersectionObserver(
    (entradas) => {
      for (const en of entradas) {
        if (!en.isIntersecting) continue;
        en.target.classList.add('visible');
        io.unobserve(en.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  );
  document.querySelectorAll('.revela:not(.visible)').forEach((el) => io.observe(el));
}

// --- cifras que cuentan al aparecer (el HTML ya trae el número final) ---------------
function contadores() {
  if (reduce()) return;
  const io = new IntersectionObserver(
    (entradas) => {
      for (const en of entradas) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        const el = en.target as HTMLElement;
        const final = Number(el.dataset.cuenta);
        const prefijo = el.dataset.prefijo ?? '';
        const t0 = performance.now();
        const paso = (t: number) => {
          const p = Math.min(1, (t - t0) / 1400);
          const suave = 1 - Math.pow(1 - p, 3);
          el.textContent = prefijo + Math.round(final * suave);
          if (p < 1) requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
      }
    },
    { threshold: 0.6 },
  );
  document.querySelectorAll('[data-cuenta]').forEach((el) => io.observe(el));
}

// --- carruseles con flechas (scroll-snap nativo) ----------------------------------
document.addEventListener('click', (e) => {
  const boton = (e.target as HTMLElement).closest<HTMLElement>('[data-anterior], [data-siguiente]');
  const caja = boton?.closest('[data-carrusel]');
  const pista = caja?.querySelector<HTMLElement>('[data-pista]');
  if (!boton || !pista) return;
  const item = pista.firstElementChild as HTMLElement | null;
  const paso = (item?.offsetWidth ?? pista.clientWidth * 0.8) + 24;
  pista.scrollBy({ left: boton.hasAttribute('data-anterior') ? -paso : paso, behavior: reduce() ? 'auto' : 'smooth' });
});

document.addEventListener('astro:page-load', () => {
  revelados();
  contadores();
});
