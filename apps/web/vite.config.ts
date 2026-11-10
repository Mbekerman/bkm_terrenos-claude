import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import versao from './versao.json';

/* o PR e a hora do build, para o selo do ambiente mostrar qual versão está no ar (pedido do Moises, 6/nov/2026).
   Todo PR atualiza o número em apps/web/versao.json. */
const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date()).replace(',', '');

export default defineConfig({
  plugins: [react()],
  define: { __VERSAO__: JSON.stringify({ pr: versao.pr, build: hora }) },
  // a metodologia das camadas por setor mora em tools/setores (fonte única com o protótipo e o banco)
  server: { port: 5173, host: true, fs: { allow: ['.', '../../tools/setores'] } },
});
