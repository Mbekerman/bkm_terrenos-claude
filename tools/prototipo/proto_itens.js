/* =====================================================================
   Campos do terreno e da negociação, itens do cartão e regra de campo em
   branco (decisões do Moisés, 31/out/2026; simulação "Funil e quadros").
   Espelha app.campos_catalogo, app.campos_empresa, fluxo.tarefa_itens,
   checklist_itens.regra_branco/condicao e fluxo.conclusao_justificativas.
   - Configurações › Campos (só administrador): uma linha por campo, com o
     nome no banco, o Título (o nome que o usuário vê) e as marcas Condição
     e No cartão.
   - Na frente do cartão, quem cria inclui o que a tarefa precisa (+ Campo):
     campos do terreno e da negociação, que gravam no próprio terreno, e
     campos personalizados; os checklists já ficam no cartão.
   - Aba Configuração do cartão (diretor, administrador e quem criou): para
     cada item, a regra se estiver em branco ao concluir (pode concluir,
     com justificativa, não conclui) e a condição "Vale quando...".
   - "Não conclui" trava o analista; gestor e diretor concluem com
     justificativa (2/nov/2026, como no funil). Toda justificativa fica no histórico.
   - Condição: + Condição (busca entre os campos marcados para condição),
     operador pelo tipo, valor (vários na lista), "todas" ou "qualquer uma",
     e um nível de grupo (+ Grupo). Em branco nunca satisfaz nada além de
     "não informado".
   Injetado no mesmo escopo do protótipo, depois de proto_campos.js.
   ===================================================================== */
const IT_ORIG={terreno:'Terreno',negociacao:'Negociação',oferta:'Oferta de referência',proposta:'Proposta vigente',calculado:'Calculado'};
const IT_TIPO={texto:'texto',numero:'número',data:'data',lista:'lista',lista_multi:'lista (várias)',pessoa:'pessoa',sim_nao:'sim/não'};
const IT_REGRA={livre:'Pode concluir',justificativa:'Conclui com justificativa',bloqueia:'Não conclui'};
const IT_OP={em:'é',fora:'não é',preenchido:'está preenchido',vazio:'não informado',igual:'igual a',maior:'maior que',menor:'menor que',entre:'entre',
  antes:'antes de',depois:'depois de',ultimos_dias:'nos últimos',sim:'é sim',nao:'é não'};
const IT_OPS={texto:['em','fora','preenchido','vazio'],lista:['em','fora','preenchido','vazio'],lista_multi:['em','fora','preenchido','vazio'],pessoa:['em','fora','preenchido','vazio'],
  numero:['igual','maior','menor','entre','preenchido','vazio'],data:['antes','depois','ultimos_dias','preenchido','vazio'],sim_nao:['sim','nao','vazio']};
