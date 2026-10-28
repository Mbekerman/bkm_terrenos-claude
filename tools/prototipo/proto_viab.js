/* ===================== estudo de viabilidade estática (decisões do Moisés, 25 e 26/out/2026) =====================
   Avaliação prévia, sem fluxo de caixa. Espelha app.viabilidade_tipologias, app.viabilidade_linhas e
   app.calcular_viabilidade (migration 20261015001000_viabilidade.sql): mesmas regras, mesmos arredondamentos.
   O estudo é do terreno (S.viabs, vários por terreno); a negociação vincula um, e t.neg.viab guarda o resumo
   dele (com o id), que é o que o resto do protótipo lê (filtros, rentabilidade mínima, Visão geral).
   Lista de itens da empresa em S.viabDesp (Configurações › Viabilidade), nascida de tools/viabilidade/despesas.json;
   o grupo do item define a seção, as bases de cálculo aceitas e se ele é fixo (Taxas, Despesas financeiras e Despesas comerciais).
   Despesas financeiras (Alavancagem, Juros PJ, Custo financeiro, Impostos) e Taxas: o estudo nasce com o valor
   padrão da empresa e só a diretoria ou o administrador vê as abas e muda os valores (decisões do Moisés, 26/out/2026). */
const VB_CFG=__VIAB_DESPESAS__;
const VB_TIPO=VB_CFG.tipos,VB_GRUPO=VB_CFG.grupos,VB_SECAO=VB_CFG.secoes;
const VB_DG=['terreno','incorporacao','cef','adm_financeiro'];
const vbGruposDe=sec=>Object.keys(VB_GRUPO).filter(g=>VB_GRUPO[g].secao===sec);
const r2=x=>Math.round((x+Math.sign(x)*Number.EPSILON)*100)/100;
const VB=id=>S.viabs.find(v=>v.id===id);
const viabsDe=tid=>S.viabs.filter(v=>v.tid===tid);
const vbDesp=c=>S.viabDesp.find(d=>d.codigo===c);
const vbGrupoLn=l=>vbDesp(l.desp)?.grupo;
const vbPct=tipo=>tipo.startsWith('pct');
const vbIn=(v,d=2)=>v==null?'':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:d});
const vbSemAcento=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

/* preço unitário, preço por m² e área ligados (o mesmo de app.tg_viabilidade_tipologia):
   com a área, mudar o unitário refaz o m² e mudar o m² refaz o unitário; mudar a área refaz o m² quando há
   os dois preços e completa o que falta quando há um só; apagar um preço não refaz o outro */
function vbNorm(p,campo){if(p.area==null)return;
  if(campo==='pm2'){if(p.pm2!=null)p.pu=r2(p.pm2*p.area)}
  else if(campo==='pu'){if(p.pu!=null)p.pm2=r2(p.pu/p.area)}
  else if(p.pu!=null)p.pm2=r2(p.pu/p.area);
  else if(p.pm2!=null)p.pu=r2(p.pm2*p.area)}

/* cálculo (app.calcular_viabilidade), na ordem:
   VGV vendido = VGV − permuta física − unidades da comissão (é o "VGV" das bases % do VGV);
   VGV líquido = vendido − % de dedução − despesas comerciais marcadas para deduzir;
   obra: incidente (típico) = R$/m² × área privativa; raso = incidente + atípicos; total = raso + não incidente; + projetos e pós-obra;
   terreno: permuta financeira = % × VGV líquido, nunca abaixo do mínimo garantido; + dinheiro + comissão em dinheiro;
   % do lucro líquido (Despesas gerais, Taxas e Despesas financeiras): lucro = L0 ÷ (1 + Σ%), zero quando L0 ≤ 0;
   resultado sem taxas = lucro líquido + taxas; EBITDA = resultado sem taxas + despesas financeiras (as taxas saem por último) */
function vbCalc(v){let A=0,un=0,unp=0,unc=0,ap=0,ac=0,vgv=0,vp=0,vc=0;
  v.tips.forEach(p=>{const q=p.qtd||0,pe=p.perm||0,co=p.com||0;un+=q;unp+=pe;unc+=co;
    if(p.area!=null){A+=p.area*q;ap+=p.area*pe;ac+=p.area*co}if(p.pu!=null){vgv+=q*p.pu;vp+=pe*p.pu;vc+=co*p.pu}});
  A=r2(A);ap=r2(ap);ac=r2(ac);vgv=r2(vgv);vp=r2(vp);vc=r2(vc);const vv=r2(vgv-vp-vc),unl=un-unp-unc;
  const b={area:A,unidades:unl,pct_vgv:vv};
  const val=l=>{if(l.valor==null)return null;const x=l.valor;switch(l.tipo){case 'verba':return r2(x);case 'verba_mensal':return r2(x*(l.qtd||1));
    case 'verba_unidade':return r2(b.unidades*x);case 'area':return r2(b.area*x);default:return r2((b[l.tipo]||0)*x/100)}};
  const soma=(gs,semLucro)=>r2(v.linhas.filter(l=>gs.includes(vbGrupoLn(l))&&!(semLucro&&l.tipo==='pct_lucro')).reduce((s,l)=>s+(val(l)||0),0));
  const ded=l=>vbGrupoLn(l)==='comercial'&&vbDesp(l.desp)?.deduz&&v.deduz.includes(l.desp);
  const com=soma(['comercial']),dedc=r2(v.linhas.filter(ded).reduce((s,l)=>s+(val(l)||0),0));
  const dedp=r2(vv*(v.dedp||0)/100),liq=r2(vv-dedp-dedc);
  const oi=r2((v.cm2||0)*A);b.pct_obra_tipica=oi;
  const raso=r2(oi+soma(['obra_atipica']));b.pct_obra_raso=raso;
  const ot=r2(raso+soma(['obra_nao_incidente']));b.pct_obra_total=ot;
  const obras=r2(ot+soma(['projetos','pos_obra']));
  const pfc=r2(liq*(v.pfp||0)/100),pf=Math.max(pfc,v.min||0),terr=r2(pf+(v.din||0)+(v.comd||0));
  const DT=[...VB_DG,'taxas','financeiro'],pl=v.linhas.filter(l=>l.tipo==='pct_lucro'&&DT.includes(vbGrupoLn(l))).reduce((s,l)=>s+(l.valor||0),0);
  const l0=r2(liq-terr-obras-(com-dedc)-soma(DT,true)),lb=l0>0?r2(l0/(1+pl/100)):0;b.pct_lucro=lb;
  const L={},GR={};let lu=0;
  v.linhas.forEach(l=>{const x=val(l),g=vbGrupoLn(l);L[l.id]={base:l.tipo==='verba_unidade'?unl:vbPct(l.tipo)||l.tipo==='area'?b[l.tipo]:null,valor:x,ded:ded(l)};
    GR[g]=r2((GR[g]||0)+(x||0));if(l.tipo==='pct_lucro')lu+=x||0});
  const sg=gs=>r2(gs.reduce((s,g)=>s+(GR[g]||0),0));
  const SEC={obra:obras,terreno:terr,despesas:sg(VB_DG),taxas:sg(['taxas']),financeiro:sg(['financeiro']),comercial:com};
  const lucro=r2(l0-lu),desp=r2(Object.values(SEC).reduce((s,x)=>s+x,0));
  return {A,un,unp,unc,unl,ap,ac,vgv,vp,vc,vv,dedp,dedc,liq,oi,raso,ot,obras,pfc,pf,minimo:pf>pfc,terr,desp,SEC,GR,lb,semTaxas:r2(lucro+SEC.taxas),ebitda:r2(lucro+SEC.taxas+SEC.financeiro),lucro,margem:liq>0?r2(lucro/liq*100):null,L}}

/* a negociação lê o resumo do estudo vinculado (no banco, processos.viabilidade_id e os totais do estudo) */
function vbResumo(v){const c=vbCalc(v);return {id:v.id,nome:v.nome,vgv:c.vgv,liq:c.liq,lucro:c.lucro,margem:c.margem,em:v.em}}
function vbSync(v){const t=T(v.tid);if(t?.neg?.viab?.id===v.id)t.neg.viab=vbResumo(v)}
const vbSyncTodos=()=>S.viabs.forEach(vbSync);
/* itens fixos (Taxas, Despesas financeiras e Despesas comerciais) sempre no estudo: o que faltar entra com a base e o valor da lista */
function vbFixos(v){S.viabDesp.forEach(d=>{if(d.ativo&&VB_GRUPO[d.grupo]?.fixo&&!v.linhas.some(l=>l.desp===d.codigo))
  v.linhas.push({id:uid(),desp:d.codigo,tipo:d.tipo||VB_GRUPO[d.grupo].tipos[0],valor:d.valor??null,qtd:1})});return v}
const vbNovo=(tid,nome)=>vbFixos({id:uid(),tid,nome,em:HOJE,user:me(),cm2:null,pfp:null,dedp:null,min:null,deduz:[],din:null,comd:null,
  tips:[{id:uid(),nome:'Tipologia 1',area:null,qtd:null,perm:0,com:0,pu:null,pm2:null}],linhas:[]});

/* ---------- modelos de estudo (decisão do Moisés, 26/out/2026; no banco, app.viabilidade_modelos) ----------
   Da empresa (dono nulo; só o administrador grava; um pode ser o padrão, usado no estudo novo quando ninguém
   escolhe outro) ou do usuário (só ele vê). Guardam o valor da obra, a dedução do VGV, o que sai do VGV
   líquido e as linhas (item, base, valor, meses); tipologias e as condições do terreno ficam fora. Taxas e
   Despesas financeiras só entram no modelo gravado pela diretoria e só se aplicam de modelo da empresa ou
   para a diretoria; senão, valem os padrões da lista. */
