/* ===================== painel lateral da ficha: Logs / Ações ===================== */
// No banco, quem grava o log é o trigger app.auditoria (toda tabela do terreno) e processo_transicoes.
// No protótipo, audit() compara cada terreno com o retrato anterior a cada save() e registra o que mudou.

const hhmm=s=>s&&s.length>10?s.slice(11,16):'';
const emCompleto=s=>s?(fd(s.slice(0,10))+(s.length>10?' · '+s.slice(11).replace('.',','):'')):'';
const LAB_CAMPO={situacao:'Situação',aDoc:'Área documental',aCad:'Área cadastral',aLev:'Área de levantamento',aEst:'Área estimada',fonteArea:'Fonte da área adotada',testada:'Testada',histUso:'Histórico de uso'};
Object.values(SECOES).forEach(s=>s.campos.forEach(([k,l])=>{LAB_CAMPO[k]=l}));
const SEC_DE={};Object.entries(SECOES).forEach(([id,s])=>s.campos.forEach(([k])=>{SEC_DE[k]=id}));
const TIPO_CAMPO={};Object.values(SECOES).forEach(s=>s.campos.forEach(([k,,tipo,opt])=>{TIPO_CAMPO[k]=[tipo,opt]}));
['aDoc','aCad','aLev','aEst','aConst','aDemolir'].forEach(k=>TIPO_CAMPO[k]=['m2']);TIPO_CAMPO.testada=['m'];
function valTxt(k,v){
  if(v==null||v==='')return 'não informado';
  const [tipo,opt]=TIPO_CAMPO[k]||[];
  if(tipo==='sel'&&OPT[opt])return NI_OPT.has(v)?'não informado':(OPT[opt][v]||v);
  if(tipo==='m2')return m2(v);if(tipo==='m')return num(v,2)+' m';if(tipo==='date')return fd(v);if(tipo==='dec')return num(v,6);if(tipo==='eixo')return eixo(v)||'—';
  if(typeof v==='boolean')return v?'sim':'não';
  const s=String(v);return s.length>60?s.slice(0,57)+'…':s;
}
const ARR_LAB={lotes:['Lote',x=>x.titulo,'o'],partes:['Parte',x=>x.nome],mats:['Matrícula',x=>x.num],insc:['Inscrição imobiliária',x=>x.sql],confr:['Confrontação',x=>x.tipo],dilig:['Diligência',x=>x.titulo],pessoas:['Pessoa',x=>x.nome],
  corretores:['Corretor',x=>(typeof corretor==='function'&&corretor(x.cid)?.nome)||''],ofertas:['Oferta',x=>x.valor!=null?mi(x.valor):''],propostas:['Proposta',x=>'v'+x.v+(x.valor!=null?' · '+mi(x.valor):'')],
  reunioes:['Reunião',x=>fd(x.data)+(x.hora?' '+x.hora:'')],tarefas:['Tarefa',x=>x.titulo],docs:['Documento',x=>(TIPOS_DOC[x.tipo]||[x.nome||x.tipo])[0]],analises:['Análise urbanística',x=>x.fonte||fd(x.data)]};
const ITEM_LAB={titulo:'título',prazo:'prazo',resp:'responsável',status:'status',prio:'prioridade',desc:'descrição',valor:'valor',data:'data',hora:'hora',sit:'situação',area:'área',
  cond:'condições',forma:'forma de pagamento',pessoa:'pessoa principal',tel:'telefone',email:'e-mail',doc:'CPF/CNPJ',obs:'observação',num:'matrícula',cri:'cartório',ins:'SQLs',parte:'parte',fonte:'fonte da área adotada',areaInf:'área informada',criDig:'cartório digitado',partes:'valores por parte',partesForma:'condição por parte',validade:'validade',emitido:'emissão',versoes:'versão',resultado:'resultado',pauta:'pauta',resumo:'resumo',nome:'nome',papel:'papel',principal:'principal'};
