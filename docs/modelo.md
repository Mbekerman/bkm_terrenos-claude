# Modelo de dados

Gerado a partir de `supabase/migrations/`. Campos de auditoria (`criado_*`, `atualizado_*`) e `empresa_id` (presente em todas as tabelas da empresa) foram omitidos. Tudo no schema `app`.

## Fases

Acima das etapas fica a **fase**: o grande momento do terreno. Cada fase é um processo próprio do terreno (`processos.fase`), com etapas, subetapas, status, responsável e histórico próprios; um terreno tem no máximo um processo aberto por fase, e fases podem correr juntas.

| Fase | Prefixo | Concluído | Etapas (ponto de partida) |
| --- | --- | --- | --- |
| Novos Negócios (entrada) | NEG | Comprado | Em Triagem, Estudos Preliminares, Negociação, Contrato |
| Aprovação de Projetos | APR | Aprovado | Projeto, Análise na Prefeitura, Alvarás |
| Registro de Incorporação | INC | Incorporação registrada | Memorial e Certidões, Cartório |
| Contratação Caixa | CEF | Contratado | Análise Caixa, Contratação |
| Lançamento | LAN | Lançado | Preparação, Vendas Iniciais |
| Obras | OBR | Obra entregue | Início, Execução, Entrega |
| Entregue | ENT | Garantia encerrada | Pós-entrega (Assistência Técnica, Em Garantia) |

- **Fase de entrada** (`fases_modelo.entrada`, uma por empresa): a que a oferta abre (`abrir_negociacao`) e a única com negociação (temperatura, propostas, viabilidade). Concluir nela é a compra: pede relato e pontos de sucesso e nenhuma diligência impeditiva.
- **Dependências** (`fase_dependencias`): a fase abre quando, no mesmo terreno, a fase requisito foi concluída ou passou pela etapa ou subetapa indicada; todas precisam valer. O padrão encadeia cada fase na conclusão da anterior. Depois de cada passagem, `_abrir_fases_liberadas` abre sozinha a fase que o terreno nunca teve e cujas dependências se cumpriram (fase encerrada não reabre sozinha). Fase sem dependência, reabertura ou abertura antes da hora: `abrir_fase(terreno, fase)`, com dependência pendente só gestor ou diretor, com justificativa (`forcado`).
- **Status por fase** (`status_modelo`): Concluído e Stand By em toda fase, com o nome da fase para o Concluído; Perdido (o vendedor disse não) só em Novos Negócios; Descartado em todas menos Entregue. Status sem linha não existe na fase.
- **Fase atual do terreno** (`v_terrenos.fase`): a aberta mais adiante pela ordem; sem nenhuma aberta, a última encerrada. `fases_abertas` lista as que correm juntas; `fases_do_terreno(terreno)` dá cada fase com o processo, o status e o que falta para abrir.
- Código do processo com o prefixo da fase (`NEG-00012`, `APR-00013`), numeração única.

## Funil de cada fase

Cada fase tem etapas, cada uma com subetapas. Abaixo, as de Novos Negócios; as das outras fases são um ponto de partida que o administrador ajusta. O card está sempre numa subetapa; dentro da etapa, ela muda em qualquer ordem (a ordem é só a coluna do kanban).

| Etapa | Subetapas (colunas do kanban) |
| --- | --- |
| Em Triagem | Aguardando Informações, Aguardando Documentos, Verificação Interna |
| Estudos Preliminares | Estudo de Massa, Estudo de Viabilidade, Análise Técnica Preliminar |
| Negociação | Aguardando Primeira Reunião, Preparando Proposta, Proposta Enviada, Contra Proposta |
| Contrato | Em Elaboração, Contrato Enviado, Em Ajuste |

Entrar numa etapa leva à subetapa inicial (a primeira ativa). O fim do processo da fase é **status**, não etapa: `ativo`, `concluido` (em Novos Negócios, Comprado), `perdido`, `descartado` ou `stand_by`. Fora de ativo, o processo guarda a etapa e a subetapa onde estava (mostra onde o funil perde terrenos).

| Status | Exige | Quem |
| --- | --- | --- |
| Concluído (Comprado) | estar na última etapa; relato e pontos de sucesso (rich text); checklist da etapa e nenhuma diligência impeditiva | conforme `status_modelo` (padrão: gestor e depois diretor) |
| Perdido | motivo da lista (`motivos_encerramento`) e relato | analista ou acima |
| Descartado | motivo da lista; texto obrigatório quando o motivo pede (Outros) | analista ou acima |
| Stand By | justificativa e data futura para retomar; retomar volta à mesma etapa e subetapa | analista ou acima |

Comprado, Perdido e Descartado não voltam: se o terreno voltar ao radar, abre-se outra tratativa. Nas outras fases, Concluído pede só o relato.

**Toda passagem** (etapa, subetapa ou status) passa por `app._passagem`:

1. **Pendências** travam: checklist de documentos para sair da etapa (`checklist_modelo`), pré-requisitos (`prerequisitos_modelo`: "para entrar em X é preciso ter passado pela subetapa Y", lido do histórico) e, na compra, diligência impeditiva. Gestor ou diretor força com justificativa (`forcado` no histórico).
2. **Aprovações** configuradas por etapa, subetapa e status (`aprova_gestor`, `aprova_diretor`, `aprovacao_modo` sequência ou paralelo) viram um pedido em `aprovacoes`, menos o nível que quem move já tem: gestor dispensa gestor, diretor dispensa os dois. O card fica parado aguardando; enquanto o pedido está aberto, não se move.
3. Sem pedido, a passagem acontece na hora e vira uma linha em `processo_transicoes`.

Quem aprova: o aprovador previsto vem da hierarquia de quem pediu (`membros.superior_id`: analista → gestor → diretor). Qualquer superior dele também aprova, sempre; quem aprovou de fato fica em `decidido_por`. Em sequência, o diretor só recebe depois do gestor; em paralelo, os dois recebem juntos e a passagem acontece quando ambos aprovarem. Uma recusa (com comentário) encerra o pedido. Aprovado, a passagem é gravada no nome de quem pediu, com `aprovacao_id`.

Arrastar no quadro de etapas chama `mover_para_etapa` (para frente, etapa por etapa, e só a última pode ficar aguardando aprovação; para trás, exige motivo e grava `retorno`). No kanban da etapa, `mover_subetapa`. `checar_passagem(processo, destino_tipo, destino)` diz o que falta (padrão: a próxima etapa, ou concluir a fase na última), quais aprovações serão pedidas e o pedido aberto, com `posso_decidir` para quem vê.

**SLA:** só do histórico. `v_periodos_processo` corta o histórico em períodos (cada transição até a seguinte), com stand by em período próprio. `v_tempo_subetapas` soma por etapa e subetapa: primeira entrada, última saída, passagens, tempo ativo, tempo em stand by e se é a atual. Retomar o stand by empurra `etapa_desde` e `subetapa_desde` pelo tempo parado. Prazo estourado = agora − `subetapa_desde` > `subetapas_modelo.prazo_dias` (`v_terrenos.subetapa_atrasada`).

