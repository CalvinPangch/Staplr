import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  root: 'src/web',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env['PORT'] ?? 3000}`,
        ws: true,
      },
    },
  },
});
