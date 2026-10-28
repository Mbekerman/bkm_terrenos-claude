// ---------------------------------------------------------------------
// Parâmetros urbanísticos por lote e zona (decisão do Moisés, 25/out/2026).
// O parâmetro é da zona, aplicado à parte do lote que ela cobre, e o CA muda
// com o tipo de empreendimento (mercado, HIS, HMP). Catálogo da empresa
// (S.zpar, copiado do padrão de tools/parametros/parametros.json, o mesmo que
// o banco carrega), editado em Configurações › Parâmetros urbanísticos.
// No banco: app.zona_parametros, app.parametros_zona, app._substituir_zonas,
// app.registrar_zonas_sem_inscricao, v_lote_zonas e v_urbanismo_vigente.
// ---------------------------------------------------------------------
const ZPAR_PADRAO=__PARAMETROS__;
const MUN_CID={'3550308':'sp','3549904':'sjc'},CID_MUN={sp:'3550308',sjc:'3549904'};
const TIPOS_EMP={mercado:'Mercado',his:'HIS',hmp:'HMP'};
const SIT_PAR={confirmado:'Confirmado',validar:'A validar',nao_confirmado:'Não confirmado'};
const MACROS={MC:'Consolidação',ME:'Estruturação',MOC:'Ocupação Controlada'};
const zpar=()=>S.zpar||(S.zpar=ZPAR_PADRAO.map((r,i)=>({...r,id:'zp'+i,ativo:true})));
// Macrozona de SJC pelo nome que o GeoSanja devolve
const macroDe=n=>/consolida/i.test(n||'')?'MC':/estrutura/i.test(n||'')?'ME':/controlad/i.test(n||'')?'MOC':null;