const vbModelos=()=>(S.viabModelos||[]).filter(m=>!m.dono||m.dono===me()).sort((a,b)=>(!!a.dono-!!b.dono)||(b.padrao-a.padrao)||a.nome.localeCompare(b.nome,'pt-BR'));
const vbModeloPadrao=()=>(S.viabModelos||[]).find(m=>m.padrao&&!m.dono);
function vbModeloDados(v){const dir=vbDiretoria();
  return {cm2:v.cm2,dedp:v.dedp,deduz:[...v.deduz],linhas:v.linhas.filter(l=>{const d=vbDesp(l.desp);return d&&(!VB_RESTRITO.includes(VB_GRUPO[d.grupo]?.secao)||dir)})
    .map(l=>({desp:l.desp,tipo:l.tipo,valor:l.valor,qtd:l.qtd??1}))}}
function vbAplicarModelo(v,m){const x=m.dados,dir=vbDiretoria(),vistos=new Set();
  v.cm2=x.cm2??null;v.dedp=x.dedp??null;v.deduz=(x.deduz||[]).filter(c=>vbDesp(c)?.deduz);
  x.linhas.forEach(l=>{const d=vbDesp(l.desp),G=VB_GRUPO[d?.grupo];if(!d?.ativo||!G.tipos.includes(l.tipo))return;
    if(VB_RESTRITO.includes(G.secao)&&m.dono&&!dir)return;if(G.fixo){if(vistos.has(d.codigo))return;vistos.add(d.codigo)}
    v.linhas.push({id:uid(),desp:d.codigo,tipo:l.tipo,valor:l.valor,qtd:l.qtd??1})});
  return vbFixos(v)}
function vbCriar(tid,nome,mid){const v={...vbNovo(tid,nome),linhas:[]},m=mid?(S.viabModelos||[]).find(x=>x.id===mid):null;
  if(m)vbAplicarModelo(v,m);else vbFixos(v);v.modelo=m?.nome||null;S.viabs.push(v);
  log(T(tid),`Estudo de viabilidade criado: ${v.nome}${m?` (modelo ${m.nome})`:''}`);save();UI.modal=null;renderModal();vbAbrir(v.id)}

/* dados de exemplo: um estudo para cada negociação que já tinha viabilidade, montado para dar perto do VGV e da margem de antes */
function vbExemplo(t,x,i){const v=vbNovo(t.id,x.nome);v.em=x.em||HOJE;v.user=t.resp||'Rafael Souza';
  const N=Math.max(20,Math.round(x.vgv/323400)),nA=Math.round(N*.7),perm=i===0?6:0;
  v.tips=[{id:uid(),nome:'2 dormitórios',area:40,qtd:nA,perm,com:0,pu:300000,pm2:7500},{id:uid(),nome:'2 dormitórios com suíte',area:48,qtd:N-nA,perm:0,com:0,pu:378000,pm2:7875}];
  const vv=nA*300000+(N-nA)*378000-perm*300000,A=nA*40+(N-nA)*48,m=(x.margem??15)/100,terreno=Math.round(vv*.12),itbi=Math.round(terreno*.03/1000)*1000;
  v.din=terreno;v.cm2=Math.max(1500,Math.round((vv*(1-m-.095)-terreno-itbi)/1.03/A/10)*10);
  const fx=(c,valor)=>{const l=v.linhas.find(y=>y.desp===c);if(l)l.valor=valor};fx('comissao',4);fx('marketing',1.5);fx('impostos',4);
  v.linhas.push({id:uid(),desp:'projetos',tipo:'pct_obra_total',valor:3,qtd:1},{id:uid(),desp:'itbi_terreno',tipo:'verba',valor:itbi,qtd:1});
  return v}
function viabPreparar(){
  if(S.vbMargemMin===undefined)S.vbMargemMin=15;
  /* Alavancagem, Custo financeiro e Impostos saíram de Taxas para Despesas financeiras e entrou o Custo de juros PJ (26/out/2026) */
  S.viabDesp?.forEach(d=>{if(d.grupo==='taxas'&&VB_CFG.despesas.some(x=>x.codigo===d.codigo&&x.grupo==='financeiro'))d.grupo='financeiro'});
  if(S.viabDesp&&!S.viabDesp.some(d=>d.codigo==='juros_pj')){const j=VB_CFG.despesas.find(d=>d.codigo==='juros_pj'),i=S.viabDesp.findIndex(d=>d.codigo==='custo_alavancagem');
    S.viabDesp.splice(i<0?S.viabDesp.length:i+1,0,{codigo:j.codigo,nome:j.nome,grupo:j.grupo,tipo:j.tipo,valor:j.valor,deduz:j.deduz,ativo:true})}
  /* estudo no formato de antes de 26/out (multiplicador, "compõe a obra"): refaz a lista e os exemplos */
  if(S.viabDesp&&(S.viabDesp.some(d=>!VB_GRUPO[d.grupo])||S.viabs?.some(v=>v.linhas.some(l=>'mult' in l)))){S.viabDesp=null;S.viabs=null;S.terrenos.forEach(t=>{if(t.neg?.viab)delete t.neg.viab.id})}
  if(!S.viabModelos)S.viabModelos=[];
  if(!S.viabDesp)S.viabDesp=VB_CFG.despesas.map(d=>({codigo:d.codigo,nome:d.nome,grupo:d.grupo,tipo:d.tipo,valor:d.valor,deduz:d.deduz,ativo:true}));
  if(!S.viabs){S.viabs=[];let i=0;S.terrenos.forEach(t=>{const x=t.neg?.viab;if(!x||x.id)return;const v=vbExemplo(t,x,i++);S.viabs.push(v);t.neg.viab=vbResumo(v)})}}

/* ---------- seção Viabilidade da negociação ---------- */
function viabSecao(t){const vs=viabsDe(t.id),vi=t.neg?.viab,ro=UI.role==='Leitura',ad=areaAdotada(t);
  const novo=!ro?`<button class="btn sm" data-a="vb-novo">${ic('add',16)}Novo estudo</button>`:'';
  const ligado=vi?`<div class="metrics vb-met"><div class="metric"><div class="ml">VGV líquido</div><div class="mv">${mi(vi.liq??vi.vgv)}</div></div><div class="metric"><div class="ml">Margem líquida</div><div class="mv">${vi.margem==null?'—':num(vi.margem,1)+'%'}</div></div><div class="metric"><div class="ml">Rentabilidade mínima</div><div class="mv">${S.vbMargemMin==null?'—':num(S.vbMargemMin,1)+'%'}</div></div></div>
    ${abaixoMin(t)?`<div class="banner warn" style="margin-top:12px">${ic('warn')}<div>${abaixoMinTxt(t)}.</div></div>`:''}
    <div class="faint" style="font-size:12px;margin-top:10px">Estudo válido: ${esc(vi.nome)} · ${fd(vi.em)}</div>`:'';
  const lista=vs.length?`<div class="dt-wrap vb-lista"><table class="dt compacta"><thead><tr><th class="esq">Estudo</th><th>VGV líquido</th><th>Lucro líquido</th><th>Margem</th><th>Atualizado</th><th>Válido</th></tr></thead><tbody>
    ${vs.map(v=>{const c=vbCalc(v),lig=vi?.id===v.id;return `<tr><td class="esq"><button class="linkbtn" data-a="vb-abrir" data-v="${v.id}">${esc(v.nome)}</button></td><td class="num">${mi(c.liq)}</td><td class="num">${mi(c.lucro)}</td><td class="num">${c.margem==null?'—':num(c.margem,1)+'%'}</td><td>${fd(v.em)}</td>
      <td><label class="vb-radio"><input type="radio" name="vb-valido-${t.id}" ${lig?'checked':''} ${lig?'':negAtiva(t)&&!ro?`data-a="vb-vincular" data-v="${v.id}"`:'disabled'} aria-label="${esc(v.nome)} é o estudo válido"></label></td></tr>`}).join('')}</tbody></table></div>`
    :`<div class="banner blue">${ic('money')}<div style="flex:1"><div class="bt">Nenhum estudo</div><div>Monte o estudo de viabilidade estática: tipologias, custos e resultado (VGV líquido, lucro e margem).</div></div></div>`;
  return `<section class="sec" id="sec-viab"><div class="sec-h"><h2>Viabilidade</h2>${novo}</div><div class="sec-b">${ligado}${ligado&&vs.length?'<div style="height:16px"></div>':''}${lista}</div></section>`}

/* ---------- o estudo, num popup aberto pela ficha (decisão do Moisés, 26/out/2026) ----------
   Indicadores fixos no topo enquanto rola; seções na ordem Tipologias, Custo do terreno, Despesas comerciais,
   Custo de obras, Despesas gerais, Despesas financeiras, Taxas e DRE, uma de cada vez: os botões das seções ficam sob os indicadores,
   sempre visíveis ao rolar, cada um com o total e o % do VGV, e o fim da seção leva à anterior e à próxima
   (decisão do Moisés, 26/out/2026). Tudo se edita no lugar e o resultado se refaz enquanto digita. */
