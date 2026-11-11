/* eslint-disable @typescript-eslint/no-explicit-any */
// Aba Entorno da ficha, portada do protótipo: Pontos de interesse (proto_mod.js › entornoCard, poiExcluidos),
// Renda e população do entorno e Perfil da população (proto_setores.js › setoresCard, perfilCard, com o mesmo
// seletor de raio) e Concorrência no entorno (proto_mercado.js › mkSecaoHtml).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { GMAPS_KEY } from '../lib/config';
import { Dialogo, useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { m2 } from '../lib/format';
import DEMO_CFG from '../../../../tools/setores/demografia.json';
import { carregarDemo, carregarSetores, estatArea, MUNICIPIOS_SETORES, perfilArea, RAIO_MAX, RAIO_MIN, RD_RAIOS, RENDA_MET, setores, temSetores, type Raio } from '../mapa/setores';
import { carregarMercado, mercado, mkM2, mkPct, mkVso, MK_SIT, MK_GLIFO, brl, num as nmk, type Emp } from '../mapa/mercado';
import { Resumo, TabelaEmp } from '../mapa/Concorrencia';
import { Metodologia } from '../mapa/CamadasSetor';
import { buscarEntorno, distM, medirPontos, rotaPe } from './entorno';
import type { Ficha, R } from './dados';
import { Quadro } from './edicao';
import { Busca, buscando } from '../lib/buscando';

const num = (v: number | null | undefined, d = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
const kmTxt = (m: number) => (m < 1000 ? Math.round(m / 10) * 10 + ' m' : num(m / 1000, m < 10000 ? 2 : 1) + ' km');
const fd = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ de /g, ' ').replace('.', '') : '—');
const CAT_POI: Record<string, string> = { transporte: 'Transporte', escola: 'Escola', saude: 'Saúde', comercio: 'Comércio', lazer: 'Lazer', empresa: 'Empresa', outro: 'Outro' };

/* ---------- dados ---------- */
function useEntorno(f: Ficha) {
  return useQuery({
    queryKey: ['entorno', f.id],
    enabled: f.lat != null,
    queryFn: async () => {
      const [g, ex, bus, cats, pts, dist, pex, us] = await Promise.all([
        supabase.from('v_terreno_entorno').select('google_place_id,categoria,categoria_nome,nome,latitude,longitude,distancia_pe_m,duracao_pe_s').eq('terreno_id', f.id),
        supabase.from('terreno_entorno').select('google_place_id,nome,excluido_em,excluido_por').eq('terreno_id', f.id).not('excluido_em', 'is', null),
        supabase.from('terreno_entorno_buscas').select('latitude,longitude,rota_a_pe,buscado_em').eq('terreno_id', f.id).maybeSingle(),
        supabase.from('entorno_categorias').select('codigo,nome,raio_pe_m,ordem').eq('ativo', true).order('ordem'),
        supabase.from('pontos_interesse').select('id,nome,categoria,latitude,longitude').eq('ativo', true),
        supabase.from('terreno_ponto_distancias').select('ponto_id,latitude,longitude,distancia_pe_m,duracao_pe_s').eq('terreno_id', f.id),
        supabase.from('terreno_pontos_excluidos').select('ponto_id,excluido_em,excluido_por').eq('terreno_id', f.id),
        supabase.from('usuarios').select('user_id,nome,email'),
      ]);
      for (const r of [g, ex, bus, cats, pts, dist, pex, us]) if (r.error) throw r.error;
      return {
        g: g.data as R[], ex: ex.data as R[], bus: bus.data as R | null, cats: cats.data as R[], pts: pts.data as R[], dist: dist.data as R[], pex: pex.data as R[],
        nomes: new Map((us.data as R[]).map((u) => [u.user_id, u.nome || u.email])),
      };
    },
  });
}
type D = NonNullable<ReturnType<typeof useEntorno>['data']>;

/* busca automática, uma vez por localização (como o protótipo, gEntornoAuto): lugares do Google e rotas até os pontos da empresa */
const TENT = new Set<string>(), EM_CURSO = new Set<string>();
const mesmo = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(a - b) < 1e-7;
function useAuto(f: Ficha, d: D | undefined, ve: () => void) {
  const { edita } = useSessao();
  const qc = useQueryClient(), toast = useToast();
  useEffect(() => {
    if (!d || !edita || !GMAPS_KEY || f.lat == null || f.lng == null) return;
    const lat = f.lat, lng = f.lng;
    const kb = f.id + '|' + lat + '|' + lng;
    if (!(d.bus && mesmo(d.bus.latitude, lat) && mesmo(d.bus.longitude, lng)) && !TENT.has(kb)) {
      TENT.add(kb); EM_CURSO.add(f.id); ve();
      buscando(f.id, 'entorno', buscarEntorno(f.id, lat, lng))
        .then((r) => { if (!r.rota) toast('A rota a pé não respondeu; os pontos foram filtrados pela distância em linha reta.'); })
        .catch((e) => { console.warn('entorno', e); toast('Não foi possível buscar os pontos de interesse no Google agora.'); })
        .finally(() => { EM_CURSO.delete(f.id); ve(); qc.invalidateQueries({ queryKey: ['entorno', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] }); });
    }
    const falta = d.pts.filter((p) => !d.dist.some((x) => x.ponto_id === p.id && mesmo(x.latitude, lat) && mesmo(x.longitude, lng)));
    const kd = 'd|' + kb + '|' + falta.map((p) => p.id).sort().join(',');
    if (falta.length && !TENT.has(kd)) {
      TENT.add(kd);
      medirPontos(f.id, lat, lng, falta as any).then(() => qc.invalidateQueries({ queryKey: ['entorno', f.id] })).catch((e) => console.warn('rotas dos pontos', e));
    }
  }, [d, edita, f.id, f.lat, f.lng, qc, toast, ve]);
}

