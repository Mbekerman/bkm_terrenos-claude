/* ===================== Estudos de massa (lote 4 da ficha em abas; pedido do Moisés de 3/nov/2026) =====================
   Espelha app.estudos_massa, app.estudo_massa_tipologias e as RPCs de 20261015001500_estudos_massa.sql.
   O analista pede o estudo ao arquiteto (da equipe) com briefing e prazo; o arquiteto lança as tipologias (título,
   área privativa, quantidade), as áreas, as vagas, a área construída total e os CAs legal e venal, e envia o PDF e o DWG.
   Área privativa total = Σ área × quantidade; eficiência venal = privativa ÷ construída. Situação: Solicitado →
   Em elaboração (primeiro dado) → Entregue (com tipologias e área construída). O analista marca o válido (um por
   terreno, só entregue) e escreve observações. O estudo de viabilidade pode ficar preso a um estudo de massa ou
   seguir o válido: título, área e quantidade das tipologias e a área construída vêm daqui (proto_viab.js). */
const EMS=id=>(S.massas||[]).find(m=>m.id===id);
const massasDe=tid=>(S.massas||[]).filter(m=>m.tid===tid).sort((a,b)=>a.ordem-b.ordem);
const emsValido=tid=>massasDe(tid).find(m=>m.valido);
const EMS_SIT={solicitado:['Solicitado','warn'],em_elaboracao:['Em elaboração','blue'],entregue:['Entregue','good']};
const EMS_AREAS=[['lct','Lazer coberto na torre'],['ldt','Lazer descoberto na torre'],['lcf','Lazer coberto fora da torre'],['ldf','Lazer descoberto fora da torre'],
  ['circ','Área de circulação total'],['anexos','Área de anexos'],['ec','Estacionamento coberto'],['ed','Estacionamento descoberto'],
  ['c15','Contenção com h até 1,5 m'],['cm15','Contenção com h acima de 1,5 m']];
const EMS_VAGAS=[['vc','Vagas cobertas'],['vd','Vagas descobertas']];
const EMS_DADOS=[...EMS_AREAS,...EMS_VAGAS,['constr'],['caL'],['caV']].map(x=>x[0]);
function emsCalc(m){let A=0,un=0;m.tips.forEach(p=>{const q=p.qtd||0;un+=q;if(p.area!=null)A+=p.area*q});A=r2(A);
  return {A:m.tips.some(p=>p.area!=null)?A:null,un,efic:m.constr>0&&A?r2(A/m.constr*100):null}}
const emsNovo=(t,x)=>{const ordem=Math.max(0,...massasDe(t.id).map(m=>m.ordem))+1;
  return {id:uid(),tid:t.id,ordem,nome:x.nome||'Estudo de massa '+ordem,sit:'solicitado',solic:me(),solicEm:HOJE,arq:x.arq,briefing:x.briefing||'',prazo:x.prazo||null,
    tips:[],...Object.fromEntries(EMS_DADOS.map(k=>[k,null])),valido:false,obs:'',entregueEm:null,em:HOJE}};
const emsDoc=(t,m,k)=>t.docs.find(d=>d.tipo==='massa_'+k&&d.ms===m.id);
const emsViabs=m=>S.viabs.filter(v=>v.massa===m.id);

/* traz do estudo de massa as tipologias e a área construída (app._sincronizar_massa): casa pela tipologia do estudo
   e, na troca de estudo, pelo nome; a que saiu do estudo sai; preço, permuta e comissão ficam */
