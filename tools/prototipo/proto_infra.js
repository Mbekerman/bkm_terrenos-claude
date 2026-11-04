// ---------------------------------------------------------------------
// Aba Infraestrutura (lote 3 da ficha em abas; decisões do Moisés, 3/nov/2026):
// relevo com a classificação topográfica em 5 perfis, visita técnica com 8 itens
// e viabilidades técnicas das concessionárias com validade.
//
// Classificação: as cotas dentro da poligonal (laser 2020 da prefeitura em São Paulo,
// Google fora) dão o plano que melhor se ajusta a elas (mínimos quadrados) e a terra
// mexida para deixar o terreno nesse plano (média de |cota − plano|, em m³ por m² de
// terreno). Vale o pior dos dois. Com o Google (erro de 1 a 2 m nos levantamentos de
// campo) a terra mexida não tem precisão: só Plano, Inclinado ou, acima do limite,
// crítico. Medida sozinha ao abrir a ficha e ao salvar a poligonal; poligonal nova
// apaga a medição antiga (no banco, t_norm). Perfil pela regra do banco,
// app.classificar_topografia; limites em Configurações › Topografia.
// ---------------------------------------------------------------------
// TP_PERFIS se repete como literal em proto_itens.js (o catálogo é montado antes deste arquivo carregar).
const TP_PERFIS=[['plano','Plano'],['inclinado','Inclinado'],['acidentado_leve','Acidentado leve'],['acidentado_mediano','Acidentado mediano'],['acidentado_critico','Acidentado crítico']];
const TP_N=Object.fromEntries(TP_PERFIS);
const TP_CFG0={plano:3,inclinado:30,leve:.25,mediano:.5,critico:1};
const tpCfg=()=>Object.assign({},TP_CFG0,S.topoCfg||{});
function tpClassificar(incl,terra,c=tpCfg()){if(incl==null)return null;
  if(incl>c.inclinado||(terra!=null&&terra>c.critico))return 'acidentado_critico';
  if(terra!=null&&terra>c.mediano)return 'acidentado_mediano';
  if(terra!=null&&terra>c.leve)return 'acidentado_leve';
  return incl<=c.plano?'plano':'inclinado'}
const tpKey=t=>t.poly&&t.poly.length>=3?t.poly.map(p=>(+p[0]).toFixed(6)+','+(+p[1]).toFixed(6)).join(';'):'';
/* medição válida: a da poligonal atual (a de outra forma não vale mais) */
const tpAtual=t=>t.topoClass&&t.topoClass.key===tpKey(t)?t.topoClass:null;
const tpNome=r=>r.perfil==='inclinado'?`Inclinado · ${num(r.incl,1)}%`:TP_N[r.perfil];
const TP_EM={},TP_ERRO={};
/* exemplos do protótipo, usados só onde não dá para medir (arquivo local ou artifact: sem GeoSampa e sem Google) */
const TP_EXEMPLO={'TER-000118':[1.8,.12,'laser'],'TER-000112':[6.2,.18,'laser'],'TER-000123':[4.1,null,'google'],'TER-000127':[14.5,.38,'laser'],'TER-000105':[9.8,.72,'laser'],'TER-000101':[22,1.35,'laser']};
function tpPodeMedir(t){const sp=cidDoTerreno(t)==='sp';return sp?!!GEO_BASE:!!GG}
function tpAuto(t){if(!t||!tpKey(t)||UI.role==='Leitura'||tpAtual(t))return;const k=tpKey(t);
  if(TP_EM[t.id]||TP_ERRO[t.id]?.key===k)return;
  if(!tpPodeMedir(t)){const x=TP_EXEMPLO[t.codigo];if(x){tpGravar(t,{key:k,incl:x[0],terra:x[1],fonte:x[2],desnivel:null,n:null,exemplo:true},false)}
    else TP_ERRO[t.id]={key:k,msg:cidDoTerreno(t)==='sp'?'em São Paulo as cotas vêm do laser da prefeitura, que só responde na versão publicada.':'fora de São Paulo as cotas vêm do Google, que só funciona na versão publicada.',local:true};
    tpRedesenha(t);return}
  tpMedir(t)}
function tpGravar(t,r,logar=true){r.perfil=tpClassificar(r.incl,r.terra);r.em=agora();r.user=me();t.topoClass=r;delete TP_ERRO[t.id];
  if(logar)log(t,`Classificação topográfica: ${tpNome(r)} (${r.fonte==='laser'?'laser 2020 da prefeitura':'cotas do Google'})`);save()}
