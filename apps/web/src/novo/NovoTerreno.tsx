import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { automatico, supabase, mensagemErro } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Bi, Ic } from '../components/Moldura';
import { carregarGoogle } from '../mapa/google';
import { abrirNovo, escolherKmz, fecharNovo, pedirDesenho, poligonal, atualizarNv, useNovo, voltarPasso1, novoEstado, listaSql, abrirLotes, lerRascNv, limparRascNv, continuarRascNv, type Conflito } from './estado';
import CompararLotes from './CompararLotes';
import { EscolherCorretor } from '../components/Corretor';
import { OPT } from '../ficha/edicao';
import LotesGeo from './LotesGeo';
import { consultarTerreno } from './consulta';
import { atualizarFrentes } from './frentes';
import { GEO_BASE, digitos, loteDoSql, sqlFmt, sqlMascara, type LoteSql } from './geosampa';
import { GSJ_BASE, gsjPoligono, icFmt } from './geosanja';
import { quadraDe } from './lotesSjc';
import { areaPoly, geojson, lerKmz, lotesUniao, m2, nomeBase, nomeUnico, normRua } from './geo';

// Janela do Novo terreno, com a marcação do protótipo (tools/prototipo/proto_novo.js: nvPasso1Html, nvSobreHtml,
// nvDadosHtml, nvGravar, nvDecidir). Passo 1: a poligonal (desenho no mapa ou KMZ/KML); se outro terreno ocupa parte
// passo 2: o nome de referência, a origem do cadastro, o corretor (só com a origem Corretor) e a observação da primeira oferta (cadastrar é receber uma oferta,
// pedido do Moises, 10/nov/2026). Ao cadastrar, se um terreno ativo tem algum lote em comum (ou, sem lote, ocupa parte da
// poligonal), a janela da sobreposição decide: mesmos lotes, nova oferta nele; lotes diferentes, terreno novo ligado a ele,
// e só a tratativa ativa aparece (app.conflitos_cadastro, app.registrar_oferta_cadastro, app.vincular_tratativa). Em São Paulo, "Incluir por SQL" (nvSqlHtml, nvSqlIncluir,
// nvSqlSeguir em proto_lotesgeo.js) faz a poligonal pela soma dos lotes. Em São José dos Campos (pedido do Moises, 10/nov/2026),
// o mesmo caminho com o GeoSanja: "Incluir por inscrição" e o mapa de lotes depois da poligonal (lotesSjc.ts, LotesGeo.tsx).

const NV_FONTE = { mapa: 'Poligonal desenhada no mapa', kmz: 'Poligonal importada de KMZ/KML', sql: 'Poligonal pela soma dos lotes dos SQLs' };
const num = (v: number, d = 0) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d });