function emsSync(v){if(!v.massa)return;const src=(v.segue&&emsValido(v.tid))||EMS(v.massa);if(!src)return;
  const ids=new Set(src.tips.map(p=>p.id)),nm=s=>String(s||'').trim().toLowerCase();
  v.tips.forEach(p=>{if(!ids.has(p.mt)){const x=src.tips.find(q=>nm(q.nome)===nm(p.nome)&&!v.tips.some(o=>o.mt===q.id));p.mt=x?x.id:null}});
  v.tips=src.tips.map(q=>{const p=v.tips.find(o=>o.mt===q.id)||{id:uid(),perm:0,com:0,pu:null,pm2:null,mt:q.id};
    const areaMudou=p.area!==q.area;p.nome=q.nome;p.qtd=q.qtd;p.area=q.area;if(areaMudou)vbNorm(p,'area');
    p.perm=Math.min(p.perm||0,q.qtd||0);p.com=Math.min(p.com||0,(q.qtd||0)-p.perm);return p});
  v.massa=src.id;v.constr=src.constr}
function emsPropagar(m){S.viabs.filter(v=>v.massa===m.id||(v.segue&&v.tid===m.tid&&m.valido)).forEach(v=>{emsSync(v);vbSync(v)})}
function emsGravar(m,refaz=true){m.em=HOJE;emsPropagar(m);save();if(refaz)render();else emsRefresh(m)}
function emsLogTxt(m){return `${m.nome}`}

/* ---------- a aba ---------- */
function abaMassa(t){const ms=massasDe(t.id),ro=UI.role==='Leitura';
  if(!QD.massa)QD.massa=new Set(['sec-massa-lista','sec-massa']);
  let sel=EMS(UI.emsSel);if(!sel||sel.tid!==t.id)sel=emsValido(t.id)||ms[ms.length-1];
  const form=UI.emsForm&&!ro?`<form class="inline-form ems-form" data-form="ems-novo" data-if-ok="1">
      <div class="field"><label for="ems-arq">Arquiteto</label><select id="ems-arq" name="arq" required><option value="">Digite @ e o nome</option>${USERS.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('')}</select></div>
      <div class="field" style="flex:0 1 170px"><label for="ems-prazo">Prazo</label><input id="ems-prazo" name="prazo" type="date"></div>
      <div class="field full" style="flex-basis:100%"><label for="ems-brief">Briefing</label><textarea id="ems-brief" name="briefing" rows="3" placeholder="O que o estudo precisa considerar. Uma linha por item."></textarea></div>
      <button class="btn sm primary">${ic('add',16)}Solicitar</button><button type="button" class="btn text sm" data-a="ems-form">Cancelar</button></form>`:'';
  const lista=ms.length?`<div class="dt-wrap"><table class="dt compacta ems-lista"><thead><tr><th class="esq">Estudo</th><th class="esq">Arquiteto</th><th class="esq">Situação</th><th>Unidades</th><th>Área privativa</th><th>Área construída</th><th>Eficiência</th><th>Válido</th></tr></thead><tbody>
    ${ms.map(m=>{const c=emsCalc(m),[st,cor]=EMS_SIT[m.sit];return `<tr class="${m===sel?'ems-sel':''}"><td class="esq"><button class="linkbtn" data-a="ems-sel" data-v="${m.id}">${esc(m.nome)}</button></td><td class="esq">${esc(m.arq||'—')}</td>
      <td class="esq"><span class="chip ${cor}">${st}</span></td><td class="num">${c.un?num(c.un):'—'}</td><td class="num">${c.A!=null?m2(c.A):'—'}</td><td class="num">${m.constr!=null?m2(m.constr):'—'}</td><td class="num">${c.efic!=null?num(c.efic,1)+'%':'—'}</td>
      <td><label class="vb-radio"><input type="radio" name="ems-valido-${t.id}" ${m.valido?'checked':''} ${!m.valido&&!ro&&m.sit==='entregue'?`data-a="ems-valido" data-v="${m.id}"`:'disabled'} aria-label="${esc(m.nome)} é o estudo válido" title="${m.sit==='entregue'?'':'Só o estudo entregue pode ser o válido'}"></label></td></tr>`}).join('')}</tbody></table></div>`
    :(form?'':`<div class="banner blue">${ic('layers')}<div style="flex:1"><div class="bt">Nenhum estudo de massa</div><div>Peça o estudo ao arquiteto: ele lança as tipologias, as áreas e os índices e envia o PDF e o DWG.</div></div></div>`);
  return `<div class="stack"><section class="sec" id="sec-massa-lista"><div class="sec-h"><h2>Estudos de massa <span class="h-n">${ms.length}</span></h2>${ro||UI.emsForm?'':`<button class="btn sm" data-a="ems-form">${ic('add',16)}Solicitar estudo</button>`}</div>
    <div class="sec-b">${form}${lista}</div></section>${sel?emsFicha(t,sel,ro):''}</div>`}

