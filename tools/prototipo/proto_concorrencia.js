/* ---------- concorrência: empreendimentos de outras empresas no mapa ----------
   Espelha app.concorrentes / concorrencia_empreendimentos / concorrencia_tipologias / concorrencia_precos
   (decisão do Moisés, 24/out/2026). Cadastro numa gaveta à direita, aberta pelo clique direito no mapa
   (toque longo no celular); o toque no ícone abre o quadro com os dados. O preço médio de cada
   tipologia nunca é sobrescrito: cada data de apuração é uma linha nova (a mesma data corrige aquele
   valor). O preço por m² do empreendimento sai das tipologias, como app.concorrencia_resumo. */
const CC_SIT={lancamento:'Lançamento',em_obras:'Em obras',pronto:'Pronto',nao_informado:'Não informada'};
const CC_FAIXA={his1:'HIS 1',his2:'HIS 2',hmp:'HMP',r2v:'R2V',nr:'NR',nao_informado:'Não informada'};
const CC_FONTE={stand:'Stand de vendas',site:'Site da empresa',corretor:'Corretor',portal:'Portal de anúncios',outra:'Outra',nao_informado:'Não informada'};
const CC={dr:null,box:null,hist:null,desativar:false,abertoEm:0};
const ccData=s=>s?s.split('-').reverse().join('/'):'—';
const ccCurta=s=>{if(!s)return '—';const [y,m,d]=s.split('-');return `${d}/${m}/${y.slice(2)}`};
const ccMes=s=>{if(!s)return '—';const [y,m]=s.split('-');return MES[+m-1]+'/'+y};
const ccDorm=d=>d==null?'—':d===0?'Studio':d+' dorm';
const ccM2=v=>v==null?'—':brl(v)+'/m²';
/* marca no mapa (opção A, decisão do Moisés de 24/out/2026): quadrado roxo com prédio, sem o nome ao lado
   (atrapalhava a leitura do mapa); o nome fica no quadro que abre ao tocar */
const CC_PREDIO='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 21V5l8-3v19M12 9l8 3v9M2 21h20M7 8h2M7 12h2M7 16h2M15 14h2M15 18h2"/></svg>';
const ccMarcaHtml=()=>`<span class="conc-b">${CC_PREDIO}</span>`;
const ccAtivos=()=>(S.concorrentes||[]).filter(c=>c.ativo!==false);
const ccC=id=>(S.concorrentes||[]).find(c=>c.id===id);
const ccEmp=id=>(S.concEmpresas||[]).find(e=>e.id===id);
const ccEmpN=c=>ccEmp(c.emp)?.nome||'';

/* dados de exemplo e conversão do formato antigo (empresa em texto, sem tipologias) */
function ccPreparar(){if(!S.concEmpresas)S.concEmpresas=[];
  (S.concorrentes||[]).forEach(c=>{if(c.emp===undefined){const n=(c.empresa||'').trim();let e=n&&S.concEmpresas.find(x=>x.nome.toLowerCase()===n.toLowerCase());
      if(n&&!e){e={id:uid(),nome:n};S.concEmpresas.push(e)}c.emp=e?e.id:null;delete c.empresa}
    if(!c.tip)c.tip=[];if(!c.sit)c.sit='nao_informado'})}
