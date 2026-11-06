import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSessao } from '../lib/sessao';
import { data as fd, milhoes, m2 } from '../lib/format';
import { Bi, Ic } from '../components/Moldura';
import { corSub, type Fase as FaseMapa, type TerrenoMapa } from '../mapa/dados';
import { carregarFicha, completude, type Falta, FONTE_AREA, TEMP, TP_N, ZONA, type Ficha as F, type ProcF } from './dados';
import MiniMapa from './MiniMapa';
import { fixa, geojson } from '../novo/geo';
import { LapisMapa, verificarEndereco } from '../novo/TrocarEndereco';
import Temperatura from './Temperatura';
import AbaComercial from './Comercial';
import Painel, { Avancos, usePN } from './Painel';
import AbaParametros from './Parametros';
import AbaEntorno, { EntornoAuto } from './Entorno';
import AbaTerreno, { dadosArea, fonteSel, valoresArea } from './Terreno';
import { focar, OPT, pedirCampo, useSalvar, Vivo } from './edicao';
import { useToast } from '../components/ui';

// Ficha do terreno, porte de tools/prototipo/proto.js › pgFicha (topo, abas, fiAbasCaber), proto_fases.js › linhaTopo,
// proto_funil.js › linhaEtapas e proto_mod.js › abaGeral (Visão geral: Localização e Resumo). Mesma marcação e classes do
// protótipo (estilos em styles.css). Primeira entrega do porte da ficha: topo, abas e Visão geral; Terreno e Comercial
// vieram depois, e o quadro de avanço com o painel de Logs (Painel.tsx, Avanco.tsx) na quarta entrega. As abas fora da primeira versão ficam
// com o aviso.

export const ABAS: [string, string][] = [['geral', 'Visão geral'], ['terreno', 'Terreno'], ['comercial', 'Comercial'], ['parametros', 'Parâmetros'],
  ['massa', 'Estudos de massa'], ['viabilidade', 'Viabilidades'], ['infra', 'Infraestrutura'], ['entorno', 'Entorno'], ['jornada', 'Jornada'], ['documentos', 'Documentos']];
/** links antigos caem na aba nova (CLAUDE.md, ficha em abas) */
const ANTIGA: Record<string, string> = { cadastro: 'terreno', negociacao: 'comercial', urbanismo: 'parametros', fases: 'jornada', viabilidades: 'viabilidade' };
export const abaN = (k: string | undefined | null) => { const a = ANTIGA[k ?? ''] ?? k ?? 'geral'; return ABAS.some((x) => x[0] === a) ? a : 'geral'; };
const PROXIMAS = new Set<string>();

