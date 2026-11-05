import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Bi, Ic, type ContextoMoldura } from '../components/Moldura';
import { carregarGoogle, googleRecusado } from '../mapa/google';
import { Motor, vista, type Base, type Pino } from '../mapa/motor';
import { BotaoCamadas, ItensLegenda, LegendaSetor, Metodologia, QuadroSetor } from '../mapa/CamadasSetor';
import { carregarSetores, setorEm, setores, type Camada } from '../mapa/setores';
import { apagado, areaDe, bate, carregar, classe, corSub, info, itens, subNome, type Apag, type Fase, type Item, type TerrenoMapa } from '../mapa/dados';

// Página Mapa, com a mesma marcação e as mesmas classes do protótipo (tools/prototipo/proto_mod.js › pgMapa,
// mpLista, mpItem, mpLegenda, mpCtrlHtml, ctxAbrir, mpLargura; proto_novo.js › mpBuscaHtml). Os estilos são os do
// protótipo, em styles.css. Ainda fora: filtros e visões, a gaveta da ficha, desenho e edição da poligonal,
// camadas por setor censitário e Concorrência.

const num = (n: number) => Math.round(n).toLocaleString('pt-BR');
const MP_LKEY = 'bkm-terrenos-mapa-lista', MP_LMIN = 76;
const mpLpad = () => (innerWidth < 1300 ? 300 : 360);
const mpLmax = () => Math.max(MP_LMIN, Math.min(720, Math.round(innerWidth * 0.6)));
const limitarL = (w: number) => Math.round(Math.max(MP_LMIN, Math.min(mpLmax(), w)));
function larguraGuardada() {
  let v: number | null = null;
  try { v = Number(localStorage.getItem(MP_LKEY)) || null; } catch { /* sem storage */ }
  return limitarL(v || mpLpad());
}
/* o que a pessoa escolheu fica na sessão, como no protótipo (UI.mp, UI.mpBase, UI.mpLeg) */
const memo: { f: string; e: string; arv: boolean; apag: Apag; base: Base; leg: boolean | null; camada: Camada | null; baseAntes: Base | null; rdLeg: boolean | null } =
  { f: '', e: '', arv: false, apag: {}, base: 'satelite', leg: null, camada: null, baseAntes: null, rdLeg: null };