function ccSeed(){const E=[{id:'ce1',nome:'Construtora Exemplo A'},{id:'ce2',nome:'Incorporadora Exemplo B'},{id:'ce3',nome:'Construtora Exemplo C'}];
  const tp=(id,dorm,area,unid,faixa,precos)=>({id,dorm,area,unid,faixa,ativo:true,precos:precos.map(([em,preco,fonte])=>({em,preco,fonte}))});
  return {E,C:[
    {id:'c1',nome:'Residencial Jardim Prudente',emp:'ce1',lat:-23.58620,lng:-46.57950,end:'Rua Exemplo, 100 · Vila Prudente, São Paulo',unid:240,sit:'lancamento',lanc:'2026-03-01',obs:'',ativo:true,
      tip:[tp('t11',2,40,180,'his2',[['2026-03-10',245000,'stand'],['2026-09-15',259000,'stand']]),tp('t12',2,48,60,'hmp',[['2026-03-10',330000,'stand'],['2026-09-15',345000,'stand']])]},
    {id:'c2',nome:'Condomínio Parque Tatuapé',emp:'ce2',lat:-23.54250,lng:-46.57300,end:'Tatuapé, São Paulo',unid:310,sit:'em_obras',lanc:'2025-08-01',obs:'Torres A e B em obras',ativo:true,
      tip:[tp('t21',1,32,null,'his1',[['2026-07-02',198000,'site']]),tp('t22',2,42,null,'his2',[['2026-07-02',262000,'site']]),tp('t23',3,64,null,'r2v',[['2026-05-20',520000,'portal']])]},
    {id:'c3',nome:'Vila Cupecê Residencial',emp:'ce3',lat:-23.66450,lng:-46.64900,end:'Cidade Ademar, São Paulo',unid:null,sit:'nao_informado',lanc:null,obs:'',ativo:true,tip:[]}]}}

/* ---------- cálculo (o mesmo de app.concorrencia_tipologias_em e app.concorrencia_resumo) ---------- */
function ccVig(tp,data=HOJE){const p=(tp.precos||[]).filter(x=>x.em<=data).sort((a,b)=>b.em.localeCompare(a.em))[0];
  return p?{...p,m2:Math.round(p.preco/tp.area*100)/100}:null}
function ccResumo(c,data=HOJE){const ts=(c.tip||[]).filter(t=>t.ativo!==false),cp=ts.map(t=>({t,p:ccVig(t,data)})).filter(x=>x.p);
  const mix=cp.length>0&&cp.every(x=>x.t.unid!=null);let m2=null;
  if(cp.length)m2=mix?cp.reduce((s,x)=>s+x.p.preco*x.t.unid,0)/cp.reduce((s,x)=>s+x.t.area*x.t.unid,0):cp.reduce((s,x)=>s+x.p.m2,0)/cp.length;
  const ds=cp.map(x=>x.p.em).sort();
  return {n:ts.length,ncp:cp.length,m2:m2==null?null:Math.round(m2*100)/100,mix,de:ds[0]||null,ate:ds[ds.length-1]||null,
    faixas:[...new Set(ts.map(t=>t.faixa).filter(f=>f&&f!=='nao_informado'))].sort()}}

