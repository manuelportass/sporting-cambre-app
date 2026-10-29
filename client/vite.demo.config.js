// Versión de prueba: un único HTML con la app y su servidor ejecutándose en el navegador.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'url';
const shim = n => fileURLToPath(new URL(`./src/demo/shims/${n}.js`, import.meta.url));
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: { 'process.env': JSON.stringify({ SETUP_CODE: '000000', DATA_DIR: '/data' }), __dirname: JSON.stringify('/srv/server/x') },
  resolve: {
    alias: {
      'better-sqlite3': shim('sqlite'), express: shim('express'), multer: shim('multer'), crypto: shim('crypto'),
      fs: shim('fs'), path: shim('path'), 'cookie-parser': shim('empty'),
    },
  },
  build: {
    outDir: 'dist-demo', target: 'es2022', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 10000,
    commonjsOptions: { include: [/server\//, /node_modules/], transformMixedEsModules: true, requireReturnsDefault: 'auto' },
    rollupOptions: { input: fileURLToPath(new URL('./demo.html', import.meta.url)) },
  },
});
