/* =====================================================================
   Tabela de terrenos (pedido do Moisés, 4/nov/2026)
   Colunas: Terreno (código, nome e endereço) · Cidade · Região · Imóvel (área, zoneamento e
   perfil topográfico) · Projeto (VGV e unidades do estudo válido) · Negociação (pedida e
   proposta ativa) · Corretor · Temperatura · Responsável (foto). Cada coluna ordena pelo primeiro dado dela.
   Ordenação em várias colunas: o clique no título passa por crescente, decrescente e
   sem ordem; a primeira coluna clicada manda e as seguintes desempatam, na ordem em que
   foram clicadas (UI.sorts.ter = [{k, dir}, ...]). Sem nenhuma, temperatura e código.
   Tela cheia (a tabela cobre a página; onde der, o navegador esconde as barras; Esc sai).
   Olhinho: a ficha completa e editável numa gaveta da direita, que cobre a tabela até a
   coluna 1; a linha do terreno aberto fica acesa e clicar noutra linha troca o terreno.
   A gaveta é a própria página da ficha (UI.route = 'terreno' com UI.gav), por isso tudo
   o que a ficha faz vale nela; o endereço é /terrenos/A123/gaveta.
   ===================================================================== */
const terCid=t=>(t.municipio||'').split(' · ')[0]||null;
const terZona=t=>t.zona&&OPT.zona[t.zona]?(t.zona==='centro'?'Centro':'Zona '+OPT.zona[t.zona]):null;
/* estudo válido: o vinculado à negociação */
function terEstudo(t){const id=t.neg?.viab?.id,v=id&&VB(id);if(!v)return null;const c=vbCalc(v);return {un:c.un||null,vgv:c.vgv||null}}
function terCorretores(t){const ids=[...new Set([...(t.corretores||[]).slice().sort((a,b)=>(b.principal?1:0)-(a.principal?1:0)).map(x=>x.cid),...(typeof partesDe==='function'?partesDe(t).flatMap(p=>p.corretores||[]):[])])];
  return ids.map(id=>corretor(id)).filter(Boolean)}
const terEnd=t=>[[t.logradouro,t.numero].filter(Boolean).join(', '),t.bairro].filter(Boolean).join(' · ');
const terNada=s=>`<span class="faint">${s}</span>`;
/* títulos do Moisés (4/nov/2026, segunda versão) */
const COLS_TER=[
  {k:'ter',l:'Terreno',cls:'esq',s:t=>t.codigo,
    v:t=>`<div class="tb-c1"><button class="iconbtn tb-olho" data-a="tb-gav" data-id="${t.id}" aria-label="Ver a ficha de ${esc(t.nome)}" title="Ver a ficha">${ic('olho',20)}</button><div class="tb-c1t"><div class="t2 num">${t.codigo}</div><div class="t1">${esc(t.nome)}</div>${terEnd(t)?`<div class="t2">${esc(terEnd(t))}</div>`:''}</div></div>`},
  {k:'cid',l:'Cidade',s:terCid,v:t=>terCid(t)?esc(terCid(t)):terNada('—')},
  {k:'zona',l:'Região',s:terZona,v:t=>terZona(t)||terNada('—')},
  {k:'area',l:'Imóvel',s:t=>areaAdotada(t),
    v:t=>{const a=areaAdotada(t),z=zonasTxt(t),tp=tpAtual(t);return `<div>${a!=null?m2(a):terNada('Sem área')}</div><div class="t2">${z?esc(z):'Zoneamento não consultado'}</div><div class="t2">${tp?esc(tpNome(tp)):'Topografia não medida'}</div>`}},
  {k:'estudo',l:'Projeto',cls:'num',s:t=>terEstudo(t)?.vgv??null,
    v:t=>{const e=terEstudo(t);return e?`<div>${e.vgv!=null?'VGV '+mi(e.vgv):terNada('Sem VGV')}</div><div class="t2">${e.un!=null?num(e.un)+' unidades':'Sem unidades'}</div>`:terNada('Sem estudo válido')}},
  {k:'preco',l:'Negociação',cls:'num',s:fxPedido,
    v:t=>{const p=fxPedido(t),pr=fxProposta(t);return `<div>Pedida: ${p!=null?mi(p):terNada('—')}</div><div class="t2">Proposta: ${pr!=null?mi(pr):'—'}</div>`}},
  {k:'corretor',l:'Corretor',s:t=>terCorretores(t)[0]?.nome||null,
    v:t=>{const c=terCorretores(t);return c.length?`<div>${esc(c[0].nome)}</div>${c.length>1?`<div class="t2" title="${esc(c.slice(1).map(x=>x.nome).join(', '))}">+${c.length-1} corretor${c.length>2?'es':''}</div>`:c[0].imob?`<div class="t2">${esc(c[0].imob)}</div>`:''}`:terNada('Sem corretor')}},
  {k:'temp',l:'Temperatura',s:t=>t.neg?.temp??null,v:t=>tempMini(t.neg?.temp)},
  {k:'resp',l:'Responsável',s:t=>t.resp||null,v:t=>t.resp?`<span class="tb-resp" title="${esc(t.resp)}">${av(t.resp)}<span class="sr-only">${esc(t.resp)}</span></span>`:terNada('—')}];
