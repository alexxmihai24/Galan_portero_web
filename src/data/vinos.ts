import type { ImageMetadata } from 'astro';

import oloroso from '../assets/botellas/5e-oloroso.jpg';
import cream from '../assets/botellas/5e-cream.jpg';
import paloCortado from '../assets/botellas/5e-palo-cortado.jpg';
import pedroXimenez from '../assets/botellas/5e-pedro-ximenez.jpg';
import amontillado from '../assets/botellas/5e-amontillado.jpg';
import packImg from '../assets/botellas/pack-5-essences.jpg';
import soleraFundador from '../assets/botellas/mv-solera-fundador.jpg';
import cosecha from '../assets/botellas/mv-cosecha.jpg';

/**
 * Datos extraidos del WooCommerce de bodegasgalanportero.com (Store API + paginas
 * de producto, agosto 2026). Los textos de cata son literales de la bodega: no
 * inventar, no reescribir. Los `variaciones[].id` son los variation_id reales de
 * WooCommerce y alimentan el enlace de compra, asi que si cambian alli hay que
 * actualizarlos aqui.
 */

export const TIENDA = 'https://bodegasgalanportero.com';
export const ENVIO_GRATIS_DESDE = 100;

export type Variacion = {
  /** variation_id de WooCommerce */
  id: number;
  /** valor exacto del atributo `cantidad`, tal cual lo espera Woo */
  cantidad: string;
  etiqueta: string;
  formato: string;
  precio: number;
};

export type Vino = {
  slug: string;
  /** product_id de WooCommerce */
  id: number;
  nombre: string;
  /** nombre corto para rejillas y navegacion */
  corto: string;
  gama: '5 Essences' | 'Marqués de la Vega';
  estilo: 'Vino seco' | 'Vino dulce' | 'Vino dulce natural';
  imagen: ImageMetadata;
  /** frase de una linea, para la vitrina */
  gancho: string;
  resumen: string;
  cata: { color: string; aroma: string; boca: string };
  crianza: string;
  variaciones: Variacion[];
};

const CAJA_6 = 'Caja 6 Botellas';
const BOTELLA = 'Una botella';