export default function Mapa() {
  const { empresa, edita } = useSessao();
  const toast = useToast();
  const navegar = useNavigate();
  const { busca } = useOutletContext<ContextoMoldura>();
  const codigoUrl = (useParams()['*'] || '').split('/')[0] || null;
  const q = useQuery({ queryKey: ['mapa', empresa?.id], enabled: !!empresa, queryFn: () => carregar(empresa!.id) });
  const fases: Fase[] = q.data?.fases ?? [];
  const todos: TerrenoMapa[] = q.data?.terrenos ?? [];

  const [f, setF] = useState(memo.f);
  const [e, setE] = useState(memo.e);
  const [arv, setArv] = useState(memo.arv);
  const [apag, setApag] = useState<Apag>(memo.apag);
  const [base, setBase] = useState<Base>(memo.base);
  const [leg, setLeg] = useState(memo.leg ?? innerWidth > 899);
  const [selId, setSelId] = useState<string | null>(null);
  const [largura, setLargura] = useState(larguraGuardada);
  const [menu, setMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null);
  const [cheia, setCheia] = useState(false);
  const [sv, setSv] = useState(false);
  const [semMapa, setSemMapa] = useState<string | null>(null);
  const [motorPronto, setMotorPronto] = useState(false);
  const [busEnd, setBusEnd] = useState('');
  const [res, setRes] = useState<{ nome: string; lat: number; lng: number }[] | null>(null);
  const [resMsg, setResMsg] = useState('');
  const [euBusca, setEuBusca] = useState(false);
  const [camada, setCamada] = useState<Camada | null>(memo.camada);
  const [camMenu, setCamMenu] = useState(false);
  const [rdLeg, setRdLeg] = useState(memo.rdLeg ?? innerWidth > 899);
  const [setor, setSetor] = useState<number | null>(null);
  const [setOk, setSetOk] = useState(!!setores());
  const [setErro, setSetErro] = useState(false);
  const [met, setMet] = useState<Camada | null>(null);
  Object.assign(memo, { f, e, arv, apag, base, leg, camada, rdLeg });

  const mapaEl = useRef<HTMLDivElement>(null);
  const areaEl = useRef<HTMLElement>(null);
  const ladoEl = useRef<HTMLElement>(null);
  const motor = useRef<Motor | null>(null);
  const enquadrarPend = useRef(true);

  /* terrenos no nível aberto, sem os apagados na legenda, que batem com a busca da barra superior */
  const visiveis = useMemo(() => todos.filter((t) => classe(fases, t, f, e) != null && !apagado(fases, t, apag) && bate(t, busca)), [todos, fases, f, e, apag, busca]);
  const sel = selId ? todos.find((t) => t.id === selId) ?? null : null;
  const pinoDe = useCallback((t: TerrenoMapa): Pino | null => {
    if (t.lat == null || t.lng == null) return null;
    const k = info(fases, classe(fases, t, f, e), f, e);
    return { id: t.id, nome: t.nome, lat: t.lat, lng: t.lng, poly: t.poly, cor: k[1], fg: k[3] };
  }, [fases, f, e]);

  /* seleção no endereço: /mapa/A123 */
  const selecionar = useCallback((id: string | null) => {
    setSelId(id);
    const t = id ? todos.find((x) => x.id === id) : null;
    navegar(t ? `/mapa/${t.codigo}` : '/mapa', { replace: true });
  }, [todos, navegar]);

  /* motor do Google: cria uma vez por visita à página */
  const ganchos = useRef({ pino: (_: string) => {}, vazio: (_a: number, _b: number) => {}, duplo: (_a: number, _b: number, _c: EventTarget | null) => {} });
  ganchos.current.pino = (id) => { setMenu(null); selecionar(id); };
  ganchos.current.vazio = (lat, lng) => {
    setMenu(null);
    if (selId) selecionar(null);
    /* com a camada por setor ligada, o clique abre o quadro do setor */
    if (camada && setores()) setSetor(setorEm(lat, lng));
  };
  ganchos.current.duplo = (lat, lng, alvo) => {
    if (!edita) return;
    const el = alvo as HTMLElement | null;
    if (el?.closest?.('.mp-barra,.mp-ctrl,.mp-legenda,.mp-cartao,.mp-ctx,button,a,input')) return;
    setMenu(null);
    navegar('/terrenos/novo', { state: { ponto: [lat, lng] } });
  };
  useEffect(() => {
    let vivo = true;
    const recusa = () => { setSemMapa('O Google recusou a chave do mapa (domínio ou API não liberados).'); };
    window.addEventListener('bkm-gmaps-recusada', recusa);
    carregarGoogle().then((ok) => {
      if (!vivo || !mapaEl.current) return;
      if (!ok || googleRecusado()) { setSemMapa(googleRecusado() ? 'O Google recusou a chave do mapa (domínio ou API não liberados).' : 'Não foi possível carregar o mapa do Google. Verifique a conexão e recarregue a página.'); return; }
      enquadrarPend.current = !vista;
      motor.current = new Motor(mapaEl.current, memo.base, {
        pino: (id) => ganchos.current.pino(id),
        vazio: (a, b) => ganchos.current.vazio(a, b),
        duplo: (a, b, c) => ganchos.current.duplo(a, b, c),
        menu: (x, y, lat, lng) => { if (edita) setMenu({ x, y, lat, lng }); },
        fecharMenu: () => setMenu(null),
        streetView: (on) => setSv(on),
        aviso: (m, erro) => toast(m, erro),
        pronto: () => ctrlPos(),
      });
      setMotorPronto(true);
    });
    return () => { vivo = false; window.removeEventListener('bkm-gmaps-recusada', recusa); motor.current?.destruir(); motor.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* pinos e poligonais na cor do nível aberto */
  useEffect(() => {
    const m = motor.current;
    if (!m || !motorPronto) return;
    m.desenhar(visiveis.map(pinoDe).filter((x): x is Pino => !!x), selId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motorPronto, visiveis, pinoDe]);
  useEffect(() => { motor.current?.marcar(selId); }, [selId]);
  useEffect(() => { motor.current?.setBase(base); }, [base]);

  /* camadas por setor censitário: uma de cada vez; ao ligar, o mapa passa para a visão Mapa e volta ao desligar */
  useEffect(() => {
    if (!camada) return;
    carregarSetores().then(() => setSetOk(true)).catch(() => { setSetErro(true); toast('Não foi possível carregar os setores do IBGE.', true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camada]);
  useEffect(() => { if (motorPronto) motor.current?.camada(camada && setOk ? camada : null); }, [motorPronto, camada, setOk]);
  useEffect(() => { if (motorPronto) motor.current?.contornoSetor(camada ? setor : null); }, [motorPronto, camada, setor]);
  function ligarCamada(k: Camada | null) {
    if (k === camada) return;
    if (k && !camada && base === 'satelite') { memo.baseAntes = 'satelite'; setBase('mapa'); }
    if (!k) { setSetor(null); if (memo.baseAntes && base === 'mapa') setBase(memo.baseAntes); memo.baseAntes = null; }
    setCamada(k);
  }

  /* primeira entrada: enquadra todos; com /mapa/A123, foca o terreno */
  useEffect(() => {
    const m = motor.current;
    if (!m || !motorPronto || !q.data) return;
    const alvo = codigoUrl ? todos.find((t) => t.codigo === codigoUrl.toUpperCase()) : null;
    if (alvo) { setSelId(alvo.id); const p = pinoDe(alvo); if (p) m.focar(p); }
    else if (enquadrarPend.current) m.enquadrar(todos.filter((t) => t.lat != null).map((t) => ({ lat: t.lat!, lng: t.lng! })), 15);
    enquadrarPend.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motorPronto, q.data]);

  /* ao descer ou subir de nível, enquadra os terrenos que ficaram */
  const enquadrarNivel = useRef(false);
  useEffect(() => {
    if (!enquadrarNivel.current) return;
    enquadrarNivel.current = false;
    motor.current?.enquadrar(visiveis.filter((t) => t.lat != null).map((t) => ({ lat: t.lat!, lng: t.lng! })), 15);
  }, [visiveis]);
  function nivel(nf: string, ne: string) { enquadrarNivel.current = nf !== f || ne !== e; setF(nf); setE(ne); }
  function apagar(lv: string, k: string) {
    setApag((a) => { const l = a[lv] ?? [], n = { ...a, [lv]: l.includes(k) ? l.filter((x) => x !== k) : [...l, k] }; if (!n[lv].length) delete n[lv]; return n; });
  }

  /* botões do canto sobem acima do cartão do terreno e do bonequinho do Street View (mpCtrlPos) */
  const ctrlPos = useCallback(() => {
    const a = areaEl.current, c = a?.querySelector<HTMLElement>('#mp-ctrl');
    if (!a || !c) return;
    const ar = a.getBoundingClientRect();
    let topo = ar.bottom;
    ['#mp-cartao', '#mp-modo', '.gm-svpc'].forEach((s) => {
      const el = a.querySelector<HTMLElement>(s);
      if (!el || !el.offsetHeight) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > ar.bottom - 80 && r.right > ar.right - 80) topo = Math.min(topo, r.top);
    });
    c.style.bottom = topo < ar.bottom ? Math.round(ar.bottom - topo + 12) + 'px' : '';
  }, []);
  useLayoutEffect(() => {
    const a = areaEl.current;
    if (!a || !window.ResizeObserver) return;
    const ro = new ResizeObserver(ctrlPos);
    [a, a.querySelector('#mp-cartao'), a.querySelector('#mp-modo')].forEach((x) => x && ro.observe(x));
    ctrlPos();
    return () => ro.disconnect();
  }, [ctrlPos]);
  useEffect(() => { ctrlPos(); }, [sv, selId, ctrlPos]);

  /* tela cheia: o mapa cobre a página e, onde der, o navegador esconde as barras dele */
  const cheiaApi = useRef(false);
  const telaCheia = useCallback((on: boolean) => {
    document.body.classList.toggle('mp-cheia', on);
    setCheia(on);
    if (on) {
      try { const p = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); cheiaApi.current = !!p; p?.catch?.(() => { cheiaApi.current = false; }); } catch { cheiaApi.current = false; }
    } else if (document.fullscreenElement && cheiaApi.current) { cheiaApi.current = false; document.exitFullscreen?.().catch?.(() => {}); }
    setTimeout(ctrlPos, 80);
  }, [ctrlPos]);
  useEffect(() => {
    const fs = () => { if (!document.fullscreenElement && cheiaApi.current) { cheiaApi.current = false; if (document.body.classList.contains('mp-cheia')) telaCheia(false); } };
    document.addEventListener('fullscreenchange', fs);
    return () => { document.removeEventListener('fullscreenchange', fs); document.body.classList.remove('mp-cheia'); };
  }, [telaCheia]);

  /* Esc: menu, Street View, lugar do Google e tela cheia, nessa ordem */
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented) return;
      if (menu) { setMenu(null); ev.preventDefault(); return; }
      if (setor != null) { setSetor(null); ev.preventDefault(); return; }
      if (motor.current?.svFechar()) { ev.preventDefault(); return; }
      if (motor.current?.lugarFechar()) { ev.preventDefault(); return; }
      if (document.body.classList.contains('mp-cheia') && !document.fullscreenElement) { telaCheia(false); ev.preventDefault(); }
    };
    const fora = (ev: PointerEvent) => { if (menu && !(ev.target as HTMLElement).closest('.mp-ctx')) setMenu(null); };
    document.addEventListener('keydown', k);
    document.addEventListener('pointerdown', fora, true);
    return () => { document.removeEventListener('keydown', k); document.removeEventListener('pointerdown', fora, true); };
  }, [menu, telaCheia, setor]);

  /* minha localização */
  function eu() {
    if (!navigator.geolocation) { toast('Este navegador não informa a localização.', true); return; }
    setEuBusca(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setEuBusca(false); motor.current?.euEm({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }, true); },
      (er) => { setEuBusca(false); toast(er.code === 1 ? 'A localização está bloqueada. Libere o acesso à localização para este site no navegador.' : 'Não foi possível obter sua localização agora.', true); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  /* busca de endereço na barra do mapa */
  const buscaT = useRef<ReturnType<typeof setTimeout>>();
  const buscaAtual = useRef('');
  async function rodarBusca(txt: string, ir: boolean) {
    const m = motor.current;
    if (!m) return;
    try {
      const rs = await m.buscar(txt);
      if (buscaAtual.current.trim() !== txt.trim()) return;
      if (ir && rs[0]) { irPara(rs[0]); return; }
      setResMsg(''); setRes(rs);
    } catch (er) { console.warn(er); setResMsg('Busca indisponível agora.'); setRes([]); }
  }
  function irPara(x: { nome: string; lat: number; lng: number }) {
    setRes(null); setBusEnd(x.nome); buscaAtual.current = x.nome;
    motor.current?.irPara(x, camada ? 17 : 18);
  }

  /* largura da lista: a borda entre a lista e o mapa se arrasta; dois cliques voltam ao padrão */
  function guardarL(w: number) { const v = limitarL(w); setLargura(v); try { localStorage.setItem(MP_LKEY, String(v)); } catch { /* sem storage */ } }
  function arrastar(ev: React.PointerEvent<HTMLDivElement>) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const h = ev.currentTarget, x0 = ev.clientX, w0 = ladoEl.current?.getBoundingClientRect().width ?? largura;
    h.setPointerCapture?.(ev.pointerId);
    document.body.classList.add('mp-arrastando');
    const mv = (e2: PointerEvent) => setLargura(limitarL(w0 + e2.clientX - x0));
    const fim = (e2: PointerEvent) => {
      h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', fim); h.removeEventListener('pointercancel', fim);
      document.body.classList.remove('mp-arrastando'); guardarL(w0 + e2.clientX - x0);
    };
    h.addEventListener('pointermove', mv); h.addEventListener('pointerup', fim); h.addEventListener('pointercancel', fim);
  }
  function teclaL(ev: React.KeyboardEvent) {
    const d = ev.shiftKey ? 80 : 20;
    const n = ev.key === 'ArrowLeft' ? largura - d : ev.key === 'ArrowRight' ? largura + d : ev.key === 'Home' ? MP_LMIN : ev.key === 'End' ? mpLmax() : null;
    if (n == null) return;
    ev.preventDefault(); guardarL(n);
  }

  /* clique na linha: enquadra o terreno e seleciona */
  function foco(t: TerrenoMapa) {
    const p = pinoDe(t);
    if (!p) { toast('Terreno sem localização.'); return; }
    motor.current?.focar(p);
    selecionar(t.id);
  }
  /* a linha selecionada fica à vista, rolando só a lista */
  useEffect(() => {
    const lado = ladoEl.current, it = selId && lado?.querySelector<HTMLElement>(`.mp-it[data-id="${selId}"]`);
    if (!lado || !it || getComputedStyle(lado).overflowY !== 'auto') return;
    const a = lado.getBoundingClientRect(), r = it.getBoundingClientRect();
    if (r.top < a.top || r.bottom > a.bottom) lado.scrollBy({ top: r.top - a.top - a.height / 2 + r.height / 2, behavior: 'smooth' });
  }, [selId]);

  const temApag = Object.values(apag).some((l) => l.length);
  const ord = itens(fases, f, e).map((i) => i.k);
  const linhas = visiveis.slice().sort((a, b) => ord.indexOf(classe(fases, a, f, e)!) - ord.indexOf(classe(fases, b, f, e)!) || a.nome.localeCompare(b.nome, 'pt'));
  const semLoc = visiveis.filter((t) => t.lat == null).length;

  function linha(t: TerrenoMapa, cartao?: boolean) {
    const [nm] = info(fases, classe(fases, t, f, e), f, e), cs = corSub(fases, t), s = selId === t.id, ad = areaDe(t);
    return (
      <div key={t.id} className={`mp-it${s ? ' sel' : ''}${cartao ? ' cartao' : ''}`} data-id={t.id} tabIndex={0} role="listitem" aria-current={s}
        onClick={() => foco(t)} onKeyDown={(ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) foco(t); }}>
        <span className="pin-mini mp-cod" style={{ background: cs[0], color: cs[1] }} title={`${t.nome} · ${subNome(fases, t)}`}>{t.codigo}</span>
        <div className="mp-it-t"><div className="t1">{t.nome}</div><div className="t2">{ad ? `${num(ad)} m²` : 'Área não informada'} · {nm}{t.lat == null && <> · <span style={{ color: 'var(--terracota)' }}>sem localização</span></>}</div></div>
        <button className="iconbtn mp-lupa" title="Ver ficha" aria-label={`Ver ficha de ${t.nome}`} onClick={(ev) => { ev.stopPropagation(); navegar(`/terrenos/${t.codigo}`); }}><Bi n="busca" s={22} /></button>
        {cartao && <button className="iconbtn mp-lupa mp-fx" title="Fechar" aria-label="Fechar" onClick={(ev) => { ev.stopPropagation(); selecionar(null); }}><Ic n="close" s={22} /></button>}
        {s && t.lat != null && motorPronto && (
          <div className="mp-it-a"><button className="linkbtn" onClick={(ev) => { ev.stopPropagation(); const p = pinoDe(t); if (p) motor.current?.streetView(p); }}>Street View</button></div>
        )}
      </div>
    );
  }

  return (
    <div className={`mapa-pg${largura < 200 ? ' mp-estreita' : ''}`} style={{ '--mp-w': `${largura}px` } as React.CSSProperties}>
      <aside className="mapa-lado" aria-label="Terrenos no mapa" ref={ladoEl}>
        <h1 className="sr-only">Mapa</h1>
        {temApag && <button className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => setApag({})}>Limpar busca e legenda</button>}
        <div id="mp-lista">
          {q.isLoading ? <div className="empty">Carregando terrenos…</div> : q.error ? <div className="empty">Não foi possível carregar os terrenos.</div> : <>
            <div className="mp-resumo"><span><b>{visiveis.length}</b> terrenos</span><span><b>{num(visiveis.reduce((s, t) => s + (areaDe(t) ?? 0), 0))}</b> m²</span></div>
            {linhas.length ? <div className="mp-lst" role="list">{linhas.map((t) => linha(t))}</div> : <div className="empty">Nenhum terreno com esses filtros.</div>}
            {semLoc > 0 && <div className="hint" style={{ marginTop: 8 }}>{semLoc} sem localização.</div>}
          </>}
        </div>
      </aside>
      <div className="mp-redim" role="separator" aria-orientation="vertical" aria-label="Largura da lista de terrenos" aria-valuemin={MP_LMIN} aria-valuemax={mpLmax()} aria-valuenow={largura}
        tabIndex={0} title="Arraste para mudar a largura da lista (dois cliques voltam ao padrão)" onPointerDown={arrastar} onDoubleClick={() => guardarL(mpLpad())} onKeyDown={teclaL} />
      <section className={`mapa-area${sv ? ' sv-on' : ''}`} aria-label="Mapa dos terrenos" ref={areaEl}>
        <div id="mapa" className="mapa" ref={mapaEl}>{semMapa && <div className="mapa-erro">{semMapa}</div>}</div>
        <div className="mp-barra">
          <form className="mp-busca" role="search" onSubmit={(ev) => { ev.preventDefault(); clearTimeout(buscaT.current); rodarBusca(busEnd, true); }}>
            <span className="mp-busca-i"><Ic n="search" s={20} /></span>
            <input id="mp-end" name="q" type="search" placeholder="Buscar endereço" aria-label="Buscar endereço no mapa" autoComplete="off" value={busEnd}
              onChange={(ev) => {
                const v = ev.target.value; setBusEnd(v); buscaAtual.current = v; clearTimeout(buscaT.current);
                if (v.trim().length < 3) { setRes(null); return; }
                buscaT.current = setTimeout(() => rodarBusca(v, false), 250);
              }} />
            <div id="mp-res" className="mp-res" role="listbox" hidden={res == null}>
              {res && (res.length ? res.map((x, i) => (
                <button key={i} type="button" role="option" aria-selected={false} onClick={() => irPara(x)}><Bi n="mapa" s={18} /><span>{x.nome}</span></button>
              )) : <div className="hint">{resMsg || 'Nada encontrado.'}</div>)}
            </div>
          </form>
          <div className="seg" role="group" aria-label="Fundo do mapa">
            {([['mapa', 'Mapa'], ['satelite', 'Satélite']] as [Base, string][]).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={base === k} onClick={() => setBase(k)}>{l}</button>
            ))}
          </div>
          <BotaoCamadas camada={camada} aberto={camMenu} abrir={setCamMenu} escolher={ligarCamada} />
        </div>
        <div id="mp-modo" className="mp-modo" aria-live="polite" />
        <div id="mp-cartao" className="mp-cartao" aria-live="polite">{sel && visiveis.includes(sel) && linha(sel, true)}</div>
        <button type="button" className="mp-cb sv-x" title="Fechar o Street View (Esc)" aria-label="Fechar o Street View" onClick={() => motor.current?.svFechar()}><Ic n="close" s={22} /></button>
        <div id="mp-ctrl" className="mp-ctrl">
          <button type="button" className={`mp-cb${euBusca ? ' busca' : ''}`} title="Minha localização" aria-label="Centralizar na minha localização" onClick={eu}><Ic n="eu" s={22} /></button>
          <button type="button" className="mp-cb" aria-pressed={cheia} title={cheia ? 'Sair da tela cheia' : 'Tela cheia'} aria-label={cheia ? 'Sair da tela cheia' : 'Tela cheia'} onClick={() => telaCheia(!cheia)}><Ic n={cheia ? 'telaSair' : 'tela'} s={22} /></button>
        </div>
        <details className="mp-legenda" open={leg} onToggle={(ev) => {
          const o = (ev.target as HTMLDetailsElement).open;
          setLeg(o);
          if (!o && (arv || f || e)) { setArv(false); nivel('', ''); }
        }}>
          <summary>Legenda</summary>
          <div id="mp-leg" className="mp-leg-l">
            <Legenda fases={fases} todos={todos} f={f} e={e} arv={arv} apag={apag} busca={busca}
              alternarArv={() => { const ab = !arv; setArv(ab); if (!ab && (f || e)) nivel('', ''); }} nivel={nivel} apagar={apagar}
              extra={<ItensLegenda camada={camada} alternar={(k) => ligarCamada(camada === k ? null : k)} />} />
          </div>
        </details>
        <div className="mp-aviso">Fundo do mapa indisponível nesta visualização.</div>
        {camada && <LegendaSetor camada={camada} aberta={rdLeg} alternar={setRdLeg} carregado={setOk} erro={setErro} metodologia={setMet} />}
        {camada && setor != null && setores() && <QuadroSetor d={setores()!} i={setor} camada={camada} fechar={() => setSetor(null)} metodologia={setMet} />}
        {menu && (
          <div className="mp-ctx" role="menu" style={{ left: Math.max(8, Math.min((areaEl.current?.clientWidth ?? 0) - 228, menu.x)), top: Math.max(8, Math.min((areaEl.current?.clientHeight ?? 0) - 64, menu.y)) }}>
            <button role="menuitem" autoFocus onClick={() => { const m = menu; setMenu(null); navegar('/terrenos/novo', { state: { ponto: [m.lat, m.lng] } }); }}><Ic n="add" s={18} />Novo terreno aqui</button>
          </div>
        )}
      </section>
      {met && <Metodologia camada={met} fechar={() => setMet(null)} />}
    </div>
  );
}

