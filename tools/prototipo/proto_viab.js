/* ===================== estudo de viabilidade estática (decisão do Moisés, 25/out/2026) =====================
   Avaliação prévia, sem fluxo de caixa. Espelha app.viabilidade_tipologias, app.viabilidade_linhas e
   app.calcular_viabilidade (migration 20261015001000_viabilidade.sql): mesmas regras, mesmos arredondamentos.
   O estudo é do terreno (S.viabs, vários por terreno); a negociação vincula um, e t.neg.viab guarda o resumo
   dele (com o id), que é o que o resto do protótipo lê (filtros, preço máximo, Visão geral).
   Lista de despesas da empresa em S.viabDesp (Configurações › Viabilidade), nascida de tools/viabilidade/despesas.json. */
const VB_CFG=__VIAB_DESPESAS__;
const VB_TIPO=VB_CFG.tipos,VB_GRUPO=VB_CFG.grupos,VB_OBRA=VB_CFG.obra,VB_SECAO=VB_CFG.secoes;
/* seção do estudo pelo grupo da despesa (decisão do Moisés, 25/out/2026): Obra → Custo de obras, Comercial → Custos comerciais, Impostos, Financeiro e Gestão e administração → Taxas, o resto → Despesas */
const vbSecaoDe=g=>VB_CFG.secao_do_grupo[g]||'despesas';
const vbSecaoLn=l=>vbSecaoDe(vbDesp(l.desp)?.grupo);
const r2=x=>Math.round((x+Math.sign(x)*Number.EPSILON)*100)/100;
const VB=id=>S.viabs.find(v=>v.id===id);
const viabsDe=tid=>S.viabs.filter(v=>v.tid===tid);
const vbDesp=c=>S.viabDesp.find(d=>d.codigo===c);
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

/* cálculo (app.calcular_viabilidade): VGV líquido = VGV − permuta; linha = base × multiplicador × quantidade;
   % do VGV sobre o VGV líquido; obra total = linhas que compõem a obra, incidente = as marcadas incidente,
   nunca contando as que são % da obra; verba por unidade sobre todas as unidades */
function vbCalc(v){let vgv=0,perm=0,un=0,unp=0,priv=0;
  v.tips.forEach(p=>{un+=p.qtd||0;unp+=p.perm||0;if(p.area!=null)priv+=p.area*(p.qtd||0);if(p.pu!=null){vgv+=(p.qtd||0)*p.pu;perm+=(p.perm||0)*p.pu}});
  vgv=r2(vgv);perm=r2(perm);const liq=r2(vgv-perm);
  const valor=(l,b)=>l.mult==null?null:r2(b*l.mult/(vbPct(l.tipo)?100:1)*(l.qtd||1));
  const base0=l=>l.tipo==='pct_vgv'?liq:l.tipo==='verba_total'?1:un;
  let ot=0,oi=0;
  v.linhas.forEach(l=>{if(l.tipo.startsWith('pct_obra'))return;const d=vbDesp(l.desp),x=valor(l,base0(l))||0;if(d&&d.obra!=='nao')ot+=x;if(d&&d.obra==='incidente')oi+=x});
  ot=r2(ot);oi=r2(oi);
  const L={},SEC={terreno:0,obra:0,comercial:0,taxas:0,despesas:0};let desp=0;
  v.linhas.forEach(l=>{const b=l.tipo==='pct_obra_total'?ot:l.tipo==='pct_obra_incidente'?oi:base0(l),x=valor(l,b);L[l.id]={base:b,valor:x};desp+=x||0;SEC[vbSecaoLn(l)]+=x||0});Object.keys(SEC).forEach(k=>SEC[k]=r2(SEC[k]));
  desp=r2(desp);const lucro=r2(liq-desp);
  return {vgv,perm,liq,un,unp,priv,ot,oi,desp,SEC,lucro,margem:liq>0?r2(lucro/liq*100):null,L}}

/* a negociação lê o resumo do estudo vinculado (no banco, processos.viabilidade_id e os totais do estudo) */
function vbResumo(v){const c=vbCalc(v);return {id:v.id,nome:v.nome,vgv:c.vgv,liq:c.liq,lucro:c.lucro,margem:c.margem,pmax:v.pmax,em:v.em}}
function vbSync(v){const t=T(v.tid);if(t?.neg?.viab?.id===v.id)t.neg.viab=vbResumo(v)}
const vbSyncTodos=()=>S.viabs.forEach(vbSync);
const vbNovo=(tid,nome)=>({id:uid(),tid,nome,pmax:null,em:HOJE,user:me(),tips:[{id:uid(),nome:'Tipologia 1',area:null,qtd:null,perm:0,pu:null,pm2:null}],linhas:[]});

