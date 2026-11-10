/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';

// Marcar pessoas com @ (pedido do Moises, 9/nov/2026; proto_pessoa.js e proto_mencao.js). Duas peças:
// - MarcarPessoas: campo de chips onde se digita @ e o nome e escolhe na lista (colegas da BKM e, onde se pede,
//   as pessoas de fora cadastradas no terreno com e-mail); a busca é aproximada, sem acento nem caixa, com as letras
//   na ordem, e quem começa com o digitado vem primeiro. Setas, Enter ou Tab escolhem; Esc fecha; Backspace no campo
//   vazio tira o último; com `livre`, Enter ou vírgula sem escolha na lista guarda o nome digitado.
// - TextoMencao: input ou textarea que abre a lista dos colegas ao digitar @ e põe o @ escolhido no texto. O banco
//   (app.tg_mencoes) avisa quem entrou no texto.

export type Lado = 'bkm' | 'vendedor' | 'corretor' | 'outro';
export interface Gente {
  /** chave estável: u:<user_id>, p:<pessoa_id>, e:<email> */
  k: string;
  nome: string;
  /** o que vai na direita da lista: @arroba ou papel · e-mail */
  sub: string;
  user_id?: string;
  pessoa_id?: string;
  email?: string;
  arroba?: string;
  lado: Lado;
}
/** pessoa escolhida no campo; `id` é o do participante já gravado; sem k na lista = nome digitado */
export interface Marcado { k: string; nome: string; user_id?: string; pessoa_id?: string; email?: string; lado: Lado; id?: string }

export const norm = (x: string) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function nota(nome: string, arroba: string, q: string): number | null {
  if (!q) return 1;
  const n = norm(nome), a = arroba || '', ws = n.split(/\s+/);
  if ((a && a.startsWith(q)) || n.startsWith(q)) return 0;
  if (ws.some((w) => w.startsWith(q)) || (a && a.split('.').some((w) => w.startsWith(q)))) return 1;
  if (n.includes(q) || (a && a.includes(q))) return 2;
  let i = 0;
  for (const c of n.replace(/\s+/g, '')) if (c === q[i]) i++;
  return i === q.length ? 3 : null;
}
/** busca aproximada: letras na ordem, sem acento, quem começa com o digitado primeiro */
export function buscarGente(lista: Gente[], txt: string, max = 7): Gente[] {
  const q = norm(txt).replace(/^@/, '').trim(), qs = q.replace(/\s+/g, '');
  return lista.map((x) => ({ x, n: nota(x.nome, x.arroba ?? '', qs) ?? (q.includes(' ') ? nota(x.nome, x.arroba ?? '', q) : null) }))
    .filter((r) => r.n != null).sort((a, b) => a.n! - b.n! || (a.x.user_id ? 0 : 1) - (b.x.user_id ? 0 : 1) || a.x.nome.localeCompare(b.x.nome))
    .slice(0, max).map((r) => r.x);
}

const PAPEL: Record<string, [string, Lado]> = {
  proprietario: ['Proprietário', 'vendedor'], conjuge: ['Cônjuge', 'vendedor'], parente: ['Parente', 'vendedor'],
  representante: ['Representante', 'outro'], procurador: ['Procurador', 'outro'], contato: ['Contato', 'outro'], outro: ['Outro', 'outro'],
};

/** colegas da BKM (com o @) e as pessoas de fora do terreno que têm e-mail: proprietários e demais pessoas das partes,
    corretores do terreno e o contato principal de cada parte */
