import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { erroTxt } from './dados';
import { limparHtml } from './texto';

// Aba "Observações e Premissas" do estudo de viabilidade (pedido do Moises, 12/nov/2026): texto livre com
// formatação, um por estudo, com a barra de edição no jeito do Google Docs (Material 3: barra tonal em cápsula,
// ícones cheios, tamanho com − e +, cores na paleta do Docs). Grava sozinho (1 s depois de parar de digitar e ao
// sair do texto) por app.salvar_observacoes_viabilidade; o HTML é limpo antes de gravar, ao colar e antes de mostrar.

type Gravar = (fn: () => PromiseLike<{ error: unknown }>, depois?: (r: any) => void) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

/* ícones do Material (cheios), como na barra do Docs */
const I: Record<string, string> = {
  undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z',
  redo: 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z',
  bold: 'M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z',
  italic: 'M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z',
  underline: 'M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z',
  strike: 'M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z',
  letra: 'M11 3 5.5 17h2.25l1.12-3h6.25l1.12 3h2.25L13 3h-2zm-1.38 9L12 5.67 14.38 12H9.62z',
  marca: 'M13.06 5.19l3.75 3.75L7.75 18H4v-3.75l9.06-9.06zm4.82 2.68-3.75-3.75 1.83-1.83a.996.996 0 0 1 1.41 0l2.34 2.34c.39.39.39 1.02 0 1.41l-1.83 1.83z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  left: 'M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z',
  center: 'M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z',
  right: 'M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z',
  justify: 'M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z',
  ul: 'M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z',
  ol: 'M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z',
  outdent: 'M11 17h10v-2H11v2zm-8-5 4 4V8l-4 4zm0 9h18v-2H3v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z',
  indent: 'M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z',
  limpar: 'M3.27 5 2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.55 5.27 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z',
  seta: 'M7 10l5 5 5-5z',
  menos: 'M5 11h14v2H5z',
  mais: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
};
const Svg = ({ n, s = 20, children }: { n: keyof typeof I; s?: number; children?: ReactNode }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden="true"><path fill="currentColor" d={I[n]} />{children}</svg>
);

/* paleta do Google Docs, mais a linha das cores da BKM */
const PALETA = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
];
const BKM = ['#0094fe', '#863d8f', '#c67355', '#7d8a3e', '#0b57d0'];
const NOMES_COR: Record<string, string> = { '#000000': 'preto', '#ffffff': 'branco', '#ff0000': 'vermelho', '#ffff00': 'amarelo', '#0000ff': 'azul', '#00ff00': 'verde' };

const ESTILOS = [['p', 'Texto normal'], ['h1', 'Título 1'], ['h2', 'Título 2'], ['h3', 'Título 3']] as const;
const TAMANHOS = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96];
const PADRAO_PT = 11;

const cmd = (c: string, v?: string) => document.execCommand(c, false, v);
const estado = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };

export function Observacoes({ id, ro, gravar, aoSalvar }: { id: string; ro: boolean; gravar: Gravar; aoSalvar: (em: string) => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    supabase.from('viabilidades').select('observacoes').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (!vivo) return;
      if (error) { setErro(erroTxt(error)); return; }
      setHtml(limparHtml((data as { observacoes: string | null } | null)?.observacoes));
    });
    return () => { vivo = false; };
  }, [id]);
  if (erro) return <div className="muted obs-vazio">Não foi possível abrir as observações: {erro}</div>;
  if (html == null) return <div className="muted obs-vazio">Carregando…</div>;
  if (ro) return html
    ? <div className="obs-doc obs-ler" dangerouslySetInnerHTML={{ __html: html }} />
    : <div className="muted obs-vazio">Sem observações.</div>;
  return <Editor id={id} ini={html} gravar={gravar} aoSalvar={aoSalvar} />;
}

