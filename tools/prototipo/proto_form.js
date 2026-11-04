/* =====================================================================
   Formulário da tarefa, máscaras e criação rápida (decisões do Moisés,
   1/nov/2026; simulação "Formulário da tarefa").
   Espelha fluxo.tarefa_itens (pergunta, ajuda, forma, tipo, opcoes,
   resposta), fluxo.formas, fluxo.validar_formato, fluxo.campos.formato e
   app.campos_catalogo/campos_empresa.formato.
   - Bloco Formulário na Visão geral do cartão, no lugar do antigo "+ Campo":
     cada item é uma pergunta com o texto e a ajuda de quem montou, o campo
     onde a resposta grava (campo do terreno marcado "No cartão", campo
     personalizado ou "Só no cartão") e a forma de responder. Montar é de
     quem edita o cartão; os demais veem as respostas.
   - A forma muda a aparência, nunca o dado: cada tipo oferece só as formas
     que guardam o valor certo (fmFormas). A chave liga/desliga começa no
     meio ("não informado"), vira Sim ou Não no primeiro toque e só volta ao
     meio por "Limpar resposta" no menu da pergunta.
   - Máscaras: moeda e percentual nos números; e-mail, telefone, CPF, CNPJ e
     CEP nos textos, com formatação ao digitar e conferência (CPF e CNPJ pelo
     dígito verificador). Guardado só com os dígitos (e-mail em minúsculas).
   - Criação rápida: título, terreno (dentro da ficha já vem), descrição
     opcional e visibilidade; o resto no padrão. "Mais opções" abre a
     janela completa com o que já foi digitado.
   Injetado no mesmo escopo, depois de proto_itens.js.
   ===================================================================== */
Object.assign(P,{drag:'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01'});
const FM_FORMA={menu:'Lista suspensa',radio:'Botões de opção',chips:'Chips',segmentado:'Segmentado',chave:'Chave liga/desliga',caixas:'Caixas de seleção',botoes:'Botões Sim · Não',linha:'Linha curta',paragrafo:'Parágrafo',campo:'Campo'};
const FM_TIPOS={texto:'Texto curto',paragrafo:'Parágrafo',numero:'Número',moeda:'Moeda (R$)',percentual:'Percentual (%)',data:'Data',sim_nao:'Sim / não',lista:'Lista de opções',email:'E-mail',telefone:'Telefone',cpf:'CPF',cnpj:'CNPJ'};
const FM_MASK={email:'E-mail',telefone:'Telefone',cpf:'CPF',cnpj:'CNPJ'};
/* formas de cada tipo (a primeira é o padrão), como fluxo.formas */
function fmFormas(tipo,n){if(tipo==='lista')return (n||0)>6?['menu']:['menu','radio','chips',...(n>=2&&n<=4?['segmentado']:[]),...(n===2?['chave']:[])];
  if(tipo==='lista_multi')return ['caixas','chips'];if(tipo==='sim_nao'||tipo==='caixa')return ['botoes','chave'];if(tipo==='texto'||tipo==='paragrafo')return ['linha','paragrafo'];return ['campo']}

/* ---------- máscaras ---------- */
const fmDig=v=>String(v??'').replace(/\D/g,'');
/* confere e devolve como fica guardado (como fluxo.validar_formato); erro com a mensagem para o usuário */
function fmValida(f,v){const s=String(v??'').trim();if(!s)return null;const d=fmDig(s);
  if(f==='email'){const x=s.toLowerCase();if(!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(x))throw new Error('E-mail inválido.');return x}
  if(f==='telefone'){if(![10,11].includes(d.length)||d[0]==='0'||d[1]==='0'||(d.length===11&&d[2]!=='9'))throw new Error('Telefone inválido: use DDD e número (10 ou 11 dígitos).');return d}
  if(f==='cep'){if(d.length!==8)throw new Error('CEP inválido: são 8 dígitos.');return d}
  if(f==='cpf'){if(d.length!==11||/^(\d)\1{10}$/.test(d))throw new Error('CPF inválido.');
    for(const r of [9,10]){let x=0;for(let i=0;i<r;i++)x+=+d[i]*(r+1-i);if((x*10%11)%10!==+d[r])throw new Error('CPF inválido.')}return d}
  if(f==='cnpj'){if(d.length!==14||/^(\d)\1{13}$/.test(d))throw new Error('CNPJ inválido.');
    for(const r of [12,13]){let x=0;for(let i=0;i<r;i++)x+=+d[i]*((r-1-i)%8+2);x=x%11<2?0:11-x%11;if(x!==+d[r])throw new Error('CNPJ inválido.')}return d}
  return s}
const FM_PAD={cpf:'000.000.000-00',cnpj:'00.000.000/0000-00',cep:'00000-000'};
/* formata os dígitos que já existem (enquanto digita e para mostrar) */
function fmParcial(f,v){if(f==='email'||!f)return String(v??'');const d=fmDig(v);if(!d)return '';
  const pad=f==='telefone'?(d.length>10?'(00) 00000-0000':'(00) 0000-0000'):FM_PAD[f];if(!pad)return String(v);let o='',j=0;
  for(const c of pad){if(j>=d.length)break;if(c==='0')o+=d[j++];else o+=c}return o+(j<d.length&&f!=='telefone'?'':d.slice(j))}
