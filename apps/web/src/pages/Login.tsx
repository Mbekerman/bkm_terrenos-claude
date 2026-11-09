import { useEffect, useState } from 'react';
import { mensagemErro, supabase } from '../lib/supabase';
import { DOMINIO } from '../lib/config';
import { Logo } from '../components/Moldura';

/** Erro que o Supabase devolve no endereço depois do Google (p.ex. o gancho recusou o domínio). */
function erroNoEndereco(): string {
  const p = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const desc = p.get('error_description') ?? h.get('error_description');
  if (!desc && !p.get('error') && !h.get('error')) return '';
  // tira o erro do endereço, mantendo o caminho que a pessoa abriu
  window.history.replaceState(null, '', window.location.pathname);
  if (desc && /e-mail da empresa|dom[ií]nio|domain|hook/i.test(desc)) return `Só entra quem tem e-mail @${DOMINIO}.`;
  return desc ? `O Google não deixou entrar: ${desc}` : 'O Google não deixou entrar. Tente de novo.';
}

export default function Login() {
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setErro(erroNoEndereco()); }, []);

  async function entrar() {
    setErro(''); setOcupado(true);
    // volta para o mesmo endereço: o link que a pessoa abriu continua valendo depois do login
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href, queryParams: { hd: DOMINIO, prompt: 'select_account' } },
    });
    if (error) { setOcupado(false); setErro(mensagemErro(error)); }
  }

  return (
    <div className="m-auth">
      <div className="m-auth-card">
        <Logo />
        <h1>Entrar</h1>
        <p className="m-auth-txt">Use a sua conta Google da BKM (@{DOMINIO}).</p>
        {erro && <div className="m-auth-erro" role="alert">{erro}</div>}
        <button className="m-btn m-btn-cont m-google" onClick={entrar} disabled={ocupado} aria-busy={ocupado}>
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          {ocupado ? 'Abrindo o Google...' : 'Entrar com o Google'}
        </button>
      </div>
    </div>
  );
}