## Terreno com vários donos (partes)

Um dono com várias matrículas é **uma** negociação. Vários donos que negociam separado são **partes** do terreno (`terreno_partes`): cada parte é um dono, ou um grupo de donos que negocia junto (herdeiros, sócios), com as matrículas, as inscrições e as pessoas dela (`parte_id` em `matriculas`, `inscricoes_municipais` e `terreno_pessoas`; participações somam 100% em cada parte) e os corretores dela (`parte_corretores`: uma parte pode ter vários corretores e o mesmo corretor pode trazer várias partes; ligar o corretor à parte o põe entre os corretores do terreno), o pedaço da poligonal e a marca de **essencial** (sem ela o terreno não serve) ou dispensável.

- **Cadastro:** a parte pode nascer junto com o terreno (fim do Novo terreno) ou a qualquer momento na ficha, só com o nome; tamanho do lote, matrículas, inscrições, vendedores e corretor são opcionais (`salvar_parte` e os `parte_id`).
- **Antes da etapa da divisão** (`fases_modelo.etapa_partes`, só na fase de entrada; padrão Negociação) há uma negociação só, a do terreno: Triagem e Estudos são da área toda.
- **Ao chegar nela**, com duas ou mais partes ativas, cada parte ganha a sua negociação: um processo da mesma fase com `parte_id` e `principal_id` (código `NEG-00012-1`), com oferta de referência, propostas, documentos, reuniões, tarefas, subetapa, status, aprovações e histórico próprios. Parte cadastrada depois disso já nasce com a sua.
- **A negociação do terreno passa a andar pelas partes** (`_sincronizar_principal`): fica na etapa e na subetapa da parte mais atrasada em aberto, com cada mudança no histórico ("Pelas negociações das partes"), e não se move à mão. A de uma parte só anda da etapa da divisão em diante e enquanto a do terreno estiver ativa.
- **Comprado do terreno** só com todas as partes ativas compradas (pendência que nem o gestor força); o checklist de documentos fica com cada parte; relato e pontos de sucesso só na compra do terreno. A compra de uma parte não abre a fase seguinte.
- **Parte perdida ou descartada** trava a compra: ou sai do terreno (`remover_parte`, com motivo; parte essencial só com gestor ou diretor, e tornar uma parte dispensável também), ou o terreno se encerra. Parte comprada não sai.
- **Encerrar o terreno** leva as partes em aberto: Perdido e Descartado com o mesmo motivo, Stand By com a mesma data; retomar o terreno retoma as partes.
- **Oferta** pode cobrir uma ou mais partes (`oferta_partes`, com o preço de cada uma quando informado); a negociação da parte usa como referência a oferta mais recente que a cobre.
- `v_partes`: cada parte com donos, corretores, matrículas, negociação (etapa, subetapa, prazo, status), preço pedido e última proposta. A temperatura é uma só, a da negociação do terreno: `definir_temperatura` recusa a negociação de uma parte.

## Papéis, hierarquia e configuração

Papéis: `diretor`, `gestor`, `analista` (editam) e `leitura` (consulta). `membros.superior_id` liga cada analista a um gestor e cada gestor a um diretor, sempre um nível acima (trigger). `administrador` é permissão à parte, em qualquer papel: gerencia a equipe e a configuração do funil. Quem cria a empresa vira diretor e administrador.

A configuração do funil é **por empresa** (`empresa_id`); as linhas com `empresa_id` nulo são o modelo padrão, copiado para cada empresa nova. O administrador edita pelo app, só por RPC, e toda alteração vai para a auditoria:

| O quê | RPC | Não pode |
| --- | --- | --- |
| Fases: criar, renomear, reordenar, prefixo, desativar; etapa em que a negociação se divide por parte (`etapa_partes`) | `salvar_fase`, `apagar_fase` (só sem processo) | mudar ou desativar a fase de entrada; desativar com terreno dentro; dividir fora da fase de entrada; mudar a divisão com partes negociando |
| Dependências entre fases | `adicionar_dependencia`, `remover_dependencia` | ciclo; dependência na fase de entrada |
| Etapas: criar (nasce com uma subetapa), renomear, reordenar, prazo, aprovações | `salvar_etapa`, `apagar_etapa` (só sem histórico) | apagar etapa de que outra fase depende |
| Subetapas: criar, renomear, reordenar, prazo, aprovações, desativar | `salvar_subetapa` (desativar com terrenos dentro pede `mover_para`) | mudar de etapa; apagar com histórico (`apagar_subetapa` só sem histórico); desativar de que um pré-requisito depende |
| Pré-requisitos | `adicionar_prerequisito`, `remover_prerequisito` | ciclo; exigir subetapa de etapa posterior; exigir na subetapa inicial outra da própria etapa |
| Motivos de encerramento | `salvar_motivo`, `apagar_motivo` (só nunca usado) | |
| Checklist de documentos por etapa | `salvar_checklist`, `remover_checklist` | |
| Status da fase: nome, aprovações, incluir ou tirar (Perdido, Descartado) | `configurar_status` | tirar Concluído ou Stand By; tirar status em uso |
| Tipos de notificação e lembretes padrão | `configurar_notificacao` | |

