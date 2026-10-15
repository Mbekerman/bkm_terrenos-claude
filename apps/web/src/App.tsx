import { Navigate, Route, Routes } from 'react-router-dom';
import { configurado } from './lib/supabase';
import { useSessao } from './lib/sessao';
import { Carregando } from './components/ui';
import Shell from './components/Shell';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Setup from './pages/Setup';
import Inicio from './pages/Inicio';
import Terrenos from './pages/Terrenos';
import Negociacoes from './pages/Negociacoes';
import Documentos from './pages/Documentos';
import TerrenoPage from './pages/terreno/TerrenoPage';

export default function App() {
  const { carregando, session, empresa } = useSessao();
  if (!configurado) return <Setup />;
  if (carregando) return <Carregando />;
  if (!session) return <Login />;
  if (!empresa) return <Onboarding />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Inicio />} />
        <Route path="terrenos" element={<Terrenos />} />
        <Route path="terrenos/:id" element={<TerrenoPage />} />
        <Route path="terrenos/:id/:aba" element={<TerrenoPage />} />
        <Route path="negociacoes" element={<Negociacoes />} />
        <Route path="documentos" element={<Documentos />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
