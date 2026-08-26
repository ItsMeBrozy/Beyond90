import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: routes like /matches are client-side (react-router). The data API lives
// at a dedicated /api prefix, proxied to the Express server in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    // listen on all interfaces (IPv4 + IPv6) so tunnels/LAN can reach us
    host: true,
    port: 5173,
    strictPort: true,
    // accept cloudflare tunnel hosts (new random *.trycloudflare.com each run)
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        // 127.0.0.1 avoids IPv6 (::1) resolution issues with "localhost" on Windows
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/api/, ''),
      },
    },
  },
});
