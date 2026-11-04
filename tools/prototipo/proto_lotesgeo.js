/* ---------- Lotes da prefeitura no cadastro do terreno (São Paulo; pedido do Moisés, 4/nov/2026) ----------
   Ao cadastrar um terreno em São Paulo, pergunta se quer inserir os lotes. Sim abre o mapa de lotes do GeoSampa
   das quadras que a poligonal ocupa, no jeito do GeoSampa: "F 0053" (número do lote fiscal) e "N. 161" (número de
   porta) em cada lote, e o SQL ao parar o mouse em cima. Clique marca e desmarca; vêm marcados os lotes com pelo
   menos 20% dentro da poligonal. Os SQLs marcados entram no cadastro do terreno soltos, sem lote nem matrícula,
   e aparecem na lista do SQL quando a pessoa monta os Lotes. Condomínio ("CD 01", sem os SQLs das unidades), via
   de acesso e SQL que já está em outro terreno aparecem mas não se marcam. Também pelo botão "Lotes da
   prefeitura" da seção Lotes. Só na versão publicada (passa pelo Caddy em /geosampa, como a busca pelo SQL).
   No banco: inscricoes_municipais.origem = 'mapa_prefeitura', sem linha em lote_inscricoes. */

const LG_MIN=0.2;   // fração do lote dentro da poligonal para vir marcado
const lgPode=t=>!!(t&&GEO_BASE&&t.poly&&t.poly.length>2&&cidDoTerreno(t)==='sp'&&UI.role!=='Leitura');
const lgSoltos=t=>(t.insc||[]).filter(i=>i.solto&&!(t.lotes||[]).some(l=>l.ins.includes(i.id)));

function lgPerguntar(t){if(!lgPode(t))return;UI.lg={tid:t.id,fase:'pergunta'};UI.modal='lotes-geo';renderModal()}
function lgAbrir(t){if(!lgPode(t))return;UI.lg={tid:t.id,fase:'carregando'};UI.modal='lotes-geo';renderModal();lgCarregar()}

/* ---------- geometria (UTM 23S, metros) ---------- */
const lgBB=an=>{const xs=an.map(p=>p[0]),ys=an.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]};
function lgDistBorda(pt,an){let m=Infinity;for(let i=0;i<an.length-1;i++){const a=an[i],b=an[i+1],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,u=l?Math.max(0,Math.min(1,((pt[0]-a[0])*dx+(pt[1]-a[1])*dy)/l)):0;
  m=Math.min(m,Math.hypot(pt[0]-a[0]-u*dx,pt[1]-a[1]-u*dy))}return m}
/* lugar do rótulo: o ponto de uma grade dentro do lote mais longe das bordas (e quanto cabe ali) */
function lgRotulo(an){const [x0,y0,x1,y1]=lgBB(an);let best=null,r=-1;
  for(let i=1;i<14;i++)for(let j=1;j<14;j++){const pt=[x0+(x1-x0)*i/14,y0+(y1-y0)*j/14];if(!geoNoAnel(pt,an))continue;const d=lgDistBorda(pt,an);if(d>r){r=d;best=pt}}
  return best?{x:best[0],y:best[1],r}:{x:(x0+x1)/2,y:(y0+y1)/2,r:0}}
/* fração do lote dentro da poligonal do terreno, por uma grade de pontos */
function lgFracao(an,ter){const [x0,y0,x1,y1]=lgBB(an);let n=0,d=0;
  for(let i=0;i<16;i++)for(let j=0;j<16;j++){const pt=[x0+(x1-x0)*(i+.5)/16,y0+(y1-y0)*(j+.5)/16];if(!geoNoAnel(pt,an))continue;n++;if(geoNoAnel(pt,ter))d++}
  return n?d/n:0}