```mermaid
erDiagram
  empresas ||--o{ membros : equipe
  membros |o--o{ membros : "superior"
  fases_modelo ||--o{ etapas_modelo : tem
  fases_modelo ||--o{ status_modelo : encerra
  fases_modelo ||--o{ fase_dependencias : "abre quando"
  fases_modelo ||--o{ processos : "terreno na fase"
  etapas_modelo ||--o{ subetapas_modelo : tem
  etapas_modelo ||--o{ checklist_modelo : "para sair"
  subetapas_modelo ||--o{ prerequisitos_modelo : "requisito"
  processos ||--o{ aprovacoes : pede
  processos ||--o{ processo_transicoes : historico
  aprovacoes |o--o{ processo_transicoes : libera

  membros {
    uuid user_id PK
    text papel "diretor | gestor | analista | leitura"
    uuid superior_id FK "um nivel acima"
    bool administrador
  }
  fases_modelo {
    uuid empresa_id "null = modelo padrao"
    text codigo
    text nome
    int ordem
    text prefixo "NEG, APR..."
    bool entrada "a que a oferta abre"
    bool ativo
  }
  fase_dependencias {
    uuid id PK
    text fase
    text requisito_fase
    text requisito_tipo "conclusao | etapa | subetapa"
    text requisito
  }
  etapas_modelo {
    uuid empresa_id "null = modelo padrao"
    text fase FK
    text codigo
    text nome
    int ordem
    int sla_dias
    bool aprova_gestor
    bool aprova_diretor
    text aprovacao_modo "sequencia | paralelo"
  }
  subetapas_modelo {
    text codigo "unico na fase"
    text etapa FK
    text nome
    int ordem "coluna do kanban"
    int prazo_dias
    bool aprova_gestor
    bool aprova_diretor
    text aprovacao_modo
    bool ativo
  }
  status_modelo {
    text fase FK
    text status "concluido | perdido | descartado | stand_by"
    text nome "Comprado, Aprovado..."
    bool aprova_gestor
    bool aprova_diretor
    text aprovacao_modo
  }
  prerequisitos_modelo {
    uuid id PK
    text alvo_tipo "etapa | subetapa"
    text alvo
    text requisito "subetapa"
  }
  motivos_encerramento {
    text status "descartado | perdido"
    text codigo
    text nome
    bool exige_texto
    bool ativo
  }
  aprovacoes {
    uuid id PK
    uuid pedido_id "uma linha por nivel"
    uuid processo_id FK
    text destino_tipo "etapa | subetapa | status"
    text destino
    text nivel "gestor | diretor"
    smallint ordem "2 = diretor em sequencia"
    uuid aprovador_previsto
    uuid pedido_por
    text status "pendente | aprovado | recusado | cancelado"
    uuid decidido_por
    text comentario
    jsonb dados "forcado, justificativa, dados do encerramento"
  }
  processo_transicoes {
    uuid id PK
    text evento "abertura | avanco | retorno | subetapa | conclusao | perda | descarte | stand_by | retomada | temperatura"
    text de_etapa
    text para_etapa
    text de_subetapa
    text para_subetapa
    bool forcado
    uuid aprovacao_id FK
    uuid user_id
    timestamptz em
  }
```

## Notificações e lembretes

`notificacoes` é genérica: destinatário, tipo, texto, autor, terreno e origem (tabela e id). Cada usuário vê só as suas; só o banco cria (`_notificar`), e `marcar_notificacao_lida(id)` marca uma ou todas. A chave única (tipo, origem, destinatário, `referencia`) impede aviso repetido. O sino ouve a tabela pelo Realtime do Supabase.

| Tipo | Gatilho | Quem recebe |
| --- | --- | --- |
| `tarefa_atribuida` | na hora (trigger em `tarefas`) | responsável |
| `tarefa_marcado` | na hora (`tarefa_marcados`) | pessoa marcada |
| `tarefa_prazo` | lembrete (padrão: no dia) | responsável |
| `tarefa_atrasada` | rotina diária, uma vez por prazo | responsável |
| `stand_by_retomar` | lembrete (padrão: 7 dias antes e no dia) | responsável da tratativa |
| `subetapa_prazo` | rotina diária, uma vez por entrada na subetapa | responsável da tratativa |
| `documento_vencendo` | lembrete (padrão: 30 e 7 dias antes) | responsável da tratativa ou do terreno |
| `reuniao_agendada` | lembrete (padrão: 1 dia antes) | responsável da tratativa ou do terreno |
| `aprovacao_pendente` | na hora, quando é a vez | aprovador previsto (ou todos do nível) |
| `aprovacao_decidida` | na hora | quem pediu |

`lembretes`: um por item e antecedência (`dias_antes`, destinatário nulo = responsável do item). Nascem com o item pelos padrões de `tipos_notificacao.dias_antes_padrao`, e quem cadastra pode incluir ou tirar. `enviado_para` guarda a data já avisada: se a data do item mudar, o lembrete volta a valer. `app.rotina_diaria()` roda às 6h pelo pg_cron (agendada na migration quando a extensão existe).

## 1. Terreno e cadastro do imóvel

```mermaid
erDiagram
  municipios ||--o{ terrenos : localiza
  municipios ||--o{ zoneamentos : define
  municipios ||--o{ eixos_comerciais : contem
  eixos_comerciais |o--o{ terrenos : classifica
  terrenos ||--o{ matriculas : possui
  terrenos ||--o{ inscricoes_municipais : possui
  inscricoes_municipais ||--o{ consultas_lote : "lote na base da prefeitura"
  municipios ||--o| bases_cadastrais : "GeoSampa, GeoSanja"
  municipios ||--o{ inscricoes_municipais : "cidade da inscricao"
  inscricoes_municipais ||--o{ inscricao_valores : "valor venal e IPTU por exercicio e revisao"
  terrenos ||--o{ confrontacoes : mede
  terrenos ||--o{ terreno_pessoas : vincula
  terrenos ||--o{ terreno_partes : "donos que negociam separado"
  terreno_partes |o--o{ matriculas : "do dono"
  terreno_partes |o--o{ inscricoes_municipais : "do dono"
  terreno_partes |o--o{ terreno_pessoas : "donos da parte"
  pessoas ||--o{ terreno_pessoas : participa
  terrenos ||--o{ terreno_infraestrutura : verifica
  itens_infraestrutura ||--o{ terreno_infraestrutura : item
  terrenos ||--o{ analises_urbanisticas : analisa
  analises_urbanisticas ||--o{ analise_zoneamentos : "uma porcao por zona"
  zoneamentos ||--o{ analise_zoneamentos : aplica
  areas_interesse ||--o{ area_interesse_terrenos : agrupa
  terrenos ||--o{ area_interesse_terrenos : integra
  terrenos ||--o| terreno_entorno_buscas : "busca do entorno (coordenada usada)"
  terrenos ||--o{ terreno_entorno : "lugares a pe"
  terrenos ||--o{ terreno_ponto_distancias : "rota ate os pontos da empresa"
  pontos_interesse ||--o{ terreno_ponto_distancias : mede
  entorno_categorias ||--o{ terreno_entorno : classifica

  terrenos {
    uuid id PK
    text codigo "TER-000123"
    text nome
    text situacao_cadastral "ativo | arquivado"
    text prioridade "baixa | media | alta | estrategica"
    uuid responsavel_id FK
    text origem_cadastro
    text url_origem
    date data_identificacao
    text cep
    text logradouro
    text numero
    text bairro
    uuid municipio_id FK
    text zona "8 opcoes"
    uuid eixo_comercial_id FK
    float latitude
    float longitude
    jsonb poligono_geojson "obrigatoria"
    geometry poligono "gerada, PostGIS"
    uuid_array sobreposicoes_aceitas
    text precisao_localizacao
    numeric area_documental_m2
    numeric area_cadastral_m2
    numeric area_levantamento_m2
    numeric area_poligonal_m2 "gerada, do desenho"
    numeric area_adotada_m2
    text fonte_area_adotada
    numeric testada_principal_m
    text topografia
    text posicao_quadra
    text formato
    text situacao_ocupacao
    numeric area_construida_existente_m2
    numeric area_construida_demolir_m2
    text necessidade_demolicao
    int versao "edicao simultanea"
  }
  confrontacoes {
    uuid id PK
    uuid terreno_id FK
    int ordem
    text tipo "frente | laterais | fundos | outro"
    numeric comprimento_m
    text confrontante
  }
  matriculas {
    uuid id PK
    uuid terreno_id FK
    text numero
    text cartorio
    numeric area_registrada_m2
    date data_certidao
    uuid parte_id FK "de qual dono"
  }
  inscricoes_municipais {
    uuid id PK
    uuid terreno_id FK
    uuid parte_id FK "de qual dono"
    uuid municipio_id FK "nulo = outro municipio"
    text inscricao "SQL ou inscricao imobiliaria"
    numeric area_cadastral_m2
    text cib
    text zona_fiscal
  }
  bases_cadastrais {
    text codigo PK
    uuid municipio_id FK
    text nome
    text rotulo
    text mascara
  }
  consultas_lote {
    uuid id PK
    uuid terreno_id FK
    uuid inscricao_id FK
    text base FK
    text inscricao_norm
    timestamptz consultado_em
    jsonb lote
    jsonb poligono_geojson
    jsonb camadas "atributos de tudo que toca o lote"
    jsonb zonas "porcao de cada zona"
    text_arr camadas_com_erro
  }
  inscricao_valores {
    uuid id PK
    uuid inscricao_id FK
    int exercicio
    int revisao
    bool vigente
    numeric valor_venal_terreno
    numeric valor_venal_construcao
    numeric valor_venal_imovel
    text situacao_iptu "nao_informada | tributado | isento"
    numeric iptu_valor_anual
    int iptu_parcelas
    numeric iptu_mensal_informado
    date data_verificacao
    text fonte
  }
  terreno_partes {
    uuid id PK
    uuid terreno_id FK
    text nome "dono ou grupo de donos"
    bool essencial
    jsonb poligono_geojson "pedaco da parte"
    numeric area_m2
    bool ativa "sai com motivo"
  }
  terreno_pessoas {
    uuid terreno_id FK
    uuid parte_id FK
    uuid pessoa_id FK
    text papel "proprietario | representante | procurador | contato"
    numeric percentual_participacao
  }
  terreno_infraestrutura {
    uuid terreno_id PK
    text item PK
    text disponibilidade "nao_verificado | sim | nao"
    date data_verificacao
    text fonte
  }
  analises_urbanisticas {
    uuid id PK
    uuid terreno_id FK
    date data_verificacao
    text fonte
    text status "vigente | substituida"
  }
  analise_zoneamentos {
    uuid analise_id FK
    uuid zoneamento_id FK
    numeric area_abrangida_m2
    text gabarito_m_status "nao_informado | limitado | sem_limite_identificado"
    numeric gabarito_maximo_m
    text gabarito_pav_status
    int gabarito_maximo_pavimentos
    text ca_status
    numeric ca_maximo
  }
```