/* dados de exemplo: um estudo para cada negociação que já tinha viabilidade, montado para dar perto do VGV e da margem de antes */
function vbExemplo(t,x,i){const v=vbNovo(t.id,x.nome);v.em=x.em||HOJE;v.user=t.resp||'Rafael Souza';v.pmax=x.pmax??null;
  const N=Math.max(20,Math.round(x.vgv/323400)),nA=Math.round(N*.7),perm=i===0?6:0;
  v.tips=[{id:uid(),nome:'2 dormitórios',area:40,qtd:nA,perm,pu:300000,pm2:7500},{id:uid(),nome:'2 dormitórios com suíte',area:48,qtd:N-nA,perm:0,pu:378000,pm2:7875}];
  const liq=nA*300000+(N-nA)*378000-perm*300000,m=(x.margem??15)/100,terreno=x.pmax??Math.round(liq*.12),itbi=Math.round(terreno*.03/1000)*1000,proj=Math.round(liq*.012/1000)*1000;
  const conhecido=terreno+itbi+proj+liq*(.04+.015+.04),infra=1500000;
  const custo=Math.max(80000,Math.round(((liq*(1-m)-conhecido)/1.08-infra)/N/100)*100);
  const L=(desp,tipo,mult,qtd=1)=>({id:uid(),desp,tipo,mult,qtd});
  v.linhas=[L('terreno','verba_total',terreno),L('itbi_registro','verba_total',itbi),L('projetos','verba_total',proj),L('construcao','verba_unidade',custo),
    L('infra_interna','verba_total',infra),L('adm_obra','pct_obra_total',5),L('contingencia','pct_obra_incidente',3),L('comissao','pct_vgv',4),L('marketing','pct_vgv',1.5),L('ret','pct_vgv',4)];
  return v}
function viabPreparar(){
  if(!S.viabDesp)S.viabDesp=VB_CFG.despesas.map(d=>({codigo:d.codigo,nome:d.nome,grupo:d.grupo,obra:d.obra,tipo:d.tipo,mult:d.multiplicador,ativo:true}));
  if(!S.viabs){S.viabs=[];let i=0;S.terrenos.forEach(t=>{const x=t.neg?.viab;if(!x||x.id)return;const v=vbExemplo(t,x,i++);S.viabs.push(v);t.neg.viab=vbResumo(v)})}}

/* ---------- seção Viabilidade da negociação ---------- */
function viabSecao(t){const vs=viabsDe(t.id),vi=t.neg?.viab,ro=UI.role==='Leitura',ad=areaAdotada(t);
  const novo=!ro?`<button class="btn sm" data-a="vb-novo">${ic('add',16)}Novo estudo</button>`:'';
  const ligado=vi?`<div class="metrics vb-met"><div class="metric"><div class="ml">VGV líquido</div><div class="mv">${mi(vi.liq??vi.vgv)}</div></div><div class="metric"><div class="ml">Margem líquida</div><div class="mv">${vi.margem==null?'—':num(vi.margem,1)+'%'}</div></div><div class="metric"><div class="ml">Preço máximo do terreno</div><div class="mv">${mi(vi.pmax)}</div></div></div>
    <div class="faint" style="font-size:12px;margin-top:10px">Vinculado: ${esc(vi.nome)} · ${fd(vi.em)}${ad&&vi.pmax?` · ${brl(vi.pmax/ad)}/m² sobre a área adotada`:''}</div>`:'';
  const lista=vs.length?`<div class="dt-wrap vb-lista"><table class="dt compacta"><thead><tr><th class="esq">Estudo</th><th>VGV líquido</th><th>Lucro líquido</th><th>Margem</th><th>Atualizado</th><th></th></tr></thead><tbody>
    ${vs.map(v=>{const c=vbCalc(v),lig=vi?.id===v.id;return `<tr><td class="esq"><button class="linkbtn" data-a="vb-abrir" data-v="${v.id}">${esc(v.nome)}</button></td><td class="num">${mi(c.liq)}</td><td class="num">${mi(c.lucro)}</td><td class="num">${c.margem==null?'—':num(c.margem,1)+'%'}</td><td>${fd(v.em)}</td>
      <td>${lig?'<span class="chip good"><span class="d"></span>Vinculado</span>':negAtiva(t)&&!ro?`<button class="btn text sm" data-a="vb-vincular" data-v="${v.id}">Vincular</button>`:''}</td></tr>`}).join('')}</tbody></table></div>`
    :`<div class="banner blue">${ic('money')}<div style="flex:1"><div class="bt">Nenhum estudo</div><div>Monte o estudo de viabilidade estática: tipologias, despesas e resultado (VGV líquido, lucro e margem).</div></div></div>`;
  return `<section class="sec" id="sec-viab"><div class="sec-h"><h2>Viabilidade</h2>${novo}</div><div class="sec-b">${ligado}${ligado&&vs.length?'<div style="height:16px"></div>':''}${lista}</div></section>`}

