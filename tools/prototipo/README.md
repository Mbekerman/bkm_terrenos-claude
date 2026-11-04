# Protótipo: fontes, gerador e testes

O `docs/prototipo.html` (servido pelo Cloud Run em `/prototipo`) e o artifact do claude.ai são **gerados** a partir desta pasta. Edite aqui, nunca o HTML gerado.

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
| `proto_lotesgeo.js` | lotes da prefeitura no cadastro (São Paulo): pergunta ao cadastrar, mapa de lotes das quadras do GeoSampa (F e N. em cada lote, SQL ao parar o mouse, clique marca), SQLs soltos na seção Lotes e na lista do lote |
| `proto_novo.js` | Novo terreno pela poligonal: passo 1 (desenhar ou KMZ/KML; único lugar que importa KMZ), sobreposição com outros terrenos e o que fazer, município e frentes pela localização, busca de endereço no mapa |
| `proto_concorrencia.js` | concorrência: empresas, empreendimentos, tipologias e preços por data de apuração (espelha as tabelas `concorrencia_*`), preço por m² calculado, gaveta de cadastro, quadro ao tocar no ícone, Atualizar preços |
| `proto_setores.js` | camada de renda por setor censitário (IBGE 2022): ladrilhos em canvas (Leaflet e Google), legenda, quadro do setor, quadro "Renda e população do entorno" da ficha e modal da metodologia; lê `docs/dados/setores-3550308-2022.json` (gerado por `tools/setores/gerar.py`), que o `build.py` copia para `saida/dados` |
| `proto_mercado.js` | mercado (monitor, camada de exemplo): empreendimentos fictícios unidade por unidade, grupos calculados na leitura pela regra de 25/out (`mkGrupos`, espelha o rascunho das funções do banco), círculo por situação e janela ao tocar (com VSO médio), quadro Mercado na redondeza na seção Comercial da ficha (categorias de produto, raio, com e sem vaga) |
| `proto_viab.js` | estudo de viabilidade estática: página do estudo (tipologias com preços ligados, despesas pela lista da empresa, resultado), seção Viabilidade da negociação, Configurações › Viabilidade; espelha `app.calcular_viabilidade` e lê `tools/viabilidade/despesas.json` |
| `proto_filtros.js` | filtros de terrenos: gaveta à direita (tela cheia no celular) com os grupos de filtros, barra com chips, Limpar e visões salvas, a mesma seleção em Terrenos, Mapa e Fases (`fxLista`, `fxBarra`), guardada na sessão e no endereço (`#f=`) |
| `proto_fases.js` | fases acima das etapas: configuração padrão, fase atual, abertura pelas dependências, kanban em três níveis (fase › etapa › subetapa, com seta de voltar), seção Fases da ficha, quadro de avanço da fase e Configurações › Fases |
| `proto_partes.js` | terreno com vários donos: partes, negociação por parte (pelas mesmas regras do funil), terreno que anda pela parte mais atrasada, seção Partes da ficha e terreno de exemplo (TER-000133) |
| `proto_zonas.js` | parâmetros urbanísticos por lote e zona: catálogo da lei por zona e tipo (mercado, HIS, HMP; lido de `tools/parametros/parametros.json`, o mesmo do banco), quadro por lote na seção Urbanismo com potencial construtivo, exceção do lote com fonte, parte sem inscrição e Configurações › Parâmetros urbanísticos (espelha `app.parametros_zona` e `app.v_lote_zonas`) |
| `proto_ui.js` | acabamentos de interface aplicados depois de cada render: máscaras de número, formulários de inclusão atrás de "Adicionar", rótulos dos campos de Configurações no celular, cabeçalho de tabela alinhado à coluna |
| `proto_topo.js` | topográfico preliminar: contorno (lotes da prefeitura ou poligonal), cotas do laser 2020 do GeoSampa (São Paulo, folhas `.laz` lidas com o laz-perf) ou do Google em grade de 5 m, curvas por quadrados marchantes, camadas da prefeitura, largura da via, PDF A3 e ZIP com DXF 2000 + imagem |
| `topo_dxf_modelo.py` + `topo_modelo.dxf` | esqueleto DXF 2000 (layers, imagem referenciada) feito pelo ezdxf; o `build.py` embute o `.dxf` no `proto_topo.js` |
| `proto_quadros.js` | quadros e tarefas (esquema `fluxo`, bloco 1): quadro de cada terreno com as listas do modelo e as próprias, quadro geral da página Tarefas (colunas pelo nome da lista, filtros, tabela), janela do cartão (checklists, comentários, pessoas, etiquetas, capa, anexos, concluir, arquivar), arrastar, link `/tarefas/TAR-…` e Configurações › Tarefas |
| `proto_rota.js` | endereço de cada tela: `/terrenos`, `/terrenos/TER-000123/negociacao`, `/terrenos/TER-000123/viabilidade/1`, `/mapa/TER-000123/ficha`, `/fases/aprovacao/projeto`, `/tarefas/tabela`, `/configuracoes/parametros`, `/terrenos/novo`; na versão publicada no caminho (`/prototipo/...`), fora dele depois do `#`; troca de tela entra no histórico do navegador, seção aberta e seleção no mapa só atualizam o endereço; link recebido abre direto |
| `proto_funil.js` | funil: passagem com pendências e aprovações (espelha `app._passagem`), quadro de avanço, kanban, notificações e Configurações › Funil |
| `proto_mencao.js` | menção com @: lista dos colegas ao digitar @ nos campos `data-mencao` (tarefa e reunião), @ destacado no texto, aviso só para quem entrou no texto, aviso do sino que leva ao item (`data-mid`), e-mail pelo padrão do tipo ou pela escolha de cada um (menu do avatar › Notificações por e-mail); espelha `app.tg_mencoes` e `preferencias_notificacao` |
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
| `tabas.js` | ficha em abas: todas as abas abrem sem erro e entram no endereço, Visão geral em duas metades com o Resumo pedido, abas fixas ao rolar, links antigos caem na aba nova, sem Tarefas e Confrontações (claro, escuro, celular) |
| `tloc.js`, `tordem.js` | colunas da Visão geral e mapa primeiro em uma coluna |
| `tinline.js` | edição no lugar na Visão geral |
| `tpisca.js` | clicar no log abre a seção e acende o campo |
| `tlogjunta.js` | cliques seguidos na temperatura viram um log só; voltar ao valor de antes não deixa log; passados 7 s, outro log |
| `tend2.js`, `tgmock.js` | endereço pela busca do Google (simulado) |
| `tfunil.js` | novo funil: quadro por etapa e subetapa, quadro de avanço, aprovações por hierarquia, Comprado/Perdido/Descartado/Stand By, sino e Configurações › Funil |
| `tquadros.js` | quadros e tarefas: listas do modelo, nova tarefa com código TAR, checklist com responsável avisado, comentário com @ e quem acompanha avisado, concluir leva para Feito, arquivar e filtro Arquivadas, link do cartão, quadro da ficha com lista renomeada só no terreno e arrastar, Configurações › Tarefas, Leitura só vê, celular escuro |
| `tclickup.js` | tarefas no estilo ClickUp: Lista com círculo que conclui e agrupamento, subtarefas (a mãe não conclui com subtarefa aberta), automação do cartão (só nele, vai na cópia), Calendário com arrastar e celular, Funil em tabela, Cronograma com andamento e setas |
| `tjornada.js` | jornada do terreno: Configurações › Funil › Jornada (perguntas que gravam no campo do terreno, campo novo do terreno, documentos, pré-requisitos, tarefas, regra em branco, Vale quando, regras pelo valor), o bloco "O que esta etapa pede" no quadro de avanço (responder ali, travar, justificar, pedir aprovação), Leitura, subetapa, celular escuro |
| `tmencao.js` | menção com @: lista ao digitar, Enter e Esc só na lista, aviso no sino com e-mail, salvar de novo não repete, preferência de e-mail por pessoa, aviso leva à tarefa e acende, menção na reunião, coluna E-mail em Configurações (desktop e celular escuro) |
| `ted2.js` | edição da poligonal (desktop e celular) |
| `tctx.js` | menu do clique direito no mapa (toque longo no celular), concorrência, barra do mapa |
| `tconc.js` | concorrência: quadro ao tocar no ícone (preço por m² ponderado e média simples, período, histórico da tipologia), Atualizar preços cria registro novo, cadastro na gaveta com Incluir empresa e endereço pelo ponto, Esc e clique no mapa fecham, desativar, Leitura sem botões, escuro e celular |
| `trenda.js` | perfil da população na ficha (idade e sexo, domicílios, mesmo raio da renda) e camadas de renda e densidade: liga pelo botão Camadas, troca de uma para a outra, Nenhuma desliga, pinta, clique abre o setor, quadro da ficha com raios e poligonal, metodologia (servido em http://bkm.test porque o fetch não lê file://) |
| `tmerc.js` | mercado: pinos por situação, legenda liga e desliga, janela com números e grupos (teto de preço separa a mesma planta, rampa fina fica junta, andar inconsistente usa 6%), Esc, concorrência fecha a janela; ficha: categorias no raio, só com 20 unidades, Com vaga, vaga não preenchida fora (claro, escuro, celular) |
| `tlista.js` | página Mapa sem balão: clicar no pino destaca a linha, cartão no celular, lupa abre a ficha |
| `tmini.js` | mini-mapa da Visão geral: Shift + roda, dois cliques fora da poligonal abrem o Mapa, Ver no mapa só no celular |
| `ttopo.js` | topográfico com dados reais (GeoSampa, GeoSanja e Google; a página é servida no endereço publicado para a chave valer): laser em São Paulo sem SQL (quadra inteira), contorno pelo SQL, São José pelo Google e, com o argumento `falha`, o GeoSampa fora do ar (não pode cair no Google); baixa PDF e ZIP em `saida/t_topo/` (`CELULAR=1` na largura de celular; `LAZPERF=` aponta para o `lib/web` do pacote `laz-perf@0.0.7`) |
| `tminied.js` | mini-mapa da Visão geral: dois cliques (dois toques no celular) na poligonal editam ali mesmo, menu do ponto, Ctrl+Z, Esc, clique fora salva, Leitura abre o Mapa (claro, escuro, celular) |
| `tpolyfora.js` | edição da poligonal na página Mapa: no celular só Cancelar e Concluir (Desfazer no menu do ponto), clique fora do mapa cancela, clique no mapa fora da poligonal conclui, pino vai para dentro da poligonal e sem número, log "Ajuste na poligonal" junta ajustes a menos de 2 minutos (computador e celular) |
| `tareapol.js` | área da poligonal: quinto quadro em Áreas, calculado pelo desenho, pode ser a área adotada e acompanha o ajuste da poligonal (claro, escuro, celular) |
| `tlogacoes.js` | olhinho e lixeira nos logs: prévia só para quem clica (faixa, log riscado, nada gravado), lixeira com confirmação desfaz e registra "Desfeito", quem vê a lixeira (autor, superiores, administrador; Leitura não), seção Histórico no celular (claro, escuro, celular) |
| `tzonas.js` | parâmetros por lote e zona: quadro de cada zona (CA, TO, gabarito, recuos, cota-parte, lote e frente mínimos), zonas "ZEU / ZM" na Visão geral, tipo do empreendimento gravado com log, potencial por tipo, camadas do GeoSampa no lote, valores alterados no lote só com fonte, parte sem inscrição, SJC pela macrozona, catálogo editado em Configurações muda a ficha, Leitura sem botões (claro, escuro, celular) |
| `tedmenu.js` | menu do clique direito no ponto, sem barra no desktop, Desfazer/Cancelar, Ctrl+Z e Esc (claro e escuro) |
| `tent.js`, `tent2.js`, `tent3.js`, `tentshot.js` | pontos de interesse: busca e rota a pé simuladas, pontos da empresa, adicionar ponto |
| `tgeo.js` | GeoSampa pelo SQL com respostas gravadas do servidor real em `testes/geosampa/` (`GRAVAR=1` regrava pelo Caddy local na porta 8099): campos completados, o que toca o lote, análise, PDF e DXF, "Usar a poligonal dos lotes" (diferença de área, inscrição sem lote fora, Leitura sem botão) |
| `tlotesgeo.js` | lotes da prefeitura: pergunta ao cadastrar em SP, mapa da quadra com dados gravados do GeoSampa (`testes/geosampa/lg_*.json`, `GRAVAR=1` regrava), dica com o SQL, marcar e desmarcar, zoom e arrastar, SQLs soltos, lista no lote, tirar do lote volta a solto, reabrir, escuro, celular, Leitura |
| `tbarra.js` | Barra do mapa: abre no satélite (com rótulos, só três camadas), seletor com fundo translúcido, busca legível em mapa estreito (1100, 1400, 1920, celular, escuro) |
| `tlugares.js` | Página Mapa com Google simulado (`fake_gmaps3.js`): só Mapa e Satélite, mapa escuro no tema escuro, lugares sempre ligados e sem botão Lugares, toque num lugar abre nota e avaliações (sem consultar de novo), X, clique no mapa e Esc fecham |
| `tctrl.js` | Página Mapa (Leaflet e Google simulado): sem controle de câmera, botões Minha localização (com e sem permissão) e Tela cheia (cobre a página, Esc e troca de página saem), X no cartão do terreno no celular, sem "O que tem perto", botões acima do cartão e do bonequinho, Street View com X próprio e Esc (na tela cheia, Esc fecha só o Street View) |
| `tkpi.js` | Início e Dashboard nos temas escuro e claro: os 4 indicadores iguais na versão A, números cabendo no quadro do celular ao desktop largo, e no Início a faixa vermelha ou âmbar só nos alertas |
| `tmasc.js` | máscaras de número ao digitar: milhar, vírgula decimal, R$ e % dentro do campo, cursor no lugar, atalhos "mil" e "mi" |
| `tshots.js` | prints de revisão visual: 24 telas × desktop e celular × claro e escuro (`node tshots.js <pasta> [filtro]`), com aviso do que passa da tela |
| `tvshots.js` | prints das abas do estudo de viabilidade |
| `tfases.js` | fases: kanban e mapa em três níveis (descer de fase para etapa e subetapa, seta e trilha para voltar, arrastar muda etapa e subetapa), filtro por fase na tabela, ficha (linha do tempo das fases, quadro da fase, concluir abre a seguinte, abrir antes da hora), Configurações › Fases (prefixo repetido, ciclo, etapa nova), escuro e celular |
| `tpartes.js` | terreno com vários donos: seção Partes, subetapa, temperatura e proposta por parte, aprovação, parte perdida trava a compra do terreno, tirar a parte, compra do terreno abre a Aprovação, parte nova divide a negociação, coluna Parte no cadastro, kanban, escuro e celular |
| `tpartescad.js` | partes no cadastro: passo 2 do Novo terreno com as partes (só o nome obrigatório; matrícula, inscrição, vendedor e corretor escolhidos em lista, com pop-up de incluir), quadro Partes no Cadastro da ficha, parte nova antes da negociação com inscrição, corretor e vendedor novo, código do terreno novo sem repetir, escuro e celular |
| `tfiltros.js` | filtros: gaveta, fase › etapa, contagem por opção igual às linhas, temperatura, preço "9 mi", região só com cidade, X no chip, salvar e escolher visão, Limpar, mesma seleção no Mapa e nas Fases (descida = funil), ficha do mapa fecha a gaveta, Esc, link com filtro, parte sem temperatura, escuro e celular (tela cheia, "Ver N terrenos", sem rolagem) |
| `trota.js` | endereço de cada tela: navegar muda o endereço, voltar e avançar do navegador, link recebido abre a ficha (com seção, estudo de viabilidade), o mapa com a ficha, a fase, Configurações, tarefas e Novo terreno; código que não existe avisa; filtro acompanha; fora da versão publicada pelo `#`; celular |
| `tviab.js` | estudo de viabilidade (popup sobre a ficha, indicadores e botões das seções fixos ao rolar, uma seção de cada vez com total e % do VGV no botão, anterior e próxima no fim, DRE no lugar do Resultado com EBITDA, Despesas financeiras e as taxas por último (abas Financeiras e Taxas só da diretoria), sem preço máximo, rentabilidade mínima em Configurações e o aviso na Visão geral, escolha do estudo válido na Visão geral, Esc fecha): preços ligados pela área, permuta e comissão até a quantidade, itens fixos de Taxas e Despesas comerciais, busca por grupo, obra em camadas, permuta financeira com dedução e mínimo garantido, % do lucro, verba por unidade, resultado igual ao teste do banco (VGV líquido 39,3552 mi, lucro 5,2995 mi, 13,47%), vincular, Leitura só vê, Configurações muda o dedutível e o estudo acompanha (claro, escuro, celular) |
| `tmodelo.js` | modelos de estudo de viabilidade: salvar como modelo (do usuário, da empresa, padrão), Novo estudo com o padrão marcado e Sem modelo, o estudo nasce com valores e bases do modelo e tipologia em branco, Taxas e Despesas financeiras só pela diretoria, modelo do usuário só ele vê, Configurações lista os da empresa (desktop e celular) |
| `tarrasto.js` | Kanban: colunas tracejadas ao arrastar, a coluna sob o card acende (a de origem não), nada fora das colunas, tudo limpo ao soltar; negociações e tarefas, claro e escuro |
| `tnovo.js` | Novo terreno pela poligonal, com OpenStreetMap simulado: passo 1 (desenhar, KMZ), busca de endereço no mapa, sobreposição (mesma área, área nova maior, cruzada com união, faixa de 3 m na divisa que não conta), município e frentes pela localização com escolha do endereço principal, oferta com o pedaço oferecido, celular e escuro |
| `tgeosjc.js` | Inscrição por cidade e GeoSanja com respostas gravadas do servidor real em `testes/geosanja/` (`GRAVAR=1` regrava pelo Caddy local na porta 8099; o token de visitante não é gravado): rótulo e máscara pela cidade do terreno (sem seletor), duplicidade por cidade, busca sozinha ao cadastrar, quadro, PDF e DXF, inscrição de outra cidade recusada, celular e escuro |
| `texcl.js` | excluir ponto de interesse (Google e da empresa), confirmação, lista de excluídos e Restaurar (claro, escuro, celular) |
| `ticones.js` | prints dos ícones do menu (aberto, recolhido, celular, tema escuro) |

`fake_gmaps.js` / `fake_gmaps2.js` simulam o Google (o 2 também responde `Place.searchNearby`); `tile.png` é o fundo de mapa falso. Prints e saídas vão para `saida/` (fora do git).