const terSorts=()=>Array.isArray(UI.sorts.ter)?UI.sorts.ter:(UI.sorts.ter=[]);
/* crescente → decrescente → sem ordem; coluna nova entra no fim da fila (desempata as anteriores) */
function terOrdenar(k){const L=terSorts(),i=L.findIndex(x=>x.k===k);
  if(i<0)L.push({k,dir:'asc'});else if(L[i].dir==='asc')L[i].dir='desc';else L.splice(i,1)}
function terCmp(a,b){const L=terSorts();
  for(const st of L){const c=COLS_TER.find(x=>x.k===st.k);if(!c)continue;const x=c.s(a),y=c.s(b);
    if(x==null&&y==null)continue;if(x==null)return 1;if(y==null)return -1;
    const d=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'pt-BR',{numeric:true});if(d)return st.dir==='desc'?-d:d}
  return L.length?0:(b.neg?.temp||0)-(a.neg?.temp||0)||b.codigo.localeCompare(a.codigo)}
function terTabela(rows){const L=terSorts(),r=rows.slice().sort(terCmp);
  if(!r.length)return `<div class="empty">Nenhum terreno${UI.q?` para “${esc(UI.q)}”`:''}.<br><button class="btn sm" style="margin-top:12px" data-a="novo">${ic('add',16)}Novo terreno</button></div>`;
  const th=c=>{const i=L.findIndex(x=>x.k===c.k),st=L[i];
    return `<th class="col-${c.k} ${c.cls||''}" scope="col" aria-sort="${st?(st.dir==='desc'?'descending':'ascending'):'none'}"><button type="button" class="dt-sort" data-a="tb-sort" data-k="${c.k}" title="${st?(st.dir==='asc'?'Crescente: clique para decrescente':'Decrescente: clique para tirar a ordem'):'Ordenar em ordem crescente'}">${c.l}<span class="dt-ar" aria-hidden="true">${st?(st.dir==='desc'?'↓':'↑'):'↕'}</span>${st&&L.length>1?`<span class="tb-ord" aria-label="${i+1}ª ordem">${i+1}</span>`:''}</button></th>`};
  return `<div class="dt-wrap"><table class="dt lista-ter"><thead><tr>${COLS_TER.map(th).join('')}</tr></thead>
  <tbody>${r.map(t=>`<tr data-a="abrir" data-id="${t.id}" data-from="terrenos" tabindex="0"${UI.gav&&UI.id===t.id?' class="tb-sel" aria-current="true"':''}>${COLS_TER.map(c=>`<td class="col-${c.k} ${c.cls||''}">${c.v(t)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
linhas=function(){return terTabela(fxLista('terrenos').filter(t=>bateBusca(t,UI.q)))};
const terCheiaOn=()=>!!UI.tbCheia;
pgTerrenos=function(){const n=fxLista('terrenos').length,L=terSorts(),on=terCheiaOn();
  return `<div class="ter-pg${on?' on':''}"><div class="page-h"><div><h1>Terrenos</h1><div class="sub">${n===S.terrenos.length?S.terrenos.length+' terrenos':n+' de '+S.terrenos.length+' terrenos'}</div></div>
    <div class="ter-ac">${L.length?`<button class="btn text sm" data-a="tb-sem-ordem" title="Volta à ordem padrão (temperatura e código)">Tirar ordenação</button>`:''}<button class="btn text sm" data-a="tb-cheia" aria-pressed="${on}" title="${on?'Sair da tela cheia (Esc)':'Abrir a tabela em tela cheia'}">${ic(on?'telaSair':'tela',18)}${on?'Sair da tela cheia':'Tela cheia'}</button></div></div>
  ${fxBarra('terrenos')}
  <section class="sec lista"><div id="rows">${linhas()}</div></section></div>`};

/* ---------- a gaveta da ficha ---------- */
const _pgFichaTb=pgFicha;
pgFicha=function(){if(!UI.gav)return _pgFichaTb.apply(this,arguments);const t=T(UI.id);
  return `${pgTerrenos()}<aside class="tgav" id="tgav" role="dialog" aria-label="Ficha de ${esc(t.nome)}"><div class="tgav-h"><span class="num">${t.codigo}</span><span class="tgav-n">${esc(t.nome)}</span>
    <button class="btn text sm" data-a="tb-pagina" title="Abrir a ficha na página dela">Abrir página</button><button class="iconbtn" data-a="tb-gav-x" aria-label="Fechar a ficha" title="Fechar (Esc)">${ic('close',22)}</button></div>
    <div class="tgav-b">${_pgFichaTb.apply(this,arguments)}</div></aside>`};
/* a gaveta cobre a tabela a partir do fim da coluna 1 (no celular, a tela toda) */
function tgavPos(){const g=$('#tgav');if(!g)return;const th=$('.lista-ter th.col-ter'),top=$('.ter-pg.on')?0:($('.top')?.getBoundingClientRect().bottom||0);
  const l=innerWidth<900||!th?0:Math.min(Math.round(th.getBoundingClientRect().right),innerWidth-640);
  g.style.left=Math.max(0,l)+'px';g.style.top=(innerWidth<900?0:top)+'px';g.style.setProperty('--gav-h',(innerHeight-(innerWidth<900?0:top))+'px')}
addEventListener('resize',()=>tgavPos());
let TG_SCROLL=null;
{const _r=render;render=function(){const b=$('.tgav-b');TG_SCROLL=b&&UI.gav?{id:UI.id,top:b.scrollTop}:null;
  const fichaRota=UI.route==='terreno'&&UI.gav;if(!['terrenos','terreno'].includes(UI.route)||UI.route==='terreno'&&!UI.gav)UI.tbCheia=false;
  _r.apply(this,arguments);
  document.body.classList.toggle('tgav-on',!!fichaRota);document.body.classList.toggle('tb-cheia',terCheiaOn());if(fichaRota)document.body.dataset.rota='terrenos';
  if(fichaRota){tgavPos();const nb=$('.tgav-b');if(nb&&TG_SCROLL&&TG_SCROLL.id===UI.id)nb.scrollTop=TG_SCROLL.top}}}
/* trocar de tela fecha a gaveta (menos quando quem chama já diz o que fazer com ela) */
{const _g=go;go=function(r,x={}){if(!('gav' in x))x={...x,gav:false};return _g.call(this,r,x)}}
function tgavAbrir(id){const t=T(id);if(!t)return;const y=scrollY;Object.assign(UI,{route:'terreno',id,gav:true,from:'terrenos',tab:UI.gav&&UI.id===id?UI.tab:'geral',edit:null,propForm:false,reuForm:false,modal:null});
  render();scrollTo({top:y});const b=$('.tgav-b');if(b&&TG_SCROLL?.id!==id)b.scrollTop=0;
  const tr=$(`.lista-ter tr[data-id="${id}"]`);if(tr){const r=tr.getBoundingClientRect();if(r.top<80||r.bottom>innerHeight)tr.scrollIntoView({block:'center'})}}
function tgavFechar(){if(!UI.gav)return;const y=scrollY;Object.assign(UI,{route:'terrenos',gav:false,edit:null,modal:null});render();scrollTo({top:y})}
/* tela cheia: como a do quadro de tarefas */
let tbCheiaApi=false;
function tbTelaCheia(on){if(on===undefined)on=!terCheiaOn();UI.tbCheia=on;
  if(on){try{const p=document.documentElement.requestFullscreen?.({navigationUI:'hide'});tbCheiaApi=!!p;p?.catch?.(()=>{tbCheiaApi=false})}catch(e){tbCheiaApi=false}}
  else if(document.fullscreenElement&&tbCheiaApi){tbCheiaApi=false;document.exitFullscreen?.().catch?.(()=>{})}
  const y=scrollY;render();scrollTo({top:on?0:y})}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&tbCheiaApi){tbCheiaApi=false;if(UI.tbCheia)tbTelaCheia(false)}});
document.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a)return;const A=a.dataset.a;
  if(A==='tb-sort'){e.preventDefault();e.stopImmediatePropagation();terOrdenar(a.dataset.k);const y=scrollY;render();scrollTo({top:y});return}
  if(A==='tb-sem-ordem'){e.stopImmediatePropagation();UI.sorts.ter=[];const y=scrollY;render();scrollTo({top:y});return}
  if(A==='tb-cheia'){e.stopImmediatePropagation();tbTelaCheia();return}
  if(A==='tb-gav'){e.preventDefault();e.stopImmediatePropagation();if(UI.gav&&UI.id===a.dataset.id)tgavFechar();else tgavAbrir(a.dataset.id);return}
  if(A==='tb-gav-x'){e.stopImmediatePropagation();tgavFechar();return}
  if(A==='tb-pagina'){e.stopImmediatePropagation();go('terreno',{id:UI.id,tab:UI.tab,from:'terrenos'});return}
  /* com a gaveta aberta, clicar noutra linha troca o terreno da gaveta */
  if(A==='abrir'&&UI.gav&&a.closest('.lista-ter')){e.stopImmediatePropagation();tgavAbrir(a.dataset.id);return}},true);
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||e.defaultPrevented||UI.modal||UI.vbPop||document.querySelector('.adv-mais.aberto,.pn-dd.aberto,#fx-dr'))return;
  if(UI.gav){tgavFechar();e.preventDefault();return}
  if(UI.tbCheia&&UI.route==='terrenos'&&!document.fullscreenElement){tbTelaCheia(false);e.preventDefault()}});
