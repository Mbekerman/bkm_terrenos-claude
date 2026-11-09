/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { carregarGoogle, gLib } from '../mapa/google';
import { data as fd, m2 } from '../lib/format';
import { Adorno, metros } from '../lib/mascara';
import { empilhar } from '../components/Desfazer';
import type { Ficha, R } from './dados';

// Edição da ficha (porte de proto.js › SECOES, fmtCampo, campoInp, camposEndereco e proto_gmap.js › gBuscasEndereco).
// Toda gravação da ficha passa por app.salvar_terreno(id, versão, dados), que recusa versão antiga.

export const OPT: Record<string, Record<string, string>> = {
  prioridade: { baixa: 'Baixa', media: 'Média', alta: 'Alta', estrategica: 'Estratégica' },
  origem: { prospeccao: 'Prospecção própria', corretor: 'Corretor', indicacao: 'Indicação', portal: 'Portal', proprietario: 'Proprietário direto', outro: 'Outro' },
  precisao: { nao_informada: 'Não informada', aproximada: 'Aproximada', conferida: 'Conferida' },
  zona: { leste: 'Leste', oeste: 'Oeste', norte: 'Norte', sul: 'Sul', centro: 'Centro', sudeste: 'Sudeste', sudoeste: 'Sudoeste', nordeste: 'Nordeste', noroeste: 'Noroeste' },
  posicao: { nao_informado: 'Não informado', meio_quadra: 'Meio de quadra', esquina: 'Esquina', duas_frentes: 'Duas frentes', quadra_inteira: 'Quadra inteira' },
  formato: { nao_informado: 'Não informado', regular: 'Regular', irregular: 'Irregular' },
  ocupacao: { nao_informado: 'Não informado', vazio: 'Vazio', ocupado: 'Ocupado', parcialmente_ocupado: 'Parcialmente ocupado' },
  demolicao: { nao_avaliada: 'Não avaliada', provavel: 'Provável', confirmada: 'Confirmada', dispensada: 'Dispensada' },
  fonteArea: { documental: 'Documental (matrícula)', cadastral: 'Cadastral (IPTU)', levantamento: 'Levantamento topográfico', estimativa: 'Estimativa', poligonal: 'Poligonal (desenho no mapa)' },
  papel: { proprietario: 'Proprietário', conjuge: 'Cônjuge', representante: 'Representante', procurador: 'Procurador', parente: 'Parente', contato: 'Contato', outro: 'Outros' },
};
const NI_OPT = new Set(['nao_informado', 'nao_informada', 'nao_avaliada']);
/** valor nulo das listas com "não informado" explícito (regra 7 do CLAUDE.md) */
const NI_DE: Record<string, string> = { origem: 'nao_informado', precisao: 'nao_informada', posicao: 'nao_informado', formato: 'nao_informado', ocupacao: 'nao_informado', demolicao: 'nao_avaliada' };

/** [coluna, rótulo, tipo, opções, largura] */
export type Campo = [string, string, string, string | null, string?];
export const SECOES: Record<string, { titulo: string; campos: Campo[] }> = {
  ident: { titulo: 'Identificação', campos: [['nome', 'Nome de referência', 'txt', null, 'full'], ['descricao', 'Descrição', 'area', null, 'full'], ['prioridade', 'Prioridade', 'sel', 'prioridade'],
    ['responsavel_id', 'Responsável', 'user', null], ['origem_cadastro', 'Origem do cadastro', 'sel', 'origem'], ['data_identificacao', 'Identificado em', 'date', null],
    ['observacoes', 'Observações gerais', 'area', null, 'full']] },
  loc: { titulo: 'Endereço e localização', campos: [['cep', 'CEP', 'txt', null], ['logradouro', 'Logradouro', 'txt', null], ['numero', 'Número', 'txt', null], ['complemento', 'Complemento', 'txt', null],
    ['bairro', 'Bairro', 'txt', null], ['municipio_id', 'Município', 'mun', null], ['zona', 'Zona', 'sel', 'zona'],
    ['cartorio', 'Cartório de registro de imóveis', 'cri', null], ['referencia_localizacao', 'Referência', 'txt', null, 'full'], ['latitude', 'Latitude', 'dec', null],
    ['longitude', 'Longitude', 'dec', null]] },
  fis: { titulo: 'Características físicas', campos: [['desnivel_estimado_m', 'Desnível estimado', 'm', null], ['posicao_quadra', 'Posição na quadra', 'sel', 'posicao'], ['formato', 'Formato', 'sel', 'formato'],
    ['situacao_ocupacao', 'Ocupação', 'sel', 'ocupacao'], ['uso_atual', 'Uso atual', 'txt', null], ['area_construida_existente_m2', 'Área construída existente', 'm2', null],
    ['area_construida_demolir_m2', 'Área construída a demolir', 'm2', null], ['necessidade_demolicao', 'Necessidade de demolição', 'sel', 'demolicao'], ['observacoes_fisicas', 'Observações físicas', 'area', null, 'full']] },
};
export const END_CAMPOS = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio_id', 'zona', 'latitude', 'longitude'];