const VB_ADD={obra_atipica:'Adicionar item atípico',obra_nao_incidente:'Adicionar item',projetos:'Adicionar projeto',pos_obra:'Adicionar item',terreno:'Adicionar despesa',incorporacao:'Adicionar despesa',cef:'Adicionar despesa',adm_financeiro:'Adicionar despesa'};
const VB_ORDEM=['tip','terreno','comercial','obra','despesas','financeiro','taxas','res'];
/* Despesas financeiras e Taxas: só a diretoria ou o administrador vê as abas e muda os valores */
const VB_RESTRITO=['financeiro','taxas'];
const vbDiretoria=()=>UI.role==='Diretor'||ehAdmin(me());
const vbOrdem=()=>vbDiretoria()?VB_ORDEM:VB_ORDEM.filter(k=>!VB_RESTRITO.includes(k));
const VB_ROT={tip:'Tipologias',terreno:'Terreno',comercial:'Comercial',obra:'Obras',despesas:'Gerais',taxas:'Taxas',financeiro:'Financeiras',res:'DRE'};
const vbAba=()=>vbOrdem().includes(UI.vbAba)?UI.vbAba:'tip';
function vbShTxt(k,c){if(k==='tip')return `${brl(c.vgv)} · ${num(c.un)} unidades`;if(k==='res')return `Lucro ${brl(c.lucro)} · margem ${c.margem==null?'—':num(c.margem,1)+'%'}`;
  const x=c.SEC[k];return `${brl(x)} · ${c.vgv>0?num(x/c.vgv*100,1)+'%':'—'} do VGV`}
const vbMiC=x=>mi(x).replace(/R\$\s/,'');
function vbNavTxt(k,c){if(k==='tip')return vbMiC(c.vgv);if(k==='res')return 'Margem '+(c.margem==null?'—':num(c.margem,1)+'%');
  const x=c.SEC[k];return `${vbMiC(x)} · ${c.vgv>0?num(x/c.vgv*100,1)+'%':'—'}`}
const vbNav=c=>{const ab=vbAba();return `<nav class="vb-nav" aria-label="Seções do estudo">${vbOrdem().map(k=>`<button class="vb-aba" data-a="vb-aba" data-v="${k}"${k===ab?' aria-current="page"':''}><b>${VB_ROT[k]}</b><small data-vbo="nv-${k}">${vbNavTxt(k,c)}</small></button>`).join('')}</nav>`};
function vbSec(k,titulo,c,corpo,acao=''){const O=vbOrdem(),i=O.indexOf(k),ant=O[i-1],prox=O[i+1];
  const passo=(x,seta)=>x?`<button class="btn text sm" data-a="vb-aba" data-v="${x}">${seta<0?'‹ ':''}${VB_ROT[x]}${seta>0?' ›':''}</button>`:'<span></span>';
  return `<section class="sec vb-sec" id="vb-sec-${k}" aria-labelledby="vb-st-${k}"><div class="sec-h vb-sh"><h2 id="vb-st-${k}">${titulo}</h2>
    <span class="vb-sh-t" data-vbo="sh-${k}">${vbShTxt(k,c)}</span>${acao}</div>
    <div class="sec-b">${corpo()}</div><div class="vb-passo">${passo(ant,-1)}${passo(prox,1)}</div></section>`}
function vbPopHtml(){const v=VB(UI.vbPop);vbFixos(v);
  const t=T(v.tid),c=vbCalc(v),ro=UI.role==='Leitura',lig=t.neg?.viab?.id===v.id,dis=ro?'disabled':'';
  const acoes=ro?'':`${lig?'':negAtiva(t)?`<button class="btn sm" data-a="vb-vincular" data-v="${v.id}">Marcar como válido</button>`:''}<button class="btn sm" data-a="vb-duplicar" data-v="${v.id}">Duplicar</button><button class="btn sm" data-a="vb-modelo" data-v="${v.id}">Salvar como modelo</button>${lig?'':`<button class="btn text sm danger" data-a="vb-apagar" data-v="${v.id}">Apagar</button>`}`;
  const inp=(id,k,val,d,rot)=>`<label class="vb-c vb-${k}"><span class="vb-l">${rot}</span><input data-vb="tp" data-r="${id}" data-k="${k}" ${k==='nome'?'':`data-fmt="${['pu','pm2'].includes(k)?'moeda':['qtd','perm','com'].includes(k)?'int':'num'}"`} value="${k==='nome'?esc(val??''):vbIn(val,d)}" ${k==='nome'?'':'inputmode="decimal"'} aria-label="${rot}" ${dis}></label>`;
  const campo=(k,rot,val,d=2,dica='')=>`<div class="field"><label for="vb-${k}">${rot}</label><input id="vb-${k}" data-vb="hd" data-k="${k}" data-fmt="${k==='pfp'||k==='dedp'?'pct':'moeda'}" value="${vbIn(val,d)}" inputmode="decimal" ${dis}>${dica?`<div class="hint">${dica}</div>`:''}</div>`;
  const hd=`<div class="vb-r vb-hd" aria-hidden="true"><span>Item</span><span>Base de cálculo</span><span>Valor</span><span>Meses</span><span>Resultado</span><span></span></div>`;
  const tot=(id,rot,x,cls='')=>`<div class="vb-r vb-tot ${cls}" id="${id}">${vbTotRow(rot,x,c)}</div>`;
  const grupo=g=>{const G=VB_GRUPO[g],ls=vbLinhasGrupo(v,g);
    return `<div class="vb-gt"><h3>${G.nome}</h3>${ro||G.fixo?'':`<button class="btn text sm" data-a="vb-ln-add" data-v="${g}">${ic('add',16)}${VB_ADD[g]}</button>`}</div>
      ${ls.map(l=>vbLinha(v,l,c,dis,ro)).join('')||(UI.vbNova===g&&!ro?'':'<div class="muted vb-vazio">Nenhum item.</div>')}${UI.vbNova===g&&!ro?vbNovaLinha(g):''}
      ${G.fixo?'':tot('vb-gst-'+g,'Subtotal · '+G.nome,c.GR[g]||0,'vb-st')}`};
  const tips=()=>`<div class="vb-tab vb-tips"><div class="vb-r vb-hd" aria-hidden="true"><span>Tipologia</span><span>Área privativa (m²)</span><span>Quantidade</span><span>Em permuta</span><span>Comissão</span><span>Preço unitário (R$)</span><span>Preço por m² (R$)</span><span>VGV</span><span></span></div>
    ${v.tips.map(p=>`<div class="vb-r" data-tp="${p.id}">${inp(p.id,'nome',p.nome,0,'Tipologia')}${inp(p.id,'area',p.area,2,'Área privativa (m²)')}${inp(p.id,'qtd',p.qtd,0,'Quantidade')}${inp(p.id,'perm',p.perm,0,'Em permuta')}${inp(p.id,'com',p.com,0,'Comissão')}${inp(p.id,'pu',p.pu,2,'Preço unitário (R$)')}${inp(p.id,'pm2',p.pm2,2,'Preço por m² (R$)')}
    <span class="vb-c vb-out"><span class="vb-l">VGV</span><b data-vbo="tp-${p.id}">${brl(p.pu!=null?(p.qtd||0)*p.pu:null)}</b></span>${ro?'<span></span>':`<button class="iconbtn sm vb-del" data-a="vb-tip-del" data-v="${p.id}" aria-label="Remover ${esc(p.nome)}" title="Remover tipologia">${ic('close',18)}</button>`}</div>`).join('')||'<div class="muted vb-vazio">Nenhuma tipologia.</div>'}
    <div class="vb-r vb-tot" id="vb-tot-tips">${vbTotTips(v,c)}</div></div>
    `;
  const dedutiveis=S.viabDesp.filter(d=>d.grupo==='comercial'&&d.deduz&&(d.ativo||v.deduz.includes(d.codigo)));
  const terreno=()=>`<h3 class="vb-h3 vb-h3-1">Permuta física</h3><div class="vb-ro" data-vbo="pfis">${vbPermFis(c)}</div>
    <h3 class="vb-h3">Permuta financeira</h3>
    <div class="editgrid vb-campos">${campo('pfp','Permuta financeira (% do VGV líquido)',v.pfp,4)}${campo('dedp','Dedução do VGV para o VGV líquido (%)',v.dedp,4)}${campo('min','Valor mínimo garantido (R$)',v.min)}</div>
    <fieldset class="vb-chks"><legend>Deduzir também do VGV a verba prevista em ${VB_SECAO.comercial}</legend>
      ${dedutiveis.map(d=>{const l=v.linhas.find(x=>x.desp===d.codigo);return `<label class="chk"><input type="checkbox" data-vb="ded" value="${d.codigo}" ${v.deduz.includes(d.codigo)?'checked':''} ${dis}><span>${esc(d.nome)} <small class="faint" data-vbo="dd-${d.codigo}">${l?brl(c.L[l.id].valor):'—'}</small></span></label>`}).join('')}</fieldset>
    <div class="vb-ro" data-vbo="pfin">${vbPermFin(v,c)}</div>
    <h3 class="vb-h3">Pagamento em dinheiro</h3><div class="editgrid vb-campos">${campo('din','Valor pago em dinheiro (R$)',v.din)}</div>
    <h3 class="vb-h3">Comissão</h3><div class="vb-ro" data-vbo="pcom">${vbComissao(c)}</div>
    <div class="editgrid vb-campos">${campo('comd','Comissão em dinheiro (R$)',v.comd)}</div>
    <div class="vb-tab vb-lns">${tot('vb-tot-terreno','Total · '+VB_SECAO.terreno,c.SEC.terreno)}</div>`;
  const obra=()=>`<div class="vb-tab vb-lns">${hd}
    <div class="vb-gt"><h3>Custo de obra incidente (típico)</h3></div>
    <div class="vb-r" data-ln="oi"><span class="vb-c vb-desp"><span class="vb-l">Item</span><span class="vb-nome">Obra incidente</span></span><span class="vb-c vb-tipo"><span class="vb-l">Base de cálculo</span><span class="vb-nome">${VB_TIPO.area}</span></span>
      <label class="vb-c vb-mult"><span class="vb-l">Valor unitário</span><input data-fmt="moeda" data-vb="hd" data-k="cm2" value="${vbIn(v.cm2,2)}" inputmode="decimal" aria-label="Valor unitário da obra incidente (R$ por m²)" ${dis}></label><span class="vb-c vb-qtd"></span>
      <span class="vb-c vb-out"><span class="vb-l">Resultado</span><b data-vbo="oi">${brl(c.oi)}</b><small class="faint" data-vbo="oi-b">× ${m2(c.A)} de área privativa</small></span><span></span></div>
    ${grupo('obra_atipica')}${tot('vb-raso','Custo de obra raso (incidente + atípicos)',c.raso,'vb-marco')}
    ${grupo('obra_nao_incidente')}${tot('vb-ot','Custo de obra total (raso + não incidente)',c.ot,'vb-marco')}
    ${grupo('projetos')}${grupo('pos_obra')}${tot('vb-tot-obra','Total · '+VB_SECAO.obra,c.SEC.obra)}</div>`;
  const lns=sec=>()=>`<div class="vb-tab vb-lns">${hd}
    ${vbGruposDe(sec).map(g=>VB_GRUPO[g].fixo?vbLinhasGrupo(v,g).map(l=>vbLinha(v,l,c,dis,ro)).join(''):grupo(g)).join('')}${tot('vb-tot-'+sec,'Total · '+VB_SECAO[sec],c.SEC[sec])}</div>`;
  const corpo={tip:tips,terreno,comercial:lns('comercial'),obra,despesas:lns('despesas'),taxas:lns('taxas'),financeiro:lns('financeiro'),
    res:()=>`<div id="vb-res">${vbResHtml(v,c)}</div>`};
  const titulo={tip:'Tipologias',res:'DRE',...VB_SECAO};
  const acao={tip:ro?'':`<button class="btn text sm" data-a="vb-tip-add">${ic('add',16)}Adicionar tipologia</button>`};
  const sobre=`<span>Viabilidade · ${esc(t.codigo)} · ${esc(t.nome)}</span>${lig?'<span class="chip good"><span class="d"></span>Válido</span>':''}`,ab=vbAba();
  return `<div class="vb-pop-h"><div class="vb-pop-tt"><div class="eyebrow">${sobre}</div>
      <input id="vb-pop-t" class="vb-pop-nome" data-vb="hd" data-k="nome" value="${esc(v.nome)}" aria-label="Nome do estudo" ${dis}>
      <div class="faint vb-sub">Atualizado em ${fd(v.em)}${v.user?' por '+esc(v.user):''}.</div></div>
    <div class="vb-acoes">${acoes}</div><button class="iconbtn vb-pop-x" data-a="vb-fechar" aria-label="Fechar o estudo" title="Fechar (Esc)">${ic('close')}</button></div>
  <div class="vb-pop-sc"><div class="vb-pop-meta"><div class="eyebrow">${sobre}</div>${acoes?`<div class="vb-acoes">${acoes}</div>`:''}</div>
    <div class="vb-fixo"><div class="kpis vb-kpis" id="vb-kpis">${vbKpis(c)}</div>${vbNav(c)}</div>
    ${vbSec(ab,titulo[ab],c,corpo[ab],acao[ab]||'')}</div>`}
