// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://bodegasgalanportero.com',
  integrations: [react()],
  image: {
    // Las fotos vienen del WordPress original, ya descargadas a src/assets.
    responsiveStyles: true,
  },
  build: { inlineStylesheets: 'auto' },
});
