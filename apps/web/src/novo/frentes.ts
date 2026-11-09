/* eslint-disable @typescript-eslint/no-explicit-any */
// Frentes do terreno: consulta no GeoSampa e gravação no terreno. A conta em si (pura, testável) está em frentesCalc.ts.
import { automatico, supabase } from '../lib/supabase';
import { GEO_BASE, geoAneis, geoWfs, latLngUtm } from './geosampa';
import { nomeRef, normRua, type P } from './geo';
import { medirFrentes, type Medicao } from './frentesCalc';

export type { Medicao, Posicao, FrenteMedida } from './frentesCalc';

/* ---------- consulta no GeoSampa e gravação no terreno ---------- */
export const FONTE_FRENTES = 'Medida pela poligonal (GeoSampa)';
/** confrontações de frente gravadas sozinhas (a de antes era a do Google, no cadastro) e trocadas a cada medição */
const FONTES_AUTO = [FONTE_FRENTES, 'Localização da poligonal'];
const SP_IBGE = '3550308';

/** Mede pela poligonal [lat, lng] no GeoSampa (só em São Paulo e na versão publicada). */
export async function medirFrentesSP(poly: P[]): Promise<Medicao> {
  const ter = poly.map(([la, ln]) => latLngUtm(la, ln));
  const xs = ter.map((p) => p[0]), ys = ter.map((p) => p[1]);
  const bb = (m: number) => [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m].join(',') + ',urn:ogc:def:crs:EPSG::31983';
  const [ls, vs] = await Promise.all([
    geoWfs({ typeNames: 'geoportal:lote_cidadao', count: '5000', propertyName: 'ge_poligono', bbox: bb(20) }),
    geoWfs({ typeNames: 'geoportal:v_logradouro_segmento', count: '1000', bbox: bb(60) }),
  ]);
  return medirFrentes(ter, ls.flatMap((f) => geoAneis(f.geometry).slice(0, 1)), vs);
}

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());
/** "R DR LUIS BARRETO" → "R Dr Luis Barreto": o nome como a prefeitura escreve, sem a caixa-alta */
export const nomeRuaPrefeitura = (s: string) => titulo(s);

/** a mesma rua no endereço do terreno (Google) e no eixo da prefeitura: compara sem o tipo e sem títulos abreviados */
const chaveRua = (s: string) => normRua(nomeRef(s)).replace(/^(r|av|al|tv|estr|est|pc|pca|lgo|rod|vl|pq)\.?\s+/, '')
  .replace(/\b(dr|doutor|prof|professor|eng|engenheiro|gen|general|cel|coronel|ttcel|tte|des|pres|sen|dep|cap|sto|santo|sta|santa|s|sao|nsa|n sra|nossa senhora)\b\.?\s*/g, '')
  .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Mede e grava: posição na quadra, testada principal (a frente do acesso principal) e uma confrontação
 * de frente por rua com a testada dela. Fora de São Paulo, ou sem rua achada, não mexe em nada. */
const MEDIDA = new Map<string, string>();     // terreno → poligonal já medida nesta sessão (ou em curso)
export async function atualizarFrentes(id: string): Promise<Medicao | null> {
  if (!GEO_BASE) return null;
  const med = await medirEGravar(id);
  if (med?.frentes.length) window.dispatchEvent(new CustomEvent('frentes-medidas', { detail: id }));
  return med;
}
async function medirEGravar(id: string): Promise<Medicao | null> {
  const { data: t, error } = await supabase.from('terrenos')
    .select('id,empresa_id,versao,logradouro,poligono_geojson,testada_principal_m,posicao_quadra,municipios(codigo_ibge)').eq('id', id).single();
  if (error || !t) return null;
  if ((t as any).municipios?.codigo_ibge !== SP_IBGE) return null;
  const g = (t as any).poligono_geojson, poly: P[] | null = g?.coordinates?.[0] ? (g.coordinates[0] as number[][]).slice(0, -1).map(([lo, la]) => [la, lo] as P) : null;
  if (!poly || poly.length < 3) return null;
  /* a mesma poligonal não se mede duas vezes (a ficha e o mapa chamam juntos) */
  const chave = JSON.stringify(g.coordinates);
  if (MEDIDA.get(id) === chave) return null;
  MEDIDA.set(id, chave);
  let med: Medicao;
  try { med = await medirFrentesSP(poly); } catch (e) { MEDIDA.delete(id); throw e; }
  if (!med.frentes.length) return med;
  /* a rua do endereço é o acesso principal; sem ela entre as frentes, a de maior testada */
  const k0 = chaveRua(t.logradouro || '');
  const pri = med.frentes.find((x) => k0 && chaveRua(x.logradouro) === k0) ?? med.frentes[0];
  const { data: cs } = await supabase.from('confrontacoes').select('id,ordem,comprimento_m,fonte,observacoes').eq('terreno_id', id);
  const auto = (cs ?? []).filter((c: any) => FONTES_AUTO.includes(c.fonte));
  if (auto.length) {
    const r = await automatico(supabase.from('confrontacoes').delete().in('id', auto.map((c: any) => c.id)));
    if (r.error) throw r.error;
  }
  const ord0 = Math.max(0, ...(cs ?? []).filter((c: any) => !FONTES_AUTO.includes(c.fonte)).map((c: any) => c.ordem));
  const lin = [pri, ...med.frentes.filter((x) => x !== pri)].map((x, i) => ({
    empresa_id: t.empresa_id, terreno_id: id, ordem: ord0 + i + 1, tipo: 'frente', comprimento_m: x.testada_m,
    confrontante: nomeRuaPrefeitura(x.logradouro), fonte: FONTE_FRENTES, observacoes: x === pri ? 'Acesso principal' : null,
  }));
  const r = await automatico(supabase.from('confrontacoes').insert(lin));
  if (r.error) throw r.error;
  /* a testada principal não se digita: é sempre a frente medida do acesso principal (pedido do Moises, 9/nov/2026) */
  const d: Record<string, unknown> = {};
  if (t.posicao_quadra !== med.posicao) d.posicao_quadra = med.posicao;
  const tAtual = t.testada_principal_m == null ? null : +t.testada_principal_m;
  if (tAtual == null || Math.abs(tAtual - pri.testada_m) >= 0.01) d.testada_principal_m = pri.testada_m;
  if (Object.keys(d).length) {
    const s = await automatico(supabase.rpc('salvar_terreno', { p_terreno: id, p_versao: t.versao, p_dados: d }));
    if (s.error) throw s.error;
  }
  return med;
}
