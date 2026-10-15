import { useState, type FormEvent } from 'react';
import { useSessao } from '../lib/sessao';
import { mensagemErro, supabase } from '../lib/supabase';
import { Marca } from '../components/ui';

/** Primeiro acesso: o usuário ainda não pertence a nenhuma empresa. */
export default function Onboarding() {
  const { session, recarregar } = useSessao();
  const [empresa, setEmpresa] = useState('BKM');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true); setErro('');
    const { error } = await supabase.rpc('criar_empresa', { p_nome: empresa, p_meu_nome: nome });
    setOcupado(false);
    if (error) { setErro(mensagemErro(error)); return; }
    await recarregar();
  }

  return (
    <div className="auth-wrap">
      <div className="auth">
        <div className="brand"><Marca /><span className="brand-sep" /><span className="brand-prod">Terrenos</span></div>
        <h1>Configurar empresa</h1>
        <p className="muted" style={{ margin: 0 }}>
          {session?.user.email} ainda não faz parte de nenhuma empresa. Se alguém já usa o sistema, peça para um gestor
          adicionar você. Para começar do zero, crie a empresa: você entra como gestor.
        </p>
        <form onSubmit={enviar}>
          <div className="field"><label htmlFor="emp">Nome da empresa</label>
            <input id="emp" required value={empresa} onChange={(e) => setEmpresa(e.target.value)} /></div>
          <div className="field"><label htmlFor="nm">Seu nome</label>
            <input id="nm" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como aparece para a equipe" /></div>
          {erro && <div className="err" role="alert">{erro}</div>}
          <button className="btn primary" type="submit" disabled={ocupado} aria-busy={ocupado}>Criar empresa</button>
        </form>
        <button className="linkbtn" onClick={() => supabase.auth.signOut()}>Sair</button>
      </div>
    </div>
  );
}