/* ---------- consulta ---------- */
async function lgCarregar(){const L=UI.lg,t=L&&T(L.tid);if(!t)return;
  try{const ter=t.poly.map(([la,ln])=>latLngUtm(la,ln));ter.push(ter[0]);const g={type:'Polygon',coordinates:[ter]};
    // 1. lotes que a poligonal toca: dão as quadras (a ponta que só encosta numa quadra vizinha não a traz)
    const toca=await geoWfs({typeNames:'geoportal:lote_cidadao',count:'500',propertyName:'cd_setor_fiscal,cd_quadra_fiscal,ge_poligono',CQL_FILTER:`INTERSECTS(ge_poligono,${geoWkt(g)})`});
    const pesoQ={};toca.forEach(f=>{const an=f.geometry&&geoAneis(f.geometry)[0];if(!an)return;const k=f.properties.cd_setor_fiscal+'.'+f.properties.cd_quadra_fiscal;
      pesoQ[k]=Math.max(pesoQ[k]||0,lgFracao(an,ter)*geoAreaAnel(an))});
    let qs=Object.entries(pesoQ).filter(([,v])=>v>=10).sort((a,b)=>b[1]-a[1]).map(([k])=>k);
    if(!qs.length)qs=Object.keys(pesoQ);
    if(!qs.length){Object.assign(L,{fase:'erro',erro:'A poligonal não ocupa nenhum lote do cadastro da prefeitura.'});return lgRedesenhar()}
    qs=qs.slice(0,8);
    // 2. todos os lotes dessas quadras e os nomes das ruas em volta
    const fs=await geoWfs({typeNames:'geoportal:lote_cidadao',count:'3000',CQL_FILTER:qs.map(k=>{const [s,q]=k.split('.');return `(cd_setor_fiscal='${s}' AND cd_quadra_fiscal='${q}')`}).join(' OR ')});
    const outro=sql=>S.terrenos.find(x=>x.id!==t.id&&x.insc.some(i=>insCid(i)==='sp'&&digits(i.sql)===digits(sql)));
    const lotes=fs.filter(f=>f.geometry&&f.properties.tx_situ_lote!=='INATIVO').map(f=>{const p=f.properties,an=geoAneis(f.geometry)[0],sql=p.nr_contribuinte||null;
      const condo=p.cd_condominio&&p.cd_condominio!=='00',via=p.tx_tipo_lote&&p.tx_tipo_lote!=='FISCAL',ou=sql&&outro(sql),ja=sql&&t.insc.find(i=>digits(i.sql)===digits(sql));
      const noLote=ja&&(t.lotes||[]).find(l=>l.ins.includes(ja.id));
      const trava=via?'Via de acesso: não tem SQL':condo?`Condomínio ${p.cd_condominio}: os SQLs das unidades não vêm no GeoSampa`:!sql?'Sem SQL no cadastro':ou?`Já está no ${ou.codigo}`:noLote?`Já está no ${noLote.titulo}`:null;
      const fr=lgFracao(an,ter);
      return {an,sql,p,condo,via,trava,fixo:!!noLote,fr,rot:lgRotulo(an),sel:!!ja||(!trava&&fr>=LG_MIN),area:p.qt_area_terreno??null,
        end:p.nm_logradouro_completo?geoTit(p.nm_logradouro_completo)+(p.cd_numero_porta&&p.cd_numero_porta!=='0'?', '+p.cd_numero_porta:''):''}});
    const bb=lgBB(lotes.flatMap(l=>l.an).concat(ter));
    let vias=[];try{vias=await geoWfs({typeNames:'geoportal:v_logradouro_segmento',count:'400',bbox:[bb[0]-25,bb[1]-25,bb[2]+25,bb[3]+25].join(',')+',urn:ogc:def:crs:EPSG::31983'})}catch(e){}
    Object.assign(L,{fase:'mapa',ter,lotes,quadras:qs,bb,vias:lgVias(vias,bb)});
  }catch(e){console.warn(e);Object.assign(L,{fase:'erro',erro:'O GeoSampa não respondeu. Tente de novo em instantes.'})}
  lgRedesenhar()}
