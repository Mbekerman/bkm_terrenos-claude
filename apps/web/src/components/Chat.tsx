/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from './ui';
import { buscarGente, useGente, type Gente } from './Marcar';
import { acender } from '../ficha/edicao';

// Chat dos estudos (pedido do Moises, 12/nov/2026): aba Chat da janela do estudo de massa e da viabilidade.
// Conversa no jeito do WhatsApp, sem a lista de contatos, com o visual Material 3: as minhas à direita, as dos outros à
// esquerda com foto e nome, separadas por dia. @ marca colegas que veem o terreno (o banco avisa no sino); /m e /v abrem a
// lista dos estudos de massa e de viabilidade do terreno, e o escolhido vira um chip que abre o estudo. Clique direito (no
// celular, segurar) abre Responder, Copiar, Editar e Apagar (as duas últimas, só nas próprias). Enter envia,
// Shift + Enter quebra a linha. O aviso de menção abre a janela aqui e acende a mensagem (`irParaMensagem`).
// No banco: app.estudo_mensagens e app.enviar_mensagem_estudo (migration 20261015002600_estudo_chat.sql).

export type TipoEstudo = 'massa' | 'viabilidade';
interface Msg { id: string; autor_id: string; texto: string | null; resposta_a: string | null; criada_em: string; editada_em: string | null; apagada_em: string | null }
interface Estudo { id: string; nome: string; tipo: 'm' | 'v' }

/* a mensagem que o aviso pediu para mostrar: o chat que a tem rola até ela e a acende */
let alvo: string | null = null;
export function irParaMensagem(id: string | null) { alvo = id; }
/** busca a mensagem do aviso: qual estudo abrir */
export async function estudoDaMensagem(id: string): Promise<{ tipo: TipoEstudo; estudo: string } | null> {
  const { data } = await supabase.from('estudo_mensagens').select('estudo_massa_id,viabilidade_id').eq('id', id).maybeSingle();
  const d = data as { estudo_massa_id: string | null; viabilidade_id: string | null } | null;
  if (!d) return null;
  return d.estudo_massa_id ? { tipo: 'massa', estudo: d.estudo_massa_id } : { tipo: 'viabilidade', estudo: d.viabilidade_id! };
}

const SVG: Record<string, string> = {
  enviar: 'M4 12 3 4l18 8-18 8 1-8zm0 0h8',
  responder: 'M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z',
  copiar: 'M9 9h11v11H9zM5 15H4V4h11v1',
  editar: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  apagar: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  fechar: 'M6 6l12 12M18 6 6 18',
  chat: 'M4 5h16v11H8l-4 4z',
};
const Sv = ({ n, s = 20 }: { n: string; s?: number }) => (
  <svg className="ic" viewBox="0 0 24 24" width={s} height={s} aria-hidden="true">
    <path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" d={SVG[n]} />
  </svg>
);

const hora = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function dia(s: string) {
  const d = new Date(s), h = new Date(), on = new Date(h); on.setDate(h.getDate() - 1);
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmo(d, h)) return 'Hoje';
  if (mesmo(d, on)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: d.getFullYear() === h.getFullYear() ? undefined : 'numeric' });
}
/* cor do nome e da bolinha de quem não tem foto, sempre a mesma por pessoa */
const CORES = ['#0b57d0', '#863d8f', '#c67355', '#7d8a3e', '#00796b', '#b3261e', '#5f6368', '#0094fe'];
const cor = (id: string) => CORES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES.length];

/* rótulo do estudo no campo enquanto se escreve: vira [[m:id]] ou [[v:id]] ao enviar */
const rotulo = (e: Estudo) => `⟦${e.tipo === 'm' ? 'Massa' : 'Viabilidade'}: ${e.nome}⟧`;
const RE_TOKEN = /\[\[(m|v):([0-9a-fA-F-]{36})\]\]/g;
const RE_ARROBA = /(^|[^A-Za-z0-9._@-])@([A-Za-z0-9][A-Za-z0-9._-]{0,39})/g;