`municipios` traz os 5.571 municípios do IBGE (código, nome e UF), então o terreno pode estar em qualquer cidade. A busca de endereço do Google devolve cidade e UF, e o front obtém o `municipio_id` por `app.municipio_por_nome(nome, uf)`, que compara sem acento, maiúsculas, hífen ou apóstrofo. O catálogo de `zoneamentos` tem São Paulo (LPUOS) e São José dos Campos (LC 623/2019, siglas da legenda do mapa do GeoSanja).

**Poligonal primeiro.** O cadastro começa pela poligonal, obrigatória (`check` em `terrenos`; PostGIS no schema `extensions`, coluna gerada `poligono` com índice GiST). Antes de criar, o front chama `app.terrenos_sobrepostos(empresa, poligonal)`, que usa `app.sobreposicao(a, b, folga = 5 m)`: a parte em comum conta quando passa de 1 m² e tem mais de 5 m de largura (diâmetro do maior círculo que cabe nela, `ST_MaximumInscribedCircle` na UTM do lugar) ou cobre metade de um dos dois. Assim a imprecisão do desenho na divisa não conta, mas o mesmo lote estreito desenhado de novo sempre avisa. Cada achado vem como `mesma_area` (90% ou mais dos dois lados) ou `parcial`, com área, largura e percentuais. O usuário escolhe: nova oferta no existente (com `ofertas.poligono_geojson` quando oferece só parte, conferido em `registrar_oferta` para caber no terreno com 5 m de folga), recadastrar o existente com a área nova ou a soma das duas (`salvar_terreno`), ou confirmar que é outro terreno. Nesse caso os ids vão em `sobreposicoes_aceitas`, e o trigger `t_sobre` recusa qualquer poligonal (cadastro, edição, importação) que ocupe outro terreno sem essa confirmação. Município e endereço vêm da localização da poligonal (geocodificação reversa no front, com `municipio_por_nome`); as ruas de cada lado viram as frentes, o usuário escolhe a principal (`logradouro`, `numero`) e as outras entram em `confrontacoes` com tipo `frente`.

**Inscrição por cidade.** Cada inscrição guarda a cidade (`municipio_id`), escolhida antes de digitar: São Paulo, São José dos Campos ou outro município (nulo, inscrição digitada). A cidade com base da prefeitura está em `bases_cadastrais`, com o nome da base, como a prefeitura chama a inscrição e a máscara (`000.000.0000-0` em SP, `00.0000.0000.0000` em SJC); o front abre o campo com essa máscara e busca o lote na base. A inscrição de uma cidade tem que ser da cidade do terreno (trigger `tg_inscricao_municipio`), e a unicidade é por empresa, cidade e número. Nos dois cadastros os 6 primeiros dígitos são setor e quadra, o que dá o aviso de "mesma quadra" em `buscar_duplicados`. A consulta do lote, nas duas bases, é gravada por `app.registrar_consulta_lote` em `consultas_lote` (campo `base`), e planta e desenho são os documentos `lote_pdf` e `lote_dxf`.

**GeoSampa pelo SQL (São Paulo).** Na inscrição, "Buscar no GeoSampa" (automático ao cadastrar o SQL) consulta o servidor de camadas do Novo GeoSampa (`geoserver.geosampa.prefeitura.sp.gov.br`, WFS/WMS) pelo repasse do Caddy em `/geosampa`, porque o servidor só aceita chamadas de navegador vindas do próprio GeoSampa. Traz o lote fiscal (`lote_cidadao`: poligonal em UTM 23S SIRGAS 2000, áreas, uso, CIB, condomínio) e os atributos de cada camada que toca a poligonal (zoneamento das Leis 18.081 e 18.177, ZEIS, eixos, macroárea e fator de planejamento, operação urbana, mananciais, tombamento e áreas envoltórias, áreas contaminadas, melhoramento viário, faixa não edificável, córrego a até 50 m, risco, inundação, influência de Metrô e CPTM, vegetação significativa, zona fiscal). `app.registrar_consulta_lote` confere que o lote é o da inscrição, grava a consulta inteira (nunca alterada), completa só o que está vazio na inscrição (área cadastral) e o cadastro fiscal (CIB, zona fiscal) e, se pedido, registra uma análise urbanística nova com a área de cada zona no lote. Poligonal e áreas do terreno continuam passando por `app.salvar_terreno`. A planta (PDF, gerada pelo próprio servidor) e o desenho (DXF R12 com lotes, calçada, quadra, edificações, curvas de nível com cota e pontos cotados, montado no navegador) entram como documentos `lote_pdf` e `lote_dxf`, com versão. Testada, valor do m² e valor venal não estão no GeoSampa novo; continuam digitados por exercício em `inscricao_valores`.

