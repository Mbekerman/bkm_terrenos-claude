/* =====================================================================
   Campos personalizados (bloco 4; decisões do Moisés, 30/out/2026).
   Espelha fluxo.campos, fluxo.campo_opcoes e fluxo.tarefa_campos.
   Os campos são da empresa (Configurações › Tarefas, só administrador) e
   valem para todos os quadros: texto, número, data, lista de opções e
   sim/não. Cada campo diz se aparece na frente do cartão. Sem valor, o
   campo fica "não informado" (nunca zero nem "não"). Campo com valor não
   muda de tipo e não se apaga: desativa. Injetado no mesmo escopo.
   ===================================================================== */
const CPO_TIPOS={texto:'Texto',numero:'Número',data:'Data',lista:'Lista de opções',caixa:'Sim / não'};
function cpoCampos(){return S.campos||(S.campos=[])}
function cpoAtivos(){return cpoCampos().filter(c=>c.ativo!==false).sort((a,b)=>(a.ordem||0)-(b.ordem||0))}
function cpoUsado(c){return S.terrenos.some(t=>(t.tarefas||[]).some(k=>k.campos&&k.campos[c.id]!=null))}
function cpoNum(v){const s=String(v).trim().toLowerCase().replace(/\s/g,'');if(!s)return null;const m=/^(-?[\d.,]+)(mil|mi)?$/.exec(s);if(!m)return NaN;
  let n=m[1];if(n.includes(','))n=n.replace(/\./g,'').replace(',','.');else if((n.match(/\./g)||[]).length>1||/\.\d{3}$/.test(n))n=n.replace(/\./g,'');
  const x=Number(n);return m[2]==='mil'?x*1e3:m[2]==='mi'?x*1e6:x}
function cpoTxt(c,v){if(v==null)return 'Não informado';if(c.tipo==='numero')return Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2});if(c.tipo==='data')return fd(v);
  if(c.tipo==='caixa')return v?'Sim':'Não';if(c.tipo==='lista')return (c.opcoes||[]).find(o=>o.id===v)?.nome||'—';return String(v)}
/* frente do cartão: só os campos marcados, e só com valor */
function cpoFrente(k){const cs=cpoAtivos().filter(c=>c.frente&&k.campos&&k.campos[c.id]!=null);if(!cs.length)return '';
  return `<div class="cpo-fr">${cs.map(c=>{const v=k.campos[c.id],o=c.tipo==='lista'?(c.opcoes||[]).find(x=>x.id===v):null;
    return `<span class="cpo-ch ${o?'etq-'+o.cor:''}" title="${esc(c.nome)}"><span class="cpo-chn">${esc(c.nome)}:</span> ${esc(cpoTxt(c,v))}</span>`}).join('')}</div>`}
/* janela do cartão: um bloco com todos os campos ativos (e os desativados que têm valor, só para ler) */
function cpoBlocoHtml(t,k,ro){const cs=cpoCampos().filter(c=>c.ativo!==false||(k.campos&&k.campos[c.id]!=null)).sort((a,b)=>(a.ordem||0)-(b.ordem||0));if(!cs.length)return '';
  const v=c=>k.campos?.[c.id],dis=c=>ro||c.ativo===false?'disabled':'';
  const campo=c=>{const x=v(c),id='cpo-'+c.id;let inp;
    if(c.tipo==='lista')inp=`<select id="${id}" class="tkm-pill cpo-in" data-cpo="${c.id}" ${dis(c)}><option value="">Não informado</option>${(c.opcoes||[]).filter(o=>o.ativo!==false||o.id===x).map(o=>`<option value="${o.id}" ${o.id===x?'selected':''}>${esc(o.nome)}</option>`).join('')}</select>`;
    else if(c.tipo==='caixa')inp=`<select id="${id}" class="tkm-pill cpo-in" data-cpo="${c.id}" ${dis(c)}><option value="">Não informado</option><option value="1" ${x===true?'selected':''}>Sim</option><option value="0" ${x===false?'selected':''}>Não</option></select>`;
    else if(c.tipo==='data')inp=`<input id="${id}" type="date" class="tkm-pill cpo-in" data-cpo="${c.id}" value="${x||''}" ${dis(c)}>`;
    else inp=`<input id="${id}" class="tkm-pill cpo-in" data-cpo="${c.id}" value="${x==null?'':esc(c.tipo==='numero'?cpoTxt(c,x):x)}" ${c.tipo==='numero'?'inputmode="decimal"':''} placeholder="Não informado" ${dis(c)}>`;
    return `<div class="cpo-c"><label for="${id}">${esc(c.nome)}${c.ativo===false?' <span class="faint">(desativado)</span>':''}</label>${inp}</div>`};
  return `<div class="tkm-bloco">${tkSecH('layers','Campos personalizados')}<div class="tkm-in cpo-g">${cs.map(campo).join('')}</div></div>`}