function emsFicha(t,m,ro){const c=emsCalc(m),[st,cor]=EMS_SIT[m.sit],dis=ro?'disabled':'',vs=emsViabs(m),seg=m.valido?S.viabs.filter(v=>v.segue&&v.tid===t.id):[];
  const n=(k,rot,d=2,un='m²')=>`<label class="field"><span class="lbl-f">${rot}${un?` <span class="faint">(${un})</span>`:''}</span><input data-ems="campo" data-k="${k}" data-fmt="${d?'num':'int'}" inputmode="decimal" value="${vbIn(m[k],d)}" ${dis}></label>`;
  const ler=(rot,x,id)=>`<div class="field"><span class="lbl-f">${rot}</span><span class="v" data-emso="${id}">${x}</span></div>`;
  const doc=k=>{const d=emsDoc(t,m,k);return `<div class="ems-arq"><span class="ems-arq-t"><b>${k.toUpperCase()}</b>${d?`<span>${esc(d.nome)}</span><span class="faint">versão ${d.versoes} · ${fd(d.emitido)}</span>`:'<span class="faint">Ainda não enviado</span>'}</span>
    ${ro?'':`<input type="file" id="ems-f-${k}" class="ems-file" data-ems="arq" data-k="${k}" accept=".${k}" hidden><button class="btn sm" data-a="ems-arq" data-k="${k}">${ic('upload',16)}${d?'Enviar nova versão':'Enviar '+k.toUpperCase()}</button>`}</div>`};
  const acoes=ro?'':`${m.sit!=='entregue'?`<button class="btn sm" data-a="ems-entregar" data-v="${m.id}">Marcar como entregue</button>`:''}${m.sit==='entregue'&&!m.valido?`<button class="btn sm" data-a="ems-valido" data-v="${m.id}">Marcar como válido</button>`:''}
    ${m.sit==='entregue'?`<button class="btn sm primary" data-a="ems-viab" data-v="${m.id}">${ic('add',16)}Criar estudo de viabilidade</button>`:''}${!m.valido&&!vs.length?`<button class="btn text sm danger" data-a="ems-apagar" data-v="${m.id}">Apagar</button>`:''}`;
  return `<section class="sec" id="sec-massa"><div class="sec-h"><h2>${esc(m.nome)}</h2><span class="chip ${cor}">${st}</span>${m.valido?'<span class="chip good"><span class="d"></span>Válido</span>':''}<button type="button" class="btn text sm ems-vped" data-a="ems-pedido" data-v="${m.id}">${ic('doc',16)}Ver pedido</button></div><div class="sec-b ems">
    ${acoes.trim()?`<div class="ems-acoes">${acoes}</div>`:''}
    <h3 class="ems-h3">Tipologias</h3>
    <div class="ems-tips"><div class="ems-tr ems-th" aria-hidden="true"><span>Tipologia</span><span>Área privativa (m²)</span><span>Quantidade</span><span>Área privativa total</span><span></span></div>
      ${m.tips.map(p=>`<div class="ems-tr" data-emtp="${p.id}"><label><span class="lbl-f ems-ml">Tipologia</span><input data-ems="tp" data-r="${p.id}" data-k="nome" value="${esc(p.nome)}" aria-label="Tipologia" ${dis}></label>
        <label><span class="lbl-f ems-ml">Área privativa (m²)</span><input data-ems="tp" data-r="${p.id}" data-k="area" data-fmt="num" inputmode="decimal" value="${vbIn(p.area,2)}" aria-label="Área privativa (m²)" ${dis}></label>
        <label><span class="lbl-f ems-ml">Quantidade</span><input data-ems="tp" data-r="${p.id}" data-k="qtd" data-fmt="int" inputmode="numeric" value="${vbIn(p.qtd,0)}" aria-label="Quantidade" ${dis}></label>
        <span class="num"><span class="lbl-f ems-ml">Área privativa total</span><span data-emso="tp-${p.id}">${p.area!=null&&p.qtd?m2(r2(p.area*p.qtd)):'—'}</span></span>
        ${ro?'<span></span>':`<button class="iconbtn sm" data-a="ems-tip-del" data-v="${p.id}" aria-label="Remover ${esc(p.nome)}" title="Remover tipologia">${ic('close',18)}</button>`}</div>`).join('')||'<div class="muted ems-vazio">Nenhuma tipologia ainda.</div>'}
      <div class="ems-tr ems-tot"><b>Total</b><span></span><span class="num"><span class="lbl-f ems-ml">Unidades</span><b data-emso="un">${num(c.un)}</b></span><span class="num"><span class="lbl-f ems-ml">Área privativa total</span><b data-emso="A">${c.A!=null?m2(c.A):'—'}</b></span><span></span></div></div>
    ${ro?'':`<button class="btn text sm qd-add" data-a="ems-tip-add">${ic('add',16)}Adicionar tipologia</button>`}
    <h3 class="ems-h3">Áreas</h3><div class="ems-g">${EMS_AREAS.map(([k,r])=>n(k,r)).join('')}</div>
    <h3 class="ems-h3">Vagas</h3><div class="ems-g">${EMS_VAGAS.map(([k,r])=>n(k,r,0,'')).join('')}</div>
    <h3 class="ems-h3">Índices</h3><div class="ems-g">${ler('Área privativa total',c.A!=null?m2(c.A):'—','A2')}${n('constr','Área construída total')}
      ${ler('Eficiência venal <span class="faint">(privativa ÷ construída)</span>',c.efic!=null?num(c.efic,1)+'%':'—','efic')}${n('caL','C.A. legal',3,'')}${n('caV','C.A. venal',3,'')}</div>
    <h3 class="ems-h3">Arquivos</h3><div class="ems-arqs">${doc('pdf')}${doc('dwg')}</div>
    <h3 class="ems-h3">Análise</h3><div class="ems-g"><label class="field ems-full"><span class="lbl-f">Observações</span><textarea data-ems="txt" data-k="obs" rows="2" ${dis}>${esc(m.obs||'')}</textarea></label></div>
    <div class="ems-vbs"><span class="lbl-f">Estudos de viabilidade com este estudo de massa</span>${[...new Set([...vs,...seg])].map(v=>`<button class="linkbtn" data-a="vb-abrir" data-v="${v.id}">${esc(v.nome)}</button>${v.segue?' <span class="faint">(segue o válido)</span>':''}`).join(' · ')||'<span class="faint">Nenhum.</span>'}</div>
  </div></section>`}

