import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    passWithNoTests: true,
    // Vitest domyślnie zastępuje pliki CSS pustym tekstem; test palety (src/palette.test.ts) potrzebuje treści style.css.
    css: { include: [/style\.css/] },
  },
});