// app.parametros_zona: a linha do tipo pedido ou, sem regra própria, a de
// mercado; a mais específica em macrozona e uso; sem uso, a permitida,
// preferindo o vertical. Tamanho do lote = área do terreno (sem área, lote grande).
function parZona(cid,sigla,tipo,macro,area,uso){const A=area??Infinity,ord=['RV2','RV1','RH','R'];
  const c=zpar().filter(r=>r.ativo&&MUN_CID[r.municipio]===cid&&r.sigla===sigla&&(r.tipo===tipo||r.tipo==='mercado')
    &&(!r.macrozona||r.macrozona===macro)&&(!r.uso||!uso||r.uso===uso)
    &&(r.lote_area_min_m2==null||A>=r.lote_area_min_m2)&&(r.lote_area_max_m2==null||A<r.lote_area_max_m2));
  const k=r=>[r.tipo===tipo?0:1,r.macrozona?0:1,(r.uso||null)===(uso||null)?0:1,r.permitido!==false?0:1,r.uso?ord.indexOf(r.uso)+1:0];
  return c.sort((a,b)=>{const x=k(a),y=k(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0})[0]||null}

// Zonas da análise vigente (estados antigos sem lote: com uma inscrição só, é dela)
const zIns=(t,z)=>z.ins!==undefined?z.ins:t.insc.length===1?t.insc[0].sql:null;
// valores alterados pelo usuário no lote: o preenchimento automático não é definitivo (decisão do Moisés, 25/out/2026)
const EXC_K=['ca_minimo','ca_basico','recuo_frente_m','recuo_lateral_m','recuo_lateral_alto_m','cota_parte_m2','max_unidades','permeabilidade','lote_minimo_m2','frente_minima_m','outorga_gratuita'];
const temExc=e=>!!e&&(e.ca!=null||e.to!=null||e.gab!=null||e.gabSL!=null||EXC_K.some(k=>e[k]!=null));
// v_lote_zonas: parâmetros do catálogo com a exceção do lote por cima
function lz(t,z,tipo){const ar=areaAdotada(t),p0=parZona(cidDoTerreno(t),z.sigla,tipo,z.macro,ar),e=temExc(z.exc)?z.exc:{},eg=e.gab!=null||e.gabSL!=null;
  const alt=EXC_K.filter(k=>e[k]!=null),p=p0&&{...p0,...Object.fromEntries(alt.map(k=>[k,e[k]]))};
  const perm=p?p.permitido!==false:null,ca=e.ca??p?.ca_maximo??null;
  return {z,p,alt:new Set([...alt,...(e.ca!=null?['ca_maximo']:[]),...(e.to!=null?['to']:[]),...(eg?['gab']:[])]),perm,ca,cab:p?.ca_basico??null,to:e.to??(p?(p.to_corte_m2&&ar>=p.to_corte_m2?p.to_lote_grande:p.to_maximo):null)??null,
    gab:eg?e.gab:p?.gabarito_m??null,gabSL:eg?!!e.gabSL:!!p?.gabarito_sem_limite,exc:temExc(z.exc),
    potB:perm&&p?.ca_basico&&z.area?z.area*p.ca_basico:null,potM:perm&&ca&&z.area?z.area*ca:null}}
// v_urbanismo_vigente: potencial nulo se algum pedaço não tem CA ou não admite o tipo
function resumoUrb(t,tipo){const a=analiseVig(t);if(!a||!a.zonas.length)return null;const L=a.zonas.map(z=>lz(t,z,tipo));
  const soma=k=>L.every(l=>l[k]!=null)?L.reduce((s,l)=>s+l[k],0):null;
  return {L,potB:soma('potB'),potM:soma('potM'),caMax:Math.max(...L.map(l=>l.ca??-1)),naoAdm:L.filter(l=>l.perm===false).map(l=>l.z.sigla),
    semCa:L.filter(l=>l.perm!==false&&l.ca==null).map(l=>l.z.sigla),validar:L.some(l=>l.p&&l.p.situacao!=='confirmado')}}

// app._substituir_zonas: troca as zonas de um lote (ins nulo = parte sem
// inscrição) numa análise nova, copiando os outros lotes; exceções das zonas
// que continuam passam junto. Sem mudança, não grava. Devolve true se gravou.
function substituirZonas(t,ins,zonas,fonte){const vig=analiseVig(t),cat=zonasDoCatalogo(cidDoTerreno(t)),key=x=>digits(x||'')||null;
  const novas={};zonas.filter(z=>cat.includes(z.sigla)).forEach(z=>{const n=novas[z.sigla]||(novas[z.sigla]={sigla:z.sigla,area:0,macro:z.macro||null});n.area=Math.round((n.area+(z.area||0))*100)/100;if(z.macro)n.macro=z.macro});
  const fora=[...new Set(zonas.filter(z=>!cat.includes(z.sigla)).map(z=>z.sigla))];
  const doLote=vig?vig.zonas.filter(z=>key(zIns(t,z))===key(ins)):[];
  const ch=zs=>zs.map(z=>`${z.sigla}:${Math.round(z.area||0)}:${z.macro||''}`).sort().join();
  if(vig&&ch(Object.values(novas))===ch(doLote)&&!fora.length)return false;
  const outros=vig?vig.zonas.filter(z=>key(zIns(t,z))!==key(ins)).map(z=>({...z,ins:zIns(t,z)})):[];
  const meus=Object.values(novas).map(n=>{const o=doLote.find(z=>z.sigla===n.sigla);return {...n,ins,exc:o?.exc||null,obs:o?.obs||''}});
  t.analises.forEach(a=>{if(a.status==='vigente')a.status='substituida'});
  t.analises.push({id:uid(),data:HOJE,fonte,status:'vigente',obs:fora.length?'Zonas fora do catálogo: '+fora.join(', '):'',zonas:[...outros,...meus]});
  return true}

// ---------- Ficha: seção Urbanismo ----------
const lzCabLote=(t,ins)=>{if(!ins)return `<b>Parte sem inscrição</b> <span class="muted">· zona pela poligonal do terreno</span>`;
  const i=t.insc.find(x=>digits(x.sql)===digits(ins)),c=CIDADES_INSC[i?insCid(i):cidDoTerreno(t)];
  return `<b>${esc(c.rotulo)} ${esc(ins)}</b>${i?.area!=null?` <span class="muted">· ${m2(i.area)} cadastrais</span>`:''}`};
const gabTxt=l=>l.gabSL?'Sem limite':l.gab!=null?num(l.gab,2)+' m':'<span class="ni">—</span>';
// Tipo do empreendimento pretendido (terrenos.tipo_empreendimento): escolhido no Novo terreno em SP e mudado aqui
OPT.tipoEmp={nao_informado:'Não informado',...TIPOS_EMP};LAB_CAMPO.tipoEmp='Tipo do empreendimento';TIPO_CAMPO.tipoEmp=['sel','tipoEmp'];
const tipoEmp=t=>TIPOS_EMP[t.tipoEmp]?t.tipoEmp:null;
const segTipoEmp=(nome,v,req)=>`<span class="seg3" role="radiogroup" aria-label="Tipo do empreendimento">${Object.entries(TIPOS_EMP).map(([k,l])=>`<label class="opt-radio"><input type="radio" name="${nome}" value="${k}" ${v===k?'checked':''} ${req?'required':''}>${l}</label>`).join('')}</span>`;
// um valor do quadro: vazio = a lei não fixa (nunca zero)
const lzV=(v,suf,d)=>v==null?'<span class="ni">—</span>':num(v,d??2)+(suf||'');
const lzPct=v=>v==null?'<span class="ni">—</span>':num(v*100,0)+'%';
function lzRecuoLat(p){const a=p.recuo_lateral_m,b=p.recuo_lateral_alto_m,ate=MUN_CID[p.municipio]==='sjc'?'até o 2º pavimento':'até 10 m de altura';
  if(a==null&&b==null)return '<span class="ni">—</span>';
  if(b==null)return num(a,2)+' m';
  return `${a==null||a===0?'Dispensado':num(a,2)+' m'} ${ate}; ${num(b,2)} m acima`}
// parâmetros de uma zona no lote, pelo tipo escolhido
function lzZona(t,z,i,tipo,sjc,ed){const l=lz(t,z,tipo),p=l.p,ar=areaAdotada(t),mk=[];
  if(sjc)mk.push(z.macro?`<span class="chip">${esc(MACROS[z.macro])}</span>`:'<span class="chip warn">sem macrozona</span>');
  if(p&&p.tipo!==tipo)mk.push(`<span class="chip" title="A zona não tem regra própria de ${TIPOS_EMP[tipo]}: vale a de mercado">regra de mercado</span>`);
  if(p&&p.situacao!=='confirmado')mk.push(`<span class="chip warn" title="${esc(SIT_PAR[p.situacao])} no catálogo">${esc(SIT_PAR[p.situacao])}</span>`);
  if(l.exc)mk.push(`<span class="chip blue" title="${esc(z.exc.fonte||'')}">valores alterados no lote</span>`);
  const cel=(k,v,dica,ch)=>{const a=ch&&l.alt.has(ch);return `<div class="lz-c${a?' alt':''}"><dt>${k}</dt><dd>${v}</dd>${a?'<div class="lz-d">alterado no lote</div>':dica?`<div class="lz-d">${dica}</div>`:''}</div>`};
  const corpo=!p?`<div class="muted lz-sem">${sjc&&!z.macro?'Informe a macrozona: em SJC o CA depende dela.':'Zona sem parâmetros no catálogo.'}</div>`
    :l.perm===false?`<div class="muted lz-sem">${esc(TIPOS_EMP[tipo])} não admitido${p.regras?': '+esc(p.regras):''}</div>`
    :`<dl class="lz-par">
      ${cel('CA mínimo',lzV(p.ca_minimo,'',3),'','ca_minimo')}${cel('CA básico',lzV(l.cab,'',3),'','ca_basico')}${cel('CA máximo',`<b>${lzV(l.ca,'',3)}</b>`,'','ca_maximo')}
      ${cel('Potencial máximo',l.potM!=null?`<b>${m2(l.potM)}</b>`:'<span class="ni">—</span>',l.potB!=null?`sem outorga ${m2(l.potB)}`:'')}
      ${cel('Taxa de ocupação',lzV(l.to,'',2),p.to_corte_m2?`${num(p.to_maximo,2)} em lote até ${num(p.to_corte_m2)} m²; ${num(p.to_lote_grande,2)} acima${ar==null?' (sem área adotada, vale a de lote grande)':''}`:'','to')}
      ${cel('Gabarito',gabTxt(l),'','gab')}
      ${cel('Recuo de frente',lzV(p.recuo_frente_m,' m'),'','recuo_frente_m')}${cel('Recuos laterais e de fundo',lzRecuoLat(p),'',l.alt.has('recuo_lateral_m')?'recuo_lateral_m':'recuo_lateral_alto_m')}
      ${cel('Cota-parte máxima',p.cota_parte_m2!=null?num(p.cota_parte_m2)+' m² por unidade':'<span class="ni">—</span>',p.cota_parte_m2!=null&&z.area?`até ${num(Math.floor(z.area/p.cota_parte_m2))} unidades nesta área`:'','cota_parte_m2')}
      ${p.max_unidades!=null?cel('Unidades por lote',num(p.max_unidades),'','max_unidades'):''}
      ${cel('Permeabilidade mínima',lzPct(p.permeabilidade),'','permeabilidade')}${cel('Lote mínimo',lzV(p.lote_minimo_m2,' m²',0),'','lote_minimo_m2')}${cel('Frente mínima',lzV(p.frente_minima_m,' m'),'','frente_minima_m')}
      ${cel('Outorga onerosa',p.outorga_gratuita===true?'<span class="chip good">Gratuita</span>':p.outorga_gratuita===false?'Paga acima do básico':'<span class="ni">—</span>','','outorga_gratuita')}
    </dl>${p.regras?`<div class="lz-regra">${esc(p.regras)}</div>`:''}`;
  return `<div class="lz-z" id="lz-${i}"><div class="lz-zh"><b>${esc(z.sigla)}</b><span class="muted">${m2(z.area)}</span>${mk.join(' ')}
    ${ed?`<button class="linkbtn lz-zb" data-a="edit" data-s="zexc:${i}">${l.exc?'Editar valores':'Alterar valores'}</button>`:''}</div>
    ${corpo}${UI.edit==='zexc:'+i?lzFormExc(z,i,sjc,{p0:parZona(cidDoTerreno(t),z.sigla,tipo,z.macro,ar),ar}):''}</div>`}
function lzTabela(t,a,ins,tipo,sjc){const ed=UI.role!=='Leitura';
  return a.zonas.map((z,i)=>[z,i]).filter(([z])=>(digits(zIns(t,z)||'')||null)===(digits(ins||'')||null)).map(([z,i])=>lzZona(t,z,i,tipo,sjc,ed)).join('')}
// demais dados da última consulta do lote no GeoSampa ou GeoSanja: Conpresp, tombamento, ZEIS, mananciais, macrozona...
function lzCamadas(t,ins){const i=ins&&t.insc.find(x=>digits(x.sql)===digits(ins)),g=i&&(i.geo||[])[0],ad=i&&LOTE_ADAPT[insCid(i)];
  if(!i)return '';
  if(!g||!ad?.linhas)return ad?`<div class="hint lz-cam">Sem consulta à base da prefeitura neste lote. Busque em Cadastro › Inscrições para trazer tombamento, ZEIS, mananciais e as demais restrições.</div>`:'';
  return `<div class="lz-cam">${loteToca(ad.linhas(g)).replace('<div class="geo-st">O que toca o lote</div>',`<div class="geo-st">Demais parâmetros e restrições <span class="faint">· ${esc(CIDADES_INSC[insCid(i)].base||'consulta')} de ${fdh(g.em)}</span></div>`)}</div>`}
// Alterar valores do lote: vazio segue o catálogo; o que mudar precisa da fonte
const EXC_CAMPOS=[['ca_minimo','CA mínimo'],['ca_basico','CA básico'],['ca','CA máximo'],['to','Taxa de ocupação'],['recuo_frente_m','Recuo de frente (m)'],['recuo_lateral_m','Recuo lateral e de fundo, até 10 m de altura (m)'],['recuo_lateral_alto_m','Recuo lateral e de fundo, acima (m)'],['cota_parte_m2','Cota-parte máxima (m²)'],['max_unidades','Unidades por lote'],['lote_minimo_m2','Lote mínimo (m²)'],['frente_minima_m','Frente mínima (m)']];
const vBr=v=>v==null?'':String(v).replace('.',',');  // número no campo como se digita (vírgula)
function lzFormExc(z,i,sjc,l){const e=z.exc||{},p=l?.p0||{},ph=v=>v==null?'A lei não fixa':'Catálogo: '+num(v,3);
  const base=k=>({ca:p.ca_maximo,to:p.to_corte_m2&&l?.ar>=p.to_corte_m2?p.to_lote_grande:p.to_maximo})[k]??p[k];
  return `<form data-form="zexc" data-i="${i}" class="lz-exc"><div class="editgrid">
    ${sjc?`<div class="field"><label for="ze-m${i}">Macrozona</label><select id="ze-m${i}" name="macro"><option value="">Não informada</option>${Object.entries(MACROS).map(([k,lb])=>`<option value="${k}" ${z.macro===k?'selected':''}>${lb}</option>`).join('')}</select></div>`:''}
    ${EXC_CAMPOS.map(([k,lb])=>`<div class="field"><label for="ze-${k}${i}">${lb}</label><input id="ze-${k}${i}" name="${k}" inputmode="decimal" value="${vBr(e[k])}" placeholder="${esc(ph(base(k)))}"></div>`).join('')}
    <div class="field"><label for="ze-pm${i}">Permeabilidade mínima (%)</label><input id="ze-pm${i}" name="permeabilidade" inputmode="decimal" value="${e.permeabilidade!=null?vBr(Math.round(e.permeabilidade*1000)/10):''}" placeholder="${esc(p.permeabilidade!=null?'Catálogo: '+num(p.permeabilidade*100,0)+'%':'A lei não fixa')}"></div>
    <div class="field"><label for="ze-g${i}">Gabarito</label><select id="ze-g${i}" name="gabSt"><option value="">Segue o catálogo</option><option value="limitado" ${e.gab!=null?'selected':''}>Limitado</option><option value="sem" ${e.gabSL?'selected':''}>Sem limite</option></select></div>
    <div class="field"><label for="ze-gv${i}">Gabarito (m)</label><input id="ze-gv${i}" name="gab" inputmode="decimal" value="${vBr(e.gab)}"></div>
    <div class="field"><label for="ze-o${i}">Outorga onerosa</label><select id="ze-o${i}" name="outorga_gratuita"><option value="">Segue o catálogo</option><option value="1" ${e.outorga_gratuita===true?'selected':''}>Gratuita</option><option value="0" ${e.outorga_gratuita===false?'selected':''}>Paga acima do básico</option></select></div>
    <div class="field full"><label for="ze-f${i}">Fonte da alteração</label><input id="ze-f${i}" name="fonte" value="${esc(e.fonte||'')}" placeholder="Consulta prévia, operação urbana, certidão, projeto aprovado..."></div></div>
    
    <div class="sec-f" style="padding:12px 0 0"><button type="button" class="btn text" data-a="cancel-edit">Cancelar</button><button class="btn primary">Salvar</button></div></form>`}
function lzFormNovo(t){const cid=cidDoTerreno(t),sjc=cid==='sjc',cat=zonasDoCatalogo(cid);
  const lotes=[...t.insc.map(i=>[i.sql,`${CIDADES_INSC[insCid(i)].rotulo} ${i.sql}`]),['','Parte sem inscrição (pela poligonal)']];
  return `<form data-form="analise" style="margin-top:12px"><div class="editgrid"><div class="field"><label for="an-l">Lote</label><select id="an-l" name="lote">${lotes.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div>
    <div class="field"><label for="an-f">Fonte</label><input id="an-f" name="fonte" placeholder="GeoSampa, certidão de uso do solo..." required></div></div>
    ${[0,1,2].map(i=>`<div class="editgrid" style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--linha)"><div class="field"><label for="z${i}">Zona ${i+1}${i?' (opcional)':''}</label><select id="z${i}" name="sigla${i}" ${i?'':'required'}><option value="">—</option>${cat.map(z=>`<option>${esc(z)}</option>`).join('')}</select></div>
    <div class="field"><label for="za${i}">Área da zona no lote (m²)</label><input id="za${i}" name="area${i}" inputmode="decimal"></div>
    ${sjc?`<div class="field"><label for="zm${i}">Macrozona</label><select id="zm${i}" name="macro${i}"><option value="">Não informada</option>${Object.entries(MACROS).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>`:''}</div>`).join('')}
    
    <div class="sec-f" style="padding:12px 0 0"><button type="button" class="btn text" data-a="cancel-edit">Cancelar</button><button class="btn primary">Registrar zonas</button></div></form>`}
