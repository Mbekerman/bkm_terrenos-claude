import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NOME_PAPEL, useSessao } from '../lib/sessao';
import { supabase } from '../lib/supabase';
import { data as dataCurta } from '../lib/format';
import { AMBIENTE, EH_DEV } from '../lib/config';
import { BI, IC_SINO, P } from '../lib/icones-prototipo';
import NovoTerreno from '../novo/NovoTerreno';
import TrocarEndereco from '../novo/TrocarEndereco';
import { abrirNovo } from '../novo/estado';

// Moldura copiada do protótipo, com as mesmas classes e a mesma marcação (proto_body.html,
// proto.js › render/renderPerfil, proto_funil.js › renderSino e o selo do ambiente). Os estilos
// são os do protótipo, em styles.css. Primeira versão: Mapa e Funil no menu, sem tema escuro.

/** Itens do menu na primeira versão: [rota, rótulo, ícone]. */
const NAV: [string, string, keyof typeof BI][] = [
  ['mapa', 'Mapa', 'mapa'],
  ['funil', 'Funil', 'funil'],
];
const CHAVE_MENU = 'bkm-terrenos-menu';
/** O que a moldura passa às telas: o texto da busca da barra superior. */
export interface ContextoMoldura { busca: string }

/** Ícone de linha do protótipo (ic). */
export function Ic({ n, s = 20 }: { n: keyof typeof P; s?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" width={s} height={s} aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" d={P[n]} />
    </svg>
  );
}

/** Ícone BKM do protótipo (bi). */
export function Bi({ n, s = 32 }: { n: keyof typeof BI; s?: number }) {
  return <svg className="bkm-ico" viewBox="0 0 96 96" width={s} height={s} style={{ width: s, height: s }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: BI[n] }} />;
}

/** Selo do ambiente ao lado do logo (fora da produção). */
export function SeloAmbiente() {
  if (!AMBIENTE || AMBIENTE === 'producao') return null;
  const nome = AMBIENTE === 'dev' ? 'Desenvolvimento' : AMBIENTE;
  return (
    <span className="amb-pilha">
      <span className="amb-selo" title={nome}>
        <span className="amb-l">{nome}</span>
        <span className="amb-c">{AMBIENTE === 'dev' ? 'DEV' : AMBIENTE.slice(0, 3).toUpperCase()}</span>
      </span>
      {/* qual versão está no ar: o último PR e a hora do build (pedido do Moises, 6/nov/2026) */}
      <span className="amb-pr" title={`Versão do PR #${__VERSAO__.pr}, publicada em ${__VERSAO__.build}`}>PR #{__VERSAO__.pr} · {__VERSAO__.build}</span>
    </span>
  );
}

