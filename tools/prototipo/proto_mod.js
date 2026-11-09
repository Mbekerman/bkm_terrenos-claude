
/* =====================================================================
   Módulos novos: tabela ordenável, mapa, dashboard, visão geral da ficha
   e quadro de tarefas. Injetado dentro do mesmo escopo do protótipo.
   ===================================================================== */
UI.sorts=UI.sorts||{};
UI.mp=UI.mp||{q:'',cor:'',zona:'',f:'',e:'',ocultas:[]};if(!UI.mp.apag)UI.mp.apag={};
/* o que a legenda apaga (terrenos por fase, etapa e subetapa; concorrência ligada, faixas e situações) fica guardado no navegador
   e vale em outra sessão (bkm-terrenos-mapa-legenda; pedido do Moisés, 5/nov/2026); a gravação é a cada desenho da legenda */
const MP_LGKEY='bkm-terrenos-mapa-legenda';
(()=>{let g=null;try{g=JSON.parse(localStorage.getItem(MP_LGKEY)||'null')}catch(e){}if(!g)return;
  if(g.apag&&typeof g.apag==='object')UI.mp.apag=g.apag;if(Array.isArray(g.mkOff))UI.mkOff=g.mkOff;if(g.merc===false)UI.mpMerc=false})();
function mpLegGuardar(){try{localStorage.setItem(MP_LGKEY,JSON.stringify({apag:UI.mp.apag||{},mkOff:UI.mkOff||[],merc:UI.mpMerc!==false}))}catch(e){}}
/* a camada de renda ou densidade e o filtro da concorrência ficam guardados no navegador, mas se apagam quando a pessoa fica
   fora da página Mapa por mais de MP_EXPIRA_MIN minutos (pedido do Moisés, 5/nov/2026); bkm-terrenos-mapa-visto é a última vez no mapa */
const MP_EXPIRA_MIN=30,MP_VISTO_KEY='bkm-terrenos-mapa-visto',MP_MFKEY='bkm-terrenos-mapa-filtro-conc';
function mpExpirar(){try{const v=Number(localStorage.getItem(MP_VISTO_KEY)||0);if(!v||Date.now()-v<=MP_EXPIRA_MIN*60000)return;
  localStorage.removeItem('bkm-terrenos-mapa-camada');localStorage.removeItem(MP_MFKEY);localStorage.removeItem(MP_VISTO_KEY);UI.mpSetor=null;UI.mf={}}catch(e){}}
function mpVisto(){try{localStorage.setItem(MP_VISTO_KEY,String(Date.now()))}catch(e){}}
mpExpirar();
setInterval(()=>{if(typeof naMapa==='function'&&naMapa()&&document.visibilityState==='visible')mpVisto()},15000);
addEventListener('pagehide',()=>{if(typeof naMapa==='function'&&naMapa())mpVisto()});
document.addEventListener('visibilitychange',()=>{if(typeof naMapa==='function'&&naMapa()){if(document.visibilityState==='hidden')mpVisto();else{const v=Number(localStorage.getItem(MP_VISTO_KEY)||0);if(v&&Date.now()-v>MP_EXPIRA_MIN*60000)render()}}});
UI.dash=UI.dash||{f:{},sel:['situacao','zona','valor','mes']};

/* ---------- situação do terreno (cor do pin, gráficos) ---------- */
// rótulo, cor, glifo no pin, cor do glifo. Etapas ativas em rampa de azul (ordem = avanço);
// Stand By, Comprado, Perdido e Descartado com cores próprias e glifo, para não depender só da cor.
const SIT={sem_negociacao:['Backlog','#8a8d91','·','#fff'],triagem:['Em Triagem','#8fc8f7','1','#1d2e5c'],
  estudos:['Estudos Preliminares','#4aa3f0','2','#fff'],negociacao:['Negociação','#0b74d6','3','#fff'],
  contrato:['Contrato','#1d2e5c','4','#fff'],stand_by:['Stand By','#c98a2e','‖','#fff'],comprado:['Comprado','#6f9a3a','✓','#fff'],
  perdido:['Perdido','#9a3b30','×','#fff'],descartado:['Descartado','#6b6560','–','#fff']};
/* nomes das etapas seguem a configuração da empresa */
const sitNome=k=>STAGES.find(s=>s[0]===k)?.[1]||SIT[k][0];
const sitMapa=t=>!t.neg?'sem_negociacao':t.neg.status==='ativo'?t.neg.etapa:t.neg.status;
const sitChip=k=>`<span class="sitchip"><span class="sw" style="background:${SIT[k][1]}"></span>${esc(sitNome(k))}</span>`;
const ativosBanco=()=>S.terrenos.filter(t=>t.situacao!=='arquivado');
/* mapa em três níveis, como o kanban: fases › etapas de uma fase (UI.mp.f) › subetapas de uma etapa (UI.mp.e).
   Cada nível tem a sua legenda (rótulo, cor, glifo, cor do glifo) e classifica o terreno; fora do nível = não aparece. */
const COR_FASE=['#0b74d6','#863d8f','#c67355','#00838f','#c2477a','#7d8a3e','#1d2e5c','#5f6368'];
const RAMPA=['#8fc8f7','#4aa3f0','#0b74d6','#0a4fa0','#1d2e5c'];
const rampa=(i,n)=>{const j=n<=1?2:Math.round(i*(RAMPA.length-1)/(n-1));return [RAMPA[j],j===0?'#1d2e5c':'#fff']};
function mpItens(){const m=UI.mp,sit=k=>({k,nome:SIT[k][0],cor:SIT[k][1],g:SIT[k][2],fg:SIT[k][3]});
  if(!m.f)return [...fasesL().filter(f=>f.ativo).map((f,i)=>({k:f.k,nome:f.nome,cor:COR_FASE[i%COR_FASE.length],g:String(i+1),fg:'#fff',desce:etapasF(f.k).length>0})),sit('sem_negociacao'),sit('perdido'),sit('descartado')];
  const L=m.e?(etapaF(m.f,m.e)?.subs||[]):etapasF(m.f);
  return [...L.map((x,i)=>{const [cor,fg]=rampa(i,L.length);return {k:x.k,nome:x.nome,cor,g:String(i+1),fg,desce:!m.e&&x.subs?.length>0}}),sit('stand_by')]}
function mpClasse(t){const m=UI.mp;
  if(!m.f){const a=faseAtual(t);if(!a)return 'sem_negociacao';if(!a.aberta&&['perdido','descartado'].includes(a.p?.status))return a.p.status;return a.k}
  const p=procDaFase(t,m.f);if(!p||(m.e&&p.etapa!==m.e))return null;return p.status==='stand_by'?'stand_by':m.e?p.sub:p.etapa}
const mpInfo=k=>{const x=mpItens().find(i=>i.k===k);return x?[x.nome,x.cor,x.g,x.fg]:['Sem subetapa','#8a8d91','·','#fff']};

/* ---------- geografia ---------- */
const distKm=(a,b,c,d)=>{const r=x=>x*Math.PI/180,R=6371,dl=r(c-a),dg=r(d-b);const h=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
const fKm=k=>k<1?`${Math.round(k*1000/10)*10} m`:`${num(k,1)} km`;
const areaPoly=pts=>{if(!pts||pts.length<3)return null;const lat0=pts.reduce((s,p)=>s+p[0],0)/pts.length*Math.PI/180,R=6371008;
  const xy=pts.map(([la,lo])=>[R*lo*Math.PI/180*Math.cos(lat0),R*la*Math.PI/180]);let a=0;for(let i=0;i<xy.length;i++){const [x1,y1]=xy[i],[x2,y2]=xy[(i+1)%xy.length];a+=x1*y2-x2*y1}return Math.abs(a)/2};
const centro=pts=>[pts.reduce((s,p)=>s+p[0],0)/pts.length,pts.reduce((s,p)=>s+p[1],0)/pts.length];
/* ponto do pino dentro da poligonal: o centro de massa; se cai fora (forma em L ou em U), a média dos vértices; se também cai fora, o meio do maior trecho de uma linha horizontal que passa pelo centro */
function centroPoly(p){let A=0,x=0,y=0;for(let i=0,j=p.length-1;i<p.length;j=i++){const f=p[j][1]*p[i][0]-p[i][1]*p[j][0];A+=f;x+=(p[j][1]+p[i][1])*f;y+=(p[j][0]+p[i][0])*f}
  const c=A?[y/(3*A),x/(3*A)]:centro(p);if(dentroPoly(c[0],c[1],p))return c;const m=centro(p);if(dentroPoly(m[0],m[1],p))return m;
  const lat=c[0],xs=[];for(let i=0,j=p.length-1;i<p.length;j=i++){const [yi,xi]=p[i],[yj,xj]=p[j];if((yi>lat)!==(yj>lat))xs.push(xi+(lat-yi)*(xj-xi)/(yj-yi))}xs.sort((a,b)=>a-b);
  let best=null;for(let k=0;k+1<xs.length;k+=2)if(!best||xs[k+1]-xs[k]>best[1]-best[0])best=[xs[k],xs[k+1]];return best?[lat,(best[0]+best[1])/2]:m}
const proximos=t=>t.lat==null?[]:(S.pontos||[]).map(p=>({...p,d:distKm(t.lat,t.lng,p.lat,p.lng)})).filter(p=>p.d<=15).sort((a,b)=>a.d-b.d);
const rotaUrl=(t,p)=>`https://www.google.com/maps/dir/?api=1&origin=${t.lat},${t.lng}&destination=${p.lat},${p.lng}&travelmode=driving`;
const CAT_POI={transporte:'Transporte',escola:'Escola',saude:'Saúde',comercio:'Comércio',lazer:'Lazer',empresa:'Empresa',outro:'Outro'};
/* entorno do terreno: lugares do Google a até RAIO_PE metros a pé, por categoria (no banco: app.entorno_categorias) */
const RAIO_PE=1500;
/* 5º item: o filtro do ruído (decisão do Moisés, 4/nov/2026; no banco, min_avaliacoes, isento_nomes, excluir_nomes e
   um_por_local_m): escola pública, creche, praça, shopping, estação, posto de saúde e hipermercado entram com qualquer número de
   avaliações (pelo nome, em "isento"); os demais comércios precisam de "min". Os nomes são trechos que valem no começo de uma
   palavra do nome (sem acento). Terminal de ônibus: o Google chama de bus_station também o ponto na rua (nome = endereço),
   que não tem avaliações; o terminal passa pelo nome. */
const ENT_CAT=[['metro_trem','Estação de metrô ou trem','estações de metrô ou trem',['subway_station','train_station','light_rail_station'],{}],
  ['shopping','Shopping center','shopping centers',['shopping_mall'],{min:50,isento:'shopping|plaza|mall|center|centro comercial',local:200}],
  ['hospital','Hospital ou posto de saúde','hospitais ou postos de saúde',['hospital'],{min:50,isento:'hospital|ubs|unidade basica|posto de saude|pronto|upa|ama|santa casa|maternidade',excluir:'veterinari|animais'}],
  ['escola','Escola ou creche','escolas ou creches',['school','preschool','primary_school','secondary_school'],{excluir:'autoescola|auto escola|condutores|vigilant|secretaria|conservatorio|musica|idioma|ingles|preparacao|psicopedagog|oficina|danca|natacao'}],
  ['supermercado','Supermercado','supermercados',['supermarket'],{min:50,isento:'hiper|atacad|carrefour|assai|makro|tenda|roldao|extra|pao de acucar'}],
  ['parque','Parque ou praça','parques ou praças',['park'],{min:50,isento:'praca|parque|jardim|bosque|largo|horto',excluir:'portaria|guarita|administracao|cabana|bebedouro|restaurante|delivery|corredor'}],
  ['onibus','Terminal de ônibus','terminais de ônibus',['bus_station'],{min:50,isento:'terminal|estacao|rodoviaria'}],
  ['faculdade','Faculdade','faculdades',['university'],{}]];
const ENT_BUSCA={},ENT_TENT=new Set();let ENT_TODOS=false;
const rotaPeUrl=(t,p)=>`https://www.google.com/maps/dir/?api=1&origin=${t.lat},${t.lng}&destination=${p.lat},${p.lng}${p.gid&&!String(p.gid).startsWith('ex')?'&destination_place_id='+encodeURIComponent(p.gid):''}&travelmode=walking`;
/* Pontos de interesse numa lista só (pedido do Moisés, 3/nov/2026): os lugares do Google (por categoria, a até RAIO_PE a pé)
   e os pontos cadastrados pela empresa (todos, sempre a pé pela rota; sem rota medida, linha reta; excluído só sai deste terreno), juntos, pela distância.
   Cada linha diz a categoria; a exclusão continua com a regra de cada origem (poiX). */
let EMP_TODOS=false;
const kmTxt=m=>m<1000?Math.round(m/10)*10+'\u00a0m':num(m/1000,m<10000?2:1)+'\u00a0km';
function pontosEmpresa(t){const ex=new Set((t.pontosExcl||[]).map(e=>e.id)),pts=(S.pontos||[]).filter(p=>!ex.has(p.id));const d=t.dist&&t.dist.lat===t.lat&&t.dist.lng===t.lng?t.dist.m:{};
  return pts.map(p=>{const x=d[p.id]||{},reta=distKm(t.lat,t.lng,p.lat,p.lng)*1000,c={nome:p.nome,cat:CAT_POI[p.cat]||'Outro',x:poiX('e',p.id,p.nome,t)};
    /* sempre a pé (pedido do Moisés, 4/nov/2026); sem rota medida, linha reta */
    if(x.pe!=null)return {...c,ord:x.pe,dist:kmTxt(x.pe),modo:`${x.pm} min a pé`,url:rotaPeUrl(t,p)};
    return {...c,ord:reta,dist:kmTxt(reta),modo:'em linha reta',url:rotaPeUrl(t,p)}})}
function entornoCard(t){if(t.lat==null)return '';
  const e=t.entorno,busc=ENT_BUSCA[t.id],mudou=e&&!(e.lat===t.lat&&e.lng===t.lng),raio=fKm(RAIO_PE/1000);
  const g=(e?.itens||[]).filter(x=>!x.excl).map(p=>({nome:p.nome,cat:ENT_CAT.find(c=>c[0]===p.cat)?.[1]||'Lugar',ord:p.pe,dist:kmTxt(p.pe),modo:p.min!=null?`${p.min} min a pé`:(e.semPe?'em linha reta':'a pé'),url:rotaPeUrl(t,p),x:poiX('g',p.gid,p.nome,t)}));
  const its=[...g,...pontosEmpresa(t)].sort((a,b)=>a.ord-b.ord),lim=ENT_TODOS?999:8;
  const vaz=e?ENT_CAT.filter(([k])=>!e.itens.some(x=>x.cat===k&&!x.excl)).map(c=>c[2]):[];
  const jun=l=>l.length>1?l.slice(0,-1).join(', ')+' e '+l[l.length-1]:l[0];
  const aviso=!e?(busc?`Buscando no Google lugares a até ${raio} a pé…`:GG?'Os lugares do Google ainda não foram buscados.':'Os lugares do Google são buscados quando o terreno é localizado; o Google não carrega neste link de visualização.'):'';
  let corpo=`${its.length?`<ul class="poil ent-l${UI.role!=='Leitura'?' com-x':''}">${its.slice(0,lim).map(x=>`<li><span><span class="t1">${esc(x.nome)}</span><span class="t2">${esc(x.cat)} · ${x.modo}<span class="so-m"> · ${x.dist}</span></span></span><span class="num poi-d">${x.dist}</span><a class="iconbtn sm poi-rota" href="${x.url}" target="_blank" rel="noopener" aria-label="Rota até ${esc(x.nome)}" title="Rota">${ic('rota',18)}</a>${x.x}</li>`).join('')}</ul>
    ${its.length>8?`<button class="linkbtn" data-a="ent-todos" style="margin-top:6px">${ENT_TODOS?'Mostrar menos':`Mostrar mais ${its.length-8}`}</button>`:''}`:(aviso?'':'<div class="muted">Nenhum ponto de interesse.</div>')}
    ${aviso?`<div class="muted"${its.length?' style="margin-top:8px"':''}>${aviso}</div>${!busc&&GG?`<button class="btn sm ed" style="margin-top:12px" data-a="ent-buscar" data-id="${t.id}">Buscar agora</button>`:''}`:''}
    ${vaz.length?`<div class="hint ent-sem">Sem ${jun(vaz)} a até ${raio} a pé.</div>`:''}
    ${e&&(busc||e.semPe||mudou)?`<div class="hint ent-pe">${busc?'Atualizando no Google… · ':''}${e.semPe?'Lugares do Google em linha reta (sem rota a pé) · ':''}${fd(e.em)}${mudou?' · <b>a localização mudou depois da busca</b>':''}</div>`:''}
    ${DIST_BUSCA_ON(t)?'<div class="hint">Medindo as rotas no Google…</div>':''}`;
  corpo+=poiExcluidos(t);
  return `<section class="sec" id="ent-card"><div class="sec-h"><h2>Pontos de interesse</h2><span class="faint" style="font-size:12px">distâncias a pé</span>${UI.role!=='Leitura'?`<button class="btn sm text ed" data-a="ent-add-ponto" data-id="${t.id}">${ic('add',16)}Adicionar ponto</button>`:''}</div><div class="sec-b">${corpo}</div></section>`}
/* excluir ponto de interesse. Do Google: marcado no próprio terreno (no banco: terreno_entorno.excluido_em);
   some só deste terreno e continua fora se a busca for refeita (o terreno mudou de lugar). Da empresa:
   desligado (ativo = false), some de todos os terrenos e do mapa. Os dois voltam por "Restaurar". */
const poiX=(tp,id,nome,t)=>UI.role==='Leitura'?'':`<button class="iconbtn poi-x" data-a="poi-excl" data-tp="${tp}" data-p="${esc(String(id))}" data-id="${t.id}" aria-label="Excluir ${esc(nome)}" title="Excluir">${ic('lixo',18)}</button>`;
let EXCL_VER=false;
function poiExcluidos(t){const g=(t.entorno?.itens||[]).filter(x=>x.excl).map(x=>({tp:'g',id:x.gid,nome:x.nome,...x.excl})),e=(t.pontosExcl||[]).map(x=>({tp:'e',...x,nome:(S.pontos||[]).find(p=>p.id===x.id)?.nome})).filter(x=>x.nome);
  const l=[...g,...e].sort((a,b)=>String(b.em).localeCompare(String(a.em)));if(!l.length)return '';
  return `<div class="ent-exc"><button class="linkbtn" data-a="poi-excl-ver" aria-expanded="${EXCL_VER}">${EXCL_VER?'Ocultar excluídos':`Excluídos (${l.length})`}</button>
    ${EXCL_VER?`<ul class="poil ent-l">${l.map(x=>`<li><span><span class="t1">${esc(x.nome)}</span><span class="t2">${x.tp==='g'?'Google':'Cadastrado pela empresa'} · excluído por ${esc(x.por)} em ${fd(x.em)}</span></span>${UI.role!=='Leitura'?`<button class="linkbtn ed" data-a="poi-rest" data-tp="${x.tp}" data-p="${esc(String(x.id))}" data-id="${t.id}">Restaurar</button>`:''}</li>`).join('')}</ul>`:''}</div>`}
const DIST_BUSCA_ON=t=>typeof DIST_BUSCA!=='undefined'&&DIST_BUSCA[t.id];
function entRefresh(t){if(UI.route!=='terreno'||UI.id!==t.id)return;const a=document.activeElement;
  if(a&&a.closest&&a.closest('.main')&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)){const el=document.getElementById('ent-card');if(el)el.outerHTML=entornoCard(t)}else render()}

