# Banco de dados do BKM Terrenos

Este arquivo explica como o banco do BKM Terrenos está montado e por quê, para quem vai mantê-lo ou evoluí-lo sem nunca ter visto o projeto: uma pessoa desenvolvedora ou um agente de IA. Ele não repete o modelo de dados tabela por tabela: isso está em [`docs/modelo.md`](../modelo.md), com diagramas, e este arquivo aponta para a seção certa de lá. O catálogo de todas as funções está em [funcoes.md](funcoes.md), e como testar e fazer uma mudança está em [testes-banco.md](testes-banco.md).

Retrato de **8 de novembro de 2026**, feito a partir das 19 migrations em `supabase/migrations/`, dos testes em `supabase/tests/` e de um banco montado do zero com elas. Quando este texto diz "a conferir", é porque a informação não pôde ser confirmada no código.

## Resumo em dez linhas

1. É um Postgres do **Supabase** (Postgres + Auth + Storage + Realtime). O front fala com ele direto pelo `supabase-js`, sem servidor de aplicação no meio: por isso toda proteção mora no próprio banco.
2. Tudo do sistema fica no esquema **`app`**; quadros e tarefas ficam no esquema **`fluxo`**. O esquema `public` é de outro sistema (o monitor de mercado) e **nunca** é tocado daqui.
3. Toda tabela de negócio tem **`empresa_id`** e **RLS**: cada pessoa só enxerga as empresas de que é membro (`app.minhas_empresas()`).
4. **Regra de negócio mora no banco**, em funções chamadas por RPC. Onde há regra (funil, propostas, documentos, ficha do terreno), o front não tem permissão de `update`: só chama a função.
5. Quem pode o quê vem do **papel** (`diretor`, `gestor`, `analista`, `leitura`, `basico`), da marca **`administrador`** e da hierarquia **`superior_id`**, todos em `app.membros`.
6. Quase toda alteração vira uma linha em **`app.auditoria`** por trigger; o funil tem o próprio histórico em **`app.processo_transicoes`**, base do SLA.
7. O terreno passa por **fases** (Novos Negócios, Aprovação, ...). Cada fase é um **processo** com etapas, subetapas e status. A fase de entrada é a **negociação**.
8. A poligonal do terreno é **PostGIS**; a sobreposição entre terrenos é conferida no banco.
9. Uma **rotina diária** (`app.rotina_diaria`, pelo pg_cron) gera lembretes, avisos de atraso, recorrências e automações de tarefas.
10. "Não informado" **nunca** vira zero nem "não"; o que muda com o tempo ganha **histórico**, não sobrescrita.

## Estado atual do banco (8/nov/2026)

- **Existe banco no Supabase.** Em 5/nov/2026 o workflow `.github/workflows/banco.yml` aplicou todas as migrations e a carga `supabase/carga/bkm.sql` no projeto **BKM_Desenvolvimento_Imobiliario**, o mesmo do monitor de mercado (commits `ff9e119`, `056895b`, `6710076`, `c92bc1a`, todos com `[aplicar-banco]`). Esse projeto é o de **produção**, mas até o "primeiro uso de verdade" o desenvolvimento acontece nele mesmo, só nos esquemas `app` e `fluxo` (CLAUDE.md, "Ambientes" › Banco). Detalhes do projeto e das variáveis em [deploy-e-ambientes.md](deploy-e-ambientes.md).
- **As migrations continuam sendo editadas no lugar.** Isso vale até o primeiro uso: na véspera, `app` e `fluxo` são apagados e recriados limpos, e a partir daí toda mudança é migration nova. Enquanto isso, cada mudança de estrutura é aplicada ao banco vivo por um SQL avulso que o **Moisés roda no SQL Editor** do Supabase; as threads de desenvolvimento só leem o banco vivo. Ver o passo a passo em [testes-banco.md](testes-banco.md).
- **Consequência prática:** o banco vivo pode estar atrás do repositório. Uma função criada numa migration depois de 5/nov só existe lá se o SQL avulso dela foi rodado. O front da ficha se protege disso (`app.ficha_dados` ausente cai nos pedidos separados), mas outras telas não. Não há no repositório um registro de quais SQLs avulsos já foram rodados (a conferir com o Moisés).
- **Números do banco montado do zero:** 96 tabelas e 25 views no `app`; 37 tabelas e 4 views no `fluxo`; 377 funções (266 no `app`, 111 no `fluxo`); 266 políticas de RLS. A suíte de testes tem 1.262 verificações (`ok ...`).

## Esquemas

| Esquema | De quem é | O que tem | Quem cria |
| --- | --- | --- | --- |
| `app` | BKM Terrenos | terrenos, funil, negociação, documentos, viabilidade, notificações, configuração, usuários | migrations deste repositório |
| `fluxo` | BKM Terrenos, hoje; depois `bkm_tarefas` | quadros, listas, cartões, cronograma, aprovações, automações das tarefas | `20261015000150_fluxo.sql` |
| `extensions` | Supabase | `pgcrypto`, `postgis` (e o `pg_cron` cria o esquema `cron`) | `20261015000100_base.sql:10-12` |
| `auth` | Supabase Auth | `auth.users`, `auth.uid()` | o Supabase (no teste, o shim) |
| `storage` | Supabase Storage | `storage.objects`, `storage.buckets` | o Supabase; o bucket `documentos` vem de `20261015000600_storage.sql` |
| `public` | **monitor de mercado** (`Mbekerman/bkm-monitor-mercado`) | tabelas `im_*` do Órulo, `public.im_tabela_empreendimento` | o coletor do monitor; **nunca este repositório** |

### Por que dois esquemas, `app` e `fluxo`

O `fluxo` é o "Trello da BKM": quadros e tarefas que não conhecem terreno. O quadro aponta para o objeto que acompanha por `objeto_tipo` e `objeto_id`, sem chave estrangeira (`fluxo.quadros`, `20261015000150_fluxo.sql:47`), e a pergunta "esta pessoa vê o objeto?" é feita a uma função que o app registra em `fluxo.objeto_tipos` (no BKM, `app.ve_terreno`, `20261015000300_terrenos.sql:889-894`). A separação existe para que outros apps da BKM possam usar os mesmos quadros sem herdar o modelo de terrenos.

A separação ainda é parcial: o `fluxo` usa peças do `app` (`app.empresas`, `app.membros`, `app.minhas_empresas()`, `app.tg_auditoria`, `app._notificar` por meio de `fluxo._avisar`). Em 4/nov/2026 o Moisés decidiu tirar as tarefas deste banco (ver "Tarefas: o esquema fluxo e a saída para o bkm_tarefas" abaixo).

Os dois esquemas precisam estar em **Settings › API › Exposed schemas** no Supabase para o PostgREST enxergá-los (`supabase.schema('fluxo')` no front).

### O esquema public é do monitor: nunca tocar

O projeto Supabase é compartilhado com o monitor de mercado, que coleta os empreendimentos do Órulo nas tabelas `public.im_*` e mantém funções como `im_agrupar`, `im_reagrupar` e `im_tabela_empreendimento`. O BKM Terrenos só **lê** isso: o front chama `public.im_tabela_empreendimento(p_id)` (`apps/web/src/mapa/Concorrencia.tsx:247`) e o retrato `docs/dados/mercado.json` é gerado por `tools/mercado/`. Nenhuma migration deste repositório cria, altera ou apaga nada no `public`, e o workflow `banco.yml` só confere `app` e `fluxo`. Motivos: um erro ali quebra outro sistema em produção, e o monitor tem o seu próprio repositório e as suas próprias regras (grupos estáveis, vendas por época). Mudança no monitor se faz no repositório dele.

## As migrations, em ordem

Os arquivos rodam em ordem alfabética (é o que o `run.sh` e o `banco.yml` fazem). O prefixo `20261015...` é o mesmo dia para todos porque o esquema ainda é editado no lugar; o número final só dá a ordem. Os cabeçalhos internos usam outra numeração ("0001", "0002b", "00150"), que não importa.

