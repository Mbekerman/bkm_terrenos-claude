/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { carregarGoogle, gLib } from '../mapa/google';
import { data as fd, m2 } from '../lib/format';
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
  papel: { proprietario: 'Proprietário', representante: 'Representante', procurador: 'Procurador', contato: 'Contato' },
};
const NI_OPT = new Set(['nao_informado', 'nao_informada', 'nao_avaliada']);
/** valor nulo das listas com "não informado" explícito (regra 7 do CLAUDE.md) */
const NI_DE: Record<string, string> = { origem: 'nao_informado', precisao: 'nao_informada', posicao: 'nao_informado', formato: 'nao_informado', ocupacao: 'nao_informado', demolicao: 'nao_avaliada' };

/** [coluna, rótulo, tipo, opções, largura] */
export type Campo = [string, string, string, string | null, string?];
export const SECOES: Record<string, { titulo: string; campos: Campo[] }> = {
  ident: { titulo: 'Identificação', campos: [['nome', 'Nome de referência', 'txt', null, 'full'], ['descricao', 'Descrição', 'area', null, 'full'], ['prioridade', 'Prioridade', 'sel', 'prioridade'],
    ['responsavel_id', 'Responsável', 'user', null], ['origem_cadastro', 'Origem do cadastro', 'sel', 'origem'], ['data_identificacao', 'Identificado em', 'date', null],
    ['url_origem', 'Link da origem', 'url', null, 'full'], ['observacoes', 'Observações gerais', 'area', null, 'full']] },
  loc: { titulo: 'Endereço e localização', campos: [['cep', 'CEP', 'txt', null], ['logradouro', 'Logradouro', 'txt', null], ['numero', 'Número', 'txt', null], ['complemento', 'Complemento', 'txt', null],
    ['bairro', 'Bairro', 'txt', null], ['municipio_id', 'Município', 'mun', null], ['zona', 'Zona', 'sel', 'zona'], ['eixo_comercial_id', 'Eixo comercial', 'eixo', null],
    ['cartorio', 'Cartório de registro de imóveis', 'cri', null], ['referencia_localizacao', 'Referência', 'txt', null, 'full'], ['latitude', 'Latitude', 'dec', null],
    ['longitude', 'Longitude', 'dec', null], ['precisao_localizacao', 'Precisão da localização', 'sel', 'precisao']] },
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
    case 'm': return num(v, 2) + ' m';
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
  for (const k of ks) o[k] = ['latitude', 'longitude', 'desnivel_estimado_m', 'testada_principal_m'].includes(k) || /_m2$/.test(k) ? decStr(t[k]) : t[k] == null ? '' : String(t[k]);
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

/** grava na ficha; devolve true se gravou */
export function useSalvar(f: Ficha) {
  const qc = useQueryClient(), toast = useToast();
  return async (dados: R): Promise<boolean> => {
    const { error } = await supabase.rpc('salvar_terreno', { p_terreno: f.id, p_versao: f.versao, p_dados: dados });
    if (error) { toast(error.message); if (error.code === '40001') qc.invalidateQueries({ queryKey: ['ficha'] }); return false; }
    await qc.invalidateQueries({ queryKey: ['ficha'] });
    qc.invalidateQueries({ queryKey: ['mapa'] });
    toast('Salvo.');
    return true;
  };
}

const CRIS = Array.from({ length: 18 }, (_, i) => `${i + 1}º CRI`);
const emSP = (f: Ficha) => !f.municipio || /^São Paulo$/i.test(f.municipio);

/** campo de edição de uma seção (campoInp) */
export function CampoInp({ f, c, vals, mudar, listas }: { f: Ficha; c: Campo; vals: Record<string, string>; mudar: (k: string, v: string) => void; listas?: { membros: R[]; eixos: R[] } }) {
  const [k, l, tipo, opt, full] = c, id = `f-${k}`, v = vals[k] ?? '';
  const on = (ev: { target: { value: string } }) => mudar(k, ev.target.value);
  let h: ReactNode;
  if (tipo === 'sel') h = <select id={id} value={NI_OPT.has(v) ? '' : v} onChange={on}><option value="">Não informado</option>{Object.entries(OPT[opt!]).filter(([x]) => !NI_OPT.has(x)).map(([x, y]) => <option key={x} value={x}>{y}</option>)}</select>;
  else if (tipo === 'user') h = <select id={id} value={v} onChange={on}><option value="">Sem responsável</option>{(listas?.membros ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}</select>;
  else if (tipo === 'eixo') h = <select id={id} value={v} onChange={on}><option value="">Nenhum</option>{(listas?.eixos ?? []).filter((e) => e.ativo !== false && (!e.municipio_id || e.municipio_id === f.t.municipio_id)).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>;
  else if (tipo === 'area') h = <textarea id={id} value={v} onChange={on} />;
  else if (tipo === 'date') h = <input id={id} type="date" value={v} onChange={on} />;
  else if (tipo === 'cri') h = emSP(f)
    ? <select id={id} value={v} onChange={on}><option value="">Não informado</option>{(v && !CRIS.includes(v) ? [v, ...CRIS] : CRIS).map((x) => <option key={x}>{x}</option>)}</select>
    : <input id={id} value={v} onChange={on} placeholder="1º CRI" />;
  else if (tipo === 'mun') h = <input id={id} value={[f.municipio, f.uf].filter(Boolean).join(' · ')} readOnly title="Preenchido pela busca de endereço" />;
  else if (['m2', 'm', 'dec'].includes(tipo)) h = <input id={id} inputMode="decimal" value={v} onChange={on} placeholder={tipo === 'm2' ? 'm²' : tipo === 'm' ? 'metros' : ''} />;
  else h = <input id={id} type={tipo === 'url' ? 'url' : undefined} value={v} onChange={on} required={k === 'nome'} />;
  return <div className={`field ${full || ''}`}><label htmlFor={id}>{l}</label>{h}</div>;
}

export interface EndGoogle { cidade?: string; uf?: string }

/** endereço: busca do Google (Places) e, abaixo, Complemento e Zona; o que a busca preenche fica em linhas simples,
    com "Corrigir à mão" (proto.js › camposEndereco) */
export function CamposEndereco({ f, vals, mudar, mun, setMun }: { f: Ficha; vals: Record<string, string>; mudar: (k: string, v: string) => void; mun: EndGoogle | null; setMun: (m: EndGoogle) => void }) {
  const slot = useRef<HTMLDivElement>(null);
  const [gg, setGg] = useState<boolean | null>(null);
  const [manual, setManual] = useState(false);
  const [de, setDe] = useState('');
  const mudarR = useRef(mudar);
  mudarR.current = mudar;
  const setMunR = useRef(setMun);
  setMunR.current = setMun;
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
        pac.placeholder = 'Pesquisar'; pac.setAttribute('aria-label', 'Pesquisar endereço no Google'); pac.requestedLanguage = 'pt-BR';
        pac.noInputIcon = true; pac.noClearButton = true; pac.setAttribute('no-input-icon', ''); pac.setAttribute('no-clear-button', '');
        s.appendChild(pac);
        const aplicar = async (place: any) => {
          await place.fetchFields({ fields: ['addressComponents', 'location', 'formattedAddress'] });
          const comp = (tipo: string, curto?: boolean) => { const c = place.addressComponents?.find((x: any) => x.types.includes(tipo)); return c ? (curto ? c.shortText : c.longText) : ''; };
          const m = mudarR.current;
          const set = (k: string, v: string) => { if (v) m(k, v); };
          set('cep', comp('postal_code')); set('logradouro', comp('route')); m('numero', comp('street_number')); if (comp('subpremise')) m('complemento', comp('subpremise'));
          set('bairro', comp('sublocality_level_1') || comp('sublocality') || comp('neighborhood'));
          const cidade = comp('administrative_area_level_2') || comp('locality'), uf = comp('administrative_area_level_1', true);
          if (cidade) setMunR.current({ cidade, uf });
          if (place.location) { m('latitude', decStr(+place.location.lat().toFixed(6))); m('longitude', decStr(+place.location.lng().toFixed(6))); }
          setDe(place.formattedAddress || '');
          if (!comp('street_number')) setManual(true);
        };
        pac.addEventListener('gmp-select', (e: any) => { const pp = e.placePrediction; if (pp) aplicar(pp.toPlace()); });
        pac.addEventListener('gmp-placeselect', (e: any) => { if (e.place) aplicar(e.place); });
      } catch { s.innerHTML = '<span class="hint">Busca do Google indisponível.</span>'; }
    });
    return () => { vivo = false; };
  }, []);
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
export function Quadro({ aba, id, primeiro, titulo, acoes, aberto: forca, children, form }: {
  aba: string; id: string; primeiro?: boolean; titulo: ReactNode; acoes?: ReactNode; aberto?: boolean; children: ReactNode;
  form?: (corpo: ReactNode) => ReactNode;
}) {
  const st = QD[aba] || (QD[aba] = new Set());
  const [, re] = useState(0);
  if (primeiro && !st.has('§' + id)) { st.add('§' + id); st.add(id); }
  const ab = !!forca || st.has(id);
  const alternar = () => { if (ab) st.delete(id); else st.add(id); re((x) => x + 1); };
  const cab = (
    <div className="sec-h"><h2><button type="button" className="qd-tg" aria-expanded={ab} onClick={alternar}>
      <svg className="bl-seta" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      <span>{titulo}</span></button></h2>{acoes}</div>
  );
  return (
    <section className={`sec${ab ? '' : ' qd-fechado'}`} id={`sec-${id}`}>
      {form ? form(<>{cab}{children}</>) : <>{cab}{children}</>}
    </section>
  );
}