export const num = (v: number | null | undefined, d = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
/** "1.920,5" ou "12 mi" → número; vazio → null */
export function lerNum(s: string | null | undefined): number | null {
  const x = String(s ?? '').trim().toLowerCase();
  if (!x) return null;
  const mult = /\bmi\b|milh/.test(x) ? 1e6 : /\bmil\b/.test(x) ? 1e3 : 1;
  const n = Number(x.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? n * mult : null;
}
const decStr = (v: unknown) => (v == null || v === '' ? '' : String(v).replace('.', ','));
/** número para o campo: milhar com ponto e vírgula decimal, como a máscara deixa ao digitar */
export const numStr = (v: unknown, d = 3) => (v == null || v === '' || !isFinite(Number(v)) ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));

/** listas para os seletores: equipe da empresa e eixos comerciais */
export function useListas() {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['ficha-listas', empresa?.id], enabled: !!empresa, staleTime: 5 * 60_000,
    queryFn: async () => {
      const [m, e] = await Promise.all([
        supabase.from('membros').select('user_id,nome').eq('empresa_id', empresa!.id).order('nome'),
        supabase.from('eixos_comerciais').select('id,nome,municipio_id,ativo').eq('empresa_id', empresa!.id).order('nome'),
      ]);
      if (m.error) throw m.error;
      if (e.error) throw e.error;
      return { membros: (m.data ?? []) as R[], eixos: (e.data ?? []) as R[] };
    },
  });
}