function vbPopRender(){let el=document.getElementById('vb-pop');
  if(UI.vbPop&&(!VB(UI.vbPop)||UI.route!==UI.vbPopRota))UI.vbPop=null;
  if(!UI.vbPop){if(el){el.remove();document.body.classList.remove('vb-aberto')}return}
  const novo=!el;if(novo){el=document.createElement('div');el.id='vb-pop';el.className='vb-pop';document.body.appendChild(el)}
  const sc=el.querySelector('.vb-pop-sc')?.scrollTop||0;UI.vid=UI.vbPop;
  el.innerHTML=`<div class="vb-pop-fundo" data-a="vb-fechar"></div><div class="vb-pop-d" role="dialog" aria-modal="true" aria-labelledby="vb-pop-t">${vbPopHtml()}</div>`;
  el.querySelector('.vb-pop-sc').scrollTop=novo?0:sc;document.body.classList.add('vb-aberto');if(novo)el.querySelector('.vb-pop-x')?.focus()}
function vbAbrir(id){UI.vbPop=id;UI.vid=id;UI.vbPopRota=UI.route;UI.vbNova=false;UI.vbAba='tip';render()}
const _renderVb=render;render=function(){_renderVb.apply(this,arguments);vbPopRender()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&UI.vbPop&&!UI.modal&&!e.defaultPrevented){e.preventDefault();UI.vbPop=null;render()}});
/* linhas de um grupo; nos fixos, na ordem da lista da empresa */
function vbLinhasGrupo(v,g){const ls=v.linhas.filter(l=>vbGrupoLn(l)===g);if(!VB_GRUPO[g]?.fixo)return ls;
  const o=c=>S.viabDesp.findIndex(d=>d.codigo===c);return ls.filter(l=>vbDesp(l.desp)?.ativo||l.valor!=null).sort((a,b)=>o(a.desp)-o(b.desp))}
function vbLinha(v,l,c,dis,ro){const d=vbDesp(l.desp),g=d?.grupo,fixo=VB_GRUPO[g]?.fixo,nome=d?d.nome+(d.ativo?'':' (inativo)'):l.desp;
  if(VB_RESTRITO.includes(VB_GRUPO[g]?.secao)&&!vbDiretoria())dis='disabled';
  return `<div class="vb-r" data-ln="${l.id}"><span class="vb-c vb-desp"><span class="vb-l">Item</span>${fixo?`<span class="vb-nome">${esc(nome)}</span>`:vbCombo(l.id,nome,dis,g)}</span>
    <label class="vb-c vb-tipo"><span class="vb-l">Base de cálculo</span><select data-vb="ln" data-r="${l.id}" data-k="tipo" aria-label="Base de cálculo de ${esc(nome)}" ${dis}>${(VB_GRUPO[g]?.tipos||[l.tipo]).map(k=>`<option value="${k}" ${l.tipo===k?'selected':''}>${VB_TIPO[k]}</option>`).join('')}</select></label>
    <label class="vb-c vb-mult"><span class="vb-l">${l.tipo==='area'?'Valor unitário':'Valor'}</span><input data-fmt="${vbPct(l.tipo)?'pct':'moeda'}" data-vb="ln" data-r="${l.id}" data-k="valor" value="${vbIn(l.valor,4)}" inputmode="decimal" aria-label="Valor de ${esc(nome)}" ${dis}></label>
    ${l.tipo==='verba_mensal'?`<label class="vb-c vb-qtd"><span class="vb-l">Meses</span><input data-vb="ln" data-r="${l.id}" data-k="qtd" value="${vbIn(l.qtd,2)}" inputmode="decimal" aria-label="Meses de ${esc(nome)}" ${dis}></label>`:'<span class="vb-c vb-qtd"></span>'}
    <span class="vb-c vb-out"><span class="vb-l">Resultado</span><b data-vbo="ln-${l.id}">${brl(c.L[l.id].valor)}</b><small class="faint" data-vbo="lb-${l.id}">${vbBaseTxt(l,c)}</small></span>${ro||fixo?'<span></span>':`<button class="iconbtn sm vb-del" data-a="vb-ln-del" data-v="${l.id}" aria-label="Remover ${esc(nome)}" title="Remover">${ic('close',18)}</button>`}</div>`}
const vbNovaLinha=g=>`<div class="vb-r vb-nova"><span class="vb-c vb-desp"><span class="vb-l">Item</span>${vbCombo('nova','','',g)}</span><span class="vb-c vb-dica faint">Escolha na lista da empresa; a base de cálculo e o valor vêm preenchidos e podem ser trocados.</span><button class="iconbtn sm vb-del" data-a="vb-ln-cancela" aria-label="Cancelar" title="Cancelar">${ic('close',18)}</button></div>`;
function vbCombo(id,txt,dis,g){return `<span class="vb-cb"><input data-vb-cb="${id}" data-grupo="${g}" value="${esc(txt)}" placeholder="Buscar na lista" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="vb-dd-${id}" aria-label="Item" ${dis}><span class="vb-dd" id="vb-dd-${id}" role="listbox" hidden></span></span>`}
function vbBaseTxt(l,c){const L=c.L[l.id],b=L?.base,d=L?.ded?' · sai do VGV líquido':'';
  switch(l.tipo){case 'pct_vgv':return `sobre o VGV vendido (${mi(b)})${d}`;case 'pct_obra_tipica':return `sobre a obra típica (${mi(b)})`;case 'pct_obra_raso':return `sobre a obra raso (${mi(b)})`;
    case 'pct_obra_total':return `sobre a obra total (${mi(b)})`;case 'pct_lucro':return `sobre o lucro líquido (${mi(b)})`;case 'area':return `× ${m2(b)}`;
    case 'verba_unidade':return `× ${num(b)} unidades líquidas${d}`;case 'verba_mensal':return `${l.qtd&&l.qtd!==1?num(l.qtd,2)+' meses':'1 mês'}${d}`;default:return d.slice(3)}}
