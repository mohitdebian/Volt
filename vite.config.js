import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: 'esbuild',
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  clearScreen: false,
});