/* ---------- tabela ordenável (listas) ---------- */
// cols: {k, l, v(row)=>html, s(row)=>valor para ordenar, cls}
function tabela(id,rows,cols,o={}){
  const st=UI.sorts[id]||o.padrao||{};let r=rows.slice();const c=cols.find(x=>x.k===st.k);
  if(c&&c.s)r.sort((a,b)=>{const x=c.s(a),y=c.s(b);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;
    const d=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'pt-BR',{numeric:true});return st.dir==='desc'?-d:d});
  if(!r.length)return `<div class="empty">${o.vazio||'Nada para mostrar.'}</div>`;
  return `<div class="dt-wrap"><table class="dt ${o.cls||''}"><thead><tr>${cols.map(x=>`<th class="col-${x.k} ${x.cls||''}" scope="col"${x.s?` aria-sort="${st.k===x.k?(st.dir==='desc'?'descending':'ascending'):'none'}"`:''}>${x.s?`<button type="button" class="dt-sort" data-a="sort" data-t="${id}" data-k="${x.k}">${x.l}<span class="dt-ar" aria-hidden="true">${st.k===x.k?(st.dir==='desc'?'↓':'↑'):'↕'}</span></button>`:x.l}</th>`).join('')}</tr></thead>
  <tbody>${r.map(row=>`<tr ${o.attr?o.attr(row):''}>${cols.map(x=>`<td class="col-${x.k} ${x.cls||''}">${x.v(row)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function ordenar(id,k){const st=UI.sorts[id];UI.sorts[id]=st&&st.k===k?(st.dir==='asc'?{k,dir:'desc'}:{}):{k,dir:'asc'}}

/* ---------- lista de terrenos em tabela ---------- */
const COLS_TERRENOS=[
  {k:'codigo',l:'Código',cls:'hm num faint',v:t=>t.codigo,s:t=>t.codigo},
  {k:'nome',l:'Terreno',cls:'esq',v:t=>`<div class="t1">${esc(t.nome)}</div><div class="t2">${esc([t.bairro,t.zona&&OPT.zona[t.zona]].filter(Boolean).join(' · '))}${areaAdotada(t)!=null?`<span class="so-m"> · ${m2(areaAdotada(t))}</span>`:''}</div>`,s:t=>t.nome},
  {k:'area',l:'Área',cls:'hm num',v:t=>{const a=areaAdotada(t);return a!=null?m2(a):'<span class="faint">—</span>'},s:t=>areaAdotada(t)},
  {k:'valor',l:'Valor pedido',cls:'num',v:t=>{const o=ofertaRef(t),a=areaAdotada(t);return o?.valor?`${mi(o.valor)}${a?`<div class="t2">${brl(o.valor/a)}/m²</div>`:''}`:'<span class="faint">—</span>'},s:t=>ofertaRef(t)?.valor??null},
  {k:'temp',l:'Temperatura',cls:'hm',v:t=>tempMini(t.neg?.temp),s:t=>t.neg?.temp??null},
  {k:'etapa',l:'Fase e etapa',v:t=>colFaseEtapa(t),s:t=>(fIdx(faseAtual(t)?.k)+1)*100+Object.keys(SIT).indexOf(sitMapa(t))},
  {k:'tarefa',l:'Próxima tarefa',cls:'hm',v:t=>{const pt=proxTarefa(t),at=atrasadas(t).length;return pt?`<div class="t2" style="color:var(--texto)">${esc(pt.titulo)}</div><div class="t2" style="${pt.prazo<HOJE?'color:var(--atraso,#b3261e);font-weight:600':''}">${fd(pt.prazo)}${at>1?` · ${at} atrasadas`:''}</div>`:'<span class="faint">—</span>'},s:t=>proxTarefa(t)?.prazo??null}];
const attrAbrir=from=>t=>`data-a="abrir" data-id="${t.id}" data-from="${from}" tabindex="0"`;

/* ===================== MAPA ===================== */
let MAPA=null,MINI=null,PINS=null,POIS=null,CONC=null,DES=null,BASE=null,MINI_DES=null;
/* a edição da poligonal acontece na página Mapa ou no mini-mapa da ficha (UI.edMini): estas dizem em qual */
const edMapa=()=>UI.edMini?MINI:MAPA,edArea=()=>UI.edMini?$('.mini-wrap'):$('.mapa-area');
// Satélite já vem com rótulos (ruas e lugares); sem Relevo nem opção sem rótulos (decisões do Moisés, 23/out/2026)
const CAMADAS_L={mapa:'Mapa',satelite:'Satélite'},CAMADAS_G={mapa:'Mapa',satelite:'Satélite'};
// motor do mapa: Google quando a chave carrega; Leaflet (Esri/OSM) como reserva
let GG=false;
function setBase(k){return GG?G_setBase(k):L_setBase(k)}
function desenhaPins(){return GG?G_desenhaPins():L_desenhaPins()}
/* Pontos de interesse da empresa fora do mapa (pedido do Moisés, 4/nov/2026): continuam na ficha (aba Entorno); POI_NO_MAPA volta a camada e o item da legenda */
const POI_NO_MAPA=false;
function desenhaPois(){desenhaConc();if(!POI_NO_MAPA)return;return GG?G_desenhaPois():L_desenhaPois()}
function desenhaConc(){return GG?G_desenhaConc():L_desenhaConc()}
function mostrarConc(on){if(GG)return G_mostrarConc(on);if(MAPA&&CONC){on?CONC.addTo(MAPA):MAPA.removeLayer(CONC)}}
/* ---------- menu do clique direito no mapa (no toque, segurar no vazio): novo terreno ali ---------- */
/* dois cliques no vazio do mapa, fora do desenho, também começam o terreno novo com o primeiro ponto ali (pedido do Moisés, 4/nov/2026) */
function mapaDuplo(lat,lng,alvo){if(UI.mpModo||UI.role==='Leitura'||TOQUE()||UI.edMini)return;
  if(alvo?.closest?.('.leaflet-marker-icon,.leaflet-interactive,.mp-barra,.mp-ctrl,.mp-legenda,.mp-cartao,.mp-ctx,button,a,input'))return;
  if(Date.now()-(UI.polyLongoEm||0)<500)return;ctxFechar();nvDesenhar([lat,lng])}
function ctxAbrir(x,y,lat,lng){ctxFechar();if(UI.mpModo||UI.role==='Leitura')return;const area=$('.mapa-area');if(!area)return;UI.ctxLL={lat,lng};
  const m=document.createElement('div');m.className='mp-ctx';m.setAttribute('role','menu');
  /* só o terreno: ponto de interesse e concorrência saíram do menu (pedido do Moisés, 4/nov/2026) */
  m.innerHTML=`<button role="menuitem" data-a="ctx-terreno">${ic('add',18)}Novo terreno aqui</button>`;
  area.appendChild(m);const W=area.clientWidth,H=area.clientHeight,w=m.offsetWidth,h=m.offsetHeight;
  m.style.left=Math.max(8,Math.min(W-w-8,x))+'px';m.style.top=Math.max(8,Math.min(H-h-8,y))+'px';m.querySelector('button')?.focus({preventScroll:true})}
function ctxFechar(){$('.mapa-area .mp-ctx')?.remove()}
function ctxAcao(a){const ll=UI.ctxLL;ctxFechar();if(!ll)return;
  if(a==='ctx-terreno')nvDesenhar([ll.lat,ll.lng])}
/* liga o menu no contêiner do mapa: clique direito (mouse) e toque longo no vazio (celular) */
function ctxGestos(el,ponto){if(!el||el.dataset.ctx)return;el.dataset.ctx='1';const xy=e=>{const r=el.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top]};
  let tm=null,x0=0,y0=0;const limpa=()=>{clearTimeout(tm);tm=null};
  /* no Android o toque longo também dispara contextmenu, com o dedo na tela: ali vale só o temporizador abaixo */
  el.addEventListener('contextmenu',e=>{e.preventDefault();if((UI.ctxTipo||'mouse')!=='mouse'||e.target.closest('.v-alvo'))return;const [x,y]=xy(e),ll=ponto(x,y);if(ll)ctxAbrir(x,y,ll.lat,ll.lng)});
  el.addEventListener('pointerdown',e=>{UI.ctxTipo=e.pointerType;if(e.pointerType==='mouse'||!e.isPrimary||UI.mpModo)return;limpa();x0=e.clientX;y0=e.clientY;const ev=e;
    tm=setTimeout(()=>{tm=null;if(Date.now()-(UI.polyLongoEm||0)<1200)return; /* segurou sobre a poligonal: é edição */
      UI.ctxToqueEm=Date.now();const [x,y]=xy(ev),ll=ponto(x,y);if(ll)aoSoltar(()=>ctxAbrir(x,y,ll.lat,ll.lng))},650)},true);
  el.addEventListener('pointermove',e=>{if(tm&&Math.hypot(e.clientX-x0,e.clientY-y0)>8)limpa()},true);
  ['pointerup','pointercancel'].forEach(t=>el.addEventListener(t,limpa,true))}
document.addEventListener('pointerdown',e=>{if($('.mp-ctx')&&!e.target.closest('.mp-ctx'))ctxFechar()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('.mp-ctx')){ctxFechar();e.preventDefault()}});
function desenhaRascunho(){return GG?G_desenhaRascunho():L_desenhaRascunho()}
function initMapa(){const r=GG?G_initMapa():L_initMapa();mpCtrlObs();return r}
/* tema escuro: a visão Mapa fica escura (Google pelo colorScheme, que só vale ao criar o mapa; Leaflet pelo cinza-escuro da Esri). O satélite não muda */
const temaEscuro=()=>document.documentElement.dataset.tema==='escuro';
function temaMapa(){if(!MAPA||!$('#mapa'))return;if(GG){if(MAPA.__escuro!==temaEscuro())G_initMapa()}else if(mpBaseAtual()==='mapa')L_setBase('mapa')}
/* fundo do mapa: sem botão Mapa/Satélite; Satélite só com a camada de renda ou densidade ligada (pedido do Moisés, 5/nov/2026) */
/* posição e zoom do mapa guardados no navegador: a página Mapa abre onde a pessoa deixou (pedido do Moisés, 5/nov/2026) */
const MP_VKEY='bkm-terrenos-mapa-vista';
function mpVistaGuardada(){try{const v=JSON.parse(localStorage.getItem(MP_VKEY)||'null');return v&&isFinite(v.c?.lat)&&isFinite(v.c?.lng)&&isFinite(v.z)?v:null}catch(e){return null}}
function mpVistaGuardar(v){try{localStorage.setItem(MP_VKEY,JSON.stringify({c:{lat:+(+v.c.lat).toFixed(6),lng:+(+v.c.lng).toFixed(6)},z:v.z}))}catch(e){}}
/* tipo de mapa: o escolhido nos três pontinhos, guardado no navegador (bkm-terrenos-mapa-tipo; padrão Mapa); com renda ou
   densidade ligada, Satélite, a menos que a pessoa troque enquanto a camada está ligada (vale só até desligar) */
const MP_TKEY='bkm-terrenos-mapa-tipo';
function mpTipo(){try{return localStorage.getItem(MP_TKEY)==='satelite'?'satelite':'mapa'}catch(e){return 'mapa'}}
function mpBaseAtual(){return typeof rdCamada==='function'&&rdCamada()?(UI.mpBaseCam||'satelite'):mpTipo()}
function mpTipoEscolher(v){v=v==='satelite'?'satelite':'mapa';if(typeof rdCamada==='function'&&rdCamada())UI.mpBaseCam=v;else try{localStorage.setItem(MP_TKEY,v)}catch(e){}setBase(mpBaseAtual())}
/* botões do canto do mapa: minha localização e tela cheia (o controle de câmera do Google saiu; decisão do Moisés, 23/out/2026).
   Sobem acima do cartão do terreno e do aviso de desenho quando eles ocupam o pé do mapa. */
function mpCtrlHtml(){const on=document.body.classList.contains('mp-cheia');
  return `${GG?`<button type="button" class="mp-cb sv-x" data-a="sv-fechar" title="Fechar o Street View (Esc)" aria-label="Fechar o Street View">${ic('close',22)}</button>`:''}<div id="mp-ctrl" class="mp-ctrl"><button type="button" class="mp-cb mp-rg" data-a="rg-abrir" aria-pressed="${UI.mpModo==='regua'}" title="Régua" aria-label="Régua">${ic('regua',22)}</button><button type="button" class="mp-cb" data-a="mp-eu" title="Minha localização" aria-label="Centralizar na minha localização">${ic('eu',22)}</button>
    <button type="button" class="mp-cb" data-a="mp-cheia" aria-pressed="${on}" title="${on?'Sair da tela cheia':'Tela cheia'}" aria-label="${on?'Sair da tela cheia':'Tela cheia'}">${ic(on?'telaSair':'tela',22)}</button></div>`}
/* o bonequinho do Street View fica sempre no mesmo lugar do canto (64 px acima do pé do mapa, 32 de altura): reserva o lugar
   dele mesmo antes de o Google desenhá-lo ou enquanto o mapa muda de tamanho (tela cheia), senão a tela cheia cai em cima dele */
function mpCtrlPos(){const a=$('.mapa-area'),c=$('#mp-ctrl');if(!a||!c)return;const ar=a.getBoundingClientRect();let topo=ar.bottom;
  if(GG&&!a.classList.contains('sv-on'))topo=ar.bottom-64;
  ['#mp-cartao','#mp-modo','.mapa-area .gm-svpc'].forEach(s=>{const e=$(s);if(!e||!e.offsetHeight)return;const r=e.getBoundingClientRect();if(r.bottom>ar.bottom-80&&r.right>ar.right-80)topo=Math.min(topo,r.top)});
  c.style.bottom=topo<ar.bottom?Math.round(ar.bottom-topo+12)+'px':''}
function mpCtrlObs(){const a=$('.mapa-area');if(!a||a.__ro||!window.ResizeObserver)return mpCtrlPos();a.__ro=new ResizeObserver(mpCtrlPos);[a,$('#mp-cartao'),$('#mp-modo')].forEach(e=>e&&a.__ro.observe(e));mpCtrlPos()}
/* tela cheia: o mapa cobre a página (classe no body, que também serve ao iPhone, sem tela cheia de elemento) e, onde der, o navegador esconde as próprias barras */
let mpCheiaApi=false;
function mpTelaCheia(on){const b=document.body;if(on===undefined)on=!b.classList.contains('mp-cheia');
  b.classList.toggle('mp-cheia',on);
  if(on){const r=document.documentElement;try{const p=r.requestFullscreen?.({navigationUI:'hide'});mpCheiaApi=!!p;p?.catch?.(()=>{mpCheiaApi=false})}catch(e){mpCheiaApi=false}}
  else if(document.fullscreenElement&&mpCheiaApi){mpCheiaApi=false;document.exitFullscreen?.().catch?.(()=>{})}
  const k=$('[data-a="mp-cheia"]');if(k){k.setAttribute('aria-pressed',on);k.title=k.ariaLabel=on?'Sair da tela cheia':'Tela cheia';k.innerHTML=ic(on?'telaSair':'tela',22)}
  if(!GG)setTimeout(()=>MAPA?.invalidateSize?.(),60);setTimeout(mpCtrlPos,80)}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&mpCheiaApi){mpCheiaApi=false;if(document.body.classList.contains('mp-cheia'))mpTelaCheia(false)}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('mp-cheia')&&!e.defaultPrevented&&!$('.mapa-area.sv-on')&&!document.fullscreenElement&&!UI.modal&&!UI.fichaSheet&&!UI.mpModo&&!$('.mp-ctx')&&!$('.v-menu')){mpTelaCheia(false);e.preventDefault()}});
/* minha localização: ponto azul com o círculo da precisão; centra o mapa */
function mpEu(){if(!navigator.geolocation){toast('Este navegador não informa a localização.',true);return}
  const b=$('[data-a="mp-eu"]');b?.classList.add('busca');
  navigator.geolocation.getCurrentPosition(p=>{$('[data-a="mp-eu"]')?.classList.remove('busca');UI.mpEu={lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy};desenhaEu(true)},
    e=>{$('[data-a="mp-eu"]')?.classList.remove('busca');toast(e.code===1?'A localização está bloqueada. Libere o acesso à localização para este site no navegador.':'Não foi possível obter sua localização agora.',true)},
    {enableHighAccuracy:true,timeout:15000,maximumAge:30000})}
function desenhaEu(centrar){const u=UI.mpEu;if(!MAPA||!u)return;return GG?G_eu(u,centrar):L_eu(u,centrar)}
let EU=null;
function L_eu(u,centrar){EU?.remove();EU=L.layerGroup([L.circle([u.lat,u.lng],{radius:u.acc||0,color:'#1a73e8',weight:1,fillOpacity:.12,interactive:false}),
  L.circleMarker([u.lat,u.lng],{radius:7,color:'#fff',weight:2,fillColor:'#1a73e8',fillOpacity:1,interactive:false})]).addTo(MAPA);
  if(centrar)MAPA.setView([u.lat,u.lng],Math.max(MAPA.getZoom()||0,17))}
function focar(t){const r=GG?G_focar(t):L_focar(t);if(UI.fichaSheet&&innerWidth>=900)setTimeout(()=>mpLivre(t),400);return r}
function initMini(){return GG?G_initMini():L_initMini()}
function fecharPopup(){if(GG)G_fecharPopup();else MAPA?.closePopup?.()}
function mostrarPois(on){if(GG)return G_mostrarPois(on);if(MAPA&&POIS){on?POIS.addTo(MAPA):MAPA.removeLayer(POIS)}}
function camada(k,el){
  const esri='https://server.arcgisonline.com/ArcGIS/rest/services/';
  const mk=(u,o)=>L.tileLayer(u,Object.assign({maxZoom:19,crossOrigin:true},o));
  const cinza=temaEscuro()?'Dark_Gray':'Light_Gray';
  const ls=k==='mapa'?[mk(esri+`Canvas/World_${cinza}_Base/MapServer/tile/{z}/{y}/{x}`,{maxNativeZoom:16,attribution:'Mapa © Esri, HERE, Garmin, © OpenStreetMap'}),mk(esri+`Canvas/World_${cinza}_Reference/MapServer/tile/{z}/{y}/{x}`,{maxNativeZoom:16})]
    :k==='ruas'?[mk('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'})]
    :[mk(esri+'World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Imagens © Esri'}),mk(esri+'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'),mk(esri+'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}')];
  let ok=false;ls.forEach(l=>{l.on('tileload',()=>{ok=true;el.classList.remove('sem-fundo')});l.on('tileerror',()=>{if(!ok)el.classList.add('sem-fundo')})});
  return L.layerGroup(ls);
}
function pinIcon(k,sel){const [,c,g,fg]=Array.isArray(k)?k:SIT[k];return L.divIcon({className:'pin'+(sel?' sel':''),html:`<span class="pin-b" style="background:${c}"><b class="pin-d" style="background:${fg}"></b></span>`,iconSize:[30,40],iconAnchor:[15,38],popupAnchor:[0,-34],tooltipAnchor:[0,-34]})}
const poiIcon=()=>L.divIcon({className:'poi',html:'<span class="poi-b"></span>',iconSize:[14,14],iconAnchor:[7,7],tooltipAnchor:[0,-8]});
function mpVisiveis(){const m=UI.mp,q=m.q.trim().toLowerCase();
  return fxLista('mapa').filter(t=>mpClasse(t)!=null&&!mpApagado(t)).filter(t=>!q||bateBusca(t,q))}
/* itens apagados na legenda, por nível ('fase|etapa' → chaves), valem em qualquer nível aberto (pedido do Moisés, 4/nov/2026):
   apagar uma fase ou etapa apaga tudo que está dentro dela, sem abrir e fechar um a um */
const mpApag=lv=>(UI.mp.apag||(UI.mp.apag={}))[lv]||[];
function mpApagado(t){const m=UI.mp,sf=m.f,se=m.e;
  try{if((m.apag?.['*']||[]).length)return true;for(const [lv,l] of Object.entries(m.apag||{})){if(!l.length||lv==='*')continue;const [f,e]=lv.split('|');m.f=f;m.e=e;const c=mpClasse(t);if(c!=null&&l.includes(c))return true}return false}finally{m.f=sf;m.e=se}}
function mpApagar(lv,k){const a=UI.mp.apag||(UI.mp.apag={}),l=a[lv]||[];a[lv]=l.includes(k)?l.filter(x=>x!==k):[...l,k];if(!a[lv].length)delete a[lv]}
const mpTemApag=()=>Object.values(UI.mp.apag||{}).some(l=>l.length);
/* lista lateral do mapa: a bolinha com o código do terreno (na cor do nível aberto na legenda), o nome e a área; a lupa abre a ficha.
   Clicar no pino ou na poligonal seleciona o terreno aqui (não há balão no mapa). */
/* cor da bolinha da lista: sempre a da subetapa do terreno (pedido do Moisés, 4/nov/2026), a mesma que a legenda dá a ela
   quando se desce até a etapa; etapa sem subetapas usa a cor da etapa; Stand By, Perdido, Descartado e sem negociação, as deles */
function mpCorSub(t){const a=faseAtual(t),sit=k=>[SIT[k][1],SIT[k][3]];if(!a)return sit('sem_negociacao');
  const p=a.p;if(!p)return sit('sem_negociacao');if(['perdido','descartado'].includes(p.status))return sit(p.status);if(p.status==='stand_by')return sit('stand_by');
  const m=UI.mp,sf=m.f,se=m.e,e=etapaF(a.k,p.etapa);if(!e)return mpInfo(mpClasse(t)).slice(1,4).filter((x,i)=>i!==1);
  try{const sub=e.subs?.length&&p.sub;m.f=a.k;m.e=sub?p.etapa:'';const x=mpItens().find(i=>i.k===(sub?p.sub:p.etapa));return x?[x.cor,x.fg]:['#8a8d91','#fff']}finally{m.f=sf;m.e=se}}
const mpSubNome=t=>{const a=faseAtual(t),p=a?.p;if(!p)return 'Sem negociação';if(p.status!=='ativo')return ({stand_by:'Stand By',perdido:'Perdido',descartado:'Descartado'})[p.status]||p.status;const e=etapaF(a.k,p.etapa);return [e?.nome,p.sub&&e?.subs?.find(x=>x.k===p.sub)?.nome].filter(Boolean).join(' › ')};
function mpItem(t,cartao){const [nm,c,g,fg]=mpInfo(mpClasse(t)),cs=mpCorSub(t),sel=UI.mpSel===t.id,ad=areaAdotada(t)||(t.poly?areaPoly(t.poly):null);
  const acoes=sel&&t.lat!=null?`<div class="mp-it-a">${UI.role!=='Leitura'?`<button class="linkbtn" data-a="mp-desenhar" data-id="${t.id}">${t.poly?'Editar':'Desenhar'} poligonal</button>`:''}${GG?`<button class="linkbtn" data-a="mp-sv" data-id="${t.id}">Street View</button>`:''}</div>`:'';
  return `<div class="mp-it${sel?' sel':''}${cartao?' cartao':''}" data-a="mp-foco" data-id="${t.id}" tabindex="0" role="listitem" aria-current="${sel}">
    <span class="pin-mini mp-cod" style="background:${cs[0]};color:${cs[1]}" title="${esc(t.nome)} · ${esc(mpSubNome(t))}">${esc(t.codigo)}</span>
    <div class="mp-it-t"><div class="t1">${esc(t.nome)}</div><div class="t2">${ad?num(Math.round(ad))+'\u00a0m²':'Área não informada'} · ${esc(nm)}${t.lat==null?' · <span style="color:var(--terracota)">sem localização</span>':''}</div></div>
    <button class="iconbtn mp-lupa" data-a="fs-abrir" data-id="${t.id}" title="Ver ficha" aria-label="Ver ficha de ${esc(t.nome)}">${bi('busca',22)}</button>${cartao?`<button class="iconbtn mp-lupa mp-fx" data-a="mp-desel" title="Fechar" aria-label="Fechar">${ic('close',22)}</button>`:''}${acoes}</div>`}
/* ao descer ou subir de nível, o mapa enquadra os terrenos que ficaram */
function mpEnquadrar(){if(!MAPA)return;const pts=mpVisiveis().filter(t=>t.lat!=null).map(t=>[t.lat,t.lng]);if(!pts.length)return;
  if(GG)gEnquadrar(pts.map(([a,b])=>gLL(a,b)),15);else MAPA.fitBounds(pts,{padding:[48,48],maxZoom:15,animate:false})}
function mpLista(){const v=mpVisiveis(),sem=v.filter(t=>t.lat==null),ord=mpItens().map(i=>i.k);
  const rows=v.slice().sort((a,b)=>ord.indexOf(mpClasse(a))-ord.indexOf(mpClasse(b))||a.nome.localeCompare(b.nome,'pt'));
  return `${entornoHtml()}<div class="mp-resumo"><span><b>${v.length}</b> terrenos</span><span><b>${num(v.reduce((s,t)=>s+(areaAdotada(t)||0),0))}</b> m²</span></div>
  ${rows.length?`<div class="mp-lst" role="list">${rows.map(t=>mpItem(t)).join('')}</div>`:'<div class="empty">Nenhum terreno com esses filtros.</div>'}
  ${sem.length?`<div class="hint" style="margin-top:8px">${sem.length} sem localização. Clique na linha para marcar no mapa.</div>`:''}`;
}
/* seleciona o terreno a partir do mapa: acende o pino, destaca a linha (rolando só a lista) e, no celular, mostra o cartão sobre o mapa */
function mpMarcarPinos(){const on=(id,el)=>el?.classList.toggle('sel',UI.mpSel===id);  /* sem redesenhar: o segundo clique de um duplo clique precisa cair no mesmo pino */
  if(GG)gPinsSel();else PINS?.eachLayer(l=>{if(l._terreno){on(l._terreno,l.getElement());l.setZIndexOffset(UI.mpSel===l._terreno?1000:0)}})}
/* ficha do terreno num painel sobre o mapa (a lupa da lista): a Visão geral, só para ler, sem o mapa; "Abrir ficha completa" sai do mapa */
function fichaSheet(){let el=$('#ficha-sheet');const t=UI.fichaSheet&&UI.route==='mapa'?T(UI.fichaSheet):null;
  if(!t){UI.fichaSheet=null;el?.remove();return}
  if(!el){el=document.createElement('aside');el.id='ficha-sheet';el.className='ficha-sheet';el.setAttribute('role','dialog');el.setAttribute('aria-label','Ficha do terreno');document.body.appendChild(el)}
  const end=[t.logradouro&&t.logradouro+(t.numero?', '+t.numero:''),t.bairro,t.zona&&'Zona '+OPT.zona[t.zona]].filter(Boolean).join(' · ');
  el.innerHTML=`<div class="fs-h"><div class="fs-ht"><div class="fs-e"><span class="num">${t.codigo}</span>${sitChip(sitMapa(t))}</div><h2>${esc(t.nome)}</h2>${end?`<div class="fs-s">${esc(end)}</div>`:''}</div>
    <button class="iconbtn" data-a="fs-fechar" aria-label="Fechar" title="Fechar (Esc)">${ic('close',22)}</button></div>
    <div class="fs-b bl-c fs-ro">${abaGeral(t)}</div>
    <div class="fs-f"><button class="btn primary" data-a="abrir" data-id="${t.id}" data-tab="geral" data-from="mapa">Abrir ficha completa</button></div>`;
  el.querySelector('.g-loc')?.remove();el.querySelector('.fs-b').scrollTop=0;fsPos(el);
  if(el.dataset.id!==t.id){el.dataset.id=t.id;setTimeout(()=>mpLivre(t),60)}}
/* com o painel da ficha aberto (desktop), o terreno vai para o meio do pedaço do mapa que fica livre */
/* coluna Fase e etapa da tabela: fase em cima, etapa · subetapa (ou situação) embaixo, avisos numa fileira própria */
function colFaseEtapa(t){const a=faseAtual(t),ent=!a||a.k===faseEnt(),pe=x=>`<span class="end-p">${esc(x)}</span>`;
  let fase=faseN(ent?faseEnt():a.k),linha='',fl=[];
  if(ent){const n=t.neg;
    if(!n)linha='<span class="fe-st">Sem negociação</span>';
    else if(n.status!=='ativo')linha=`<span class="fe-st ${n.status}">${{perdido:'Perdido',descartado:'Descartado',stand_by:'Stand By',comprado:'Comprado'}[n.status]||n.status}</span>`;
    else{linha=[SN(n.etapa),n.sub?subN(n.sub):''].filter(Boolean).map(pe).join(' · ');if(subAtrasada(n))fl.push('<span class="fe-fl fe-warn">Acima do prazo</span>');if(n.pedido)fl.push('<span class="fe-fl fe-ap">Aguardando aprovação</span>')}}
  else{const p=a.p,e=etapaF(p.fase,p.etapa);
    linha=p.status==='ativo'?[e?.nome||p.etapa,p.sub?subF(p.fase,p.sub)?.nome||'':''].filter(Boolean).map(pe).join(' · '):`<span class="fe-st ${p.status}">${esc(procStatusN(p))}</span>`;
    if(procAtrasada(p))fl.push('<span class="fe-fl fe-warn">Acima do prazo</span>')}
  const n=fasesAbertas(t).length;if(n>1)fl.push(`<span class="fe-fl" title="${esc(fasesAbertas(t).map(faseN).join(', '))}">+${n-1} fase</span>`);
  return `<span class="c-etapa c-fe"><span class="fe-f">${esc(fase)}</span><span class="fe-e">${linha}</span>${fl.length?`<span class="fe-fls">${fl.join('')}</span>`:''}</span>`}
// no desktop a gaveta cobre a lista de terrenos, na largura dela
function fsPos(el){const l=$('.mapa-lado');if(!el||!l||innerWidth<900){if(el)el.style.left=el.style.top=el.style.width='';return}
  const r=l.getBoundingClientRect();el.style.left=Math.max(8,r.left)+'px';el.style.top=Math.max(8,r.top)+'px';el.style.width=Math.min(innerWidth-Math.max(8,r.left)-240,Math.max(320,r.width))+'px'}
addEventListener('resize',()=>fsPos($('#ficha-sheet')));
function mpLivre(t){const m=$('#mapa'),fs=$('#ficha-sheet');if(!MAPA||!m||!fs||t.lat==null||innerWidth<900)return;
  const r=m.getBoundingClientRect(),f=fs.getBoundingClientRect(),dir=r.right,x0=Math.max(r.left,f.right+16),cx=(x0+dir)/2-r.left,cy=r.height/2;
  if(GG){const w=x0-r.left;MAPA.panTo(gLL(t.lat,t.lng));if(w>0)MAPA.panBy(-Math.round(w/2),0);return}
  const p=MAPA.latLngToContainerPoint([t.lat,t.lng]);if(p.x>x0-r.left+40&&p.x<dir-r.left-40&&p.y>80&&p.y<r.height-40)return;
  MAPA.panBy([p.x-cx,p.y-cy],{animate:false})}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&UI.fichaSheet&&!UI.modal&&!$('.mp-ctx')&&!$('.v-menu')){UI.fichaSheet=null;fichaSheet();e.preventDefault()}});
function mpSelecionar(id){UI.mpSel=id;mpMarcarPinos();if(UI.fichaSheet&&id&&id!==UI.fichaSheet){UI.fichaSheet=id;fichaSheet()}const l=$('#mp-lista');if(l)l.innerHTML=mpLista();mpCartao();
  const lado=$('.mapa-lado'),it=lado?.querySelector(`.mp-it[data-id="${id}"]`);
  if(it&&getComputedStyle(lado).overflowY==='auto'){const a=lado.getBoundingClientRect(),r=it.getBoundingClientRect();
    if(r.top<a.top||r.bottom>a.bottom)lado.scrollBy({top:r.top-a.top-a.height/2+r.height/2,behavior:'smooth'})}}
function mpCartao(){const c=$('#mp-cartao');if(!c)return;const t=UI.mpSel&&T(UI.mpSel);c.innerHTML=t&&!UI.mpModo&&mpVisiveis().includes(t)?mpItem(t,true):''}
/* legenda em árvore (pedido do Moisés, 4/nov/2026): "Terrenos" abre as fases, a fase abre as etapas e a etapa
   abre as subetapas, um ramo aberto por vez; o nível mais fundo aberto é o que colore os pinos (UI.mp.f, UI.mp.e).
   Fechar a legenda fecha a árvore (proto_ui.js). Item sem filhos no nível aberto liga e desliga; fora dele fica apagado
   e o clique volta para aquele nível. */
function mpNivelItens(f,e){const m=UI.mp,sf=m.f,se=m.e,base=fxLista('mapa');m.f=f;m.e=e;
  try{const its=mpItens(),cl=new Map(base.map(t=>[t.id,mpClasse(t)]));return its.map(x=>({...x,n:base.filter(t=>cl.get(t.id)===x.k).length}))}finally{m.f=sf;m.e=se}}
function mpLegenda(){mpLegGuardar();const m=UI.mp,aberta=!!UI.mpArv;
  const pin=x=>`<span class="pin-mini" style="background:${x.cor};color:${x.fg}">${x.g}</span>`;
  const seta=ab=>`<span class="lg-s${ab?' ab':''}" aria-hidden="true">${ic('chev',14)}</span>`;
  /* a bolinha de qualquer item (e a de "Terrenos", data-l="*": todos) liga e desligam tudo que está nele (data-l = nível, data-v = item); o resto do ramo abre e fecha */
  const off=(lv,k,pai)=>pai||mpApag(lv).includes(k),tg=(lv,x)=>`data-l="${esc(lv)}" data-v="${esc(x.k)}"`;
  const ramo=(x,prof,ab,f,e,fora,lv,pai)=>`<button type="button" class="lg-i lg-a${fora?' lg-fora':''}${off(lv,x.k,pai)?' lg-off':''}" style="--p:${prof}" data-a="mp-abre" data-f="${esc(f)}" data-e="${esc(e)}" ${tg(lv,x)} aria-expanded="${ab}">${seta(ab)}<span class="lg-tg">${pin(x)}</span>${esc(x.nome)}<span class="n">${x.n}</span></button>`;
  const folha=(x,prof,ativo,f,e,lv,pai)=>ativo?`<button type="button" class="lg-i lg-a${pai?' lg-off':''}" style="--p:${prof}" data-a="mp-sit" ${tg(lv,x)} aria-pressed="${!off(lv,x.k,pai)}"><span class="lg-s"></span>${pin(x)}${esc(x.nome)}<span class="n">${x.n}</span></button>`
    :`<button type="button" class="lg-i lg-a lg-fora${off(lv,x.k,pai)?' lg-off':''}" style="--p:${prof}" data-a="mp-abre" data-f="${esc(f)}" data-e="${esc(e)}" ${tg(lv,x)}><span class="lg-s"></span><span class="lg-tg">${pin(x)}</span>${esc(x.nome)}<span class="n">${x.n}</span></button>`;
  const t0=off('*','todos');let h='';
  if(aberta)for(const x of mpNivelItens('','')){
    if(!x.desce){h+=folha(x,1,!m.f,'','','|',t0);continue}
    const ab=m.f===x.k,px=t0||off('|',x.k);h+=ramo(x,1,ab,ab?'':x.k,'',m.f&&!ab,'|',t0);if(!ab)continue;
    for(const y of mpNivelItens(x.k,'')){
      if(!y.desce){h+=folha(y,2,!m.e,x.k,'',x.k+'|',px);continue}
      const ab2=m.e===y.k,py=px||off(x.k+'|',y.k);h+=ramo(y,2,ab2,x.k,ab2?'':y.k,m.e&&!ab2,x.k+'|',px);if(!ab2)continue;
      for(const z of mpNivelItens(x.k,y.k))h+=folha(z,3,true,x.k,y.k,x.k+'|'+y.k,py)}}
  const tot=fxLista('mapa').length;
  return `<button type="button" class="lg-i lg-a${t0?' lg-off':''}" style="--p:0" data-a="mp-arv" data-l="*" data-v="todos" aria-expanded="${aberta}">${seta(aberta)}<span class="lg-poi lg-tg"><span class="pin-mini lg-nt"></span></span>Terrenos<span class="n">${tot}</span></button>`+h
    +`<hr class="lg-sep">`+(POI_NO_MAPA?`<button type="button" class="lg-i" data-a="mp-poi" aria-pressed="${UI.mpPoi!==false}"><span class="lg-poi"><span class="poi-b"></span></span>Pontos de interesse<span class="n">${(S.pontos||[]).length}</span></button>`:'')
    +(CC_MANUAL?`<button type="button" class="lg-i" data-a="mp-conc" aria-pressed="${UI.mpConc!==false}"><span class="lg-poi">${ccMarcaHtml()}</span>Concorrência<span class="n">${ccAtivos().length}</span></button>`:'')
    ;
}
function pgMapa(){mpExpirar();mpVisto();
  const opt=(o,v)=>Object.entries(o).map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${esc(l)}</option>`).join('');
  return `<div class="mapa-pg${mpLargura()<200?' mp-estreita':''}" style="--mp-w:${mpLargura()}px">
  <aside class="mapa-lado" aria-label="Terrenos no mapa">
    <h1 class="sr-only">Mapa</h1>
    ${fxBarra('mapa')}
    ${UI.mp.q||mpTemApag()?'<button class="linkbtn" data-a="mp-limpar" style="align-self:flex-start">Limpar busca e legenda</button>':''}
    <div id="mp-lista">${mpLista()}</div>
  </aside>
  <div class="mp-redim" role="separator" aria-orientation="vertical" aria-label="Largura da lista de terrenos" aria-valuemin="${MP_LMIN}" aria-valuemax="${mpLmax()}" aria-valuenow="${mpLargura()}" tabindex="0" title="Arraste para mudar a largura da lista (dois cliques voltam ao padrão)"></div>
  <section class="mapa-area" aria-label="Mapa dos terrenos">
    <div id="mapa" class="mapa"></div>
    <div class="mp-barra">
      ${mpBuscaHtml()}
      ${rdBarraBotao()}
    </div>
    <div id="mp-modo" class="mp-modo" aria-live="polite">${modoBanner()}</div>
    <div id="mp-cartao" class="mp-cartao" aria-live="polite"></div>
    ${mpCtrlHtml()}
    <details class="mp-legenda" ${(UI.mpLeg??lgAbertaGuardada())?'open':''}><summary><span class="lg-tit">Legenda</span>${lgFixarBtn()}</summary><div id="mp-leg" class="mp-leg-l">${mpLegenda()}</div></details>
    <div class="mp-aviso">Fundo do mapa indisponível nesta visualização.</div>
  </section></div>`;
}
function modoBanner(){const m=UI.mpModo;if(!m)return '';
  const t=UI.mpAlvo?T(UI.mpAlvo):null;
  if(m==='regua')return rgBanner();
  if(m==='poi')return `<span>Clique no mapa para marcar o ponto de interesse.</span><button class="btn sm text" data-a="mp-sair">Cancelar</button>`;
  if(m==='marcar')return `<span>Clique no mapa para localizar <b>${esc(t?.nome)}</b>.</span><button class="btn sm text" data-a="mp-sair">Cancelar</button>`;
  if(m==='desenhar'||m==='editar'){const n=(UI.desenho||[]).length,a=areaPoly(UI.desenho),tq=TOQUE(),seg=tq?'toque e segure':'clique com o botão direito';
    /* desktop, no desenho: uma barra fina na base do mapa com Cancelar e Concluir, alternativa ao Enter e aos dois cliques
       (pedido do Moisés, 5/nov/2026). Na edição continua sem barra (decisão de 4/nov/2026): clique fora salva, Esc cancela;
       Desfazer e Cancelar ficam no menu do ponto (clique direito), Ctrl+Z e Esc */
    if(!tq)return m==='desenhar'?`<span class="mp-q mp-fina">${n} ponto${n===1?'':'s'}${a?` · ${m2(Math.round(a))}`:''}</span><button class="btn sm text" data-a="mp-sair">Cancelar</button><button class="btn sm primary" data-a="mp-concluir" ${n>=3?'':'disabled'} title="${n>=3?'Salvar a poligonal (Enter)':'Marque pelo menos 3 pontos'}">Concluir</button>`:'';
    /* celular: só Cancelar e Concluir, sem texto (decisão do Moisés, 24/out/2026); Desfazer fica no menu do ponto */
    if(m==='editar'&&tq)return `<button class="btn sm text" data-a="mp-sair">Cancelar</button><button class="btn sm primary" data-a="mp-concluir">Concluir</button>`;
    const dica=m==='editar'?`arraste os pontos; ${seg} num ponto para excluí-lo ou adicionar outro depois dele. ${tq?'Toque':'Clique'} fora da poligonal para concluir.`
      :`${tq?'toque':'clique'} no mapa para marcar os vértices.${n?` Arraste um ponto para ajustá-lo; ${seg} nele para mais opções.`:''}`;
    return `<span>${m==='editar'?'Editando':'Desenhando'} a poligonal ${t?`de <b>${esc(t.nome)}</b>`:'do <b>terreno novo</b>'}: ${dica} <span class="mp-q">${n} ponto${n===1?'':'s'}${a?` · ${m2(a)}`:''}</span></span><button class="btn sm text" data-a="mp-desfazer" ${(UI.desHist||[]).length?'':'disabled'}>Desfazer</button><button class="btn sm text" data-a="mp-sair">Cancelar</button><button class="btn sm primary" data-a="mp-concluir" ${n>=3?'':'disabled'}>Concluir</button>`}
  return '';
}
function L_setBase(k){if(!MAPA)return;UI.mpBase=k;if(BASE)MAPA.removeLayer(BASE);BASE=camada(k,MAPA.getContainer().closest('.mapa-area')||MAPA.getContainer()).addTo(MAPA);BASE.eachLayer(l=>l.bringToBack());
  document.querySelectorAll('[data-a="mp-base"]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===k))}
function L_desenhaPins(){if(!MAPA||!PINS)return;PINS.clearLayers();
  mpVisiveis().filter(t=>t.lat!=null).forEach(t=>{const k=mpInfo(mpClasse(t));
    if(t.poly&&!(UI.mpModo&&UI.mpAlvo===t.id)){const pg=L.polygon(t.poly,{color:k[1],weight:2,fillOpacity:.18,interactive:!UI.mpModo})
      .on('click',()=>{if(Date.now()-(UI.polyLongoEm||0)<700)return;clearTimeout(pg._tc);pg._tc=setTimeout(()=>{if(!UI.mpModo)mpCliquePino(t.id)},260)})
      .on('dblclick',e=>{L.DomEvent.stop(e);clearTimeout(pg._tc);editarPoligonal(t.id)});
      pg.on('add',()=>polyGestos(pg.getElement(),t.id));pg.addTo(PINS)}
    const mk=L.marker([t.lat,t.lng],{icon:pinIcon(k,UI.mpSel===t.id),title:t.nome,riseOnHover:true,keyboard:!UI.mpModo,interactive:!UI.mpModo}).bindTooltip(esc(t.nome),{direction:'top'});
    mk.on('click',()=>{if(Date.now()-(UI.polyLongoEm||0)<900)return;mpCliquePino(t.id)});
    /* o pino fica sobre a poligonal: segurar nele (ou dois cliques) também entra em edição */
    if(t.poly&&t.poly.length>=3){mk.on('add',()=>polyGestos(mk.getElement(),t.id));mk.on('dblclick',e=>{L.DomEvent.stop(e);editarPoligonal(t.id)})}
    mk.addTo(PINS);mk._terreno=t.id})}
const concIcon=c=>L.divIcon({className:'conc',html:ccMarcaHtml(c),iconSize:[24,24],iconAnchor:[12,12],tooltipAnchor:[0,-14]});
function L_desenhaConc(){if(!MAPA||!CONC)return;CONC.clearLayers();ccAtivos().forEach(c=>L.marker([c.lat,c.lng],{icon:concIcon(c),title:c.nome,interactive:!UI.mpModo,keyboard:true}).on('click',()=>{if(!UI.mpModo)ccAbrir(c.id)}).addTo(CONC));
  if(!MAPA._cc){MAPA._cc=1;MAPA.on('click',ccFecharDoMapa)}}
function L_desenhaPois(){if(!MAPA||!POIS)return;POIS.clearLayers();(S.pontos||[]).forEach(p=>L.marker([p.lat,p.lng],{icon:poiIcon(),title:p.nome,interactive:!UI.mpModo}).bindTooltip(`${esc(p.nome)} · ${CAT_POI[p.cat]||''}`,{direction:'top'}).addTo(POIS))}
function L_desenhaRascunho(){const D=UI.edMini?MINI_DES:DES;if(!D)return;D.clearLayers();const p=UI.desenho||[];if(!p.length)return;
  (p.length>=3?L.polygon(p,{color:'#0094fe',weight:2,dashArray:UI.mpModo==='editar'?null:'6 4',fillOpacity:UI.mpModo==='editar'?.2:.12,interactive:false}):L.polyline(p,{color:'#0094fe',weight:2,dashArray:'6 4',interactive:false})).addTo(D);
  const poli=D.getLayers()[0];
  p.forEach((q,i)=>{const sel=UI.vSel===i;
    const mk=L.marker(q,{draggable:true,keyboard:false,zIndexOffset:sel?1000:0,icon:L.divIcon({className:'v-alvo',iconSize:[44,44],iconAnchor:[22,22],html:`<span class="v-dot${sel?' sel':''}"></span>`})});
    mk.on('add',()=>vGestos(mk.getElement(),i));
    mk.on('drag',e=>{const ll=e.target.getLatLng(),pp=p.map(x=>x.slice());pp[i]=[ll.lat,ll.lng];poli&&poli.setLatLngs(pp)});
    mk.on('dragstart',()=>{UI.vMenu=false;edArea()?.querySelector('.v-menu')?.remove()});
    mk.on('dragend',e=>{const ll=e.target.getLatLng();vArrastado(i,ll.lat,ll.lng)});
    mk.addTo(D)})}
function mpRefresh(){if(UI.edMini){miniEdRefresh();return}desenhaPois();const l=$('#mp-lista');if(l)l.innerHTML=mpLista();const g=$('#mp-leg');if(g)g.innerHTML=mpLegenda();const m=$('#mp-modo');if(m)m.innerHTML=modoBanner();
  if(MAPA){$('#mapa')?.classList.toggle('modo',!!UI.mpModo);desenhaPins();desenhaRascunho();vMenuDesenha();rgDesenha()}mpCartao()}
function L_initMapa(){const el=$('#mapa');if(!el)return;
  if(!window.L){el.innerHTML='<div class="mapa-erro">Não foi possível carregar a biblioteca de mapas. Verifique a conexão e recarregue a página.</div>';return}
  MAPA=L.map(el,{zoomControl:true,doubleClickZoom:false});
  L.control.scale({imperial:false,position:'bottomright'}).addTo(MAPA);
  setBase(mpBaseAtual());PINS=L.layerGroup().addTo(MAPA);POIS=L.layerGroup();CONC=L.layerGroup();DES=L.layerGroup().addTo(MAPA);if(UI.mpPoi!==false)POIS.addTo(MAPA);if(UI.mpConc!==false)CONC.addTo(MAPA);
  ctxGestos(el,(x,y)=>{const ll=MAPA.containerPointToLatLng([x,y]);return {lat:ll.lat,lng:ll.lng}});MAPA.on('movestart zoomstart',ctxFechar);
  desenhaPins();desenhaPois();desenhaRascunho();el.classList.toggle('modo',!!UI.mpModo);desenhaEu(false);
  const vista=UI.mpView||mpVistaGuardada(),enquadrar=()=>{if(vista)return MAPA.setView(vista.c,vista.z);const pts=ativosBanco().filter(t=>t.lat!=null).map(t=>[t.lat,t.lng]);pts.length?MAPA.fitBounds(pts,{padding:[48,48],maxZoom:15}):MAPA.setView([-23.55,-46.63],11)};
  enquadrar();
  // o contêiner só tem o tamanho final depois do layout: recalcula e reenquadra
  const mapaAtual=MAPA;requestAnimationFrame(()=>setTimeout(()=>{if(MAPA!==mapaAtual)return;MAPA.invalidateSize();enquadrar();if(UI.mpFocoPend){const t=T(UI.mpFocoPend);UI.mpFocoPend=null;if(t&&t.lat!=null)focar(t)}},60));
  MAPA.on('moveend',()=>{UI.mpView={c:MAPA.getCenter(),z:MAPA.getZoom()};mpVistaGuardar(UI.mpView);vMenuDesenha()});MAPA.on('movestart zoomstart',()=>$('.mapa-area .v-menu')?.remove());
  MAPA.on('preclick',e=>mapaClique(e.latlng.lat,e.latlng.lng));
  MAPA.on('dblclick',e=>mapaDuplo(e.latlng.lat,e.latlng.lng,e.originalEvent?.target));
  MAPA.on('click',e=>{if(UI.mpModo||e.originalEvent?.target?.closest?.('.leaflet-interactive'))return;if(UI.mpSel)mpSelecionar(null); /* clique no vazio tira a seleção */
    if(Date.now()-(CC.abertoEm||0)>350)rdAbrirEm(e.latlng.lat,e.latlng.lng)}); /* com a camada de renda ligada, abre o setor */
  if(UI.mpFoco){UI.mpFocoPend=UI.mpFoco;UI.mpFoco=null}
  rdPosMapa();
}
function L_focar(t){if(!MAPA)return;UI.mpSel=t.id;if(t.poly)MAPA.fitBounds(t.poly,{maxZoom:18,padding:[40,40]});else MAPA.setView([t.lat,t.lng],Math.max(MAPA.getZoom(),16));
  mpSelecionar(t.id)}
function mapaClique(lat,lng){const m=UI.mpModo;if(!m)return;
  if(m==='regua'){rgClique(lat,lng);return}
  if(m==='poi'){UI.mpModo=null;UI.novoPoi={lat,lng};UI.modal='poi';mpRefresh();renderModal();return}
  if(m==='marcar'){const t=T(UI.mpAlvo);UI.mpModo=null;Object.assign(t,{lat,lng,precisao:'aproximada'});log(t,'Localização marcada no mapa');save();mpRefresh();toast(`${t.nome}: localização marcada.`);return}
  if(m==='editar'){if(Date.now()-(UI.vToqueEm||0)<300||Date.now()-(UI.polyLongoEm||0)<700)return;
    if(UI.vMenu){vFecharMenu();return}
    if(!dentroPoly(lat,lng,UI.desenho||[]))concluirDesenho();return}
  if(m==='desenhar'){if(Date.now()-(UI.vToqueEm||0)<300)return; /* o toque foi num ponto, não no mapa */
    const a=UI.pdAnt,b=UI.pdUlt,repetido=a&&b&&b.t-a.t<400&&Math.hypot(b.x-a.x,b.y-a.y)<8;
    if(!TOQUE()&&((UI.cliqueN||1)>=2||repetido))return; /* segundo clique de um duplo clique: não marca ponto, o duplo clique conclui */
    const p=UI.desenho=UI.desenho||[];
    if(UI.vMenu){vFecharMenu();return}
    desGuardar();
    if(p.length<3)p.push([lat,lng]);
    else{ /* inclui o ponto no lado da poligonal que menos aumenta o contorno (no desenho em sequência, equivale a seguir em frente) */
      const d=(a,b)=>Math.hypot(a[0]-b[0],(a[1]-b[1])*Math.cos(a[0]*Math.PI/180)),q=[lat,lng];let melhor=p.length,custo=Infinity;
      p.forEach((a,i)=>{const b=p[(i+1)%p.length],c=d(a,q)+d(q,b)-d(a,b);if(c<custo){custo=c;melhor=i+1}});p.splice(melhor,0,q)}
    UI.desPontoEm=Date.now();desAtualizar()}
}
/* ---------- edição da poligonal ----------
   Entrar: celular, tocar e segurar sobre a poligonal; desktop, dois cliques sobre ela (ou "Editar poligonal" no balão).
   Editando: todos os pontos aparecem e podem ser arrastados. Tocar e segurar (celular), clique direito ou dois cliques (desktop) num ponto
   abre Excluir ponto / Adicionar ponto depois. Toque ou clique fora da poligonal conclui.
   No desktop a edição não tem a barra de aviso: o menu do ponto traz também Desfazer e Cancelar edição (Ctrl+Z e Esc). */
const TOQUE=()=>matchMedia('(pointer: coarse)').matches;
function desGuardar(){(UI.desHist=UI.desHist||[]).push((UI.desenho||[]).map(x=>x.slice()));if(UI.desHist.length>60)UI.desHist.shift()}
function desAtualizar(){desenhaRascunho();const b=$(UI.edMini?'#mini-modo':'#mp-modo');if(b)b.innerHTML=modoBanner();vMenuDesenha()}
function dentroPoly(lat,lng,p){let d=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const [yi,xi]=p[i],[yj,xj]=p[j];if((yi>lat)!==(yj>lat)&&lng<(xj-xi)*(lat-yi)/(yj-yi)+xi)d=!d}return d}
function editarPoligonal(id,mini){const t=T(id);if(!t||!t.poly||t.poly.length<3||UI.role==='Leitura')return;
  Object.assign(UI,{edMini:!!mini,mpModo:'editar',mpAlvo:id,desEditando:true,desenho:t.poly.map(q=>q.slice()),desHist:[],vSel:null,vMenu:false,vMover:false,desOrig:JSON.stringify(t.poly),polyLongoEm:Date.now()});
  if(mini)miniEdRefresh();else{fecharPopup();mpRefresh();enquadrarEdicao(t.poly)}if(!TOQUE())toast('Editando a poligonal. Clique direito num ponto para mais opções; clique fora para salvar.')}
/* enquadra a poligonal deixando livre a faixa do aviso (embaixo, no celular) */
function enquadrarEdicao(poly){if(!MAPA||!poly)return;const cel=matchMedia('(max-width: 899px)').matches,pad={top:cel?70:60,bottom:cel?150:40,left:40,right:40};
  if(GG){const b=new google.maps.LatLngBounds();poly.forEach(q=>b.extend(gLL(q[0],q[1])));MAPA.fitBounds(b,pad);google.maps.event.addListenerOnce(MAPA,'idle',()=>{if(MAPA.getZoom()>19)MAPA.setZoom(19)})}
  else MAPA.fitBounds(poly,{maxZoom:19,paddingTopLeft:[pad.left,pad.top],paddingBottomRight:[pad.right,pad.bottom]})}
function vSelecionar(i){UI.vSel=i;UI.vMenu=true;UI.vToqueEm=Date.now();desAtualizar()}
function vFecharMenu(){UI.vMenu=false;UI.vSel=null;desAtualizar()}
function vMenuDesenha(){const area=edArea();if(!area)return;area.querySelector('.v-menu')?.remove();
  if(!UI.vMenu||UI.vSel==null||!['desenhar','editar'].includes(UI.mpModo))return;const q=(UI.desenho||[])[UI.vSel];if(!q)return;
  const px=pontoNaTela(q[0],q[1]);if(!px)return;const m=document.createElement('div');m.className='v-menu';m.setAttribute('role','menu');
  const p=UI.desenho,a=areaPoly(p),ed=UI.mpModo==='editar',tq=TOQUE();
  m.innerHTML=`<div class="v-t">Ponto ${UI.vSel+1} de ${p.length}${a?` · ${m2(a)}`:''}</div><button role="menuitem" data-a="v-depois">Adicionar ponto depois</button><button role="menuitem" data-a="v-excluir" class="crit">Excluir ponto</button>`
    +(ed||!tq?`<hr><button role="menuitem" data-a="v-desfazer" ${(UI.desHist||[]).length?'':'disabled'}>Desfazer${tq?'':`<kbd>${/Mac/.test(navigator.platform)?"⌘Z":"Ctrl+Z"}</kbd>`}</button>${tq?'':`<button role="menuitem" data-a="v-cancelar">${ed?'Cancelar edição':'Cancelar desenho'}<kbd>Esc</kbd></button>`}`:'');
  area.appendChild(m);const W=area.clientWidth,H=area.clientHeight,w=m.offsetWidth,h=m.offsetHeight,ar=area.getBoundingClientRect();
  /* parte visível da área do mapa (a barra superior da página pode cobrir o topo) */
  const topo=Math.max(8,(document.querySelector('.top')?.getBoundingClientRect().bottom||0)-ar.top+8),base=Math.min(H,innerHeight-ar.top)-8;
  let x=px.x-w/2,y=px.y-h-24;if(y<topo)y=px.y+24;m.style.left=Math.max(8,Math.min(W-w-8,x))+'px';m.style.top=Math.max(topo,Math.min(base-h,y))+'px';
  m.querySelector('button')?.focus({preventScroll:true})}
function pontoNaTela(lat,lng){const M=edMapa();if(!M)return null;if(GG)return typeof gPontoNaTela==='function'?gPontoNaTela(lat,lng):null;const p=M.latLngToContainerPoint([lat,lng]);return {x:p.x,y:p.y}}
function desDesfazer(){const h=UI.desHist||[];if(!h.length)return false;UI.desenho=h.pop();UI.vSel=null;UI.vMenu=false;UI.vMover=false;mpRefresh();return true}
function desCancelar(){const des=UI.mpModo==='desenhar';Object.assign(UI,{mpModo:null,nvDesenho:false,desenho:null,desHist:null,vSel:null,vMenu:false,vMover:false});mpRefresh();toast(des?'Desenho cancelado.':'Edição cancelada, poligonal sem mudanças.')}
/* desenho no desktop sem barra: só um aviso passageiro ao começar */
function desAvisoInicio(){if(!TOQUE())toast('Clique no mapa para marcar os pontos. Enter, dois cliques ou Concluir salvam; Esc cancela.')}
function desSalvar(){if((UI.desenho||[]).length<3){toast('Marque pelo menos 3 pontos.',true);return}concluirDesenho()}
function vAcao(a){const i=UI.vSel,p=UI.desenho||[];
  if(a==='v-desfazer'){if(!desDesfazer())vFecharMenu();return}
  if(a==='v-cancelar'){desCancelar();return}
  if(i==null)return;
  if(a==='v-excluir'){if(UI.mpModo==='editar'&&p.length<=3){toast('A poligonal precisa de pelo menos 3 pontos.',true);vFecharMenu();return}
    desGuardar();p.splice(i,1);UI.vSel=null;UI.vMenu=false;desAtualizar();toast(`Ponto ${i+1} excluído.`);return}
  if(a==='v-depois'){if(p.length<2){vFecharMenu();return}desGuardar();const b=p[(i+1)%p.length];
    if(i===p.length-1&&p.length<3){vFecharMenu();return}
    p.splice(i+1,0,[(p[i][0]+b[0])/2,(p[i][1]+b[1])/2]);UI.vMenu=false;UI.vSel=i+1;desAtualizar();toast(`Ponto ${i+2} adicionado. Arraste-o para o lugar.`);
    setTimeout(()=>{if(UI.vSel===i+1&&!UI.vMenu){UI.vSel=null;desenhaRascunho()}},2500)}}
/* o toque longo é reconhecido com o dedo ainda na tela (vibra), mas a tela só muda quando o dedo sai:
   redesenhar o mapa com o dedo apoiado deixaria o arraste do mapa preso */
function aoSoltar(fn){if(navigator.vibrate)try{navigator.vibrate(15)}catch(e){}let feito=false;const ok=()=>{if(feito)return;feito=true;['pointerup','pointercancel','touchend','touchcancel'].forEach(t=>document.removeEventListener(t,ok,true));setTimeout(()=>{UI.polyLongoEm=Date.now();UI.vToqueEm=Date.now();fn()},0)};
  ['pointerup','pointercancel','touchend','touchcancel'].forEach(t=>document.addEventListener(t,ok,true))}
/* gestos num ponto: arrastar move; segurar (toque), clique direito ou dois cliques (mouse) abre o menu.
   O clique direito só vale com mouse: no Android o toque longo também dispara contextmenu, com o dedo ainda na tela. */
function vGestos(el,i){if(!el||el.dataset.vg)return;el.dataset.vg='1';el.classList.add('v-ponto');
  let tm=null,x0=0,y0=0,tipo='';const limpa=()=>{clearTimeout(tm);tm=null};
  el.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();if((e.pointerType||tipo)==='mouse'){UI.vToqueEm=Date.now();vSelecionar(i)}});
  el.addEventListener('pointerdown',e=>{UI.vToqueEm=Date.now();x0=e.clientX;y0=e.clientY;tipo=e.pointerType;if(e.button===2)return;
    if(e.pointerType==='touch'||e.pointerType==='pen'||TOQUE()){limpa();tm=setTimeout(()=>{tm=null;aoSoltar(()=>vSelecionar(i))},500)}});
  el.addEventListener('pointermove',e=>{if(tm&&Math.hypot(e.clientX-x0,e.clientY-y0)>8)limpa()});
  el.addEventListener('pointerup',()=>{UI.vToqueEm=Date.now();limpa()});['pointercancel','pointerleave'].forEach(t=>el.addEventListener(t,limpa));
  el.addEventListener('click',e=>{e.stopPropagation();UI.vToqueEm=Date.now()});
  el.addEventListener('dblclick',e=>{e.stopPropagation();e.preventDefault();UI.vToqueEm=Date.now();
    /* no desenho, o primeiro clique do duplo clique acabou de criar este ponto: o duplo clique salva, não abre o menu */
    if(UI.mpModo==='desenhar'&&!TOQUE()&&Date.now()-(UI.desPontoEm||0)<700){desSalvar();return}vSelecionar(i)})}