function useEstudosTerreno(terreno: string) {
  return useQuery({
    queryKey: ['chat-estudos', terreno], staleTime: 30_000,
    queryFn: async () => {
      const [m, v] = await Promise.all([
        supabase.from('estudos_massa').select('id,nome,ordem').eq('terreno_id', terreno).order('ordem'),
        supabase.from('viabilidades').select('id,nome,criado_em').eq('terreno_id', terreno).order('criado_em'),
      ]);
      return [...((m.data ?? []) as any[]).map((x) => ({ id: x.id, nome: x.nome, tipo: 'm' as const })),
        ...((v.data ?? []) as any[]).map((x) => ({ id: x.id, nome: x.nome, tipo: 'v' as const }))];
    },
  });
}
function useFotos() {
  return useQuery({
    queryKey: ['chat-fotos'], staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase.from('usuarios').select('user_id,foto_url');
      return new Map(((data ?? []) as any[]).map((u) => [u.user_id as string, u.foto_url as string | null]));
    },
  });
}

/** a aba Chat: `abrirEstudo` abre o estudo citado num chip */
export default function Chat({ tipo, estudo, terreno, abrirEstudo }: {
  tipo: TipoEstudo; estudo: string; terreno: string; abrirEstudo: (tipo: TipoEstudo, id: string) => void;
}) {
  const { session, edita } = useSessao();
  const uid = session?.user.id ?? '';
  const toast = useToast(), qc = useQueryClient();
  const col = tipo === 'massa' ? 'estudo_massa_id' : 'viabilidade_id';
  const chave = ['chat', tipo, estudo];
  const q = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await supabase.from('estudo_mensagens').select('id,autor_id,texto,resposta_a,criada_em,editada_em,apagada_em')
        .eq(col, estudo).order('criada_em');
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });
  /* ao vivo */
  useEffect(() => {
    const ch = supabase.channel(`chat-${estudo}`).on('postgres_changes', { event: '*', schema: 'app', table: 'estudo_mensagens', filter: `${col}=eq.${estudo}` },
      () => qc.invalidateQueries({ queryKey: chave })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [estudo]); // eslint-disable-line react-hooks/exhaustive-deps
  const G = useGente(terreno), E = useEstudosTerreno(terreno), F = useFotos();
  const colegas = G.data?.bkm ?? [];
  const porId = useMemo(() => new Map(colegas.map((g) => [g.user_id!, g])), [colegas]);
  const estudos = E.data ?? [];
  const L = q.data ?? [];
  const msgs = useMemo(() => new Map(L.map((m) => [m.id, m])), [L]);

  const [resp, setResp] = useState<Msg | null>(null);
  const [edit, setEdit] = useState<Msg | null>(null);
  const [menu, setMenu] = useState<{ m: Msg; x: number; y: number } | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  /* rola para o fim ao abrir e quando chega mensagem (se já estava perto do fim); com o aviso, até a mensagem dele */
  const n = L.length, pronto = q.isSuccess;
  const embaixo = useRef(true);
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el || !pronto) return;
    if (alvo && msgs.has(alvo)) {
      const m = el.querySelector<HTMLElement>(`[data-msg="${alvo}"]`);
      alvo = null;
      if (m) { el.scrollTop = m.offsetTop - el.clientHeight / 2 + m.offsetHeight / 2; acender(m.querySelector<HTMLElement>('.chat-b') ?? m); return; }
    }
    if (embaixo.current) el.scrollTop = el.scrollHeight;
  }, [n, pronto]); // eslint-disable-line react-hooks/exhaustive-deps

  const irMsg = (id: string) => {
    const el = lista.current, m = el?.querySelector<HTMLElement>(`[data-msg="${id}"]`);
    if (!el || !m) return;
    el.scrollTo({ top: m.offsetTop - el.clientHeight / 2 + m.offsetHeight / 2, behavior: 'smooth' });
    acender(m.querySelector<HTMLElement>('.chat-b') ?? m);
  };
  const nome = (u: string) => (u === uid ? 'Você' : porId.get(u)?.nome ?? 'Colega');

  async function apagar(m: Msg) {
    const { error } = await supabase.rpc('apagar_mensagem_estudo', { p_id: m.id });
    if (error) toast(error.message, true); else qc.invalidateQueries({ queryKey: chave });
  }
  const acoes = (m: Msg) => [
    !m.apagada_em && edita ? ['responder', 'Responder', () => { setEdit(null); setResp(m); campo.current?.focus(); }] : null,
    !m.apagada_em ? ['copiar', 'Copiar texto', () => { void navigator.clipboard?.writeText(textoPuro(m.texto ?? '', estudos)); }] : null,
    !m.apagada_em && m.autor_id === uid && edita ? ['editar', 'Editar', () => { setResp(null); setEdit(m); }] : null,
    !m.apagada_em && m.autor_id === uid && edita ? ['apagar', 'Apagar', () => apagar(m)] : null,
  ].filter(Boolean) as [string, string, () => void][];

  /* o chat ocupa a janela até embaixo, com o campo de escrever sempre à vista */
  const raiz = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = raiz.current, sc = el?.closest<HTMLElement>('.vb-pop-sc, .ems-pop-b');
    if (!el || !sc) return;
    const medir = () => {
      const fundo = sc.getBoundingClientRect().bottom, topo = el.getBoundingClientRect().top;
      el.style.height = Math.max(320, Math.floor(fundo - topo - 16)) + 'px';
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);
  /* segurar no celular abre o mesmo menu */
  const toque = useRef<number>();

  let ultDia = '', ultAutor = '', ultEm = 0;
  return (
    <div className="chat" ref={raiz}>
      <div className="chat-l" ref={lista} onScroll={(e) => { const el = e.currentTarget; embaixo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {q.isLoading ? <div className="chat-vazio faint">Carregando…</div>
          : q.error ? <div className="banner warn">Não foi possível ler o chat: {(q.error as Error).message}</div>
          : !L.length ? (
            <div className="chat-vazio">
              <span className="chat-vazio-i"><Sv n="chat" s={28} /></span>
              <div className="chat-vazio-t">Nenhuma mensagem ainda</div>
              <div className="faint">Converse sobre este estudo com a equipe. Use @ para chamar alguém, /m para citar um estudo de massa e /v para citar uma viabilidade.</div>
            </div>
          ) : L.map((m) => {
            const d = dia(m.criada_em), novoDia = d !== ultDia;
            const t = new Date(m.criada_em).getTime();
            const seguida = !novoDia && ultAutor === m.autor_id && t - ultEm < 5 * 60_000;
            ultDia = d; ultAutor = m.autor_id; ultEm = t;
            const meu = m.autor_id === uid, r = m.resposta_a ? msgs.get(m.resposta_a) : null;
            const foto = F.data?.get(m.autor_id);
            return (
              <Fragment key={m.id}>
                {novoDia && <div className="chat-dia"><span>{d}</span></div>}
                <div className={`chat-m${meu ? ' meu' : ''}${seguida ? ' seguida' : ''}`} data-msg={m.id}>
                  {!meu && <span className="chat-av" style={{ background: foto ? undefined : cor(m.autor_id) }} aria-hidden>
                    {!seguida && (foto ? <img src={foto} alt="" referrerPolicy="no-referrer" /> : nome(m.autor_id).trim().charAt(0).toUpperCase())}
                  </span>}
                  <div className={`chat-b${m.apagada_em ? ' apagada' : ''}`} tabIndex={0}
                    onContextMenu={(e) => { if (m.apagada_em) return; e.preventDefault(); setMenu({ m, x: e.clientX, y: e.clientY }); }}
                    onKeyDown={(e) => { if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && !m.apagada_em) { e.preventDefault(); const b = e.currentTarget.getBoundingClientRect(); setMenu({ m, x: b.left + 16, y: b.bottom }); } }}
                    onTouchStart={(e) => { const p = e.touches[0]; clearTimeout(toque.current); toque.current = window.setTimeout(() => { if (!m.apagada_em) setMenu({ m, x: p.clientX, y: p.clientY }); }, 500); }}
                    onTouchEnd={() => clearTimeout(toque.current)} onTouchMove={() => clearTimeout(toque.current)}>
                    {!meu && !seguida && <div className="chat-n" style={{ color: cor(m.autor_id) }}>{nome(m.autor_id)}</div>}
                    {m.resposta_a && (
                      <button type="button" className="chat-cit" onClick={() => r && irMsg(r.id)} disabled={!r}>
                        <b style={{ color: r ? cor(r.autor_id) : undefined }}>{r ? nome(r.autor_id) : 'Mensagem'}</b>
                        <span>{!r || r.apagada_em ? 'Mensagem apagada' : textoPuro(r.texto ?? '', estudos)}</span>
                      </button>
                    )}
                    <div className="chat-t">
                      {m.apagada_em ? <i>Mensagem apagada</i> : <Texto texto={m.texto ?? ''} colegas={colegas} estudos={estudos} abrir={abrirEstudo} />}
                      <span className="chat-h">{m.editada_em && !m.apagada_em ? 'editada · ' : ''}{hora(m.criada_em)}</span>
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          })}
      </div>
      {menu && <MenuMsg x={menu.x} y={menu.y} itens={acoes(menu.m)} fechar={() => setMenu(null)} />}
      {edita ? (
        <Escrever key={edit?.id ?? 'novo'} campo={campo} tipo={tipo} estudo={estudo} colegas={colegas.filter((g) => g.user_id !== uid)} estudos={estudos}
          resp={resp} nomeResp={resp ? nome(resp.autor_id) : ''} cancelarResp={() => setResp(null)}
          edit={edit} cancelarEdit={() => setEdit(null)}
          enviado={() => { embaixo.current = true; setResp(null); setEdit(null); qc.invalidateQueries({ queryKey: chave }); }} />
      ) : <div className="chat-ro faint">Seu acesso é somente leitura.</div>}
    </div>
  );
}

/* texto sem marcação, para a citação e para copiar */
function textoPuro(t: string, estudos: Estudo[]) {
  return t.replace(RE_TOKEN, (_, k, id) => { const e = estudos.find((x) => x.id === id); return e ? `${k === 'm' ? 'Massa' : 'Viabilidade'}: ${e.nome}` : 'estudo apagado'; });
}

function Texto({ texto, colegas, estudos, abrir }: { texto: string; colegas: Gente[]; estudos: Estudo[]; abrir: (t: TipoEstudo, id: string) => void }) {
  const ar = new Set(colegas.map((g) => g.arroba).filter(Boolean));
  const out: ReactNode[] = [];
  let k = 0;
  const arrobas = (s: string) => {
    let ult = 0, m: RegExpExecArray | null;
    RE_ARROBA.lastIndex = 0;
    while ((m = RE_ARROBA.exec(s))) {
      const a = m[2].toLowerCase().replace(/[._-]+$/, '');
      if (!ar.has(a)) continue;
      const ini = m.index + m[1].length;
      out.push(s.slice(ult, ini), <span key={k++} className="mencao">@{a}</span>);
      ult = ini + 1 + a.length;
    }
    out.push(s.slice(ult));
  };
  let ult = 0, m: RegExpExecArray | null;
  RE_TOKEN.lastIndex = 0;
  while ((m = RE_TOKEN.exec(texto))) {
    arrobas(texto.slice(ult, m.index));
    const e = estudos.find((x) => x.id === m![2]), tp = m[1] as 'm' | 'v';
    out.push(e
      ? <button type="button" key={k++} className={`chat-est ${tp}`} onClick={() => abrir(tp === 'm' ? 'massa' : 'viabilidade', e.id)} title={`Abrir ${e.nome}`}>
        {tp === 'm' ? 'Massa' : 'Viabilidade'} · {e.nome}</button>
      : <span key={k++} className="chat-est apagado">estudo apagado</span>);
    ult = m.index + m[0].length;
  }
  arrobas(texto.slice(ult));
  return <>{out}</>;
}

function MenuMsg({ x, y, itens, fechar }: { x: number; y: number; itens: [string, string, () => void][]; fechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(x, innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, innerHeight - r.height - 8)) });
    el.querySelector<HTMLButtonElement>('button')?.focus();
  }, [x, y]);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) fechar(); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); } };
    document.addEventListener('mousedown', fora, true);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('scroll', fechar, true);
    return () => { document.removeEventListener('mousedown', fora, true); document.removeEventListener('keydown', esc, true); window.removeEventListener('scroll', fechar, true); };
  }, [fechar]);
  return (
    <div ref={ref} className="chat-menu" role="menu" style={pos}>
      {itens.map(([ic, rot, fn]) => (
        <button key={ic} role="menuitem" className={ic === 'apagar' ? 'danger' : ''} onClick={() => { fechar(); fn(); }}><Sv n={ic} s={18} />{rot}</button>
      ))}
    </div>
  );
}