const fmMostra=(f,v)=>v==null||v===''?'':f&&f!=='email'&&FM_PAD[f]||f==='telefone'?fmParcial(f,v):String(v);
document.addEventListener('input',e=>{const el=e.target;if(el.tagName!=='INPUT'||!el.dataset.mask||el.dataset.mask==='email')return;const n=fmParcial(el.dataset.mask,el.value);if(n!==el.value)el.value=n},true);
/* campo personalizado com máscara: confere antes de gravar (como o gatilho de fluxo.tarefa_campos) */
{const ex=cpoGravar;cpoGravar=function(t,k,c,raw){if(c.tipo==='texto'&&c.formato&&raw!==''&&raw!=null){try{raw=fmValida(c.formato,raw)}catch(er){toast(`${c.nome}: ${er.message}`,true);return false}}return ex(t,k,c,raw)}}
{const ex=cpoTxt;cpoTxt=function(c,v){if(v!=null&&c.tipo==='texto'&&c.formato)return fmMostra(c.formato,v);if(v!=null&&c.tipo==='numero'&&c.formato==='moeda')return 'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(v!=null&&c.tipo==='numero'&&c.formato==='percentual')return Number(v).toLocaleString('pt-BR',{maximumFractionDigits:4})+'%';return ex(c,v)}}
/* Configurações › Campos: máscara do campo de texto (as fixas só aparecem) */
function fmMascaraCfg(d){if(d.formato&&(d.tipo!=='texto'||IT_CAT.find(c=>c.chave===d.chave)?.formato))return `<span class="faint">${{moeda:'Moeda',percentual:'Percentual',cep:'CEP'}[d.formato]||FM_MASK[d.formato]}</span>`;
  if(d.tipo!=='texto')return '<span class="faint">—</span>';
  return `<select data-itcfg="formato" data-v="${d.chave}" aria-label="Máscara de ${esc(d.titulo)}"><option value="">Sem máscara</option>${Object.entries(FM_MASK).map(([x,n])=>`<option value="${x}" ${d.formato===x?'selected':''}>${n}</option>`).join('')}</select>`}

/* ---------- o que cada pergunta é ---------- */
/* {tipo, formato, opcoes:[[valor, nome]], titulo, dest, editavel, valor} */
function fmInfo(t,k,i){
  if(i.tipo){const base={texto:'texto',paragrafo:'paragrafo',numero:'numero',moeda:'numero',percentual:'numero',data:'data',sim_nao:'sim_nao',lista:'lista',email:'texto',telefone:'texto',cpf:'texto',cnpj:'texto'}[i.tipo];
    return {tipo:base,formato:{moeda:'moeda',percentual:'percentual',email:'email',telefone:'telefone',cpf:'cpf',cnpj:'cnpj'}[i.tipo]||null,opcoes:i.tipo==='lista'?(i.opcoes||[]).map(o=>[o,o]):null,
      titulo:i.pergunta,dest:'Só no cartão',editavel:true,valor:i.resposta??null}}
  if(i.chave){const d=itDef(i.chave);if(!d)return null;const o=d.opcoes?d.opcoes():null;
    return {tipo:d.tipo,formato:d.formato,opcoes:o&&d.tipo!=='pessoa'?Object.entries(o):null,pessoas:d.tipo==='pessoa'?Object.keys(o||{}):null,titulo:d.titulo,dest:`${IT_ORIG[d.origem]} › ${d.titulo}`,editavel:d.editavel,valor:itVal(t,i.chave),un:d.un}}
  const c=itCampo(i);if(!c)return null;
  return {tipo:c.tipo==='caixa'?'sim_nao':c.tipo,formato:c.formato||null,opcoes:c.tipo==='lista'?(c.opcoes||[]).filter(o=>o.ativo!==false||o.id===k.campos?.[c.id]).map(o=>[o.id,o.nome]):null,
    titulo:c.nome,dest:`Campo personalizado › ${c.nome}`,editavel:c.ativo!==false,valor:k.campos?.[c.id]??null}}
/* formas que a pergunta aceita: texto com máscara é sempre uma linha; máscara "só no cartão" é campo */
function fmFormasDe(i,f){if(!f)return ['campo'];if(i.tipo&&FM_MASK[i.tipo])return ['campo'];if(f.tipo==='texto'&&f.formato)return ['linha'];return fmFormas(f.tipo,f.opcoes?.length)}
const fmForma=(i,f)=>{const L=fmFormasDe(i,f);return L.includes(i.forma)?i.forma:i.tipo==='paragrafo'?'paragrafo':L[0]};
function fmTxt(f,v){if(v==null)return 'Não informado';if(f.tipo==='sim_nao')return v?'Sim':'Não';if(f.tipo==='data')return fd(v);
  if(f.tipo==='numero'){const n=Number(v);return f.formato==='moeda'||f.un==='R$'?'R$ '+n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):n.toLocaleString('pt-BR',{maximumFractionDigits:4})+(f.formato==='percentual'||f.un==='%'?'%':f.un?' '+f.un:'')}
  if(Array.isArray(v))return v.map(x=>(f.opcoes||[]).find(o=>String(o[0])===String(x))?.[1]??x).join(', ');
  if(f.opcoes)return (f.opcoes.find(o=>String(o[0])===String(v))||[])[1]??String(v);if(f.formato)return fmMostra(f.formato,v);return String(v)}

/* ---------- gravar a resposta ---------- */
function fmGravar(t,k,i,raw){const f=fmInfo(t,k,i);if(!f||!f.editavel)return false;
  if(i.campo){const c=itCampo(i);let r=raw;if(f.tipo==='sim_nao')r=raw===true?'1':raw===false?'0':'';if(cpoGravar(t,k,c,r==null?'':r)){tkRe();return true}return false}
  let v=raw;if(v===''||v==null)v=null;
  else if(f.tipo==='numero'){v=typeof v==='number'?v:cpoNum(v);if(Number.isNaN(v)){toast(`Número inválido em ${f.titulo}.`,true);return false}}
  else if(f.tipo==='texto'&&f.formato){try{v=fmValida(f.formato,v)}catch(er){toast(er.message,true);return false}}
  else if(typeof v==='string'&&f.tipo!=='data')v=v.trim()||null;
  if(i.chave){const d=itDef(i.chave),antes=itVal(t,d.chave);if(String(antes??'')===String(v??''))return false;try{d.gravar(t,v??d.vazio??null)}catch(err){toast(err.message,true);return false}
    log(t,`${d.titulo} de ${itTxtVal(d,antes)} para ${itTxtVal(d,v)} (pelo cartão ${k.codigo})`);tkRe();return true}
  const antes=i.resposta??null;if(antes===v)return false;if(v==null)delete i.resposta;else i.resposta=v;
  log(t,`Tarefa "${k.titulo}": ${i.pergunta} de ${fmTxt(f,antes)} para ${fmTxt(f,v)}`);tkRe();return true}

/* ---------- responder ---------- */
function fmControle(t,k,i,f,ro){const v=f.valor,id='fm-'+i.id,forma=fmForma(i,f),dis=ro||!f.editavel;
  if(dis)return `<span class="fm-ro ${v==null?'faint':''}">${esc(fmTxt(f,v))}${!f.editavel&&!ro?' <span class="faint">· só leitura</span>':''}</span>`;
  const opc=f.opcoes||[],sel=x=>String(v??'')===String(x);
  if(f.tipo==='sim_nao'){if(forma==='chave')return fmChave(i,v===true?'on':v===false?'off':null,v===true?'Sim':v===false?'Não':null,'s','n');
    return `<span class="fm-seg" role="group" aria-label="${esc(f.titulo)}">${[[true,'Sim'],[false,'Não']].map(([x,n])=>`<button class="${v===x?'on':''}" data-a="fm-v" data-i="${i.id}" data-v="${x?'s':'n'}" aria-pressed="${v===x}">${n}</button>`).join('')}</span>`}
  if(f.opcoes&&f.tipo==='lista'){
    if(forma==='radio')return `<span class="fm-rd" role="radiogroup" aria-label="${esc(f.titulo)}">${opc.map(([x,n])=>`<label><input type="radio" name="${id}" value="${esc(x)}" data-fm="${i.id}" ${sel(x)?'checked':''}>${esc(n)}</label>`).join('')}</span>`;
    if(forma==='chips'||forma==='segmentado')return `<span class="${forma==='chips'?'fm-chips':'fm-seg'}" role="group" aria-label="${esc(f.titulo)}">${opc.map(([x,n])=>`<button class="${sel(x)?'on':''}" data-a="fm-v" data-i="${i.id}" data-v="${esc(x)}" aria-pressed="${sel(x)}">${esc(n)}</button>`).join('')}</span>`;
    if(forma==='chave'&&opc.length===2)return fmChave(i,sel(opc[1][0])?'on':sel(opc[0][0])?'off':null,v==null?null:fmTxt(f,v),opc[1][0],opc[0][0]);
    return `<select id="${id}" class="fm-in" data-fm="${i.id}"><option value="">Não informado</option>${opc.map(([x,n])=>`<option value="${esc(x)}" ${sel(x)?'selected':''}>${esc(n)}</option>`).join('')}</select>`}
  if(f.pessoas)return `<select id="${id}" class="fm-in" data-fm="${i.id}"><option value="">Não informado</option>${f.pessoas.map(u=>`<option ${u===v?'selected':''}>${esc(u)}</option>`).join('')}</select>`;
  if(f.tipo==='data')return `<input id="${id}" type="date" class="fm-in" data-fm="${i.id}" value="${v||''}">`;
  if(f.tipo==='numero'){const fmt=f.formato==='moeda'||f.un==='R$'?'moeda':f.formato==='percentual'||f.un==='%'?'pct':'num';
    return `<span class="fm-numw"><input id="${id}" class="fm-in" data-fm="${i.id}" inputmode="decimal" data-fmt="${fmt}" value="${v==null?'':esc(Number(v).toLocaleString('pt-BR',{maximumFractionDigits:fmt==='pct'?4:2}))}" placeholder="Não informado">${f.un&&f.un!=='R$'&&f.un!=='%'?`<span class="fm-un">${esc(f.un)}</span>`:''}</span>`}
  if(forma==='paragrafo')return `<textarea id="${id}" class="fm-in fm-area" data-fm="${i.id}" placeholder="Não informado">${esc(v??'')}</textarea>`;
  const ph={email:'nome@empresa.com.br',telefone:'(11) 98765-4321',cpf:'000.000.000-00',cnpj:'00.000.000/0000-00',cep:'00000-000'}[f.formato]||'Não informado';
  return `<input id="${id}" class="fm-in" data-fm="${i.id}" ${f.formato?`data-mask="${f.formato}" inputmode="${f.formato==='email'?'email':'numeric'}"`:''} value="${esc(fmMostra(f.formato,v))}" placeholder="${ph}">`}
/* chave de três estados: no meio (não informado) cada metade escolhe; depois, o toque alterna */
function fmChave(i,est,rot,vOn,vOff){
  return `<span class="fm-tgw">${est?`<button class="fm-tg ${est}" role="switch" aria-checked="${est==='on'}" data-a="fm-v" data-i="${i.id}" data-v="${esc(est==='on'?vOff:vOn)}" aria-label="${esc(rot)}: tocar para trocar"></button>`
      :`<span class="fm-tg mid" role="group" aria-label="Não informado"><button data-a="fm-v" data-i="${i.id}" data-v="${esc(vOff)}" aria-label="Responder ${vOff==='n'?'Não':esc(String(vOff))}"></button><button data-a="fm-v" data-i="${i.id}" data-v="${esc(vOn)}" aria-label="Responder ${vOn==='s'?'Sim':esc(String(vOn))}"></button></span>`}
    <span class="${est?'':'faint'}">${est?esc(rot):'Não informado'}</span>${est?'':'<span class="faint fm-dica">toque num lado para responder</span>'}</span>`}

/* ---------- bloco Formulário ---------- */
function fmBloco(t,k,bloq){itNorm(k);const ed=!bloq&&vzEdita(t,k)&&UI.role!=='Leitura',its=k.itens;
  if(!its.length&&!ed)return '';const modo=ed&&(UI.fmModo?.[k.id]||(its.length?'responder':'montar'));
  const resp=its.filter(i=>!itEmBranco(t,k,i)).length;
  const cab=`<div class="tkm-sh fm-h"><h3>Formulário</h3>${its.length?`<span class="faint tkm-ckn">${modo==='montar'?`${its.length} ${its.length>1?'perguntas':'pergunta'}`:`${resp} de ${its.length}`}</span>${modo!=='montar'?`<span class="fm-prog" aria-hidden="true"><i style="width:${Math.round(100*resp/its.length)}%"></i></span>`:''}`:''}
    ${ed&&its.length?`<span class="tkm-shd"><span class="fm-modo" role="group" aria-label="Modo do formulário"><button class="${modo==='montar'?'on':''}" data-a="fm-modo" data-v="montar" aria-pressed="${modo==='montar'}">Montar</button><button class="${modo!=='montar'?'on':''}" data-a="fm-modo" data-v="responder" aria-pressed="${modo!=='montar'}">Responder</button></span></span>`:''}</div>`;
  if(modo==='montar')return `<div class="tkm-bloco fm" data-fmk="${k.id}">${cab}<div class="fm-lista">${its.map(i=>fmLinhaMontar(t,k,i)).join('')}</div>${fmEditor(t,k)}</div>`;
  return `<div class="tkm-bloco fm" data-fmk="${k.id}">${cab}<div class="fm-lista">${its.map(i=>{const f=fmInfo(t,k,i);if(!f)return '';const v=!itEmBranco(t,k,i),lab=f.opcoes&&!['menu'].includes(fmForma(i,f))||f.tipo==='sim_nao';
    return `<div class="fm-ans ${itEmBranco(t,k,i)&&itSelo(t,k,i)?'falta':''}" id="fma-${i.id}"><div class="fm-q">${lab?`<span class="fm-qt">${esc(i.pergunta||f.titulo)}</span>`:`<label class="fm-qt" for="fm-${i.id}">${esc(i.pergunta||f.titulo)}</label>`}${itSelo(t,k,i)}
      ${ed&&v&&f.editavel?`<span class="fm-mw"><button class="iconbtn sm" data-a="fm-menu" data-v="${i.id}" aria-expanded="${UI.fmMenu===i.id}" aria-label="Mais ações de ${esc(i.pergunta||f.titulo)}" title="Mais ações">${ic('mais',18)}</button>${UI.fmMenu===i.id?`<span class="fm-menu" role="menu"><button role="menuitem" data-a="fm-limpa" data-v="${i.id}">Limpar resposta</button></span>`:''}</span>`:''}</div>
      ${i.ajuda?`<div class="fm-aj">${esc(i.ajuda)}</div>`:''}<div class="fm-c">${fmControle(t,k,i,f,!ed)}</div><div class="fm-dest">${i.tipo?'Só no cartão':`Grava em <b>${esc(f.dest)}</b>`}</div></div>`}).join('')}</div></div>`}
function fmLinhaMontar(t,k,i){const f=fmInfo(t,k,i);if(!f)return '';const trava=i.regra&&i.regra!=='livre'&&!itConfigura(t,k);
  if(UI.fmEd?.id===i.id)return '';
  return `<div class="fm-row" draggable="true" data-fmrow="${i.id}"><span class="fm-drag" title="Arraste para mudar a ordem" aria-hidden="true">${ic('drag',18)}</span>
    <div class="fm-rb"><div class="fm-rt">${esc(i.pergunta||f.titulo)}</div><div class="fm-rm">${i.tipo?`Só no cartão · ${FM_TIPOS[i.tipo]}`:`Grava em ${esc(f.dest)}`}${fmFormasDe(i,f).length>1?' · '+FM_FORMA[fmForma(i,f)]:''}</div></div>
    <span class="fm-ra"><button class="iconbtn sm" data-a="fm-sobe" data-v="${i.id}" title="Subir" aria-label="Subir ${esc(i.pergunta||f.titulo)}" ${k.itens[0]===i?'disabled':''}>${ic('chev',18)}</button>
      <button class="iconbtn sm" data-a="fm-edita" data-v="${i.id}" title="Editar" aria-label="Editar ${esc(i.pergunta||f.titulo)}">${ic('edit',18)}</button>
      <button class="iconbtn sm" data-a="fm-tira" data-v="${i.id}" title="${trava?'Tem regra para concluir':'Tirar do formulário'}" aria-label="Tirar ${esc(i.pergunta||f.titulo)}" ${trava?'disabled':''}>${ic('close',18)}</button></span></div>`}
/* editor de pergunta (nova ou existente) */
function fmEditor(t,k){const E=UI.fmEd;if(!E||E.kid!==k.id)return `<button class="tkm-add" data-a="fm-nova">${ic('add',16)}Pergunta</button>`;
  const ex=E.id?k.itens.find(x=>x.id===E.id):null,usados=new Set(k.itens.filter(x=>x!==ex).map(x=>x.chave||x.campo).filter(Boolean));
  const q=(E.q||'').toLowerCase(),ob=IT_CAT.map(c=>itDef(c.chave)).filter(d=>d.cartao&&!usados.has(d.chave)&&(!q||d.titulo.toLowerCase().includes(q))),cp=cpoAtivos().filter(c=>!usados.has(c.id)&&(!q||c.nome.toLowerCase().includes(q)));
  const dnome=E.dest==='cartao'?'Só no cartão':E.dest?.startsWith('c:')?cpoCampos().find(c=>c.id===E.dest.slice(2))?.nome:E.dest?itDef(E.dest)?.titulo:'';
  const pop=E.busca&&!ex?`<div class="fm-pop" role="listbox" aria-label="Onde a resposta grava">${Object.keys(IT_ORIG).map(o=>{const l=ob.filter(d=>d.origem===o);return l.length?`<div class="it-popg">${IT_ORIG[o]}</div>${l.map(d=>`<button class="it-popi" role="option" data-a="fm-dest" data-v="${d.chave}">${esc(d.titulo)}<span class="faint">${IT_TIPO[d.tipo]}${d.formato?' · '+({moeda:'moeda',percentual:'percentual',cep:'CEP'}[d.formato]||FM_MASK[d.formato].toLowerCase()):''}${d.editavel?'':' · só leitura'}</span></button>`).join('')}`:''}).join('')}
      ${cp.length?`<div class="it-popg">Campos personalizados</div>${cp.map(c=>`<button class="it-popi" role="option" data-a="fm-dest" data-v="c:${c.id}">${esc(c.nome)}<span class="faint">${CPO_TIPOS[c.tipo].toLowerCase()}${c.formato?' · '+(FM_MASK[c.formato]||c.formato).toLowerCase():''}</span></button>`).join('')}`:''}
      <div class="it-popg">Sem gravar</div><button class="it-popi" role="option" data-a="fm-dest" data-v="cartao">Só no cartão<span class="faint">a resposta fica na tarefa</span></button></div>`:'';
  /* tipo e formas */
  const tmp=E.dest?{id:'x',tipo:E.dest==='cartao'?E.tipo:undefined,opcoes:E.dest==='cartao'&&E.tipo==='lista'?fmOpcoes(E.opcoes):undefined,chave:E.dest&&E.dest!=='cartao'&&!E.dest.startsWith('c:')?E.dest:undefined,campo:E.dest?.startsWith('c:')?E.dest.slice(2):undefined,pergunta:E.pergunta||'?'}:null;
  const fi=tmp?fmInfo(t,k,tmp):null,formas=tmp&&fi?fmFormasDe(tmp,fi):[],fsel=formas.includes(E.forma)?E.forma:(tmp?fmForma(tmp,fi):null);
  const tem=!!(ex?.resposta!=null);
  return `<div class="fm-ed" role="group" aria-label="${ex?'Editar pergunta':'Nova pergunta'}"><div class="fm-edt">${ex?'Editar pergunta':'Nova pergunta'}</div>
    <div class="fm-g2"><div class="fm-f"><label for="fme-p">Pergunta${E.dest&&E.dest!=='cartao'?' <span class="faint">(vazia usa o título do campo)</span>':''}</label><input id="fme-p" data-fme="pergunta" value="${esc(E.pergunta||'')}" placeholder="${E.dest&&E.dest!=='cartao'?esc(dnome||''):'Ex.: Como está a ocupação hoje?'}"></div>
      <div class="fm-f"><label for="fme-a">Ajuda (opcional)</label><input id="fme-a" data-fme="ajuda" value="${esc(E.ajuda||'')}" placeholder="Ex.: veja se há inquilino ou invasão"></div></div>
    <div class="fm-f fm-destw"><label for="fme-d">Grava em</label>${ex?`<span class="fm-fix">${esc(fi?.dest||dnome)}</span>`
      :`<button id="fme-d" class="fm-destb" data-a="fm-busca" aria-expanded="${!!E.busca}">${E.dest?esc(dnome):'<span class="faint">Escolher campo</span>'}${ic('chevD',18)}</button>${E.busca?`<input class="it-busca fm-q-in" data-fmq="1" value="${esc(E.q||'')}" placeholder="Buscar campo" aria-label="Buscar campo">`:''}${pop}`}</div>
    ${E.dest==='cartao'?`<div class="fm-g2"><div class="fm-f"><label for="fme-t">Tipo de resposta</label><select id="fme-t" data-fme="tipo" ${tem?'disabled title="Já tem resposta: o tipo não muda"':''}>${Object.entries(FM_TIPOS).map(([x,n])=>`<option value="${x}" ${E.tipo===x?'selected':''}>${n}</option>`).join('')}</select></div>
      ${E.tipo==='lista'?`<div class="fm-f"><label for="fme-o">Opções (uma por linha)</label><textarea id="fme-o" data-fme="opcoes" rows="3" placeholder="Bom&#10;Ruim">${esc(E.opcoes||'')}</textarea></div>`:'<div></div>'}</div>`:''}
    ${formas.length>1?`<div class="fm-f"><span class="fm-lbl">Forma de responder</span><div class="fm-formas" role="radiogroup" aria-label="Forma de responder">${formas.map(x=>`<button class="fm-fo ${x===fsel?'on':''}" role="radio" aria-checked="${x===fsel}" data-a="fm-forma" data-v="${x}"><b>${FM_FORMA[x]}</b>${fmPrevia(x,fi)}</button>`).join('')}</div></div>`
      :fi?`<p class="faint fm-n1">${fi.tipo==='texto'&&fi.formato?`Máscara ${({cep:'CEP'}[fi.formato]||FM_MASK[fi.formato]||fi.formato)}: uma linha, formatada ao digitar.`:'Este tipo tem uma forma só.'}</p>`:''}
    <div class="fm-edb"><span class="faint">${E.dest&&E.dest!=='cartao'?'A resposta grava no próprio registro. ':''}Regra em branco e "Vale quando" ficam na aba Configuração.</span><span class="tkm-sp"></span>
      <button class="btn text sm" data-a="fm-cancela">Cancelar</button><button class="btn primary sm" data-a="fm-salva">${ex?'Salvar':'Incluir pergunta'}</button></div></div>`}
const fmOpcoes=s=>[...new Set(String(s||'').split(/\n|;/).map(x=>x.trim()).filter(Boolean))];
function fmPrevia(x,f){const o=(f?.opcoes||[]).slice(0,2).map(y=>esc(String(y[1]))),a=o[0]||'Opção 1',b=o[1]||'Opção 2';
  return {menu:`<span class="fm-pv"><span class="fm-pvs">${a} ▾</span></span>`,radio:`<span class="fm-pv"><span class="fm-pvr on"></span>${a}<span class="fm-pvr"></span>${b}</span>`,chips:`<span class="fm-pv"><span class="fm-pvc on">${a}</span><span class="fm-pvc">${b}</span></span>`,
    segmentado:`<span class="fm-pv fm-pvg"><span class="on">${a}</span><span>${b}</span></span>`,chave:`<span class="fm-pv"><span class="fm-tg mid sm"></span>Não informado</span>`,botoes:`<span class="fm-pv fm-pvg"><span class="on">Sim</span><span>Não</span></span>`,
    caixas:`<span class="fm-pv">☑ ${a}</span>`,linha:`<span class="fm-pv"><span class="fm-pvs">Texto</span></span>`,paragrafo:`<span class="fm-pv"><span class="fm-pvs fm-pva">Texto longo</span></span>`,campo:''}[x]||''}

/* ---------- eventos ---------- */
document.addEventListener('input',e=>{const el=e.target;
  if(el.dataset?.fme){e.stopImmediatePropagation();UI.fmEd[el.dataset.fme]=el.value;if(el.dataset.fme==='opcoes'){const p=el.selectionStart;tkRe();const n=document.querySelector('[data-fme=opcoes]');if(n){n.focus();n.setSelectionRange(p,p)}}return}
  if(el.dataset?.fmq){e.stopImmediatePropagation();UI.fmEd.q=el.value;const p=el.selectionStart;tkRe();const n=document.querySelector('[data-fmq]');if(n){n.focus();n.setSelectionRange(p,p)}return}},true);
document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset?.fme){e.stopImmediatePropagation();UI.fmEd[el.dataset.fme]=el.value;if(el.dataset.fme==='tipo'){UI.fmEd.forma=null;tkRe()}return}
  if(el.dataset?.fm){e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k||!vzEdita(t,k))return;const i=itNorm(k).find(x=>x.id===el.dataset.fm);if(!i)return;
    if(!fmGravar(t,k,i,el.value)){const f=fmInfo(t,k,i);if(el.tagName!=='SELECT'&&el.type!=='radio')el.value=f.tipo==='numero'&&f.valor!=null?Number(f.valor).toLocaleString('pt-BR',{maximumFractionDigits:4}):fmMostra(f.formato,f.valor)}return}},true);
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="fm-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const A=a.dataset.a;
  if(A==='fm-mais'||A==='fm-desc'){fmRapidaAcao(A);return}
  if(A==='fm-prz'){const el=document.querySelector('#tr-p');if(el)el.value=a.dataset.v==='m1'?fmMaisMes(HOJE):addD(HOJE,+a.dataset.v);return}
  const {t,k}=tkAtual();if(!k)return;const ed=vzEdita(t,k)&&!k.arq&&UI.role!=='Leitura';
  if(A==='fm-menu'){UI.fmMenu=UI.fmMenu===a.dataset.v?null:a.dataset.v;tkRe();return}
  if(!ed)return;itNorm(k);const i=k.itens.find(x=>x.id===a.dataset.v||x.id===a.dataset.i);
  switch(A){
    case 'fm-modo':UI.fmModo={...(UI.fmModo||{}),[k.id]:a.dataset.v};UI.fmEd=null;break;
    case 'fm-v':{if(!i)return;const f=fmInfo(t,k,i);let v=a.dataset.v;if(f.tipo==='sim_nao')v=v==='s';fmGravar(t,k,i,v);return}
    case 'fm-limpa':{UI.fmMenu=null;if(!i)return;fmGravar(t,k,i,null);return}
    case 'fm-nova':UI.fmEd={kid:k.id,id:null,pergunta:'',ajuda:'',dest:'',tipo:'texto',opcoes:'',forma:null,q:'',busca:true};break;
    case 'fm-edita':if(!i)return;UI.fmEd={kid:k.id,id:i.id,pergunta:i.pergunta||'',ajuda:i.ajuda||'',dest:i.tipo?'cartao':i.chave||('c:'+i.campo),tipo:i.tipo||'texto',opcoes:(i.opcoes||[]).join('\n'),forma:i.forma||null,q:'',busca:false};break;
    case 'fm-cancela':UI.fmEd=null;break;
    case 'fm-busca':UI.fmEd.busca=!UI.fmEd.busca;UI.fmEd.q='';tkRe();setTimeout(()=>document.querySelector('[data-fmq]')?.focus(),0);return;
    case 'fm-dest':Object.assign(UI.fmEd,{dest:a.dataset.v,busca:false,forma:null,q:''});tkRe();setTimeout(()=>document.querySelector(UI.fmEd.dest==='cartao'?'#fme-p':'#fme-p')?.focus(),0);return;
    case 'fm-forma':UI.fmEd.forma=a.dataset.v;break;
    case 'fm-salva':{if(!fmSalvar(t,k))return;break}
    case 'fm-sobe':{if(!i)return;const j=k.itens.indexOf(i);if(j>0){k.itens.splice(j,1);k.itens.splice(j-1,0,i);log(t,`Tarefa "${k.titulo}": ordem do formulário mudada`)}break}
    case 'fm-tira':{if(!i)return;if(i.regra&&i.regra!=='livre'&&!itConfigura(t,k)){toast('Esta pergunta tem regra para concluir: só o diretor, o administrador e quem criou a tarefa a tiram.',true);return}
      k.itens=k.itens.filter(x=>x!==i);log(t,`Tarefa "${k.titulo}": pergunta ${itNome(i)} tirada do formulário`);break}
  }tkRe()},true);
