/* eslint-disable @typescript-eslint/no-explicit-any */
// Detalhes da contaminação (pedido do Moises, 9/nov/2026): o popup aberto por "Ver detalhes" em Restrições e entorno e em
// Histórico de uso, com tudo o que a prefeitura guarda de cada registro (SIGAC: potencial ou suspeita de contaminação, por lote;
// áreas contaminadas e reabilitadas da SVMA: endereço, classificação, contaminantes...) e um recorte do mapa de lotes do
// GeoSampa (WMS lote_cidadao, o mesmo desenho do site) com a poligonal do terreno em azul e cada registro numerado em vermelho.
// As geometrias não ficam guardadas na consulta: são pedidas ao GeoSampa ao abrir, pelo identificador de cada registro.
import { useEffect, useState, type ReactNode } from 'react';
import { Dialogo } from '../components/ui';
import { GEO_BASE, geoAneis, geoWfs, latLngUtm } from '../novo/geosampa';
import { num } from './edicao';
import { fmtCep } from '../lib/mascara';

export const CONT_KS = ['area_contaminada_reabilitada_svma', 'GEOSAMPA_area_contaminada_sigac', 'area_contaminada_reabilitada_svma@30', 'GEOSAMPA_area_contaminada_sigac@30'];

interface Reg { tipo: 'svma' | 'sigac'; id: number; p: any; dist: number }

/** os registros de contaminação das camadas, sem repetir (o do terreno vale sobre o mesmo a até 30 m) */
export function registrosCont(camadas: Record<string, any[]>): Reg[] {
  const m = new Map<string, Reg>();
  for (const k of CONT_KS) for (const p of camadas[k] || []) {
    const tipo = k.startsWith('GEOSAMPA') ? 'sigac' : 'svma';
    const id = tipo === 'sigac' ? p.cd_identificador_area_contaminada_sigac : p.cd_identificador_area_contaminada_reabilitada;
    if (id == null) continue;
    const dist = /@/.test(k) ? Number(p._dist_m ?? 0) : 0, ch = tipo + id, o = m.get(ch);
    if (!o || dist < o.dist) m.set(ch, { tipo, id, p: { ...(o?.p ?? {}), ...p }, dist });
  }
  /* a área confirmada (SVMA) primeiro, depois pela distância */
  return [...m.values()].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'svma' ? -1 : 1) || a.dist - b.dist);
}

const dt = (s: string | null | undefined) => {
  if (!s) return null;
  const d = new Date(String(s).slice(0, 10) + 'T12:00');
  return isNaN(+d) ? String(s) : d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ de /g, ' ').replace('.', '');
};
const sim = (v: any) => (v == null ? null : /^s/i.test(String(v)) ? 'Sim' : 'Não');
const sqlLote = (p: any) => (p.cd_setor_fiscal ? `${p.cd_setor_fiscal}.${p.cd_quadra_fiscal}.${p.cd_lote}${p.cd_condominio && p.cd_condominio !== '00' ? ` (condomínio ${p.cd_condominio})` : ''}` : null);
const ond = (r: Reg) => (r.dist > 0 ? `a ${num(r.dist)} m do terreno` : 'no terreno');

function linhas(r: Reg): [string, ReactNode][] {
  const p = r.p;
  const L: [string, any][] = r.tipo === 'sigac' ? [
    ['Atividade', p.dc_atividade],
    ['Lote (setor.quadra.lote)', sqlLote(p)],
    ['Origem do registro', p.dc_tipo_requisicao],
    ['Número do processo', p.nr_processo],
    ['Documento', p.dc_numero_documento_requisicao],
    ['Cadastrado em', dt(p.dt_atualizacao_processo)],
    ['Última atualização', dt(p.dt_atualizacao_requisicao) !== dt(p.dt_atualizacao_processo) ? dt(p.dt_atualizacao_requisicao) : null],
    ['Ativo no cadastro', sim(p.in_ativo)],
    ['Código na prefeitura', p.cd_area ?? p.cd_identificador_area_contaminada_sigac],
  ] : [
    ['Classificação', p.dc_classificacao_area_contaminada],
    ['Endereço', [p.tx_endereco_area_contaminada, p.cd_cep_area_contaminada ? 'CEP ' + fmtCep(p.cd_cep_area_contaminada) : null].filter(Boolean).join(' · ') || null],
    ['Contaminantes', p.tx_contaminante],
    ['Uso anterior', p.dc_uso_anterior_geral],
    ['Uso pretendido', p.dc_uso_pretendido_geral],
    ['Terreno', p.dc_tipo_terreno_area_contaminada],
    ['Restrições', p.tx_restricao],
    ['Intervenção', p.tx_intervencao],
    ['Incluída no cadastro em', dt(p.dt_inclusao_cadastro)],
    ['Última modificação', dt(p.dt_modificacao_cadastro)],
    ['Também na Cetesb', sim(p.in_cadastro_cetesb)],
    ['Também no SIGAC / SIPOL', [sim(p.in_cadastro_sigac), sim(p.in_cadastro_sipol)].every((x) => x == null) ? null : `${sim(p.in_cadastro_sigac) ?? '—'} / ${sim(p.in_cadastro_sipol) ?? '—'}`],
    ['Código na prefeitura', p.cd_identificador_area_contaminada_reabilitada],
  ];
  return L.filter(([, v]) => v != null && v !== '');
}

