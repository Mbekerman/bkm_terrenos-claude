/* ===================== partes: terreno com vários donos =====================
   No banco: terreno_partes, oferta_partes e processos com parte_id/principal_id
   (app.salvar_parte, app.remover_parte, _abrir_negociacoes_partes, _sincronizar_principal).
   Cada parte é um dono, ou um grupo de donos que negocia junto. Com duas ou mais
   partes ativas, quando o terreno chega à etapa da divisão (Negociação), cada parte
   ganha a sua negociação (pa.neg, pa.propostas), no mesmo formato da do terreno, e
   passa pelas mesmas regras (moverPara) através de vtParte. A negociação do terreno
   fica na etapa e na subetapa da parte mais atrasada e só fica Comprado com todas as
   partes ativas compradas. */
const etapaPartes=()=>cfg().etapaPartes||'negociacao';
const partesDe=t=>t.partes||(t.partes=[]);
const partesAtivas=t=>(t.partes||[]).filter(p=>p.ativa);
const parteDe=(t,id)=>(t.partes||[]).find(p=>p.id===id);
const dividida=t=>(t.partes||[]).some(p=>p.neg);
/* a parte vista como um terreno: as regras do funil leem t.neg e t.propostas; o resto vem do terreno */
const vtParte=(t,pa)=>Object.assign(Object.create(t),{neg:pa.neg,propostas:pa.propostas||(pa.propostas=[]),_parte:pa});
const terrenoDe=t=>t._parte?Object.getPrototypeOf(t):t;
const donosParte=(t,pa)=>t.pessoas.filter(p=>p.parte===pa.id&&p.papel==='proprietario').map(p=>p.nome);
const matsParte=(t,pa)=>t.mats.filter(m=>m.parte===pa.id);
const inscParte=(t,pa)=>t.insc.filter(i=>i.parte===pa.id);
const corParte=(t,pa)=>t.corretores.filter(x=>(x.partes||[]).includes(pa.id)).map(x=>corretor(x.cid)?.nome).filter(Boolean);
/* corretor ligado a uma parte (pode trazer várias; a parte pode ter vários): entra também nos corretores do terreno */
const ligarCorretor=(t,cid,pid)=>{let x=t.corretores.find(y=>y.cid===cid);if(!x)t.corretores.push(x={cid,principal:!t.corretores.some(y=>y.principal)});x.partes=x.partes||[];if(!x.partes.includes(pid))x.partes.push(pid)};
const listaTxt=v=>Array.isArray(v)?v:String(v||'').split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
/* partes digitadas no Novo terreno ou na ficha: só o nome é obrigatório; matrículas, inscrições e
   vendedores digitados entram no cadastro do terreno já ligados à parte */
function gravarParteNova(t,d){const pa={id:uid(),ativa:true,neg:null,propostas:[],nome:d.nome,essencial:true,area:d.area??null};partesDe(t).push(pa);
  listaTxt(d.mats).forEach(n=>{const m=t.mats.find(x=>digits(x.num)===digits(n));if(m){if(!m.parte)m.parte=pa.id}else t.mats.push({num:n,cri:d.cri||'',area:null,data:null,parte:pa.id})});
  listaTxt(d.insc).forEach(n=>{const i=t.insc.find(x=>digits(x.sql)===digits(n));if(i){if(!i.parte)i.parte=pa.id}else t.insc.push({mun:d.mun||'outro',sql:n,area:null,valores:[],parte:pa.id})});
  listaTxt(d.vend).forEach(n=>{const x=t.pessoas.find(y=>y.nome===n);if(x){if(!x.parte)x.parte=pa.id}else t.pessoas.push({nome:n,tipo:'PF',papel:'proprietario',pct:null,tel:'',parte:pa.id})});
  (d.cids||[]).forEach(cid=>ligarCorretor(t,cid,pa.id));
  return pa}
/* quadro Partes do Cadastro: o que cada parte tem; a negociação de cada uma fica na seção Negociação */
function secPartesCad(t){const P=partesAtivas(t),ro=UI.role==='Leitura';
  const add=ro?'':`<button class="btn text sm" data-a="pt-nova">${ic('add',16)}Adicionar parte</button>`;
  const linha=(l,v)=>v?`<div class="ptc-l"><span class="faint">${l}</span><span>${v}</span></div>`:'';
  return `<section class="sec" id="sec-partes-cad"><div class="sec-h"><h2>Partes</h2>${add}</div><div class="sec-b">
    ${P.length?`<div class="ptc-lista">${P.map(pa=>{const ms=matsParte(t,pa),is=inscParte(t,pa),vs=donosParte(t,pa),cs=corParte(t,pa);
      return `<div class="ptc"><div class="ptc-h"><b>${esc(pa.nome)}</b>${pa.essencial?'':'<span class="chip">Dispensável</span>'}<span class="faint">${pa.area?m2(pa.area):'tamanho não informado'}</span>${ro?'':`<button class="btn text sm" data-a="pt-editar" data-p="${pa.id}" aria-label="Editar ${esc(pa.nome)}">${ic('edit',16)}Editar</button>`}</div>
        ${linha('Matrículas',ms.map(m=>esc(m.num)).join(', '))}${linha('Inscrições',is.map(i=>esc(i.sql)).join(', '))}${linha('Vendedores',vs.map(esc).join(', '))}${linha(cs.length>1?'Corretores':'Corretor',cs.map(esc).join(', '))}
        ${!ms.length&&!is.length&&!vs.length&&!cs.length?'<div class="faint ptc-l">Nada vinculado ainda.</div>':''}</div>`}).join('')}</div>`
    :`<div class="muted">Se os lotes têm donos que negociam separado, cadastre uma parte para cada dono ou grupo de donos. Só o nome é obrigatório.</div>`}</div></section>`}
const ordSub=(e,s)=>subsDe(e).findIndex(x=>x.k===s);
const precoParte=(t,pa)=>{const o=t.ofertas.find(x=>x.id===pa.neg?.ofRef)||t.ofertas.filter(x=>x.partes&&pa.id in x.partes).slice(-1)[0];
  if(!o||!o.partes||!(pa.id in o.partes))return null;return o.partes[pa.id]??(Object.keys(o.partes).length===1?o.valor:null)};