/** a busca roda com a ficha aberta em qualquer aba (a Visão geral mostra a estação mais perto) */
export function EntornoAuto({ f }: { f: Ficha }) {
  const q = useEntorno(f);
  const [, re] = useState(0);
  const ve = useCallback(() => re((x) => x + 1), []);
  useAuto(f, q.data, ve);
  return null;
}

/** aba Mercado (pedido do Moises, 10/nov/2026): concorrência, renda, perfil da população e
    pontos de interesse, cada um num chip; o Entorno de Estudos Técnicos saiu */
export default function AbaMercado({ f }: { f: Ficha }) {
  /* um raio para cada quadro (pedido do Moisés, 6/nov/2026: antes era o mesmo nos dois) */
  const rd = useRaioSalvo('rd'), pf = useRaioSalvo('pf');
  if (f.lat == null || f.lng == null) return <section className="sec"><div className="empty">Localize o terreno (aba Terreno, Localização) para ver o mercado.</div></section>;
  return (
    <div className="stack">
      {/* ordem pedida pelo Moises (10/nov/2026): Concorrência primeiro, Pontos de interesse por último */}
      <SecConcorrencia f={f} />
      <SecRenda f={f} r={rd} />
      <SecPerfil f={f} r={pf} />
      <SecPontos f={f} />
    </div>
  );
}

/* ---------- Pontos de interesse ---------- */
interface Linha { tp: 'g' | 'e'; id: string; nome: string; cat: string; ord: number; dist: string; modo: string; url: string }

