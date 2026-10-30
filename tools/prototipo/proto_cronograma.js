/* =====================================================================
   Cronograma no estilo do MS Project (bloco 2) e modelos de tarefas
   (decisões do Moisés, 29/out/2026). Espelha o banco (fluxo.tg_cronograma,
   fluxo.vinculos, fluxo.linhas_base, fluxo.modelos_quadro):
   - predecessoras TI (padrão), II, TT e IT com defasagem; a tarefa começa
     no maior entre o início digitado e o que os vínculos pedem, mantendo a
     duração, e as sucessoras se reposicionam em cascata; concluída não se move;
   - dias corridos por padrão, úteis opcional (Configurações › Tarefas);
   - linha de base: quem edita manda o cronograma, o gestor de quem mandou
     (ou acima, ou o administrador) aprova; depois disso só gestor, diretor
     ou administrador trocam; as datas seguem livres e o atraso aparece;
   - modelos: o da empresa (padrão entra sozinho no terreno novo) e os de
     cada pessoa, com prazos relativos, pessoas, etiquetas, checklists e
     predecessoras.
   Injetado no mesmo escopo do protótipo, depois de proto_quadros.js.
   ===================================================================== */
const CR_TIPOS={TI:'Término → início',II:'Início → início',TT:'Término → término',IT:'Início → término'};
const CR_FERIADOS=new Set([].concat(...[2026,2027,2028,2029,2030].map(a=>['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'].map(d=>a+'-'+d)),
  ['2026-02-16','2026-02-17','2026-04-03','2026-06-04','2027-02-08','2027-02-09','2027-03-26','2027-05-27','2028-02-28','2028-02-29','2028-04-14','2028-06-15',
   '2029-02-12','2029-02-13','2029-03-30','2029-05-31','2030-03-04','2030-03-05','2030-04-19','2030-06-20']));
UI.crVista=UI.crVista||{};

/* ---------- calendário ---------- */
const crUteis=()=>!!S.calUteis;
const crUtil=d=>{const w=pd(d).getDay();return w!==0&&w!==6&&!CR_FERIADOS.has(d)};
function crSomar(d,n){if(!d||n==null)return null;if(!crUteis())return addD(d,n);const p=n<0?-1:1;let x=d,f=Math.abs(n);
  while(!crUtil(x))x=addD(x,p);while(f>0){x=addD(x,p);if(crUtil(x))f--}return x}
function crDur(a,b){if(!a||!b)return null;if(!crUteis())return Math.round((pd(b)-pd(a))/864e5)+1;let n=0,x=a;while(x<=b){if(crUtil(x))n++;x=addD(x,1)}return Math.max(1,n)}
const crDias=(a,b)=>Math.round((pd(b)-pd(a))/864e5);

/* ---------- datas como no Project ---------- */
const crPreds=k=>k.preds||(k.preds=[]);
function crCedo(t,k){let r=null;const d=k.dur||1;
  crPreds(k).forEach(v=>{const p=t.tarefas.find(x=>x.id===v.id);if(!p||p.arq||!p.inicio||!p.prazo)return;const L=Number(v.def)||0;
    const c=v.tipo==='II'?crSomar(p.inicio,L):v.tipo==='TT'?crSomar(crSomar(p.prazo,L),-(d-1)):v.tipo==='IT'?crSomar(crSomar(p.inicio,L),-(d-1)):crSomar(p.prazo,1+L);
    if(!r||c>r)r=c});return r}
function crPosicionar(t,k){if(k.feita||k.arq)return false;const r=crCedo(t,k);if(!r)return false;const a=k.inicio+'|'+k.prazo;
  k.dur=k.dur||1;k.inicio=k.iniMin&&k.iniMin>r?k.iniMin:r;k.prazo=crSomar(k.inicio,k.dur-1);return a!==k.inicio+'|'+k.prazo}
/* cascata: refaz até nada mudar (os vínculos não fecham círculo) */
function crCascata(t){for(let i=0;i<60;i++){let m=false;t.tarefas.forEach(k=>{if(crPreds(k).length&&crPosicionar(t,k))m=true});if(!m)break}}
/* edição de data pela pessoa: mudar só o início move a tarefa inteira; mudar o prazo ou a duração muda a duração */
function crEditar(t,k,campo,v){const antes={i:k.inicio,p:k.prazo};
  if(campo==='inicio'){if(!v){k.inicio=null;k.iniMin=null;k.dur=null}else{k.iniMin=v;if(k.dur&&k.prazo){k.inicio=v;k.prazo=crSomar(v,k.dur-1)}else{k.inicio=v;if(k.prazo&&v>k.prazo)k.prazo=v;k.dur=crDur(k.inicio,k.prazo)}}}
  else if(campo==='prazo'){if(!v){k.prazo=null;k.dur=null}else{if(k.inicio&&v<k.inicio){toast('O prazo não pode ser antes do início.',true);return false}k.prazo=v;k.dur=crDur(k.inicio,k.prazo)}}
  else if(campo==='dur'){const n=Math.max(1,parseInt(v,10)||1);k.dur=n;if(!k.inicio)k.inicio=k.iniMin=HOJE;k.prazo=crSomar(k.inicio,n-1)}
  crPosicionar(t,k);crCascata(t);
  if(antes.i!==k.inicio||antes.p!==k.prazo)log(t,`Tarefa "${k.titulo}": datas ${fd(antes.i)} – ${fd(antes.p)} → ${fd(k.inicio)} – ${fd(k.prazo)}`);
  crAvisoII(t,k);return true}
/* II e TT com a mesma predecessora e durações diferentes: pergunta se estica a duração ou adia o início */
function crAvisoII(t,k){const ps=crPreds(k);for(const v of ps){if(v.tipo!=='II')continue;if(!ps.some(w=>w.id===v.id&&w.tipo==='TT'))continue;
  const p=t.tarefas.find(x=>x.id===v.id);if(p&&p.dur&&k.dur&&p.dur!==k.dur&&!(UI.crAvisoVisto||[]).includes(k.id+'|'+p.id+'|'+k.dur+'|'+p.dur)){UI.crAviso={tid:t.id,kid:k.id,pid:p.id};return}}}
function crIniciar(t){(t.tarefas||[]).forEach(k=>{crPreds(k);if(k.inicio&&k.prazo&&!k.dur)k.dur=crDur(k.inicio,k.prazo);if(k.inicio&&k.iniMin===undefined)k.iniMin=k.inicio})}

/* ---------- linha de base ---------- */
const crLbs=t=>t.lbs||(t.lbs=[]);
const crLbAprov=t=>crLbs(t).find(b=>b.sit==='aprovada');
const crLbPend=t=>crLbs(t).find(b=>b.sit==='pendente');
const crAprova=(quem,pedinte)=>ehAdmin(quem)||membro(quem).papel==='diretor'||(membro(quem).papel==='gestor'&&(quem===pedinte||ehSuperior(quem,pedinte)));
function crEnviar(t,motivo){const its={};(t.tarefas||[]).filter(k=>!k.arq&&k.inicio&&k.prazo).forEach(k=>its[k.id]={ini:k.inicio,pz:k.prazo,dur:k.dur});
  if(!Object.keys(its).length){toast('O cronograma não tem tarefa com início e prazo.',true);return}
  const pend=crLbPend(t);if(pend){pend.sit='cancelada';pend.decPor=me();pend.decEm=agora()}
  const b={id:uid(),n:null,sit:'pendente',motivo:motivo||null,por:me(),em:agora(),itens:its};crLbs(t).push(b);
  if(crAprova(me(),me())){crAprovar(t,b);toast(`Linha de base ${b.n} aprovada.`)}
  else{const g=aprovadorPrevisto(me(),2)||aprovadorPrevisto(me(),3);if(g)notificar(g,'tarefa_atribuida',`${me()} mandou o cronograma de ${t.codigo} para aprovar`,t,null,{b:'tarefas'});
    log(t,`Cronograma enviado para aprovação${motivo?': '+motivo:''}`);toast(g?`Cronograma enviado para ${g} aprovar.`:'Cronograma enviado para aprovação.')}}
