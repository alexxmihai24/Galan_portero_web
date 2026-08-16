# Bodegas Galán Portero — rediseño

Web nueva para sustituir el WordPress de `bodegasgalanportero.com`.
Cliente: amigo de Alex. Stack: **Astro 5 + React (1 isla) + CSS a mano**.

## Estado

Sitio completo y compilando. 14 páginas, 0 errores de `astro check`.

```bash
npm run dev      # http://localhost:4321
npm run build    # dist/
npm run check    # typecheck
```

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Tienda | **Escaparate.** El botón "Comprar" enlaza al WooCommerce actual, que sigue cobrando. Sin carrito propio. |
| Stack | Astro con islas React puntuales. Sólo `SelectorCantidad.tsx` lo usa; React no se descarga en ninguna otra página. |
| Fotos | Las 26 del WordPress original, ya descargadas a `src/assets/`. Faltan retratos de familia y detalle de uva. |
| Formulario | Compone un `mailto:` a info@bodegasgalanportero.com. Sin backend, funciona hoy. |

## Datos del producto

`src/data/vinos.ts` es la única fuente. Contiene los `product_id` y `variation_id`
**reales** de WooCommerce (verificados contra la web en agosto de 2026). Si allí
cambian los precios o las variaciones, hay que actualizar este fichero.

Sólo existen dos variaciones por vino: `Una botella` y `Caja 6 Botellas`. El
atributo `Cantidad` es local, no taxonomía, así que la URL lleva
`attribute_cantidad=Una+botella` con el **nombre** del término, no un slug.

Verificado end-to-end: el enlace mete el producto y la variación correctos en el
carrito real, con el precio correcto.

## El efecto de la vitrina

`src/components/Vitrina.astro`. Es la técnica de `infolavelada.com` (que es Astro
puro, sin React ni GSAP): un único `div` flotante que viaja hasta la celda
apuntada con `transform` + `cubic-bezier(.16,1,.3,1)` y un keyframe de rebote.
El atenuado de las demás celdas lo hace `:has()` en CSS, así que el JS sólo
mueve el marco. Al pinchar, el panel de la izquierda hace crossfade a la cata.

## Siguiente paso

1. **Enseñárselo al amigo.** `npm run dev` y pasearlo por las 14 páginas.
2. Pedirle fotos nuevas: retrato de la familia, detalle de la uva en la pasera,
   botella servida en mesa. Las actuales cumplen pero no lucen.
3. Deploy a Vercel como preview para que lo vea desde el móvil.
4. Si da el visto bueno: dominio y sustituir el WordPress. Ojo — el WooCommerce
   tiene que seguir vivo, porque es quien cobra.

## Pendiente conocido

- Sin Lighthouse real todavía (sólo auditoría estática: 98 imágenes con `alt`,
  1 `h1` por página, contrastes AA verificados).
- Las páginas legales (privacidad, términos, accesibilidad) enlazan a las del
  WordPress. Si se apaga el WP, hay que traerlas.
- El aviso FEDER/REACT-UE y los logos del Kit Digital están en el pie y son
  obligatorios mientras dure la justificación de la subvención. No quitarlos.
