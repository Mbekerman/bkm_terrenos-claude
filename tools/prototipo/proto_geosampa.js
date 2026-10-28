// ---------------------------------------------------------------------
// GeoSampa (Novo GeoSampa, Prefeitura de São Paulo) pelo SQL.
// Busca o lote fiscal e tudo o que toca a poligonal, grava a consulta na
// inscrição (sem apagar as anteriores), completa só campos vazios, registra a
// análise urbanística (fonte GeoSampa) e gera a planta (PDF, feita pelo
// servidor) e o desenho (DXF, montado aqui), que entram como documentos com
// versão. O servidor só aceita chamada de navegador vinda do próprio
// GeoSampa: no Railway passa pelo Caddy em /geosampa.
// No banco: app.registrar_consulta_lote + app.registrar_documento.
// ---------------------------------------------------------------------
const GEO_BASE=(()=>{const m=document.querySelector('meta[name="geosampa-url"]');if(m&&m.content)return m.content;
  return /^https?:$/.test(location.protocol)&&!/claude\.ai|claudeusercontent|localhost:5173/.test(location.host)?location.origin+'/geosampa/geoserver/geoportal/':null})();
// [camada, tema, geometria, como mostrar a feição, gravidade (''|warn|crit), filtro: 'toca' ou distância em metros]
const GEO_CAMADAS=[
  ['perimetro_zona_lei_18081_24','Zona (LPUOS)','ge_multipoligono',p=>p.cd_zoneamento_perimetro,''],
  ['perimetro_zona_lei_18177_24','Zona (Lei 18.177/2024)','ge_poligono',p=>p.cd_zoneamento_perimetro,''],
  ['pde2014_v_zeis_04_map_v2','ZEIS 1','ge_poligono',p=>p.cd_zoneamento_perimetro||'ZEIS-1','warn'],
  ['pde2014_v_zeis_04a_map_v2','ZEIS 2 a 5','ge_poligono',p=>p.cd_zoneamento_perimetro,'warn'],
  ['pde2014_v_eetr_03_map_v2','Eixo de estruturação','ge_poligono',p=>p.nm_perimetro_divisao_pde||'Eixo',''],
  ['pde2014_v_eixo_prv_03a_map_v2','Eixo previsto','ge_poligono',p=>p.nm_perimetro_divisao_pde||'Eixo previsto',''],
  ['eixo_ativado_decreto','Eixo ativado por decreto','ge_poligono',p=>[p.nm_eixo_ativado_decreto,p.tx_decreto].filter(Boolean).join(' · '),''],
  ['pde_macroarea_lei_18209','Macroárea','ge_poligono',p=>`${p.sg_macroarea} · ${p.nm_macroarea}`,''],
  ['pde_fator_planejamento_residencial','Fator de planejamento residencial','ge_poligono',p=>p.tx_fator_planejamento_residencial,''],
  ['operacao_urbana','Operação urbana','ge_poligono',p=>p.nm_operacao_urbana,'warn'],
  ['subsetor_operacao_urbana','Setor da operação urbana','ge_poligono',p=>[p.nm_setor_operacao_urbana,p.nm_subsetor_operacao_urbana].filter(Boolean).join(' · '),''],
  ['manancial_guarapiranga','Manancial Guarapiranga','ge_poligono',p=>p.dc_classe||'Guarapiranga','crit'],
  ['manancial_billings','Manancial Billings','ge_poligono',p=>p.dc_classe||'Billings','crit'],
  ['manancial_juquery','Manancial Alto Juquery','ge_poligono',p=>p.dc_classe||'Alto Juquery','crit'],
  ['patrimonio_cultural_bem_tombado','Bem tombado','ge_poligono',p=>p.nm_area_tombada,'crit'],
  ['patrimonio_cultural_area_envoltoria_CONPRESP','Área envoltória Conpresp','ge_poligono',p=>`${p.nm_area} (${p.tx_resolucao_conpresp})`,'warn'],
  ['patrimonio_cultural_area_envoltoria_CONDEPHAAT','Área envoltória Condephaat','ge_poligono',p=>`${p.nm_area} (${p.tx_resolucao_condephaat})`,'warn'],
  ['patrimonio_cultural_area_envoltoria_IPHAN','Área envoltória Iphan','ge_poligono',p=>`${p.nm_area} (${p.tx_resolucao_iphan})`,'warn'],
  ['zona_especial_preservacao_cultural_apc','ZEPEC-APC','ge_poligono',p=>p.nm_area||p.tx_nome||'ZEPEC-APC','warn'],
  ['patrimonio_cultural_area_arqueologica','Interesse arqueológico','ge_poligono',p=>p.nm_area||p.nm_area_arqueologica||'Área de interesse arqueológico','warn'],
  ['area_contaminada_reabilitada_svma','Área contaminada ou reabilitada','ge_multipoligono',p=>[p.dc_classificacao_area_contaminada,p.tx_contaminante].filter(Boolean).join(' · '),'crit'],
  ['GEOSAMPA_area_contaminada_sigac','Suspeita de contaminação','ge_poligono',p=>[p.dc_tipo_situacao,p.dc_atividade].filter(Boolean).join(' · '),'crit'],
  ['geoconvias_lei_melhoramento_vigente','Melhoramento viário','ge_poligono',p=>`Lei ${p.cd_numero_lei_vigente}/${p.an_lei_melhoramento_vigente} · ${p.tx_descricao_tipo_melhoramento||''}`,'warn'],
  ['geoconvias_faixa_nao_edificavel','Faixa não edificável','ge_poligono',p=>`${num(p.qt_metro_largura_faixa,2)} m · Lei ${p.cd_numero_lei_vigente}`,'warn'],
  ['drenagem','Córrego a até 50 m','ge_linha',p=>[p.nm_acidente||p.nm_descritivo,p.nm_tipo_trecho].filter(Boolean).join(' · '),'warn',50],
  ['area_risco_geologico_v2','Risco geológico','ge_poligono',p=>[p.tx_grau_de_risco_geologico,p.tx_tipo_processo_geologico].filter(Boolean).join(' · '),'crit'],
  ['restricao_geotecnica','Restrição geotécnica','ge_poligono',p=>p.nm_perimetro,'warn'],
  ['mancha_inundacao_100','Mancha de inundação (100 anos)','ge_poligono',p=>p.nm_bacia_hidrografica,'warn'],
  ['area_influencia_metro','Influência do Metrô','ge_poligono',()=>'Consultar o Metrô antes de projetar','warn'],
  ['area_influencia_trem','Influência da CPTM','ge_poligono',()=>'Consultar a CPTM antes de projetar','warn'],
  ['GEOSAMPA_cgpabi_vegetacao_significativa','Vegetação significativa','ge_multipoligono',p=>[p.tx_tema||'Vegetação significativa',p.an_vegetacao_significativa].filter(Boolean).join(' · '),'warn'],
  ['zona_fiscal','Zona fiscal','ge_poligono',p=>p.sg_zona_fiscal,''],
];
// Camadas do desenho (DXF) e da planta (PDF): [camada, layer no DXF, cor ACI, campo da cota]
const GEO_DESENHO=[['quadra_viaria_editada','QUADRA_VIARIA',8],['calcada','CALCADA',9],['lote_cidadao','LOTES',1],['edificacao_v3','EDIFICACOES',5],
  ['curva_mestra_v2','CURVA_MESTRA',30,'cd_numero_isovalor'],['curva_intermediaria_v2','CURVA_INTERMEDIARIA',40,'cd_numero_isovalor'],['ponto_cotado_v2','PONTO_COTADO',6,'cd_altitude'],['drenagem','CORREGOS',4]];