const itPropVig=t=>[...(t.propostas||[])].reverse().find(p=>['apresentada','em_analise','aceita'].includes(p.status))||null;
const itOpc=o=>()=>o;
const itSemVazio=(o,v)=>itOpc(Object.fromEntries(Object.entries(o).filter(([k])=>k!==v)));
/* catálogo: [chave, título padrão, tipo, unidade, opções, vazio, editável, condição, cartão, ler(t), gravar(t,v)] */
const IT_CAT=(()=>{const tr=(c)=>[t=>t[c],(t,v)=>{t[c]=v}],of=c=>[t=>ofertaRef(t)?.[c],(t,v)=>{const o=ofertaRef(t);if(!o)throw new Error('O terreno não tem oferta.');o[c]=v}],
  ng=c=>[t=>t.neg?.[c],null],pr=c=>[t=>itPropVig(t)?.[c],null],ro=f=>[f,null];
  const opMun=()=>Object.fromEntries([...new Set(['São Paulo · SP','São José dos Campos · SP',...S.terrenos.map(t=>t.municipio).filter(Boolean)])].map(x=>[x,x]));
  const opEixo=()=>Object.fromEntries((S.eixos||[]).map(e=>[e.id,e.nome])),opCorr=()=>Object.fromEntries((S.corretores||[]).map(c=>[c.id,c.nome]));
  const opEt=()=>Object.fromEntries(STAGES),opSub=()=>Object.fromEntries(cfg().subs.filter(s=>s.ativo).map(s=>[s.k,s.nome])),opUs=()=>Object.fromEntries(USERS.map(u=>[u,u]));
  const opZonas=()=>Object.fromEntries([...new Set(S.terrenos.flatMap(t=>(analiseVig(t)?.zonas||[]).map(z=>z.sigla)))].sort().map(z=>[z,z]));
  const L=[
  ['terreno.nome','Nome do terreno','texto',null,null,null,1,0,1,...tr('nome')],['terreno.descricao','Descrição','texto',null,null,null,1,0,0,...tr('descricao')],
  ['terreno.situacao_cadastral','Situação do cadastro','lista',null,itOpc({ativo:'Ativo',arquivado:'Arquivado'}),null,0,1,0,...ro(t=>t.situacao)],
  ['terreno.prioridade','Prioridade','lista',null,itOpc(OPT.prioridade),null,1,1,1,...tr('prioridade')],['terreno.responsavel_id','Responsável do terreno','pessoa',null,opUs,null,1,1,1,...tr('resp')],
  ['terreno.origem_cadastro','Origem do terreno','lista',null,itOpc(OPT.origem),null,1,1,0,...tr('origem')],['terreno.url_origem','Link do anúncio','texto',null,null,null,1,0,1,...tr('url')],
  ['terreno.data_identificacao','Identificado em','data',null,null,null,1,0,0,...tr('dataIdent')],['terreno.observacoes','Observações','texto',null,null,null,1,0,0,...tr('obs')],
  ['terreno.cep','CEP','texto',null,null,null,1,0,0,...tr('cep')],['terreno.logradouro','Rua','texto',null,null,null,1,0,0,...tr('logradouro')],['terreno.numero','Número','texto',null,null,null,1,0,0,...tr('numero')],
  ['terreno.complemento','Complemento','texto',null,null,null,1,0,0,...tr('complemento')],['terreno.bairro','Bairro','texto',null,null,null,1,1,0,...tr('bairro')],
  ['terreno.municipio_id','Município','lista',null,opMun,null,0,1,1,...ro(t=>t.municipio)],['terreno.zona','Zona da cidade','lista',null,itOpc(OPT.zona),null,1,1,0,...tr('zona')],
  ['terreno.eixo_comercial_id','Eixo comercial','lista',null,opEixo,null,1,1,0,...tr('eixo')],['terreno.referencia_localizacao','Ponto de referência','texto',null,null,null,1,0,0,...tr('referencia')],
  ['terreno.precisao_localizacao','Precisão da localização','lista',null,itSemVazio(OPT.precisao,'nao_informada'),'nao_informada',1,0,0,...tr('precisao')],
  ['terreno.area_documental_m2','Área documental','numero','m²',null,null,1,1,1,...tr('aDoc')],['terreno.area_cadastral_m2','Área cadastral','numero','m²',null,null,1,1,1,...tr('aCad')],
  ['terreno.area_levantamento_m2','Área do levantamento','numero','m²',null,null,1,1,1,...tr('aLev')],['terreno.area_poligonal_m2','Área da poligonal','numero','m²',null,null,0,1,1,...ro(t=>areaPolT(t))],
  ['terreno.area_adotada_m2','Área adotada','numero','m²',null,null,0,1,1,...ro(t=>areaAdotada(t))],['terreno.fonte_area_adotada','Fonte da área adotada','lista',null,itOpc(OPT.fonteArea),null,0,0,0,...ro(t=>t.fonteArea)],
  ['terreno.testada_principal_m','Testada principal','numero','m',null,null,1,1,1,...tr('testada')],['terreno.topo_perfil','Perfil topográfico','lista',null,itOpc({plano:'Plano',inclinado:'Inclinado',acidentado_leve:'Acidentado leve',acidentado_mediano:'Acidentado mediano',acidentado_intenso:'Acidentado intenso',acidentado_agudo:'Acidentado agudo',acidentado_critico:'Acidentado crítico'}),null,0,1,1,...ro(t=>tpAtual(t)?.perfil)],
  ['terreno.desnivel_estimado_m','Desnível estimado','numero','m',null,null,1,1,1,...tr('desnivel')],['terreno.posicao_quadra','Posição na quadra','lista',null,itSemVazio(OPT.posicao,'nao_informado'),'nao_informado',1,0,0,...tr('posicao')],
  ['terreno.formato','Formato do lote','lista',null,itSemVazio(OPT.formato,'nao_informado'),'nao_informado',1,0,0,...tr('formato')],['terreno.situacao_ocupacao','Ocupação','lista',null,itSemVazio(OPT.ocupacao,'nao_informado'),'nao_informado',1,1,1,...tr('ocupacao')],
  ['terreno.uso_atual','Uso atual','texto',null,null,null,1,0,1,...tr('uso')],['terreno.area_construida_existente_m2','Área construída existente','numero','m²',null,null,1,0,1,...tr('aConst')],
  ['terreno.area_construida_demolir_m2','Área a demolir','numero','m²',null,null,1,0,1,...tr('aDemolir')],['terreno.necessidade_demolicao','Precisa demolir','lista',null,itSemVazio(OPT.demolicao,'nao_avaliada'),'nao_avaliada',1,1,1,...tr('demolicao')],
  ['terreno.observacoes_fisicas','Observações físicas','texto',null,null,null,1,0,0,...tr('obsFis')],['terreno.tipo_empreendimento','Tipo de empreendimento','lista',null,itOpc({mercado:'Mercado',his:'HIS',hmp:'HMP'}),'nao_informado',1,1,1,...tr('tipoEmp')],
  ['negociacao.etapa','Etapa','lista',null,opEt,null,0,1,0,...ng('etapa')],['negociacao.subetapa','Subetapa','lista',null,opSub,null,0,1,0,...ng('sub')],
  ['negociacao.status','Situação da negociação','lista',null,itOpc(STATUS_N),null,0,1,0,...ng('status')],['negociacao.responsavel_id','Responsável da negociação','pessoa',null,opUs,null,0,1,1,...ro(t=>t.neg?.resp||(t.neg?t.resp:null))],
  ['negociacao.temperatura','Temperatura','lista',null,itOpc({1:'1',2:'2',3:'3',4:'4',5:'5'}),null,1,1,1,t=>t.neg?.temp==null?null:String(t.neg.temp),(t,v)=>{if(!t.neg)throw new Error('O terreno não tem negociação.');t.neg.temp=v==null?null:Number(v)}],
  ['negociacao.data_inicio','Início da negociação','data',null,null,null,0,0,0,...ng('desde')],['negociacao.retomar_em','Retomar em (Stand By)','data',null,null,null,0,0,0,...ng('retomar')],
  ['negociacao.motivo_encerramento','Motivo do encerramento','lista',null,null,null,0,0,0,...ng('motivo')],
  ['oferta.valor_pedido','Preço pedido','numero','R$',null,null,1,1,1,...of('valor')],['oferta.forma_pagamento_pedida','Forma de pagamento pedida','lista',null,itOpc(OPT.forma),null,1,0,1,...of('forma')],
  ['oferta.observacao_pagamento','Observação do pagamento','texto',null,null,null,1,0,0,...of('obsPag')],['oferta.aceita_permuta','Aceita permuta','texto',null,null,null,1,0,1,...of('aceita')],
  ['oferta.comissao_pct','Comissão (%)','numero','%',null,null,1,1,0,...of('comPct')],['oferta.comissao_valor','Comissão (R$)','numero','R$',null,null,1,0,0,...of('comVal')],
  ['oferta.corretor_id','Corretor','lista',null,opCorr,null,0,1,1,...ro(t=>ofertaRef(t)?.cid)],['oferta.ofertante_id','Quem ofereceu','lista',null,null,null,0,0,0,...ro(t=>ofertaRef(t)?.ofertante)],
  ['oferta.data_oferta','Data da oferta','data',null,null,null,1,0,0,...of('data')],['oferta.validade','Validade da oferta','data',null,null,null,1,0,0,...of('validade')],
  ['proposta.valor_total','Valor da proposta vigente','numero','R$',null,null,0,1,1,...pr('valor')],['proposta.forma_pagamento','Forma de pagamento proposta','lista',null,itOpc(OPT.forma),null,0,0,0,...pr('forma')],
  ['proposta.condicoes_pagamento','Condições de pagamento','texto',null,null,null,0,0,0,...pr('cond')],['proposta.origem','Quem propôs','lista',null,itOpc({bkm:'BKM',vendedor:'Vendedor'}),null,0,1,0,...pr('origem')],
  ['proposta.status','Situação da proposta','lista',null,itOpc({apresentada:'Apresentada',em_analise:'Em análise',aceita:'Aceita'}),null,0,1,0,...pr('status')],
  ['proposta.data_apresentacao','Proposta apresentada em','data',null,null,null,0,0,0,...pr('data')],['proposta.validade','Validade da proposta','data',null,null,null,0,0,0,...pr('validade')],
  ['calculado.forma_pagamento_vigente','Forma de pagamento vigente','lista',null,itOpc(OPT.forma),null,0,1,1,...ro(t=>itPropVig(t)?.forma??ofertaRef(t)?.forma)],
  ['calculado.margem_liquida','Margem líquida do estudo válido','numero','%',null,null,0,1,1,...ro(t=>t.neg?.viab?.margem)],['calculado.vgv','VGV do estudo válido','numero','R$',null,null,0,1,1,...ro(t=>t.neg?.viab?.vgv)],
  ['calculado.preco_m2','Preço pedido por m²','numero','R$',null,null,0,1,1,...ro(t=>{const o=ofertaRef(t),a=areaAdotada(t);return o?.valor&&a?Math.round(100*o.valor/a)/100:null})],
  ['calculado.zonas','Zonas da área','lista_multi',null,opZonas,null,0,1,1,...ro(t=>[...new Set((analiseVig(t)?.zonas||[]).map(z=>z.sigla))])],
  ['calculado.tem_partes','Vários donos','sim_nao',null,null,null,0,1,0,...ro(t=>(t.partes||[]).length>0)],
  ['calculado.corretores','Corretores do terreno ou das partes','lista_multi',null,opCorr,null,0,1,0,...ro(t=>(t.corretores||[]).map(c=>c.cid))]];
  /* máscara fixa (1/nov/2026): moeda (R$), percentual (%), CEP; texto sem máscara fixa pode ganhar uma do administrador */
  return L.map(([chave,titulo,tipo,un,opcoes,vazio,ed,cd,cp,ler,gravar])=>({chave,origem:chave.split('.')[0],coluna:chave.split('.')[1],titulo,tipo,un,opcoes,vazio,editavel:!!ed&&!!gravar,condicao:!!cd,cartao:!!cp,ler,gravar,
    formato:chave==='terreno.cep'?'cep':un==='R$'?'moeda':un==='%'?'percentual':null}))})();