const num = (v: number | null | undefined, d = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
const aberto = (p?: ProcF | null) => !!p && (p.status === 'ativo' || p.status === 'stand_by');

/** fase atual: a aberta mais adiante; sem nenhuma aberta, a última que o terreno teve */
function faseAtual(f: F): { k: string; p: ProcF | null } | null {
  const ord = f.fases.map((x) => x.k);
  const ps = f.procs.slice().sort((a, b) => ord.indexOf(a.fase) - ord.indexOf(b.fase));
  const ab = ps.filter(aberto);
  if (ab.length) { const p = ab[ab.length - 1]; return { k: p.fase, p }; }
  if (!ps.length) return null;
  const k = ps[ps.length - 1].fase;
  return { k, p: f.procs.filter((p) => p.fase === k).slice(-1)[0] ?? null };
}

/** linha do tempo do topo: na entrada, as etapas da negociação; depois, as fases */
function LinhaTopo({ f }: { f: F }) {
  const a = faseAtual(f), ent = f.fases.find((x) => x.entrada);
  const ck = <Ic n="check" s={14} />;
  if (!a || a.k === ent?.k) {
    const n = ent && f.procs.filter((p) => p.fase === ent.k).slice(-1)[0];
    if (!n) return null;
    const ets = f.etapasEnt, idx = ets.findIndex((e) => e.k === n.etapa), fim = n.status === 'concluido';
    const entrou = (e: string) => {
      const x = f.trans.filter((v) => v.processo === n.id && v.paraEtapa === e && v.deEtapa !== e).pop();
      return x ? x.em.slice(0, 10) : n.etapa === e ? n.desde : null;
    };
    const sub = n.sub ? ets[idx]?.subs.find((s) => s.k === n.sub)?.nome : null;
    return (
      <nav className="tl-topo" aria-label="Etapas da negociação"><ol className="stepper">
        {ets.map((s, i) => {
          const st = i < idx || fim ? 'done' : i === idx ? 'cur' : 'fut', em = i <= idx ? entrou(s.k) : null;
          return (
            <li key={s.k} className={`step ${st}`} aria-current={i === idx && !fim ? 'step' : undefined}>
              <span className="dot">{st === 'done' ? ck : i + 1}</span>
              <span className="sl-w"><span className="sl" title={s.nome}>{s.nome}</span>{em && <span className="sd">{st === 'cur' && sub ? sub + ' · ' : ''}{fd(em)}</span>}</span>
            </li>
          );
        })}
        {fim && <li className="step done"><span className="dot">{ck}</span><span className="sl-w"><span className="sl">Comprado</span><span className="sd">{fd(n.encerrado)}</span></span></li>}
      </ol></nav>
    );
  }
  const teve = (k: string) => f.procs.some((p) => p.fase === k);
  return (
    <nav className="tl-topo" aria-label="Fases do terreno"><ol className="stepper">
      {f.fases.filter((x) => x.ativo || teve(x.k)).map((x, i) => {
        const p = f.procs.filter((q) => q.fase === x.k).slice(-1)[0], fim = p?.status === 'concluido', cur = x.k === a.k && !fim;
        const st = fim ? 'done' : cur || aberto(p) ? 'cur' : 'fut';
        const sd = !p ? '' : cur || aberto(p) ? f.etapasPorFase[x.k]?.find((e) => e.k === p.etapa)?.nome ?? '' : fim ? fd(p.encerrado) : '';
        return (
          <li key={x.k} className={`step ${st}`} aria-current={cur ? 'step' : undefined}>
            <span className="dot">{st === 'done' ? ck : i + 1}</span>
            <span className="sl-w"><span className="sl" title={x.nome}>{x.nome}</span>{sd && <span className="sd" title={sd}>{sd}</span>}</span>
          </li>
        );
      })}
    </ol></nav>
  );
}

/** fase, etapa e subetapa do topo; fora de andamento, a situação no lugar da etapa */
function faseTxt(f: F): ReactNode[] {
  const a = faseAtual(f);
  if (!a) return [];
  const fase = f.fases.find((x) => x.k === a.k), p = a.p, nome = fase?.nome ?? a.k;
  if (!p) return [nome];
  if (p.status !== 'ativo') {
    const n = fase?.entrada
      ? ({ stand_by: 'Stand By', perdido: 'Perdido', descartado: 'Descartado', concluido: 'Comprado' } as Record<string, string>)[p.status] ?? p.status
      : ({ stand_by: 'Stand By', perdido: 'Perdido', descartado: 'Descartado', concluido: 'Concluído' } as Record<string, string>)[p.status] ?? p.status;
    return [nome, <span className={`chip ${p.status === 'concluido' ? 'good' : p.status === 'stand_by' ? 'warn' : ''}`}>{n}</span>];
  }
  const e = f.etapasPorFase[a.k]?.find((x) => x.k === p.etapa), s = p.sub ? e?.subs.find((x) => x.k === p.sub)?.nome : '';
  return [nome, e?.nome ?? p.etapa, s].filter(Boolean) as string[];
}

function Resp({ r }: { r: F['resp'] }) {
  if (!r) return null;
  const ini = r.nome.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  let h = 0;
  for (const c of r.nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="avatar" style={{ background: `var(--av${(h % 4) + 1})`, overflow: 'hidden', padding: r.foto ? 0 : undefined }} title={r.nome}>
        {r.foto ? <img src={r.foto} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : ini}
      </span>
      <div><div style={{ fontWeight: 500 }}>{r.nome}</div><div className="faint" style={{ fontSize: 12 }}>Responsável</div></div>
    </div>
  );
}

const SVG_DOTS = <svg className="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" d="M12 5.5h.01M12 12h.01M12 18.5h.01" /></svg>;
const seta = (d: number) => <svg className="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d={d < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>;

/** barra das abas contínua, como uma roleta (pedido do Moisés, 6/nov/2026): todas as abas numa faixa que rola de lado, com as
    das pontas cortadas pela borda; o dedo, o mouse arrastado (mãozinha), Shift + roda (ou Ctrl + Shift + roda) e o deslize de
    lado do trackpad a movem pixel a pixel, e solta com força ela segue rodando e freia aos poucos (inércia). Arrastar não troca
    de aba; trocar de aba traz a ativa para a vista, com a vizinha de cada lado quando cabe. O ⋮ lista sempre todas as abas. */
function Abas({ f, aba, irAba }: { f: F; aba: string; irAba: (k: string) => void }) {
  const barra = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [sobra, setSobra] = useState(false); // há abas fora da vista
  const anim = useRef(0);
  /* a aba ativa entra na vista (com as vizinhas) ao trocar de aba */
  useLayoutEffect(() => {
    const b = barra.current, a = b?.querySelector<HTMLElement>(`button[data-t="${aba}"]`);
    if (!b || !a) return;
    const ant = a.previousElementSibling as HTMLElement | null, prox = a.nextElementSibling as HTMLElement | null;
    const L = b.clientWidth, x0 = a.offsetLeft - (b.firstElementChild as HTMLElement).offsetLeft, aw = a.offsetWidth;
    let e = ant ? x0 - ant.offsetWidth * 0.6 : 0, d = prox ? x0 + aw + prox.offsetWidth * 0.6 : b.scrollWidth;
    if (d - e > L) { e = x0 - (L - aw) / 2; d = e + L; } // não cabem as vizinhas: a ativa no meio
    let alvo = b.scrollLeft;
    if (e < alvo) alvo = e; else if (d > alvo + L) alvo = d - L;
    if (alvo !== b.scrollLeft) { cancelAnimationFrame(anim.current); b.scrollTo({ left: alvo, behavior: 'smooth' }); }
  }, [aba]);
  useEffect(() => {
    const b = barra.current;
    if (!b) return;
    const medir = () => setSobra(b.scrollWidth > b.clientWidth + 1);
    medir();
    const ro = window.ResizeObserver ? new ResizeObserver(medir) : null;
    ro?.observe(b);
    /* inércia: a velocidade (px/ms) cai a cada quadro até parar; bater na ponta para */
    const rodar = (v: number) => {
      cancelAnimationFrame(anim.current);
      let t0 = performance.now();
      const passo = (t: number) => {
        const dt = Math.min(32, t - t0); t0 = t;
        const antes = b.scrollLeft;
        b.scrollLeft = antes + v * dt;
        v *= Math.pow(0.9965, dt); // atrito: perde ~30% da velocidade a cada 100 ms
        if (Math.abs(v) > 0.02 && b.scrollLeft !== antes) anim.current = requestAnimationFrame(passo);
      };
      anim.current = requestAnimationFrame(passo);
    };
    /* Shift + roda do mouse: cada dente empurra a roleta, que segue com inércia (o trackpad já tem a dele) */
    const roda = (ev: WheelEvent) => {
      if (b.scrollWidth <= b.clientWidth + 1) return;
      if (ev.shiftKey) {
        const d = (ev.deltaY || ev.deltaX) * (ev.deltaMode === 1 ? 40 : 1);
        if (!d) return;
        ev.preventDefault();
        rodar(Math.max(-6, Math.min(6, d / 60)));
      }
    };
    /* mouse arrastado (no toque, a rolagem do navegador já desliza com inércia) */
    let px: number | null = null, sx = 0, arrastou = false, id = -1, ult: [number, number][] = [];
    const baixo = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
      cancelAnimationFrame(anim.current);
      px = ev.clientX; sx = b.scrollLeft; arrastou = false; id = ev.pointerId; ult = [[performance.now(), b.scrollLeft]];
    };
    const move = (ev: PointerEvent) => {
      if (px == null || ev.pointerId !== id) return;
      const dx = ev.clientX - px;
      if (!arrastou) {
        if (Math.abs(dx) < 6 || b.scrollWidth <= b.clientWidth + 1) return;
        arrastou = true;
        try { b.setPointerCapture(id); } catch { /* sem captura */ }
        b.classList.add('arrastando');
      }
      ev.preventDefault();
      b.scrollLeft = sx - dx;
      ult.push([performance.now(), b.scrollLeft]); if (ult.length > 6) ult.shift();
    };
    const cima = (ev: PointerEvent) => {
      if (ev.pointerId !== id || px == null) return;
      px = null;
      if (!arrastou) return;
      b.classList.remove('arrastando');
      const z = ult[ult.length - 1], a0 = ult.find((u) => z[0] - u[0] < 100) ?? ult[0], dt = z[0] - a0[0];
      if (dt > 0 && performance.now() - z[0] < 60) rodar(Math.max(-8, Math.min(8, (z[1] - a0[1]) / dt)));
    };
    const clique = (ev: MouseEvent) => { if (arrastou) { ev.preventDefault(); ev.stopPropagation(); arrastou = false; } };
    const parar = () => cancelAnimationFrame(anim.current); // o dedo na barra segura a roleta
    b.addEventListener('wheel', roda, { passive: false });
    b.addEventListener('pointerdown', baixo);
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', cima);
    b.addEventListener('pointercancel', cima);
    b.addEventListener('touchstart', parar, { passive: true });
    b.addEventListener('click', clique, true);
    return () => {
      ro?.disconnect(); cancelAnimationFrame(anim.current);
      b.removeEventListener('wheel', roda); b.removeEventListener('pointerdown', baixo); b.removeEventListener('pointermove', move);
      b.removeEventListener('pointerup', cima); b.removeEventListener('pointercancel', cima); b.removeEventListener('touchstart', parar);
      b.removeEventListener('click', clique, true);
    };
  }, []);
  useEffect(() => {
    if (!menu) return;
    const fecha = (ev: PointerEvent) => { if (!(ev.target as HTMLElement).closest?.('.fi-mais')) setMenu(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setMenu(false); ev.preventDefault(); ev.stopPropagation(); } };
    document.addEventListener('pointerdown', fecha, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', fecha, true); document.removeEventListener('keydown', esc, true); };
  }, [menu]);
  const ia = ABAS.findIndex(([k]) => k === aba), ant = ABAS[ia - 1], prox = ABAS[ia + 1];
  /* sem número nas abas: rolado o topo para fora da vista, o que falta aparece num botão de alerta na barra das abas,
     sempre visível (pedido do Moisés, 6/nov/2026) */
  const c = completude(f);
  const [topoFora, setTopoFora] = useState(false);
  useEffect(() => {
    const ver = () => {
      const w = barra.current?.parentElement, ref = w?.closest('.ficha-main')?.querySelector('.fi-comp:not(.fi-alerta)');
      if (!w) return;
      /* a linha onde a barra das abas fica presa: o topo de quem rola (a página ou a gaveta) mais o "top" dela */
      let sc: HTMLElement | null = w.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      const linha = (sc ? sc.getBoundingClientRect().top : 0) + (parseFloat(getComputedStyle(w).top) || 0) + w.offsetHeight;
      setTopoFora(!ref || ref.getBoundingClientRect().bottom <= linha);
    };
    ver();
    document.addEventListener('scroll', ver, { capture: true, passive: true });
    window.addEventListener('resize', ver);
    return () => { document.removeEventListener('scroll', ver, { capture: true }); window.removeEventListener('resize', ver); };
  }, [c.faltam.length]);
  return (
    <div className="fi-abas-w">
      <div className={`fi-abas roleta${sobra ? ' desliza' : ''}`} role="tablist" aria-label="Seções do terreno" ref={barra}>
        {ABAS.map(([k, l]) => (
          <button key={k} role="tab" data-t={k} aria-selected={k === aba} aria-controls={`bl-${k}`} onClick={() => irAba(k)}>{l}</button>
        ))}
      </div>
      <div className="fi-fim">
        {topoFora && c.faltam.length > 0 && <Faltam c={c} irAba={irAba} alerta />}
        <div className={`adv-mais fi-mais${menu ? ' aberto' : ''}`} hidden={!sobra}>
          <button className="iconbtn adv-mb" aria-haspopup="menu" aria-expanded={menu} aria-label="Mais ações" title="Mais ações" onClick={() => setMenu(!menu)}>{SVG_DOTS}</button>
          <div className="adv-menu" role="menu">
            {ABAS.map(([k, l]) => <button key={k} role="menuitemradio" aria-checked={k === aba} className={k === aba ? 'atual' : undefined} onClick={() => { setMenu(false); if (k !== aba) irAba(k); }}>{l}</button>)}
          </div>
        </div>
        <button className="iconbtn fi-ant" aria-label="Seção anterior" disabled={!ant} title={ant ? `Anterior: ${ant[1]}` : 'Primeira seção'} onClick={() => ant && irAba(ant[0])}>{seta(-1)}</button>
        <button className="iconbtn fi-prox" aria-label="Próxima seção" disabled={!prox} title={prox ? `Próxima: ${prox[1]}` : 'Última seção'} onClick={() => prox && irAba(prox[0])}>{seta(1)}</button>
      </div>
    </div>
  );
}

/** cor do pino do mini-mapa: a da subetapa, como a bolinha da lista do mapa */
function corPino(f: F): [string, string] {
  const fs: FaseMapa[] = f.fases.map((x) => ({ ...x, etapas: f.etapasPorFase[x.k] ?? [] }));
  const t: TerrenoMapa = { id: f.id, codigo: f.codigo, nome: f.nome, bairro: null, zona: null, municipio: null, corretor: null, lat: f.lat, lng: f.lng, poly: f.poly, area: f.area,
    procs: f.procs.map((p) => ({ fase: p.fase, etapa: p.etapa, sub: p.sub, status: p.status })) };
  return corSub(fs, t);
}

function VisaoGeral({ f, irAba, abrirMapa }: { f: F; irAba: (k: string) => void; abrirMapa: (lat: number, lng: number, z: number) => void }) {
  const { edita } = useSessao();
  const salvarT = useSalvar(f), toast = useToast();
  const ni = <span className="ni">Não informado</span>;
  const ir = (k: string, titulo: string) => (
    <button className="kv-ed kv-ir" title={titulo} aria-label={titulo} onClick={() => irAba(k)}><Ic n="fwd" s={16} /></button>
  );
  const lin = (rot: string, val: ReactNode, acao: ReactNode = <span className="kv-ed" aria-hidden="true" />) => (
    <div className="kv"><dt>{rot}</dt><dd>{val == null || val === '' ? ni : val}</dd>{acao}</div>
  );
  const dois = (a: ReactNode, b: ReactNode) => <span>{a}{b ? <span className="kv-2">{b}</span> : null}</span>;
  const [cor, fg] = corPino(f);
  const end = [f.logradouro && f.logradouro + (f.numero ? ', ' + f.numero : ''), f.bairro].filter(Boolean).join(' · ');
  const mun = [[f.municipio, f.uf].filter(Boolean).join(' · '), f.zona && 'Zona ' + (ZONA[f.zona] ?? f.zona)].filter(Boolean).join(' · ');
  const e = f.estacao;
  const est = e && e.pe != null
    ? dois(`${e.pe < 1000 ? Math.round(e.pe / 10) * 10 + ' m' : num(e.pe / 1000, 2) + ' km'} a pé${e.seg != null ? ` · ${Math.round(e.seg / 60)} min` : ''}`, e.nome)
    : f.entornoBuscado ? 'Nenhuma estação a até 1,5 km a pé' : '';
  const tp = f.topo
    ? <span id="rs-topo"><span className={`tp-chip tp-${f.topo.perfil}`}>{f.topo.perfil === 'inclinado' ? `Inclinado · ${num(f.topo.decl, 1)}%` : TP_N[f.topo.perfil] ?? f.topo.perfil}</span>
      {f.topo.desnivel != null && <span className="kv-2">desnível {num(f.topo.desnivel, 1)} m</span>}</span>
    : '';
  return (
    <div className="geral">
      <div className="geral-c">
        <section className="sec g-loc"><div className="sec-h"><h2><Bi n="localizacao" s={32} />Localização</h2></div><div className="sec-b">
          {f.lat != null && f.lng != null
            ? <MiniMapa key={f.id} lat={f.lat} lng={f.lng} poly={f.poly} cor={cor} fg={fg} abrirMapa={abrirMapa}
              salvar={edita ? async (p, c) => { const ok = await salvarT({ poligono_geojson: geojson(fixa(p)), latitude: +c[0].toFixed(7), longitude: +c[1].toFixed(7) }); if (ok) verificarEndereco(f.id); return ok; } : undefined} />
            : <div className="empty" style={{ padding: 'var(--e6) 0' }}>Sem localização.</div>}
        </div></section>
      </div>
      <div className="geral-c">
        <section className="sec g-res"><div className="sec-h"><h2>Resumo</h2></div><div className="sec-b"><dl className="kvl">
          {edita ? lin('Endereço', end, <LapisMapa codigo={f.codigo} />) : lin('Endereço', end)}
          {edita ? lin('Município e região', <span className="kv-vivo">{[f.municipio, f.uf].filter(Boolean).join(' · ')}{f.municipio ? ' · ' : ''}
            <Vivo ini={f.t.zona ?? ''} imediato gravar={(v) => salvarT({ zona: v || null })}>{(p) =>
              <select className="inl-x" aria-label="Zona" {...p}><option value="">Zona não informada</option>{Object.entries(OPT.zona).map(([k, l]) => <option key={k} value={k}>Zona {l}</option>)}</select>}</Vivo></span>)
            : lin('Município e região', mun)}
          {lin('Zoneamento', f.zonas, ir('parametros', 'Ver os parâmetros urbanísticos'))}
          {edita ? lin('Área adotada', <span className="kv-vivo">{f.area != null ? m2(f.area) + ' · ' : ''}
            <Vivo ini={f.t.fonte_area_adotada ?? ''} imediato gravar={(v) => { const d = dadosArea(f, { ...valoresArea(f.t), fonte_area_adotada: v }); if (typeof d === 'string') { toast(d); return false; } return salvarT(d); }}>{(p) =>
              fonteSel('g-fonteArea', { ...p, className: 'inl-x', 'aria-label': 'Fonte da área adotada' } as any,
                Object.entries(FONTE_AREA).filter(([k]) => k === f.t.fonte_area_adotada || (k === 'poligonal' ? f.t.area_poligonal_m2 != null : k !== 'estimativa' && f.t[`area_${k}_m2`] != null)), 'Sem área adotada')}</Vivo>
            </span>, ir('terreno', 'Ver as áreas'))
            : lin('Área adotada', f.area != null ? dois(m2(f.area), f.fonteArea ? FONTE_AREA[f.fonteArea] : null) : '', ir('terreno', 'Ver as áreas'))}
          {lin('Unidades do estudo válido', f.unidades != null ? `${num(f.unidades)} unidades` : '', ir('viabilidade', 'Ver os estudos de viabilidade'))}
          {lin('VGV do estudo válido', f.vgv != null ? milhoes(f.vgv) : '')}
          {lin('Distância do metrô ou trem', est, ir('entorno', 'Ver o entorno'))}
          {lin('Valor pedido na entrada', f.ofertaEntrada?.valor ? dois(milhoes(f.ofertaEntrada.valor), `oferta de ${fd(f.ofertaEntrada.data)}`) : '', ir('comercial', 'Ver as ofertas'))}
          {lin('Perfil topográfico', tp, ir('infra', 'Ver a infraestrutura'))}
          {lin('Corretor', f.corretor ? dois(f.corretor.nome, f.corretor.imob) : '', ir('comercial', 'Ver os corretores'))}
        </dl></div></section>
      </div>
    </div>
  );
}

export function useFicha(codigo: string) {
  const { empresa } = useSessao();
  return useQuery({ queryKey: ['ficha', empresa?.id, codigo], enabled: !!empresa, queryFn: () => carregarFicha(empresa!.id, codigo) });
}

/** "Ficha N% completa" com a bolinha vermelha do que falta; o menu leva direto ao campo, já em edição, com o conteúdo
    selecionado e uma iluminada rápida (pedidos do Moisés, 5 e 6/nov/2026). Em "alerta", o mesmo menu num botão de alerta
    na barra das abas, para quando o topo saiu da vista */
function Faltam({ c, irAba, alerta }: { c: ReturnType<typeof completude>; irAba: (k: string) => void; alerta?: boolean }) {
  const [ab, setAb] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ab) return;
    const fora = (ev: PointerEvent) => { if (!raiz.current?.contains(ev.target as Node)) setAb(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setAb(false); };
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [ab]);
  const n = c.faltam.length;
  const ir = ([, aba, sec, campo]: Falta) => {
    setAb(false);
    if (sec === 'temp') { focar('temp-1'); return; }
    irAba(aba);
    if (sec) pedirCampo({ sec, campo });
  };
  const rot = n ? `Ficha ${c.pct}% completa; faltam ${n} ${n > 1 ? 'itens' : 'item'}` : undefined;
  return (
    <span className={`fi-comp${alerta ? ' fi-alerta' : ''}`} ref={raiz}>
      {alerta
        ? <button type="button" className="iconbtn fi-alerta-b" aria-haspopup="menu" aria-expanded={ab} onClick={() => setAb((x) => !x)} aria-label={rot} title={rot}>
            <Ic n="warn" s={20} /><span className="fi-comp-n" aria-hidden="true">{n}</span></button>
        : <button type="button" className="fi-comp-b" aria-haspopup="menu" aria-expanded={ab} disabled={!n} onClick={() => setAb((x) => !x)} aria-label={rot}>
            <b>Ficha {c.pct}% completa</b>{n > 0 && <span className="fi-comp-n" aria-hidden="true">{n}</span>}</button>}
      {ab && (
        <div className="adv-menu fi-comp-m" role="menu">
          <div className="fi-comp-t">Falta preencher</div>
          {c.faltam.map((x) => <button key={x[0]} type="button" role="menuitem" onClick={() => ir(x)}>{x[0]}</button>)}
        </div>
      )}
    </span>
  );
}

