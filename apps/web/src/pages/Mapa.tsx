import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { empilhar } from '../components/Desfazer';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Bi, Ic, type ContextoMoldura } from '../components/Moldura';
import { carregarGoogle, googleRecusado } from '../mapa/google';
import GavetaFicha from '../ficha/Gaveta';
import { MenuPonto } from '../mapa/MenuPonto';
import { Motor, vista, reguaA, reguaArea, reguaM, reguaTotal, type Base, type GestosPonto, type Pino } from '../mapa/motor';
import { desenhoAtendido, poligonal, useNovo } from '../novo/estado';
import { useConsultaGeo } from '../novo/consulta';
import { areaPoly, centroPoly, dentroPoly, fixa, geojson, m2, type P } from '../novo/geo';
import LotesGeo from '../novo/LotesGeo';
import { trocarSqls } from '../novo/trocarSqls';
import type { LoteSql } from '../novo/geosampa';
import { LegendaSetor, Metodologia, QuadroSetor } from '../mapa/CamadasSetor';
import { carregarSetores, setorEm, setores, type Camada } from '../mapa/setores';
import { mkFixa, BotaoMais, CaixaEmp, FiltroConc, ItensConc, TabelaEmp } from '../mapa/Concorrencia';
import { carregarMercado, mercado, mfPassa, mkVisivel, type Filtro } from '../mapa/mercado';
import { apagado, areaDe, bate, carregar, classe, corSub, info, itens, subNome, type Apag, type Fase, type Item, type TerrenoMapa } from '../mapa/dados';

// Página Mapa, com a mesma marcação e as mesmas classes do protótipo (tools/prototipo/proto_mod.js › pgMapa,
// mpLista, mpItem, mpLegenda, mpCtrlHtml, ctxAbrir, mpLargura; proto_novo.js › mpBuscaHtml). Os estilos são os do
// protótipo, em styles.css. O desenho da poligonal do terreno novo segue proto_mod.js › mapaClique, vGestos, vAcao,
// vMenuDesenha e os atalhos do desenho. A edição da poligonal segue editarPoligonal e concluirDesenho. Ainda fora: filtros e visões, a gaveta da ficha,
// e a camada de Concorrência só lê o retrato do monitor (sem a cadastrada à mão, desligada no protótipo).

const num = (n: number) => Math.round(n).toLocaleString('pt-BR');
const TOQUE = () => matchMedia('(pointer: coarse)').matches;
const MP_LKEY = 'bkm-terrenos-mapa-lista', LG_FKEY = 'bkm-terrenos-legenda-fixa', LG_AKEY = 'bkm-terrenos-legenda', MP_TKEY = 'bkm-terrenos-mapa-tipo', MP_LMIN = 76;
const mpLpad = () => (innerWidth < 1300 ? 300 : 360);
const mpLmax = () => Math.max(MP_LMIN, Math.min(720, Math.round(innerWidth * 0.6)));
const limitarL = (w: number) => Math.round(Math.max(MP_LMIN, Math.min(mpLmax(), w)));
function larguraGuardada() {
  let v: number | null = null;
  try { v = Number(localStorage.getItem(MP_LKEY)) || null; } catch { /* sem storage */ }
  return limitarL(v || mpLpad());
}
/* o que a pessoa escolheu fica na sessão, como no protótipo (UI.mp, UI.mpBase, UI.mpLeg) */
const memo: { f: string; e: string; arv: boolean; apag: Apag; leg: boolean | null; camada: Camada | null; rdLeg: boolean | null;
  mf: Filtro; merc: boolean; mkOff: string[]; mkArv: boolean } =
  { f: '', e: '', arv: false, apag: {}, leg: null, camada: null, rdLeg: null, mf: {}, merc: true, mkOff: [], mkArv: false };
/* o que a legenda apaga (terrenos por fase, etapa e subetapa; concorrência ligada, faixas e situações) fica guardado no navegador
   e vale em outra sessão (bkm-terrenos-mapa-legenda; pedido do Moisés, 5/nov/2026) */
const MP_LGKEY = 'bkm-terrenos-mapa-legenda', MP_CKEY = 'bkm-terrenos-mapa-camada';
/* a camada de renda ou densidade e o filtro da concorrência também ficam guardados, mas se apagam quando a pessoa fica fora da
   página Mapa por mais de MP_EXPIRA_MIN minutos (pedido do Moisés, 5/nov/2026); bkm-terrenos-mapa-visto é a última vez no mapa */
const MP_EXPIRA_MIN = 30, MP_VISTO_KEY = 'bkm-terrenos-mapa-visto', MP_MFKEY = 'bkm-terrenos-mapa-filtro-conc';
function mpExpirou() { try { const v = Number(localStorage.getItem(MP_VISTO_KEY) || 0); return !!v && Date.now() - v > MP_EXPIRA_MIN * 60000; } catch { return false; } }
function mpExpirar() {
  if (!mpExpirou()) return;
  try { [MP_CKEY, MP_MFKEY, MP_VISTO_KEY].forEach((k) => localStorage.removeItem(k)); } catch { /* sem armazenamento */ }
  memo.camada = null; memo.mf = {};
}
function mpVisto() { try { localStorage.setItem(MP_VISTO_KEY, String(Date.now())); } catch { /* sem armazenamento */ } }
mpExpirar();
try { const k = localStorage.getItem(MP_CKEY); if (k === 'renda' || k === 'dens') memo.camada = k; } catch { /* sem armazenamento */ }
try { const m = JSON.parse(localStorage.getItem(MP_MFKEY) || 'null'); if (m && typeof m === 'object') memo.mf = m; } catch { /* sem armazenamento */ }
try {
  const g = JSON.parse(localStorage.getItem(MP_LGKEY) || 'null');
  if (g) { if (g.apag && typeof g.apag === 'object') memo.apag = g.apag; if (Array.isArray(g.mkOff)) memo.mkOff = g.mkOff; if (g.merc === false) memo.merc = false; }
} catch { /* sem armazenamento */ }

