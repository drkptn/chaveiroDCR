import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base relativo: o mesmo build funciona servido pelo servidor (web) e dentro do app desktop.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('mediasoup-client')) return 'voice';
          if (id.includes('emojibase-data')) return 'emoji-data';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },
});
