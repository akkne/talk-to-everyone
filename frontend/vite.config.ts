import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** <summary>One origin for the browser and the WebSocket proxy, including LAN clients.</summary> */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.BACKEND_URL || 'http://127.0.0.1:5000';
  const proxy = { '/hubs': { target, ws: true, changeOrigin: true }, '/api': { target, changeOrigin: true } };
  return { plugins: [react()], server: { port: 5173, strictPort: true, proxy }, preview: { port: 4173, strictPort: true, proxy } };
});