/* ---------- quadro ao tocar no ícone ---------- */
function ccBoxHtml(c){const r=ccResumo(c),ro=UI.role==='Leitura',ts=(c.tip||[]).filter(t=>t.ativo!==false);
  const per=r.de?(r.de===r.ate?`apurado em ${ccData(r.de)}`:`apurados de ${ccMes(r.de)} a ${ccMes(r.ate)}`):'';
  const meta=[c.unid!=null?num(c.unid)+' unidades':'Unidades não informadas',c.lanc?'lançado em '+ccMes(c.lanc):'',r.faixas.map(f=>CC_FAIXA[f]).join(', ')].filter(Boolean).join(' · ');
  const linhas=ts.map(t=>{const p=ccVig(t),ab=CC.hist===t.id,hs=[...(t.precos||[])].sort((a,b)=>b.em.localeCompare(a.em));
    return `<tr class="cc-tr${hs.length>1?' cc-tem':''}" ${hs.length>1?`data-a="cc-hist" data-id="${t.id}" tabindex="0" aria-expanded="${ab}" title="Histórico de preços"`:''}><td><span class="cc-tn">${ccDorm(t.dorm)} · ${num(t.area,2)} m²${hs.length>1?ic('chev',14):''}</span>${t.faixa!=='nao_informado'?`<div class="faint">${CC_FAIXA[t.faixa]}</div>`:''}</td><td class="num">${p?brl(p.preco):'—'}</td><td class="num">${p?brl(p.m2):'—'}</td><td class="num">${p?ccCurta(p.em):'—'}</td></tr>`
      +(ab?`<tr class="cc-h-r"><td colspan="4"><ul class="cc-hl">${hs.map(h=>`<li><span>${ccData(h.em)}</span><span class="num">${brl(h.preco)}</span><span class="num">${ccM2(h.preco/t.area)}</span><span class="faint">${esc(CC_FONTE[h.fonte]||'')}</span></li>`).join('')}</ul></td></tr>`:'')}).join('');
  return `<div class="cc-box" role="dialog" aria-label="${esc(c.nome)}">
  <div class="cc-hd"><div class="cc-ti"><div class="cc-n">${esc(c.nome)}</div><div class="muted">${esc([ccEmpN(c),CC_SIT[c.sit]!=='Não informada'?CC_SIT[c.sit]:''].filter(Boolean).join(' · '))}</div></div><button type="button" class="iconbtn" data-a="cc-x" aria-label="Fechar" title="Fechar (Esc)">${ic('close',20)}</button></div>
  <div class="cc-k"><div class="cc-big">${r.m2!=null?ccM2(r.m2):'Sem preço apurado'}</div>${r.m2!=null?`<div class="faint">${r.ncp>1?(r.mix?'média ponderada pelas unidades':'média das tipologias (sem as unidades de cada uma)'):'de uma tipologia'} · ${per}</div>`:''}</div>
  <div class="cc-meta muted">${esc(meta)}</div>${c.end?`<div class="cc-meta faint">${esc(c.end)}</div>`:''}
  ${ts.length?`<div class="cc-tw"><table class="cc-t"><thead><tr><th>Tipologia</th><th class="num">Preço médio</th><th class="num">Por m²</th><th class="num">Apuração</th></tr></thead><tbody>${linhas}</tbody></table></div>`:'<div class="faint cc-meta">Nenhuma tipologia cadastrada.</div>'}
  ${c.obs?`<div class="cc-meta">${esc(c.obs)}</div>`:''}
  ${ro?'':`<div class="cc-ac">${CC.desativar?`<span class="muted">Tirar do mapa? O histórico fica.</span><button class="btn text sm" data-a="cc-desat-n">Não</button><button class="btn sm" data-a="cc-desat-s">Desativar</button>`
    :`<button class="btn primary sm" data-a="cc-precos" ${ts.length?'':'disabled'}>Atualizar preços</button><button class="btn sm" data-a="cc-editar">Editar</button><button class="btn text sm" data-a="cc-desat">Desativar</button>`}</div>`}</div>`}
function ccBox(){const area=$('.mapa-area');let el=$('#cc-box');const c=CC.box&&UI.route==='mapa'?ccC(CC.box):null;
  if(!c||c.ativo===false||!area){el?.remove();if(!c)CC.box=null;return}
  if(!el||el.parentNode!==area){el?.remove();el=document.createElement('div');el.id='cc-box';area.appendChild(el)}
  el.innerHTML=ccBoxHtml(c)}
function ccAbrir(id){CC.box=id;CC.hist=null;CC.desativar=false;CC.abertoEm=Date.now();if(UI.mpSel)mpSelecionar(null);if(UI.fichaSheet){UI.fichaSheet=null;fichaSheet()}ccBox()}
function ccFechar(){if(!CC.box)return false;CC.box=null;CC.hist=null;CC.desativar=false;ccBox();return true}
const ccFecharDoMapa=()=>{if(Date.now()-CC.abertoEm>350)ccFechar()};

