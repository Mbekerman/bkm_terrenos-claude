/* eslint-disable @typescript-eslint/no-explicit-any */
// Lotes da prefeitura no Novo terreno (São Paulo; pedido do Moisés, 4/nov/2026), igual ao protótipo
// (tools/prototipo/proto_lotesgeo.js: lgCarregar, lgHtml, lgSvg, lgEscala, lgLigar, lgIncluir).
// Logo depois da poligonal abre o mapa de lotes do GeoSampa das quadras que ela ocupa, no jeito do GeoSampa ("F 0053" e
// "N. 161" em cada lote, o SQL ao parar o mouse); vêm marcados os lotes com 20% ou mais dentro da poligonal e a quadra só
// entra com 10 m² ou mais de lote dentro dela. Os marcados refazem a poligonal pela soma dos lotes e entram no terreno sem
// parte. Pela janela Incluir por SQL ("Escolher no mapa"), abre as quadras dos SQLs e os marcados voltam para a lista.
// Condomínio, via de acesso e SQL que já está em outro terreno aparecem mas não se marcam.
// Em São José dos Campos (L.sjc; pedido do Moises, 10/nov/2026) os lotes vêm do GeoSanja, quadra por quadra pela varredura de
// lotesSjc.ts, com o satélite do Google (com os nomes das ruas) por baixo, porque o GeoSanja não dá o nome da rua; o clique fora dos
// lotes pergunta ao GeoSanja o lote daquele ponto e o acrescenta, marcado. Não vêm área cadastral, endereço nem número de porta.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { areaPoly, lotesUniao, m2, type P } from './geo';
import { digitos, geoAneis, geoAreaAnel, geoNoAnel, geoTit, geoWfs, geoWkt, latLngUtm, nomeVia, utmLatLng, type LoteSql } from './geosampa';
import { abrirLotes, atualizarNv, listaSql, novoEstado, poligonal, type Lotes } from './estado';
import { gsjNoPonto, quadraDe, quadrasSjc } from './lotesSjc';
import { gsjLote } from './geosanja';
import { GMAPS_KEY } from '../lib/config';

const LG_MIN = 0.2; // fração do lote dentro da poligonal para vir marcado
type An = number[][];
interface Lote { an: An; sql: string | null; p: any; condo: boolean; via: boolean; trava: string | null; fr: number; rot: { x: number; y: number; r: number }; sel: boolean; area: number | null; end: string; q: string; rf: string; rn: string }
interface Via { n: string; x: number; y: number; ang: number; len: number }
/** fundo: a imagem do Maps Static e a matriz que leva o pixel dela às coordenadas do desenho (x, -y em UTM) */
interface Dados { ter: An | null; lotes: Lote[]; quadras: string[]; bb: number[]; vias: Via[]; sjc?: boolean; fundo?: { href: string; m: number[] } }

