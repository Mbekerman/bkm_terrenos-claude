import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, mensagemErro } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Bi, Ic } from '../components/Moldura';
import { carregarGoogle } from '../mapa/google';
import { classe, info, type Fase, type TerrenoMapa } from '../mapa/dados';
import { abrirNovo, escolherKmz, fecharNovo, pedirDesenho, poligonal, atualizarNv, useNovo, voltarPasso1, novoEstado, type Sobre } from './estado';
import { areaPoly, centroPoly, fixa, geojson, lerKmz, m2, nomeRef, normRua, uniaoPoly, type P } from './geo';

// Janela do Novo terreno, com a marcação do protótipo (tools/prototipo/proto_novo.js: nvPasso1Html, nvSobreHtml,
// nvDadosHtml, nvGravar, nvDecidir). Passo 1: a poligonal (desenho no mapa ou KMZ/KML); se outro terreno ocupa parte
// da área, a pergunta do que fazer; passo 2: só o nome de referência. O mapa de lotes da prefeitura entra depois.

const NV_FONTE = { mapa: 'Poligonal desenhada no mapa', kmz: 'Poligonal importada de KMZ/KML' };
const NV_FOLGA = 5;
const num = (v: number, d = 0) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d });

export default function NovoTerreno() {
  const st = useNovo();
  const { empresa, session, edita } = useSessao();
  const toast = useToast();
  const navegar = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const arq = useRef<HTMLInputElement>(null);
  const [gravando, setGravando] = useState(false);

  /* /terrenos/novo abre o passo 1 */
  useEffect(() => { if (loc.pathname === '/terrenos/novo' && !novoEstado().aberto && !novoEstado().nv) abrirNovo(); }, [loc.pathname]);
  /* o endereço acompanha a janela: aberta, /terrenos/novo; fechada, volta à página de baixo */
  const fechar = () => { fecharNovo(); if (loc.pathname === '/terrenos/novo') navegar('/mapa', { replace: true }); };
  useEffect(() => {
    if (!st.aberto) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fechar(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.aberto, loc.pathname]);

  if (!st.aberto || !empresa) return null;
  const nv = st.nv;
  const x = <button className="iconbtn" aria-label="Fechar" onClick={fechar}><Ic n="close" /></button>;

  function desenhar() {
    /* primeiro troca de página (a página Mapa nova é que atende o pedido), depois pede o desenho */
    if (!loc.pathname.startsWith('/mapa')) navegar('/mapa', { replace: loc.pathname === '/terrenos/novo' });
    pedirDesenho();
  }
  async function kmzLido(f: File) {
    try {
      const its = await lerKmz(f), ps = its.filter((i) => i.tipo === 'poligono');
      if (!ps.length) { toast('O arquivo não tem polígono. Desenhe a área no mapa ou importe outro arquivo.', true); return; }
      await carregarGoogle();
      if (ps.length === 1) poligonal(ps[0].pts, 'kmz', empresa!.id, ps[0].nome);
      else escolherKmz(ps);
    } catch (e) { toast(mensagemErro(e), true); }
  }

  /* ---------- passo 1 ---------- */
  let corpo: React.ReactNode;
  if (!nv) {
    corpo = <>
      <div className="dh"><div><h2>Novo terreno</h2><div className="muted" style={{ marginTop: 4 }}>Passo 1 de 2 · Poligonal do terreno</div></div>{x}</div>
      <div className="nv-ops">
        <button type="button" className="nv-op" onClick={desenhar}><span className="nv-ic"><Bi n="mapa" s={24} /></span><span><b>Desenhar no mapa</b><span className="muted">Ache o endereço na barra do mapa e marque os cantos do terreno.</span></span></button>
        <button type="button" className="nv-op" onClick={() => { if (arq.current) { arq.current.value = ''; arq.current.click(); } }}><span className="nv-ic"><Ic n="upload" s={24} /></span><span><b>Importar KMZ ou KML</b><span className="muted">Arquivo do Google Earth com o polígono do terreno.</span></span></button>
        {st.kmz && (
          <div className="nv-kmz"><span className="lbl-f">O arquivo tem {st.kmz.length} polígonos. Qual é o terreno?</span>
            {st.kmz.map((it, i) => <button key={i} type="button" className="btn sm" onClick={() => poligonal(it.pts, 'kmz', empresa.id, it.nome)}>{it.nome} · {m2(areaPoly(it.pts))}</button>)}
          </div>
        )}
      </div>
      <input ref={arq} type="file" accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) kmzLido(f); }} />
    </>;
  } else if (nv.sobre?.length && !nv.ignorados) {
    corpo = <Sobreposicao sobre={nv.sobre} area={nv.area} poly={nv.poly} fechar={x} ro={!edita}
      voltar={voltarPasso1} mesmo={() => atualizarNv({ ignorados: nv.sobre! })}
      abrir={(c) => { fecharNovo(); navegar(`/terrenos/${c}`); }}
      decidir={async (a, s) => {
        if (a === 'nv-oferta' || a === 'nv-oferta-p') { fecharNovo(); navegar(`/terrenos/${s.codigo}/comercial`); toast('Registre a oferta na aba Comercial do terreno.'); return; }
        const { data: t, error } = await supabase.from('terrenos').select('id,versao,poligono_geojson').eq('id', s.id).single();
        if (error || !t) { toast(mensagemErro(error), true); return; }
        const velho = ((t.poligono_geojson as { coordinates: number[][][] }).coordinates[0].slice(0, -1)).map(([lo, la]) => [la, lo] as P);
        const u = a === 'nv-juntar' ? uniaoPoly(velho, nv.poly) : nv.poly;
        if (!u) { toast('Não deu para juntar as duas áreas. Recadastre só com a área nova e ajuste no mapa.', true); return; }
        const c = centroPoly(fixa(u));
        const r = await supabase.rpc('salvar_terreno', { p_terreno: s.id, p_versao: t.versao, p_dados: { poligono_geojson: geojson(fixa(u)), latitude: +c[0].toFixed(7), longitude: +c[1].toFixed(7), precisao_localizacao: 'aproximada' } });
        if (r.error) { toast(mensagemErro(r.error), true); return; }
        qc.invalidateQueries({ queryKey: ['mapa'] });
        fecharNovo(); navegar(`/terrenos/${s.codigo}/comercial`);
        toast('Terreno recadastrado. Registre a oferta e revise o cadastro.');
      }} />;
  } else {
    /* ---------- passo 2: só o nome de referência ---------- */
    const l = nv.local, mun = l?.cidade ? l.cidade + (l.uf ? ' · ' + l.uf : '') : '', f0 = nv.frentes?.[0], busca = nv.buscando || nv.sobre == null;
    const nome = nv.nome ?? (f0 ? nomeRef(f0.logradouro) : nv.nomeKmz && nv.fonte === 'kmz' ? '' : '');
    const onde = [f0 && [f0.logradouro, f0.numero].filter(Boolean).join(', '), l?.bairro, mun].filter(Boolean).join(' · ');
    async function gravar(ev: React.FormEvent<HTMLFormElement>) {
      ev.preventDefault();
      if (!nv || gravando) return;
      const F = new FormData(ev.currentTarget), nomeF = String(F.get('nome') || '').trim();
      let cidade = l?.cidade || '', uf = l?.uf || '';
      if (!mun) { const [c, u] = String(F.get('municipio') || '').split(/[·,/-]/).map((s) => s.trim()); cidade = c || ''; uf = u || ''; }
      if (!nomeF) { toast('Informe o nome de referência.', true); return; }
      setGravando(true);
      try {
        const { data: munId, error: e1 } = await supabase.rpc('municipio_por_nome', { p_nome: cidade, p_uf: uf });
        if (e1) throw e1;
        if (!munId) { toast(`Município não encontrado: ${cidade || '(vazio)'}${uf ? ' · ' + uf : ''}. Digite como "São Paulo · SP".`, true); setGravando(false); return; }
        const fr = nv.frentes || [];
        const { data: t, error } = await supabase.from('terrenos').insert({
          empresa_id: empresa!.id, nome: nomeF, responsavel_id: session!.user.id, municipio_id: munId,
          logradouro: f0?.logradouro || null, numero: f0?.numero || null, bairro: l?.bairro || null, cep: l?.cep || null,
          latitude: +nv.ponto[0].toFixed(7), longitude: +nv.ponto[1].toFixed(7), poligono_geojson: geojson(nv.poly), precisao_localizacao: 'aproximada',
          sobreposicoes_aceitas: (nv.ignorados || []).map((s) => s.id), posicao_quadra: fr.length > 1 ? (fr.length === 2 ? 'esquina' : 'duas_frentes') : 'nao_informado',
        }).select('id,codigo').single();
        if (error) throw error;
        /* as outras ruas em volta viram confrontações de frente */
        const outras = fr.filter((x, i) => i !== 0 || normRua(x.logradouro) !== normRua(f0?.logradouro || ''));
        if (outras.length) {
          const r = await supabase.from('confrontacoes').insert(outras.map((x, i) => ({ empresa_id: empresa!.id, terreno_id: t.id, ordem: i + 1, tipo: 'frente', comprimento_m: x.m ? +x.m.toFixed(2) : null, confrontante: x.logradouro + (x.numero ? ', ' + x.numero : ''), fonte: 'Localização da poligonal' })));
          if (r.error) console.warn('confrontações', r.error);
        }
        await qc.invalidateQueries({ queryKey: ['mapa'] });
        fecharNovo();
        toast(`${t.codigo} cadastrado.`);
        navegar(`/mapa/${t.codigo}`, { state: { focar: true } });
      } catch (e) { toast(mensagemErro(e), true); } finally { setGravando(false); }
    }
    corpo = <>
      <div className="dh"><div><h2>Novo terreno</h2><div className="muted" style={{ marginTop: 4 }}>Passo 2 de 2 · O resto da ficha é preenchido ao longo da jornada.</div></div>{x}</div>
      <form id="f-novo" onSubmit={gravar}><div className="fields">
        <div className="field full"><div className="banner blue"><Ic n="check" /><div style={{ flex: 1 }}><div className="bt">{NV_FONTE[nv.fonte]} · {m2(nv.area)}</div>
          <div>{nv.buscando ? 'Buscando o endereço pela poligonal...' : onde || 'Endereço não encontrado pela localização.'}</div>
          {nv.ignorados && <div>Confirmado como outro terreno apesar de sobrepor {nv.ignorados.map((s) => s.codigo).join(', ')}.</div>}</div>
          <button type="button" className="btn sm text" onClick={voltarPasso1}>Trocar</button></div></div>
        <div className="field full"><label htmlFor="n-nome">Nome de referência *</label>
          <input id="n-nome" name="nome" required placeholder={nv.buscando ? 'Buscando a rua...' : 'Ex.: Cupecê'} key={nv.buscando ? 'b' : 'p'} defaultValue={nome} onInput={(e) => atualizarNv({ nome: e.currentTarget.value })} /></div>
        {!nv.buscando && !mun && <div className="field full"><label htmlFor="n-mun">Município *</label><input id="n-mun" name="municipio" required placeholder="Cidade · UF" /><span className="hint">Não deu para saber pela localização.</span></div>}
      </div></form>
      <div className="df"><button className="btn text" onClick={fechar}>Cancelar</button>
        <button className="btn primary" type="submit" form="f-novo" id="btn-novo" disabled={busca || gravando}>{busca ? 'Buscando o endereço...' : gravando ? 'Cadastrando...' : 'Cadastrar terreno'}</button></div>
    </>;
  }
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="dialog" role="dialog" aria-modal="true">{corpo}</div>
    </div>
  );
}