const itEmp=()=>S.camposEmp||(S.camposEmp={});
function itDef(chave){const c=IT_CAT.find(x=>x.chave===chave);if(!c)return null;const e=itEmp()[chave]||{};
  return {...c,titulo:e.titulo||c.titulo,condicao:e.condicao??c.condicao,cartao:e.cartao??c.cartao,formato:c.formato||(c.tipo==='texto'?e.formato||null:null)}}
const itTit=chave=>itDef(chave)?.titulo||chave;
/* valor do campo no terreno (null = em branco: nulo, vazio, "não informado" ou lista vazia) */
function itVal(t,chave){const c=IT_CAT.find(x=>x.chave===chave);if(!c||!t)return null;let v;try{v=c.ler(t)}catch(e){v=null}
  if(v==null||v===''||v===c.vazio||(Array.isArray(v)&&!v.length))return null;return v}
function itTxtVal(d,v){if(v==null)return 'Não informado';const o=d.opcoes?d.opcoes():null;
  if(Array.isArray(v))return v.map(x=>o?.[x]??x).join(', ');if(d.tipo==='sim_nao')return v?'Sim':'Não';if(d.tipo==='data')return fd(v);
  if(d.tipo==='numero')return (d.un==='R$'?'R$ ':'')+Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2})+(d.un&&d.un!=='R$'?' '+d.un:'');
  return o?.[v]??String(v)}

/* ---------- condição ---------- */
function itCondItem(t,it){const d=IT_CAT.find(x=>x.chave===it.campo);if(!d)return false;const v=itVal(t,it.campo),vs=it.valores||[];
  if(it.op==='vazio')return v==null;if(it.op==='preenchido')return v!=null;if(v==null)return false;
  if(it.op==='em'||it.op==='fora'){const tem=Array.isArray(v)?v.some(x=>vs.map(String).includes(String(x))):vs.map(String).includes(String(v));return it.op==='em'?tem:!tem}
  if(['igual','maior','menor','entre'].includes(it.op)){const x=Number(v),a=Number(vs[0]),b=Number(vs[1]);return it.op==='igual'?x===a:it.op==='maior'?x>a:it.op==='menor'?x<a:x>=a&&x<=b}
  if(it.op==='antes')return v<vs[0];if(it.op==='depois')return v>vs[0];if(it.op==='ultimos_dias')return v<=HOJE&&v>=addD(HOJE,-Number(vs[0]));
  if(it.op==='sim'||it.op==='nao')return !!v===(it.op==='sim');return false}
function itCondVale(t,c){if(!c||!(c.itens||[]).length)return true;const r=c.itens.map(it=>it.grupo?itCondVale(t,it.grupo):itCondItem(t,it));return c.modo==='qualquer'?r.some(Boolean):r.every(Boolean)}
function itCondFrase(c,dentro){if(!c||!(c.itens||[]).length)return 'sempre';const j=c.modo==='qualquer'?' ou ':' e ';
  const fr=c.itens.map(it=>{if(it.grupo)return '('+itCondFrase(it.grupo,true)+')';const d=itDef(it.campo);if(!d)return '?';const o=d.opcoes?d.opcoes():null,vs=(it.valores||[]).map(v=>d.tipo==='data'?fd(v):d.tipo==='numero'?itTxtVal(d,v):o?.[v]??v);
    const vt=it.op==='entre'?`${vs[0]} e ${vs[1]}`:it.op==='ultimos_dias'?`${vs[0]} dias`:['em','fora'].includes(it.op)?vs.join(' ou '):vs.join('');
    return `${d.titulo.charAt(0).toLowerCase()+d.titulo.slice(1)} ${IT_OP[it.op]}${vt?' '+vt:''}`}).join(j);
  return dentro?fr:fr}
/* confere como app.validar_condicao: campo liberado, operador do tipo, valores, um nível de grupo */
function itCondErro(c,nivel=0){if(!c)return null;if(!(c.itens||[]).length)return nivel?'Grupo vazio: ponha ao menos uma condição ou tire o grupo.':null;
  for(const it of c.itens){if(it.grupo){if(nivel)return 'A condição aceita só um nível de grupo.';const e=itCondErro(it.grupo,1);if(e)return e;continue}
    const d=itDef(it.campo);if(!d)return 'Escolha o campo de cada condição.';if(!d.condicao)return `O campo ${d.titulo} não está liberado para condição.`;
    if(!IT_OPS[d.tipo].includes(it.op))return `Escolha o operador de ${d.titulo}.`;const n=(it.valores||[]).filter(v=>v!==''&&v!=null).length;
    if(['em','fora'].includes(it.op)&&!n)return `Escolha ao menos um valor para ${d.titulo}.`;
    if(['igual','maior','menor','antes','depois','ultimos_dias'].includes(it.op)&&n!==1)return `Informe o valor de ${d.titulo}.`;
    if(it.op==='entre'&&n!==2)return `Informe o mínimo e o máximo de ${d.titulo}.`}return null}