const GEO_ARQ={};   // arquivos gerados nesta sessão, por terreno: {pdf:Blob, dxf:Blob}

// --- coordenadas: UTM SIRGAS 2000 (padrão fuso 23S, EPSG:31983) -> latitude/longitude
function utmLatLng(E,N,l0=-45){const a=6378137,f=1/298.257222101,k0=.9996,e2=f*(2-f),ep2=e2/(1-e2),x=E-5e5,y=N-1e7,M=y/k0,
  mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2**3/256)),e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2)),
  p1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1*e1/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu)+(1097*e1**4/512)*Math.sin(8*mu),
  s=Math.sin(p1),c=Math.cos(p1),t=Math.tan(p1),C1=ep2*c*c,T1=t*t,N1=a/Math.sqrt(1-e2*s*s),R1=a*(1-e2)/(1-e2*s*s)**1.5,D=x/(N1*k0),
  lat=p1-(N1*t/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720),
  lng=(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/c;
  return [lat*180/Math.PI,l0+lng*180/Math.PI]}
const geoAneis=g=>!g?[]:g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
const geoAreaAnel=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1]},0))/2;
function geoNoAnel(pt,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];
  if((yi>pt[1])!==(yj>pt[1])&&pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi)c=!c}return c}
const geoDentro=(pt,g)=>(g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[]).some(poly=>geoNoAnel(pt,poly[0])&&!poly.slice(1).some(h=>geoNoAnel(pt,h)));
// Área de cada zona dentro do lote, por amostragem em grade (~2.500 pontos): erro abaixo de 1%.
function geoAreaZonas(lote,feicoes,cod){const r=geoAneis(lote)[0],xs=r.map(p=>p[0]),ys=r.map(p=>p[1]),x0=Math.min(...xs),y0=Math.min(...ys),
  passo=Math.max(.2,Math.sqrt((Math.max(...xs)-x0)*(Math.max(...ys)-y0)/2500)),area=geoAreaAnel(r),cont={};let n=0;
  for(let x=x0+passo/2;x<Math.max(...xs);x+=passo)for(let y=y0+passo/2;y<Math.max(...ys);y+=passo){const pt=[x,y];if(!geoDentro(pt,lote))continue;n++;
    const f=feicoes.find(f=>geoDentro(pt,f.geometry));if(f){const k=cod(f.properties);cont[k]=(cont[k]||0)+1}}
  return Object.entries(cont).map(([sigla,c])=>({sigla,area_m2:Math.round(area*c/n*100)/100})).sort((a,b)=>b.area_m2-a.area_m2)}