function vbKpis(c){const k=(l,val)=>`<div class="kpi"><span class="v sm">${String(val).replace(/R\$\s/,'<span class="vb-rs">R$ </span>')}</span><span class="l">${l}</span></div>`;
  return k('VGV',mi(c.vgv))+k('VGV líquido',mi(c.liq))+k('Lucro líquido',mi(c.lucro))+k('Margem líquida',c.margem==null?'—':num(c.margem,1)+'%')}
function vbTotTips(v,c){return `<span class="vb-c"><b>Total</b></span><span class="vb-c vb-area"><span class="vb-l">Área privativa total</span>${c.A?m2(c.A):'—'}</span><span class="vb-c vb-qtd"><span class="vb-l">Unidades</span>${num(c.un)}</span><span class="vb-c vb-perm"><span class="vb-l">Em permuta</span>${num(c.unp)}</span><span class="vb-c vb-com"><span class="vb-l">Comissão</span>${num(c.unc)}</span><span class="vb-c vb-pu"><span class="vb-l">Preço médio</span>${c.un?brl(c.vgv/c.un):'—'}</span><span class="vb-c vb-pm2"><span class="vb-l">Preço médio por m²</span>${c.A?brl(c.vgv/c.A):'—'}</span><span class="vb-c vb-out"><span class="vb-l">VGV</span><b>${brl(c.vgv)}</b></span><span></span>`}
function vbTotRow(rot,x,c){return `<span class="vb-c"><b>${rot}</b></span><span class="vb-c vb-tipo"></span><span class="vb-c vb-mult"></span><span class="vb-c vb-qtd"></span><span class="vb-c vb-out"><span class="vb-l">Total</span><b>${brl(x)}</b><small class="faint">${c.vgv>0?num(x/c.vgv*100,1)+'% do VGV':''}</small></span><span></span>`}
const vbPctTxt=(a,b)=>b>0?num(a/b*100,1)+'%':'—';
const vbRo=items=>items.map(([l,v,s])=>`<div><span class="vb-rl">${l}</span><b>${v}</b>${s?`<small class="faint">${s}</small>`:''}</div>`).join('');
const vbPermFis=c=>vbRo([['Unidades permutadas',num(c.unp)],['Área privativa permutada',c.ap?m2(c.ap):'—'],['% das unidades',vbPctTxt(c.unp,c.un)],['% da área privativa',vbPctTxt(c.ap,c.A)]]);
const vbPermFin=(v,c)=>vbRo([['VGV vendido',brl(c.vv),'sem permuta e comissão'],['Deduções',brl(r2(c.dedp+c.dedc)),`${v.dedp?num(v.dedp,2)+'% = '+brl(c.dedp):'sem %'}${c.dedc?' + '+brl(c.dedc)+' comerciais':''}`],['VGV líquido',brl(c.liq)],
  ['Permuta financeira',brl(c.pf),c.minimo?`mínimo garantido (o % daria ${brl(c.pfc)})`:v.pfp?`${num(v.pfp,2)}% do VGV líquido`:'']]);
const vbComissao=c=>vbRo([['Unidades da comissão',num(c.unc)],['Área privativa da comissão',c.ac?m2(c.ac):'—']]);
/* DRE do estudo (decisão do Moisés, 26/out/2026): da receita bruta ao lucro líquido, com o detalhe de cada grupo;
   análise vertical sobre a receita líquida (VGV líquido). Mesmos números de vbCalc: só muda a apresentação. */
function vbResHtml(v,c){const pct=x=>c.liq>0&&x!=null?num(x/c.liq*100,1)+'%':'';
  const ln=(rot,x,cls='')=>`<tr class="${cls}"><td class="esq">${rot}</td><td class="num">${brl(x)}</td><td class="num">${pct(x)}</td></tr>`;
  const sub=(rot,x)=>x?ln(rot,x,'vb-sub'):'';
  const itens=(ls)=>ls.map(l=>sub(esc(vbDesp(l.desp)?.nome||l.desp),c.L[l.id]?.valor)).join('');
  const lsDe=gs=>v.linhas.filter(l=>gs.includes(vbGrupoLn(l)));
  const dedLs=v.linhas.filter(l=>c.L[l.id]?.ded),comLs=lsDe(['comercial']).filter(l=>!c.L[l.id]?.ded);
  const bruto=r2(c.liq-c.SEC.terreno-c.SEC.obra),com=r2(c.SEC.comercial-c.dedc);
  const det=gs=>vbDiretoria()?itens(lsDe(gs)):'';
  return `<div class="dt-wrap"><table class="dt compacta vb-rt vb-dre"><thead><tr><th class="esq">Demonstração do resultado</th><th>Valor</th><th>% da receita líquida</th></tr></thead><tbody>
    ${ln(`Receita bruta de vendas (VGV, ${num(c.un)} unidades)`,c.vgv,'forte')}
    ${c.vp?ln(`(−) Permuta física (${num(c.unp)} unidades)`,c.vp):''}${c.vc?ln(`(−) Unidades dadas na comissão (${num(c.unc)})`,c.vc):''}
    ${c.vp||c.vc?ln('(=) VGV vendido',c.vv,'forte'):''}
    ${ln('(−) Deduções da receita',r2(c.dedp+c.dedc))}${c.dedp?sub(`Dedução de ${num(v.dedp,2)}% do VGV`,c.dedp):''}${itens(dedLs)}
    ${ln('(=) Receita líquida (VGV líquido)',c.liq,'vb-tt')}
    ${ln('(−) '+VB_SECAO.terreno,c.SEC.terreno)}${sub(c.minimo?'Permuta financeira (mínimo garantido)':'Permuta financeira',c.pf)}${sub('Pagamento em dinheiro',v.din)}${sub('Comissão em dinheiro',v.comd)}
    ${ln('(−) '+VB_SECAO.obra,c.SEC.obra)}${sub('Obra incidente',c.oi)}${['obra_atipica','obra_nao_incidente','projetos','pos_obra'].map(g=>sub(VB_GRUPO[g].nome,c.GR[g])).join('')}
    ${ln('(=) Lucro bruto',bruto,'vb-tt')}
    ${ln(`(−) ${VB_SECAO.comercial}${c.dedc?' (fora as deduzidas da receita)':''}`,com)}${itens(comLs)}
    ${ln('(−) '+VB_SECAO.despesas,c.SEC.despesas)}${VB_DG.map(g=>sub(VB_GRUPO[g].nome,c.GR[g])).join('')}
    ${ln('(=) EBITDA',c.ebitda,'vb-tt')}
    ${ln('(−) '+VB_SECAO.financeiro,c.SEC.financeiro)}${det(['financeiro'])}
    ${ln('(=) Resultado sem as taxas',c.semTaxas,'vb-tt forte')}
    <tr class="vb-tt"><td class="esq">Margem sem as taxas</td><td class="num">${c.liq>0?num(c.semTaxas/c.liq*100,2)+'%':'—'}</td><td></td></tr>
    ${ln('(−) '+VB_SECAO.taxas,c.SEC.taxas)}${det(['taxas'])}
    ${ln('(=) Lucro líquido (pagando as taxas)',c.lucro,'vb-tt forte')}
    <tr class="vb-tt forte"><td class="esq">Margem líquida</td><td class="num">${c.margem==null?'—':num(c.margem,2)+'%'}</td><td></td></tr></tbody></table></div>
    <div class="faint vb-obra">Margem bruta ${c.liq>0?num(bruto/c.liq*100,1)+'%':'—'} · obra raso ${brl(c.raso)} · obra total ${brl(c.ot)}</div>`}

/* atualiza só os números (o campo em edição mantém o foco) */
function vbRefresh(v){const c=vbCalc(v),set=(k,h)=>{const el=document.querySelector(`[data-vbo="${k}"]`);if(el)el.innerHTML=h};
  v.tips.forEach(p=>set('tp-'+p.id,brl(p.pu!=null?(p.qtd||0)*p.pu:null)));
  v.linhas.forEach(l=>{if(!c.L[l.id])return;set('ln-'+l.id,brl(c.L[l.id].valor));set('lb-'+l.id,vbBaseTxt(l,c));set('dd-'+l.desp,brl(c.L[l.id].valor))});
  set('oi',brl(c.oi));set('oi-b',`× ${m2(c.A)} de área privativa`);set('pfis',vbPermFis(c));set('pfin',vbPermFin(v,c));set('pcom',vbComissao(c));
  const h=(id,x)=>{const el=document.getElementById(id);if(el)el.innerHTML=x};
  h('vb-kpis',vbKpis(c));h('vb-tot-tips',vbTotTips(v,c));h('vb-raso',vbTotRow('Custo de obra raso (incidente + atípicos)',c.raso,c));h('vb-ot',vbTotRow('Custo de obra total (raso + não incidente)',c.ot,c));
  Object.keys(VB_GRUPO).forEach(g=>h('vb-gst-'+g,vbTotRow('Subtotal · '+VB_GRUPO[g].nome,c.GR[g]||0,c)));
  Object.keys(VB_SECAO).forEach(k=>h('vb-tot-'+k,vbTotRow('Total · '+VB_SECAO[k],c.SEC[k],c)));h('vb-res',vbResHtml(v,c));VB_ORDEM.forEach(k=>{set('sh-'+k,vbShTxt(k,c));set('nv-'+k,vbNavTxt(k,c))})}