const NEG_LAB={etapa:'Etapa',sub:'Subetapa',status:'Status',temp:'Temperatura',retomar:'Retomar em',motivo:'Motivo',detalhe:'Relato',pontos:'Pontos de sucesso',ofRef:'Oferta de referência'};
const NEG_SEM_LOG=['desde','subDesde','encerradoEm','relato'];
let AUD={};
const retrato=t=>{const {hist,relevo,...r}=t;return JSON.stringify(r)};
function audSnap(){AUD={};S.terrenos.forEach(t=>{AUD[t.id]={j:retrato(t),h:(t.hist||[]).length}})}
function diffTerreno(a,b){
  const campos=[],itens=[];
  Object.keys({...a,...b}).forEach(k=>{
    if(['hist','relevo','id','codigo','criFonte','criLoc','pontosExcl','geoArea','topoClass','mats'].includes(k))return;
    const va=a[k],vb=b[k];if(JSON.stringify(va)===JSON.stringify(vb))return;
    /* o pino acompanha a poligonal: a mudança de lugar dele vai junto do ajuste, sem log próprio */
    if(['lat','lng','precisao'].includes(k)&&JSON.stringify(a.poly)!==JSON.stringify(b.poly))return;
    if(k==='poly'){campos.push({k,txt:!vb?'Poligonal removida':va?polyLogTxt(areaPoly(va),areaPoly(vb)):'Poligonal desenhada'});return}
    if(k==='neg'){const na=va||{},nb=vb||{};if(!va&&vb){itens.push('Negociação aberta');return}
      Object.keys({...na,...nb}).forEach(x=>{if(NEG_SEM_LOG.includes(x)||JSON.stringify(na[x])===JSON.stringify(nb[x])||typeof (nb[x]??na[x])==='object'&&x!=='viab')return;
        if(x==='viab'){if(na.viab?.id&&na.viab.id===nb.viab?.id)return;campos.push({k:'neg.viab',txt:nb.viab?`Estudo de viabilidade vinculado: ${nb.viab.nome||''}`:'Estudo de viabilidade desvinculado'});return}
        const f=v=>v==null||v===''?'não informado':x==='etapa'?SN(v):x==='sub'?subN(v):x==='status'?STATUS_N[v]||v:x==='motivo'?motivoN(nb.status,v):x==='retomar'?fd(v):x==='temp'?v+'/5':String(v);
        campos.push({k:'neg.'+x,txt:`${NEG_LAB[x]||x}: ${f(na[x])} → ${f(nb[x])}`})});return}
    if(k==='infra'){Object.keys({...va,...vb}).forEach(x=>{const ra=va?.[x]||{},rb=vb?.[x]||{},n=(INFRA.find(i=>i[0]===x)||[,x])[1];
      if((ra.d||'nao_verificado')!==(rb.d||'nao_verificado'))campos.push({k:'infra.'+x,txt:`Visita técnica · ${n}: ${VT_N[ra.d||'nao_verificado']} → ${VT_N[rb.d||'nao_verificado']}`});
      if((ra.obs||'')!==(rb.obs||''))campos.push({k:'infra.'+x+'.obs',txt:`Visita técnica · ${n}, observação: ${ra.obs||'vazia'} → ${rb.obs||'vazia'}`})});return}
    if(k==='vtec'){Object.keys({...va,...vb}).forEach(x=>{const ra=va?.[x]||{},rb=vb?.[x]||{},n=(VTEC.find(i=>i[0]===x)||[,x])[1],L={conc:'concessionária',sol:'pedida em',emi:'emitida em',val:'validade',cond:'condições'};
      if((ra.s||'nao_solicitada')!==(rb.s||'nao_solicitada'))campos.push({k:'vtec.'+x,txt:`Viabilidade técnica · ${n}: ${VTEC_N[ra.s||'nao_solicitada']} → ${VTEC_N[rb.s||'nao_solicitada']}`});
      Object.keys(L).forEach(c=>{if((ra[c]||'')===(rb[c]||''))return;const f=v=>!v?'vazio':['sol','emi','val'].includes(c)?fd(v):v;campos.push({k:'vtec.'+x+'.'+c,txt:`Viabilidade técnica · ${n}, ${L[c]}: ${f(ra[c])} → ${f(rb[c])}`})})});return}
    if(Array.isArray(va)||Array.isArray(vb)){const [lab,desc,g='a']=ARR_LAB[k]||[k,()=>''];const A=va||[],B=vb||[];
      /* a parte da inscrição vem do lote (derivada): não vira log */
      const sem=k==='insc'?['parte','id','solto']:k==='partes'?['neg','propostas']:[];
      const chave=(x,i)=>x&&x.id!=null?'id:'+x.id:x&&x.v!=null?'v:'+x.v:'i:'+i;
      const mA=new Map(A.map((x,i)=>[chave(x,i),x])),mB=new Map(B.map((x,i)=>[chave(x,i),x]));
      mB.forEach((x,c)=>{const d=desc(x)||'';if(!mA.has(c))itens.push(`${lab} adicionad${g}${d?': '+d:''}`);else if(JSON.stringify(mA.get(c))!==JSON.stringify(x)){const o=mA.get(c);const ks=Object.keys({...o,...x}).filter(q=>!sem.includes(q)&&JSON.stringify(o[q])!==JSON.stringify(x[q])).map(q=>ITEM_LAB[q]||q);if(ks.length)itens.push(`${lab} alterad${g}${d?' ('+d+')':''}: ${ks.join(', ')}`)}});
      mA.forEach((x,c)=>{if(!mB.has(c)){const d=desc(x)||'';itens.push(`${lab} removid${g}${d?': '+d:''}`)}});return}
    if(typeof (vb??va)==='object')return;
    if(valTxt(k,va)!==valTxt(k,vb))campos.push({k,txt:`${LAB_CAMPO[k]||k}: ${valTxt(k,va)} → ${valTxt(k,vb)}`});
  });
  return {campos,itens};
}
/* Cliques seguidos no mesmo campo (temperatura 2 → 3 → 4) viram um log só, como app.juntar_auditoria no banco:
   se o log anterior é do mesmo usuário, nos mesmos campos, há menos de JANELA_LOG, ele dá lugar a um com o valor
   de antes da sequência e o final; se o final é o de antes, os dois somem. Mudança de etapa, subetapa e status fica
   de fora (cada passagem conta para o SLA). O registro é gravado na hora; só o histórico junta. */
const JANELA_LOG=7000,LOG_NAO_JUNTA=['neg.etapa','neg.sub','neg.status'];
/* ajuste na poligonal junta por 2 minutos (app.janela_log no banco; decisão do Moisés, 24/out/2026) */
const janelaLog=ks=>ks.join()==='poly'?120000:JANELA_LOG;
const polyLogTxt=(a0,a)=>`Ajuste na poligonal${a0&&a?`: ${m2(a0)} → ${m2(a)}`:''}`;
const valCampo=(o,k)=>{const [a,b]=k.split('.');const v=b?o[a]?.[b]:o[a];return v===undefined?null:v};
function juntarLog(t,s,campos,itens,nNovos){
  const e=t.hist[t.hist.length-1];if(!e||!campos.length)return;
  const ks=campos.map(c=>c.k).sort();
  if(itens.length||nNovos>1||ks.some(k=>LOG_NAO_JUNTA.includes(k))||e.det&&e.det.length>ks.length)return;
  const a=JSON.parse(s.j);e.ks=ks;e.ant=Object.fromEntries(ks.map(k=>[k,valCampo(a,k)]));
  /* valores depois da ação: o olhinho e a lixeira só valem enquanto o campo ainda tem estes valores */
  {const d=JSON.parse(retrato(t));e.dep=Object.fromEntries(ks.map(k=>[k,valCampo(d,k)]))}
  const p=t.hist[t.hist.length-2];
  /* o desfazer e a ação desfeita não se juntam com nada */
  if(e.desfaz||p&&(p.desfeito||p.desfaz))return;
  if(!p||!p.ks||p.user!==e.user||p.ks.join()!==ks.join()||Date.parse(e.em)-Date.parse(p.em)>=janelaLog(ks))return;
  const atual=JSON.parse(retrato(t));
  if(ks.every(k=>JSON.stringify(valCampo(atual,k))===JSON.stringify(p.ant[k]))){t.hist.splice(-2,2);return}
  const base=JSON.parse(retrato(t));ks.forEach(k=>{const [x,y]=k.split('.');if(y)base[x]={...base[x],[y]:p.ant[k]};else base[x]=p.ant[k]});
  const c=diffTerreno(base,atual).campos;
  e.ant=p.ant;if(c.length===1){e.txt=c[0].txt;delete e.det}else e.det=c.map(x=>x.txt);
  t.hist.splice(-2,1);
}
function audit(){
  S.terrenos.forEach(t=>{
    const s=AUD[t.id];t.hist=t.hist||[];
    if(!s)return;
    const {campos,itens}=diffTerreno(JSON.parse(s.j),JSON.parse(retrato(t)));
    const novos=t.hist.slice(s.h);
    /* edição salva sem mudar nenhum valor: não deixa registro vazio */
    if(!campos.length&&!itens.length){const vaz=novos.filter(e=>/atualizad[oa]s?$/.test(e.txt)&&!(e.det&&e.det.length));if(vaz.length)t.hist=t.hist.filter(e=>!vaz.includes(e));return}
    if(novos.length){const e=novos[novos.length-1];const det=campos.map(c=>c.txt).filter(x=>x!==e.txt);if(det.length)e.det=(e.det||[]).concat(det)}
    else{const secs=new Set(campos.map(c=>SEC_DE[c.k]).filter(Boolean));
      /* aba Infraestrutura: visita técnica e viabilidades técnicas não são seções da ficha antiga */
      const so=re=>campos.length&&!itens.length&&campos.every(c=>re.test(c.k));
      const txt=so(/^(infra\.|visita$)/)?(campos.length===1?campos[0].txt:'Visita técnica editada'):so(/^vtec\./)?(campos.length===1?campos[0].txt:'Viabilidades técnicas editadas'):itens.length&&!campos.length?itens[0]:secs.size===1&&!itens.length?`${SECOES[[...secs][0]].titulo} editado`:'Ficha editada';
      const det=campos.map(c=>c.txt).concat(itens.length&&!(itens.length===1&&!campos.length)?itens:[]);
      t.hist.push({em:agora(),user:me(),txt,det:det.length?det:undefined})}
    juntarLog(t,s,campos,itens,novos.length);
  });
  audSnap();
}