/* um nome por rua, no trecho mais comprido que fica perto das quadras */
function lgVias(fs,bb){const porNome={};
  fs.forEach(f=>{const n=topoNomeVia(f.properties),Lh=f.geometry&&geoAneis(f.geometry)[0];if(!n||!Lh||Lh.length<2)return;
    for(let i=0;i<Lh.length-1;i++){const a=Lh[i],b=Lh[i+1],c=[(a[0]+b[0])/2,(a[1]+b[1])/2],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(c[0]<bb[0]-20||c[0]>bb[2]+20||c[1]<bb[1]-20||c[1]>bb[3]+20)continue;
      if(!porNome[n]||len>porNome[n].len){let ang=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;if(ang>90||ang<-90)ang+=180;porNome[n]={n,x:c[0],y:c[1],ang,len}}}});
  return Object.values(porNome)}

/* ---------- janela ---------- */
function lgHtml(fechar){const L=UI.lg,t=L&&T(L.tid);if(!t)return '';
  if(L.fase==='pergunta')return `<div class="dh"><h2>Inserir os lotes da prefeitura?</h2>${fechar}</div>
    <p style="margin:0 0 8px">O ${esc(t.codigo)} fica em São Paulo. Quer marcar <span class="lg-pc">no mapa de lotes do GeoSampa</span><span class="lg-cel">na lista de lotes do GeoSampa</span> os lotes que ele ocupa?</p>
    <p class="muted" style="margin:0">Os SQLs marcados entram no cadastro ainda sem matrícula e sem lote. Depois, ao montar os Lotes na aba Terreno, você escolhe cada um na lista do SQL. Dá para fazer depois pelo botão "Lotes da prefeitura" da seção Lotes.</p>
    <div class="df"><button class="btn text" data-a="close">Agora não</button><button class="btn primary" data-a="lg-sim">${ic('layers',18)}Sim, escolher os lotes</button></div>`;
  const cab=`<div class="dh"><div><h2>Lotes da prefeitura</h2><div class="faint">${esc(t.codigo)} · ${esc(t.nome)}${L.quadras?` · quadra${L.quadras.length>1?'s':''} ${L.quadras.map(k=>k.replace('.','-')).join(', ')}`:''}</div></div>${fechar}</div>`;
  if(L.fase==='carregando')return cab+`<div class="lg-msg">${ic('layers',20)}Buscando os lotes das quadras no GeoSampa...</div>`;
  if(L.fase==='erro')return cab+`<div class="banner warn">${ic('warn')}<div>${esc(L.erro)}</div></div><div class="df"><button class="btn text" data-a="close">Fechar</button><button class="btn" data-a="lg-sim">Tentar de novo</button></div>`;
  const sel=L.lotes.filter(l=>l.sel&&!l.trava),novos=sel.filter(l=>!t.insc.some(i=>digits(i.sql)===digits(l.sql)));
  const tira=lgSoltos(t).filter(i=>L.lotes.some(l=>!l.sel&&l.sql&&digits(l.sql)===digits(i.sql)));
  const area=sel.reduce((s,l)=>s+(l.area||0),0);
  return cab+`<div class="lg-corpo"><div class="lg-mapa" id="lg-mapa">${lgSvg(L)}
      <div class="lg-tip" id="lg-tip" hidden></div>
      <div class="lg-zoom"><button class="iconbtn sm" data-a="lg-zoom" data-z="1" aria-label="Aproximar">+</button><button class="iconbtn sm" data-a="lg-zoom" data-z="-1" aria-label="Afastar">−</button><button class="iconbtn sm" data-a="lg-zoom" data-z="0" aria-label="Enquadrar" title="Enquadrar">${ic('layers',16)}</button></div>
      <div class="lg-leg"><span><i class="lg-sw sel"></i>Marcado</span><span><i class="lg-sw"></i>Lote</span><span><i class="lg-sw x"></i>Não se marca</span><span><i class="lg-sw ter"></i>Poligonal</span></div></div>
    <div class="lg-lado"><div class="lg-tot"><b>${sel.length} lote${sel.length===1?'':'s'} marcado${sel.length===1?'':'s'}</b>${area?` <span class="muted">· ${m2(area)} de área cadastral</span>`:''}</div>
      <div class="hint" style="margin:4px 0 8px"><span class="lg-mouse">Clique no lote para marcar ou desmarcar. Pare o mouse em cima para ver o SQL. A roda aproxima e mostra os números dos lotes pequenos.</span><span class="lg-toque">Toque no lote para marcar ou desmarcar e ver o SQL. Afaste dois dedos para aproximar.</span></div>
      <div class="lg-lista">${sel.map(l=>`<div class="lg-it"><span class="num">${esc(l.sql)}</span><span class="faint">${esc(l.end||'')}${l.area?` · ${m2(l.area)}`:''}</span>${l.fixo?'<span class="chip">no lote</span>':t.insc.some(i=>digits(i.sql)===digits(l.sql))?'<span class="chip">já no cadastro</span>':''}</div>`).join('')||'<div class="muted">Nenhum lote marcado.</div>'}</div>${lgTodos(L,t)}</div></div>
    <div class="df"><button class="btn text" data-a="close">${L.cad?'Agora não':'Cancelar'}</button><button class="btn" data-a="lg-ajustar" ${sel.length?'':'disabled'} title="Inclui os SQLs e compara a poligonal desenhada com a soma dos lotes marcados">${ic('layers',18)}${L.cad?'Salvar e ajustar a poligonal':'Incluir e ajustar a poligonal'}</button><button class="btn primary" data-a="lg-incluir" ${novos.length||tira.length?'':'disabled'}>${L.cad&&novos.length?`Salvar ${novos.length} lote${novos.length>1?'s':''}`:novos.length?`Incluir ${novos.length} SQL${novos.length>1?'s':''}`:tira.length?'Salvar':'Incluir SQLs'}${tira.length?` ${novos.length?'e tirar':'tirando'} ${tira.length}`:''}</button></div>`}
