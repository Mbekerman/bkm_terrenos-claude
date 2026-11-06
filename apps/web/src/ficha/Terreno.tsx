/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { reais as brl, m2 } from '../lib/format';
import { Adorno, formatar, metros } from '../lib/mascara';
import type { Ficha, R } from './dados';
import PartesLotes from './Partes';
import {
  CampoInp, CamposEndereco, fmtCampo, lerNum, municipioId, num, OPT, Quadro, SECOES, useListas, useSalvar, valoresDe,
  dadosDe, type EndGoogle, abrirQuadro, focar, tomarPedido,
} from './edicao';

// Aba Terreno da ficha (proto.js › abaCadastro): Identificação, Endereço e localização, Áreas e dimensões, Características
// físicas e Proprietários e contatos; Partes e Matrículas e SQLs (etiquetas) em Partes.tsx.

/** estado de edição de uma seção (ou de uma linha do Resumo): uma de cada vez */
export function useEdicao(f: Ficha) {
  const [edit, setEdit] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [mun, setMun] = useState<EndGoogle | null>(null);
  const [gravando, setGravando] = useState(false);
  const salvarT = useSalvar(f);
  const toast = useToast();
  const abrir = (id: string, ks: string[], extra: Record<string, string> = {}) => { setVals({ ...valoresDe(f.t, ks), ...extra }); setMun(null); setEdit(id); };
  const mudar = (k: string, v: string) => setVals((o) => ({ ...o, [k]: v }));
  const fechar = () => setEdit(null);
  /** grava os dados montados por `montar`; se `montar` devolve string, é o aviso de erro */
  const salvar = async (ev: FormEvent, montar: () => Promise<R | string> | R | string) => {
    ev.preventDefault();
    if (gravando) return;
    setGravando(true);
    try {
      const d = await montar();
      if (typeof d === 'string') { toast(d); return; }
      if (await salvarT(d)) setEdit(null);
    } catch (e: any) { toast(e?.message ?? String(e)); } finally { setGravando(false); }
  };
  return { edit, vals, mun, setMun, abrir, mudar, fechar, salvar, gravando };
}
export type Edicao = ReturnType<typeof useEdicao>;

const ni = <span className="v ni">Não informado</span>;
/** Cancelar e Salvar no título do quadro, no lugar do Editar */
const peH = (e: Edicao) => <><button type="button" className="btn text sm" onClick={e.fechar}>Cancelar</button><button className="btn primary sm" disabled={e.gravando}>Salvar</button></>;
const editar = (on: () => void) => <button className="btn text sm" onClick={on}><Ic n="edit" s={16} />Editar</button>;

/** dados do endereço: o que o formulário mostra mais o município trocado pela busca; com poligonal, o pino é o centro dela
    e a busca não o move */
export async function dadosEndereco(f: Ficha, e: Edicao, ks: string[]): Promise<R> {
  const campos = SECOES.loc.campos.filter((c) => ks.includes(c[0]));
  const d = dadosDe(e.vals, campos);
  if (f.poly) { delete d.latitude; delete d.longitude; }
  const m = await municipioId(e.mun, f);
  if (m != null) d.municipio_id = m;
  return d;
}

function SecGenerica({ f, id, e, primeiro }: { f: Ficha; id: 'ident' | 'loc' | 'fis'; e: Edicao; primeiro?: boolean }) {
  const { edita } = useSessao();
  const listas = useListas().data;
  const s = SECOES[id], ed = e.edit === id, t = f.t;
  const ks = s.campos.map((c) => c[0]);
  /* lendo ou editando, a mesma grade no mesmo lugar: editando, o valor vira campo só com a linha embaixo e
     Cancelar e Salvar sobem para o título; o quadro não muda de tamanho (pedido do Moisés, 5/nov/2026) */
  const vis = s.campos.filter((c) => !['latitude', 'longitude'].includes(c[0]));
  const corpo = (
    <div className="sec-b"><div className={`kvg${ed ? ' kvg-ed' : ''}`}>{vis.map((c) => {
      if (ed) return <CampoInp key={c[0]} f={f} c={c} vals={e.vals} mudar={e.mudar} listas={listas} inl />;
      const v = fmtCampo(f, c, listas);
      return <div key={c[0]} className={c[4] || ''}><div className="k">{c[1]}</div>{v == null ? ni : <div className="v">{v}</div>}</div>;
    })}</div>
      {id === 'fis' && t.area_construida_existente_m2 != null && t.area_construida_demolir_m2 != null && +t.area_construida_demolir_m2 < +t.area_construida_existente_m2
        && <div className="hint" style={{ marginTop: 10 }}>Demolição parcial: {m2(t.area_construida_existente_m2 - t.area_construida_demolir_m2)} permanecem.</div>}</div>
  );
  const montar = async () => {
    if (id === 'loc') return dadosEndereco(f, e, ks);
    const d = dadosDe(e.vals, s.campos);
    if (id === 'ident' && !d.nome) return 'O nome de referência é obrigatório.';
    return d;
  };
  return (
    <Quadro aba="terreno" id={id} primeiro={primeiro} titulo={s.titulo} aberto={ed}
      acoes={ed ? <div className="qd-acoes">{id === 'loc' && <CamposEndereco f={f} vals={e.vals} mudar={e.mudar} mun={e.mun} setMun={e.setMun} soBusca />}{peH(e)}</div>
        : edita ? editar(() => e.abrir(id, ks)) : undefined}
      form={ed ? (c) => <form onSubmit={(ev) => e.salvar(ev, montar)} onKeyDown={(ev) => { if (ev.key === 'Escape') e.fechar(); }}>{c}</form> : undefined}>
      {corpo}
    </Quadro>
  );
}