/* segurar sobre a poligonal (toque) entra em edição */
function polyGestos(el,id){if(!el||el.dataset.pg)return;el.dataset.pg='1';let tm=null,x0=0,y0=0;const limpa=()=>{clearTimeout(tm);tm=null};
  el.addEventListener('contextmenu',e=>e.preventDefault());
  el.addEventListener('pointerdown',e=>{if(UI.mpModo)return;x0=e.clientX;y0=e.clientY;if(e.pointerType==='mouse')return;limpa();tm=setTimeout(()=>{tm=null;UI.polyLongoEm=Date.now();aoSoltar(()=>editarPoligonal(id))},550)});
  el.addEventListener('pointermove',e=>{if(tm&&Math.hypot(e.clientX-x0,e.clientY-y0)>8)limpa()});
  ['pointerup','pointercancel','pointerleave'].forEach(t=>el.addEventListener(t,limpa))}
function vArrastado(i,lat,lng){desGuardar();UI.desenho[i]=[lat,lng];UI.vSel=null;UI.vMenu=false;UI.vToqueEm=Date.now();desAtualizar()}
document.addEventListener('click',e=>{const a=e.target.closest('.v-menu [data-a]');if(a){e.stopPropagation();UI.vToqueEm=Date.now();vAcao(a.dataset.a)}},true);
/* editando a poligonal, um clique fora do mapa cancela (decisão do Moisés, 24/out/2026); clique no mapa fora da poligonal conclui.
   É o clique, não o toque: arrastar o dedo para rolar a página não cancela. */