/** valor de um campo para leitura; null = não informado */
export function fmtCampo(f: Ficha, [k, , tipo, opt]: Campo, listas?: { membros: R[]; eixos: R[] }): ReactNode | null {
  const t = f.t, v = t[k];
  if (k === 'municipio_id') return [f.municipio, f.uf].filter(Boolean).join(' · ') || null;
  if (v == null || v === '' || (tipo === 'sel' && NI_OPT.has(v))) return null;
  switch (tipo) {
    case 'sel': return OPT[opt!][v] ?? v;
    case 'date': return fd(v);
    case 'm2': return m2(v);
    case 'm': return metros(v) + ' m';
    case 'dec': return num(v, 6);
    case 'url': return <a href={v} target="_blank" rel="noopener">{String(v).replace(/^https?:\/\//, '').slice(0, 48)}</a>;
    case 'user': return listas?.membros.find((x) => x.user_id === v)?.nome ?? (f.resp?.nome || '—');
    case 'eixo': return listas?.eixos.find((x) => x.id === v)?.nome ?? '—';
    case 'cri': return <>{v}{t.cartorio_origem === 'prefeitura' && <span className="faint" style={{ fontSize: 12 }}> · do GeoSampa</span>}</>;
    default: return String(v);
  }
}

/** valores iniciais do formulário (texto) das colunas pedidas */
export function valoresDe(t: R, ks: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of ks) o[k] = ['latitude', 'longitude'].includes(k) ? decStr(t[k]) : ['desnivel_estimado_m', 'testada_principal_m'].includes(k) ? metros(t[k]) : /_m2$/.test(k) ? numStr(t[k]) : t[k] == null ? '' : String(t[k]);
  return o;
}

/** converte o formulário em dados para app.salvar_terreno */
export function dadosDe(vals: Record<string, string>, campos: Campo[]): R {
  const d: R = {};
  for (const [k, , tipo, opt] of campos) {
    if (!(k in vals) || k === 'municipio_id') continue;
    const v = vals[k].trim();
    if (['m2', 'm', 'dec'].includes(tipo)) d[k] = lerNum(v);
    else if (tipo === 'sel') d[k] = v || (opt && NI_DE[opt]) || null;
    else d[k] = v || null;
  }
  return d;
}

/* gravações da ficha em fila, uma de cada vez, cada uma com a versão que a anterior devolveu: na edição no lugar,
   sair de um campo e já sair do próximo grava os dois sem a segunda esbarrar na versão antiga */
const VER = new Map<string, number>();
let FILA: Promise<unknown> = Promise.resolve();
/** grava na ficha; devolve true se gravou */
export function useSalvar(f: Ficha) {
  const qc = useQueryClient(), toast = useToast();
  const fR = useRef(f);
  fR.current = f;
  return (dados: R): Promise<boolean> => {
    const p = FILA.then(async () => {
      const g = fR.current;
      // o valor de antes, para o Ctrl+Z (components/Desfazer.tsx)
      const ks = Object.keys(dados);
      const { data: antes } = await supabase.from('terrenos').select(ks.join(',')).eq('id', g.id).maybeSingle();
      /* o que a ficha mostra desses campos: se o banco ainda tem isso, a gravação não pisa em ninguém */
      const visto = Object.fromEntries(ks.map((k) => [k, (g.t as R)[k] ?? null]));
      if (!(await gravarTerreno(g.id, g.versao, dados, visto, qc, toast))) return false;
      toast('Salvo.');
      if (antes && ks.some((k) => JSON.stringify((antes as R)[k] ?? null) !== JSON.stringify(dados[k] ?? null))) {
        const volta = Object.fromEntries(ks.map((k) => [k, (antes as R)[k] ?? null]));
        const fila = (d: R, esperado: R) => { const q = FILA.then(() => gravarTerreno(g.id, g.versao, d, esperado, qc, toast)); FILA = q.catch(() => false); return q; };
        empilhar({ rotulo: rotuloCampos(ks), fazer: () => fila(volta, dados), refazer: () => fila(dados, volta) });
      }
      return true;
    });
    FILA = p.catch(() => false);
    return p;
  };
}
/* versão antiga: PT409 (HTTP 409). Antes era 40001, que o PostgREST repete sozinho por minutos (a ficha travava e o
   erro nunca chegava aqui; 9/nov/2026); o 40001 continua aceito até o banco trocar. O terreno mudou desde que a ficha carregou. Muitas vezes quem mudou foi o próprio sistema, em
   outro campo (a consulta do GeoSampa grava o cartório e as áreas logo depois do cadastro; 9/nov/2026, a Zona escolhida
   foi recusada assim e o campo continuou mostrando "Leste"). Se os campos desta gravação estão no banco como a ficha
   os mostra (`visto`), ninguém mexeu neles: grava de novo na versão atual. Se mudaram, recusa, como antes. */
const conflito = (e: { code?: string } | null) => e?.code === 'PT409' || e?.code === '40001';
async function gravarTerreno(id: string, versao: number, dados: R, visto: R, qc: ReturnType<typeof useQueryClient>, toast: (m: string, e?: boolean) => void) {
  let ver = Math.max(versao, VER.get(id) ?? 0);
  let { data, error } = await supabase.rpc('salvar_terreno', { p_terreno: id, p_versao: ver, p_dados: dados });
  if (conflito(error)) {
    const ks = Object.keys(dados);
    const { data: agora } = await supabase.from('terrenos').select(['versao', ...ks].join(',')).eq('id', id).maybeSingle();
    const a = agora as R | null;
    if (a && ks.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(visto[k] ?? null))) {
      ver = Number(a.versao);
      ({ data, error } = await supabase.rpc('salvar_terreno', { p_terreno: id, p_versao: ver, p_dados: dados }));
    }
  }
  if (error) { toast(error.message, true); if (conflito(error)) { VER.delete(id); qc.invalidateQueries({ queryKey: ['ficha'] }); } return false; }
  if (typeof data === 'number') VER.set(id, data);
  qc.invalidateQueries({ queryKey: ['ficha'] });
  qc.invalidateQueries({ queryKey: ['mapa'] });
  return true;
}
const ROT_EXTRA: Record<string, string> = { area_adotada_m2: 'área adotada', fonte_area_adotada: 'área adotada', area_documental_m2: 'área documental', area_cadastral_m2: 'área cadastral',
  area_levantamento_m2: 'área de levantamento', testada_principal_m: 'testada', historico_uso: 'histórico de uso', visita_tecnica_em: 'data da visita', poligono_geojson: 'poligonal' };
function rotuloCampos(ks: string[]) {
  const nomes = ks.map((k) => ROT_EXTRA[k] ?? Object.values(SECOES).flatMap((s) => s.campos).find((c) => c[0] === k)?.[1]?.toLowerCase()).filter(Boolean) as string[];
  const u = [...new Set(nomes)];
  return END_CAMPOS.some((k) => ks.includes(k)) && ks.length > 2 ? 'endereço' : u.length ? u.join(', ') : 'alteração na ficha';
}

/* ---------- edição no lugar (pedido do Moisés, 6/nov/2026: sem Editar nem Salvar nas seções) ----------
   O valor já é o campo: grava ao sair dele (texto, número, data) ou ao escolher (lista); Esc volta o valor de antes;
   Enter passa para o próximo campo do quadro (no último, só sai), como no protótipo. Quem só lê vê o texto. */
export interface VivoProps {
  value: string; 'data-vivo': string;
  onChange: (e: { target: { value: string } }) => void; onFocus: () => void; onBlur: () => void; onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}