export default function Mapa() {
  /* ao entrar no mapa: apaga camada e filtro da concorrência se a pessoa ficou fora mais que o prazo, e marca a visita */
  const entrou = useRef(false);
  if (!entrou.current) { entrou.current = true; mpExpirar(); mpVisto(); }
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') mpVisto(); }, 15000);
    const sai = () => mpVisto();
    window.addEventListener('pagehide', sai);
    return () => { clearInterval(t); window.removeEventListener('pagehide', sai); mpVisto(); };
  }, []);
  const { empresa, edita } = useSessao();
  const toast = useToast();
  const navegar = useNavigate();
  const loc = useLocation();
  const { busca } = useOutletContext<ContextoMoldura>();
  const segs = (useParams()['*'] || '').split('/'), codigoUrl = segs[0] || null;
  /* /mapa/A123/ficha: a ficha completa na gaveta da direita, sobre o mapa (proto_tabela.js › tgavAbrir, tgavPosMapa) */
  const gav = !!codigoUrl && segs[1] === 'ficha';
  const q = useQuery({ queryKey: ['mapa', empresa?.id], enabled: !!empresa, queryFn: () => carregar(empresa!.id) });
  const fases: Fase[] = q.data?.fases ?? [];
  const todos: TerrenoMapa[] = q.data?.terrenos ?? [];

  const [f, setF] = useState(memo.f);
  const [e, setE] = useState(memo.e);
  const [arv, setArv] = useState(memo.arv);
  const [apag, setApag] = useState<Apag>(memo.apag);
  /* a legenda começa fechada e lembra se ficou aberta ou fechada (bkm-terrenos-legenda; pedido do Moisés, 5/nov/2026) */
  const [leg, setLeg] = useState(() => { if (memo.leg != null) return memo.leg; try { return localStorage.getItem(LG_AKEY) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(LG_AKEY, leg ? '1' : ''); } catch { /* sem armazenamento */ } }, [leg]);
  /* a legenda aberta fecha sozinha depois de 1 s sem o mouse em cima nem o foco do teclado dentro; o olhinho ao lado do título
     a fixa (guardado no navegador, bkm-terrenos-legenda-fixa; pedido do Moisés, 5/nov/2026) */
  const [lgFixa, setLgFixa] = useState(() => { try { return localStorage.getItem(LG_FKEY) === '1'; } catch { return false; } });
  const legEl = useRef<HTMLDetailsElement>(null), lgSobre = useRef(false), lgT = useRef<ReturnType<typeof setTimeout>>(), lgFixaR = useRef(lgFixa);
  lgFixaR.current = lgFixa;
  const lgAgendar = useCallback(() => {
    clearTimeout(lgT.current);
    if (TOQUE()) return; // no celular, só pelo toque
    /* fechada, abre sozinha com o mouse parado em cima dela por 0,75 s (pedido do Moisés, 5/nov/2026) */
    const d0 = legEl.current;
    if (d0 && !d0.open && lgSobre.current) { lgT.current = setTimeout(() => { const d = legEl.current; if (d && !d.open && lgSobre.current) d.open = true; }, 750); return; }
    const pode = () => { const d = legEl.current; return !!d && d.open && !lgFixaR.current && !lgSobre.current && !d.querySelector(':focus-visible'); };
    if (!pode()) return;
    lgT.current = setTimeout(() => { if (pode()) legEl.current!.open = false; }, 1000);
  }, []);
  function fixarLeg(v: boolean) { setLgFixa(v); lgFixaR.current = v; try { localStorage.setItem(LG_FKEY, v ? '1' : ''); } catch { /* sem armazenamento */ } lgAgendar(); }
  useEffect(() => { lgAgendar(); return () => clearTimeout(lgT.current); }, [lgAgendar]);
  const [selId, setSelId] = useState<string | null>(null);
  const [largura, setLargura] = useState(larguraGuardada);
  const [menu, setMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null);
  const [cheia, setCheia] = useState(false);
  const [sv, setSv] = useState(false);
  const [semMapa, setSemMapa] = useState<string | null>(null);
  const [motorPronto, setMotorPronto] = useState(false);
  const [busEnd, setBusEnd] = useState('');
  const [res, setRes] = useState<{ nome: string; lat: number; lng: number }[] | null>(null);
  /* busca recolhida: só o botão redondo com a lupa; a lupa abre, a seta à direita fecha, e vazia, sem o foco e sem o mouse
     em cima por 3 s, fecha sozinha (pedido do Moisés, 5/nov/2026) */
  const [busAberta, setBusAberta] = useState(false);
  const busInput = useRef<HTMLInputElement>(null), busSobre = useRef(false), busT = useRef<ReturnType<typeof setTimeout>>();
  const abrirBusca = useCallback((ab: boolean, semFoco?: boolean) => {
    clearTimeout(busT.current); setBusAberta(ab);
    if (ab && !semFoco) setTimeout(() => busInput.current?.focus(), 0);
    else { setBusEnd(''); setRes(null); busSobre.current = false; busInput.current?.blur(); }
  }, []);
  const busAgendar = useCallback(() => {
    clearTimeout(busT.current);
    if (TOQUE()) return;
    const pode = () => { const i = busInput.current; return !!i && !i.closest('.fechada') && !i.value.trim() && document.activeElement !== i && !busSobre.current; };
    if (!pode()) return;
    busT.current = setTimeout(() => { if (pode()) abrirBusca(false); }, 3000);
  }, [abrirBusca]);
  useEffect(() => () => clearTimeout(busT.current), []);
  const [resMsg, setResMsg] = useState('');
  const [euBusca, setEuBusca] = useState(false);
  const [camada, setCamada] = useState<Camada | null>(memo.camada);
  const [rdLeg, setRdLeg] = useState(memo.rdLeg ?? innerWidth > 899);
  const [setor, setSetor] = useState<number | null>(null);
  const [setOk, setSetOk] = useState(!!setores());
  const [setErro, setSetErro] = useState(false);
  const [met, setMet] = useState<Camada | null>(null);
  const [mf, setMf] = useState<Filtro>(memo.mf);
  const [merc, setMerc] = useState(memo.merc);
  const [mkOff, setMkOff] = useState<string[]>(memo.mkOff);
  const [mkArv, setMkArv] = useState(memo.mkArv);
  const [mkOk, setMkOk] = useState(!!mercado());
  const [mkErro, setMkErro] = useState(false);
  const [mfAberto, setMfAberto] = useState(false);
  const [mkBox, setMkBox] = useState<string | null>(null);
  const [mkDest, setMkDest] = useState<string | null>(null);
  const [mkTab, setMkTab] = useState<string | null>(null);
  const mkAbertoEm = useRef(0);
  Object.assign(memo, { f, e, arv, apag, leg, camada, rdLeg, mf, merc, mkOff, mkArv });
  useEffect(() => { try { localStorage.setItem(MP_MFKEY, JSON.stringify(mf)); } catch { /* sem armazenamento */ } }, [mf]);
  useEffect(() => { try { localStorage.setItem(MP_CKEY, camada ?? ''); } catch { /* sem armazenamento */ } }, [camada]);
  useEffect(() => { try { localStorage.setItem(MP_LGKEY, JSON.stringify({ apag, mkOff, merc })); } catch { /* sem armazenamento */ } }, [apag, mkOff, merc]);

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

  /* seleção no endereço: /mapa/A123; com a gaveta aberta, outro terreno troca a gaveta e o clique no vazio não fecha */
  const abrirGav = useCallback((id: string) => {
    const t = todos.find((x) => x.id === id);
    if (!t) return;
    setSelId(id); setMkBox(null);
    navegar(`/mapa/${t.codigo}/ficha`, { replace: gav });
  }, [todos, navegar, gav]);
  const selecionar = useCallback((id: string | null) => {
    if (gav) { if (id) abrirGav(id); return; }
    setSelId(id);
    if (id) setMkBox(null);
    const t = id ? todos.find((x) => x.id === id) : null;
    navegar(t ? `/mapa/${t.codigo}` : '/mapa', { replace: true });
  }, [todos, navegar, gav, abrirGav]);

  /* motor do Google: cria uma vez por visita à página */
  const ganchos = useRef({ mk: (_: string) => {}, pino: (_: string) => {}, vazio: (_a: number, _b: number) => {}, duplo: (_a: number, _b: number, _c: EventTarget | null) => {},
    clique: (_a: number, _b: number) => {}, mover: () => {}, editar: (_: string) => {}, gp: null as GestosPonto | null });

  /* ---------- desenho da poligonal do terreno novo ----------
     Desktop sem barra (decisão do Moisés, 4/nov/2026): só um aviso passageiro ao começar; Enter ou dois cliques no mapa salvam,
     Esc ou dois cliques fora do mapa cancelam, Ctrl+Z desfaz; o menu do ponto (clique direito ou dois cliques nele) traz
     Adicionar ponto depois, Excluir ponto, Desfazer e Cancelar desenho. */
  const [des, setDes] = useState<P[] | null>(null);
  /* régua (pedido do Moisés, 5/nov/2026; proto_mercado.js › rgAbrir, rgClique): botão no canto, acima da minha localização (e no menu
     dos três pontinhos), azul enquanto ligada, e vale até ser desligada. Cada clique marca um ponto e mede o caminho; clicar no primeiro
     ponto (com 3 ou mais) fecha a forma e mede a área, e o clique seguinte começa outra medida. Backspace apaga o último ponto, Del ou Esc
     apagam o desenho (sem desenho, desligam); com ela ligada o cursor do mapa é a seta; clique direito num ponto: Excluir ponto. */
  const [rg, setRg] = useState<{ pts: P[]; fechado: boolean } | null>(null);
  const rgR = useRef(rg);
  rgR.current = rg;
  const [rgMenu, setRgMenu] = useState<{ i: number; x: number; y: number } | null>(null);
  const rgMenuEm = useRef(0);
  const [vSel, setVSel] = useState<number | null>(null);
  const [vMenu, setVMenu] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const hist = useRef<P[][]>([]);
  const marcas = useRef({ toque: 0, ponto: 0, inicio: 0, cliqueN: 1, pdAnt: null as { t: number; x: number; y: number } | null, pdUlt: null as { t: number; x: number; y: number } | null });
  const desR = useRef(des);
  desR.current = des;
  /* edição da poligonal de um terreno (proto_mod.js › editarPoligonal, concluirDesenho): os pontos vão para o rascunho; dois cliques
     sobre a poligonal entram; arrastar move o ponto; clique direito ou dois cliques num ponto abrem o menu dele (com Desfazer e
     Cancelar edição); clique no mapa fora da poligonal, dois cliques no mapa ou Enter salvam; clique fora do mapa ou Esc cancelam */
  const [ed, setEd] = useState<{ id: string; orig: P[] } | null>(null);
  /* "Selecionar lotes" na edição (pedido do Moisés, 6/nov/2026; só em São Paulo): o mapa de lotes da prefeitura das quadras da
     poligonal; os lotes marcados viram a poligonal em edição (a soma deles), que Concluir salva. Os SQLs não entram no terreno. */
  const [lgEd, setLgEd] = useState(false);
  const [lgSqls, setLgSqls] = useState<string[]>([]);
  useEffect(() => {
    if (!lgEd) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setLgEd(false); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [lgEd]);
  /* "Selecionar lotes": como no cadastro, os lotes marcados passam a ser o terreno (SQLs e poligonal; novo/trocarSqls.ts) */
  async function lgAbrir() {
    const e0 = edR.current;
    if (!e0) return;
    const { data } = await supabase.from('inscricoes_municipais').select('inscricao_norm').eq('terreno_id', e0.id);
    setLgSqls(((data ?? []) as { inscricao_norm: string }[]).map((x) => x.inscricao_norm));
    setLgEd(true);
  }
  async function lotesEscolhidos(marc: LoteSql[]) {
    setLgEd(false);
    marcas.current.inicio = Date.now();
    const e0 = edR.current;
    if (!e0 || !empresa) return;
    if (!marc.length) { toast('Nenhum lote marcado: o terreno continua como estava.'); return; }
    desSair();
    const r = await trocarSqls(e0.id, empresa.id, marc, toast);
    const att = () => { qc.invalidateQueries({ queryKey: ['mapa'] }); qc.invalidateQueries({ queryKey: ['ficha'] }); qc.invalidateQueries({ queryKey: ['ficha-lotes'] }); };
    att();
    if (r) empilhar({ rotulo: 'lotes do terreno', fazer: async () => { const ok = await r.desfazer(); att(); return ok; }, refazer: async () => { const ok = await r.refazer(); att(); return ok; } });
  }
  const edR = useRef(ed);
  edR.current = ed;
  const qc = useQueryClient();
  const nvSt = useNovo();
  const geoCons = useConsultaGeo();
  function desComecar(p0?: P) {
    hist.current = []; setVSel(null); setVMenu(false); setMenu(null); setMkBox(null); setSetor(null); setRg(null);
    if (selId) selecionar(null);
    motor.current?.lugarFechar();
    setDes(p0 ? [p0] : []);
    marcas.current.inicio = Date.now();
    if (!TOQUE()) toast(p0 ? 'Primeiro ponto marcado. Clique nos outros cantos; Enter, dois cliques ou Concluir salvam; Esc cancela.'
      : 'Procure o endereço na barra do mapa e clique em cada canto do terreno. Enter, dois cliques ou Concluir salvam; Esc cancela.');
  }
  const fut = useRef<P[][]>([]); /* o que o Ctrl+Z desfez no desenho, para o Ctrl+Y refazer */
  const copia = () => (desR.current || []).map((x) => [x[0], x[1]] as P);
  function desGuardar() { hist.current.push(copia()); if (hist.current.length > 60) hist.current.shift(); fut.current = []; }
  function desDesfazer() { const h = hist.current; if (!h.length) return false; fut.current.push(copia()); setDes(h.pop()!); setVSel(null); setVMenu(false); return true; }
  function desRefazer() { const f = fut.current; if (!f.length) return false; hist.current.push(copia()); setDes(f.pop()!); setVSel(null); setVMenu(false); return true; }
  function desSair() { setDes(null); setEd(null); hist.current = []; fut.current = []; setVSel(null); setVMenu(false); }
  function desCancelar() { const e0 = edR.current; desSair(); toast(e0 ? 'Edição cancelada, poligonal sem mudanças.' : 'Desenho cancelado.'); }
  const sp = (id: string) => /^s[ãa]o paulo$/i.test(todos.find((x) => x.id === id)?.municipio?.trim() ?? '');
  function edComecar(id: string) {
    if (!edita || desR.current || rgR.current) return;
    const t = todos.find((x) => x.id === id), p = t?.poly;
    if (!p || p.length < 3) return;
    hist.current = []; setVSel(null); setVMenu(false); setMenu(null); setMkBox(null); setSetor(null);
    motor.current?.lugarFechar();
    setEd({ id, orig: p.map((q) => [q[0], q[1]] as P) });
    setDes(p.map((q) => [q[0], q[1]] as P));
    marcas.current.inicio = Date.now();
    motor.current?.enquadrar(p.map((q) => ({ lat: q[0], lng: q[1] })), 19);
    if (!TOQUE()) toast('Editando a poligonal: arraste os pontos; clique direito num ponto para mais opções. Enter, dois cliques, clique fora dela ou Concluir salvam; Esc cancela.');
  }
  /* grava a poligonal: o pino vai para o centro dela (pedido do Moisés, 24/out/2026); a área da poligonal é calculada no banco */
  async function gravarPoly(id: string, p: P[]) {
    const { data: t, error: e1 } = await supabase.from('terrenos').select('versao,precisao_localizacao').eq('id', id).single();
    if (e1 || !t) { toast(e1?.message ?? 'Terreno não encontrado.', true); return false; }
    const c = centroPoly(p), d: Record<string, unknown> = { poligono_geojson: geojson(fixa(p)), latitude: +c[0].toFixed(7), longitude: +c[1].toFixed(7) };
    if (!t.precisao_localizacao || t.precisao_localizacao === 'nao_informada') d.precisao_localizacao = 'aproximada';
    const { error } = await supabase.rpc('salvar_terreno', { p_terreno: id, p_versao: t.versao, p_dados: d });
    if (error) { toast(error.message, true); return false; }
    qc.invalidateQueries({ queryKey: ['mapa'] });
    qc.invalidateQueries({ queryKey: ['ficha'] });
    return true;
  }
  async function edSalvar(p: P[]) {
    const e0 = edR.current!;
    desSair();
    const fx = (q: P[]) => JSON.stringify(fixa(q));
    if (fx(p) === fx(e0.orig)) { toast('Edição encerrada, sem mudanças.'); return; }
    if (!(await gravarPoly(e0.id, p))) return;
    toast(`Poligonal salva: ${m2(Math.round(areaPoly(p) || 0))}.`);
    empilhar({ rotulo: 'ajuste na poligonal', fazer: () => gravarPoly(e0.id, e0.orig), refazer: () => gravarPoly(e0.id, p) });
  }
  function desSalvar() {
    const p = desR.current || [];
    if (!desR.current) return;
    if (p.length < 3) { toast('Marque pelo menos 3 pontos.', true); return; }
    if (edR.current) { edSalvar(p); return; }
    desSair();
    /* a poligonal desenhada é o passo 1 do cadastro: a janela do Novo terreno abre com ela */
    if (empresa) poligonal(p, 'mapa', empresa.id);
  }
  function vSelecionar(i: number) { setVSel(i); setVMenu(true); marcas.current.toque = Date.now(); }
  function vFechar() { setVMenu(false); setVSel(null); }
  function vAcao(a: 'v-depois' | 'v-excluir' | 'v-desfazer' | 'v-cancelar') {
    marcas.current.toque = Date.now();
    const i = vSel, p = (des || []).map((x) => [x[0], x[1]] as P);
    if (a === 'v-desfazer') { if (!desDesfazer()) vFechar(); return; }
    if (a === 'v-cancelar') { desCancelar(); return; }
    if (i == null) return;
    if (a === 'v-excluir' && ed && p.length <= 3) { toast('A poligonal precisa de pelo menos 3 pontos.', true); vFechar(); return; }
    if (a === 'v-excluir') { desGuardar(); p.splice(i, 1); setDes(p); vFechar(); toast(`Ponto ${i + 1} excluído.`); return; }
    if (p.length < 2 || (i === p.length - 1 && p.length < 3)) { vFechar(); return; }
    desGuardar();
    const b = p[(i + 1) % p.length];
    p.splice(i + 1, 0, [(p[i][0] + b[0]) / 2, (p[i][1] + b[1]) / 2]);
    setDes(p); setVMenu(false); setVSel(i + 1);
    toast(`Ponto ${i + 2} adicionado. Arraste-o para o lugar.`);
    setTimeout(() => setVSel((v) => (v === i + 1 && !vMenuR.current ? null : v)), 2500);
  }
  const vMenuR = useRef(vMenu);
  vMenuR.current = vMenu;
  function rgAbrir() {
    if (des) return;
    if (rg) { setRg(null); return; }
    setMenu(null); setMkBox(null); setSetor(null); motor.current?.lugarFechar();
    if (selId) selecionar(null);
    setRg({ pts: [], fechado: false });
    toast(TOQUE() ? 'Toque no mapa para marcar os pontos.' : 'Clique no mapa para marcar os pontos e no primeiro ponto para medir a área. Backspace apaga o último ponto; Del ou Esc apagam o desenho e, sem desenho, desligam a régua.');
  }
  /* apaga um ponto; a forma fechada com menos de 3 volta a ser linha */
  function rgExcluir(i: number) {
    const r = rgR.current;
    if (!r || !r.pts[i]) return;
    const pts = r.pts.filter((_, k) => k !== i);
    setRg({ pts, fechado: r.fechado && pts.length > 2 });
  }
  function rgDesfazer() { if (!rg?.pts.length) return; setRg(rg.fechado ? { ...rg, fechado: false } : { pts: rg.pts.slice(0, -1), fechado: false }); }
  ganchos.current.clique = (lat, lng) => {
    const mm = marcas.current;
    if (rg) {
      if (Date.now() - rgMenuEm.current < 400) return; /* o clique que fechou o menu do ponto não marca outro */
      const a = mm.pdAnt, b = mm.pdUlt;
      if (!TOQUE() && (mm.cliqueN >= 2 || (a && b && b.t - a.t < 400 && Math.hypot(b.x - a.x, b.y - a.y) < 8))) return; /* o segundo clique de um duplo clique não marca outro ponto */
      setRg({ pts: [...(rg.fechado ? [] : rg.pts), [lat, lng]], fechado: false });
      return;
    }
    if (!des) return;
    const agora = Date.now();
    if (agora - mm.toque < 300) return; /* o toque foi num ponto, não no mapa */
    /* editando: o clique no mapa fora da poligonal salva; dentro, só fecha o menu do ponto */
    if (ed) { if (vMenu) { vFechar(); return; } if (agora - mm.inicio > 500 && !dentroPoly(lat, lng, des)) desSalvar(); return; }
    const a = mm.pdAnt, b = mm.pdUlt, repetido = a && b && b.t - a.t < 400 && Math.hypot(b.x - a.x, b.y - a.y) < 8;
    if (!TOQUE() && (mm.cliqueN >= 2 || repetido)) return; /* segundo clique de um duplo clique: não marca ponto, o duplo clique salva */
    if (vMenu) { vFechar(); return; }
    desGuardar();
    const p = des.map((x) => [x[0], x[1]] as P), q: P = [lat, lng];
    if (p.length < 3) p.push(q);
    else { /* entra no lado da poligonal que menos aumenta o contorno (no desenho em sequência, equivale a seguir em frente) */
      const d = (u: P, v: P) => Math.hypot(u[0] - v[0], (u[1] - v[1]) * Math.cos((u[0] * Math.PI) / 180));
      let melhor = p.length, custo = Infinity;
      p.forEach((u, k) => { const v = p[(k + 1) % p.length], c = d(u, q) + d(q, v) - d(u, v); if (c < custo) { custo = c; melhor = k + 1; } });
      p.splice(melhor, 0, q);
    }
    mm.ponto = agora;
    setDes(p);
  };
  ganchos.current.gp = {
    toque: () => { marcas.current.toque = Date.now(); },
    menu: (i) => vSelecionar(i),
    /* no desenho, o primeiro clique do duplo clique acabou de criar este ponto: o duplo clique salva, não abre o menu */
    duplo: (i) => { if (!TOQUE() && Date.now() - marcas.current.ponto < 700) desSalvar(); else vSelecionar(i); },
    arrastando: () => setVMenu(false),
    arrastado: (i, lat, lng) => { desGuardar(); const p = (des || []).map((x) => [x[0], x[1]] as P); p[i] = [lat, lng]; setDes(p); vFechar(); marcas.current.toque = Date.now(); },
  };
  const gp = useRef<GestosPonto>({
    toque: () => ganchos.current.gp!.toque(), menu: (i) => ganchos.current.gp!.menu(i), duplo: (i) => ganchos.current.gp!.duplo(i),
    arrastando: () => ganchos.current.gp!.arrastando(), arrastado: (i, a, b) => ganchos.current.gp!.arrastado(i, a, b),
  }).current;
  /* o card da concorrência fecha quando o mapa se move, menos fixado no olhinho (pedido do Moisés, 5/nov/2026) */
  ganchos.current.mover = () => { if (mkBox && !mkFixa() && Date.now() - mkAbertoEm.current > 350) setMkBox(null); };
  /* no desktop, o clique no pino ou na poligonal abre a ficha na gaveta; no celular, seleciona (o cartão) */
  ganchos.current.pino = (id) => { setMenu(null); setMkBox(null); if (innerWidth >= 900 && !des && !rg) abrirGav(id); else selecionar(id); };
  ganchos.current.vazio = (lat, lng) => {
    setMenu(null);
    if (selId) selecionar(null);
    if (mkBox && !mkFixa() && Date.now() - mkAbertoEm.current > 350) setMkBox(null);
    /* com a camada por setor ligada, o clique abre o quadro do setor */
    if (camada && setores()) { const i = setorEm(lat, lng); setSetor(i); if (i != null) setMkBox(null); }
  };
  ganchos.current.editar = (id) => { if (!TOQUE() && !rgR.current && !desR.current) edComecar(id); };
  ganchos.current.duplo = (lat, lng, alvo) => {
    if (!edita || des || rg || TOQUE()) return;
    const el = alvo as HTMLElement | null;
    if (el?.closest?.('.mp-barra,.mp-ctrl,.mp-legenda,.mp-cartao,.mp-ctx,button,a,input')) return;
    setMenu(null);
    desComecar([lat, lng]);
  };
  useEffect(() => {
    let vivo = true;
    const recusa = () => { setSemMapa('O Google recusou a chave do mapa (domínio ou API não liberados).'); };
    window.addEventListener('bkm-gmaps-recusada', recusa);
    carregarGoogle().then((ok) => {
      if (!vivo || !mapaEl.current) return;
      if (!ok || googleRecusado()) { setSemMapa(googleRecusado() ? 'O Google recusou a chave do mapa (domínio ou API não liberados).' : 'Não foi possível carregar o mapa do Google. Verifique a conexão e recarregue a página.'); return; }
      enquadrarPend.current = !vista;
      motor.current = new Motor(mapaEl.current, base, {
        pino: (id) => ganchos.current.pino(id),
        vazio: (a, b) => ganchos.current.vazio(a, b),
        duplo: (a, b, c) => ganchos.current.duplo(a, b, c),
        menu: (x, y, lat, lng) => { if (edita && !desR.current && !rgR.current) setMenu({ x, y, lat, lng }); },
        clique: (a, b) => ganchos.current.clique(a, b),
        editar: (id) => ganchos.current.editar(id),
        movendo: (on) => { setMovendo(on); if (on) ganchos.current.mover?.(); },
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
    /* a poligonal em edição sai do desenho: no lugar dela fica o rascunho com os pontos */
    m.desenhar(visiveis.map(pinoDe).filter((x): x is Pino => !!x).map((x) => (x.id === ed?.id ? { ...x, poly: null } : x)), selId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motorPronto, visiveis, pinoDe, ed?.id]);
  useEffect(() => { motor.current?.marcar(selId); }, [selId]);
  /* desenho: modo do mapa, rascunho e o pedido vindo do passo 1 do Novo terreno */
  useEffect(() => { if (motorPronto) motor.current?.setModo(!!des || !!rg); }, [motorPronto, des, rg]);
  useEffect(() => { if (motorPronto) motor.current?.cursorSeta(!!rg); }, [motorPronto, !!rg]);
  useEffect(() => {
    if (motorPronto) motor.current?.regua(rg?.pts || [], !!rg?.fechado, () => { const r = rgR.current; if (r && r.pts.length > 2 && !r.fechado) setRg({ ...r, fechado: true }); },
      (i, x, y) => setRgMenu({ i, x, y }));
    if (!rg) setRgMenu(null);
  }, [motorPronto, rg]);
  /* o menu do ponto da régua fecha no clique fora dele */
  useEffect(() => {
    if (!rgMenu) return;
    const fora = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement;
      if (t.closest?.('.rg-ctx')) return;
      if (t.closest?.('#mapa')) rgMenuEm.current = Date.now();
      setRgMenu(null);
    };
    document.addEventListener('pointerdown', fora, true);
    return () => document.removeEventListener('pointerdown', fora, true);
  }, [rgMenu]);
  useEffect(() => { if (motorPronto) motor.current?.rascunho(des || [], vSel, !!ed, gp); }, [motorPronto, des, vSel, gp, !!ed]);
  useEffect(() => {
    if (!nvSt.desenho || !motorPronto) return;
    desenhoAtendido();
    desComecar(nvSt.desenho.p0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nvSt.desenho, motorPronto]);
  /* editando, um clique fora do mapa cancela (decisão do Moisés, 24/out/2026); é o clique, não o toque de rolar a página */
  useEffect(() => {
    if (!ed) return;
    const fora = (ev: MouseEvent) => {
      const ar = areaEl.current, t = ev.target as HTMLElement;
      if (Date.now() - marcas.current.inicio < 500 || !ar || !document.contains(t) || ar.contains(t) || t.closest?.('.v-menu,#mp-modo,.toast,#toast,.scrim,.dialog')) return;
      desCancelar();
    };
    document.addEventListener('click', fora, true);
    return () => document.removeEventListener('click', fora, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ed]);
  useEffect(() => {
    if (!des && !rg) return;
    const mm = marcas.current;
    const clique = (ev: MouseEvent) => { mm.cliqueN = ev.detail || 1; };
    const pd = (ev: PointerEvent) => { if (ev.pointerType !== 'mouse') return; mm.pdAnt = mm.pdUlt; mm.pdUlt = { t: Date.now(), x: ev.clientX, y: ev.clientY }; };
    /* dois cliques em qualquer lugar do mapa salvam; dois cliques fora do mapa cancelam (os dois cliques num ponto abrem o menu dele) */
    const duplo = (ev: MouseEvent) => {
      if (!des || TOQUE() || Date.now() - mm.inicio < 500) return; /* este duplo clique é o que acabou de começar o desenho */
      const ar = areaEl.current, t = ev.target as Node;
      const alvo = (document.contains(t) ? t : document.elementFromPoint(ev.clientX, ev.clientY)) as HTMLElement | null;
      if (!ar || !alvo?.closest) return;
      if (alvo.closest('.v-menu,.v-ponto,#mp-modo,.toast,#toast,.scrim,.dialog,input,textarea,select')) return;
      if (ar.contains(alvo)) { if (alvo.closest('.mp-barra,.mp-ctrl,.mp-legenda,.mp-cartao,button,a,summary')) return; ev.preventDefault(); desSalvar(); }
      else desCancelar();
    };
    /* Esc no desenho vem antes dos outros Esc da página: é ele que a pessoa quer desfazer */
    const esc = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || (ev.target as HTMLElement).matches?.('input,textarea,select') || document.querySelector('.mp-ctx,.scrim')) return;
      /* na régua, Esc faz o mesmo que o Del (pedido do Moisés, 5/nov/2026): com desenho, apaga; sem desenho, desliga */
      if (rg) { if (rgMenu) setRgMenu(null); else setRg(rg.pts.length ? { pts: [], fechado: false } : null); } else if (vMenu) vFechar(); else desCancelar();
      ev.preventDefault(); ev.stopImmediatePropagation();
    };
    const tecla = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement;
      if (el.matches?.('input,textarea,select') || document.querySelector('.scrim')) return;
      if (rg) {
        if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z') { rgDesfazer(); ev.preventDefault(); }
        else if (ev.key === 'Delete') { setRgMenu(null); setRg(rg.pts.length ? { pts: [], fechado: false } : null); ev.preventDefault(); }
        else if (ev.key === 'Backspace') { setRgMenu(null); if (rg.pts.length) rgExcluir(rg.pts.length - 1); ev.preventDefault(); }
        return;
      }
      if (ev.key === 'Enter' && !vMenu && !el.closest?.('button,a,summary')) { desSalvar(); ev.preventDefault(); }
      else if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === 'y' || (ev.shiftKey && ev.key.toLowerCase() === 'z'))) { desRefazer(); ev.preventDefault(); }
      else if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z') { desDesfazer(); ev.preventDefault(); }
      else if ((ev.key === 'Delete' || ev.key === 'Backspace') && vSel != null) { vAcao('v-excluir'); ev.preventDefault(); }
    };
    document.addEventListener('click', clique, true);
    document.addEventListener('pointerdown', pd, true);
    document.addEventListener('dblclick', duplo);
    window.addEventListener('keydown', esc, true);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('click', clique, true); document.removeEventListener('pointerdown', pd, true); document.removeEventListener('dblclick', duplo);
      window.removeEventListener('keydown', esc, true); document.removeEventListener('keydown', tecla);
    };
  });
  /* clique fora fecha o que está aberto no mapa (pedido do Moisés, 5/nov/2026; proto_mercado.js › FORA0): a legenda (menos fixada), a escala
     da renda/densidade, a busca, o quadro do lugar do Google e o card da concorrência (menos fixado); o menu dos três pontinhos já fecha
     sozinho. É o clique, não o arraste. Dentro do mapa, o quadro do lugar e o card já fecham pelo clique no mapa. */
  const foraR = useRef({ leg, lgFixa, rdLeg, busAberta, mkBox, abrirBusca });
  foraR.current = { leg, lgFixa, rdLeg, busAberta, mkBox, abrirBusca };
  useEffect(() => {
    let p0: { x: number; y: number; t: Element } | null = null;
    const baixo = (ev: PointerEvent) => { p0 = { x: ev.clientX, y: ev.clientY, t: ev.target as Element }; };
    const cima = (ev: PointerEvent) => {
      const p = p0; p0 = null;
      if (!p || Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 6 || !p.t?.closest || p.t.closest('.toast,#toast,.scrim,.dialog')) return;
      const a = p.t, r = foraR.current;
      if (r.leg && !r.lgFixa && !a.closest('.mp-legenda')) setLeg(false);
      if (r.rdLeg && !a.closest('.rd-leg')) setRdLeg(false);
      if (r.busAberta && !a.closest('.mp-busca')) r.abrirBusca(false);
      if (a.closest('#mapa')) return;
      if (!a.closest('.gm-style-iw,.gm-style-iw-c')) motor.current?.lugarFechar();
      if (r.mkBox && !mkFixa() && !a.closest('#mk-box')) setMkBox(null);
    };
    document.addEventListener('pointerdown', baixo, true); document.addEventListener('pointerup', cima, true);
    return () => { document.removeEventListener('pointerdown', baixo, true); document.removeEventListener('pointerup', cima, true); };
  }, []);
  /* tipo de mapa nos três pontinhos, guardado no navegador (bkm-terrenos-mapa-tipo; sem nada guardado, Satélite, pedido do Moisés de 6/nov/2026); com renda ou densidade ligada,
     Satélite, a menos que a pessoa troque enquanto a camada está ligada (vale só até desligar; pedido do Moisés, 5/nov/2026) */
  const [tipo, setTipo] = useState<Base>(() => { try { return localStorage.getItem(MP_TKEY) === 'mapa' ? 'mapa' : 'satelite'; } catch { return 'satelite'; } });
  const [baseCam, setBaseCam] = useState<Base | null>(null);
  useEffect(() => { setBaseCam(null); }, [camada]);
  const base: Base = camada ? (baseCam ?? 'satelite') : tipo;
  function escolherBase(v: Base) {
    if (camada) { setBaseCam(v); return; }
    setTipo(v); try { localStorage.setItem(MP_TKEY, v); } catch { /* sem armazenamento */ }
  }
  useEffect(() => { motor.current?.setBase(base); }, [base]);

  /* camadas por setor censitário: uma de cada vez; ao ligar, o mapa passa para a visão Mapa e volta ao desligar */
  useEffect(() => {
    if (!camada) return;
    carregarSetores().then(() => setSetOk(true)).catch(() => { setSetErro(true); toast('Não foi possível carregar os setores do IBGE.', true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camada]);
  useEffect(() => { if (motorPronto) motor.current?.camada(camada && setOk ? camada : null); }, [motorPronto, camada, setOk]);
  useEffect(() => { if (motorPronto) motor.current?.contornoSetor(camada ? setor : null); }, [motorPronto, camada, setor]);
  /* concorrência: os empreendimentos do monitor que passam no filtro, sem as situações desligadas na legenda */
  useEffect(() => {
    carregarMercado().then(() => setMkOk(true)).catch(() => setMkErro(true));
  }, []);
  const mkLista = useMemo(() => (mkOk ? mercado()!.emps.filter((x) => mfPassa(mf, x)) : null), [mkOk, mf]);
  const mkEmp = (id: string | null) => (id ? mercado()?.emps.find((x) => x.id === id) ?? null : null);
  useEffect(() => {
    if (!motorPronto || !mkLista) return;
    motor.current?.mercado(merc ? mkLista.filter((x) => mkVisivel(x, mkOff)) : [], (id) => ganchos.current.mk(id));
  }, [motorPronto, mkLista, merc, mkOff]);
  useEffect(() => {
    if (!motorPronto) return;
    const d = mkEmp(mkDest);
    motor.current?.destaque(d && merc && mkVisivel(d, mkOff) ? d : null, (id) => ganchos.current.mk(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motorPronto, mkDest, merc, mkOff, mkOk]);
  /* card aberto que sai do filtro ou da legenda fecha */
  useEffect(() => {
    const b = mkEmp(mkBox);
    if (mkBox && (!merc || !b || !mfPassa(mf, b) || !mkVisivel(b, mkOff))) setMkBox(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mf, merc, mkOff]);
  ganchos.current.mk = (id) => { mkAbertoEm.current = Date.now(); setMenu(null); setSetor(null); setMkBox(id); setMkDest(id); if (selId) selecionar(null); };

  function ligarCamada(k: Camada | null) {
    if (k === camada) return;
    if (!k) setSetor(null);
    setCamada(k);
  }

  /* a gaveta segue o endereço: o terreno dela fica selecionado e vai para o meio do pedaço livre do mapa */
  useEffect(() => {
    if (!gav || !q.data) return;
    const t = todos.find((x) => x.codigo === codigoUrl!.toUpperCase());
    if (!t) return;
    setSelId(t.id);
    const m = motor.current;
    if (!m || !motorPronto || t.lat == null || innerWidth < 900) return;
    const id = setTimeout(() => {
      const mp = mapaEl.current?.getBoundingClientRect(), g = document.getElementById('tgav')?.getBoundingClientRect();
      if (!mp || !g) return;
      m.mapa.panTo({ lat: t.lat, lng: t.lng });
      const livre = Math.max(0, mp.right - g.left);
      if (livre > 0) m.mapa.panBy(Math.round(livre / 2), 0);
    }, 120);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gav, codigoUrl, q.data, motorPronto]);

  /* primeira entrada: enquadra todos; com /mapa/A123, foca o terreno */
  useEffect(() => {
    const m = motor.current;
    if (!m || !motorPronto || !q.data) return;
    const alvo = codigoUrl ? todos.find((t) => t.codigo === codigoUrl.toUpperCase()) : null;
    const centro = (loc.state as { centro?: { lat: number; lng: number; z: number } } | null)?.centro;
    if (alvo) { setSelId(alvo.id); const p = pinoDe(alvo); if (centro) { m.mapa.setCenter({ lat: centro.lat, lng: centro.lng }); m.mapa.setZoom(Math.max(centro.z, 15)); } else if (p) m.focar(p); }
    else if (enquadrarPend.current) m.enquadrar(todos.filter((t) => t.lat != null).map((t) => ({ lat: t.lat!, lng: t.lng! })), 15);
    enquadrarPend.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motorPronto, q.data]);

  /* terreno recém-cadastrado (/mapa/A123 com focar): seleciona e enquadra quando ele chega na lista */
  const focarPend = useRef<string | null>(null);
  useEffect(() => { if ((loc.state as { focar?: boolean } | null)?.focar && codigoUrl) focarPend.current = codigoUrl.toUpperCase(); }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = motor.current, c = focarPend.current;
    if (!m || !motorPronto || !c) return;
    const t = todos.find((x) => x.codigo === c);
    if (!t) return;
    focarPend.current = null;
    setSelId(t.id);
    const p = pinoDe(t);
    if (p) m.focar(p);
  });

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
    /* o bonequinho do Street View fica sempre 64 px acima do pé do mapa: reserva o lugar dele mesmo antes de o Google desenhá-lo
       ou enquanto o mapa muda de tamanho (tela cheia), senão a tela cheia cai em cima dele */
    let topo = motor.current && !a.classList.contains('sv-on') ? ar.bottom - 64 : ar.bottom;
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
      if (mkBox) { setMkBox(null); ev.preventDefault(); return; }
      if (motor.current?.svFechar()) { ev.preventDefault(); return; }
      if (motor.current?.lugarFechar()) { ev.preventDefault(); return; }
      if (document.body.classList.contains('mp-cheia') && !document.fullscreenElement) { telaCheia(false); ev.preventDefault(); }
    };
    const fora = (ev: PointerEvent) => { if (menu && !(ev.target as HTMLElement).closest('.mp-ctx')) setMenu(null); };
    document.addEventListener('keydown', k);
    document.addEventListener('pointerdown', fora, true);
    return () => { document.removeEventListener('keydown', k); document.removeEventListener('pointerdown', fora, true); };
  }, [menu, telaCheia, setor, mkBox]);

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
        <div className="mp-it-t"><div className="t1">{t.nome}</div><div className="t2">{ad ? `${num(ad)} m²` : 'Área não informada'} · {nm}{t.lat == null && <> · <span style={{ color: 'var(--terracota)' }}>sem localização</span></>}</div>
          {geoCons?.terreno === t.id && <span className="chip blue lg-cons">Consultando o GeoSampa: {geoCons.feitos} de {geoCons.total}</span>}</div>
        <button className="iconbtn mp-lupa" title="Ver ficha" aria-label={`Ver ficha de ${t.nome}`} onClick={(ev) => { ev.stopPropagation(); abrirGav(t.id); }}><Bi n="busca" s={22} /></button>
        {cartao && <button className="iconbtn mp-lupa mp-fx" title="Fechar" aria-label="Fechar" onClick={(ev) => { ev.stopPropagation(); selecionar(null); }}><Ic n="close" s={22} /></button>}
        {s && t.lat != null && motorPronto && (
          <div className="mp-it-a">{edita && t.poly && t.poly.length > 2 && !des && <button className="linkbtn" onClick={(ev) => { ev.stopPropagation(); if (cartao) selecionar(null); edComecar(t.id); }}>Editar poligonal</button>}
            <button className="linkbtn" onClick={(ev) => { ev.stopPropagation(); const p = pinoDe(t); if (p) motor.current?.streetView(p); }}>Street View</button></div>
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
          <form className={`mp-busca${busAberta ? '' : ' fechada'}`} role="search" onSubmit={(ev) => { ev.preventDefault(); clearTimeout(buscaT.current); rodarBusca(busEnd, true); }}
            onPointerEnter={(ev) => {
              if (ev.pointerType !== 'mouse') return; busSobre.current = true; clearTimeout(busT.current);
              /* fechada, abre sozinha com o mouse parado na lupa por 0,75 s, sem pegar o foco (pedido do Moisés, 5/nov/2026) */
              if (!busAberta && !TOQUE()) busT.current = setTimeout(() => { if (busSobre.current) abrirBusca(true, true); }, 750);
            }}
            onPointerLeave={() => { busSobre.current = false; busAgendar(); }}>
            <button type="button" className="mp-busca-i" tabIndex={busAberta ? -1 : 0} aria-label="Buscar endereço" aria-expanded={busAberta}
              onClick={() => { if (!busAberta) abrirBusca(true); else busInput.current?.focus(); }}><Ic n="search" s={20} /></button>
            <input id="mp-end" ref={busInput} name="q" type="search" placeholder="Buscar endereço" aria-label="Buscar endereço no mapa" autoComplete="off" value={busEnd}
              tabIndex={busAberta ? undefined : -1} onFocus={() => clearTimeout(busT.current)} onBlur={() => setTimeout(busAgendar, 0)}
              onChange={(ev) => {
                const v = ev.target.value; setBusEnd(v); buscaAtual.current = v; clearTimeout(buscaT.current);
                if (v.trim().length < 3) { setRes(null); return; }
                buscaT.current = setTimeout(() => rodarBusca(v, false), 250);
              }} />
            <button type="button" className="mp-busca-x" aria-label="Fechar a busca" onClick={() => abrirBusca(false)}><Ic n="back" s={20} /></button>
            <div id="mp-res" className="mp-res" role="listbox" hidden={res == null}>
              {res && (res.length ? res.map((x, i) => (
                <button key={i} type="button" role="option" aria-selected={false} onClick={() => irPara(x)}><Bi n="mapa" s={18} /><span>{x.nome}</span></button>
              )) : <div className="hint">{resMsg || 'Nada encontrado.'}</div>)}
            </div>
          </form>
          <BotaoMais f={mf} base={base} abrirConc={() => { setMfAberto(true); setMkBox(null); }} escolherBase={escolherBase}
            camada={camada} alternarCamada={(k) => ligarCamada(camada === k ? null : k)} regua={rgAbrir} />
        </div>
        <div id="mp-modo" className="mp-modo" aria-live="polite">{rg && (() => {
          const n = rg.pts.length, ar = rg.fechado ? reguaArea(rg.pts) : null;
          return <>
            <span className="mp-q mp-fina rg-b">{n < 2 ? 'Régua: clique no mapa para medir' : `${rg.fechado ? 'Perímetro' : 'Distância'} ${reguaM(reguaTotal(rg.pts, rg.fechado))}${ar ? ` · área ${reguaA(ar)}` : ''}`}</span>
            <button className="btn sm text" disabled={!n} onClick={rgDesfazer}>Desfazer</button>
            <button className="btn sm text" disabled={!n} onClick={() => setRg({ pts: [], fechado: false })}>Limpar</button>
            <button className="btn sm primary" onClick={() => setRg(null)}>Sair</button>
          </>;
        })()}{des && ed && TOQUE() && <>
          {/* edição no celular: só Cancelar e Concluir, sem texto nem faixa (decisão do Moisés, 24/out/2026); no desktop, nada */}
          {sp(ed.id) && <button className="btn sm" style={{ pointerEvents: 'auto' }} onClick={lgAbrir}>Selecionar lotes</button>}
          <button className="btn sm" style={{ pointerEvents: 'auto' }} onClick={desCancelar}>Cancelar</button>
          <button className="btn sm primary" style={{ pointerEvents: 'auto' }} onClick={desSalvar}>Concluir</button>
        </>}{des && !ed && TOQUE() && <>
          <span>Desenhando a poligonal do <b>terreno novo</b>: toque no mapa para marcar os vértices.{des.length > 0 && ' Arraste um ponto para ajustá-lo; toque e segure nele para mais opções.'} <span className="mp-q">{des.length} ponto{des.length === 1 ? '' : 's'}{areaPoly(des) ? ` · ${m2(areaPoly(des))}` : ''}</span></span>
          <button className="btn sm text" disabled={!hist.current.length} onClick={desDesfazer}>Desfazer</button>
          <button className="btn sm text" onClick={desCancelar}>Cancelar</button>
          <button className="btn sm primary" disabled={des.length < 3} onClick={desSalvar}>Concluir</button>
        </>}{des && !TOQUE() && <>
          {/* desktop: barra pequena no canto de baixo à direita; a legenda, os botões do canto e os da barra de cima (menos a busca)
              somem enquanto se desenha (styles.css, opção 5 do Moises, 5/nov/2026) */}
          <span className="mp-q mp-fina">{des.length} ponto{des.length === 1 ? '' : 's'}{areaPoly(des) ? ` · ${m2(Math.round(areaPoly(des)!))}` : ''}</span>
          {ed && sp(ed.id) && <button className="btn sm text" onClick={lgAbrir}>Selecionar lotes</button>}
          <button className="btn sm text" onClick={desCancelar}>Cancelar</button>
          <button className="btn sm primary" disabled={des.length < 3} title={des.length < 3 ? 'Marque pelo menos 3 pontos' : 'Salvar a poligonal (Enter)'} onClick={desSalvar}>Concluir</button>
        </>}</div>
        {des && vMenu && vSel != null && des[vSel] && !movendo && motor.current && (
          <MenuPonto area={areaEl.current} px={motor.current.pontoNaTela(des[vSel][0], des[vSel][1])} i={vSel} n={des.length} area2={areaPoly(des) || 0} desfazer={hist.current.length > 0} acao={vAcao} editando={!!ed} />
        )}
        {lgEd && ed && des && empresa && createPortal(
          <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setLgEd(false)}>
            <div className="dialog" role="dialog" aria-modal="true">
              <LotesGeo empresa={empresa.id} L={{ modo: 'ficha', ficha: { codigo: todos.find((x) => x.id === ed.id)?.codigo ?? '', nome: todos.find((x) => x.id === ed.id)?.nome ?? '', poly: des, sqls: lgSqls,
                fechar: () => { marcas.current.inicio = Date.now(); setLgEd(false); }, incluir: lotesEscolhidos } }} />
            </div>
          </div>, document.body
        )}
        <div id="mp-cartao" className="mp-cartao" aria-live="polite">{sel && visiveis.includes(sel) && linha(sel, true)}</div>
        <button type="button" className="mp-cb sv-x" title="Fechar o Street View (Esc)" aria-label="Fechar o Street View" onClick={() => motor.current?.svFechar()}><Ic n="close" s={22} /></button>
        <div id="mp-ctrl" className="mp-ctrl">
          <button type="button" className="mp-cb mp-rg" aria-pressed={!!rg} title="Régua" aria-label="Régua" onClick={rgAbrir}><Ic n="regua" s={22} /></button>
          <button type="button" className={`mp-cb${euBusca ? ' busca' : ''}`} title="Minha localização" aria-label="Centralizar na minha localização" onClick={eu}><Ic n="eu" s={22} /></button>
          <button type="button" className="mp-cb" aria-pressed={cheia} title={cheia ? 'Sair da tela cheia' : 'Tela cheia'} aria-label={cheia ? 'Sair da tela cheia' : 'Tela cheia'} onClick={() => telaCheia(!cheia)}><Ic n={cheia ? 'telaSair' : 'tela'} s={22} /></button>
        </div>
        <details className="mp-legenda" ref={legEl} open={leg} onToggle={(ev) => {
          const d = ev.target as HTMLDetailsElement, o = d.open;
          setLeg(o);
          if (!o && (arv || f || e)) { setArv(false); nivel('', ''); }
          if (!d.matches(':hover')) lgSobre.current = false;
          lgAgendar();
        }} onPointerEnter={(ev) => { if (ev.pointerType !== 'mouse') return; lgSobre.current = true; lgAgendar(); }} onPointerLeave={() => { lgSobre.current = false; lgAgendar(); }}
          onFocus={() => lgAgendar()} onBlur={() => setTimeout(lgAgendar, 0)}>
          <summary><span className="lg-tit">Legenda</span>
            <button type="button" className="lg-fixar" aria-pressed={lgFixa} aria-label={lgFixa ? 'Soltar a legenda' : 'Fixar a legenda aberta'}
              onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); fixarLeg(!lgFixa); }}><Ic n="olho" s={18} /></button>
          </summary>
          <div id="mp-leg" className="mp-leg-l">
            <Legenda fases={fases} todos={todos} f={f} e={e} arv={arv} apag={apag} busca={busca}
              alternarArv={() => { const ab = !arv; setArv(ab); if (!ab && (f || e)) nivel('', ''); }} nivel={nivel} apagar={apagar}
              extra={<>
                <ItensConc lista={mkLista} erro={mkErro} ligada={merc} off={mkOff} arv={mkArv} alternarArv={() => setMkArv(!mkArv)}
                  alternar={() => setMerc(!merc)} alternarSit={(k) => setMkOff(mkOff.includes(k) ? mkOff.filter((x) => x !== k) : [...mkOff, k])} />
              </>} />
          </div>
        </details>
        <div className="mp-aviso">Fundo do mapa indisponível nesta visualização.</div>
        {camada && <LegendaSetor camada={camada} aberta={rdLeg} alternar={setRdLeg} carregado={setOk} erro={setErro} metodologia={setMet} />}
        {camada && setor != null && setores() && <QuadroSetor d={setores()!} i={setor} camada={camada} fechar={() => setSetor(null)} metodologia={setMet} />}
        {mkBox && mkEmp(mkBox) && <CaixaEmp e={mkEmp(mkBox)!} fechar={() => setMkBox(null)} tabela={setMkTab} pausado={!!mkTab} />}
        {rg && rgMenu && rg.pts[rgMenu.i] && (() => {
          const ar = areaEl.current?.getBoundingClientRect();
          const x = rgMenu.x - (ar?.left ?? 0), y = rgMenu.y - (ar?.top ?? 0);
          return (
            <div className="mp-ctx rg-ctx" role="menu" style={{ left: Math.max(8, Math.min((ar?.width ?? 0) - 228, x)), top: Math.max(8, Math.min((ar?.height ?? 0) - 100, y)) }}>
              <div className="v-t">Ponto {rgMenu.i + 1} de {rg.pts.length}</div>
              <button type="button" role="menuitem" className="crit" autoFocus onClick={() => { const i = rgMenu.i; setRgMenu(null); rgExcluir(i); }}>Excluir ponto</button>
            </div>
          );
        })()}
        {menu && (
          <div className="mp-ctx" role="menu" style={{ left: Math.max(8, Math.min((areaEl.current?.clientWidth ?? 0) - 228, menu.x)), top: Math.max(8, Math.min((areaEl.current?.clientHeight ?? 0) - 64, menu.y)) }}>
            <button role="menuitem" autoFocus onClick={() => { const m = menu; setMenu(null); desComecar([m.lat, m.lng]); }}><Ic n="add" s={18} />Novo terreno aqui</button>
          </div>
        )}
      </section>
      {met && <Metodologia camada={met} fechar={() => setMet(null)} />}
      {mfAberto && mkOk && <FiltroConc f={mf} mudar={setMf} fechar={() => setMfAberto(false)} aviso={(m) => toast(m)} />}
      {mkTab && <TabelaEmp id={mkTab} fechar={() => setMkTab(null)} />}
      {gav && <GavetaFicha codigo={codigoUrl!.toUpperCase()} lado={ladoEl.current} fechar={() => navegar(`/mapa/${codigoUrl!.toUpperCase()}`)}
        abrirPagina={(aba) => navegar(`/terrenos/${codigoUrl!.toUpperCase()}${aba === 'geral' ? '' : '/' + aba}`, { state: { de: 'mapa' } })}
        abrirMapa={(lat, lng, z) => { const m = motor.current?.mapa; if (m) { m.setCenter({ lat, lng }); m.setZoom(Math.max(z, 15)); } navegar(`/mapa/${codigoUrl!.toUpperCase()}`); }} />}
    </div>
  );
}