/** a ficha (página ou gaveta): o voltar só na página */
export default function Ficha({ f, aba, irAba, voltar, abrirMapa }: {
  f: F; aba: string; irAba: (k: string) => void; voltar?: { rotulo: string; ir: () => void };
  abrirMapa: (lat: number, lng: number, z: number) => void;
}) {
  const { edita } = useSessao();
  const [pn] = usePN();
  const c = completude(f);
  const meta: ReactNode[] = [...faseTxt(f), `Cadastrado em ${fd(f.dataIdent ?? f.criadoEm)}`];
  const corpo = aba === 'geral' ? <VisaoGeral f={f} irAba={irAba} abrirMapa={abrirMapa} />
    : aba === 'terreno' ? <AbaTerreno key={f.id} f={f} />
    : aba === 'comercial' ? <AbaComercial key={f.id} f={f} cor={corPino(f)[0]} />
    : aba === 'parametros' ? <AbaParametros key={f.id} f={f} />
    : aba === 'entorno' ? <AbaEntorno key={f.id} f={f} />
    : <section className="sec"><div className="empty">{PROXIMAS.has(aba) ? 'Esta aba está sendo portada do protótipo e entra nas próximas entregas.' : 'Esta aba entra depois da primeira versão.'}</div></section>;
  return (
    <div className={`ficha-wrap ${pn.aberto ? 'pn-on' : 'pn-off'}`}><div className="ficha-main">
      <LinhaTopo f={f} />
      {voltar && <button className="back" onClick={voltar.ir}><Ic n="back" s={20} />{voltar.rotulo}</button>}
      <div className="dhead fi-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow"><span className="num">{f.codigo}</span></div>
          <h1>{f.nome}</h1>
          <div className="fi-meta">
            {meta.map((x, i) => <span key={i} style={{ display: 'contents' }}>{i > 0 && <span className="fi-sep">·</span>}<span>{x}</span></span>)}
            {f.negId && <><span className="fi-sep">·</span><span className="fi-temp">
              {f.negStatus === 'ativo' ? <Temperatura f={f} pode={edita} />
                : f.temp ? <>{TEMP[f.temp]}</> : <span className="faint">Temperatura não avaliada</span>}
            </span></>}
          </div>
        </div>
        <Resp r={f.resp} />
      </div>
      <div className="stack">
        {c.pct < 100 && (
          <div className="complete">
            <span className="progress"><span className="bar"><span style={{ width: `${c.pct}%` }} /></span><Faltam c={c} irAba={irAba} /></span>
          </div>
        )}
        <div className="adv-main"><Avancos f={f} irAba={irAba} /></div>
      </div>
      <Abas f={f} aba={aba} irAba={irAba} />
      <section key={aba} className="bl fi-aba" id={`bl-${aba}`} role="tabpanel"><div className="bl-c">{corpo}</div></section>
      {aba !== 'entorno' && f.lat != null && <EntornoAuto f={f} />}
    </div><Painel f={f} irAba={irAba} /></div>
  );
}