/** próximo campo editado no lugar do mesmo quadro (ou janela) */
export function proximoCampo(el: HTMLElement) {
  const box = el.closest('.sec, .dialog, .lz-exc, form') ?? document.body;
  const cs = [...box.querySelectorAll<HTMLElement>('[data-vivo]')].filter((x) => !(x as HTMLInputElement).disabled && x.offsetParent);
  const i = cs.indexOf(el);
  if (i >= 0 && i < cs.length - 1) cs[i + 1].focus(); else el.blur();
}
export function useVivo(ini: string, gravar: (v: string) => Promise<boolean | void> | boolean | void, opt: { imediato?: boolean; aoMudar?: (v: string) => void } = {}) {
  const [v, setV] = useState(ini);
  const cur = useRef(ini), base = useRef(ini), foco = useRef(false), esc = useRef(false);
  /* o valor gravado mudou (a ficha recarregou, ou outra pessoa mudou): acompanha, menos com o campo em uso */
  useEffect(() => { base.current = ini; if (!foco.current) { cur.current = ini; setV(ini); } }, [ini]);
  const set = (x: string) => { cur.current = x; setV(x); opt.aoMudar?.(x); };
  const fim = async () => {
    const x = cur.current;
    if (x === base.current) return;
    const antes = base.current;
    base.current = x;
    let ok: boolean | void = false;
    try { ok = await gravar(x); } catch { ok = false; }
    /* não gravou: o campo volta ao valor gravado; numa lista (grava ao escolher, com o foco ainda nela) também, senão
       ela continua mostrando a opção recusada como se valesse */
    if (ok === false) { base.current = antes; if (!foco.current || opt.imediato) set(antes); }
  };
  const props: VivoProps = {
    value: v, 'data-vivo': '',
    /* no Esc, a máscara ainda mexe no campo ao sair (completa as casas): até sair, nada vale */
    onChange: (e) => { if (esc.current) return; set(e.target.value); if (opt.imediato) fim(); },
    onFocus: () => { foco.current = true; esc.current = false; },
    onBlur: () => { foco.current = false; if (esc.current) { esc.current = false; set(base.current); return; } fim(); },
    onKeyDown: (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); esc.current = true; (e.currentTarget as HTMLElement).blur(); }
      else if (e.key === 'Enter' && e.currentTarget.tagName !== 'TEXTAREA') { e.preventDefault(); proximoCampo(e.currentTarget as HTMLElement); }
    },
  };
  return { v, set, props };
}
/** campo editado no lugar em forma de render prop: <Vivo ini gravar>{(p) => <input {...p} />}</Vivo> */
export function Vivo({ ini, gravar, imediato, aoMudar, children }: { ini: string; gravar: (v: string) => Promise<boolean | void> | boolean | void; imediato?: boolean; aoMudar?: (v: string) => void; children: (p: VivoProps) => ReactNode }) {
  const { props } = useVivo(ini, gravar, { imediato, aoMudar });
  return <>{children(props)}</>;
}

const CRIS = Array.from({ length: 18 }, (_, i) => `${i + 1}º CRI`);
const emSP = (f: Ficha) => !f.municipio || /^São Paulo$/i.test(f.municipio);

