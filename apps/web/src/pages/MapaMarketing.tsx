import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from '../components/ui';
import { Bi, Ic } from '../components/Moldura';
import { carregarGoogle, googleRecusado } from '../mapa/google';
import { Motor, reguaA, reguaArea, reguaM, reguaTotal, type Base, type Pino } from '../mapa/motor';
import { LegendaSetor, Metodologia, QuadroSetor } from '../mapa/CamadasSetor';
import { carregarSetores, setorEm, setores, type Camada } from '../mapa/setores';
import { mkFixa, BotaoMais, CaixaEmp, FiltroConc, ItensConc, TabelaEmp } from '../mapa/Concorrencia';
import { PopVso } from '../mapa/VsoHist';
import { carregarMercado, mercado, mfPassa, mkVisivel, type Filtro } from '../mapa/mercado';
import { SIT, anel } from '../mapa/dados';
import { CaixaAnot, CamadaAnot, calcularRotaMkt, dentroArea, lerAnotacoes, LinhasTempo, type Anot, type Ponta, type RotaCalc } from '../mapa/Anotacoes';
import { SemRota, type PontoRota } from '../mapa/rota';

// Mapa do Marketing (pedido do Moises, 16/nov/2026): a concorrência do Órulo, as camadas de renda e de densidade do IBGE e os
// terrenos comprados, só para ver. Os terrenos vêm de app.mapa_comprados (código, nome, ponto e poligonal); o banco não deixa
// o marketing ler mais nada da empresa (sem lista, sem ficha, sem funil). O pino e a poligonal não respondem ao clique.
// Mesmas classes e mesmos componentes da página Mapa (pages/Mapa.tsx), sem o que é de terreno: lista, filtros, legenda
// por fase, desenho e edição da poligonal dos terrenos, rota e Street View pela lista.
// Anotações do Marketing (pedido do Moises, 16/nov/2026; mapa/Anotacoes.tsx): o clique direito marca um ponto, desenha uma área
// ou traça a rota (direito na saída, direito na chegada, Salvar); a caixa abre com o mouse parado 1 s e dois cliques editam.

const TOQUE = () => matchMedia('(pointer: coarse)').matches;
const MP_TKEY = 'bkm-terrenos-mapa-tipo', MP_CKEY = 'bkm-terrenos-mapa-camada', MP_MKKEY = 'bkm-terrenos-mapa-mkt';
const [ROT, COR, , FG] = SIT.comprado;
type Comprado = { codigo: string; nome: string; latitude: number; longitude: number; poligono_geojson: unknown };

/* o que a pessoa ligou e desligou na legenda fica no navegador */
function lerMemo(): { terr: boolean; merc: boolean; mkOff: string[] } {
  try { const g = JSON.parse(localStorage.getItem(MP_MKKEY) || 'null'); if (g) return { terr: g.terr !== false, merc: g.merc !== false, mkOff: Array.isArray(g.mkOff) ? g.mkOff : [] }; } catch { /* sem armazenamento */ }
  return { terr: true, merc: true, mkOff: [] };
}