function secAnaliseUrb(t){const a=analiseVig(t),hist=t.analises.filter(x=>x.status==='substituida'),tEsc=tipoEmp(t),tipo=tEsc||'mercado',cid=cidDoTerreno(t),sjc=cid==='sjc';
  const R=resumoUrb(t,tipo),ed=UI.role!=='Leitura';
  const lotes=a?[...new Set(a.zonas.map(z=>digits(zIns(t,z)||'')||null))].sort((x,y)=>(x===null)-(y===null)).map(d=>d===null?null:(t.insc.find(i=>digits(i.sql)===d)?.sql||d)):[];
  const zonasArea=a?Object.entries(a.zonas.reduce((o,z)=>(o[z.sigla]=(o[z.sigla]||0)+(z.area||0),o),{})).sort((x,y)=>y[1]-x[1]):[];
  const somaLotes=t.insc.reduce((s,i)=>s+(i.area||0),0),ar=areaAdotada(t),sobra=ar&&somaLotes&&ar-somaLotes>1?ar-somaLotes:null;
  return `<section class="sec" id="sec-analise"><div class="sec-h"><h2>Parâmetros urbanísticos</h2>${ed&&UI.edit!=='analise'?`<button class="btn sm" data-a="edit" data-s="analise">${ic('add',16)}Registrar zonas</button>`:''}</div><div class="sec-b">
  <div class="lz-topo"><span class="lz-tl" id="lz-tipo-l">Tipo do empreendimento</span><div class="seg" role="group" aria-labelledby="lz-tipo-l">${Object.entries(TIPOS_EMP).map(([k,l])=>`<button type="button" data-a="zn-tipo" data-v="${k}" aria-pressed="${tEsc===k}" ${ed?'':'disabled'}>${l}</button>`).join('')}</div>
    ${a?`<span class="muted" style="font-size:13px">Zonas vigentes desde ${fd(a.data)} · ${esc(a.fonte)}</span>`:''}</div>
  ${tEsc?'':`<div class="banner warn lz-ni">${ic('warn')}<div>Sem tipo de empreendimento: valores de Mercado, só como referência.</div></div>`}
  ${a&&R?`<dl class="kvl lz-res">
    <div class="kv"><dt>Zonas da área</dt><dd>${zonasArea.map(([s,v])=>`<b>${esc(s)}</b> ${m2(v)}`).join(' · ')}</dd></div>
    <div class="kv"><dt>Potencial construtivo (${esc(TIPOS_EMP[tipo])}${tEsc?'':', referência'})</dt><dd>${R.potM!=null?`<b>${m2(R.potM)}</b>`:`<span class="ni">${R.naoAdm.length?esc(TIPOS_EMP[tipo])+' não admitido em '+esc(R.naoAdm.join(', ')):R.semCa.length?'Falta o CA de '+esc(R.semCa.join(', ')):'Não calculado'}</span>`}</dd></div>
    <div class="kv"><dt>Sem outorga (CA básico)</dt><dd>${R.potB!=null?m2(R.potB):'<span class="ni">—</span>'}</dd></div>
    <div class="kv"><dt>Maior CA máximo</dt><dd>${R.caMax>0?num(R.caMax,3):'<span class="ni">—</span>'}</dd></div></dl>
    ${R.validar?'<div class="hint">Há parâmetros a validar no catálogo.</div>':''}
    ${lotes.map(ins=>`<div class="lz-lote"><div class="lz-h">${lzCabLote(t,ins)}</div>${lzTabela(t,a,ins,tipo,sjc)}${lzCamadas(t,ins)}</div>`).join('')}
    ${a.obs?`<div class="hint">${esc(a.obs)}</div>`:''}
    ${sobra&&!lotes.includes(null)?`<div class="hint">A área adotada passa a soma das inscrições em ${m2(sobra)}. Se essa parte não tem inscrição, registre a zona dela como "Parte sem inscrição".</div>`:''}
    <details class="details lz-fontes"><summary>Regras e fontes</summary>${[...new Map(R.L.filter(l=>l.p).map(l=>[l.p.id,l.p])).values()].map(p=>`<div class="lz-fonte"><b>${esc(p.sigla)}</b>${p.uso?' · '+esc(p.uso):''}${p.macrozona?' · '+esc(MACROS[p.macrozona]):''} · ${esc(TIPOS_EMP[p.tipo])}${p.regras?`<div class="muted">${esc(p.regras)}</div>`:''}<div class="faint">${esc(p.fonte_norma)}${p.fonte_dispositivo?', '+esc(p.fonte_dispositivo):''}${p.fonte_url?` · <a href="${esc(p.fonte_url)}" target="_blank" rel="noopener">texto da lei</a>`:''}</div></div>`).join('')}</details>`
  :'<div class="muted">Nenhuma zona registrada. Buscar o lote no GeoSampa ou no GeoSanja (em Cadastro › Inscrições) registra as zonas de cada lote; ou registre à mão.</div>'}
  ${UI.edit==='analise'?lzFormNovo(t):''}
  ${hist.length?`<details class="details" style="margin-top:12px"><summary>${hist.length} análise${hist.length>1?'s':''} anterior${hist.length>1?'es':''}</summary>${hist.map(h=>`<div class="muted" style="font-size:13px;padding:4px 0">${fd(h.data)} · ${esc(h.fonte)} · ${h.zonas.map(z=>`${z.sigla} ${m2(z.area)}`).join(', ')}</div>`).join('')}</details>`:''}
  </div></section>`}