/* ---------- página do estudo ---------- */
function pgViab(){const v=VB(UI.vid);if(!v)return `<section class="sec"><div class="sec-b"><div class="empty">Estudo não encontrado.</div></div></section>`;
  const t=T(v.tid),c=vbCalc(v),ro=UI.role==='Leitura',lig=t.neg?.viab?.id===v.id,dis=ro?'disabled':'';
  const acoes=ro?'':`${lig?'':negAtiva(t)?`<button class="btn" data-a="vb-vincular" data-v="${v.id}">${ic('link',18)}Vincular à negociação</button>`:''}<button class="btn" data-a="vb-duplicar" data-v="${v.id}">Duplicar</button>${lig?'':`<button class="btn text danger" data-a="vb-apagar" data-v="${v.id}">Apagar</button>`}`;
  const inp=(tipo,id,k,val,d,rot,extra='')=>`<label class="vb-c vb-${k}"><span class="vb-l">${rot}</span><input data-vb="${tipo}" data-r="${id}" data-k="${k}" value="${k==='nome'?esc(val??''):vbIn(val,d)}" ${k==='nome'?'':'inputmode="decimal"'} aria-label="${rot}" ${dis} ${extra}></label>`;
  const tips=v.tips.map(p=>`<div class="vb-r" data-tp="${p.id}">${inp('tp',p.id,'nome',p.nome,0,'Tipologia')}${inp('tp',p.id,'area',p.area,2,'Área privativa (m²)')}${inp('tp',p.id,'qtd',p.qtd,0,'Quantidade')}${inp('tp',p.id,'perm',p.perm,0,'Em permuta')}${inp('tp',p.id,'pu',p.pu,2,'Preço unitário (R$)')}${inp('tp',p.id,'pm2',p.pm2,2,'Preço por m² (R$)')}
    <span class="vb-c vb-out"><span class="vb-l">VGV</span><b data-vbo="tp-${p.id}">${brl(p.pu!=null?(p.qtd||0)*p.pu:null)}</b></span>${ro?'<span></span>':`<button class="iconbtn sm vb-del" data-a="vb-tip-del" data-v="${p.id}" aria-label="Remover ${esc(p.nome)}" title="Remover tipologia">${ic('close',18)}</button>`}</div>`).join('');
  const linha=l=>{const d=vbDesp(l.desp);return `<div class="vb-r" data-ln="${l.id}"><span class="vb-c vb-desp"><span class="vb-l">Item</span>${vbCombo(l.id,d?d.nome+(d.ativo?'':' (inativa)'):l.desp,dis,vbSecaoLn(l))}</span>
    <label class="vb-c vb-tipo"><span class="vb-l">Tipo de valor</span><select data-vb="ln" data-r="${l.id}" data-k="tipo" aria-label="Tipo de valor" ${dis}>${Object.entries(VB_TIPO).map(([k,n])=>`<option value="${k}" ${l.tipo===k?'selected':''}>${n}</option>`).join('')}</select></label>
    <label class="vb-c vb-mult"><span class="vb-l">Multiplicador</span><span class="vb-adorno"><span class="vb-suf" data-vbo="suf-${l.id}">${vbPct(l.tipo)?'%':'R$'}</span><input data-vb="ln" data-r="${l.id}" data-k="mult" value="${vbIn(l.mult,4)}" inputmode="decimal" aria-label="Multiplicador" ${dis}></span></label>
    <label class="vb-c vb-qtd"><span class="vb-l">Quantidade</span><input data-vb="ln" data-r="${l.id}" data-k="qtd" value="${vbIn(l.qtd,2)}" inputmode="decimal" aria-label="Quantidade de parcelas" ${dis}></label>
    <span class="vb-c vb-out"><span class="vb-l">Resultado</span><b data-vbo="ln-${l.id}">${brl(c.L[l.id].valor)}</b><small class="faint" data-vbo="lb-${l.id}">${vbBaseTxt(l,c)}</small></span>${ro?'<span></span>':`<button class="iconbtn sm vb-del" data-a="vb-ln-del" data-v="${l.id}" aria-label="Remover ${esc(d?.nome||'item')}" title="Remover">${ic('close',18)}</button>`}</div>`};
  const nova=sec=>UI.vbNova===sec&&!ro?`<div class="vb-r vb-nova"><span class="vb-c vb-desp"><span class="vb-l">Item</span>${vbCombo('nova','','',sec)}</span><span class="vb-c vb-dica faint">Escolha na lista da empresa; o tipo de valor e o multiplicador vêm preenchidos e podem ser trocados.</span><button class="iconbtn sm vb-del" data-a="vb-ln-cancela" aria-label="Cancelar" title="Cancelar">${ic('close',18)}</button></div>`:'';
  const ADD={terreno:'Adicionar item do terreno',obra:'Adicionar custo de obra',comercial:'Adicionar custo comercial',taxas:'Adicionar taxa',despesas:'Adicionar despesa'};
  const secoes=Object.entries(VB_SECAO).map(([sec,nome])=>{const ls=v.linhas.filter(l=>vbSecaoLn(l)===sec).map(linha).join('');
    return `<section class="sec vb-sec" id="vb-sec-${sec}"><div class="sec-h"><h2>${nome}</h2>${ro?'':`<button class="btn text sm" data-a="vb-ln-add" data-v="${sec}">${ic('add',16)}${ADD[sec]}</button>`}</div><div class="sec-b">
    <div class="vb-tab vb-lns"><div class="vb-r vb-hd" aria-hidden="true"><span>Item</span><span>Tipo de valor</span><span>Multiplicador</span><span>Quantidade</span><span>Resultado</span><span></span></div>
    ${ls||(nova(sec)?'':'<div class="muted vb-vazio">Nenhum item.</div>')}${nova(sec)}
    <div class="vb-r vb-tot" id="vb-tot-${sec}">${vbTotLns(c,sec)}</div></div></div></section>`}).join('');
  return `<button class="back" data-a="vb-voltar">${ic('back',20)}${esc(t.codigo)} · ${esc(t.nome)}</button>
  <div class="page-h vb-h"><div style="min-width:0"><div class="eyebrow">Estudo de viabilidade estática${lig?' · <span class="chip good"><span class="d"></span>Vinculado à negociação</span>':''}</div><h1>${esc(v.nome)}</h1><div class="muted vb-sub">Avaliação prévia, sem fluxo de caixa. Atualizado em ${fd(v.em)}${v.user?' por '+esc(v.user):''}.</div></div><div class="vb-acoes">${acoes}</div></div>
  <div class="kpis vb-kpis" id="vb-kpis">${vbKpis(c)}</div>
  <div class="stack">
  <section class="sec"><div class="sec-h"><h2>Dados do estudo</h2></div><div class="sec-b"><div class="editgrid vb-dados">
    <div class="field"><label for="vb-nome">Nome do estudo</label><input id="vb-nome" data-vb="hd" data-k="nome" value="${esc(v.nome)}" ${dis}></div>
    <div class="field"><label for="vb-pmax">Preço máximo do terreno (R$)</label><input id="vb-pmax" data-vb="hd" data-k="pmax" value="${vbIn(v.pmax,2)}" inputmode="decimal" ${dis}></div></div>
    <div class="hint">O preço máximo é o que acende o aviso de proposta acima do máximo na negociação.</div></div></section>
  <section class="sec vb-sec"><div class="sec-h"><h2>Tipologias</h2>${ro?'':`<button class="btn text sm" data-a="vb-tip-add">${ic('add',16)}Adicionar tipologia</button>`}</div><div class="sec-b">
    <div class="vb-tab vb-tips"><div class="vb-r vb-hd" aria-hidden="true"><span>Tipologia</span><span>Área privativa (m²)</span><span>Quantidade</span><span>Em permuta</span><span>Preço unitário (R$)</span><span>Preço por m² (R$)</span><span>VGV</span><span></span></div>
    ${tips||'<div class="muted vb-vazio">Nenhuma tipologia.</div>'}
    <div class="vb-r vb-tot" id="vb-tot-tips">${vbTotTips(v,c)}</div></div>
    <div class="hint">Com a área preenchida, o preço unitário e o preço por m² se acompanham: mudar um refaz o outro. Mudar a área refaz o preço por m² (ou completa o preço que falta). As unidades em permuta saem do VGV líquido.</div></div></section>
  ${secoes}
  <div class="hint vb-hint-ln">Resultado = base × multiplicador × quantidade (parcelas). Nos tipos em %, o multiplicador é o percentual. % do VGV incide sobre o VGV líquido; verba por unidade, sobre todas as unidades (${num(c.un)}); % da obra, sobre os itens que compõem a obra, definidos em Configurações › Viabilidade, onde o grupo de cada item define a seção.</div>
  <section class="sec"><div class="sec-h"><h2>Resultado</h2></div><div class="sec-b" id="vb-res">${vbResHtml(v,c)}</div></section>
  </div>`}