/* celular: sem o mapa, a lista dos lotes das quadras para marcar (os que tocam a poligonal primeiro) */
function lgTodos(L,t){const it=(l,i)=>{const on=l.sel&&(!l.trava||l.fixo),bloq=!!l.trava;
    const marca=l.fixo?'<span class="chip">no lote</span>':!bloq&&t.insc.some(x=>digits(x.sql)===digits(l.sql))?'<span class="chip">já no cadastro</span>':'';
    return `<button type="button" class="lg-op${on?' on':''}" data-a="lg-marca" data-i="${i}" role="checkbox" aria-checked="${on}" ${bloq?'aria-disabled="true"':''}><span class="lg-cx">${on?ic('check',16):''}</span><span class="lg-op-t"><span class="num">${esc(l.sql)}</span><span class="faint lg-op-s">${l.trava&&!l.fixo?esc(l.trava):`${esc(l.end||'')}${l.area?` · ${m2(l.area)}`:''}${l.fr>0?` · ${Math.max(1,Math.round(l.fr*100))}% na poligonal`:''}`}</span></span>${marca}</button>`};
  const L2=L.lotes.map((l,i)=>[l,i]).filter(([l])=>l.sql),na=L2.filter(([l])=>l.fr>0).sort((a,b)=>b[0].fr-a[0].fr),fora=L2.filter(([l])=>!(l.fr>0)).sort((a,b)=>a[0].sql.localeCompare(b[0].sql));
  return `<div class="lg-todos"><div class="lg-todos-h">Na poligonal <span class="h-n">${na.length}</span></div>${na.map(([l,i])=>it(l,i)).join('')||'<div class="muted">Nenhum lote com SQL dentro da poligonal.</div>'}
    ${fora.length?`<details class="lg-fora"${fora.some(([l])=>l.sel)?' open':''}><summary>Outros lotes da quadra <span class="h-n">${fora.length}</span></summary>${fora.map(([l,i])=>it(l,i)).join('')}</details>`:''}</div>`}