/* atualiza no lugar os números calculados (sem redesenhar a aba, para não perder o campo em que se está) */
function emsRefresh(m){const c=emsCalc(m),set=(k,h)=>{const el=document.querySelector(`[data-emso="${k}"]`);if(el)el.innerHTML=h};
  set('un',num(c.un));set('A',c.A!=null?m2(c.A):'—');set('A2',c.A!=null?m2(c.A):'—');set('efic',c.efic!=null?num(c.efic,1)+'%':'—');
  m.tips.forEach(p=>set('tp-'+p.id,p.area!=null&&p.qtd?m2(r2(p.area*p.qtd)):'—'))}
function emsElab(m){if(m.sit==='solicitado')m.sit='em_elaboracao'}

document.addEventListener('change',e=>{const el=e.target;if(!el.dataset?.ems||UI.route!=='terreno')return;const t=T(UI.id);if(!t||UI.role==='Leitura')return;
  const m=EMS(UI.emsSel)&&EMS(UI.emsSel).tid===t.id?EMS(UI.emsSel):(emsValido(t.id)||massasDe(t.id).slice(-1)[0]);if(!m)return;const k=el.dataset.k,tipo=el.dataset.ems;
  if(tipo==='campo'){let v=lerNum(el.value);if(v!=null&&v<0)v=null;if(['vc','vd'].includes(k)&&v!=null)v=Math.round(v);if(k==='constr'&&v===0)v=null;
    if(m[k]===v)return;m[k]=v;el.value=vbIn(v,['vc','vd'].includes(k)?0:['caL','caV'].includes(k)?3:2);const s0=m.sit;emsElab(m);log(t,`${m.nome}: dados do arquiteto atualizados`);emsGravar(m,s0!==m.sit);return}
  if(tipo==='txt'){let v=k==='prazo'?(el.value||null):el.value.trim();if(k==='nome'&&!v){toast('Dê um nome ao estudo.',true);el.value=m.nome;return}
    if((m[k]||'')===(v||''))return;m[k]=v;emsGravar(m,k==='nome');return}
  if(tipo==='tp'){const p=m.tips.find(x=>x.id===el.dataset.r);if(!p)return;
    if(k==='nome'){const v=el.value.trim();if(!v||m.tips.some(x=>x!==p&&x.nome.trim().toLowerCase()===v.toLowerCase())){toast(v?'Já existe uma tipologia com este título.':'A tipologia precisa de um título.',true);el.value=p.nome;return}p.nome=v}
    else{let v=lerNum(el.value);if(v!=null&&v<0)v=null;if(k==='qtd')v=v==null?null:Math.round(v);if(k==='area'&&v===0)v=null;p[k]=v;el.value=vbIn(v,k==='qtd'?0:2)}
    const s0=m.sit;emsElab(m);emsGravar(m,s0!==m.sit);return}
  if(tipo==='arq'){const f=el.files?.[0];if(!f)return;if(!f.name.toLowerCase().endsWith('.'+k)){toast(`Envie um arquivo .${k}.`,true);el.value='';return}
    let d=emsDoc(t,m,k);if(!d){d={tipo:'massa_'+k,ms:m.id,status:'recebido',emitido:HOJE,versoes:0,nome:f.name};t.docs.push(d)}d.versoes++;d.emitido=HOJE;d.nome=f.name;d.status='recebido';
    log(t,`${m.nome}: ${k.toUpperCase()} versão ${d.versoes} enviada`);save();render();toast(`${k.toUpperCase()} enviado; está também em Documentos.`);return}});