| Arquivo | O que cria | Principais tabelas | Principais funções |
| --- | --- | --- | --- |
| `20261015000100_base.sql` (311 linhas) | esquema `app`, extensões, empresas e equipe, funções de acesso, auditoria | `empresas`, `membros`, `auditoria` | `minhas_empresas`, `empresas_edicao`, `papel`, `eh_gestor`, `eh_administrador`, `eh_diretoria`, `eh_superior`, `exigir_editor`, `exigir_administrador`, `exigir_membro`, `criar_empresa`, `tg_auditoria`, `juntar_auditoria`, `janela_log`, `tg_atualizado_em` |
| `20261015000150_fluxo.sql` (3.295) | todo o módulo de tarefas, em blocos 1 a 5b | `quadros`, `listas`, `tarefas`, `checklists`, `comentarios`, `vinculos`, `linhas_base`, `modelos_quadro`, `aprovacoes`, `pausas`, `tarefa_acessos`, `grupos`, `campos`, `tarefa_itens`, `recorrencias`, `apontamentos`, `automacoes` | `quadro_de`, `papel_tarefa`, `edita_tarefa`, `pedir_aprovacao`, `pausar`, `enviar_cronograma`, `aplicar_modelo`, `copiar_tarefa`, `disparar_automacoes`, `gerar_recorrencias` |
| `20261015000200_cadastros.sql` (571) | cadastros comuns e configuração do funil por empresa, com o modelo padrão | `municipios`, `zoneamentos`, `bases_cadastrais`, `itens_infraestrutura`, `tipos_documento`, `fases_modelo`, `fase_dependencias`, `etapas_modelo`, `subetapas_modelo`, `status_modelo`, `prerequisitos_modelo`, `checklist_modelo`, `motivos_encerramento`, `entorno_categorias`, `pontos_interesse`, `pessoas`, `corretores` | `tg_copiar_configuracao` (empresa nova copia o padrão) |
| `20261015000250_municipios.sql` (5.616) | carga dos 5.571 municípios do IBGE | (dados) | `normaliza_nome`, `municipio_por_nome` |
| `20261015000260_parametros_urbanisticos.sql` (312) | catálogo de parâmetros da lei por zona e tipo (SP e SJC) | `zona_parametros` | (carga) |
| `20261015000300_terrenos.sql` (973) | terreno e tudo que descreve o imóvel; partes; poligonal; RLS das tabelas do terreno | `terrenos`, `terreno_partes`, `matriculas`, `inscricoes_municipais`, `matricula_partes`, `inscricao_partes`, `consultas_lote`, `consultas_area`, `inscricao_valores`, `terreno_pessoas`, `terreno_corretores`, `terreno_infraestrutura`, `terreno_viabilidades_tecnicas`, `analises_urbanisticas`, `analise_zoneamentos`, `terreno_entorno`, `topografia_config` | `geojson_poligono_valido`, `sobreposicao`, `ve_terreno`, `tg_terreno_sobreposicao`, `tg_terreno_quadro`, `tg_terreno_parte_inicial`, `tg_mesma_empresa` |
| `20261015000400_negociacao.sql` (522) | ofertas, processos (fases), negociação, propostas, reuniões, documentos | `ofertas`, `oferta_partes`, `viabilidades`, `processos`, `negociacoes`, `processo_transicoes`, `aprovacoes`, `propostas`, `proposta_partes`, `atividades`, `reunioes`, `reuniao_participantes`, `diligencias`, `documentos`, `documento_versoes` | `codigo_terreno`, `tg_terreno_controle`, `tg_vinculos_empresa` |
| `20261015000500_regras.sql` (3.005) | as views de leitura e quase todas as RPCs de regra | 19 views: `v_terrenos`, `v_mapa`, `v_partes`, `v_inscricoes`, `v_documentos`, `v_checklist`, `v_periodos_processo`, `v_tempo_subetapas`, `v_aprovacoes`... | `salvar_terreno`, `desfazer_alteracao`, `registrar_oferta`, `abrir_negociacao`, `abrir_fase`, `_passagem`, `mover_etapa`, `mover_para_etapa`, `mover_subetapa`, `encerrar_processo`, `decidir_aprovacao`, `registrar_proposta`, `registrar_documento`, `salvar_parte`, `registrar_consulta_lote`, configuração do funil (`salvar_fase`, `salvar_etapa`...) |
| `20261015000600_storage.sql` (19) | bucket privado `documentos` e as políticas do Storage | (Storage) | |
| `20261015000700_notificacoes.sql` (531) | notificações, lembretes, rotina diária, visões salvas dos filtros, Realtime e pg_cron | `tipos_notificacao`, `preferencias_notificacao`, `notificacoes`, `lembretes`, `filtros_salvos` | `_notificar`, `rotina_diaria`, `marcar_notificacao_lida`, `configurar_notificacao`; troca `fluxo._avisar` |
| `20261015000800_concorrencia.sql` (180) | concorrência cadastrada à mão (hoje desligada na tela) | `concorrentes`, `concorrencia_empreendimentos`, `concorrencia_tipologias`, `concorrencia_precos` | `concorrencia_resumo` |
| `20261015000900_setores.sql` (373) | setores censitários e camadas do IBGE | `setores_censitarios`, `setor_valores`, `setor_variaveis`, `metodologias_renda`, `renda_faixas`, `densidade_faixas`, `demografia_grupos` | `estatisticas_area`, `perfil_area`, `setores_no_retangulo` |
| `20261015001000_viabilidade.sql` (826) | estudo de viabilidade estática | `viabilidade_despesas`, `viabilidade_tipologias`, `viabilidade_linhas`, `viabilidade_modelos` (e colunas novas em `viabilidades`) | `calcular_viabilidade`, `criar_viabilidade`, `salvar_viabilidade`, `modelos_viabilidade` |
| `20261015001100_usuarios.sql` (341) | login pelo Google, perfil, equipe prevista, menções | `empresa_dominios`, `usuarios`, `equipe_prevista`, `mencoes` | `hook_antes_de_criar_usuario`, `tg_usuario_novo`, `mudar_arroba`, `tg_mencoes`, `tg_participante_mencao` |
| `20261015001200_campos.sql` (525) | catálogo de campos para condições e cartão; campos novos do terreno | `campos_catalogo`, `campos_empresa`, `campos_terreno`, `terreno_valores` | `campo_def`, `avaliar_condicao`, `validar_condicao`, `gravar_campo` |
| `20261015001300_funil_tarefas.sql` (503) | tarefas da etapa e trava do avanço (ligação funil × quadros) | `etapa_regras`, `tarefas_etapa` | `salvar_regra_etapa`, `_tarefas_ao_entrar`, `_trava_tarefa` |
| `20261015001400_jornada.sql` (270) | Jornada do terreno | `jornada_itens`, `jornada_regras` | `jornada_processo`, `salvar_item_jornada`, `_jornada_pendencias` |
| `20261015001500_estudos_massa.sql` (411) | estudos de massa e viabilidade presa ao estudo | `estudos_massa`, `estudo_massa_tipologias` | `solicitar_estudo_massa`, `salvar_estudo_massa`, `vincular_massa` |
| `20261015001600_reunioes_agenda.sql` (324) | fila do Google Agenda para reuniões; ficha numa chamada só | `reuniao_agenda` | `agenda_confirmar` (servidor), `decidir_resumo_ia`, `ficha_dados` |
| `20261015001700_exclusao_terreno.sql` | excluir (180 dias) e deletar terreno; políticas de leitura de `terrenos`, `processos` e `notificacoes` trocadas | `terrenos_apagados` | `excluir_terreno`, `restaurar_terreno`, `terrenos_excluidos`, `deletar_terreno`, `_apagar_terreno`, `purgar_terrenos_excluidos` |
| `20261015001800_lotes_prefeitura.sql` | lotes da prefeitura guardados (as quadras de São José montadas pelo GeoSanja), por empresa; leitura pela empresa, gravação só pela RPC | `lotes_prefeitura`, `quadras_prefeitura` | `guardar_lotes_prefeitura` |
| `20261015001900_varredura_sjc.sql` | controle da varredura noturna dos lotes de São José; grava nas tabelas da migration anterior | `varredura_sjc_celulas`, `varredura_sjc_execucoes` | `varredura_sjc_guardar`, `varredura_sjc_relatorio`, `varredura_sjc_proxima_celula` |

**Por que a ordem importa.** Uma migration só pode usar o que as anteriores criaram. Duas consequências que já apareceram:

- O `fluxo` (00150) vem logo depois da base, antes dos terrenos, porque a migration dos terrenos registra `app.ve_terreno` em `fluxo.objeto_tipos` e cria o quadro de cada terreno novo (`tg_terreno_quadro`).
- A migration de regras (0500) termina com `revoke execute on all functions in schema app from public` e um `grant` explícito da lista de RPCs (`20261015000500_regras.sql:2970-3005`). Funções criadas **depois** dela nascem executáveis por `public` e precisam do próprio `revoke`/`grant` (ver "Grants" abaixo).
- Algumas migrations antecipam tabelas de migrations seguintes com `to_regclass(...)`: por exemplo, `tg_copiar_configuracao` copia `tipos_notificacao` e `viabilidade_despesas` só se já existirem (`20261015000200_cadastros.sql:461-470`).

## Convenções do código SQL

- **Nomes em português**, como o domínio: `terrenos`, `processos`, `salvar_terreno`. Prefixos: `v_` para views, `tg_` para funções de trigger, `t_` para os triggers (`t_aud`, `t_upd`, `t_emp`), `_` para funções internas (chamadas só por outras funções).
- **`set search_path = ''`** em toda função `security definer` (as 326 que o são). Por isso todo nome dentro delas vem qualificado (`app.terrenos`, `extensions.st_area`). O motivo é segurança: sem isso, quem chama poderia criar um objeto com o mesmo nome num esquema que vem antes no `search_path` e sequestrar a função que roda com privilégio do dono. Nenhuma função definer ficou sem `search_path` (conferido no catálogo).
- **Comentário acima de cada função e bloco**, com a decisão e a data ("decisão do Moisés, 4/nov/2026"). É a melhor fonte para entender o porquê; o [funcoes.md](funcoes.md) foi montado a partir deles.
- **Erros com código SQLSTATE** que o front trata: `42501` sem permissão, `PT409` edição simultânea ou dado que mudou no meio (recarregue; chega ao front como HTTP 409. Até 9/nov/2026 era `40001`, que o PostgREST repete sozinho como falha de serialização: a gravação ficava em laço no servidor, ver CHANGELOG), `22023` parâmetro inválido, `23514` regra violada, `23505` duplicado, `23P01` poligonal sobreposta, `P0002` não encontrado. As mensagens são frases em português para mostrar ao usuário.
- **Instante com `clock_timestamp()`**, não `now()`, em auditoria e transições: uma RPC grava várias linhas na mesma transação e cada uma precisa de um instante próprio para a ordem do histórico.
- **Configuração com `empresa_id` nulo = modelo padrão.** As tabelas de configuração têm linhas com `empresa_id is null`, que o trigger `t_configuracao` em `app.empresas` copia para cada empresa nova (`20261015000200_cadastros.sql:432-473`). Mudar o padrão não muda as empresas que já existem.