document.addEventListener('click',e=>{if(UI.mpModo!=='editar'||Date.now()-(UI.polyLongoEm||0)<500)return;const ar=edArea();
  if(!ar||ar.contains(e.target)||e.target.closest('#mp-modo,#mini-modo,.v-menu,.toast,#toast')||!document.contains(e.target))return;desCancelar()},true);
/* quantos cliques seguidos (e.detail) teve o último clique, para o desenho não marcar ponto no segundo clique de um duplo clique */
document.addEventListener('click',e=>{UI.cliqueN=e.detail||1},true);
document.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')return;UI.pdAnt=UI.pdUlt;UI.pdUlt={t:Date.now(),x:e.clientX,y:e.clientY}},true);
/* desenhando ou editando no desktop (decisão do Moisés, 4/nov/2026): dois cliques em qualquer lugar do mapa salvam; dois cliques fora do mapa cancelam.
   Os dois cliques num ponto abrem o menu dele (vGestos para a propagação). */
document.addEventListener('dblclick',e=>{if(!['desenhar','editar'].includes(UI.mpModo)||TOQUE())return;
  if(Date.now()-(UI.polyLongoEm||0)<500)return; /* este duplo clique é o que acabou de entrar na edição */
  const ar=edArea();if(!ar)return;
  /* o primeiro clique pode ter redesenhado o que estava sob o mouse (ex.: a linha da lista): vale o que está lá agora */
  const alvo=document.contains(e.target)?e.target:document.elementFromPoint(e.clientX,e.clientY);if(!alvo)return;
  if(alvo.closest('.v-menu,.v-ponto,#mp-modo,#mini-modo,.toast,#toast,.modal,input,textarea,select'))return;
  if(ar.contains(alvo)){if(alvo.closest('.mp-barra,.mp-ctrl,.mp-legenda,.mp-cartao,button,a,summary'))return;e.preventDefault();desSalvar()}
  else if(UI.mpModo==='desenhar')desCancelar()});