**GeoSanja pela inscrição imobiliária (São José dos Campos).** Não há serviço público de camadas: a ficha usa a API do próprio site (`geo.sjc.sp.gov.br/v1`) com o token de visitante (`autenticar?token=VISITANTE`, vale um ano), pelo repasse do Caddy em `/geosanja` (o site não libera CORS). A busca pela inscrição (`localizar`, ferramenta `SearchICTool`) devolve só a poligonal do lote, sem área cadastral, uso nem endereço. As camadas liberadas ao visitante são lidas por `GetFeatureInfo` com raio cobrindo o lote e conferidas no navegador contra a poligonal: zona da LC 623 com a área no lote e o link da ficha da zona, macrozona, área de desenvolvimento estratégico, centralidade com o CA máximo, região, setor e subsetor, corredores, recarga de aquífero, parques e unidades de conservação, núcleos informais, risco de escorregamento e PMRR, linha de transmissão e ferrovia. A planta é montada no navegador (ortofoto de 8 cm, curvas e zoneamento, com o lote em vermelho, num PDF de uma página) e o DXF leva lote, arruamentos, curvas do IGC (1:10.000, cota como elevação) e zonas, em UTM 23S SIRGAS 2000. Fechadas ao visitante: atributos do lote, inundação, APAs estaduais e federais, bens tombados, loteamentos e circunscrição imobiliária. É uma API interna da prefeitura, que pode mudar sem aviso.

## 2. Ofertas, negociação, propostas e tarefas

```mermaid
erDiagram
  terrenos ||--o{ ofertas : recebe
  corretores |o--o{ ofertas : apresenta
  pessoas ||--o| corretores : e
  terrenos ||--o{ terreno_corretores : tem
  corretores ||--o{ terreno_corretores : atende
  terreno_partes ||--o{ parte_corretores : tem
  corretores ||--o{ parte_corretores : traz
  terrenos ||--o{ processos : "negociacao (e fases futuras)"
  processos ||--|| negociacoes : "dados da negociacao"
  processos |o--o{ processos : "negociacao de cada parte"
  terreno_partes |o--o{ processos : "negocia"
  ofertas ||--o{ oferta_partes : cobre
  terreno_partes ||--o{ oferta_partes : "preco da parte"
  ofertas |o--o{ negociacoes : "oferta de referencia"
  processos ||--o{ processo_transicoes : historico
  processos ||--o{ propostas : recebe
  propostas |o--o| propostas : "responde a"
  terrenos ||--o{ tarefas : tem
  processos |o--o{ tarefas : contextualiza
  terrenos ||--o{ atividades : registra
  processos |o--o{ viabilidades : usa
  terrenos ||--o{ diligencias : investiga
  pessoas |o--o{ ofertas : oferece
  terrenos ||--o{ reunioes : tem
  processos |o--o{ reunioes : "reunioes da negociacao"
  reunioes ||--o{ reuniao_participantes : participa

  ofertas {
    uuid id PK
    uuid terreno_id FK
    uuid corretor_id FK
    uuid ofertante_id FK
    date data_oferta
    numeric valor_pedido
    text forma_pagamento_pedida "5 opcoes"
    text observacao_pagamento
    text aceita_permuta
    numeric comissao_pct
    numeric comissao_valor
    date validade
    text status
    jsonb poligono_geojson "pedaco oferecido"
  }
  processos {
    uuid id PK
    text codigo "NEG-00012 (prefixo da fase)"
    text fase FK
    uuid terreno_id FK
    text etapa_atual
    text subetapa_atual
    timestamptz subetapa_desde
    text status "ativo | concluido | perdido | descartado | stand_by"
    text motivo_encerramento "codigo do motivo"
    text detalhe_encerramento "relato ou justificativa"
    text pontos_sucesso "compra"
    date retomar_em
    uuid responsavel_id FK
    uuid viabilidade_id FK
    uuid parte_id FK "negociacao de uma parte"
    uuid principal_id FK "negociacao do terreno"
  }
  oferta_partes {
    uuid oferta_id PK
    uuid parte_id PK
    numeric valor_pedido "da parte, se informado"
  }
  negociacoes {
    uuid processo_id PK
    uuid oferta_referencia_id FK
    smallint temperatura "1 a 5"
  }
  propostas {
    uuid id PK
    uuid processo_id FK
    int versao
    text origem "bkm | vendedor"
    uuid proposta_anterior_id FK
    date data_apresentacao
    date validade
    numeric valor_total
    text forma_pagamento
    text condicoes_pagamento
    text status "8 opcoes"
  }
  diligencias {
    uuid id PK
    uuid terreno_id FK
    uuid processo_id FK
    text categoria "documental | juridica | ambiental | ocupacional | tecnica | outra"
    text titulo
    text situacao "nao_avaliada | em_analise | pendente | resolvida | impeditiva"
    uuid evidencia_documento_id FK
    text providencia
  }
  entorno_categorias {
    text codigo PK "metro_trem | shopping | hospital"
    text nome
    text_arr tipos_google "tipos do Places"
    int raio_pe_m "1500"
    bool ativo
  }
  terreno_entorno_buscas {
    uuid terreno_id PK
    float latitude "coordenada usada na busca"
    float longitude
    bool rota_a_pe "false: valeu a linha reta"
    timestamptz buscado_em
  }
  terreno_ponto_distancias {
    uuid terreno_id PK
    uuid ponto_id PK
    float latitude "coordenada do terreno usada"
    float longitude
    int distancia_pe_m
    int distancia_carro_m
  }
  terreno_entorno {
    uuid id PK
    uuid terreno_id FK
    text categoria FK
    text google_place_id
    text nome
    int distancia_pe_m
    int duracao_pe_s
    int distancia_reta_m
  }
  pontos_interesse {
    uuid id PK
    text nome
    text categoria "transporte | escola | saude | comercio | lazer | empresa | outro"
    float latitude
    float longitude
  }
  reunioes {
    uuid id PK
    uuid terreno_id FK
    uuid processo_id FK
    text status "agendada | realizada | cancelada"
    timestamptz inicio
    text modalidade "presencial | online"
    text local "bkm | externo (so presencial)"
    text endereco
    text pauta
    text resumo
    text encaminhamentos
  }
  reuniao_participantes {
    uuid reuniao_id FK
    text lado "bkm | vendedor | corretor | outro"
    uuid user_id FK
    uuid pessoa_id FK
    text nome
  }
  tarefas {
    uuid id PK
    uuid terreno_id FK
    uuid processo_id FK
    text titulo
    uuid responsavel_id FK
    date prazo
    text status "pendente | em_andamento | aguardando_terceiro | concluida | cancelada"
    text prioridade
    text resultado
    float posicao "ordem no quadro de tarefas"
  }
```

