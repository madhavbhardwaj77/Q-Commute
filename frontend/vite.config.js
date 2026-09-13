import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://127.0.0.1:8080',
      '/locations': 'http://127.0.0.1:8080',
      '/route': 'http://127.0.0.1:8080',
      '/traffic': 'http://127.0.0.1:8080',
      '/network': 'http://127.0.0.1:8080',
      '/benchmark': 'http://127.0.0.1:8080',
      '/history': 'http://127.0.0.1:8080',
      '/analytics': 'http://127.0.0.1:8080',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});