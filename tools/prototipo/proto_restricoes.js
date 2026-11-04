// ---------------------------------------------------------------------
// Restrições e entorno do terreno (aba Parâmetros urbanísticos; lote 2 da
// ficha em abas, decisões do Moisés de 3/nov/2026). Uma lista fixa, por tema,
// com a resposta de cada item para o terreno inteiro: a consulta ao GeoSampa
// pela poligonal do terreno (t.geoArea, botão "Consultar pela poligonal") ou,
// sem ela, a soma das consultas dos lotes (inscrições). Inundação é sim ou não
// para 5, 25 e 100 anos (não há cota de inundação); o PA da Quota Ambiental vem
// do Mapa 3 da Lei 16.402 (docs/dados), pela poligonal, mesmo sem consulta.
// Largura de via e rodovias ficaram de fora (decisão do Moisés). Fora de São
// Paulo: "não disponível nesta cidade". No banco: app.consultas_area,
// app.registrar_consulta_area e terrenos.historico_uso.
// ---------------------------------------------------------------------
const REST_GRUPOS=[
  ['Ambiental',[
    ['Perímetro de qualificação ambiental (Quota Ambiental)',{pa:1}],
    ['Inundação em 5 anos',{sn:'mancha_inundacao_5',grav:'crit'}],
    ['Inundação em 25 anos',{sn:'mancha_inundacao_25'}],
    ['Inundação em 100 anos',{sn:'mancha_inundacao_100'}],
    ['Córrego a até 30 m',{k:['drenagem']}],
    ['Parque ou unidade de conservação',{k:['GEOSAMPA_cadparcs_parque_unidade_conservacao','pde_outra_unidade_conservacao']}],
    ['Vegetação significativa',{k:['GEOSAMPA_cgpabi_vegetacao_significativa']}],
    ['Árvores na calçada a até 30 m',{k:['arvore_v2'],info:1}],
    ['Manancial',{k:['manancial_guarapiranga','manancial_billings','manancial_juquery']}],
    ['Área contaminada no terreno',{k:['area_contaminada_reabilitada_svma','GEOSAMPA_area_contaminada_sigac']}],
    ['Área contaminada a até 30 m',{k:['area_contaminada_reabilitada_svma@30','GEOSAMPA_area_contaminada_sigac@30']}]]],
  ['Patrimônio',[
    ['Bem tombado',{k:['patrimonio_cultural_bem_tombado']}],
    ['Área envoltória (Conpresp, Condephaat, Iphan)',{k:['patrimonio_cultural_area_envoltoria_CONPRESP','patrimonio_cultural_area_envoltoria_CONDEPHAAT','patrimonio_cultural_area_envoltoria_IPHAN']}],
    ['ZEPEC-APC',{k:['zona_especial_preservacao_cultural_apc']}],
    ['Interesse arqueológico',{k:['patrimonio_cultural_area_arqueologica']}]]],
  ['Vias e redes',[
    ['Classificação viária (CET)',{k:['classificacao_viaria_cet'],info:1}],
    ['Melhoramento viário',{k:['geoconvias_lei_melhoramento_vigente']}],
    ['Faixa não edificável',{k:['geoconvias_faixa_nao_edificavel']}],
    ['Vila a até 20 m',{k:['enquadramento_vila']}],
    ['Linha de alta tensão a até 30 m',{k:['linha_alta_tensao_v2','linha_subterranea_alta_tensao']}],
    ['Ferrovia a até 30 m',{k:['ferrovia_mdc_v2']}],
    ['Rede da Comgás',{k:['rede_comgas'],info:1,vazio:'Nenhuma a até 100 m'}]]],
  ['Riscos e interferências',[
    ['Risco geológico',{k:['area_risco_geologico_v2']}],
    ['Restrição geotécnica',{k:['restricao_geotecnica']}],
    ['Influência do Metrô ou da CPTM',{k:['area_influencia_metro','area_influencia_trem']}]]]];
const REST_CAM=Object.fromEntries(GEO_CAMADAS.map(c=>[c[0],c]));