/* ---------- itens do cartão ---------- */
const itDir=()=>membro(me()).papel==='diretor';
const itSup=()=>['gestor','diretor'].includes(membro(me()).papel);
const itConfigura=(t,k)=>UI.role!=='Leitura'&&(itDir()||ehAdmin(me())||k.criadoPor===me());
function itNorm(k){k.itens=k.itens||[];Object.keys(k.campos||{}).forEach(cid=>{if(k.campos[cid]!=null&&!k.itens.some(i=>i.campo===cid))k.itens.push({id:uid(),campo:cid,regra:'livre',cond:null})});return k.itens}
const itCampo=i=>i.campo?cpoCampos().find(c=>c.id===i.campo):null;
const itNome=i=>i.pergunta||(i.tipo?'Pergunta':i.chave?itTit(i.chave):itCampo(i)?.nome||'Campo');
function itEmBranco(t,k,i){if(i.tipo)return i.resposta==null;if(i.chave)return itVal(t,i.chave)==null;const c=itCampo(i);return !c||c.ativo===false?false:k.campos?.[i.campo]==null}
/* o que está em branco e pede algo para concluir agora (regra justificativa ou bloqueia, com a condição valendo); espelha fluxo.itens_em_branco */
function itBranco(t,k){const r=[];itNorm(k).forEach(i=>{if(i.regra==='livre'||!i.regra)return;const c=itCampo(i);if(i.campo&&(!c||c.ativo===false))return;
    if(itEmBranco(t,k,i)&&itCondVale(t,i.cond))r.push({tipo:i.tipo?'pergunta':i.chave?'objeto':'campo',ref:i.chave||i.campo||i.id,nome:itNome(i),regra:i.regra})});
  (k.checklists||[]).forEach(c=>c.itens.forEach(x=>{const rg=x.regra||(apRegraCk()?'bloqueia':'livre');if(rg!=='livre'&&!x.feito&&!x.virou&&itCondVale(t,x.cond))r.push({tipo:'checklist',ref:x.id,nome:x.texto,regra:rg})}));return r}
function itMsgBloq(bl){const ck=bl.filter(x=>x.tipo==='checklist'),cp=bl.filter(x=>x.tipo!=='checklist');
  if(!cp.length)return 'Conclua os itens do checklist antes de concluir a tarefa.';
  const p=`Preencha ${cp.length>1?'os campos obrigatórios':'o campo obrigatório'} antes de concluir: ${cp.map(x=>x.nome).join(', ')}.`;return ck.length?p+' E conclua os itens do checklist.':p}
/* pode concluir com justificativa? (há item em branco e nada que só gestor ou diretor passe, ou é um deles; nada além dos itens impede) */
function itJustPode(t,k){if(UI.justOk===k.id)return false;const b=itBranco(t,k);if(!b.length)return false;if(b.some(x=>x.regra==='bloqueia')&&!itSup())return false;
  UI.justOk=k.id;try{return !apBloqueio(t,k)}finally{UI.justOk=null}}
function itJustAviso(t,k,fn){const b=itBranco(t,k),dir=b.some(x=>x.regra==='bloqueia');document.querySelector('.it-just-f')?.remove();
  const f=document.createElement('div');f.className='cr-aviso-f it-just-f';f.innerHTML=`<form class="cr-aviso" role="alertdialog" aria-modal="true" aria-labelledby="it-just-t"><h3 id="it-just-t">Concluir com ${b.length>1?'itens':'item'} em branco</h3>
    <ul class="it-just-l">${b.map(x=>`<li>${esc(x.nome)} <span class="chip ${x.regra==='bloqueia'?'st-crit':'st-warn'}">${x.regra==='bloqueia'?'não conclui':'pede justificativa'}</span></li>`).join('')}</ul>
    ${dir?`<p class="faint">Como ${itDir()?'diretor':'gestor'}, você pode concluir mesmo com o que bloqueia. Fica no histórico.</p>`:''}
    <label for="it-just-x" class="it-just-r">Justificativa</label><textarea id="it-just-x" name="just" required placeholder="Por que concluir assim? (obrigatório)"></textarea>
    <div class="cr-av-b"><button type="button" class="btn" data-just="nao">Cancelar</button><button type="submit" class="btn primary">Concluir</button></div></form>`;
  const fecha=()=>{f.remove();document.removeEventListener('keydown',esc_,true)},esc_=e=>{if(e.key==='Escape'){e.stopImmediatePropagation();fecha();render()}};
  f.addEventListener('click',e=>{if(e.target.closest('[data-just=nao]')||e.target===f){e.stopPropagation();fecha();render()}});
  f.querySelector('form').addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();const tx=f.querySelector('textarea').value.trim();if(!tx){toast('Escreva a justificativa.',true);return}fecha();
    (k.justs=k.justs||[]).push({em:agora(),por:me(),texto:tx,itens:b,libera:dir&&itSup()});
    log(t,`Tarefa "${k.titulo}": concluída com ${b.length>1?'itens':'item'} em branco (${b.map(x=>x.nome).join(', ')}). Justificativa: ${tx}`);
    UI.justOk=k.id;try{fn()}finally{UI.justOk=null}save();render()});
  document.addEventListener('keydown',esc_,true);document.body.appendChild(f);f.querySelector('textarea').focus()}

/* controle do campo do terreno no cartão (grava no próprio terreno) */
function itInput(t,d,i,ro){const v=itVal(t,d.chave),id='it-'+i.id,dis=ro||!d.editavel?'disabled':'',o=d.opcoes?d.opcoes():null;
  if(!d.editavel||ro)return `<span class="it-ro ${v==null?'faint':''}">${esc(itTxtVal(d,v))}${!d.editavel&&!ro?' <span class="faint">· só leitura</span>':''}</span>`;
  if(o&&d.tipo!=='lista_multi')return `<select id="${id}" class="tkm-pill" data-itv="${i.id}" ${dis}><option value="">Não informado</option>${Object.entries(o).map(([x,n])=>`<option value="${esc(x)}" ${String(v)===x?'selected':''}>${esc(n)}</option>`).join('')}</select>`;
  if(d.tipo==='data')return `<input id="${id}" type="date" class="tkm-pill" data-itv="${i.id}" value="${v||''}" ${dis}>`;
  return `<input id="${id}" class="tkm-pill" data-itv="${i.id}" value="${v==null?'':esc(d.tipo==='numero'?Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2}):v)}" ${d.tipo==='numero'?'inputmode="decimal"':''} placeholder="Não informado" ${dis}>`}
function itSelo(t,k,i){if(!i.regra||i.regra==='livre'||!itCondVale(t,i.cond))return '';
  return i.regra==='bloqueia'?'<span class="chip crit it-selo">necessário</span>':'<span class="chip warn it-selo">pede justificativa</span>'}
