/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Ic } from '../components/Moldura';
import { gLib } from './google';
import { reguaA, reguaArea } from './motor';
import { calcularRota, distancia, SemRota, tempo, type PontoRota } from './rota';
import { nomeDoPonto } from './Rota';

// Anotações do Marketing no mapa (pedido do Moises, 16/nov/2026): pinos, áreas desenhadas e rotas salvas, cada um com nome e
// texto, numa caixa que abre com o mouse parado 1 s em cima; dois cliques (no desenho ou na caixa) editam o texto. Ficam em
// app.marketing_anotacoes, que só o papel Marketing lê e grava. A rota guarda o caminho a pé e os tempos calculados ao salvar:
// a pé sempre; de carro e de transporte público só quando a pé passa de 15 minutos (Routes API, uma chamada por modo).

export type Ponta = 'o' | 'd' | null;
export interface Anot {
  id: string; tipo: 'pino' | 'area' | 'rota'; nome: string; texto: string | null;
  latitude: number; longitude: number; pontos: [number, number][] | null;
  endereco: string | null; latitude_destino: number | null; longitude_destino: number | null; endereco_destino: string | null; texto_destino: string | null;
  distancia_m: number | null; pe_s: number | null; carro_s: number | null; transporte_s: number | null; transporte_linhas: string[] | null;
}
export const COR_ANOT = '#00796b';
export const ESPERA_CAIXA = 1000;
export const LIMITE_PE_S = 15 * 60;

export async function lerAnotacoes(empresa: string): Promise<Anot[]> {
  const { data, error } = await supabase.from('marketing_anotacoes').select('*').eq('empresa_id', empresa).order('criado_em');
  if (error) throw error;
  return (data ?? []) as Anot[];
}

/* ---------- camada no mapa: imperativa, como o motor ---------- */
export interface GanchosAnot {
  /** o mouse parou 1 s sobre a anotação (ou a ponta da rota) */
  mostrar(id: string, ponta: Ponta, lat: number, lng: number): void;
  /** o mouse saiu dela */
  sair(): void;
  /** dois cliques: editar o texto */
  duplo(id: string, ponta: Ponta, lat: number, lng: number): void;
}
export class CamadaAnot {
  private obj: any[] = [];
  private t: ReturnType<typeof setTimeout> | undefined;
  private ativa = true;
  private ult: Anot[] = [];
  constructor(private mapa: any, private g: GanchosAnot) {}
  /** desenhando a área ou a régua: as anotações não respondem ao mouse */
  setAtiva(on: boolean) { if (this.ativa === on) return; this.ativa = on; this.desenhar(this.ult); }
  limpar() { clearTimeout(this.t); this.obj.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null))); this.obj = []; }
  private entrar(id: string, ponta: Ponta, lat: number, lng: number) {
    clearTimeout(this.t);
    this.t = setTimeout(() => this.g.mostrar(id, ponta, lat, lng), ESPERA_CAIXA);
  }
  private saiu() { clearTimeout(this.t); this.g.sair(); }
  private marca(a: Anot, lat: number, lng: number, ponta: Ponta, cls: string, letra: string) {
    const el = document.createElement('div');
    el.className = 'an-pin ' + cls; el.dataset.anot = a.id; if (ponta) el.dataset.ponta = ponta;
    el.innerHTML = cls === 'an-p' ? '<span class="an-b"><b></b></span>' : `<span class="an-r">${letra}</span>`;
    if (this.ativa) {
      el.addEventListener('mouseenter', () => this.entrar(a.id, ponta, lat, lng));
      el.addEventListener('mouseleave', () => this.saiu());
      el.addEventListener('dblclick', (e) => { e.stopPropagation(); clearTimeout(this.t); this.g.duplo(a.id, ponta, lat, lng); });
      el.addEventListener('click', (e) => e.stopPropagation());
    }
    const mk = new gLib.marker.AdvancedMarkerElement({ map: this.mapa, position: { lat, lng }, content: el, zIndex: 2500, gmpClickable: this.ativa });
    this.obj.push(mk);
  }
  desenhar(lista: Anot[]) {
    this.limpar();
    this.ult = lista;
    const { google } = window, M = this.mapa;
    for (const a of lista) {
      if (a.tipo === 'pino') this.marca(a, a.latitude, a.longitude, null, 'an-p', '');
      else if (a.tipo === 'area' && a.pontos?.length) {
        const pg = new google.maps.Polygon({ map: M, paths: a.pontos.map(([la, ln]) => ({ lat: la, lng: ln })), strokeColor: COR_ANOT, strokeWeight: 2,
          fillColor: COR_ANOT, fillOpacity: 0.16, clickable: this.ativa, zIndex: 30 });
        if (this.ativa) {
          pg.addListener('mouseover', (e: any) => this.entrar(a.id, null, e.latLng.lat(), e.latLng.lng()));
          pg.addListener('mousemove', (e: any) => this.entrar(a.id, null, e.latLng.lat(), e.latLng.lng()));
          pg.addListener('mouseout', () => this.saiu());
          pg.addListener('dblclick', (e: any) => { e.stop?.(); clearTimeout(this.t); this.g.duplo(a.id, null, e.latLng.lat(), e.latLng.lng()); });
        }
        this.obj.push(pg);
      } else if (a.tipo === 'rota' && a.latitude_destino != null && a.longitude_destino != null) {
        if (a.pontos?.length) this.obj.push(new google.maps.Polyline({ map: M, path: a.pontos.map(([la, ln]) => ({ lat: la, lng: ln })), strokeOpacity: 0, clickable: false, zIndex: 31,
          icons: [{ icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: COR_ANOT, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5, scale: 4 }, offset: '0', repeat: '12px' }] }));
        this.marca(a, a.latitude, a.longitude, 'o', 'an-o', 'A');
        this.marca(a, a.latitude_destino, a.longitude_destino, 'd', 'an-d', 'B');
      }
    }
  }
}

