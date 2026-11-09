import { useEffect, useRef, useState } from 'react';
import { Bi, Ic } from '../components/Moldura';
import { gLib } from './google';
import type { Motor } from './motor';
import { calcularRota, distancia, guardarModo, modoGuardado, MODOS, SemRota, tempo, urlGoogle, type Modo, type PontoRota, type Rota } from './rota';

// Quadro "Traçar rota a partir daqui" (antes "até aqui"; pedido do Moises, 9/nov/2026): aberto pelo clique direito no mapa; a busca escolhe a origem
// (endereço ou lugar do Google, ou a minha localização) e a rota vai dela até o ponto clicado (ou o terreno sob o mouse),
// no modo escolhido. Fecha no X ou no Esc, e a rota sai do mapa.

/* ícones do Material Symbols (preenchidos), um por modo */
const IC: Record<Modo, string> = {
  DRIVE: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  TWO_WHEELER: 'M20 11c-.18 0-.36.03-.53.05L17.41 9H20V6l-3.72 1.86L13.41 5H9v2h3.59l2 2H11l-4 2-2-2H0v2h4c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4l2 2h3l3.49-6.1 1.01 1.01c-.91.73-1.5 1.84-1.5 3.09 0 2.21 1.79 4 4 4s4-1.79 4-4-1.79-4-4-4zM4 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm16 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
  WALK: 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7',
  BICYCLE: 'M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10 2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2l-2.2-2.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z',
  TRANSIT: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
};
const IcModo = ({ m }: { m: Modo }) => <svg className="ic" viewBox="0 0 24 24" width={20} height={20} aria-hidden="true"><path fill="currentColor" d={IC[m]} /></svg>;

export interface DestinoRota extends PontoRota { nome?: string }
type Origem = PontoRota & { nome: string };
/* sugestão da busca: do autocompletar já vem nome e endereço; o ponto só é pedido ao escolher (pred) */
type Achado = { nome: string; end: string; lat?: number; lng?: number; pred?: { toPlace(): { fetchFields(o: object): Promise<unknown>; location?: { lat(): number; lng(): number } } } };
/* eslint-disable @typescript-eslint/no-explicit-any */
let sessao: any = null;