function vbCombo(id,txt,dis,sec){return `<span class="vb-cb"><input data-vb-cb="${id}" data-sec="${sec}" value="${esc(txt)}" placeholder="Buscar na lista" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="vb-dd-${id}" aria-label="Despesa" ${dis}><span class="vb-dd" id="vb-dd-${id}" role="listbox" hidden></span></span>`}
function vbBaseTxt(l,c){const b=c.L[l.id]?.base,q=l.qtd&&l.qtd!==1?` · ${num(l.qtd,2)} parcelas`:'';
  if(l.tipo==='pct_vgv')return `sobre o VGV líquido (${mi(b)})${q}`;if(l.tipo==='pct_obra_total')return `sobre a obra total (${mi(b)})${q}`;
  if(l.tipo==='pct_obra_incidente')return `sobre a obra incidente (${mi(b)})${q}`;if(l.tipo==='verba_unidade')return `× ${num(b)} unidades${q}`;return q?q.slice(3):''}
function vbKpis(c){const k=(l,val)=>`<div class="kpi"><span class="v sm">${val}</span><span class="l">${l}</span></div>`;
  return k('VGV',mi(c.vgv))+k('VGV líquido',mi(c.liq))+k('Lucro líquido',mi(c.lucro))+k('Margem líquida',c.margem==null?'—':num(c.margem,1)+'%')}
