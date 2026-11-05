import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NOME_PAPEL, useSessao } from '../lib/sessao';
import { supabase } from '../lib/supabase';
import { EH_DEV } from '../lib/config';
import { Icon, type NomeIcone } from './ui';

/** Itens do menu na primeira versão (só computador). */
const MENU: { to: string; rotulo: string; curto: string; icone: NomeIcone }[] = [
  { to: '/mapa', rotulo: 'Mapa', curto: 'Mapa', icone: 'mapa' },
  { to: '/funil', rotulo: 'Funil', curto: 'Funil', icone: 'funil' },
];
const CHAVE_MENU = 'bkm-terrenos-menu';

export function Logo() {
  return (
    <span className="m-logo">
      <img src="/marca/bkm-logo.svg" alt="BKM" width={120} />
      {EH_DEV && <span className="m-selo-dev">Desenvolvimento</span>}
    </span>
  );
}

/** Fecha o menu flutuante no clique fora e no Esc. */
function useFora<T extends HTMLElement>(aberto: boolean, fechar: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!aberto) return;
    const clique = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fechar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('mousedown', clique);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', clique); document.removeEventListener('keydown', tecla); };
  }, [aberto]);
  return ref;
}

function Foto({ nome, url, grande }: { nome: string; url: string | null | undefined; grande?: boolean }) {
  const [falhou, setFalhou] = useState(false);
  const ini = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return url && !falhou
    ? <img className={`m-foto${grande ? ' g' : ''}`} src={url} alt="" referrerPolicy="no-referrer" onError={() => setFalhou(true)} />
    : <span className={`m-foto m-foto-ini${grande ? ' g' : ''}`} aria-hidden="true">{ini || '?'}</span>;
}

function MenuAvatar() {
  const { usuario, membro, session } = useSessao();
  const [aberto, setAberto] = useState(false);
  const ref = useFora<HTMLDivElement>(aberto, () => setAberto(false));
  const nome = usuario?.nome ?? membro?.nome ?? session?.user.email ?? '';
  const papel = membro ? NOME_PAPEL[membro.papel] + (membro.administrador ? ' · Administrador' : '') : '';
  return (
    <div className="m-flutua" ref={ref}>
      <button className="m-avatar" aria-label={`Conta de ${nome}`} aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <Foto nome={nome} url={usuario?.foto_url} />
      </button>
      {aberto && (
        <div className="m-pop m-pop-conta" role="menu">
          <Foto nome={nome} url={usuario?.foto_url} grande />
          <div className="m-conta-nome">{nome}</div>
          {usuario?.arroba && <div className="m-conta-sub">@{usuario.arroba}</div>}
          <div className="m-conta-sub">{usuario?.email ?? session?.user.email}</div>
          {papel && <span className="m-chip">{papel}</span>}
          <button className="m-btn m-btn-cont" role="menuitem" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      )}
    </div>
  );
}

interface Aviso { id: string; texto: string; criada_em: string; lida_em: string | null }

function Sino() {
  const { session, empresa } = useSessao();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const ref = useFora<HTMLDivElement>(aberto, () => setAberto(false));
  const uid = session?.user.id;
  const q = useQuery({
    queryKey: ['avisos', uid, empresa?.id],
    enabled: !!uid && !!empresa,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('notificacoes').select('id,texto,criada_em,lida_em')
        .eq('destinatario_id', uid!).eq('empresa_id', empresa!.id).order('criada_em', { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as Aviso[];
    },
  });
  const avisos = q.data ?? [];
  const novos = avisos.filter((a) => !a.lida_em).length;
  async function lerTodos() {
    await supabase.rpc('marcar_notificacao_lida', { p_id: null });
    qc.invalidateQueries({ queryKey: ['avisos'] });
  }
  return (
    <div className="m-flutua" ref={ref}>
      <button className="m-icone" aria-label={novos ? `Avisos, ${novos} novos` : 'Avisos'} aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <Icon n="sino" s={24} />
        {novos > 0 && <span className="m-badge">{novos > 9 ? '9+' : novos}</span>}
      </button>
      {aberto && (
        <div className="m-pop m-pop-avisos" role="dialog" aria-label="Avisos">
          <div className="m-pop-h"><span>Avisos</span>{novos > 0 && <button className="m-btn-txt" onClick={lerTodos}>Marcar como lidos</button>}</div>
          {avisos.length === 0
            ? <div className="m-vazio">Nenhum aviso.</div>
            : avisos.map((a) => (
              <div key={a.id} className={`m-aviso${a.lida_em ? '' : ' novo'}`}>
                <div>{a.texto}</div>
                <div className="m-conta-sub">{new Date(a.criada_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default function Moldura() {
  const [aberto, setAberto] = useState(() => { try { return localStorage.getItem(CHAVE_MENU) === 'aberto'; } catch { return false; } });
  function alternar() {
    setAberto(!aberto);
    try { localStorage.setItem(CHAVE_MENU, aberto ? 'recolhido' : 'aberto'); } catch { /* sem storage */ }
  }
  useEffect(() => { document.title = (EH_DEV ? '[DEV] ' : '') + 'BKM Terrenos'; }, []);
  return (
    <div className={`m-app${aberto ? ' menu-aberto' : ''}`}>
      <header className="m-topo">
        <NavLink to="/" className="m-marca" aria-label="Início"><Logo /></NavLink>
        <div className="m-topo-dir"><Sino /><MenuAvatar /></div>
      </header>
      <nav className="m-menu" aria-label="Menu">
        <button className="m-icone m-menu-alt" onClick={alternar} aria-label={aberto ? 'Recolher o menu' : 'Abrir o menu'} aria-expanded={aberto}>
          <Icon n="menu" s={24} />
        </button>
        {MENU.map((i) => (
          <NavLink key={i.to} to={i.to} className="m-menu-item">
            <span className="m-menu-pilula"><Icon n={i.icone} s={24} /></span>
            <span className="m-menu-rot">{aberto ? i.rotulo : i.curto}</span>
          </NavLink>
        ))}
      </nav>
      <main className="m-conteudo"><Outlet /></main>
    </div>
  );
}
