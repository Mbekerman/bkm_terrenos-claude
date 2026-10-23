# Protótipo: fontes, gerador e testes

O `docs/prototipo.html` (servido pelo Railway em `/prototipo`) e o artifact do claude.ai são **gerados** a partir desta pasta. Edite aqui, nunca o HTML gerado.

| Arquivo | O que é |
| --- | --- |
| `proto_body.html` | marcação fixa da página |
| `proto.js` | estado, dados de exemplo, telas, modais e ações (termina em `render();})();`) |
| `proto_mod.js` | mapa (Leaflet), Visão geral, pontos de interesse, poligonal |
| `proto_gmap.js` | tudo que usa o Google (Maps JS, Places, Routes, Geocoding, Elevation) |
| `proto_painel.js` | painel lateral (logs, filtros, ações), tabelas que empilham, ganchos do `posRender` |
| `proto_lote.js` | Inscrição por cidade (São Paulo, São José dos Campos, outro): rótulo, máscara, busca na base da cidade e peças comuns do quadro do lote |
| `proto_geosampa.js` | GeoSampa pelo SQL: lote, camadas que tocam a poligonal, análise, planta (PDF) e desenho (DXF) |
| `proto_geosanja.js` | GeoSanja pela inscrição imobiliária de SJC: poligonal, camadas que tocam o lote, análise, planta (PDF montado no navegador) e desenho (DXF) |
| `proto_novo.js` | Novo terreno pela poligonal: passo 1 (desenhar ou KMZ/KML; único lugar que importa KMZ), sobreposição com outros terrenos e o que fazer, município e frentes pela localização, busca de endereço no mapa |
| `proto_fases.js` | fases acima das etapas: configuração padrão, fase atual, abertura pelas dependências, kanban por fase, seção Fases da ficha, quadro de avanço da fase e Configurações › Fases |
| `proto_partes.js` | terreno com vários donos: partes, negociação por parte (pelas mesmas regras do funil), terreno que anda pela parte mais atrasada, seção Partes da ficha e terreno de exemplo (TER-000133) |
| `proto_funil.js` | funil: passagem com pendências e aprovações (espelha `app._passagem`), quadro de avanço, kanban, notificações e Configurações › Funil |
| `bkm.pre-painel.css` + `painel.css` | estilos; o `painel.css` tem os blocos mais novos e sobrepõe o anterior |
| `build.py` | junta tudo: grava `docs/prototipo.html`, `saida/bkm-terrenos.html` (artifact e testes) e atualiza `apps/web/src/styles.css` |
| `mkdemo.py` | gera `saida/demo/...` com 6 usuários a mais (usado por `tpisca.js`, `tend2.js`, `tgmock.js`) |
| `testes/` | roteiros Playwright |

## Gerar

```bash
# Leaflet e JSZip locais (só para os testes, que rodam sem CDN)
mkdir -p tools/prototipo/libs/l && git fetch origin libs-prototipo:refs/remotes/origin/libs-prototipo && git archive origin/libs-prototipo | tar -x -C tools/prototipo/libs/l
python3 tools/prototipo/build.py
python3 tools/prototipo/mkdemo.py      # só se for rodar os testes que usam a demo
```

## Testar (Playwright com Chromium; `npm i playwright` ou o global da máquina)

Rodar só o que a mudança toca; a varredura completa (`tvaza` e `tscroll`) ao fechar um lote.