function cpoGravar(t,k,c,raw){const antes=k.campos?.[c.id];let v;
  if(raw===''||raw==null)v=null;
  else if(c.tipo==='numero'){v=cpoNum(raw);if(Number.isNaN(v)){toast(`Número inválido em ${c.nome}.`,true);return false}}
  else if(c.tipo==='caixa')v=raw==='1';else if(c.tipo==='texto'){v=String(raw).trim()||null}else v=raw;
  if(v===antes||(v==null&&antes==null))return false;k.campos=k.campos||{};if(v==null)delete k.campos[c.id];else k.campos[c.id]=v;
  log(t,`Tarefa "${k.titulo}": ${c.nome} de ${cpoTxt(c,antes)} para ${cpoTxt(c,v)}`);return true}
/* filtro da página Tarefas: campos de lista e sim/não */
function cpoFiltroOpts(sel){const cs=cpoAtivos().filter(c=>c.tipo==='lista'||c.tipo==='caixa');if(!cs.length)return '';
  return cs.map(c=>`<optgroup label="${esc(c.nome)}">${(c.tipo==='caixa'?[['1','Sim'],['0','Não'],['-','Não informado']]:[...(c.opcoes||[]).filter(o=>o.ativo!==false).map(o=>[o.id,o.nome]),['-','Não informado']]).map(([v,n])=>`<option value="${c.id}:${v}" ${sel===c.id+':'+v?'selected':''}>${esc(c.nome)}: ${esc(n)}</option>`).join('')}</optgroup>`).join('')}
function cpoFiltra(k,f){const [cid,v]=f.split(':'),x=k.campos?.[cid],c=cpoCampos().find(y=>y.id===cid);if(!c)return true;
  if(v==='-')return x==null;if(c.tipo==='caixa')return x===(v==='1');return x===v}

/* ---------- Configurações › Tarefas ---------- */
function cpoCfgHtml(){const C=cpoCampos().slice().sort((a,b)=>(a.ordem||0)-(b.ordem||0));
  return `<section class="sec"><div class="sec-h"><h2>Campos personalizados</h2></div><div class="sec-b">
    <p class="muted" style="margin-top:0">Valem para todos os quadros. Campo com valor não muda de tipo nem se apaga: desative.</p>
    ${C.map((c,i)=>{const usado=cpoUsado(c);return `<div class="cpo-cfg ${c.ativo===false?'oculta':''}"><div class="tkl-r"><input value="${esc(c.nome)}" data-cpoc="nome" data-v="${c.id}" aria-label="Nome do campo ${i+1}">
      <select data-cpoc="tipo" data-v="${c.id}" aria-label="Tipo de ${esc(c.nome)}" ${usado?'disabled title="Já tem valores: o tipo não muda"':''}>${Object.entries(CPO_TIPOS).map(([x,n])=>`<option value="${x}" ${x===c.tipo?'selected':''}>${n}</option>`).join('')}</select>
      <label class="chk"><input type="checkbox" data-cpoc="frente" data-v="${c.id}" ${c.frente?'checked':''}>Na frente do cartão</label>
      <button class="iconbtn sm" data-a="cpo-sobe" data-v="${c.id}" ${i?'':'disabled'} aria-label="Subir ${esc(c.nome)}" title="Subir">${ic('chev',18)}</button>
      ${usado?`<button class="btn text sm" data-a="cpo-ativo" data-v="${c.id}">${c.ativo===false?'Ativar':'Desativar'}</button>`:`<button class="btn text sm" data-a="cpo-apaga" data-v="${c.id}">Apagar</button>`}</div>
      ${c.tipo==='lista'?`<div class="cpo-ops">${(c.opcoes||[]).map(o=>`<span class="cpo-op ${o.ativo===false?'oculta':''}"><span class="etq etq-${o.cor}">${esc(o.nome)}</span><button class="iconbtn sm" data-a="cpo-op-x" data-v="${c.id}" data-o="${o.id}" aria-label="${o.ativo===false?'Reativar':'Tirar'} ${esc(o.nome)}" title="${o.ativo===false?'Reativar':'Tirar'}">${ic(o.ativo===false?'undo':'close',14)}</button></span>`).join('')}
        <form class="tkm-nf cpo-opf" data-form="cpo-op" data-v="${c.id}"><input name="nome" required placeholder="Nova opção" aria-label="Nova opção de ${esc(c.nome)}"><select name="cor" aria-label="Cor">${Object.entries(ETQ_CORES).map(([x,n])=>`<option value="${x}">${n}</option>`).join('')}</select><button class="btn tonal sm" type="submit">Adicionar</button></form></div>`:''}</div>`}).join('')}
    <form class="tkm-nf" data-form="cpo-novo" style="margin-top:12px"><input name="nome" required placeholder="Novo campo (ex.: Valor do laudo)" aria-label="Nome do novo campo"><select name="tipo" aria-label="Tipo">${Object.entries(CPO_TIPOS).map(([x,n])=>`<option value="${x}">${n}</option>`).join('')}</select><button class="btn tonal sm" type="submit">Criar campo</button></form></div></section>`}

