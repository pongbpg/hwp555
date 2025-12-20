import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use monorepo root .env so HR and Stock share env centrally
export default defineConfig({
  envDir: '../..',
  plugins: [react()],
  server: {
    port: 3000,
  },
  optimizeDeps: {
    entries: ['index.html'],
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
});