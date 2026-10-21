import os
AQUI=os.path.dirname(os.path.abspath(__file__));os.makedirs(os.path.join(AQUI,'saida','demo'),exist_ok=True)
s=open(os.path.join(AQUI,'saida','bkm-terrenos.html')).read()
fim='\nrender();\n})();'
i=s.rindex(fim)
demo="""
/* demo: terreno com 10 usuários nos logs */
(function(){const t0=S.terrenos.find(x=>x.nome.includes('Barão'));if(!t0)return;
const X=[['Ana Lima','Corretor atualizado',['Corretor principal: Juliana Reis → Marcos Prado']],['Bruno Castro','Reunião registrada: visita ao terreno',['Pauta: visita com o vendedor e o topógrafo']],['Fernanda Reis','Documento enviado: Planta do loteamento',['Versão 1 · PDF']],['Gustavo Prado','Análise urbanística atualizada',['Taxa de ocupação: 0,5 → 0,7','Gabarito: não informado → 28 m']],['Helena Duarte','Proposta v3: comentário da diretoria',['Aprovar até R$ 6,6 mi se o pagamento for 40/60']],['Igor Matos','Ficha editada',['Topografia: não informado → Plana','Testada: 32 m → 34,5 m','Observações gerais: não informado → Vendedor aceita visita aos sábados']]];
if(!t0.hist.some(h=>h.user==='Igor Matos'&&h.det)){X.forEach(([u,txt,det],k)=>t0.hist.push({em:'2026-10-1'+(k+1)+'T1'+k+':2'+k+':1'+k+'.'+(100+k),user:u,txt,det}));try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
UI.route='terreno';UI.id=t0.id;UI.tab='geral';UI.from='terrenos';PN.aberto=true;PN.aba='logs';})();"""
open(os.path.join(AQUI,'saida','demo','bkm-terrenos-lista-suspensa.html'),'w').write(s[:i]+demo+s[i:])