const lgD=an=>'M'+an.slice(0,-1).map(p=>`${p[0].toFixed(2)},${(-p[1]).toFixed(2)}`).join('L')+'Z';
function lgSvg(L){const [x0,y0,x1,y1]=L.bb,m=12,vb=L.vb||[x0-m,-y1-m,x1-x0+2*m,y1-y0+2*m];L.vb=vb;L.vb0=L.vb0||vb.slice();
  return `<svg class="lg-svg" id="lg-svg" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de lotes das quadras">
    <rect x="${x0-2000}" y="${-y1-2000}" width="${x1-x0+4000}" height="${y1-y0+4000}" class="lg-fundo"/>
    <g>${L.lotes.map((l,i)=>`<path d="${lgD(l.an)}" data-lg="${i}" class="lg-l${l.sel&&!l.trava?' sel':''}${l.trava&&!l.fixo?' x':''}${l.fixo?' sel fixo':''}"/>`).join('')}</g>
    <path d="${lgD(L.ter)}" class="lg-ter"/>
    <g class="lg-vias">${L.vias.map(v=>`<text data-x="${v.x.toFixed(1)}" data-y="${(-v.y).toFixed(1)}" data-g="${(-v.ang).toFixed(1)}">${esc(v.n)}</text>`).join('')}</g>
    <g class="lg-rots">${L.lotes.map((l,i)=>{const f=l.via?'':l.condo?`CD ${l.p.cd_condominio}`:`F ${l.p.cd_lote}`,n=l.p.cd_numero_porta&&l.p.cd_numero_porta!=='0'&&!l.via?`N. ${l.p.cd_numero_porta}`:'';if(!f)return '';
      return `<text data-r="${l.rot.r.toFixed(2)}" data-x="${l.rot.x.toFixed(2)}" data-y="${(-l.rot.y).toFixed(2)}"><tspan x="0" dy="-0.2em">${f}</tspan>${n?`<tspan x="0" dy="1.15em">${esc(n)}</tspan>`:''}</text>`}).join('')}</g></svg>`}
/* rótulos com tamanho fixo na tela; some o que não cabe no lote na escala atual. O texto fica em 10px e o grupo
   encolhe por escala: com a fonte em fração de pixel (zoom grande, menos de 1 m por pixel) o Chrome deixava de
   desenhar F, N e o nome das ruas. */
function lgEscala(){const L=UI.lg,svg=$('#lg-svg');if(!L||!svg)return;const w=svg.clientWidth||600,h=svg.clientHeight||400,u=Math.max(L.vb[2]/w,L.vb[3]/h);
  svg.querySelectorAll('.lg-vias text').forEach(x=>x.setAttribute('transform',`translate(${x.dataset.x} ${x.dataset.y}) rotate(${x.dataset.g}) scale(${u})`));
  svg.style.setProperty('--lg-w',u);
  svg.querySelectorAll('.lg-rots text').forEach(x=>{const ve=+x.dataset.r/u>=10;x.style.display=ve?'':'none';
    if(ve)x.setAttribute('transform',`translate(${x.dataset.x} ${x.dataset.y}) scale(${u})`)})}
function lgRedesenhar(){if(UI.modal==='lotes-geo')renderModal()}
function lgVb(vb){const L=UI.lg,svg=$('#lg-svg');if(!L||!svg)return;L.vb=vb;svg.setAttribute('viewBox',vb.join(' '));lgEscala()}
function lgZoom(f,cx,cy){const L=UI.lg;if(!L)return;const [x,y,w,h]=L.vb,nw=Math.max(20,Math.min(L.vb0[2]*3,w/f)),k=nw/w,nh=h*k;
  cx=cx??x+w/2;cy=cy??y+h/2;lgVb([cx-(cx-x)*k,cy-(cy-y)*k,nw,nh])}
/* do ponto da tela para o do mapa (viewBox com meet) */
function lgPt(svg,ev){const r=svg.getBoundingClientRect(),[x,y,w,h]=UI.lg.vb,u=Math.max(w/r.width,h/r.height),ox=(r.width*u-w)/2,oy=(r.height*u-h)/2;
  return [x-ox+(ev.clientX-r.left)*u,y-oy+(ev.clientY-r.top)*u,u]}
