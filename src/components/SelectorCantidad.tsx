import { useState } from 'react';
import type { Variacion } from '../data/vinos';
import '../styles/selector.css';

/**
 * Única isla React de la web. Se gana el sitio porque el precio, el formato y la
 * URL de compra cambian a la vez al elegir variación.
 *
 * No hay carrito propio: el botón lleva al WooCommerce que ya existe, que es
 * quien cobra. `enlace` llega precalculado desde el servidor para no duplicar
 * aquí la forma de la URL.
 */

type Opcion = Variacion & { enlace: string };

interface Props {
  opciones: Opcion[];
  nombre: string;
}

const euros = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

export default function SelectorCantidad({ opciones, nombre }: Props) {
  const [elegida, setElegida] = useState(opciones[0]!);
  const [unidades, setUnidades] = useState(1);

  const total = elegida.precio * unidades;
  const enlace = `${elegida.enlace.replace(/quantity=\d+/, `quantity=${unidades}`)}`;

  return (
    <div className="selector">
      <fieldset className="selector__grupo">
        <legend className="sello sello--tenue">Formato</legend>
        <div className="selector__opciones">
          {opciones.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`selector__opcion${o.id === elegida.id ? ' es-elegida' : ''}`}
              aria-pressed={o.id === elegida.id}
              onClick={() => setElegida(o)}
            >
              <span className="selector__etiqueta">{o.etiqueta}</span>
              <span className="selector__formato">{o.formato}</span>
              <span className="selector__precio">{euros(o.precio)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="selector__pie">
        <div className="contador">
          <span className="sello sello--tenue" id="etiqueta-unidades">
            Unidades
          </span>
          <div className="contador__mandos">
            <button
              type="button"
              onClick={() => setUnidades((u) => Math.max(1, u - 1))}
              disabled={unidades <= 1}
              aria-label="Quitar una unidad"
            >
              &minus;
            </button>
            <output aria-labelledby="etiqueta-unidades">{unidades}</output>
            <button
              type="button"
              onClick={() => setUnidades((u) => Math.min(24, u + 1))}
              disabled={unidades >= 24}
              aria-label="Añadir una unidad"
            >
              +
            </button>
          </div>
        </div>

        <p className="selector__total">
          <span className="sello sello--tenue">Total</span>
          <strong>{euros(total)}</strong>
        </p>
      </div>

      <a className="boton boton--solido selector__comprar" href={enlace} rel="noopener">
        Añadir al carrito
        <span className="boton__flecha" aria-hidden="true">
          &rarr;
        </span>
      </a>

      <p className="selector__nota">
        Te lleva al carrito seguro de bodegasgalanportero.com con {nombre} &mdash; {elegida.formato} ya
        añadido.
      </p>
    </div>
  );
}