/** campo de edição de uma seção (campoInp); com `p`, o campo é editado no lugar (useVivo) */
export function CampoInp({ f, c, vals, mudar, listas, inl, p }: { f: Ficha; c: Campo; vals: Record<string, string>; mudar: (k: string, v: string) => void; listas?: { membros: R[]; eixos: R[] }; inl?: boolean; p?: VivoProps }) {
  const [k, l, tipo, opt, full] = c, id = `f-${k}`, v = p ? p.value : vals[k] ?? '';
  const on = (ev: { target: { value: string } }) => (p ? p.onChange(ev) : mudar(k, ev.target.value));
  const x = p ? { onFocus: p.onFocus, onBlur: p.onBlur, onKeyDown: p.onKeyDown, 'data-vivo': '' } : {};
  const ph = p ? 'Não informado' : '';
  let h: ReactNode;
  if (tipo === 'sel') h = <select id={id} value={NI_OPT.has(v) ? '' : v} onChange={on} {...x}><option value="">Não informado</option>{Object.entries(OPT[opt!]).filter(([y]) => !NI_OPT.has(y)).map(([y, z]) => <option key={y} value={y}>{z}</option>)}</select>;
  else if (tipo === 'user') h = <select id={id} value={v} onChange={on} {...x}><option value="">Sem responsável</option>{(listas?.membros ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}</select>;
  else if (tipo === 'eixo') h = <select id={id} value={v} onChange={on} {...x}><option value="">Nenhum</option>{(listas?.eixos ?? []).filter((e) => e.ativo !== false && (!e.municipio_id || e.municipio_id === f.t.municipio_id)).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>;
  else if (tipo === 'area') h = <textarea id={id} value={v} onChange={on} placeholder={ph} {...x} />;
  else if (tipo === 'date') h = <input id={id} type="date" value={v} onChange={on} {...x} />;
  else if (tipo === 'cri') h = emSP(f)
    ? <select id={id} value={v} onChange={on} {...x}><option value="">Não informado</option>{(v && !CRIS.includes(v) ? [v, ...CRIS] : CRIS).map((y) => <option key={y}>{y}</option>)}</select>
    : <input id={id} value={v} onChange={on} placeholder={p ? ph : '1º CRI'} {...x} />;
  else if (tipo === 'mun') h = <input id={id} value={[f.municipio, f.uf].filter(Boolean).join(' · ')} readOnly title="Preenchido pela busca de endereço" />;
  else if (tipo === 'm2' || tipo === 'm') h = <Adorno t={tipo}><input id={id} inputMode="decimal" data-fmt={tipo === 'm' ? 'm' : undefined} value={v} onChange={on} placeholder={ph} {...x} /></Adorno>;
  else if (tipo === 'dec') h = <input id={id} inputMode="decimal" data-fmt="none" value={v} onChange={on} placeholder={ph} {...x} />;
  else h = <input id={id} type={tipo === 'url' ? 'url' : undefined} value={v} onChange={on} required={k === 'nome'} placeholder={ph} {...x} />;
  /* inl: no mesmo lugar e na mesma altura da leitura, só com a linha embaixo (pedido do Moisés, 5/nov/2026) */
  if (inl) return <div className={`inl-c ${full || ''}`}><label className="k" htmlFor={id}>{l}</label>{h}</div>;
  return <div className={`field ${full || ''}`}><label htmlFor={id}>{l}</label>{h}</div>;
}
const SELECAO = (f: Ficha, tipo: string) => ['sel', 'user', 'eixo'].includes(tipo) || (tipo === 'cri' && emSP(f));
/** campo de uma seção da ficha editado no lugar: grava só a própria coluna */
export function CampoVivo({ f, c, listas, salvar }: { f: Ficha; c: Campo; listas?: { membros: R[]; eixos: R[] }; salvar: (d: R) => Promise<boolean> }) {
  const toast = useToast();
  const [k] = c;
  const ini = valoresDe(f.t, [k])[k];
  const { props } = useVivo(ini, (v) => {
    const d = dadosDe({ [k]: v }, [c]);
    if (k === 'nome' && !d.nome) { toast('O nome de referência é obrigatório.'); return false; }
    return salvar(d);
  }, { imediato: SELECAO(f, c[2]) });
  return <CampoInp f={f} c={c} vals={{}} mudar={() => undefined} listas={listas} inl p={props} />;
}

/** pedido de "ir ao campo" (itens que faltam na ficha): a aba que o tem abre a edição e põe o foco nele */
export interface PedidoCampo { sec: string; campo?: string }
let pendente: PedidoCampo | null = null;
export function pedirCampo(p: PedidoCampo) { pendente = p; window.dispatchEvent(new Event('ficha-campo')); }
/** pega o pedido (só se for de uma das seções dadas, quando dadas: a aba que ainda está na tela não toma o da outra) */
export function tomarPedido(secs?: string[]): PedidoCampo | null {
  if (!pendente || (secs && !secs.includes(pendente.sec))) return null;
  const p = pendente; pendente = null; return p;
}
/** atende o pedido de "ir ao campo" das seções dadas, ao montar (a aba acabou de abrir) e a cada pedido novo */
export function usePedido(secs: string[], fn: (p: PedidoCampo) => void) {
  const r = useRef(fn);
  r.current = fn;
  const chave = secs.join();
  useEffect(() => {
    const at = () => { const p = tomarPedido(chave.split(',')); if (p) r.current(p); };
    at();
    window.addEventListener('ficha-campo', at);
    return () => window.removeEventListener('ficha-campo', at);
  }, [chave]);
}
/** quadros que moram dentro de outro quadro */
const QD_PAI: Record<string, string> = { indices: 'param', rest: 'param', histuso: 'param' };
/** abre o quadro da aba e avisa os quadros na tela */
export function abrirQuadroJa(aba: string, id: string) { abrirQuadro(aba, id); window.dispatchEvent(new Event('ficha-quadro')); }
/** abre o quadro da seção (sem mexer na escolha das outras) */
export function abrirQuadro(aba: string, id: string) {
  const L = lojaAtiva?.mapa ?? QD, st = L[aba] || (L[aba] = new Set());
  st.add(id);
  /* quadro dentro de outro (Parâmetros urbanísticos da aba Terreno): abre também o de fora */
  if (QD_PAI[id]) st.add(QD_PAI[id]);
  lojaAtiva?.mudou();
}
/** rola até o campo ficar na "altura dos olhos": o primeiro item visível logo abaixo do que fica preso no alto
    (barra das abas e título do quadro); no fim da aba, sem folga para rolar, a aba ganha um respiro embaixo, que sai
    quando a pessoa rola de volta para cima (pedido do Moisés, 6/nov/2026) */
function rolarAteOlhos(el: HTMLElement) {
  const alvo = (el.closest('.inl-c, .field, .area, .temp') as HTMLElement | null) ?? el;
  let sc: HTMLElement | null = el.parentElement;
  while (sc && sc !== document.body && !/auto|scroll/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
  const pag = !sc || sc === document.body;
  const rol = pag ? (document.scrollingElement as HTMLElement) : sc!;
  const aba = el.closest('.fi-aba') as HTMLElement | null;
  if (aba?.dataset.folga) { aba.style.paddingBottom = ''; delete aba.dataset.folga; }
  /* a linha de baixo do que fica preso: o topo de quem rola + o "top" da barra das abas + a altura dela + o título do quadro */
  let linha = pag ? 0 : rol.getBoundingClientRect().top;
  const w = el.closest('.ficha-main')?.querySelector('.fi-abas-w') as HTMLElement | null;
  if (w) linha += (parseFloat(getComputedStyle(w).top) || 0) + w.offsetHeight;
  const sec = el.closest('.sec');
  const h = sec?.querySelector(':scope > .sec-h, :scope > form > .sec-h') as HTMLElement | null;
  if (h && getComputedStyle(h).position === 'sticky') linha += h.offsetHeight;
  const folga = window.innerWidth < 900 ? 16 : 24;
  let quer = rol.scrollTop + alvo.getBoundingClientRect().top - (linha + folga);
  if (quer < 0) quer = 0;
  const max = rol.scrollHeight - rol.clientHeight;
  if (aba && quer > max + 1) {
    const pad = Math.ceil(quer - max);
    aba.style.paddingBottom = `${pad}px`;
    aba.dataset.folga = String(pad);
    const alvoRol: HTMLElement | Window = pag ? window : rol;
    const tirar = () => {
      if (aba.dataset.folga !== String(pad)) { alvoRol.removeEventListener('scroll', tirar); return; }
      /* só tira quando a pessoa já subiu mais que o respiro: a página não pula */
      if (rol.scrollTop + rol.clientHeight < rol.scrollHeight - pad - 1) {
        aba.style.paddingBottom = ''; delete aba.dataset.folga; alvoRol.removeEventListener('scroll', tirar);
      }
    };
    setTimeout(() => alvoRol.addEventListener('scroll', tirar, { passive: true }), 100);
  }
  rol.scrollTop = quer;
}
/** foco no campo depois que ele aparece, rolando até ele */
export function focar(id: string, tent = 12) {
  const el = document.getElementById(id) as HTMLElement | null;
  /* espera o campo existir e aparecer (o quadro fechado ainda está abrindo) */
  if (!el || !el.getClientRects().length) { if (tent > 0) setTimeout(() => focar(id, tent - 1), 60); return; }
  rolarAteOlhos(el);
  el.focus({ preventScroll: true });
  /* o conteúdo já vem selecionado, para digitar por cima (pedido do Moisés, 6/nov/2026) */
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { try { el.select(); } catch { /* tipo sem seleção */ } }
  acender((el.closest('.inl-c, .field, .area, .temp') as HTMLElement | null) ?? el);
}
/** uma iluminada rápida no item, para evidenciá-lo */
export function acender(el: HTMLElement) {
  el.classList.remove('acende');
  void el.offsetWidth; // recomeça a animação se o item já estava aceso
  el.classList.add('acende');
  setTimeout(() => el.classList.remove('acende'), 2800);
}

export interface EndGoogle { cidade?: string; uf?: string }

/** endereço: busca do Google (Places) e, abaixo, Complemento e Zona; o que a busca preenche fica em linhas simples,
    com "Corrigir à mão" (proto.js › camposEndereco) */
export function CamposEndereco({ f, vals, mudar, mun, setMun, soBusca, aoEscolher, foco }: { f: Ficha; vals: Record<string, string>; mudar: (k: string, v: string) => void; mun: EndGoogle | null; setMun: (m: EndGoogle) => void; soBusca?: boolean;
  /** edição no lugar: o que a busca achou, de uma vez, para gravar */
  aoEscolher?: (o: Record<string, string>, m: EndGoogle | null) => void; foco?: boolean }) {
  const slot = useRef<HTMLDivElement>(null);
  const [gg, setGg] = useState<boolean | null>(null);
  const [manual, setManual] = useState(false);
  const [de, setDe] = useState('');
  const mudarR = useRef(mudar);
  mudarR.current = mudar;
  const setMunR = useRef(setMun);
  setMunR.current = setMun;
  const escR = useRef(aoEscolher);
  escR.current = aoEscolher;
  useEffect(() => {
    let vivo = true;
    carregarGoogle().then((ok) => {
      if (!vivo) return;
      setGg(ok);
      const s = slot.current;
      if (!ok || !s || s.dataset.ok) return;
      s.dataset.ok = '1';
      try {
        const { PlaceAutocompleteElement } = gLib.places;
        const pac = new PlaceAutocompleteElement({ includedRegionCodes: ['br'], locationBias: { center: { lat: -23.55, lng: -46.63 }, radius: 50000 } });
        pac.id = 'f-busca-end';
        pac.placeholder = soBusca ? 'Pesquisar endereço' : 'Pesquisar'; pac.setAttribute('aria-label', 'Pesquisar endereço no Google'); pac.requestedLanguage = 'pt-BR';
        pac.noInputIcon = true; pac.noClearButton = true; pac.setAttribute('no-input-icon', ''); pac.setAttribute('no-clear-button', '');
        s.appendChild(pac);
        if (foco) setTimeout(() => (pac as HTMLElement).focus(), 50);
        const aplicar = async (place: any) => {
          await place.fetchFields({ fields: ['addressComponents', 'location', 'formattedAddress'] });
          const comp = (tipo: string, curto?: boolean) => { const c = place.addressComponents?.find((x: any) => x.types.includes(tipo)); return c ? (curto ? c.shortText : c.longText) : ''; };
          const o: Record<string, string> = {};
          const m = (k: string, v: string) => { o[k] = v; mudarR.current(k, v); };
          const set = (k: string, v: string) => { if (v) m(k, v); };
          set('cep', comp('postal_code')); set('logradouro', comp('route')); m('numero', comp('street_number')); if (comp('subpremise')) m('complemento', comp('subpremise'));
          set('bairro', comp('sublocality_level_1') || comp('sublocality') || comp('neighborhood'));
          const cidade = comp('administrative_area_level_2') || comp('locality'), uf = comp('administrative_area_level_1', true);
          if (cidade) setMunR.current({ cidade, uf });
          if (place.location) { m('latitude', decStr(+place.location.lat().toFixed(6))); m('longitude', decStr(+place.location.lng().toFixed(6))); }
          escR.current?.(o, cidade ? { cidade, uf } : null);
          setDe(place.formattedAddress || '');
          if (!comp('street_number')) setManual(true);
        };
        pac.addEventListener('gmp-select', (e: any) => { const pp = e.placePrediction; if (pp) aplicar(pp.toPlace()); });
        pac.addEventListener('gmp-placeselect', (e: any) => { if (e.place) aplicar(e.place); });
      } catch { s.innerHTML = '<span class="hint">Busca do Google indisponível.</span>'; }
    });
    return () => { vivo = false; };
  }, []);
  /* só a busca, no título do quadro: os campos ficam na grade, editáveis no lugar */
  if (soBusca) return gg === false ? null : <div className="gbusca-h" title={de ? `Preenchido a partir de: ${de}` : undefined}><div className="gauto" ref={slot} /></div>;
  const trava = !!gg && !manual;
  const munTxt = mun?.cidade ? [mun.cidade, mun.uf].filter(Boolean).join(' · ') : [f.municipio, f.uf].filter(Boolean).join(' · ');
  const auto: [string, string][] = [['cep', 'CEP'], ['logradouro', 'Logradouro'], ['numero', 'Número'], ['bairro', 'Bairro']];
  return (
    <>
      {gg === false
        ? <div className="gbusca off"><div className="hint">Busca de endereço do Google indisponível neste acesso. Preencha os campos à mão.</div></div>
        : <div className="gbusca"><div className="gauto" ref={slot} /><div className="hint">{de ? `Preenchido a partir de: ${de}` : 'Escolha um resultado para preencher CEP, logradouro, número, bairro, município e a localização.'}</div></div>}
      <div className="end-manual">
        <div className="field"><label htmlFor="f-complemento">Complemento</label><input id="f-complemento" value={vals.complemento ?? ''} onChange={(e) => mudar('complemento', e.target.value)} /></div>
        <div className="field"><label htmlFor="f-zona">Zona</label><select id="f-zona" value={vals.zona ?? ''} onChange={(e) => mudar('zona', e.target.value)}><option value="">Não informado</option>{Object.entries(OPT.zona).map(([x, y]) => <option key={x} value={x}>{y}</option>)}</select></div>
      </div>
      <div className="end-auto">
        {auto.map(([k, l]) => (
          <div key={k} className={`field auto-l ${k === 'logradouro' ? 'largo' : ''}`}><label htmlFor={`f-${k}`}>{l}</label>
            <input id={`f-${k}`} value={vals[k] ?? ''} onChange={(e) => mudar(k, e.target.value)} readOnly={trava} className={trava ? 'auto-v' : ''} placeholder={trava ? '—' : ''} /></div>
        ))}
        <div className="field auto-l largo"><label htmlFor="f-municipio">Município</label><input id="f-municipio" value={munTxt} readOnly className={trava ? 'auto-v' : ''} title="Preenchido pela busca de endereço" /></div>
      </div>
      {trava && <button type="button" className="linkbtn end-corrigir" onClick={() => setManual(true)}>Corrigir à mão</button>}
    </>
  );
}

/** município da busca do Google → municipio_id (app.municipio_por_nome); null = sem troca */
export async function municipioId(m: EndGoogle | null, f: Ficha): Promise<number | string | null> {
  if (!m?.cidade || (m.cidade === f.municipio && (!m.uf || m.uf === f.uf))) return null;
  const { data, error } = await supabase.rpc('municipio_por_nome', { p_nome: m.cidade, p_uf: m.uf || null });
  if (error) throw error;
  return data ?? null;
}

/** quadro das abas da ficha que abre e fecha pela seta do título; nasce fechado, menos o primeiro da aba; a escolha
    vale na sessão, por aba (proto_ui.js › uiQuadros) */
const QD: Record<string, Set<string>> = {};
/** quadros guardados à parte, por terreno: a gaveta do Mapa dá a sua (lembrar.ts), que grava a cada mudança; sem ela,
    vale o QD da sessão. abrirQuadro (Logs, ações, "ir ao campo") mexe na loja da gaveta aberta. */
export interface LojaQd { mapa: Record<string, Set<string>>; mudou: () => void }
export const LojaQdCtx = createContext<LojaQd | null>(null);
let lojaAtiva: LojaQd | null = null;
/** a gaveta marca a loja dela como a ativa enquanto está aberta */
export function ativarLojaQd(l: LojaQd | null) { lojaAtiva = l; }
export function Quadro({ aba, id, primeiro, titulo, acoes, aberto: forca, children, form }: {
  aba: string; id: string; primeiro?: boolean; titulo: ReactNode; acoes?: ReactNode; aberto?: boolean; children: ReactNode;
  form?: (corpo: ReactNode) => ReactNode;
}) {
  const loja = useContext(LojaQdCtx), L = loja?.mapa ?? QD;
  const st = L[aba] || (L[aba] = new Set());
  const [, re] = useState(0);
  /* o painel de Logs abre o quadro de fora (abrirQuadro + evento 'ficha-quadro') */
  useEffect(() => { const f = () => re((x) => x + 1); window.addEventListener('ficha-quadro', f); return () => window.removeEventListener('ficha-quadro', f); }, []);
  /* ao entrar e sair da edição, o quadro fica onde estava na tela (o resto da página é que se ajusta) */
  const sec = useRef<HTMLElement>(null), antes = useRef<{ ed: boolean; top: number | null }>({ ed: !!forca, top: null });
  if (antes.current.ed !== !!forca) { antes.current = { ed: !!forca, top: sec.current?.getBoundingClientRect().top ?? null }; }
  useLayoutEffect(() => {
    const t0 = antes.current.top, el = sec.current;
    if (t0 == null || !el) return;
    antes.current.top = null;
    const d = el.getBoundingClientRect().top - t0;
    if (Math.abs(d) < 1) return;
    let p: HTMLElement | null = el.parentElement;
    while (p && !(p.scrollHeight > p.clientHeight && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
    if (p) p.scrollTop += d; else window.scrollBy(0, d);
  });
  if (primeiro && !st.has('§' + id)) { st.add('§' + id); st.add(id); }
  const ab = !!forca || st.has(id);
  const alternar = () => { if (ab) st.delete(id); else st.add(id); loja?.mudou(); re((x) => x + 1); };
  const cab = (
    <div className="sec-h"><h2><button type="button" className="qd-tg" aria-expanded={ab} onClick={alternar}>
      <svg className="bl-seta" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      <span>{titulo}</span></button></h2>{acoes}</div>
  );
  return (
    <section ref={sec} className={`sec${ab ? '' : ' qd-fechado'}${forca ? ' qd-ed' : ''}`} id={`sec-${id}`}>
      {form ? form(<>{cab}{children}</>) : <>{cab}{children}</>}
    </section>
  );
}
