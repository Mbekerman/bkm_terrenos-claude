// ---------------------------------------------------------------------
// Inscrição municipal por cidade. A cidade é sempre a do terreno (pela poligonal):
// São Paulo (SQL, base GeoSampa), São José dos Campos (inscrição imobiliária,
// base GeoSanja) ou outro (digitada, sem base). O campo abre com a máscara da
// cidade e, com base, o lote é buscado na prefeitura dela.
// No banco: app.bases_cadastrais (máscara e rótulo por município),
// inscricoes_municipais.municipio_id e app.registrar_consulta_lote.
// ---------------------------------------------------------------------
const CIDADES_INSC={
  sp:{cidade:'São Paulo',base:'GeoSampa',rotulo:'SQL',mascara:'000.000.0000-0'},
  sjc:{cidade:'São José dos Campos',base:'GeoSanja',rotulo:'Inscrição imobiliária',mascara:'00.0000.0000.0000'},
  outro:{cidade:'Outro município',base:null,rotulo:'Inscrição municipal',mascara:null},
};
const insCid=ins=>ins.mun||'sp';
const digitosMasc=m=>(m.match(/0/g)||[]).length;
function mascarar(v,m){if(!m)return v;const d=digits(v).slice(0,digitosMasc(m));let r='',j=0;
  for(const c of m){if(j>=d.length)break;r+=c==='0'?d[j++]:c}return r}
const cidDoNome=n=>/s[aã]o jos[eé] dos campos/i.test(n||'')?'sjc':!n||/^s[aã]o paulo\b/i.test(n)?'sp':'outro';
const cidDoTerreno=t=>cidDoNome(t.municipio);
// Campo da inscrição na cidade do terreno (vem da poligonal; não há escolha). O
// rádio marcado escondido leva a cidade no formulário. pre: prefixo dos ids;
// rot: rótulo antes do nome da inscrição.
function campoInsc(pre,cid,rot,obrig){const c=CIDADES_INSC[cid];
  return `<input type="radio" name="mun" value="${cid}" data-insc="${pre}" checked hidden>
  <div class="field grow"><label for="${pre}-sql" id="${pre}-sql-l">${rotInsc(c,rot)}</label><input id="${pre}-sql" name="sql" ${obrig?'required':''} data-masc="${c.mascara||''}" inputmode="${c.mascara?'numeric':'text'}" placeholder="${c.mascara||'Como está no carnê do IPTU'}" autocomplete="off"></div>`}
const rotInsc=(c,rot)=>rot?`${rot} (${c.rotulo})`:c.rotulo;
document.addEventListener('change',e=>{const r=e.target.closest('[data-insc]');if(!r)return;const pre=r.dataset.insc,c=CIDADES_INSC[r.value],el=document.getElementById(pre+'-sql'),lb=document.getElementById(pre+'-sql-l');if(!el)return;
  el.dataset.masc=c.mascara||'';el.inputMode=c.mascara?'numeric':'text';el.placeholder=c.mascara||'Como está no carnê do IPTU';el.value=c.mascara?mascarar(el.value,c.mascara):el.value;
  if(lb)lb.textContent=rotInsc(c,pre==='i'?'Nova inscrição':'');if(el.form?.dataset.form==='novo')dedupe();if(e.isTrusted)el.focus()});

// Busca na base da cidade da inscrição (só com a inscrição completa).
const loteBuscavel=ins=>{const c=CIDADES_INSC[insCid(ins)];return !!(c.base&&LOTE_ADAPT[insCid(ins)]?.url()&&digits(ins.sql).length===digitosMasc(c.mascara))};
let LOTE_BUSCANDO=null;
async function loteBuscar(t,i){const ins=t.insc[i];if(!ins||LOTE_BUSCANDO)return;const cid=insCid(ins),c=CIDADES_INSC[cid],ad=LOTE_ADAPT[cid];if(!ad)return;
  if(!ad.url()){toast(`A busca no ${c.base} funciona na versão publicada.`,true);return}
  if(digits(ins.sql).length!==digitosMasc(c.mascara)){toast(`${c.rotulo} incompleto: são ${digitosMasc(c.mascara)} dígitos.`,true);return}
  if(cidDoTerreno(t)!==cid){toast(`O terreno está em ${(t.municipio||'').split(' · ')[0]}; o ${c.base} só cobre ${c.cidade}.`,true);return}
  LOTE_BUSCANDO=t.id+':'+i;render();
  try{await ad.buscar(t,ins)}catch(e){console.error(e);toast(`Não foi possível consultar o ${c.base} agora. Tente de novo em instantes.`,true)}
  finally{LOTE_BUSCANDO=null;render()}}
function loteQuadro(t,ins,i){const ad=LOTE_ADAPT[insCid(ins)];return ad?ad.quadro(t,ins,i):''}
// Botão de buscar e quadro vazio, iguais nas bases.
function loteBotao(t,ins,i){const c=CIDADES_INSC[insCid(ins)],busc=LOTE_BUSCANDO===t.id+':'+i,g=(ins.geo||[])[0];
  return UI.role!=='Leitura'?`<button class="btn sm ${g?'text':''}" data-a="geo-buscar" data-i="${i}" ${busc?'disabled':''}>${ic('search',16)}${busc?'Consultando...':g?'Buscar de novo':'Buscar no '+c.base}</button>`:''}
function loteVazio(t,ins,i,txt){const c=CIDADES_INSC[insCid(ins)],ad=LOTE_ADAPT[insCid(ins)];
  return `<div class="geo-vazio">${loteBotao(t,ins,i)}<span class="hint">${ad.url()?txt:`A busca no ${c.base} funciona na versão publicada.`}</span></div>`}