/* Esc no desenho vem antes dos outros Esc da página (quadro da concorrência, lugar do Google...): é ele que o usuário quer desfazer */
window.addEventListener('keydown',e=>{if(e.key!=='Escape'||!['desenhar','editar'].includes(UI.mpModo)||UI.modal||e.target.matches('input,textarea,select'))return;
  if($('.mp-ctx'))return; /* o menu do clique direito fecha primeiro */
  if(UI.vMenu)vFecharMenu();else desCancelar();e.preventDefault();e.stopImmediatePropagation()},true);
document.addEventListener('keydown',e=>{if(!['desenhar','editar'].includes(UI.mpModo)||e.target.matches('input,textarea,select'))return;
  if(e.key==='Enter'&&!UI.vMenu&&!e.target.closest('button,a,summary')){desSalvar();e.preventDefault()}
  else if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){desDesfazer();e.preventDefault()}
  else if((e.key==='Delete'||e.key==='Backspace')&&UI.vSel!=null){vAcao('v-excluir');e.preventDefault()}});
function concluirDesenho(){const t=T(UI.mpAlvo),p=UI.desenho||[];if(p.length<3)return;
  /* terreno novo: a poligonal desenhada é o passo 1 do cadastro */
  if(UI.nvDesenho){Object.assign(UI,{mpModo:null,nvDesenho:false,desenho:null,desHist:null,vSel:null,vMenu:false,vMover:false});mpRefresh();nvPoligonal(p,'mapa');return}
  if(UI.mpModo==='editar'&&JSON.stringify(p.map(x=>[+x[0].toFixed(7),+x[1].toFixed(7)]))===JSON.stringify((JSON.parse(UI.desOrig||'[]')).map(x=>[+(+x[0]).toFixed(7),+(+x[1]).toFixed(7)]))){
    Object.assign(UI,{mpModo:null,desenho:null,desHist:null,vSel:null,vMenu:false});mpRefresh();toast('Edição encerrada, sem mudanças.');return}
  t.poly=p.map(x=>[+x[0].toFixed(7),+x[1].toFixed(7)]);
  /* o pino acompanha a poligonal (pedido do Moisés, 24/out/2026): vai para o centro dela, senão fica para trás ou até fora */
  {const c=centroPoly(t.poly);t.lat=+c[0].toFixed(7);t.lng=+c[1].toFixed(7);if(!t.precisao||t.precisao==='nao_informada')t.precisao='aproximada'}
  const a=areaPoly(t.poly),a0=areaPoly(JSON.parse(UI.desOrig||'null')||[]);log(t,UI.desEditando?polyLogTxt(a0,a):`Poligonal desenhada no mapa: ${m2(a)}`);UI.mpModo=null;UI.desenho=null;UI.desHist=null;UI.vSel=null;UI.vMenu=false;UI.vMover=false;save();mpRefresh();toast(`Poligonal salva: ${m2(a)}.`);tpAuto(t)}

