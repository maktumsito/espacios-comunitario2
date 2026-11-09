import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
    // Los paquetes de entrega contienen copias de pruebas, no suites ejecutables.
    exclude: ['**/node_modules/**', '**/dist/**', '**/work/**', '**/outputs/**', 'scripts/audit/**'],
    maxWorkers: 2,
  },
});
