/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRascunho } from '../components/Rascunho';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { LapisMapa } from '../novo/TrocarEndereco';
import { reais as brl, m2 } from '../lib/format';
import { Adorno, formatar, metros } from '../lib/mascara';
import type { Ficha, R } from './dados';
import PartesLotes from './Partes';
import {
  CampoVivo, fmtCampo, lerNum, num, OPT, Quadro, SECOES, useListas, useSalvar, useVivo, valoresDe,
  type VivoProps, abrirQuadro, focar, tomarPedido,
} from './edicao';

// Aba Terreno da ficha (proto.js › abaCadastro): Identificação, Endereço e localização, Áreas e dimensões, Características
// físicas e Proprietários e contatos; Partes e Matrículas e SQLs (etiquetas) em Partes.tsx.

const ni = <span className="v ni">Não informado</span>;

/** campos do endereço que só mudam pelo mapa (Editar no mapa: poligonal e pino) */
const END_MAPA = ['cep', 'logradouro', 'numero', 'bairro', 'municipio_id'];

/* lendo ou editando, a mesma grade no mesmo lugar: quem edita já vê o valor como campo, sem Editar nem Salvar, e cada
   campo grava ao sair dele (pedidos do Moisés, 5 e 6/nov/2026) */
function SecGenerica({ f, id, primeiro }: { f: Ficha; id: 'ident' | 'loc' | 'fis'; primeiro?: boolean }) {
  const { edita } = useSessao();
  const listas = useListas().data;
  const salvarT = useSalvar(f);
  const s = SECOES[id], t = f.t;
  const vis = s.campos.filter((c) => !['latitude', 'longitude'].includes(c[0]));
  return (
    <Quadro aba="terreno" id={id} primeiro={primeiro} titulo={s.titulo}
      acoes={edita && id === 'loc' ? <div className="qd-acoes"><LapisMapa codigo={f.codigo} id="f-end-mapa" className="btn sm text" rotulo="Editar no mapa" /></div> : undefined}>
      <div className="sec-b"><div className={`kvg${edita ? ' kvg-ed vivo' : ''}`}>{vis.map((c) => {
        /* o endereço não se edita na ficha: muda pelo mapa, com a poligonal e o pino (pedido do Moises, 6/nov/2026) */
        const so = id === 'loc' && END_MAPA.includes(c[0]);
        if (edita && !so) return <CampoVivo key={c[0]} f={f} c={c} listas={listas} salvar={salvarT} />;
        const v = fmtCampo(f, c, listas);
        return <div key={c[0]} className={`${c[4] || ''}${so && edita ? ' kv-so' : ''}`}><div className="k">{c[1]}</div>{v == null ? ni : <div className="v">{v}</div>}</div>;
      })}</div>
        {id === 'fis' && t.area_construida_existente_m2 != null && t.area_construida_demolir_m2 != null && +t.area_construida_demolir_m2 < +t.area_construida_existente_m2
          && <div className="hint" style={{ marginTop: 10 }}>Demolição parcial: {m2(t.area_construida_existente_m2 - t.area_construida_demolir_m2)} permanecem.</div>}</div>
    </Quadro>
  );
}

const AREAS: [string, string, string, string][] = [['area_documental_m2', 'Documental', 'documental', 'matrícula'], ['area_cadastral_m2', 'Cadastral', 'cadastral', 'IPTU'],
  ['area_levantamento_m2', 'Levantamento', 'levantamento', 'topografia'], ['estimativa', 'Estimativa', 'estimativa', 'sem documento']];
