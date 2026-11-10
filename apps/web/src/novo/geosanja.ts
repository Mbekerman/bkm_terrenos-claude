/* eslint-disable @typescript-eslint/no-explicit-any */
// GeoSanja (Prefeitura de São José dos Campos) pela inscrição imobiliária, igual ao protótipo (proto_geosanja.js: GSJ_CAMADAS,
// gsjToken, gsjLote, gsjInfo, gsjAmostra, gsjToca, gsjBuscar, gsjLinhas). Não há serviço público de camadas: usa a API do
// próprio site (geo.sjc.sp.gov.br/v1) com o token de visitante, pelo Caddy em /geosanja (sem CORS; só na versão publicada).
// A busca pela inscrição devolve só a poligonal do lote; zona (LC 623) com a área no lote, macrozona, centralidade, riscos e
// restrições vêm das camadas liberadas ao visitante (GetFeatureInfo com raio cobrindo o lote, conferido aqui contra a
// poligonal). Não vêm: área cadastral, endereço e número, testada, valor venal e IPTU (ficam para digitar). O cartório (camada
// circunscricao) e a zona da cidade (regiões geográficas, anexo 4 da LC 612) vêm pelo pino, em cartorioZonaSjc (10/nov/2026).
// A planta (PDF) e o desenho (DXF) do lote ficam para quando a ficha tiver a aba Documentos.
import { automatico, supabase } from '../lib/supabase';
import { geoAneis, geoAreaAnel, digitos } from './geosampa';
import { geoAreaZonas, geoDentro } from './consulta';
import type { LinhaToca } from '../lib/camadas';
import type { P } from './geo';

export const GSJ_BASE: string | null = (() => {
  const m = document.querySelector<HTMLMetaElement>('meta[name="geosanja-url"]');
  if (m?.content && !m.content.includes('{%')) return m.content;
  return /^https?:$/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.host) ? location.origin + '/geosanja/v1/' : null;
})();

