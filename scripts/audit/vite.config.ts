import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({
  envDir: path.resolve('work/audit-tools/empty-env'),
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 8788, strictPort: true, hmr: false, watch: null,
    proxy: { '/api': 'http://127.0.0.1:3000' } },
});
