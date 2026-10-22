import { defineConfig } from 'vite';

// Tauri 期望 dev server 固定端口，strictPort 避免端口漂移
export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