## Mapa, dashboard e quadro de tarefas

| View / função | Para quê |
| --- | --- |
| `v_mapa` | um pin por terreno ativo, com `situacao_mapa` (sem negociação, etapa do processo atual, ou o status dele: concluido, perdido, descartado, stand by), a fase atual e as abertas (filtro por fase), a subetapa e a poligonal |
| `v_terrenos` (para os filtros) | além da ficha resumida: `uf` e `municipio_id`, `vgv` e `margem_pct` da viabilidade, `corretor_ids` (todos os corretores do terreno, inclusive os das partes), `proposta_ativa_valor` (última proposta apresentada, em análise ou aceita; dividido em partes, a soma das partes), `tem_partes`, `zonas_siglas` da análise vigente e `ultima_movimentacao_em` (atividade, reunião realizada ou passagem do funil). O mapa filtra pelos mesmos campos, cruzando `v_mapa` com `v_terrenos` pelo id |
| `filtros_salvos` | visões salvas dos filtros: nome e filtros (jsonb do front), pessoais (`user_id` de quem criou; só ele vê e muda) ou da empresa (`user_id` nulo; todos veem, só o administrador cria, muda ou apaga). Escrita direta, pela RLS |
| `v_terreno_pontos` | todos os pontos de interesse da empresa para cada terreno localizado: linha reta sempre; a pé e de carro pela rota quando medidos para a coordenada atual (`precisa_medir` quando não) |
| `salvar_distancias_pontos(terreno, lat, lng, itens)` | grava as distâncias pela rota (a pé e de carro) do terreno aos pontos da empresa; recusa coordenada diferente da atual |
| `distancia_km(lat1, lng1, lat2, lng2)` | haversine; rota de verdade vem do serviço de mapas |
| `salvar_entorno(terreno, lat, lng, itens, rota_a_pe)` | grava a busca do entorno feita no navegador (Places `searchNearby` por categoria + Routes `computeRouteMatrix` a pé), trocando a anterior; recusa coordenada diferente da atual, descarta categoria inativa e lugar além do raio a pé, e grava cada lugar uma vez |
| `v_terreno_entorno` | lugares do entorno com categoria, distância e tempo a pé e `desatualizado` (o terreno mudou de lugar depois da busca) |
| `v_entorno_buscas` | por terreno localizado: quando foi buscado, se a rota a pé respondeu e `precisa_buscar` (nunca buscado ou desatualizado) |
| `v_tarefas` | tarefa com código e nome do terreno e o atraso calculado; o quadro ordena por `status` e `posicao` |

Entorno do terreno: as categorias são configuração (`entorno_categorias`: tipos do Google e raio a pé; ligar outra categoria é migration de dados). O front busca sozinho quando o terreno é localizado ou muda de lugar (`precisa_buscar`) e grava por `salvar_entorno`. `pontos_interesse` é a lista cadastrada pela própria empresa (sede, polos, pontos marcados à mão): todos aparecem na ficha de cada terreno, com a distância a pé quando está a até 1,5 km a pé e de carro quando está mais longe (`terreno_ponto_distancias`).

O dashboard agrega `v_terrenos` no front (filtro cruzado por clique). A poligonal continua em `terrenos.poligono_geojson`; importar KMZ/KML é feito no front e gravado por `salvar_terreno`.

## Concorrência

Empreendimentos de outras empresas, marcados no mapa (decisão do Moisés, 24/out/2026). Cadastro sem regra de funil: escrita direta pelo front (Leitura só vê), com auditoria e isolamento por `empresa_id`.

```mermaid
erDiagram
  concorrentes ||--o{ concorrencia_empreendimentos : lanca
  concorrencia_empreendimentos ||--o{ concorrencia_tipologias : "plantas"
  concorrencia_tipologias ||--o{ concorrencia_precos : "preco por data de apuracao"
  municipios |o--o{ concorrencia_empreendimentos : localiza

  concorrentes {
    uuid id PK
    text nome "unico por empresa entre os ativos"
    text cnpj "14 digitos, opcional"
    bool ativo
  }
  concorrencia_empreendimentos {
    uuid id PK
    uuid concorrente_id FK
    text nome
    float latitude
    float longitude
    text endereco
    int unidades "nulo = nao informado"
    text situacao "lancamento | breve_lancamento | em_obras | pronto | usado | nao_informado"
    date data_lancamento
    date previsao_entrega
    text tipo "vertical | horizontal | unidade_avulsa | sobrado | loteamento | industrial | galpao"
    text finalidade "residencial | comercial | misto | nao_informado"
    text origem "manual | importado"
    text bairro
    bool ativo
  }
  concorrencia_tipologias {
    uuid id PK
    uuid empreendimento_id FK
    numeric area_privativa_m2
    smallint dormitorios "0 = studio"
    int unidades "nulo = nao informado"
    text faixa "his1 | his2 | hmp | r2v | nr | nao_informado"
    bool ativo
  }
  concorrencia_precos {
    uuid id PK
    uuid tipologia_id FK
    date apurado_em "unico por tipologia; nunca no futuro"
    numeric preco_medio
    text fonte "stand | site | corretor | portal | outra | nao_informado"
  }
```

- **Preço nunca é sobrescrito:** cada data de apuração é uma linha nova em `concorrencia_precos`; lançar de novo na mesma data corrige aquele valor. Um preço lançado errado pode ser apagado (fica na auditoria); empresa, empreendimento e tipologia são desativados.
- **Preço médio é o da unidade**, digitado pelo usuário; o sistema não distingue tabela de promoção. Não há preço por m² informado.
- **Preço por m² do empreendimento é calculado** (`app.concorrencia_resumo(data)`), com o último preço de cada tipologia ativa até a data: com as unidades de todas as tipologias precificadas, média ponderada pelo mix (soma de preço × unidades ÷ soma de área × unidades); faltando alguma, média simples do preço por m² das tipologias (`mix_completo = false`). Devolve também o período dos preços usados (`apurado_de`, `apurado_ate`) e as faixas.
- **Faixa social na tipologia**, não no empreendimento, porque um empreendimento mistura HIS, HMP e R2V.
- `v_concorrencia`: empreendimentos ativos com a empresa e o resumo de hoje; é o que o mapa e o quadro leem. `app.concorrencia_tipologias_em(data)`: cada tipologia com o preço vigente na data.
- O cadastro feito à mão não tem estoque nem velocidade: isso é o monitor. A concorrência perto do terreno na ficha e uma página de lista ficam para depois. Empreendimento `manual` não é alterado pela importação (`observacao` e `ativo` ficam).

