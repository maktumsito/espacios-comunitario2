import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/@firebase/firestore') || id.includes('node_modules/firebase/firestore')) {
              return 'vendor-firebase-firestore';
            }
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'vendor-firebase-core';
            }
            if (id.includes('node_modules/d3') || id.includes('node_modules/d3-')) {
              return 'vendor-d3';
            }
            if (id.includes('node_modules/jspdf') || id.includes('node_modules/jspdf-autotable')) {
              return 'vendor-pdf';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-lucide';
            }
            if (id.includes('node_modules/date-fns')) {
              return 'vendor-date-fns';
            }
            if (id.includes('node_modules/zod') || id.includes('node_modules/fuse.js') || id.includes('node_modules/@tanstack/react-virtual')) {
              return 'vendor-helpers';
            }
            if (id.includes('src/components/ReservationModal') || id.includes('src/components/ReservationStep')) {
              return 'chunk-reservation-modal';
            }
            if (id.includes('src/components/ReservationDetailModal')) {
              return 'chunk-detail-modal';
            }
            if (id.includes('src/components/GlobalCommandPalette')) {
              return 'chunk-command-palette';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