function lgDica(l){return `<b class="num">${l.sql?'SQL '+esc(l.sql):l.via?'Via de acesso':l.condo?'Condomínio '+esc(l.p.cd_condominio):'Sem SQL'}</b>${l.end?`<div>${esc(l.end)}</div>`:''}${l.area?`<div>${m2(l.area)} de terreno</div>`:''}
  ${l.trava?`<div class="lg-tip-x">${esc(l.trava)}</div>`:`<div class="faint">${Math.round(l.fr*100)}% dentro da poligonal · ${l.sel?'marcado':'clique para marcar'}</div>`}`}
function lgLigar(){const svg=$('#lg-svg'),box=$('#lg-mapa'),tip=$('#lg-tip');if(!svg)return;lgEscala();
  let arr=null,moveu=false;const toques=new Map();let pinca=null;
  svg.addEventListener('wheel',e=>{e.preventDefault();const [x,y]=lgPt(svg,e);lgZoom(e.deltaY<0?1.25:0.8,x,y)},{passive:false});
  svg.addEventListener('pointerdown',e=>{toques.set(e.pointerId,[e.clientX,e.clientY]);if(toques.size===2){const [a,b]=[...toques.values()];pinca={d:Math.hypot(a[0]-b[0],a[1]-b[1]),vb:UI.lg.vb.slice()};arr=null;return}
    arr={x:e.clientX,y:e.clientY,vb:UI.lg.vb.slice()};moveu=false;svg.setPointerCapture?.(e.pointerId)});
  svg.addEventListener('pointermove',e=>{if(toques.has(e.pointerId))toques.set(e.pointerId,[e.clientX,e.clientY]);
    if(pinca&&toques.size===2){const [a,b]=[...toques.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(d>0){UI.lg.vb=pinca.vb.slice();lgZoom(d/pinca.d)}moveu=true;return}
    if(arr){const dx=e.clientX-arr.x,dy=e.clientY-arr.y;if(Math.hypot(dx,dy)>4)moveu=true;if(moveu){const r=svg.getBoundingClientRect(),u=Math.max(arr.vb[2]/r.width,arr.vb[3]/r.height);lgVb([arr.vb[0]-dx*u,arr.vb[1]-dy*u,arr.vb[2],arr.vb[3]]);tip.hidden=true;return}}
    if(e.pointerType!=='mouse')return;const el=e.target.closest('[data-lg]');if(!el){tip.hidden=true;return}
    const l=UI.lg.lotes[+el.dataset.lg],r=box.getBoundingClientRect();tip.innerHTML=lgDica(l);tip.hidden=false;
    const tx=Math.min(e.clientX-r.left+14,r.width-tip.offsetWidth-6),ty=e.clientY-r.top+16+tip.offsetHeight>r.height?e.clientY-r.top-tip.offsetHeight-10:e.clientY-r.top+16;tip.style.left=Math.max(6,tx)+'px';tip.style.top=Math.max(6,ty)+'px'});
  const fim=e=>{toques.delete(e.pointerId);if(toques.size<2)pinca=null;if(!arr)return;const a=arr;arr=null;if(moveu||e.type==='pointercancel')return;
    const el=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-lg]');if(!el)return;const l=UI.lg.lotes[+el.dataset.lg];
    if(l.trava){if(e.pointerType!=='mouse'){const r=box.getBoundingClientRect();tip.innerHTML=lgDica(l);tip.hidden=false;tip.style.left='8px';tip.style.top='8px'}else toast(l.trava,true);return}
    l.sel=!l.sel;renderModal();
    if(e.pointerType!=='mouse'){const t2=$('#lg-tip');t2.innerHTML=lgDica(l);t2.hidden=false;t2.style.left='8px';t2.style.top='8px'}};
  svg.addEventListener('pointerup',fim);svg.addEventListener('pointercancel',fim);
  svg.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!arr)tip.hidden=true})}