function vbTotTips(v,c){return `<span class="vb-c"><b>Total</b></span><span class="vb-c vb-area"><span class="vb-l">Área privativa total</span>${c.priv?m2(c.priv):'—'}</span><span class="vb-c vb-qtd"><span class="vb-l">Unidades</span>${num(c.un)}</span><span class="vb-c vb-perm"><span class="vb-l">Em permuta</span>${num(c.unp)}</span><span class="vb-c vb-pu"><span class="vb-l">Preço médio</span>${c.un?brl(c.vgv/c.un):'—'}</span><span class="vb-c vb-pm2"><span class="vb-l">Preço médio por m²</span>${c.priv?brl(c.vgv/c.priv):'—'}</span><span class="vb-c vb-out"><span class="vb-l">VGV</span><b>${brl(c.vgv)}</b></span><span></span>`}
function vbTotLns(c,sec){const x=c.SEC[sec];return `<span class="vb-c"><b>Total · ${VB_SECAO[sec]}</b></span><span class="vb-c vb-tipo"></span><span class="vb-c vb-mult"></span><span class="vb-c vb-qtd"></span><span class="vb-c vb-out"><span class="vb-l">Total</span><b>${brl(x)}</b><small class="faint">${c.liq>0?num(x/c.liq*100,1)+'% do VGV líquido':''}</small></span><span></span>`}
function vbResHtml(v,c){const pct=x=>c.liq>0?num(x/c.liq*100,1)+'%':'—';
  return `<div class="dt-wrap"><table class="dt compacta vb-rt"><thead><tr><th class="esq">Item</th><th>Valor</th><th>% do VGV líquido</th></tr></thead><tbody>
    <tr><td class="esq">VGV (${num(c.un)} unidades)</td><td class="num">${brl(c.vgv)}</td><td class="num">${c.liq>0?num(c.vgv/c.liq*100,1)+'%':'—'}</td></tr>
    <tr><td class="esq">(−) Unidades em permuta (${num(c.unp)})</td><td class="num">${brl(c.perm)}</td><td class="num">${pct(c.perm)}</td></tr>
    <tr class="forte"><td class="esq">VGV líquido</td><td class="num">${brl(c.liq)}</td><td class="num">${c.liq>0?'100%':'—'}</td></tr>
    ${Object.entries(VB_SECAO).map(([k,n])=>`<tr><td class="esq">(−) ${n}</td><td class="num">${brl(c.SEC[k])}</td><td class="num">${pct(c.SEC[k])}</td></tr>`).join('')}
    <tr class="forte"><td class="esq">Lucro líquido</td><td class="num">${brl(c.lucro)}</td><td class="num">${pct(c.lucro)}</td></tr>
    <tr class="forte"><td class="esq">Margem líquida</td><td class="num">${c.margem==null?'—':num(c.margem,2)+'%'}</td><td></td></tr></tbody></table></div>
    <div class="faint vb-obra">Obra total ${brl(c.ot)} · obra incidente ${brl(c.oi)}${v.pmax!=null?` · preço máximo do terreno ${brl(v.pmax)} (${pct(v.pmax)})`:''}</div>`}

/* atualiza só os números (o campo em edição mantém o foco) */
function vbRefresh(v){const c=vbCalc(v),set=(k,h)=>{const el=document.querySelector(`[data-vbo="${k}"]`);if(el)el.innerHTML=h};
  v.tips.forEach(p=>set('tp-'+p.id,brl(p.pu!=null?(p.qtd||0)*p.pu:null)));
  v.linhas.forEach(l=>{set('ln-'+l.id,brl(c.L[l.id].valor));set('lb-'+l.id,vbBaseTxt(l,c));set('suf-'+l.id,vbPct(l.tipo)?'%':'R$')});
  const h=(id,x)=>{const el=document.getElementById(id);if(el)el.innerHTML=x};
  h('vb-kpis',vbKpis(c));h('vb-tot-tips',vbTotTips(v,c));Object.keys(VB_SECAO).forEach(k=>h('vb-tot-'+k,vbTotLns(c,k)));h('vb-res',vbResHtml(v,c))}
function vbGravar(v){v.em=HOJE;v.user=me();vbSync(v);save()}