## Monitor de mercado

Coleta de empreendimentos de outras empresas (spec definitiva do Moisés, 24/out/2026). A fonte é `orulo_api`, `orulo_planilha`, `orulo_login` ou `manual`. O empreendimento é o da concorrência; a unidade, o preço vigente e a venda nascem da coleta. Cada unidade é gravada e lida sozinha.

```mermaid
erDiagram
  empresas ||--|| mercado_config : configura
  empresas ||--o{ mercado_tipos_unidade : classifica
  empresas ||--o{ mercado_coletas : coleta
  mercado_coletas ||--o{ mercado_empreendimento_estados : "situacao vigente"
  mercado_coletas ||--o{ mercado_unidade_estados : "preco vigente"
  concorrencia_empreendimentos ||--o{ mercado_empreendimento_estados : historico
  concorrencia_empreendimentos ||--o{ mercado_unidades : tem
  mercado_unidades ||--o{ mercado_unidade_estados : historico
  mercado_unidades ||--o{ mercado_vendas : vende
  mercado_coletas ||--o{ mercado_vendas : confirma
  concorrencia_empreendimentos ||--o{ mercado_sugestoes_vinculo : "perto de um manual"
  mercado_ids_externos }o--|| concorrencia_empreendimentos : "id da fonte"
  mercado_ids_externos }o--|| mercado_unidades : "id da fonte"

  mercado_config {
    int meses_lancamento "padrao 6"
    int meses_recem_entregue "padrao 24"
    int dias_preco_lancamento "padrao 60"
    int dias_tabela_desatualizada "padrao 45"
    numeric cobertura_minima_pct "padrao 90"
    bool nr_conta_como_residencial "padrao true"
    uuid_array municipios "SP e SJC ao nascer"
  }
  mercado_coletas {
    uuid id PK
    text fonte
    text tipo "completa_mensal | lancamentos"
    date referencia "unica com empresa, fonte e tipo"
    text situacao "rodando | completa | incompleta | falhou"
    text bruto_caminho "empresa/mercado/referencia-tipo.json.gz"
    text_array tipos_desconhecidos
  }
  mercado_unidades {
    uuid id PK
    text torre_norm "sem torre, bloco, edificio"
    text numero_norm
    text tipo_unidade
    text tipo_fonte
    text tipologia_fonte "texto da fonte, so referencia"
    bool studio_nr
    bool residencial "calculado, nao e generated"
    numeric preco_primeiro
    bool preco_de_lancamento
    uuid vinculo_pendente_id
  }
  mercado_vendas {
    uuid id PK
    date vendida_de
    date vendida_ate
    numeric preco
    text origem_preco "ultimo_visto | estimado"
    bool antes_do_monitor
    uuid desfeita_coleta_id "distrato"
  }
```

- **Filtro em dois níveis.** O empreendimento entra se é vertical, finalidade residencial ou misto, município da config, com ao menos uma unidade residencial, e está em lançamento, breve lançamento ou obras — ou o lançamento cabe em `meses_lancamento`, ou está pronto com entrega dentro de `meses_recem_entregue`. Fora sempre: horizontal, unidade avulsa, sobrado, loteamento, industrial, galpão, usado, e empreendimento sem unidade residencial. Quem nunca passou não é gravado (`no_filtro` fica no estado de quem já passou um dia e saiu).
- **Unidade:** todas as do empreendimento que entrou são gravadas, com `tipo_unidade` e `residencial`. Conta e vista usam só `residencial = true`. O administrador completa `mercado_tipos_unidade`: apartamento, studio, cobertura, garden e duplex nascem residenciais; loja, sala, laje, vaga e depósito, não. Tipo desconhecido vira `nao_informado` (fora das contas) e o texto da fonte vai para `mercado_coletas.tipos_desconhecidos`. Studio com "- NR" segue `nr_conta_como_residencial` (padrão true). `tipologia_fonte` guarda o texto da fonte e não entra em conta. Preço `0,1` é sentinela: gravado nulo, com a marca `preco_sentinela`.
- **Coleta.** Única por `(empresa_id, fonte, tipo, referencia)`. `bruto_caminho` é `{empresa_id}/mercado/{referencia}-{tipo}.json.gz`. Abrir a mesma chave desfaz o que aquela coleta gravou e recomeça. Cobertura e a mensal completa anterior são da **mesma fonte**: API, planilha e login são séries diferentes. Incompleta (cobertura abaixo do mínimo, contra `esperados` ou contra a mensal anterior) não gera venda nem marca remoção. Remoção só na mensal completa, para unidade que sumiu de um empreendimento que veio nesta coleta. Coleta de lançamentos atualiza quem veio e não remove nem vende no fechamento.
- **Venda.** `vendida_de` é a última data em que a unidade estava disponível ou reservada; `vendida_ate` é a referência da mensal completa que confirma. A foto anterior é a última situação aberta por uma mensal completa da mesma fonte com referência até a mensal completa anterior: incompleta no meio muda o estado, mas não apaga a passagem. `ultimo_visto` é o preço não nulo mais recente. `antes_do_monitor` é a unidade vista já vendida, sem disponível ou reservada antes; o preço é a mediana do preço/m² das disponíveis residenciais do mesmo empreendimento, mesmos dormitórios e vagas, área até 3% diferente, vezes a área da unidade. Os 3% são desta regra da venda. Voltar a disponível ou reservada preenche `desfeita_coleta_id`.
- **Vínculo.** No fechamento da mensal completa, unidade que sumiu e outra que apareceu com a mesma área, o mesmo andar e preço a até 5% ficam com `vinculo_pendente_id` e a antiga não é removida. `confirmar_vinculo_unidade(id, true)` funde na antiga e leva o id de fora; `false` fica com a nova e marca a antiga como removida.
- **Contas.** `mercado_estoque`, `mercado_precos`, `mercado_velocidade` (VSO = vendas ÷ (estoque no início do mês + lançadas); mês sem mensal completa não tem velocidade; `antes_do_monitor` fica de fora) e `mercado_lancamentos` (`lancamento`, `entrou_na_base`, `saiu_breve`). Cada unidade residencial entra sozinha. Os níveis são empreendimento, incorporadora, bairro, dormitórios e município; `cidade` vale como município. A variação de preço compara a mesma unidade entre as datas e soma no nível pedido. `v_mercado_unidades` e `v_mercado_empreendimentos` são `security_invoker` e só mostram unidade residencial não removida.
- **Escrita** só por `importar_mercado`, `fechar_coleta_mercado` e `confirmar_vinculo_unidade` (`security definer`), administrador ou `service_role`. Leitura pela RLS de `app.minhas_empresas()`. Configuração por `salvar_config_mercado` e `salvar_tipo_unidade_mercado`. Empresa nova nasce com a config e os tipos; São Paulo e São José dos Campos entram em `municipios`.

