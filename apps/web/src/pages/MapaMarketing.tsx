import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Bi, Ic } from '../components/Moldura';
import { carregarGoogle, googleRecusado } from '../mapa/google';
import { Motor, reguaA, reguaArea, reguaM, reguaTotal, type Base, type Pino } from '../mapa/motor';
import { LegendaSetor, Metodologia, QuadroSetor } from '../mapa/CamadasSetor';
import { carregarSetores, setorEm, setores, type Camada } from '../mapa/setores';
import { mkFixa, BotaoMais, CaixaEmp, FiltroConc, ItensConc, TabelaEmp } from '../mapa/Concorrencia';
import { PopVso } from '../mapa/VsoHist';
import { carregarMercado, mercado, mfPassa, mkVisivel, type Filtro } from '../mapa/mercado';
import { SIT, anel } from '../mapa/dados';

// Mapa do Marketing (pedido do Moises, 16/nov/2026): a concorrência do Órulo, as camadas de renda e de densidade do IBGE e os
// terrenos comprados, só para ver. Os terrenos vêm de app.mapa_comprados (código, nome, ponto e poligonal); o banco não deixa
// o marketing ler mais nada da empresa (sem lista, sem ficha, sem funil). O pino e a poligonal não respondem ao clique.
// Mesmas classes e mesmos componentes da página Mapa (pages/Mapa.tsx), sem o que é de terreno: lista, filtros, legenda
// por fase, menu do clique direito, desenho e edição da poligonal, rota e Street View pela lista.

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
  const ganchos = useRef({ vazio: (_a: number, _b: number) => {}, clique: (_a: number, _b: number) => {}, mk: (_: string) => {}, mover: () => {} });

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
        pino: () => {}, menu: () => {}, duplo: () => {}, fecharMenu: () => {}, streetView: () => {}, movendo: (on) => { if (on) ganchos.current.mover(); },
        vazio: (a, b) => ganchos.current.vazio(a, b),
        clique: (a, b) => ganchos.current.clique(a, b),
        aviso: (m, erro) => toast(m, erro),
        pronto: () => {},
      });
      setPronto(true);
    });
    return () => { vivo = false; motor.current?.destruir(); motor.current = null; };
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
  ganchos.current.mover = () => { if (mkBox && !mkFixa() && Date.now() - mkAbertoEm.current > 350) setMkBox(null); };
  ganchos.current.mk = (id) => { mkAbertoEm.current = Date.now(); setSetor(null); setMkBox(id); setMkDest(id); };
  ganchos.current.vazio = (lat, lng) => {
    if (mkBox && !mkFixa() && Date.now() - mkAbertoEm.current > 350) setMkBox(null);
    setMkDest(null);
    if (camada && setores()) { const i = setorEm(lat, lng); setSetor(i); if (i != null) setMkBox(null); }
  };

  /* régua: cada clique marca um ponto; o primeiro ponto, com 3 ou mais, fecha a forma e mede a área */
  ganchos.current.clique = (lat, lng) => { const r = rgR.current; if (r) setRg({ pts: [...(r.fechado ? [] : r.pts), [lat, lng]], fechado: false }); };
  useEffect(() => { if (pronto) motor.current?.setModo(!!rg); }, [pronto, !!rg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pronto) motor.current?.cursorMarcar(rg ? 'default' : null); }, [pronto, !!rg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pronto) motor.current?.regua(rg?.pts || [], !!rg?.fechado, () => { const r = rgR.current; if (r && r.pts.length > 2 && !r.fechado) setRg({ ...r, fechado: true }); });
  }, [pronto, rg]);
  function rgAbrir() {
    if (rg) { setRg(null); return; }
    setMkBox(null); setSetor(null); motor.current?.lugarFechar();
    setRg({ pts: [], fechado: false });
    toast(TOQUE() ? 'Toque no mapa para marcar os pontos.' : 'Clique no mapa para marcar os pontos e no primeiro ponto para medir a área. Backspace apaga o último ponto; Esc apaga o desenho e, sem desenho, desliga a régua.');
  }
  const rgDesfazer = () => { const r = rgR.current; if (r?.pts.length) setRg(r.fechado ? { ...r, fechado: false } : { pts: r.pts.slice(0, -1), fechado: false }); };

  /* tela cheia */
  const telaCheia = useCallback((on: boolean) => { document.body.classList.toggle('mp-cheia', on); setCheia(on); }, []);
  useEffect(() => () => document.body.classList.remove('mp-cheia'), []);

  /* Esc e teclas da régua */
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement).matches?.('input,textarea,select') || document.querySelector('.scrim')) return;
      const r = rgR.current;
      if (r) {
        if (ev.key === 'Escape' || ev.key === 'Delete') { setRg(r.pts.length ? { pts: [], fechado: false } : null); ev.preventDefault(); return; }
        if (ev.key === 'Backspace') { rgDesfazer(); ev.preventDefault(); return; }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { rgDesfazer(); ev.preventDefault(); return; }
      }
      if (ev.key !== 'Escape') return;
      if (setor != null) { setSetor(null); return; }
      if (mkBox) { setMkBox(null); return; }
      if (motor.current?.svFechar() || motor.current?.lugarFechar()) return;
      if (cheia) telaCheia(false);
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [setor, mkBox, cheia, telaCheia]);

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
        <div id="mp-modo" className="mp-modo" aria-live="polite">{rg && (() => {
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
            <hr className="lg-sep" />
            <ItensConc lista={mkLista} erro={mkErro} ligada={merc} off={mkOff} arv={mkArv} alternarArv={() => setMkArv(!mkArv)}
              alternar={() => setMerc(!merc)} alternarSit={(k) => setMkOff(mkOff.includes(k) ? mkOff.filter((x) => x !== k) : [...mkOff, k])} />
          </div>
        </details>
        {camada && <LegendaSetor camada={camada} aberta={rdLeg} alternar={setRdLeg} carregado={setOk} erro={setErro} metodologia={setMet} />}
        {camada && setor != null && setores() && <QuadroSetor d={setores()!} i={setor} camada={camada} fechar={() => setSetor(null)} metodologia={setMet} />}
        {mkBox && mkEmp(mkBox) && <CaixaEmp e={mkEmp(mkBox)!} fechar={() => setMkBox(null)} tabela={setMkTab} vso={setMkVso} pausado={!!mkTab || !!mkVso} />}
      </section>
      {met && <Metodologia camada={met} fechar={() => setMet(null)} />}
      {mfAberto && mkOk && <FiltroConc f={mf} mudar={setMf} fechar={() => setMfAberto(false)} aviso={(m) => toast(m)} />}
      {mkTab && <TabelaEmp id={mkTab} fechar={() => setMkTab(null)} />}
      {mkVso && <PopVso id={mkVso} nome={mkEmp(mkVso)?.nome || ''} fechar={() => setMkVso(null)} />}
    </div>
  );
}