/** Logo com o selo do ambiente, para as telas fora da moldura (entrada, sem acesso). */
export function Logo() {
  return <span className="m-logo"><img src="/marca/bkm-logo.svg" alt="BKM" width={120} /><SeloAmbiente /></span>;
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

/** Foto do Google no lugar da inicial; sem foto (ou se ela não carrega), a inicial, como no protótipo. */
function Foto({ nome, url }: { nome: string; url: string | null | undefined }) {
  const [falhou, setFalhou] = useState(false);
  if (url && !falhou) return <img className="perfil-foto" src={url} alt="" referrerPolicy="no-referrer" onError={() => setFalhou(true)} />;
  return <>{(nome.trim()[0] ?? '?').toUpperCase()}</>;
}

function Perfil() {
  const { usuario, membro, session } = useSessao();
  const [aberto, setAberto] = useState(false);
  const ref = useFora<HTMLDivElement>(aberto, () => setAberto(false));
  const nome = usuario?.nome ?? membro?.nome ?? session?.user.email ?? '';
  const papel = membro ? NOME_PAPEL[membro.papel] + (membro.administrador ? ' · Administrador' : '') : '';
  return (
    <div className="tema-wrap" id="perfil" ref={ref}>
      <button className="perfil-btn" aria-haspopup="menu" aria-expanded={aberto} aria-label={`${nome}, ${papel}`} title={`${nome} · ${papel}`} onClick={() => setAberto(!aberto)}>
        <Foto nome={nome} url={usuario?.foto_url} />
      </button>
      {aberto && (
        <div className="tema-menu" role="menu">
          <div className="perfil-eu"><b>{nome}</b><span>{usuario?.arroba ? `@${usuario.arroba} · ` : ''}{papel}</span></div>
          <button role="menuitem" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      )}
    </div>
  );
}

/* Sino (proto_funil.js › renderSino): os avisos de quem está usando, ao vivo (Supabase Realtime) e a cada minuto; o clique marca
   como lido e abre a ficha do terreno na aba do item (reunião e proposta na Comercial, o resto na Visão geral). E-mail fica para
   depois; "Configurar notificações" entra com Configurações. */
interface Aviso { id: string; texto: string; criada_em: string; lida_em: string | null; autor_id: string | null; origem_tabela: string;
  email_status: string | null; terrenos: { codigo: string; nome: string | null } | null }
const ABA_ORIGEM: Record<string, string> = { reunioes: 'comercial', propostas: 'comercial', ofertas: 'comercial', reuniao_agenda: 'comercial' };

function Sino() {
  const { session, empresa } = useSessao();
  const qc = useQueryClient(), navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const ref = useFora<HTMLDivElement>(aberto, () => setAberto(false));
  const uid = session?.user.id;
  const q = useQuery({
    queryKey: ['avisos', uid, empresa?.id],
    enabled: !!uid && !!empresa,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('notificacoes').select('id,texto,criada_em,lida_em,autor_id,origem_tabela,email_status,terrenos(codigo,nome)')
        .eq('destinatario_id', uid!).eq('empresa_id', empresa!.id).order('criada_em', { ascending: false }).limit(30);
      if (error) throw error;
      const L = (Array.isArray(data) ? data : []) as unknown as Aviso[];
      const ids = [...new Set(L.map((x) => x.autor_id).filter(Boolean))] as string[];
      const us = ids.length ? await supabase.from('usuarios').select('user_id,nome,email').in('user_id', ids) : { data: [] };
      const nomes = Object.fromEntries(((Array.isArray(us.data) ? us.data : []) as { user_id: string; nome: string | null; email: string }[]).map((u) => [u.user_id, u.nome || u.email]));
      return L.map((x) => ({ ...x, autor: x.autor_id ? nomes[x.autor_id] ?? null : null }));
    },
  });
  /* ao vivo: aviso novo para quem está usando recarrega o sino */
  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel('sino-' + uid).on('postgres_changes', { event: '*', schema: 'app', table: 'notificacoes', filter: `destinatario_id=eq.${uid}` },
      () => qc.invalidateQueries({ queryKey: ['avisos'] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, qc]);
  const L = q.data ?? [];
  const nl = L.filter((a) => !a.lida_em).length;
  async function lerTodas() {
    await supabase.rpc('marcar_notificacao_lida', { p_id: null });
    qc.invalidateQueries({ queryKey: ['avisos'] });
  }
  async function abrir(x: Aviso) {
    setAberto(false);
    if (!x.lida_em) { await supabase.rpc('marcar_notificacao_lida', { p_id: x.id }); qc.invalidateQueries({ queryKey: ['avisos'] }); }
    if (x.terrenos?.codigo) navegar(`/terrenos/${x.terrenos.codigo}/${ABA_ORIGEM[x.origem_tabela] ?? 'geral'}`);
  }
  return (
    <div className="sino-wrap" id="sino" ref={ref}>
      <button className="sino-btn" aria-haspopup="true" aria-expanded={aberto} aria-label={`Notificações${nl ? `, ${nl} não lidas` : ''}`} title="Notificações" onClick={() => setAberto(!aberto)}>
        <span dangerouslySetInnerHTML={{ __html: IC_SINO }} style={{ display: 'contents' }} />
        {nl > 0 && <span className="sino-n">{nl > 9 ? '9+' : nl}</span>}
      </button>
      {aberto && (
        <div className="sino-menu" role="dialog" aria-label="Notificações">
          <div className="sino-h"><span>Notificações</span>{nl > 0 && <button className="linkbtn" onClick={lerTodas}>Marcar todas como lidas</button>}</div>
          <div className="sino-l">
            {L.length === 0
              ? <div className="empty" style={{ padding: '24px 16px' }}>Nada por aqui.</div>
              : L.map((x) => (
                <button key={x.id} className={`sino-i ${x.lida_em ? '' : 'nova'}`} onClick={() => abrir(x)}>
                  <span className="sino-d" />
                  <span className="sino-c"><span className="sino-t">{x.texto}</span>
                    <span className="sino-s">{x.terrenos ? `${x.terrenos.codigo} · ${x.terrenos.nome ?? ''} · ` : ''}{dataCurta(x.criada_em.slice(0, 10))}{x.autor ? ' · ' + x.autor : ''}</span></span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Moldura() {
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const rota = pathname.split('/')[1] || 'mapa';
  const [menuMin, setMenuMin] = useState(() => { try { return localStorage.getItem(CHAVE_MENU) !== 'aberto'; } catch { return true; } });
  function alternar() {
    const novo = !menuMin;
    setMenuMin(novo);
    try { localStorage.setItem(CHAVE_MENU, novo ? 'min' : 'aberto'); } catch { /* sem storage */ }
  }
  useEffect(() => { document.title = (EH_DEV ? '[DEV] ' : '') + 'BKM Terrenos'; }, []);
  useEffect(() => { document.body.classList.toggle('menu-min', menuMin); }, [menuMin]);
  useEffect(() => { document.body.dataset.rota = rota; }, [rota]);
  const novo = () => abrirNovo();
  /* busca da barra superior: filtra a lista de terrenos da página Mapa; digitada em outra página, leva ao Mapa com o texto */
  const [busca, setBusca] = useState('');
  return (
    <>
      <header className="top">
        <div className="top-in">
          <button className="brand" aria-label="Início" onClick={() => navegar('/')}>
            <img src="/marca/bkm-logo.svg" alt="BKM" width={120} />
            <span className="brand-sep" /><span className="brand-prod">Terrenos</span>
          </button>
          <SeloAmbiente />
          <label className="search" htmlFor="q-top">
            <Bi n="busca" s={20} />
            <input id="q-top" type="search" placeholder="Buscar por nome, endereço, matrícula, SQL ou corretor" autoComplete="off" value={busca}
              onChange={(e) => { setBusca(e.target.value); if (rota !== 'mapa' && e.target.value.trim()) navegar('/mapa'); }} />
          </label>
          <div className="top-right">
            <Sino />
            <Perfil />
          </div>
        </div>
      </header>
      <div className="layout">
        <aside className="side" id="side" aria-label="Navegação">
          <button className="menu-tg" aria-expanded={!menuMin} aria-label={menuMin ? 'Expandir menu' : 'Recolher menu'} title={menuMin ? 'Expandir menu' : 'Recolher menu'} onClick={alternar}>
            <Ic n={menuMin ? 'expandir' : 'recolher'} />
          </button>
          <button className="compose" onClick={novo} {...(menuMin ? { title: 'Novo terreno', 'aria-label': 'Novo terreno' } : {})}>
            <Ic n="add" s={24} /><span className="rot">Novo terreno</span>
          </button>
          {NAV.map(([r, l, i]) => (
            <button key={r} className="nav-item" onClick={() => navegar(`/${r}`)} aria-current={rota === r ? 'page' : undefined} {...(menuMin ? { title: l, 'aria-label': l } : {})}>
              <span className="ri"><Bi n={i} /></span><span className="rot">{l}</span>
            </button>
          ))}
        </aside>
        <main className="main" id="main"><Outlet context={{ busca } satisfies ContextoMoldura} /></main>
      </div>
      <nav className="bnav" id="bnav" aria-label="Navegação">
        {NAV.map(([r, l, i]) => (
          <button key={r} onClick={() => navegar(`/${r}`)} aria-current={rota === r ? 'page' : undefined}><span className="pill"><Bi n={i} s={32} /></span>{l}</button>
        ))}
      </nav>
      <button className="fab" onClick={novo}><Ic n="add" s={22} /><span className="fab-t">Novo terreno</span></button>
      <NovoTerreno />
      <TrocarEndereco />
    </>
  );
}