/** ponto dentro da área (para o clique direito sobre ela) */
export function dentroArea(lat: number, lng: number, poly: [number, number][]) {
  let d = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ai, bi] = poly[i], [aj, bj] = poly[j];
    if ((bi > lng) !== (bj > lng) && lat < ((aj - ai) * (lng - bi)) / (bj - bi) + ai) d = !d;
  }
  return d;
}

/* ---------- a caixa (tooltip) ---------- */
const IC_PE = 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7';
const IC_CARRO = 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z';
const IC_BUS = 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z';
const Sv = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true"><path fill="currentColor" d={d} /></svg>;

export interface Tempos { m: number | null; pe: number | null; carro: number | null; transporte: number | null; linhas: string[] }
export function LinhasTempo({ t }: { t: Tempos }) {
  return (
    <div className="an-tempos">
      {t.pe != null && <span title="A pé"><Sv d={IC_PE} />{tempo(t.pe)}{t.m != null && <small> · {distancia(t.m)}</small>}</span>}
      {t.carro != null && <span title="De carro, sem contar o trânsito"><Sv d={IC_CARRO} />{tempo(t.carro)}</span>}
      {t.transporte != null && <span title="De transporte público"><Sv d={IC_BUS} />{tempo(t.transporte)}{t.linhas.length > 0 && <small> · {t.linhas.join(', ')}</small>}</span>}
      {t.pe != null && t.pe > LIMITE_PE_S && t.transporte == null && <span className="muted"><Sv d={IC_BUS} />sem rota de transporte</span>}
    </div>
  );
}
const temposDe = (a: Anot): Tempos => ({ m: a.distancia_m, pe: a.pe_s, carro: a.carro_s, transporte: a.transporte_s, linhas: a.transporte_linhas ?? [] });