export default function NovoTerreno() {
  const st = useNovo();
  const { empresa, session, edita, membro } = useSessao();
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

  /* nomes já usados na base, para o nome padrão ganhar 2, 3... quando se repete */
  const bases = [...new Set((st.nv?.frentes || []).map((f) => nomeBase(st.nv?.local?.bairro, f.logradouro)).filter(Boolean))];
  const nomesQ = useQuery({
    queryKey: ['nomes-terreno', empresa?.id, bases], enabled: !!empresa && bases.length > 0, staleTime: 0,
    queryFn: async () => {
      const rs = await Promise.all(bases.map((b) => supabase.from('terrenos').select('nome').eq('empresa_id', empresa!.id).ilike('nome', b.replace(/[\\%_]/g, (c) => '\\' + c) + '%')));
      const e = rs.find((r) => r.error)?.error; if (e) throw e;
      return rs.flatMap((r) => (r.data || []).map((x) => x.nome as string));
    },
  });
  /* em São Paulo, o mapa de lotes da prefeitura abre sozinho uma vez, logo depois da poligonal (sem sobreposição pendente) */
  const nv0 = st.nv;
  const cid = (c: string) => !!nv0?.local?.cidade && nv0.local.cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === c && (!nv0.local.uf || nv0.local.uf === 'SP');
  const sp = cid('sao paulo'), sjc = cid('sao jose dos campos'), pref = (sp && !!GEO_BASE) || (sjc && !!GSJ_BASE);
  const lgPronto = !!(nv0 && !nv0.buscando && !nv0.lgFeito && pref && edita);
  const [pend, setPend] = useState<{ nome: string; munId: string } | null>(null);
  const [rascV, setRascV] = useState(0);
  const [comparar, setComparar] = useState<Conflito | null>(null);
  useEffect(() => { if (lgPronto) { atualizarNv({ lgFeito: true }); abrirLotes({ modo: 'nv', sjc }); } }, [lgPronto]);
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

  /* Cadastrar (pedido do Moises, 10/nov/2026): terreno novo com a primeira oferta; com sobreposição, o que a janela decidiu */
  async function criar(dec: Decisao, nomeF: string, munId: string) {
    const n = novoEstado().nv;
    if (!n || gravando || !empresa) return;
    const l = n.local, fr = n.frentes || [], pri = Math.min(n.pri || 0, Math.max(fr.length - 1, 0)), f0 = fr[pri];
    setGravando(true);
    try {
      if (dec.tipo === 'oferta') {
        const { data, error } = await supabase.rpc('registrar_oferta_cadastro', { p_terreno: dec.terreno.terreno_id, p_modo: dec.modo, p_corretor: (n.origem === 'corretor' && n.corretor) || null });
        if (error) throw error;
        const oid = (data as { oferta_id?: string } | null)?.oferta_id;
        if (oid && n.obs?.trim()) { const r = await supabase.from('ofertas').update({ observacoes: n.obs.trim() }).eq('id', oid); if (r.error) toast(`A oferta entrou, mas a observação não: ${mensagemErro(r.error)}`, true); }
        await qc.invalidateQueries({ queryKey: ['mapa'] });
        fecharNovo(); limparRascNv(); setPend(null);
        if (dec.modo === 'aguardando') { toast('Oferta salva, aguardando. Você será avisado quando a outra tratativa vencer.'); navegar('/mapa'); }
        else { toast(`Oferta ${(data as { codigo: string }).codigo} registrada.`); navegar(`/terrenos/${dec.terreno.codigo}/comercial`); }
        return;
      }
      /* o banco recusa poligonal sobre outro terreno sem a confirmação; quem decidiu foi a janela pelos lotes */
      const { data: sob } = await supabase.rpc('terrenos_sobrepostos', { p_empresa: empresa.id, p_poligono: geojson(n.poly) });
      const { data: t, error } = await supabase.from('terrenos').insert({
        empresa_id: empresa.id, nome: nomeF, responsavel_id: session!.user.id, municipio_id: munId, origem_cadastro: n.origem || 'nao_informado',
        logradouro: f0?.logradouro || null, numero: f0?.numero || null, bairro: l?.bairro || null, cep: l?.cep || null,
        latitude: +n.ponto[0].toFixed(7), longitude: +n.ponto[1].toFixed(7), poligono_geojson: geojson(n.poly), precisao_localizacao: 'aproximada',
        ...(n.porLotes && n.polyDesenho ? { poligono_desenhado_geojson: geojson(n.polyDesenho) } : {}),
        sobreposicoes_aceitas: ((sob || []) as { terreno_id: string }[]).map((x) => x.terreno_id), posicao_quadra: fr.length > 1 ? (fr.length === 2 ? 'esquina' : 'duas_frentes') : 'nao_informado',
      }).select('id,codigo').single();
      if (error) throw error;
      /* com lotes diferentes: liga aos outros antes dos SQLs (o lote em comum só entra nos ligados) */
      if (dec.tipo === 'vinculo') {
        const r = await supabase.rpc('vincular_tratativa', { p_novo: t.id, p_outros: dec.outros.map((x) => x.terreno_id), p_modo: dec.modo });
        if (r.error) toast(`${t.codigo} cadastrado, mas a ligação com o outro terreno falhou: ${mensagemErro(r.error)}`, true);
      }
      /* cadastrar é receber a primeira oferta: entra em Ofertas recebidas como a ativa, com o corretor */
      const ro = await supabase.from('ofertas').insert({ empresa_id: empresa.id, terreno_id: t.id, corretor_id: (n.origem === 'corretor' && n.corretor) || null, observacoes: n.obs?.trim() || null });
      if (ro.error) toast(`${t.codigo} cadastrado, mas a oferta não entrou: ${mensagemErro(ro.error)}`, true);
      /* as outras ruas em volta viram confrontações de frente */
      const outras = fr.filter((x, i) => i !== pri || normRua(x.logradouro) !== normRua(f0?.logradouro || ''));
      if (outras.length) {
        const r = await automatico(supabase.from('confrontacoes').insert(outras.map((x, i) => ({ empresa_id: empresa.id, terreno_id: t.id, ordem: i + 1, tipo: 'frente', comprimento_m: x.m ? +x.m.toFixed(2) : null, confrontante: x.logradouro + (x.numero ? ', ' + x.numero : ''), fonte: 'Localização da poligonal' }))));
        if (r.error) console.warn('confrontações', r.error);
      }
      /* os SQLs incluídos entram no terreno sem parte, como no mapa de lotes da prefeitura */
      if (n.sqls?.length) {
        const r = await supabase.from('inscricoes_municipais').insert(n.sqls.map((q) => ({ empresa_id: empresa.id, terreno_id: t.id, municipio_id: munId, inscricao: q.sql,
          area_cadastral_m2: q.area, cib: q.cib, origem: 'mapa_prefeitura', endereco_prefeitura: q.end || null }))).select('id,inscricao');
        if (r.error) toast(`${t.codigo} cadastrado, mas os SQLs não entraram: ${mensagemErro(r.error)}`, true);
        /* a consulta completa do GeoSampa em cada SQL e depois pela poligonal, em segundo plano (o andamento aparece na lista do mapa) */
        else consultarTerreno(t.id, n.poly, (r.data || []).map((x) => ({ id: x.id as string, sql: x.inscricao as string })), (m, e) => toast(m, e), n.sqls.some((q) => digitos(q.sql).length === 14) ? 'geosanja' : 'geosampa');
      }
      /* em São Paulo, frentes, esquina e testada medidas pela poligonal e pelos lotes da prefeitura, em segundo plano */
      atualizarFrentes(t.id).catch((e) => console.warn('frentes', e));
      await qc.invalidateQueries({ queryKey: ['mapa'] });
      fecharNovo(); limparRascNv(); setPend(null);
      if (dec.tipo === 'vinculo' && dec.modo === 'espera') {
        toast(`${t.codigo} salvo e escondido: a outra tratativa continua ativa. Você será avisado quando ela vencer.`);
        navegar(`/terrenos/${t.codigo}`);
      } else {
        toast(`${t.codigo} cadastrado.`);
        navegar(`/mapa/${t.codigo}`, { state: { focar: true } });
      }
    } catch (e) { toast(mensagemErro(e), true); } finally { setGravando(false); }
  }

  /* ---------- passo 1 ---------- */
  let corpo: React.ReactNode;
  if (st.lotes) {
    corpo = <LotesGeo L={st.lotes} empresa={empresa.id} />;
  } else if (!nv && st.sql) {
    corpo = <IncluirSql lista={st.sql} fechar={x} empresa={empresa.id} sjc={!!st.sqlSjc} />;
  } else if (!nv) {
    void rascV;
    const rasc = lerRascNv();
    corpo = <>
      <div className="dh"><div><h2>Novo terreno</h2><div className="muted" style={{ marginTop: 4 }}>Passo 1 de 2 · Poligonal do terreno</div></div>{x}</div>
      {rasc && <div className="banner nv-rasc"><Ic n="edit" /><div style={{ flex: 1 }}><div className="bt">Cadastro em rascunho{rasc.nv.nome ? ': ' + rasc.nv.nome : rasc.nv.local?.logradouro ? ': ' + rasc.nv.local.logradouro : ''}</div>
        <div>{m2(rasc.nv.area)}{rasc.nv.sqls?.length ? ` · ${rasc.nv.sqls.length} lote${rasc.nv.sqls.length > 1 ? 's' : ''}` : ''} · {!rasc.nv.origem ? 'falta a origem da oferta' : rasc.nv.origem === 'corretor' && !rasc.nv.corretor ? 'falta o corretor' : 'não foi concluído'}</div></div>
        <button type="button" className="btn sm text" onClick={() => { limparRascNv(); setRascV((x) => x + 1); }}>Descartar</button>
        <button type="button" className="btn sm" onClick={continuarRascNv}>Continuar</button></div>}
      <div className="nv-ops">
        <button type="button" className="nv-op" onClick={desenhar}><span className="nv-ic"><Bi n="mapa" s={24} /></span><span><b>Desenhar no mapa</b><span className="muted">Ache o endereço na barra do mapa e marque os cantos do terreno.</span></span></button>
        <button type="button" className="nv-op" onClick={() => { if (arq.current) { arq.current.value = ''; arq.current.click(); } }}><span className="nv-ic"><Ic n="upload" s={24} /></span><span><b>Importar KMZ ou KML</b><span className="muted">Arquivo do Google Earth com o polígono do terreno.</span></span></button>
        <button type="button" className="nv-op" onClick={() => { if (!GEO_BASE) { toast('A busca no GeoSampa funciona na versão publicada.', true); return; } listaSql([], false); }}><span className="nv-ic"><Ic n="layers" s={24} /></span><span><b>Incluir por SQL</b><span className="muted">São Paulo: digite os SQLs dos lotes; a poligonal é a soma deles.</span></span></button>
        <button type="button" className="nv-op" onClick={() => { if (!GSJ_BASE) { toast('A busca no GeoSanja funciona na versão publicada.', true); return; } listaSql([], true); }}><span className="nv-ic"><Ic n="layers" s={24} /></span><span><b>Incluir por inscrição</b><span className="muted">São José dos Campos: digite as inscrições imobiliárias; a poligonal é a soma dos lotes.</span></span></button>
        {st.kmz && (
          <div className="nv-kmz"><span className="lbl-f">O arquivo tem {st.kmz.length} polígonos. Qual é o terreno?</span>
            {st.kmz.map((it, i) => <button key={i} type="button" className="btn sm" onClick={() => poligonal(it.pts, 'kmz', empresa.id, it.nome)}>{it.nome} · {m2(areaPoly(it.pts))}</button>)}
          </div>
        )}
      </div>
      <input ref={arq} type="file" accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) kmzLido(f); }} />
    </>;
  } else if (nv.conflitos?.length && pend) {
    corpo = <Sobreposicao cf={nv.conflitos} fechar={x} sair={() => { setPend(null); fechar(); }} ro={!edita} dir={membro?.papel === 'diretor'} gravando={gravando}
      voltar={() => { atualizarNv({ conflitos: null }); setPend(null); }} comparar={setComparar}
      abrir={(c) => { fecharNovo(); navegar(`/terrenos/${c}`); }}
      decidir={(d) => criar(d, pend.nome, pend.munId)} />;
  } else {
    /* ---------- passo 2: só o nome de referência ---------- */
    const l = nv.local, mun = l?.cidade ? l.cidade + (l.uf ? ' · ' + l.uf : '') : '', fr = nv.frentes || [], pri = Math.min(nv.pri || 0, Math.max(fr.length - 1, 0)), f0 = fr[pri], busca = nv.buscando || nv.sobre == null || nomesQ.isFetching;
    const padrao = (f?: { logradouro: string }) => f ? nomeUnico(nomeBase(l?.bairro, f.logradouro), nomesQ.data || []) : '';
    const nome = nv.nome ?? padrao(f0);
    const onde = [f0 && [f0.logradouro, f0.numero].filter(Boolean).join(', '), l?.bairro, mun].filter(Boolean).join(' · ');
    /* acesso principal: o nome sugerido acompanha a frente escolhida, enquanto a pessoa não escreveu outro */
    const escolherFrente = (i: number) => {
      const n = nv.nome?.trim();
      atualizarNv({ pri: i, nome: !n || fr.some((x) => padrao(x) === n) ? undefined : nv.nome });
    };
    async function gravar(ev: React.FormEvent<HTMLFormElement>) {
      ev.preventDefault();
      if (!nv || gravando) return;
      const F = new FormData(ev.currentTarget), nomeF = String(F.get('nome') || '').trim();
      let cidade = l?.cidade || '', uf = l?.uf || '';
      if (!mun) { const [c, u] = String(F.get('municipio') || '').split(/[·,/-]/).map((s) => s.trim()); cidade = c || ''; uf = u || ''; }
      if (!nomeF) { toast('Informe o nome de referência.', true); return; }
      if (!nv.origem) { toast('Escolha a origem da oferta. Sem ela o cadastro fica em rascunho.', true); document.getElementById('n-orig')?.focus(); return; }
      if (nv.origem === 'corretor' && !nv.corretor) { toast('Escolha o corretor da oferta. Sem ele o cadastro fica em rascunho.', true); document.getElementById('n-cor')?.focus(); return; }
      setGravando(true);
      try {
        const { data: munId, error: e1 } = await supabase.rpc('municipio_por_nome', { p_nome: cidade, p_uf: uf });
        if (e1) throw e1;
        if (!munId) { toast(`Município não encontrado: ${cidade || '(vazio)'}${uf ? ' · ' + uf : ''}. Digite como "São Paulo · SP".`, true); setGravando(false); return; }
        /* o imóvel já existe na base? basta um lote em comum (sem lote, a poligonal) */
        const { data: cf, error: e2 } = await supabase.rpc('conflitos_cadastro', { p_empresa: empresa!.id, p_municipio: munId, p_inscricoes: (nv.sqls || []).map((q) => q.sql), p_poligono: geojson(nv.poly) });
        if (e2) throw e2;
        if ((cf as Conflito[] | null)?.length) { setPend({ nome: nomeF, munId: munId as string }); atualizarNv({ conflitos: cf as Conflito[] }); setGravando(false); return; }
        setGravando(false);
        await criar({ tipo: 'novo' }, nomeF, munId as string);
      } catch (e) { toast(mensagemErro(e), true); setGravando(false); }
    }
    corpo = <>
      <div className="dh"><div><h2>Novo terreno</h2><div className="muted" style={{ marginTop: 4 }}>Passo 2 de 2 · O resto da ficha é preenchido ao longo da jornada.</div></div>{x}</div>
      <form id="f-novo" onSubmit={gravar}><div className="fields">
        <div className="field full"><div className="banner blue"><Ic n="check" /><div style={{ flex: 1 }}><div className="bt">{nv.porLotes && nv.sqls?.length ? (nv.sqls.length > 1 ? `Poligonal pela soma dos ${nv.sqls.length} lotes da prefeitura` : 'Poligonal pelo lote da prefeitura') : NV_FONTE[nv.fonte]} · {m2(nv.area)}</div>
          <div>{nv.buscando ? 'Buscando o endereço pela poligonal...' : onde || 'Endereço não encontrado pela localização.'}</div>
</div>
          <button type="button" className="btn sm text" onClick={voltarPasso1}>Trocar</button></div></div>
        {!busca && fr.length > 1 && <div className="field full nv-frentes"><span className="lbl-f" id="nv-fr-l">A poligonal tem {fr.length} frentes. Qual é o acesso principal?</span>
          <span className="nv-fr" role="radiogroup" aria-labelledby="nv-fr-l">{fr.map((f, i) => <label key={i} className="opt-radio"><input type="radio" name="nv-pri" value={i} checked={i === pri} onChange={() => escolherFrente(i)} />
            {f.logradouro}{f.numero ? ', ' + f.numero : ''}{f.m && !sp ? <span className="faint">&nbsp;· {num(Math.round(f.m))} m</span> : null}</label>)}</span>
          <span className="hint">O nome de referência sai dele; as outras entram em Confrontações como frente.</span></div>}
        <div className="field full"><label htmlFor="n-nome">Nome de referência *</label>
          <input id="n-nome" name="nome" required placeholder={nv.buscando ? 'Buscando a rua...' : 'Ex.: Saúde - Cupecê'} key={(busca ? 'b' : 'p') + pri} defaultValue={nome} onInput={(e) => atualizarNv({ nome: e.currentTarget.value })} /></div>
        <div className="field"><label htmlFor="n-orig">Origem da oferta *</label>
          <select id="n-orig" value={nv.origem || ''} onChange={(e) => atualizarNv({ origem: e.target.value, ...(e.target.value === 'corretor' ? {} : { corretor: '' }) })}><option value="" disabled>Escolha a origem</option>
            {Object.entries(OPT.origem).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></div>
        {nv.origem === 'corretor' && <div className="field"><label htmlFor="n-cor">Corretor *</label>
          <EscolherCorretor id="n-cor" value={nv.corretor || ''} vazio="Digite ou escolha o corretor" onChange={(v) => atualizarNv({ corretor: v })} /></div>}
        <div className="field full"><label htmlFor="n-obs">Informações gerais</label>
          <textarea id="n-obs" rows={3} defaultValue={nv.obs || ''} placeholder="Impressões sobre o corretor, firmeza da proposta..." onInput={(e) => atualizarNv({ obs: e.currentTarget.value })} /></div>
        {(nv.lgFeito || (pref && edita)) && <div className="field full"><div className="nv-sqls"><span className="etq-sw s" /><div style={{ flex: 1 }}>{nv.sqls?.length ? <><b>{nv.sqls.length} {sjc ? (nv.sqls.length > 1 ? 'inscrições' : 'inscrição') : 'SQL' + (nv.sqls.length > 1 ? 's' : '')} da prefeitura</b>
          <div className="nv-sqls-l">{nv.sqls.map((q) => <span key={q.sql} className="etq s"><span className="etq-n num">{q.sql}</span></span>)}</div>{nv.porLotes && nv.polyDesenho && <div className="faint">A desenhada fica guardada.</div>}</>
          : <><b>Nenhum{sjc ? 'a inscrição' : ' SQL'}</b><div className="faint">Marque os lotes da prefeitura que o terreno ocupa.</div></>}</div>
          {edita && pref && <button type="button" className="btn sm text" onClick={() => abrirLotes({ modo: 'nv', sjc })}><Ic n="layers" s={16} />{nv.sqls?.length ? (sjc ? 'Trocar inscrições' : 'Trocar SQLs') : sjc ? 'Escolher inscrições' : 'Escolher SQLs'}</button>}</div></div>}
        {!nv.buscando && !mun && <div className="field full"><label htmlFor="n-mun">Município *</label><input id="n-mun" name="municipio" required placeholder="Cidade · UF" /><span className="hint">Não deu para saber pela localização.</span></div>}
      </div></form>
      <div className="df"><button className="btn text" onClick={fechar}>Cancelar</button>
        <button className="btn primary" type="submit" form="f-novo" id="btn-novo" disabled={busca || gravando}>{busca ? 'Buscando o endereço...' : gravando ? 'Cadastrando...' : 'Cadastrar terreno'}</button></div>
    </>;
  }
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="dialog" role="dialog" aria-modal="true">{corpo}</div>
      {comparar && nv && <CompararLotes empresa={empresa.id} fechar={() => setComparar(null)}
        a={{ titulo: 'Este cadastro', lotes: (nv.sqls || []).map((q) => q.sql) }}
        b={{ titulo: comparar.sou_responsavel ? comparar.codigo : 'Terreno existente', lotes: [...comparar.comuns, ...comparar.so_existente] }} />}
    </div>
  );
}