/* legenda em árvore: "Terrenos" abre as fases, a fase abre as etapas e a etapa abre as subetapas, um ramo aberto por vez;
   o nível mais fundo aberto colore os pinos. A bolinha de um item (e a de "Terrenos": todos) liga e desliga tudo que está nele;
   o número não (pedido do Moisés, 5/nov/2026). */
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
    <span className={className} onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); apagar(lv, x.k); }}>{children}</span>
  );
  type X = Item & { n: number };
  const ramo = (x: X, prof: number, ab: boolean, nf: string, ne: string, fora: boolean, lv: string, pai: boolean) => (
    <button key={lv + x.k} type="button" className={`lg-i lg-a${fora ? ' lg-fora' : ''}${off(lv, x.k, pai) ? ' lg-off' : ''}`} style={{ '--p': prof } as React.CSSProperties} aria-expanded={ab} onClick={() => nivel(nf, ne)}>
      <Seta ab={ab} /><Tg lv={lv} x={x} className="lg-tg"><Pin x={x} /></Tg>{x.nome}<span className="n">{x.n}</span>
    </button>
  );
  const folha = (x: X, prof: number, ativo: boolean, nf: string, ne: string, lv: string, pai: boolean) => ativo ? (
    <button key={lv + x.k} type="button" className={`lg-i lg-a${pai ? ' lg-off' : ''}`} style={{ '--p': prof } as React.CSSProperties} aria-pressed={!off(lv, x.k, pai)} onClick={() => apagar(lv, x.k)}>
      <span className="lg-s" /><Pin x={x} />{x.nome}<span className="n">{x.n}</span>
    </button>
  ) : (
    <button key={lv + x.k} type="button" className={`lg-i lg-a lg-fora${off(lv, x.k, pai) ? ' lg-off' : ''}`} style={{ '--p': prof } as React.CSSProperties} onClick={() => nivel(nf, ne)}>
      <span className="lg-s" /><Tg lv={lv} x={x} className="lg-tg"><Pin x={x} /></Tg>{x.nome}<span className="n">{x.n}</span>
    </button>
  );
  const t0 = off('*', 'todos', false), h: React.ReactNode[] = [];
  if (arv) for (const x of nivelItens('', '')) {
    if (!x.desce) { h.push(folha(x, 1, !f, '', '', '|', t0)); continue; }
    const ab = f === x.k, px = t0 || off('|', x.k, false);
    h.push(ramo(x, 1, ab, ab ? '' : x.k, '', !!f && !ab, '|', t0));
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
      <button type="button" className={`lg-i lg-a${t0 ? ' lg-off' : ''}`} style={{ '--p': 0 } as React.CSSProperties} aria-expanded={arv} onClick={alternarArv}>
        <Seta ab={arv} /><span className="lg-poi lg-tg" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); apagar('*', 'todos'); }}><span className="pin-mini lg-nt" /></span>Terrenos<span className="n">{baseT.length}</span>
      </button>
      {h}
      <hr className="lg-sep" />
      {extra}
    </>
  );
}