async function tpMedir(t){const k=tpKey(t),sp=cidDoTerreno(t)==='sp';TP_EM[t.id]=1;delete TP_ERRO[t.id];tpRedesenha(t);
  try{const c0=centro(t.poly),zona=Math.floor((c0[1]+180)/6)+1,l0=-183+6*zona;const P=[t.poly.map(([la,lo])=>latLngUtm(la,lo,l0))];
    const area=geoAreaAnel(P[0]),passo=sp?(area>40000?2:1):TOPO_PASSO_G,ext=topoExt(P.flat()),m=sp?4:3*TOPO_PASSO_G;
    const bb=[ext[0]-m,ext[1]-m,ext[2]+m,ext[3]+m].map(v=>Math.round(v)),G=topoGrade(P,bb,passo),nada=()=>{};
    let fz;if(sp){if(!GEO_BASE)throw new Error('o laser da prefeitura só responde na versão publicada');fz=await topoLaser(G,bb,nada)}else fz=await topoGoogle(G,l0,nada);
    const r=tpPlano(G);if(!r)throw new Error('nenhuma cota dentro da poligonal');
    if(tpKey(t)!==k)return; // a poligonal mudou durante a medição: a próxima abertura mede de novo
    tpGravar(t,{key:k,incl:r.incl,terra:fz.fonte==='laser'?r.terra:null,desnivel:r.desnivel,min:r.min,max:r.max,n:r.n,fonte:fz.fonte})}
  catch(e){console.error(e);TP_ERRO[t.id]={key:k,msg:e.message||String(e)}}
  finally{delete TP_EM[t.id];tpRedesenha(t)}}
/* plano z = a·x + b·y + c pelas células dentro da poligonal (D = 0); inclinação = |∇| e terra mexida = média de |resíduo| */
function tpPlano(G){let n=0,sx=0,sy=0,sz=0;const X=[],Y=[],Z=[];
  for(let j=0;j<G.ny;j++)for(let i=0;i<G.nx;i++){const c=j*G.nx+i,z=G.Z[c];if(G.D[c]!==0||z!==z)continue;const x=i*G.s,y=j*G.s;X.push(x);Y.push(y);Z.push(z);sx+=x;sy+=y;sz+=z;n++}
  if(n<3)return null;const mx=sx/n,my=sy/n,mz=sz/n;let xx=0,xy=0,yy=0,xz=0,yz=0,mn=Infinity,mxz=-Infinity;
  for(let q=0;q<n;q++){const x=X[q]-mx,y=Y[q]-my,z=Z[q]-mz;xx+=x*x;xy+=x*y;yy+=y*y;xz+=x*z;yz+=y*z;if(Z[q]<mn)mn=Z[q];if(Z[q]>mxz)mxz=Z[q]}
  const det=xx*yy-xy*xy,a=det?(xz*yy-yz*xy)/det:0,b=det?(yz*xx-xz*xy)/det:0;let res=0;
  for(let q=0;q<n;q++)res+=Math.abs(Z[q]-mz-a*(X[q]-mx)-b*(Y[q]-my));
  return {incl:+(Math.hypot(a,b)*100).toFixed(2),terra:+(res/n).toFixed(3),desnivel:+(mxz-mn).toFixed(2),min:mn,max:mxz,n}}
/* a medição termina fora do clique: troca só o quadro e a linha do Resumo, sem redesenhar a página (não tira o foco de quem digita) */
function tpRedesenha(t){if(UI.route!=='terreno'||UI.id!==t.id)return;
  const s=document.getElementById('sec-relevo');if(s){const n=document.createElement('div');n.innerHTML=tpSecao(t);const novo=n.firstElementChild;if(novo){s.replaceWith(novo);if(typeof uiQuadros==='function')uiQuadros()}}
  const r=document.getElementById('rs-topo');if(r)r.outerHTML=tpResumo(t)}
const tpChip=r=>`<span class="tp-chip tp-${r.perfil}">${esc(tpNome(r))}</span>`;
/* linha do Resumo da Visão geral: o perfil medido (o relevo digitado saiu, decisão do Moisés de 4/nov/2026) */
function tpResumo(t){const r=tpAtual(t);
  const txt=r?`${tpChip(r)}${r.desnivel!=null?`<span class="kv-2">desnível ${num(r.desnivel,1)} m</span>`:''}`
    :TP_EM[t.id]?'<span class="faint">medindo...</span>':'';
  return `<span id="rs-topo">${txt}</span>`}