function vbGravar(v){v.em=HOJE;v.user=me();vbSync(v);save()}

/* ---------- lista de itens (busca) ---------- */
let vbDdAtivo=-1;
function vbDdItens(q,g){const n=vbSemAcento(q);return S.viabDesp.filter(d=>d.ativo&&d.grupo===g&&(!n||vbSemAcento(d.nome).includes(n)))}
function vbDdAbrir(inp,filtrar){const dd=inp.parentElement.querySelector('.vb-dd'),its=vbDdItens(filtrar?inp.value:'',inp.dataset.grupo);vbDdAtivo=its.length?0:-1;
  dd.innerHTML=its.map((d,i)=>`<span class="vb-dd-i" role="option" id="vb-op-${i}" data-vb-op="${d.codigo}" aria-selected="${i===vbDdAtivo}"><span>${esc(d.nome)}</span><small class="faint">${VB_TIPO[d.tipo]||''}${d.valor!=null?` · ${vbIn(d.valor,4)}${vbPct(d.tipo)?'%':''}`:''}</small></span>`).join('')
    ||`<span class="vb-dd-v faint">Nada com esse nome em ${VB_GRUPO[inp.dataset.grupo]?.nome||'este grupo'}. O administrador inclui em Configurações › Viabilidade.</span>`;
  dd.hidden=false;inp.setAttribute('aria-expanded','true')}
function vbDdFechar(inp){const dd=inp?.parentElement?.querySelector('.vb-dd');if(dd){dd.hidden=true;dd.innerHTML=''}inp?.setAttribute('aria-expanded','false')}
function vbEscolher(inp,cod){const v=VB(UI.vid),d=vbDesp(cod),id=inp.dataset.vbCb;if(!v||!d)return;const tipos=VB_GRUPO[d.grupo].tipos;
  if(id==='nova'){const l={id:uid(),desp:cod,tipo:d.tipo||tipos[0],valor:d.valor??null,qtd:1};v.linhas.push(l);UI.vbNova=false;vbGravar(v);render();
    setTimeout(()=>document.querySelector(`[data-ln="${l.id}"] [data-k="valor"]`)?.focus(),20);return}
  const l=v.linhas.find(x=>x.id===id);if(!l)return;l.desp=cod;if(l.valor==null){l.tipo=d.tipo||l.tipo;l.valor=d.valor??null}if(!tipos.includes(l.tipo))l.tipo=tipos[0];
  vbGravar(v);render();setTimeout(()=>document.querySelector(`[data-ln="${l.id}"] [data-k="valor"]`)?.focus(),20)}
document.addEventListener('focusin',e=>{const el=e.target;if(el.dataset?.vbCb!=null&&!el.disabled){el.select?.();vbDdAbrir(el,false)}});
document.addEventListener('focusout',e=>{const el=e.target;if(el.dataset?.vbCb==null)return;setTimeout(()=>{if(document.activeElement===el)return;vbDdFechar(el);
  const v=VB(UI.vid),l=v?.linhas.find(x=>x.id===el.dataset.vbCb);el.value=l?(vbDesp(l.desp)?.nome||l.desp):''},150)});
document.addEventListener('mousedown',e=>{const op=e.target.closest?.('[data-vb-op]');if(!op)return;e.preventDefault();const inp=op.closest('.vb-cb').querySelector('input');vbEscolher(inp,op.dataset.vbOp)});
document.addEventListener('keydown',e=>{const el=e.target;if(el.dataset?.vbCb==null)return;const dd=el.parentElement.querySelector('.vb-dd'),ops=[...dd.querySelectorAll('[data-vb-op]')];
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(dd.hidden){vbDdAbrir(el,false);return}if(!ops.length)return;vbDdAtivo=(vbDdAtivo+(e.key==='ArrowDown'?1:-1)+ops.length)%ops.length;
    ops.forEach((o,i)=>o.setAttribute('aria-selected',i===vbDdAtivo));ops[vbDdAtivo].scrollIntoView({block:'nearest'});el.setAttribute('aria-activedescendant',ops[vbDdAtivo].id);return}
  if(e.key==='Enter'){e.preventDefault();if(ops[vbDdAtivo])vbEscolher(el,ops[vbDdAtivo].dataset.vbOp);return}
  if(e.key==='Escape'&&!dd.hidden){e.preventDefault();e.stopPropagation();vbDdFechar(el)}},true);

/* ---------- eventos ---------- */
const VB_HD={cm2:'cm2',pfp:'pfp',dedp:'dedp',min:'min',din:'din',comd:'comd'};
function viabInput(el){
  if(el.dataset.vbCb!=null){vbDdAbrir(el,true);return true}
  const tipo=el.dataset.vb;if(!tipo||tipo==='ded')return false;const v=VB(UI.vid);if(!v)return true;const k=el.dataset.k;
  if(tipo==='hd'){if(k==='nome')v.nome=el.value;else{let n=lerNum(el.value);if(n!=null&&n<0)n=null;if(n!=null&&(k==='pfp'||k==='dedp'))n=Math.min(100,n);v[VB_HD[k]]=n}vbRefresh(v);return true}
  if(tipo==='tp'){const p=v.tips.find(x=>x.id===el.dataset.r);if(!p)return true;
    if(k==='nome')p.nome=el.value;else{let n=lerNum(el.value);if(n!=null&&['qtd','perm','com'].includes(k))n=Math.max(0,Math.round(n));if(n!=null&&n<0)n=null;if(k==='area'&&n===0)n=null;p[k]=n;
      if(['area','pu','pm2'].includes(k)){vbNorm(p,k);['area','pu','pm2'].filter(x=>x!==k).forEach(x=>{const o=document.querySelector(`[data-vb="tp"][data-r="${p.id}"][data-k="${x}"]`);if(o)o.value=vbIn(p[x],2)})}
      const ruim=(p.perm||0)+(p.com||0)>(p.qtd||0);['perm','com'].forEach(x=>{const o=document.querySelector(`[data-vb="tp"][data-r="${p.id}"][data-k="${x}"]`);if(o){o.setAttribute('aria-invalid',ruim);o.title=ruim?'Permuta e comissão passam da quantidade':''}})}
    vbRefresh(v);return true}
  if(tipo==='ln'&&k!=='tipo'){const l=v.linhas.find(x=>x.id===el.dataset.r);if(!l)return true;const n=lerNum(el.value);l[k]=k==='qtd'?(n>0?n:null):n;vbRefresh(v);return true}
  return false}
function viabChange(el){
  if(el.dataset.ch==='vb-valido'){if(el.value)viabClick('vb-vincular',{dataset:{v:el.value}});return true}
  if(el.dataset.ch==='vb-mmin'){const x=lerNum(el.value);const ant=S.vbMargemMin;S.vbMargemMin=x==null||isNaN(x)?null:x;
    if(ant!==S.vbMargemMin)toast(S.vbMargemMin==null?'Sem rentabilidade mínima.':`Rentabilidade mínima: ${num(S.vbMargemMin,1)}%.`);save();render();return true}
  if(el.dataset.ch==='cfg-vd'){const d=vbDesp(el.dataset.c),k=el.dataset.k;if(!d)return true;
    if(k==='ativo'||k==='deduz')d[k]=el.checked;else if(k==='valor')d.valor=lerNum(el.value);
    else if(k==='nome'){if(!el.value.trim()){toast('O item precisa de nome.',true);el.value=d.nome;return true}d.nome=el.value.trim()}
    else if(k==='grupo'){if(vbUsada(d.codigo)){toast('Item já usado em estudo não muda de grupo.',true);el.value=d.grupo;return true}
      d.grupo=el.value;if(!VB_GRUPO[d.grupo].tipos.includes(d.tipo))d.tipo=VB_GRUPO[d.grupo].tipos[0];if(d.grupo!=='comercial')d.deduz=false;
      const i=S.viabDesp.indexOf(d);S.viabDesp.splice(i,1);let j=S.viabDesp.map(x=>x.grupo).lastIndexOf(d.grupo);if(j<0)j=S.viabDesp.length-1;S.viabDesp.splice(j+1,0,d)}
    else d[k]=el.value||null;
    vbSyncTodos();save();render();return true}
  const tipo=el.dataset.vb;if(!tipo)return false;const v=VB(UI.vid);if(!v)return true;const k=el.dataset.k;
  if(tipo==='ded'){v.deduz=el.checked?[...new Set([...v.deduz,el.value])]:v.deduz.filter(x=>x!==el.value);vbGravar(v);render();return true}
  if(tipo==='hd'&&k==='nome'){if(!v.nome.trim()){v.nome='Estudo';el.value=v.nome}const h=document.querySelector('.vb-h h1');if(h)h.textContent=v.nome}
  else if(tipo==='hd')el.value=vbIn(v[VB_HD[k]],k==='pfp'||k==='dedp'?4:2);
  if(tipo==='tp'){const p=v.tips.find(x=>x.id===el.dataset.r);if(!p)return true;
    if(k==='nome'&&!p.nome.trim()){p.nome='Tipologia';el.value=p.nome}
    if((p.perm||0)+(p.com||0)>(p.qtd||0)){p[k==='com'?'com':'perm']=Math.max(0,(p.qtd||0)-(k==='com'?(p.perm||0):(p.com||0)));toast('Permuta e comissão não passam da quantidade da tipologia.',true);vbGravar(v);render();return true}
    if(k!=='nome')el.value=vbIn(p[k],['qtd','perm','com'].includes(k)?0:2)}
  if(tipo==='ln'){const l=v.linhas.find(x=>x.id===el.dataset.r);if(!l)return true;
    if(k==='tipo'){l.tipo=el.value;if(l.tipo==='verba_mensal'&&!(l.qtd>0))l.qtd=1;vbGravar(v);render();return true}
    if(k==='qtd'&&l.qtd==null)l.qtd=1;el.value=vbIn(l[k],k==='qtd'?2:4)}
  vbGravar(v);return true}