/** a estimativa não tem coluna própria: é a área adotada quando a fonte é a estimativa */
const estimativa = (t: R) => (t.fonte_area_adotada === 'estimativa' ? t.area_adotada_m2 : null);
export const valoresArea = (t: R): Record<string, string> => ({ ...valoresDe(t, ['area_documental_m2', 'area_cadastral_m2', 'area_levantamento_m2', 'testada_principal_m', 'fonte_area_adotada']),
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
export const fonteSel = (id: string, p: VivoProps, opts: [string, string][], vazio: string) => (
  <select id={id} {...p}><option value="">{vazio}</option>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
);

/** a área de uma fonte editada no lugar, dentro do cartão dela */
function AreaVivo({ f, k, l }: { f: Ficha; k: string; l: string }) {
  const salvarT = useSalvar(f), toast = useToast(), t = f.t;
  const ini = valoresArea(t)[k];
  const { props } = useVivo(ini, (v) => {
    const vals = { ...valoresArea(t), [k]: v };
    /* a estimativa não tem coluna: digitar é adotá-la; apagar a adotada deixa o terreno sem área adotada */
    if (k === 'estimativa') vals.fonte_area_adotada = v.trim() ? 'estimativa' : t.fonte_area_adotada === 'estimativa' ? '' : vals.fonte_area_adotada;
    else if (!v.trim() && t.fonte_area_adotada === k.replace(/^area_|_m2$/g, '')) vals.fonte_area_adotada = '';
    /* área do levantamento topográfico digitada vira a adotada; a pessoa pode trocar depois (pedido do Moisés, 6/nov/2026) */
    else if (k === 'area_levantamento_m2' && v.trim()) vals.fonte_area_adotada = 'levantamento';
    const d = dadosArea(f, vals);
    if (typeof d === 'string') { toast(d); return false; }
    return salvarT(d);
  });
  return <Adorno t="m2"><input className="av inl" id={`f-${k}`} inputMode="decimal" placeholder="—" aria-label={`Área ${l.toLowerCase()}`} {...props} /></Adorno>;
}
function TestadaVivo({ f }: { f: Ficha }) {
  const salvarT = useSalvar(f), toast = useToast();
  const { props } = useVivo(metros(f.t.testada_principal_m), (v) => {
    const n = lerNum(v);
    if (n != null && !(n > 0)) { toast('A testada precisa ser maior que zero.'); return false; }
    return salvarT({ testada_principal_m: n });
  });
  return <div className="inl-c"><label className="k" htmlFor="f-testada_principal_m">Testada principal</label>
    <Adorno t="m"><input id="f-testada_principal_m" inputMode="decimal" data-fmt="m" placeholder="Não informada" {...props} /></Adorno></div>;
}

function SecAreas({ f }: { f: Ficha }) {
  const { edita } = useSessao();
  const t = f.t, ad = t.area_adotada_m2 as number | null, apol = t.area_poligonal_m2 as number | null;
  const cards: [number | null, string, string, string][] = [...AREAS.map(([k, l, fo, s]) => [k === 'estimativa' ? estimativa(t) : t[k], l, fo, s] as [number | null, string, string, string]),
    [apol, 'Poligonal', 'poligonal', 'desenho']];
  const pre = cards.map((c) => c[0]).filter((v): v is number => v != null).map(Number);
  let div: ReactNode = null;
  if (pre.length > 1) {
    const mx = Math.max(...pre), mn = Math.min(...pre);
    if ((mx - mn) / mx > 0.01) div = <div className="diverg"><Ic n="warn" s={16} />Diferença de {m2(mx - mn)} ({num(((mx - mn) / mx) * 100, 1)}%) entre as fontes. Confira qual entra na viabilidade.</div>;
  }
  /* clicar numa área preenchida a escolhe como adotada e grava na hora (pedido do Moisés, 5/nov/2026) */
  const salvarT = useSalvar(f);
  const [grav, setGrav] = useState(false);
  const fonte = t.fonte_area_adotada;
  const escolher = async (fo: string) => {
    if (grav || fo === t.fonte_area_adotada) return;
    const d = dadosArea(f, { ...valoresArea(t), fonte_area_adotada: fo });
    if (typeof d === 'string') return;
    setGrav(true);
    try { await salvarT({ fonte_area_adotada: d.fonte_area_adotada, area_adotada_m2: d.area_adotada_m2 }); } finally { setGrav(false); }
  };
  return (
    <Quadro aba="terreno" id="areas" titulo="Áreas e dimensões">
      <div className="sec-b">
        <div className="areas">{cards.map(([v, l, fo, s], i) => {
          const k = i < AREAS.length ? AREAS[i][0] : '', pode = edita && v != null, sel = fonte === fo;
          return (
            <div key={fo} className={`area${sel ? ' sel' : ''}${pode ? ' pode' : ''}`} id={`area-${fo}`}
              role={pode ? 'radio' : undefined} aria-checked={pode ? sel : undefined} tabIndex={pode ? 0 : undefined}
              title={pode && !sel ? 'Usar como área adotada' : fo === 'poligonal' ? 'Calculada pelo desenho; muda quando a poligonal é ajustada' : undefined}
              onClick={(ev) => { if (pode && !(ev.target as HTMLElement).closest('input')) escolher(fo); }}
              onKeyDown={(ev) => { if (pode && (ev.key === 'Enter' || ev.key === ' ') && !(ev.target as HTMLElement).closest('input')) { ev.preventDefault(); escolher(fo); } }}>
              <div className="al">{l} <span className="faint">· {fo === 'cadastral' && v != null ? (t.area_cadastral_origem === 'digitada' ? 'digitada' : 'soma dos SQLs') : s}</span></div>
              {edita && fo !== 'poligonal'
                ? <AreaVivo f={f} k={k} l={l} />
                : <div className="av">{v == null ? <span className="faint" style={{ fontSize: 14, fontStyle: 'italic' }}>{fo === 'poligonal' ? 'Sem poligonal' : 'Não informada'}</span> : m2(v)}</div>}
              <div className="as">{sel ? <><Ic n="check" s={14} />Área adotada</> : '\u00a0'}</div>
            </div>
          );
        })}</div>
        {div}
        <div className={`kvg${edita ? ' kvg-ed vivo' : ''}`} style={{ marginTop: 14 }}>
          <div><div className="k">Área adotada</div>{fonte ? <div className="v">{OPT.fonteArea[fonte]?.split(' (')[0]}</div> : <span className="v ni">{edita ? 'Clique na área que vale' : 'Não informada'}</span>}</div>
          {edita ? <TestadaVivo f={f} />
            : <div><div className="k">Testada principal</div>{t.testada_principal_m == null ? ni : <div className="v">{metros(t.testada_principal_m)} m</div>}</div>}
          <div><div className="k">Valor pedido por m²</div>{ad && f.valorPedido ? <div className="v">{brl(f.valorPedido / ad)}</div> : ni}</div>
        </div>
      </div>
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
  const NV0 = { nome: '', tipo: 'PF', papel: 'proprietario', pct: '', tel: '' };
  const [nv, setNv] = useState(NV0);
  const pref = useRef<HTMLFormElement>(null);
  const { aviso: avisoP } = useRascunho(pref, !!(nv.nome.trim() || nv.pct.trim() || nv.tel.trim()), 'o proprietário', () => setNv(NV0));
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
          <form className="inline-form" ref={pref} onSubmit={incluir}>
            <div className="field grow"><label htmlFor="p-n">Nome ou razão social</label><input id="p-n" required value={nv.nome} onChange={(ev) => setNv({ ...nv, nome: ev.target.value })} /></div>
            <div className="field" style={{ flex: '0 1 120px' }}><label htmlFor="p-t">Tipo</label><select id="p-t" value={nv.tipo} onChange={(ev) => setNv({ ...nv, tipo: ev.target.value })}><option value="PF">PF</option><option value="PJ">PJ</option></select></div>
            <div className="field"><label htmlFor="p-p">Vínculo</label><select id="p-p" value={nv.papel} onChange={(ev) => setNv({ ...nv, papel: ev.target.value })}>{Object.entries(OPT.papel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field" style={{ flex: '0 1 120px' }}><label htmlFor="p-pc">Participação</label><Adorno t="pct"><input id="p-pc" inputMode="decimal" data-fmt="pct" disabled={nv.papel !== 'proprietario'} value={nv.pct} onChange={(ev) => setNv({ ...nv, pct: ev.target.value })} /></Adorno></div>
            <div className="field"><label htmlFor="p-tel">Telefone</label><input id="p-tel" inputMode="tel" data-fmt="tel" placeholder="(11) 98765-4321" value={nv.tel} onChange={(ev) => setNv({ ...nv, tel: ev.target.value })} /></div>
            <button className="btn sm" disabled={grav}><Ic n="add" s={16} />Adicionar</button>
            {avisoP}
          </form>
        )}
      </div>
    </Quadro>
  );
}

export default function AbaTerreno({ f }: { f: Ficha }) {
  const [, re] = useState(0);
  /* "ir ao campo" vindo do que falta na ficha: abre o quadro e põe o foco no campo (já editável no lugar) */
  useEffect(() => {
    const atender = () => {
      const p = tomarPedido(['loc', 'areas', 'fis', 'lotes', 'pessoas', 'ident']);
      if (!p) return;
      abrirQuadro('terreno', p.sec);
      re((x) => x + 1);
      let alvo = p.campo === 'end-mapa' ? 'f-end-mapa' : /^(em-n|es-sql|p-n)$/.test(p.campo ?? '') ? p.campo! : `f-${p.campo}`;
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
      <SecGenerica f={f} id="ident" primeiro />
      <SecGenerica f={f} id="loc" />
      <PartesLotes f={f} />
      <SecAreas f={f} />
      <SecPessoas f={f} />
    </div>
  );
}