function tpSecao(t){const r=tpAtual(t),e=TP_ERRO[t.id],sp=cidDoTerreno(t)==='sp',ed=UI.role!=='Leitura',C=tpCfg();
  let corpo;
  if(!tpKey(t))corpo=`<div class="muted">Sem poligonal. A classificação sai sozinha quando a poligonal for desenhada.</div>`;
  else if(TP_EM[t.id])corpo=`<div class="tp-medindo"><span class="tp-gira" aria-hidden="true"></span>Medindo o relevo pelas cotas ${sp?'do laser 2020 da prefeitura':'do Google'}...</div>`;
  else if(!r&&e)corpo=`<div class="banner warn">${ic('warn')}<div style="flex:1">Não deu para medir o relevo: ${esc(e.msg)}${!e.local&&ed?` <button class="linkbtn" data-a="tp-medir">Tentar de novo</button>`:''}</div></div>`;
  else if(!r)corpo=`<div class="muted">${ed?'Ainda não medido.':'Ainda não medido. Quem edita a ficha mede ao abri-la.'}</div>`;
  else{const lin=(k,v,x='')=>`<div class="kv"><dt>${k}</dt><dd>${v}${x?`<span class="kv-2">${x}</span>`:''}</dd></div>`;
    const fonte=r.fonte==='laser'?'Laser 2020 da Prefeitura de São Paulo':'Google (grade de 5 m)';
    corpo=`<div class="tp-faixa tp-${r.perfil}"><div class="tp-n">${esc(tpNome(r))}</div>
      <div class="tp-s">${r.fonte==='google'&&r.perfil!=='acidentado_critico'?'Acidentado não avaliado: com as cotas do Google o erro é de 1 a 2 m. Precisa do levantamento.':`Medido em ${fd(r.em.slice(0,10))}${r.exemplo?' · exemplo do protótipo':''}`}</div></div>
      <dl class="kvl tp-kv">${lin('Inclinação do plano',num(r.incl,1)+'%','plano que melhor se ajusta às cotas')}
      ${lin('Terra mexida até o plano',r.terra!=null?num(r.terra,2)+' m³/m²':'<span class="faint">não avaliada</span>',r.terra!=null?'corte + aterro ÷ área':'')}
      ${r.desnivel!=null?lin('Desnível',num(r.desnivel,1)+' m',`cotas de ${num(r.min,1)} a ${num(r.max,1)} m`):''}
      ${lin('Cotas',esc(fonte),r.n?num(r.n)+' pontos dentro da poligonal':'')}</dl>
      <div class="tp-escala" role="list" aria-label="Perfis">${TP_PERFIS.map(([k,l])=>`<span role="listitem" class="tp-e tp-${k}${k===r.perfil?' on':''}">${l}</span>`).join('')}</div>
      <p class="tp-regra">Vale o pior entre a inclinação (Plano até ${num(C.plano,0)}%, Inclinado até ${num(C.inclinado,0)}%, acima disso crítico) e a terra mexida (Leve acima de ${num(C.leve,2)}, Mediano acima de ${num(C.mediano,2)} e Crítico acima de ${num(C.critico,2)} m³/m²). Triagem: não substitui o levantamento planialtimétrico.${ed&&tpPodeMedir(t)?` <button class="linkbtn" data-a="tp-medir">Medir de novo</button>`:''}</p>`}
  return `<section class="sec" id="sec-relevo"><div class="sec-h"><h2>Relevo</h2>${topoBotao(t)}</div><div class="sec-b">${corpo}</div></section>`}

/* ---------- visita técnica: 8 itens com Sim, Parcial, Não, Não se aplica e observação; começa em Não verificado ---------- */
const VT_OPC=[['nao_verificado','Não verificado',''],['sim','Sim','good'],['parcial','Parcial','warn'],['nao','Não','crit'],['nao_se_aplica','Não se aplica','']];
const VT_N=Object.fromEntries(VT_OPC.map(o=>[o[0],o[1]]));
function vtSecao(t){const ro=UI.role==='Leitura',nv=infraNV(t);
  return `<section class="sec" id="sec-visita"><div class="sec-h"><h2>Visita técnica</h2>${nv?`<span class="faint" style="font-size:13px">${nv} não verificado${nv>1?'s':''}</span>`:''}</div>
  <div class="sec-b vt-b"><div class="field vt-data"><label for="vt-dt">Data da visita</label><input id="vt-dt" type="date" data-ch="vt-data" value="${esc(t.visita||'')}" ${ro?'disabled':''}></div>
  <div class="vt-l">${INFRA.map(([k,l])=>{const r=t.infra[k]||{d:'nao_verificado'},o=VT_OPC.find(x=>x[0]===r.d)||VT_OPC[0];
    return `<div class="vt-r" id="vt-${k}"><span class="vt-n">${l}</span><select class="chip chip-sel ${o[2]}" data-ch="vt-d" data-k="${k}" aria-label="${l}" ${ro?'disabled':''}>${VT_OPC.map(([v,n])=>`<option value="${v}" ${v===r.d?'selected':''}>${n}</option>`).join('')}</select>
      <input class="vt-obs" data-ch="vt-obs" data-k="${k}" value="${esc(r.obs||'')}" placeholder="${ro?'':'Observação'}" aria-label="Observação sobre ${l}" ${ro?'disabled':''}></div>`}).join('')}</div></div></section>`}