/* linhas da grade de propriedades: os itens incluídos no cartão (campos do terreno e personalizados) e o + Campo */
function itLinhas(t,k,ro,linha){itNorm(k);return '';const conf=itConfigura(t,k);
  const rows=k.itens.map(i=>{const tira=ro?'':`<button class="iconbtn sm it-tira" data-a="it-tira" data-v="${i.id}" title="Tirar do cartão" aria-label="Tirar ${esc(itNome(i))} do cartão" ${i.regra&&i.regra!=='livre'&&!conf?'disabled':''}>${ic('close',14)}</button>`;
    if(i.chave){const d=itDef(i.chave);if(!d)return '';const falta=itEmBranco(t,k,i)&&itSelo(t,k,i);
      return linha('notas',`${esc(d.titulo)}`,`<span class="cpo-c it-c ${falta?'falta':''}">${itInput(t,d,i,ro)}${itSelo(t,k,i)}${tira}</span>`,d.editavel&&!ro?'it-'+i.id:null)}
    const c=itCampo(i);if(!c||(c.ativo===false&&k.campos?.[c.id]==null))return '';const falta=itEmBranco(t,k,i)&&itSelo(t,k,i);
    return linha('notas',esc(c.nome),`<span class="cpo-c it-c ${falta?'falta':''}">${cpoInput(c,k,ro)}${itSelo(t,k,i)}${tira}</span>`,'cpo-'+c.id)}).join('');
  if(ro)return rows;
  const q=(UI.itBusca||'').toLowerCase(),usados=new Set(k.itens.map(i=>i.chave||i.campo));
  const ob=IT_CAT.map(c=>itDef(c.chave)).filter(d=>d.cartao&&!usados.has(d.chave)&&(!q||d.titulo.toLowerCase().includes(q))),cp=cpoAtivos().filter(c=>!usados.has(c.id)&&(!q||c.nome.toLowerCase().includes(q)));
  const pop=UI.tkPop==='it-campo'?`<div class="tkm-pop it-pop" role="group" aria-label="Incluir campo"><div class="tkm-poph">Incluir campo no cartão<button class="iconbtn sm" data-a="tkc-pop" data-v="it-campo" aria-label="Fechar">${ic('close',16)}</button></div>
    <input class="it-busca" data-itb="1" value="${esc(UI.itBusca||'')}" placeholder="Buscar campo" aria-label="Buscar campo">
    <div class="it-popl">${Object.keys(IT_ORIG).map(o=>{const l=ob.filter(d=>d.origem===o);return l.length?`<div class="it-popg">${IT_ORIG[o]}</div>${l.map(d=>`<button class="it-popi" data-a="it-inclui" data-v="${d.chave}">${esc(d.titulo)}<span class="faint">${IT_TIPO[d.tipo]}${d.editavel?'':' · só leitura'}</span></button>`).join('')}`:''}).join('')}
      ${cp.length?`<div class="it-popg">Campos personalizados</div>${cp.map(c=>`<button class="it-popi" data-a="it-inclui" data-c="${c.id}">${esc(c.nome)}<span class="faint">${CPO_TIPOS[c.tipo].toLowerCase()}</span></button>`).join('')}`:''}
      ${!ob.length&&!cp.length?'<div class="faint" style="padding:8px 12px">Nenhum campo com esse nome.</div>':''}</div></div>`:'';
  return rows+`<div class="tkm-p it-maisw"><span class="tkm-pl"></span><div class="tkm-pv"><button class="tkm-add" data-a="tkc-pop" data-v="it-campo" aria-expanded="${UI.tkPop==='it-campo'}">${ic('add',16)}Campo</button>${pop}</div></div>`}

/* aba Configuração do cartão: só diretor, administrador e quem criou */
function itCfgAba(t,k,bloq){itNorm(k);const ed=!bloq;
  const sel=(attrs,v,padrao)=>`<select class="tkm-pill" ${attrs} ${ed?'':'disabled'}>${padrao?`<option value="" ${!v?'selected':''}>${padrao}</option>`:''}${Object.entries(IT_REGRA).map(([x,n])=>`<option value="${x}" ${v===x?'selected':''}>${n}</option>`).join('')}</select>`;
  const cond=(alvo,c)=>`<span class="it-vq">${c?esc(itCondFrase(c)):'<span class="faint">sempre</span>'}${ed?`<button class="linkbtn" data-a="it-cond" data-v="${alvo}">${c?'Editar':'+ Condição'}</button>${c?`<button class="linkbtn" data-a="it-cond-tira" data-v="${alvo}">Tirar</button>`:''}`:''}</span>`;
  const rows=k.itens.map(i=>{const nm=itNome(i),tp=i.tipo?'Só no cartão':i.chave?IT_ORIG[itDef(i.chave)?.origem]||'':'Campo personalizado';
      return `<div class="it-cr"><span><b>${esc(nm)}</b><span class="faint">${esc(tp)}</span></span>${sel(`data-itr="${i.id}" aria-label="Se ${esc(nm)} estiver em branco"`,i.regra||'livre')}${cond('i:'+i.id,i.cond)}</div>`}).join('');
  const padrao=apRegraCk()?'Padrão da empresa (não conclui)':'Padrão da empresa (pode concluir)';
  const cks=(k.checklists||[]).flatMap(c=>c.itens.map(x=>`<div class="it-cr"><span><b>${esc(x.texto)}</b><span class="faint">Checklist ${esc(c.nome)}</span></span>${sel(`data-itck="${c.id}:${x.id}" aria-label="Se ${esc(x.texto)} estiver em aberto"`,x.regra,padrao)}${cond('c:'+c.id+':'+x.id,x.cond)}</div>`)).join('');
  return `<div class="tkm-bloco"><div class="tkm-sh"><h3>Regras dos itens</h3></div>
    <p class="faint" style="margin:0 0 10px">Só o diretor, o administrador e quem criou a tarefa veem esta aba. "Não conclui" trava o analista; gestor e diretor concluem com justificativa.</p>
    ${rows||cks?`<div class="it-ct"><div class="it-cr it-ch"><span>Item incluído no cartão</span><span>Se em branco ao concluir</span><span>Vale quando</span></div>${rows}${cks}</div>`
      :`<div class="faint">Nenhum item no cartão. Inclua campos (+ Campo) ou checklists na Visão geral.</div>`}</div>
    ${(k.justs||[]).length?`<div class="tkm-bloco"><div class="tkm-sh"><h3>Justificativas</h3></div>${k.justs.slice().reverse().map(j=>`<div class="tkm-log"><span class="faint num">${fdh(j.em)}</span>${av(j.por,'sm')}<span><b>${esc(j.por)}</b> ${esc(j.texto)} <span class="faint">(${esc(j.itens.map(x=>x.nome).join(', '))}${j.libera?'; passou pelo que bloqueia':''})</span></span></div>`).join('')}</div>`:''}`}
/* itens que vão na cópia e na recorrência (as regras e as condições vão junto; os valores do terreno são do terreno) */
/* as perguntas vão junto; a resposta "só no cartão" só na cópia (comResp), nunca no modelo nem na recorrência */
const itCopiaItens=(k,comResp)=>(k.itens||[]).filter(i=>!i.campo||cpoCampos().some(c=>c.id===i.campo&&c.ativo!==false)).map(i=>{const x={...JSON.parse(JSON.stringify(i)),id:uid()};if(!comResp)delete x.resposta;return x});
function itSeloCk(t,x){if(!x.regra||x.regra==='livre'||x.feito||!itCondVale(t,x.cond))return '';
  return x.regra==='bloqueia'?'<span class="chip crit it-selo">necessário</span>':'<span class="chip warn it-selo">pede justificativa</span>'}
