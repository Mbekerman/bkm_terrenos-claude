import { Navigate, Route, Routes } from 'react-router-dom';
import { configurado } from './lib/supabase';
import { useSessao } from './lib/sessao';
import { Carregando } from './components/ui';
import Moldura from './components/Moldura';
import Login from './pages/Login';
import SemAcesso from './pages/SemAcesso';
import Setup from './pages/Setup';
import Mapa from './pages/Mapa';
import TerrenosExcluidos from './pages/TerrenosExcluidos';
import FichaPagina from './pages/FichaPagina';
import Funil from './pages/Funil';

// Porte tela a tela (docs/adr/0001): login, mapa, novo terreno, ficha e funil. Os endereços
// seguem os do protótipo; o login aparece no próprio endereço do link e, entrando, a tela abre.
export default function App() {
  const { carregando, session, empresa } = useSessao();
  if (!configurado) return <Setup />;
  if (carregando) return <Carregando />;
  if (!session) return <Login />;
  if (!empresa) return <SemAcesso />;
  return (
    <Routes>
      <Route element={<Moldura />}>
        <Route index element={<Navigate to="/mapa" replace />} />
        <Route path="mapa/*" element={<Mapa />} />
        <Route path="funil/*" element={<Funil />} />
        <Route path="fases/*" element={<Navigate to="/funil" replace />} />
        <Route path="terrenos/novo" element={<Mapa />} />
        <Route path="terrenos/:codigo/*" element={<FichaPagina />} />
        <Route path="configuracoes/excluidos" element={<TerrenosExcluidos />} />
        <Route path="*" element={<Navigate to="/mapa" replace />} />
      </Route>
    </Routes>
  );
}