/* ---------- geometria (UTM 23S, metros) ---------- */
const lgBB = (an: An) => { const xs = an.map((p) => p[0]), ys = an.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
function distBorda(pt: number[], an: An) {
  let m = Infinity;
  for (let i = 0; i < an.length - 1; i++) {
    const a = an[i], b = an[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, u = l ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l)) : 0;
    m = Math.min(m, Math.hypot(pt[0] - a[0] - u * dx, pt[1] - a[1] - u * dy));
  }
  return m;
}
/* lugar do rótulo: o ponto de uma grade dentro do lote mais longe das bordas (e quanto cabe ali) */
function rotulo(an: An) {
  const [x0, y0, x1, y1] = lgBB(an); let best: number[] | null = null, r = -1;
  for (let i = 1; i < 14; i++) for (let j = 1; j < 14; j++) { const pt = [x0 + ((x1 - x0) * i) / 14, y0 + ((y1 - y0) * j) / 14]; if (!geoNoAnel(pt, an)) continue; const d = distBorda(pt, an); if (d > r) { r = d; best = pt; } }
  return best ? { x: best[0], y: best[1], r } : { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: 0 };
}
/* fração do lote dentro da poligonal do terreno, por uma grade de pontos */
function fracao(an: An, ter: An) {
  const [x0, y0, x1, y1] = lgBB(an); let n = 0, d = 0;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { const pt = [x0 + ((x1 - x0) * (i + 0.5)) / 16, y0 + ((y1 - y0) * (j + 0.5)) / 16]; if (!geoNoAnel(pt, an)) continue; n++; if (geoNoAnel(pt, ter)) d++; }
  return n ? d / n : 0;
}
/* um nome por rua, no trecho mais comprido que fica perto das quadras */
function vias(fs: any[], bb: number[]): Via[] {
  const por: Record<string, Via> = {};
  fs.forEach((f) => {
    const n = nomeVia(f.properties), Lh = f.geometry && geoAneis(f.geometry)[0];
    if (!n || !Lh || Lh.length < 2) return;
    for (let i = 0; i < Lh.length - 1; i++) {
      const a = Lh[i], b = Lh[i + 1], c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (c[0] < bb[0] - 20 || c[0] > bb[2] + 20 || c[1] < bb[1] - 20 || c[1] > bb[3] + 20) continue;
      if (!por[n] || len > por[n].len) { let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI; if (ang > 90 || ang < -90) ang += 180; por[n] = { n, x: c[0], y: c[1], ang, len }; }
    }
  });
  return Object.values(por);
}
const caminho = (an: An) => 'M' + an.slice(0, -1).map((p) => `${p[0].toFixed(2)},${(-p[1]).toFixed(2)}`).join('L') + 'Z';
const polyLl = (an: An): P[] => an.slice(0, -1).map((p) => utmLatLng(p[0], p[1]).map((v) => +v.toFixed(7)) as P);
const endDe = (p: any) => (p.nm_logradouro_completo ? geoTit(p.nm_logradouro_completo) + (p.cd_numero_porta && p.cd_numero_porta !== '0' ? ', ' + p.cd_numero_porta : '') : '');