type Sug = { k: '@'; q: string; ini: number; fim: number } | { k: 'm' | 'v'; q: string; ini: number; fim: number };

function Escrever({ campo, tipo, estudo, colegas, estudos, resp, nomeResp, cancelarResp, edit, cancelarEdit, enviado }: {
  campo: React.RefObject<HTMLTextAreaElement>; tipo: TipoEstudo; estudo: string; colegas: Gente[]; estudos: Estudo[];
  resp: Msg | null; nomeResp: string; cancelarResp: () => void; edit: Msg | null; cancelarEdit: () => void; enviado: () => void;
}) {
  const toast = useToast();
  /* na edição, os tokens viram os rótulos de novo */
  const [txt, setTxt] = useState(() => (edit?.texto ?? '').replace(RE_TOKEN, (_, _k, id) => { const e = estudos.find((x) => x.id === id); return e ? rotulo(e) : _; }));
  const [sug, setSug] = useState<Sug | null>(null);
  const [i, setI] = useState(0);
  const [indo, setIndo] = useState(false);
  useEffect(() => { if (edit) { const el = campo.current; el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); } }, [edit]); // eslint-disable-line react-hooks/exhaustive-deps
  /* altura do campo acompanha o texto, até 6 linhas */
  useLayoutEffect(() => { const el = campo.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 150) + 'px'; }, [txt, campo]);

  const opcoes: (Gente | Estudo)[] = !sug ? [] : sug.k === '@' ? buscarGente(colegas.filter((g) => g.arroba), sug.q, 6)
    : estudos.filter((e) => e.tipo === sug.k && (!sug.q || e.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(sug.q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))));
  const aberto = !!sug && (opcoes.length > 0 || sug.k !== '@');

  const olhar = (el: HTMLTextAreaElement) => {
    const pos = el.selectionStart ?? el.value.length, antes = el.value.slice(0, pos);
    let m = /(?:^|[^A-Za-z0-9._@-])@([A-Za-z0-9._-]{0,40})$/.exec(antes);
    if (m) { setSug({ k: '@', q: m[1], ini: pos - m[1].length - 1, fim: pos }); setI(0); return; }
    m = /(?:^|\s)\/(m|v)(?:\s?([^\s⟦⟧/]{0,40}))?$/i.exec(antes);
    if (m) { const tot = m[0].replace(/^\s/, ''); setSug({ k: m[1].toLowerCase() as 'm' | 'v', q: m[2] ?? '', ini: pos - tot.length, fim: pos }); setI(0); return; }
    setSug(null);
  };
  const escolher = (o: Gente | Estudo) => {
    if (!sug) return;
    const ins = 'k' in o ? '@' + o.arroba : rotulo(o);
    const novo = txt.slice(0, sug.ini) + ins + ' ' + txt.slice(sug.fim), pos = sug.ini + ins.length + 1;
    setTxt(novo); setSug(null);
    requestAnimationFrame(() => { const el = campo.current; if (el) { el.focus(); el.setSelectionRange(pos, pos); } });
  };

  async function enviar() {
    let t = txt.trim();
    if (!t || indo) return;
    for (const e of estudos) t = t.split(rotulo(e)).join(`[[${e.tipo}:${e.id}]]`);
    setIndo(true);
    const r = edit ? await supabase.rpc('editar_mensagem_estudo', { p_id: edit.id, p_texto: t })
      : await supabase.rpc('enviar_mensagem_estudo', { p_tipo: tipo, p_estudo: estudo, p_texto: t, p_resposta: resp?.id ?? null });
    setIndo(false);
    if (r.error) { toast(r.error.message, true); return; }
    setTxt(''); enviado();
    requestAnimationFrame(() => campo.current?.focus());
  }
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (aberto && opcoes.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setI((i + 1) % opcoes.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setI((i - 1 + opcoes.length) % opcoes.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); escolher(opcoes[i]); return; }
    }
    if (e.key === 'Escape') {
      if (sug) { e.preventDefault(); e.stopPropagation(); setSug(null); return; }
      if (resp || edit) { e.preventDefault(); e.stopPropagation(); cancelarResp(); cancelarEdit(); if (edit) setTxt(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); void enviar(); }
  };

  return (
    <div className="chat-e">
      {(resp || edit) && (
        <div className="chat-resp">
          <span className="chat-resp-i"><Sv n={edit ? 'editar' : 'responder'} s={18} /></span>
          <div className="chat-resp-t">
            <b>{edit ? 'Editando a mensagem' : `Respondendo a ${nomeResp}`}</b>
            <span>{textoPuro((edit ?? resp)!.texto ?? '', estudos)}</span>
          </div>
          <button type="button" className="iconbtn" aria-label={edit ? 'Cancelar a edição' : 'Cancelar a resposta'} onClick={() => { cancelarResp(); cancelarEdit(); }}><Sv n="fechar" s={18} /></button>
        </div>
      )}
      <div className="chat-campo">
        {aberto && (
          <div className="mn-pop chat-sug" role="listbox" id="chat-sug">
            {sug!.k !== '@' && <div className="chat-sug-h">{sug!.k === 'm' ? 'Estudos de massa' : 'Estudos de viabilidade'} do terreno</div>}
            {opcoes.length ? opcoes.map((o, j) => 'k' in o ? (
              <div key={o.k} role="option" aria-selected={j === i} className="mn-i" onMouseDown={(e) => { e.preventDefault(); escolher(o); }}>
                <span className="mk-av" aria-hidden>{o.nome.trim().charAt(0).toUpperCase()}</span><span className="mn-n">{o.nome}</span><span className="mn-a">{o.sub}</span>
              </div>
            ) : (
              <div key={o.id} role="option" aria-selected={j === i} className="mn-i" onMouseDown={(e) => { e.preventDefault(); escolher(o); }}>
                <span className={`chat-est ${o.tipo}`}>{o.tipo === 'm' ? 'Massa' : 'Viabilidade'}</span><span className="mn-n">{o.nome}</span>
              </div>
            )) : <div className="mn-i faint">{sug!.k === 'm' ? 'Nenhum estudo de massa' : 'Nenhum estudo de viabilidade'} {sug!.q ? 'com esse nome' : 'neste terreno'}</div>}
          </div>
        )}
        <textarea ref={campo} rows={1} value={txt} placeholder="Mensagem" aria-label="Mensagem" data-sem-enter
          aria-autocomplete="list" aria-controls={aberto ? 'chat-sug' : undefined}
          onChange={(e) => { setTxt(e.target.value); olhar(e.target); }} onKeyDown={tecla}
          onClick={(e) => olhar(e.currentTarget)} onBlur={() => setTimeout(() => setSug(null), 120)} />
        <button type="button" className="chat-env" aria-label={edit ? 'Salvar' : 'Enviar'} title={edit ? 'Salvar (Enter)' : 'Enviar (Enter)'} disabled={!txt.trim() || indo} onClick={() => void enviar()}>
          <Sv n={edit ? 'editar' : 'enviar'} s={20} />
        </button>
      </div>
    </div>
  );
}

