import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Web và API dùng chung origin qua proxy của Vite → cookie phiên HttpOnly SameSite=Lax hoạt động,
// không cần mở CORS cho trình duyệt. Cổng đọc từ .env ở gốc repo.
export default defineConfig(({ mode }) => {
  const env = process.env.ARENA_PROFILE ? process.env : loadEnv(mode, '../..', '');
  const api = `http://localhost:${env.API_PORT || 3100}`;
  // Tên miền công khai (vd. Cloudflare Tunnel) lấy từ WEB_ORIGIN — cùng danh sách API dùng để kiểm tra Origin.
  const allowedHosts = (env.WEB_ORIGIN ?? '')
    .split(',')
    .map((o) => {
      try {
        return new URL(o.trim()).hostname;
      } catch {
        return '';
      }
    })
    .filter((h) => h && h !== 'localhost');
  return {
    plugins: [react()],
    // Profile variables are injected by the launcher. Do not let Vite load the legacy root .env.
    envDir: process.env.ARENA_PROFILE ? '../../config/frontend' : '../..',
    server: {
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      allowedHosts,
      proxy: {
        '/api': { target: api, changeOrigin: false },
        '/socket.io': { target: api, ws: true, changeOrigin: false },
      },
    },
    preview: {
      port: Number(env.WEB_PORT || 5173),
      proxy: {
        '/api': { target: api, changeOrigin: false },
        '/socket.io': { target: api, ws: true, changeOrigin: false },
      },
    },
    build: { sourcemap: true },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
