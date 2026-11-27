import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

// Resolve by the importing file as well as the specifier: sharedSnapshot and
// authClient import their siblings as './gateway' and './config'. All browser
// consumers must receive the same HTTP adapter and database descriptor.
function browserFirebaseModules(): Plugin {
  const directory = path.resolve(__dirname, 'src/firebase');
  return {
    name: 'browser-firebase-modules',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null;
      const resolved = path.resolve(path.dirname(importer.split('?')[0]), source);
      for (const name of ['gateway', 'config']) {
        const target = path.join(directory, name);
        if (resolved === target || resolved === `${target}.ts`) {
          return path.join(directory, `${name}.browser.ts`);
        }
      }
      return null;
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [browserFirebaseModules(), react(), tailwindcss()],
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, '.') },
      ],
    },
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          onlyExplicitManualChunks: true,
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
            if (id.includes('node_modules/sonner')) return 'vendor-feedback';
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