## 3. Documentos

```mermaid
erDiagram
  terrenos ||--o{ documentos : guarda
  processos |o--o{ documentos : "checklist da etapa"
  propostas |o--o{ documentos : anexa
  reunioes |o--o| documentos : "ata"
  tipos_documento ||--o{ documentos : classifica
  documentos ||--o{ documento_versoes : "cada envio"
  documentos {
    uuid id PK
    uuid terreno_id FK
    uuid processo_id FK
    uuid proposta_id FK
    uuid reuniao_id FK
    text tipo_documento FK
    text nome
    date emitido_em
    text situacao "recebido | validado | rejeitado"
  }
  documento_versoes {
    uuid id PK
    uuid documento_id FK
    int versao
    text storage_path
    text nome_arquivo
    text texto_extraido "base para busca e IA"
  }
```

## Regras que o modelo garante

| Regra | Onde |
| --- | --- |
| "Não informado" é null ou `nao_informado`, nunca zero ou "não" | defaults e checks de `terrenos`, `terreno_infraestrutura` |
| Área adotada sempre com a fonte | check em `terrenos` |
| Área da poligonal calculada pelo desenho (m² inteiros); com a fonte `poligonal`, a adotada acompanha cada ajuste (pedido do Moisés, 24/out/2026) | coluna gerada `area_poligonal_m2` e trigger `t_norm` em `terrenos` |
| Gabarito (m e pavimentos) e CA têm estado próprio: não informado, limitado (com valor) ou sem limite identificado | checks em `analise_zoneamentos` |
| Uma análise urbanística vigente por terreno; anteriores preservadas | índice único parcial + trigger |
| Valor venal e IPTU por inscrição e exercício; correção vira nova revisão, a anterior fica preservada | `inscricao_valores` + trigger |
| Consulta do lote na base da prefeitura (GeoSampa, GeoSanja) só pela RPC, conferindo que o lote é o da inscrição e que o terreno é da cidade da base; nunca alterada; completa só campos vazios | `app.registrar_consulta_lote` |
| Inscrição escolhida numa cidade só entra em terreno dessa cidade | trigger `tg_inscricao_municipio` |
| Isento não tem IPTU; venal do imóvel = terreno + construção quando os dois existem | checks em `inscricao_valores` |
| Edição simultânea: salvar com versão antiga é recusado | `terrenos.versao` + `salvar_terreno` |
| Participações dos proprietários somam no máximo 100% (em cada parte) | trigger em `terreno_pessoas` |
| Matrícula, inscrição, pessoa e oferta só se ligam a parte ativa do mesmo terreno | triggers `tg_parte_do_terreno`, `tg_oferta_parte` |
| Terreno de vários donos só fica Comprado com todas as partes ativas compradas; negociação dividida não se move à mão | `_pendencias`, `_conferir_movimento`, `_sincronizar_principal` |
| Parte sai com motivo, só com a negociação dela encerrada e nunca depois de comprada; essencial só com gestor ou diretor | `remover_parte`, `salvar_parte` |
| Registro não muda de terreno depois de criado | `tg_mesma_empresa` |
| Diligência impeditiva em aberto impede a compra; checklist da etapa para sair dela; pré-requisitos para entrar | `_pendencias` |
| Etapa, subetapa e status só mudam por RPC, com transição no histórico; aprovações configuradas viram pedido | `_passagem`, `decidir_aprovacao` |
| Um pedido de aprovação aberto por processo e nível; com pedido aberto o card não se move | índice único parcial em `aprovacoes` |
| Superior sempre um nível acima; ao menos um administrador por empresa | trigger em `membros` |
| Configuração do funil só pelo administrador, por empresa, com auditoria | RLS só de leitura + RPCs com `exigir_administrador` |
| Mudanças seguidas do mesmo usuário nas mesmas colunas, a menos de 7 s uma da outra (2 minutos quando é um ajuste na poligonal do terreno), viram um log só (valor de antes → final); se voltam ao valor de antes, o log some. Grava na hora; processos ficam de fora (cada passagem conta no SLA), mas a temperatura junta igual no histórico | `juntar_auditoria`, `janela_log`, `definir_temperatura` |
| Desfazer uma alteração da ficha pelo log (lixeira): só quem fez, os superiores dessa pessoa ou o administrador, e só enquanto os campos ainda têm os valores dela; o log original fica marcado (`desfeito_em`, `desfeito_por`) e a volta é um log novo que aponta para ele (`desfaz_id`); nada é apagado. O olhinho é só uma prévia na tela | `desfazer_alteracao` |
| Motivo de Perdido e Descartado vem da lista ativa; Comprado exige relato e pontos de sucesso | `encerrar_processo` + checks em `processos` |
| Papel "leitura" consulta tudo e não altera nada | políticas com `empresas_edicao()` e `exigir_editor` |
| CEP e CPF/CNPJ guardados só com dígitos; polígono GeoJSON validado | triggers e check |
| Terreno só existe com poligonal; poligonal que ocupa parte de outro terreno (além da folga de 5 m na divisa) só entra confirmada | check em `terrenos`, `app.sobreposicao`, trigger `t_sobre` |
| Pedaço oferecido fica dentro do terreno | `registrar_oferta` |
| Mesma matrícula no mesmo cartório = mesmo terreno | índice único em `matriculas` |
| Um corretor principal por terreno; o primeiro da oferta vira principal | índice único parcial + trigger |
| Uma negociação aberta (ativa ou em stand by) por terreno e fase; uma por parte | índices únicos parciais em `processos` |
| Reunião presencial tem local (BKM ou externo); online não; realizada não tem data futura | checks e trigger em `reunioes` |
| Ata só de reunião realizada do mesmo terreno; uma ata por reunião, nova ata vira versão | `registrar_documento` + índice único |
| Contraproposta do outro lado recusa a anterior; nova do mesmo lado a substitui | `registrar_proposta` |
| "Atrasada" é calculada (prazo vencido e status aberto) | `v_terrenos` |
| Documento de checklist reaproveitado; versões nunca sobrescritas | `registrar_documento` |
| Terreno nunca é apagado: arquiva com motivo, só sem negociação aberta | `arquivar_terreno` |
| Monitor: empreendimento que nunca passou no filtro não entra; unidade entra sempre e só a residencial conta, uma a uma | `_mercado_passa_filtro`, `mercado_tipos_unidade`, `nr_conta_como_residencial` |
| Monitor: venda e remoção só na mensal completa; a foto da passagem ignora a incompleta | `fechar_coleta_mercado` |
| Monitor: escrita só pelas três RPCs | `importar_mercado`, `fechar_coleta_mercado`, `confirmar_vinculo_unidade` |