function emsEntregar(t,m){const c=emsCalc(m);
  if(!c.un||m.tips.some(p=>p.area==null)||m.constr==null){toast('Para entregar, lance as tipologias (com área e quantidade) e a área construída total.',true);return}
  m.sit='entregue';m.entregueEm=HOJE;notificar(m.solic,'massa_entregue',`${m.nome} entregue no ${t.codigo}`,t,null,{b:'massa'});log(t,`${m.nome} entregue`);emsGravar(m);toast('Estudo entregue.')}
function emsMarcarValido(t,m){if(m.sit!=='entregue'){toast('Só o estudo entregue pode ser o válido.',true);return}
  massasDe(t.id).forEach(x=>x.valido=x===m);log(t,`${m.nome} é o estudo de massa válido`);emsGravar(m);
  const n=S.viabs.filter(v=>v.segue&&v.tid===t.id).length;toast(`${m.nome} é o válido.${n?` ${n>1?n+' estudos de viabilidade seguem':'O estudo de viabilidade que segue'} o válido foi${n>1?'ram':''} atualizado${n>1?'s':''}.`:''}`)}
/* o botão do estudo de massa: estudo de viabilidade novo (com o modelo padrão da empresa) já preso a ele */
function emsCriarViab(t,m,segue){const p=vbModeloPadrao();vbCriar(t.id,'Viabilidade do '+m.nome,p?p.id:null);const v=S.viabs[S.viabs.length-1];
  v.massa=m.id;v.segue=!!segue;v.tips=[];emsSync(v);vbSync(v);log(t,`${v.nome}: tipologias e área construída do ${m.nome}${segue?' (segue o válido)':''}`);save();render()}