/* grava: os marcados entram soltos; os soltos desmarcados saem (os que já estão num lote ficam) */
function lgIncluir(ajustar){const L=UI.lg,t=L&&T(L.tid);if(!t)return;const novos=[],tirados=[];
  L.lotes.forEach(l=>{if(!l.sql||l.trava&&!l.fixo)return;const ja=t.insc.find(i=>digits(i.sql)===digits(l.sql));
    if(l.sel&&!ja){const i={id:uid(),mun:'sp',sql:l.sql,area:l.area,valores:[],solto:true,origem:'mapa_prefeitura',endPref:l.end||''};if(l.p.cd_cib)i.cib=l.p.cd_cib;t.insc.push(i);novos.push(l.sql);
      // logo depois do cadastro, cada lote marcado já vira um Lote do terreno, com o SQL e sem matrícula (pedido do Moisés, 4/nov/2026)
      if(L.cad){delete i.solto;const pa=partesDe(t)[0];(t.lotes=t.lotes||[]).push(ltNovo(t,pa?.id||null,{ins:[i.id],fonte:'cadastral'}))}}
    if(!l.sel&&ja&&ja.solto&&!(t.lotes||[]).some(x=>x.ins.includes(ja.id))&&!ja.valores.length){t.insc.splice(t.insc.indexOf(ja),1);tirados.push(l.sql)}});
  if(novos.length)log(t,L.cad?`${novos.length} lote${novos.length>1?'s':''} pelo mapa de lotes da prefeitura (GeoSampa), cada um com o SQL: ${novos.join(', ')}`:`${novos.length} SQL${novos.length>1?'s':''} do mapa de lotes da prefeitura (GeoSampa), ainda sem lote: ${novos.join(', ')}`);
  if(tirados.length)log(t,`SQL${tirados.length>1?'s':''} tirado${tirados.length>1?'s':''} do cadastro pelo mapa de lotes: ${tirados.join(', ')}`);
  const marc=L.lotes.filter(l=>l.sel&&(!l.trava||l.fixo));
  UI.modal=null;renderModal();lotesNorm(t);save();render();
  const consultar=marc.map(l=>t.insc.find(i=>digits(i.sql)===digits(l.sql))).filter(i=>i&&!(i.geo||[]).length);
  if(ajustar)lgAjustar(t,marc,novos.length);
  else toast(L.cad?(novos.length?`${novos.length} lote${novos.length>1?'s':''} cadastrado${novos.length>1?'s':''} com o SQL. Consultando o GeoSampa em cada um...`:'Terreno cadastrado sem lotes.'):novos.length?`${novos.length} SQL${novos.length>1?'s':''} no cadastro. Consultando o GeoSampa em cada um...`:'Cadastro atualizado.');
  lgConsultar(t,consultar)}

/* Tudo o que depende do GeoSampa já sai na inclusão (pedido do Moisés, 4/nov/2026): a consulta completa de cada SQL
   marcado (lote, zonas com a área no lote e parâmetros, camadas que tocam o lote, análise, planta e desenho), um de cada
   vez, e depois a consulta pela poligonal (Restrições e entorno). Com "Incluir e ajustar", a da poligonal espera a
   decisão sobre a poligonal nova. */
let LG_CONS=null;
const lgEspera=ms=>new Promise(r=>setTimeout(r,ms));
async function lgConsultar(t,ins){if(!GEO_BASE||LG_CONS||!ins.length)return;LG_CONS={tid:t.id,feitos:0,total:ins.length};render();let falhas=0;
  try{for(const i of ins){while(LOTE_BUSCANDO)await lgEspera(200);const k=t.insc.indexOf(i);if(k<0){LG_CONS.feitos++;continue}
      await loteBuscar(t,k);if(!(i.geo||[]).length){await lgEspera(1500);await loteBuscar(t,k)}if(!(i.geo||[]).length)falhas++;LG_CONS.feitos++;render()}
    while(UI.modal==='lotes-poly')await lgEspera(300);
    while(REST_BUSCANDO)await lgEspera(200);
    if(t.poly)await restConsultar(t)}
  finally{LG_CONS=null;render()}
  await lgEspera(1200);
  toast(falhas?`GeoSampa consultado; ${falhas} SQL${falhas>1?'s':''} não respondeu. Use "Buscar no GeoSampa" no SQL.`:`GeoSampa consultado nos ${ins.length} SQL${ins.length>1?'s':''} e pela poligonal: parâmetros e restrições preenchidos.`,!!falhas)}