## Modelo de segurança

O front fala com o banco usando a chave publicável do Supabase, que vai para o navegador de qualquer jeito. Então nada no front protege dado: quem tiver a chave e um login pode chamar qualquer tabela ou função exposta. A proteção é feita em camadas, todas no banco:

| Camada | O que barra | Onde |
| --- | --- | --- |
| 1. Login | só e-mail de domínio cadastrado cria usuário | gancho `app.hook_antes_de_criar_usuario` (`20261015001100_usuarios.sql:180`) |
| 2. `usage` no esquema | o papel `anon` (sem login) nem enxerga `app` e `fluxo` | `grant usage on schema app to authenticated, service_role` (`20261015000100_base.sql:8`), idem `fluxo` (`20261015000150_fluxo.sql:19`) |
| 3. Grants de tabela | o que o `authenticated` pode `select`, `insert`, `update`, `delete` | blocos `grant` no fim de cada migration |
| 4. RLS | quais linhas: só as das minhas empresas; escrita só para quem edita | `create policy` em toda tabela |
| 5. RPC com conferência | a regra de negócio e o papel exigido | `perform app.exigir_editor(...)` etc. no começo de cada função |
| 6. Triggers de integridade | o que nenhum caminho pode quebrar (mesma empresa, hierarquia, poligonal sobreposta, controle de colunas) | `tg_mesma_empresa`, `tg_membro_hierarquia`, `tg_terreno_sobreposicao`, `tg_terreno_controle`... |

### Os papéis e a marca de administrador

Tudo sai de `app.membros` (`20261015000100_base.sql:23-38`), uma linha por pessoa e empresa:

| Papel | Pode | Nível (`app.nivel_papel`) |
| --- | --- | --- |
| `diretor` | edita; força avanço com justificativa; aprova como diretor; vê Taxas e Despesas financeiras da viabilidade | 3 |
| `gestor` | edita; força avanço com justificativa; aprova como gestor | 2 |
| `analista` | edita | 1 |
| `leitura` | só consulta | 0 |
| `basico` | quem entrou pelo Google com e-mail do domínio da empresa e ainda não foi promovido; por ora consulta como `leitura` | 0 |

- **`administrador`** é uma marca à parte (`membros.administrador`), em qualquer papel: edita a configuração (funil, Jornada, campos, notificações, parâmetros urbanísticos, listas de tarefas) e a equipe. A empresa nunca fica sem administrador (trigger `t_hierarquia`).
- **Hierarquia por `superior_id`**: o analista responde a um gestor, o gestor a um diretor, sempre um nível acima; diretor, leitura e básico não têm superior. Quem tem subordinados não sai nem muda de papel antes de trocar o superior deles. Tudo conferido por `app.tg_membro_hierarquia` (`20261015000100_base.sql:48-81`). `app.eh_superior(empresa, chefe, membro)` sobe a cadeia (até 10 níveis) e é usada em aprovações ("qualquer superior aprova por quem está abaixo") e na lixeira do log.
- **Aprovação:** quem já tem o nível exigido fica dispensado (gestor dispensa a aprovação de gestor; diretor dispensa as duas). Ver "Funil de cada fase" em `docs/modelo.md`.

### As funções de acesso

Definidas em `20261015000100_base.sql:84-164`, todas `security definer` (para ler `membros` sem cair na própria RLS de `membros`, o que daria recursão) e com `search_path = ''`:

| Função | Responde | Usada em |
| --- | --- | --- |
| `app.minhas_empresas()` | conjunto das empresas em que sou membro (qualquer papel) | toda política `ver` (`using (empresa_id in (select app.minhas_empresas()))`) |
| `app.empresas_edicao()` | empresas em que sou diretor, gestor ou analista | políticas `inserir`, `alterar`, `remover` |
| `app.papel(empresa)` | meu papel ou nulo | regras finas dentro das RPCs |
| `app.eh_membro`, `app.eh_gestor` (gestor ou diretor), `app.eh_administrador`, `app.eh_diretoria` (diretor ou administrador) | booleanos | RPCs e políticas |
| `app.exigir_membro(empresa)` | erro 42501 se não sou membro | RPCs de leitura com regra |
| `app.exigir_editor(empresa)` | erro 42501 "Seu acesso é somente leitura" se não sou diretor, gestor ou analista | começo de quase toda RPC que grava |
| `app.exigir_administrador(empresa)` | erro 42501 se não sou administrador | RPCs de configuração |
| `app.ve_terreno(terreno, pessoa)` | a pessoa vê o terreno? Hoje = é membro da empresa dele | teto dos cartões do `fluxo`; condições; Jornada |

O padrão de uma RPC que grava é sempre o mesmo: carrega o registro, descobre a empresa dele, chama `exigir_editor` (ou `exigir_administrador`) com essa empresa e só então confere a regra. Exemplo, `app.salvar_terreno` (`20261015000500_regras.sql:2060-2108`).

### RLS: o padrão das políticas

A maioria das tabelas recebe as mesmas quatro políticas, criadas em laço (`20261015000300_terrenos.sql:810-831`, `20261015000400_negociacao.sql:429-445`, `20261015000150_fluxo.sql:425-446`):

```sql
create policy ver     on app.X for select to authenticated using (empresa_id in (select app.minhas_empresas()));
create policy inserir on app.X for insert to authenticated with check (empresa_id in (select app.empresas_edicao()));
create policy alterar on app.X for update to authenticated using (...empresas_edicao()) with check (...empresas_edicao());
create policy remover on app.X for delete to authenticated using (empresa_id in (select app.empresas_edicao()));  -- só onde apagar é permitido
```

Variações importantes:

- **Tabelas com regra só têm a política `ver`.** `processos`, `propostas`, `documentos`, `aprovacoes`, `negociacoes`, `processo_transicoes`, `terreno_partes`, `estudos_massa`, a configuração do funil: o front lê, e só as RPCs (que rodam como dono, `security definer`) gravam. Em `terrenos`, a política `alterar` foi retirada e o `update` revogado (`20261015000300_terrenos.sql:846-847`): o terreno se insere direto, mas só muda por `salvar_terreno`.
- **Notificações:** cada um vê só as suas (`20261015000700_notificacoes.sql:456`).
- **Visões salvas (`filtros_salvos`):** as pessoais só para quem criou; as da empresa (`user_id` nulo), todos veem e só o administrador grava.
- **Logs (`app.auditoria`):** todos da empresa veem (decisão do Moisés, 5/nov/2026), menos o log de cartão que a pessoa não vê, o de linhas de Taxas e Despesas financeiras fora da diretoria e o dos modelos de viabilidade fora da diretoria. A política final é a soma disso (consulte `pg_policies` para o texto exato; o `base.sql` cria a versão simples e migrations seguintes a refazem).
- **`fluxo`:** a visibilidade é por cartão. Depois do bloco 3, as políticas de `tarefas` e das tabelas filhas passam a usar `fluxo.papel_tarefa(tarefa_id) is not null` para ver e `fluxo.edita_tarefa(tarefa_id)` para gravar (`20261015000150_fluxo.sql:1720-1800`). Ver "Tarefas" abaixo.
- **Cadastros comuns** (`municipios`, `zoneamentos`, `tipos_documento`, `itens_infraestrutura`, `setores_*`): todos os logados leem; ninguém grava pelo app. `app.campos_catalogo` e `fluxo.objeto_tipos` não têm RLS, só `grant select` (são catálogos fixos sem dado de empresa).
- **Views** usam `with (security_invoker = true)` (todas as 29), para que a RLS das tabelas valha para quem consulta e não para o dono da view.

### Grants: o que o usuário logado pode tocar

A lista abaixo saiu do catálogo (`has_table_privilege('authenticated', ...)`) do banco montado do zero. Ela é o complemento da regra 2 do CLAUDE.md: **o front grava direto só nestas tabelas**, e a RLS decide as linhas.