function fmSalvar(t,k){const E=UI.fmEd;if(!E.dest){toast('Escolha onde a resposta grava.',true);return false}
  const pergunta=(E.pergunta||'').trim()||null,ajuda=(E.ajuda||'').trim()||null;
  if(E.dest==='cartao'&&!pergunta){toast('Escreva a pergunta.',true);return false}
  let opcoes;if(E.dest==='cartao'&&E.tipo==='lista'){opcoes=fmOpcoes(E.opcoes);if(opcoes.length<2){toast('A lista precisa de pelo menos duas opções.',true);return false}}
  const ex=E.id?k.itens.find(x=>x.id===E.id):null;
  if(ex&&E.dest==='cartao'&&ex.resposta!=null&&ex.tipo!==E.tipo){toast('A pergunta já tem resposta: o tipo não muda.',true);return false}
  if(ex&&ex.tipo==='lista'&&ex.resposta!=null&&opcoes&&!opcoes.includes(ex.resposta)){toast(`A resposta "${ex.resposta}" precisa continuar entre as opções.`,true);return false}
  const base=ex||{id:uid(),regra:'livre',cond:null};
  const novo={...base,pergunta,ajuda,forma:null};
  if(E.dest==='cartao'){novo.tipo=E.tipo;novo.opcoes=opcoes;delete novo.chave;delete novo.campo}else if(E.dest.startsWith('c:')){novo.campo=E.dest.slice(2)}else novo.chave=E.dest;
  const fi=fmInfo(t,k,novo),L=fmFormasDe(novo,fi);novo.forma=E.forma&&L.includes(E.forma)&&E.forma!==L[0]?E.forma:null;
  if(novo.tipo==='paragrafo'&&E.forma==='linha')novo.forma='linha';
  if(ex)Object.assign(ex,novo);else k.itens.push(novo);
  log(t,`Tarefa "${k.titulo}": pergunta ${itNome(novo)} ${ex?'alterada':'incluída'} no formulário`);UI.fmEd=null;return true}