async function geoWfs(params){const u=new URL(GEO_BASE+'ows');Object.entries({service:'WFS',version:'2.0.0',request:'GetFeature',outputFormat:'application/json',srsName:'EPSG:31983',...params}).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u);if(!r.ok)throw new Error('GeoSampa respondeu '+r.status);const j=await r.json();if(!j||!Array.isArray(j.features))throw new Error('Resposta inesperada do GeoSampa');return j.features}
const geoWkt=g=>'POLYGON('+geoAneis(g).map(r=>'('+r.map(p=>p[0]+' '+p[1]).join(',')+')').join(',')+')';

async function geoBuscar(t,ins){const d=digits(ins.sql);
  const lotes=await geoWfs({typeNames:'geoportal:lote_cidadao',CQL_FILTER:`cd_setor_fiscal='${d.slice(0,3)}' AND cd_quadra_fiscal='${d.slice(3,6)}' AND cd_lote='${d.slice(6,10)}'`});
  const lote=lotes.find(f=>String(f.properties.cd_digito_sql)===d[10]&&f.properties.tx_situ_lote!=='INATIVO')||null;
  if(!lote){toast(lotes.length?`O dígito do SQL não confere (no GeoSampa é ${lotes[0].properties.cd_digito_sql}).`:'SQL não encontrado no GeoSampa.',true);return}
  const wkt=geoWkt(lote.geometry),camadas={},erros=[];
  await Promise.all(GEO_CAMADAS.map(async([k,,geom,,,dist])=>{try{camadas[k]=await geoWfs({typeNames:'geoportal:'+k,count:'50',CQL_FILTER:dist?`DWITHIN(${geom},${wkt},${dist},meters)`:`INTERSECTS(${geom},${wkt})`})}catch(e){erros.push(k)}}));
  const zf=camadas.perimetro_zona_lei_18081_24||[],zonas=zf.length?geoAreaZonas(lote.geometry,zf,p=>p.cd_zoneamento_perimetro):[];
  const anel=geoAneis(lote.geometry)[0],areaPol=Math.round(geoAreaAnel(anel)*100)/100,poly=anel.slice(0,-1).map(p=>utmLatLng(p[0],p[1]).map(v=>+v.toFixed(7)));
  const props=c=>(camadas[c]||[]).map(f=>f.properties),p=lote.properties;
  if(p.cd_cib)ins.cib=p.cd_cib;const zfis=props('zona_fiscal')[0];if(zfis)ins.zf=zfis.sg_zona_fiscal;
  loteRegistrar(t,ins,{lote:p,poly,areaPol,zonas,erros,camadas:Object.fromEntries(Object.keys(camadas).map(k=>[k,props(k)])),area:p.qt_area_terreno,aConst:p.qt_area_construida});
  geoArquivos(t,ins,lote.geometry)}