/* legenda em árvore: "Terrenos" abre as fases, a fase abre as etapas e a etapa abre as subetapas, um ramo aberto por vez;
   o nível mais fundo aberto colore os pinos. A bolinha e o número de um item ligam e desligam tudo que está nele. */
function Legenda({ fases, todos, f, e, arv, apag, busca, alternarArv, nivel, apagar, extra }: {
  fases: Fase[]; todos: TerrenoMapa[]; f: string; e: string; arv: boolean; apag: Apag; busca: string;
  alternarArv: () => void; nivel: (f: string, e: string) => void; apagar: (lv: string, k: string) => void; extra: React.ReactNode;
}) {
  const baseT = todos.filter((t) => bate(t, busca));
  const nivelItens = (nf: string, ne: string) => itens(fases, nf, ne).map((x) => ({ ...x, n: baseT.filter((t) => classe(fases, t, nf, ne) === x.k).length }));
  const off = (lv: string, k: string, pai: boolean) => pai || (apag[lv] ?? []).includes(k);
  const Pin = ({ x }: { x: Item }) => <span className="pin-mini" style={{ background: x.cor, color: x.fg }}>{x.g}</span>;
  const Seta = ({ ab }: { ab: boolean }) => <span className={`lg-s${ab ? ' ab' : ''}`} aria-hidden="true"><Ic n="chev" s={14} /></span>;
  const Tg = ({ lv, x, children, className }: { lv: string; x: Item; children: React.ReactNode; className: string }) => (
    <span className={className} title={`Ligar ou desligar tudo em ${x.nome}`} onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); apagar(lv, x.k); }}>{children}</span>
  );
  type X = Item & { n: number };
  const ramo = (x: X, prof: number, ab: boolean, nf: string, ne: string, fora: boolean, lv: string, pai: boolean) => (
    <button key={lv + x.k} type="button" className={`lg-i lg-a${fora ? ' lg-fora' : ''}${off(lv, x.k, pai) ? ' lg-off' : ''}`} style={{ '--p': prof } as React.CSSProperties} aria-expanded={ab} onClick={() => nivel(nf, ne)}>
      <Seta ab={ab} /><Tg lv={lv} x={x} className="lg-tg"><Pin x={x} /></Tg>{x.nome}<Tg lv={lv} x={x} className="n lg-tg">{x.n}</Tg>
    </button>
  );
  const folha = (x: X, prof: number, ativo: boolean, nf: string, ne: string, lv: string, pai: boolean) => ativo ? (
    <button key={lv + x.k} type="button" className={`lg-i lg-a${pai ? ' lg-off' : ''}`} style={{ '--p': prof } as React.CSSProperties} aria-pressed={!off(lv, x.k, pai)} onClick={() => apagar(lv, x.k)}>
      <span className="lg-s" /><Pin x={x} />{x.nome}<span className="n">{x.n}</span>
    </button>
  ) : (
    <button key={lv + x.k} type="button" className={`lg-i lg-a lg-fora${off(lv, x.k, pai) ? ' lg-off' : ''}`} style={{ '--p': prof } as React.CSSProperties} onClick={() => nivel(nf, ne)}>
      <span className="lg-s" /><Tg lv={lv} x={x} className="lg-tg"><Pin x={x} /></Tg>{x.nome}<Tg lv={lv} x={x} className="n lg-tg">{x.n}</Tg>
    </button>
  );
  const h: React.ReactNode[] = [];
  if (arv) for (const x of nivelItens('', '')) {
    if (!x.desce) { h.push(folha(x, 1, !f, '', '', '|', false)); continue; }
    const ab = f === x.k, px = off('|', x.k, false);
    h.push(ramo(x, 1, ab, ab ? '' : x.k, '', !!f && !ab, '|', false));
    if (!ab) continue;
    for (const y of nivelItens(x.k, '')) {
      if (!y.desce) { h.push(folha(y, 2, !e, x.k, '', x.k + '|', px)); continue; }
      const ab2 = e === y.k, py = px || off(x.k + '|', y.k, false);
      h.push(ramo(y, 2, ab2, x.k, ab2 ? '' : y.k, !!e && !ab2, x.k + '|', px));
      if (!ab2) continue;
      for (const z of nivelItens(x.k, y.k)) h.push(folha(z, 3, true, x.k, y.k, x.k + '|' + y.k, py));
    }
  }
  return (
    <>
      <button type="button" className="lg-i lg-a" style={{ '--p': 0 } as React.CSSProperties} aria-expanded={arv} onClick={alternarArv}>
        <Seta ab={arv} /><span className="lg-poi"><span className="pin-mini lg-nt" /></span>Terrenos<span className="n">{baseT.length}</span>
      </button>
      {h}
      <hr className="lg-sep" />
      {extra}
    </>
  );
}