| Permissão do `authenticated` | Tabelas |
| --- | --- |
| `insert`, `update`, `delete` | `app`: `analise_zoneamentos`, `area_interesse_terrenos`, `concorrencia_precos`, `confrontacoes`, `empresa_dominios` (só administrador, pela RLS), `equipe_prevista` (idem), `filtros_salvos`, `inscricao_partes`, `inscricoes_municipais`, `lembretes`, `matricula_partes`, `matriculas`, `membros` (só administrador), `oferta_partes`, `parte_corretores`, `reuniao_participantes`, `terreno_corretores`, `terreno_pessoas`, `terreno_viabilidades_outras`, `viabilidade_linhas`, `viabilidade_tipologias`. `fluxo`: `apontamentos`, `automacoes`, `campo_opcoes`, `campos`, `checklist_itens`, `checklists`, `grupo_membros`, `grupos`, `modelo_tarefas`, `modelo_vinculos`, `modelos_quadro`, `recorrencias`, `tarefa_acessos`, `tarefa_campos`, `tarefa_etiquetas`, `tarefa_itens`, `tarefa_pessoas`, `vinculos` |
| `insert`, `update` (sem apagar: arquivar ou desativar) | `app`: `analises_urbanisticas`, `areas_interesse`, `atividades`, `concorrencia_empreendimentos`, `concorrencia_tipologias`, `concorrentes`, `corretores`, `diligencias`, `eixos_comerciais`, `ofertas`, `pessoas`, `pontos_interesse`, `reunioes`, `terreno_infraestrutura`, `terreno_viabilidades_tecnicas`. `fluxo`: `anexos`, `comentarios`, `etiquetas`, `listas`, `tarefas` |
| só `insert` | `app.terrenos` (muda por `salvar_terreno`), `app.inscricao_valores` (correção = nova revisão) |
| `insert` e `delete` | `fluxo.comentario_reacoes` |
| nenhuma escrita (só RPC) | todas as outras, inclusive `processos`, `propostas`, `documentos`, `documento_versoes`, `aprovacoes`, `negociacoes`, `processo_transicoes`, `terreno_partes`, `notificacoes`, `auditoria`, `usuarios`, toda a configuração do funil, `estudos_massa`, `viabilidades`, `reuniao_agenda`, `fluxo.quadros`, `fluxo.aprovacoes`, `fluxo.pausas`, `fluxo.linhas_base` |

Mesmo nas tabelas de escrita direta há triggers que barram o que não pode: o filho tem de ser da mesma empresa e do mesmo terreno do pai (`tg_mesma_empresa`), pessoa, corretor e ofertante têm de ser da empresa (`tg_vinculos_empresa`), o código e o autor do terreno são do banco (`tg_terreno_controle`), a inscrição tem de ser da cidade do terreno (`tg_inscricao_municipio`), e assim por diante (lista em "Regras que o modelo garante", no fim de `docs/modelo.md`).

**Funções.** O `execute` de função em Postgres nasce dado a `public`. A migration de regras tira esse `execute` de todas as funções do `app` que existem até ali e devolve só às RPCs listadas (`20261015000500_regras.sql:2970-3005`); as migrations seguintes fazem `revoke ... from public` e `grant ... to authenticated` função por função. As internas (prefixo `_`), as de servidor e a rotina diária ficam sem `execute` para `authenticated`. Algumas funções criadas depois do `revoke` geral ficaram executáveis por `public` sem querer (lista em [funcoes.md](funcoes.md), "Observações"); hoje isso não abre nada ao anônimo porque `anon` não tem `usage` nos esquemas.

### `security definer` e `search_path`

Quase todas as RPCs são `security definer`: rodam com os direitos do dono das tabelas (o `postgres` do Supabase), passando por cima da RLS. É assim que uma função grava em `processos` mesmo sem o usuário ter `update` ali. O preço é que **a função é a única barreira**: se ela não chamar `exigir_editor` (ou outra conferência) com a empresa certa, qualquer logado de qualquer empresa passa. Por isso:

- toda RPC nova começa conferindo o papel na empresa **do registro** (nunca numa empresa que veio de parâmetro sem conferir que o registro é dela);
- `set search_path = ''` sempre, com nomes qualificados;
- testes de isolamento (`\echo '# isolamento entre empresas'`, `supabase/tests/regras.sql:816`) e de somente leitura (`:805`) cobrem cada RPC nova.

As poucas `security invoker` são as que só leem e devem respeitar a RLS de quem chama: `app.ficha_dados`, `app.parametros_zona`, `app.estatisticas_*`, `app.perfil_*`, `fluxo.copiar_tarefa` (copia só o que a pessoa vê e grava só onde ela edita).

### Login, domínio e primeiro acesso

Decisão do Moisés de 28/out/2026: só login Google do Workspace (e-mail e senha desligados no Supabase Auth). O caminho de um usuário novo, em `20261015001100_usuarios.sql`:

1. O Supabase Auth chama o gancho **"Before User Created"** → `app.hook_antes_de_criar_usuario(event)` (`:180`), que recusa (HTTP 403) e-mail cujo domínio não está em `app.empresa_dominios`. O parâmetro `hd` do Google é só uma dica na tela; a barreira é o gancho. Precisa estar ligado no painel (Authentication › Auth Hooks); o `grant usage` e o `execute` para `supabase_auth_admin` vêm da migration (`:340-341`).
2. O trigger `t_usuario_novo` em `auth.users` (`:132-158`) cria o perfil em `app.usuarios` (nome, e-mail, foto, @ único gerado do e-mail) e o membro `basico` na empresa do domínio.
3. Se o e-mail está em **`app.equipe_prevista`** (preenchida pela carga `supabase/carga/bkm.sql`), o mesmo trigger aplica o papel, a marca de administrador e o superior combinados (`_aplicar_equipe_prevista`); um erro ali nunca impede o login (vira aviso e a pessoa fica `basico`).
4. A cada login, `t_usuario_login` atualiza nome e foto vindos do Google; o @ só muda pelo administrador (`app.mudar_arroba`).

Proteções da revisão de 2/nov/2026: a equipe só recebe quem tem e-mail de um domínio da empresa (`tg_membro_dominio`); o domínio cadastrado tem de ser o do e-mail de quem cadastra e nunca um e-mail gratuito (`tg_dominio_empresa`); `app.criar_empresa` foi fechada ao usuário logado (4/nov/2026), e empresa nova só nasce pela carga ou pelo dono do banco.

### `service_role` e funções do servidor

O `service_role` passa por cima da RLS (é o papel da chave secreta, que nunca vai ao front). Hoje ele só é necessário para as funções da integração com o Google Agenda (`agenda_confirmar`, `agenda_evento_mudou`, `agenda_resposta`, `registrar_gravacao`, `registrar_resumo_ia`; `20261015001600_reunioes_agenda.sql:155-271`), que serão chamadas por uma função do servidor ainda a fazer, e para a carga dos setores censitários. A chave `service_role` não deve ser usada para contornar uma regra que o usuário não pode fazer.

### Storage (arquivos)

Bucket privado `documentos`, até 50 MB por arquivo (`20261015000600_storage.sql`). Caminho `{empresa_id}/{terreno_id}/{tipo}/{uuid}_{arquivo}`: a política lê a **primeira pasta** e deixa ler quem é membro dessa empresa e enviar quem edita nela. Não há política de `update` nem de `delete`: um arquivo enviado nunca é sobrescrito nem apagado pelo app. Depois do envio, o front chama `app.registrar_documento`, que confere de novo que o caminho começa pelo `empresa_id` do terreno e cria a versão. A segunda pasta (`terreno_id`) não é conferida pela política do Storage, só pela RPC (a conferir se isso importa: um editor poderia subir um arquivo na pasta de outro terreno da mesma empresa sem registrá-lo).

### Observações de segurança encontradas ao escrever este arquivo

Para o responsável pela [avaliação de segurança](seguranca.md) conferir. Nada foi alterado.

1. Funções criadas depois de `20261015000500_regras.sql` que ficaram com `execute` para `public` (lista em [funcoes.md](funcoes.md)). Inofensivo enquanto `anon` não tiver `usage` nos esquemas.
2. `app.campo_def(p_empresa, ...)` é `security definer` e não confere se quem chama é da empresa: vaza título e opções de campos personalizados de outra empresa a quem souber o id.
3. `app.ve_terreno`, `fluxo.ve_objeto` e `fluxo.papel_cartao` respondem sobre qualquer pessoa (`p_user`), não só sobre quem chama.
4. Dados do GeoSampa, do GeoSanja e do Google chegam pelo navegador; o banco confere a coerência, não a origem.
5. Tabelas sem auditoria (ver a lista em "Auditoria"), entre elas `pessoas` (com CPF e contato), `corretores`, `terreno_infraestrutura` e `viabilidades`.
6. A segunda pasta do caminho no Storage não é conferida pela política.

## Regra de negócio no banco (regra 2)

**O que é.** Tudo o que tem regra (mudar etapa ou subetapa, encerrar, aprovar, registrar proposta, enviar ou validar documento, mudar a ficha do terreno, configurar o funil) só acontece por uma função do banco chamada por RPC (`supabase.rpc('nome', {p_...})`). O front não tem `update` nessas tabelas, então não há atalho.

**Por quê.** O front é reescrito em React tela por tela (ADR 0001) e ainda convive com o protótipo, que tinha as regras em JavaScript. Com a regra num lugar só, testada em SQL, nenhuma tela nova consegue esquecê-la, e um script ou uma integração que chame a API direto obedece às mesmas regras. Foi exatamente o motivo para não aproveitar o protótipo (`docs/adr/0001-front-real-reescrito-em-react.md`).

**Como se reconhece uma RPC.** Função em `app` ou `fluxo`, com nome de verbo (`salvar_`, `registrar_`, `mover_`, `decidir_`, `apagar_`...), `security definer`, `execute` para `authenticated`, e que começa por `exigir_editor`, `exigir_administrador` ou equivalente. O catálogo completo, com quem pode chamar cada uma, está em [funcoes.md](funcoes.md).

**O que o front grava direto** (sem RPC): o terreno na criação, os cadastros que descrevem o imóvel (matrículas, inscrições, etiquetas das partes, confrontações, pessoas do terreno, corretores do terreno e da parte, infraestrutura, viabilidades técnicas), ofertas e as partes cobertas por elas, atividades, reuniões e participantes, diligências, pessoas, corretores, pontos de interesse, visões salvas, lembretes, a concorrência manual e quase tudo do cartão de tarefa. A lista exata é a tabela de grants acima.