/** a caixa que abre sobre a anotação; dois cliques nela (ou a anotação aberta já em edição) editam o nome e o texto */
export function CaixaAnot({ a, ponta, x, y, editar, entrar, sair, salvar, excluir, fechar }: {
  a: Anot; ponta: Ponta; x: number; y: number; editar: boolean;
  entrar: () => void; sair: () => void; fechar: () => void;
  salvar: (nome: string, texto: string) => Promise<void>; excluir: () => void;
}) {
  const [ed, setEd] = useState(editar);
  useEffect(() => { if (editar) setEd(true); }, [editar]);
  const txt0 = (ponta === 'd' ? a.texto_destino : a.texto) ?? '';
  const [nome, setNome] = useState(a.nome);
  const [txt, setTxt] = useState(txt0);
  const [grav, setGrav] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (ed) setTimeout(() => ta.current?.focus(), 0); }, [ed]);
  const titulo = a.tipo === 'rota' ? (ponta === 'd' ? 'Ponto de destino' : 'Ponto de origem') : a.tipo === 'area' ? 'Área' : 'Ponto';
  const end = a.tipo === 'rota' ? (ponta === 'd' ? a.endereco_destino : a.endereco) : null;
  const outro = a.tipo === 'rota' ? (ponta === 'd' ? a.endereco : a.endereco_destino) : null;
  async function ok() { setGrav(true); try { await salvar(nome.trim(), txt.trim()); setEd(false); } finally { setGrav(false); } }
  /* a caixa abre acima do ponto, ou abaixo quando não cabe em cima */
  const embaixo = y < 240;
  return (
    <div className={`an-tip${embaixo ? ' emb' : ''}${ed ? ' ed' : ''}`} style={{ left: x, top: y }} role="dialog" aria-label={a.nome || titulo}
      onMouseEnter={entrar} onMouseLeave={() => { if (!ed) sair(); }} onDoubleClick={() => !ed && setEd(true)}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); if (ed) { setEd(false); setNome(a.nome); setTxt(txt0); if (editar) fechar(); } else fechar(); } }}>
      <div className="an-tip-k">{titulo}</div>
      {ed ? <>
        <input className="an-tip-n" value={nome} placeholder="Nome" aria-label="Nome" onChange={(e) => setNome(e.target.value)} maxLength={200} />
        {end && <div className="an-tip-e">{end}</div>}
        <textarea ref={ta} value={txt} placeholder="Observações" aria-label="Observações" rows={4} maxLength={4000} onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ok(); } }} />
        <div className="an-tip-b">
          <button type="button" className="btn sm text crit" onClick={excluir}><Ic n="lixo" s={16} />Excluir</button>
          <span />
          <button type="button" className="btn sm text" onClick={() => { setEd(false); setNome(a.nome); setTxt(txt0); if (editar) fechar(); }}>Cancelar</button>
          <button type="button" className="btn sm primary" disabled={grav} onClick={ok}>{grav ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </> : <>
        {a.nome && <div className="an-tip-n">{a.nome}</div>}
        {end && <div className="an-tip-e">{end}</div>}
        {a.tipo === 'rota' && outro && <div className="an-tip-o">{ponta === 'd' ? 'Saindo de ' : 'Até '}{outro}</div>}
        {a.tipo === 'area' && a.pontos && <div className="an-tip-o">{reguaA(reguaArea(a.pontos) ?? 0)}</div>}
        {a.tipo === 'rota' && <LinhasTempo t={temposDe(a)} />}
        {txt0 ? <div className="an-tip-t">{txt0}</div> : <div className="an-tip-v">Dois cliques para escrever</div>}
      </>}
    </div>
  );
}

/* ---------- a rota antes de salvar ---------- */
export interface RotaCalc { o: PontoRota & { end: string }; d: PontoRota & { end: string }; path: [number, number][]; t: Tempos }
/** a pé sempre; carro e transporte só quando a pé passa de 15 minutos (pedido do Moises, 16/nov/2026) */
export async function calcularRotaMkt(o: PontoRota, d: PontoRota): Promise<RotaCalc> {
  const [pe, eo, ed] = await Promise.all([calcularRota(o, d, 'WALK'), nomeDoPonto(o), nomeDoPonto(d)]);
  let carro: number | null = null, transporte: number | null = null, linhas: string[] = [];
  if (pe.s > LIMITE_PE_S) {
    const [c, tr] = await Promise.all([
      calcularRota(o, d, 'DRIVE').catch((e) => { if (!(e instanceof SemRota)) console.warn('Rota de carro', e); return null; }),
      calcularRota(o, d, 'TRANSIT').catch((e) => { if (!(e instanceof SemRota)) console.warn('Rota de transporte', e); return null; }),
    ]);
    carro = c?.s ?? null; transporte = tr?.s ?? null; linhas = tr?.linhas ?? [];
  }
  return { o: { ...o, end: eo }, d: { ...d, end: ed }, path: pe.path.map((p) => [+p.lat.toFixed(6), +p.lng.toFixed(6)]), t: { m: pe.m, pe: pe.s, carro, transporte, linhas } };
}