const AREAS: [string, string, string, string][] = [['area_documental_m2', 'Documental', 'documental', 'matrícula'], ['area_cadastral_m2', 'Cadastral', 'cadastral', 'IPTU'],
  ['area_levantamento_m2', 'Levantamento', 'levantamento', 'topografia'], ['estimativa', 'Estimativa', 'estimativa', 'sem documento']];
/** a estimativa não tem coluna própria: é a área adotada quando a fonte é a estimativa */
const estimativa = (t: R) => (t.fonte_area_adotada === 'estimativa' ? t.area_adotada_m2 : null);
export const valoresArea = (t: R) => ({ ...valoresDe(t, ['area_documental_m2', 'area_cadastral_m2', 'area_levantamento_m2', 'testada_principal_m', 'fonte_area_adotada']),
  estimativa: estimativa(t) == null ? '' : String(estimativa(t)).replace('.', ',') });
/** áreas do formulário → dados; a área adotada é a da fonte escolhida (a da poligonal o banco calcula) */
export function dadosArea(f: Ficha, v: Record<string, string>): R | string {
  const d: R = {
    area_documental_m2: lerNum(v.area_documental_m2), area_cadastral_m2: lerNum(v.area_cadastral_m2), area_levantamento_m2: lerNum(v.area_levantamento_m2),
    testada_principal_m: lerNum(v.testada_principal_m),
  };
  for (const k of Object.keys(d)) if (d[k] != null && !(d[k] > 0)) return 'As áreas e a testada precisam ser maiores que zero.';
  const fonte = v.fonte_area_adotada || null, est = lerNum(v.estimativa);
  if (est != null && !(est > 0)) return 'As áreas e a testada precisam ser maiores que zero.';
  d.fonte_area_adotada = fonte;
  if (!fonte) d.area_adotada_m2 = null;
  else if (fonte === 'poligonal') { if (!f.poly) return 'O terreno não tem poligonal.'; d.area_adotada_m2 = f.t.area_adotada_m2 ?? 1; }
  else {
    const a = fonte === 'estimativa' ? est : d[`area_${fonte}_m2`];
    if (a == null) return `Preencha a área ${OPT.fonteArea[fonte].split(' (')[0].toLowerCase()} ou escolha outra fonte.`;
    d.area_adotada_m2 = a;
  }
  return d;
}
export const numInp = (e: Edicao, k: string, l: string, ph = 'm²', pre = 'f') => (
  <div className="field" key={k}><label htmlFor={`${pre}-${k}`}>{l}</label><input id={`${pre}-${k}`} inputMode="decimal" placeholder={ph} value={e.vals[k] ?? ''} onChange={(ev) => e.mudar(k, ev.target.value)} /></div>
);
export const fonteSel = (e: Edicao, id: string, vazio: string) => (
  <select id={id} value={e.vals.fonte_area_adotada ?? ''} onChange={(ev) => e.mudar('fonte_area_adotada', ev.target.value)}>
    <option value="">{vazio}</option>{Object.entries(OPT.fonteArea).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
  </select>
);

function SecAreas({ f, e }: { f: Ficha; e: Edicao }) {
  const { edita } = useSessao();
  const t = f.t, ed = e.edit === 'areas', ad = t.area_adotada_m2 as number | null, apol = t.area_poligonal_m2 as number | null;
  const cards: [number | null, string, string, string][] = [...AREAS.map(([k, l, fo, s]) => [k === 'estimativa' ? estimativa(t) : t[k], l, fo, s] as [number | null, string, string, string]),
    [apol, 'Poligonal', 'poligonal', 'desenho']];
  const pre = cards.map((c) => c[0]).filter((v): v is number => v != null).map(Number);
  let div: ReactNode = null;
  if (pre.length > 1) {
    const mx = Math.max(...pre), mn = Math.min(...pre);
    if ((mx - mn) / mx > 0.01) div = <div className="diverg"><Ic n="warn" s={16} />Diferença de {m2(mx - mn)} ({num(((mx - mn) / mx) * 100, 1)}%) entre as fontes. Confira qual entra na viabilidade.</div>;
  }
  /* clicar numa área preenchida a escolhe como adotada: lendo, grava na hora; editando, vale ao salvar (pedido do Moisés, 5/nov/2026) */
  const salvarT = useSalvar(f);
  const [grav, setGrav] = useState(false);
  const valor = (k: string, fo: string, v: number | null) => (ed ? (fo === 'poligonal' ? apol : lerNum(e.vals[k])) : v);
  const fonte = ed ? e.vals.fonte_area_adotada || null : t.fonte_area_adotada;
  const escolher = async (fo: string) => {
    if (ed) { e.mudar('fonte_area_adotada', fo); return; }
    if (grav || fo === t.fonte_area_adotada) return;
    const d = dadosArea(f, { ...valoresArea(t), fonte_area_adotada: fo });
    if (typeof d === 'string') return;
    setGrav(true);
    try { await salvarT({ fonte_area_adotada: d.fonte_area_adotada, area_adotada_m2: d.area_adotada_m2 }); } finally { setGrav(false); }
  };
  const corpo = (
    <div className="sec-b">
      <div className="areas">{cards.map(([v, l, fo, s], i) => {
        const k = i < AREAS.length ? AREAS[i][0] : '', val = valor(k, fo, v), pode = edita && val != null, sel = fonte === fo;
        return (
          <div key={fo} className={`area${sel ? ' sel' : ''}${pode ? ' pode' : ''}`} id={`area-${fo}`}
            role={pode ? 'radio' : undefined} aria-checked={pode ? sel : undefined} tabIndex={pode ? 0 : undefined}
            title={pode && !sel ? 'Usar como área adotada' : fo === 'poligonal' ? 'Calculada pelo desenho; muda quando a poligonal é ajustada' : undefined}
            onClick={(ev) => { if (pode && !(ev.target as HTMLElement).closest('input')) escolher(fo); }}
            onKeyDown={(ev) => { if (pode && (ev.key === 'Enter' || ev.key === ' ') && !(ev.target as HTMLElement).closest('input')) { ev.preventDefault(); escolher(fo); } }}>
            <div className="al">{l} <span className="faint">· {s}</span></div>
            {ed && fo !== 'poligonal'
              ? <input className="av inl" id={`f-${k}`} inputMode="decimal" placeholder="m²" aria-label={`Área ${l.toLowerCase()} (m²)`} value={e.vals[k] ?? ''} onChange={(ev) => e.mudar(k, ev.target.value)} />
              : <div className="av">{val == null ? <span className="faint" style={{ fontSize: 14, fontStyle: 'italic' }}>{fo === 'poligonal' ? 'Sem poligonal' : 'Não informada'}</span> : m2(val)}</div>}
            <div className="as">{sel ? <><Ic n="check" s={14} />Área adotada</> : '\u00a0'}</div>
          </div>
        );
      })}</div>
      {div}
      <div className={`kvg${ed ? ' kvg-ed' : ''}`} style={{ marginTop: 14 }}>
        <div><div className="k">Área adotada</div>{fonte ? <div className="v">{OPT.fonteArea[fonte]?.split(' (')[0]}</div> : <span className="v ni">{edita ? 'Clique na área que vale' : 'Não informada'}</span>}</div>
        {ed
          ? <div className="inl-c"><label className="k" htmlFor="f-testada_principal_m">Testada principal</label><input id="f-testada_principal_m" inputMode="decimal" data-fmt="m" placeholder="metros" value={e.vals.testada_principal_m ?? ''} onChange={(ev) => e.mudar('testada_principal_m', ev.target.value)} /></div>
          : <div><div className="k">Testada principal</div>{t.testada_principal_m == null ? ni : <div className="v">{metros(t.testada_principal_m)} m</div>}</div>}
        <div><div className="k">Valor pedido por m²</div>{ad && f.valorPedido ? <div className="v">{brl(f.valorPedido / ad)}</div> : ni}</div>
      </div>
    </div>
  );
  return (
    <Quadro aba="terreno" id="areas" titulo="Áreas e dimensões" aberto={ed}
      acoes={ed ? <div className="qd-acoes">{peH(e)}</div> : edita ? editar(() => e.abrir('areas', [], valoresArea(t))) : undefined}
      form={ed ? (c) => <form onSubmit={(ev) => e.salvar(ev, () => dadosArea(f, e.vals))} onKeyDown={(ev) => { if (ev.key === 'Escape') e.fechar(); }}>{c}</form> : undefined}>
      {corpo}
    </Quadro>
  );
}

function SecPessoas({ f }: { f: Ficha }) {
  const { edita, empresa } = useSessao();
  const qc = useQueryClient(), toast = useToast();
  const q = useQuery({
    queryKey: ['ficha-pessoas', f.id],
    queryFn: async () => {
      const [p, pt] = await Promise.all([
        supabase.from('terreno_pessoas').select('id,papel,percentual_participacao,parte_id,pessoas(nome_razao_social,tipo_pessoa,telefone)').eq('terreno_id', f.id),
        supabase.from('terreno_partes').select('id,nome').eq('terreno_id', f.id).eq('ativa', true).order('criado_em'),
      ]);
      if (p.error) throw p.error;
      if (pt.error) throw pt.error;
      const ps = ((p.data ?? []) as R[]).sort((a, b) => String(a.pessoas?.nome_razao_social ?? '').localeCompare(b.pessoas?.nome_razao_social ?? '', 'pt-BR'));
      return { pessoas: ps, partes: (pt.data ?? []) as R[] };
    },
  });
  const [nv, setNv] = useState({ nome: '', tipo: 'PF', papel: 'proprietario', pct: '', tel: '' });
  const [grav, setGrav] = useState(false);
  const recarregar = () => { qc.invalidateQueries({ queryKey: ['ficha-pessoas', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] }); };
  async function incluir(ev: FormEvent) {
    ev.preventDefault();
    if (!nv.nome.trim() || grav) return;
    const pct = nv.papel === 'proprietario' ? lerNum(nv.pct) : null;
    if (pct != null && !(pct > 0 && pct <= 100)) { toast('A participação vai de 0 a 100%.'); return; }
    setGrav(true);
    try {
      const p = await supabase.from('pessoas').insert({ empresa_id: empresa!.id, tipo_pessoa: nv.tipo, nome_razao_social: nv.nome.trim(), telefone: nv.tel.replace(/\D/g, '') || null }).select('id').single();
      if (p.error) throw p.error;
      const v = await supabase.from('terreno_pessoas').insert({ empresa_id: empresa!.id, terreno_id: f.id, pessoa_id: p.data.id, papel: nv.papel, percentual_participacao: pct });
      if (v.error) throw v.error;
      setNv({ nome: '', tipo: 'PF', papel: 'proprietario', pct: '', tel: '' });
      recarregar();
    } catch (e: any) { toast(e?.message ?? String(e)); } finally { setGrav(false); }
  }
  async function tirar(id: string) {
    const { error } = await supabase.from('terreno_pessoas').delete().eq('id', id);
    if (error) toast(error.message); else recarregar();
  }
  async function parte(id: string, pid: string) {
    const { error } = await supabase.from('terreno_pessoas').update({ parte_id: pid || null }).eq('id', id);
    if (error) toast(error.message); else recarregar();
  }
  const ps = q.data?.pessoas ?? [], partes = q.data?.partes ?? [];
  const comParte = partes.length > 0;
  return (
    <Quadro aba="terreno" id="pessoas" titulo="Proprietários e contatos">
      <div className="sec-b">
        {q.isLoading ? <div className="muted">Carregando…</div> : ps.length ? (
          <div className="tblwrap"><table className="mini-tbl lst2"><thead><tr><th>Nome</th><th>Vínculo</th><th className="r">Participação</th><th>Telefone</th>{comParte && <th>Parte</th>}<th /></tr></thead><tbody>
            {ps.map((p) => (
              <tr key={p.id}>
                <td className="l1">{p.pessoas?.nome_razao_social} <span className="faint" style={{ fontSize: 12 }}>{p.pessoas?.tipo_pessoa}</span></td>
                <td>{OPT.papel[p.papel] ?? p.papel}</td>
                <td className={`r${p.percentual_participacao != null ? '' : ' l0'}`}>{p.percentual_participacao != null ? Number(p.percentual_participacao).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'}</td>
                <td className={`l2${p.pessoas?.telefone ? '' : ' l0'}`}>{p.pessoas?.telefone ? formatar(p.pessoas.telefone, 0, 'tel')[0] : '—'}</td>
                {comParte && <td>{edita ? <select aria-label="Parte" value={p.parte_id ?? ''} onChange={(ev) => parte(p.id, ev.target.value)}>
                  <option value="">—</option>{partes.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select> : partes.find((x) => x.id === p.parte_id)?.nome ?? '—'}</td>}
                <td className="r">{edita && <button className="iconbtn sm lixo" aria-label="Remover" title="Remover" onClick={() => tirar(p.id)}><Ic n="lixo" s={18} /></button>}</td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <div className="muted">Ninguém vinculado.</div>}
        {edita && (
          <form className="inline-form" onSubmit={incluir}>
            <div className="field grow"><label htmlFor="p-n">Nome ou razão social</label><input id="p-n" required value={nv.nome} onChange={(ev) => setNv({ ...nv, nome: ev.target.value })} /></div>
            <div className="field" style={{ flex: '0 1 120px' }}><label htmlFor="p-t">Tipo</label><select id="p-t" value={nv.tipo} onChange={(ev) => setNv({ ...nv, tipo: ev.target.value })}><option value="PF">PF</option><option value="PJ">PJ</option></select></div>
            <div className="field"><label htmlFor="p-p">Vínculo</label><select id="p-p" value={nv.papel} onChange={(ev) => setNv({ ...nv, papel: ev.target.value })}>{Object.entries(OPT.papel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field" style={{ flex: '0 1 120px' }}><label htmlFor="p-pc">Participação</label><Adorno t="pct"><input id="p-pc" inputMode="decimal" data-fmt="pct" disabled={nv.papel !== 'proprietario'} value={nv.pct} onChange={(ev) => setNv({ ...nv, pct: ev.target.value })} /></Adorno></div>
            <div className="field"><label htmlFor="p-tel">Telefone</label><input id="p-tel" inputMode="tel" data-fmt="tel" placeholder="(11) 98765-4321" value={nv.tel} onChange={(ev) => setNv({ ...nv, tel: ev.target.value })} /></div>
            <button className="btn sm" disabled={grav}><Ic n="add" s={16} />Adicionar</button>
          </form>
        )}
      </div>
    </Quadro>
  );
}

export default function AbaTerreno({ f }: { f: Ficha }) {
  const e = useEdicao(f);
  const [, re] = useState(0);
  /* "ir ao campo" vindo do que falta na ficha: abre o quadro (e a edição, nas seções que editam pelo Editar) e põe o foco */
  const eR = useRef(e);
  eR.current = e;
  useEffect(() => {
    const atender = () => {
      const p = tomarPedido();
      if (!p) return;
      const ed = eR.current;
      abrirQuadro('terreno', p.sec);
      if (p.sec === 'ident' || p.sec === 'loc' || p.sec === 'fis') ed.abrir(p.sec, SECOES[p.sec].campos.map((c) => c[0]));
      else if (p.sec === 'areas') ed.abrir('areas', [], valoresArea(f.t));
      else re((x) => x + 1);
      let alvo = p.campo === 'busca-end' ? 'f-busca-end' : /^(em-n|es-sql|p-n)$/.test(p.campo ?? '') ? p.campo! : `f-${p.campo}`;
      if (p.campo === 'area') {
        /* área adotada: a primeira área preenchida (um clique a escolhe); sem nenhuma, o campo da documental */
        const fo = ['documental', 'cadastral', 'levantamento', 'poligonal'].find((x) => (x === 'poligonal' ? f.t.area_poligonal_m2 : f.t[`area_${x}_m2`]) != null);
        alvo = fo ? `area-${fo}` : 'f-area_documental_m2';
      }
      if (p.campo) focar(alvo);
    };
    atender();
    window.addEventListener('ficha-campo', atender);
    return () => window.removeEventListener('ficha-campo', atender);
  }, [f]);
  return (
    <div className="stack">
      <SecGenerica f={f} id="ident" e={e} primeiro />
      <SecGenerica f={f} id="loc" e={e} />
      <PartesLotes f={f} />
      <SecAreas f={f} e={e} />
      <SecGenerica f={f} id="fis" e={e} />
      <SecPessoas f={f} />
    </div>
  );
}