export const vinos: Vino[] = [
  {
    slug: 'pedro-ximenez-solera-fundador',
    id: 188,
    nombre: 'Pedro Ximénez Marqués de la Vega · Solera Fundador',
    corto: 'Solera Fundador',
    gama: 'Marqués de la Vega',
    estilo: 'Vino dulce natural',
    imagen: soleraFundador,
    gancho: 'La joya de la casa. Solera de más de 30 años.',
    resumen:
      'Uvas de variedad 100% Pedro Ximénez seleccionadas se solean entre 8 y 16 días, una vez alcanzado su nivel óptimo se molturan. Este vino se somete a crianza mediante el proceso de criaderas y soleras, en botas de roble americano. Nuestra solera tiene ya más de 30 años, es la joya de nuestros vinos.',
    cata: {
      color: 'Caoba oscuro, casi azabache. Intenso, con un borde caoba y ribetes verde oliva.',
      aroma:
        'Olor característico de la uva pasificada generosamente. Amplio y a la vez penetrante, con un toque tostado de bayas de otoño.',
      boca: 'Exquisitamente dulce, denso, pastoso, equilibrado y lagrimoso. Se mastica la uva pasa, con matices que recuerdan al café, el higo pasificado, el chocolate, el cacao, el dátil. Suave al paladar pero deja apreciar la acidez del vino, lo que le da «chispa» y no empalaga.',
    },
    crianza: 'Criaderas y soleras en barricas de roble americano. Solera de más de 30 años.',
    variaciones: [
      { id: 321, cantidad: BOTELLA, etiqueta: 'Una botella', formato: 'Botella 50 cl', precio: 17 },
      { id: 322, cantidad: CAJA_6, etiqueta: 'Caja de 6', formato: 'Caja 6 botellas · 50 cl', precio: 102 },
    ],
  },
  {
    slug: 'pedro-ximenez-cosecha',
    id: 180,
    nombre: 'Pedro Ximénez Marqués de la Vega · Cosecha',
    corto: 'Cosecha',
    gama: 'Marqués de la Vega',
    estilo: 'Vino dulce natural',
    imagen: cosecha,
    gancho: 'El PX del año, sin crianza. Directo de la pasera.',
    resumen:
      'Uvas de variedad 100% Pedro Ximénez seleccionadas se solean entre 8 y 16 días, una vez alcanzado su nivel óptimo se molturan. Una vez obtenido el mosto, se alcoholiza a 15º, se estabiliza y se almacena en depósitos de acero inoxidable donde alcanza sus características especiales.',
    cata: {
      color: 'Límpido y brillante, con color ámbar y aspecto denso.',
      aroma: 'Notas aromáticas de pasificación características de la uva Pedro Ximénez asoleada.',
      boca: 'Dulce, suave y aterciopelado en el paladar.',
    },
    crianza:
      'Mosto de uva blanca Pedro Ximénez, madura y pasificada al sol hasta alcanzar una concentración de azúcares próxima a los 25-26º Beaumé. Estabilizado en depósitos de acero inoxidable.',
    variaciones: [
      { id: 325, cantidad: BOTELLA, etiqueta: 'Una botella', formato: 'Botella 75 cl', precio: 11 },
      { id: 327, cantidad: CAJA_6, etiqueta: 'Caja de 6', formato: 'Caja 6 botellas · 75 cl', precio: 66 },
    ],
  },
  {
    slug: 'amontillado-5-essences',
    id: 189,
    nombre: 'Amontillado 5 Essences',
    corto: 'Amontillado',
    gama: '5 Essences',
    estilo: 'Vino seco',
    imagen: amontillado,
    gancho: 'Cinco años bajo velo de flor. Luego, tres más al aire.',
    resumen:
      'Crianza en barricas de roble americano mediante el sistema de criaderas y soleras. Este vino comienza siendo un fino. Debe serlo durante al menos 5 años de crianza biológica bajo velo de flor en botas de roble. Una vez que la flor desaparece llega la fase oxidativa durante otros 3 años como mínimo.',
    cata: {
      color: 'Ámbar a oro viejo.',
      aroma:
        'Aromas muy complejos que recuerdan a frutos secos como la avellana. Con notas a madera, aroma punzante.',
      boca: 'Seco casi abocado, muy elegante, salino y persistente en boca.',
    },
    crianza:
      'Mínimo 5 años de crianza biológica bajo velo de flor, seguidos de al menos 3 años de crianza oxidativa.',
    variaciones: [
      { id: 345, cantidad: BOTELLA, etiqueta: 'Una botella', formato: 'Botella 50 cl', precio: 11.5 },
      { id: 346, cantidad: CAJA_6, etiqueta: 'Caja de 6', formato: 'Caja 6 botellas · 50 cl', precio: 69 },
    ],
  },
  {
    slug: 'palo-cortado-5-essences',
    id: 191,
    nombre: 'Palo Cortado 5 Essences',
    corto: 'Palo Cortado',
    gama: '5 Essences',
    estilo: 'Vino seco',
    imagen: paloCortado,
    gancho: 'Nace fino, la flor no cuaja, y se convierte en una rareza.',
    resumen:
      'Parte de un vino cuyo destino inicial era el de criarse como vino fino pero la flor no llega a formarse correctamente, por lo que pasa directamente a crianza oxidativa. Este es un vino tremendamente particular y único. Es una joya de nuestros vinos generosos.',
    cata: {
      color: 'Ámbar a caoba.',
      aroma: 'Aroma característico con notas que recuerdan al amontillado.',
      boca: 'Al paladar presenta características similares al oloroso.',
    },
    crianza: 'Criaderas y soleras en barricas de roble americano, crianza oxidativa.',
    variaciones: [
      { id: 340, cantidad: BOTELLA, etiqueta: 'Una botella', formato: 'Botella 50 cl', precio: 16.8 },
      { id: 341, cantidad: CAJA_6, etiqueta: 'Caja de 6', formato: 'Caja 6 botellas · 50 cl', precio: 100.8 },
    ],
  },
  {
    slug: 'oloroso-5-essences',
    id: 193,
    nombre: 'Oloroso 5 Essences',
    corto: 'Oloroso',
    gama: '5 Essences',
    estilo: 'Vino seco',
    imagen: oloroso,
    gancho: 'Doce años de solera. Mucho cuerpo, nada de timidez.',
    resumen:
      'Parte de un vino blanco sin envejecimiento sometido al sistema de criaderas y soleras en barricas de roble americano. Solera de más de 12 años.',
    cata: {
      color: 'Límpido y brillante, de color caoba.',
      aroma:
        'Muy aromático con gran intensidad en nariz. Aromas complejos debidos a su larga crianza que recuerdan a la madera de roble y a los frutos secos.',
      boca: 'De gran estructura en boca, cálido aunque no excesivamente, sabroso y potente.',
    },
    crianza: 'Criaderas y soleras en barricas de roble americano. Solera de más de 12 años.',
    variaciones: [
      { id: 335, cantidad: BOTELLA, etiqueta: 'Una botella', formato: 'Botella 50 cl', precio: 11.3 },
      { id: 336, cantidad: CAJA_6, etiqueta: 'Caja de 6', formato: 'Caja 6 botellas · 50 cl', precio: 67.8 },
    ],
  },
  {
    slug: 'cream-5-essences',
    id: 192,
    nombre: 'Cream 5 Essences',
    corto: 'Cream',
    gama: '5 Essences',
    estilo: 'Vino dulce',
    imagen: cream,
    gancho: 'El cabeceo de nuestro Oloroso con nuestro PX.',
    resumen:
      'El Cream es un vino generoso de licor elaborado mediante la mezcla o «cabeceo» de vinos generosos de crianza oxidativa (fundamentalmente olorosos) con un importante aporte de vino dulce natural. La mezcla entre nuestro Oloroso y PX produce unas características organolépticas únicas en este Cream.',
    cata: {
      color: 'Caoba con reflejos color ámbar dorado. Límpido y brillante.',
      aroma:
        'Aroma profundo propio de la crianza oxidativa y punzante, con recuerdo a frutos secos, elegante y sedoso.',
      boca: 'Sabor dulce y levemente amargoso.',
    },
    crianza: 'Cabeceo de oloroso de crianza oxidativa con vino dulce natural Pedro Ximénez.',
    variaciones: [
      { id: 337, cantidad: BOTELLA, etiqueta: 'Una botella', formato: 'Botella 50 cl', precio: 11.3 },
      { id: 338, cantidad: CAJA_6, etiqueta: 'Caja de 6', formato: 'Caja 6 botellas · 50 cl', precio: 67.8 },
    ],
  },
  {
    slug: 'pedro-ximenez-5-essences',
    id: 190,
    nombre: 'Pedro Ximénez 5 Essences',
    corto: 'Pedro Ximénez',
    gama: '5 Essences',
    estilo: 'Vino dulce natural',
    imagen: pedroXimenez,
    gancho: 'Reposado en botas viejas de Oloroso. Se mastica la pasa.',
    resumen:
      'Uvas de variedad 100% Pedro Ximénez seleccionadas se solean entre 8 y 16 días, una vez alcanzado su nivel óptimo se molturan. Éste PX es una selección que ha reposado en antiguas botas de Oloroso. Esto le aporta unos aromas inconfundibles de este tipo de vino que redondea y potencia este Pedro Ximénez tan especial.',
    cata: {
      color: 'Caoba oscuro, intenso.',
      aroma: 'Olor característico de la uva pasificada generosamente.',
      boca: 'Sabor dulce sin llegar a empalagar en exceso. Denso, equilibrado y suave al paladar. Se mastica la uva pasa.',
    },
    crianza:
      'Criaderas y soleras en botas de roble americano. Selección reposada en antiguas botas de Oloroso.',
    variaciones: [
      { id: 343, cantidad: BOTELLA, etiqueta: 'Una botella', formato: 'Botella 50 cl', precio: 12.1 },
      { id: 344, cantidad: CAJA_6, etiqueta: 'Caja de 6', formato: 'Caja 6 botellas · 50 cl', precio: 72.6 },
    ],
  },
];