/* ---------- algum terreno já ocupa parte da área ---------- */
type Acao = 'nv-oferta' | 'nv-oferta-p' | 'nv-recad' | 'nv-juntar';
function nvAcoes(s: Sobre): [Acao, string, string][] {
  if (s.motivo === 'mesma_area') return [['nv-oferta', 'Nova oferta neste terreno', 'primary']];
  if (s.pctNova >= 95) return [['nv-oferta-p', 'Nova oferta de parte do terreno', 'primary']];
  if (s.pctExist >= 95) return [['nv-recad', 'Recadastrar com a área nova', 'primary']];
  return [['nv-juntar', 'Recadastrar juntando as áreas', 'primary'], ['nv-recad', 'Recadastrar só com a área nova', '']];
}
function Sobreposicao({ sobre, area, fechar, ro, voltar, mesmo, abrir, decidir }: {
  sobre: Sobre[]; area: number; poly: P[]; fechar: React.ReactNode; ro: boolean; voltar: () => void; mesmo: () => void; abrir: (codigo: string) => void; decidir: (a: Acao, s: Sobre) => void;
}) {
  const qc = useQueryClient(), { empresa } = useSessao();
  const dados = qc.getQueryData<{ fases: Fase[]; terrenos: TerrenoMapa[] }>(['mapa', empresa?.id]);
  const igual = sobre.some((s) => s.motivo === 'mesma_area');
  const areaDe = (s: Sobre) => (s.pctExist ? (s.area * 100) / s.pctExist : null);
  const porque = (s: Sobre) => s.motivo === 'mesma_area' ? `Mesma área (${num(s.pctNova)}% da área nova coincide com ${num(s.pctExist)}% da dele).`
    : s.pctNova >= 95 ? `A área nova fica dentro dele: é ${num(s.pctExist)}% do terreno cadastrado.`
    : s.pctExist >= 95 ? `O terreno cadastrado (${m2(areaDe(s))}) fica dentro da área nova: ela é maior e o inclui.`
    : `Parte em comum de ${m2(s.area)}: ${num(s.pctNova)}% da área nova e ${num(s.pctExist)}% da dele.`;
  /* a situação do terreno, na cor da legenda do mapa */
  const sit = (s: Sobre) => {
    if (s.situacao === 'arquivado') return <span className="chip">Arquivado</span>;
    const t = dados?.terrenos.find((x) => x.id === s.id);
    if (!t || !dados) return null;
    const [nome, cor] = info(dados.fases, classe(dados.fases, t, '', ''), '', '');
    return <span className="sitchip"><span className="sw" style={{ background: cor }} />{nome}</span>;
  };
  return <>
    <div className="dh"><div><h2>{igual ? 'Este terreno já existe no sistema' : 'Parte desta área já está cadastrada'}</h2>
      <div className="muted" style={{ marginTop: 4 }}>Área nova: {m2(area)}. {sobre.length === 1 ? 'Encontramos um terreno no mesmo lugar.' : `Encontramos ${sobre.length} terrenos no mesmo lugar.`} Divisas encostadas (até {NV_FOLGA} m) não contam.</div></div>{fechar}</div>
    <div className="nv-sob">{sobre.map((s) => (
      <div key={s.id} className="nv-s"><div className="nv-s-t"><div className="t1"><b className="num">{s.codigo}</b> · {s.nome} {sit(s)}</div><div className="t2">{porque(s)}</div></div>
        <div className="nv-s-a"><button className="btn sm text" onClick={() => abrir(s.codigo)}>Abrir ficha</button>
          {!ro && nvAcoes(s).map(([a, l, c]) => <button key={a} className={`btn sm ${c}`} onClick={() => decidir(a, s)}>{l}</button>)}</div></div>
    ))}</div>
    <div className="hint" style={{ marginTop: 'var(--e3)' }}>{igual && <><b>Nova oferta</b> registra a oferta no terreno, sem mudar o cadastro. </>}<b>Recadastrar</b> troca a poligonal do terreno pela área nova (ou pela soma das duas) e registra a oferta nele, guardando o pedaço oferecido. A poligonal anterior fica no histórico.</div>
    <div className="df"><button className="btn text" onClick={voltar}>Voltar</button>{!ro && <button className="btn" onClick={mesmo}>É outro terreno, cadastrar mesmo assim</button>}</div>
  </>;
}
