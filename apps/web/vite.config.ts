import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // a metodologia das camadas por setor mora em tools/setores (fonte única com o protótipo e o banco)
  server: { port: 5173, host: true, fs: { allow: ['.', '../../tools/setores'] } },
});