document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset?.cpo){e.stopImmediatePropagation();const {t,k}=tkAtual(),c=cpoCampos().find(x=>x.id===el.dataset.cpo);if(!k||!c||!vzEdita(t,k)||c.ativo===false)return;
    if(cpoGravar(t,k,c,el.value))tkRe();else if(c.tipo==='numero'&&el.value)el.value=k.campos?.[c.id]!=null?cpoTxt(c,k.campos[c.id]):'';return}
  if(el.dataset?.cpoc){e.stopImmediatePropagation();if(!ehAdmin(me()))return;const c=cpoCampos().find(x=>x.id===el.dataset.v);if(!c)return;const p=el.dataset.cpoc;
    if(p==='nome'){const v=el.value.trim();if(!v||cpoCampos().some(x=>x!==c&&x.nome===v)){toast(v?'Já existe um campo com esse nome.':'O campo precisa de nome.',true);el.value=c.nome;return}c.nome=v}
    else if(p==='tipo'){if(cpoUsado(c)){toast('O campo já tem valores: o tipo não muda.',true);return}c.tipo=el.value;if(c.tipo==='lista'&&!c.opcoes)c.opcoes=[]}
    else if(p==='frente')c.frente=el.checked;
    save();render();toast('Campo atualizado.')}},true);
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="cpo-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();if(!ehAdmin(me()))return;
  const C=cpoCampos(),c=C.find(x=>x.id===a.dataset.v);if(!c)return;
  switch(a.dataset.a){
    case 'cpo-sobe':{const L=C.slice().sort((x,y)=>(x.ordem||0)-(y.ordem||0)),i=L.indexOf(c);if(i>0){L.splice(i,1);L.splice(i-1,0,c);L.forEach((x,j)=>x.ordem=j)}break}
    case 'cpo-ativo':c.ativo=c.ativo===false;toast(c.ativo?'Campo ativado.':'Campo desativado: some dos cartões, e os valores ficam guardados.');break;
    case 'cpo-apaga':if(cpoUsado(c)){toast('O campo já tem valores: desative em vez de apagar.',true);return}S.campos=C.filter(x=>x!==c);toast('Campo apagado.');break;
    case 'cpo-op-x':{const o=(c.opcoes||[]).find(x=>x.id===a.dataset.o);if(!o)return;const usada=S.terrenos.some(t=>(t.tarefas||[]).some(k=>k.campos?.[c.id]===o.id));
      if(o.ativo===false)o.ativo=true;else if(usada){o.ativo=false;toast('A opção já foi usada: fica desativada.')}else c.opcoes=c.opcoes.filter(x=>x!==o);break}
  }save();render()},true);
document.addEventListener('submit',e=>{const f=e.target,n=f.dataset?.form;if(n!=='cpo-novo'&&n!=='cpo-op')return;e.preventDefault();e.stopImmediatePropagation();if(!ehAdmin(me()))return;const F=Object.fromEntries(new FormData(f)),nm=F.nome.trim();
  if(n==='cpo-novo'){if(cpoCampos().some(x=>x.nome===nm)){toast('Já existe um campo com esse nome.',true);return}cpoCampos().push({id:uid(),nome:nm,tipo:F.tipo,ordem:cpoCampos().length,frente:false,ativo:true,opcoes:F.tipo==='lista'?[]:undefined});toast(`Campo ${nm} criado.`)}
  else{const c=cpoCampos().find(x=>x.id===f.dataset.v);if((c.opcoes||[]).some(o=>o.nome===nm)){toast('Essa opção já existe.',true);return}(c.opcoes=c.opcoes||[]).push({id:uid(),nome:nm,cor:F.cor,ativo:true})}
  save();render()},true);

/* exemplo: três campos da empresa e valores em dois cartões do primeiro terreno */
(()=>{if(S.cpoExemplo)return;S.cpoExemplo=true;
  const lis={id:uid(),nome:'Cartório',tipo:'lista',ordem:1,frente:true,ativo:true,opcoes:[{id:uid(),nome:'1º RI',cor:'azul',ativo:true},{id:uid(),nome:'2º RI',cor:'roxo',ativo:true},{id:uid(),nome:'3º RI',cor:'verde',ativo:true}]};
  S.campos=[{id:uid(),nome:'Valor do laudo',tipo:'numero',ordem:0,frente:true,ativo:true},lis,{id:uid(),nome:'Exige vistoria',tipo:'caixa',ordem:2,frente:false,ativo:true}];
  const t=S.terrenos[0];if(!t||!t.tarefas)return;const a=t.tarefas.find(x=>x.titulo==='Análise jurídica da matrícula');if(a)a.campos={[lis.id]:lis.opcoes[1].id,[S.campos[2].id]:false};
  const b=t.tarefas.find(x=>x.titulo==='Estudo de massa');if(b)b.campos={[S.campos[0].id]:185000}})();