export function useGente(terrenoId: string | null) {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['gente', empresa?.id, terrenoId], enabled: !!empresa, staleTime: 60_000,
    queryFn: async () => {
      const nada = Promise.resolve({ data: [], error: null });
      const [mb, us, tp, tc, pt] = await Promise.all([
        supabase.from('membros').select('user_id,nome').eq('empresa_id', empresa!.id),
        supabase.from('usuarios').select('user_id,nome,email,arroba'),
        terrenoId ? supabase.from('terreno_pessoas').select('papel,pessoa_id,pessoas(nome_razao_social,email)').eq('terreno_id', terrenoId) : nada,
        terrenoId ? supabase.from('terreno_corretores').select('corretores(pessoa_id,pessoas(nome_razao_social,email))').eq('terreno_id', terrenoId) : nada,
        terrenoId ? supabase.from('terreno_partes').select('nome,pessoa_nome,email').eq('terreno_id', terrenoId).eq('ativa', true) : nada,
      ]);
      for (const r of [mb, us, tp, tc, pt]) if (r.error) throw r.error;
      const U = new Map(((us.data ?? []) as any[]).map((u) => [u.user_id, u]));
      const bkm: Gente[] = ((mb.data ?? []) as any[]).map((m) => {
        const u = U.get(m.user_id) ?? {};
        const nome = u.nome || m.nome || u.email || 'Colega';
        return { k: 'u:' + m.user_id, nome, sub: u.arroba ? '@' + u.arroba : '', user_id: m.user_id, arroba: u.arroba ?? '', email: u.email ?? undefined, lado: 'bkm' as Lado };
      }).sort((a, b) => a.nome.localeCompare(b.nome));
      const fora: Gente[] = [], vistos = new Set<string>();
      const por = (g: Gente) => { const e = (g.email ?? '').toLowerCase(); if (!e || vistos.has(e)) return; vistos.add(e); fora.push(g); };
      for (const x of (tp.data ?? []) as any[]) {
        const p = x.pessoas, [rot, lado] = PAPEL[x.papel] ?? ['Pessoa', 'outro' as Lado];
        if (p?.email) por({ k: 'p:' + x.pessoa_id, nome: p.nome_razao_social, sub: `${rot} · ${p.email}`, pessoa_id: x.pessoa_id, email: p.email, lado });
      }
      for (const x of (tc.data ?? []) as any[]) {
        const c = x.corretores, p = c?.pessoas;
        if (p?.email) por({ k: 'p:' + c.pessoa_id, nome: p.nome_razao_social, sub: `Corretor · ${p.email}`, pessoa_id: c.pessoa_id, email: p.email, lado: 'corretor' });
      }
      for (const x of (pt.data ?? []) as any[]) {
        if (x.email) por({ k: 'e:' + x.email, nome: x.pessoa_nome || x.nome, sub: `${x.nome} · ${x.email}`, email: x.email, lado: 'vendedor' });
      }
      fora.sort((a, b) => a.nome.localeCompare(b.nome));
      return { bkm, fora };
    },
  });
}

/** lista flutuante (a mesma .mn-pop do protótipo), presa ao campo */
function Lista({ itens, i, escolher, vazio, por }: { itens: Gente[]; i: number; escolher: (g: Gente) => void; vazio?: string; por: string }) {
  return (
    <div className="mn-pop mk-pop" role="listbox" id={por + '-l'} aria-label="Pessoas">
      {itens.length ? itens.map((g, j) => (
        <div key={g.k} id={`${por}-o${j}`} role="option" aria-selected={j === i} className="mn-i"
          onMouseDown={(e) => { e.preventDefault(); escolher(g); }}>
          <span className={`mk-av${g.user_id ? '' : ' fora'}`} aria-hidden>{(g.nome || '?').trim().charAt(0).toUpperCase()}</span>
          <span className="mn-n">{g.nome}</span>{g.sub && <span className="mn-a">{g.sub}</span>}
        </div>
      )) : <div className="mn-i faint">{vazio ?? 'Ninguém com esse nome'}</div>}
    </div>
  );
}

