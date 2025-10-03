import { defineConfig } from 'vite';

export default defineConfig({
  base: '/aquarium/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