function abrirPartes(t){const n=t.neg;if(!n||n.status!=='ativo'||t._parte)return;
  if(SIDX(n.etapa)<SIDX(etapaPartes())||partesAtivas(t).length<2)return;
  const e=etapaPartes(),s=subInicial(e);
  partesAtivas(t).filter(pa=>!pa.neg).forEach(pa=>{const seq=(t.partes||[]).filter(x=>x.neg).length+1;
    const of=t.ofertas.filter(o=>o.partes&&pa.id in o.partes).slice(-1)[0];
    pa.neg={codigo:n.codigo+'-'+seq,etapa:e,sub:s,status:'ativo',desde:HOJE,subDesde:HOJE,ofRef:of?.id||n.ofRef,viab:null,pedido:null,
      trilha:[{em:agora(),user:me(),ev:'abertura',deEtapa:null,deSub:null,paraEtapa:e,paraSub:s,status:'ativo'}]};
    pa.propostas=pa.propostas||[];log(t,`Negociação da parte ${pa.nome} aberta (${pa.neg.codigo})`)});
  sincPrincipal(t)}
/* o terreno acompanha a parte mais atrasada em aberto (sem nenhuma em aberto, a mais adiantada das compradas) */
function sincPrincipal(t){const n=t.neg;if(!n||n.status!=='ativo')return;
  const ab=partesAtivas(t).filter(pa=>pa.neg&&['ativo','stand_by'].includes(pa.neg.status)),co=partesAtivas(t).filter(pa=>pa.neg?.status==='comprado');
  const k=pa=>SIDX(pa.neg.etapa)*100+ordSub(pa.neg.etapa,pa.neg.sub);
  const alvo=ab.length?ab.sort((a,b)=>k(a)-k(b))[0]:co.sort((a,b)=>k(b)-k(a))[0];if(!alvo)return;
  const {etapa,sub}=alvo.neg;if(etapa===n.etapa&&sub===n.sub)return;
  const ev={em:agora(),user:me(),deEtapa:n.etapa,deSub:n.sub,ev:etapa===n.etapa?'subetapa':SIDX(etapa)>SIDX(n.etapa)?'avanco':'retorno'};
  if(etapa!==n.etapa){n.etapa=etapa;n.desde=HOJE}n.sub=sub;n.subDesde=HOJE;
  (n.trilha=n.trilha||[]).push(Object.assign(ev,{paraEtapa:etapa,paraSub:sub,status:'ativo'}));
  log(t,`Pelas negociações das partes: ${SN(etapa)} · ${subN(sub)}`)}
/* encerrar o terreno leva as partes em aberto; retomar o terreno retoma as partes */
function encerrarPartes(t,dest,d){partesDe(t).filter(pa=>pa.neg&&(pa.neg.status==='ativo'||(pa.neg.status==='stand_by'&&dest!=='stand_by'))).forEach(pa=>{const p=pa.neg;
  p.pedido=null;Object.assign(p,{status:dest,encerradoEm:HOJE,motivo:d.motivo||null,detalhe:'Com a negociação do terreno'+(d.detalhe?': '+d.detalhe:''),retomar:d.retomar||null});
  (p.trilha=p.trilha||[]).push({em:agora(),user:me(),ev:{perdido:'perda',descartado:'descarte',stand_by:'stand_by'}[dest],deEtapa:p.etapa,deSub:p.sub,paraEtapa:p.etapa,paraSub:p.sub,status:dest})})}
function retomarPartes(t){partesDe(t).filter(pa=>pa.neg?.status==='stand_by').forEach(pa=>retomar(vtParte(t,pa)))}

/* pendências extras: compra do terreno dividido exige cada parte ativa comprada (nem o gestor força) */
function pendPartes(t,tipo,dest){if(t._parte||!dividida(t)||tipo!=='status'||dest!=='comprado')return [];
  return partesAtivas(t).map(pa=>{const st=pa.neg?.status;return {ok:st==='comprado',trava:true,fix:st==='comprado'?null:['tab:negociacao','Ver partes'],
    txt:`Parte ${pa.nome}: `+({comprado:'comprada',perdido:'perdida (tire a parte do terreno ou encerre a negociação)',descartado:'descartada (tire a parte do terreno ou encerre a negociação)',stand_by:'em stand by',ativo:'em negociação'}[st]||'sem negociação')}})}
/* quem pode se mover: o terreno dividido não anda à mão; a parte só da etapa da divisão em diante e com o terreno ativo */
function movePartes(t,tipo,dest){
  if(!t._parte)return dividida(t)&&tipo!=='status'?'Com várias partes, a negociação do terreno anda pelas negociações das partes.':null;
  if(terrenoDe(t).neg?.status!=='ativo')return 'A negociação do terreno não está ativa.';
  if(tipo==='etapa'&&SIDX(dest)<SIDX(etapaPartes()))return `A negociação da parte começa em ${SN(etapaPartes())}: as etapas anteriores são do terreno todo.`;
  return null}