/* "Incluir e ajustar a poligonal": a soma dos lotes marcados vai para a mesma comparação de "Usar a poligonal dos lotes"
   (desenhada × lotes, diferença de área, terrenos que a área nova ocuparia); a desenhada fica guardada */
function lgAjustar(t,marc,nNovos){const polys=marc.map(l=>l.an.slice(0,-1).map(p=>utmLatLng(p[0],p[1]).map(v=>+v.toFixed(7))));const u=lotesUniao(polys);
  UI.lotes={tid:t.id,poly:u,n:polys.length,total:polys.length,falhas:[],separados:polys.length>1&&!u,sobre:u?sobreposicoes(u,t.id):[],mapa:true};UI.modal='lotes-poly';renderModal();
  if(nNovos)toast(`${nNovos} SQL${nNovos>1?'s':''} no cadastro. Confira a poligonal pelos lotes marcados.`)}

/* seção Lotes: os SQLs soltos */
function lgSoltosHtml(t,ro){const S0=lgSoltos(t);if(!S0.length)return '';
  const cs=LG_CONS&&LG_CONS.tid===t.id?`<span class="chip blue lg-cons">Consultando o GeoSampa: ${LG_CONS.feitos} de ${LG_CONS.total}</span>`:'';
  return `<div class="lg-soltos" id="lg-soltos"><div class="lg-soltos-h"><b>SQLs sem lote</b> <span class="h-n">${S0.length}</span><span class="faint">do mapa de lotes da prefeitura</span>${cs}</div>
    <div class="hint" style="margin:2px 0 6px">Escolha cada um na lista "SQL pré-cadastrado" do lote certo.</div>
    ${S0.map(i=>`<div class="lg-it"><span class="num">${esc(i.sql)}</span><span class="faint">${esc(i.endPref||'')}${i.area!=null?` · ${m2(i.area)}`:''}</span>${ro?'':`<button class="iconbtn sm lixo" data-a="lg-tira" data-i="${i.id}" aria-label="Tirar o SQL ${esc(i.sql)} do cadastro" title="Tirar do cadastro">${ic('lixo',18)}</button>`}</div>`).join('')}</div>`}

document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="lg-"]');if(!a)return;const A=a.dataset.a;
  if(A==='lg-sim'){UI.lg.fase='carregando';UI.lg.vb=null;UI.lg.vb0=null;lgRedesenhar();lgCarregar()}
  if(A==='lg-abrir'){const t=T(UI.id);if(t)lgAbrir(t)}
  if(A==='lg-marca'){const l=UI.lg&&UI.lg.lotes[+a.dataset.i];if(!l)return;if(l.trava){toast(l.trava,true);return}
    const y=a.closest('.dialog')?.scrollTop;const ab=!!a.closest('details[open]');l.sel=!l.sel;renderModal();const d=$('.dialog:has(.lg-corpo)');if(d&&y!=null)d.scrollTop=y;if(ab){const f=$('.lg-fora');if(f)f.open=true}}
  if(A==='lg-incluir')lgIncluir();
  if(A==='lg-ajustar')lgIncluir(true);
  if(A==='lg-zoom'){const z=+a.dataset.z;if(z)lgZoom(z>0?1.5:1/1.5);else lgVb(UI.lg.vb0.slice())}
  if(A==='lg-tira'){const t=T(UI.id),i=t&&t.insc.find(x=>x.id===a.dataset.i);if(!i)return;t.insc.splice(t.insc.indexOf(i),1);log(t,`SQL ${i.sql} tirado do cadastro (estava sem lote)`);save();render();toast(`SQL ${i.sql} tirado do cadastro.`)}});