function crAprovar(t,b){const a=crLbAprov(t);if(a)a.sit='substituida';b.sit='aprovada';b.n=Math.max(0,...crLbs(t).map(x=>x.n||0))+1;b.decPor=me();b.decEm=agora();
  log(t,`Linha de base ${b.n} aprovada${b.motivo?' ('+b.motivo+')':''}`)}
const crBase=(t,k)=>{const b=crLbAprov(t);return b&&b.itens[k.id]};

/* ---------- no cartão: duração, predecessoras, linha de base ---------- */
function crCartaoDatas(t,k,dis){const b=crBase(t,k),dv=b&&k.prazo?crDias(b.pz,k.prazo):null;
  return `<input id="tkc-dur" type="number" min="1" class="tkm-pill tkm-dur" value="${k.dur||''}" data-tkc="dur" ${dis} aria-label="Duração em dias" title="Duração (${crUteis()?'dias úteis':'dias corridos'})"><span class="faint">${crUteis()?'d úteis':'dias'}</span>
    ${b?`<span class="tkm-lb ${dv>0?'atras':''}" title="Linha de base ${crLbAprov(t).n}">Base: ${fd(b.ini)} – ${fd(b.pz)}${dv?` (${dv>0?'+':''}${dv} d)`:''}</span>`:''}`}
function crCartaoPreds(t,k,ro){const ps=crPreds(k),outros=vzTarefas(t).filter(x=>x.id!==k.id&&!x.arq),sucs=t.tarefas.filter(x=>crPreds(x).some(v=>v.id===k.id));
  if(ro&&!ps.length&&!sucs.length)return '';
  const nome=id=>{const p=t.tarefas.find(x=>x.id===id);return p?`${p.codigo} · ${esc(p.titulo)}`:'—'};
  return `<div class="tkm-bloco">${tkSecH('rota','Predecessoras',ro||!outros.length?'':`<button class="tkm-btn" data-a="cr-pred-novo">Adicionar</button>`)}<div class="tkm-in">
    ${ps.map((v,i)=>`<div class="cr-pr"><span class="cr-prn">${nome(v.id)}</span>
      ${ro?`<span class="faint">${CR_TIPOS[v.tipo]}${v.def?` ${v.def>0?'+':''}${v.def} d`:''}</span>`:`<select class="tkm-pill" data-tkc="pred-tipo" data-i="${i}" aria-label="Tipo do vínculo">${Object.entries(CR_TIPOS).map(([x,n])=>`<option value="${x}" ${x===v.tipo?'selected':''}>${x} · ${n}</option>`).join('')}</select>
      <label class="cr-def" title="Defasagem em dias (negativa adianta)"><input type="number" class="tkm-pill" value="${v.def||0}" data-tkc="pred-def" data-i="${i}" aria-label="Defasagem em dias"><span class="faint">d</span></label>
      <button class="iconbtn sm" data-a="cr-pred-x" data-i="${i}" aria-label="Tirar a predecessora" title="Tirar">${ic('close',16)}</button>`}</div>`).join('')}
    ${UI.crPredNovo&&!ro?`<form class="cr-pr cr-prf" data-form="cr-pred"><select name="id" class="tkm-pill" required aria-label="Tarefa predecessora"><option value="">Escolha a tarefa…</option>${outros.map(x=>`<option value="${x.id}">${x.codigo} · ${esc(x.titulo)}</option>`).join('')}</select>
      <select name="tipo" class="tkm-pill" aria-label="Tipo">${Object.entries(CR_TIPOS).map(([x,n])=>`<option value="${x}">${x} · ${n}</option>`).join('')}</select><label class="cr-def"><input type="number" name="def" value="0" class="tkm-pill" aria-label="Defasagem em dias"><span class="faint">d</span></label>
      <button class="tkm-ok" type="submit">Ligar</button><button class="tkm-btn" type="button" data-a="cr-pred-cancela">Cancelar</button></form>`:''}
    ${!ps.length&&!UI.crPredNovo?'<div class="faint">Sem predecessoras: começa no início digitado.</div>':''}
    ${sucs.length?`<div class="faint cr-sucs">Dependem desta: ${sucs.map(x=>x.codigo).join(', ')}</div>`:''}</div></div>`}
function crAvisoHtml(){const a=UI.crAviso;if(!a)return '';const {t,k}=tkAcha(a.tid,a.kid),p=t?.tarefas.find(x=>x.id===a.pid);if(!k||!p){UI.crAviso=null;return ''}
  return `<div class="cr-aviso-f" role="alertdialog" aria-modal="true" aria-labelledby="cr-av-t"><div class="cr-aviso"><h3 id="cr-av-t">Começam e terminam juntas, com durações diferentes</h3>
    <p><b>${esc(k.titulo)}</b> tem ${k.dur} dia${k.dur>1?'s':''} e <b>${esc(p.titulo)}</b> tem ${p.dur}. Com início-início e término-término, o Project adia o início da mais curta. O que prefere?</p>
    <div class="cr-av-b"><button class="tkm-ok" data-a="cr-av-esticar">Esticar para ${p.dur} dias</button><button class="tkm-btn" data-a="cr-av-adiar">Manter ${k.dur} dias e adiar o início</button></div></div></div>`}

/* ---------- Gantt ---------- */
/* Gantt no desenho aprovado (G_Gantt, 30/out/2026): barra de ferramentas (Agrupar, escala Dia · Semana · Mês, Hoje, legenda e, na ficha, a linha de base);
   à esquerda Tarefa (círculo de concluir, subtarefa recuada embaixo da mãe), responsável e duração; grupos que abrem e fecham;
   barra fina na cor do status (lista) com o feito por dentro, a linha de base em cinza embaixo, marco em losango, "+N d" depois da barra
   quando o prazo passou da base, setas das predecessoras e hoje em azul. */