/* ---------- ficha: seção Partes (dentro de Negociação) ---------- */
const PT_ST={ativo:'',comprado:'good',perdido:'crit',descartado:'',stand_by:'warn'};
function parteCard(t,pa){const ro=UI.role==='Leitura',n=pa.neg,vt=n?vtParte(t,pa):null,donos=donosParte(t,pa),ms=matsParte(t,pa);
  const st=!pa.ativa?'<span class="chip">Fora do terreno</span>':n?`<span class="chip ${PT_ST[n.status]}">${n.status==='ativo'?esc(SN(n.etapa)):STATUS_N[n.status]}</span>`:'';
  const preco=precoParte(t,pa),lp=(pa.propostas||[]).slice(-1)[0];
  let corpo='';
  if(!pa.ativa)corpo=`<div class="pt-x faint">Saiu do terreno: ${esc(pa.motivoRem||'')}</div>`;
  else if(!n)corpo=`<div class="pt-x faint">Ganha a sua negociação quando o terreno chegar a ${esc(SN(etapaPartes()))}.</div>`;
  else{const subs=subsDe(n.etapa),r=n.status==='ativo'?checkAdv(vt):null,p=n.pedido;
    const ultima=SIDX(n.etapa)===STAGES.length-1;
    corpo=`<div class="pt-g">
      ${n.status==='ativo'?`<label class="pt-f"><span class="lbl">Subetapa</span><select data-ch="pt-sub" data-p="${pa.id}" ${ro||p?'disabled':''} aria-label="Subetapa de ${esc(pa.nome)}">${subs.map(s=>`<option value="${s.k}" ${s.k===n.sub?'selected':''}>${esc(s.nome)}</option>`).join('')}</select><span class="faint">${diasSub(n)??0} d${subAtrasada(n)?' · <b class="t-warn">prazo estourado</b>':''}</span></label>`
        :`<div class="pt-f"><span class="lbl">${STATUS_N[n.status]}</span><span>${n.status==='stand_by'?'revisitar '+fd(n.retomar):fd(n.encerradoEm)}${n.motivo?' · '+esc(motivoN(n.status,n.motivo)):''}</span>${n.detalhe||n.relato?`<span class="faint">${esc(n.detalhe||textoDe(n.relato))}</span>`:''}</div>`}
      <div class="pt-f"><span class="lbl">Pedido</span><span class="num">${preco?mi(preco):'<span class="faint">—</span>'}</span></div>
      <div class="pt-f"><span class="lbl">Última proposta</span><span class="num">${lp?mi(lp.valor)+' <span class="faint">'+(lp.origem==='bkm'?'BKM':'vendedor')+' · '+OPT.statusProp[lp.status].toLowerCase()+'</span>':'<span class="faint">—</span>'}</span></div></div>
      ${p?`<div class="pt-ped">${ic('clock',16)}<span>Aguardando ${esc(quemFalta(p))} para ${esc(destinoNome(p.tipo,p.dest))}</span>${ro?'':`${naVez(p).some(x=>podeDecidir(x,me()))?`<button class="btn primary sm" data-a="pt-aprovar" data-p="${pa.id}">Aprovar</button><button class="btn sm" data-a="pt-recusar" data-p="${pa.id}">Recusar</button>`:''}${p.por===me()||nivelDe(me())>nivelDe(p.por)?`<button class="btn text sm" data-a="pt-cancelar" data-p="${pa.id}">Cancelar pedido</button>`:''}`}</div>`:''}
      ${ro?'':`<div class="pt-a">${n.status==='ativo'&&!p?`<button class="btn primary sm" data-a="pt-ir" data-p="${pa.id}">${ic(ultima?'check':'fwd',16)}${ultima?'Concluir como Comprado':r.aprov.niveis.length?'Pedir aprovação':'Avançar para '+esc(r.next[1])}</button><button class="btn sm" data-a="pt-prop" data-p="${pa.id}">${ic('add',16)}Proposta</button>`:''}
        ${n.status==='stand_by'&&terrenoDe(t).neg?.status==='ativo'?`<button class="btn sm" data-a="pt-retomar" data-p="${pa.id}">Retomar</button>`:''}
        ${parteMenu(t,pa)}</div>`}`}
  return `<article class="pt-card ${!pa.ativa?'fora':n?.status||''}" id="pt-${pa.id}"><div class="pt-h"><span class="pt-n"><b>${esc(pa.nome)}</b>${n?`<span class="num faint">${esc(n.codigo)}</span>`:''}</span>
    <span class="chip ${pa.essencial?'blue':''}" title="${pa.essencial?'Sem ela o terreno não serve':'Dá para seguir sem ela, com área menor'}">${pa.essencial?'Essencial':'Dispensável'}</span>${st}</div>
    <div class="pt-m muted">${donos.length?esc(donos.join(', ')):'<span class="faint">Sem dono vinculado</span>'} · ${ms.length} matrícula${ms.length===1?'':'s'}${pa.area?' · '+m2(pa.area):''}</div>${corpo}</article>`}
function parteMenu(t,pa){const n=pa.neg,it=[];if(!pa.ativa)return '';
  if(n?.status==='ativo')it.push(`<button role="menuitem" data-a="pt-suspender" data-p="${pa.id}">${ic('pause',18)}Colocar em Stand By</button>`,`<button role="menuitem" class="danger" data-a="pt-perder" data-p="${pa.id}">${ic('block',18)}Marcar como Perdida</button>`,`<button role="menuitem" class="danger" data-a="pt-descartar" data-p="${pa.id}">${ic('close',18)}Descartar</button>`);
  it.push(`<button role="menuitem" data-a="pt-editar" data-p="${pa.id}">${ic('edit',18)}Editar parte</button>`);
  if(!n||!['ativo','stand_by','comprado'].includes(n.status))it.push(`<button role="menuitem" class="danger" data-a="pt-remover" data-p="${pa.id}">${ic('close',18)}Tirar do terreno</button>`);
  return `<div class="adv-mais"><button class="btn sm adv-mb" data-a="adv-mais" aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações da parte ${esc(pa.nome)}"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" d="M12 5.5h.01M12 12h.01M12 18.5h.01"/></svg></button><div class="adv-menu" role="menu">${it.join('')}</div></div>`}
function secPartes(t){const P=t.partes||[],at=partesAtivas(t),ro=UI.role==='Leitura',div=dividida(t);
  const add=ro?'':`<button class="btn text sm" data-a="pt-nova">${ic('add',16)}Adicionar parte</button>`;
  if(!P.length)return `<section class="sec" id="sec-partes"><div class="sec-h"><h2>Partes</h2>${add}</div><div class="sec-b"><div class="muted">Um dono, mesmo com várias matrículas, é uma negociação só. Se os lotes têm donos que negociam separado, cadastre uma parte para cada dono ou grupo de donos: cada uma terá preço, propostas e status próprios (a temperatura é uma só, a da negociação do terreno) a partir de ${esc(SN(etapaPartes()))}.</div></div></section>`;
  const co=at.filter(pa=>pa.neg?.status==='comprado'),aT=at.reduce((s,p)=>s+(p.area||0),0),aC=co.reduce((s,p)=>s+(p.area||0),0);
  const pedidos=at.map(pa=>precoParte(t,pa)),soma=pedidos.every(v=>v!=null)?pedidos.reduce((a,b)=>a+b,0):null;
  const prob=at.filter(pa=>['perdido','descartado'].includes(pa.neg?.status));
  return `<section class="sec" id="sec-partes"><div class="sec-h"><h2>Partes</h2>${add}</div><div class="sec-b">
    <div class="pt-res"><div><span class="lbl">Partes</span><b>${at.length}</b>${P.length>at.length?`<span class="faint"> + ${P.length-at.length} fora</span>`:''}</div>
      <div><span class="lbl">Compradas</span><b>${co.length} de ${at.length}</b>${aT?`<span class="faint"> · ${num(100*aC/aT,0)}% da área</span>`:''}</div>
      <div><span class="lbl">Pedido somado</span><b>${soma!=null?mi(soma):'<span class="faint">—</span>'}</b></div>
      <div><span class="lbl">Negociação</span><b>${div?'Uma por parte':at.length>1?'Divide em '+esc(SN(etapaPartes())):'Uma só'}</b></div></div>
    ${prob.length?`<div class="banner warn">${ic('warn')}<div>${prob.map(pa=>`<b>${esc(pa.nome)}</b> ${pa.neg.status==='perdido'?'perdida':'descartada'}`).join(', ')}: o terreno só fica Comprado se a parte sair (área menor, estudo refeito) ou com a negociação encerrada.</div></div>`:''}
    <div class="pt-lista">${P.slice().sort((a,b)=>b.ativa-a.ativa).map(pa=>parteCard(t,pa)).join('')}</div></div></section>`}