/* KMZ / KML */
async function lerKmz(file){let txt;
  if(/\.kmz$/i.test(file.name)){if(!window.JSZip)throw new Error('Não foi possível abrir KMZ: biblioteca de compactação indisponível.');
    const z=await JSZip.loadAsync(file);const f=Object.values(z.files).find(f=>/\.kml$/i.test(f.name));if(!f)throw new Error('O KMZ não tem um arquivo KML dentro.');txt=await f.async('text')}
  else txt=await file.text();
  const x=new DOMParser().parseFromString(txt,'application/xml');if(x.getElementsByTagName('parsererror').length)throw new Error('O arquivo não é um KML válido.');
  const crd=s=>String(s||'').trim().split(/\s+/).map(p=>{const [lng,lat]=p.split(',').map(Number);return [lat,lng]}).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
  const out=[...x.getElementsByTagName('Placemark')].map((p,i)=>{const nome=(p.getElementsByTagName('name')[0]?.textContent||'').trim()||`Item ${i+1}`;
    const pol=p.getElementsByTagName('Polygon')[0];
    if(pol){const ob=pol.getElementsByTagName('outerBoundaryIs')[0]||pol;let pts=crd(ob.getElementsByTagName('coordinates')[0]?.textContent);
      if(pts.length>3&&pts[0][0]===pts.at(-1)[0]&&pts[0][1]===pts.at(-1)[1])pts=pts.slice(0,-1);if(pts.length>=3)return {nome,tipo:'poligono',pts}}
    const pt=p.getElementsByTagName('Point')[0];if(pt){const c=crd(pt.getElementsByTagName('coordinates')[0]?.textContent);if(c.length)return {nome,tipo:'ponto',pts:c}}
    return null}).filter(Boolean);
  if(!out.length)throw new Error('Nenhum ponto ou polígono encontrado no arquivo.');return out}

/* ===================== DASHBOARD ===================== */
const DIMS={
  situacao:{l:'Terrenos por situação',v:t=>sitMapa(t),ord:Object.keys(SIT),lab:k=>sitNome(k),cor:k=>SIT[k][1]},
  zona:{l:'Terrenos por região',v:t=>t.zona||'nao_informado',ord:[...Object.keys(OPT.zona),'nao_informado'],lab:k=>k==='nao_informado'?'Não informada':OPT.zona[k]},
  corretor:{l:'Terrenos por corretor principal',v:t=>t.corretores.find(x=>x.principal)?.cid||'sem',lab:k=>k==='sem'?'Sem corretor':(corretor(k)?.nome||k)},
  origem:{l:'Terrenos por origem',v:t=>t.origem||'nao',lab:k=>OPT.origem[k]||'Não informada'},
  temperatura:{l:'Negociações ativas por temperatura',v:t=>t.neg?.status==='ativo'?String(t.neg.temp||0):null,ord:['5','4','3','2','1','0'],lab:k=>k==='0'?'Não avaliada':`${k} · ${TEMP[k]}`},
  valor:{l:'Valor pedido por etapa (negociações ativas)',dim:'situacao',v:t=>t.neg?.status==='ativo'?t.neg.etapa:null,ord:STAGES.map(s=>s[0]),lab:k=>SN(k),cor:k=>SIT[k][1],med:t=>ofertaRef(t)?.valor||0,fmt:v=>mi(v)},
  mes:{l:'Terrenos cadastrados por mês',linha:true,v:t=>(t.dataIdent||'').slice(0,7)}};
const DIM_DE=k=>DIMS[k].dim||k;
function dashBase(excl){const f=UI.dash.f;return ativosBanco().filter(t=>Object.entries(f).every(([d,vs])=>d===excl||!vs.length||vs.includes(DIMS[d].v(t))))}
function dashSerie(k){const d=DIMS[k],dd=DIM_DE(k),rows=dashBase(dd),m=new Map();
  rows.forEach(t=>{const v=d.v(t);if(v==null)return;m.set(v,(m.get(v)||0)+(d.med?d.med(t):1))});
  let ks=[...m.keys()];ks=d.ord?d.ord.filter(x=>m.has(x)):ks.sort((a,b)=>m.get(b)-m.get(a));return ks.map(x=>[x,m.get(x)])}
function grafBarras(k,grande){const d=DIMS[k],dd=DIM_DE(k),s=dashSerie(k),max=Math.max(1,...s.map(x=>x[1])),sel=UI.dash.f[dd]||[];
  if(!s.length)return '<div class="empty">Sem dados com estes filtros.</div>';
  const fmt=d.fmt||(v=>num(v));
  return `<div class="hb ${grande?'g':''}">${s.map(([x,v])=>{const on=sel.includes(x);return `<button type="button" class="hb-r ${on?'on':''} ${sel.length&&!on?'dim':''}" data-a="dash-f" data-d="${dd}" data-v="${esc(x)}" data-tip="${esc(d.lab(x))}: ${esc(fmt(v))}${d.med?'':v===1?' terreno':' terrenos'}" aria-pressed="${on}">
    <span class="hb-l">${esc(d.lab(x))}</span><span class="hb-t"><span class="hb-b" style="width:${Math.max(2,v/max*100)}%;background:${d.cor?d.cor(x):'var(--azul-bkm)'}"></span></span><span class="hb-v num">${fmt(v)}</span></button>`}).join('')}</div>`}