**Concorrência entre duas pessoas na mesma ficha.** `app.salvar_terreno(id, versao, dados)` recusa com `PT409` se a versão mudou desde que a tela carregou (regra 11). A coluna `versao` sobe sozinha pelo trigger `tg_atualizado_em` (`20261015000100_base.sql:189-201`). Só as chaves enviadas em `dados` mudam; colunas de controle (`id`, `empresa_id`, `codigo`, `versao`, `criado_*`, `atualizado_*`, `situacao_cadastral`, `arquivado_em`, `motivo_arquivamento`) são recusadas.

## Terreno excluído e deletado (9/nov/2026)

Pedido do Moises. **Excluir** (diretor ou administrador, `app.excluir_terreno`) só marca `terrenos.excluido_em`/`excluido_por`. A política `ver` de `app.terrenos` passou a exigir `excluido_em is null`, então o terreno some de toda leitura do app: `v_terrenos` e as demais views (são `security_invoker`), `ficha_dados`, `terrenos_sobrepostos`, `buscar_duplicados`. As tabelas que o front lê pela empresa inteira, `processos` (funil, mapa, filtros) e `notificacoes` (sino), escondem as linhas do excluído com `terreno_id not in (select app.terrenos_ocultos())`; as demais filhas são lidas por `terreno_id`, que o front não acha mais. `app.ve_terreno` devolve falso para o excluído, o que esconde os cartões do `fluxo`. A rotina diária não avisa nada de terreno excluído (`app.terreno_excluido`) e apaga de vez os excluídos há 180 dias (`purgar_terrenos_excluidos`). O trigger `t_excluido` recusa qualquer update no terreno excluído que não seja restaurar. Matrículas e SQLs do excluído continuam nos índices únicos: o front avisa "está num terreno excluído".