const selParte=(t,ch,i,v)=>UI.role==='Leitura'?esc(parteDe(t,v)?.nome||'—'):`<select data-ch="${ch}" data-i="${i}" aria-label="Parte"><option value="">—</option>${partesAtivas(t).map(pa=>`<option value="${pa.id}" ${pa.id===v?'selected':''}>${esc(pa.nome)}</option>`).join('')}</select>`;
const resumoPartes=t=>{const at=partesAtivas(t);if(!dividida(t))return '';const co=at.filter(pa=>pa.neg?.status==='comprado').length;return `${at.length} partes · ${co} comprada${co===1?'':'s'}`};

/* ---------- ações ---------- */
function tentarParte(t,pa,tipo,dest,o={}){const vt=vtParte(t,pa),r=moverPara(vt,tipo,dest,o);save();render();
  if(r.ok){toast(`${pa.nome}: ${destinoNome(tipo,dest)}.`);return r}
  if(r.pedido){toast(r.msg);return r}
  if(r.bloq){UI.acao={tid:t.id,parte:pa.id,tipo,dest,dados:o.dados,pend:r.pend.map(x=>x.txt),items:r.pend};UI.alvoParte=pa.id;UI.modal=r.podeForcar?'forcar':'adv-bloq';renderModal();return r}
  toast(r.erro,true);return r}
function partesClick(A,a,t){if(!A.startsWith('pt-')||!t)return false;const pa=parteDe(t,a.dataset.p);
  const abre=m=>{UI.alvoParte=pa?.id||null;UI.modal=m;renderModal()};
  switch(A){
    case 'pt-nova':UI.alvoParte=null;UI.modal='pt-parte';renderModal();return true;
    case 'pt-editar':abre('pt-parte');return true;
    case 'pt-remover':if(pa.essencial&&nivelDe(me())<2){toast('Só gestor ou diretor tira uma parte essencial.',true);return true}abre('pt-remover');return true;
    case 'pt-ir':{const r=checkAdv(vtParte(t,pa));if(!r)return true;if(r.compra){const pend=r.items.filter(x=>!x.ok);
        if(pend.length&&!r.forcar){UI.acao={tid:t.id,parte:pa.id,tipo:'status',dest:'comprado',pend:pend.map(x=>x.txt),items:pend};abre('adv-bloq')}else{UI.acao={pend:pend.map(x=>x.txt)};abre('pt-comprar')}return true}
      tentarParte(t,pa,'etapa',r.dest);return true}
    case 'pt-prop':abre('pt-prop');return true;
    case 'pt-suspender':abre('suspender');return true;
    case 'pt-perder':abre('perder');return true;
    case 'pt-descartar':abre('descartar');return true;
    case 'pt-retomar':{const r=movePartes(vtParte(t,pa),'status','ativo');if(r){toast(r,true);return true}retomar(vtParte(t,pa));sincPrincipal(t);save();render();toast(`${pa.nome}: retomada.`);return true}
    case 'pt-aprovar':{const r=decidir(vtParte(t,pa),true,'');save();render();toast(r.erro||r.msg,!!r.erro);return true}
    case 'pt-recusar':abre('recusar');return true;
    case 'pt-cancelar':cancelarPedido(vtParte(t,pa));save();render();toast('Pedido cancelado.');return true;
  }
  return false}
function partesChange(el){const t=UI.route==='terreno'?T(UI.id):null;if(!t)return false;
  if(el.dataset.ch==='pt-sub'){const pa=parteDe(t,el.dataset.p);if(pa)tentarParte(t,pa,'subetapa',el.value);return true}
  if(el.dataset.ch==='mat-parte'||el.dataset.ch==='pes-parte'){const L=el.dataset.ch==='mat-parte'?t.mats:t.pessoas,x=L[+el.dataset.i],pa=parteDe(t,el.value);x.parte=el.value||null;
    log(t,`${el.dataset.ch==='mat-parte'?'Matrícula '+x.num:x.nome}: ${pa?'parte '+pa.nome:'sem parte'}`);save();render();return true}
  return false}
