# Bodegas Galán Portero — Web y tienda online

> Web y tienda para una bodega real de Montilla (D.O.P. Montilla-Moriles): catálogo de vinos, cuentas de cliente, pago con tarjeta y panel de administración. En fase de cierre con el cliente antes de sustituir su tienda actual.

**🔗 Vista previa:** https://galan-portero-web1.vercel.app

**Stack:** Astro 7 (páginas estáticas + rutas de servidor) · TypeScript · Supabase (Auth + PostgreSQL con RLS) · Stripe Checkout · Resend · Vercel

## Qué incluye

- Catálogo de vinos con ficha propia para cada uno, y páginas de la bodega, la producción, vinos personalizados y contacto.
- Cesta y pago con **Stripe Checkout**: los datos de la tarjeta nunca pasan por la web.
- **Cuentas de cliente** con Supabase Auth: registro, confirmación por correo, recuperación de contraseña e historial de pedidos.
- **Panel `/admin`** para la bodega: productos, pedidos y clientes.
- **Correos de pedido** a la bodega y al cliente con Resend.

## Decisiones de seguridad

- **El precio lo pone el servidor.** El navegador solo envía referencia y unidades; los precios se leen de la base de datos en el momento de pagar, sin caché.
- **El navegador nunca habla con Supabase ni con Stripe.** Todas las claves son secretos de servidor (`astro:env`).
- **Pago confirmado una sola vez.** El webhook de Stripe y la vuelta del cliente a la web pueden llegar a la vez: la confirmación es idempotente y los correos se envían una única vez.
- **Base de datos cerrada.** Las funciones que crean y confirman pedidos solo las ejecuta el servidor (`revoke` para `anon` y `authenticated`), y con RLS cada cliente ve solo sus pedidos.
- **Checkout protegido** comprobando el origen de la petición, y cabeceras de seguridad (HSTS, CSP, `X-Frame-Options`) en `vercel.json`.
- **Un correo que falla no deshace un pago:** el pedido queda registrado en el panel igualmente.

## Calidad

- `npm test`: pruebas de la lógica de pedidos (precios del servidor, envío gratis desde 100 €, stock, cantidades no válidas y entradas maliciosas).
- Scripts para probar los permisos de Supabase y el webhook contra los servicios reales.
- Auditoría responsive con Playwright (desbordes horizontales y botones demasiado pequeños a varios anchos) y Lighthouse sobre el build de producción.
- CSS dentro del HTML para no bloquear el primer pintado e imágenes optimizadas con `sharp`.

## Ejecutar en local

```sh
npm install
cp .env.example .env   # rellena las claves de Supabase, Stripe (modo prueba) y Resend
npm run dev
```

1. Ejecuta `supabase/schema.sql` en el SQL Editor de tu proyecto de Supabase.
2. Da permisos de administrador a una cuenta con `npm run crear-admin -- correo@ejemplo.es`.
3. Para recibir pagos en local, configura un webhook de Stripe que apunte a `/api/stripe/webhook`.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm test` | Pruebas de la lógica de pedidos |
| `npm run check` | Comprobación de tipos de Astro |
| `npm run probar:supabase` | Comprueba los permisos de la base de datos contra Supabase |
| `npm run probar:webhook` | Prueba el webhook con eventos de Stripe firmados, sin llamar a Stripe |

El fichero `.env` no se sube al repositorio. En Vercel, las mismas variables van en *Settings → Environment Variables*.