const itNRegras=k=>itNorm(k).filter(i=>i.regra&&i.regra!=='livre').length+(k.checklists||[]).reduce((s,c)=>s+c.itens.filter(x=>x.regra&&x.regra!=='livre').length,0);

/* ---------- editor de condição (janela) ---------- */
const itNovaCond=()=>({modo:'todas',itens:[{campo:null,op:null,valores:[]}]});
function itAlvo(t,k,alvo){const [tp,a,b]=alvo.split(':');if(tp==='i')return k.itens.find(i=>i.id===a);const c=(k.checklists||[]).find(x=>x.id===a);return c?.itens.find(x=>x.id===b)}
function itCondNome(t,k,alvo){const x=itAlvo(t,k,alvo);return x?(alvo[0]==='i'?itNome(x):x.texto):''}
function itRowHtml(it,p){const d=it.campo?itDef(it.campo):null,busca=UI.itCond.busca===p;
  const q=(UI.itCond.q||'').toLowerCase(),lista=IT_CAT.map(c=>itDef(c.chave)).filter(x=>x.condicao&&(!q||x.titulo.toLowerCase().includes(q)));
  const campo=busca?`<span class="it-cbw"><input class="it-busca" data-itcq="${p}" value="${esc(UI.itCond.q||'')}" placeholder="Buscar campo" aria-label="Buscar campo"><span class="it-cpop">${Object.keys(IT_ORIG).map(o=>{const l=lista.filter(x=>x.origem===o);
      return l.length?`<span class="it-popg">${IT_ORIG[o]}</span>${l.map(x=>`<button class="it-popi" data-a="it-c-campo" data-p="${p}" data-v="${x.chave}">${esc(x.titulo)}<span class="faint">${IT_TIPO[x.tipo]}</span></button>`).join('')}`:''}).join('')||'<span class="faint" style="padding:8px 12px">Nenhum campo com esse nome.</span>'}</span></span>`
    :`<button class="tkm-pill it-cb" data-a="it-c-busca" data-p="${p}">${d?esc(d.titulo):'Escolher campo'}</button>`;
  let val='';if(d&&it.op){const o=d.opcoes?d.opcoes():null,vs=it.valores||[];
    if(['em','fora'].includes(it.op))val=o?`<span class="it-vals">${Object.entries(o).map(([x,n])=>`<button class="it-vch ${vs.map(String).includes(x)?'on':''}" data-a="it-c-val" data-p="${p}" data-v="${esc(x)}" aria-pressed="${vs.map(String).includes(x)}">${esc(n)}</button>`).join('')}</span>`
      :`<input class="tkm-pill" data-itcv="${p}" data-n="0" value="${esc(vs.join('; '))}" placeholder="Valores separados por ;" aria-label="Valores">`;
    else if(['igual','maior','menor'].includes(it.op))val=`<input class="tkm-pill it-num" data-itcv="${p}" data-n="0" inputmode="decimal" value="${vs[0]??''}" aria-label="Valor">${d.un?`<span class="faint">${d.un}</span>`:''}`;
    else if(it.op==='entre')val=`<input class="tkm-pill it-num" data-itcv="${p}" data-n="0" inputmode="decimal" value="${vs[0]??''}" aria-label="Mínimo"><span class="faint">e</span><input class="tkm-pill it-num" data-itcv="${p}" data-n="1" inputmode="decimal" value="${vs[1]??''}" aria-label="Máximo">`;
    else if(['antes','depois'].includes(it.op))val=`<input type="date" class="tkm-pill" data-itcv="${p}" data-n="0" value="${vs[0]||''}" aria-label="Data">`;
    else if(it.op==='ultimos_dias')val=`<input class="tkm-pill it-num" data-itcv="${p}" data-n="0" inputmode="numeric" value="${vs[0]??''}" aria-label="Dias"><span class="faint">dias</span>`}
  return `<div class="it-cd">${campo}${d?`<select class="tkm-pill" data-itco="${p}" aria-label="Operador"><option value="">Operador</option>${IT_OPS[d.tipo].map(o=>`<option value="${o}" ${it.op===o?'selected':''}>${IT_OP[o]}</option>`).join('')}</select>`:''}${val.startsWith('<span class="it-vals"')?'':val}
    <button class="iconbtn sm it-cx" data-a="it-c-tira" data-p="${p}" aria-label="Tirar condição" title="Tirar">${ic('close',16)}</button>${val.startsWith('<span class="it-vals"')?val:''}</div>`}
function itModoHtml(c,p){return `<span class="it-seg" role="group" aria-label="Como as condições se juntam"><button class="${c.modo!=='qualquer'?'on':''}" data-a="it-c-modo" data-p="${p}" data-v="todas" aria-pressed="${c.modo!=='qualquer'}">todas</button><button class="${c.modo==='qualquer'?'on':''}" data-a="it-c-modo" data-p="${p}" data-v="qualquer" aria-pressed="${c.modo==='qualquer'}">qualquer uma</button></span>`}
function itCondHtml(fechar){const E=UI.itCond,{t,k}=tkAtual();if(!E||(!k&&!E.ext))return `<div class="dh"><h2>Condição</h2>${fechar}</div>`;const c=E.cond;
  const rows=c.itens.map((it,i)=>it.grupo?`<div class="it-grp"><div class="it-vqh"><span class="faint">Grupo</span>${itModoHtml(it.grupo,i+'')}<button class="iconbtn sm" data-a="it-c-tira" data-p="${i}" aria-label="Tirar grupo" title="Tirar grupo">${ic('close',16)}</button></div>
      ${it.grupo.itens.map((x,j)=>itRowHtml(x,i+'.'+j)).join('')}<button class="tkm-add" data-a="it-c-mais" data-p="${i}">${ic('add',16)}Condição no grupo</button></div>`:itRowHtml(it,i+'')).join('');
  const e=itCondErro(c);
  return `<div class="dh"><div><h2>Vale quando</h2><div class="muted" style="margin-top:4px">${E.ext?esc(E.ext.titulo):`${esc(k.codigo)} · ${esc(itCondNome(t,k,E.alvo))}`}</div></div>${fechar}</div>
  <div class="it-vq-box"><div class="it-vqh"><b>Valem</b>${itModoHtml(c,'')}</div>${rows}
    <div class="it-adds"><button class="tkm-add" data-a="it-c-mais" data-p="">${ic('add',16)}Condição</button><button class="tkm-add" data-a="it-c-grupo">${ic('add',16)}Grupo</button></div></div>
  <p class="it-frase">Em palavras: <b>${e?esc(e):'a regra vale quando '+esc(itCondFrase(c))+'.'}</b></p>
  <p class="faint" style="margin:0">A forma de pagamento vigente é a da proposta vigente; sem proposta, a da oferta de referência. Campo em branco só satisfaz "não informado".</p>
  <div class="df"><button class="btn text" data-a="it-c-cancela">Cancelar</button><button class="btn primary" data-a="it-c-salva" ${e?'disabled':''}>Salvar condição</button></div>`}