/* histórico de exemplo: reconstrói, a partir dos dados semeados, os registros que o sistema teria feito */
function semearHistorico(){
  const hora=(s,i)=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;h=(h+i*7919)>>>0;return `${String(8+h%10).padStart(2,'0')}:${String((h>>>4)%60).padStart(2,'0')}:${String((h>>>10)%60).padStart(2,'0')}.${String((h>>>16)%1000).padStart(3,'0')}`};
  S.terrenos.forEach(t=>{
    const H=[];const add=(dia,user,txt,det)=>{if(!dia)return;H.push({em:dia.length>10?dia:dia+'T'+hora(t.id+txt,H.length),user:user||t.resp,txt,det})};
    add(t.dataIdent,t.resp,'Terreno cadastrado',[t.nome,t.logradouro&&`Endereço: ${t.logradouro}${t.numero?', '+t.numero:''}`].filter(Boolean));
    (t.ofertas||[]).forEach(o=>add(o.data,t.resp,`Oferta registrada: ${mi(o.valor)}`,[typeof corretor==='function'&&corretor(o.cid)?`Corretor: ${corretor(o.cid).nome}`:null,o.forma&&OPT.forma?.[o.forma]?`Forma: ${OPT.forma[o.forma]}`:null].filter(Boolean)));
    (t.mats||[]).forEach(m=>add(m.data||addD(t.dataIdent,1),'Rafael Souza',`Matrícula adicionada: ${m.num}`,[m.cri,m.area!=null?`Área: ${m2(m.area)}`:null].filter(Boolean)));
    (t.insc||[]).forEach(i=>add(i.valores?.[0]?.data||addD(t.dataIdent,2),'Rafael Souza',`Inscrição imobiliária adicionada: ${i.sql}`));
    (t.analises||[]).forEach(a=>add(a.data,'Rafael Souza',`Análise urbanística registrada (${a.fonte})`,(a.zonas||[]).map(z=>`${z.sigla} · ${m2(z.area)}`)));
    (t.neg?.trilha||[]).forEach(x=>add(x.em.slice(0,10),x.user,x.status!=='ativo'?`Status: ${STATUS_N[x.status]}${t.neg.motivo?' · '+motivoN(x.status,t.neg.motivo):''}`:x.ev==='subetapa'?`Subetapa: ${subN(x.paraSub)}`:`Etapa: ${SN(x.paraEtapa)} · ${subN(x.paraSub)}`,x.status==='ativo'?undefined:[t.neg.detalhe||null,x.status==='stand_by'&&t.neg.retomar?`Retomar em ${fd(t.neg.retomar)}`:null].filter(Boolean)));
    if(t.neg?.pedido)add(t.neg.pedido.em,t.neg.pedido.por,`Pedido de aprovação: ${SN(t.neg.pedido.dest)} (gestor)`);
    if(t.neg?.viab)add(t.neg.viab.em,t.resp,`Estudo de viabilidade vinculado: ${t.neg.viab.nome}`,[`Margem ${num(t.neg.viab.margem,1)}%`]);
    (t.propostas||[]).forEach(p=>add(p.data,p.origem==='bkm'?t.resp:t.resp,`Proposta v${p.v} registrada (${p.origem==='bkm'?'BKM':'vendedor'}): ${mi(p.valor)}`,[p.cond].filter(Boolean)));
    (t.propostas||[]).filter(p=>['recusada','aceita'].includes(p.status)).forEach(p=>add(addD(p.data,3),t.resp,`Proposta v${p.v}: ${OPT.statusProp[p.status]}`));
    (t.reunioes||[]).forEach(r=>add(r.status==='realizada'?r.data:addD(r.data,-7),t.resp,r.status==='realizada'?`Reunião registrada (${fd(r.data)})`:`Reunião agendada para ${fd(r.data)} ${r.hora||''}`.trim(),[r.pauta].filter(Boolean)));
    (t.docs||[]).forEach(d=>add(d.emitido?addD(d.emitido,1):null,'Camila Torres',`Documento enviado: ${(TIPOS_DOC[d.tipo]||[d.nome||d.tipo])[0]}`));
    (t.docs||[]).filter(d=>d.status==='validado').forEach(d=>add(d.emitido?addD(d.emitido,2):null,'Moisés',`Documento validado: ${(TIPOS_DOC[d.tipo]||[d.nome||d.tipo])[0]}`));
    (t.dilig||[]).forEach(d=>add(addD(t.dataIdent,3),d.resp||t.resp,`Diligência aberta: ${d.titulo}`));
    (t.tarefas||[]).forEach(k=>add(addD(k.prazo||HOJE,-7),k.resp===t.resp?'Moisés':t.resp,`Tarefa criada: ${k.titulo}`,[`Responsável: ${k.resp}`,`Prazo: ${fd(k.prazo)}`]));
    t.hist=H.filter(h=>h.em.slice(0,10)<=HOJE).sort((a,b)=>a.em.localeCompare(b.em));
  });
}
if(!(S.histV2>=5)){semearHistorico();S.histV2=5;try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
/* registros antigos só tinham hora e minuto: completa segundos e milissegundos preservando a ordem em que foram gravados */
{let mud=false;S.terrenos.forEach(t=>{const g={};(t.hist||[]).forEach(h=>{if(h.em&&h.em.length===16)(g[h.em]=g[h.em]||[]).push(h)});
  Object.values(g).forEach(L=>L.forEach((h,k)=>{const ms=Math.round(59999*(k+1)/(L.length+1));h.em+=':'+String(Math.floor(ms/1000)).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');mud=true}))});
  if(mud)try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
S.terrenos.forEach(t=>{if(!t.municipio)t.municipio='São Paulo · SP'});
audSnap();

/* ---------- estado do painel ---------- */
let PN={aberto:true,aba:'logs',users:[]};try{const x=JSON.parse(localStorage.getItem('bkm-terrenos-painel')||'null');if(x)PN={...PN,...x}}catch(e){}
if(!Array.isArray(PN.users))PN.users=[];if(typeof PN.user==='string'){if(PN.user)PN.users=[PN.user];delete PN.user}
if(!PN.per||typeof PN.per!=='object')PN.per={k:'30d'};
let pnMenu=null,pnFoco=null,pnCal=null; /* pnMenu: 'user' | 'per'; pnCal: rascunho do calendário {mes:'AAAA-MM', ini, fim} */
const pnSalva=()=>{try{localStorage.setItem('bkm-terrenos-painel',JSON.stringify(PN))}catch(e){}};

/* ---------- próximas ações ---------- */
function proximasAcoes(t){
  const L=[],n=t.neg;const fixBtn=(a,l,extra='')=>({a,l,extra});
  if(n?.status==='stand_by')L.push({sev:'warn',i:'pause',txt:`Negociação em Stand By. Retomar em ${fd(n.retomar)}`,fix:UI.role!=='Leitura'?fixBtn('retomar','Retomar'):null});
  if(n?.status==='ativo'){
    const r=checkAdv(t);
    if(n.pedido)L.push({sev:'warn',i:'check',txt:possoDecidir(t)?`Aprovar: ${destinoNome(n.pedido.tipo,n.pedido.dest)} (pedido por ${n.pedido.por})`:`Aguardando ${quemFalta(n.pedido)} aprovar ${destinoNome(n.pedido.tipo,n.pedido.dest)}`,fix:null});
    if(subAtrasada(n))L.push({sev:'warn',i:'clock',txt:`${subN(n.sub)} há ${diasSub(n)} dias (prazo de ${subCfg(n.sub).prazo})`,fix:null});
    if(r)r.items.filter(x=>!x.ok).forEach(x=>L.push({sev:x.gate?'':'warn',i:x.gate?'warn':'fwd',txt:x.txt,fix:x.fix?fixBtn(x.fix[0].startsWith('tab:')?'tab':x.fix[0],x.fix[1],x.fix[0].startsWith('tab:')?`data-t="${x.fix[0].slice(4)}"`:''):null}));
    if(r&&r.ok&&!n.pedido)L.push({sev:'good',i:'fwd',txt:`Pronto para ${r.compra?'concluir como Comprado':'avançar para '+r.next[1]}${r.aprov.niveis.length?' (pede aprovação)':''}`,fix:null});
    const lp=lastProp(t);
    if(lp&&['apresentada','em_analise'].includes(lp.status))L.push({sev:'warn',i:'money',txt:lp.origem==='bkm'?`Cobrar resposta da proposta v${lp.v} (enviada em ${fd(lp.data)})`:`Responder à proposta v${lp.v} do vendedor (${mi(lp.valor)})`,fix:fixBtn('tab','Ver propostas','data-t="negociacao"')});
    if(abaixoMin(t))L.push({sev:'crit',i:'money',txt:`Levar ao comitê: ${abaixoMinTxt(t).replace('Rentabilidade','rentabilidade')}`,fix:null});
    if(!n.temp)L.push({sev:'warn',i:'warn',txt:'Avaliar a temperatura da negociação',fix:null});
    const pr=proxReuniao(t);if(pr)L.push({sev:'',i:'clock',txt:`Reunião ${fd(pr.data)}${pr.hora?' às '+pr.hora:''}${pr.pauta?' · '+pr.pauta:''}`,fix:fixBtn('tab','Ver','data-t="negociacao"')});
  }
  (t.dilig||[]).filter(d=>d.sit!=='resolvida').forEach(d=>L.push({sev:d.sit==='impeditiva'?'crit':'warn',i:'warn',txt:`Resolver diligência: ${d.titulo}`,fix:fixBtn('tab','Ver','data-t="documentos"')}));
  (t.docs||[]).filter(d=>docSt(d)==='vencido').forEach(d=>L.push({sev:'crit',i:'doc',txt:`Renovar documento vencido: ${(TIPOS_DOC[d.tipo]||[d.tipo])[0]}`,fix:fixBtn('tab','Ver','data-t="documentos"')}));
  const c=completude(t);if(c.faltam.length)L.push({sev:'',i:'edit',txt:`Completar a ficha (${c.pct}%): ${c.faltam.slice(0,3).map(f=>f[0]).join(', ')}${c.faltam.length>3?'…':''}`,fix:fixBtn('ir','Completar',`data-t="${c.faltam[0][2]}" data-s="${c.faltam[0][3]||''}"`)});
  if(!n&&t.situacao==='ativo')L.push({sev:'',i:'fwd',txt:'Terreno sem negociação. Registre uma oferta para abrir a negociação.',fix:UI.role!=='Leitura'?fixBtn('nova-oferta','Registrar oferta'):null});
  return L;
}

/* ---------- desenho ---------- */
const PN_IC={logs:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  acoes:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L6.8 5M3.5 12l1.2 1.2 2.1-2.2M3.5 18l1.2 1.2 2.1-2.2"/></svg>',
  fechar:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 6l6 6-6 6M5 6l6 6-6 6"/></svg>',
  abrir:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 6l-6 6 6 6M19 6l-6 6 6 6"/></svg>'};
function diaRot(d){const x=diff(d,HOJE);return x===0?'Hoje':x===1?'Ontem':fd(d)}
/* ---------- filtro de período ---------- */
const PER_OPC=[['tudo','Todo o período'],['hoje','Hoje'],['semana','Esta semana'],['mes','Este mês'],['30d','Últimos 30 dias'],['ano','Este ano']];
function pnFaixa(){const P=PN.per||{k:'30d'},h=HOJE;
  switch(P.k){case 'hoje':return [h,h];case 'semana':return [addD(h,-pd(h).getDay()),h];case 'mes':return [h.slice(0,8)+'01',h];
    case '30d':return [addD(h,-29),h];case 'ano':return [h.slice(0,5)+'01-01',h];case 'custom':return P.ini?[P.ini,P.fim||P.ini]:null;default:return null}}
const fdc=s=>{const x=pd(s);return `${x.getDate()} ${MES[x.getMonth()]}${x.getFullYear()!==pd(HOJE).getFullYear()?' '+x.getFullYear():''}`};
function pnPerRot(){const P=PN.per||{k:'tudo'};if(P.k==='custom'&&P.ini){const f=P.fim||P.ini;return f===P.ini?fdc(P.ini):`${fdc(P.ini)} – ${fdc(f)}`}
  return (PER_OPC.find(x=>x[0]===P.k)||PER_OPC[0])[1]}
const PER_CURTO={tudo:'Tudo',hoje:'Hoje',semana:'Semana',mes:'Mês','30d':'30 dias',ano:'Ano'};
function pnPerCurto(){const P=PN.per||{k:'tudo'};return P.k==='custom'?pnPerRot():PER_CURTO[P.k]||pnPerRot()}
const CHEV='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const CAL_IC='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function pnPerMenu(){
  if(pnCal){const c=pnCal,[y,m]=c.mes.split('-').map(Number),pri=new Date(y,m-1,1),nd=new Date(y,m,0).getDate(),fim=c.fim||c.ini;
    let dias='';for(let i=0;i<pri.getDay();i++)dias+='<span></span>';
    for(let d=1;d<=nd;d++){const s=`${c.mes}-${String(d).padStart(2,'0')}`,fut=s>HOJE;
      const ini=c.ini===s,fi=c.fim&&c.fim===s,dentro=c.ini&&c.fim&&s>c.ini&&s<c.fim;
      dias+=`<span class="pn-cd${dentro?' meio':''}${ini&&c.fim&&c.fim!==c.ini?' ini':''}${fi&&c.fim!==c.ini?' fim':''}"><button data-a="pn-cal-dia" data-d="${s}" ${fut?'disabled':''} class="${ini||fi?'sel':''}${s===HOJE?' hoje':''}" aria-pressed="${!!(ini||fi)}" aria-label="${d} de ${MESES[m-1]}">${d}</button></span>`}
    const ant=m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`,prox=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`;
    return `<div class="pn-cal" role="dialog" aria-label="Escolher período">
      <div class="pn-ct">Selecione o período</div>
      <div class="pn-cr"><span class="${c.ini?'':'vazio'}">${c.ini?fdc(c.ini):'Início'}</span> – <span class="${c.fim?'':'vazio'}">${c.fim?fdc(c.fim):'Término'}</span></div>
      <div class="pn-cn"><button class="iconbtn" data-a="pn-cal-mes" data-v="${ant}" aria-label="Mês anterior"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
        <span class="pn-cm">${MESES[m-1]} de ${y}</span>
        <button class="iconbtn" data-a="pn-cal-mes" data-v="${prox}" aria-label="Próximo mês" ${prox>HOJE.slice(0,7)?'disabled':''}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>
      <div class="pn-cw">${['D','S','T','Q','Q','S','S'].map(x=>`<span>${x}</span>`).join('')}</div>
      <div class="pn-cg">${dias}</div>
      <div class="pn-cf"><button class="btn text sm" data-a="pn-cal-cancel">Cancelar</button><button class="btn text sm" data-a="pn-cal-ok" ${c.ini?'':'disabled'}>Aplicar</button></div></div>`}
  const P=PN.per||{k:'tudo'};
  return `<div class="pn-menu-l">${PER_OPC.map(([k,l])=>`<button role="menuitemradio" aria-checked="${P.k===k}" data-a="pn-per" data-v="${k}"><span class="pn-mn">${l}</span></button>`).join('')}<div class="pn-msep"></div>
    <button role="menuitemradio" aria-checked="${P.k==='custom'}" data-a="pn-per-custom">${CAL_IC}<span class="pn-mn">Personalizado${P.k==='custom'&&P.ini?` <span class="n">${esc(pnPerRot())}</span>`:'…'}</span></button></div>`;
}
function pnLogs(t){
  const todos=histOrd(t.hist);
  if(!todos.length)return '<div class="empty">Nenhum registro.</div>';
  const fx=pnFaixa(),noPer=fx?todos.filter(h=>{const d=h.em.slice(0,10);return d>=fx[0]&&d<=fx[1]}):todos;
  const tot=new Map(),cont=new Map();todos.forEach(h=>tot.set(h.user,(tot.get(h.user)||0)+1));noPer.forEach(h=>cont.set(h.user,(cont.get(h.user)||0)+1));
  const users=[...tot.keys()].sort((a,b)=>(cont.get(b)||0)-(cont.get(a)||0)||tot.get(b)-tot.get(a)||a.localeCompare(b));
  const sel=PN.users.filter(x=>users.includes(x));
  const H=sel.length?noPer.filter(h=>sel.includes(h.user)):noPer;
  const nSel=sel.reduce((a,x)=>a+(cont.get(x)||0),0);
  const rot=!sel.length?`Todos os usuários (${noPer.length})`:sel.length===1?`${sel[0]} (${nSel})`:sel.length===2?`${sel.map(x=>x.split(' ')[0]).join(', ')} (${nSel})`:`${sel.length} usuários (${nSel})`;
  const rotC=!sel.length?'Usuários':sel.length===1?sel[0].split(' ')[0]:`${sel.length} usuários`;
  const ck='<span class="pn-ck" aria-hidden="true"></span>',ab=k=>pnMenu===k?'aberto':'';
  const perAtivo=!!fx&&(PN.per?.k||'30d')!=='30d';
  const filtro=`<div class="pn-filtros">
    <div class="pn-dd ${ab('user')}" data-dd="user"><button class="pn-dd-b ${sel.length?'ativo':''}" data-a="pn-menu" data-v="user" aria-haspopup="menu" aria-expanded="${pnMenu==='user'}" aria-label="Filtrar por usuário: ${esc(rot)}"><span class="pn-dd-t">${esc(rotC)}</span>${CHEV}</button>
    <div class="pn-menu" role="menu" aria-label="Usuários"><button role="menuitemcheckbox" aria-checked="${!sel.length}" data-a="pn-todos">${ck}<span class="pn-mn">Todos os usuários</span><span class="n">${noPer.length}</span></button><div class="pn-msep"></div>${users.map(x=>`<button role="menuitemcheckbox" aria-checked="${sel.includes(x)}" data-a="pn-u" data-v="${esc(x)}" class="${cont.get(x)?'':'zero'}">${ck}${av(x,'xs')}<span class="pn-mn">${esc(x)}</span><span class="n">${cont.get(x)||0}</span></button>`).join('')}</div></div>
    <div class="pn-dd ${ab('per')}" data-dd="per"><button class="pn-dd-b ${perAtivo?'ativo':''}" data-a="pn-menu" data-v="per" aria-haspopup="menu" aria-expanded="${pnMenu==='per'}" aria-label="Filtrar por período: ${esc(pnPerRot())}">${CAL_IC}<span class="pn-dd-t">${esc(pnPerCurto())}</span>${CHEV}</button>
    <div class="pn-menu ${pnCal?'cal':''}" role="menu" aria-label="Período">${pnPerMenu()}</div></div></div>`;
  let dia='',out=filtro;
  if(!H.length)out+=`<div class="empty">Nenhum registro ${sel.length?'destes usuários ':''}neste período.</div>`;
  H.forEach(h=>{const d=h.em.slice(0,10);if(d!==dia){dia=d;out+=`<div class="pn-dia">${diaRot(d)}</div>`}
    out+=`<div class="pn-log${typeof logOffCls==='function'?logOffCls(t,h):''}" data-a="pn-log" data-i="${t.hist.indexOf(h)}" tabindex="0" role="button" aria-label="${esc(h.txt)}: mostrar na ficha">${av(h.user,'sm')}<div class="pn-lc"><div class="pn-lt">${esc(h.txt)}</div>${h.det&&h.det.length?`<ul class="pn-det">${h.det.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<div class="pn-lm" title="${esc(emCompleto(h.em))}">${esc(h.user)}${hhmm(h.em)?` · ${hhmm(h.em)}`:''}</div>${typeof logAcoesHtml==='function'?logAcoesHtml(t,h,t.hist.indexOf(h)):''}</div></div>`});
  return out;
}
function pnAcoes(t){
  const A=proximasAcoes(t),K=abertas(t).sort((a,b)=>String(a.prazo||'9').localeCompare(String(b.prazo||'9'))),ed=UI.role!=='Leitura';
  return `<div class="pn-grupo"><div class="pn-gt">Próximas ações <span class="n">${A.length}</span></div>
    ${A.length?A.map(x=>`<div class="pn-acao ${x.sev}"><span class="pn-ai">${ic(x.i,16)}</span><div class="pn-ac"><div>${esc(x.txt)}</div>${x.fix?`<button class="linkbtn" data-a="${x.fix.a}" ${x.fix.extra}>${esc(x.fix.l)}</button>`:''}</div></div>`).join(''):'<div class="empty">Nada pendente.</div>'}</div>
  <div class="pn-grupo"><div class="pn-gt">Tarefas em aberto <span class="n">${K.length}</span>${ed?`<button class="btn text sm" data-a="tab" data-t="tarefas" style="margin-left:auto">${ic('add',16)}Nova</button>`:''}</div>
    ${K.length?K.map(k=>{const late=!!k.prazo&&k.prazo<HOJE;return `<div class="pn-tar">${ed?`<button class="pn-chk" data-a="pn-concluir" data-k="${k.id}" aria-label="Concluir ${escT(k.titulo)}" title="Concluir"></button>`:''}
      <button class="pn-tc" data-a="tk-abrir" data-id="${t.id}" data-tk="${k.id}"><span class="pn-tt">${escT(k.titulo)}${k.prio==='alta'?' <span class="chip warn" style="height:20px">Alta</span>':''}</span>
      <span class="pn-tm ${late?'late':''}">${esc(k.resp||'Sem responsável')} · ${k.prazo?(late?'atrasada desde ':'prazo ')+fd(k.prazo):'sem prazo'} · ${esc(tkLista(t,k).nome)}</span></button></div>`}).join(''):'<div class="empty">Nenhuma tarefa aberta.</div>'}</div>`;
}
function painelFicha(t){
  const nL=(t.hist||[]).length,nA=proximasAcoes(t).length+abertas(t).length;
  if(!PN.aberto)return `<aside class="pn pn-min" aria-label="Logs e ações"><button class="pn-rb" data-a="pn-abrir" title="Expandir painel" aria-label="Expandir painel">${PN_IC.abrir}</button>
    <button class="pn-rb" data-a="pn-aba" data-v="logs" title="Logs" aria-label="Logs, ${nL} registros">${PN_IC.logs}<span class="pn-badge">${nL}</span></button>
    <button class="pn-rb" data-a="pn-aba" data-v="acoes" title="Ações" aria-label="Ações, ${nA} pendências">${PN_IC.acoes}<span class="pn-badge">${nA}</span></button></aside>`;
  const adv=painelAvanco(t);
  return `<aside class="pn" aria-label="Logs e ações">${adv?`<div class="pn-adv">${adv}</div>`:''}<div class="pn-h"><div class="seg" role="tablist" aria-label="Painel">${[['logs','Logs',nL],['acoes','Ações',nA]].map(([k,l,q])=>`<button role="tab" data-a="pn-aba" data-v="${k}" aria-pressed="${PN.aba===k}" aria-selected="${PN.aba===k}">${l} <span class="pn-q">${q}</span></button>`).join('')}</div>
    <button class="iconbtn" data-a="pn-fechar" title="Recolher painel" aria-label="Recolher painel">${PN_IC.fechar}</button></div>
    <div class="pn-b">${PN.aba==='logs'?pnLogs(t):pnAcoes(t)}</div></aside>`;
}
/* tabelas: se não cabem no quadro, viram lista empilhada em vez de rolar para o lado */
/* Dashboard: se a lista não cabe, primeiro somem Código e Temperatura; se ainda não couber, ela desce para a largura inteira */
function ajustaDash(){const g=document.querySelector('.dash-g'),s=g&&g.querySelector('.dash-tab'),w=s&&s.querySelector('.dt-wrap'),t=w&&w.querySelector('table');if(!t)return;
  const cabe=()=>t.scrollWidth<=w.clientWidth+1;g.classList.remove('tab-larga');s.classList.remove('enxuta');w.classList.remove('empilha');
  if(cabe())return;s.classList.add('enxuta');if(cabe())return;s.classList.remove('enxuta');g.classList.add('tab-larga');if(cabe())return;s.classList.add('enxuta');if(cabe())return;
  s.classList.remove('enxuta');g.classList.remove('tab-larga')}  // nem assim: ajustaTabelas empilha como nas outras listas
function ajustaTabelas(raiz){if(!(raiz instanceof Element)){raiz=null;ajustaDash()}(raiz||document).querySelectorAll('.tblwrap,.dt-wrap').forEach(w=>{const t=w.querySelector('table');if(!t)return;
  const cab=[...t.querySelectorAll('thead th')].map(th=>{const c=th.cloneNode(true);c.querySelectorAll('.dt-ar').forEach(x=>x.remove());return c.textContent.trim()});
  t.querySelectorAll('tbody tr').forEach(tr=>{let i=0;[...tr.children].forEach(td=>{if(!td.hasAttribute('data-l'))td.setAttribute('data-l',cab[i]||'');i+=td.colSpan||1})});
  if(!w.offsetParent)return;  // escondida (quadro fechado): mede quando o quadro abrir (qdPor)
  w.classList.remove('empilha');if(!w.classList.contains('rola')&&t.scrollWidth>w.clientWidth+1)w.classList.add('empilha')})}
let tbRz;window.addEventListener('resize',()=>{cancelAnimationFrame(tbRz);tbRz=requestAnimationFrame(ajustaTabelas)});
const _posRender=posRender;posRender=function(){_posRender.apply(this,arguments);ajustaTabelas();if(typeof gBuscasEndereco==='function')gBuscasEndereco();if(typeof gEntornoAuto==='function')gEntornoAuto();
  if(pnFoco){const el=document.querySelector(pnFoco);el&&el.focus({preventScroll:true});pnFoco=null}};
/* menus suspensos do Logs: abrem e fecham sem redesenhar a página */
function pnMenuSet(k){pnMenu=k;if(k!=='per')pnCal=null;
  document.querySelectorAll('.pn-dd').forEach(w=>{const on=w.dataset.dd===k;w.classList.toggle('aberto',on);w.querySelector('.pn-dd-b').setAttribute('aria-expanded',on)});
  if(k==='per')pnPerRefresh();
  if(k){const w=document.querySelector(`.pn-dd[data-dd="${k}"]`);const m=w&&(w.querySelector('[aria-checked=true]')||w.querySelector('.pn-menu button:not([disabled])'));m&&m.focus({preventScroll:true})}}
function pnPerRefresh(){const m=document.querySelector('.pn-dd[data-dd="per"] .pn-menu');if(!m)return;m.innerHTML=pnPerMenu();m.classList.toggle('cal',!!pnCal)}
document.addEventListener('click',e=>{if(pnMenu&&!e.target.closest('.pn-dd'))pnMenuSet(null)},true);
document.addEventListener('keydown',e=>{if(!pnMenu)return;
  if(e.key==='Escape'){const k=pnMenu;if(pnCal){pnCal=null;pnPerRefresh();document.querySelector('[data-a="pn-per-custom"]')?.focus();return}pnMenuSet(null);document.querySelector(`.pn-dd[data-dd="${k}"] .pn-dd-b`)?.focus();return}
  if(!pnCal&&(e.key==='ArrowDown'||e.key==='ArrowUp')){const it=[...document.querySelectorAll(`.pn-dd[data-dd="${pnMenu}"] .pn-menu button`)];const k=it.indexOf(document.activeElement);e.preventDefault();it[(k+(e.key==='ArrowDown'?1:-1)+it.length)%it.length]?.focus()}});
/* clicar num log abre, na página, a seção e o campo que mudaram */
const LAB_INV={};Object.entries(LAB_CAMPO).forEach(([k,l])=>{LAB_INV[l.toLowerCase()]=k});
const SEC_AREA=new Set(['aDoc','aCad','aLev','aEst','fonteArea','testada']);
function alvoLog(h){
  const x=h.txt||'',det=h.det||[];
  const campos=det.map(d=>{const m=/^([^:]+):.*→/.exec(d);return m&&LAB_INV[m[1].trim().toLowerCase()]}).filter(Boolean);
  const secDe=k=>SEC_AREA.has(k)?'areas':SEC_DE[k];
  if(campos.length)return {b:'cadastro',s:secDe(campos[0]),campos};
  const sec=Object.entries(SECOES).find(([,v])=>x===`${v.titulo} editado`);if(sec)return {b:'cadastro',s:sec[0]};
  const R=[[/^Terreno cadastrado/,{b:'cadastro',s:'ident'}],[/^Matr[íi]cula/,{b:'cadastro',s:'lotes'}],[/^Inscri[çc][ãa]o/,{b:'cadastro',s:'lotes'}],[/^Lote/,{b:'cadastro',s:'lotes'}],[/^Parte/,{b:'cadastro',s:'partes-cad'}],
    [/^Confronta/,{b:'cadastro',s:'confr'}],[/^Pessoa|^Propriet/,{b:'cadastro',s:'pessoas'}],[/^Poligonal|^[ÁA]rea/,{b:'cadastro',s:'areas'}],
    [/^(Oferta|Corretor)/,{b:'comercial'}],[/^Estudo de viabilidade/,{b:'geral'}],[/^(Proposta|Reuni[ãa]o|Oferta de refer)/,{b:'negociacao'}],
    [/^(Documento|Dilig)/,{b:'documentos'}],[/^Tarefa/,{b:'tarefas'}],[/^(Tipo do empreendimento|Zonas d)/,{b:'urbanismo',s:'analise'}],[/^(An[áa]lise urban|Infraestrutura|Zoneamento)/,{b:'urbanismo'}],
    [/^Temperatura/,{topo:'.temp'}],[/^(Etapa|Subetapa|Status|Avan[çc]ou|Voltou|Retomad|Stand [bB]y|Em stand by|Pedido|Aprovad|Aprova[çc][ãa]o|Negocia[çc][ãa]o|Retomar|Revisitar|Motivo|Relato|Pontos)/,{topo:'.tl-topo'}]];
  const r=R.find(([re])=>re.test(x));return r?r[1]:{b:'geral'};
}
let pnPiscaT=null;
function mostrarLog(h){
  const a=alvoLog(h);
  if(a.b){blocoAbre(a.b);if(a.s&&!['ident','loc','fis'].includes(a.s)||!a.s)UI.edit=null;render()}
  setTimeout(()=>{
    const bloco=a.b&&document.getElementById('bl-'+a.b);
    const alvo=a.topo?document.querySelector(a.topo):(a.s&&document.getElementById('sec-'+a.s))||bloco;if(!alvo)return;
    let marcas=[];
    /* 1. campos citados no log (rótulos da ficha) */
    if(a.campos&&a.campos.length){const nomes=a.campos.map(k=>[LAB_CAMPO[k].toLowerCase(),LAB_CAMPO[k].replace(/^Área /,'').toLowerCase()]).flat();
      (bloco||alvo).querySelectorAll('.k,.al,.lbl,dt,label').forEach(el=>{const tx=el.textContent.trim().toLowerCase();if(nomes.some(n=>tx===n||tx.startsWith(n+' ')))marcas.push(el.closest('.area')||el.parentElement)})}
    /* 2. item citado no log: documento, tarefa, proposta, matrícula, reunião, corretor… */
    if(!marcas.length&&!a.topo){
      const x=h.txt||'',v=/\bv(\d+)\b/.exec(x),sub=x.split(': ').slice(1).join(': ').replace(/\s*\(.*$/,'').trim(),par=(/\(([^)]+)\)/.exec(x)||[])[1];
      const termos=[sub,par,...(h.det||[]).map(d=>(d.split('→')[1]||'').trim())].filter(q=>q&&q.length>2&&!/^(BKM|vendedor)$/i.test(q));
      termos.slice().forEach(q=>{const m=/R\$\s*([\d.,]+)\s*mi/.exec(q);if(m)termos.push(Math.round(parseFloat(m[1].replace(/\./g,'').replace(',','.'))*1e6).toLocaleString('pt-BR'),m[1]+' mi')});
      const linhas=[...(bloco||alvo).querySelectorAll('.doc,.task,.pnode,.tli,tr,.infra,.kcard,.pn-tar,.dilig,.reu,.mat,.ins,.area,.kvg>div,li')];
      const el=v?(linhas.find(e=>e.matches('.pnode')&&e.textContent.trim().startsWith('v'+v[1]))||linhas.find(e=>e.textContent.trim().startsWith('v'+v[1]))):termos.map(q=>linhas.find(e=>e.textContent.includes(q))).find(Boolean);
      if(el)marcas=[el]
      else{ /* a seção cujo título combina com o assunto do log */
        const T=[[/^Reuni/,'Reuni'],[/^Estudo de viabilidade/,'viabilidade'],[/^Oferta/,'Ofertas'],[/^Corretor/,'Corretor'],[/^An[áa]lise/,'Análise'],[/^Documento/,'Checklist'],[/^Dilig/,'Dilig'],[/^Proposta/,'Proposta'],[/^Tarefa/,'Tarefa']].find(([re])=>re.test(x));
        const sec=T&&[...(bloco||alvo).querySelectorAll('.sec')].find(e=>(e.querySelector('h2,.gt,.sec-h')?.textContent||'').includes(T[1]));if(sec)marcas=[sec]}}
    /* 3. sem item exato: a seção inteira */
    if(!marcas.length)marcas=[a.topo?alvo:(alvo.matches('.bl')?(alvo.querySelector('.bl-c .sec')||alvo):alvo)];
    marcas.forEach(qdAbrirEl);marcas[0].scrollIntoView({behavior:'smooth',block:'center'});
    /* acende depois que a rolagem termina, para o destaque ser visto inteiro */
    document.querySelectorAll('.pisca').forEach(el=>el.classList.remove('pisca'));clearTimeout(pnPiscaT);
    let feito=false;const acende=()=>{if(feito)return;feito=true;marcas.forEach(el=>{void el.offsetWidth;el.classList.add('pisca')});pnPiscaT=setTimeout(()=>marcas.forEach(el=>el.classList.remove('pisca')),4200)};
    if('onscrollend' in window){window.addEventListener('scrollend',acende,{once:true});setTimeout(acende,900)}else setTimeout(acende,500);
  },40);
}
const _pgFicha=pgFicha;
pgFicha=function(){const t=T(UI.id);return `<div class="ficha-wrap ${PN.aberto?'pn-on':'pn-off'}"><div class="ficha-main">${_pgFicha()}</div>${painelFicha(t)}</div>`};

document.addEventListener('click',e=>{
  const a=e.target.closest('[data-a]');if(!a)return;const A=a.dataset.a;
  if(A==='end-manual'){const f=a.closest('form');f.querySelectorAll('input.auto-v').forEach(i=>{i.readOnly=false;i.classList.add('auto-ed');i.placeholder=''});a.remove();f.querySelector('[name="logradouro"]')?.focus();return}
  if(A==='pn-log'){const t=T(UI.id),h=t&&t.hist[+a.dataset.i];if(h)mostrarLog(h)}
  else if(A==='pn-abrir'){PN.aberto=true;pnSalva();render()}
  else if(A==='pn-fechar'){PN.aberto=false;pnSalva();render()}
  else if(A==='pn-u'){const v=a.dataset.v;PN.users=PN.users.includes(v)?PN.users.filter(x=>x!==v):[...PN.users,v];pnSalva();
    pnFoco=`.pn-menu [data-a="pn-u"][data-v="${CSS.escape(v)}"]`;render()}
  else if(A==='pn-todos'){PN.users=[];pnSalva();pnFoco='.pn-menu [data-a="pn-todos"]';render()}
  else if(A==='pn-menu'){pnMenuSet(pnMenu===a.dataset.v?null:a.dataset.v)}
  else if(A==='pn-per'){PN.per={k:a.dataset.v};pnSalva();pnMenu=null;pnCal=null;pnFoco='.pn-dd[data-dd="per"] .pn-dd-b';render()}
  else if(A==='pn-per-custom'){const P=PN.per||{};pnCal={mes:(P.k==='custom'&&P.ini?P.ini:HOJE).slice(0,7),ini:P.k==='custom'?P.ini||null:null,fim:P.k==='custom'?P.fim||null:null};pnPerRefresh();document.querySelector('.pn-cal [data-a="pn-cal-dia"]:not([disabled])')?.focus({preventScroll:true})}
  else if(A==='pn-cal-mes'){if(!pnCal)return;pnCal.mes=a.dataset.v;pnPerRefresh()}
  else if(A==='pn-cal-dia'){if(!pnCal)return;const d=a.dataset.d,c=pnCal;
    if(!c.ini||c.fim)Object.assign(c,{ini:d,fim:null});else if(d<c.ini)Object.assign(c,{ini:d,fim:c.ini});else c.fim=d;
    pnPerRefresh();document.querySelector(`.pn-cal [data-d="${d}"]`)?.focus({preventScroll:true})}
  else if(A==='pn-cal-cancel'){pnCal=null;pnPerRefresh();document.querySelector('[data-a="pn-per-custom"]')?.focus()}
  else if(A==='pn-cal-ok'){if(!pnCal||!pnCal.ini)return;PN.per={k:'custom',ini:pnCal.ini,fim:pnCal.fim||pnCal.ini};pnSalva();pnCal=null;pnMenu=null;pnFoco='.pn-dd[data-dd="per"] .pn-dd-b';render()}
  else if(A==='pn-aba'){PN.aba=a.dataset.v;PN.aberto=true;pnSalva();render()}
  else if(A==='pn-concluir'){const t=T(UI.id),k=t?.tarefas.find(x=>x.id===a.dataset.k);if(!k)return;if(tkConcluir(t,k,true)===false){render();return}save();render();toast('Tarefa concluída.')}
});