/** El pack es un producto simple: sin variaciones, se compra tal cual. */
export const pack = {
  slug: 'pack-5-essences',
  id: 328,
  nombre: 'Pack 5 Essences',
  gama: '5 Essences' as const,
  imagen: packImg,
  precio: 63,
  gancho: 'Las cinco esencias en caja horizontal. Se abre y se ven las cinco.',
  resumen:
    'Pack indispensable en tu bodega con la serie 5 Essences presentado en caja horizontal que permite el visionado de las cinco botellas al abrir. Para que degustes la variedad de los vinos generosos con Denominación de Origen Protegida Montilla-Moriles.',
  incluye: ['Oloroso', 'Cream', 'Palo Cortado', 'Pedro Ximénez', 'Amontillado'],
};

export const cincoEssences = vinos.filter((v) => v.gama === '5 Essences');
export const marquesDeLaVega = vinos.filter((v) => v.gama === 'Marqués de la Vega');

export function porSlug(slug: string): Vino | undefined {
  return vinos.find((v) => v.slug === slug);
}

/**
 * Enlace directo al carrito del WooCommerce existente. Verificado contra
 * bodegasgalanportero.com: `cantidad` es un atributo local (no taxonomia), asi
 * que el parametro lleva el nombre del termino, no un slug.
 */
export function enlaceCompra(vino: Vino, variacion: Variacion, unidades = 1): string {
  const p = new URLSearchParams({
    'add-to-cart': String(vino.id),
    variation_id: String(variacion.id),
    attribute_cantidad: variacion.cantidad,
    quantity: String(unidades),
  });
  return `${TIENDA}/?${p}`;
}

export function enlaceCompraPack(unidades = 1): string {
  return `${TIENDA}/?add-to-cart=${pack.id}&quantity=${unidades}`;
}

export function euros(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}