/* ---------- gaveta: nova concorrência, editar e atualizar preços ---------- */
function ccNovo(ll){CC.dr={modo:'novo',lat:ll.lat,lng:ll.lng,c:{nome:'',emp:'',end:'',unid:null,sit:'nao_informado',lanc:'',obs:'',tip:[ccTipVazia()]}};ccAbreDr();
  localDoPonto(ll.lat,ll.lng).then(r=>{const d=CC.dr;if(!d||d.modo!=='novo'||d.c.end)return;d.c.end=[[r.logradouro,r.numero].filter(Boolean).join(', '),r.bairro,r.cidade].filter(Boolean).join(' · ');
    const i=$('#cc-end');if(i&&!i.value)i.value=d.c.end}).catch(()=>{})}
const ccTipVazia=()=>({id:uid(),dorm:2,area:null,unid:null,faixa:'nao_informado',ativo:true,precos:[],novo:true});
function ccEditar(id,modo){const c=ccC(id);if(!c)return;CC.dr={modo,id,c:JSON.parse(JSON.stringify(c))};ccFechar();ccAbreDr()}
function ccAbreDr(){if(typeof FX_ABERTO!=='undefined'&&FX_ABERTO){FX_ABERTO=false;fxDrawer()}if(UI.fichaSheet){UI.fichaSheet=null;fichaSheet()}ccDrawer();setTimeout(()=>$('#cc-dr input:not([type=hidden]):not([disabled])')?.focus(),30)}
function ccFecharDr(){CC.dr=null;ccDrawer();$('#cc-emp-dlg')?.remove()}
function ccTipHtml(t,i,modo){const so=modo==='precos',p=ccVig(t),pre=n=>`cc-${n}-${t.id}`;
  const opt=(o,v)=>Object.entries(o).map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${esc(l)}</option>`).join('');
  return `<div class="cc-tp" data-tid="${t.id}"><div class="cc-tp-h"><span>${so?`${ccDorm(t.dorm)} · ${num(t.area,2)} m²${t.faixa!=='nao_informado'?' · '+CC_FAIXA[t.faixa]:''}`:`Tipologia ${i+1}`}</span>${so?'':`<button type="button" class="iconbtn" data-a="cc-tp-x" data-id="${t.id}" aria-label="Tirar a tipologia ${i+1}" title="Tirar">${ic('close',18)}</button>`}</div>
  <div class="fields">${so?'':`<div class="field"><label for="${pre('d')}">Dormitórios</label><select id="${pre('d')}" data-k="dorm">${[['','Não informado'],['0','Studio'],['1','1'],['2','2'],['3','3'],['4','4 ou mais']].map(([v,l])=>`<option value="${v}" ${String(t.dorm??'')===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label for="${pre('a')}">Área privativa (m²) *</label><input id="${pre('a')}" data-k="area" inputmode="decimal" required value="${t.area!=null?num(t.area,2):''}" placeholder="42,5"></div>
    <div class="field"><label for="${pre('u')}">Unidades</label><input id="${pre('u')}" data-k="unid" inputmode="numeric" value="${t.unid??''}" placeholder="Não informado"></div>
    <div class="field"><label for="${pre('f')}">Faixa social</label><select id="${pre('f')}" data-k="faixa">${opt(CC_FAIXA,t.faixa)}</select></div>`}
    <div class="field full"><label for="${pre('p')}">Preço médio (R$)</label><input id="${pre('p')}" data-k="preco" inputmode="decimal" value="${esc(t._preco||'')}" placeholder="${p?'Último: '+brl(p.preco)+' em '+ccData(p.em):'Ex.: 260 mil'}">${p?'<div class="hint">Em branco, fica o último preço.</div>':''}</div></div></div>`}
function ccDrawer(){let el=$('#cc-dr'),sc=$('#cc-scrim');const d=CC.dr;
  if(!d){el?.remove();sc?.remove();return}
  if(!el){sc=document.createElement('div');sc.id='cc-scrim';sc.className='fx-scrim';sc.dataset.a='cc-dr-x';document.body.appendChild(sc);
    el=document.createElement('aside');el.id='cc-dr';el.className='fx-dr cc-dr';el.setAttribute('role','dialog');document.body.appendChild(el)}
  const c=d.c,so=d.modo==='precos',tit={novo:'Nova concorrência',editar:'Editar concorrência',precos:'Atualizar preços'}[d.modo];el.setAttribute('aria-label',tit);
  const opt=(o,v)=>Object.entries(o).map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${esc(l)}</option>`).join('');
  const emps=(S.concEmpresas||[]).filter(e=>e.ativo!==false).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const ts=c.tip.filter(t=>t.ativo!==false);
  el.innerHTML=`<div class="fx-h"><h2>${tit}</h2><button class="iconbtn" data-a="cc-dr-x" aria-label="Fechar" title="Fechar (Esc)">${ic('close',22)}</button></div>
  <form class="fx-b cc-f" id="cc-f" novalidate>
  ${so?`<div class="cc-sec"><div class="cc-n">${esc(c.nome)}</div><div class="muted">${esc(ccEmpN(c))}</div></div>`:`<div class="cc-sec"><div class="fields">
    <div class="field full"><label for="cc-emp">Empresa *</label><div class="cc-emp"><select id="cc-emp" name="emp" required><option value="">Escolher</option>${emps.map(e=>`<option value="${e.id}" ${c.emp===e.id?'selected':''}>${esc(e.nome)}</option>`).join('')}</select><button type="button" class="btn text sm" data-a="cc-emp-novo">${ic('add',16)}Incluir empresa</button></div></div>
    <div class="field full"><label for="cc-nome">Empreendimento *</label><input id="cc-nome" name="nome" required value="${esc(c.nome)}" placeholder="Nome do empreendimento"></div>
    <div class="field full"><label for="cc-end">Endereço</label><input id="cc-end" name="end" value="${esc(c.end||'')}" placeholder="${d.modo==='novo'?'Buscando pelo ponto…':''}"></div>
    <div class="field"><label for="cc-unid">Unidades no total</label><input id="cc-unid" name="unid" inputmode="numeric" value="${c.unid??''}" placeholder="Não informado"></div>
    <div class="field"><label for="cc-sit">Situação</label><select id="cc-sit" name="sit">${opt(CC_SIT,c.sit)}</select></div>
    <div class="field"><label for="cc-lanc">Data de lançamento</label><input id="cc-lanc" name="lanc" type="date" max="${HOJE}" value="${c.lanc||''}"></div>
    <div class="field full"><label for="cc-obs">Observação</label><input id="cc-obs" name="obs" value="${esc(c.obs||'')}"></div></div></div>`}
  <div class="cc-sec"><div class="cc-sh">Apuração dos preços</div><div class="fields">
    <div class="field"><label for="cc-em">Data de apuração</label><input id="cc-em" name="em" type="date" max="${HOJE}" value="${HOJE}" required></div>
    <div class="field"><label for="cc-fonte">Fonte</label><select id="cc-fonte" name="fonte">${opt(CC_FONTE,'stand')}</select></div></div>
    </div>
  <div class="cc-sec"><div class="cc-sh">Tipologias</div>${ts.map((t,i)=>ccTipHtml(t,i,d.modo)).join('')||'<div class="faint">Nenhuma tipologia.</div>'}
    ${so?'':`<button type="button" class="btn text sm" data-a="cc-tp-add">${ic('add',16)}Adicionar tipologia</button>`}</div>
  </form><div class="fx-f"><span class="fx-tot"></span><button class="btn text sm" data-a="cc-dr-x">Cancelar</button><button class="btn primary sm" type="submit" form="cc-f">Salvar</button></div>`}
/* o que está digitado volta para o rascunho (para redesenhar a gaveta sem perder nada) */
function ccLer(){const d=CC.dr,f=$('#cc-f');if(!d||!f)return;const c=d.c,v=n=>f.querySelector(`[name="${n}"]`)?.value;
  if(d.modo!=='precos'){c.emp=v('emp')||'';c.nome=v('nome')||'';c.end=v('end')||'';c.unid=ccInt(v('unid'));c.sit=v('sit');c.lanc=v('lanc')||''; c.obs=v('obs')||''}
  d.em=v('em');d.fonte=v('fonte');
  f.querySelectorAll('.cc-tp').forEach(b=>{const t=c.tip.find(x=>x.id===b.dataset.tid);if(!t)return;const g=k=>b.querySelector(`[data-k="${k}"]`)?.value;
    if(d.modo!=='precos'){const dm=g('dorm');t.dorm=dm===''?null:+dm;t.area=ccDec(g('area'));t.unid=ccInt(g('unid'));t.faixa=g('faixa')}
    t._preco=g('preco')})}
const ccDec=s=>{s=String(s??'').trim();if(!s)return null;const n=Number(s.replace(/\./g,'').replace(',','.'));return isFinite(n)&&n>0?n:null};
const ccInt=s=>{const n=parseInt(String(s??'').replace(/\D/g,''),10);return isFinite(n)&&n>0?n:null};
function ccGravar(){ccLer();const d=CC.dr,c=d.c,ts=c.tip.filter(t=>t.ativo!==false);
  if(d.modo!=='precos'){if(!c.emp)return toast('Escolha a empresa.',true);if(!c.nome.trim())return toast('Preencha o nome do empreendimento.',true);
    if(ts.some(t=>t.area==null))return toast('Preencha a área privativa de cada tipologia.',true)}
  if(!d.em||d.em>HOJE)return toast('A data de apuração não pode ser no futuro.',true);
  const precos=ts.filter(t=>String(t._preco||'').trim());for(const t of precos){t._v=fxLerNum(t._preco);if(!(t._v>0))return toast('Preço médio inválido: use números, como 260 mil ou 260.000.',true)}
  if(d.modo==='precos'&&!precos.length)return toast('Preencha o preço de ao menos uma tipologia.',true);
  precos.forEach(t=>{t.precos=(t.precos||[]).filter(p=>p.em!==d.em);t.precos.push({em:d.em,preco:t._v,fonte:d.fonte})});
  c.tip.forEach(t=>{delete t._preco;delete t._v;delete t.novo});c.tip=c.tip.filter(t=>t.ativo!==false||t.precos.length);  // tipologia nova tirada some; com preço, fica desativada
  c.nome=c.nome.trim();
  if(d.modo==='novo'){const n={id:uid(),...c,lat:d.lat,lng:d.lng,lanc:c.lanc||null,ativo:true};S.concorrentes=S.concorrentes||[];S.concorrentes.push(n);d.id=n.id}
  else{const o=ccC(d.id);Object.assign(o,c,{lanc:c.lanc||null})}
  save();const id=d.id,modo=d.modo;ccFecharDr();desenhaConc();const lg=$('#mp-leg');if(lg)lg.innerHTML=mpLegenda();
  toast(modo==='novo'?'Concorrência salva.':modo==='precos'?`Preços de ${ccData(precos[0]?.precos.at(-1).em)} salvos.`:'Concorrência atualizada.');ccAbrir(id)}
function ccEmpPopup(){const dlg=document.createElement('div');dlg.id='cc-emp-dlg';dlg.className='scrim ms-scrim';
  dlg.innerHTML=`<div class="dialog mini" role="dialog" aria-modal="true" aria-labelledby="cce-h"><div class="dh"><h2 id="cce-h">Incluir empresa</h2><button type="button" class="iconbtn" data-a="cc-emp-x" aria-label="Fechar">${ic('close')}</button></div>
    <form id="cc-emp-f" class="fields"><div class="field"><label for="cce-n">Nome da empresa *</label><input id="cce-n" name="n" required placeholder="Incorporadora ou construtora"></div></form>
    <div class="df"><button type="button" class="btn text" data-a="cc-emp-x">Cancelar</button><button class="btn primary" type="submit" form="cc-emp-f">Incluir</button></div></div>`;
  document.body.appendChild(dlg);dlg.querySelector('input').focus()}
function ccEmpGravar(f){const n=f.n.value.trim();if(!n)return toast('Preencha o nome da empresa.',true);
  if((S.concEmpresas||[]).some(e=>e.ativo!==false&&e.nome.toLowerCase()===n.toLowerCase()))return toast('Essa empresa já está na lista.',true);
  const e={id:uid(),nome:n};S.concEmpresas.push(e);save();ccLer();if(CC.dr)CC.dr.c.emp=e.id;$('#cc-emp-dlg')?.remove();ccDrawer();toast('Empresa incluída.')}

/* ---------- eventos ---------- */
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="cc-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const id=a.dataset.id;
  switch(a.dataset.a){
    case 'cc-x':ccFechar();break;
    case 'cc-hist':CC.hist=CC.hist===id?null:id;ccBox();break;
    case 'cc-editar':ccEditar(CC.box,'editar');break;
    case 'cc-precos':ccEditar(CC.box,'precos');break;
    case 'cc-desat':CC.desativar=true;ccBox();break;
    case 'cc-desat-n':CC.desativar=false;ccBox();break;
    case 'cc-desat-s':{const c=ccC(CC.box);c.ativo=false;save();ccFechar();desenhaConc();const lg=$('#mp-leg');if(lg)lg.innerHTML=mpLegenda();toast(`${c.nome} saiu do mapa.`);break}
    case 'cc-dr-x':ccFecharDr();break;
    case 'cc-tp-add':ccLer();CC.dr.c.tip.push(ccTipVazia());ccDrawer();$('#cc-dr .cc-tp:last-of-type [data-k="area"]')?.focus();break;
    case 'cc-tp-x':{ccLer();const t=CC.dr.c.tip.find(x=>x.id===id);if(t)t.ativo=false;ccDrawer();break}
    case 'cc-emp-novo':ccEmpPopup();break;
    case 'cc-emp-x':$('#cc-emp-dlg')?.remove();break}},true);
document.addEventListener('submit',e=>{const f=e.target;if(f.id==='cc-f'){e.preventDefault();e.stopImmediatePropagation();ccGravar()}
  else if(f.id==='cc-emp-f'){e.preventDefault();e.stopImmediatePropagation();ccEmpGravar(f)}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!UI.modal){if($('#cc-emp-dlg')){$('#cc-emp-dlg').remove()}else if(CC.dr)ccFecharDr();else if(!ccFechar())return;e.preventDefault();e.stopImmediatePropagation()}
  else if((e.key==='Enter'||e.key===' ')&&e.target.matches?.('.cc-tr[data-a]')){e.preventDefault();e.target.click()}},true);
document.addEventListener('mousedown',e=>{const d=$('#cc-emp-dlg');if(d&&e.target===d)d.remove()});
/* o quadro acompanha os redesenhos da página Mapa; fora dela, quadro e gaveta fecham */
const _posRenderCc=posRender;posRender=function(){_posRenderCc.apply(this,arguments);if(UI.route!=='mapa'){CC.box=null;if(CC.dr)ccFecharDr()}ccBox()};
/* um painel por vez: filtros, ficha do terreno e a gaveta da concorrência; selecionar um terreno fecha o quadro */
const _fxDrawerCc=fxDrawer;fxDrawer=function(){if(FX_ABERTO&&CC.dr)ccFecharDr();return _fxDrawerCc.apply(this,arguments)};
const _fichaSheetCc=fichaSheet;fichaSheet=function(){if(UI.fichaSheet){if(CC.dr)ccFecharDr();ccFechar()}return _fichaSheetCc.apply(this,arguments)};
const _mpSelecionarCc=mpSelecionar;mpSelecionar=function(id){if(id)ccFechar();return _mpSelecionarCc.apply(this,arguments)};
const _prepararCc=prepararDados;prepararDados=function(){_prepararCc.apply(this,arguments);ccPreparar()};
ccPreparar();