function Editor({ id, ini, gravar, aoSalvar }: { id: string; ini: string; gravar: Gravar; aoSalvar: (em: string) => void }) {
  const ed = useRef<HTMLDivElement>(null);
  const salvo = useRef(ini);
  const tempo = useRef<number>();
  const pendentePt = useRef<number | null>(null);
  const faixa = useRef<Range | null>(null);
  const [st, setSt] = useState({ bloco: 'p', pt: PADRAO_PT, b: false, i: false, u: false, s: false, ul: false, ol: false, alin: 'left', cor: '#000000', fundo: '#ffff00' });
  const [menu, setMenu] = useState<'' | 'estilo' | 'tam' | 'cor' | 'fundo' | 'alin' | 'link'>('');
  const [url, setUrl] = useState('');
  const [situacao, setSituacao] = useState<'' | 'salvando' | 'salvo'>('');

  useLayoutEffect(() => { if (ed.current) ed.current.innerHTML = ini; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* a barra fica presa logo abaixo dos indicadores e das abas do estudo ao rolar */
  const raiz = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fx = raiz.current?.closest('.vb-pop-sc')?.querySelector<HTMLElement>('.vb-fixo');
    if (!fx || !raiz.current) return;
    const r = raiz.current;
    const medir = () => r.style.setProperty('--obs-top', fx.offsetHeight + 8 + 'px');
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(fx);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    try { cmd('styleWithCSS', 'true'); cmd('defaultParagraphSeparator', 'p'); } catch { /* navegador sem suporte */ }
  }, []);

  /* grava o que mudou (limpo), em fila com as outras gravações do estudo */
  const salvar = () => {
    clearTimeout(tempo.current);
    const el = ed.current;
    if (!el) return;
    const h = limparHtml(el.innerHTML);
    if (h === salvo.current) return;
    salvo.current = h;
    setSituacao('salvando');
    gravar(() => supabase.rpc('salvar_observacoes_viabilidade', { p_id: id, p_html: h || null }), (r) => {
      setSituacao('salvo');
      if (r?.data) aoSalvar(r.data as string);
    });
  };
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;
  useEffect(() => () => salvarRef.current(), []);

  /* o estado da barra acompanha o cursor */
  const ler = () => {
    const el = ed.current, sel = getSelection();
    if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return;
    let no: Node | null = sel.anchorNode;
    if (no && no.nodeType === Node.TEXT_NODE) no = no.parentElement;
    const cs = no instanceof Element ? getComputedStyle(no) : null;
    const pt = pendentePt.current ?? (cs ? Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2 : PADRAO_PT);
    let bloco = 'p';
    for (let x = no as Element | null; x && x !== el; x = x.parentElement) if (/^H[1-3]$/.test(x.tagName)) { bloco = x.tagName.toLowerCase(); break; }
    const alin = estado('justifyCenter') ? 'center' : estado('justifyRight') ? 'right' : estado('justifyFull') ? 'justify' : 'left';
    setSt((o) => ({ ...o, bloco, pt, alin, b: estado('bold'), i: estado('italic'), u: estado('underline'), s: estado('strikeThrough'), ul: estado('insertUnorderedList'), ol: estado('insertOrderedList') }));
  };
  useEffect(() => {
    const f = () => ler();
    document.addEventListener('selectionchange', f);
    return () => document.removeEventListener('selectionchange', f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* tamanho em pt: o execCommand só sabe 1–7; usa o 7 como marca e troca por span com o tamanho */
  const trocarFont = () => {
    const el = ed.current;
    if (!el) return;
    const novos: HTMLElement[] = [];
    const marcado = !(getSelection()?.isCollapsed ?? true);
    el.querySelectorAll('font[size]').forEach((f) => {
      const s = document.createElement('span');
      novos.push(s);
      const pt = pendentePt.current ?? PADRAO_PT;
      s.style.fontSize = pt + 'pt';
      const c = f.getAttribute('color');
      if (c) s.style.color = c;
      while (f.firstChild) s.appendChild(f.firstChild);
      f.replaceWith(s);
    });
    /* o navegador perde a seleção quando a etiqueta some: marca de novo o trecho que mudou de tamanho */
    const sel = getSelection();
    if (novos.length && sel && marcado) {
      const r = document.createRange();
      r.setStartBefore(novos[0].firstChild ?? novos[0]);
      r.setEndAfter(novos[novos.length - 1].lastChild ?? novos[novos.length - 1]);
      sel.removeAllRanges(); sel.addRange(r);
      faixa.current = r.cloneRange();
    }
    el.querySelectorAll<HTMLElement>('span[style*="xxx-large"]').forEach((s) => { s.style.fontSize = (pendentePt.current ?? PADRAO_PT) + 'pt'; });
  };
  const tamanho = (pt: number) => {
    pt = Math.max(6, Math.min(96, Math.round(pt)));
    pendentePt.current = pt;
    restaurar();
    cmd('styleWithCSS', 'false');
    cmd('fontSize', '7');
    cmd('styleWithCSS', 'true');
    trocarFont();
    setSt((o) => ({ ...o, pt }));
    agendar();
  };

  const agendar = () => { clearTimeout(tempo.current); tempo.current = window.setTimeout(salvar, 1000); setSituacao(''); };
  const guardar = () => { const s = getSelection(); if (s && s.rangeCount && ed.current?.contains(s.anchorNode)) faixa.current = s.getRangeAt(0).cloneRange(); };
  const restaurar = () => {
    const el = ed.current;
    if (!el) return;
    if (document.activeElement !== el) el.focus();
    const s = getSelection();
    if (faixa.current && s) { s.removeAllRanges(); s.addRange(faixa.current); }
  };
  const fazer = (c: string, v?: string) => { restaurar(); cmd(c, v); ler(); agendar(); setMenu(''); };

  const abrirMenu = (m: typeof menu) => { guardar(); setMenu((o) => (o === m ? '' : m)); };
  const aplicarLink = () => {
    let u = url.trim();
    if (u && !/^(https?:\/\/|mailto:)/i.test(u)) u = /@/.test(u) && !/\//.test(u) ? 'mailto:' + u : 'https://' + u;
    restaurar();
    const s = getSelection();
    if (!u) cmd('unlink');
    else if (s && s.isCollapsed) cmd('insertHTML', `<a href="${u.replace(/"/g, '%22')}">${u.replace(/[<>&]/g, '')}</a>`);
    else cmd('createLink', u);
    setMenu(''); setUrl(''); agendar();
  };
  const pedirLink = () => {
    guardar();
    let no: Node | null = getSelection()?.anchorNode ?? null;
    if (no?.nodeType === Node.TEXT_NODE) no = no.parentElement;
    setUrl((no as Element | null)?.closest?.('a')?.getAttribute('href') ?? '');
    setMenu('link');
  };

  /* atalhos do Docs que o navegador não tem */
  const teclas = (e: React.KeyboardEvent) => {
    const m = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { e.preventDefault(); ed.current?.blur(); return; }
    if (!m) return;
    const k = e.key.toLowerCase();
    if (k === 'k') { e.preventDefault(); pedirLink(); }
    else if (e.shiftKey && (k === '7' || k === '&')) { e.preventDefault(); fazer('insertOrderedList'); }
    else if (e.shiftKey && (k === '8' || k === '*')) { e.preventDefault(); fazer('insertUnorderedList'); }
    else if (e.shiftKey && (k === 'x' || k === '5')) { e.preventDefault(); fazer('strikeThrough'); }
    else if (e.shiftKey && (k === '.' || k === '>')) { e.preventDefault(); tamanho(proximo(st.pt, 1)); }
    else if (e.shiftKey && (k === ',' || k === '<')) { e.preventDefault(); tamanho(proximo(st.pt, -1)); }
    else if (e.altKey && /^[0-3]$/.test(k)) { e.preventDefault(); fazer('formatBlock', k === '0' ? 'p' : 'h' + k); }
    else if (k === '\\') { e.preventDefault(); fazer('removeFormat'); }
  };
  /* colar: só o que passa na limpeza (texto do Word, do Docs ou de páginas da web) */
  const colar = (e: React.ClipboardEvent) => {
    const h = e.clipboardData.getData('text/html');
    e.preventDefault();
    if (h) cmd('insertHTML', limparHtml(h));
    else {
      const t = e.clipboardData.getData('text/plain');
      cmd('insertHTML', t.split(/\r?\n/).map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('<br>'));
    }
    agendar();
  };

  const Bt = ({ t, on, ativo, children, k }: { t: string; on: () => void; ativo?: boolean; children: ReactNode; k?: string }) => (
    <button type="button" className={'obs-bt' + (ativo ? ' on' : '')} aria-pressed={ativo ?? undefined} title={k ? `${t} (${k})` : t} aria-label={t}
      onMouseDown={(e) => { e.preventDefault(); guardar(); }} onClick={on}>{children}</button>
  );
  const sep = <span className="obs-sep" aria-hidden="true" />;
  const ctrl = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';
  const nomeEstilo = ESTILOS.find((x) => x[0] === st.bloco)?.[1] ?? 'Texto normal';
  const ALIN = { left: ['left', 'Alinhar à esquerda', 'justifyLeft'], center: ['center', 'Centralizar', 'justifyCenter'], right: ['right', 'Alinhar à direita', 'justifyRight'], justify: ['justify', 'Justificar', 'justifyFull'] } as const;

  const paleta = (alvo: 'cor' | 'fundo') => (
    <div className="obs-pop obs-paleta" role="dialog" aria-label={alvo === 'cor' ? 'Cor do texto' : 'Cor de destaque'} onMouseDown={(e) => e.preventDefault()}>
      <button type="button" className="obs-redef" onClick={() => fazer(alvo === 'cor' ? 'foreColor' : 'hiliteColor', alvo === 'cor' ? '#1f1f1f' : 'transparent')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2c1.85 0 3.55.63 4.9 1.69L5.69 16.9A8 8 0 0 1 12 4zm0 16c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A8 8 0 0 1 12 20z" /></svg>
        {alvo === 'cor' ? 'Redefinir' : 'Nenhuma'}
      </button>
      <div className="obs-grade">
        {PALETA.flat().map((c) => (
          <button key={c} type="button" className="obs-cor" style={{ background: c }} title={NOMES_COR[c] ?? c} aria-label={NOMES_COR[c] ?? c}
            onClick={() => { setSt((o) => ({ ...o, [alvo]: c })); fazer(alvo === 'cor' ? 'foreColor' : 'hiliteColor', c); }} />
        ))}
      </div>
      <div className="obs-pal-t">Cores da BKM</div>
      <div className="obs-grade">
        {BKM.map((c) => (
          <button key={c} type="button" className="obs-cor" style={{ background: c }} title={c} aria-label={c}
            onClick={() => { setSt((o) => ({ ...o, [alvo]: c })); fazer(alvo === 'cor' ? 'foreColor' : 'hiliteColor', c); }} />
        ))}
      </div>
    </div>
  );

  /* fecha o menu aberto no clique fora */
  const barra = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const f = (e: MouseEvent) => { if (!barra.current?.contains(e.target as Node)) setMenu(''); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMenu(''); restaurar(); } };
    document.addEventListener('mousedown', f);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', esc, true); };
  }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="obs" ref={raiz}>
      <div className="obs-barra" ref={barra} role="toolbar" aria-label="Formatação">
        <Bt t="Desfazer" k={ctrl + 'Z'} on={() => fazer('undo')}><Svg n="undo" /></Bt>
        <Bt t="Refazer" k={ctrl + 'Y'} on={() => fazer('redo')}><Svg n="redo" /></Bt>
        {sep}
        <div className="obs-grp">
          <button type="button" className="obs-dd obs-dd-estilo" aria-haspopup="menu" aria-expanded={menu === 'estilo'} title="Estilos"
            onMouseDown={(e) => e.preventDefault()} onClick={() => abrirMenu('estilo')}>
            <span>{nomeEstilo}</span><Svg n="seta" s={18} />
          </button>
          {menu === 'estilo' && (
            <div className="obs-pop obs-menu" role="menu">
              {ESTILOS.map(([b, n]) => (
                <button key={b} type="button" role="menuitemradio" aria-checked={st.bloco === b} className={'obs-mi obs-mi-' + b}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => fazer('formatBlock', b)}>{n}</button>
              ))}
            </div>
          )}
        </div>
        {sep}
        <span className="obs-tamgrp">
        <Bt t="Diminuir tamanho da fonte" k={ctrl + 'Shift+,'} on={() => tamanho(proximo(st.pt, -1))}><Svg n="menos" s={18} /></Bt>
        <div className="obs-grp">
          <input className="obs-tam" aria-label="Tamanho da fonte" title="Tamanho da fonte" value={st.pt} inputMode="numeric" data-enter="manter"
            onMouseDown={() => guardar()}
            onFocus={(e) => { setMenu('tam'); e.currentTarget.select(); }}
            onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); setSt((o) => ({ ...o, pt: Number.isFinite(n) ? n : o.pt })); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tamanho(st.pt); setMenu(''); } }} />
          {menu === 'tam' && (
            <div className="obs-pop obs-menu obs-tams" role="menu">
              {TAMANHOS.map((n) => (
                <button key={n} type="button" role="menuitemradio" aria-checked={st.pt === n} className="obs-mi"
                  onMouseDown={(e) => e.preventDefault()} onClick={() => { tamanho(n); setMenu(''); }}>{n}</button>
              ))}
            </div>
          )}
        </div>
        <Bt t="Aumentar tamanho da fonte" k={ctrl + 'Shift+.'} on={() => tamanho(proximo(st.pt, 1))}><Svg n="mais" s={18} /></Bt>
        </span>
        {sep}
        <Bt t="Negrito" k={ctrl + 'B'} ativo={st.b} on={() => fazer('bold')}><Svg n="bold" /></Bt>
        <Bt t="Itálico" k={ctrl + 'I'} ativo={st.i} on={() => fazer('italic')}><Svg n="italic" /></Bt>
        <Bt t="Sublinhado" k={ctrl + 'U'} ativo={st.u} on={() => fazer('underline')}><Svg n="underline" /></Bt>
        <Bt t="Tachado" k={ctrl + 'Shift+X'} ativo={st.s} on={() => fazer('strikeThrough')}><Svg n="strike" /></Bt>
        <div className="obs-grp">
          <Bt t="Cor do texto" ativo={menu === 'cor'} on={() => abrirMenu('cor')}><Svg n="letra"><rect x="3" y="19" width="18" height="3.5" rx="1" fill={st.cor} /></Svg></Bt>
          {menu === 'cor' && paleta('cor')}
        </div>
        <div className="obs-grp">
          <Bt t="Cor de destaque" ativo={menu === 'fundo'} on={() => abrirMenu('fundo')}><Svg n="marca"><rect x="3" y="19.5" width="18" height="3.5" rx="1" fill={st.fundo} /></Svg></Bt>
          {menu === 'fundo' && paleta('fundo')}
        </div>
        {sep}
        <div className="obs-grp">
          <Bt t="Inserir link" k={ctrl + 'K'} ativo={menu === 'link'} on={pedirLink}><Svg n="link" /></Bt>
          {menu === 'link' && (
            <div className="obs-pop obs-link" role="dialog" aria-label="Link">
              <input autoFocus placeholder="Cole ou digite um link" value={url} data-enter="manter" onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aplicarLink(); } }} />
              <button type="button" className="btn primary sm" onClick={aplicarLink}>Aplicar</button>
            </div>
          )}
        </div>
        {sep}
        <div className="obs-grp">
          <button type="button" className={'obs-bt obs-bt-dd' + (menu === 'alin' ? ' on' : '')} aria-haspopup="menu" aria-expanded={menu === 'alin'} title="Alinhar" aria-label="Alinhar"
            onMouseDown={(e) => { e.preventDefault(); guardar(); }} onClick={() => abrirMenu('alin')}>
            <Svg n={ALIN[st.alin as keyof typeof ALIN][0]} /><Svg n="seta" s={16} />
          </button>
          {menu === 'alin' && (
            <div className="obs-pop obs-menu obs-alin" role="menu">
              {Object.values(ALIN).map(([n, t, c]) => (
                <button key={n} type="button" role="menuitemradio" aria-checked={st.alin === n} className={'obs-bt' + (st.alin === n ? ' on' : '')} title={t} aria-label={t}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => fazer(c)}><Svg n={n} /></button>
              ))}
            </div>
          )}
        </div>
        <Bt t="Lista com marcadores" k={ctrl + 'Shift+8'} ativo={st.ul} on={() => fazer('insertUnorderedList')}><Svg n="ul" /></Bt>
        <Bt t="Lista numerada" k={ctrl + 'Shift+7'} ativo={st.ol} on={() => fazer('insertOrderedList')}><Svg n="ol" /></Bt>
        <Bt t="Diminuir recuo" k={ctrl + '['} on={() => fazer('outdent')}><Svg n="outdent" /></Bt>
        <Bt t="Aumentar recuo" k={ctrl + ']'} on={() => fazer('indent')}><Svg n="indent" /></Bt>
        {sep}
        <Bt t="Limpar formatação" k={ctrl + '\\'} on={() => fazer('removeFormat')}><Svg n="limpar" /></Bt>
        <span className="obs-situ" aria-live="polite">{situacao === 'salvando' ? 'Salvando…' : situacao === 'salvo' ? 'Salvo' : ''}</span>
      </div>
      <div ref={ed} className="obs-doc obs-ed" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
        aria-label="Observações e Premissas" data-ph="Escreva as observações e as premissas deste estudo"
        onInput={() => { trocarFont(); agendar(); }} onBlur={salvar} onKeyDown={teclas} onPaste={colar}
        onMouseUp={() => { pendentePt.current = null; ler(); }} onKeyDownCapture={(e) => {
          if ((e.ctrlKey || e.metaKey) && (e.key === '[' || e.key === ']')) { e.preventDefault(); fazer(e.key === '[' ? 'outdent' : 'indent'); }
          else if (!e.ctrlKey && !e.metaKey && /^Arrow/.test(e.key)) pendentePt.current = null;
        }} />
    </div>
  );
}

function proximo(pt: number, dir: 1 | -1) {
  if (dir > 0) return TAMANHOS.find((n) => n > pt) ?? Math.min(96, pt + 1);
  return [...TAMANHOS].reverse().find((n) => n < pt) ?? Math.max(6, pt - 1);
}
