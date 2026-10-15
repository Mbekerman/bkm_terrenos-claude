# Modelo de dados

Gerado a partir de `supabase/migrations/`. Campos de auditoria (`criado_*`, `atualizado_*`) e `empresa_id` (presente em todas as tabelas da empresa) foram omitidos. Tudo no schema `app`.

## Etapas da negociação

`Recebido → Viabilidade inicial → Negociação → Proposta → Contraproposta → Negociações comerciais → Minutagem → Ganha`. Perdida e Stand By são **status**, não etapas: acontecem em qualquer ponto e guardam a etapa em que parou.

| Para sair de | Exige |
| --- | --- |
| Viabilidade inicial | estudo de viabilidade vinculado |
| Proposta | proposta registrada |
| Negociações comerciais | última proposta aceita; entrar em Minutagem é aprovação de compra (gestor) |
| Minutagem | certidões e minuta validadas, nenhuma diligência impeditiva; virar Ganha exige gestor |

## 1. Terreno e cadastro do imóvel

```mermaid
erDiagram
  municipios ||--o{ terrenos : localiza
  municipios ||--o{ zoneamentos : define
  municipios ||--o{ eixos_comerciais : contem
  eixos_comerciais |o--o{ terrenos : classifica
  terrenos ||--o{ matriculas : possui
  terrenos ||--o{ inscricoes_municipais : possui
  inscricoes_municipais ||--o{ inscricao_valores : "valor venal e IPTU por exercicio e revisao"
  terrenos ||--o{ confrontacoes : mede
  terrenos ||--o{ terreno_pessoas : vincula
  pessoas ||--o{ terreno_pessoas : participa
  terrenos ||--o{ terreno_infraestrutura : verifica
  itens_infraestrutura ||--o{ terreno_infraestrutura : item
  terrenos ||--o{ analises_urbanisticas : analisa
  analises_urbanisticas ||--o{ analise_zoneamentos : "uma porcao por zona"
  zoneamentos ||--o{ analise_zoneamentos : aplica
  areas_interesse ||--o{ area_interesse_terrenos : agrupa
  terrenos ||--o{ area_interesse_terrenos : integra

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
    jsonb poligono_geojson
    text precisao_localizacao
    numeric area_documental_m2
    numeric area_cadastral_m2
    numeric area_levantamento_m2
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
  }
  inscricoes_municipais {
    uuid id PK
    uuid terreno_id FK
    text inscricao "SQL"
    numeric area_cadastral_m2
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
  terreno_pessoas {
    uuid terreno_id FK
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

## 2. Ofertas, negociação, propostas e tarefas

```mermaid
erDiagram
  terrenos ||--o{ ofertas : recebe
  corretores |o--o{ ofertas : apresenta
  pessoas ||--o| corretores : e
  terrenos ||--o{ terreno_corretores : tem
  corretores ||--o{ terreno_corretores : atende
  terrenos ||--o{ processos : "negociacao (e fases futuras)"
  processos ||--|| negociacoes : "dados da negociacao"
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
  }
  processos {
    uuid id PK
    text codigo "NEG-00012"
    text tipo "negociacao"
    uuid terreno_id FK
    text etapa_atual
    text status "ativo | ganha | perdida | stand_by"
    uuid responsavel_id FK
    uuid viabilidade_id FK
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
  }
```

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
| Gabarito (m e pavimentos) e CA têm estado próprio: não informado, limitado (com valor) ou sem limite identificado | checks em `analise_zoneamentos` |
| Uma análise urbanística vigente por terreno; anteriores preservadas | índice único parcial + trigger |
| Valor venal e IPTU por inscrição e exercício; correção vira nova revisão, a anterior fica preservada | `inscricao_valores` + trigger |
| Isento não tem IPTU; venal do imóvel = terreno + construção quando os dois existem | checks em `inscricao_valores` |
| Edição simultânea: salvar com versão antiga é recusado | `terrenos.versao` + `salvar_terreno` |
| Participações dos proprietários somam no máximo 100% | trigger em `terreno_pessoas` |
| Registro não muda de terreno depois de criado | `tg_mesma_empresa` |
| Diligência impeditiva em aberto bloqueia a saída da Minutagem | `checar_avanco` |
| Papel "leitura" consulta tudo e não altera nada | políticas com `empresas_edicao()` e `exigir_editor` |
| CEP e CPF/CNPJ guardados só com dígitos; polígono GeoJSON validado | triggers e check |
| Mesma matrícula no mesmo cartório = mesmo terreno | índice único em `matriculas` |
| Um corretor principal por terreno; o primeiro da oferta vira principal | índice único parcial + trigger |
| Uma negociação aberta (ativa ou em stand by) por terreno | índice único parcial em `processos` |
| Reunião presencial tem local (BKM ou externo); online não; realizada não tem data futura | checks e trigger em `reunioes` |
| Ata só de reunião realizada do mesmo terreno; uma ata por reunião, nova ata vira versão | `registrar_documento` + índice único |
| Contraproposta do outro lado recusa a anterior; nova do mesmo lado a substitui | `registrar_proposta` |
| "Atrasada" é calculada (prazo vencido e status aberto) | `v_terrenos` |
| Documento de checklist reaproveitado; versões nunca sobrescritas | `registrar_documento` |
| Terreno nunca é apagado: arquiva com motivo, só sem negociação aberta | `arquivar_terreno` |