function SecPontos({ f }: { f: Ficha }) {
  const { edita } = useSessao();
  const qc = useQueryClient(), toast = useToast();
  const q = useEntorno(f), d = q.data;
  const [, re] = useState(0);
  const ve = useCallback(() => re((x) => x + 1), []);
  useAuto(f, d, ve);
  const [todos, setTodos] = useState(false), [verExc, setVerExc] = useState(false);
  const lat = f.lat!, lng = f.lng!;
  const busc = EM_CURSO.has(f.id);
  const excluir = async (x: Linha) => {
    if (!confirm(`Excluir "${x.nome}" dos pontos de interesse deste terreno?`)) return;
    const r = x.tp === 'g' ? await supabase.rpc('excluir_lugar_entorno', { p_terreno: f.id, p_google_place_id: x.id }) : await supabase.rpc('excluir_ponto_terreno', { p_terreno: f.id, p_ponto: x.id });
    if (r.error) { toast(r.error.message); return; }
    await qc.invalidateQueries({ queryKey: ['entorno', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] });
    toast('Ponto excluído deste terreno.');
  };
  const restaurar = async (tp: string, id: string) => {
    const r = tp === 'g' ? await supabase.rpc('restaurar_lugar_entorno', { p_terreno: f.id, p_google_place_id: id }) : await supabase.rpc('restaurar_ponto_terreno', { p_terreno: f.id, p_ponto: id });
    if (r.error) { toast(r.error.message); return; }
    await qc.invalidateQueries({ queryKey: ['entorno', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] });
  };
  let corpo: ReactNode;
  if (q.isLoading) corpo = <div className="muted">Carregando…</div>;
  else if (q.error || !d) corpo = <div className="muted">Não foi possível carregar o entorno.</div>;
  else {
    const semPe = d.bus?.rota_a_pe === false, mudou = !!d.bus && !(mesmo(d.bus.latitude, lat) && mesmo(d.bus.longitude, lng));
    const g: Linha[] = d.g.map((p) => ({ tp: 'g', id: p.google_place_id, nome: p.nome, cat: p.categoria_nome, ord: p.distancia_pe_m, dist: kmTxt(p.distancia_pe_m),
      modo: p.duracao_pe_s != null ? `${Math.max(1, Math.round(p.duracao_pe_s / 60))} min a pé` : semPe ? 'em linha reta' : 'a pé', url: rotaPe(lat, lng, p.latitude, p.longitude) }));
    const exc = new Set(d.pex.map((x) => x.ponto_id));
    const e: Linha[] = d.pts.filter((p) => !exc.has(p.id)).map((p) => {
      const x = d.dist.find((y) => y.ponto_id === p.id && mesmo(y.latitude, lat) && mesmo(y.longitude, lng)), reta = distM(lat, lng, p.latitude, p.longitude);
      const c = { tp: 'e' as const, id: p.id, nome: p.nome, cat: CAT_POI[p.categoria] || 'Outro', url: rotaPe(lat, lng, p.latitude, p.longitude) };
      return x?.distancia_pe_m != null ? { ...c, ord: x.distancia_pe_m, dist: kmTxt(x.distancia_pe_m), modo: `${Math.max(1, Math.round((x.duracao_pe_s || 0) / 60))} min a pé` }
        : { ...c, ord: reta, dist: kmTxt(reta), modo: 'em linha reta' };
    });
    const its = [...g, ...e].sort((a, b) => a.ord - b.ord), lim = todos ? 999 : 8;
    const raioTxt = kmTxt(d.cats[0]?.raio_pe_m ?? 1500);
    const vaz = d.bus ? d.cats.filter((c) => !d.g.some((x) => x.categoria === c.codigo)).map((c) => String(c.nome).charAt(0).toLowerCase() + String(c.nome).slice(1)) : [];
    const jun = (l: string[]) => (l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : l[0]);
    const aviso = !d.bus ? (busc ? `Buscando no Google lugares a até ${raioTxt} a pé…` : !GMAPS_KEY ? 'Os lugares do Google são buscados quando o terreno é localizado; o Google não está disponível aqui.' : edita ? 'Os lugares do Google ainda não foram buscados.' : 'Os lugares do Google ainda não foram buscados para este terreno.') : '';
    const excl = [...d.ex.map((x) => ({ tp: 'g', id: x.google_place_id, nome: x.nome, em: x.excluido_em, por: x.excluido_por, orig: 'Google' })),
      ...d.pex.map((x) => ({ tp: 'e', id: x.ponto_id, nome: d.pts.find((p) => p.id === x.ponto_id)?.nome, em: x.excluido_em, por: x.excluido_por, orig: 'Cadastrado pela empresa' })).filter((x) => x.nome)]
      .sort((a, b) => String(b.em).localeCompare(String(a.em)));
    corpo = <>
      {its.length ? <>
        <ul className={`poil ent-l${edita ? ' com-x' : ''}`}>
          {its.slice(0, lim).map((x) => (
            <li key={x.tp + x.id}>
              <span><span className="t1">{x.nome}</span><span className="t2">{x.cat} · {x.modo}<span className="so-m"> · {x.dist}</span></span></span>
              <span className="num poi-d">{x.dist}</span>
              <a className="iconbtn sm poi-rota" href={x.url} target="_blank" rel="noopener noreferrer" aria-label={`Rota até ${x.nome}`} title="Rota"><Ic n="rota" s={18} /></a>
              {edita && <button type="button" className="iconbtn poi-x" aria-label={`Excluir ${x.nome}`} title="Excluir" onClick={() => excluir(x)}><Ic n="lixo" s={18} /></button>}
            </li>
          ))}
        </ul>
        {its.length > 8 && <button type="button" className="linkbtn" style={{ marginTop: 6 }} onClick={() => setTodos((v) => !v)}>{todos ? 'Mostrar menos' : `Mostrar mais ${its.length - 8}`}</button>}
      </> : aviso ? null : <div className="muted">Nenhum ponto de interesse.</div>}
      {aviso && <div className="muted" style={its.length ? { marginTop: 8 } : undefined}>{aviso}</div>}
      {vaz.length > 0 && <div className="hint ent-sem">Sem {jun(vaz)} a até {raioTxt} a pé.</div>}
      {d.bus && (busc || semPe || mudou) && <div className="hint ent-pe">{busc ? 'Atualizando no Google… · ' : ''}{semPe ? 'Lugares do Google em linha reta (sem rota a pé) · ' : ''}{fd(d.bus.buscado_em)}{mudou && <> · <b>a localização mudou depois da busca</b></>}</div>}
      {excl.length > 0 && <div className="ent-exc">
        <button type="button" className="linkbtn" aria-expanded={verExc} onClick={() => setVerExc((v) => !v)}>{verExc ? 'Ocultar excluídos' : `Excluídos (${excl.length})`}</button>
        {verExc && <ul className="poil ent-l">{excl.map((x) => (
          <li key={x.tp + x.id}><span><span className="t1">{x.nome}</span><span className="t2">{x.orig} · excluído por {d.nomes.get(x.por) ?? '—'} em {fd(x.em)}</span></span>
            {edita && <button type="button" className="linkbtn" onClick={() => restaurar(x.tp, x.id)}>Restaurar</button>}</li>
        ))}</ul>}
      </div>}
    </>;
  }
  return (
    <Quadro aba="mercado" id="ent" chip="Pontos de interesse" titulo={<>Pontos de interesse <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>distâncias a pé</span><Busca terreno={f.id} fontes={['entorno']} /></>}>
      <div className="sec-b">{corpo}</div>
    </Quadro>
  );
}