/** inscrições (só dígitos) que já estão em outro terreno da empresa: código do terreno, ou '' quando ele está excluído */
async function emOutro(ds: string[], empresa: string, proprio?: string) {
  const outro = new Map<string, string>();
  for (let i = 0; i < ds.length; i += 200) {
    const { data, error } = await supabase.from('inscricoes_municipais').select('inscricao_norm,terrenos(codigo)').eq('empresa_id', empresa).in('inscricao_norm', ds.slice(i, i + 200)).abortSignal(AbortSignal.timeout(20_000));
    if (error) throw new Error('BANCO');
    /* sem o terreno na resposta: está num terreno excluído (a leitura esconde), que ainda segura a inscrição */
    (Array.isArray(data) ? data : []).forEach((r: any) => { if (!r.terrenos) outro.set(r.inscricao_norm, ''); else if (r.terrenos.codigo && r.terrenos.codigo !== proprio) outro.set(r.inscricao_norm, r.terrenos.codigo); });
  }
  return outro;
}
const travaOutro = (ou: string | undefined) => (ou === '' ? 'Está num terreno excluído' : ou ? `Já está no ${ou}` : null);
/** um lote do GeoSanja no formato do mapa: "L 0011" e, na inscrição de unidade, o final dela */
function loteSjc(ic: string, an: An, ter: An | null, ou: string | undefined, jaNa: boolean, sel?: boolean): Lote {
  const trava = travaOutro(ou), fr = ter ? fracao(an, ter) : 0, un = ic.slice(13);
  return { an, sql: ic, p: { ic }, condo: false, via: false, trava, fr, rot: rotulo(an), sel: sel ?? ((jaNa && !trava) || (!trava && fr >= LG_MIN)), area: null, end: '', q: quadraDe(ic),
    rf: `L ${ic.slice(8, 12)}`, rn: un && un !== '0000' ? `U ${un}` : '' };
}
/** o satélite do Google (híbrido, com os nomes das ruas) que cobre o quadro, e a matriz do pixel para o desenho */
function fundoGoogle(bb: number[]): Dados['fundo'] {
  if (!GMAPS_KEY) return undefined;
  const merc = (la: number, lo: number, z: number) => { const s = 256 * 2 ** z, y = Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)); return [((lo + 180) / 360) * s, ((1 - y / Math.PI) / 2) * s]; };
  const desm = (x: number, y: number, z: number) => { const s = 256 * 2 ** z; return [(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) * 180) / Math.PI, (x / s) * 360 - 180]; };
  const c = utmLatLng((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2), a = utmLatLng(bb[0] - 30, bb[1] - 30), b = utmLatLng(bb[2] + 30, bb[3] + 30);
  let z = 20;
  while (z > 12) { const p = merc(a[0], a[1], z), q = merc(b[0], b[1], z); if (Math.abs(q[0] - p[0]) < 620 && Math.abs(q[1] - p[1]) < 620) break; z--; }
  /* a imagem tem 1280 px (640 em escala 2): cada canto levado ao UTM dá a matriz afim do pixel para o desenho */
  const m0 = merc(c[0], c[1], z), canto = (px: number, py: number) => { const [la, lo] = desm(m0[0] + (px - 640) / 2, m0[1] + (py - 640) / 2, z), [x, y] = latLngUtm(la, lo); return [x, -y]; };
  const o = canto(0, 0), u = canto(1280, 0), v = canto(0, 1280);
  return { href: `https://maps.googleapis.com/maps/api/staticmap?center=${c[0].toFixed(7)},${c[1].toFixed(7)}&zoom=${z}&size=640x640&scale=2&maptype=hybrid&key=${GMAPS_KEY}`,
    m: [(u[0] - o[0]) / 1280, (u[1] - o[1]) / 1280, (v[0] - o[0]) / 1280, (v[1] - o[1]) / 1280, o[0], o[1]] };
}
async function carregarSjc(L: Lotes, ter0: P[] | null, ja: Set<string>, empresa: string, proprio: string | undefined, andamento: (n: number) => void): Promise<Dados> {
  let ter: An | null = null;
  if (L.modo !== 'sql') { ter = ter0!.map(([la, ln]) => latLngUtm(la, ln)); ter.push(ter[0]); }
  const r = await quadrasSjc(ter ? { ter, andamento } : { ics: L.ics || [], andamento });
  const outro = await emOutro(r.lotes.map((l) => digitos(l.ic)), empresa, proprio);
  const lotes = r.lotes.map((l) => loteSjc(l.ic, l.an, ter, outro.get(digitos(l.ic)), ja.has(digitos(l.ic))));
  if (!lotes.length) throw new Error('Nenhum lote do cadastro nessas quadras no GeoSanja.');
  const bb = lgBB(lotes.flatMap((l) => l.an).concat(ter || []));
  return { ter, lotes, quadras: r.quadras, bb, vias: [], sjc: true, fundo: fundoGoogle(bb) };
}