document.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a||UI.route!=='terreno')return;const A=a.dataset.a;
  if(!['ems-pedido','ems-form','ems-sel','ems-entregar','ems-valido','ems-viab','ems-apagar','ems-tip-add','ems-tip-del','ems-arq'].includes(A))return;const t=T(UI.id);if(!t)return;
  if(A==='ems-sel'){UI.emsSel=a.dataset.v;QD.massa?.add('sec-massa');render();setTimeout(()=>document.getElementById('sec-massa')?.scrollIntoView({behavior:'smooth',block:'start'}),30);return}
  if(A==='ems-pedido'){UI.emsPed=a.dataset.v;UI.modal='ems-pedido';renderModal();return}
  if(UI.role==='Leitura')return;
  if(A==='ems-form'){UI.emsForm=!UI.emsForm;render();if(UI.emsForm)setTimeout(()=>document.getElementById('ems-arq-q')?.focus(),30);return}
  const m=EMS(a.dataset.v)||EMS(UI.emsSel)||emsValido(t.id)||massasDe(t.id).slice(-1)[0];if(!m)return;
  if(A==='ems-entregar')return emsEntregar(t,m);
  if(A==='ems-valido'){e.preventDefault();return emsMarcarValido(t,m)}
  if(A==='ems-viab'){if(m.valido){UI.emsViabDe=m.id;UI.modal='ems-viab';renderModal();return}emsCriarViab(t,m,false);return}
  if(A==='ems-apagar'){if(m.valido||emsViabs(m).length){toast('O estudo válido ou com viabilidade presa não se apaga.',true);return}UI.emsApagar=m.id;UI.modal='ems-apagar';renderModal();return}
  if(A==='ems-tip-add'){const p={id:uid(),nome:'Tipologia '+(m.tips.length+1),area:null,qtd:null};let i=m.tips.length+1;while(m.tips.some(x=>x.nome===p.nome))p.nome='Tipologia '+(++i);
    m.tips.push(p);emsElab(m);emsGravar(m);setTimeout(()=>{const x=document.querySelector(`[data-emtp="${p.id}"] [data-k=nome]`);x?.focus();x?.select()},30);return}
  if(A==='ems-tip-del'){m.tips=m.tips.filter(p=>p.id!==a.dataset.v);emsGravar(m);return}
  if(A==='ems-arq'){document.getElementById('ems-f-'+a.dataset.k)?.click();return}});