P.baixo='M6 9l6 6 6-6';P.escudo='M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z';
UI.crEsc=UI.crEsc||'dia';UI.crAgr=UI.crAgr||'terreno';UI.crFech=UI.crFech||{};
const CR_ESC={dia:26,semana:10,mes:4},CR_SEM=['dom','seg','ter','qua','qui','sex','sáb'],CR_MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
/* a subtarefa vem logo depois da mãe, quando a mãe está no mesmo grupo */
function crArvore(itens){const ids=new Set(itens.map(x=>x.k.id)),r=[];itens.filter(x=>!x.k.mae||!ids.has(x.k.mae)).forEach(x=>{r.push({...x,sub:false});itens.filter(y=>y.k.mae===x.k.id).forEach(y=>r.push({...y,sub:true}))});return r}
function crGantt(grupos,opts={}){const its=grupos.flatMap(g=>g.itens);const datas=[];its.forEach(({t,k})=>{const b=crBase(t,k);[k.inicio,k.prazo,b?.ini,b?.pz].forEach(d=>d&&datas.push(d))});
  const ficha=opts.ficha,esc0=UI.crEsc in CR_ESC?UI.crEsc:'dia',W=CR_ESC[esc0];
  const barra=`<div class="cr-tb">${ficha?'':`<label class="cr-agr"><span>Agrupar:</span><select data-crg="agr" aria-label="Agrupar por">${[['terreno','Terreno'],['resp','Responsável'],['nenhum','Nada']].map(([v,n])=>`<option value="${v}" ${UI.crAgr===v?'selected':''}>${n}</option>`).join('')}</select></label>`}
    <label class="cr-esc"><select data-crg="esc" aria-label="Escala">${[['dia','Dia'],['semana','Semana'],['mes','Mês']].map(([v,n])=>`<option value="${v}" ${esc0===v?'selected':''}>${n}</option>`).join('')}</select></label>
    <button class="btn sm cr-hojeb" data-a="cr-hoje">Hoje</button>
    <span class="cr-tbd"><span class="cr-lg"><i class="cr-lg-b"></i>Linha de base aprovada</span><span class="cr-lg"><i class="cr-lg-m"></i>Marco</span>${ficha?crBaseBarra(ficha):''}</span></div>`;
  if(!its.length)return barra+`<div class="cr-vazio">Nenhuma tarefa com início e prazo. Abra um cartão e preencha as datas.</div>`;
  if(!datas.length)datas.push(HOJE);datas.push(HOJE);
  let ini=addD(datas.reduce((a,b)=>a<b?a:b),-3),fim=addD(datas.reduce((a,b)=>a>b?a:b),esc0==='dia'?8:21);
  if(esc0==='mes'){ini=ini.slice(0,8)+'01'}
  const nd=crDias(ini,fim)+1,x=d=>crDias(ini,d)*W,dias=[];for(let i=0;i<nd;i++)dias.push(addD(ini,i));
  const fds=d=>{const w=pd(d).getDay();return w===0||w===6};
  let cab='';
  if(esc0==='dia')cab=dias.map((d,i)=>`<span class="cr-d ${fds(d)?'fds':''} ${d===HOJE?'hoje':''}" style="left:${i*W}px;width:${W}px"><b>${Number(d.slice(8))}</b><small>${CR_SEM[pd(d).getDay()]}</small></span>`).join('');
  else if(esc0==='semana')cab=dias.map((d,i)=>pd(d).getDay()===1?`<span class="cr-d cr-dw ${d<=HOJE&&HOJE<addD(d,7)?'hoje':''}" style="left:${i*W}px;width:${7*W}px"><b>${Number(d.slice(8))} ${CR_MES[Number(d.slice(5,7))-1]}</b><small>semana</small></span>`:'').join('');
  else{const ms=[];dias.forEach((d,i)=>{const m=d.slice(0,7);if(!ms.length||ms.at(-1).m!==m)ms.push({m,i,n:1});else ms.at(-1).n++});
    cab=ms.map(m=>`<span class="cr-d cr-dw ${HOJE.startsWith(m.m)?'hoje':''}" style="left:${m.i*W}px;width:${m.n*W}px"><b>${CR_MES[Number(m.m.slice(5))-1]}</b><small>${m.m.slice(0,4)}</small></span>`).join('')}
  const fundo=`<div class="cr-fundo">${esc0==='mes'?'':dias.map((d,i)=>fds(d)?`<i style="left:${i*W}px;width:${W}px"></i>`:'').join('')}<b class="cr-hoje" style="left:${x(HOJE)+W/2}px"></b></div>`;
  let linhas='',esq='',yy=0;const H=40;const pos=new Map(),setas=[];
  grupos.forEach(g=>{const fe=g.chave&&UI.crFech[g.chave];
    if(g.titulo){esq+=`<button class="cr-gr" data-a="cr-gr" data-v="${esc(g.chave)}" aria-expanded="${!fe}">${ic(fe?'chev':'baixo',18)}<span>${g.titulo}</span></button>`;linhas+=`<div class="cr-row cr-grr"></div>`;yy+=H}
    if(fe)return;
    crArvore(g.itens).forEach(({t,k,sub})=>{const b=crBase(t,k),dv=b&&k.prazo?crDias(b.pz,k.prazo):0,st=k.feita?'feito':tkStCls(tkLista(t,k)),marco=!k.inicio||k.dur===0;
      esq+=`<div class="cr-l ${sub?'sub':''} ${k.feita?'feito':''}" data-a="tk-abrir" data-id="${t.id}" data-tk="${k.id}" tabindex="0" role="button" title="${esc(k.codigo)}">${tkAnel(t,k)}<span class="cr-tit">${escT(k.titulo)}</span>
        <span class="cr-av">${k.resp?av(k.resp,'sm'):''}</span><span class="cr-c">${k.prazo?(marco?'marco':(k.dur||crDur(k.inicio,k.prazo))+' d'):'—'}</span></div>`;
      const ry=yy+17;yy+=H;const pg=crProg(t,k),xb=k.prazo?(marco?x(k.prazo)+W/2-7:x(k.inicio)):null,wb=marco?14:k.prazo?(crDias(k.inicio,k.prazo)+1)*W:0;
      if(xb!=null)pos.set(k.id,{y:ry,x0:xb,x1:xb+wb});
      const atrD=tkAtras(k)?crDias(k.prazo,HOJE):0,chip=dv>0?`<b class="cr-atr" style="left:${xb+wb+8}px" title="Prazo ${dv} dia${dv>1?'s':''} depois da linha de base">+${dv} d</b>`:atrD>0?`<b class="cr-atr" style="left:${xb+wb+8}px" title="Prazo vencido há ${atrD} dia${atrD>1?'s':''}">${atrD} d de atraso</b>`:'';
      linhas+=`<div class="cr-row">${b?`<i class="cr-base" style="left:${x(b.ini)}px;width:${(crDias(b.ini,b.pz)+1)*W}px" title="Linha de base: ${fd(b.ini)} – ${fd(b.pz)}"></i>`:''}
        ${xb==null?'':marco?`<span class="cr-marco st-${st} ${k.feita?'feita':atrD?'atras':''}" data-a="tk-abrir" data-id="${t.id}" data-tk="${k.id}" data-crw="${W}" style="left:${xb}px" title="${esc(k.titulo)}: ${fd(k.prazo)}"></span>`
          :`<span class="cr-bar st-${st} ${k.feita?'feita':atrD?'atras':''} ${dv>0?'desvio':''}" data-a="tk-abrir" data-id="${t.id}" data-tk="${k.id}" data-crw="${W}" style="left:${xb}px;width:${wb}px" title="${esc(k.titulo)}: ${fd(k.inicio)} – ${fd(k.prazo)} · ${pg}% feito${dv?` · ${dv>0?'+':''}${dv} d da base`:''}${!k.feita&&vzEdita(t,k)?' · arraste para mudar as datas':''}"><i style="width:${pg}%"></i>${!k.feita&&vzEdita(t,k)?'<b class="cr-puxa" title="Arraste para mudar o prazo"></b>':''}</span>`}${chip}</div>`;
      crPreds(k).forEach(v=>setas.push({de:v.id,para:k.id,tipo:v.tipo}))})});
  /* setas: saem da ponta da predecessora (o fim; o início em II/IT), descem e entram pela ponta certa da tarefa (o início; o fim em TT/IT) */
  const svg=setas.map(({de,para,tipo})=>{const a=pos.get(de),c=pos.get(para);if(!a||!c)return '';
    const sx=tipo==='II'||tipo==='IT'?a.x0:a.x1,fim=tipo==='TT'||tipo==='IT',ex=fim?c.x1:c.x0,sy=a.y,ey=c.y,bs=ex+(fim?7:-7);
    const mx=fim?Math.max(sx+8,ex+12):sx+8,dir=fim||ex-8>=mx,dd=dir?`M${sx} ${sy} H${mx} V${ey} H${bs}`:`M${sx} ${sy} H${mx} V${ey>sy?ey-20:ey+20} H${ex-14} V${ey} H${bs}`;
    return `<path d="${dd}"/><path class="cr-pt" d="M${ex} ${ey} L${bs} ${ey-4} L${bs} ${ey+4} Z"/>`}).join('');
  return barra+`<div class="cr-g"><div class="cr-esq"><div class="cr-eh"><span class="cr-tit">Tarefa</span><span class="cr-av"></span><span class="cr-c">Duração</span></div>${esq}</div>
    <div class="cr-tl" data-hoje="${Math.max(0,x(HOJE)-({dia:10,semana:28,mes:60})[esc0]*W)}"><div class="cr-tlin" style="width:${nd*W}px"><div class="cr-tlh">${cab}</div><div class="cr-corpo">${fundo}<svg class="cr-setas" width="${nd*W}" height="${yy}" aria-hidden="true">${svg}</svg>${linhas}</div></div></div></div>
    <div class="cr-leg faint">${crUteis()?'Dias úteis':'Dias corridos'} · predecessoras TI término-início, II início-início, TT término-término, IT início-término</div>`}
