import { useSessao } from '../lib/sessao';
import { supabase } from '../lib/supabase';
import { Logo } from '../components/Moldura';

/** Entrou pelo Google, mas não está na equipe (ou o vínculo não pôde ser lido). */
export default function SemAcesso() {
  const { session, erro, recarregar } = useSessao();
  return (
    <div className="m-auth">
      <div className="m-auth-card">
        <Logo />
        <h1>{erro ? 'Não foi possível abrir' : 'Seu acesso ainda não foi liberado'}</h1>
        <p className="m-auth-txt">
          {erro
            ? <>O sistema não conseguiu ler o seu acesso ({erro}). Tente de novo em instantes.</>
            : <>{session?.user.email} entrou, mas ainda não está na equipe. Peça a um administrador para liberar.</>}
        </p>
        <div className="m-auth-acoes">
          {erro && <button className="m-btn m-btn-cont" onClick={() => recarregar()}>Tentar de novo</button>}
          <button className="m-btn m-btn-cont" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </div>
    </div>
  );
}
