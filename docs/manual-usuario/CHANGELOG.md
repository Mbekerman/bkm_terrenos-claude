# Registro de mudanças

O que mudou **para quem usa** o BKM Terrenos, do mais recente ao mais antigo. Cada linha diz o que mudou, onde, e o número do PR (o mesmo que aparece no selo "PR #N" do ambiente de desenvolvimento).

Quem desenvolve: toda mudança que o usuário vê ganha uma linha aqui, na data do merge, no mesmo PR que a faz (ver [Como manter](README.md#como-manter-este-manual-para-quem-desenvolve)).

Antes de 5/nov/2026, o sistema real ainda não tinha telas de uso: tudo era testado no protótipo. Este registro começa no porte das telas para o sistema real.

## 9/nov/2026

- **Barra de abas da ficha**: com o mouse em cima, o cursor é o dedinho (antes, a mão aberta); a mão fechada só aparece enquanto o botão do mouse está apertado, para arrastar a barra. (#PR)
- **Busca da barra de cima** procura de fato por matrícula, SQL e endereço (rua, número, CEP), com ou sem pontuação e sem ligar para acento; digitada fora do Mapa, leva ao Mapa com o texto. (#247)
- **Completude da ficha** chega a 100%: a "Visita técnica" saiu da conta enquanto a aba Infraestrutura não existe no sistema real. (#247)

## 8/nov/2026

- **Posição na quadra e frentes** (Terreno › Áreas e dimensões, São Paulo): medidas sozinhas pela poligonal e pelos lotes e ruas da prefeitura; uma linha por rua com os metros de frente; a testada principal vazia passa a vir da medição. (#246)
- Manual do usuário (esta pasta) e três roteiros de vídeo de onboarding. Sem mudança na tela. (#244)

## 6/nov/2026

- **Cartão da parte** (Terreno › Partes): lápis e lixeira só com ícone, na linha do título. (#242)
- **Rascunho dos formulários** da ficha (oferta, proposta, reunião, zonas, matrícula, SQL, IPTU, pessoas) fica guardado no navegador e volta ao reabrir; botão "Limpar dados". (#241)
- **Matrícula vira subquadro da parte**; o SQL entra sempre dentro de uma matrícula; as pessoas da parte (nome, telefone, e-mail, CPF/CNPJ, %, Relação) ficam numa janela pelo lápis da parte; a seção Proprietários e contatos saiu da aba Terreno. (#240)
- **Mapa de lotes**: "Usar N lotes" passou a funcionar com um SQL digitado e não incluído; aviso quando o banco demora mais de 20 s. (#238, #239)
- **Ficha mais rápida**: carrega num pedido só e já começa a carregar quando o mouse para sobre o terreno no Mapa; GeoSampa com prazo de 30 s. (#236, #237)
- **Duplicar etiqueta** é um item só no menu, e a cópia nasce no mesmo lugar da original. (#235)
- **Selo do ambiente** de desenvolvimento mostra "PR #N · dia hora" do que está no ar. (#234)
- **Número do endereço** editável, com o aviso "Número diferente do cadastro da prefeitura"; cópias de etiqueta soltas para distribuir depois. (#233)
- **Área cadastral** passa a ser a soma das áreas dos SQLs, até alguém digitar outro valor. **Endereço só pelo mapa**: o lápis "Editar no mapa" abre a edição da poligonal; o pino se arrasta; "Trocar o endereço?" quando a rua muda. **Etiquetas com percentual** (mini pizza e barra). Saíram Precisão da localização e Eixo comercial. (#232)
- **Etiquetas em mais de uma parte**, com percentual opcional; a área de **Levantamento** vira a adotada ao ser digitada; saiu **Características físicas**; o formato do campo aparece em cinza enquanto se digita. (#230)
- **Ficha na gaveta do Mapa**: borda de arrastar a largura visível. Campo que falta rola até a altura dos olhos e acende em verde-limão. (#226, #227, #228, #229)
- **Alerta do que falta** na barra das abas quando o topo da ficha sai da vista; as abas deixaram de ter número. (#225)
- **Sino de avisos**: ao vivo, com terreno, data e autor; o clique marca como lido e abre a ficha na aba certa. (#224)
- **Filtros de terrenos** no Mapa e no Funil, com chips, Limpar e visões salvas, e a seleção própria de cada página. (#223)
- **Selecionar lotes** na edição da poligonal troca os SQLs do terreno pelos marcados, com Ctrl+Z. (#222)
- **Edição da poligonal** no Mapa e no mini-mapa da ficha, com o menu do ponto, salvar no clique fora, Ctrl+Z e Ctrl+Y. (#221)

## 5/nov/2026

- **Comercial**: com uma parte só, a área da parte é a adotada do terreno. **Entorno**: "Ver tabela completa" no empreendimento. Clicar num campo seleciona o conteúdo. (#220)
- **Entorno**: "Empreendimentos no entorno" com raio e botões de situação guardados; raio da renda e do perfil independentes. (#219)
- **Funil** no sistema real: fases, etapas e subetapas, com arrastar. (#218)
- Aviso **"Você não registrou…"** nos formulários; **abas da ficha em roleta** com inércia; o mapa abre em **Satélite**; fonte da alteração do lote opcional. (#217)
- **Ficha**: abas **Parâmetros** e **Entorno**. (#215)
- Ajustes da ficha para telas estreitas (máscaras, tabelas) e barra de abas com o ⋮ fixo. (#214)
- **Quadro de avanço e painel** (Ações, Tarefas, Logs) na ficha. (#213)
- **Aba Comercial**: negociação, condições pedidas, partes, ofertas, corretores, propostas e reuniões; "Escolher no mapa" e oferta pela matrícula de outro terreno. (#212)
- Título do quadro aberto preso abaixo das abas. (#211)
- **Edição no lugar**, sem Editar nem Salvar; área adotada pelo clique no cartão; o que falta num menu; Ctrl+Z na ficha. (#210)
- **Aba Terreno**: identificação, endereço, partes, matrículas e SQLs, áreas; lápis do Resumo. (#209)
- **Ficha do terreno**: topo, abas e Visão geral, na página e na gaveta do Mapa. (#208)
- **Régua** do mapa com cursor de seta; Esc igual ao Del. (#205, #206, #207)
- **Novo terreno**: mapa de lotes da prefeitura e consulta do GeoSampa por SQL. (#205, #206)
- **Mapa**: legenda, menu de três pontinhos e busca abrem com o mouse parado; quadros fecham sozinhos; camada de renda e filtro da concorrência guardados por 30 min. (#200 a #204)
- **Novo terreno** no sistema real, inclusive "Incluir por SQL"; acesso principal e nome padrão "Bairro - Rua". (#199, #202)
- **Mapa** no sistema real: lista, legenda, busca, camadas, concorrência. (#198)