function loteCab(t,ins,i){const c=CIDADES_INSC[insCid(ins)],g=ins.geo[0],n=ins.geo.length-1;
  return `<div class="geo-h"><span>${bi('mapa',20)}<b>${c.base}</b> <span class="muted">consultado em ${fdh(g.em)} por ${esc(g.user)}${n?` · ${n} consulta${n>1?'s':''} anterior${n>1?'es':''} guardada${n>1?'s':''}`:''}</span></span>${loteBotao(t,ins,i)}</div>`}
// Grava a consulta e completa só o que está vazio; troca as zonas DESTE lote na análise (os outros lotes ficam).
function loteRegistrar(t,ins,{lote,poly,areaPol,zonas,erros,camadas,area,aConst}){const c=CIDADES_INSC[insCid(ins)];
  ins.geo=ins.geo||[];ins.geo.unshift({em:agora(),user:me(),lote,poly,areaPol,zonas,erros,camadas});
  const feito=[];
  if(ins.area==null&&area){ins.area=Number(area);feito.push('área cadastral')}
  if(t.aCad==null&&t.insc.every(x=>x.area!=null)){t.aCad=t.insc.reduce((s,x)=>s+x.area,0);feito.push('área cadastral do terreno')}
  if(t.aConst==null&&aConst!=null&&t.insc.length===1){t.aConst=Number(aConst);feito.push('área construída')}
  if(!t.poly&&t.insc.length===1&&poly){t.poly=poly;feito.push('poligonal');if(t.lat==null){const m=centro(poly);t.lat=+m[0].toFixed(7);t.lng=+m[1].toFixed(7);t.precisao='aproximada'}}
  if(zonas.length&&substituirZonas(t,ins.sql,zonas.map(z=>({sigla:z.sigla,area:z.area_m2,macro:z.macrozona||null})),`${c.base} (${c.rotulo} ${ins.sql})`))feito.push('zonas do lote')
  log(t,`${c.base} consultado pela inscrição ${ins.sql}${feito.length?': '+feito.join(', '):''}`);save();render();
  toast(erros.length?`${c.base} consultado; ${erros.length} camada${erros.length>1?'s':''} não respondeu.`:`${c.base} consultado. Gerando a planta e o desenho...`)}
// Catálogo de zonas por cidade (no banco, app.zoneamentos).
const ZONAS_SJC=['ZM1','ZM2','ZM3','ZM4','ZM5','ZR','ZUD','ZUPI','ZUPI1','ZUPI2','ZPA1','ZPA2','ZPE1','ZPE2','ZA','ZESFX','CL','CM','CM-C.EXPANDIDO','CMETRO-CT','CMETRO-ED','FAIXA NAED'];
const zonasDoCatalogo=cid=>cid==='sjc'?ZONAS_SJC:cid==='sp'?ZONEAMENTOS:[];
function loteDoc(t,ins,k,nome){const c=CIDADES_INSC[insCid(ins)];let d=t.docs.find(x=>x.tipo===k);if(!d){d={tipo:k,status:'recebido',emitido:HOJE,versoes:0,nome};t.docs.push(d)}
  d.versoes++;d.emitido=HOJE;d.nome=nome;log(t,`${TIPOS_DOC[k][0]}: versão ${d.versoes} gerada pelo ${c.base}`)}
function loteArqBotoes(t){const docP=t.docs.find(x=>x.tipo==='lote_pdf'),docD=t.docs.find(x=>x.tipo==='lote_dxf');
  return `<div class="geo-arq">${[['pdf','Planta (PDF)',docP],['dxf','Desenho (DXF)',docD]].map(([k,l,d])=>d?`<button class="btn sm" data-a="geo-baixar" data-k="${k}">${ic('download',16)}${l}${d.versoes>1?` <span class="faint">v${d.versoes}</span>`:''}</button>`:'').join('')}<span class="hint">${docP||docD?'Guardados em Documentos, com versão. O DXF abre no AutoCAD (salve como DWG); coordenadas UTM 23S SIRGAS 2000.':''}</span></div>`}
// Lista "O que toca o lote": [{tema, grav, erro, vals}]
function loteToca(linhas){const toca=linhas.filter(l=>l.vals.length),nada=linhas.filter(l=>!l.vals.length&&!l.erro),falhou=linhas.filter(l=>l.erro);
  return `<div class="geo-toca"><div class="geo-st">O que toca o lote</div>${toca.map(l=>`<div class="geo-l"><span class="k">${esc(l.tema)}</span><span class="v">${l.vals.map(v=>`<span class="chip ${l.grav}">${esc(v)}</span>`).join(' ')}</span></div>`).join('')||'<div class="muted">Nenhuma restrição nem perímetro especial.</div>'}
    ${nada.length?`<div class="hint" style="margin-top:6px">Não toca: ${nada.map(l=>esc(l.tema)).join(', ')}.</div>`:''}${falhou.length?`<div class="hint" style="color:var(--crit-tx,#b3261e)">Não responderam nesta consulta: ${falhou.map(l=>esc(l.tema)).join(', ')}.</div>`:''}</div>`}
const LOTE_ADAPT={};  // preenchido por proto_geosampa.js e proto_geosanja.js: {url(), buscar(t,ins), quadro(t,ins,i)}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="geo-"]');if(!a)return;const t=T(UI.id);if(!t)return;
  if(a.dataset.a==='geo-buscar')loteBuscar(t,Number(a.dataset.i));
  if(a.dataset.a==='geo-baixar')geoBaixar(t,a.dataset.k)});