// Dados do terreno: a consulta pela poligonal ou a soma das consultas dos lotes (árvores e redes sem repetir).
function restDados(t){if(t.geoArea)return {fonte:'poligonal',em:t.geoArea.em,user:t.geoArea.user,camadas:t.geoArea.camadas,erros:t.geoArea.erros};
  const gs=t.insc.filter(i=>insCid(i)==='sp').map(i=>(i.geo||[])[0]).filter(Boolean);if(!gs.length)return null;
  const camadas={},erros=new Set();
  gs.forEach(g=>{Object.entries(g.camadas||{}).forEach(([k,fs])=>{const ja=camadas[k]||(camadas[k]=[]);
    fs.forEach(f=>{const id=JSON.stringify(Object.entries(f).filter(([c])=>c!=='_dist_m'));const o=ja.find(x=>x.__id===id);
      if(!o)ja.push({...f,__id:id});else if(f._dist_m!=null&&(o._dist_m==null||f._dist_m<o._dist_m))o._dist_m=f._dist_m})});(g.erros||[]).forEach(e=>erros.add(e))});
  Object.values(camadas).forEach(fs=>fs.sort((a,b)=>(a._dist_m??0)-(b._dist_m??0)));
  const ult=gs.slice().sort((a,b)=>String(b.em).localeCompare(String(a.em)))[0];
  return {fonte:'lotes',n:gs.length,em:ult.em,user:ult.user,camadas,erros:[...erros]}}

// PA pela poligonal, sem consulta: guardado por desenho da poligonal
const REST_PA={};
function restPA(t,d){const q=d?.camadas?.quota_ambiental;if(q&&q.length)return q.map(x=>x.pa).join(' / ');if(!t.poly)return null;
  const k=t.id+':'+JSON.stringify(t.poly);if(k in REST_PA)return REST_PA[k];
  REST_PA[k]=undefined;geoPA(t.poly).then(v=>{REST_PA[k]=v;if(UI.route==='terreno'&&UI.id===t.id)render()}).catch(()=>{REST_PA[k]=null;render()});return undefined}

function restLinha(t,d,[tema,o]){
  const cel=v=>`<div class="rs-l"><span class="k">${esc(tema)}</span><span class="v">${v}</span></div>`;
  if(o.pa){const v=restPA(t,d);return cel(v===undefined?'<span class="faint">Calculando...</span>':v?`<b>${esc(v)}</b><span class="faint rs-src">Lei 16.402/2016, Mapa 3</span>`:'<span class="ni">Sem poligonal</span>')}
  if(!d)return cel('<span class="faint">—</span>');
  const ks=o.sn?[o.sn]:o.k,erro=ks.some(k=>(d.erros||[]).includes(k)),vals=[...new Set(ks.flatMap(k=>{const c=REST_CAM[k];return c?geoVals(k,d.camadas[k],c[3]):[]}))];
  const grav=o.grav||REST_CAM[ks[0]]?.[4]||'';
  if(o.sn)return cel(vals.length?`<span class="chip ${grav}">Sim</span> <span class="faint">${esc(vals.join(', '))}</span>`:erro?'<span class="faint">Não respondeu</span>':'Não');
  if(!vals.length)return cel(erro?'<span class="faint">Não respondeu</span>':esc(o.vazio||'Não'));
  return cel(vals.map(v=>`<span class="chip ${o.info?'':grav}">${esc(v)}</span>`).join(' '))}

function secRestricoes(t){const sp=cidDoTerreno(t)==='sp',d=sp?restDados(t):null,ed=UI.role!=='Leitura',busc=REST_BUSCANDO===t.id;
  const cab=`<div class="sec-h"><h2>Restrições e entorno</h2>${sp&&ed&&t.poly?`<button class="btn sm text" data-a="rest-consultar" ${busc?'disabled':''}>${ic('search',16)}${busc?'Consultando...':t.geoArea?'Consultar de novo':'Consultar pela poligonal'}</button>`:''}</div>`;
  if(!sp)return `<section class="sec" id="sec-rest">${cab}<div class="sec-b"><div class="muted">Não disponível nesta cidade. O que a prefeitura de ${esc((t.municipio||'').split(' · ')[0]||'outra cidade')} traz está em cada lote, acima.</div></div></section>`;
  const orig=d?(d.fonte==='poligonal'?`GeoSampa pela poligonal do terreno, ${fdh(d.em)} por ${esc(d.user)}`:`GeoSampa por ${d.n} lote${d.n>1?'s':''} (inscrições), último em ${fdh(d.em)}`):'';
  return `<section class="sec" id="sec-rest">${cab}<div class="sec-b">
    ${d?`<div class="hint rs-fonte">${orig}</div>`:`<div class="hint rs-fonte">${t.poly?(GEO_BASE?'Sem consulta ao GeoSampa: consulte pela poligonal ou busque os lotes em Terreno › Inscrições.':'A consulta ao GeoSampa funciona na versão publicada.'):'Desenhe a poligonal do terreno para consultar.'}</div>`}
    ${REST_GRUPOS.map(([g,itens])=>`<div class="rs-g"><div class="rs-gt">${esc(g)}</div>${itens.map(i=>restLinha(t,d,i)).join('')}</div>`).join('')}
    ${d?'<div class="hint">O DXF do lote (Documentos) traz estes temas, cada um numa layer.</div>':''}
  </div></section>`}