/* ---------- lista de despesas (busca) ---------- */
let vbDdAtivo=-1;
function vbDdItens(q,sec){const n=vbSemAcento(q);return S.viabDesp.filter(d=>d.ativo&&(!sec||vbSecaoDe(d.grupo)===sec)&&(!n||vbSemAcento(d.nome).includes(n)||vbSemAcento(VB_GRUPO[d.grupo]).includes(n)))}
function vbDdAbrir(inp,filtrar){const dd=inp.parentElement.querySelector('.vb-dd'),its=vbDdItens(filtrar?inp.value:'',inp.dataset.sec);vbDdAtivo=its.length?0:-1;
  let g='';dd.innerHTML=its.map((d,i)=>{const h=d.grupo!==g?`<span class="vb-dd-g" role="presentation">${VB_GRUPO[d.grupo]}</span>`:'';g=d.grupo;
    return `${h}<span class="vb-dd-i" role="option" id="vb-op-${i}" data-vb-op="${d.codigo}" aria-selected="${i===vbDdAtivo}"><span>${esc(d.nome)}</span><small class="faint">${VB_TIPO[d.tipo]||''}${d.mult!=null?` · ${vbIn(d.mult,4)}${vbPct(d.tipo)?'%':''}`:''}</small></span>`}).join('')||`<span class="vb-dd-v faint">Nada com esse nome nesta seção. O administrador inclui em Configurações › Viabilidade.</span>`;
  dd.hidden=false;inp.setAttribute('aria-expanded','true')}
function vbDdFechar(inp){const dd=inp?.parentElement?.querySelector('.vb-dd');if(dd){dd.hidden=true;dd.innerHTML=''}inp?.setAttribute('aria-expanded','false')}
function vbEscolher(inp,cod){const v=VB(UI.vid),d=vbDesp(cod),id=inp.dataset.vbCb;if(!v||!d)return;
  if(id==='nova'){const l={id:uid(),desp:cod,tipo:d.tipo||'verba_total',mult:d.mult??null,qtd:1};v.linhas.push(l);UI.vbNova=false;vbGravar(v);render();
    setTimeout(()=>document.querySelector(`[data-ln="${l.id}"] [data-k="mult"]`)?.focus(),20);return}
  const l=v.linhas.find(x=>x.id===id);if(!l)return;l.desp=cod;if(l.mult==null){l.tipo=d.tipo||l.tipo;l.mult=d.mult??null}
  vbGravar(v);render();setTimeout(()=>document.querySelector(`[data-ln="${l.id}"] [data-k="mult"]`)?.focus(),20)}
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
function viabInput(el){
  if(el.dataset.vbCb!=null){vbDdAbrir(el,true);return true}
  const tipo=el.dataset.vb;if(!tipo)return false;const v=VB(UI.vid);if(!v)return true;const k=el.dataset.k;
  if(tipo==='hd'){if(k==='nome')v.nome=el.value;else v.pmax=lerNum(el.value);vbRefresh(v);return true}
  if(tipo==='tp'){const p=v.tips.find(x=>x.id===el.dataset.r);if(!p)return true;
    if(k==='nome')p.nome=el.value;else{let n=lerNum(el.value);if(n!=null&&(k==='qtd'||k==='perm'))n=Math.max(0,Math.round(n));if(n!=null&&n<0)n=null;if(k==='area'&&n===0)n=null;p[k]=n;
      if(['area','pu','pm2'].includes(k)){vbNorm(p,k);['area','pu','pm2'].filter(x=>x!==k).forEach(x=>{const o=document.querySelector(`[data-vb="tp"][data-r="${p.id}"][data-k="${x}"]`);if(o)o.value=vbIn(p[x],2)})}
      const pe=document.querySelector(`[data-vb="tp"][data-r="${p.id}"][data-k="perm"]`);if(pe){const ruim=(p.perm||0)>(p.qtd||0);pe.setAttribute('aria-invalid',ruim);pe.title=ruim?'Mais unidades em permuta do que a quantidade':''}}
    vbRefresh(v);return true}
  if(tipo==='ln'&&k!=='tipo'){const l=v.linhas.find(x=>x.id===el.dataset.r);if(!l)return true;const n=lerNum(el.value);l[k]=k==='qtd'?(n>0?n:null):n;vbRefresh(v);return true}
  return false}
function viabChange(el){
  if(el.dataset.ch==='cfg-vd'){const d=S.viabDesp[+el.dataset.i],k=el.dataset.k;if(!d)return true;
    if(k==='ativo')d.ativo=el.checked;else if(k==='mult')d.mult=lerNum(el.value);else if(k==='nome'){if(!el.value.trim()){toast('A despesa precisa de nome.',true);el.value=d.nome;return true}d.nome=el.value.trim()}else d[k]=el.value||null;
    vbSyncTodos();save();render();return true}
  const tipo=el.dataset.vb;if(!tipo)return false;const v=VB(UI.vid);if(!v)return true;const k=el.dataset.k;
  if(tipo==='hd'&&k==='nome'&&!v.nome.trim()){v.nome='Estudo';el.value=v.nome}
  if(tipo==='hd'&&k==='nome'){const h=document.querySelector('.vb-h h1');if(h)h.textContent=v.nome}
  if(tipo==='tp'){const p=v.tips.find(x=>x.id===el.dataset.r);if(!p)return true;
    if(k==='nome'&&!p.nome.trim()){p.nome='Tipologia';el.value=p.nome}
    if((p.perm||0)>(p.qtd||0)){p.perm=p.qtd||0;toast('A permuta não passa da quantidade da tipologia.',true);render();vbGravar(v);return true}
    if(k!=='nome')el.value=vbIn(p[k],k==='qtd'||k==='perm'?0:2)}
  if(tipo==='ln'){const l=v.linhas.find(x=>x.id===el.dataset.r);if(!l)return true;
    if(k==='tipo'){l.tipo=el.value;vbRefresh(v)}else{if(k==='qtd'&&l.qtd==null){l.qtd=1}el.value=vbIn(l[k],k==='qtd'?2:4)}}
  if(tipo==='hd'&&k==='pmax')el.value=vbIn(v.pmax,2);
  vbGravar(v);return true}