/* ---------- o imóvel já existe na base (pedido do Moises, 10/nov/2026) ----------
   Basta um lote em comum. A tratativa em andamento continua valendo; a nova só fica ativa com a outra vencida (90 dias sem
   ação de uma pessoa) ou pelo diretor. Quem é o responsável da outra vê o código; os demais, só que o imóvel já existe. */
type Decisao = { tipo: 'novo' } | { tipo: 'oferta'; terreno: Conflito; modo: 'vigente' | 'nao_vigente' | 'aguardando' } | { tipo: 'vinculo'; outros: Conflito[]; modo: 'ativa' | 'espera' };
type Opcao = [string, Decisao, string];
function Sobreposicao({ cf, fechar, sair, ro, dir, gravando, voltar, abrir, decidir, comparar }: {
  cf: Conflito[]; fechar: React.ReactNode; sair: () => void; ro: boolean; dir: boolean; gravando: boolean; voltar: () => void; abrir: (codigo: string) => void;
  decidir: (d: Decisao) => void; comparar: (c: Conflito) => void;
}) {
  const mesmo = cf.find((c) => c.mesmos_lotes);
  const lista = mesmo ? [mesmo] : cf;
  const meus = lista.every((c) => c.sou_responsavel), venc = lista.every((c) => c.vencida);
  const cods = lista.map((c) => c.codigo).join(', ');
  const dias = Math.min(...lista.map((c) => c.dias_sem_acao));
  const parado = `sem ação há ${dias} dia${dias === 1 ? '' : 's'}`;
  let titulo: string, texto: React.ReactNode, ops: Opcao[];
  if (mesmo) {
    const t = mesmo;
    titulo = meus ? `Este imóvel é o ${t.codigo}` : 'Este imóvel já existe na base';
    if (meus && !venc) { texto = <>O {t.codigo} · {t.nome} tem os mesmos lotes e está com você. Siga a tratativa por lá: a oferta entra na lista de Ofertas recebidas dele.</>;
      ops = [['Registrar como nova oferta no ' + t.codigo, { tipo: 'oferta', terreno: t, modo: 'nao_vigente' }, 'primary']]; }
    else if (meus) { texto = <>O {t.codigo} · {t.nome} tem os mesmos lotes, está com você e a tratativa está vencida ({parado}). Qual oferta segue ativa?</>;
      ops = [['Manter a oferta atual', { tipo: 'oferta', terreno: t, modo: 'nao_vigente' }, ''], ['Seguir com esta oferta', { tipo: 'oferta', terreno: t, modo: 'vigente' }, 'primary']]; }
    else if (venc) { texto = <>A tratativa deste imóvel está vencida ({parado}). Quer assumir? A sua oferta passa a ser a ativa e você fica responsável pelo terreno.</>;
      ops = [['Sim, assumir', { tipo: 'oferta', terreno: t, modo: 'vigente' }, 'primary']]; }
    else { texto = <>A tratativa deste imóvel está ativa. A sua oferta fica salva, aguardando, e você será avisado quando a tratativa vencer.</>;
      ops = [['Cadastrar e aguardar', { tipo: 'oferta', terreno: t, modo: 'aguardando' }, 'primary']];
      if (dir) ops.push(['Seguir com esta oferta (diretor)', { tipo: 'oferta', terreno: t, modo: 'vigente' }, '']); }
  } else {
    const parte = lista.some((c) => c.por === 'lotes') ? 'tem lotes em comum com' : 'ocupa parte de';
    titulo = meus ? `Este imóvel sobrepõe o ${cods}` : 'Este imóvel já existe na base';
    const marca = 'Os dois ficam com a marca "Sobreposição parcial", e só o da tratativa ativa aparece no mapa, no funil e nas listas.';
    if (meus && !venc) { texto = <>Este cadastro {parte} {cods}, que está com você. A tratativa de lá continua valendo; este fica salvo e escondido até ela vencer. {marca}</>;
      ops = [['Cadastrar e manter o ' + cods + ' ativo', { tipo: 'vinculo', outros: lista, modo: 'espera' }, 'primary']];
      if (dir) ops.push(['Seguir com este cadastro (diretor)', { tipo: 'vinculo', outros: lista, modo: 'ativa' }, '']); }
    else if (meus) { texto = <>Este cadastro {parte} {cods}, que está com você, e a tratativa de lá está vencida ({parado}). Qual segue? {marca}</>;
      ops = [['Manter o ' + cods + ' ativo', { tipo: 'vinculo', outros: lista, modo: 'espera' }, ''], ['Seguir com este cadastro', { tipo: 'vinculo', outros: lista, modo: 'ativa' }, 'primary']]; }
    else if (venc) { texto = <>Parte destes lotes já está noutro terreno, e a tratativa de lá está vencida ({parado}). Quer assumir? Este cadastro passa a ser o ativo. {marca}</>;
      ops = [['Sim, assumir', { tipo: 'vinculo', outros: lista, modo: 'ativa' }, 'primary']]; }
    else { texto = <>Parte destes lotes já está noutro terreno, com a tratativa ativa. Este cadastro fica salvo e escondido, e você será avisado quando a tratativa vencer. {marca}</>;
      ops = [['Cadastrar e aguardar', { tipo: 'vinculo', outros: lista, modo: 'espera' }, 'primary']];
      if (dir) ops.push(['Seguir com este cadastro (diretor)', { tipo: 'vinculo', outros: lista, modo: 'ativa' }, '']); }
  }
  return <>
    <div className="dh"><div><h2>{titulo}</h2></div>{fechar}</div>
    <div className="nv-cf">
      <div>{texto}</div>
      {lista.map((c) => (
        <div key={c.terreno_id} className="nv-cf-t"><div>
          <div className="t1">{c.sou_responsavel ? <><b className="num">{c.codigo}</b> · {c.nome}</> : <b>Terreno existente</b>}
            {!c.mesmos_lotes && <span className="chip warn" style={{ marginLeft: 8 }}>Sobreposição parcial</span>}</div>
          <div className="t2 faint">{c.por === 'lotes'
            ? (c.mesmos_lotes ? `Os mesmos ${c.comuns.length} lote${c.comuns.length === 1 ? '' : 's'}` : `${c.comuns.length} em comum · ${c.so_novo.length} só deste cadastro · ${c.so_existente.length} só do existente`)
            : 'Ocupa parte da mesma área (sem lotes para comparar)'} · {c.vencida ? `tratativa vencida (${c.dias_sem_acao} dias sem ação)` : 'tratativa em andamento'}</div></div>
          {c.por === 'lotes' && <button className="iconbtn" title="Comparar os lotes" aria-label="Comparar os lotes" onClick={() => comparar(c)}><Ic n="search" /></button>}
          {c.sou_responsavel && <button className="btn sm text" onClick={() => abrir(c.codigo)}>Abrir ficha</button>}
        </div>
      ))}
    </div>
    <div className="df"><button className="btn text" onClick={voltar}>Voltar</button><button className="btn" onClick={sair}>Não cadastrar</button>
      {!ro && ops.map(([r, d, c]) => <button key={r} className={`btn ${c}`} disabled={gravando} onClick={() => decidir(d)}>{gravando ? 'Cadastrando...' : r}</button>)}</div>
  </>;
}