/* ---------- setores do IBGE: carregamento compartilhado ---------- */
function useSetores(demo: boolean) {
  const [st, setSt] = useState<'ok' | 'carregando' | 'erro'>(() => (setores() ? 'ok' : 'carregando'));
  useEffect(() => {
    let vivo = true;
    Promise.all([carregarSetores(), demo ? carregarDemo() : null]).then(() => vivo && setSt('ok')).catch(() => vivo && setSt('erro'));
    return () => { vivo = false; };
  }, [demo]);
  return st;
}
/* seletor de raio: 500 m, 1, 2, 3 km e Personalizado com lápis, em que a pessoa digita o raio em metros,
   de 100 m a 20 km (pedidos do Moises, 11/nov/2026; a Poligonal saiu por ora). O raio escolhido e o personalizado
   de cada quadro ficam guardados no navegador e valem para todos os terrenos. */
const raioTxt = (m: number) => (m < 1000 ? num(m) + ' m' : num(m / 1000, 2) + ' km');
const RAIO_LKEY = 'bkm-terrenos-mercado-raio';
interface RaioSalvo { raio: Raio; cust: number | null; mudar: (raio: Raio, cust?: number | null) => void }
const raioOk = (n: unknown): n is number => typeof n === 'number' && n >= RAIO_MIN && n <= RAIO_MAX;
function useRaioSalvo(id: 'rd' | 'pf'): RaioSalvo {
  const [v, setV] = useState<{ raio: Raio; cust: number | null }>(() => {
    try {
      const o = JSON.parse(localStorage.getItem(RAIO_LKEY) || '{}')[id];
      if (o) return { raio: raioOk(o.raio) ? o.raio : 1000, cust: raioOk(o.cust) ? o.cust : null };
    } catch { /* sem armazenamento */ }
    return { raio: 1000, cust: null };
  });
  const mudar = (raio: Raio, cust?: number | null) => {
    const n = { raio, cust: cust === undefined ? v.cust : cust };
    setV(n);
    try { const t = JSON.parse(localStorage.getItem(RAIO_LKEY) || '{}'); t[id] = n; localStorage.setItem(RAIO_LKEY, JSON.stringify(t)); } catch { /* sem armazenamento */ }
  };
  return { ...v, mudar };
}
function Raios({ r: { raio, cust, mudar } }: { r: RaioSalvo }) {
  const toast = useToast();
  const [ed, setEd] = useState(false);
  const ativo = typeof raio === 'number' && !RD_RAIOS.some(([k]) => k === raio);
  const fim = useRef(false); // o blur da saída depois do Enter não aplica de novo
  const aplicar = (v: string) => {
    if (fim.current) return;
    fim.current = true; setEd(false);
    const s = v.replace(/\./g, '').replace(',', '.').trim();
    if (!s) return;
    const n = Math.round(Number(s));
    if (!raioOk(n)) { toast(`O raio vai de ${raioTxt(RAIO_MIN)} a ${raioTxt(RAIO_MAX)}.`, true); return; }
    mudar(n, n);
  };
  return (
    <div className="rd-raios seg" role="group" aria-label="Raio">
      {RD_RAIOS.map(([k, l]) => <button key={k} type="button" aria-pressed={raio === k} onClick={() => mudar(k)}>{l}</button>)}
      {ed
        ? <form className="rd-cust" onSubmit={(e) => { e.preventDefault(); aplicar((e.currentTarget.elements.namedItem('r') as HTMLInputElement).value); }}>
            <input name="r" inputMode="numeric" data-fmt="int" aria-label="Raio personalizado, em metros" placeholder="ex.: 1.500"
              defaultValue={cust != null ? num(cust) : ''} autoFocus onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fim.current = true; setEd(false); } }}
              onBlur={(e) => aplicar(e.currentTarget.value)} /><span className="rd-cust-u">m</span>
          </form>
        : <button type="button" className="rd-cust-b" aria-pressed={ativo} title={cust == null ? `Digitar o raio, de ${raioTxt(RAIO_MIN)} a ${raioTxt(RAIO_MAX)}` : ativo ? 'Alterar o raio' : `Usar ${raioTxt(cust)} (clique de novo para alterar)`}
            onClick={() => { if (cust != null && !ativo) mudar(cust); else { fim.current = false; setEd(true); } }}>
            {cust != null ? raioTxt(cust) : 'Personalizado'}<Ic n="edit" s={16} />
          </button>}
    </div>
  );
}
const areaTxt = (raio: Raio, a: number) => (raio === 'poly' ? m2(Math.round(a)) : num(a / 1e6, 2) + ' km²');
const pct = (v: number, d = 0) => num(v, d);