function viabClick(A,a,t){
  switch(A){
    case 'vb-novo':{const n=viabsDe(t.id).length,v=vbNovo(t.id,n?`Estudo ${n+1}`:'Estudo base');S.viabs.push(v);log(t,`Estudo de viabilidade criado: ${v.nome}`);save();go('viab',{vid:v.id,vbNova:false});return true}
    case 'vb-abrir':go('viab',{vid:a.dataset.v,vbNova:false});return true;
    case 'vb-voltar':{const v=VB(UI.vid);UI.vbNova=false;blocoAbre('negociacao');go('terreno',{id:v?v.tid:UI.id,tab:'negociacao'});rolarBloco('negociacao','viab');return true}
    case 'vb-vincular':{const v=VB(a.dataset.v),x=T(v.tid);if(!negAtiva(x)){toast('A negociação não está ativa.',true);return true}x.neg.viab=vbResumo(v);save();render();toast(`${v.nome} vinculado à negociação.`);return true}
    case 'vb-duplicar':{const v=VB(a.dataset.v),c=JSON.parse(JSON.stringify(v));c.id=uid();c.nome='Cópia de '+v.nome;c.em=HOJE;c.user=me();c.tips.forEach(p=>p.id=uid());c.linhas.forEach(l=>l.id=uid());
      c.linhas=c.linhas.filter(l=>vbDesp(l.desp)?.ativo);S.viabs.push(c);log(T(v.tid),`Estudo de viabilidade duplicado: ${c.nome}`);save();go('viab',{vid:c.id,vbNova:false});toast('Estudo duplicado.');return true}
    case 'vb-apagar':UI.modal='vb-apagar';UI.vbApagar=a.dataset.v;renderModal();return true;
    case 'vb-apagar-ok':{const v=VB(UI.vbApagar),x=T(v.tid);if(x.neg?.viab?.id===v.id){toast('Estudo vinculado à negociação não se apaga.',true);return true}
      S.viabs=S.viabs.filter(y=>y.id!==v.id);log(x,`Estudo de viabilidade apagado: ${v.nome}`);UI.modal=null;save();blocoAbre('negociacao');go('terreno',{id:x.id,tab:'negociacao'});rolarBloco('negociacao','viab');toast('Estudo apagado.');return true}
    case 'vb-tip-add':{const v=VB(UI.vid),p={id:uid(),nome:'Tipologia '+(v.tips.length+1),area:null,qtd:null,perm:0,pu:null,pm2:null};v.tips.push(p);vbGravar(v);render();setTimeout(()=>{const i=document.querySelector(`[data-tp="${p.id}"] [data-k="nome"]`);i?.focus();i?.select()},20);return true}
    case 'vb-tip-del':{const v=VB(UI.vid);v.tips=v.tips.filter(p=>p.id!==a.dataset.v);vbGravar(v);render();return true}
    case 'vb-ln-add':UI.vbNova=a.dataset.v;render();setTimeout(()=>document.querySelector('[data-vb-cb="nova"]')?.focus(),20);return true;
    case 'vb-ln-cancela':UI.vbNova=false;render();return true;
    case 'vb-ln-del':{const v=VB(UI.vid);v.linhas=v.linhas.filter(l=>l.id!==a.dataset.v);vbGravar(v);render();return true}
    case 'vb-cfg-ord':{const i=+a.dataset.i,j=i+ +a.dataset.v,L=S.viabDesp;if(j<0||j>=L.length)return true;[L[i],L[j]]=[L[j],L[i]];save();render();return true}
    case 'vb-cfg-del':{const d=S.viabDesp[+a.dataset.i];if(S.viabs.some(v=>v.linhas.some(l=>l.desp===d.codigo))){toast('Despesa já usada em estudo: desative em vez de apagar.',true);return true}
      S.viabDesp.splice(+a.dataset.i,1);save();render();toast('Despesa apagada.');return true}
  }
  return false}
function viabSubmit(form,F){if(form!=='vb-cfg-nova')return false;const nome=(F.nome||'').trim();if(!nome){toast('Dê um nome à despesa.',true);return true}
  if(S.viabDesp.some(d=>vbSemAcento(d.nome)===vbSemAcento(nome))){toast('Já existe uma despesa com esse nome.',true);return true}
  let base=vbSemAcento(nome).replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,36)||'despesa',cod=base,n=2;if(!/^[a-z]/.test(cod))cod='d_'+cod;while(vbDesp(cod))cod=base+'_'+n++;
  S.viabDesp.push({codigo:cod,nome,grupo:F.grupo||'outros',obra:F.obra||'nao',tipo:F.tipo||'verba_total',mult:lerNum(F.mult),ativo:true});save();render();toast('Despesa incluída na lista.');return true}