const nf = (v: unknown, d = 0) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d });
type Fmt = (p: any) => string | false | null | undefined;
/** [camada WMS, feição (prefixo do id), tema, como mostrar, gravidade, distância em metros (linhas)] */
export const GSJ_CAMADAS: [string, string, string, Fmt, string, number?][] = [
  ['uso_ocupacao', 'ZONAS_USO', 'Zona (LC 623)', (p) => p.proposta !== 'Bens Preservados' && p.proposta, ''],
  ['uso_ocupacao', 'ZONAS_USO', 'Imóvel preservado', (p) => p.proposta === 'Bens Preservados' && (p.rotulo || 'Bem preservado'), 'crit'],
  ['uso_ocupacao', 'macrozoneamentoUrbano', 'Macrozona', (p) => p.subclasses, ''],
  ['uso_ocupacao', 'macrozoneamentoRural', 'Macrozona rural', (p) => p.rotulo, 'warn'],
  ['uso_ocupacao', 'macroestruturaEconomica', 'Área de desenvolvimento estratégico', (p) => p.polo, ''],
  ['uso_ocupacao', 'CORREDORES', 'Corredor a até 30 m', (p) => p.rotulo || p.corredores, '', 30],
  ['uso_ocupacao', 'recarga_aquifero', 'Recarga de aquífero', (p) => p.nome, 'warn'],
  ['anexo_07', 'centralidade', 'Centralidade', (p) => [p.nome, p.ca_max != null ? `CA máx. ${nf(p.ca_max, 1)}` : ''].filter(Boolean).join(' · '), ''],
  ['anexo_04', 'regioesGeograficas', 'Região', (p) => p.regiao, ''],
  ['anexo_05', 'setorSocioEconomico', 'Setor socioeconômico', (p) => `${p.setor} · ${p.nome}`, ''],
  ['subsetor_urbano', 'subsetor_urbano', 'Subsetor', (p) => `${p.sub_num} · ${p.sub_nom}`, ''],
  ['anexo_11', 'brt', 'Corredor de transporte público a até 300 m', () => 'Principal corredor', '', 300],
  ['anexo_13', 'parquesUrbanos', 'Parque urbano', (p) => p.nome, 'warn'],
  ['anexo_14', 'apaMunicipal', 'APA municipal', (p) => p.nome, 'crit'],
  ['anexo_14', 'parqueNaturalMunicipal', 'Parque natural municipal', (p) => p.nome, 'crit'],
  ['pnmBanhado', 'pnmBanhado', 'Parque do Banhado', (p) => p.nome, 'crit'],
  ['zona_de_amortecimento_augusto', 'zona_de_amortecimento_augusto', 'Amortecimento do Parque Augusto Ruschi', () => 'Zona de amortecimento', 'warn'],
  ['anexo_15', 'nucleosUrbanosInformais', 'Núcleo informal', (p) => p.refname, 'warn'],
  ['anexo_16', 'zdca', 'Domínio de curso d’água (mapa substituído)', () => 'ZDCA', 'warn'],
  ['anexo_17', 'escorregamentoPMRP', 'Risco de escorregamento', (p) => [(p.legenda || '').trim(), p.name].filter(Boolean).join(' · '), 'crit'],
  ['pmrr_sjc_2024_setores_final_1', 'pmrr_sjc_2024_setores_final_1', 'Plano de redução de riscos (2024)', (p) => [p.grau_risco, p.processo].filter(Boolean).join(' · '), 'crit'],
  ['linhas_trasmissao', 'linhas_trasmissao', 'Faixa de linha de transmissão', () => 'Alta tensão', 'crit'],
  ['FERROVIA', 'FERROVIA', 'Ferrovia a até 30 m', () => 'Linha férrea', 'warn', 30],
];
/** os que vêm primeiro na lista do lote (macrozona, centralidade, setor e subsetor) */
const GSJ_FICHA = ['macrozoneamentoUrbano', 'centralidade', 'setorSocioEconomico', 'subsetor_urbano'];
/** macrozona da LC 623 pelo nome (proto_zonas.js, macroDe): o CA de SJC depende dela */
export const macroDe = (n: unknown) => (/consolida/i.test(String(n || '')) ? 'MC' : /estrutura/i.test(String(n || '')) ? 'ME' : /controlad/i.test(String(n || '')) ? 'MOC' : null);