/* ---------- passo 1 por SQL (São Paulo) ou por inscrição (São José dos Campos, sjc): a lista dos lotes, um de cada vez ---------- */
const icMascara = (s: string) => { const d = digitos(s).slice(0, 14); return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10), d.slice(10)].filter(Boolean).join('.'); };
function IncluirSql({ lista, fechar, empresa, sjc }: { lista: LoteSql[]; fechar: React.ReactNode; empresa: string; sjc: boolean }) {
  const toast = useToast();
  const [txt, setTxt] = useState('');
  const [buscando, setBuscando] = useState(false);
  const area = lista.reduce((s, q) => s + (q.area || 0), 0), n = lista.length;
  const ndig = sjc ? 14 : 11, fmt = sjc ? icFmt : sqlFmt;
  async function incluir(ev: React.FormEvent) {
    ev.preventDefault();
    const d = digitos(txt);
    if (buscando) return;
    if (d.length !== ndig) { toast(sjc ? 'A inscrição tem 14 dígitos: 00.0000.0000.0000.' : 'O SQL tem 11 dígitos: 000.000.0000-0.', true); return; }
    if (lista.some((q) => digitos(q.sql) === d)) { toast(sjc ? 'Esta inscrição já está na lista.' : 'Este SQL já está na lista.', true); return; }
    setBuscando(true);
    try {
      /* inscrição que já está em outro terreno não entra */
      const { data: ja } = await supabase.from('inscricoes_municipais').select('terrenos(codigo)').eq('empresa_id', empresa).eq('inscricao_norm', d).limit(1);
      const cod = (ja?.[0] as { terrenos?: { codigo?: string } | null } | undefined)?.terrenos?.codigo;
      const art = sjc ? 'A inscrição' : 'O SQL';
      if (cod) { toast(`${art} ${fmt(d)} já está no ${cod}.`, true); return; }
      if (ja?.length) { toast(`${art} ${fmt(d)} está num terreno excluído. O administrador pode restaurar ou deletar esse terreno em Configurações.`, true); return; }
      let lote: LoteSql;
      if (sjc) {
        const poly = await gsjPoligono(d);
        if (!poly) throw new Error('Inscrição não encontrada no GeoSanja.');
        lote = { sql: icFmt(d), area: null, end: '', cib: null, poly, q: quadraDe(icFmt(d)) };
      } else lote = await loteDoSql(d);
      listaSql([...(novoEstado().sql || []), lote]);
      setTxt('');
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      toast(/dígito|não encontrad/.test(m) ? m : `O ${sjc ? 'GeoSanja' : 'GeoSampa'} não respondeu. Tente de novo em instantes.`, true);
    } finally { setBuscando(false); }
  }
  function seguir() {
    const u = lotesUniao(lista.map((q) => q.poly));
    if (!u) { toast('Os lotes não se encostam: tire os que ficaram separados ou desenhe a poligonal no mapa.', true); return; }
    poligonal(u, 'sql', empresa, undefined, lista, { lgFeito: true, porLotes: true });
  }
  /* "Escolher no mapa": as quadras do digitado e dos que já estão na lista */
  function mapa() {
    const d = digitos(txt);
    if (sjc) {
      const ics = [...new Set([d.length === 14 ? icFmt(d) : null, ...lista.map((q) => q.sql)].filter(Boolean) as string[])];
      if (!ics.length) { toast('Digite uma inscrição para abrir o mapa da quadra dela.', true); return; }
      abrirLotes({ modo: 'sql', sjc: true, ics });
      return;
    }
    const qs = [...new Set([d.length >= 6 ? d.slice(0, 3) + '.' + d.slice(3, 6) : null, ...lista.map((q) => q.q)].filter(Boolean) as string[])].slice(0, 8);
    if (!qs.length) { toast('Digite um SQL para abrir o mapa da quadra dele.', true); return; }
    abrirLotes({ modo: 'sql', quadras: qs });
  }
  return <>
    <div className="dh"><div><h2>Novo terreno</h2><div className="muted" style={{ marginTop: 4 }}>Passo 1 de 2 · {sjc ? 'Inscrições dos lotes (São José dos Campos)' : 'SQLs dos lotes (São Paulo)'}</div></div>{fechar}</div>
    <form className="etq-form" onSubmit={incluir}>
      <div className="field grow"><label htmlFor="nvq-sql">{sjc ? 'Inscrição imobiliária' : 'SQL'}</label>
        <input id="nvq-sql" name="sql" inputMode="numeric" placeholder={sjc ? '00.0000.0000.0000' : '000.000.0000-0'} autoComplete="off" autoFocus value={txt} onChange={(e) => setTxt(sjc ? icMascara(e.target.value) : sqlMascara(e.target.value))} /></div>
      <button className="btn sm" disabled={buscando}><Ic n="add" s={16} />{buscando ? 'Buscando...' : 'Incluir'}</button>
      <button type="button" className="btn sm text" disabled={buscando} onClick={mapa}><Ic n="layers" s={16} />Escolher no mapa</button>
    </form>
    <div className="hint" style={{ margin: '4px 0 8px' }}>Digite {sjc ? 'a inscrição' : 'o SQL'} e Incluir, um de cada vez, ou abra o mapa da quadra {sjc ? 'da inscrição digitada' : 'do SQL digitado'} e marque os lotes.</div>
    <div className="etq-pool">{lista.length ? lista.map((q, i) => (
      <span key={q.sql} className="etq s" aria-label={`${sjc ? 'Inscrição' : 'SQL'} ${q.sql}`}><span className="etq-n num" title={[q.end, q.area ? m2(q.area) : ''].filter(Boolean).join(' · ')}>{q.sql}</span>
        <button type="button" className="etq-x" aria-label={`Tirar ${sjc ? 'a inscrição' : 'o SQL'} ${q.sql}`} title="Tirar" onClick={() => listaSql(lista.filter((_, k) => k !== i))}><Ic n="close" s={14} /></button></span>
    )) : <span className="etq-vazio">Nenhum{sjc ? 'a inscrição' : ' SQL'} ainda.</span>}</div>
    {n > 0 && <div className="hint" style={{ marginTop: 8 }}>{n} lote{n > 1 ? 's' : ''}{area ? ` · ${m2(area)} de área cadastral` : ''}. A poligonal do terreno será a soma deles.</div>}
    <div className="df"><button className="btn text" onClick={() => listaSql(null)}>Voltar</button><button className="btn primary" disabled={!n || buscando} onClick={seguir}>Continuar</button></div>
  </>;
}
