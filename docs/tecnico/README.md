# Manual técnico do BKM Terrenos

Este manual é para quem vai **desenvolver, manter ou evoluir** o BKM Terrenos: uma pessoa desenvolvedora que assume o projeto ou um agente de IA que vai trabalhar nele. Ele explica como o sistema é montado, por que foi montado assim, onde fica cada coisa e como mexer sem quebrar.

Retrato de **8 de novembro de 2026**. O que mudar daqui em diante entra no [CHANGELOG](CHANGELOG.md) e no arquivo do assunto (ver [Como manter este manual](como-manter.md)).

> O manual **de uso** (para quem usa o sistema, com roteiros de vídeo de onboarding) é outro documento, feito em paralelo. Este aqui é só o técnico.

## Por onde começar

Se você acabou de chegar, leia nesta ordem:

1. [Arquitetura](arquitetura.md): o que é o sistema, as peças, como conversam e as 11 regras que não se quebram.
2. [Glossário do domínio](#glossário-do-domínio) (abaixo): sem ele, os nomes do código não fazem sentido.
3. [Ambientes e deploy](deploy-e-ambientes.md): onde roda, como uma mudança chega ao ar, como voltar atrás.
4. O assunto em que você vai mexer: [banco](banco.md), [funções do banco](funcoes.md), [front](front.md), [integrações](integracoes.md) ou [protótipo](prototipo.md).
5. [Segurança](seguranca.md): os riscos conhecidos e o checklist para não abrir brecha nova.
6. [Como manter](como-manter.md): o que atualizar a cada mudança.

Fontes que este manual **não repete** e que continuam valendo:

| Arquivo | O que tem | Quando ler |
| --- | --- | --- |
| `CLAUDE.md` (raiz) | A especificação viva: cada tela e cada decisão do Moisés, com data. É longo (127 mil caracteres). | Antes de mudar qualquer comportamento de tela. |
| `docs/modelo.md` | O modelo de dados com diagramas, seção por assunto. | Antes de mudar tabela ou regra do banco. |
| `docs/adr/` | Decisões de arquitetura (front reescrito em React; tarefas em banco próprio). | Antes de propor mudança estrutural. |
| `docs/tarefas-arquitetura.md` | Plano do sistema de tarefas separado (`bkm_tarefas`). | Antes de mexer no esquema `fluxo`. |
| `tools/prototipo/README.md` | Como gerar e testar o protótipo. | Antes de mexer em `tools/prototipo/`. |

## Índice

| Arquivo | Assunto |
| --- | --- |
| [arquitetura.md](arquitetura.md) | Visão geral, componentes, fluxos de dados, regras de arquitetura, estado do porte |
| [banco.md](banco.md) | Esquemas, migrations, modelo de segurança, auditoria, fases e processos, tarefas, PostGIS, rotinas |
| [funcoes.md](funcoes.md) | Catálogo das funções (RPC) do banco, por assunto e por papel |
| [testes-banco.md](testes-banco.md) | Testes de SQL, shim do Supabase, como fazer uma mudança no banco de ponta a ponta |
| [front.md](front.md) | `apps/web`: pastas, rotas, sessão, dados, ficha, mapa, estilos, armazenamento do navegador |
| [prototipo.md](prototipo.md) | O protótipo navegável: para que serve, como gerar, a regra de congelar tela por tela |
| [integracoes.md](integracoes.md) | Google (Maps, Places, Routes, Elevation), GeoSampa, GeoSanja, IBGE, Órulo, ferramentas de dados |
| [deploy-e-ambientes.md](deploy-e-ambientes.md) | Cloud Run, Cloud Build, Caddy, variáveis, banco de produção, GitHub Actions, voltar versão |
| [seguranca.md](seguranca.md) | Avaliação de segurança de 8/nov/2026: modelo de ameaça, achados por gravidade, correções, checklist |
| [historico.md](historico.md) | Linha do tempo do projeto de 20/out a 8/nov/2026 |
| [como-manter.md](como-manter.md) | O que cada mudança precisa atualizar, e a regra para todas as threads |
| [CHANGELOG.md](CHANGELOG.md) | Registro das mudanças, a partir deste manual |

## Glossário do domínio

O código usa os nomes do negócio, em português. Os principais:

| Termo | O que é | No banco |
| --- | --- | --- |
| **BKM** | Incorporadora de habitação popular (Minha Casa Minha Vida, MCMV). É a empresa dona do sistema. | `app.empresas` |
| **Terreno** | A área estudada para comprar. Nasce sempre de uma **poligonal** desenhada no mapa. Tem código de uma letra e três dígitos (A001 ... Z999, sem I e O). | `app.terrenos` |
| **Poligonal** | O contorno do terreno no mapa (geometria PostGIS). | `terrenos.poligono_geojson` (e a coluna gerada `poligono`, PostGIS) |
| **Oferta** | Cada vez que alguém oferece o terreno (ou parte dele), com valor pedido, forma de pagamento e permuta. Um terreno tem várias ofertas ao longo do tempo. | `app.ofertas` |
| **Fase** | Grande etapa da vida do terreno: Novos Negócios, Aprovação de Projetos, Registro de Incorporação, Funding, Contratação Caixa, Lançamento, Obras, Entregue. Configurável. | `app.fases_modelo` |
| **Processo** | A passagem do terreno por uma fase. No máximo um aberto por fase; fases diferentes podem correr juntas. | `app.processos` |
| **Etapa / subetapa** | Os passos dentro de uma fase (funil). Configuráveis pelo administrador. | `app.etapas_modelo`, `app.subetapas_modelo` |
| **Negociação** | O processo da fase de entrada (Novos Negócios). É o único com propostas (a temperatura é do terreno desde 9/nov/2026). | processo da fase `entrada` |
| **Parte** | Quando vários donos vendem pedaços do mesmo terreno e negociam separado, cada um é uma parte, com negociação própria. Todo terreno nasce com a parte "Vendedor 1". | `app.terreno_partes` |
| **Matrícula** | O registro do imóvel no cartório. | `app.matriculas` |
| **SQL** | Em São Paulo, o número do cadastro do lote na prefeitura (Setor-Quadra-Lote), usado no IPTU. Em São José dos Campos, "inscrição imobiliária". **Não tem relação com a linguagem SQL.** | `app.inscricoes_municipais` |
| **GeoSampa / GeoSanja** | Os mapas oficiais das prefeituras de São Paulo e de São José dos Campos, de onde vêm lote, zona e restrições. | proxies `/geosampa`, `/geosanja` |
| **Zona, CA, TO, gabarito** | Parâmetros urbanísticos da lei de zoneamento: zona do lote, coeficiente de aproveitamento (quanto se pode construir), taxa de ocupação, altura. | `app.zona_parametros` |
| **HIS / HMP / Mercado** | Tipos de empreendimento: habitação de interesse social, de mercado popular, e de mercado. Cada um tem CA próprio na lei. | idem |
| **VGV** | Valor geral de vendas: a soma do preço de todas as unidades de um projeto. | viabilidade |
| **Estudo de massa** | O desenho preliminar do que cabe no terreno (tipologias, áreas), feito por um arquiteto. | `app.estudos_massa` |
| **Viabilidade** | A conta de quanto o empreendimento dá de lucro (VGV, custos, DRE). | `app.viabilidades` |
| **Jornada** | O que cada etapa pede para entrar e sair (perguntas, documentos, tarefas, regras). | `app.jornada_itens` |
| **Concorrência / Mercado** | Empreendimentos de outras incorporadoras, coletados do Órulo pelo monitor de mercado. | `public.im_*` (outro sistema) |
| **Setor censitário** | A menor área do Censo do IBGE; usado para renda e densidade do entorno. | `app.setores_censitarios`, `app.setor_valores` |
| **Papéis** | Diretor, Gestor, Analista, Leitura, Básico; mais a marca Administrador. | `app.membros` |
| **Protótipo** | Uma página HTML única que simula todo o sistema no navegador, usada como especificação das telas. | `docs/prototipo.html` |
| **Porte** | A reescrita, tela por tela, do protótipo para o sistema real em React. | `apps/web` |