function crProg(t,k){if(k.feita)return 100;const its=(k.checklists||[]).flatMap(c=>c.itens),ss=(t.tarefas||[]).filter(x=>x.mae===k.id&&!x.arq),n=its.length+ss.length;return n?Math.round(100*(its.filter(i=>i.feito).length+ss.filter(x=>x.feita).length)/n):0}
const crOrdem=(a,b)=>String(a.k.inicio||a.k.prazo||'9').localeCompare(String(b.k.inicio||b.k.prazo||'9'))||String(a.k.codigo).localeCompare(b.k.codigo);
/* faixa da linha de base no cronograma do terreno */
function crBaseBarra(t){const a=crLbAprov(t),p=crLbPend(t),eu=me(),ed=tkEd(),pode=p&&crAprova(eu,p.por)&&ed;
  const atr=(t.tarefas||[]).filter(k=>!k.arq&&crBase(t,k)&&k.prazo&&k.prazo>crBase(t,k).pz).length;
  const quando=a?`Aprovada por ${a.decPor} em ${fd(a.decEm.slice(0,10))}`:'';
  return `<span class="cr-lbb">${a?`<span class="chip ${atr?'warn':'good'}" title="${esc(quando)}">Linha de base ${a.n}</span><span class="faint">${atr?`${atr} tarefa${atr>1?'s':''} depois da base`:'em dia com a base'}</span>`:'<span class="faint">Sem linha de base</span>'}
    ${p?`<span class="chip warn" title="Pedido por ${esc(p.por)}${p.motivo?`: ${esc(p.motivo)}`:''}">Aguardando aprovação</span>`:''}
    ${pode?`<button class="btn sm" data-a="cr-lb-aprovar" data-id="${t.id}">${ic('check',16)}Aprovar</button><button class="btn sm text" data-a="cr-lb-recusar" data-id="${t.id}">Recusar</button>`:''}
    ${p&&p.por===eu&&!pode?`<button class="btn sm text" data-a="cr-lb-desistir" data-id="${t.id}">Cancelar pedido</button>`:''}
    ${crLbs(t).length?`<button class="btn sm text" data-a="cr-lb-hist" data-id="${t.id}">Histórico (${crLbs(t).length})</button>`:''}
    ${ed&&!p?`<button class="btn sm cr-lbenv" data-a="cr-lb-enviar" data-id="${t.id}">${ic('escudo',18)}${a?(crAprova(eu,eu)?'Nova linha de base':'Pedir nova linha de base'):(crAprova(eu,eu)?'Aprovar linha de base':'Enviar linha de base')}</button>`:''}</span>`}
/* a linha do tempo abre perto de hoje */
const crRolar=()=>setTimeout(()=>document.querySelectorAll('.cr-tl[data-hoje]:not([data-rolou])').forEach(el=>{el.scrollLeft=Number(el.dataset.hoje);el.dataset.rolou=1}),0);
function crFichaHtml(t){crRolar();const its=vzTarefas(t).filter(k=>!k.arq).map(k=>({k,t})).sort(crOrdem);return crGantt([{itens:its}],{ficha:t})}
function crPaginaHtml(lista){crRolar();const agr=UI.crAgr,por=new Map();
  lista.forEach(x=>{const ch=agr==='resp'?'r:'+(x.k.resp||''):agr==='nenhum'?'':'t:'+x.t.id;if(!por.has(ch))por.set(ch,[]);por.get(ch).push(x)});
  const gs=[...por.entries()].map(([ch,its])=>({chave:ch,titulo:agr==='nenhum'?null:agr==='resp'?esc(its[0].k.resp||'Sem responsável'):`${its[0].t.codigo} · ${esc(its[0].t.nome)}`,itens:its.sort(crOrdem)}));
  if(agr==='resp')gs.sort((a,b)=>a.chave.localeCompare(b.chave));
  return crGantt(gs)}

/* ---------- modelos de tarefas ---------- */
const crModelos=()=>S.modelos||(S.modelos=[]);
const crVisiveis=()=>crModelos().filter(m=>m.ativo!==false&&(!m.dono||m.dono===me()));
const crEditaModelo=m=>m&&(m.dono?m.dono===me()&&tkEd():ehAdmin(me()));
const RESP_OBJ='@terreno';
function crModeloPadrao(){const id=()=>uid(),a=id(),b=id(),c=id(),d=id(),e=id(),f=id();
  return {id:'mod-aquisicao',nome:'Aquisição de terreno',dono:null,padrao:true,ativo:true,tarefas:[
    {id:a,titulo:'Pedir matrícula atualizada',lista:'Fazer',prio:'alta',iniD:0,dur:3,resp:RESP_OBJ,pessoas:[{papel:'aprov',user:'Ana Prado'}],etq:[],cks:[{nome:'Cartório',itens:['Pedir certidão de matrícula','Conferir ônus e averbações']}],preds:[]},
    {id:b,titulo:'Consultar zoneamento e parâmetros',lista:'Fazer',prio:'media',iniD:0,dur:2,resp:RESP_OBJ,pessoas:[],etq:['et5'],cks:[],preds:[]},
    {id:c,titulo:'Análise jurídica da matrícula',lista:'Backlog',prio:'alta',iniD:0,dur:5,resp:'Camila Torres',pessoas:[{papel:'aprov',user:'Ana Prado'}],etq:['et2'],cks:[],preds:[{id:a,tipo:'TI',def:0}]},
    {id:d,titulo:'Estudo de massa',lista:'Backlog',prio:'media',iniD:0,dur:5,resp:RESP_OBJ,pessoas:[],etq:['et5'],cks:[],preds:[{id:b,tipo:'TI',def:0}]},
    {id:e,titulo:'Estudo de viabilidade',lista:'Backlog',prio:'media',iniD:0,dur:3,resp:RESP_OBJ,pessoas:[{papel:'aprov',user:'Moisés'}],etq:['et4'],cks:[],preds:[{id:d,tipo:'TI',def:0}]},
    {id:f,titulo:'Levar ao comitê',lista:'Backlog',prio:'alta',iniD:0,dur:1,resp:RESP_OBJ,pessoas:[{papel:'aprov',user:'Moisés'},{papel:'acomp',user:RESP_OBJ}],etq:[],cks:[{nome:'Pauta',itens:['Matrícula sem impedimento','Viabilidade com margem acima da mínima']}],preds:[{id:c,tipo:'TI',def:0},{id:e,tipo:'TI',def:0}]}]}}