/** o recorte do mapa de lotes do GeoSampa com o terreno e os registros */
function Recorte({ poly, regs }: { poly: [number, number][] | null; regs: Reg[] }) {
  const [gs, setGs] = useState<Record<string, any> | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let vivo = true;
    Promise.all(regs.map(async (r) => {
      const [cam, k] = r.tipo === 'sigac' ? ['GEOSAMPA_area_contaminada_sigac', 'cd_identificador_area_contaminada_sigac'] : ['area_contaminada_reabilitada_svma', 'cd_identificador_area_contaminada_reabilitada'];
      const fs = await geoWfs({ typeNames: 'geoportal:' + cam, CQL_FILTER: `${k}=${Number(r.id)}`, count: '1' });
      return [r.tipo + r.id, fs[0]?.geometry ?? null] as const;
    })).then((xs) => vivo && setGs(Object.fromEntries(xs))).catch(() => vivo && setErro(true));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regs.map((r) => r.tipo + r.id).join()]);
  if (!GEO_BASE) return <div className="hint">O mapa de lotes do GeoSampa só aparece na versão publicada.</div>;
  if (erro) return <div className="hint">O GeoSampa não respondeu; o mapa não pôde ser montado. Os dados abaixo continuam valendo.</div>;
  if (!gs) return <div className="ct-mapa ct-carr muted">Montando o mapa de lotes…</div>;
  const ter = (poly ?? []).map(([la, ln]) => latLngUtm(la, ln));
  const formas = regs.map((r, i) => ({ i: i + 1, an: geoAneis(gs[r.tipo + r.id]) })).filter((x) => x.an.length);
  const pts = [...ter, ...formas.flatMap((x) => x.an.flat())];
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  /* folga de 25% (mínimo 25 m) e proporção 3:2 */
  const mg = Math.max(25, 0.25 * Math.max(x1 - x0, y1 - y0)); x0 -= mg; x1 += mg; y0 -= mg; y1 += mg;
  const W = 720, H = 480, r0 = W / H, w = x1 - x0, h = y1 - y0;
  if (w / h > r0) { const d = (w / r0 - h) / 2; y0 -= d; y1 += d; } else { const d = (h * r0 - w) / 2; x0 -= d; x1 += d; }
  const sx = (x: number) => ((x - x0) / (x1 - x0)) * W, sy = (y: number) => ((y1 - y) / (y1 - y0)) * H;
  const d = (an: number[][]) => an.map((p, j) => `${j ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('') + 'Z';
  const wms = `${GEO_BASE}wms?service=WMS&version=1.1.1&request=GetMap&layers=geoportal:lote_cidadao&styles=&srs=EPSG:31983&bbox=${[x0, y0, x1, y1].map((v) => v.toFixed(1)).join(',')}&width=${W * 2}&height=${H * 2}&format=image/png&transparent=true&format_options=dpi:180`;
  const centro = (an: number[][][]) => { const p = an[0]; return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]; };
  return (
    <figure className="ct-mapa">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa de lotes com o terreno e os registros de contaminação">
        <rect width={W} height={H} fill="#fff" />
        <image href={wms} x="0" y="0" width={W} height={H} />
        {formas.map((x) => x.an.map((an, j) => <path key={x.i + '-' + j} d={d(an)} fill="rgba(179,38,30,.28)" stroke="#b3261e" strokeWidth="2.5" />))}
        {ter.length > 2 ? <path d={d(ter)} fill="rgba(11,87,208,.12)" stroke="#0b57d0" strokeWidth="3" /> : null}
        {formas.map((x) => { const [cx, cy] = centro(x.an); return <g key={'n' + x.i}><circle cx={sx(cx)} cy={sy(cy)} r="12" fill="#b3261e" stroke="#fff" strokeWidth="2" /><text x={sx(cx)} y={sy(cy) + 4.5} textAnchor="middle" fontSize="13" fontWeight="600" fill="#fff">{x.i}</text></g>; })}
      </svg>
      <figcaption className="ct-leg"><span><i className="ct-t" />Terreno</span><span><i className="ct-c" />Registro de contaminação (número da lista)</span><span className="faint">Mapa de lotes do GeoSampa</span></figcaption>
    </figure>
  );
}

export function DetalhesContaminacao({ regs, poly, fechar }: { regs: Reg[]; poly: [number, number][] | null; fechar: () => void }) {
  return (
    <Dialogo titulo="Contaminação no terreno e em volta" sub={`${regs.length} registro${regs.length > 1 ? 's' : ''} da prefeitura, no terreno e a até 30 m`} onFechar={fechar}>
      <div className="ct-b">
        <Recorte poly={poly} regs={regs} />
        {regs.map((r, i) => (
          <section className="ct-r" key={r.tipo + r.id}>
            <h3><span className="ct-n">{i + 1}</span>{r.tipo === 'svma' ? 'Área contaminada ou reabilitada' : r.p.dc_tipo_situacao && /suspeita/i.test(r.p.dc_tipo_situacao) ? 'Suspeita de contaminação' : 'Potencial de contaminação'}
              <span className="faint"> · {ond(r)}</span></h3>
            <dl className="kvl">{linhas(r).map(([k, v]) => <div className="kv" key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </section>
        ))}
        <div className="hint">{regs.some((r) => r.tipo === 'sigac')
          ? '"Potencial de contaminação" quer dizer que um cadastro da prefeitura registrou ali uma atividade que costuma contaminar (posto, indústria, oficina...), não que a contaminação foi constatada. "Atividade potencial" é o texto genérico do cadastro: a prefeitura não diz qual atividade. '
          : ''}Fontes: SIGAC e cadastro de áreas contaminadas e reabilitadas da SVMA, pelo GeoSampa.</div>
      </div>
    </Dialogo>
  );
}