| Roteiro | Cobre |
| --- | --- |
| `tvaza.js` | nada vazando de quadros em 14 larguras, menu aberto e recolhido (lento) |
| `tscroll.js` | nenhuma rolagem horizontal |
| `tloc.js`, `tordem.js` | colunas da Visão geral e mapa primeiro em uma coluna |
| `tinline.js` | edição no lugar na Visão geral |
| `tpisca.js` | clicar no log abre a seção e acende o campo |
| `tend2.js`, `tgmock.js` | endereço pela busca do Google (simulado) |
| `tfunil.js` | novo funil: quadro por etapa e subetapa, quadro de avanço, aprovações por hierarquia, Comprado/Perdido/Descartado/Stand By, sino e Configurações › Funil |
| `ted2.js` | edição da poligonal (desktop e celular) |
| `tctx.js` | menu do clique direito no mapa (toque longo no celular), concorrência, barra do mapa |
| `tlista.js` | página Mapa sem balão: clicar no pino destaca a linha, cartão no celular, lupa abre a ficha |
| `tmini.js` | mini-mapa da Visão geral: Shift + roda, dois cliques abrem o Mapa, Ver no mapa só no celular |
| `tedmenu.js` | menu do clique direito no ponto, sem barra no desktop, Desfazer/Cancelar, Ctrl+Z e Esc (claro e escuro) |
| `tent.js`, `tent2.js`, `tent3.js`, `tentshot.js` | pontos de interesse: busca e rota a pé simuladas, pontos da empresa, adicionar ponto |
| `tgeo.js` | GeoSampa pelo SQL com respostas gravadas do servidor real em `testes/geosampa/` (`GRAVAR=1` regrava pelo Caddy local na porta 8099): campos completados, o que toca o lote, análise, PDF e DXF, "Usar a poligonal dos lotes" (diferença de área, inscrição sem lote fora, Leitura sem botão) |
| `tbarra.js` | Barra do mapa: abre no satélite (com rótulos, só três camadas), seletor com fundo translúcido, busca legível em mapa estreito (1100, 1400, 1920, celular, escuro) |
| `tlugares.js` | Página Mapa com Google simulado (`fake_gmaps3.js`): só Mapa e Satélite, mapa escuro no tema escuro, botão Lugares só com o Map ID sem lugares, toque num lugar abre nota e avaliações (sem consultar de novo), X, clique no mapa e Esc fecham |
| `tctrl.js` | Página Mapa (Leaflet e Google simulado): sem controle de câmera, botões Minha localização (com e sem permissão) e Tela cheia (cobre a página, Esc e troca de página saem), X no cartão do terreno no celular, sem "O que tem perto", botões acima do cartão e do bonequinho, Street View com X próprio e Esc (na tela cheia, Esc fecha só o Street View) |
| `tkpi.js` | Início e Dashboard nos temas escuro e claro: os 4 indicadores iguais na versão A, números cabendo no quadro do celular ao desktop largo, e no Início a faixa vermelha ou âmbar só nos alertas |
| `tfases.js` | fases: kanban por fase (arrastar muda a etapa), filtro por fase na tabela e no mapa, ficha (linha do tempo das fases, quadro da fase, concluir abre a seguinte, abrir antes da hora), Configurações › Fases (prefixo repetido, ciclo, etapa nova), escuro e celular |
| `tpartes.js` | terreno com vários donos: seção Partes, subetapa, temperatura e proposta por parte, aprovação, parte perdida trava a compra do terreno, tirar a parte, compra do terreno abre a Aprovação, parte nova divide a negociação, coluna Parte no cadastro, kanban, escuro e celular |
| `tarrasto.js` | Kanban: colunas tracejadas ao arrastar, a coluna sob o card acende (a de origem não), nada fora das colunas, tudo limpo ao soltar; negociações e tarefas, claro e escuro |
| `tnovo.js` | Novo terreno pela poligonal, com OpenStreetMap simulado: passo 1 (desenhar, KMZ), busca de endereço no mapa, sobreposição (mesma área, área nova maior, cruzada com união, faixa de 3 m na divisa que não conta), município e frentes pela localização com escolha do endereço principal, oferta com o pedaço oferecido, celular e escuro |
| `tgeosjc.js` | Inscrição por cidade e GeoSanja com respostas gravadas do servidor real em `testes/geosanja/` (`GRAVAR=1` regrava pelo Caddy local na porta 8099; o token de visitante não é gravado): rótulo e máscara pela cidade do terreno (sem seletor), duplicidade por cidade, busca sozinha ao cadastrar, quadro, PDF e DXF, inscrição de outra cidade recusada, celular e escuro |
| `ticones.js` | prints dos ícones do menu (aberto, recolhido, celular, tema escuro) |

`fake_gmaps.js` / `fake_gmaps2.js` simulam o Google (o 2 também responde `Place.searchNearby`); `tile.png` é o fundo de mapa falso. Prints e saídas vão para `saida/` (fora do git).