/* janelas: criar a viabilidade do estudo válido (seguir o válido ou só este) e apagar */
function emsModalHtml(M,fechar){
  if(M==='ems-viab'){const m=EMS(UI.emsViabDe);if(!m)return '';
    return `<div class="dh"><div><h2>Criar estudo de viabilidade</h2><div class="muted">Com as tipologias e a área construída do ${esc(m.nome)}.</div></div>${fechar}</div>
      <form data-form="ems-viab"><div class="db"><fieldset class="vb-chks" style="border:0;padding:0;margin:0"><legend class="lbl-f">O estudo de viabilidade</legend>
        <label class="chk"><input type="radio" name="segue" value="1" checked><span>Segue o estudo de massa válido <small class="faint">(trocou o válido, ele troca junto)</small></span></label>
        <label class="chk"><input type="radio" name="segue" value=""><span>Fica preso a este estudo</span></label></fieldset>
        <div class="hint" style="margin-top:8px">Título, área e quantidade das tipologias vêm do estudo de massa e não se editam na viabilidade; preços, permuta e comissão são da viabilidade.</div></div>
      <div class="df"><button type="button" class="btn text" data-a="close">Cancelar</button><button class="btn primary">Criar</button></div></form>`}
  if(M==='ems-pedido'){const m=EMS(UI.emsPed);if(!m)return '';const ro=UI.role==='Leitura',ls=(m.briefing||'').split('\n').map(x=>x.trim()).filter(Boolean);
    const dt=m.solicEm?pd(m.solicEm).toLocaleDateString('pt-BR'):'—',quem=`<div class="ems-ped2"><div class="field"><span class="lbl-f">Data do pedido</span><span class="v" data-emso="ped-em">${dt}</span></div><div class="field"><span class="lbl-f">Pedido por</span><span class="v">${esc(m.solic||'—')}</span></div></div>`;
    const cab=`<div class="dh"><div><h2>Pedido do estudo</h2><div class="muted">${esc(m.nome)}</div></div>${fechar}</div>`;
    if(ro)return cab+`<div class="db ems-ped">${quem}<div class="field"><span class="lbl-f">Arquiteto</span><span class="v">${esc(m.arq||'—')}</span></div><div class="field"><span class="lbl-f">Prazo</span><span class="v">${m.prazo?fd(m.prazo):'Sem prazo'}</span></div>
      <div class="field"><span class="lbl-f">Briefing</span>${ls.length>1?`<ul class="ems-blist">${ls.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:`<span class="v">${esc(ls[0]||'Sem briefing')}</span>`}</div></div>
      <div class="df"><button type="button" class="btn primary" data-a="close">Fechar</button></div>`;
    return cab+`<form data-form="ems-pedido"><div class="db ems-ped">${quem}<label class="field"><span class="lbl-f">Nome do estudo</span><input name="nome" value="${esc(m.nome)}" required></label>
      <div class="field"><label for="ems-ped-arq">Arquiteto</label><select id="ems-ped-arq" name="arq">${USERS.map(u=>`<option value="${esc(u)}" ${u===m.arq?'selected':''}>${esc(u)}</option>`).join('')}</select></div>
      <label class="field"><span class="lbl-f">Prazo</span><input type="date" name="prazo" value="${esc(m.prazo||'')}"></label>
      <label class="field"><span class="lbl-f">Briefing</span><textarea name="briefing" rows="7" placeholder="O que o estudo precisa considerar. Uma linha por item.">${esc(m.briefing||'')}</textarea></label></div>
      <div class="df"><button type="button" class="btn text" data-a="close">Cancelar</button><button class="btn primary">Salvar</button></div></form>`}
  if(M==='ems-apagar'){const m=EMS(UI.emsApagar);if(!m)return '';
    return `<div class="dh"><div><h2>Apagar ${esc(m.nome)}?</h2></div>${fechar}</div><div class="db">Os arquivos enviados continuam em Documentos.</div>
      <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary danger" data-a="ems-apagar-ok">Apagar</button></div>`}
  return ''}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a=ems-apagar-ok]');if(!a)return;const m=EMS(UI.emsApagar),t=m&&T(m.tid);if(!m)return;
  S.massas=S.massas.filter(x=>x!==m);log(t,`${m.nome} apagado`);if(UI.emsSel===m.id)UI.emsSel=null;UI.emsApagar=null;UI.modal=null;save();render();toast('Estudo de massa apagado.')});
