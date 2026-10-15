import { useState, type FormEvent } from 'react';
import { mensagemErro, supabase } from '../lib/supabase';
import { Marca } from '../components/ui';

export default function Login() {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(''); setAviso(''); setOcupado(true);
    const r = modo === 'entrar'
      ? await supabase.auth.signInWithPassword({ email, password: senha })
      : await supabase.auth.signUp({ email, password: senha });
    setOcupado(false);
    if (r.error) {
      setErro(r.error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : mensagemErro(r.error));
      return;
    }
    if (modo === 'criar' && !r.data.session) setAviso('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.');
  }

  return (
    <div className="auth-wrap">
      <div className="auth">
        <div className="brand"><Marca /><span className="brand-sep" /><span className="brand-prod">Terrenos</span></div>
        <h1>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
        <form onSubmit={enviar}>
          <div className="field"><label htmlFor="em">E-mail</label>
            <input id="em" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="pw">Senha</label>
            <input id="pw" type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} minLength={8} required
              value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
          {erro && <div className="err" role="alert">{erro}</div>}
          {aviso && <div className="banner blue">{aviso}</div>}
          <button className="btn primary" type="submit" disabled={ocupado} aria-busy={ocupado}>
            {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
        <button className="linkbtn" onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}>
          {modo === 'entrar' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
        </button>
      </div>
    </div>
  );
}