/* ---------- viabilidades técnicas das concessionárias ---------- */
const VTEC=[['energia','Energia'],['agua','Água'],['esgoto','Esgoto'],['gas','Gás']];
const VTEC_S=[['nao_solicitada','Não solicitada',''],['solicitada','Solicitada','blue'],['viavel','Viável','good'],['condicionada','Condicionada','warn'],['nao_viavel','Não viável','crit']];
const VTEC_N=Object.fromEntries(VTEC_S.map(o=>[o[0],o[1]]));
const vtecRet=s=>['viavel','condicionada','nao_viavel'].includes(s);
/* validade: vencida (viável ou condicionada com a data passada) ou vencendo em até 30 dias */
function vtecVence(v){if(!v||!v.val||!['viavel','condicionada'].includes(v.s))return null;if(v.val<HOJE)return 'vencida';if(v.val<=addD(HOJE,30))return 'vence';return null}
function vtecSecao(t){const ro=UI.role==='Leitura',V=t.vtec||{},venc=VTEC.filter(([k])=>vtecVence(V[k])==='vencida').length;
  return `<section class="sec" id="sec-vtec"><div class="sec-h"><h2>Viabilidades técnicas</h2>${venc?`<span class="chip crit">${venc} vencida${venc>1?'s':''}</span>`:''}</div>
  <div class="sec-b"><div class="vtec-l">${VTEC.map(([k,l])=>{const v=V[k]||{s:'nao_solicitada'},o=VTEC_S.find(x=>x[0]===v.s)||VTEC_S[0],vv=vtecVence(v),d=ro?'disabled':'';
    return `<div class="vtec-r" id="vtec-${k}"><div class="vtec-h"><span class="vt-n">${l}</span><select class="chip chip-sel ${o[2]}" data-ch="vtec" data-k="${k}" data-c="s" aria-label="Situação da viabilidade de ${l}" ${d}>${VTEC_S.map(([s,n])=>`<option value="${s}" ${s===v.s?'selected':''}>${n}</option>`).join('')}</select>
      ${vv==='vencida'?`<span class="chip crit">Vencida em ${fd(v.val)}</span>`:vv==='vence'?`<span class="chip warn">Vence em ${fd(v.val)}</span>`:''}</div>
      ${v.s==='nao_solicitada'?'':`<div class="vtec-c"><div class="field"><label for="vc-${k}-c">Concessionária</label><input id="vc-${k}-c" data-ch="vtec" data-k="${k}" data-c="conc" value="${esc(v.conc||'')}" placeholder="${{energia:'Enel',agua:'Sabesp',esgoto:'Sabesp',gas:'Comgás'}[k]}" ${d}></div>
        <div class="field"><label for="vc-${k}-p">Pedida em</label><input id="vc-${k}-p" type="date" data-ch="vtec" data-k="${k}" data-c="sol" value="${esc(v.sol||'')}" ${d}></div>
        ${vtecRet(v.s)?`<div class="field"><label for="vc-${k}-e">Emitida em</label><input id="vc-${k}-e" type="date" data-ch="vtec" data-k="${k}" data-c="emi" value="${esc(v.emi||'')}" ${d}></div>
        <div class="field"><label for="vc-${k}-v">Validade</label><input id="vc-${k}-v" type="date" data-ch="vtec" data-k="${k}" data-c="val" value="${esc(v.val||'')}" min="${esc(v.emi||'')}" ${d}></div>`:''}
        ${v.s==='solicitada'?'':`<div class="field full"><label for="vc-${k}-o">${v.s==='condicionada'?'Condições':'Observação'}</label><input id="vc-${k}-o" data-ch="vtec" data-k="${k}" data-c="cond" value="${esc(v.cond||'')}" placeholder="${v.s==='condicionada'?'O que a concessionária exige para atender':''}" ${d}></div>`}</div>`}</div>`}).join('')}</div></div></section>`}