/* o item da condição pelo caminho: "" (a lista), "2" (item 2), "1.0" (item 0 do grupo 1) */
function itCondNo(c,p){if(p==='')return c;const [a,b]=p.split('.').map(Number);return b==null?c.itens[a]:c.itens[a].grupo.itens[b]}
function itCondPai(c,p){const [a,b]=p.split('.').map(Number);return b==null?[c.itens,a]:[c.itens[a].grupo.itens,b]}

/* ---------- Configurações › Campos ---------- */
function itCfgCamposHtml(){const f=UI.itCfgF||'todos',q=(UI.itCfgQ||'').toLowerCase();
  const L=IT_CAT.map(c=>itDef(c.chave)).filter(d=>(f==='todos'||(f==='marcados'?(d.condicao||d.cartao):d.origem===f))&&(!q||(d.titulo+' '+d.chave).toLowerCase().includes(q)));
  const nC=IT_CAT.filter(c=>itDef(c.chave).condicao).length,nK=IT_CAT.filter(c=>itDef(c.chave).cartao).length;
  return `<section class="sec"><div class="sec-h"><h2>Campos do terreno e da negociação</h2><span class="faint">${nC} para condição · ${nK} no cartão</span></div><div class="sec-b">
    <p class="muted" style="margin-top:0">O Título é o nome que o usuário vê em todo o sistema. Condição: o campo aparece no "Vale quando". No cartão: o campo pode ser incluído num cartão de tarefa e editado ali, gravando no próprio terreno (os calculados só para ler).</p>
    <div class="it-cfgbar"><input class="it-busca" data-itcfgq="1" value="${esc(UI.itCfgQ||'')}" placeholder="Buscar campo" aria-label="Buscar campo">
      <span class="it-seg">${[['todos','Todos'],...Object.entries(IT_ORIG).map(([k,v])=>[k,v.replace(' de referência','').replace(' vigente','')]),['marcados','Marcados']].map(([k,v])=>`<button class="${f===k?'on':''}" data-a="it-cfgf" data-v="${k}" aria-pressed="${f===k}">${v}</button>`).join('')}</span></div>
    <div class="it-tab"><div class="it-tr it-th"><span>Nome no banco</span><span>Título (o nome que o usuário vê)</span><span>Máscara</span><span class="ce">Condição</span><span class="ce">No cartão</span></div>
    ${L.map(d=>`<div class="it-tr"><span class="it-db"><code>${d.coluna}</code><small>${IT_ORIG[d.origem]} · ${IT_TIPO[d.tipo]}</small></span>
      <span><input class="it-tit" value="${esc(d.titulo)}" data-itcfg="titulo" data-v="${d.chave}" aria-label="Título de ${d.coluna}" placeholder="${esc(IT_CAT.find(c=>c.chave===d.chave).titulo)}"></span>
      <span class="it-msk">${fmMascaraCfg(d)}</span>
      <label class="ce"><input type="checkbox" data-itcfg="condicao" data-v="${d.chave}" ${d.condicao?'checked':''}><em>Condição</em></label>
      <label class="ce"><input type="checkbox" data-itcfg="cartao" data-v="${d.chave}" ${d.cartao?'checked':''}><em>No cartão${d.editavel?'':' (só ler)'}</em>${d.editavel?'':'<small>só ler</small>'}</label></div>`).join('')||'<p class="faint" style="padding:12px">Nenhum campo com esse filtro.</p>'}</div>
    <p class="cfg-nota">Título vazio volta ao padrão; dois campos não podem ter o mesmo título. Colunas de sistema (código, empresa, datas de criação, versão, poligonal) ficam de fora.</p></div></section>`}

/* ---------- eventos ---------- */
document.addEventListener('input',e=>{const el=e.target;
  if(el.dataset?.itb){e.stopImmediatePropagation();UI.itBusca=el.value;const p=el.selectionStart;renderModal();const n=document.querySelector('[data-itb]');if(n){n.focus();n.setSelectionRange(p,p)}return}
  if(el.dataset?.itcq!=null){e.stopImmediatePropagation();UI.itCond.q=el.value;const p=el.selectionStart;renderModal();const n=document.querySelector('[data-itcq]');if(n){n.focus();n.setSelectionRange(p,p)}return}
  if(el.dataset?.itcfgq){e.stopImmediatePropagation();UI.itCfgQ=el.value;const p=el.selectionStart;render();const n=document.querySelector('[data-itcfgq]');if(n){n.focus();n.setSelectionRange(p,p)}return}},true);