let TOKEN: string | null = null;
export async function gsjToken(novo = false) {
  if (TOKEN && !novo) return TOKEN;
  const r = await fetch(GSJ_BASE + 'autenticar?token=VISITANTE');
  if (!r.ok) throw new Error('GeoSanja respondeu ' + r.status);
  TOKEN = (await r.json()).token as string;
  return TOKEN;
}
/** a inscrição no formato do site (00.0000.0000.0000) */
export const icFmt = (s: string) => { const d = digitos(s); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 6)}.${d.slice(6, 10)}.${d.slice(10)}` : s.trim(); };
/** poligonal do lote (GeoJSON em graus), ou null quando a inscrição não existe no GeoSanja */
export async function gsjLote(ic: string): Promise<any | null> {
  const ped = (tk: string) => fetch(GSJ_BASE + 'localizar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({ toolId: 'SearchICTool', parametros: [{ name: 'ic', value: icFmt(ic) }] }) });
  let r = await ped(await gsjToken());
  if (r.status === 401) r = await ped(await gsjToken(true));
  if (!r.ok) throw new Error('GeoSanja respondeu ' + r.status);
  const j = await r.json();
  return Array.isArray(j) && j[0]?.data?.geom ? JSON.parse(j[0].data.geom) : null;
}
/** poligonal do lote em [lat, lng], para refazer a poligonal do terreno pela soma dos lotes */
export async function gsjPoligono(ic: string): Promise<P[] | null> {
  const g = await gsjLote(ic);
  return g ? geoAneis(g)[0].slice(0, -1).map((p) => [p[1], p[0]] as P) : null;
}
/** feições da camada dentro do retângulo (graus): um pixel no centro com raio que alcança os cantos */
export async function gsjInfoBB(camada: string, bb: number[], ws = 'geoSJC', buffer = 75): Promise<any[]> {
  const u = new URL(GSJ_BASE + 'proxy');
  const q: Record<string, string | number> = { SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo', LAYERS: ws + ':' + camada, QUERY_LAYERS: ws + ':' + camada, SRS: 'EPSG:4326',
    BBOX: bb.join(','), WIDTH: 101, HEIGHT: 101, X: 50, Y: 50, BUFFER: buffer, INFO_FORMAT: 'application/json', FEATURE_COUNT: 200, authToken: await gsjToken() };
  Object.entries(q).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  const r = await fetch(u);
  if (!r.ok) throw new Error('GeoSanja respondeu ' + r.status);
  const j = await r.json();
  if (!j || !Array.isArray(j.features)) throw new Error('Resposta inesperada do GeoSanja');
  return j.features;
}

/* ---------- geometria: graus -> metros locais ---------- */
const mapCoord = (c: any, f: (p: number[]) => number[]): any => (!c.length ? c : typeof c[0] === 'number' ? f(c) : c.map((x: any) => mapCoord(x, f)));
const geoMapa = (g: any, f: (p: number[]) => number[]) => g && { ...g, coordinates: mapCoord(g.coordinates, f) };
const featMapa = (ft: any, f: (p: number[]) => number[]) => ({ ...ft, geometry: geoMapa(ft.geometry, f) });
/** pontos do lote para conferir o que toca: vértices, bordas a cada metro e grade interna */
function amostra(lote: any) {
  const r = geoAneis(lote)[0], pts: number[][] = [];
  r.forEach((p, i) => { const q = r[(i + 1) % r.length], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]))); for (let k = 0; k < n; k++) pts.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]); });
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
  const passo = Math.max(0.5, Math.sqrt(((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / 400));
  for (let x = Math.min(...xs) + passo / 2; x < Math.max(...xs); x += passo) for (let y = Math.min(...ys) + passo / 2; y < Math.max(...ys); y += passo) if (geoDentro([x, y], lote)) pts.push([x, y]);
  return pts;
}
const distSeg = (p: number[], a: number[], b: number[]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
function toca(f: any, lote: any, am: number[][], dist?: number) {
  const g = f.geometry;
  if (!g) return false;
  if (/Polygon/.test(g.type)) return am.some((p) => geoDentro(p, g)) || geoAneis(g).some((r) => r.some((p) => geoDentro(p, lote)));
  if (/LineString/.test(g.type)) { const lim = dist || 0; return geoAneis(g).some((r) => r.some((p) => geoDentro(p, lote)) || am.some((p) => r.some((a, i) => i > 0 && distSeg(p, r[i - 1], a) <= lim))); }
  return false;
}

/** consulta completa de uma inscrição; false quando o GeoSanja não achou o lote.
 * auto: feita pelo sistema depois de incluir a inscrição (o log fica recolhido dentro dessa ação); o botão, não. */
export async function consultarLoteSjc(inscricaoId: string, ic: string, auto = false) {
  const ll = await gsjLote(ic);
  if (!ll) return false;
  const r0 = geoAneis(ll)[0], lon0 = r0.reduce((s, p) => s + p[0], 0) / r0.length, lat0 = r0.reduce((s, p) => s + p[1], 0) / r0.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111319.49, ky = 110574.3;
  const loc = ([x, y]: number[]) => [(x - lon0) * kx, (y - lat0) * ky], lote = geoMapa(ll, loc), am = amostra(lote);
  const folga = Math.max(...GSJ_CAMADAS.map((c) => c[5] || 0)) + 5, xs = r0.map((p) => p[0]), ys = r0.map((p) => p[1]);
  const bb = [Math.min(...xs) - folga / kx, Math.min(...ys) - folga / ky, Math.max(...xs) + folga / kx, Math.max(...ys) + folga / ky];
  const wms = [...new Set(GSJ_CAMADAS.map((c) => c[0]))], res: Record<string, any[]> = {}, falhou: string[] = [];
  await Promise.all(wms.map(async (k) => { try { res[k] = await gsjInfoBB(k, bb); } catch { falhou.push(k); } }));
  const camadas: Record<string, any[]> = {}, zonasF: any[] = [];
  GSJ_CAMADAS.forEach(([k, pref, , fmt, , dist], n) => {
    if (!res[k]) return;
    const fs = res[k].filter((f) => String(f.id).split('.')[0] === pref && toca(featMapa(f, loc), lote, am, dist));
    const vals = fs.filter((f) => { try { return !!fmt(f.properties); } catch { return false; } });
    camadas[k + ':' + n] = vals.map((f) => f.properties);
    if (n === 0) zonasF.push(...vals.map((f) => featMapa(f, loc)));
  });
  const mz = macroDe((camadas['uso_ocupacao:2'] || [])[0]?.subclasses);
  const zonas = (zonasF.length ? geoAreaZonas(lote, zonasF, (p) => p.proposta) : []).map((z) => ({ ...z, macrozona: mz }));
  const erros = GSJ_CAMADAS.map((c, n) => (falhou.includes(c[0]) ? c[0] + ':' + n : null)).filter(Boolean) as string[];
  const anel = r0[0][0] === r0[r0.length - 1][0] && r0[0][1] === r0[r0.length - 1][1] ? r0 : [...r0, r0[0]];
  const q = supabase.rpc('registrar_consulta_lote', {
    p_inscricao: inscricaoId, p_lote: { inscricao: icFmt(ic) }, p_poligono: { type: 'Polygon', coordinates: [anel.map((p) => [+p[0].toFixed(7), +p[1].toFixed(7)])] },
    p_area_poligono: Math.round(geoAreaAnel(geoAneis(lote)[0]) * 100) / 100, p_camadas: camadas, p_zonas: zonas, p_camadas_com_erro: erros,
  });
  const { error } = await (auto ? automatico(q) : q);
  if (error) throw error;
  return true;
}

/** o que toca o lote, camada a camada (sem a zona, que tem quadro próprio): macrozona, centralidade e setor primeiro */
export function gsjLinhas(camadas: Record<string, any[]>, erros: string[]): LinhaToca[] {
  return GSJ_CAMADAS.map(([k, pref, tema, fmt, grav], j) => ({
    tema, grav, erro: erros.includes(k + ':' + j), j, ficha: GSJ_FICHA.includes(pref),
    vals: [...new Set((camadas[k + ':' + j] || []).map((x) => { try { return fmt(x) || null; } catch { return null; } }).filter(Boolean) as string[])],
  })).filter((l) => l.j > 0).sort((a, b) => Number(b.ficha) - Number(a.ficha)).map(({ tema, grav, erro, vals }) => ({ tema, grav, erro, vals }));
}

/* ---------- cartório e zona da cidade pelo pino (pedido do Moises, 10/nov/2026) ---------- */
/** feições da camada no ponto (graus): o pixel do centro, sem raio */
const noPonto = (camada: string, lat: number, lng: number, ws?: string) =>
  gsjInfoBB(camada, [lng - 0.0005, lat - 0.0005, lng + 0.0005, lat + 0.0005], ws, 0);
const REGIAO_SJC: Record<string, string> = { centro: 'centro', norte: 'norte', sul: 'sul', leste: 'leste', oeste: 'oeste', sudeste: 'sudeste' };
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
/** 1º ou 2º Registro de Imóveis de São José dos Campos (camada circunscricao): "1º CRI", como em São Paulo */
export async function cartorioSjc(lat: number, lng: number): Promise<string | null> {
  const fs = await noPonto('circunscricao', lat, lng, 'geoInterno');
  const n = fs.length === 1 ? String(fs[0].properties?.cartorio ?? '').replace(/\D/g, '') : '';
  return n ? `${n}º CRI` : null;
}
/** região geográfica urbana (LC 612/2018: Centro, Norte, Leste, Oeste, Sul, Sudeste; São Francisco Xavier fica de fora,
    porque a lista de zonas do sistema não tem) */
export async function zonaSjc(lat: number, lng: number): Promise<string | null> {
  const fs = await noPonto('anexo_04', lat, lng);
  return fs.length === 1 ? REGIAO_SJC[semAcento(String(fs[0].properties?.regiao ?? ''))] ?? null : null;
}