export default function MapaMarketing() {
  const { empresa } = useSessao();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['mapa-comprados', empresa?.id], enabled: !!empresa,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mapa_comprados', { p_empresa: empresa!.id });
      if (error) throw error;
      return (data ?? []) as Comprado[];
    },
  });
  const m0 = useRef(lerMemo()).current;
  const [terr, setTerr] = useState(m0.terr);
  const [merc, setMerc] = useState(m0.merc);
  const [mkOff, setMkOff] = useState<string[]>(m0.mkOff);
  const [mkArv, setMkArv] = useState(false);
  useEffect(() => { try { localStorage.setItem(MP_MKKEY, JSON.stringify({ terr, merc, mkOff })); } catch { /* sem armazenamento */ } }, [terr, merc, mkOff]);
  const [leg, setLeg] = useState(true);
  const [camada, setCamada] = useState<Camada | null>(() => { try { const k = localStorage.getItem(MP_CKEY); return k === 'renda' || k === 'dens' ? k : null; } catch { return null; } });
  useEffect(() => { try { localStorage.setItem(MP_CKEY, camada ?? ''); } catch { /* sem armazenamento */ } }, [camada]);
  const [rdLeg, setRdLeg] = useState(innerWidth > 899);
  const [setor, setSetor] = useState<number | null>(null);
  const [setOk, setSetOk] = useState(!!setores());
  const [setErro, setSetErro] = useState(false);
  const [met, setMet] = useState<Camada | null>(null);
  const [mf, setMf] = useState<Filtro>({});
  const [mfAberto, setMfAberto] = useState(false);
  const [mkOk, setMkOk] = useState(!!mercado());
  const [mkErro, setMkErro] = useState(false);
  const [mkBox, setMkBox] = useState<string | null>(null);
  const [mkDest, setMkDest] = useState<string | null>(null);
  const [mkTab, setMkTab] = useState<string | null>(null);
  const [mkVso, setMkVso] = useState<string | null>(null);
  const mkAbertoEm = useRef(0);
  const [cheia, setCheia] = useState(false);
  const [semMapa, setSemMapa] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [euBusca, setEuBusca] = useState(false);
  const [busEnd, setBusEnd] = useState('');
  const [busAberta, setBusAberta] = useState(false);
  const [res, setRes] = useState<{ nome: string; lat: number; lng: number }[] | null>(null);
  const [rg, setRg] = useState<{ pts: [number, number][]; fechado: boolean } | null>(null);
  const rgR = useRef(rg); rgR.current = rg;
  const mapaEl = useRef<HTMLDivElement>(null);
  const motor = useRef<Motor | null>(null);
  const ganchos = useRef({ vazio: (_a: number, _b: number) => {}, clique: (_a: number, _b: number) => {}, mk: (_: string) => {}, mover: (_: boolean) => {},
    menu: (_x: number, _y: number, _a: number, _b: number) => {} });

  /* anotações do Marketing */
  const qc = useQueryClient();
  const qa = useQuery({ queryKey: ['mkt-anotacoes', empresa?.id], enabled: !!empresa, queryFn: () => lerAnotacoes(empresa!.id) });
  const anots = qa.data ?? [];
  const recarregar = () => qc.invalidateQueries({ queryKey: ['mkt-anotacoes', empresa?.id] });
  const camadaA = useRef<CamadaAnot | null>(null);
  const [anOn, setAnOn] = useState(true);
  const [tip, setTip] = useState<{ id: string; ponta: Ponta; lat: number; lng: number; ed: boolean } | null>(null);
  const tipT = useRef<ReturnType<typeof setTimeout>>();
  const [, setVer] = useState(0); /* a caixa acompanha o mapa quando ele para */
  const [menu, setMenu] = useState<{ x: number; y: number; lat: number; lng: number; an?: { id: string; ponta: Ponta } } | null>(null);
  const alvoCtx = useRef<EventTarget | null>(null);
  const [des, setDes] = useState<[number, number][] | null>(null);
  const desR = useRef(des); desR.current = des;
  const [rtO, setRtO] = useState<PontoRota | null>(null);
  const [rtD, setRtD] = useState<PontoRota | null>(null);
  const [rt, setRt] = useState<{ calc?: RotaCalc; erro?: string } | null>(null);
  const [novo, setNovo] = useState<{ tipo: 'pino' | 'area' | 'rota'; lat: number; lng: number; pontos?: [number, number][]; rota?: RotaCalc } | null>(null);
  const [apagar, setApagar] = useState<Anot | null>(null);

  const [tipo, setTipo] = useState<Base>(() => { try { return localStorage.getItem(MP_TKEY) === 'mapa' ? 'mapa' : 'satelite'; } catch { return 'satelite'; } });
  const [baseCam, setBaseCam] = useState<Base | null>(null);
  useEffect(() => { setBaseCam(null); }, [camada]);
  const base: Base = camada ? (baseCam ?? 'satelite') : tipo;
  function escolherBase(v: Base) {
    if (camada) { setBaseCam(v); return; }
    setTipo(v); try { localStorage.setItem(MP_TKEY, v); } catch { /* sem armazenamento */ }
  }
  useEffect(() => { motor.current?.setBase(base); }, [base]);

  useEffect(() => {
    let vivo = true;
    carregarGoogle().then((ok) => {
      if (!vivo || !mapaEl.current) return;
      if (!ok || googleRecusado()) { setSemMapa('Não foi possível carregar o mapa do Google. Verifique a conexão e recarregue a página.'); return; }
      motor.current = new Motor(mapaEl.current, base, {
        soVer: true,
        pino: () => {}, duplo: () => {}, streetView: () => {}, movendo: (on) => ganchos.current.mover(on),
        menu: (x, y, a, b) => ganchos.current.menu(x, y, a, b), fecharMenu: () => setMenu(null),
        vazio: (a, b) => ganchos.current.vazio(a, b),
        clique: (a, b) => ganchos.current.clique(a, b),
        aviso: (m, erro) => toast(m, erro),
        pronto: () => {},
      });
      camadaA.current = new CamadaAnot(motor.current.mapa, {
        mostrar: (id, ponta, lat, lng) => { clearTimeout(tipT.current); setTip((t) => (t?.ed || (t && t.id === id && t.ponta === ponta) ? t : { id, ponta, lat, lng, ed: false })); },
        sair: () => { clearTimeout(tipT.current); tipT.current = setTimeout(() => setTip((t) => (t?.ed ? t : null)), 300); },
        duplo: (id, ponta, lat, lng) => { clearTimeout(tipT.current); setMenu(null); setTip({ id, ponta, lat, lng, ed: true }); },
      });
      /* o clique direito sobre uma anotação: o motor só entrega o ponto, então guarda o alvo antes dele */
      mapaEl.current.addEventListener('contextmenu', (e) => { alvoCtx.current = e.target; }, true);
      setPronto(true);
    });
    return () => { vivo = false; camadaA.current?.limpar(); camadaA.current = null; motor.current?.destruir(); motor.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* terrenos comprados: etiqueta com o código, na cor de Comprado da legenda, sem clique */
  const pinos = useMemo<Pino[]>(() => (q.data ?? []).map((t) => ({
    id: t.codigo, codigo: t.codigo, nome: `${t.codigo} · ${t.nome}`, lat: t.latitude, lng: t.longitude, poly: anel(t.poligono_geojson), cor: COR, fg: FG,
  })), [q.data]);
  const enquadrado = useRef(false);
  useEffect(() => {
    const m = motor.current;
    if (!m || !pronto) return;
    m.desenhar(terr ? pinos : [], null);
    if (!enquadrado.current && q.data && !m.temVista() && pinos.length) m.enquadrar(pinos.map((p) => ({ lat: p.lat, lng: p.lng })), 15);
    if (q.data) enquadrado.current = true;
  }, [pronto, pinos, terr, q.data]);

  /* camadas por setor censitário */
  useEffect(() => {
    if (!camada) return;
    carregarSetores().then(() => setSetOk(true)).catch(() => { setSetErro(true); toast('Não foi possível carregar os setores do IBGE.', true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camada]);
  useEffect(() => { if (pronto) motor.current?.camada(camada && setOk ? camada : null); }, [pronto, camada, setOk]);
  useEffect(() => { if (pronto) motor.current?.contornoSetor(camada ? setor : null); }, [pronto, camada, setor]);

  /* concorrência */
  useEffect(() => { carregarMercado().then(() => setMkOk(true)).catch(() => setMkErro(true)); }, []);
  const mkLista = useMemo(() => (mkOk ? mercado()!.emps.filter((x) => mfPassa(mf, x)) : null), [mkOk, mf]);
  const mkEmp = (id: string | null) => (id ? mercado()?.emps.find((x) => x.id === id) ?? null : null);
  useEffect(() => {
    if (!pronto || !mkLista) return;
    motor.current?.mercado(merc ? mkLista.filter((x) => mkVisivel(x, mkOff)) : [], (id) => ganchos.current.mk(id));
  }, [pronto, mkLista, merc, mkOff]);
  useEffect(() => {
    if (!pronto) return;
    const d = mkEmp(mkDest);
    motor.current?.destaque(d && merc && mkVisivel(d, mkOff) ? d : null, (id) => ganchos.current.mk(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, mkDest, merc, mkOff, mkOk]);
  /* o card da concorrência fecha quando o mapa se move, menos fixado no olhinho */
  ganchos.current.mover = (on) => {
    if (!on) { setVer((v) => v + 1); return; }
    if (mkBox && !mkFixa() && Date.now() - mkAbertoEm.current > 350) setMkBox(null);
    setTip((t) => (t?.ed ? t : null));
  };
  ganchos.current.mk = (id) => { mkAbertoEm.current = Date.now(); setSetor(null); setMkBox(id); setMkDest(id); };
  ganchos.current.vazio = (lat, lng) => {
    setMenu(null);
    if (mkBox && !mkFixa() && Date.now() - mkAbertoEm.current > 350) setMkBox(null);
    setMkDest(null);
    if (camada && setores()) { const i = setorEm(lat, lng); setSetor(i); if (i != null) setMkBox(null); }
  };

  /* régua: cada clique marca um ponto; o primeiro ponto, com 3 ou mais, fecha a forma e mede a área */
  ganchos.current.clique = (lat, lng) => {
    const d = desR.current;
    if (d) { setDes([...d, [lat, lng]]); return; }
    const r = rgR.current; if (r) setRg({ pts: [...(r.fechado ? [] : r.pts), [lat, lng]], fechado: false });
  };
  useEffect(() => { if (pronto) motor.current?.setModo(!!rg || !!des); }, [pronto, !!rg, !!des]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pronto) motor.current?.cursorMarcar(rg ? 'default' : des ? 'pointer' : null); }, [pronto, !!rg, !!des]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pronto) motor.current?.regua(rg?.pts || [], !!rg?.fechado, () => { const r = rgR.current; if (r && r.pts.length > 2 && !r.fechado) setRg({ ...r, fechado: true }); });
  }, [pronto, rg]);
  function rgAbrir() {
    if (rg) { setRg(null); return; }
    setMkBox(null); setSetor(null); motor.current?.lugarFechar(); fecharTudoAnot();
    setRg({ pts: [], fechado: false });
    toast(TOQUE() ? 'Toque no mapa para marcar os pontos.' : 'Clique no mapa para marcar os pontos e no primeiro ponto para medir a área. Backspace apaga o último ponto; Esc apaga o desenho e, sem desenho, desliga a régua.');
  }
  const rgDesfazer = () => { const r = rgR.current; if (r?.pts.length) setRg(r.fechado ? { ...r, fechado: false } : { pts: r.pts.slice(0, -1), fechado: false }); };

  /* ---------- anotações do Marketing ---------- */
  useEffect(() => { if (pronto) camadaA.current?.desenhar(anOn ? anots : []); }, [pronto, anots, anOn]);
  useEffect(() => { camadaA.current?.setAtiva(!rg && !des); }, [!!rg, !!des]); // eslint-disable-line react-hooks/exhaustive-deps
  function fecharTudoAnot() { setMenu(null); setTip(null); setDes(null); setRtO(null); setRtD(null); setRt(null); }
  const anot = (id: string | undefined) => anots.find((a) => a.id === id) ?? null;

  /* clique direito: sobre uma anotação, editar ou excluir; no vazio, marcar ponto, desenhar área ou a rota */
  ganchos.current.menu = (x, y, lat, lng) => {
    if (rgR.current || desR.current) return;
    const el = (alvoCtx.current as HTMLElement | null)?.closest?.('[data-anot]') as HTMLElement | null;
    alvoCtx.current = null;
    let an: { id: string; ponta: Ponta } | undefined = el ? { id: el.dataset.anot!, ponta: (el.dataset.ponta as Ponta) ?? null } : undefined;
    if (!an && anOn) { const a = [...anots].reverse().find((q) => q.tipo === 'area' && q.pontos && dentroArea(lat, lng, q.pontos)); if (a) an = { id: a.id, ponta: null }; }
    setTip((t) => (t?.ed ? t : null)); setMkBox(null);
    setMenu({ x, y, lat, lng, an });
  };

  /* área: cada clique marca um ponto; Concluir (ou Enter) com 3 ou mais */
  useEffect(() => {
    if (!pronto) return;
    const nada = () => {};
    motor.current?.rascunho(des ?? [], null, false, { toque: nada, menu: nada, duplo: nada, arrastando: nada,
      arrastado: (i, lat, lng) => setDes((d) => (d ? d.map((p, j) => (j === i ? [lat, lng] as [number, number] : p)) : d)) });
  }, [pronto, des]);
  function desConcluir() {
    const d = desR.current;
    if (!d || d.length < 3) return;
    const [la, ln] = d.reduce(([a, b], [c, e]) => [a + c / d.length, b + e / d.length], [0, 0]);
    setDes(null); setNovo({ tipo: 'area', lat: la, lng: ln, pontos: d });
  }

  /* rota: o direito na saída, o direito na chegada; a pé sempre, carro e transporte se a pé passa de 15 min */
  useEffect(() => {
    if (!pronto) return;
    const m = motor.current!;
    if (!rtO) { m.rotaLimpar(); return; }
    if (!rtD) { m.rota(null, rtO, null, false, { soltarO: setRtO }); return; }
    let vivo = true;
    setRt({});
    m.rota(rtD, rtO, null, false, { soltarO: setRtO, soltarD: setRtD });
    calcularRotaMkt(rtO, rtD).then((c) => {
      if (!vivo) return;
      setRt({ calc: c });
      m.rota(rtD, rtO, c.path.map(([lat, lng]) => ({ lat, lng })), true, { soltarO: setRtO, soltarD: setRtD, enquadrar: false });
    }).catch((e) => {
      if (!vivo) return;
      console.warn('Rota', e);
      setRt({ erro: e instanceof SemRota ? 'O Google não tem rota a pé entre esses dois pontos.' : 'Não foi possível calcular a rota agora. Tente de novo em instantes.' });
    });
    return () => { vivo = false; };
  }, [pronto, rtO, rtD]);

  async function gravarNovo(nome: string, texto: string, textoD: string) {
    const n = novo!;
    const base = { empresa_id: empresa!.id, tipo: n.tipo, nome, texto: texto || null, latitude: n.lat, longitude: n.lng };
    const linha = n.tipo === 'area' ? { ...base, pontos: n.pontos }
      : n.tipo === 'rota' ? { ...base, latitude: n.rota!.o.lat, longitude: n.rota!.o.lng, endereco: n.rota!.o.end, latitude_destino: n.rota!.d.lat, longitude_destino: n.rota!.d.lng,
        endereco_destino: n.rota!.d.end, texto_destino: textoD || null, pontos: n.rota!.path, distancia_m: n.rota!.t.m, pe_s: n.rota!.t.pe, carro_s: n.rota!.t.carro,
        transporte_s: n.rota!.t.transporte, transporte_linhas: n.rota!.t.linhas.length ? n.rota!.t.linhas : null }
      : base;
    const { error } = await supabase.from('marketing_anotacoes').insert(linha);
    if (error) { toast('Não foi possível salvar: ' + error.message, true); return; }
    if (n.tipo === 'rota') { setRtO(null); setRtD(null); setRt(null); }
    setNovo(null); setAnOn(true); recarregar();
    toast(n.tipo === 'rota' ? 'Rota salva.' : n.tipo === 'area' ? 'Área salva.' : 'Ponto salvo.');
  }
  async function salvarTexto(a: Anot, ponta: Ponta, nome: string, texto: string) {
    const { error } = await supabase.from('marketing_anotacoes').update({ nome, [ponta === 'd' ? 'texto_destino' : 'texto']: texto || null }).eq('id', a.id);
    if (error) { toast('Não foi possível salvar: ' + error.message, true); throw error; }
    await recarregar(); setTip((t) => (t ? { ...t, ed: false } : t));
  }
  async function excluir(a: Anot) {
    const { error } = await supabase.from('marketing_anotacoes').delete().eq('id', a.id);
    if (error) { toast('Não foi possível excluir: ' + error.message, true); return; }
    setApagar(null); setTip(null); recarregar(); toast('Excluído.');
  }

  /* tela cheia */
  const telaCheia = useCallback((on: boolean) => { document.body.classList.toggle('mp-cheia', on); setCheia(on); }, []);
  useEffect(() => () => document.body.classList.remove('mp-cheia'), []);

  /* Esc e teclas da régua */
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement).matches?.('input,textarea,select') || document.querySelector('.scrim')) return;
      const d = desR.current;
      if (d) {
        if (ev.key === 'Escape') { setDes(null); ev.preventDefault(); return; }
        if (ev.key === 'Enter') { desConcluir(); ev.preventDefault(); return; }
        if (ev.key === 'Backspace' || ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z')) { setDes(d.slice(0, -1)); ev.preventDefault(); return; }
      }
      const r = rgR.current;
      if (r) {
        if (ev.key === 'Escape' || ev.key === 'Delete') { setRg(r.pts.length ? { pts: [], fechado: false } : null); ev.preventDefault(); return; }
        if (ev.key === 'Backspace') { rgDesfazer(); ev.preventDefault(); return; }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { rgDesfazer(); ev.preventDefault(); return; }
      }
      if (ev.key !== 'Escape') return;
      if (menu) { setMenu(null); return; }
      if (tip) { setTip(null); return; }
      if (rtO) { setRtO(null); setRtD(null); setRt(null); return; }
      if (setor != null) { setSetor(null); return; }
      if (mkBox) { setMkBox(null); return; }
      if (motor.current?.svFechar() || motor.current?.lugarFechar()) return;
      if (cheia) telaCheia(false);
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [setor, mkBox, cheia, telaCheia, menu, tip, rtO]); // eslint-disable-line react-hooks/exhaustive-deps

  /* o menu fecha no clique fora dele */
  useEffect(() => {
    if (!menu) return;
    const fora = (ev: PointerEvent) => { if (!(ev.target as HTMLElement).closest('.mp-ctx')) setMenu(null); };
    document.addEventListener('pointerdown', fora, true);
    return () => document.removeEventListener('pointerdown', fora, true);
  }, [menu]);

  function eu() {
    if (!navigator.geolocation) { toast('Este navegador não informa a localização.', true); return; }
    setEuBusca(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setEuBusca(false); motor.current?.euEm({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }, true); },
      (er) => { setEuBusca(false); toast(er.code === 1 ? 'A localização está bloqueada. Libere o acesso à localização para este site no navegador.' : 'Não foi possível obter sua localização agora.', true); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  /* busca de endereço */
  const buscaT = useRef<ReturnType<typeof setTimeout>>(), buscaAtual = useRef('');
  async function rodarBusca(txt: string, ir: boolean) {
    const m = motor.current;
    if (!m) return;
    try {
      const rs = await m.buscar(txt);
      if (buscaAtual.current.trim() !== txt.trim()) return;
      if (ir && rs[0]) { irPara(rs[0]); return; }
      setRes(rs);
    } catch { setRes([]); }
  }
  function irPara(x: { nome: string; lat: number; lng: number }) { setRes(null); setBusEnd(x.nome); buscaAtual.current = x.nome; motor.current?.irPara(x, camada ? 17 : 18); }

  const nT = q.data?.length ?? 0;
  return (
    <div className="mapa-pg mp-mkt">
      <section className="mapa-area" aria-label="Mapa">
        <h1 className="sr-only">Mapa</h1>
        <div id="mapa" className="mapa" ref={mapaEl}>{semMapa && <div className="mapa-erro">{semMapa}</div>}</div>
        <div className="mp-barra">
          <form className={`mp-busca${busAberta ? '' : ' fechada'}`} role="search" onSubmit={(ev) => { ev.preventDefault(); clearTimeout(buscaT.current); rodarBusca(busEnd, true); }}>
            <button type="button" className="mp-busca-i" aria-label="Buscar endereço" aria-expanded={busAberta} onClick={() => setBusAberta(true)}><Ic n="search" s={20} /></button>
            <input id="mp-end" type="search" placeholder="Buscar endereço" aria-label="Buscar endereço no mapa" autoComplete="off" value={busEnd} tabIndex={busAberta ? undefined : -1}
              onChange={(ev) => {
                const v = ev.target.value; setBusEnd(v); buscaAtual.current = v; clearTimeout(buscaT.current);
                if (v.trim().length < 3) { setRes(null); return; }
                buscaT.current = setTimeout(() => rodarBusca(v, false), 250);
              }} />
            <button type="button" className="mp-busca-x" aria-label="Fechar a busca" onClick={() => { setBusAberta(false); setBusEnd(''); setRes(null); }}><Ic n="back" s={20} /></button>
            <div id="mp-res" className="mp-res" role="listbox" hidden={res == null}>
              {res && (res.length ? res.map((x, i) => (
                <button key={i} type="button" role="option" aria-selected={false} onClick={() => irPara(x)}><Bi n="mapa" s={18} /><span>{x.nome}</span></button>
              )) : <div className="hint">Nada encontrado.</div>)}
            </div>
          </form>
          <BotaoMais f={mf} base={base} abrirConc={() => { setMfAberto(true); setMkBox(null); }} escolherBase={escolherBase}
            camada={camada} alternarCamada={(k) => { if (camada === k) setSetor(null); setCamada(camada === k ? null : k); }} regua={rgAbrir} />
        </div>
        <div id="mp-modo" className="mp-modo" aria-live="polite">{des && <>
          <span className="mp-q mp-fina">{des.length < 3 ? `Área: clique no mapa para marcar os pontos (${des.length} de pelo menos 3)` : `Área: ${des.length} pontos · ${reguaA(reguaArea(des) ?? 0)}`}</span>
          <button className="btn sm text" disabled={!des.length} onClick={() => setDes(des.slice(0, -1))}>Desfazer</button>
          <button className="btn sm text" onClick={() => setDes(null)}>Cancelar</button>
          <button className="btn sm primary" disabled={des.length < 3} onClick={desConcluir}>Concluir</button>
        </>}{!des && !rg && rtO && <>
          {!rtD ? <span className="mp-q mp-fina">Rota: clique com o botão direito no destino e escolha Rota até aqui</span>
            : rt?.calc ? <span className="mp-q mp-fina an-rt"><span>{rt.calc.o.end} → {rt.calc.d.end}</span><LinhasTempo t={rt.calc.t} /></span>
            : <span className="mp-q mp-fina">{rt?.erro ?? 'Calculando a rota…'}</span>}
          <button className="btn sm text" onClick={() => { setRtO(null); setRtD(null); setRt(null); }}>Cancelar</button>
          {rt?.calc && <button className="btn sm primary" onClick={() => setNovo({ tipo: 'rota', lat: rtO.lat, lng: rtO.lng, rota: rt.calc })}>Salvar rota</button>}
        </>}{rg && (() => {
          const n = rg.pts.length, ar = rg.fechado ? reguaArea(rg.pts) : null;
          return <>
            <span className="mp-q mp-fina rg-b">{n < 2 ? 'Régua: clique no mapa para medir' : `${rg.fechado ? 'Perímetro' : 'Distância'} ${reguaM(reguaTotal(rg.pts, rg.fechado))}${ar ? ` · área ${reguaA(ar)}` : ''}`}</span>
            <button className="btn sm text" disabled={!n} onClick={rgDesfazer}>Desfazer</button>
            <button className="btn sm text" disabled={!n} onClick={() => setRg({ pts: [], fechado: false })}>Limpar</button>
            <button className="btn sm primary" onClick={() => setRg(null)}>Sair</button>
          </>;
        })()}</div>
        <button type="button" className="mp-cb sv-x" title="Fechar o Street View (Esc)" aria-label="Fechar o Street View" onClick={() => motor.current?.svFechar()}><Ic n="close" s={22} /></button>
        <div id="mp-ctrl" className="mp-ctrl">
          <button type="button" className="mp-cb mp-rg" aria-pressed={!!rg} title="Régua" aria-label="Régua" onClick={rgAbrir}><Ic n="regua" s={22} /></button>
          <button type="button" className={`mp-cb${euBusca ? ' busca' : ''}`} title="Minha localização" aria-label="Centralizar na minha localização" onClick={eu}><Ic n="eu" s={22} /></button>
          <button type="button" className="mp-cb" aria-pressed={cheia} title={cheia ? 'Sair da tela cheia' : 'Tela cheia'} aria-label={cheia ? 'Sair da tela cheia' : 'Tela cheia'} onClick={() => telaCheia(!cheia)}><Ic n={cheia ? 'telaSair' : 'tela'} s={22} /></button>
        </div>
        <details className="mp-legenda" open={leg} onToggle={(ev) => setLeg((ev.target as HTMLDetailsElement).open)}>
          <summary><span className="lg-tit">Legenda</span></summary>
          <div id="mp-leg" className="mp-leg-l">
            <button type="button" className={`lg-i lg-a${terr ? '' : ' lg-off'}`} style={{ '--p': 0 } as React.CSSProperties} aria-pressed={terr} onClick={() => setTerr(!terr)}>
              <span className="lg-s" /><span className="pin-mini" style={{ background: COR, color: FG }}>{SIT.comprado[2]}</span>Terrenos {ROT.toLowerCase()}s<span className="n">{q.isLoading ? '…' : nT}</span>
            </button>
            {q.error && <div className="hint">Não foi possível carregar os terrenos.</div>}
            <button type="button" className={`lg-i lg-a${anOn ? '' : ' lg-off'}`} style={{ '--p': 0 } as React.CSSProperties} aria-pressed={anOn} onClick={() => { setAnOn(!anOn); setTip(null); }}>
              <span className="lg-s" /><span className="pin-mini an-mini" />Anotações do Marketing<span className="n">{qa.isLoading ? '…' : anots.length}</span>
            </button>
            <hr className="lg-sep" />
            <ItensConc lista={mkLista} erro={mkErro} ligada={merc} off={mkOff} arv={mkArv} alternarArv={() => setMkArv(!mkArv)}
              alternar={() => setMerc(!merc)} alternarSit={(k) => setMkOff(mkOff.includes(k) ? mkOff.filter((x) => x !== k) : [...mkOff, k])} />
          </div>
        </details>
        {camada && <LegendaSetor camada={camada} aberta={rdLeg} alternar={setRdLeg} carregado={setOk} erro={setErro} metodologia={setMet} />}
        {camada && setor != null && setores() && <QuadroSetor d={setores()!} i={setor} camada={camada} fechar={() => setSetor(null)} metodologia={setMet} />}
        {mkBox && mkEmp(mkBox) && <CaixaEmp e={mkEmp(mkBox)!} fechar={() => setMkBox(null)} tabela={setMkTab} vso={setMkVso} pausado={!!mkTab || !!mkVso} />}
        {menu && (() => {
          const a = anot(menu.an?.id), W = mapaEl.current?.clientWidth ?? 0, H = mapaEl.current?.clientHeight ?? 0;
          const fim = () => setMenu(null);
          return (
            <div className="mp-ctx" role="menu" style={{ left: Math.max(8, Math.min(W - 228, menu.x)), top: Math.max(8, Math.min(H - (a ? 140 : rtO ? 190 : 150), menu.y)) }}>
              {a ? <>
                <div className="v-t">{a.nome || (a.tipo === 'rota' ? 'Rota' : a.tipo === 'area' ? 'Área' : 'Ponto')}</div>
                <button role="menuitem" autoFocus onClick={() => { fim(); setTip({ id: a.id, ponta: menu.an!.ponta, lat: menu.lat, lng: menu.lng, ed: true }); }}><span>Editar</span><Ic n="edit" s={18} /></button>
                <button role="menuitem" className="crit" onClick={() => { fim(); setApagar(a); }}><span>Excluir</span><Ic n="lixo" s={18} /></button>
              </> : <>
                {rtO && <button role="menuitem" autoFocus onClick={() => { fim(); setRtD({ lat: menu.lat, lng: menu.lng }); }}><span>Rota até aqui</span><Ic n="rota" s={18} /></button>}
                <button role="menuitem" autoFocus={!rtO} onClick={() => { fim(); setNovo({ tipo: 'pino', lat: menu.lat, lng: menu.lng }); }}><span>Marcar ponto aqui</span><Ic n="add" s={18} /></button>
                <button role="menuitem" onClick={() => { fim(); setTip(null); setRtO(null); setRtD(null); setRt(null); setDes([[menu.lat, menu.lng]]); }}><span>Desenhar área a partir daqui</span><Ic n="edit" s={18} /></button>
                <button role="menuitem" onClick={() => { fim(); setTip(null); setMkBox(null); setRt(null); setRtD(null); setRtO({ lat: menu.lat, lng: menu.lng }); }}><span>{rtO ? 'Nova rota a partir daqui' : 'Rota a partir daqui'}</span><Ic n="rota" s={18} /></button>
              </>}
            </div>
          );
        })()}
        {tip && anot(tip.id) && (() => {
          const p = motor.current?.pontoNaTela(tip.lat, tip.lng);
          if (!p) return null;
          return <CaixaAnot key={tip.id + (tip.ponta ?? '')} a={anot(tip.id)!} ponta={tip.ponta} x={p.x} y={p.y} editar={tip.ed}
            entrar={() => clearTimeout(tipT.current)} sair={() => { tipT.current = setTimeout(() => setTip((t) => (t?.ed ? t : null)), 300); }}
            fechar={() => setTip(null)} salvar={(n, t) => salvarTexto(anot(tip.id)!, tip.ponta, n, t)} excluir={() => setApagar(anot(tip.id))} />;
        })()}
      </section>
      {novo && <NovaAnot n={novo} fechar={() => setNovo(null)} gravar={gravarNovo} />}
      {apagar && (
        <Dialogo titulo={`Excluir ${apagar.tipo === 'rota' ? 'a rota' : apagar.tipo === 'area' ? 'a área' : 'o ponto'}?`} sub={apagar.nome || undefined} onFechar={() => setApagar(null)}
          rodape={<><button className="btn" onClick={() => setApagar(null)}>Cancelar</button><button className="btn primary" onClick={() => excluir(apagar)}>Excluir</button></>}>
          <p className="muted" style={{ margin: 0 }}>Some do mapa para todas as pessoas do Marketing.</p>
        </Dialogo>
      )}
      {met && <Metodologia camada={met} fechar={() => setMet(null)} />}
      {mfAberto && mkOk && <FiltroConc f={mf} mudar={setMf} fechar={() => setMfAberto(false)} aviso={(m) => toast(m)} />}
      {mkTab && <TabelaEmp id={mkTab} fechar={() => setMkTab(null)} />}
      {mkVso && <PopVso id={mkVso} nome={mkEmp(mkVso)?.nome || ''} fechar={() => setMkVso(null)} />}
    </div>
  );
}

/* nome e observações ao criar o ponto, a área ou a rota */
function NovaAnot({ n, fechar, gravar }: { n: { tipo: 'pino' | 'area' | 'rota'; pontos?: [number, number][]; rota?: RotaCalc }; fechar: () => void; gravar: (nome: string, texto: string, textoD: string) => Promise<void> }) {
  const [nome, setNome] = useState('');
  const [txt, setTxt] = useState('');
  const [txtD, setTxtD] = useState('');
  const [grav, setGrav] = useState(false);
  const rota = n.tipo === 'rota' ? n.rota! : null;
  const titulo = rota ? 'Salvar rota' : n.tipo === 'area' ? 'Nova área' : 'Novo ponto';
  async function ok(e?: React.FormEvent) { e?.preventDefault(); setGrav(true); try { await gravar(nome.trim(), txt.trim(), txtD.trim()); } finally { setGrav(false); } }
  return (
    <Dialogo titulo={titulo} sub={n.tipo === 'area' && n.pontos ? reguaA(reguaArea(n.pontos) ?? 0) : undefined} onFechar={fechar}
      rodape={<><button className="btn" onClick={fechar}>Cancelar</button><button className="btn primary" disabled={grav} onClick={() => ok()}>{grav ? 'Salvando…' : 'Salvar'}</button></>}>
      <form className="an-novo" onSubmit={ok}>
        {rota && <div className="an-novo-r"><div><b>Origem</b> {rota.o.end}</div><div><b>Destino</b> {rota.d.end}</div><LinhasTempo t={rota.t} /></div>}
        <div className="field"><label htmlFor="an-nome">Nome</label><input id="an-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} placeholder={rota ? 'Ex.: Estação até o stand' : n.tipo === 'area' ? 'Ex.: Área de panfletagem' : 'Ex.: Stand de vendas'} /></div>
        <div className="field"><label htmlFor="an-txt">{rota ? 'Observações na origem' : 'Observações'}</label><textarea id="an-txt" rows={3} value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={4000} /></div>
        {rota && <div className="field"><label htmlFor="an-txtd">Observações no destino</label><textarea id="an-txtd" rows={3} value={txtD} onChange={(e) => setTxtD(e.target.value)} maxLength={4000} /></div>}
      </form>
    </Dialogo>
  );
}