export function MarcarPessoas({ id, opcoes, valor, onChange, livre, placeholder, vazio }: {
  id: string; opcoes: Gente[]; valor: Marcado[]; onChange: (v: Marcado[]) => void; livre?: Lado; placeholder?: string; vazio?: string;
}) {
  const [txt, setTxt] = useState('');
  const [foco, setFoco] = useState(false);
  const [i, setI] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  const ja = new Set(valor.map((m) => m.k));
  const lista = buscarGente(opcoes.filter((g) => !ja.has(g.k)), txt);
  const aberto = foco && txt.trim() !== '';
  useEffect(() => { setI(0); }, [txt]);
  const poe = (m: Marcado) => { onChange([...valor, m]); setTxt(''); };
  const escolher = (g: Gente) => poe({ k: g.k, nome: g.nome, user_id: g.user_id, pessoa_id: g.pessoa_id, email: g.pessoa_id || g.user_id ? undefined : g.email, lado: g.lado });
  const digitado = () => {
    const n = txt.replace(/^@/, '').replace(/,$/, '').trim();
    if (!n || !livre) { setTxt(''); return; }
    if (valor.some((m) => norm(m.nome) === norm(n))) { setTxt(''); return; }
    poe({ k: 'n:' + n.toLowerCase(), nome: n, lado: livre });
  };
  const tecla = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && aberto && lista.length) { e.preventDefault(); setI((i + 1) % lista.length); }
    else if (e.key === 'ArrowUp' && aberto && lista.length) { e.preventDefault(); setI((i - 1 + lista.length) % lista.length); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && aberto) {
      if (lista.length) { e.preventDefault(); escolher(lista[i]); }
      else if (livre && e.key === 'Enter') { e.preventDefault(); digitado(); }
    } else if (e.key === 'Enter') e.preventDefault();
    else if (e.key === ',' && livre && txt.trim()) { e.preventDefault(); digitado(); }
    else if (e.key === 'Escape' && aberto) { e.preventDefault(); e.stopPropagation(); setTxt(''); }
    else if (e.key === 'Backspace' && !txt && valor.length) onChange(valor.slice(0, -1));
  };
  return (
    <div className={`mkp${foco ? ' foco' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); inp.current?.focus(); } }}>
      {valor.map((m) => (
        <span key={m.k} className={`mk-chip${m.user_id ? ' bkm' : ''}`} title={m.email || undefined}>
          {m.user_id || m.pessoa_id || m.email ? '@' : ''}{m.nome}
          <button type="button" aria-label={`Tirar ${m.nome}`} onClick={() => onChange(valor.filter((x) => x.k !== m.k))}>×</button>
        </span>
      ))}
      <input ref={inp} id={id} value={txt} autoComplete="off" role="combobox" aria-expanded={aberto} aria-controls={id + '-l'}
        aria-activedescendant={aberto && lista.length ? `${id}-o${i}` : undefined} data-sem-enter
        placeholder={valor.length ? '' : placeholder} onChange={(e) => setTxt(e.target.value)} onKeyDown={tecla}
        onFocus={() => setFoco(true)} onBlur={() => { setFoco(false); digitado(); }} />
      {aberto && <Lista itens={lista} i={i} escolher={escolher} por={id} vazio={livre ? `Enter guarda "${txt.replace(/^@/, '').trim()}" sem cadastro` : vazio} />}
    </div>
  );
}

/** input ou textarea com a lista dos colegas ao digitar @ (o @ escolhido entra no texto) */
export function TextoMencao({ id, value, onChange, colegas, area, placeholder }: {
  id: string; value: string; onChange: (v: string) => void; colegas: Gente[]; area?: boolean; placeholder?: string;
}) {
  const { membro } = useSessao();
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [mn, setMn] = useState<{ ini: number; fim: number; q: string } | null>(null);
  const [i, setI] = useState(0);
  const lista = mn ? buscarGente(colegas.filter((g) => g.arroba && g.user_id !== membro?.user_id), mn.q, 6) : [];
  const olhar = (el: HTMLInputElement | HTMLTextAreaElement) => {
    const pos = el.selectionStart ?? el.value.length, m = /(?:^|[^A-Za-z0-9._@-])@([A-Za-z0-9._-]{0,40})$/.exec(el.value.slice(0, pos));
    if (!m) { setMn(null); return; }
    setMn({ ini: pos - m[1].length - 1, fim: pos, q: m[1] }); setI(0);
  };
  const escolher = (g: Gente) => {
    if (!mn) return;
    const novo = value.slice(0, mn.ini) + '@' + g.arroba + ' ' + value.slice(mn.fim), pos = mn.ini + g.arroba!.length + 2;
    onChange(novo); setMn(null);
    requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(pos, pos); } });
  };
  const aberto = !!mn && lista.length > 0;
  const tecla = (e: KeyboardEvent) => {
    if (!aberto) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((i + 1) % lista.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((i - 1 + lista.length) % lista.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); escolher(lista[i]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMn(null); }
  };
  const props = {
    ref, id, value, placeholder, autoComplete: 'off', 'aria-autocomplete': 'list' as const, 'aria-controls': aberto ? id + '-l' : undefined,
    'aria-activedescendant': aberto ? `${id}-o${i}` : undefined, ...(aberto ? { 'data-sem-enter': '' } : {}),
    onChange: (e: any) => { onChange(e.target.value); olhar(e.target); }, onKeyDown: tecla,
    onClick: (e: any) => olhar(e.target), onBlur: () => setTimeout(() => setMn(null), 120),
  };
  return (
    <div className="mk-txt">
      {area ? <textarea {...props} /> : <input {...props} />}
      {aberto && <Lista itens={lista} i={i} escolher={escolher} por={id} />}
    </div>
  );
}

/** texto com os @ dos colegas destacados */
export function ComMencoes({ texto, colegas }: { texto: string; colegas: Gente[] }): ReactNode {
  const ar = new Set(colegas.map((g) => g.arroba).filter(Boolean));
  const partes: ReactNode[] = [];
  const re = /(^|[^A-Za-z0-9._@-])@([A-Za-z0-9][A-Za-z0-9._-]{0,39})/g;
  let ult = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(texto))) {
    const k = m[2].toLowerCase().replace(/[._-]+$/, '');
    if (!ar.has(k)) continue;
    const ini = m.index + m[1].length;
    partes.push(texto.slice(ult, ini), <span key={n++} className="mencao">@{k}</span>);
    ult = ini + 1 + k.length;
  }
  partes.push(texto.slice(ult));
  return <>{partes}</>;
}