/* endereço ou lugar do Google: Autocompletar (Places novo), como a busca do Google Maps; se não responder, a busca por texto */
async function achar(q: string, motor: Motor | null): Promise<Achado[]> {
  const centro = motor?.mapa.getCenter() || { lat: -23.55, lng: -46.63 };
  try {
    const { AutocompleteSuggestion, AutocompleteSessionToken } = gLib.places;
    sessao ??= new AutocompleteSessionToken();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, locationBias: { center: centro, radius: 30000 }, includedRegionCodes: ['br'], language: 'pt-BR', region: 'br', sessionToken: sessao });
    return (suggestions || []).filter((x: any) => x.placePrediction).slice(0, 5).map((x: any) => {
      const p = x.placePrediction;
      return { nome: p.mainText?.text || p.text?.text || '', end: (p.secondaryText?.text || '').replace(/, Brasil$/, ''), pred: p };
    });
  } catch (e) {
    console.warn('Autocompletar indisponível; busca por texto', e);
    const { Place } = gLib.places;
    const { places } = await Place.searchByText({ textQuery: q, fields: ['displayName', 'formattedAddress', 'location'], region: 'br', language: 'pt-BR', maxResultCount: 5, locationBias: centro });
    return (places || []).filter((p: any) => p.location).map((p: any) => {
      const end = (p.formattedAddress || '').replace(/, Brasil$/, ''), nome = p.displayName || end;
      return { nome, end: end.startsWith(nome) ? '' : end, lat: p.location.lat(), lng: p.location.lng() };
    });
  }
}
async function ponto(a: Achado): Promise<Origem> {
  if (a.lat != null && a.lng != null) return { nome: a.nome, lat: a.lat, lng: a.lng };
  const pl: any = a.pred!.toPlace();
  await pl.fetchFields({ fields: ['location'] });
  sessao = null; /* a sessão do autocompletar termina ao escolher */
  return { nome: a.nome, lat: pl.location.lat(), lng: pl.location.lng() };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** ponto escolhido no mapa para a saída: com nome (terreno, concorrente), com o lugar do Google, ou só o ponto (o nome vem do endereço) */
export type PontoMapa = PontoRota & { nome?: string; placeId?: string };

/* nome do ponto clicado: o do lugar do Google, senão o endereço do Geocoding, senão "Ponto no mapa" */
async function nomeDoPonto(p: PontoMapa): Promise<string> {
  if (p.nome) return p.nome;
  if (p.placeId) {
    try { const pl = new gLib.places.Place({ id: p.placeId }); await pl.fetchFields({ fields: ['displayName'] }); if (pl.displayName) return pl.displayName; }
    catch (e) { console.warn('Nome do lugar', e); }
  }
  try {
    const { results } = await new window.google.maps.Geocoder().geocode({ location: { lat: p.lat, lng: p.lng }, language: 'pt-BR', region: 'br' });
    const r = results?.find((x: { types?: string[] }) => x.types?.some((t) => t === 'street_address' || t === 'premise' || t === 'route')) ?? results?.[0];
    if (r?.formatted_address) return String(r.formatted_address).replace(/, Brasil$/, '').replace(/, \d{5}-\d{3}$/, '');
  } catch (e) { console.warn('Endereço do ponto', e); }
  return 'Ponto no mapa';
}

/* "Traçar rota até aqui": a saída também se escolhe clicando no mapa (pedido do Moises, 9/nov/2026): num ponto qualquer,
   num lugar do Google, noutro terreno ou num concorrente. Enquanto a escolha está ligada (ao abrir, até escolher a saída,
   ou pelo botão da mira), o clique no mapa vira a saída em vez de abrir a ficha, o card ou o quadro do lugar. */
export function QuadroRota({ motor, destino, fechar, pegar }: { motor: Motor | null; destino: DestinoRota; fechar: () => void; pegar: (fn: ((p: PontoMapa) => void) | null) => void }) {
  const [q, setQ] = useState('');
  const [sug, setSug] = useState<Achado[] | null>(null);
  const [lista, setLista] = useState(false);
  const [origem, setOrigem] = useState<Origem | null>(null);
  const [modo, setModo] = useState<Modo>(modoGuardado);
  const [res, setRes] = useState<Rota | null>(null);
  const [msg, setMsg] = useState<{ t: string; erro?: boolean } | null>(null);
  const [calc, setCalc] = useState(false);
  const [noMapa, setNoMapa] = useState(true);
  /* a página entrega aqui o clique no mapa enquanto a escolha está ligada */
  useEffect(() => {
    if (!noMapa) { pegar(null); return; }
    pegar((p) => {
      setNoMapa(false); setLista(false); setSug(null);
      const prov = p.nome || 'Ponto no mapa';
      setQ(prov); atual.current = prov; inp.current?.blur();
      setOrigem({ lat: p.lat, lng: p.lng, nome: prov });
      if (!p.nome) nomeDoPonto(p).then((n) => { if (atual.current === prov) { setQ(n); atual.current = n; setOrigem((o) => (o && o.lat === p.lat && o.lng === p.lng ? { ...o, nome: n } : o)); } });
    });
    return () => pegar(null);
  }, [noMapa, pegar]);
  const inp = useRef<HTMLInputElement>(null), bT = useRef<ReturnType<typeof setTimeout>>(), atual = useRef('');

  /* o ponto do clique direito ("fixo") também se arrasta (pedido do Moises, 9/nov/2026) e troca quando a pessoa usa o clique
     direito de novo com o quadro aberto; inv = a rota sai do ponto fixo e vai até o escolhido (o padrão); o botão ⇅ inverte */
  const [fixo, setFixo] = useState<DestinoRota>(destino);
  useEffect(() => { setFixo(destino); }, [destino]);
  const [inv, setInv] = useState(true); /* padrão: do ponto do clique direito até o escolhido (pedido do Moises, 9/nov/2026) */
  const soltarFixo = (p: PontoRota) => {
    arrastou.current = true;
    setFixo({ lat: p.lat, lng: p.lng, nome: 'Ponto no mapa' });
    nomeDoPonto(p).then((n) => setFixo((f) => (f.lat === p.lat && f.lng === p.lng ? { ...f, nome: n } : f)));
  };
  /* antes de haver rota, só o ponto fixo aparece (arrastável); a rota sai do mapa ao fechar */
  useEffect(() => { if (!origem) motor?.rota(inv ? null : fixo, inv ? fixo : null, null, false, inv ? { soltarO: soltarFixo } : { soltarD: soltarFixo }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [motor, fixo.lat, fixo.lng, inv, !origem]);
  useEffect(() => () => motor?.rotaLimpar(), [motor]);
  useEffect(() => { inp.current?.focus(); }, []);

  /* a saída arrastada no mapa (pedido do Moises, 9/nov/2026): vale o endereço de onde ela foi solta, e a rota se refaz
     sem reenquadrar o mapa, para a pessoa continuar ajustando no mesmo lugar */
  const arrastou = useRef(false);
  const soltar = (p: PontoRota) => {
    arrastou.current = true;
    const prov = 'Ponto no mapa';
    setNoMapa(false); setLista(false); setSug(null);
    setQ(prov); atual.current = prov;
    setOrigem({ lat: p.lat, lng: p.lng, nome: prov });
    nomeDoPonto(p).then((n) => { if (atual.current === prov) { setQ(n); atual.current = n; setOrigem((o) => (o && o.lat === p.lat && o.lng === p.lng ? { ...o, nome: n } : o)); } });
  };

  /* cada origem ou modo novo refaz a rota */
  useEffect(() => {
    if (!origem || !motor) return;
    let vivo = true;
    setCalc(true); setMsg(null);
    const a = inv ? fixo : origem, b = inv ? origem : fixo, enquadrar = !arrastou.current;
    const op = inv ? { soltarO: soltarFixo, soltarD: soltar } : { soltarO: soltar, soltarD: soltarFixo };
    arrastou.current = false;
    calcularRota(a, b, modo).then((r) => {
      if (!vivo) return;
      setRes(r); motor.rota(b, a, r.path, modo === 'WALK', { ...op, enquadrar });
    }).catch((e) => {
      if (!vivo) return;
      console.warn('Rota', e);
      setRes(null); motor.rota(b, a, null, false, op);
      const de = MODOS.find((x) => x.k === modo)!.de;
      setMsg(e instanceof SemRota
        ? { t: `O Google não tem rota ${de} entre esses dois pontos.`, erro: true }
        : { t: 'Não foi possível calcular a rota agora. Tente de novo em instantes.', erro: true });
    }).finally(() => { if (vivo) setCalc(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origem?.lat, origem?.lng, fixo.lat, fixo.lng, inv, modo, motor]);

  function buscar(v: string) {
    setQ(v); atual.current = v; clearTimeout(bT.current); setLista(true);
    if (v.trim().length < 3) { setSug(null); return; }
    bT.current = setTimeout(async () => {
      try { const r = await achar(v.trim(), motor); if (atual.current === v) setSug(r); }
      catch (e) { console.warn(e); if (atual.current === v) setSug([]); }
    }, 250);
  }
  function escolher(o: Origem) { setNoMapa(false); setOrigem(o); setQ(o.nome); atual.current = o.nome; setSug(null); setLista(false); inp.current?.blur(); }
  function escolherAchado(a: Achado) {
    setQ(a.nome); atual.current = a.nome; setSug(null); setLista(false); inp.current?.blur();
    ponto(a).then(escolher).catch((e) => { console.warn(e); setMsg({ t: 'Não foi possível localizar esse lugar. Tente outro.', erro: true }); });
  }
  function eu() {
    if (!navigator.geolocation) { setMsg({ t: 'Este navegador não informa a localização.', erro: true }); return; }
    setLista(false); setMsg({ t: 'Buscando a sua localização…' });
    navigator.geolocation.getCurrentPosition(
      (p) => escolher({ lat: p.coords.latitude, lng: p.coords.longitude, nome: 'Minha localização' }),
      (er) => setMsg({ t: er.code === 1 ? 'A localização está bloqueada. Libere o acesso à localização para este site no navegador.' : 'Não foi possível obter sua localização agora.', erro: true }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  function mudarModo(m: Modo) { setModo(m); guardarModo(m); }
  const md = MODOS.find((x) => x.k === modo)!;

  return (
    <div className="mp-rt" role="dialog" aria-label="Traçar rota" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (lista && sug) { setLista(false); return; } fechar(); } }}>
      <div className="mp-rt-h">
        <span className="mp-rt-t"><Ic n="rota" s={20} /><span className="mp-rt-pre">{inv ? 'Rota a partir de' : 'Rota até'}</span>{fixo.nome ? <b>{fixo.nome}</b> : 'o ponto marcado'}</span>
        <button type="button" className="iconbtn sm" aria-label="Inverter o sentido da rota" title={inv ? 'Inverter: ir até o ponto marcado' : 'Inverter: sair do ponto marcado'}
          aria-pressed={inv} onClick={() => { arrastou.current = true; setInv((v) => !v); }}>
          <svg className="ic" viewBox="0 0 24 24" width={18} height={18} aria-hidden="true"><path fill="currentColor" d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3 5 6.99h3V14h2V6.99h3L9 3z" /></svg>
        </button>
        <button type="button" className="iconbtn sm" aria-label="Fechar a rota" title="Fechar (Esc)" onClick={fechar}><Ic n="close" s={18} /></button>
      </div>
      <div className="mp-rt-modos" role="radiogroup" aria-label="Forma de condução">
        {MODOS.map((x) => (
          <button key={x.k} type="button" role="radio" aria-checked={modo === x.k} title={x.l} onClick={() => mudarModo(x.k)}>
            <span className="mp-rt-i"><IcModo m={x.k} /></span><span className="mp-rt-l">{x.l}</span>
          </button>
        ))}
      </div>
      <div className="mp-rt-busca">
        <span className={inv ? 'mp-rt-dp' : 'mp-rt-o'} aria-hidden="true" />
        <input ref={inp} type="search" placeholder={inv ? 'Indo para: endereço ou lugar' : 'Saindo de: endereço ou lugar'} aria-label={inv ? 'Chegada da rota: endereço ou lugar' : 'Origem da rota: endereço ou lugar'} autoComplete="off" value={q}
          onChange={(e) => buscar(e.target.value)} onFocus={() => setLista(true)} onBlur={() => setTimeout(() => setLista(false), 150)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (sug?.[0]) escolherAchado(sug[0]); } }} />
        <button type="button" className={`mp-rt-mira${noMapa ? ' on' : ''}`} aria-pressed={noMapa} title={noMapa ? 'Escolhendo no mapa: clique num ponto, lugar, terreno ou concorrente' : inv ? 'Escolher a chegada no mapa' : 'Escolher a saída no mapa'}
          aria-label={inv ? 'Escolher a chegada no mapa' : 'Escolher a saída no mapa'} onMouseDown={(e) => e.preventDefault()} onClick={() => setNoMapa((v) => !v)}><Ic n="eu" s={18} /></button>
        {lista && (
          <div className="mp-res" role="listbox">
            <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={eu}><Ic n="eu" s={18} /><span>Minha localização</span></button>
            {noMapa && !sug && <div className="hint">Ou clique no mapa: num endereço, num lugar, noutro terreno ou num concorrente.</div>}
            {sug && (sug.length ? sug.map((x, i) => (
              <button key={i} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => escolherAchado(x)}><Bi n="mapa" s={18} /><span className="mp-rt-s"><span>{x.nome}</span>{x.end && <span className="muted">{x.end}</span>}</span></button>
            )) : <div className="hint">Nada encontrado.</div>)}
          </div>
        )}
      </div>
      {noMapa && !lista && <div className="mp-rt-dica">Ou clique no mapa: num endereço, num lugar, noutro terreno ou num concorrente.</div>}
      {(calc || res || msg) && (
        <div className="mp-rt-r" aria-live="polite">
          {calc ? <span className="muted">Calculando a rota {md.de}…</span>
            : msg ? <span className={msg.erro ? 'mp-rt-erro' : 'muted'}>{msg.t}</span>
            : res && <>
              <div><b className="mp-rt-tempo">{tempo(res.s)}</b> <span className="muted">· {distancia(res.m)} {md.de}{modo === 'DRIVE' || modo === 'TWO_WHEELER' ? ', sem contar o trânsito' : ''}</span></div>
              {modo === 'TRANSIT' && res.linhas.length > 0 && <div className="mp-rt-linhas">{res.linhas.map((l) => <span key={l} className="chip">{l}</span>)}</div>}
              {modo === 'TWO_WHEELER' && <div className="hint">Rota de moto do Google, ainda em teste por lá: confira o trajeto.</div>}
            </>}
          {origem && !calc && <a className="btn sm text mp-rt-g" href={inv ? urlGoogle(fixo, origem, modo) : urlGoogle(origem, fixo, modo)} target="_blank" rel="noopener">Abrir no Google Maps</a>}
        </div>
      )}
    </div>
  );
}