function partesSubmit(form,F,t,f){if(!t)return false;const pa=UI.alvoParte?parteDe(t,UI.alvoParte):null;
  if(form==='pt-parte'){const nome=F.nome.trim();if(!nome){toast('Dê um nome à parte.',true);return true}
    if(partesAtivas(t).some(x=>x!==pa&&x.nome.toLowerCase()===nome.toLowerCase())){toast('Já existe uma parte com esse nome.',true);return true}
    const ess=!!F.essencial;if(!ess&&(!pa||pa.essencial)&&nivelDe(me())<2){toast('Só gestor ou diretor marca uma parte como dispensável.',true);return true}
    const alvo=pa||{id:uid(),ativa:true,neg:null,propostas:[]};Object.assign(alvo,{nome,essencial:ess,area:lerNum(F.area)});
    const mats=f.querySelectorAll('input[name=mat]'),pes=f.querySelectorAll('input[name=pes]');
    mats.forEach(c=>{const m=t.mats[+c.value];if(c.checked)m.parte=alvo.id;else if(m.parte===alvo.id)m.parte=null});
    pes.forEach(c=>{const p=t.pessoas[+c.value];if(c.checked)p.parte=alvo.id;else if(p.parte===alvo.id)p.parte=null});
    f.querySelectorAll('input[name=ins]').forEach(c=>{const x=t.insc[+c.value];if(c.checked)x.parte=alvo.id;else if(x.parte===alvo.id)x.parte=null});
    f.querySelectorAll('input[name=cor]').forEach(c=>{if(c.checked)ligarCorretor(t,c.value,alvo.id);else{const x=t.corretores.find(y=>y.cid===c.value);if(x?.partes)x.partes=x.partes.filter(id=>id!==alvo.id)}});
    if(!pa){partesDe(t).push(alvo);log(t,`Parte ${nome} cadastrada${ess?'':' (dispensável)'}`);abrirPartes(t)}else log(t,`Parte ${nome} atualizada`);
    UI.modal=null;save();render();toast(pa?'Parte atualizada.':dividida(t)&&alvo.neg?`${nome} ganhou a sua negociação.`:'Parte cadastrada.');return true}
  if(!pa)return false;
  const vt=pa.neg?vtParte(t,pa):null;
  switch(form){
    case 'pt-remover':{if(!F.motivo.trim()){toast('Diga por que a parte sai.',true);return true}
      Object.assign(pa,{ativa:false,motivoRem:F.motivo.trim()});log(t,`Parte ${pa.nome} saiu do terreno: ${pa.motivoRem}`);sincPrincipal(t);UI.modal=null;save();render();toast(`${pa.nome} saiu do terreno. Ajuste a poligonal se a área mudou.`);return true}
    case 'pt-prop':{const v=lerNum(F.valor);if(!v){toast('Informe o valor.',true);return true}const L=pa.propostas,ant=L[L.length-1];
      if(ant&&['apresentada','em_analise'].includes(ant.status))ant.status=ant.origem===F.origem?'substituida':'recusada';
      L.push({v:L.length+1,origem:F.origem,data:HOJE,valor:v,forma:F.forma,cond:F.cond,status:'apresentada'});log(vt,`Proposta v${L.length}: ${mi(v)} (${F.origem==='bkm'?'BKM':'vendedor'})`);UI.modal=null;save();render();toast('Proposta registrada.');return true}
    case 'perder':case 'descartar':{const st=form==='perder'?'perdido':'descartado',m=(cfg().motivos[st]||[]).find(x=>x.k===F.motivo);
      if(m?.texto&&!F.detalhe.trim()){toast('Esse motivo pede uma explicação no texto.',true);return true}
      UI.modal=null;tentarParte(t,pa,'status',st,{dados:{motivo:F.motivo,detalhe:F.detalhe.trim()}});return true}
    case 'suspender':UI.modal=null;tentarParte(t,pa,'status','stand_by',{dados:{retomar:F.retomar,detalhe:F.detalhe.trim()}});return true;
    case 'pt-comprar':{if(!F.relato.trim()){toast('Escreva o relato.',true);return true}const pend=UI.acao?.pend||[];if(pend.length&&!F.j?.trim()){toast('Justifique a compra sem os requisitos.',true);return true}
      UI.modal=null;const r=moverPara(vt,'status','comprado',{forcar:!!pend.length,just:F.j?.trim(),dados:{relato:'<p>'+esc(F.relato.trim())+'</p>'}});UI.acao=null;save();render();
      toast(r.ok?`${pa.nome}: comprada.`:r.pedido?r.msg:r.erro||'Não foi possível concluir.',!!r.erro||!!r.bloq);return true}
    case 'forcar':{const a=UI.acao;const r=moverPara(vt,a.tipo,a.dest,{forcar:true,just:F.j,dados:a.dados});UI.modal=null;UI.acao=null;save();render();toast(r.ok?`${pa.nome}: ${destinoNome(a.tipo,a.dest)}.`:r.msg||r.erro||'Não foi possível.',!!r.erro);return true}
    case 'recusar':{const r=decidir(vt,false,F.coment.trim());UI.modal=null;save();render();toast(r.erro||r.msg,!!r.erro);return true}
  }
  return false}
function partesModal(M,fechar){const t=T(UI.id);if(!t)return '';const pa=UI.alvoParte?parteDe(t,UI.alvoParte):null;
  const df=(id,l)=>`<div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="${id}">${l}</button></div>`;
  if(M==='pt-parte'){const sel=k=>mselHtml(k,k==='ins'?'ins':k==='pes'?'pes':k==='cor'?'cor':'mat',msOptsFicha(t,pa,k),msSelFicha(t,pa,k));
    return `<div class="dh"><div><h2>${pa?'Editar parte':'Nova parte'}</h2><div class="muted" style="margin-top:4px">Um dono, ou um grupo de donos que negocia junto (herdeiros, sócios).</div></div>${fechar}</div>
    <form data-form="pt-parte" id="f-pt"><div class="fields"><div class="field full"><label for="pt-n">Nome ou identificador *</label><input id="pt-n" name="nome" required value="${esc(pa?.nome||'')}" placeholder="Família Souza, Carlos Pires..."></div>
    <div class="field"><label for="pt-a">Tamanho do lote (m²)</label><input id="pt-a" name="area" inputmode="decimal" value="${pa?.area??''}"></div>
    <div class="field"><span class="lbl-f">Importância</span><label class="chk" style="height:44px"><input type="checkbox" name="essencial" ${!pa||pa.essencial?'checked':''}>Essencial (sem ela o terreno não serve)</label></div>
    <div class="field full"><span class="lbl-f">Matrículas da parte</span>${sel('mat')}</div>
    <div class="field full"><span class="lbl-f">Inscrições da parte</span>${sel('ins')}</div>
    <div class="field full"><span class="lbl-f">Vendedores e contatos da parte</span>${sel('pes')}</div>
    <div class="field full"><span class="lbl-f">Corretores que trazem esta parte</span>${sel('cor')}</div>
    <div class="field full faint">Tudo é opcional, menos o nome. Dá para vincular depois.</div></div>
    ${!pa&&t.neg&&SIDX(t.neg.etapa)>=SIDX(etapaPartes())&&partesAtivas(t).length>=1?`<div class="banner blue" style="margin-top:12px">${ic('layers')}<div>O terreno já está em ${esc(SN(t.neg.etapa))}: ${dividida(t)?'a parte nova ganha a sua negociação.':'com esta parte, cada uma ganha a sua negociação.'}</div></div>`:''}</form>${df('f-pt',pa?'Salvar':'Cadastrar parte')}`}
  if(!pa)return '';
  if(M==='pt-remover')return `<div class="dh"><div><h2>Tirar ${esc(pa.nome)} do terreno?</h2><div class="muted" style="margin-top:4px">${pa.essencial?'É uma parte essencial: sem ela, o estudo do terreno precisa ser refeito.':'O terreno segue com área menor.'} Matrículas e donos continuam no histórico.</div></div>${fechar}</div><form data-form="pt-remover" id="f-ptr"><div class="field"><label for="ptr-m">Motivo (vai para o histórico)</label><textarea id="ptr-m" name="motivo" required placeholder="Ex.: dono vendeu para outra incorporadora"></textarea></div></form>${df('f-ptr','Tirar do terreno')}`;
  if(M==='pt-prop')return `<div class="dh"><div><h2>Proposta · ${esc(pa.nome)}</h2><div class="muted" style="margin-top:4px">v${(pa.propostas||[]).length+1}${(pa.propostas||[]).length?` responde à v${pa.propostas.length}`:''}</div></div>${fechar}</div><form data-form="pt-prop" id="f-ptp"><div class="fields">
    <div class="field"><label for="ptp-o">Origem</label><select id="ptp-o" name="origem"><option value="bkm">BKM</option><option value="vendedor">Vendedor</option></select></div>
    <div class="field"><label for="ptp-v">Valor (R$)</label><input id="ptp-v" name="valor" inputmode="decimal" required></div>
    <div class="field"><label for="ptp-f">Forma de pagamento</label><select id="ptp-f" name="forma">${Object.entries(OPT.forma).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="field full"><label for="ptp-c">Condições</label><textarea id="ptp-c" name="cond"></textarea></div></div></form>${df('f-ptp','Registrar')}`;
  if(M==='recusar'&&pa.neg?.pedido){const p=pa.neg.pedido;return `<div class="dh"><div><h2>Recusar ${esc(destinoNome(p.tipo,p.dest))} de ${esc(pa.nome)}?</h2><div class="muted" style="margin-top:4px">${esc(p.por)} recebe o motivo no sino.</div></div>${fechar}</div><form data-form="recusar" id="f-rc"><div class="field"><label for="rc-c">Motivo da recusa</label><textarea id="rc-c" name="coment" required></textarea></div></form>${df('f-rc','Recusar')}`}
  if(M==='pt-comprar'){const pend=UI.acao?.pend||[];return `<div class="dh"><div><h2>Parte comprada: ${esc(pa.nome)}</h2><div class="muted" style="margin-top:4px">O terreno fica Comprado quando todas as partes estiverem compradas.</div></div>${fechar}</div><form data-form="pt-comprar" id="f-ptc"><div class="fields">
    <div class="field full"><label for="ptc-r">Relato</label><textarea id="ptc-r" name="relato" required placeholder="Condições finais, escritura, quem assinou"></textarea></div>
    ${pend.length?`<div class="field full"><div class="banner warn">${ic('warn')}<div><div class="bt">Comprar sem os requisitos</div><ul class="pend">${pend.map(x=>`<li>${ic('close',16)}${esc(x)}</li>`).join('')}</ul></div></div></div><div class="field full"><label for="ptc-j">Justificativa (vai para o histórico)</label><textarea id="ptc-j" name="j" required></textarea></div>`:''}</div></form>${df('f-ptc','Concluir')}`}
  return ''}