/* ---------- Renda e população do entorno ---------- */
function SecRenda({ f, r: rs }: { f: Ficha; r: RaioSalvo }) {
  const raio = rs.raio;
  const st = useSetores(false);
  const [met, setMet] = useState(false);
  const m = RENDA_MET;
  let corpo: ReactNode;
  if (st === 'erro') corpo = <div className="muted">Não foi possível carregar os setores do IBGE.</div>;
  else if (st === 'carregando') corpo = <div className="muted">Carregando os setores do IBGE…</div>;
  else if (!temSetores(f.lat!, f.lng!)) corpo = <div className="muted">Por ora só há setores de {MUNICIPIOS_SETORES.join(' e ')}.</div>;
  else {
    const r = estatArea(f.lat!, f.lng!, f.poly, raio);
    if (!r) corpo = <div className="muted">O terreno não tem poligonal.</div>;
    else corpo = <>
      <div className="rd-met">
        <div className="rd-m rd-m1"><div className="k">Renda familiar média estimada</div><div className="v">{r.renda != null ? brl(r.renda) : 'Sem dado'}</div><div className="s">mensal, valores de {m.pnadAnoAtual}</div></div>
        <div className="rd-m"><div className="k">População</div><div className="v">{num(Math.round(r.pes))}</div><div className="s">{num(Math.round(r.dens))} hab/km²</div></div>
        <div className="rd-m"><div className="k">Domicílios ocupados</div><div className="v">{num(Math.round(r.dom))}</div><div className="s">{areaTxt(raio, r.area)}</div></div>
      </div>
      {r.porF.some((p) => p >= 0.05) && <>
        <div className="rd-dh">Domicílios pela faixa de renda média do setor</div>
        <ul className="rd-dist">{r.porF.map((p, k) => p >= 0.05 && (
          <li key={k}><span className="rd-q" style={{ background: m.faixas[k].cor }} /><span className="rd-fr">{m.faixas[k].rotulo}</span>
            <span className="rd-bar"><span style={{ width: Math.max(1, p) + '%', background: m.faixas[k].cor }} /></span><b className="num">{pct(p, p < 10 ? 1 : 0)}%</b></li>
        ))}</ul>
      </>}
      <div className="hint rd-pe">Censo {m.censoAno} (IBGE) · {num(r.setores)} setor{r.setores === 1 ? '' : 'es'}
        {r.cob != null && r.cob < 99.5 ? ` · renda divulgada para ${pct(r.cob)}% dos domicílios` : ''}{r.foraPct > 1 ? ` · ${pct(r.foraPct)}% da área fora do município` : ''} · <button type="button" className="linkbtn" onClick={() => setMet(true)}>Metodologia</button>
      </div>
    </>;
  }
  return (
    <Quadro aba="mercado" id="rd" chip="Renda e população" titulo="Renda e população do entorno">
      <Raios r={rs} />
      <div className="sec-b">{corpo}</div>
      {met && <Metodologia camada="renda" fechar={() => setMet(false)} />}
    </Quadro>
  );
}
/* ---------- Perfil da população do entorno ---------- */
function SecPerfil({ f, r: rs }: { f: Ficha; r: RaioSalvo }) {
  const raio = rs.raio;
  const st = useSetores(true);
  const [met, setMet] = useState(false);
  const c: any = DEMO_CFG;
  let corpo: ReactNode;
  if (st === 'erro') corpo = <div className="muted">Não foi possível carregar os dados do IBGE.</div>;
  else if (st === 'carregando') corpo = <div className="muted">Carregando os dados do Censo…</div>;
  else if (!temSetores(f.lat!, f.lng!)) corpo = <div className="muted">Por ora só há setores de {MUNICIPIOS_SETORES.join(' e ')}.</div>;
  else {
    const r = estatArea(f.lat!, f.lng!, f.poly, raio), o = r && perfilArea(r, c);
    if (!r) corpo = <div className="muted">O terreno não tem poligonal.</div>;
    else if (!o) corpo = <div className="muted">Os arquivos do IBGE não batem entre si; gere de novo com tools/setores/gerar.py.</div>;
    else {
      const pf = (x: number, tot: number) => (tot > 0 ? pct((x / tot) * 100, (x / tot) * 100 < 10 ? 1 : 0) + '%' : '–');
      const mx = Math.max(...o.idade.map((g) => Math.max(g.h, g.m)), 1), sx = o.h + o.m, nd = (o.idadeND / Math.max(o.pes, 1)) * 100;
      const barras = (itens: [string, number, boolean?][], tot: number) => {
        const m = Math.max(...itens.map((x) => x[1]), 1);
        return <ul className="rd-dist pf-dist">{itens.map(([l, v, nd2]) => (
          <li key={l} className={nd2 ? 'pf-nd' : undefined}><span className="pf-l">{l}</span><span className="rd-bar"><span style={{ width: Math.max(v > 0 ? 1 : 0, (v / m) * 100) + '%', background: nd2 ? 'transparent' : '#0b57d0' }} /></span>
            <b className="num">{num(Math.round(v))}</b><span className="pf-p">{pf(v, tot)}</span></li>
        ))}</ul>;
      };
      const sig = 'Não divulgado (sigilo)';
      const tam: [string, number, boolean?][] = [...c.tamanho.map((x: any, k: number) => [x.rotulo, o.tam[k]]), [c.tamanhoResto, o.tam[c.tamanho.length]], ...(o.tamND / Math.max(o.dppo, 1) > 0.005 ? [[sig, o.tamND, true]] : [])] as any;
      const esp: [string, number, boolean?][] = [...c.especie.map((x: any, k: number) => [x.rotulo, o.esp[k]]).filter((x: any) => x[1] >= 0.5), ...(o.espND / Math.max(o.dppo, 1) > 0.005 ? [[sig, o.espND, true]] : [])] as any;
      const perm = o.dppo + o.vag + o.oca;
      corpo = <>
        <div className="rd-met pf-met">
          <div className="rd-m"><div className="k">População residente</div><div className="v">{num(Math.round(o.pes))}</div><div className="s">{areaTxt(raio, r.area)}</div></div>
          <div className="rd-m"><div className="k">Domicílios ocupados</div><div className="v">{num(Math.round(r.dom))}</div><div className="s">particulares</div></div>
          <div className="rd-m"><div className="k">Moradores por domicílio</div><div className="v">{o.domD ? num(o.morD / o.domD, 2) : '–'}</div><div className="s">domicílios particulares ocupados</div></div>
          <div className="rd-m"><div className="k">Homens · Mulheres</div><div className="v pf-hm"><span className="pf-h">{pf(o.h, sx)}</span> · <span className="pf-m">{pf(o.m, sx)}</span></div><div className="s">{num(Math.round(o.h))} · {num(Math.round(o.m))} pessoas</div></div>
          <div className="rd-m"><div className="k">Densidade demográfica</div><div className="v">{r.area > 0 ? num(Math.round(r.dens)) : '–'}</div><div className="s">habitantes por km² (bruta)</div></div>
          <div className="rd-m"><div className="k">Idade média</div><div className="v">{o.idPes > 0 ? num(o.idSoma / o.idPes, 1) + ' anos' : '–'}</div>
            <div className="s">estimada pelas faixas do IBGE{o.idPes > 0 && o.idPes / Math.max(o.pes, 1) < 0.95 ? ` · ${pct((o.idPes / Math.max(o.pes, 1)) * 100)}% das pessoas` : ''}</div></div>
        </div>
        <div className="rd-dh">Pessoas por idade e sexo</div>
        <div className="pf-leg"><span><i className="pf-h" />Homens</span><span><i className="pf-m" />Mulheres</span></div>
        <div className="pf-pir">{o.idade.map((g, k) => (
          <div className="pf-pr" key={k}><span className="pf-b pf-h"><span style={{ width: (g.h / mx) * 100 + '%' }} /></span>
            <span className="pf-g"><b>{c.idade[k].rotulo.replace(' anos', '')}</b><span>{num(Math.round(g.t))} · {pf(g.t, o.pes)}</span></span>
            <span className="pf-b pf-m"><span style={{ width: (g.m / mx) * 100 + '%' }} /></span></div>
        ))}</div>
        {nd >= 0.5 && <div className="hint">Idade não divulgada pelo IBGE (sigilo) para {num(nd, 1)}% das pessoas.</div>}
        <div className="rd-dh">Domicílios por número de moradores</div>{barras(tam, o.dppo)}
        <div className="rd-dh">Tipo de domicílio</div>{barras(esp, o.dppo)}
        <div className="pf-vg">Fora dos ocupados: <b>{num(Math.round(o.vag))}</b> domicílios vagos ({pf(o.vag, perm)} dos permanentes) e <b>{num(Math.round(o.oca))}</b> de uso ocasional ({pf(o.oca, perm)}).</div>
        <div className="hint rd-pe">Censo {c.censoAno} (IBGE) · {num(r.setores)} setor{r.setores === 1 ? '' : 'es'}{r.foraPct > 1 ? ` · ${pct(r.foraPct)}% da área fora do município` : ''} · <button type="button" className="linkbtn" onClick={() => setMet(true)}>Sobre os dados</button></div>
      </>;
    }
  }
  return (
    <Quadro aba="mercado" id="pf" chip="Perfil da população" titulo="Perfil da população do entorno">
      <Raios r={rs} />
      <div className="sec-b">{corpo}</div>
      {met && <Dialogo titulo="Perfil da população: os dados" onFechar={() => setMet(false)} rodape={<button type="button" className="btn primary" onClick={() => setMet(false)}>Fechar</button>}>
        <div className="rd-mt">
          <p>Tudo vem do Censo Demográfico {c.censoAno} do IBGE, agregados por setor censitário: somas das variáveis publicadas, menos a idade média, que é estimada (ver abaixo).</p>
          <h3>Idade e sexo</h3><p>{c.idadeOrigem} Grupos usados: {c.idade.map((g: any) => g.rotulo).join(', ')}.</p>
          <h3>Densidade demográfica</h3><p>População residente ÷ área do círculo do raio, em habitantes por km². É bruta: a área inclui ruas, praças, parques e terrenos vazios.</p>
          <h3>Idade média</h3><p>É a única estimativa do quadro. O IBGE não publica a idade ano a ano por setor, só os cortes 0–4, 5–9, 10–14, 15–19, 20–24, 25–29, 30–39, 40–49, 50–59, 60–69 e 70+. Cada pessoa entra pela idade do meio do seu corte (2,5; 7,5; 12,5 ... 65) e quem tem 70 ou mais conta como 78 anos, a média real dessa faixa em São Paulo no Censo 2022. Conferido com a idade ano a ano da cidade inteira: dá 38,1 anos contra 38,1 de verdade em São Paulo e 37,4 contra 37,3 em São José dos Campos. Setor com algum corte em sigilo fica fora da média; se eles somam mais de 5% das pessoas, o quadro diz quanto entrou.</p>
          <h3>Moradores por domicílio</h3><p>Moradores dos domicílios particulares ocupados (permanentes e improvisados) ÷ esses domicílios; asilos, alojamentos e outros coletivos ficam fora.</p>
          <h3>Raio</h3><p>Cada setor entra pela fração da área dele que cai dentro do círculo, supondo os moradores espalhados por igual no setor.</p>
          <h3>Sigilo</h3><p>Quando um setor tem poucas pessoas num grupo, o IBGE não divulga o número (X). Ele nunca vira zero: a diferença para o total aparece como "não divulgado". "5 ou mais moradores" é o total de domicílios menos os de 1 a 4, só nos setores com os quatro divulgados.</p>
          <p className="faint">Versão {c.versao}.</p>
        </div>
      </Dialogo>}
    </Quadro>
  );
}