document.addEventListener('submit',e=>{const f=e.target;if(!['ems-novo','ems-viab','ems-pedido'].includes(f.dataset?.form))return;e.preventDefault();e.stopImmediatePropagation();const t=T(UI.id);if(!t)return;const F=Object.fromEntries(new FormData(f));
  if(f.dataset.form==='ems-pedido'){const m=EMS(UI.emsPed);if(!m)return;const nome=(F.nome||'').trim();if(!nome){toast('Dê um nome ao estudo.',true);return}
    let mud=false,ren=false;if(nome!==m.nome){m.nome=nome;mud=ren=true}const pz=F.prazo||null;if(pz!==(m.prazo||null)){m.prazo=pz;mud=true}const b=(F.briefing||'').trim();if(b!==(m.briefing||'')){m.briefing=b;mud=true;log(t,`${m.nome}: briefing alterado`)}
    if(F.arq&&USERS.includes(F.arq)&&F.arq!==m.arq){m.arq=F.arq;mud=true;notificar(m.arq,'massa_solicitado',`${m.nome} do ${t.codigo} passou para você`,t,null,{b:'massa'});log(t,`${m.nome}: arquiteto ${m.arq}`)}
    UI.modal=null;if(mud){emsGravar(m);toast('Pedido salvo.')}else render();return}
  if(f.dataset.form==='ems-viab'){const m=EMS(UI.emsViabDe);UI.modal=null;UI.emsViabDe=null;if(m)emsCriarViab(t,m,!!F.segue);return}
  if(!F.arq||!USERS.includes(F.arq)){toast('Marque o arquiteto.',true);return}
  const m=emsNovo(t,{arq:F.arq,briefing:(F.briefing||'').trim(),prazo:F.prazo||null});S.massas.push(m);UI.emsSel=m.id;UI.emsForm=false;QD.massa?.add('sec-massa');
  notificar(m.arq,'massa_solicitado',`${me()} pediu o ${m.nome} do ${t.codigo}`,t,null,{b:'massa'});log(t,`${m.nome} solicitado a ${m.arq}`);save();render();toast(`Estudo pedido a ${m.arq}.`)},true);

/* exemplo: o terreno do primeiro estudo de viabilidade ganha um estudo de massa entregue e válido, com as tipologias
   do estudo (que passa a segui-lo), e outro pedido ao arquiteto */
function massaPreparar(){const N=cfg().notif;if(!N.massa_solicitado)N.massa_solicitado={ativo:true,dias:null,email:true};if(!N.massa_entregue)N.massa_entregue={ativo:true,dias:null,email:true};
  if(S.massas)return;S.massas=[];const v=S.viabs?.[0],t=v&&T(v.tid);if(!t)return;const arq=USERS.find(u=>u!==t.resp)||USERS[0];
  const m=emsNovo(t,{arq,briefing:'Torre única, térreo com lazer.\nSó 2 dormitórios, com e sem suíte.\nAproveitar o CA máximo da ZEU.',prazo:null});
  Object.assign(m,{sit:'entregue',solic:t.resp,solicEm:addD(HOJE,-20),entregueEm:addD(HOJE,-6),valido:true,lct:320,ldt:180,lcf:0,ldf:450,circ:1850,anexos:240,vc:0,vd:28,ec:0,ed:380,c15:120,cm15:0,caL:4,caV:3.4,obs:'Conferido com o zoneamento; sem vaga coberta.',
    tips:v.tips.map(p=>({id:uid(),nome:p.nome,area:p.area,qtd:p.qtd}))});
  const A=emsCalc(m).A;m.constr=Math.round(A/0.68);S.massas.push(m);v.massa=m.id;v.segue=true;emsSync(v);vbSync(v);
  S.massas.push(Object.assign(emsNovo(t,{arq,briefing:'Alternativa com studios no térreo.',prazo:addD(HOJE,8)}),{solic:t.resp,solicEm:addD(HOJE,-2)}))}
const _prepararMs=prepararDados;prepararDados=function(){_prepararMs.apply(this,arguments);massaPreparar()};
massaPreparar();
