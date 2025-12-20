import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Load environment variables from the monorepo root so frontends share .env
export default defineConfig({
  envDir: '../..',
  plugins: [react()],
  server: {
    port: 5173,
  },
});