function crPrep(){if(!S.modelos){S.modelos=[crModeloPadrao()]}S.terrenos.forEach(crIniciar);
  // exemplo: o modelo da empresa aplicado no primeiro terreno há 12 dias, com a linha de base aprovada e um atraso depois dela
  const t=S.terrenos[0];if(t&&!S.crExemplo){S.crExemplo=true;crAplicar(t,crModelos()[0],addD(HOJE,-7));const b={id:uid(),n:null,sit:'pendente',motivo:null,por:t.resp||'Rafael Souza',em:addD(HOJE,-12)+'T09:00:00',itens:{}};
    t.tarefas.filter(k=>!k.arq&&k.inicio&&k.prazo).forEach(k=>b.itens[k.id]={ini:k.inicio,pz:k.prazo,dur:k.dur});crLbs(t).push(b);crAprovar(t,b);b.decPor='Ana Prado';b.decEm=addD(HOJE,-11)+'T15:20:00';
    ['Pedir matrícula atualizada','Consultar zoneamento e parâmetros'].forEach(n=>{const k=t.tarefas.find(x=>x.titulo===n);if(k){k.lista=tkPrim(t,'conclui').id;k.feita=k.prazo;k.feitaPor=k.resp}});
    const k=t.tarefas.find(x=>x.titulo==='Análise jurídica da matrícula');if(k)crEditar(t,k,'dur',8);
    // em andamento e esperando terceiro, para o cronograma mostrar as cores das listas
    [['Estudo de massa','Fazendo'],['Análise jurídica da matrícula','Aguardando retorno']].forEach(([n,ln])=>{const x=t.tarefas.find(y=>y.titulo===n),l=tkL(t).find(y=>y.nome===ln);if(x&&l)x.lista=l.id})}}
/* aplica o modelo no quadro do terreno, a partir da data */
function crAplicar(t,m,data){const mapa={},resp=u=>u===RESP_OBJ?t.resp||null:u||null;
  m.tarefas.forEach(x=>{const l=tkL(t).find(y=>y.nome===x.lista&&!y.oculta)||tkPrim(t,'aberta');
    const k=tkCriar(t,{titulo:x.titulo,resp:resp(x.resp),prio:x.prio,lista:l.id,vis:x.vis||'publico'});
    if(x.iniD!=null){k.inicio=k.iniMin=crSomar(data,x.iniD);k.dur=x.dur||1;k.prazo=crSomar(k.inicio,k.dur-1)}
    (x.pessoas||[]).forEach(p=>{const u=resp(p.user);if(u&&!(k[p.papel]||[]).includes(u))k[p.papel]=[...(k[p.papel]||[]),u]});
    k.apModo=x.apModo||'paralelo';k.etq=(x.etq||[]).filter(id=>S.etiquetas.some(e=>e.id===id));k.checklists=(x.cks||[]).map(c=>({id:uid(),nome:c.nome,esconder:false,itens:c.itens.map(s=>({id:uid(),texto:s,resp:null,prazo:null,feito:null}))}));
    mapa[x.id]=k});
  m.tarefas.forEach(x=>{mapa[x.id].preds=(x.preds||[]).filter(v=>mapa[v.id]).map(v=>({id:mapa[v.id].id,tipo:v.tipo,def:v.def||0}))});
  crCascata(t);log(t,`Modelo "${m.nome}" aplicado: ${m.tarefas.length} tarefas`);return m.tarefas.length}
function crAplicarPadrao(t){const m=crModelos().find(x=>x.padrao&&x.ativo!==false&&!x.dono);if(m&&m.tarefas.length)crAplicar(t,m,HOJE)}
function crSalvarQuadro(t,nome,daEmpresa){const ks=vzTarefas(t).filter(k=>!k.arq&&!k.feita),base=ks.map(k=>k.inicio).filter(Boolean).sort()[0],mapa={};
  const m={id:uid(),nome,dono:daEmpresa?null:me(),padrao:false,ativo:true,tarefas:[]};
  ks.forEach(k=>{const x={id:uid(),titulo:k.titulo,lista:tkLista(t,k).nome,prio:k.prio,iniD:k.inicio&&base?crDias(base,k.inicio):null,dur:k.dur||null,
    resp:k.resp&&k.resp===t.resp?RESP_OBJ:k.resp,pessoas:PAPEIS_TK.flatMap(([p])=>(k[p]||[]).map(u=>({papel:p,user:u===t.resp?RESP_OBJ:u}))),etq:[...(k.etq||[])],
    cks:(k.checklists||[]).map(c=>({nome:c.nome,itens:c.itens.map(i=>i.texto)})),apModo:k.apModo||'paralelo',vis:vzVis(k),preds:[]};mapa[k.id]=x;m.tarefas.push(x)});
  ks.forEach(k=>{mapa[k.id].preds=crPreds(k).filter(v=>mapa[v.id]).map(v=>({id:mapa[v.id].id,tipo:v.tipo,def:v.def||0}))});
  crModelos().push(m);return m}
const crPessoaOpts=(v,vazio)=>`<option value="">${vazio}</option><option value="${RESP_OBJ}" ${v===RESP_OBJ?'selected':''}>Responsável do terreno</option>${USERS.map(u=>`<option ${u===v?'selected':''}>${esc(u)}</option>`).join('')}`;
/* janela: aplicar um modelo, salvar o quadro como modelo e editar os próprios */
function crModelosHtml(fechar){const t=T(UI.crMod?.tid),ms=crVisiveis(),adm=ehAdmin(me());if(!t)return '';
  return `<div class="dh"><div><h2>Modelos de tarefas</h2><div class="muted" style="margin-top:4px">${t.codigo} · ${esc(t.nome)}</div></div>${fechar}</div>
  <div class="cr-ms">${ms.map(m=>`<div class="cr-m"><div class="cr-mt"><b>${esc(m.nome)}</b><span class="faint">${m.dono?'Seu':'Da empresa'}${m.padrao?' · entra em todo terreno novo':''} · ${m.tarefas.length} tarefa${m.tarefas.length===1?'':'s'}</span></div>
      ${crEditaModelo(m)?`<button class="btn sm text" data-a="cr-mod-editar" data-v="${m.id}">Editar</button>`:''}<button class="btn sm" data-a="cr-mod-aplicar" data-v="${m.id}">Aplicar</button></div>`).join('')||'<div class="faint">Nenhum modelo ainda.</div>'}</div>
  <div class="field" style="max-width:240px;margin-top:12px"><label for="cr-data">Começar em</label><input id="cr-data" type="date" value="${UI.crMod.data||HOJE}"></div>
  <h3 class="cr-h3">Salvar este quadro como modelo</h3>
  <form class="tkm-nf" data-form="cr-mod-salvar"><input name="nome" required placeholder="Nome do modelo" aria-label="Nome do modelo">${adm?`<label class="fchk"><input type="checkbox" name="emp">${ic('check',16)}Da empresa</label>`:''}<button class="btn tonal sm" type="submit">Salvar modelo</button></form>
  <p class="faint" style="margin:8px 0 0">Guarda os cartões abertos com lista, prazos relativos, pessoas, etiquetas, checklists e predecessoras. ${adm?'O da empresa todos veem; o seu, só você.':'O modelo fica só para você; os da empresa, só o administrador cria.'}</p>`}