function viabClick(A,a,t){
  switch(A){
    case 'vb-novo':{const n=viabsDe(t.id).length,nome=n?`Estudo ${n+1}`:'Estudo base';
      if(!vbModelos().length){vbCriar(t.id,nome,null);return true}
      UI.vbNovoT=t.id;UI.vbNovoNome=nome;UI.modal='vb-novo';renderModal();setTimeout(()=>$('#vbn-n')?.select(),30);return true}
    case 'vb-modelo':UI.vbModeloDe=a.dataset.v;UI.modal='vb-modelo';renderModal();setTimeout(()=>$('#vbm-n')?.focus(),30);return true;
    case 'vb-mod-del':{const m=S.viabModelos.find(x=>x.id===a.dataset.v);if(!m)return true;if(!m.dono&&!ehAdmin(me())){toast('Só o administrador apaga modelo da empresa.',true);return true}
      S.viabModelos=S.viabModelos.filter(x=>x!==m);save();if(UI.modal==='vb-novo'&&!vbModelos().length){UI.modal=null;renderModal()}else if(UI.modal)renderModal();render();toast(`Modelo "${m.nome}" apagado.`);return true}
    case 'vb-mod-padrao':{if(!ehAdmin(me()))return true;const id=a.dataset.v;S.viabModelos.forEach(m=>m.padrao=!m.dono&&m.id===id);
      save();render();const p=vbModeloPadrao();toast(p?`"${p.nome}" é o modelo padrão da empresa.`:'Sem modelo padrão: o estudo novo nasce só com a lista.');return true}
    case 'vb-abrir':vbAbrir(a.dataset.v);return true;
    case 'vb-fechar':UI.vbPop=null;UI.vbNova=false;render();return true;
    case 'vb-aba':{UI.vbAba=a.dataset.v;UI.vbNova=false;render();const sc=document.querySelector('.vb-pop-sc'),fx=document.querySelector('.vb-fixo');
      if(sc&&fx)sc.scrollTop=Math.min(sc.scrollTop,fx.offsetTop);document.querySelector('.vb-aba[aria-current]')?.scrollIntoView({inline:'center',block:'nearest'});
      document.querySelector(`#vb-st-${UI.vbAba}`)?.setAttribute('tabindex','-1');document.querySelector(`.vb-aba[data-v="${UI.vbAba}"]`)?.focus({preventScroll:true});return true}
    case 'vb-vincular':{const v=VB(a.dataset.v),x=T(v.tid);if(!negAtiva(x)){toast('A negociação não está ativa.',true);return true}x.neg.viab=vbResumo(v);save();render();toast(`${v.nome} é o estudo válido.`);return true}
    case 'vb-duplicar':{const v=VB(a.dataset.v),c=JSON.parse(JSON.stringify(v));c.id=uid();c.nome='Cópia de '+v.nome;c.em=HOJE;c.user=me();c.tips.forEach(p=>p.id=uid());c.linhas.forEach(l=>l.id=uid());
      c.linhas=c.linhas.filter(l=>vbDesp(l.desp)?.ativo);vbFixos(c);S.viabs.push(c);log(T(v.tid),`Estudo de viabilidade duplicado: ${c.nome}`);save();vbAbrir(c.id);toast('Estudo duplicado.');return true}
    case 'vb-apagar':UI.modal='vb-apagar';UI.vbApagar=a.dataset.v;renderModal();return true;
    case 'vb-apagar-ok':{const v=VB(UI.vbApagar),x=T(v.tid);if(x.neg?.viab?.id===v.id){toast('Estudo vinculado à negociação não se apaga.',true);return true}
      S.viabs=S.viabs.filter(y=>y.id!==v.id);log(x,`Estudo de viabilidade apagado: ${v.nome}`);UI.modal=null;UI.vbPop=null;save();render();toast('Estudo apagado.');return true}
    case 'vb-tip-add':{const v=VB(UI.vid),p={id:uid(),nome:'Tipologia '+(v.tips.length+1),area:null,qtd:null,perm:0,com:0,pu:null,pm2:null};v.tips.push(p);vbGravar(v);render();setTimeout(()=>{const i=document.querySelector(`[data-tp="${p.id}"] [data-k="nome"]`);i?.focus();i?.select()},20);return true}
    case 'vb-tip-del':{const v=VB(UI.vid);v.tips=v.tips.filter(p=>p.id!==a.dataset.v);vbGravar(v);render();return true}
    case 'vb-ln-add':UI.vbNova=a.dataset.v;render();setTimeout(()=>document.querySelector('[data-vb-cb="nova"]')?.focus(),20);return true;
    case 'vb-ln-cancela':UI.vbNova=false;render();return true;
    case 'vb-ln-del':{const v=VB(UI.vid);v.linhas=v.linhas.filter(l=>l.id!==a.dataset.v);vbGravar(v);render();return true}
    case 'vb-cfg-ord':{const L=S.viabDesp,i=L.findIndex(d=>d.codigo===a.dataset.c),g=L[i].grupo,passo=+a.dataset.v;let j=i+passo;while(j>=0&&j<L.length&&L[j].grupo!==g)j+=passo;
      if(j<0||j>=L.length)return true;[L[i],L[j]]=[L[j],L[i]];save();render();return true}
    case 'vb-cfg-del':{const d=vbDesp(a.dataset.c);if(vbUsada(d.codigo)){toast('Item já usado em estudo: desative em vez de apagar.',true);return true}
      S.viabDesp=S.viabDesp.filter(x=>x!==d);save();render();toast('Item apagado.');return true}
  }
  return false}
const vbUsada=c=>S.viabs.some(v=>v.linhas.some(l=>l.desp===c&&(l.valor!=null||!VB_GRUPO[vbDesp(c)?.grupo]?.fixo)));
function viabSubmit(form,F){
  if(form==='vb-novo'){const nome=(F.nome||'').trim()||UI.vbNovoNome;vbCriar(UI.vbNovoT,nome,F.modelo||null);return true}
  if(form==='vb-modelo'){const v=VB(UI.vbModeloDe),nome=(F.nome||'').trim(),emp=['empresa','padrao'].includes(F.escopo)&&ehAdmin(me()),dono=emp?null:me();if(!v||!nome){toast('Dê um nome ao modelo.',true);return true}
    S.viabModelos=S.viabModelos||[];let m=S.viabModelos.find(x=>x.dono===dono&&vbSemAcento(x.nome)===vbSemAcento(nome));const novo=!m;
    if(novo){m={id:uid(),nome,dono,padrao:false,em:HOJE};S.viabModelos.push(m)}m.nome=nome;m.dados=vbModeloDados(v);m.em=HOJE;
    if(emp&&F.escopo==='padrao'){S.viabModelos.forEach(x=>x.padrao=x===m)}
    save();UI.modal=null;renderModal();render();
    toast(`${novo?'Modelo':'Modelo atualizado:'} "${nome}"${novo?' salvo':''}${emp?' para a empresa':''}${m.padrao?', padrão do estudo novo':''}.`);return true}
  if(form!=='vb-cfg-nova')return false;const nome=(F.nome||'').trim(),g=VB_GRUPO[F.grupo]?F.grupo:'adm_financeiro';if(!nome){toast('Dê um nome ao item.',true);return true}
  if(S.viabDesp.some(d=>d.grupo===g&&vbSemAcento(d.nome)===vbSemAcento(nome))){toast('Já existe um item com esse nome no grupo.',true);return true}
  let base=vbSemAcento(nome).replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,36)||'item',cod=base,n=2;if(!/^[a-z]/.test(cod))cod='d_'+cod;while(vbDesp(cod))cod=base+'_'+n++;
  const d={codigo:cod,nome,grupo:g,tipo:VB_GRUPO[g].tipos[0],valor:null,deduz:false,ativo:true},j=S.viabDesp.map(x=>x.grupo).lastIndexOf(g);
  S.viabDesp.splice(j<0?S.viabDesp.length:j+1,0,d);save();render();toast('Item incluído na lista.');return true}
function vbModeloResumo(m){const x=m.dados,n=x.linhas.filter(l=>l.valor!=null).length;
  return [x.cm2!=null?`obra ${brl(x.cm2)}/m²`:'',`${n} ite${n===1?'m':'ns'} com valor`].filter(Boolean).join(' · ')}