/** o link de um estudo no endereço (?estudo=<id> abre o estudo; ?chat=<mensagem> abre o estudo da mensagem na aba Chat,
    rola até ela e a acende): o aviso do sino e o chip de estudo citado no chat usam este caminho */
export function useLinkEstudo(tipo: TipoEstudo, ativo: boolean, abrir: (id: string, chat: boolean) => void) {
  const loc = useLocation(), navegar = useNavigate();
  const sp = new URLSearchParams(loc.search), est = sp.get('estudo'), msg = sp.get('chat');
  useEffect(() => {
    if (!ativo || (!est && !msg)) return;
    let vivo = true;
    (async () => {
      let id = est, chat = false;
      if (msg) {
        const x = await estudoDaMensagem(msg);
        if (!vivo) return;
        if (x && x.tipo === tipo) { id = x.estudo; chat = true; irParaMensagem(msg); } else id = null;
      }
      const p = new URLSearchParams(loc.search); p.delete('estudo'); p.delete('chat');
      navegar({ pathname: loc.pathname, search: p.toString() ? '?' + p : '' }, { replace: true, state: loc.state });
      if (id) abrir(id, chat);
    })();
    return () => { vivo = false; };
  }, [est, msg, ativo]); // eslint-disable-line react-hooks/exhaustive-deps
}
/** abre um estudo citado num chip do chat */
export function useIrEstudo(codigo: string) {
  const navegar = useNavigate();
  return (tipo: TipoEstudo, id: string) => navegar(`/terrenos/${codigo}/${tipo === 'massa' ? 'massa' : 'viabilidade'}?estudo=${id}`);
}