function crModEdHtml(fechar){const m=crModelos().find(x=>x.id===UI.crModEd);if(!m)return '';const ed=crEditaModelo(m),dis=ed?'':'disabled',L=(S.listasModelo||[]).filter(l=>l.ativo);
  const nomeT=id=>m.tarefas.find(x=>x.id===id)?.titulo||'—';
  return `<div class="dh"><div><h2><input class="cr-mnome" value="${esc(m.nome)}" data-crm="nome" ${dis} aria-label="Nome do modelo"></h2><div class="muted" style="margin-top:4px">${m.dono?'Modelo seu':'Modelo da empresa'} · prazos contados a partir da data em que o modelo é aplicado</div></div>${fechar}</div>
  <div class="cr-me">${m.tarefas.map((x,i)=>`<div class="cr-mr" data-mt="${x.id}">
    <div class="cr-mr1"><span class="cr-mi num">${i+1}</span><input value="${esc(x.titulo)}" data-crm="titulo" ${dis} aria-label="Título da tarefa ${i+1}">${ed?`<button class="iconbtn sm" data-a="cr-mt-x" data-v="${x.id}" aria-label="Tirar ${esc(x.titulo)}" title="Tirar">${ic('close',16)}</button>`:''}</div>
    <div class="cr-mr2">
      <label>Lista<select data-crm="lista" ${dis}>${L.map(l=>`<option ${l.nome===x.lista?'selected':''}>${esc(l.nome)}</option>`).join('')}</select></label>
      <label>Começa (dias)<input type="number" min="0" value="${x.iniD??''}" data-crm="iniD" ${dis} placeholder="—"></label>
      <label>Duração<input type="number" min="1" value="${x.dur??''}" data-crm="dur" ${dis} placeholder="—"></label>
      <label>Responsável<select data-crm="resp" ${dis}>${crPessoaOpts(x.resp,'Sem responsável')}</select></label>
      <label>Visibilidade<select data-crm="vis" ${dis}>${Object.entries(VZ_N).map(([v,n])=>`<option value="${v}" ${(x.vis||'publico')===v?'selected':''}>${n}</option>`).join('')}</select></label>
      <label>Aprovador<select data-crm="aprov" ${dis}>${crPessoaOpts((x.pessoas||[]).find(p=>p.papel==='aprov')?.user,'Nenhum')}</select></label>
      <label>Depois de<select data-crm="pred" ${dis}><option value="">Nenhuma</option>${m.tarefas.filter(y=>y.id!==x.id).map(y=>`<option value="${y.id}" ${(x.preds||[])[0]?.id===y.id?'selected':''}>${esc(y.titulo)}</option>`).join('')}</select></label>
      <label>Vínculo<select data-crm="tipo" ${dis||((x.preds||[]).length?'':'disabled')}>${Object.keys(CR_TIPOS).map(k=>`<option ${(x.preds||[])[0]?.tipo===k?'selected':''}>${k}</option>`).join('')}</select></label>
    </div>${(x.preds||[]).length>1?`<div class="faint">Também depois de: ${x.preds.slice(1).map(v=>esc(nomeT(v.id))).join(', ')}</div>`:''}</div>`).join('')}</div>
  ${ed?`<form class="tkm-nf" data-form="cr-mt-novo" style="margin-top:12px"><input name="titulo" required placeholder="Nova tarefa do modelo" aria-label="Nova tarefa do modelo"><button class="btn tonal sm" type="submit">Adicionar</button></form>`:''}
  <div class="df"><button class="btn text" data-a="close">Fechar</button>${ed?`<button class="btn text" data-a="cr-mod-desativar" data-v="${m.id}">${m.padrao?'':'Desativar modelo'}</button>`:''}</div>`}
function crHistHtml(fechar){const t=T(UI.crHist);if(!t)return '';const SIT={pendente:'Aguardando aprovação',aprovada:'Aprovada (vale agora)',recusada:'Recusada',substituida:'Substituída',cancelada:'Cancelada'};
  return `<div class="dh"><h2>Linhas de base</h2>${fechar}</div><div class="cr-hist">${crLbs(t).slice().reverse().map(b=>`<div class="cr-hr"><div><b>${b.n?'Linha de base '+b.n:'Pedido'}</b> · <span class="chip ${b.sit==='aprovada'?'good':b.sit==='pendente'?'warn':''}">${SIT[b.sit]}</span></div>
    <div class="faint">Pedida por ${esc(b.por)} em ${fd(b.em.slice(0,10))}${b.motivo?` · ${esc(b.motivo)}`:''}${b.decPor?` · decidida por ${esc(b.decPor)} em ${fd(b.decEm.slice(0,10))}`:''}${b.decMotivo?` · ${esc(b.decMotivo)}`:''} · ${Object.keys(b.itens).length} tarefas</div></div>`).join('')}</div>`}
function crMotivoHtml(fechar){const m=UI.crMotivo;if(!m)return '';const t=T(m.tid);
  return `<div class="dh"><h2>${m.acao==='recusar'?'Recusar o cronograma':'Por que a linha de base muda?'}</h2>${fechar}</div>
  <form data-form="cr-motivo"><div class="field full"><label for="cr-mot">${m.acao==='recusar'?'Motivo (opcional)':'Motivo'}</label><textarea id="cr-mot" name="motivo" ${m.acao==='recusar'?'':'required'} placeholder="${m.acao==='recusar'?'O que precisa mudar':'Ex.: cartório pediu mais 15 dias'}"></textarea></div>
  <div class="df"><button class="btn text" type="button" data-a="close">Cancelar</button><button class="btn primary" type="submit">${m.acao==='recusar'?'Recusar':crAprova(me(),me())?'Aprovar nova linha de base':'Enviar para aprovação'}</button></div></form>`}