**Deletar** (`app.deletar_terreno`, só administrador, com o nome digitado) e a limpeza dos 180 dias usam `app._apagar_terreno` (ver [funcoes.md](funcoes.md#funções-só-do-servidor-e-do-próprio-banco)). Os logs do terreno saem junto. Fica uma linha em `app.terrenos_apagados` (código, nome, quem, quando; só o administrador lê) com as pendências de fora do banco em `pendencias` (`storage`: caminhos em `documento_versoes`; `drive`: a pasta do terreno, quando existir), e `limpo_em` quando não há nada a apagar fora. O app não apaga arquivo do storage (não há política de delete, de propósito); a função do servidor que fizer isso, junto com o Drive, chama `app.limpeza_feita`.

Travas que deixam passar com `app.apagando_terreno = '1'` (só `_apagar_terreno` liga, dentro da transação): `tg_inscricao_historico`, `tg_analise_substituida`, `tg_matricula_leva_sqls`, `tg_inscricao_area`, `fluxo.tg_automacao_apagar`, `fluxo.tg_tarefa_item`, `fluxo.tg_aprovadores`. O teste final de `regras.sql` apaga todos os terrenos criados pelos outros testes, para pegar chave ou trava nova que impeça deletar.

## Tratativa de imóvel sobreposto (10/nov/2026)

Migration `20261015002000_tratativas.sql` (idempotente; é também o SQL avulso do banco real). Ver o resumo em [modelo.md](../modelo.md). Pontos de atenção para quem mexe:

- `ofertas.vigente` e o status `aguardando` só mudam pelas RPCs: o gatilho `t_tratativa` recusa a escrita direta, a não ser com `app.tratativa = '1'` (ligado por `set_config` dentro das funções; conferido por `app._tratativa_rpc()`). O mesmo vale para `terrenos.em_espera_de` (`tg_terreno_espera`).
- SQL e matrícula repetidos: os índices únicos por empresa saíram; `tg_inscricao_repetida` e `tg_matricula_repetida` recusam o repetido fora dos terrenos ligados em `terreno_sobreposicoes`, com `pg_advisory_xact_lock` para duas gravações ao mesmo tempo.
- `app.ultima_acao_terreno` segue o filtro dos Logs do front (`ficha/Painel.tsx`): ignora `automatico`, ofertas aguardando e updates do terreno que só mexem em `em_espera_de`, `espera_avisada_em`, `versao` e `atualizado_*`.
- Esconder é filtro (`v_mapa`, Funil, filtros), não RLS: a ficha do escondido abre pelo link.


## Vários corretores por oferta (10/nov/2026)

`app.oferta_corretores` (`20261015002100_oferta_corretores.sql`, #322) guarda os corretores de cada oferta (único por oferta e corretor). `ofertas.corretor_id` continua sendo o **principal**, lido pelo resto do sistema (Resumo, filtros, funil, completude): o corretor posto na oferta entra na lista (`tg_oferta_corretor_principal`); o primeiro posto numa oferta sem corretor vira o principal; tirado o principal, o mais antigo que sobrou passa a ser (`tg_oferta_corretor_sync`), e todo corretor da oferta entra em `terreno_corretores`. O que os gatilhos gravam por consequência vai como automático na auditoria. Escrita direta (oferta é tabela sem regra): leitura pela empresa, inserir e apagar por quem edita. A observação livre da oferta é `ofertas.observacoes`.

## Observações e Premissas da viabilidade (12/nov/2026)

`20261015002400_viabilidade_observacoes.sql` (#362) acrescenta `app.viabilidades.observacoes` (HTML do texto livre do estudo, nulo quando em branco, até 200 mil caracteres) e `app.salvar_observacoes_viabilidade(p_id, p_html) returns timestamptz`, a única escrita da coluna (a tabela não tem `update` para o usuário): confere `exigir_editor`, recusa conteúdo perigoso (ver `seguranca.md`), grava nulo quando só sobram etiquetas vazias e atualiza `atualizado_em`. `criar_viabilidade` com `p_copiar_de` não copia a coluna: o front copia depois pela mesma RPC. Sem auditoria linha a linha (a tabela não tem `t_aud`), como os outros campos do estudo.
## Observações e Premissas do estudo de massa (12/nov/2026)

`20261015002500_massa_observacoes.sql` (#375) acrescenta `app.estudos_massa.observacoes_html` e `app.salvar_observacoes_massa(p_id, p_html) returns timestamptz` (a escrita da coluna; `salvar_estudo_massa` não a aceita), com a checagem em `app._html_rico(text)` (interna, sem `grant`). O `observacoes` em texto simples virou parágrafos na coluna nova e fica no banco sem uso na tela. A mudança entra em `app.auditoria` pelo `t_aud` da tabela.

## Chat dos estudos (12/nov/2026)

`20261015002700_estudo_chat.sql` (#382) cria `app.estudo_mensagens`: uma conversa por estudo de massa ou de viabilidade (exatamente um dos dois, com `on delete cascade`: apagar o estudo apaga o chat). Leitura pela RLS para quem vê o terreno (`app.ve_terreno`); escrita só pelas RPCs `enviar_mensagem_estudo(tipo, estudo, texto, resposta)`, `editar_mensagem_estudo(id, texto)` e `apagar_mensagem_estudo(id)`, que exigem editor e, para editar e apagar, ser o autor. Apagar é lógico: `texto` vira nulo e `apagada_em` marca a hora, para a citação de uma resposta continuar apontando para a mensagem. O texto guarda os @ como texto e os estudos citados como `[[m:<id>]]` e `[[v:<id>]]` (só do mesmo terreno). Os avisos saem de `app._avisar_mensagem`: `mencao` para os @ que entraram (só quem vê o terreno, registrados em `app.mencoes`) e `mensagem_resposta` para o autor da mensagem respondida; a origem do aviso é `estudo_mensagens` e o id da mensagem. Sem `t_aud` (conversa não entra nos Logs da ficha). A tabela está na publicação `supabase_realtime`.

## Padrões fixos da viabilidade (12/nov/2026)

`20261015002300_viabilidade_padroes.sql` (#360) grava `tipo_padrao` e `valor_padrao` dos itens de Taxas e Despesas financeiras em `app.viabilidade_despesas`, no modelo (empresa nula) e nas empresas onde o valor ainda era nulo, porque Configurações › Viabilidade não existe no React (pedido do Moises). `app.criar_viabilidade` copia esses valores para as linhas fixas do estudo novo (sem modelo, ou com modelo que não traga Taxas e Financeiras); estudos existentes não mudam. Quando a tela de configuração chegar, ela edita os mesmos campos por `app.salvar_despesa_viabilidade`. `tools/viabilidade/despesas.json` tem os mesmos valores.

## Auditoria e histórico

### `app.auditoria`: o log de tudo

`app.tg_auditoria` (`20261015000100_base.sql:274-289`) roda depois de cada `insert`, `update` e `delete` nas tabelas em que o trigger `t_aud` foi criado e grava: empresa, tabela, id do registro, ação, o registro inteiro antes e depois (jsonb), o usuário (`auth.uid()`) e o instante (`clock_timestamp()`). É `security definer`, então grava mesmo quando o usuário não tem permissão na tabela de log. Ninguém escreve em `app.auditoria` pelo app; todos da empresa leem (com as exceções da RLS acima). É a fonte do painel **Logs** da ficha.

**Tabelas sem `t_aud`** (conferido no catálogo): `empresas`, `auditoria`, os catálogos comuns (`municipios`, `zoneamentos`, `bases_cadastrais`, `entorno_categorias`, `tipos_documento`, `itens_infraestrutura`, `campos_catalogo`, setores e faixas), `eixos_comerciais`, `pessoas`, `corretores`, `terreno_infraestrutura`, `areas_interesse`, `terreno_corretores`, `parte_corretores`, `area_interesse_terrenos`, `terreno_ponto_distancias`, `filtros_salvos`, `negociacoes`, `processo_transicoes` (é ela mesma um histórico), `documento_versoes` (idem), `atividades`, `preferencias_notificacao`, `notificacoes`, `mencoes`, `usuarios`, `viabilidades`, `reuniao_agenda` e, no `fluxo`, `linha_base_itens`, `feriados`, `aprovacoes`, `aprovacao_votos`, `objeto_tipos`, `automacao_execucoes`. A regra 6 do CLAUDE.md ("auditoria automática por trigger") vale para a maioria das tabelas, não para todas; ao criar uma tabela nova, decida e crie o `t_aud` de propósito.

### Cliques seguidos viram um log só

Quem clica na temperatura 2 → 3 → 4 não quer três linhas no histórico. `app.juntar_auditoria` (`:247-272`) olha o último log do mesmo registro: se é um `update` do mesmo usuário, nas mesmas colunas, dentro da janela de `app.janela_log()` (7 segundos; 2 minutos quando só a poligonal do terreno mudou), ele é atualizado para o valor final, e some se o valor final é o de antes. A gravação na tabela acontece na hora; só o log é que junta. Ação e consequência automática nunca se juntam.

**Consequências automáticas (`automatico`, 9/nov/2026).** O que o sistema grava por consequência de outra ação (consulta do GeoSampa, frentes medidas pela poligonal) fica com `auditoria.automatico = true`, pela função `app.origem_automatica()`: verdadeira quando a requisição traz o cabeçalho `x-bkm-automatico: 1` (o front põe com `automatico()` de `lib/supabase.ts`) ou quando a transação ligou `app.automatico`. Só muda como o log aparece (recolhido dentro da ação no painel); permissão e gravação são as mesmas. `processos` fica de fora, porque cada passagem conta no SLA. A temperatura mora em `terrenos` desde 9/nov/2026 e junta pelo mesmo caminho (o `t_aud` do terreno); antes ficava em `negociacoes` e o log em `processo_transicoes` (evento `temperatura`, que continua aceito para o histórico antigo). Ela não sobe a `versao` do terreno: `app.tg_atualizado_em` ignora uma alteração só de `temperatura`/`temperatura_em`, para o clique não derrubar com PT409 quem edita a ficha; e `salvar_terreno` e `desfazer_alteracao` recusam essas colunas.

### Lixeira do log: desfazer sem apagar

`app.desfazer_alteracao(id_do_log)` (`20261015000500_regras.sql:2118-2156`) volta os campos daquela alteração da ficha ao valor de antes, chamando `salvar_terreno`. Pode quem fez, os superiores dessa pessoa e o administrador; só alterações de `terrenos`; só enquanto os campos ainda têm o valor daquela alteração (senão, desfaz-se primeiro a mais recente). Nada some: o log original ganha `desfeito_em` e `desfeito_por`, e a volta é um log novo com `desfaz_id` apontando para ele. Durante o desfazer, a variável de sessão `app.desfazendo = '1'` impede que a volta seja juntada ao log anterior. O "olhinho" (prévia sem a alteração) é só da tela e não passa pelo banco.

### `processo_transicoes`: o histórico do funil

Toda passagem de um processo vira uma linha (`20261015000400_negociacao.sql:155-172`): evento (`abertura`, `avanco`, `retorno`, `subetapa`, `conclusao`, `descarte`, `perda`, `stand_by`, `retomada`, `temperatura`), de onde para onde (etapa e subetapa), se foi forçado, o comentário ou justificativa, o pedido de aprovação que liberou, o usuário e o instante. É a base do SLA: `v_periodos_processo` corta o histórico em períodos e `v_tempo_subetapas` soma por etapa e subetapa (`20261015000500_regras.sql:377` em diante). Não se edita nem se apaga pelo app.

## Fases, processos, etapas e subetapas (em linguagem simples)

Leitura completa em `docs/modelo.md`, seções "Fases" e "Funil de cada fase".

- **Fase** é o grande momento do terreno: Novos Negócios, Aprovação de Projetos, Registro de Incorporação, Funding, Contratação Caixa, Lançamento, Obras, Entregue (`app.fases_modelo`, por empresa). A fase de **entrada** (`entrada = true`, Novos Negócios) é a única aberta por uma oferta e a única com negociação (temperatura, propostas, viabilidade).
- **Processo** (`app.processos`) é a passagem do terreno por uma fase. Um terreno tem no máximo **um processo aberto por fase** (índice único parcial `processos_um_aberto_por_terreno`, `20261015000400_negociacao.sql:139`), mas fases diferentes correm juntas. Código com o prefixo da fase: `NEG-00012`, `APR-00013`.
- **Etapa** e **subetapa** são os passos dentro da fase. O processo está sempre numa subetapa (`etapa_atual`, `subetapa_atual`, com as datas de entrada). Chaves estrangeiras compostas garantem que a etapa e a subetapa existem na configuração da empresa.
- **Status**: `ativo`, `concluido` (com o nome da fase: Comprado, Aprovado...), `perdido`, `descartado` ou `stand_by`. O fim é status, não etapa; o processo encerrado guarda onde estava. Comprado, Perdido e Descartado não voltam.
- **Dependências** (`fase_dependencias`): a fase abre sozinha quando a fase requisito foi concluída ou passou por uma etapa ou subetapa (`app._abrir_fases_liberadas`, `20261015000500_regras.sql:576`). Funding não depende de nada e abre à mão (`app.abrir_fase`).
- **Toda passagem passa por `app._passagem`** (`:1044`): confere editor, processo ativo e sem pedido aberto, movimento permitido; junta as **pendências** (`app._pendencias`, `:803`: checklist de documentos, pré-requisitos lidos do histórico, diligência impeditiva, partes, Jornada, tarefas que travam); com pendência, só gestor ou diretor força, com justificativa; sem pendência, pede as **aprovações** configuradas (uma linha por nível em `app.aprovacoes`) ou executa na hora (`_executar_passagem`, `:957`), gravando `processo_transicoes`.
- **Negociação** (`app.negociacoes`, 1:1 com o processo da fase de entrada): oferta de referência (a temperatura passou para `terrenos` em 9/nov/2026).

### Partes (vários donos)

Ver "Terreno com vários donos (partes)" em `docs/modelo.md`. Em resumo: todo terreno nasce com a parte "Vendedor 1" (trigger `t_parte1`, `20261015000300_terrenos.sql:962`). Matrículas e SQLs se ligam às partes por etiquetas (`matricula_partes`, `inscricao_partes`, com percentual opcional; o SQL fica dentro de uma matrícula da parte, `inscricao_partes.matricula_parte_id`). A mesma matrícula em várias partes tem os mesmos SQLs em todas as cópias: os gatilhos `t_espelho` e `t_copia_sqls` mantêm as cópias iguais (pôr, tirar, mover e o percentual), e `v_etiquetas` conta o SQL uma vez por matrícula, de modo que a área se divide pelo % de cada parte na matrícula. A partir da etapa da divisão (`fases_modelo.etapa_partes`, padrão Negociação), com duas ou mais partes ativas, cada parte ganha o próprio processo da mesma fase (`parte_id`, `principal_id`, código `NEG-00012-1`), e a negociação do terreno passa a andar pela parte mais atrasada (`app._sincronizar_principal`, `20261015000500_regras.sql:1426`), sem se mover à mão. Comprado só com todas as partes ativas compradas. Partes se criam e mudam por `salvar_parte`, `remover_parte` e `excluir_parte`; a leitura é `app.v_partes`.

### Jornada, campos e tarefas da etapa

Três camadas configuradas pelo administrador que entram nas pendências da passagem. Leitura completa em `docs/modelo.md` ("Campos do terreno no cartão...", "Tarefas da etapa...", "Jornada do terreno").

- **Campos** (`20261015001200_campos.sql`): catálogo fixo dos campos do terreno, da negociação, da oferta de referência, da proposta vigente e calculados (`app.campos_catalogo`), com título e marcas por empresa (`campos_empresa`), mais campos novos do terreno criados pelo administrador (`campos_terreno`, valores em `terreno_valores`, chave `personalizado.<codigo>`). As **condições "Vale quando"** são jsonb (`{"modo": "todas"|"qualquer", "itens": [...]}`, um nível de grupo) avaliadas por `app.avaliar_condicao`. O valor nunca é copiado: lê e grava no próprio registro (`app.gravar_campo`).
- **Tarefas da etapa** (`20261015001300_funil_tarefas.sql`): regras por fase e etapa (`app.etapa_regras`) que criam tarefas no quadro do terreno ao entrar, com a marca opcional "Trava o avanço".
- **Jornada** (`20261015001400_jornada.sql`): perguntas por etapa e subetapa (`app.jornada_itens`, gravando num campo do terreno) com a regra "se estiver em branco" (não avança, avança com justificativa, pode avançar; única ou condicional), e regras pelo valor (`app.jornada_regras`: não avança, pede aprovação, só avisa).

## Tarefas: o esquema fluxo e a saída para o bkm_tarefas

O `fluxo` tem tudo das tarefas: quadro por objeto, listas (`aberta`, `pausa`, `conclui`), cartões, pessoas, etiquetas, checklists, comentários, anexos, cronograma com predecessoras e linha de base, modelos, aprovação formal, pausa com SLA, visibilidade por cartão, campos personalizados, formulário, recorrência, apontamento de horas (sem tela), automações, botões e agendamentos. Leitura completa em `docs/modelo.md`, "Quadros e tarefas (esquema `fluxo`)" e subseções.

Pontos de segurança do `fluxo`:

- **Teto do objeto:** quem não vê o terreno não vê os cartões dele, nem liberado. `fluxo.ve_objeto` chama a função registrada para o tipo em `fluxo.objeto_tipos` (`20261015000150_fluxo.sql:1522`).
- **Papel no cartão:** `fluxo.papel_tarefa(tarefa, pessoa)` devolve `leitor`, `comentarista`, `editor`, `administrador` ou nulo (não vê), combinando a visibilidade do cartão (Público, Individual, Restrito), o papel no sistema, os acessos dados (`tarefa_acessos`, `grupos`) e as exceções. A RLS das tabelas do cartão usa essa função.
- **Avisos** do `fluxo` passam pelo gancho `fluxo._avisar`, que nasce vazio no `fluxo` e é trocado por um que chama `app._notificar` (`20261015000700_notificacoes.sql:294`). Aviso de cartão só vai a quem vê o cartão.

**ADR 0002 (4/nov/2026): tarefas num banco próprio.** O Moisés decidiu tirar as tarefas deste banco para um projeto Supabase próprio, `bkm_tarefas`, com repositório próprio (`Mbekerman/bkm_tarefas`), para servir a outros apps e virar produto. Consequências para quem mexe neste banco (`docs/adr/0002-tarefas-em-banco-proprio.md`, `docs/tarefas-arquitetura.md`):

- O `fluxo` daqui será **reescrito** lá com empresas ("espaços de trabalho"), pessoas, papéis e auditoria próprios, e sai deste banco quando o `bkm_tarefas` estiver no ar. As tarefas estão fora da primeira versão do BKM Terrenos.
- A tarefa nunca escreverá nas tabelas do terreno: guardará "sistema + objeto + campo" do catálogo que o BKM publica, e quem grava é o BKM, pelas regras dele (`app.gravar_campo`).
- As ligações (quem vê o objeto, gravar campo, tarefas da etapa, trava do avanço) viram conversas entre dois bancos, com fila, nova tentativa e sem duplicar. O avanço que depende de tarefa que trava espera se o `bkm_tarefas` não responder.
- Enquanto isso não acontece, evite aumentar a dependência do `fluxo` em relação ao `app` (novas chamadas a `app.*` de dentro do `fluxo`), porque cada uma vira trabalho na separação.

## PostGIS e geometria

- **Por que PostGIS** (entrou em 22/out/2026): a poligonal é obrigatória e o banco precisa recusar um terreno que ocupa parte de outro, em qualquer caminho de gravação (tela, importação, API). Fazer isso no navegador não é garantia. No Supabase, a extensão `postgis` fica no esquema `extensions`.
- **Como a poligonal é guardada:** a fonte é `terrenos.poligono_geojson` (jsonb, GeoJSON Polygon, validado por `app.geojson_poligono_valido`: anéis fechados, ao menos 4 posições, longitude e latitude dentro dos limites). A geometria `terrenos.poligono` (`geometry(Geometry, 4326)`) é uma **coluna gerada** a partir dela, corrigida com `st_makevalid` (`20261015000300_terrenos.sql:87-88`), com índice GiST. A área `area_poligonal_m2` também é gerada, em m² inteiros, calculada em `geography` (área real na superfície da Terra, não em graus).
- **Sobreposição:** `app.sobreposicao(a, b, folga_m = 5)` (`:31-41`) calcula a área em comum, a largura dela (diâmetro do maior círculo inscrito, numa projeção UTM escolhida por `_st_bestsrid`) e os percentuais. Conta como o mesmo chão se a área passa de 1 m² e a largura passa de 5 m, ou se cobre metade de qualquer um dos dois (para pegar o mesmo lote estreito desenhado duas vezes). O trigger `t_sobre` recusa (`23P01`) a poligonal sobreposta que o usuário não confirmou em `sobreposicoes_aceitas`; a tela pergunta antes por `app.terrenos_sobrepostos`.
- **Outras geometrias:** setores censitários (`app.setores_censitarios.geom`, geometria oficial do IBGE), pedaço da oferta e da parte, consultas pela poligonal.
- **Distâncias:** busca por raio e distância a pontos de interesse ainda são haversine (`app.distancia_km`, linha reta); a distância a pé vem da rota do Google, calculada no navegador e gravada por `salvar_entorno` e `salvar_distancias_pontos`.
- **Atenção ao escrever SQL:** com `search_path = ''`, toda função PostGIS vai qualificada (`extensions.st_area`), e o operador de sobreposição de caixas também (`operator(extensions.&&)`).

## pg_cron e a rotina diária

`app.rotina_diaria(p_hoje date default current_date)` (`20261015000700_notificacoes.sql:346`) roda uma vez por dia e faz, nesta ordem: os lembretes com antecedência (prazo de tarefa, retomada do Stand By, vencimento de documento, reunião), as ocorrências das tarefas recorrentes (`fluxo.gerar_recorrencias`), as automações de prazo e as agendadas (`fluxo.automacoes_prazo`, `fluxo.automacoes_agenda`), o aviso de tarefa atrasada (uma vez por prazo) e o de subetapa com prazo estourado (uma vez por entrada na subetapa). Devolve quantos avisos e ações gerou.

- **Agendamento:** no fim da migration de notificações (`:520-531`), se a extensão `pg_cron` existe, ela é criada e o job `bkm-terrenos-rotina-diaria` é agendado para `0 9 * * *` (9h UTC = 6h em Brasília). No Supabase, a extensão precisa estar disponível antes de aplicar; o workflow `banco.yml` confere `cron.job` no fim. No teste não há pg_cron e o bloco é pulado.
- **Pode rodar de novo** no mesmo dia sem repetir aviso: a chave única de `notificacoes` (tipo, origem, destinatário, data de referência) e `lembretes.enviado_para` impedem duplicata.
- **`p_hoje`** existe para teste: `regras.sql` chama `app.rotina_diaria(current_date + 23)` para simular o futuro.
- A rotina roda como o dono do banco, sem usuário (`auth.uid()` nulo), e por isso não tem `execute` para `authenticated`.

## Notificações

Leitura completa em `docs/modelo.md`, "Notificações e lembretes".

- `app.notificacoes` é genérica (destinatário, tipo, texto, autor, terreno, tabela e id de origem, data de referência) e só o banco escreve, por `app._notificar` (`20261015000700_notificacoes.sql:98`). Ela não avisa a si mesmo, não avisa quem não é da empresa, não avisa quem não vê o cartão, respeita o tipo desligado e não repete.
- Tipos em `app.tipos_notificacao`, por empresa, com os lembretes padrão e o e-mail padrão. Hoje 18 tipos: os 14 da migration de notificações mais `massa_solicitado`, `massa_entregue` (estudos de massa) e `reuniao_resumo` (Agenda); e o `fluxo` usa `automacao`, `pode_avancar` e `etapa_deixada`. A tabela de `docs/modelo.md` lista só os primeiros 11.
- **Na hora:** triggers e RPCs (tarefa atribuída, menção com @ por `app.tg_mencoes`, colega marcado como participante de reunião por `app.tg_participante_mencao`, aprovação pedida e decidida, comentário em cartão acompanhado). **Por prazo:** a rotina diária, a partir de `app.lembretes`.
- **E-mail:** a notificação nasce com `email_status = 'pendente'` quando a preferência da pessoa (ou o padrão do tipo) pede e-mail. A função do servidor que envia pela conta bkm@ **ainda não existe**.
- **Sino ao vivo:** a migration põe `app.notificacoes` na publicação `supabase_realtime` quando ela existe (`:524-526`).

## "Não informado" nunca vira zero

Regra 7 do CLAUDE.md, aplicada em todo o esquema. O motivo é de negócio: um terreno com "área construída 0" é diferente de um com área construída desconhecida, e um relatório que soma ou filtra não pode confundir os dois.

- **Números** desconhecidos são `null`, e os checks recusam zero onde zero não faz sentido (`area_documental_m2 > 0`, `testada_principal_m > 0`).
- **Seleções** têm um valor explícito de desconhecido como padrão: `nao_informado`, `nao_informada`, `nao_verificado`, `nao_avaliada` (por exemplo `terrenos.posicao_quadra`, `terrenos.formato`, `terrenos.precisao_localizacao`; `v_terreno_infraestrutura` mostra "não verificado" para todo item não registrado).
- **Booleano de verdade** quando "sem limite" é uma informação: `zona_parametros.gabarito_sem_limite`, em vez de gabarito 0 ou 9999.
- **Dado do IBGE em sigilo** fica nulo, com a situação, e a tela diz "não divulgado"; setor sem moradores é zero de verdade (densidade "Sem moradores").
- **Temperatura** nula = não avaliada (1 a 5 quando avaliada).
- Nas condições "Vale quando", campo em branco (nulo ou `nao_informado`) só satisfaz o operador "vazio" / "não informado".

## Versionamento e histórico

Regra 8 do CLAUDE.md: o que muda com o tempo ganha linha nova, não sobrescrita.

| O quê | Como | Onde |
| --- | --- | --- |
| Ficha do terreno | `versao` sobe a cada gravação; `salvar_terreno` recusa versão antiga; cada mudança no log | `terrenos.versao`, `tg_atualizado_em`, `app.auditoria` |
| Documentos | o documento é estável; cada envio é uma versão nova em `documento_versoes` (número, caminho, arquivo, tamanho, quem, quando, `texto_extraido` para a IA futura); o Storage não tem `update` nem `delete` | `app.registrar_documento`, regra 4 |
| Valor venal e IPTU | um exercício vigente por inscrição; correção do mesmo exercício vira revisão nova; exercício mais antigo que o vigente é recusado (4/nov/2026); sem `update` | `app.inscricao_valores`, índice `inscricao_valor_vigente` |
| Análise urbanística | uma vigente por terreno; a consulta nova cria outra e a anterior fica `substituida` e imutável | `analises_urbanisticas`, `analise_vigente_unica`, `_substituir_zonas`, `tg_analise_substituida` |
| Propostas | cada proposta é feita a uma ou mais partes ativas (`proposta_partes`, obrigatório com duas ou mais partes); nenhuma muda o status de outra; status livre e exclusão pelo editor; nos resumos vale a de maior versão | `app.registrar_proposta`, `app.atualizar_status_proposta`, `app.excluir_proposta` |
| Funil | cada passagem é uma linha | `processo_transicoes` |
| Preço da concorrência | cada data de apuração é uma linha | `concorrencia_precos` |
| Consulta do lote na prefeitura | nunca alterada; a próxima é outra linha | `consultas_lote`, `consultas_area` |
| Terreno | nunca apagado: arquiva com motivo (só sem processo aberto) e volta por gestor, diretor ou administrador | `arquivar_terreno`, `reativar_terreno` |
| Configuração | com histórico, desativa em vez de apagar | RPCs de configuração (regra 3) |

## Dados de referência e de onde vêm

| Dado | Tabela | Origem | Como entra |
| --- | --- | --- | --- |
| Municípios (5.571) | `app.municipios` | códigos e nomes do IBGE, compilados em github.com/kelvins/municipios-brasileiros (MIT) | na própria migration `20261015000250_municipios.sql` (São Paulo já vem em `_cadastros.sql`) |
| Zoneamentos (61 zonas de SP e SJC) e bases cadastrais | `app.zoneamentos`, `app.bases_cadastrais` | leis de zoneamento das duas cidades; GeoSampa e GeoSanja | `20261015000200_cadastros.sql` |
| Parâmetros urbanísticos (582 linhas no padrão) | `app.zona_parametros` | pesquisa de 25/out/2026 ("Parâmetros urbanísticos SP e SJC"), aceita pelo Moisés até a validação; cada linha com fonte e situação (`confirmado`, `validar`) | `20261015000260_parametros_urbanisticos.sql`; exportado para `tools/parametros/parametros.json` por `tools/parametros/exportar.sql` (o protótipo e o teste leem) |
| Setores censitários (Censo 2022) e valores | `app.setores_censitarios`, `app.setor_valores` | FTP do IBGE (malha, agregados de renda, demografia, domicílios) | **fora das migrations**: `tools/setores/gerar.py` gera `saida/carga.sql`, carregado com a chave de serviço, uma cidade por vez. Se o banco vivo já recebeu a carga, a conferir |
| Metodologia da renda, faixas e cores | `metodologias_renda`, `renda_faixas`, `densidade_faixas`, `demografia_grupos` | decisões do Moisés de 24/out/2026; fonte única em `tools/setores/metodologia_renda.json`, `metodologia_densidade.json`, `demografia.json` | migration `20261015000900_setores.sql`; o teste confere que bate com os JSON |
| Categorias do entorno, itens de infraestrutura, tipos de documento | `entorno_categorias`, `itens_infraestrutura`, `tipos_documento` | decisões do produto | `20261015000200_cadastros.sql` |
| Funil padrão (8 fases, etapas, subetapas, status, motivos) | `fases_modelo` e companhia, com `empresa_id` nulo | decisões do Moisés (23/out e 4/nov/2026) | `20261015000200_cadastros.sql`, copiado para cada empresa nova |
| Feriados nacionais | `fluxo.feriados` | lista fixa | `20261015000150_fluxo.sql` |
| Quota Ambiental (Mapa 3 da Lei 16.402) | não está no banco | `tools/parametros/gerar_quota_ambiental.py` | `docs/dados/quota-ambiental-3550308.json`, lido pelo front |
| Mercado (Órulo) | `public.im_*` do monitor | coletor do monitor | outro sistema; aqui só leitura |
| Empresa BKM, domínio e equipe prevista | `empresas`, `empresa_dominios`, `equipe_prevista` | decisões da sabatina de 4/nov/2026 | `supabase/carga/bkm.sql`, rodada depois das migrations; pode rodar de novo sem duplicar |

## Integração com o Google Agenda (lado do banco)

Ver "Reuniões com o Google Agenda" em `docs/modelo.md`. O banco já tem a fila: mudar data, duração, local, pauta, participantes ou cancelar uma reunião marcada para a Agenda põe `app.reuniao_agenda` como `pendente` (`_agenda_marcar`); uma função do servidor (a fazer) grava no Google com o token do "Conectar Agenda e Gmail" e devolve o resultado por `agenda_confirmar`. O caminho inverso (mudança feita na Agenda, respostas dos convidados, gravação, transcrição e Anotações do Gemini) entra pelas funções de `service_role`. A variável de sessão `app.agenda_sync = 'on'` marca que a mudança veio do Google, para não voltar para a fila. O usuário só decide o rascunho do resumo (`app.decidir_resumo_ia`).

## Decisões em aberto que tocam o banco

- Se `app.viabilidades` vira view sobre as viabilidades do BKM (coluna `bkm_viabilidade_id` já existe; CLAUDE.md, "Decisões em aberto").
- Catálogo de zoneamento para cidades além de SP e SJC.
- A função do servidor que envia e-mail pela conta bkm@ e a integração real com a Agenda (refresh token no Vault).
- Extração de texto e IA sobre atas (`documento_versoes.texto_extraido` existe; provável pgvector).
- Tipos TypeScript gerados por `supabase gen types` no lugar dos escritos à mão (`apps/web/src/lib/types.ts`).
- Perfis de acesso por terreno: `app.ve_terreno` hoje é "membro da empresa"; o comentário dela diz que os perfis entram ali quando existirem.

## Inconsistências entre as fontes (8/nov/2026)

Encontradas ao comparar `CLAUDE.md`, `docs/modelo.md`, `README.md` e as migrations. Nenhuma foi corrigida aqui.

1. **CLAUDE.md diz que não há banco.** O parágrafo "Fase atual: estrutura em desenho, sem banco criado" e a decisão em aberto "O esquema `app` ainda não foi aplicado: quando for, aquele banco vira produção e acaba a regra de editar migrations no lugar" estão desatualizados: o banco foi aplicado em 5/nov/2026, e a regra de editar no lugar continua até o primeiro uso (como diz a seção "Ambientes" do próprio CLAUDE.md). O comentário do `banco.yml` aponta para "CLAUDE.md, Ambientes › Banco", que está certo.
2. **Contagem de testes.** CLAUDE.md, "Comandos", diz 1.230 testes; a suíte de 8/nov tem 1.262 verificações.
3. **`docs/modelo.md` diz "Tudo no schema `app`"** na primeira linha, mas quadros e tarefas estão no `fluxo` (o próprio modelo.md tem a seção do `fluxo`).
4. **Tabela de notificações do `docs/modelo.md`** lista 11 tipos; o banco tem 18 (`automacao`, `pode_avancar`, `etapa_deixada`, `massa_solicitado`, `massa_entregue`, `reuniao_resumo` e `tarefa_acompanhada` já aparecem em outras partes do texto, mas não na tabela).
5. **Regra 6 ("auditoria automática por trigger")** não cobre todas as tabelas (lista em "Auditoria").
6. **`README.md` da raiz está desatualizado:** manda expor só o esquema `app` (falta `fluxo`), habilitar login por e-mail (hoje é só Google), usar `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (hoje são `SUPABASE_URL` e `SUPABASE_KEY` injetadas pelo Caddy), "crie a empresa (você vira gestor)" (hoje `criar_empresa` é fechada e a empresa vem da carga) e "Carregar dados de exemplo" (a produção começa vazia).
7. **CLAUDE.md, seção "Quadros e tarefas"**, ainda descreve o `fluxo` como "mesmo app, banco e login, no esquema próprio `fluxo` ... para servir a outros apps do mesmo Supabase"; a ADR 0002 (4/nov/2026) mudou isso para um banco próprio (`bkm_tarefas`). O parágrafo "Saída do protótipo" do CLAUDE.md já registra a decisão.
8. **Numeração interna das migrations** ("0002b", "00150", "0011") não segue o nome dos arquivos; inofensivo, mas confunde busca.
9. **Nome de parâmetro enganoso:** `app._notificar(..., p_fase text, ...)` recebe o **tipo** da notificação, não uma fase (`20261015000700_notificacoes.sql:98`).
10. **SQLs avulsos sem registro no repositório.** Os SQLs que o Moisés roda no SQL Editor ficam numa pasta compartilhada do projeto (`/mnt/project-files/saida-prototipo/`, segundo [deploy-e-ambientes.md](deploy-e-ambientes.md)); não há no repositório a lista do que já foi aplicado ao banco vivo.