function viabModal(M,fechar){if(M!=='vb-apagar')return '';const v=VB(UI.vbApagar);if(!v)return '';
  return `<div class="dh"><h2>Apagar o estudo?</h2>${fechar}</div><p style="margin:0 0 8px">${esc(v.nome)} sai do terreno, com as tipologias e as despesas. Estudo vinculado à negociação não se apaga.</p><div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary danger" data-a="vb-apagar-ok">Apagar</button></div>`}

/* ---------- Configurações › Viabilidade ---------- */
function cfgViabHtml(){const usada=c=>S.viabs.some(v=>v.linhas.some(l=>l.desp===c)),L=S.viabDesp;
  const sel=(i,k,opts,val,rot)=>`<select data-ch="cfg-vd" data-i="${i}" data-k="${k}" aria-label="${rot}">${k==='tipo'?'<option value="">—</option>':''}${Object.entries(opts).map(([c,n])=>`<option value="${c}" ${val===c?'selected':''}>${n}</option>`).join('')}</select>`;
  return `<section class="sec"><div class="sec-h"><h2>Despesas do estudo de viabilidade</h2></div><div class="sec-b">
    <p class="muted" style="margin-top:0">É a lista que aparece na busca de cada linha de despesa. O tipo de valor e o multiplicador entram como sugestão e podem ser trocados no estudo. "Compõe a obra" define as bases dos tipos <b>% da obra total</b> (todas as despesas marcadas) e <b>% da obra incidente</b> (só as marcadas como incidente).</p>
    <div class="cfg-t vb-cfg"><div class="cfg-r cfg-hd vb-cfg-r"><span></span><span>Despesa</span><span>Grupo</span><span>Compõe a obra</span><span>Tipo de valor</span><span>Multiplicador</span><span>Ativa</span><span></span></div>
    ${L.map((d,i)=>`<div class="cfg-r vb-cfg-r ${d.ativo?'':'inativa'}"><span class="cfg-ord"><button class="iconbtn sm" data-a="vb-cfg-ord" data-i="${i}" data-v="-1" ${i?'':'disabled'} aria-label="Subir">↑</button><button class="iconbtn sm" data-a="vb-cfg-ord" data-i="${i}" data-v="1" ${i<L.length-1?'':'disabled'} aria-label="Descer">↓</button></span>
      <input data-ch="cfg-vd" data-i="${i}" data-k="nome" value="${esc(d.nome)}" aria-label="Nome da despesa">${sel(i,'grupo',VB_GRUPO,d.grupo,'Grupo de '+esc(d.nome))}${sel(i,'obra',VB_OBRA,d.obra,'Compõe a obra: '+esc(d.nome))}${sel(i,'tipo',VB_TIPO,d.tipo,'Tipo de valor de '+esc(d.nome))}
      <input data-ch="cfg-vd" data-i="${i}" data-k="mult" value="${vbIn(d.mult,4)}" inputmode="decimal" placeholder="—" aria-label="Multiplicador de ${esc(d.nome)}">
      <label class="chk"><input type="checkbox" data-ch="cfg-vd" data-i="${i}" data-k="ativo" ${d.ativo?'checked':''} aria-label="Ativa"></label>
      <span>${usada(d.codigo)?'':`<button class="linkbtn danger" data-a="vb-cfg-del" data-i="${i}">Apagar</button>`}</span></div>`).join('')}</div>
    <form class="inline-form" data-form="vb-cfg-nova"><div class="field grow"><label for="vd-n">Nova despesa</label><input id="vd-n" name="nome" required placeholder="Nome"></div>
      <div class="field" style="flex:0 1 200px"><label for="vd-g">Grupo</label><select id="vd-g" name="grupo">${Object.entries(VB_GRUPO).map(([c,n])=>`<option value="${c}" ${c==='outros'?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="field" style="flex:0 1 200px"><label for="vd-t">Tipo de valor</label><select id="vd-t" name="tipo">${Object.entries(VB_TIPO).map(([c,n])=>`<option value="${c}" ${c==='verba_total'?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="field" style="flex:0 1 220px"><label for="vd-o">Compõe a obra</label><select id="vd-o" name="obra">${Object.entries(VB_OBRA).map(([c,n])=>`<option value="${c}">${n}</option>`).join('')}</select></div>
      <button class="btn sm">${ic('add',16)}Adicionar</button></form>
    <div class="hint">Despesa já usada em estudo não se apaga; desative. Desativada, some da busca, mas os estudos que a usam continuam com ela.</div></div></section>`}
const _prepararVb=prepararDados;prepararDados=function(){_prepararVb.apply(this,arguments);viabPreparar()};
viabPreparar();