// Histórico de uso do terreno e dos vizinhos: o que o GeoSampa sabe (áreas contaminadas cadastradas) e o que se pesquisou (digitado).
function secHistUso(t){const sp=cidDoTerreno(t)==='sp',d=sp?restDados(t):null,ed=UI.role!=='Leitura';
  const ac=d?[...new Set(['area_contaminada_reabilitada_svma','GEOSAMPA_area_contaminada_sigac','area_contaminada_reabilitada_svma@30','GEOSAMPA_area_contaminada_sigac@30'].flatMap(k=>(d.camadas[k]||[]).map(f=>{try{return REST_CAM[k][3](f)+(f._dist_m>0?` (a ${num(f._dist_m,0)} m)`:/@/.test(k)?'':' (no terreno)')}catch(e){return null}})).filter(Boolean))]:[];
  return `<section class="sec" id="sec-histuso"><div class="sec-h"><h2>Histórico de uso</h2></div><div class="sec-b">
    <div class="rs-l"><span class="k">Cadastro de áreas contaminadas (prefeitura e Cetesb)</span><span class="v">${!sp?'<span class="faint">Não disponível nesta cidade</span>':!d?'<span class="faint">Sem consulta ao GeoSampa</span>':ac.length?ac.map(v=>`<span class="chip warn">${esc(v)}</span>`).join(' '):'Nada cadastrado no terreno nem a até 30 m'}</span></div>
    <div class="field" style="margin-top:12px"><label for="hu-t">Pesquisa do histórico</label><textarea id="hu-t" data-ch="hist-uso" ${ed?'':'readonly'} placeholder="Fotos aéreas antigas, matrícula, Cetesb, vizinhos: o que funcionou aqui e em volta (posto, indústria, oficina...)">${esc(t.histUso||'')}</textarea></div>
  </div></section>`}

let REST_BUSCANDO=null;
// Consulta pela poligonal do terreno: as mesmas camadas da consulta do lote, para o terreno inteiro.
async function restConsultar(t){if(REST_BUSCANDO||!t.poly)return;if(!GEO_BASE){toast('A consulta ao GeoSampa funciona na versão publicada.',true);return}
  REST_BUSCANDO=t.id;render();
  try{const anel=t.poly.map(([la,ln])=>latLngUtm(la,ln));anel.push(anel[0]);
    const {camadas,erros}=await geoConsultar({type:'Polygon',coordinates:[anel]});
    const props=Object.fromEntries(Object.entries(camadas).map(([k,fs])=>[k,fs.map(f=>f.properties)]));
    const pa=await geoPA(t.poly).catch(()=>null);if(pa)props.quota_ambiental=[{pa}];
    t.geoArea={em:agora(),user:me(),camadas:props,erros};log(t,'GeoSampa consultado pela poligonal do terreno: restrições e entorno');save();
    toast(erros.length?`GeoSampa consultado; ${erros.length} camada${erros.length>1?'s':''} não respondeu.`:'GeoSampa consultado pela poligonal.')}
  catch(e){console.error(e);toast('Não foi possível consultar o GeoSampa agora. Tente de novo em instantes.',true)}
  finally{REST_BUSCANDO=null;render()}}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="rest-consultar"]');if(!a)return;const t=T(UI.id);if(t)restConsultar(t)});
document.addEventListener('change',e=>{const el=e.target.closest('[data-ch="hist-uso"]');if(!el)return;const t=T(UI.id);if(!t||UI.role==='Leitura')return;
  const v=el.value.trim();if(v===(t.histUso||''))return;t.histUso=v||undefined;save();render()});