/* ---------- exemplo: três lotes de donos diferentes, já na Negociação ---------- */
function partesPreparar(){if(S.partesExemplo)return;S.partesExemplo=true;if(S.terrenos.some(t=>t.codigo==='TER-000133'))return;S.seqT=Math.max(S.seqT||0,133);
  const H=n=>addD(HOJE,-n),la=-23.5868,lo=-46.5772,dy=45/110574,dx=60/(111320*Math.cos(la*Math.PI/180));
  const t=Object.assign(seedVazio(),{codigo:'TER-000133',nome:'Três lotes Rua Ibitirama',prioridade:'alta',resp:'Ana Prado',origem:'corretor',dataIdent:H(55),logradouro:'Rua Ibitirama',numero:'1.200',bairro:'Vila Prudente',zona:'sudeste',municipio:'São Paulo · SP',
    lat:la,lng:lo,precisao:'conferida',poly:[[la+dy,lo-dx],[la+dy,lo+dx],[la-dy,lo+dx],[la-dy,lo-dx]].map(p=>p.map(v=>+v.toFixed(6))),aDoc:5400,fonteArea:'documental',testada:120,topografia:'plano',posicao:'meio_quadra',formato:'regular',ocupacao:'parcialmente_ocupado'});
  const pa={id:'pa1',nome:'Família Souza',essencial:true,area:2700,ativa:true},pb={id:'pa2',nome:'Carlos Pires',essencial:true,area:1500,ativa:true},pc={id:'pa3',nome:'Oficina do Zé',essencial:false,area:1200,ativa:true};
  t.partes=[pa,pb,pc];
  t.mats=[{num:'201.001',cri:'6º CRI',area:1350,data:H(20),parte:'pa1'},{num:'201.002',cri:'6º CRI',area:1350,data:H(20),parte:'pa1'},{num:'201.003',cri:'6º CRI',area:1500,data:H(20),parte:'pa2'},{num:'201.004',cri:'6º CRI',area:1200,data:H(20),parte:'pa3'}];
  t.pessoas=[{nome:'Ana Souza',tipo:'PF',papel:'proprietario',pct:50,tel:'',parte:'pa1'},{nome:'Beto Souza',tipo:'PF',papel:'proprietario',pct:50,tel:'',parte:'pa1'},{nome:'Carlos Pires',tipo:'PF',papel:'proprietario',pct:100,tel:'',parte:'pa2'},{nome:'José Almeida',tipo:'PF',papel:'proprietario',pct:100,tel:'',parte:'pa3'}];
  t.ofertas=[{id:'o133',cid:'c1',data:H(55),valor:9800000,forma:'dinheiro',obsPag:'',aceita:'Família Souza aceita permuta parcial.',status:'ativa',partes:{pa1:5000000,pa2:3000000,pa3:1800000}}];t.corretores=[{cid:'c1',principal:true}];
  const tr=(e,s,d,ev,de)=>({em:H(d)+'T09:00:00.000',user:'Ana Prado',ev,deEtapa:de?.[0]||null,deSub:de?.[1]||null,paraEtapa:e,paraSub:s,status:'ativo'});
  t.neg={codigo:'NEG-00133',etapa:'negociacao',sub:'aguardando_reuniao',status:'ativo',desde:H(20),subDesde:H(20),temp:3,ofRef:'o133',viab:{nome:'Estudo dos 3 lotes',vgv:71500000,margem:15.4,em:H(30)},pedido:null,
    trilha:[tr('triagem','aguardando_informacoes',55,'abertura'),tr('estudos','estudo_massa',40,'avanco',['triagem','verificacao_interna']),tr('estudos','estudo_viabilidade',32,'subetapa',['estudos','estudo_massa']),tr('negociacao','aguardando_reuniao',20,'avanco',['estudos','estudo_viabilidade'])]};
  const np=(seq,e,s,dias,temp,extra)=>Object.assign({codigo:'NEG-00133-'+seq,etapa:e,sub:s,status:'ativo',desde:H(dias),subDesde:H(Math.min(dias,6)),ofRef:'o133',viab:null,pedido:null,
    trilha:[tr('negociacao','aguardando_reuniao',20,'abertura')].concat(e==='contrato'?[tr('contrato',s,6,'avanco',['negociacao','contra_proposta'])]:s!=='aguardando_reuniao'?[tr('negociacao',s,6,'subetapa',['negociacao','aguardando_reuniao'])]:[])},extra||{});
  pa.neg=np(1,'contrato','em_elaboracao',6,5);pa.propostas=[{v:1,origem:'bkm',data:H(15),valor:4600000,forma:'permuta_com_torna',cond:'R$ 3 mi + 4% em unidades.',status:'aceita'}];
  pb.neg=np(2,'negociacao','contra_proposta',20,3);pb.propostas=[{v:1,origem:'bkm',data:H(14),valor:2600000,forma:'dinheiro',cond:'À vista.',status:'recusada'},{v:2,origem:'vendedor',data:H(5),valor:2900000,forma:'dinheiro',cond:'50% no compromisso.',status:'apresentada'}];
  pc.neg=np(3,'negociacao','aguardando_reuniao',20,1);pc.propostas=[];
  t.hist.push({em:H(20)+'T09:00:01.000',user:'Ana Prado',txt:'Negociação dividida por parte: Família Souza, Carlos Pires e Oficina do Zé'});
  S.terrenos.push(t)}