/* ---------- consulta ---------- */
async function carregar(L: Lotes, ter0: P[] | null, ja: Set<string>, empresa: string, proprio?: string): Promise<Dados> {
  let ter: An | null = null, qs: string[];
  if (L.modo === 'sql') qs = L.quadras || []; /* pelo SQL: as quadras dos SQLs, sem poligonal ainda */
  else {
    ter = ter0!.map(([la, ln]) => latLngUtm(la, ln)); ter.push(ter[0]);
    const g = { type: 'Polygon', coordinates: [ter] };
    // 1. lotes que a poligonal toca: dão as quadras (a ponta que só encosta numa quadra vizinha não a traz)
    const toca = await geoWfs({ typeNames: 'geoportal:lote_cidadao', count: '500', propertyName: 'cd_setor_fiscal,cd_quadra_fiscal,ge_poligono', CQL_FILTER: `INTERSECTS(ge_poligono,${geoWkt(g)})` });
    const peso: Record<string, number> = {};
    toca.forEach((f) => { const an = f.geometry && geoAneis(f.geometry)[0]; if (!an) return; const k = f.properties.cd_setor_fiscal + '.' + f.properties.cd_quadra_fiscal; peso[k] = Math.max(peso[k] || 0, fracao(an, ter!) * geoAreaAnel(an)); });
    qs = Object.entries(peso).filter(([, v]) => v >= 10).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (!qs.length) qs = Object.keys(peso);
    if (!qs.length) throw new Error('A poligonal não ocupa nenhum lote do cadastro da prefeitura.');
    qs = qs.slice(0, 8);
  }
  // 2. todos os lotes dessas quadras e os nomes das ruas em volta
  const fs = await geoWfs({ typeNames: 'geoportal:lote_cidadao', count: '3000', CQL_FILTER: qs.map((k) => { const [s, q] = k.split('.'); return `(cd_setor_fiscal='${s}' AND cd_quadra_fiscal='${q}')`; }).join(' OR ') });
  const ativos = fs.filter((f) => f.geometry && f.properties.tx_situ_lote !== 'INATIVO');
  /* SQL que já está em outro terreno não se marca (o índice único da empresa recusaria) */
  const ds = [...new Set(ativos.map((f) => digitos(f.properties.nr_contribuinte || '')).filter((d) => d.length === 11))];
  const outro = await emOutro(ds, empresa, proprio);
  const lotes: Lote[] = ativos.map((f) => {
    const p = f.properties, an = geoAneis(f.geometry)[0], sql: string | null = p.nr_contribuinte || null, d = digitos(sql || '');
    const condo = !!(p.cd_condominio && p.cd_condominio !== '00'), via = !!(p.tx_tipo_lote && p.tx_tipo_lote !== 'FISCAL'), ou = sql ? outro.get(d) : undefined, jaNa = ja.has(d);
    const trava = via ? 'Via de acesso: não tem SQL' : condo ? `Condomínio ${p.cd_condominio}: os SQLs das unidades não vêm no GeoSampa` : !sql ? 'Sem SQL no cadastro' : travaOutro(ou);
    const fr = ter ? fracao(an, ter) : 0;
    const rf = via ? '' : condo ? `CD ${p.cd_condominio}` : `F ${p.cd_lote}`, rn = p.cd_numero_porta && p.cd_numero_porta !== '0' && !via ? `N. ${p.cd_numero_porta}` : '';
    return { an, sql, p, condo, via, trava, fr, rot: rotulo(an), sel: (jaNa && !trava) || (!trava && fr >= LG_MIN), area: p.qt_area_terreno ?? null, end: endDe(p), q: p.cd_setor_fiscal + '.' + p.cd_quadra_fiscal, rf, rn };
  });
  if (!lotes.length) throw new Error('Nenhum lote ativo nessas quadras no GeoSampa.');
  const bb = lgBB(lotes.flatMap((l) => l.an).concat(ter || []));
  let vs: any[] = [];
  try { vs = await geoWfs({ typeNames: 'geoportal:v_logradouro_segmento', count: '400', bbox: [bb[0] - 25, bb[1] - 25, bb[2] + 25, bb[3] + 25].join(',') + ',urn:ogc:def:crs:EPSG::31983' }); } catch { /* sem os nomes das ruas */ }
  return { ter, lotes, quadras: qs, bb, vias: vias(vs, bb) };
}