// ---------- Configurações › Parâmetros urbanísticos (administrador) ----------
const ZP_COLS=[['ca_minimo','CA mín.'],['ca_basico','CA bás.'],['ca_maximo','CA máx.'],['to_maximo','TO'],['to_lote_grande','TO lote ≥ corte'],['gabarito_m','Gabarito (m)'],['cota_parte_m2','Cota-parte (m²)'],['lote_minimo_m2','Lote mín. (m²)'],['frente_minima_m','Frente mín. (m)']];
function cfgZonasHtml(){const cid=UI.zpCid||'sp',tipo=UI.zpTipo||'mercado',L=zpar().map((r,i)=>[r,i]).filter(([r])=>MUN_CID[r.municipio]===cid&&r.tipo===tipo);
  const cond=r=>[r.uso,r.macrozona&&MACROS[r.macrozona],r.lote_area_max_m2!=null?`lote < ${num(r.lote_area_max_m2)} m²`:'',r.lote_area_min_m2!=null?`lote ≥ ${num(r.lote_area_min_m2)} m²`:''].filter(Boolean).join(' · ');
  const nI=v=>v==null?'':String(v).replace('.',',');
  return `<section class="sec"><div class="sec-h"><h2>Parâmetros urbanísticos</h2><button class="btn text" data-a="zp-padrao">Restaurar padrão</button></div><div class="sec-b">
    
    <div class="lz-topo"><div class="seg" role="group" aria-label="Cidade">${[['sp','São Paulo'],['sjc','São José dos Campos']].map(([k,l])=>`<button type="button" data-a="zp-cid" data-v="${k}" aria-pressed="${cid===k}">${l}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Tipo de empreendimento">${Object.entries(TIPOS_EMP).map(([k,l])=>`<button type="button" data-a="zp-tipo" data-v="${k}" aria-pressed="${tipo===k}">${l}</button>`).join('')}</div></div>
    <div class="zp-lista">${L.map(([r,i])=>{const ab=UI.zpAb?.has(r.id),gab=r.gabarito_sem_limite?'sem limite':r.gabarito_m!=null?nI(r.gabarito_m)+' m':'',
      res=[`CA ${nI(r.ca_basico)||'—'} / ${nI(r.ca_maximo)||'—'}`,r.to_maximo!=null?'TO '+nI(r.to_maximo):'',gab?'Gabarito '+gab:''].filter(Boolean).join(' · '),
      sc={confirmado:'good',validar:'warn'}[r.situacao]||'',
      f=(k,l,x='')=>`<label class="zp-f"><span class="zp-l">${l}</span><input data-ch="zpar" data-i="${i}" data-k="${k}" value="${nI(r[k])}" inputmode="decimal" data-fmt="num" data-dec="3" aria-label="${l} de ${esc(r.sigla)}" ${x}></label>`;
      return `<details class="zp-z${r.ativo?'':' inativa'}" data-zp="${r.id}"${ab?' open':''}><summary><span class="zp-n"><b>${esc(r.sigla)}</b><span class="zp-cond">${esc(cond(r))}</span></span><span class="zp-res">${res}</span><span class="zp-chips">${r.ativo?'':'<span class="chip">Inativa</span>'}${r.situacao==='confirmado'?'':`<span class="chip ${sc}">${SIT_PAR[r.situacao]||'Sem situação'}</span>`}</span></summary>
      <div class="zp-b">${ZP_COLS.map(([k,l])=>k==='gabarito_m'?`<div class="zp-f zp-gab">${f(k,l)}<label class="chk"><input type="checkbox" data-ch="zpar" data-i="${i}" data-k="gabarito_sem_limite" ${r.gabarito_sem_limite?'checked':''} aria-label="Gabarito sem limite em ${esc(r.sigla)}">Sem limite</label></div>`
        :f(k,l,k==='to_lote_grande'&&r.to_corte_m2==null?'disabled title="Sem corte por tamanho de lote"':'')).join('')}
        <label class="zp-f"><span class="zp-l">Outorga grátis</span><select data-ch="zpar" data-i="${i}" data-k="outorga_gratuita" aria-label="Outorga em ${esc(r.sigla)}"><option value="" ${r.outorga_gratuita==null?'selected':''}>—</option><option value="1" ${r.outorga_gratuita===true?'selected':''}>Sim</option><option value="0" ${r.outorga_gratuita===false?'selected':''}>Não</option></select></label>
        <label class="zp-f"><span class="zp-l">Situação</span><select data-ch="zpar" data-i="${i}" data-k="situacao" aria-label="Situação de ${esc(r.sigla)}">${Object.entries(SIT_PAR).map(([k,l])=>`<option value="${k}" ${r.situacao===k?'selected':''}>${l}</option>`).join('')}</select></label>
        <label class="zp-f zp-fonte"><span class="zp-l">Fonte</span><input data-ch="zpar" data-i="${i}" data-k="fonte_norma" value="${esc(r.fonte_norma||'')}" aria-label="Fonte de ${esc(r.sigla)}" title="${esc([r.fonte_dispositivo,r.regras].filter(Boolean).join(' · '))}"></label>
        <div class="zp-chk"><label class="chk"><input type="checkbox" data-ch="zpar" data-i="${i}" data-k="permitido" ${r.permitido!==false?'checked':''} aria-label="Admitido em ${esc(r.sigla)}">Admitido nesta zona</label><label class="chk"><input type="checkbox" data-ch="zpar" data-i="${i}" data-k="ativo" ${r.ativo?'checked':''} aria-label="Ativo">Ativo</label></div></div></details>`}).join('')}</div>
    </div></section>`}

// zonas abertas no catálogo continuam abertas depois de gravar
document.addEventListener('toggle',e=>{const d=e.target;if(!d.classList?.contains('zp-z'))return;(UI.zpAb||(UI.zpAb=new Set()))[d.open?'add':'delete'](d.dataset.zp)},true);
// ---------- eventos ----------
function zonasClick(A,a,t){
  switch(A){
    case 'zn-tipo':{if(UI.role==='Leitura'||!t)return true;const v=a.dataset.v,antes=t.tipoEmp||'nao_informado';if(v===antes)return true;
      t.tipoEmp=v;log(t,`Tipo do empreendimento: ${valTxt('tipoEmp',antes)} → ${valTxt('tipoEmp',v)}`);save();render();toast(`Parâmetros de ${TIPOS_EMP[v]}.`);return true}
    case 'zp-cid':UI.zpCid=a.dataset.v;render();return true;
    case 'zp-tipo':UI.zpTipo=a.dataset.v;render();return true;
    case 'zp-padrao':if(!confirm('Restaurar os parâmetros urbanísticos do modelo padrão? As mudanças feitas aqui somem.'))return true;S.zpar=null;save();render();toast('Parâmetros do modelo padrão restaurados.');return true;
  }
  return false}
function zonasChange(el){if(el.dataset.ch!=='zpar')return false;const r=zpar()[+el.dataset.i],k=el.dataset.k;
  let v=el.type==='checkbox'?el.checked:k==='outorga_gratuita'?(el.value===''?null:el.value==='1'):k==='situacao'||k==='fonte_norma'?el.value.trim():el.value.trim()===''?null:lerNum(el.value);
  if(k==='fonte_norma'&&!v){toast('O parâmetro precisa da fonte.',true);render();return true}
  if(ZP_COLS.some(c=>c[0]===k)&&v!=null&&!(v>0)){toast('Valor inválido: use número maior que zero, ou deixe vazio se a lei não fixa.',true);render();return true}
  if((k==='to_maximo'||k==='to_lote_grande')&&v>1){toast('TO vai de 0 a 1.',true);render();return true}
  const novo={...r,[k]:v};if(k==='gabarito_sem_limite'&&v)novo.gabarito_m=null;if(k==='gabarito_m'&&v!=null)novo.gabarito_sem_limite=false;
  if(novo.ca_basico!=null&&novo.ca_maximo!=null&&novo.ca_maximo<novo.ca_basico){toast('CA máximo menor que o básico.',true);render();return true}
  if(k==='ativo'&&v&&zpar().some(x=>x!==r&&x.ativo&&x.municipio===r.municipio&&x.sigla===r.sigla&&x.tipo===r.tipo&&x.uso==r.uso&&x.macrozona==r.macrozona&&x.lote_area_min_m2==r.lote_area_min_m2&&x.lote_area_max_m2==r.lote_area_max_m2)){toast('Já há uma linha ativa para essa zona e condição.',true);render();return true}
  Object.assign(r,novo);save();render();return true}
function zonasSubmit(form,F,t,f){
  if(form==='analise'){const sjc=cidDoTerreno(t)==='sjc',zonas=[0,1,2].map(i=>F['sigla'+i]?{sigla:F['sigla'+i],area:lerNum(F['area'+i]),macro:sjc?F['macro'+i]||null:null}:null).filter(Boolean);
    if(zonas.some(z=>z.area!=null&&!(z.area>0))){toast('Área da zona tem que ser maior que zero.',true);return true}
    const ins=F.lote||null,ok=substituirZonas(t,ins,zonas,F.fonte.trim());UI.edit=null;
    if(ok)log(t,`Zonas ${ins?'do lote '+ins:'da parte sem inscrição'}: ${zonas.map(z=>z.sigla).join(' + ')}`);save();render();
    toast(ok?'Zonas registradas. A análise anterior foi preservada.':'As zonas deste lote já eram essas.');return true}
  if(form==='zexc'){const a=analiseVig(t),z=a?.zonas[+f.dataset.i];if(!z)return true;
    const gab=F.gabSt==='limitado'?lerNum(F.gab):null,exc={ca:lerNum(F.ca),to:lerNum(F.to),gab,gabSL:F.gabSt==='sem'?true:F.gabSt==='limitado'?false:null,fonte:F.fonte.trim()};
    EXC_CAMPOS.forEach(([k])=>{if(!['ca','to'].includes(k))exc[k]=lerNum(F[k])});
    const pm=lerNum(F.permeabilidade);exc.permeabilidade=pm==null?null:Math.round(pm*10)/1000;exc.outorga_gratuita=F.outorga_gratuita===''?null:F.outorga_gratuita==='1';
    if(F.gabSt==='limitado'&&!(gab>0)){toast('Informe o gabarito limitado.',true);return true}
    if(exc.to!=null&&!(exc.to>0&&exc.to<=1)){toast('Taxa de ocupação vai de 0 a 1.',true);return true}
    if(exc.permeabilidade!=null&&!(exc.permeabilidade>0&&exc.permeabilidade<=1)){toast('Permeabilidade vai de 0 a 100%.',true);return true}
    if(['ca_minimo','ca_basico','ca','cota_parte_m2','max_unidades','lote_minimo_m2','frente_minima_m'].some(k=>exc[k]!=null&&!(exc[k]>0))){toast('CA, cota-parte, unidades, lote e frente: número maior que zero, ou vazio para seguir o catálogo.',true);return true}
    if(['recuo_frente_m','recuo_lateral_m','recuo_lateral_alto_m'].some(k=>exc[k]!=null&&exc[k]<0)){toast('Recuo não pode ser negativo.',true);return true}
    Object.keys(exc).forEach(k=>{if(exc[k]==null)delete exc[k]});
    if(temExc(exc)&&!exc.fonte){toast('Alteração só com a fonte.',true);return true}
    z.exc=temExc(exc)?exc:null;if('macro' in F)z.macro=F.macro||null;z.ins=zIns(t,z);UI.edit=null;
    log(t,`Zoneamento: ${z.exc?'valores alterados no lote':'lote segue o catálogo'} em ${z.sigla}`);save();render();toast('Salvo.');return true}
  return false}