/* arrastar para mudar a ordem */
let fmArr=null;
document.addEventListener('dragstart',e=>{const r=e.target.closest?.('[data-fmrow]');if(!r)return;fmArr=r.dataset.fmrow;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',fmArr)}catch(er){}r.classList.add('arrasta')},true);
document.addEventListener('dragover',e=>{if(!fmArr)return;const r=e.target.closest?.('[data-fmrow]');if(!r)return;e.preventDefault();document.querySelectorAll('.fm-row.sobre').forEach(x=>x!==r&&x.classList.remove('sobre'));r.classList.add('sobre')},true);
document.addEventListener('dragend',()=>{fmArr=null;document.querySelectorAll('.fm-row.sobre,.fm-row.arrasta').forEach(x=>x.classList.remove('sobre','arrasta'))},true);
document.addEventListener('drop',e=>{if(!fmArr)return;const r=e.target.closest?.('[data-fmrow]');if(!r)return;e.preventDefault();e.stopImmediatePropagation();const {t,k}=tkAtual();const id=fmArr;fmArr=null;if(!k||!vzEdita(t,k))return;
  const i=k.itens.find(x=>x.id===id),alvo=k.itens.find(x=>x.id===r.dataset.fmrow);if(!i||!alvo||i===alvo)return;const de=k.itens.indexOf(i);k.itens.splice(de,1);const para=k.itens.indexOf(alvo)+(de<=k.itens.indexOf(alvo)?1:0);k.itens.splice(para,0,i);
  log(t,`Tarefa "${k.titulo}": ordem do formulário mudada`);tkRe()},true);
/* fora do cartão o menu ⋮ fecha */
document.addEventListener('click',e=>{if(UI.fmMenu&&!e.target.closest?.('.fm-mw')){UI.fmMenu=null;if(document.querySelector('.fm-menu'))tkRe()}});

/* ---------- criação rápida ---------- */
{const exNova=tkNovaHtml;tkNovaHtml=function(fechar){const sel=UI.tkSel||{};if(sel.mais)return exNova(fechar);
  const t=sel.tid?T(sel.tid):null,ult=(S.vzUlt||{})[me()],l=fmListaPadrao(t,sel.lista);
  return `<div class="dh"><div><h2>Nova tarefa</h2>${t?`<div class="muted" style="margin-top:4px">${t.codigo} · ${esc(t.nome)}</div>`:''}</div>${fechar}</div>
  <form data-form="tarefa-r" id="f-tkr" class="tkr"><div class="fields">
    <div class="field full"><label for="tr-t">Tarefa</label><input id="tr-t" name="titulo" required value="${esc(sel.rasc?.titulo||'')}" placeholder="Ex.: cobrar a contraproposta do proprietário" autocomplete="off"></div>
    ${t?'':`<div class="field full"><label for="tr-ter">Terreno</label><select id="tr-ter" name="ter" required><option value="">Escolha o terreno</option>${ativosBanco().map(x=>`<option value="${x.id}" ${(sel.rasc?.ter||UI.tk?.ter)===x.id?'selected':''}>${x.codigo} · ${esc(x.nome)}</option>`).join('')}</select></div>`}
    <div class="field full"><label for="tr-r">Responsável</label>${tkSelU('resp',sel.rasc?.resp!=null?sel.rasc.resp:me(),'Sem responsável','id="tr-r"')}</div>
    <div class="field full"><label for="tr-p">Prazo</label><span class="tkr-prz"><input id="tr-p" name="prazo" type="date" value="${esc(sel.rasc?.prazo||'')}" aria-label="Prazo">${[[1,'1 dia'],[7,'1 semana'],['m1','1 mês']].map(([n,r])=>`<button type="button" class="tkr-pz" data-a="fm-prz" data-v="${n}">${r}</button>`).join('')}</span></div>
    ${fmEtCampos(t||T(sel.rasc?.ter||UI.tk?.ter),'tr',sel.rasc)}
    ${sel.desc?`<div class="field full"><label for="tr-d">Descrição</label><textarea id="tr-d" name="desc" data-mencao placeholder="Use @ para avisar um colega">${esc(sel.rasc?.desc||'')}</textarea></div>`:`<div class="field full tkr-dl"><button type="button" class="btn text sm" data-a="fm-desc">${ic('add',16)}Adicionar descrição</button></div>`}
    <fieldset class="field full tkr-vis"><legend>Visibilidade</legend><span class="tkr-seg">${Object.keys(VZ_N).map(v=>`<label title="${esc(VZ_D[v])}"><input type="radio" name="vis" value="${v}" required ${(sel.rasc?.vis||ult)===v?'checked':''}><span>${ic(VZ_IC[v],16)}${VZ_N[v]}</span></label>`).join('')}</span></fieldset>
    <p class="faint tkr-pad">Vai para ${l?esc(l):'a primeira lista'}.</p></div></form>
  <div class="df"><button class="btn text" data-a="fm-mais">Mais opções</button><span class="tkm-sp"></span><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="f-tkr">Criar</button></div>`}}
function fmListaPadrao(t,pedida){const L=t?tkL(t).filter(l=>!l.oculta&&l.tipo!=='conclui'&&l.tipo!=='pausa').map(l=>l.nome):(S.listasModelo||[]).filter(l=>l.ativo).map(l=>l.nome);
  if(pedida&&(t?tkL(t).some(l=>l.nome===pedida&&!l.oculta):true))return pedida;return L.includes('Fazer')?'Fazer':L[0]}
function fmRasc(){const f=document.querySelector('#f-tkr');if(!f)return UI.tkSel.rasc||{};const F=Object.fromEntries(new FormData(f));return {...(UI.tkSel.rasc||{}),...F}}
function fmRapidaAcao(A){if(!UI.tkSel)return;const r=fmRasc();UI.tkSel.rasc=r;
  if(A==='fm-desc'){UI.tkSel.desc=true;renderModal();setTimeout(()=>document.querySelector('#tr-d')?.focus(),0);return}
  UI.tkSel.mais=true;renderModal();
  setTimeout(()=>{const set=(s,v)=>{const el=document.querySelector(s);if(el&&v!=null)el.value=v};set('#tm-t',r.titulo);set('#tm-ter',r.ter);set('#tm-d',r.desc);if(r.prazo!=null)set('#tm-p',r.prazo);if(r.resp!=null)set('#tm-r',r.resp);if(r.ter&&!UI.tkSel.tid)fmEtRefaz('tm',T(r.ter));if(r.et!=null){set('#tm-et',r.et);fmEtRefaz('tm',T(UI.tkSel.tid||r.ter),true)}if(r.sub!=null)set('#tm-sub',r.sub);
    if(r.vis){const x=document.querySelector(`#f-tk input[name=vis][value="${r.vis}"]`);if(x){x.checked=true;x.dispatchEvent(new Event('change',{bubbles:true}))}}document.querySelector('#tm-t')?.focus()},0)}
document.addEventListener('submit',e=>{const f=e.target;if(f.dataset?.form!=='tarefa-r')return;e.preventDefault();e.stopImmediatePropagation();const F=Object.fromEntries(new FormData(f)),sel=UI.tkSel;
  const t=T(sel.tid||F.ter);if(!t){toast('Escolha o terreno da tarefa.',true);return}if(!(F.titulo||'').trim())return;if(!F.vis){toast('Escolha a visibilidade.',true);return}
  const nome=fmListaPadrao(t,sel.lista),l=tkL(t).find(x=>x.nome===nome&&!x.oculta)||tkPrim(t,'aberta');
  const k=tkCriar(t,{titulo:F.titulo,desc:F.desc||'',resp:F.resp||null,prio:'media',lista:l.id,vis:F.vis,lib:[],prazo:F.prazo||null,et:F.et,sub:F.sub});vzLembrar(F.vis);
  UI.modal=null;renderModal();tkRe();fmSnack(`${k.codigo} criada em ${l.nome}`,'Abrir',()=>{UI.tkSel={tid:t.id,kid:k.id};UI.modal='tarefa';renderModal()})},true);
/* aviso com ação (o toast comum é só texto) */
function fmSnack(m,rot,fn){const el=$('#toast');el.innerHTML=`<span>${esc(m)}</span><button class="toast-ac">${esc(rot)}</button>`;el.className='toast show tem-ac';clearTimeout(tmr);
  el.querySelector('.toast-ac').onclick=()=>{el.className='toast';fn()};tmr=setTimeout(()=>el.className='toast',6000)}

/* exemplo: formulário da visita técnica no primeiro terreno (só uma vez) */
(()=>{if(S.fmExemplo)return;S.fmExemplo=true;const t=S.terrenos[0];if(!t||!t.tarefas)return;const l=tkL(t).find(x=>x.nome==='Fazendo'&&!x.oculta)||tkPrim(t,'aberta');
  const k=tkCriar(t,{titulo:'Visita técnica ao terreno',resp:t.resp||'Rafael Souza',prio:'media',lista:l.id,vis:'publico',prazo:addD(HOJE,4),desc:'Conferir divisas, ocupação e acesso.'});
  k.itens=[{id:uid(),chave:'terreno.posicao_quadra',pergunta:'Qual a posição do terreno na quadra?',forma:'radio',regra:'livre',cond:null},
    {id:uid(),chave:'terreno.area_levantamento_m2',pergunta:'Área medida na visita',ajuda:'Medida com trena laser nas divisas.',regra:'justificativa',cond:null},
    {id:uid(),chave:'terreno.situacao_ocupacao',pergunta:'Como está a ocupação hoje?',forma:'chips',regra:'livre',cond:null},
    {id:uid(),tipo:'sim_nao',pergunta:'O proprietário aceita receber a equipe de novo?',forma:'chave',regra:'livre',cond:null},
    {id:uid(),tipo:'telefone',pergunta:'Telefone do zelador',regra:'livre',cond:null},
    {id:uid(),tipo:'paragrafo',pergunta:'Observações da visita',regra:'livre',cond:null}];
  S.fmExemploK=k.id})();

/* ---------- etapa e subetapa na Nova tarefa (decisão do Moisés, 1/nov/2026) ----------
   As duas vêm com a etapa e a subetapa atuais do terreno (a do processo aberto da fase mais adiante) e trocam no seletor;
   "Nenhuma" deixa a tarefa sem etapa. Valem na Nova tarefa curta e na completa. */
function fmEtAbertas(t){return t?fasesL().filter(f=>f.entrada?aberto(t.neg):procAberto(t,f.k)).map(f=>f.k):[]}
function fmEtPadrao(t){const a=t&&etAtual(t);return a?{et:`${a.f}|${a.p.etapa}`,sub:a.p.sub||''}:{et:'',sub:''}}
function fmEtOpts(t,v){return `<option value="">Nenhuma</option>${fmEtAbertas(t).map(f=>`<optgroup label="${esc(faseN(f))}">${etapasF(f).map(e=>`<option value="${f}|${e.k}" ${v===f+'|'+e.k?'selected':''}>${esc(e.nome)}</option>`).join('')}</optgroup>`).join('')}`}
function fmSubOpts(v,s){const [f,e]=(v||'').split('|'),L=f&&e?(etapasF(f).find(x=>x.k===e)?.subs||[]):[];
  return `<option value="">${L.length?'Sem subetapa':'—'}</option>${L.map(x=>`<option value="${x.k}" ${s===x.k?'selected':''}>${esc(x.nome)}</option>`).join('')}`}
function fmEtCampos(t,pre,r){const d=fmEtPadrao(t),v=r&&r.et!=null&&(!r.ter||!t||r.ter===t.id)?r.et:d.et,s=r&&r.sub!=null&&v===r.et?r.sub:(v===d.et?d.sub:'');
  return `<div class="field"><label for="${pre}-et">Etapa</label><select id="${pre}-et" name="et" data-fmet="${pre}" ${t?'':'disabled'}>${t?fmEtOpts(t,v):'<option value="">Escolha o terreno</option>'}</select></div>
    <div class="field"><label for="${pre}-sub">Subetapa</label><select id="${pre}-sub" name="sub" ${t&&v?'':'disabled'}>${fmSubOpts(t?v:'',s)}</select></div>`}
/* troca de terreno refaz a etapa (com a atual do novo terreno); troca de etapa refaz a subetapa */
function fmEtRefaz(pre,t,soSub){const e=document.querySelector(`#${pre}-et`),s=document.querySelector(`#${pre}-sub`);if(!e||!s)return;
  if(!soSub){const d=fmEtPadrao(t);e.innerHTML=t?fmEtOpts(t,d.et):'<option value="">Escolha o terreno</option>';e.disabled=!t;s.innerHTML=fmSubOpts(t?d.et:'',d.sub);s.disabled=!t||!d.et;return}
  const d=fmEtPadrao(t);s.innerHTML=fmSubOpts(e.value,e.value===d.et?d.sub:'');s.disabled=!e.value}
document.addEventListener('change',e=>{const el=e.target;
  if(el.id==='tr-ter'||el.id==='tm-ter'){fmEtRefaz(el.id.slice(0,2),T(el.value));return}
  if(el.dataset?.fmet){const pre=el.dataset.fmet,sel=UI.tkSel||{};fmEtRefaz(pre,T(sel.tid||document.querySelector(`#${pre}-ter`)?.value),true)}});
/* a janela completa ganha os mesmos dois campos, logo antes da descrição */
{const ex=tkNovaHtml;tkNovaHtml=function(fechar){const h=ex(fechar),sel=UI.tkSel||{};if(!sel.mais)return h;
  return h.replace('<div class="field full"><label for="tm-d">',fmEtCampos(sel.tid?T(sel.tid):null,'tm',null)+'<div class="field full"><label for="tm-d">')}}
/* criar: et "fase|etapa" (vazio = Nenhuma) e sub; sem et, o padrão de sempre (etapa e subetapa atuais) */
{const cr=tkCriar;tkCriar=function(t,d){const k=cr(t,d);if(!k||k.modelo)return k;
  if(d.et!==undefined){const [f,e]=(d.et||'').split('|');if(f&&e){const L=etapasF(f).find(x=>x.k===e)?.subs||[];etPor(t,k,f,e,L.some(x=>x.k===d.sub)?d.sub:null)}else etPor(t,k)}
  return k}}
/* mesmo dia do mês seguinte; sem esse dia (31 de janeiro), o último do mês */
function fmMaisMes(d){const [y,m,dia]=d.split('-').map(Number),ult=new Date(Date.UTC(y,m+1,0)).getUTCDate();return `${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}-${String(Math.min(dia,ult)).padStart(2,'0')}`}