export default function LotesGeo({ L, empresa }: { L: Lotes; empresa: string }) {
  const toast = useToast();
  const st = novoEstado(), nv = st.nv;
  const [fase, setFase] = useState<'carregando' | 'mapa' | 'erro'>('carregando');
  const [erro, setErro] = useState('');
  const [d, setD] = useState<Dados | null>(null);
  const [, setVer] = useState(0);
  const [tent, setTent] = useState(0);
  const [achados, setAchados] = useState(0);
  const [buscaPt, setBuscaPt] = useState(false);
  const sjc = !!L.sjc, nomeB = sjc ? 'GeoSanja' : 'GeoSampa';
  const vb = useRef<number[] | null>(null), vb0 = useRef<number[] | null>(null);
  const svgR = useRef<SVGSVGElement>(null), boxR = useRef<HTMLDivElement>(null), tipR = useRef<HTMLDivElement>(null);
  const voltar = () => (L.ficha ? L.ficha.fechar() : abrirLotes(null));

  useEffect(() => {
    let vivo = true;
    setFase('carregando'); vb.current = null; vb0.current = null;
    const ja = new Set(L.ficha ? L.ficha.sqls : (L.modo === 'sql' ? st.sql || [] : nv?.sqls || []).map((x) => digitos(x.sql)));
    const ter0 = L.ficha ? L.ficha.poly : L.modo === 'nv' ? nv?.polyDesenho || nv?.poly || null : null;
    setAchados(0);
    (sjc ? carregarSjc(L, ter0, ja, empresa, L.ficha?.codigo, (n) => vivo && setAchados(n)) : carregar(L, ter0, ja, empresa, L.ficha?.codigo))
      .then((r) => { if (vivo) { setD(r); setFase('mapa'); } })
      .catch((e) => { console.warn(e); if (vivo) { setErro(/poligonal não ocupa|Nenhum lote|não achou o lote/.test(e?.message) ? e.message : e?.message === 'BANCO' ? 'O banco do sistema está demorando para responder. Tente de novo em instantes.' : `O ${nomeB} não respondeu. Tente de novo em instantes.`); setFase('erro'); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tent]);

  /* rótulos com tamanho fixo na tela; some o que não cabe no lote na escala atual (o texto em 10px e o grupo encolhe por escala) */
  const escala = () => {
    const svg = svgR.current, v = vb.current; if (!svg || !v) return;
    const w = svg.clientWidth || 600, h = svg.clientHeight || 400, u = Math.max(v[2] / w, v[3] / h);
    svg.querySelectorAll<SVGTextElement>('.lg-vias text').forEach((x) => x.setAttribute('transform', `translate(${x.dataset.x} ${x.dataset.y}) rotate(${x.dataset.g}) scale(${u})`));
    svg.style.setProperty('--lg-w', String(u));
    svg.querySelectorAll<SVGTextElement>('.lg-rots text').forEach((x) => { const ve = +x.dataset.r! / u >= 10; x.style.display = ve ? '' : 'none'; if (ve) x.setAttribute('transform', `translate(${x.dataset.x} ${x.dataset.y}) scale(${u})`); });
  };
  const porVb = (v: number[]) => { vb.current = v; svgR.current?.setAttribute('viewBox', v.join(' ')); escala(); };
  const zoom = (f: number, cx?: number, cy?: number) => {
    const [x, y, w, h] = vb.current!, nw = Math.max(20, Math.min(vb0.current![2] * 3, w / f)), k = nw / w, nh = h * k;
    cx = cx ?? x + w / 2; cy = cy ?? y + h / 2; porVb([cx - (cx - x) * k, cy - (cy - y) * k, nw, nh]);
  };
  const pt = (svg: SVGSVGElement, ev: { clientX: number; clientY: number }) => {
    const r = svg.getBoundingClientRect(), [x, y, w, h] = vb.current!, u = Math.max(w / r.width, h / r.height), ox = (r.width * u - w) / 2, oy = (r.height * u - h) / 2;
    return [x - ox + (ev.clientX - r.left) * u, y - oy + (ev.clientY - r.top) * u];
  };
  useLayoutEffect(() => { escala(); });

  /* arrastar move, a roda aproxima, o clique marca e desmarca, parar o mouse mostra o SQL */
  useEffect(() => {
    const svg = svgR.current, box = boxR.current, tip = tipR.current;
    if (fase !== 'mapa' || !svg || !box || !tip || !d) return;
    let arr: { x: number; y: number; vb: number[] } | null = null, moveu = false;
    const roda = (e: WheelEvent) => { e.preventDefault(); const [x, y] = pt(svg, e); zoom(e.deltaY < 0 ? 1.25 : 0.8, x, y); };
    const baixo = (e: PointerEvent) => { arr = { x: e.clientX, y: e.clientY, vb: vb.current!.slice() }; moveu = false; svg.setPointerCapture?.(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (arr) {
        const dx = e.clientX - arr.x, dy = e.clientY - arr.y; if (Math.hypot(dx, dy) > 4) moveu = true;
        if (moveu) { const r = svg.getBoundingClientRect(), u = Math.max(arr.vb[2] / r.width, arr.vb[3] / r.height); porVb([arr.vb[0] - dx * u, arr.vb[1] - dy * u, arr.vb[2], arr.vb[3]]); tip.hidden = true; return; }
      }
      if (e.pointerType !== 'mouse') return;
      const el = (e.target as Element).closest?.('[data-lg]'); if (!el) { tip.hidden = true; return; }
      const l = d.lotes[+(el as HTMLElement).dataset.lg!], r = box.getBoundingClientRect();
      tip.innerHTML = dica(l, !!d.ter, !!d.sjc); tip.hidden = false;
      const tx = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 6), ty = e.clientY - r.top + 16 + tip.offsetHeight > r.height ? e.clientY - r.top - tip.offsetHeight - 10 : e.clientY - r.top + 16;
      tip.style.left = Math.max(6, tx) + 'px'; tip.style.top = Math.max(6, ty) + 'px';
    };
    const fim = (e: PointerEvent) => {
      if (!arr) return; arr = null; if (moveu || e.type === 'pointercancel') return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-lg]');
      if (!el) { if (d.sjc) acrescentar(pt(svg, e)); return; }
      const l = d.lotes[+(el as HTMLElement).dataset.lg!];
      if (l.trava) { toast(l.trava, true); return; }
      l.sel = !l.sel; setVer((v) => v + 1);
      tip.innerHTML = dica(l, !!d.ter, !!d.sjc);
    };
    const sai = (e: PointerEvent) => { if (e.pointerType === 'mouse' && !arr) tip.hidden = true; };
    svg.addEventListener('wheel', roda, { passive: false }); svg.addEventListener('pointerdown', baixo); svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', fim); svg.addEventListener('pointercancel', fim); svg.addEventListener('pointerleave', sai);
    return () => {
      svg.removeEventListener('wheel', roda); svg.removeEventListener('pointerdown', baixo); svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', fim); svg.removeEventListener('pointercancel', fim); svg.removeEventListener('pointerleave', sai);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, d]);

  /* São José: o clique fora dos lotes pergunta ao GeoSanja o lote daquele ponto e o acrescenta, marcado */
  async function acrescentar([x, y]: number[]) {
    if (!d || buscaPt) return;
    setBuscaPt(true);
    try {
      const [la, ln] = utmLatLng(x, -y), ic = await gsjNoPonto(la, ln);
      if (!ic) { toast('Nenhum lote do cadastro neste ponto (rua ou área sem lote).', true); return; }
      const ja = d.lotes.find((l) => l.sql === ic);
      if (ja) { if (ja.trava) toast(ja.trava, true); else { ja.sel = true; setVer((v) => v + 1); } return; }
      const g = await gsjLote(ic);
      if (!g) { toast(`O GeoSanja não trouxe o desenho do lote ${ic}.`, true); return; }
      const an = geoAneis(g)[0].map(([lo, lt]: number[]) => latLngUtm(lt, lo) as number[]);
      if (an[0][0] !== an[an.length - 1][0] || an[0][1] !== an[an.length - 1][1]) an.push(an[0]);
      const ou = (await emOutro([digitos(ic)], empresa, L.ficha?.codigo)).get(digitos(ic)), l = loteSjc(ic, an, d.ter, ou, false, ou === undefined);
      d.lotes.push(l); setVer((v) => v + 1);
      if (l.trava) toast(l.trava, true);
    } catch (e: any) { toast(e?.message === 'BANCO' ? 'O banco do sistema está demorando para responder.' : 'O GeoSanja não respondeu. Tente de novo.', true); }
    finally { setBuscaPt(false); }
  }

  function incluir() {
    if (!d) return;
    const marc = d.lotes.filter((l) => l.sel && !l.trava && l.sql);
    const novos: LoteSql[] = marc.map((l) => ({ sql: l.sql!, area: l.area, end: l.end || '', cib: l.p.cd_cib || null, poly: polyLl(l.an), q: l.q }));
    /* pela ficha: os marcados entram e os desmarcados saem (Partes.tsx) */
    if (L.ficha) { L.ficha.incluir(novos, d.quadras); return; }
    /* pelo SQL: os marcados voltam para a lista (os de outras quadras ficam como estavam) */
    if (L.modo === 'sql') { listaSql((novoEstado().sql || []).filter((x) => !d.quadras.includes(x.q || '')).concat(novos)); abrirLotes(null); return; }
    const n = novoEstado().nv; if (!n) return;
    /* a desenhada (ou do KMZ) fica guardada quando a poligonal passa a ser a dos lotes; pelo SQL não há desenhada */
    const des = n.polyDesenho || n.poly, guarda = n.fonte === 'sql' ? undefined : des, u = marc.length ? lotesUniao(novos.map((x) => x.poly)) : null;
    if (marc.length && !u) toast('Os lotes marcados não se encostam: a poligonal fica a desenhada.', true);
    const p = u || des;
    if (JSON.stringify(p) !== JSON.stringify(n.poly)) poligonal(p, n.fonte, empresa, n.nomeKmz, novos, { lgFeito: true, porLotes: !!u, polyDesenho: guarda, nome: n.nome, ignorados: undefined });
    else { atualizarNv({ sqls: novos, porLotes: !!u, polyDesenho: guarda }); abrirLotes(null); }
    if (u) toast(`Poligonal pela soma dos ${marc.length} lote${marc.length > 1 ? 's' : ''}: ${m2(areaPoly(u))}.`);
  }

  const nomeCab = L.ficha ? L.ficha.nome : L.modo === 'sql' ? `pel${sjc ? 'a inscrição' : 'o SQL'}` : nv?.nome || '';
  const cab = (
    <div className="dh"><div><h2>Lotes da prefeitura</h2><div className="faint">{L.ficha ? L.ficha.codigo : 'Novo terreno'}{nomeCab ? ` · ${nomeCab}` : ''}{d?.quadras ? ` · quadra${d.quadras.length > 1 ? 's' : ''} ${d.quadras.map((k) => k.replace('.', '-')).join(', ')}` : ''}</div></div>
      <button className="iconbtn" aria-label="Fechar" onClick={voltar}><Ic n="close" s={22} /></button></div>
  );
  if (fase === 'carregando') return <>{cab}<div className="lg-msg"><Ic n="layers" s={20} />{sjc ? `Montando as quadras pelo GeoSanja, lote a lote${achados ? `: ${achados} lote${achados > 1 ? 's' : ''} até agora` : ''}...` : 'Buscando os lotes das quadras no GeoSampa...'}</div></>;
  if (fase === 'erro' || !d) return <>{cab}<div className="banner warn"><Ic n="warn" /><div>{erro}</div></div>
    <div className="df"><button className="btn text" onClick={voltar}>{L.modo === 'nv' ? 'Seguir sem lotes' : 'Voltar'}</button><button className="btn" onClick={() => setTent((t) => t + 1)}>Tentar de novo</button></div></>;

  const [x0, y0, x1, y1] = d.bb, mg = 12;
  if (!vb.current) { vb.current = [x0 - mg, -y1 - mg, x1 - x0 + 2 * mg, y1 - y0 + 2 * mg]; vb0.current = vb.current.slice(); }
  /* em São José não há área cadastral: a soma é a do desenho dos lotes */
  const sel = d.lotes.filter((l) => l.sel && !l.trava), area = sel.reduce((s, l) => s + (d.sjc ? geoAreaAnel(l.an) : l.area || 0), 0);
  const rot = (l: Lote) => ({ f: l.rf, n: l.rn });
  return <>
    {cab}
    <div className="lg-corpo"><div className="lg-mapa" ref={boxR}>
      <svg className={`lg-svg${d.fundo ? ' lg-sat' : ''}`} ref={svgR} viewBox={vb.current.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de lotes das quadras">
        <rect x={x0 - 2000} y={-y1 - 2000} width={x1 - x0 + 4000} height={y1 - y0 + 4000} className="lg-fundo" />
        {d.fundo && <image href={d.fundo.href} width={1280} height={1280} transform={`matrix(${d.fundo.m.join(' ')})`} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />}
        <g>{d.lotes.map((l, i) => <path key={i} d={caminho(l.an)} data-lg={i} className={`lg-l${l.sel && !l.trava ? ' sel' : ''}${l.trava ? ' x' : ''}`} />)}</g>
        {d.ter && <path d={caminho(d.ter)} className="lg-ter" />}
        <g className="lg-vias">{d.vias.map((v) => <text key={v.n} data-x={v.x.toFixed(1)} data-y={(-v.y).toFixed(1)} data-g={(-v.ang).toFixed(1)}>{v.n}</text>)}</g>
        <g className="lg-rots">{d.lotes.map((l, i) => { const { f, n } = rot(l); if (!f) return null;
          return <text key={i} data-r={l.rot.r.toFixed(2)} data-x={l.rot.x.toFixed(2)} data-y={(-l.rot.y).toFixed(2)}><tspan x="0" dy="-0.2em">{f}</tspan>{n && <tspan x="0" dy="1.15em">{n}</tspan>}</text>; })}</g>
      </svg>
      <div className="lg-tip" ref={tipR} hidden />
      <div className="lg-zoom"><button className="iconbtn sm" aria-label="Aproximar" onClick={() => zoom(1.5)}>+</button><button className="iconbtn sm" aria-label="Afastar" onClick={() => zoom(1 / 1.5)}>−</button>
        <button className="iconbtn sm" aria-label="Enquadrar" title="Enquadrar" onClick={() => porVb(vb0.current!.slice())}><Ic n="layers" s={16} /></button></div>
      <div className="lg-leg"><span><i className="lg-sw sel" />Marcado</span><span><i className="lg-sw" />Lote</span><span><i className="lg-sw x" />Não se marca</span>{d.ter && <span><i className="lg-sw ter" />Poligonal</span>}</div>
    </div>
      <div className="lg-lado"><div className="lg-tot"><b>{sel.length} lote{sel.length === 1 ? '' : 's'} marcado{sel.length === 1 ? '' : 's'}</b>{area ? <span className="muted"> · {m2(area)} de {d.sjc ? 'área pelo desenho' : 'área cadastral'}</span> : null}</div>
        <div className="hint" style={{ margin: '4px 0 8px' }}><span className="lg-mouse">{d.sjc ? <>Clique no lote para marcar ou desmarcar; clique fora dos lotes para acrescentar o lote daquele ponto{buscaPt ? ' (buscando...)' : ''}. Pare o mouse em cima para ver a inscrição. A roda aproxima.</>
          : 'Clique no lote para marcar ou desmarcar. Pare o mouse em cima para ver o SQL. A roda aproxima e mostra os números dos lotes pequenos.'}</span></div>
        <div className="lg-lista">{sel.length ? sel.map((l) => <div key={l.sql || l.p.cd_lote} className="lg-it"><span className="num">{l.sql}</span><span className="faint">{l.end || ''}{d.sjc ? `${m2(geoAreaAnel(l.an))} pelo desenho` : l.area ? ` · ${m2(l.area)}` : ''}</span></div>) : <div className="muted">Nenhum lote marcado.</div>}</div></div></div>
    <div className="df"><button className="btn text" onClick={voltar}>{L.ficha ? 'Cancelar' : L.modo === 'nv' ? 'Agora não' : 'Voltar'}</button>
      <button className="btn primary" disabled={L.modo === 'sql' && !sel.length} onClick={incluir}>{L.modo !== 'nv' ? `Usar ${sel.length} lote${sel.length === 1 ? '' : 's'}` : sel.length ? `Usar ${sel.length} lote${sel.length > 1 ? 's' : ''}` : 'Seguir sem lotes'}</button></div>
  </>;
}

function dica(l: Lote, comTer: boolean, sjc = false) {
  const e = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  if (sjc) return `<b class="num">Inscrição ${e(l.sql || '')}</b><div>${m2(geoAreaAnel(l.an))} pelo desenho</div>${l.rn ? '<div>Inscrição de unidade: o lote pode ser um condomínio</div>' : ''}`
    + (l.trava ? `<div class="lg-tip-x">${e(l.trava)}</div>` : `<div class="faint">${comTer ? `${Math.round(l.fr * 100)}% dentro da poligonal · ` : ''}${l.sel ? 'marcado' : 'clique para marcar'}</div>`);
  return `<b class="num">${l.sql ? 'SQL ' + e(l.sql) : l.via ? 'Via de acesso' : l.condo ? 'Condomínio ' + e(l.p.cd_condominio) : 'Sem SQL'}</b>${l.end ? `<div>${e(l.end)}</div>` : ''}${l.area ? `<div>${m2(l.area)} de terreno</div>` : ''}`
    + (l.trava ? `<div class="lg-tip-x">${e(l.trava)}</div>` : `<div class="faint">${comTer ? `${Math.round(l.fr * 100)}% dentro da poligonal · ` : ''}${l.sel ? 'marcado' : 'clique para marcar'}</div>`);
}