// Planta (PDF do servidor) e desenho (DXF montado aqui), com 40 m de folga em volta do lote.
async function geoArquivos(t,ins,geom){const r=geoAneis(geom)[0],m=40,xs=r.map(p=>p[0]),ys=r.map(p=>p[1]);
  const bb=[Math.min(...xs)-m,Math.min(...ys)-m,Math.max(...xs)+m,Math.max(...ys)+m],arq=GEO_ARQ[t.id]=GEO_ARQ[t.id]||{};const nomeBase='lote_'+digits(ins.sql);
  try{const w=1600,h=Math.round(w*(bb[3]-bb[1])/(bb[2]-bb[0])),u=new URL(GEO_BASE+'wms');
    Object.entries({service:'WMS',version:'1.1.1',request:'GetMap',layers:GEO_DESENHO.map(c=>'geoportal:'+c[0]).join(','),styles:'',srs:'EPSG:31983',bbox:bb.join(','),width:w,height:h,format:'application/pdf'}).forEach(([k,v])=>u.searchParams.set(k,v));
    const rp=await fetch(u);if(!rp.ok)throw 0;arq.pdf=await rp.blob();loteDoc(t,ins,'lote_pdf',nomeBase+'.pdf')}catch(e){toast('A planta em PDF não saiu agora; o desenho segue.',true)}
  try{const feic=await Promise.all(GEO_DESENHO.map(([k])=>geoWfs({typeNames:'geoportal:'+k,bbox:bb.join(',')+',EPSG:31983'}).catch(()=>[])));
    arq.dxf=new Blob([geoDxf(GEO_DESENHO,feic,bb,`GeoSampa - SQL ${ins.sql}`,(k,p)=>k==='lote_cidadao'?p.nr_contribuinte:null)],{type:'application/dxf'});loteDoc(t,ins,'lote_dxf',nomeBase+'.dxf')}catch(e){console.error(e);toast('O desenho em DXF não saiu agora.',true)}
  save();render();toast('Planta e desenho do lote guardados nos documentos.')}