function vbNovoHtml(fechar){const ms=vbModelos(),p=vbModeloPadrao(),adm=ehAdmin(me());
  const op=(id,nome,info,ck,del)=>`<div class="vb-mod-r"><label class="opt-radio"><input type="radio" name="modelo" value="${id}" ${ck?'checked':''}><span><b>${nome}</b><small>${info}</small></span></label>${del}</div>`;
  return `<div class="dh"><div><h2>Novo estudo</h2><div class="muted" style="margin-top:4px">O estudo nasce com os valores e as bases de cálculo do modelo. As tipologias e as condições do terreno você preenche no estudo.</div></div>${fechar}</div>
  <form data-form="vb-novo" id="f-vbn"><div class="fields"><div class="field full"><label for="vbn-n">Nome do estudo</label><input id="vbn-n" name="nome" maxlength="80" value="${esc(UI.vbNovoNome||'')}"></div>
  <div class="field full"><span class="lbl" id="vbn-m">Modelo</span><div class="vb-mods" role="radiogroup" aria-labelledby="vbn-m">
  ${ms.map(m=>op(m.id,esc(m.nome),`${m.dono?'Meu modelo':m.padrao?'Padrão da empresa':'Da empresa'} · ${vbModeloResumo(m)}`,p?m===p:false,
     m.dono||adm?`<button type="button" class="iconbtn sm lixo" data-a="vb-mod-del" data-v="${m.id}" aria-label="Apagar o modelo ${esc(m.nome)}" title="Apagar">${ic('lixo',18)}</button>`:'')).join('')}
  ${op('','Sem modelo','Só a lista de itens da empresa, com os valores padrão dela',!p,'')}</div></div></div></form>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="f-vbn">Criar estudo</button></div>`}
function vbModeloHtml(fechar){const v=VB(UI.vbModeloDe),adm=ehAdmin(me()),dir=vbDiretoria();if(!v)return '';
  return `<div class="dh"><div><h2>Salvar como modelo</h2><div class="muted" style="margin-top:4px">Guarda os valores e as bases de cálculo deste estudo (custo de obras, dedução do VGV e os itens de cada seção) para usar ao criar um estudo novo. Tipologias, permuta, mínimo garantido e pagamentos do terreno ficam fora.${dir?'':' Taxas e Despesas financeiras não entram: o estudo novo usa os valores da empresa.'}</div></div>${fechar}</div>
  <form data-form="vb-modelo" id="f-vbm"><div class="fields"><div class="field full"><label for="vbm-n">Nome do modelo</label><input id="vbm-n" name="nome" required maxlength="60" placeholder="Ex.: MCMV Faixa 2 em São Paulo"><div class="hint">Com o nome de um modelo seu que já existe, ele é atualizado.</div></div>
  ${adm?`<div class="field full"><span class="lbl" id="vbm-e">Para quem</span><span class="seg3" role="radiogroup" aria-labelledby="vbm-e"><label class="opt-radio"><input type="radio" name="escopo" value="meu" checked>Só para mim</label><label class="opt-radio"><input type="radio" name="escopo" value="empresa">Para a empresa</label><label class="opt-radio"><input type="radio" name="escopo" value="padrao">Padrão da empresa</label></span></div>`:''}</div></form>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="f-vbm">Salvar modelo</button></div>`}
function viabModal(M,fechar){if(M==='vb-novo')return vbNovoHtml(fechar);if(M==='vb-modelo')return vbModeloHtml(fechar);if(M!=='vb-apagar')return '';const v=VB(UI.vbApagar);if(!v)return '';
  return `<div class="dh"><h2>Apagar o estudo?</h2>${fechar}</div><p style="margin:0 0 8px">${esc(v.nome)} sai do terreno, com as tipologias e os custos. Estudo vinculado à negociação não se apaga.</p><div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary danger" data-a="vb-apagar-ok">Apagar</button></div>`}

/* ---------- Configurações › Viabilidade ---------- */
function cfgViabHtml(){const L=S.viabDesp;
  const sel=(d,k,opts,val,rot,extra='')=>`<select data-ch="cfg-vd" data-c="${d.codigo}" data-k="${k}" aria-label="${rot}" ${extra}>${Object.entries(opts).map(([c,n])=>`<option value="${c}" ${val===c?'selected':''}>${n}</option>`).join('')}</select>`;
  const grupos=Object.fromEntries(Object.entries(VB_GRUPO).map(([g,G])=>[g,G.nome]));
  const linhas=Object.keys(VB_GRUPO).map(g=>{const ds=L.filter(d=>d.grupo===g),G=VB_GRUPO[g];
    return `<div class="vb-cfg-g">${VB_SECAO[G.secao]}${G.nome!==VB_SECAO[G.secao]?' › '+G.nome:''}${G.fixo?' <span class="faint">· fixos no estudo</span>':''}</div>
    ${ds.map((d,i)=>{const u=vbUsada(d.codigo);return `<div class="cfg-r vb-cfg-r ${d.ativo?'':'inativa'}"><span class="cfg-ord"><button class="iconbtn sm" data-a="vb-cfg-ord" data-c="${d.codigo}" data-v="-1" ${i?'':'disabled'} aria-label="Subir">↑</button><button class="iconbtn sm" data-a="vb-cfg-ord" data-c="${d.codigo}" data-v="1" ${i<ds.length-1?'':'disabled'} aria-label="Descer">↓</button></span>
      <input data-ch="cfg-vd" data-c="${d.codigo}" data-k="nome" value="${esc(d.nome)}" aria-label="Nome do item">${sel(d,'grupo',grupos,d.grupo,'Grupo de '+esc(d.nome),u?'disabled title="Item já usado em estudo não muda de grupo"':'')}
      ${sel(d,'tipo',Object.fromEntries(G.tipos.map(k=>[k,VB_TIPO[k]])),d.tipo,'Base de cálculo de '+esc(d.nome))}
      <input data-ch="cfg-vd" data-c="${d.codigo}" data-k="valor" value="${vbIn(d.valor,4)}" inputmode="decimal" placeholder="—" aria-label="Valor padrão de ${esc(d.nome)}">
      <span>${g==='comercial'?`<label class="chk"><input type="checkbox" data-ch="cfg-vd" data-c="${d.codigo}" data-k="deduz" ${d.deduz?'checked':''} aria-label="${esc(d.nome)} pode sair do VGV líquido"></label>`:''}</span>
      <label class="chk"><input type="checkbox" data-ch="cfg-vd" data-c="${d.codigo}" data-k="ativo" ${d.ativo?'checked':''} aria-label="Ativo"></label>
      <span>${u?'':`<button class="iconbtn sm lixo" data-a="vb-cfg-del" data-c="${d.codigo}" aria-label="Apagar" title="Apagar">${ic('lixo',18)}</button>`}</span></div>`}).join('')||'<div class="muted vb-vazio">Nenhum item.</div>'}`}).join('');
  const mods=(S.viabModelos||[]).filter(m=>!m.dono),p=vbModeloPadrao();
  const modelos=`<section class="sec"><div class="sec-h"><h2>Modelos de estudo</h2></div><div class="sec-b">
    
    ${mods.length?`<div class="cfg-t vb-mod-cfg"><div class="cfg-r cfg-hd"><span>Padrão</span><span>Modelo</span><span>Atualizado</span><span></span></div>
    ${mods.map(m=>`<div class="cfg-r"><label class="vb-radio"><input type="radio" name="vb-mod-padrao" ${m.padrao?'checked':''} data-a="vb-mod-padrao" data-v="${m.id}" aria-label="${esc(m.nome)} é o padrão"></label><span><b>${esc(m.nome)}</b><small class="faint" style="display:block">${vbModeloResumo(m)}</small></span><span class="faint">${fd(m.em)}</span><span><button class="iconbtn sm lixo" data-a="vb-mod-del" data-v="${m.id}" aria-label="Apagar" title="Apagar">${ic('lixo',18)}</button></span></div>`).join('')}</div>
    ${p?`<button class="btn text sm" data-a="vb-mod-padrao" data-v="">Sem modelo padrão</button>`:''}`:'<div class="muted vb-vazio">Nenhum modelo da empresa. Sem padrão, o estudo novo nasce com os valores padrão da lista abaixo.</div>'}</div></section>`;
  return `${modelos}<section class="sec"><div class="sec-h"><h2>Rentabilidade mínima</h2></div><div class="sec-b">
    <div class="editgrid vb-campos"><div class="field"><label for="vb-mmin">Margem líquida mínima (%)</label><input id="vb-mmin" data-ch="vb-mmin" value="${vbIn(S.vbMargemMin,2)}" inputmode="decimal" placeholder="Sem mínima"></div></div>
    </div></section>
  <section class="sec"><div class="sec-h"><h2>Itens do estudo de viabilidade</h2></div><div class="sec-b">
    
    <div class="cfg-t vb-cfg"><div class="cfg-r cfg-hd vb-cfg-r"><span></span><span>Item</span><span>Grupo</span><span>Base de cálculo</span><span>Valor</span><span>Sai do VGV</span><span>Ativo</span><span></span></div>
    ${linhas}</div>
    <form class="inline-form" data-form="vb-cfg-nova"><div class="field grow"><label for="vd-n">Novo item</label><input id="vd-n" name="nome" required placeholder="Nome"></div>
      <div class="field" style="flex:0 1 240px"><label for="vd-g">Grupo</label><select id="vd-g" name="grupo">${Object.entries(VB_GRUPO).map(([c,G])=>`<option value="${c}">${VB_SECAO[G.secao]}${G.nome!==VB_SECAO[G.secao]?' › '+G.nome:''}</option>`).join('')}</select></div>
      <button class="btn sm">${ic('add',16)}Adicionar</button></form>
    </div></section>`}
const _prepararVb=prepararDados;prepararDados=function(){_prepararVb.apply(this,arguments);viabPreparar()};
viabPreparar();