/* ---------- escolha dentro da parte: lista dos já cadastrados no terreno + "Incluir" num pop-up pequeno ----------
   Na ficha os valores são os do terreno (índice em mats/insc/pessoas, id do corretor). No Novo terreno, antes de
   o terreno existir, são os do passo 2 (matrícula e inscrição digitadas lá) e os incluídos pelo pop-up (UI.nvPool),
   que entram no cadastro do terreno ao gravar. */
const MS_T={mat:{l:'matrícula',ls:'Matrículas',vazio:'Nenhuma matrícula cadastrada no terreno.'},ins:{l:'inscrição',ls:'Inscrições',vazio:'Nenhuma inscrição cadastrada no terreno.'},
  pes:{l:'vendedor',ls:'Vendedores',vazio:'Nenhum vendedor cadastrado no terreno.'},cor:{l:'corretor',ls:'Corretores',vazio:'Nenhum corretor cadastrado.'}};
function mselHtml(tipo,name,opts,sel,aberto){const T=MS_T[tipo],ch=opts.filter(o=>sel.includes(String(o.v)));
  return `<div class="msel${aberto?' aberto':''}" data-tipo="${tipo}" data-name="${name}"><button type="button" class="msel-b" data-a="ms-abre" aria-expanded="${!!aberto}" aria-label="${T.ls}"><span class="msel-r${ch.length?'':' faint'}">${ch.length?esc(ch.map(o=>o.l).join(', ')):'Escolher'}</span>${ic('chev',18)}</button>
  <div class="msel-m"${aberto?'':' hidden'}>${opts.map(o=>`<label class="chk"><input type="checkbox" name="${name}" value="${esc(String(o.v))}" data-l="${esc(o.l)}" ${sel.includes(String(o.v))?'checked':''} ${o.dis?'disabled':''}>${esc(o.l)}${o.sub?` <span class="faint">${esc(o.sub)}</span>`:''}</label>`).join('')||`<div class="faint msel-v">${T.vazio}</div>`}
  <button type="button" class="btn text sm" data-a="ms-novo">${ic('add',16)}Incluir ${T.l}</button></div></div>`}
// opções na ficha (formulário da parte)
function msOptsFicha(t,pa,tipo){const fora=id=>id&&(!pa||id!==pa.id)?parteDe(t,id)?.nome||'':'';
  if(tipo==='mat')return t.mats.map((m,i)=>({v:i,l:m.num,sub:[m.cri,fora(m.parte)].filter(Boolean).join(' · '),dis:!!fora(m.parte)}));
  if(tipo==='ins')return t.insc.map((x,i)=>({v:i,l:x.sql,sub:fora(x.parte),dis:!!fora(x.parte)}));
  if(tipo==='pes')return t.pessoas.map((p,i)=>({v:i,l:p.nome,sub:[OPT.papel[p.papel],fora(p.parte)].filter(Boolean).join(' · ')}));
  return S.corretores.map(c=>{const x=t.corretores.find(y=>y.cid===c.id),o=(x?.partes||[]).filter(id=>!pa||id!==pa.id).map(id=>parteDe(t,id)?.nome).filter(Boolean);return {v:c.id,l:c.nome,sub:c.imob+(o.length?' · também '+o.join(', '):'')}})}
const msSelFicha=(t,pa,tipo)=>!pa?[]:tipo==='mat'?t.mats.flatMap((m,i)=>m.parte===pa.id?[String(i)]:[]):tipo==='ins'?t.insc.flatMap((x,i)=>x.parte===pa.id?[String(i)]:[]):tipo==='pes'?t.pessoas.flatMap((p,i)=>p.parte===pa.id?[String(i)]:[]):t.corretores.filter(x=>(x.partes||[]).includes(pa.id)).map(x=>x.cid);
// opções no Novo terreno: o digitado no passo 2 e o incluído pelo pop-up
function msOptsNovo(tipo){const f=$('#f-novo'),P=UI.nvPool||{},u=(a,k)=>a.filter((x,i)=>a.findIndex(y=>digits(y[k]||y)===digits(x[k]||x))===i);
  if(tipo==='mat')return u([...(f?.mat?.value.trim()?[{num:f.mat.value.trim(),cri:f.cri.value}]:[]),...(P.mat||[])],'num').map(m=>({v:m.num,l:m.num,sub:m.cri}));
  if(tipo==='ins')return u([...(f?.sql?.value.trim()?[f.sql.value.trim()]:[]),...(P.ins||[])],'').map(s=>({v:s,l:s}));
  if(tipo==='pes')return (P.pes||[]).map(p=>({v:p.nome,l:p.nome,sub:p.tel}));
  return S.corretores.map(c=>({v:c.id,l:c.nome,sub:c.imob}))}
const msNoNovo=el=>!!el.closest('#nv-pt-lista');
function msRefaz(box,novoV){const tipo=box.dataset.tipo,sel=[...box.querySelectorAll('input:checked')].map(x=>x.value);if(novoV!=null)sel.push(String(novoV));
  const t=UI.route==='terreno'?T(UI.id):null,pa=UI.alvoParte&&t?parteDe(t,UI.alvoParte):null;
  const opts=msNoNovo(box)?msOptsNovo(tipo):msOptsFicha(t,pa,tipo);box.outerHTML=mselHtml(tipo,box.dataset.name,opts,sel,box.classList.contains('aberto'))}