// DXF R12 (AutoCAD abre e salva como DWG). Coordenadas UTM 23S SIRGAS 2000 em metros; curvas com a cota como elevação.
// desenho: [chave, layer, cor ACI, campo da cota]; feic: feições de cada chave; rotulo(chave, atributos): texto no centro da feição.
function geoDxf(desenho,feic,bb,titulo,rotulo){const L=[],out=(...a)=>{for(let i=0;i<a.length;i+=2)L.push(a[i],a[i+1])};const asc=s=>String(s??'').normalize('NFD').replace(/[^\x20-\x7e]/g,'');
  out(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1009',9,'$EXTMIN',10,bb[0],20,bb[1],9,'$EXTMAX',10,bb[2],20,bb[3],0,'ENDSEC');
  out(0,'SECTION',2,'TABLES',0,'TABLE',2,'LTYPE',70,1,0,'LTYPE',2,'CONTINUOUS',70,0,3,'Solid line',72,65,73,0,40,0,0,'ENDTAB',0,'TABLE',2,'LAYER',70,desenho.length+1);
  [...desenho.map(c=>[c[1],c[2]]),['TEXTOS',7]].forEach(([n,c])=>out(0,'LAYER',2,n,70,0,62,c,6,'CONTINUOUS'));out(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
  const f2=v=>Number(v).toFixed(3);
  desenho.forEach(([k,lay,,zc],i)=>(feic[i]||[]).forEach(f=>{const g=f.geometry;if(!g)return;const z=zc&&f.properties[zc]!=null?Number(f.properties[zc]):0;
    if(g.type==='Point'){const [x,y]=g.coordinates;out(0,'POINT',8,lay,10,f2(x),20,f2(y),30,f2(z));if(zc)out(0,'TEXT',8,lay,10,f2(x+.4),20,f2(y+.4),30,f2(z),40,'0.8',1,num(z,2));return}
    geoAneis(g).forEach(r=>{const fechado=g.type.includes('Polygon');const pts=fechado&&r.length>1?r.slice(0,-1):r;
      out(0,'POLYLINE',8,lay,66,1,10,'0',20,'0',30,f2(z),70,fechado?1:0);pts.forEach(p=>out(0,'VERTEX',8,lay,10,f2(p[0]),20,f2(p[1]),30,f2(z)));out(0,'SEQEND',8,lay)});
    const txt=rotulo&&rotulo(k,f.properties);if(txt&&/Polygon/.test(g.type)){const r=geoAneis(g)[0],cx=r.reduce((s,p)=>s+p[0],0)/r.length,cy=r.reduce((s,p)=>s+p[1],0)/r.length;out(0,'TEXT',8,'TEXTOS',10,f2(cx),20,f2(cy),30,'0',40,'1.2',1,asc(txt))}}));
  out(0,'TEXT',8,'TEXTOS',10,f2(bb[0]+2),20,f2(bb[1]+2),30,'0',40,'1.5',1,asc(`${titulo} - ${new Date().toLocaleDateString('pt-BR')} - UTM 23S SIRGAS 2000`));
  out(0,'ENDSEC',0,'EOF');return L.join('\r\n')+'\r\n'}
function geoBaixar(t,k){const a=GEO_ARQ[t.id]?.[k];if(!a){toast('Arquivo gerado em outra sessão: busque de novo para baixar.',true);return}
  const d=t.docs.find(x=>x.tipo==='lote_'+k),url=URL.createObjectURL(a),el=document.createElement('a');el.href=url;el.download=d?.nome||'lote.'+k;document.body.appendChild(el);el.click();el.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}

// O que toca o lote, camada a camada (também na seção de parâmetros urbanísticos)
const geoLinhas=g=>GEO_CAMADAS.filter(c=>!/^zona_fiscal$|^perimetro_zona/.test(c[0])).map(([k,tema,,fmt,grav])=>{const fs=g.camadas[k],erro=g.erros.includes(k);
  const vals=fs?[...new Set(fs.map(x=>{try{return fmt(x)}catch(e){return null}}).filter(Boolean))]:[];
  return {tema,grav,erro,vals}});
// Quadro na inscrição: última consulta e o que toca o lote.
function geoQuadro(t,ins,i){const g=(ins.geo||[])[0];
  if(!g)return loteVazio(t,ins,i,'Lote, zoneamento, restrições, planta e DXF.');
  const p=g.lote,end=[p.nm_logradouro_completo,p.cd_numero_porta].filter(Boolean).join(', ');
  const lin=(k,v)=>`<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`;
  const linhas=geoLinhas(g);
  const zonasTxt=g.zonas.map(z=>`${esc(z.sigla)} <span class="faint">${m2(z.area_m2)}</span>`).join(' + ');
  const siglas=k=>[...new Set((g.camadas[k]||[]).map(x=>x.cd_zoneamento_perimetro))].sort().join(' + ');
  const dif=siglas('perimetro_zona_lei_18081_24')&&siglas('perimetro_zona_lei_18177_24')&&siglas('perimetro_zona_lei_18081_24')!==siglas('perimetro_zona_lei_18177_24');
  return `<div class="geo" id="geo-${i}">${loteCab(t,ins,i)}
    <div class="geo-kv">${lin('Área do terreno (cadastro)',m2(p.qt_area_terreno))}${lin('Área da poligonal',m2(g.areaPol)+(p.qt_area_terreno&&Math.abs(g.areaPol/p.qt_area_terreno-1)>.05?` <span class="chip warn">${g.areaPol>p.qt_area_terreno?'+':''}${num((g.areaPol/p.qt_area_terreno-1)*100,0)}% sobre o cadastro</span>`:''))}${lin('Área construída',m2(p.qt_area_construida))}${lin('Uso',esc(p.dc_tipo_uso_imovel||'—'))}
    ${lin('Endereço fiscal',esc(end||'—')+(end&&t.logradouro&&!end.toLowerCase().includes(t.logradouro.toLowerCase().split(' ').pop())?' <span class="chip warn">difere do cadastro</span>':''))}
    ${lin('Condomínio',p.cd_condominio&&p.cd_condominio!=='00'?`<span class="chip warn">Sim (${esc(p.cd_condominio)})</span>`:'Não')}${lin('CIB',esc(p.cd_cib||'—'))}${lin('Zona fiscal',esc(ins.zf||'—'))}
    ${lin('Zona no lote',zonasTxt||'—')}</div>
    ${dif?`<div class="banner warn" style="margin:8px 0">${ic('warn')}<div>As camadas de zoneamento das Leis 18.081 e 18.177 dão zonas diferentes para o lote. Confira antes de usar.</div></div>`:''}
    ${loteToca(linhas)}
    ${loteArqBotoes(t)}</div>`}
const fdh=s=>{if(!s)return '—';const d=new Date(s.replace(' ','T'));return isNaN(d)?fd(s):`${fd(s.slice(0,10))} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
// só a poligonal do lote, para "Usar a poligonal dos lotes" (lança o aviso quando o dígito não confere)
async function geoPoligono(sql){const d=digits(sql);
  const lotes=await geoWfs({typeNames:'geoportal:lote_cidadao',CQL_FILTER:`cd_setor_fiscal='${d.slice(0,3)}' AND cd_quadra_fiscal='${d.slice(3,6)}' AND cd_lote='${d.slice(6,10)}'`});
  const lote=lotes.find(f=>String(f.properties.cd_digito_sql)===d[10]&&f.properties.tx_situ_lote!=='INATIVO');
  if(!lote){if(lotes.length)throw `O dígito do SQL não confere (no GeoSampa é ${lotes[0].properties.cd_digito_sql}).`;return null}
  return geoAneis(lote.geometry)[0].slice(0,-1).map(p=>utmLatLng(p[0],p[1]))}
LOTE_ADAPT.sp={url:()=>GEO_BASE,buscar:geoBuscar,quadro:geoQuadro,poligono:geoPoligono,linhas:geoLinhas};