/* ---------- Configurações › Topografia ---------- */
function cfgTopoHtml(){const C=tpCfg(),f=(k,l,d)=>`<div class="field"><label for="tp-c-${k}">${l}</label><input id="tp-c-${k}" data-ch="tp-cfg" data-k="${k}" value="${vbIn(C[k],d)}" inputmode="decimal"></div>`;
  return `<section class="sec"><div class="sec-h"><h2>Classificação topográfica</h2></div><div class="sec-b">
  <p class="cfg-nota" style="margin-top:0">Vale o pior entre a inclinação do plano que melhor se ajusta às cotas e a terra mexida para deixar o terreno nesse plano. Mudar os limites reclassifica os terrenos já medidos.</p>
  <div class="cfg-sub-t">Inclinação do plano (%)</div><div class="editgrid vb-campos">${f('plano','Plano até',1)}${f('inclinado','Inclinado até (acima, crítico)',1)}</div>
  <div class="cfg-sub-t">Terra mexida (m³ por m² de terreno)</div><div class="editgrid vb-campos">${f('leve','Acidentado leve acima de',2)}${f('mediano','Acidentado mediano acima de',2)}${f('critico','Acidentado crítico acima de',2)}</div>
  <div class="tp-escala" style="margin-top:16px">${TP_PERFIS.map(([k,l])=>`<span class="tp-e tp-${k} on">${l}</span>`).join('')}</div></div></section>`}

/* ---------- eventos ---------- */
document.addEventListener('change',e=>{const el=e.target.closest('[data-ch]');if(el)infraChange(el)});
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="tp-medir"]');if(a)infraClick('tp-medir',a)});
function infraChange(el){const ch=el.dataset.ch;if(!['vt-d','vt-obs','vt-data','vtec','tp-cfg'].includes(ch))return false;
  if(ch==='tp-cfg'){const v=lerNum(el.value),k=el.dataset.k,C=tpCfg(),n={...C,[k]:v};
    const ok=v!=null&&v>0&&n.inclinado>n.plano&&n.mediano>n.leve&&n.critico>n.mediano;
    if(!ok||isNaN(v)){toast('Limites fora de ordem: cada um precisa ser maior que o anterior.',true);render();return true}
    S.topoCfg=n;S.terrenos.forEach(t=>{if(t.topoClass)t.topoClass.perfil=tpClassificar(t.topoClass.incl,t.topoClass.terra,n)});save();render();toast('Limites da classificação topográfica salvos.');return true}
  const t=T(UI.id);if(!t||UI.role==='Leitura')return true;const k=el.dataset.k;
  if(ch==='vt-data'){t.visita=el.value||null;save();return true}
  if(ch==='vt-d'){const r=t.infra[k]||{};t.infra[k]=el.value==='nao_verificado'?{d:el.value,obs:r.obs||''}:{...r,d:el.value,data:HOJE};if(el.value!=='nao_verificado'&&!t.visita)t.visita=HOJE;save();render();return true}
  if(ch==='vt-obs'){t.infra[k]={...(t.infra[k]||{d:'nao_verificado'}),obs:el.value.trim()};save();return true}
  if(ch==='vtec'){t.vtec=t.vtec||{};const v={...(t.vtec[k]||{s:'nao_solicitada'})},c=el.dataset.c;v[c]=el.value.trim()||null;
    if(c==='s'){if(vtecRet(v.s)&&!v.emi)v.emi=HOJE;if(v.s!=='nao_solicitada'&&!v.sol)v.sol=v.s==='solicitada'?HOJE:null;if(!vtecRet(v.s)){v.emi=null;v.val=null}}
    if(c==='val'&&v.val&&v.emi&&v.val<v.emi){toast('A validade não pode ser antes da emissão.',true);render();return true}
    if(c==='emi'&&vtecRet(v.s)&&!v.emi){toast('Retorno da concessionária precisa da data de emissão.',true);render();return true}
    t.vtec[k]=v;save();if(c==='s'||c==='val'||c==='emi')render();return true}
  return true}
function infraClick(A,a){if(A!=='tp-medir')return false;const t=T(UI.id);if(t){delete TP_ERRO[t.id];if(t.topoClass)t.topoClass=null;tpAuto(t)}return true}
/* rótulos dos logs */
LAB_CAMPO.visita='Data da visita técnica';TIPO_CAMPO.visita=['date'];
