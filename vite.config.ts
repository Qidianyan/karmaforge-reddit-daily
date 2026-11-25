import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, 'src/client'),
  publicDir: path.resolve(__dirname, 'public'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4173',
        changeOrigin: true,
      },
    },
  },
});