document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset?.itv){e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k||!vzEdita(t,k))return;const i=itNorm(k).find(x=>x.id===el.dataset.itv),d=i&&itDef(i.chave);if(!d||!d.editavel)return;
    let v=el.value;if(v==='')v=null;else if(d.tipo==='numero'){v=cpoNum(v);if(Number.isNaN(v)){toast(`Número inválido em ${d.titulo}.`,true);el.value='';return}}
    else if(d.tipo==='texto'&&d.formato){try{v=fmValida(d.formato,v)}catch(er){toast(er.message,true);return}}
    const antes=itVal(t,d.chave);if(String(antes??'')===String(v??''))return;try{d.gravar(t,v??d.vazio??null)}catch(err){toast(err.message,true);return}
    log(t,`${d.titulo} de ${itTxtVal(d,antes)} para ${itTxtVal(d,v)} (pelo cartão ${k.codigo})`);tkRe();return}
  if(el.dataset?.itr||el.dataset?.itck){e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k||!itConfigura(t,k))return;
    if(el.dataset.itr){const i=k.itens.find(x=>x.id===el.dataset.itr);if(!i)return;i.regra=el.value;log(t,`Tarefa "${k.titulo}": ${itNome(i)} em branco · ${IT_REGRA[i.regra]}`)}
    else{const [cid,xid]=el.dataset.itck.split(':'),x=(k.checklists||[]).find(c=>c.id===cid)?.itens.find(y=>y.id===xid);if(!x)return;x.regra=el.value||undefined;log(t,`Tarefa "${k.titulo}": item ${x.texto} em aberto · ${x.regra?IT_REGRA[x.regra]:'padrão da empresa'}`)}
    tkRe();return}
  if(el.dataset?.itco!=null){e.stopImmediatePropagation();const n=itCondNo(UI.itCond.cond,el.dataset.itco);n.op=el.value||null;n.valores=[];renderModal();return}
  if(el.dataset?.itcv!=null){e.stopImmediatePropagation();const n=itCondNo(UI.itCond.cond,el.dataset.itcv),d=itDef(n.campo);let v=el.value.trim();
    if(['em','fora'].includes(n.op)){n.valores=v.split(';').map(x=>x.trim()).filter(Boolean)}
    else{if(d.tipo==='numero'||n.op==='ultimos_dias'){const x=cpoNum(v);v=v===''||Number.isNaN(x)?'':x}n.valores=n.valores||[];n.valores[Number(el.dataset.n)]=v}renderModal();return}
  if(el.dataset?.itcfg){e.stopImmediatePropagation();if(!ehAdmin(me()))return;const ch=el.dataset.v,c=IT_CAT.find(x=>x.chave===ch),E=itEmp(),cur=E[ch]||{};
    if(el.dataset.itcfg==='titulo'){let v=el.value.trim();if(v===c.titulo)v='';const tit=(v||c.titulo).toLowerCase();
      if(IT_CAT.some(x=>x.chave!==ch&&itDef(x.chave).titulo.toLowerCase()===tit)){toast('Já existe um campo com esse título.',true);el.value=itDef(ch).titulo;return}
      E[ch]={...cur,titulo:v||undefined}}
    else if(el.dataset.itcfg==='formato'){const v=el.value||null;if(v){const ruim=S.terrenos.find(x=>{const y=itVal(x,ch);if(y==null)return false;try{fmValida(v,y);return false}catch(er){return true}});
        if(ruim){toast(`${ruim.codigo} tem ${itDef(ch).titulo} fora dessa máscara: corrija antes de ligar.`,true);el.value=cur.formato||'';return}}E[ch]={...cur,formato:v||undefined}}
    else E[ch]={...cur,[el.dataset.itcfg]:el.checked};save();render();toast('Campo atualizado.');return}},true);
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="it-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const A=a.dataset.a;
  if(A==='it-cfgf'){UI.itCfgF=a.dataset.v;render();return}
  /* condição de fora do cartão (regra da etapa, checklist, pré-requisito, tarefa do modelo; proto_etapa.js) */
  if(UI.itCond?.ext&&(A==='it-c-salva'||A==='it-c-cancela')){const E=UI.itCond;if(A==='it-c-salva'){const er=itCondErro(E.cond);if(er){toast(er,true);return}E.ext.salvar(E.cond.itens.length?E.cond:null)}UI.itCond=null;E.ext.voltar();return}
  const {t,k}=tkAtual();if(!k&&!UI.itCond?.ext)return;
  switch(A){
    case 'it-inclui':{if(!vzEdita(t,k))return;itNorm(k).push({id:uid(),chave:a.dataset.v||undefined,campo:a.dataset.c||undefined,regra:'livre',cond:null});UI.tkPop=null;UI.itBusca='';
      log(t,`Tarefa "${k.titulo}": campo ${itNome(k.itens.at(-1))} incluído no cartão`);tkRe();return}
    case 'it-tira':{const i=k.itens.find(x=>x.id===a.dataset.v);if(!i||!vzEdita(t,k))return;if(i.regra&&i.regra!=='livre'&&!itConfigura(t,k)){toast('Este item tem regra para concluir: só o diretor, o administrador e quem criou a tarefa o tiram.',true);return}
      k.itens=k.itens.filter(x=>x!==i);log(t,`Tarefa "${k.titulo}": campo ${itNome(i)} tirado do cartão`);tkRe();return}
    case 'it-cond':{if(!itConfigura(t,k))return;const x=itAlvo(t,k,a.dataset.v);if(!x)return;UI.itCond={alvo:a.dataset.v,cond:x.cond?JSON.parse(JSON.stringify(x.cond)):itNovaCond(),busca:x.cond?null:'0',q:''};UI.modal='it-cond';renderModal();return}
    case 'it-cond-tira':{if(!itConfigura(t,k))return;const x=itAlvo(t,k,a.dataset.v);if(!x)return;x.cond=null;log(t,`Tarefa "${k.titulo}": condição tirada (a regra vale sempre)`);tkRe();return}
    case 'it-c-cancela':UI.itCond=null;UI.modal='tarefa';UI.tkAba='config';renderModal();return;
    case 'it-c-salva':{const E=UI.itCond,er=itCondErro(E.cond);if(er){toast(er,true);return}const x=itAlvo(t,k,E.alvo);if(!x)return;
      x.cond=E.cond.itens.length?E.cond:null;log(t,`Tarefa "${k.titulo}": ${itCondNome(t,k,E.alvo)} vale quando ${itCondFrase(x.cond)}`);UI.itCond=null;UI.modal='tarefa';UI.tkAba='config';save();renderModal();return}
  }
  const E=UI.itCond;if(!E)return;const c=E.cond,p=a.dataset.p;
  switch(A){
    case 'it-c-busca':E.busca=p;E.q='';break;
    case 'it-c-campo':{const n=itCondNo(c,p);n.campo=a.dataset.v;n.op=null;n.valores=[];E.busca=null;const d=itDef(n.campo);if(d)n.op=IT_OPS[d.tipo][0];break}
    case 'it-c-val':{const n=itCondNo(c,p),v=a.dataset.v,vs=(n.valores||[]).map(String);n.valores=vs.includes(v)?vs.filter(x=>x!==v):[...vs,v];break}
    case 'it-c-tira':{const [arr,i]=itCondPai(c,p);arr.splice(i,1);E.busca=null;break}
    case 'it-c-mais':{const alvo=p===''?c:c.itens[Number(p)].grupo;alvo.itens.push({campo:null,op:null,valores:[]});E.busca=p===''?String(c.itens.length-1):p+'.'+(alvo.itens.length-1);E.q='';break}
    case 'it-c-grupo':c.itens.push({grupo:{modo:'qualquer',itens:[{campo:null,op:null,valores:[]}]}});E.busca=(c.itens.length-1)+'.0';E.q='';break;
    case 'it-c-modo':itCondNo(c,p).modo=a.dataset.v;break;
  }renderModal()},true);

/* exemplo: no primeiro terreno, campos do terreno e um campo personalizado no cartão da análise jurídica, com regras */
(()=>{if(S.itExemplo)return;S.itExemplo=true;const t=S.terrenos[0];if(!t||!t.tarefas)return;const a=t.tarefas.find(x=>x.titulo==='Análise jurídica da matrícula');if(!a)return;itNorm(a);
  a.itens.unshift({id:uid(),chave:'terreno.area_documental_m2',regra:'bloqueia',cond:null},{id:uid(),chave:'terreno.necessidade_demolicao',regra:'justificativa',cond:{modo:'todas',itens:[{campo:'terreno.tipo_empreendimento',op:'fora',valores:['mercado']}]}},
    {id:uid(),chave:'calculado.forma_pagamento_vigente',regra:'livre',cond:null})})();