function cronoModal(M,fechar){if(M==='cr-modelos')return crModelosHtml(fechar);if(M==='cr-modelo-ed')return crModEdHtml(fechar);if(M==='cr-hist')return crHistHtml(fechar);if(M==='cr-motivo')return crMotivoHtml(fechar);return ''}
/* Configurações › Tarefas: calendário e modelos da empresa */
function crCfgHtml(){const ms=crModelos().filter(m=>!m.dono);
  return `<section class="sec"><div class="sec-h"><h2>Calendário do cronograma</h2></div><div class="sec-b"><div class="seg" role="group" aria-label="Contagem dos prazos">${[[false,'Dias corridos'],[true,'Dias úteis']].map(([v,n])=>`<button data-a="cr-cal" data-v="${v}" aria-pressed="${crUteis()===v}">${n}</button>`).join('')}</div>
    <p class="faint" style="margin:8px 0 0">Dias úteis pulam sábado, domingo e feriados nacionais (com Carnaval e Corpus Christi).</p></div></section>
  <section class="sec"><div class="sec-h"><h2>Modelos de tarefas da empresa</h2><button class="btn text sm" data-a="cr-mod-novo">${ic('add',16)}Novo modelo</button></div><div class="sec-b">
    ${ms.map(m=>`<div class="cr-m ${m.ativo===false?'oculta':''}"><div class="cr-mt"><b>${esc(m.nome)}</b><span class="faint">${m.tarefas.length} tarefa${m.tarefas.length===1?'':'s'}${m.ativo===false?' · desativado':''}</span></div>
      ${m.ativo!==false?`<label class="fchk"><input type="radio" name="cr-padrao" data-a="cr-padrao" data-v="${m.id}" ${m.padrao?'checked':''}>${ic('check',16)}Entra em todo terreno novo</label>`:''}
      <button class="btn sm text" data-a="cr-mod-editar" data-v="${m.id}">Editar</button>${m.ativo===false?`<button class="btn sm text" data-a="cr-mod-reativar" data-v="${m.id}">Reativar</button>`:''}</div>`).join('')||'<div class="faint">Nenhum modelo da empresa.</div>'}
    ${ms.some(m=>m.padrao)?`<button class="btn sm text" data-a="cr-padrao" data-v="" style="margin-top:8px">Nenhum modelo entra sozinho</button>`:''}</div></section>`}

/* ---------- eventos ---------- */
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="cr-"]');if(!a)return;const A=a.dataset.a;if(A==='cr-padrao'&&a.type==='radio'){}else e.preventDefault();e.stopImmediatePropagation();
  const id=a.dataset.id,t=id?T(id):null;
  switch(A){
    case 'cr-gr':UI.crFech[a.dataset.v]=!UI.crFech[a.dataset.v];render();return;
    case 'cr-hoje':{const tl=a.closest('.tk-sec,.cr-sec,.sec,main')?.querySelector('.cr-tl')||document.querySelector('.cr-tl');if(tl){tl.dataset.rolou='';tl.scrollTo({left:Number(tl.dataset.hoje),behavior:'smooth'})}return}
    case 'cr-vista':{const tt=T(a.dataset.id);UI.crVista[tt.id]=a.dataset.v;render();return}
    case 'cr-pred-novo':UI.crPredNovo=true;tkRe();return;
    case 'cr-pred-cancela':UI.crPredNovo=false;tkRe();return;
    case 'cr-pred-x':{const {t,k}=tkAtual();const v=crPreds(k).splice(Number(a.dataset.i),1)[0];crPosicionar(t,k);crCascata(t);log(t,`Tarefa "${k.titulo}": predecessora tirada`);tkRe();return}
    case 'cr-av-esticar':{const {t,k}=tkAcha(UI.crAviso.tid,UI.crAviso.kid),p=t.tarefas.find(x=>x.id===UI.crAviso.pid);UI.crAviso=null;crEditar(t,k,'dur',p.dur);UI.crAviso=null;toast(`Duração esticada para ${p.dur} dias.`);tkRe();return}
    case 'cr-av-adiar':{const v=UI.crAviso,{k}=tkAcha(v.tid,v.kid),p=T(v.tid).tarefas.find(x=>x.id===v.pid);(UI.crAvisoVisto=UI.crAvisoVisto||[]).push(k.id+'|'+p.id+'|'+k.dur+'|'+p.dur);UI.crAviso=null;tkRe();return}
    case 'cr-lb-enviar':{if(crLbAprov(t)){UI.crMotivo={tid:t.id,acao:'enviar'};UI.modal='cr-motivo';renderModal();return}crEnviar(t,null);break}
    case 'cr-lb-aprovar':{const p=crLbPend(t);crAprovar(t,p);if(p.por!==me())notificar(p.por,'tarefa_atribuida',`${me()} aprovou o cronograma de ${t.codigo}`,t,null,{b:'tarefas'});toast(`Linha de base ${p.n} aprovada.`);break}
    case 'cr-lb-recusar':UI.crMotivo={tid:t.id,acao:'recusar'};UI.modal='cr-motivo';renderModal();return;
    case 'cr-lb-desistir':{const p=crLbPend(t);p.sit='cancelada';p.decPor=me();p.decEm=agora();toast('Pedido cancelado.');break}
    case 'cr-lb-hist':UI.crHist=t.id;UI.modal='cr-hist';renderModal();return;
    case 'cr-modelos':UI.crMod={tid:a.dataset.id,data:HOJE};UI.modal='cr-modelos';renderModal();return;
    case 'cr-mod-aplicar':{const tt=T(UI.crMod.tid),m=crModelos().find(x=>x.id===a.dataset.v),d=document.getElementById('cr-data')?.value||HOJE;const n=crAplicar(tt,m,d);UI.modal=null;toast(`${n} tarefa${n===1?'':'s'} criada${n===1?'':'s'} pelo modelo ${m.nome}.`);save();render();renderModal();return}
    case 'cr-mod-editar':UI.crModEd=a.dataset.v;UI.modal='cr-modelo-ed';renderModal();return;
    case 'cr-mod-novo':{const m={id:uid(),nome:'Novo modelo',dono:null,padrao:false,ativo:true,tarefas:[]};crModelos().push(m);UI.crModEd=m.id;UI.modal='cr-modelo-ed';save();renderModal();return}
    case 'cr-mod-desativar':{const m=crModelos().find(x=>x.id===a.dataset.v);m.ativo=false;m.padrao=false;UI.modal=null;toast('Modelo desativado.');save();render();renderModal();return}
    case 'cr-mod-reativar':{crModelos().find(x=>x.id===a.dataset.v).ativo=true;break}
    case 'cr-mt-x':{const m=crModelos().find(x=>x.id===UI.crModEd);m.tarefas=m.tarefas.filter(x=>x.id!==a.dataset.v);m.tarefas.forEach(x=>x.preds=(x.preds||[]).filter(v=>v.id!==a.dataset.v));save();renderModal();return}
    case 'cr-padrao':{crModelos().forEach(m=>{if(!m.dono)m.padrao=m.id===a.dataset.v});toast(a.dataset.v?'Esse modelo entra em todo terreno novo.':'Nenhum modelo entra sozinho nos terrenos novos.');break}
    case 'cr-cal':S.calUteis=a.dataset.v==='true';S.terrenos.forEach(tt=>{(tt.tarefas||[]).forEach(k=>{if(k.inicio&&k.prazo)k.prazo=crSomar(k.inicio,(k.dur||1)-1)});crCascata(tt)});toast(S.calUteis?'Prazos em dias úteis.':'Prazos em dias corridos.');break;
  }save();render()},true);