/* ---------- Concorrência no entorno ---------- */
const MK_RAIOS = [1, 2, 3];
/* situações da lista, ligadas e desligadas juntas; com o desenho do mapa (pedido do Moisés, 6/nov/2026) */
const MK_GRUPOS: [string, string, string[]][] = [['lancamento', 'Lançamento', ['lancamento', 'breve_lancamento']], ['em_obras', 'Em obras', ['em_obras']], ['pronto', 'Entregue', ['pronto', 'usado']]];
const MK_LKEY = 'bkm-terrenos-entorno-concorrencia';
function lerFiltroMk(): { raio: number; sit: string[] } {
  try { const o = JSON.parse(localStorage.getItem(MK_LKEY) || 'null'); if (o && MK_RAIOS.includes(o.raio) && Array.isArray(o.sit)) return o; } catch { /* sem armazenamento */ }
  return { raio: 1, sit: MK_GRUPOS.map((g) => g[0]) };
}
function SecConcorrencia({ f }: { f: Ficha }) {
  const [st, setSt] = useState<'ok' | 'carregando' | 'erro'>(() => (mercado() ? 'ok' : 'carregando'));
  const [fl, setFl] = useState(lerFiltroMk);
  const raio = fl.raio;
  const mudar = (o: Partial<typeof fl>) => setFl((x) => { const n = { ...x, ...o }; try { localStorage.setItem(MK_LKEY, JSON.stringify(n)); } catch { /* sem armazenamento */ } return n; });
  /* sem caber os botões com texto numa linha, ficam só os ícones (com a dica) */
  const linha = useRef<HTMLDivElement>(null), largo = useRef(0);
  const [curto, setCurto] = useState(false);
  useLayoutEffect(() => {
    const el = linha.current;
    if (!el) return;
    const medir = () => {
      if (!curto) largo.current = el.scrollWidth;
      const c = el.clientWidth < largo.current;
      if (c !== curto) setCurto(c);
    };
    medir();
    const ro = window.ResizeObserver ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  });
  useEffect(() => { let v = true; carregarMercado().then(() => v && setSt('ok')).catch(() => v && setSt('erro')); return () => { v = false; }; }, []);
  let corpo: ReactNode;
  if (st !== 'ok') corpo = <div className="muted">{st === 'erro' ? 'Dados da concorrência indisponíveis agora.' : 'Carregando os dados da concorrência…'}</div>;
  else {
    const MK = mercado()!, lat = f.lat!, lng = f.lng!;
    const ps = MK.emps.map((e) => ({ e, d: distM(lat, lng, e.lat, e.lng) / 1000 })).filter((x) => x.d <= MK_RAIOS[MK_RAIOS.length - 1]);
    const rs = MK_RAIOS.flatMap((r) => (['sim', 'nao'] as const).map((pg) => {
      const xs = ps.filter((x) => x.d <= r && x.e.prog === pg); let sp = 0, sa = 0, v = 0, est = 0;
      xs.forEach(({ e }) => { if (e.preco != null && (e.area || 0) > 0) { sp += e.preco; sa += e.area!; } v += e.vendas; est += e.estoque; });
      return { r, pg, n: xs.length, est, m2: sa ? sp / sa : null, vso: mkVso(v, est) };
    }));
    const sits = MK_GRUPOS.filter((g) => fl.sit.includes(g[0])).flatMap((g) => g[2]);
    const lista = ps.filter((x) => sits.includes(x.e.sit) && x.d <= raio).sort((a, b) => a.d - b.d);
    corpo = <>
      {!rs.some((x) => x.n) ? <div className="muted">Nenhum empreendimento do monitor a até {MK_RAIOS[MK_RAIOS.length - 1]} km.</div>
        : <div className="tblwrap"><table className="mini-tbl mk-cat"><thead><tr><th>Raio</th><th>Programa social</th><th className="r">Empreend.</th><th className="r">Estoque</th><th className="r">R$/m² médio</th><th className="r">VSO médio</th></tr></thead>
          <tbody>{rs.map((x, i) => (
            <tr key={i} className={i % 2 ? 'mk-r2' : undefined}><td className="mk-pr">{i % 2 ? <span className="mk-rep">Até {x.r} km</span> : `Até ${x.r} km`}</td><td className="mk-pg" data-l="Programa social">{x.pg === 'sim' ? 'Com' : 'Sem'}</td>
              <td className="r" data-l="Empreend.">{nmk(x.n)}</td><td className="r" data-l="Estoque">{nmk(x.est)}</td><td className="r" data-l="R$/m² médio">{x.m2 != null ? brl(x.m2) : '—'}</td><td className="r" data-l="VSO médio">{mkPct(x.vso)}</td></tr>
          ))}</tbody></table></div>}
      <div className="mk-lh"><h3>Empreendimentos no entorno <span className="faint">{nmk(lista.length)}</span></h3></div>
      <div className={`mk-fil${curto ? ' curto' : ''}`} ref={linha}>
        <div className="seg" role="group" aria-label="Raio da lista">{MK_RAIOS.map((k) => <button key={k} type="button" aria-pressed={raio === k} onClick={() => mudar({ raio: k })}>{k} km</button>)}</div>
        <div className="seg mk-sits" role="group" aria-label="Situação">{MK_GRUPOS.map(([k, l]) => {
          const on = fl.sit.includes(k);
          return <button key={k} type="button" aria-pressed={on} title={curto ? l : undefined} aria-label={curto ? l : undefined}
            onClick={() => mudar({ sit: on ? fl.sit.filter((x) => x !== k) : [...fl.sit, k] })}>
            <svg className="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" d={MK_GLIFO[k]} /></svg>
            {!curto && <span>{l}</span>}</button>;
        })}</div>
      </div>
      {lista.length ? <div className="mk-lista">{lista.map(({ e, d }) => <ItemEmp key={e.id} e={e} d={d} />)}</div>
        : <div className="muted">{fl.sit.length ? `Nenhum empreendimento com essa situação a até ${raio} km.` : 'Ligue ao menos uma situação.'}</div>}
    </>;
  }
  return (
    <Quadro aba="mercado" id="mk" primeiro chip="Concorrência" titulo="Concorrência no entorno">
      <div className="sec-b mk-sec">{corpo}</div>
    </Quadro>
  );
}
function ItemEmp({ e, d }: { e: Emp; d: number }) {
  const [ab, setAb] = useState(false), [tab, setTab] = useState(false);
  const v = mkM2(e.preco, e.area);
  return (
    <details className="mk-it" onToggle={(ev) => setAb((ev.currentTarget as HTMLDetailsElement).open)}>
      <summary><span className="mk-it-n"><b>{e.nome}</b><span className="faint">{[e.inc, (MK_SIT[e.sit] || MK_SIT.nao_informado)[0], num(d, 1) + ' km', e.prog === 'sim' ? 'programa social' : ''].filter(Boolean).join(' · ')}</span></span>
        <span className="mk-it-k num">{v != null ? brl(v) + '/m²' : '—'}<span className="faint">VSO {mkPct(mkVso(e.vendas, e.estoque))}</span></span><Ic n="chev" s={18} /></summary>
      {ab && (e.unidades ? <Resumo e={e} /> : <div className="muted">Sem unidades no monitor.</div>)}
      {ab && <div className="mk-tab"><button type="button" className="btn text" onClick={() => setTab(true)}><Ic n="doc" s={18} />Ver tabela completa</button></div>}
      {tab && <TabelaEmp id={e.id} fechar={() => setTab(false)} />}
    </details>
  );
}