function grafLinha(k,grande){const d=DIMS[k],rows=dashBase('mes'),sel=UI.dash.f.mes||[];
  const meses=[];const b=pd(HOJE);for(let i=11;i>=0;i--){const x=new Date(b.getFullYear(),b.getMonth()-i,1);meses.push(`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`)}
  const v=meses.map(m=>rows.filter(t=>d.v(t)===m).length),max=Math.max(2,...v),W=640,H=grande?320:220,pl=36,pr=16,pt=20,pb=36,iw=W-pl-pr,ih=H-pt-pb;
  const X=i=>pl+i*iw/(meses.length-1),Y=y=>pt+ih-y/max*ih;const passo=Math.max(1,Math.ceil(max/4));const ticks=[];for(let y=0;y<=max;y+=passo)ticks.push(y);
  const lab=m=>{const [a,mm]=m.split('-');return `${MES[+mm-1]}/${a.slice(2)}`};const imax=v.indexOf(Math.max(...v));
  const linha=v.map((y,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join('');
  return `<svg class="gl" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(d.l)}">
  ${ticks.map(y=>`<line x1="${pl}" x2="${W-pr}" y1="${Y(y)}" y2="${Y(y)}" class="gl-grid"/><text x="${pl-8}" y="${Y(y)+4}" class="gl-ax" text-anchor="end">${y}</text>`).join('')}
  <path d="${linha}L${X(v.length-1)},${Y(0)}L${X(0)},${Y(0)}Z" class="gl-area"/><path d="${linha}" class="gl-line"/>
  ${meses.map((m,i)=>`${i%2===(meses.length-1)%2?`<text x="${X(i)}" y="${H-12}" class="gl-ax" text-anchor="middle">${lab(m)}</text>`:''}
    <circle cx="${X(i)}" cy="${Y(v[i])}" r="${sel.includes(m)?6:4}" class="gl-pt ${sel.includes(m)?'on':''}"/>${(i===imax||i===v.length-1)&&v[i]?`<text x="${X(i)}" y="${Y(v[i])-10}" class="gl-val" text-anchor="middle">${v[i]}</text>`:''}
    <rect x="${X(i)-iw/(meses.length-1)/2}" y="${pt}" width="${iw/(meses.length-1)}" height="${ih}" class="gl-hit" data-a="dash-f" data-d="mes" data-v="${m}" data-tip="${lab(m)}: ${v[i]} ${v[i]===1?'terreno cadastrado':'terrenos cadastrados'}"/>`).join('')}</svg>`}
const grafico=(k,g)=>DIMS[k].linha?grafLinha(k,g):grafBarras(k,g);
function tabelaGrafico(k){const d=DIMS[k];let s;
  if(d.linha){const rows=dashBase('mes'),m=new Map();rows.forEach(t=>{const v=d.v(t);m.set(v,(m.get(v)||0)+1)});s=[...m.entries()].sort((a,b)=>b[0].localeCompare(a[0]))}else s=dashSerie(k);
  return `<div class="dt-wrap"><table class="dt compacta"><thead><tr><th class="esq">${d.linha?'Mês':'Categoria'}</th><th>${d.med?'Valor pedido':'Terrenos'}</th></tr></thead><tbody>${s.map(([x,v])=>`<tr><td class="esq">${esc(d.linha?x:d.lab(x))}</td><td class="num">${d.fmt?d.fmt(v):v}</td></tr>`).join('')}</tbody></table></div>`}
function pgDash(){const f=UI.dash.f,rows=dashBase(null),ativos=rows.filter(t=>t.neg?.status==='ativo');
  const chips=Object.entries(f).flatMap(([d,vs])=>vs.map(v=>`<button class="fchip on" data-a="dash-f" data-d="${d}" data-v="${esc(v)}" aria-label="Remover filtro ${esc(DIMS[d].lab?DIMS[d].lab(v):v)}">${esc(d==='mes'?v.split('-').reverse().join('/'):DIMS[d].lab(v))}${ic('close',14)}</button>`));
  return `<div id="dash" class="dash">
  <div class="page-h"><div><h1>Dashboard</h1><div class="sub">Clique numa barra ou num mês para filtrar todos os gráficos e a lista.</div></div>
    <button class="btn" data-a="dash-full">${ic(document.fullscreenElement||document.body.classList.contains('dash-fixo')?'telaSair':'tela',18)}${document.fullscreenElement||document.body.classList.contains('dash-fixo')?'Sair da tela cheia':'Tela cheia'}</button></div>
  <div class="dash-g">
  <aside class="dash-lado">
    <div class="kpis kpis-v">
      <div class="kpi"><span class="v">${rows.length}</span><span class="l">Terrenos no filtro</span></div>
      <div class="kpi"><span class="v">${ativos.length}</span><span class="l">Negociações ativas</span></div>
      <div class="kpi"><span class="v sm">${mi(ativos.reduce((s,t)=>s+(ofertaRef(t)?.valor||0),0))}</span><span class="l">Valor pedido em negociação</span></div>
      <div class="kpi"><span class="v sm">${num(rows.reduce((s,t)=>s+(areaAdotada(t)||0),0))} m²</span><span class="l">Área adotada somada</span></div></div>
    ${chips.length?`<section class="sec dash-filtro"><div class="sec-b"><div class="lbl-up">Filtrando por</div><div class="fchips">${chips.join('')}</div><button class="linkbtn" data-a="dash-limpar">Limpar filtros</button></div></section>`:''}
    <section class="sec"><div class="sec-h"><h2>Gráficos</h2><span class="faint" style="font-size:13px">${UI.dash.sel.length} de ${Object.keys(DIMS).length}</span></div><div class="sec-b dash-sel">
      ${Object.entries(DIMS).map(([k,d])=>`<label class="chk"><input type="checkbox" data-ch="dash-sel" value="${k}" ${UI.dash.sel.includes(k)?'checked':''}>${d.l}</label>`).join('')}</div></section>
  </aside>
  <div class="dash-main">
    ${UI.dash.sel.length?`<div class="dash-graf">${UI.dash.sel.map(k=>`<section class="card graf ${DIMS[k].linha?'larga':''}"><div class="card-h"><h2>${DIMS[k].l}</h2><button class="iconbtn" data-a="dash-exp" data-k="${k}" aria-label="Ampliar ${DIMS[k].l}" title="Ampliar">${ic('tela',18)}</button></div><div class="card-b">${grafico(k)}</div></section>`).join('')}</div>`
      :'<div class="card"><div class="empty">Escolha ao menos um gráfico na lista ao lado.</div></div>'}
  </div>
  <section class="sec dash-tab"><div class="sec-h"><h2>Terrenos no filtro</h2><span class="faint" style="font-size:13px">${rows.length}</span></div><div class="sec-b">${tabela('dash',rows,COLS_TERRENOS,{attr:attrAbrir('dashboard'),padrao:{k:'temp',dir:'desc'}})}</div></section>
  </div></div>`}
function telaCheia(){const el=$('#dash');if(!el)return;
  if(document.fullscreenElement){document.exitFullscreen?.();return}
  if(document.body.classList.contains('dash-fixo')){document.body.classList.remove('dash-fixo');render();return}
  const fallback=()=>{document.body.classList.add('dash-fixo');render()};
  try{const p=el.requestFullscreen?.();if(p&&p.catch)p.catch(fallback);else if(!p)fallback()}catch(e){fallback()}}
document.addEventListener('fullscreenchange',()=>{const b=document.querySelector('[data-a="dash-full"]');if(!b)return;const on=!!document.fullscreenElement;b.innerHTML=`${ic(on?'telaSair':'tela',18)}${on?'Sair da tela cheia':'Tela cheia'}`});

/* tooltip dos gráficos */
const TIP=document.createElement('div');TIP.className='tip';TIP.setAttribute('role','tooltip');document.body.appendChild(TIP);
document.addEventListener('mouseover',e=>{const el=e.target.closest?.('[data-tip]');if(!el){TIP.classList.remove('on');return}TIP.textContent=el.dataset.tip;TIP.classList.add('on')});
document.addEventListener('mousemove',e=>{if(!TIP.classList.contains('on'))return;const w=TIP.offsetWidth;TIP.style.left=Math.min(innerWidth-w-8,e.clientX+14)+'px';TIP.style.top=(e.clientY+16)+'px'});
document.addEventListener('focusin',e=>{const el=e.target.closest?.('[data-tip]');if(!el)return;const r=el.getBoundingClientRect();TIP.textContent=el.dataset.tip;TIP.classList.add('on');TIP.style.left=Math.min(innerWidth-TIP.offsetWidth-8,r.left)+'px';TIP.style.top=(r.bottom+6)+'px'});
document.addEventListener('focusout',()=>TIP.classList.remove('on'));

/* ===================== FICHA: VISÃO GERAL ===================== */
/* Visão geral (decisão do Moisés, 3/nov/2026): resumo à esquerda e mapa à direita. Os outros quadros que moravam aqui saem pela parte pedida:
   'neg' (Comercial), 'viab' (Estudos de viabilidade), 'relevo' (Infraestrutura), 'entorno' (Entorno). */
function abaGeral(t,parte){const n=t.neg,o=ofertaRef(t),ad=areaAdotada(t),v=n?.viab,lp=lastProp(t),pr=typeof proxReuniao==='function'?proxReuniao(t):null,pt=proxTarefa(t),px=proximos(t);
  const lin=(k,val)=>`<div class="kv"><dt>${k}</dt><dd>${val==null||val===''?'<span class="ni">Não informado</span>':val}</dd></div>`;
  /* Edição direta no resumo: grava nos mesmos campos das seções abaixo, pelo mesmo caminho (no banco, app.salvar_terreno só com as chaves enviadas) */
  const CAMPO={};Object.entries(SECOES).forEach(([sid,s])=>s.campos.forEach(c=>{CAMPO[c[0]]=[sid,c]}));
  const lapis=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>`;
  const pe=`<div class="kv-f"><button type="button" class="btn text sm" data-a="cancel-edit">Cancelar</button><button class="btn primary sm">Salvar</button></div>`;
  const linE=(rot,val,chave,campos)=>{const id='g-'+chave;
    if(UI.edit===id){const sid=CAMPO[campos[0]][0];
      const corpo=chave==='end'?camposEndereco(t,false)+['lat','lng'].map(k=>`<input type="hidden" name="${k}" value="${t[k]==null?'':String(t[k]).replace('.',',')}">`).join('')+`<input type="hidden" name="precisao" value="${esc(t.precisao||'nao_informada')}">`
        :`<div class="kv-campos">${campos.map(k=>campoInp(t,CAMPO[k][1])).join('')}</div>`;
      return `<div class="kv editando" id="sec-${id}"><dt>${rot}</dt><dd><form data-form="sec" data-s="${sid}" class="kv-form">${corpo}${pe}</form></dd></div>`}
    return `<div class="kv"><dt>${rot}</dt><dd>${val==null||val===''?'<span class="ni">Não informado</span>':val}</dd><button class="kv-ed" data-a="edit" data-s="${id}" aria-label="Editar ${rot.toLowerCase()}" title="Editar">${lapis}</button></div>`};
  const areaHid=ks=>ks.map(k=>`<input type="hidden" name="${k}" value="${t[k]==null?'':String(t[k]).replace('.',',')}">`).join('');
  const numInp=(k,l)=>`<div class="field"><label for="g-${k}">${l}</label><input id="g-${k}" name="${k}" inputmode="decimal" value="${t[k]==null?'':String(t[k]).replace('.',',')}" placeholder="${k==='testada'?'metros':'m²'}"></div>`;
  const linArea=(rot,val,chave)=>{const id='g-'+chave;
    if(UI.edit===id){const corpo=chave==='testada'?numInp('testada','Testada principal (m)')+areaHid(['aDoc','aCad','aLev','aEst'])+`<input type="hidden" name="fonteArea" value="${esc(t.fonteArea||'')}">`
      :`<div class="field"><label for="g-fonteArea">Área adotada</label><select id="g-fonteArea" name="fonteArea"><option value="">Nenhuma</option>${Object.entries(OPT.fonteArea).map(([k,l])=>`<option value="${k}" ${t.fonteArea===k?'selected':''}>${l}</option>`).join('')}</select></div>${numInp('aDoc','Documental (m²)')}${numInp('aCad','Cadastral (m²)')}${numInp('aLev','Levantamento (m²)')}${numInp('aEst','Estimativa (m²)')}${areaHid(['testada'])}`;
      return `<div class="kv editando" id="sec-${id}"><dt>${rot}</dt><dd><form data-form="areas" class="kv-form"><div class="kv-campos">${corpo}</div>${pe}</form></dd></div>`}
    return `<div class="kv"><dt>${rot}</dt><dd>${val==null||val===''?'<span class="ni">Não informado</span>':val}</dd><button class="kv-ed" data-a="edit" data-s="${id}" aria-label="Editar ${rot.toLowerCase()}" title="Editar">${lapis}</button></div>`};
  const linLink=(rot,val,acao)=>`<div class="kv"><dt>${rot}</dt><dd>${val==null||val===''?'<span class="ni">Não informado</span>':val}</dd>${acao}</div>`;
  const a=analiseVig(t);
  const info=`<section class="sec"><div class="sec-h"><h2>Informações do terreno</h2></div><div class="sec-b"><dl class="kvl">
    ${linE('Endereço',esc([t.logradouro&&(t.logradouro+(t.numero?', '+t.numero:'')),t.bairro].filter(Boolean).join(' · ')),'end',['cep','logradouro','numero','complemento','bairro','municipio'])}
    ${linE('Município e região',esc([t.municipio||'São Paulo · SP',t.zona&&'Zona '+OPT.zona[t.zona]].filter(Boolean).join(' · ')),'reg',['zona'])}
    ${linE('Eixo comercial',esc(eixo(t.eixo)||''),'eixo',['eixo'])}
    ${linLink('Zoneamento',a?esc(zonasTxt(t)):'',`<button class="kv-ed kv-ir" data-a="tab" data-t="urbanismo" title="Registrar nova análise em Urbanismo" aria-label="Registrar nova análise em Urbanismo">${ic('fwd',16)}</button>`)}
    ${linArea('Área adotada',ad!=null?`<span>${m2(ad)}${OPT.fonteArea[t.fonteArea]?`<span class="kv-2">${esc(OPT.fonteArea[t.fonteArea])}</span>`:''}</span>`:'','area')}
    ${t.poly&&t.fonteArea!=='poligonal'?lin('Área da poligonal',m2(areaPolT(t))):''}
    ${linArea('Testada principal',t.testada!=null?num(t.testada,2)+' m':'','testada')}
    ${linE('Posição na quadra',t.posicao!=='nao_informado'?OPT.posicao[t.posicao]:'','topo',['posicao'])}
    ${linE('Ocupação',t.ocupacao!=='nao_informado'?OPT.ocupacao[t.ocupacao]:'','ocup',['ocupacao'])}
    ${linE('Responsável',esc(t.resp),'resp',['resp'])}
    ${linE('Origem',esc(OPT.origem[t.origem]||''),'orig',['origem'])}</dl></div></section>`;
  const neg=n?`<section class="sec"><div class="sec-h"><h2>Negociação</h2></div><div class="sec-b"><dl class="kvl">
    ${lin('Situação',sitChip(sitMapa(t))+(n.status==='ativo'&&n.sub?` <span class="chip sub">${esc(subN(n.sub))} · ${diasSub(n)} d</span>`:'')+(n.pedido?' <span class="chip blue">Aguardando aprovação</span>':''))}
    ${['perdido','descartado'].includes(n.status)?lin('Motivo',esc(motivoN(n.status,n.motivo))+(n.detalhe?` · ${esc(n.detalhe)}`:'')):''}
    ${n.status==='ativo'?`<div class="kv"><dt>Temperatura</dt><dd>${tempPicker(t)}</dd></div>`:lin('Temperatura',n.temp?`${tempMini(n.temp)} ${TEMP[n.temp]}`:'')}
    ${lin('Última proposta',lp?`${mi(lp.valor)} · ${lp.origem==='bkm'?'BKM':'Vendedor'} · ${OPT.statusProp[lp.status]}`:'')}
    ${lin('Próxima reunião',pr?`${fd(pr.data)} · ${esc(pr.hora||'')}`:'')}
    ${pt?linLink('Próxima tarefa',`${esc(pt.titulo)} · <span style="${pt.prazo<HOJE?'color:var(--atraso,#b3261e);font-weight:600':''}">${fd(pt.prazo)}</span>`,`<button class="kv-ed" data-a="tk-abrir" data-id="${t.id}" data-tk="${pt.id}" aria-label="Editar a tarefa ${esc(pt.titulo)}" title="Editar tarefa">${lapis}</button>`):lin('Próxima tarefa','')}</dl></div></section>`:'';
  const loc=`<section class="sec g-loc"><div class="sec-h"><h2>${bi('localizacao',32)}Localização</h2></div><div class="sec-b">
    ${t.lat!=null?`<div class="mini-wrap"><div id="mini-mapa" class="mini-mapa"></div></div><div class="mini-pe"><span></span><span>${GG?`<button class="btn sm" data-a="g-sv-mini" data-id="${t.id}">Street View</button>`:''}<button class="btn sm mini-ir" data-a="mp-ir" data-id="${t.id}">Ver no mapa</button></span></div>
      <div class="mp-aviso mini">Fundo do mapa indisponível nesta visualização.</div>`
    :`<div class="empty" style="padding:var(--e6) 0">Sem localização.<br><span style="display:inline-flex;gap:8px;margin-top:12px;flex-wrap:wrap;justify-content:center">${GG&&(t.logradouro||t.bairro)?`<button class="btn sm primary ed" data-a="g-geo" data-id="${t.id}">Localizar pelo endereço</button>`:''}<button class="btn sm ed" data-a="mp-marcar" data-id="${t.id}">Marcar no mapa</button></span></div>`}</div></section>`;
  const poi=entornoCard(t);
  const pct=(x,b)=>b?num(x/b*100,1)+'%':'—';
  const vl=v?(v.liq??v.vgv):null;
  const vs=viabsDe(t.id),roV=UI.role==='Leitura'||!negAtiva(t);
  const escolha=vs.length?`<div class="vb-escolha"><label for="vb-val-${t.id}">Estudo válido</label><select id="vb-val-${t.id}" data-ch="vb-valido" ${roV?'disabled':''}>${v?'':'<option value="">Escolha o estudo</option>'}${vs.map(x=>{const c=vbCalc(x);return `<option value="${x.id}" ${v?.id===x.id?'selected':''}>${esc(x.nome)} · ${c.margem==null?'—':num(c.margem,1)+'%'}</option>`}).join('')}</select>
    ${v?`<button class="btn sm" data-a="vb-abrir" data-v="${v.id}">Abrir estudo</button>`:''}${UI.role!=='Leitura'?`<button class="btn text sm" data-a="vb-novo">${ic('add',16)}Novo estudo</button>`:''}</div>`:'';
  const viab=`<section class="sec"><div class="sec-h"><h2>Resumo da viabilidade</h2></div><div class="sec-b">${escolha}${v?`<div class="cond2 vb-res2"><div><div class="lbl">Margem líquida</div><div class="big">${v.margem==null?'—':num(v.margem,1)+'%'}</div></div>${S.vbMargemMin!=null?`<div><div class="lbl">Mínima da empresa</div><div class="big">${num(S.vbMargemMin,1)}%</div></div>`:''}</div><div class="dt-wrap"><table class="dt compacta"><thead><tr><th class="esq"><span class="sr-only">Item</span></th><th class="num">Valor</th><th class="num">% do VGV</th></tr></thead><tbody>
    <tr><td class="esq">VGV líquido</td><td class="num">${mi(vl)}</td><td class="num">100%</td></tr>
    <tr><td class="esq">Valor pedido</td><td class="num">${o?.valor?mi(o.valor):'—'}</td><td class="num">${o?.valor?pct(o.valor,vl):'—'}</td></tr>
    ${lp?`<tr><td class="esq">Última proposta</td><td class="num">${mi(lp.valor)}</td><td class="num">${pct(lp.valor,vl)}</td></tr>`:''}
    ${v.lucro!=null?`<tr><td class="esq">Lucro líquido</td><td class="num">${mi(v.lucro)}</td><td class="num">${pct(v.lucro,vl)}</td></tr>`:''}
</tbody></table></div>
    ${abaixoMin(t)?`<div class="banner warn" style="margin-top:12px">${ic('warn')}<div>${abaixoMinTxt(t)}.</div></div>`:''}`
    :`<div class="muted">${vs.length?'Nenhum estudo marcado como válido.':`Sem estudo.${UI.role!=='Leitura'?' <button class="linkbtn ed" data-a="vb-novo">Montar estudo</button>':''}`}</div>`}</div></section>`;
  const rel=tpSecao(t);
  if(parte==='neg')return neg;if(parte==='viab')return viab;if(parte==='relevo')return rel;if(parte==='entorno')return poi+setoresCard(t)+perfilCard(t);
  const vx=v&&viabsDe(t.id).find(x=>x.id===v.id),vc=vx?vbCalc(vx):null;
  const est=(t.entorno?.itens||[]).filter(x=>x.cat==='metro_trem'&&!x.excl).sort((a,b)=>a.pe-b.pe)[0];
  const of1=t.ofertas.slice().sort((a,b)=>a.data.localeCompare(b.data))[0],cp=corrPrincipal(t);
  const resumo=`<section class="sec g-res"><div class="sec-h"><h2>Resumo</h2></div><div class="sec-b"><dl class="kvl">
    ${linE('Endereço',esc([t.logradouro&&(t.logradouro+(t.numero?', '+t.numero:'')),t.bairro].filter(Boolean).join(' · ')),'end',['cep','logradouro','numero','complemento','bairro','municipio'])}
    ${linE('Município e região',esc([t.municipio||'São Paulo · SP',t.zona&&'Zona '+OPT.zona[t.zona]].filter(Boolean).join(' · ')),'reg',['zona'])}
    ${linLink('Zoneamento',a?esc(zonasTxt(t)):'',`<button class="kv-ed kv-ir" data-a="tab" data-t="parametros" title="Ver os parâmetros urbanísticos" aria-label="Ver os parâmetros urbanísticos">${ic('fwd',16)}</button>`)}
    ${linArea('Área adotada',ad!=null?`<span>${m2(ad)}${OPT.fonteArea[t.fonteArea]?`<span class="kv-2">${esc(OPT.fonteArea[t.fonteArea])}</span>`:''}</span>`:'','area')}
    ${linLink('Unidades do estudo válido',vc?num(vc.un,0)+' unidades':'',`<button class="kv-ed kv-ir" data-a="tab" data-t="viabilidade" title="Ver os estudos de viabilidade" aria-label="Ver os estudos de viabilidade">${ic('fwd',16)}</button>`)}
    ${linLink('VGV do estudo válido',v?mi(v.vgv):'',`<span class="kv-ed" aria-hidden="true"></span>`)}
    ${linLink('Distância do metrô ou trem',est?`<span>${est.pe<1000?Math.round(est.pe/10)*10+' m':num(est.pe/1000,2)+' km'} a pé${est.min!=null?` · ${est.min} min`:''}<span class="kv-2">${esc(est.nome)}</span></span>`:(t.entorno?'Nenhuma estação a até 1,5 km a pé':''),`<button class="kv-ed kv-ir" data-a="tab" data-t="entorno" title="Ver o entorno" aria-label="Ver o entorno">${ic('fwd',16)}</button>`)}
    ${linLink('Valor pedido na entrada',of1?.valor?`<span>${mi(of1.valor)}<span class="kv-2">oferta de ${fd(of1.data)}</span></span>`:'',`<button class="kv-ed kv-ir" data-a="tab" data-t="comercial" title="Ver as ofertas" aria-label="Ver as ofertas">${ic('fwd',16)}</button>`)}
    ${linLink('Perfil topográfico',tpResumo(t),`<button class="kv-ed kv-ir" data-a="tab" data-t="infra" title="Ver a infraestrutura" aria-label="Ver a infraestrutura">${ic('fwd',16)}</button>`)}
    ${linLink('Corretor',cp?`<span>${esc(cp.nome)}<span class="kv-2">${esc(cp.imob)}</span></span>`:'',`<button class="kv-ed kv-ir" data-a="tab" data-t="comercial" title="Ver os corretores" aria-label="Ver os corretores">${ic('fwd',16)}</button>`)}</dl></div></section>`;
  return `<div class="geral"><div class="geral-c">${loc}</div><div class="geral-c">${resumo}</div></div>`}
function L_initMini(){const el=$('#mini-mapa'),t=T(UI.id);if(!el||!t||t.lat==null)return;if(!window.L){el.innerHTML='<div class="mapa-erro">Mapa indisponível.</div>';return}
  MINI=L.map(el,{zoomControl:true,attributionControl:true,scrollWheelZoom:false,doubleClickZoom:false,dragging:!L.Browser.mobile});
  const mini0=MINI;miniGestos(el,d=>mini0.setZoom(mini0.getZoom()+d));
  /* dois cliques: sobre a poligonal (ou o pino) editam a poligonal ali mesmo; no resto do mapa abrem a página Mapa */
  MINI.on('dblclick',e=>miniDuplo(t,e.latlng.lat,e.latlng.lng,false));
  MINI.on('click',e=>{if(UI.edMini)mapaClique(e.latlng.lat,e.latlng.lng)});
  miniToqueDuplo(el,t,(x,y)=>{const ll=mini0.containerPointToLatLng([x,y]);return [ll.lat,ll.lng]});
  camada('satelite',el.closest('.sec')).addTo(MINI);const k=sitMapa(t);
  const enq=()=>t.poly?MINI.fitBounds(t.poly,{padding:[24,24],maxZoom:18}):MINI.setView([t.lat,t.lng],17);
  if(t.poly)MINI.__poly=L.polygon(t.poly,{color:'#0094fe',weight:2,fillOpacity:.2}).on('dblclick',e=>{L.DomEvent.stop(e);miniDuplo(t,e.latlng.lat,e.latlng.lng,true)}).addTo(MINI);enq();
  MINI_DES=L.layerGroup().addTo(MINI);
  const mini=MINI;requestAnimationFrame(()=>setTimeout(()=>{if(MINI!==mini)return;MINI.invalidateSize();enq();if(UI.edMini)desenhaRascunho()},60));
  const pin=L.marker([t.lat,t.lng],{icon:pinIcon(k)}).addTo(MINI);if(t.poly)pin.on('dblclick',e=>{L.DomEvent.stop(e);miniDuplo(t,t.lat,t.lng,true)});
  if(UI.edMini&&UI.mpModo==='editar'&&UI.mpAlvo===t.id)miniEdDesenha()}

/* dois cliques (ou dois toques) no mini-mapa. Sobre a poligonal: entra em edição ali mesmo, com os pontos e o menu do ponto
   da página Mapa (Leitura não edita: abre o Mapa). No resto do mapa: abre a página Mapa. Editando, não faz nada (o clique fora conclui). */
function miniDuplo(t,lat,lng,naPoly,toque){if(!toque&&Date.now()-(UI.miniToqueEm||0)<600)return; /* os dois toques já foram tratados por miniToqueDuplo */
  if(UI.edMini&&UI.mpModo==='editar')return;
  if(naPoly&&UI.role!=='Leitura'&&t.poly&&t.poly.length>=3){editarPoligonal(t.id,true);return}
  miniAbrirMapa(t,lat,lng,MINI?.getZoom?.())}
/* no celular o navegador nem sempre transforma dois toques em duplo clique: contamos os toques aqui */
function miniToqueDuplo(el,t,ll){let ult=null,x0=0,y0=0,mov=false;
  el.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;x0=e.clientX;y0=e.clientY;mov=false},true);
  el.addEventListener('pointermove',e=>{if(e.pointerType==='touch'&&Math.hypot(e.clientX-x0,e.clientY-y0)>10)mov=true},true);
  el.addEventListener('pointerup',e=>{if(e.pointerType!=='touch'||mov||e.target.closest('.v-alvo,.gm-control-active,.leaflet-control,button'))return;
    const agora=Date.now();if(ult&&agora-ult.em<350&&Math.hypot(e.clientX-ult.x,e.clientY-ult.y)<30){ult=null;
      if(UI.edMini&&UI.mpModo==='editar')return;const r=el.getBoundingClientRect(),q=ll(e.clientX-r.left,e.clientY-r.top);if(!q)return;
      const naPoly=!!(t.poly&&t.poly.length>=3&&dentroPoly(q[0],q[1],t.poly));UI.miniToqueEm=Date.now();setTimeout(()=>miniDuplo(t,q[0],q[1],naPoly,true),0);return}
    ult={em:agora,x:e.clientX,y:e.clientY}},true)}
/* edição no mini-mapa: some a poligonal fixa, aparecem os pontos; no celular, a barra de aviso fica logo abaixo do mapa */
function miniEdDesenha(){const el=$('#mini-mapa');if(!el||!MINI)return;el.classList.add('modo');
  if(GG){MINI.__poly?.setMap(null);MINI.setOptions({gestureHandling:'greedy'})}else{MINI.__poly&&MINI.removeLayer(MINI.__poly);MINI.dragging?.enable()}
  let b=$('#mini-modo');if(!b){b=document.createElement('div');b.id='mini-modo';b.className='mp-modo mini-modo';b.setAttribute('aria-live','polite');el.after(b)}b.innerHTML=modoBanner();
  desenhaRascunho();vMenuDesenha()}
function miniEdRefresh(){if(UI.mpModo==='editar'&&UI.edMini)return miniEdDesenha();
  /* saiu da edição (salvou, cancelou ou nada mudou): a ficha redesenha com a poligonal nova */
  UI.edMini=false;render()}
/* mini-mapa da Visão geral: a roda sozinha rola a página; Shift + roda dá zoom.
   Com Shift o navegador costuma mandar a rolagem como horizontal (deltaX), por isso vale qualquer eixo.
   A escuta é na captura do contêiner, antes do mapa: sem Shift o evento não chega ao mapa e a página rola. */
function miniGestos(el,zoom){let acc=0,ult=0;
  el.addEventListener('wheel',e=>{if(!e.shiftKey){e.stopPropagation();return}e.preventDefault();e.stopPropagation();
    const d=(Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX)*(e.deltaMode===1?40:1);if(Date.now()-ult>400)acc=0;acc+=d;
    if(Math.abs(acc)>=60&&Date.now()-ult>180){zoom(acc<0?1:-1);acc=0;ult=Date.now()}},{capture:true,passive:false})}
/* dois cliques no mini-mapa: abre a página Mapa centrada no ponto clicado, no mesmo zoom, com o terreno selecionado */
function miniAbrirMapa(t,lat,lng,z){go('mapa',{mpView:{c:{lat,lng},z:Math.max(z||17,15)},mpSel:t.id,mpFoco:null})}


/* largura da lista do mapa (pedido do Moisés, 4/nov/2026): a borda entre a lista e o mapa se arrasta (mãozinha ao passar,
   mão fechada ao puxar); a mínima mostra só a bolinha com o código; guardada no navegador; setas do teclado também mudam,
   dois cliques voltam ao padrão. Só no desktop (no celular a lista fica embaixo do mapa). */
const MP_LKEY='bkm-terrenos-mapa-lista',MP_LMIN=76,mpLpad=()=>innerWidth<1300?300:360;
const mpLmax=()=>Math.max(MP_LMIN,Math.min(720,Math.round(innerWidth*.6)));
function mpLargura(){let v=null;try{v=+localStorage.getItem(MP_LKEY)||null}catch(e){}return Math.max(MP_LMIN,Math.min(mpLmax(),v||mpLpad()))}
function mpLarguraPor(w,guardar){const pg=$('.mapa-pg'),h=$('.mp-redim');if(!pg)return;w=Math.round(Math.max(MP_LMIN,Math.min(mpLmax(),w)));
  pg.style.setProperty('--mp-w',w+'px');h?.setAttribute('aria-valuenow',w);pg.classList.toggle('mp-estreita',w<200);
  if(guardar)try{localStorage.setItem(MP_LKEY,w)}catch(e){}
  if(!GG&&MAPA?.invalidateSize)MAPA.invalidateSize({pan:false});fsPos($('#ficha-sheet'))}
document.addEventListener('pointerdown',e=>{const h=e.target.closest?.('.mp-redim');if(!h||e.button!==0)return;e.preventDefault();
  const lado=$('.mapa-lado'),x0=e.clientX,w0=lado.getBoundingClientRect().width;h.setPointerCapture?.(e.pointerId);document.body.classList.add('mp-arrastando');
  const mv=ev=>mpLarguraPor(w0+ev.clientX-x0),fim=ev=>{h.removeEventListener('pointermove',mv);h.removeEventListener('pointerup',fim);h.removeEventListener('pointercancel',fim);
    document.body.classList.remove('mp-arrastando');mpLarguraPor(w0+ev.clientX-x0,true)};
  h.addEventListener('pointermove',mv);h.addEventListener('pointerup',fim);h.addEventListener('pointercancel',fim)});
document.addEventListener('dblclick',e=>{if(e.target.closest?.('.mp-redim'))mpLarguraPor(mpLpad(),true)});
document.addEventListener('keydown',e=>{const h=e.target.closest?.('.mp-redim');if(!h)return;const w=+h.getAttribute('aria-valuenow'),d=e.shiftKey?80:20;
  const n=e.key==='ArrowLeft'?w-d:e.key==='ArrowRight'?w+d:e.key==='Home'?MP_LMIN:e.key==='End'?mpLmax():null;if(n==null)return;e.preventDefault();mpLarguraPor(n,true)});

/* clique na bolinha de um item da legenda que abre (Terrenos, fase, etapa): liga e desliga tudo dentro dele (o número não; pedido do Moisés, 5/nov/2026) */
document.addEventListener('click',e=>{const t=e.target.closest?.('#mp-leg .lg-tg');if(!t)return;const b=t.closest('.lg-i[data-l]');if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();mpApagar(b.dataset.l,b.dataset.v);mpRefresh();
  $(`#mp-leg .lg-i[data-l="${b.dataset.l}"][data-v="${b.dataset.v}"]`)?.focus()},true);