document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset?.crg){e.stopImmediatePropagation();if(el.dataset.crg==='esc')UI.crEsc=el.value;else UI.crAgr=el.value;render();return}
  if(el.dataset?.crm){e.stopImmediatePropagation();const m=crModelos().find(x=>x.id===UI.crModEd);if(!crEditaModelo(m))return;const c=el.dataset.crm,v=el.value;
    if(c==='nome'){m.nome=v.trim()||m.nome}else{const x=m.tarefas.find(y=>y.id===el.closest('[data-mt]').dataset.mt);
      if(c==='titulo')x.titulo=v.trim()||x.titulo;else if(c==='lista')x.lista=v;else if(c==='iniD')x.iniD=v===''?null:Math.max(0,parseInt(v,10)||0);else if(c==='dur')x.dur=v===''?null:Math.max(1,parseInt(v,10)||1);
      else if(c==='resp')x.resp=v||null;else if(c==='vis')x.vis=v;else if(c==='aprov'){x.pessoas=(x.pessoas||[]).filter(p=>p.papel!=='aprov');if(v)x.pessoas.push({papel:'aprov',user:v})}
      else if(c==='pred'){const resto=(x.preds||[]).slice(1);x.preds=v?[{id:v,tipo:(x.preds||[])[0]?.tipo||'TI',def:0},...resto.filter(r=>r.id!==v)]:resto;
        const ciclo=(ini,alvo,n=0)=>n<50&&m.tarefas.find(y=>y.id===ini)?.preds?.some(p=>p.id===alvo||ciclo(p.id,alvo,n+1));if(v&&ciclo(v,x.id)){x.preds=resto;toast('Esse vínculo fecharia um círculo.',true)}}
      else if(c==='tipo'&&x.preds?.[0])x.preds[0].tipo=v}
    save();setTimeout(renderModal,0);return}
  const c=el.dataset?.tkc;if(!c||!['dur','pred-tipo','pred-def'].includes(c))return;e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k)return;
  if(c==='dur')crEditar(t,k,'dur',el.value);
  else{const v=crPreds(k)[Number(el.dataset.i)];if(c==='pred-tipo')v.tipo=el.value;else v.def=parseInt(el.value,10)||0;crPosicionar(t,k);crCascata(t);crAvisoII(t,k);log(t,`Tarefa "${k.titulo}": vínculo ${v.tipo}${v.def?' '+v.def+' d':''}`)}
  save();setTimeout(tkRe,0)},true);
document.addEventListener('submit',e=>{const f=e.target,n=f.dataset?.form;if(!n||!n.startsWith('cr-'))return;e.preventDefault();e.stopImmediatePropagation();const F=Object.fromEntries(new FormData(f));
  if(n==='cr-pred'){const {t,k}=tkAtual();if(!F.id)return;const ciclo=(ini,n=0)=>n<200&&crPreds(t.tarefas.find(x=>x.id===ini)||{}).some(v=>v.id===k.id||ciclo(v.id,n+1));
    if(ciclo(F.id)){toast('Esse vínculo fecharia um círculo: a tarefa dependeria dela mesma.',true);return}
    if(crPreds(k).some(v=>v.id===F.id&&v.tipo===F.tipo)){toast('Esse vínculo já existe.',true);return}
    crPreds(k).push({id:F.id,tipo:F.tipo,def:parseInt(F.def,10)||0});if(!k.dur){k.dur=1}crPosicionar(t,k);crCascata(t);crAvisoII(t,k);UI.crPredNovo=false;
    log(t,`Tarefa "${k.titulo}": depois de ${t.tarefas.find(x=>x.id===F.id).codigo} (${F.tipo})`);tkRe();return}
  if(n==='cr-motivo'){const m=UI.crMotivo,t=T(m.tid);if(m.acao==='recusar'){const p=crLbPend(t);p.sit='recusada';p.decPor=me();p.decEm=agora();p.decMotivo=F.motivo?.trim()||null;
      notificar(p.por,'tarefa_atribuida',`${me()} recusou o cronograma de ${t.codigo}${p.decMotivo?': '+p.decMotivo:''}`,t,null,{b:'tarefas'});log(t,'Cronograma recusado');toast('Cronograma recusado.')}
    else crEnviar(t,F.motivo.trim());UI.crMotivo=null;UI.modal=null;save();render();renderModal();return}
  if(n==='cr-mod-salvar'){const t=T(UI.crMod.tid);const m=crSalvarQuadro(t,F.nome.trim(),!!F.emp&&ehAdmin(me()));toast(`Modelo "${m.nome}" salvo com ${m.tarefas.length} tarefas.`);save();renderModal();return}
  if(n==='cr-mt-novo'){const m=crModelos().find(x=>x.id===UI.crModEd);m.tarefas.push({id:uid(),titulo:F.titulo.trim(),lista:'Fazer',prio:'media',iniD:0,dur:1,resp:RESP_OBJ,pessoas:[],etq:[],cks:[],preds:[]});save();renderModal();return}
},true);
crPrep();

/* arrastar a barra (30/out): a barra inteira anda (muda o início e mantém a duração, como mudar só o início no cartão);
   a ponta direita estica ou encolhe (muda o prazo); o marco anda pelo prazo. Sucessoras andam em cascata; concluída não se move.
   Só com mouse: no toque, a barra abre o cartão e o arraste fica para a rolagem. */
let crArr=null;
document.addEventListener('pointerdown',e=>{if(e.button!==0||e.pointerType==='touch')return;const el=e.target.closest?.('.cr-bar,.cr-marco');if(!el)return;
  const {t,k}=tkAcha(el.dataset.id,el.dataset.tk);if(!k||k.feita||!vzEdita(t,k))return;
  crArr={el,t,k,x0:e.clientX,w:+el.dataset.crw||26,modo:e.target.closest('.cr-puxa')||!k.inicio?'prazo':'mover',l0:el.offsetLeft,wd0:el.offsetWidth,dias:0,andou:false};
  el.setPointerCapture?.(e.pointerId)});
document.addEventListener('pointermove',e=>{const a=crArr;if(!a)return;const dx=e.clientX-a.x0;if(!a.andou&&Math.abs(dx)<4)return;
  if(!a.andou){a.andou=true;a.el.classList.add('arrastando');document.body.classList.add('cr-arrastando')}
  a.dias=Math.round(dx/a.w);
  if(a.modo==='prazo'&&!a.el.classList.contains('cr-marco')){const n=Math.max(a.w,a.wd0+a.dias*a.w);a.dias=Math.round((n-a.wd0)/a.w);a.el.style.width=n+'px'}else a.el.style.left=(a.l0+a.dias*a.w)+'px';
  const d=a.modo==='mover'?addD(a.k.inicio,a.dias):addD(a.k.prazo,a.dias);a.el.dataset.dica=(a.modo==='mover'?'início ':'prazo ')+fd(d)});
document.addEventListener('pointerup',()=>{const a=crArr;crArr=null;if(!a||!a.andou)return;
  a.el.classList.remove('arrastando');document.body.classList.remove('cr-arrastando');
  /* o clique que vem depois do arraste não abre o cartão */
  document.addEventListener('click',ev=>{ev.stopImmediatePropagation();ev.preventDefault()},{capture:true,once:true});
  if(!a.dias){render();return}
  const {t,k}=a,r=a.modo==='mover'?crEditar(t,k,'inicio',addD(k.inicio,a.dias)):crEditar(t,k,'prazo',addD(k.prazo,a.dias));
  if(r===false){render();return}
  toast(`${k.titulo}: ${k.inicio&&k.inicio!==k.prazo?fd(k.inicio)+' – ':''}${fd(k.prazo)}.`);save();render()});