function msResumo(box){const ch=[...box.querySelectorAll('input:checked')].map(x=>x.dataset.l),r=box.querySelector('.msel-r');r.textContent=ch.length?ch.join(', '):'Escolher';r.classList.toggle('faint',!ch.length)}
// pop-up pequeno de inclusão
let MS_ALVO=null;
function msPopup(box){MS_ALVO=box;const tipo=box.dataset.tipo,t=UI.route==='terreno'?T(UI.id):null,cid=t?insCid(t.insc[0]||{mun:cidDoNome(t.municipio||'')||'outro'}):cidDoNome($('#f-novo')?.municipio?.value||'')||'outro';
  const campos={mat:`<div class="field"><label for="ms-a">Número da matrícula *</label><input id="ms-a" name="a" required inputmode="numeric" placeholder="184.552"></div><div class="field"><label for="ms-b">Cartório</label><select id="ms-b" name="b">${Array.from({length:18},(_,i)=>`<option>${i+1}º CRI</option>`).join('')}</select></div>`,
    ins:`<div class="field"><label for="ms-a">${esc((CIDADES_INSC[cid]||CIDADES_INSC.outro).rotulo)} *</label><input id="ms-a" name="a" required placeholder="${esc((CIDADES_INSC[cid]||CIDADES_INSC.outro).mascara||'Como está no carnê do IPTU')}"></div>`,
    pes:`<div class="field"><label for="ms-a">Nome ou razão social *</label><input id="ms-a" name="a" required></div><div class="field"><label for="ms-b">Telefone</label><input id="ms-b" name="b" inputmode="tel"></div>`,
    cor:`<div class="field"><label for="ms-a">Nome do corretor *</label><input id="ms-a" name="a" required></div><div class="field"><label for="ms-b">Imobiliária</label><input id="ms-b" name="b"></div><div class="field"><label for="ms-c">CRECI</label><input id="ms-c" name="c"></div>`}[tipo];
  const d=document.createElement('div');d.id='ms-dlg';d.className='scrim ms-scrim';
  d.innerHTML=`<div class="dialog mini" role="dialog" aria-modal="true" aria-labelledby="ms-h"><div class="dh"><h2 id="ms-h">Incluir ${MS_T[tipo].l}</h2><button type="button" class="iconbtn" data-a="ms-fecha" aria-label="Fechar">${ic('close')}</button></div>
    <form id="ms-f" class="fields">${campos}</form><div class="df"><button type="button" class="btn text" data-a="ms-fecha">Cancelar</button><button class="btn primary" type="submit" form="ms-f">Incluir</button></div></div>`;
  document.body.appendChild(d);d.querySelector('input').focus()}
const msFecha=()=>{$('#ms-dlg')?.remove();MS_ALVO=null};
function msGravar(f){const box=MS_ALVO;if(!box||!document.body.contains(box)){msFecha();return}const tipo=box.dataset.tipo,a=f.a.value.trim(),b=f.b?.value.trim()||'',c=f.c?.value.trim()||'';
  if(!a){toast('Preencha o campo obrigatório.',true);return}
  let v;if(tipo==='cor'){const n={id:uid(),nome:a,imob:b||'Autônomo',creci:c||'—',tel:''};S.corretores.push(n);v=n.id}
  if(msNoNovo(box)){const P=UI.nvPool=UI.nvPool||{mat:[],ins:[],pes:[]};
    if(tipo==='mat'){if(msOptsNovo('mat').some(o=>digits(o.v)===digits(a))){toast('Essa matrícula já está na lista.',true);return}P.mat.push({num:a,cri:b});v=a}
    if(tipo==='ins'){if(msOptsNovo('ins').some(o=>digits(o.v)===digits(a))){toast('Essa inscrição já está na lista.',true);return}P.ins.push(a);v=a}
    if(tipo==='pes'){P.pes.push({nome:a,tel:b});v=a}}
  else{const t=T(UI.id);
    if(tipo==='mat'){if(t.mats.some(m=>digits(m.num)===digits(a))){toast('Essa matrícula já está no terreno.',true);return}t.mats.push({num:a,cri:b,area:null,data:null});v=t.mats.length-1;log(t,`Matrícula ${a} adicionada`)}
    if(tipo==='ins'){if(t.insc.some(x=>digits(x.sql)===digits(a))){toast('Essa inscrição já está no terreno.',true);return}t.insc.push({mun:insCid(t.insc[0]||{mun:cidDoNome(t.municipio||'')||'outro'}),sql:a,area:null,valores:[]});v=t.insc.length-1;log(t,`Inscrição ${a} adicionada`)}
    if(tipo==='pes'){t.pessoas.push({nome:a,tipo:'PF',papel:'proprietario',pct:null,tel:b});v=t.pessoas.length-1;log(t,`${a} adicionado como proprietário`)}
    save()}
  msFecha();msRefaz(box,v);toast(`${MS_T[tipo].l[0].toUpperCase()+MS_T[tipo].l.slice(1)} incluíd${tipo==='mat'||tipo==='ins'?'a':'o'}.`)}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="ms-"]');
  if(!a){if(!e.target.closest('.msel,#ms-dlg'))document.querySelectorAll('.msel.aberto').forEach(b=>{b.classList.remove('aberto');b.querySelector('.msel-m').hidden=true;b.querySelector('.msel-b').setAttribute('aria-expanded','false')});return}
  e.stopImmediatePropagation();e.preventDefault();const A=a.dataset.a,box=a.closest('.msel');
  if(A==='ms-abre'){const ab=!box.classList.contains('aberto');document.querySelectorAll('.msel.aberto').forEach(b=>{if(b!==box){b.classList.remove('aberto');b.querySelector('.msel-m').hidden=true}});
    if(ab&&msNoNovo(box)){box.classList.add('aberto');msRefaz(box);return}
    box.classList.toggle('aberto',ab);box.querySelector('.msel-m').hidden=!ab;a.setAttribute('aria-expanded',String(ab));return}
  if(A==='ms-novo')return msPopup(box);
  if(A==='ms-fecha')return msFecha()},true);
document.addEventListener('change',e=>{const box=e.target.closest('.msel');if(box)msResumo(box)});
document.addEventListener('submit',e=>{if(e.target.id!=='ms-f')return;e.preventDefault();e.stopImmediatePropagation();msGravar(e.target)},true);
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#ms-dlg')){e.preventDefault();e.stopImmediatePropagation();msFecha()}},true);
document.addEventListener('mousedown',e=>{const d=$('#ms-dlg');if(d&&e.target===d)msFecha()});
