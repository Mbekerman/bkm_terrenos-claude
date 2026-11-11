# Catálogo das funções do banco

Lista de todas as funções dos esquemas `app` e `fluxo`, para quem vai chamar o banco pelo front (`supabase.rpc(...)`) ou mexer numa regra. Gerada de forma sistemática em 8/nov/2026: o banco foi montado do zero num Postgres 16 temporário (shim + as 19 migrations, como faz `supabase/tests/run.sh`) e a lista saiu do catálogo `pg_proc`, cruzada com os comentários que ficam logo acima de cada `create function` nas migrations. Nada foi escrito de memória: se uma função não está aqui, ela não existia no banco montado nesse dia.

**Como ler.** Cada linha traz a assinatura (sem os valores padrão; veja o arquivo), o que a função faz, quem pode chamar e o que ela grava. "Quem pode" foi deduzido das chamadas de permissão no corpo da função (`app.exigir_editor`, `app.exigir_administrador`, `fluxo.papel_tarefa`...) e revisado à mão nos casos ambíguos. "Grava" lista as tabelas em que o corpo faz `insert`, `update` ou `delete` diretamente; o que funções chamadas por ela gravam não aparece, e a auditoria (`app.auditoria`) acontece por trigger em quase todas as tabelas. A coluna "Front" marca com ✓ as que o `apps/web` já chama hoje.

**Papéis.** "editor" = `diretor`, `gestor` ou `analista` (`app.exigir_editor`). "membro" = qualquer papel da empresa, inclusive `leitura` e `basico`. "administrador" = a marca `membros.administrador`, que vale em qualquer papel. Detalhes em [banco.md](banco.md), seção "Modelo de segurança".

**Para regenerar** depois de mudar migrations: monte o banco como o `run.sh` (sem o passo dos testes) e rode a consulta do fim deste arquivo; compare com as tabelas daqui.

## Números

| Tipo | Quantas | Onde neste arquivo |
| --- | --- | --- |
| Chamáveis pelo usuário logado (`authenticated` tem `execute`) | 195 | grupos abaixo |
| Só do servidor ou do próprio banco (sem `execute` para `authenticated`) | 28 | seção Funções só do servidor |
| Internas (prefixo `_`) | 72 | seção Funções internas |
| Funções de trigger | 82 | seção Funções de trigger |
| **Total** (`app` 266 + `fluxo` 111) | 377 | |


Não há sobrecarga (duas funções com o mesmo nome): cada nome tem uma assinatura só, então `supabase.rpc('nome', {...})` com os parâmetros pelo nome (`p_terreno`, `p_dados`...) é sempre inequívoco. Duas funções são redefinidas por uma migration posterior: `fluxo._avisar` (o `fluxo` nasce com um aviso vazio e `20261015000700_notificacoes.sql` troca pelo `app._notificar`) e `fluxo._pendencias_conclusao`.

## Funções chamáveis pelo front, por assunto

### Acesso, papéis e hierarquia

Funções que respondem "quem é você nesta empresa". São usadas dentro das políticas de RLS e no começo de cada RPC; o front também pode chamá-las para esconder botões, mas a barreira de verdade é a chamada dentro da RPC.

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.nivel_papel(p_papel text)` → `integer` | Nível do papel: o superior está sempre num nível acima. Quem tem o nível exigido por uma aprovação fica dispensado dela. | qualquer logado (função pura) | só lê |  | `20261015000100_base.sql:44` |
| `app.minhas_empresas()` → `SETOF uuid` | Empresas de que quem chama é membro. É a base de toda política `ver` (SECURITY DEFINER para não cair na RLS de `membros` e recursar). | qualquer logado | só lê |  | `20261015000100_base.sql:84` |
| `app.papel(p_empresa uuid)` → `text` | Papel de quem chama na empresa (`diretor`, `gestor`, `analista`, `leitura`, `basico`) ou nulo se não é membro. | qualquer logado | só lê |  | `20261015000100_base.sql:89` |
| `app.eh_membro(p_empresa uuid)` → `boolean` | Verdadeiro se quem chama é membro da empresa, em qualquer papel. | qualquer logado | só lê |  | `20261015000100_base.sql:94` |
| `app.eh_gestor(p_empresa uuid)` → `boolean` | Gestor ou acima (diretor): força avanço. | qualquer logado | só lê |  | `20261015000100_base.sql:100` |
| `app.eh_administrador(p_empresa uuid)` → `boolean` | Verdadeiro se quem chama tem a marca `administrador` na empresa. | qualquer logado | só lê |  | `20261015000100_base.sql:105` |
| `app.eh_diretoria(p_empresa uuid)` → `boolean` | Diretoria ou administrador: mexe nas taxas e despesas financeiras do estudo de viabilidade. | qualquer logado | só lê |  | `20261015000100_base.sql:111` |
| `app.exigir_administrador(p_empresa uuid)` → `void` | Erro 42501 "Só o administrador muda a configuração" se quem chama não é administrador. | qualquer logado | só lê |  | `20261015000100_base.sql:116` |
| `app.eh_superior(p_empresa uuid, p_chefe uuid, p_membro uuid)` → `boolean` | Verdadeiro se p_chefe está acima de p_membro na hierarquia (superior, superior do superior...). | qualquer logado | só lê |  | `20261015000100_base.sql:127` |
| `app.empresas_edicao()` → `SETOF uuid` | Empresas em que o usuário pode editar (diretor, gestor ou analista). | qualquer logado | só lê |  | `20261015000100_base.sql:141` |
| `app.exigir_editor(p_empresa uuid)` → `void` | Erro 42501 "Seu acesso é somente leitura" se o papel não é diretor, gestor ou analista. | qualquer logado | só lê |  | `20261015000100_base.sql:146` |
| `app.exigir_membro(p_empresa uuid)` → `void` | Erro 42501 "Sem acesso a esta empresa" se quem chama não é membro. | qualquer logado | só lê |  | `20261015000100_base.sql:156` |
| `app.ve_terreno(p_terreno uuid, p_user uuid)` → `boolean` | Teto dos cartões (fluxo, visibilidade por cartão): quem não vê o terreno não vê os cartões do quadro dele. Hoje vê quem é da empresa; os perfis de acesso à seção Terrenos e a cada terreno entram aqui quando existirem. | qualquer logado (responde para qualquer `p_user`) | só lê |  | `20261015000300_terrenos.sql:889` |

### Usuários e menções

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.mudar_arroba(p_user uuid, p_arroba text)` → `text` | O administrador muda o @ de quem é da equipe dele. | administrador da empresa do domínio da pessoa | grava `auditoria`, `usuarios` |  | `20261015001100_usuarios.sql:194` |
| `app.salvar_minha_foto(p_url text)` → `void` | Foto do Google buscada pelo front na API People quando o login não a traz (contas do Workspace com a foto restrita à organização não mandam "picture" no login; caso do Moises, 5/nov/2026). Cada um grava só a própria, e só endereço de foto do Google. | logado; só a própria foto | grava `usuarios` | ✓ | `20261015001100_usuarios.sql:222` |
| `app.arrobas_no_texto(p_texto text)` → `text[]` | Os @ de um texto, em minúsculas, sem o ponto final colado ("@ana." = ana). | qualquer logado; a RLS filtra | só lê |  | `20261015001100_usuarios.sql:255` |

### Ficha do terreno: gravar, desfazer, arquivar, ler

O terreno é inserido direto na tabela (`insert into app.terrenos`), mas só muda por `salvar_terreno` (regra 11 do CLAUDE.md).

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.salvar_terreno(p_terreno uuid, p_versao integer, p_dados jsonb)` → `integer` | Única forma de alterar a ficha do terreno. Recusa versão antiga (PT409, edição simultânea; nunca 40001, que o PostgREST repete em laço) e campos de controle (código, versão, criado_*, arquivamento); só as chaves enviadas em `p_dados` mudam. Devolve a versão nova. Cartório digitado vira `cartorio_origem = digitado`; área cadastral apagada volta à soma dos SQLs. | editor (diretor, gestor, analista) | grava `terrenos`; grava via `salvar_terreno` | ✓ | `20261015000500_regras.sql:2060` |
| `app.desfazer_alteracao(p_auditoria bigint)` → `integer` | Volta os campos daquela alteração ao valor de antes, pela salvar_terreno. O histórico não perde nada: o registro original fica marcado (desfeito_em, desfeito_por) e a volta é um registro novo que aponta para ele (desfaz_id). Pode quem fez a alteração, os superiores dessa pessoa e o administrador. | editor que fez a alteração, superior dele ou administrador | grava `auditoria`; grava via `salvar_terreno` |  | `20261015000500_regras.sql:2118` |
| `app.arquivar_terreno(p_terreno uuid, p_motivo text)` → `void` | Arquiva o terreno com motivo (nunca apaga); só sem processo aberto. | editor (diretor, gestor, analista) | grava `terrenos` |  | `20261015000500_regras.sql:2160` |
| `app.reativar_terreno(p_terreno uuid)` → `void` | Desarquivar (revisão de 2/nov/2026: o terreno arquivado não tinha volta): gestor, diretor ou o administrador. O arquivamento fica no histórico. | gestor, diretor ou administrador | grava `terrenos` |  | `20261015000500_regras.sql:2178` |
| `app.proprietarios_completos(p_terreno uuid)` → `boolean` | Cada parte ativa tem proprietários somando 100% de participação (sem parte ativa, a soma de todos); decide o item "Proprietário" da completude. SECURITY INVOKER. | membro (RLS de quem chama) | só lê | ✓ | `20261015000300_terrenos.sql` |
| `app.excluir_terreno(p_terreno uuid)` → `void` | Excluir (9/nov/2026): marca `excluido_em`/`excluido_por`; o terreno some de toda leitura (RLS). Fica 180 dias. | diretor ou administrador (`eh_diretoria`) | grava `terrenos` | ✓ | `20261015001700_exclusao_terreno.sql` |
| `app.restaurar_terreno(p_terreno uuid)` → `text` | Tira a marca de excluído; devolve o código. | diretor ou administrador | grava `terrenos` | ✓ | idem |
| `app.terrenos_excluidos(p_empresa uuid)` → `table` | Lista dos excluídos com quem excluiu e `apagar_em` (excluído + 180 dias). | administrador | só lê | ✓ | idem |
| `app.deletar_terreno(p_terreno uuid, p_nome text)` → `jsonb` | Apaga de vez (por `_apagar_terreno`), excluído ou não, se `p_nome` bate com o nome (sem diferença de maiúsculas e espaços). Devolve `id` do registro em `terrenos_apagados`, `codigo` e `storage`. | administrador | apaga tudo do terreno | ✓ | idem |
| `app.limpeza_feita(p_apagado uuid)` → `void` | Marca `limpo_em` em `terrenos_apagados` depois de apagar storage e Drive (gancho para a função do servidor). | administrador | grava `terrenos_apagados` |  | idem |
| `app.ficha_dados(p_empresa uuid, p_codigo text)` → `jsonb` | Tudo o que a ficha precisa numa chamada só (substitui 24 pedidos). Nulo para código que não existe nas empresas da pessoa. SECURITY INVOKER: vale a RLS de quem chama. | membro (RLS de quem chama) | só lê | ✓ | `20261015001600_reunioes_agenda.sql:280` |
| `app.zona_da_prefeitura(p_terreno uuid, p_zona text)` → `boolean` | Grava a zona da cidade (região oficial da subprefeitura no GeoSampa: centro, norte, sul, leste, oeste), só se vazia ou vinda da prefeitura (`zona_origem`); nunca a digitada nem a anterior à origem. Devolve se gravou. | editor (diretor, gestor, analista) | grava `terrenos` |  | `20261015000500_regras.sql` |
| `app.cartorio_da_prefeitura(p_terreno uuid, p_cartorio text)` → `boolean` | Grava o cartório de registro de imóveis vindo do GeoSampa pelo pino, só se o usuário não digitou outro (`cartorio_origem`). Devolve se gravou. | editor (diretor, gestor, analista) | grava `terrenos` |  | `20261015000500_regras.sql:2815` |

### Cadastro: poligonal, duplicidade, código e município

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.geojson_poligono_valido(g jsonb)` → `boolean` | GeoJSON Polygon válido: anéis fechados, ≥ 4 posições, lon/lat dentro dos limites. | qualquer logado; a RLS filtra | só lê |  | `20261015000300_terrenos.sql:10` |
| `app.sobreposicao(a geometry, b geometry, p_folga_m double precision)` → `TABLE(area_m2 double precision, largura_m double precisio...` | Sobreposição entre duas poligonais (geometria 4326). | qualquer logado; a RLS filtra | só lê |  | `20261015000300_terrenos.sql:31` |
| `app.terrenos_sobrepostos(p_empresa uuid, p_poligono jsonb, p_ignorar uuid)` → `TABLE(terreno_id uuid, codigo text, nome text, situacao t...` | Primeiro passo do cadastro: a poligonal. Antes de criar o terreno, procura os que já ocupam parte dela (critério em app.sobreposicao: a faixa de até 5 m na divisa, imprecisão do desenho, não conta). | membro (inclui leitura e básico) | só lê | ✓ | `20261015000500_regras.sql:482` |
| `app.buscar_duplicados(p_empresa uuid, p_matricula text, p_cartorio text, p_inscricao text, p_logradouro text, p_numero text)` → `TABLE(terreno_id uuid, codigo text, nome text, motivo tex...` | Terrenos da empresa que já têm a matrícula (cartório em branco conta como o mesmo), a inscrição ou o endereço informado, com o motivo e a certeza. | membro (inclui leitura e básico) | só lê |  | `20261015000500_regras.sql:436` |
| `app.codigo_terreno(p_n bigint)` → `text` | Código curto do terreno (decisão do Moisés, 4/nov/2026): letra + 3 dígitos pela ordem de cadastro, A001 a A999, depois B001... até Z999, sem as letras I e O, que se confundem com 1 e 0 (decisão do Moisés, 4/nov/2026): 24 letras, 23.976 terrenos. | qualquer logado; a RLS filtra | só lê |  | `20261015000400_negociacao.sql:498` |
| `app.municipio_por_nome(p_nome text, p_uf text)` → `uuid` | Resolve o `municipio_id` pelo nome da cidade e a UF que a busca do Google devolve, sem acento e sem diferenciar maiúsculas. | qualquer logado; a RLS filtra | só lê | ✓ | `20261015000250_municipios.sql:5609` |
| `app.normaliza_nome(p text)` → `text` | A busca de endereço do Google devolve o nome da cidade e a UF; o front resolve o municipio_id por aqui. Compara sem acento, sem diferenciar maiúsculas e ignorando espaço, hífen e apóstrofo. | qualquer logado; a RLS filtra | só lê |  | `20261015000250_municipios.sql:5602` |
| `app.distancia_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)` → `numeric` | Distância em linha reta (haversine). Rota de verdade é com o serviço de mapas. | qualquer logado; a RLS filtra | só lê |  | `20261015000500_regras.sql:305` |

### Partes do terreno (vários donos)

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.salvar_parte(p_terreno uuid, p_parte uuid, p_dados jsonb)` → `uuid` | Cadastra ou altera uma parte. p_dados: nome, essencial, poligono, area_m2, observacoes. Tornar uma parte dispensável é com gestor ou diretor (é o passo antes de tirá-la). O pedaço fica dentro do terreno (5 m de folga). | editor; tornar parte dispensável só gestor ou diretor | grava `terreno_partes` | ✓ | `20261015000500_regras.sql:1509` |
| `app.remover_parte(p_parte uuid, p_motivo text)` → `void` | Tira a parte do terreno (o dono não vende, ou a área mudou). A negociação dela tem que estar encerrada; parte essencial só sai com gestor ou diretor. As matrículas e as inscrições dela ficam sem parte (voltam para o quadro de cima da aba Terreno; a auditoria guarda o vínculo antigo). | editor; parte essencial só gestor ou diretor | grava `inscricao_partes`, `matricula_partes`, `terreno_partes` |  | `20261015000500_regras.sql:1575` |
| `app.excluir_parte(p_parte uuid)` → `void` | Exclui a parte cadastrada por engano: só a que não tem corretor, oferta nem negociação. As etiquetas e as pessoas dela saem (a matrícula, o SQL e o cadastro da pessoa ficam). A que tem história sai por remover_parte. | editor (diretor, gestor, analista) | grava `inscricao_partes`, `matricula_partes`, `terreno_partes`, `terreno_pessoas` | ✓ | `20261015000500_regras.sql:1617` |

### Prefeitura, urbanismo e topografia

Os dados do GeoSampa e do GeoSanja são consultados pelo navegador (passando pelo Caddy) e gravados por estas RPCs; o banco confere coerência (lote certo, cidade certa), não a autenticidade do conteúdo.

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.registrar_consulta_lote(p_inscricao uuid, p_lote jsonb, p_poligono jsonb, p_area_poligono numeric, p_camadas jsonb, p_zonas jsonb, p_camadas_com_erro text[], p_criar_analise boolean)` → `uuid` | Grava a consulta do lote na prefeitura (GeoSampa ou GeoSanja) feita pelo navegador: confere que o lote devolvido é o da inscrição e que o terreno é da cidade da base, completa só campos vazios da inscrição e, com `p_criar_analise`, troca as zonas deste lote na análise urbanística. A consulta nunca é alterada depois. | editor (diretor, gestor, analista) | grava `consultas_lote`, `inscricoes_municipais`, `terrenos` | ✓ | `20261015000500_regras.sql:2666` |
| `app.guardar_lotes_prefeitura(p_empresa uuid, p_base text, p_lotes jsonb, p_quadras text[])` → `int` | Guarda os lotes da prefeitura que o mapa de lotes de São José montou pelo GeoSanja (10/nov/2026): upsert por inscrição e, nas quadras dadas como montadas, apaga o lote guardado que não veio. Lote com `da_base: true` só conta como presente. Até 3.000 lotes e 20 quadras por chamada. | editor da empresa (`empresas_edicao`) | grava `lotes_prefeitura`, `quadras_prefeitura` | ✓ | `20261015001800_lotes_prefeitura.sql` |
| `app.registrar_consulta_area(p_terreno uuid, p_camadas jsonb, p_camadas_com_erro text[])` → `uuid` | Grava a consulta pela poligonal inteira (quadro Restrições e entorno), com as camadas que falharam. | editor (diretor, gestor, analista) | grava `consultas_area` | ✓ | `20261015000500_regras.sql:2724` |
| `app.registrar_zonas_sem_inscricao(p_terreno uuid, p_zonas jsonb, p_fonte text)` → `uuid` | Parte do terreno sem inscrição: as zonas tiradas pela poligonal do terreno, fora dos lotes (o front cruza a poligonal com a camada de zoneamento). Lista vazia tira essa parte (o terreno ficou todo coberto por lotes). | editor (diretor, gestor, analista) | grava por funções internas (ver o código) |  | `20261015000500_regras.sql:2884` |
| `app.registrar_zonas_lote(p_terreno uuid, p_inscricao uuid, p_zonas jsonb, p_fonte text)` → `uuid` | Zonas de um lote registradas à mão (certidão de uso do solo, consulta prévia...), pela ficha, aba Parâmetros, "Registrar zonas": mesma troca de app._substituir_zonas, com a fonte obrigatória; p_inscricao nulo = parte do terreno sem inscrição. | editor (diretor, gestor, analista) | grava por funções internas (ver o código) | ✓ | `20261015000500_regras.sql:2899` |
| `app.parametros_zona(p_empresa uuid, p_zoneamento uuid, p_tipo text, p_macrozona text, p_lote_area numeric, p_uso text)` → `SETOF app.zona_parametros` | Parâmetros do catálogo (zona_parametros) para uma zona do lote: a linha do tipo de empreendimento pedido ou, se a zona não tem regra própria para ele, a de mercado (o campo tipo da linha diz qual valeu). | qualquer logado; a RLS filtra | só lê |  | `20261015000500_regras.sql:50` |
| `app.salvar_zona_parametro(p_empresa uuid, p_id uuid, p_dados jsonb)` → `uuid` | Parâmetro urbanístico do catálogo da empresa: cria (p_id nulo; precisa de zona, tipo e fonte) ou altera. Desativar = ativo false; a linha nunca é apagada (a auditoria guarda cada mudança). | administrador | grava `zona_parametros` |  | `20261015000500_regras.sql:2921` |
| `app.classificar_topografia(p_empresa uuid, p_declividade numeric, p_terra numeric)` → `text` | Perfil topográfico (plano, inclinado, leve... crítico) pela declividade média e pela terra mexida, com os limites da empresa (`topografia_config`). Função pura de leitura. | qualquer logado (só lê `topografia_config`) | só lê |  | `20261015000500_regras.sql:2751` |
| `app.registrar_topografia(p_terreno uuid, p_declividade numeric, p_inclinacao numeric, p_terra numeric, p_desnivel numeric, p_fonte text)` → `text` | O front mede (laser em São Paulo, Google fora) e grava aqui; o perfil sai do banco. | editor (diretor, gestor, analista) | grava `terrenos` |  | `20261015000500_regras.sql:2771` |
| `app.salvar_topografia_config(p_empresa uuid, p_plano numeric, p_inclinado numeric, p_leve numeric, p_mediano numeric, p_intenso numeric, p_agudo numeric, p_critico_terra numeric)` → `void` | Limites da classificação: só o administrador; vale para as próximas medições e para reclassificar as já feitas (o perfil gravado é recalculado aqui). | administrador | grava `terrenos`, `topografia_config` |  | `20261015000500_regras.sql:2795` |

### Entorno e pontos de interesse

A busca no Google (Places e Routes) roda no navegador; o banco recebe o resultado e recusa se o terreno mudou de lugar no meio da busca.

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.salvar_entorno(p_terreno uuid, p_latitude double precision, p_longitude double precision, p_itens jsonb, p_rota_a_pe boolean)` → `integer` | Grava a busca do entorno feita no navegador (Places + rota a pé), trocando a anterior. Recusa coordenada diferente da atual do terreno; descarta categoria inativa ou desconhecida e lugar além do raio a pé da categoria; o mesmo lugar entra uma vez. | editor (diretor, gestor, analista) | grava `terreno_entorno`, `terreno_entorno_buscas` | ✓ | `20261015000500_regras.sql:1903` |
| `app.excluir_lugar_entorno(p_terreno uuid, p_google_place_id text)` → `void` | Exclui um lugar do Google do entorno deste terreno; continua fora nas buscas seguintes. | editor (diretor, gestor, analista) | grava `terreno_entorno` | ✓ | `20261015000500_regras.sql:1943` |
| `app.restaurar_lugar_entorno(p_terreno uuid, p_google_place_id text)` → `void` | Desfaz a exclusão: o lugar volta à ficha do terreno, sem nova busca. | editor (diretor, gestor, analista) | grava `terreno_entorno` | ✓ | `20261015000500_regras.sql:1958` |
| `app.excluir_ponto_terreno(p_terreno uuid, p_ponto uuid)` → `void` | Exclui um ponto da empresa só da ficha deste terreno (continua nos outros e no mapa). | editor (diretor, gestor, analista) | grava `terreno_pontos_excluidos` | ✓ | `20261015000500_regras.sql:1972` |
| `app.restaurar_ponto_terreno(p_terreno uuid, p_ponto uuid)` → `void` | Desfaz: o ponto volta à ficha deste terreno. | editor (diretor, gestor, analista) | grava `terreno_pontos_excluidos` | ✓ | `20261015000500_regras.sql:1990` |
| `app.salvar_distancias_pontos(p_terreno uuid, p_latitude double precision, p_longitude double precision, p_itens jsonb)` → `integer` | Grava as distâncias (a pé e de carro, pela rota) do terreno aos pontos da empresa. Recusa coordenada diferente da atual; ignora ponto de outra empresa ou inativo. p_itens: [{ponto_id, distancia_pe_m, duracao_pe_s, distancia_carro_m, duracao_carro_s}] | editor (diretor, gestor, analista) | grava `terreno_ponto_distancias` | ✓ | `20261015000500_regras.sql:2005` |

### Setores censitários (renda, densidade, perfil)

Só leitura, sobre dados públicos do IBGE carregados à parte (ver `banco.md`, "Dados de referência").

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.renda_faixa(p_valor numeric)` → `smallint` | Faixa (1 a 16) da renda familiar estimada, pelas faixas fixas de `renda_faixas`. | qualquer logado; a RLS filtra | só lê |  | `20261015000900_setores.sql:148` |
| `app.densidade_faixa(p_valor numeric)` → `smallint` | Faixa da densidade demográfica bruta, pelas faixas fixas de `densidade_faixas`. | qualquer logado; a RLS filtra | só lê |  | `20261015000900_setores.sql:171` |
| `app.estatisticas_area(p_area geometry)` → `jsonb` | estatísticas de uma área (raio ou poligonal). Cada setor entra pela fração da área dele que cai dentro (supõe moradores espalhados por igual no setor). | qualquer logado; a RLS filtra | só lê |  | `20261015000900_setores.sql:211` |
| `app.estatisticas_raio(p_lat double precision, p_lng double precision, p_raio_m double precision)` → `jsonb` | Estatísticas do entorno num círculo (lat, lng, raio em metros); ver `estatisticas_area`. | qualquer logado; a RLS filtra | só lê |  | `20261015000900_setores.sql:244` |
| `app.estatisticas_terreno(p_terreno uuid, p_raio_m double precision)` → `jsonb` | do terreno: sem raio, a poligonal; com raio, o círculo em volta do pino (a RLS do terreno vale) | qualquer logado; a RLS filtra | só lê |  | `20261015000900_setores.sql:251` |
| `app.setor_soma(p_setor text, p_vars text[])` → `numeric` | soma de variáveis de um setor; nula se alguma não foi divulgada ou não existe | qualquer logado; a RLS filtra | só lê |  | `20261015000900_setores.sql:292` |
| `app.perfil_area(p_area geometry)` → `jsonb` | Perfil da população de uma área: pirâmide por idade e sexo, domicílios por moradores, tipo de domicílio; sigilo do IBGE fica "não divulgado". | qualquer logado; a RLS filtra | só lê |  | `20261015000900_setores.sql:297` |
| `app.perfil_terreno(p_terreno uuid, p_raio_m double precision)` → `jsonb` | Perfil da população do terreno: poligonal (sem raio) ou círculo em volta do pino. | qualquer logado; a RLS filtra | só lê |  | `20261015000900_setores.sql:346` |
| `app.setores_no_retangulo(p_oeste double precision, p_sul double precision, p_leste double precision, p_norte double precision, p_zoom integer)` → `TABLE(cd_setor text, faixa smallint, renda numeric, faixa...` | setores da tela para o mapa, simplificados pelo zoom (meio pixel de tolerância) | qualquer logado; a RLS filtra | só lê |  | `20261015000900_setores.sql:354` |

### Concorrência cadastrada à mão

A concorrência manual está desligada no protótipo (só Órulo); as tabelas e funções continuam no banco.

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.concorrencia_tipologias_em(p_data date)` → `TABLE(tipologia_id uuid, empresa_id uuid, empreendimento_...` | Cada tipologia ativa com o último preço apurado até p_data. | qualquer logado; a RLS filtra | só lê |  | `20261015000800_concorrencia.sql:132` |
| `app.concorrencia_resumo(p_data date)` → `TABLE(empreendimento_id uuid, empresa_id uuid, tipologias...` | Preço por m² do empreendimento: com as unidades de todas as tipologias precificadas, média ponderada pelo mix (soma de preço × unidades ÷ soma de área × unidades); faltando alguma, média simples do preço por m² das tipologias (mix_completo = false). apurado_de/ate: período dos preços usados. | qualquer logado; a RLS filtra | só lê |  | `20261015000800_concorrencia.sql:149` |

### Fases e funil: abrir, mover, encerrar, aprovar

Toda mudança de etapa, subetapa ou status passa por `app._passagem` (interna), que confere editor, pendências e aprovações e grava `processo_transicoes`.

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.abrir_fase(p_terreno uuid, p_fase text, p_forcar boolean, p_comentario text)` → `uuid` | Abre a fase à mão (fase sem dependência, reabrir uma encerrada, ou antes da hora). Dependência pendente trava; gestor ou diretor força com justificativa. | editor; abrir antes da hora só gestor ou diretor, com justificativa | grava `processo_transicoes`; grava pelo funil (`processos`, `processo_transicoes`, `aprovacoes`) |  | `20261015000500_regras.sql:601` |
| `app.fases_do_terreno(p_terreno uuid)` → `TABLE(fase text, nome text, ordem integer, entrada boolea...` | O que falta para cada fase do terreno abrir, com a situação de cada uma. | membro | só lê |  | `20261015000500_regras.sql:631` |
| `app.abrir_negociacao(p_terreno uuid, p_oferta uuid)` → `uuid` | Abre o processo da fase de entrada (Novos Negócios) do terreno, ou devolve o aberto. Recusa terreno arquivado. | editor (diretor, gestor, analista) | grava por funções internas (ver o código); grava pelo funil (`processos`, `processo_transicoes`, `aprovacoes`) |  | `20261015000500_regras.sql:656` |
| `app.checar_passagem(p_processo uuid, p_destino_tipo text, p_destino text)` → `jsonb` | O que falta para uma passagem (padrão: a próxima etapa, ou concluir a fase na última). | membro (inclui leitura e básico) | só lê | ✓ | `20261015000500_regras.sql:1105` |
| `app.checar_avanco(p_processo uuid)` → `jsonb` | Atalho de `checar_passagem(processo)` para a próxima etapa. | membro (via `checar_passagem`) | só lê |  | `20261015000500_regras.sql:1160` |
| `app.mover_etapa(p_processo uuid, p_forcar boolean, p_comentario text)` → `jsonb` | Avança para a próxima etapa. Sair da última não é avanço: é concluir a fase (encerrar_processo). | editor (conferido em `_passagem`) | grava por funções internas (ver o código); grava pelo funil (`processos`, `processo_transicoes`, `aprovacoes`) | ✓ | `20261015000500_regras.sql:1166` |
| `app.mover_para_etapa(p_processo uuid, p_etapa text, p_forcar boolean, p_comentario text)` → `jsonb` | Arrastar no quadro de etapas. Para frente, passa por cada etapa com as regras de mover_etapa (se uma falhar, nada muda; aprovação só na última). Para trás, com o motivo opcional, vai para o histórico como "retorno". | editor (diretor, gestor, analista) | grava por funções internas (ver o código); grava pelo funil (`processos`, `processo_transicoes`, `aprovacoes`) | ✓ | `20261015000500_regras.sql:1186` |
| `app.mover_subetapa(p_processo uuid, p_subetapa text, p_forcar boolean, p_comentario text)` → `jsonb` | Troca a subetapa dentro da etapa atual (arrastar no kanban da etapa). | editor (conferido em `_passagem`) | grava por funções internas (ver o código); grava pelo funil (`processos`, `processo_transicoes`, `aprovacoes`) | ✓ | `20261015000500_regras.sql:1219` |
| `app.encerrar_processo(p_processo uuid, p_status text, p_motivo text, p_detalhe text, p_retomar_em date, p_pontos_sucesso text, p_forcar boolean, p_comentario text, p_tarefas text)` → `jsonb` | Encerramento da fase: concluído (na fase de entrada, Comprado), perdido, descartado ou stand by, se o status existe na fase (status_modelo). O processo guarda a etapa e a subetapa em que estava. Concluir só na última etapa e conforme a aprovação configurada em status_modelo. Motivo, relato, pontos de sucesso e data de retomar são opcionais (10/nov/2026); o que vier é conferido. | editor; aprovações conforme `status_modelo` | grava por funções internas (ver o código); grava pelo funil (`processos`, `processo_transicoes`, `aprovacoes`) | ✓ | `20261015000500_regras.sql:1240` |
| `app.editar_encerramento(p_processo uuid, p_dados jsonb)` → `void` | Completa depois o que ficou em branco ao encerrar (10/nov/2026): `motivo` (Perdido e Descartado, da lista), `detalhe`, `pontos_sucesso` (Concluído) e `retomar_em` (Stand By, futura). Só as chaves enviadas mudam; vazio apaga. Recusa com a fase ativa. | editor (diretor, gestor, analista) | grava `processos` (auditado); lembretes do Stand By | ✓ | `20261015000500_regras.sql:1301` |
| `app.retomar_processo(p_processo uuid)` → `void` | Volta para Ativo na mesma etapa e subetapa. O tempo parado não conta na etapa nem na subetapa: as datas de entrada andam o tempo do stand by. | editor (diretor, gestor, analista) | grava `processo_transicoes`, `processos` | ✓ | `20261015000500_regras.sql:1290` |
| `app.decidir_aprovacao(p_pedido uuid, p_aprovar boolean, p_comentario text)` → `jsonb` | Decide um pedido. Aprova de uma vez todas as linhas na vez que a pessoa pode decidir (um diretor que aprova pelo gestor também cobre o nível de diretor). Recusa encerra o pedido inteiro. Tudo aprovado: a passagem acontece. | aprovador previsto ou qualquer superior dele | grava `aprovacoes`; avisa pelo sino; grava pelo funil (`processos`, `processo_transicoes`, `aprovacoes`) | ✓ | `20261015000500_regras.sql:1324` |
| `app.cancelar_aprovacao(p_pedido uuid)` → `void` | Quem pediu (ou quem pode decidir) desiste do pedido. | quem pediu ou quem pode decidir | grava `aprovacoes` | ✓ | `20261015000500_regras.sql:1383` |
| `app.tarefas_abertas_fase(p_processo uuid)` → `integer` | Quantas tarefas abertas a fase tem (para os formulários de Stand By, Perdido e Descartado). | membro | só lê |  | `20261015001300_funil_tarefas.sql:181` |
| `app.trava_tarefa(p_tarefa uuid)` → `jsonb` | Para a tela: quem vê o cartão vê a situação dele na etapa. | quem vê o cartão | só lê |  | `20261015001300_funil_tarefas.sql:117` |
| `app.jornada_processo(p_processo uuid)` → `jsonb` | A jornada da etapa atual do processo, para o quadro de avanço: os itens que valem agora (com o valor), os que não se aplicam e as regras que valem. Leitura sem permissão de ver o terreno devolve nulo. | quem vê o terreno | só lê |  | `20261015001400_jornada.sql:129` |
| `app.condicao_aplica(p_terreno uuid, p_cond jsonb)` → `boolean` | A condição "Vale quando" vale para o terreno? (31/out/2026; as regras moram em app.avaliar_condicao, 001200). Sem condição, vale. Quem não vê o terreno não pergunta. | quem vê o terreno | só lê |  | `20261015000500_regras.sql:149` |

### Negociação comercial: ofertas, temperatura, propostas

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.registrar_oferta(p_terreno uuid, p_valor numeric, p_forma text, p_corretor uuid, p_observacao_pagamento text, p_aceita_permuta text, p_validade date, p_data date, p_comissao_pct numeric, p_ofertante uuid, p_comissao_valor numeric, p_poligono jsonb, p_partes jsonb)` → `jsonb` | Registra a oferta (valor, forma de pagamento, corretor, ofertante, pedaço da poligonal, partes cobertas) e abre a negociação se não houver uma aberta. Devolve `{oferta_id, processo_id, negociacao_nova}`. Pedaço tem de ficar dentro do terreno. | editor (diretor, gestor, analista) | grava `atividades`, `negociacoes`, `oferta_partes`, `ofertas` | ✓ | `20261015000500_regras.sql:672` |
| `app.definir_temperatura(p_terreno uuid, p_temperatura integer)` → `void` | Temperatura de 1 a 5 (nulo = não avaliada) do terreno, com ou sem negociação (9/nov/2026; antes recebia o processo). Não mexe na `versao`; o log é o da `auditoria` do terreno, juntando cliques seguidos (`juntar_auditoria`); a lixeira não desfaz. | editor (diretor, gestor, analista) | grava `terrenos` | ✓ | `20261015000500_regras.sql:725` |
| `app.definir_oferta_referencia(p_processo uuid, p_oferta uuid)` → `void` | Escolhe qual oferta do terreno é a referência da negociação (condições pedidas vêm dela). | editor (diretor, gestor, analista) | grava `negociacoes` | ✓ | `20261015000500_regras.sql:761` |
| `app.registrar_proposta(p_processo uuid, p_origem text, p_valor numeric, p_forma text, p_condicoes text, p_data_apresentacao date, p_validade date, p_status text, p_partes uuid[], p_permuta_fin_pct numeric, p_permuta_fis_pct numeric, p_permuta_fis_unidades int)` → `uuid` | Nova proposta na negociação ativa, com as modalidades da pedida (11/nov/2026): `p_valor` é o dinheiro (nulo só com alguma permuta), permuta financeira em % do VGV líquido e permuta física em % ou em unidades (não as duas); `p_forma` nula = derivada por `app.forma_modalidades`. Proposta feita às partes `p_partes` (grava `proposta_partes`). Partes: só ativas do terreno; nulo vale só com uma parte ativa (entra ela) ou na negociação de uma parte (`processos.parte_id`, entra ela); com duas ou mais, erro "Escolha para qual parte é a proposta". Não mexe em nenhuma outra proposta (decisão do Moises, 9/nov/2026); `proposta_anterior_id` = a mais recente com parte em comum, só informativo. A versão segue uma só sequência no processo. | editor (diretor, gestor, analista) | grava `propostas`, `proposta_partes` | ✓ | `20261015000500_regras.sql` |
| `app.atualizar_status_proposta(p_proposta uuid, p_status text)` → `void` | Muda o status de qualquer proposta, para qualquer status. | editor (diretor, gestor, analista) | grava `propostas` | ✓ | `20261015000500_regras.sql` |
| `app.excluir_proposta(p_proposta uuid)` → `void` | Exclui a proposta (fica a linha de `delete` na auditoria); quem apontava para ela em `proposta_anterior_id` passa à anterior dela. Recusa proposta com documento. | editor (diretor, gestor, analista) | apaga `propostas` (e `proposta_partes` em cascata) | ✓ | `20261015000500_regras.sql` |
| `app.vincular_viabilidade(p_processo uuid, p_nome text, p_vgv numeric, p_margem_pct numeric, p_bkm_id uuid)` → `uuid` | Cria uma viabilidade resumida (nome, VGV, margem, id externo do BKM) e liga ao processo. Anterior ao estudo de viabilidade completo; ver `criar_viabilidade` e `vincular_estudo`. | editor (diretor, gestor, analista) | grava `processos`, `viabilidades` |  | `20261015000500_regras.sql:1798` |

### Corretores

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.criar_corretor(p_empresa uuid, p_dados jsonb)` → `uuid` | Cria o corretor e a pessoa dele (nome, e-mail e celular obrigatórios; CPF com 11 dígitos, que reaproveita a pessoa com o mesmo CPF e recusa se ela já é corretor; CNPJ com 14). | editor (diretor, gestor, analista) | grava `pessoas`, `corretores` | ✓ | `20261015002000_tratativas.sql` |
| `app.salvar_corretor(p_corretor uuid, p_dados jsonb)` → `void` | Grava só as chaves que vierem (`nome`, `email`, `celular`, `cpf` em `pessoas`; `apelido`, `rg`, `creci`, `imobiliaria`, `creci_juridico`, `cnpj`, `endereco`, `observacoes`, `ativo` em `corretores`), com as regras do `criar_corretor`; CPF de outra pessoa da empresa é recusado. Corretor não se apaga: `ativo = false`. | editor (diretor, gestor, analista) | grava `pessoas`, `corretores` | ✓ | `20261015002200_corretores.sql` |

A lista lê `app.v_corretores` (`security_invoker`): dados da pessoa e do corretor, `qtd_terrenos` (terrenos de `terreno_corretores` e das ofertas), `qtd_ofertas` e `ultima_oferta`; terreno excluído não conta, porque a RLS de `terrenos` o esconde.

### Documentos

O arquivo sobe direto para o Storage (bucket `documentos`, caminho começando pelo `empresa_id`); depois o front chama a RPC, que cria a versão.

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.registrar_documento(p_terreno uuid, p_tipo text, p_storage_path text, p_nome_arquivo text, p_processo uuid, p_proposta uuid, p_documento uuid, p_nome text, p_tamanho bigint, p_emitido_em date, p_reuniao uuid)` → `uuid` | Registra o envio de um arquivo já gravado no Storage: documento novo ou nova versão (`documento_versoes`), nunca sobrescreve. Confere que o caminho começa pelo `empresa_id` do terreno, que processo, proposta e reunião são do mesmo terreno, e que ata só vai em reunião realizada. | editor (diretor, gestor, analista) | grava `documento_versoes`, `documentos` |  | `20261015000500_regras.sql:1819` |
| `app.revisar_documento(p_documento uuid, p_aprovado boolean)` → `void` | Valida ou rejeita a versão atual. Quem enviou não valida o próprio envio, salvo o diretor. | editor (diretor, gestor, analista) | grava `documentos` |  | `20261015000500_regras.sql:1876` |

### Configuração do funil e da Jornada (administrador)

Toda função deste grupo começa por `app.exigir_administrador(empresa)`. Apagar só o que não tem histórico; com histórico, desativar (regra 3).

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.salvar_fase(p_empresa uuid, p_codigo text, p_dados jsonb)` → `void` | Fase: cria (com nome e prefixo) ou altera nome, ordem, prefixo e ativo. A fase de entrada é do modelo (não muda nem desativa). Desativar só sem processo aberto na fase; a fase desativada não abre mais. | administrador | grava `fases_modelo` |  | `20261015000500_regras.sql:2212` |
| `app.apagar_fase(p_empresa uuid, p_codigo text)` → `void` | Apagar só fase que nunca teve processo; com histórico, desativar. | administrador | grava `fases_modelo` |  | `20261015000500_regras.sql:2264` |
| `app.adicionar_dependencia(p_empresa uuid, p_fase text, p_requisito_fase text, p_requisito_tipo text, p_requisito text)` → `uuid` | Dependência: a fase p_fase abre quando p_requisito_fase foi concluída (conclusao) ou passou pela etapa ou subetapa p_requisito. Recusa ciclo e dependência na fase de entrada (ela abre pela oferta). | administrador | grava `fase_dependencias` |  | `20261015000500_regras.sql:2283` |
| `app.remover_dependencia(p_id uuid)` → `void` | Administrador tira uma dependência entre fases. | administrador | grava `fase_dependencias` |  | `20261015000500_regras.sql:2326` |
| `app.salvar_etapa(p_empresa uuid, p_fase text, p_codigo text, p_dados jsonb)` → `void` | Etapa: cria (com nome; nasce com uma subetapa "Em andamento" de mesmo código) ou altera nome, ordem, prazo e aprovações. Mudar a ordem empurra as outras etapas da fase. | administrador | grava `etapas_modelo`, `subetapas_modelo` |  | `20261015000500_regras.sql:2341` |
| `app.apagar_etapa(p_empresa uuid, p_fase text, p_codigo text)` → `void` | Apagar só etapa sem histórico (nenhum processo passou por ela) e de que nenhuma dependência de fase dependa. Leva subetapas, checklist e pré-requisitos. | administrador | grava `etapas_modelo`, `prerequisitos_modelo` |  | `20261015000500_regras.sql:2390` |
| `app.configurar_status(p_empresa uuid, p_fase text, p_status text, p_dados jsonb)` → `void` | Status de encerramento da fase: nome (o de Concluído é o da fase: Comprado, Aprovado...) e aprovações. Cria o status que a fase não tem; "ativo": false tira (Concluído e Stand By ficam sempre; não tira status em uso). | administrador | grava `status_modelo` |  | `20261015000500_regras.sql:2422` |
| `app.salvar_subetapa(p_empresa uuid, p_fase text, p_codigo text, p_dados jsonb)` → `void` | Subetapa: cria (com etapa e nome) ou altera. Desativar com terrenos dentro exige "mover_para" (outra subetapa ativa da mesma etapa). | administrador | grava `processo_transicoes`, `processos`, `subetapas_modelo` |  | `20261015000500_regras.sql:2456` |
| `app.apagar_subetapa(p_empresa uuid, p_fase text, p_codigo text)` → `void` | Apagar só subetapa sem histórico; com histórico, desativar. | administrador | grava `prerequisitos_modelo`, `subetapas_modelo` |  | `20261015000500_regras.sql:2515` |
| `app.adicionar_prerequisito(p_empresa uuid, p_fase text, p_alvo_tipo text, p_alvo text, p_requisito text)` → `uuid` | Pré-requisito: para entrar em p_alvo (etapa ou subetapa) precisa ter passado por p_requisito (subetapa). Recusa o que travaria o processo para sempre: ciclo, exigência de etapa posterior, ou exigir na subetapa inicial algo da própria etapa. | administrador | grava `prerequisitos_modelo` |  | `20261015000500_regras.sql:2534` |
| `app.remover_prerequisito(p_id uuid)` → `void` | Administrador tira um pré-requisito de etapa ou subetapa. | administrador | grava `prerequisitos_modelo` |  | `20261015000500_regras.sql:2577` |
| `app.salvar_motivo(p_empresa uuid, p_status text, p_codigo text, p_dados jsonb)` → `void` | Motivo de Descartado ou Perdido: cria ou altera; desativar no lugar de apagar. | administrador | grava `motivos_encerramento` |  | `20261015000500_regras.sql:2590` |
| `app.apagar_motivo(p_empresa uuid, p_status text, p_codigo text)` → `void` | Apaga motivo de encerramento nunca usado (usado: desativar por `salvar_motivo`). | administrador | grava `motivos_encerramento` |  | `20261015000500_regras.sql:2612` |
| `app.salvar_checklist(p_empresa uuid, p_fase text, p_etapa text, p_tipo_documento text, p_obrigatorio boolean, p_ordem integer, p_regra text, p_regra_cond jsonb)` → `void` | Checklist de documentos para sair da etapa: incluir, marcar obrigatório, tirar. p_regra (jornada, 1/nov/2026): bloqueia, justifica ou livre; nulo = pelo p_obrigatorio. p_regra_cond: regra condicional [{condicao, regra}]; nulo mantém, '[]' tira. | administrador | grava `checklist_modelo` |  | `20261015000500_regras.sql:2628` |
| `app.remover_checklist(p_empresa uuid, p_fase text, p_etapa text, p_tipo_documento text)` → `void` | Administrador tira um documento do checklist da etapa. | administrador | grava `checklist_modelo` |  | `20261015000500_regras.sql:2645` |
| `app.salvar_regra_etapa(p_empresa uuid, p_id uuid, p_dados jsonb)` → `uuid` | Regra de tarefas da etapa: cria (p_id nulo) ou altera. | administrador | grava `etapa_regras` |  | `20261015001300_funil_tarefas.sql:363` |
| `app.apagar_regra_etapa(p_id uuid)` → `text` | Apagar: regra que já criou tarefa só se desliga. | administrador | grava `etapa_regras` |  | `20261015001300_funil_tarefas.sql:421` |
| `app.condicao_checklist(p_empresa uuid, p_fase text, p_etapa text, p_tipo_documento text, p_condicao jsonb)` → `void` | Administrador põe ou tira o "Vale quando" de um documento do checklist. | administrador | grava `checklist_modelo` |  | `20261015001300_funil_tarefas.sql:467` |
| `app.condicao_prerequisito(p_id uuid, p_condicao jsonb)` → `void` | Administrador põe ou tira o "Vale quando" de um pré-requisito. | administrador | grava `prerequisitos_modelo` |  | `20261015001300_funil_tarefas.sql:476` |
| `app.regra_prerequisito(p_id uuid, p_regra text, p_regra_cond jsonb)` → `void` | Regra do pré-requisito na jornada: bloqueia ou justifica p_regra_cond: regra condicional [{condicao, regra}]; nulo mantém, '[]' tira. | administrador | grava `prerequisitos_modelo` |  | `20261015001400_jornada.sql:253` |
| `app.salvar_item_jornada(p_empresa uuid, p_id uuid, p_dados jsonb)` → `uuid` | p_dados: fase, etapa, subetapa, campo, pergunta, ajuda, forma, regra, regra_cond, condicao, ordem, ativo | administrador | grava `jornada_itens` |  | `20261015001400_jornada.sql:165` |
| `app.apagar_item_jornada(p_id uuid)` → `void` | Tirar da jornada: o valor já respondido fica no terreno (é do campo, não do item). | administrador | grava `jornada_itens` |  | `20261015001400_jornada.sql:206` |
| `app.salvar_regra_jornada(p_empresa uuid, p_id uuid, p_dados jsonb)` → `uuid` | p_dados: fase, etapa, subetapa, condicao (obrigatória), acao, mensagem, ordem, ativo | administrador | grava `jornada_regras` |  | `20261015001400_jornada.sql:217` |
| `app.apagar_regra_jornada(p_id uuid)` → `void` | Administrador apaga uma regra pelo valor da Jornada. | administrador | grava `jornada_regras` |  | `20261015001400_jornada.sql:241` |

### Campos do terreno e condições "Vale quando"

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.campo_def(p_empresa uuid, p_chave text)` → `TABLE(chave text, origem text, coluna text, titulo text, ...` | Definição do campo para a empresa (título, condição e cartão já com a escolha dela) | qualquer logado (não confere a empresa: ver "Observações") | só lê |  | `20261015001200_campos.sql:170` |
| `app.salvar_campo(p_empresa uuid, p_chave text, p_titulo text, p_condicao boolean, p_cartao boolean, p_formato text)` → `void` | Administrador: título (vazio volta ao padrão; dois campos não têm o mesmo título), condição, cartão e, no campo de texto sem máscara fixa, a máscara (nulo mantém; '' tira; o valor que já está no registro precisa seguir a nova) | administrador | grava `campos_empresa` |  | `20261015001200_campos.sql:197` |
| `app.campo_cartao(p_terreno uuid, p_chave text)` → `jsonb` | Campo do terreno como o cartão mostra (registrado em fluxo.objeto_tipos.campo_objeto) | quem vê o terreno | só lê |  | `20261015001200_campos.sql:300` |
| `app.validar_condicao(p_empresa uuid, p_cond jsonb, p_nivel integer)` → `void` | Confere a condição (registrado em fluxo.objeto_tipos.valida_condicao): só campos marcados para condição na empresa, operador do tipo do campo, valores no formato certo, um nível de grupo. | qualquer logado (só confere formato) | só lê |  | `20261015001200_campos.sql:314` |
| `app.gravar_campo(p_terreno uuid, p_chave text, p_valor jsonb)` → `void` | Gravar pelo cartão no próprio registro: terreno pela salvar_terreno, oferta de referência direto, temperatura (`terreno.temperatura`) por `definir_temperatura`. | editor (diretor, gestor, analista) | grava `ofertas`, `terreno_valores`; grava via `salvar_terreno` |  | `20261015001200_campos.sql:402` |
| `app.salvar_campo_terreno(p_empresa uuid, p_id uuid, p_dados jsonb)` → `uuid` | Administrador cria ou altera um campo novo do terreno. p_dados: titulo, tipo, unidade, opcoes, formato, condicao, cartao, ativo. Com valor guardado, o tipo não muda e nenhuma opção em uso sai. Devolve o id. | administrador | grava `campos_terreno` |  | `20261015001200_campos.sql:462` |
| `app.apagar_campo_terreno(p_id uuid)` → `text` | Apaga o campo novo só sem valor e sem uso na jornada; senão, desativa. | administrador | grava `campos_terreno` |  | `20261015001200_campos.sql:500` |

### Estudo de viabilidade estática

Taxas e Despesas financeiras só aparecem linha a linha para a diretoria (`app.eh_diretoria`: diretor ou administrador).

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.viab_tipos(p_grupo text)` → `text[]` | Grupos: bases de cálculo aceitas, seção e se o item é fixo no estudo. | qualquer logado; a RLS filtra | só lê |  | `20261015001000_viabilidade.sql:53` |
| `app.viab_secao(p_grupo text)` → `text` | Seção do estudo a que pertence um grupo de despesas. | qualquer logado; a RLS filtra | só lê |  | `20261015001000_viabilidade.sql:65` |
| `app.viab_fixo(p_grupo text)` → `boolean` | Se o grupo é item fixo do estudo (Taxas, Despesas financeiras, Despesas comerciais). | qualquer logado; a RLS filtra | só lê |  | `20261015001000_viabilidade.sql:71` |
| `app.viab_restrito(p_grupo text)` → `boolean` | Taxas e Despesas financeiras: o estudo nasce com o valor padrão da empresa e só a diretoria ou o administrador muda (decisão do Moisés, 26/out/2026). | qualquer logado; a RLS filtra | só lê |  | `20261015001000_viabilidade.sql:75` |
| `app.salvar_margem_minima(p_empresa uuid, p_pct numeric)` → `void` | Administrador define a margem líquida mínima da empresa (nulo = sem aviso de rentabilidade abaixo da mínima). | administrador | grava `viabilidade_config` |  | `20261015001000_viabilidade.sql:147` |
| `app.calcular_viabilidade(p_id uuid)` → `jsonb` | Cálculo (o mesmo de `viab/calc.ts`; desde 11/nov/2026 a receita é o VGV líquido, a base da permuta só serve à permuta financeira e a margem é lucro ÷ VGV líquido; os itens em % do lucro valem % × o lucro antes deles). Cada linha arredondada em centavos. Roda com todas as linhas (Taxas e Financeiras entram no total de quem não é da diretoria), mas só devolve o detalhe das linhas que quem pergunta vê. | membro; detalhe de Taxas e Financeiras só diretoria | só lê |  | `20261015001000_viabilidade.sql:333` |
| `app.viab_linha_visivel(p_empresa uuid, p_despesa text)` → `boolean` | Taxas e Despesas financeiras: fora da diretoria, só o total (que fica em app.viabilidades); cada linha, o valor e o log dela, só a diretoria vê. | qualquer logado | só lê |  | `20261015001000_viabilidade.sql:469` |
| `app.modelos_viabilidade(p_empresa uuid)` → `TABLE(id uuid, empresa_id uuid, user_id uuid, nome text, ...` | Leitura dos modelos só por esta função (revisão de 2/nov/2026): o modelo da empresa salvo pela diretoria guarda Taxas e Despesas financeiras, e fora da diretoria essas linhas saem de `dados`, como no estudo. | membro (sem Taxas e Financeiras fora da diretoria) | só lê |  | `20261015001000_viabilidade.sql:518` |
| `app.salvar_modelo_viabilidade(p_viab uuid, p_nome text, p_da_empresa boolean, p_modelo uuid)` → `uuid` | Grava o estudo como modelo: novo (p_modelo nulo) ou por cima de um modelo existente (o dono, ou o administrador no da empresa). | editor; modelo da empresa só administrador; Taxas e Financeiras só entram se diretoria | grava `viabilidade_modelos` |  | `20261015001000_viabilidade.sql:545` |
| `app.apagar_modelo_viabilidade(p_modelo uuid)` → `void` | Apaga um modelo de estudo: o dono apaga o seu, o administrador o da empresa. | editor dono; modelo da empresa só administrador | grava `viabilidade_modelos` |  | `20261015001000_viabilidade.sql:582` |
| `app.marcar_modelo_padrao(p_empresa uuid, p_modelo uuid)` → `void` | O padrão da empresa (só modelo da empresa; nulo tira o padrão). | administrador | grava `viabilidade_modelos` |  | `20261015001000_viabilidade.sql:597` |
| `app.criar_viabilidade(p_terreno uuid, p_nome text, p_copiar_de uuid, p_modelo uuid, p_sem_modelo boolean)` → `uuid` | Novo estudo do terreno, já com os itens fixos (Taxas, Despesas financeiras e Despesas comerciais) da lista; com p_copiar_de, duplica dados, tipologias e linhas; senão, usa o modelo escolhido (p_modelo) ou, sem escolha, o padrão da empresa (p_sem_modelo = true: só a lista). | editor | grava `viabilidade_linhas`, `viabilidade_tipologias`, `viabilidades` |  | `20261015001000_viabilidade.sql:618` |
| `app.salvar_viabilidade(p_id uuid, p_dados jsonb)` → `void` | Nome e os dados digitados da obra incidente e do terreno. | editor (diretor, gestor, analista) | grava `viabilidades` |  | `20261015001000_viabilidade.sql:688` |
| `app.apagar_viabilidade(p_id uuid)` → `void` | Estudo vinculado a uma negociação ou usado numa proposta não se apaga. | editor (diretor, gestor, analista) | grava `viabilidades` |  | `20261015001000_viabilidade.sql:727` |
| `app.vincular_estudo(p_processo uuid, p_viabilidade uuid)` → `void` | A negociação usa o estudo (VGV e margem vêm dele; a margem abaixo da mínima da empresa acende o aviso). Com `p_viabilidade` nulo, tira a marca: a negociação fica sem estudo válido (selo clicável, 11/nov/2026). | editor (diretor, gestor, analista) | grava `processos` |  | `20261015001000_viabilidade.sql:743` |
| `app.salvar_despesa_viabilidade(p_empresa uuid, p_codigo text, p_dados jsonb)` → `void` | Administrador cria ou altera um item da lista de despesas da empresa usada nos estudos. | administrador | grava `viabilidade_despesas` |  | `20261015001000_viabilidade.sql:765` |
| `app.apagar_despesa_viabilidade(p_empresa uuid, p_codigo text)` → `void` | Administrador apaga (ou desativa, se em uso) um item da lista de despesas. | administrador | grava `viabilidade_despesas` |  | `20261015001000_viabilidade.sql:798` |

### Estudos de massa

As tabelas `estudos_massa` e `estudo_massa_tipologias` só se leem; tudo muda por estas RPCs.

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.solicitar_estudo_massa(p_terreno uuid, p_arquiteto uuid, p_briefing text, p_prazo date, p_nome text)` → `uuid` | Pede um estudo de massa a um arquiteto (membro da empresa) com briefing e prazo; avisa o arquiteto (`massa_solicitado`). | editor (diretor, gestor, analista) | grava `estudos_massa`; avisa pelo sino |  | `20261015001500_estudos_massa.sql:194` |
| `app.salvar_estudo_massa(p_id uuid, p_dados jsonb)` → `void` | Dados do estudo e, em "tipologias", a lista inteira (as que têm id são atualizadas, as sem id entram, as que faltam saem). | editor (diretor, gestor, analista) | grava `estudo_massa_tipologias`, `estudos_massa`; avisa pelo sino |  | `20261015001500_estudos_massa.sql:220` |
| `app.marcar_massa_valido(p_id uuid, p_valido boolean)` → `void` | O válido do terreno (um só, entregue); p_valido false tira a marca. | editor (diretor, gestor, analista) | grava `estudos_massa` |  | `20261015001500_estudos_massa.sql:304` |
| `app.apagar_estudo_massa(p_id uuid)` → `void` | Some só o que não é válido nem tem viabilidade presa a ele; os arquivos ficam em Documentos. | editor (diretor, gestor, analista) | grava `estudos_massa` |  | `20261015001500_estudos_massa.sql:323` |
| `app.vincular_massa(p_viab uuid, p_estudo uuid, p_seguir_valido boolean)` → `void` | Prende a viabilidade a um estudo de massa (entregue) ou ao válido do terreno; sem estudo e sem seguir, solta (as tipologias ficam e voltam a se editar). | editor (diretor, gestor, analista) | grava `viabilidade_tipologias`, `viabilidades` |  | `20261015001500_estudos_massa.sql:341` |
| `app.criar_viabilidade_da_massa(p_estudo uuid, p_nome text, p_seguir_valido boolean)` → `uuid` | O botão do estudo de massa: estudo de viabilidade novo (modelo padrão da empresa, como o Novo estudo) já preso a ele. | editor (via `criar_viabilidade`) | grava por funções internas (ver o código) |  | `20261015001500_estudos_massa.sql:371` |
| `app.anexar_arquivo_massa(p_estudo uuid, p_tipo text, p_storage_path text, p_nome_arquivo text, p_tamanho bigint)` → `uuid` | PDF e DWG do estudo, em Documentos (cada envio é uma versão). | editor (via `registrar_documento`) | grava `documentos` |  | `20261015001500_estudos_massa.sql:386` |

### Reuniões e Google Agenda (lado do usuário)

O lado do servidor (`agenda_confirmar` e companhia) está em "Funções só do servidor".

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.decidir_resumo_ia(p_reuniao uuid, p_aceitar boolean, p_resumo text, p_encaminhamentos text)` → `void` | Aceita (podendo ajustar) ou descarta o rascunho do resumo e dos encaminhamentos vindo das Anotações do Gemini; aceito, grava na reunião. | editor (diretor, gestor, analista) | grava `reuniao_agenda`, `reunioes` |  | `20261015001600_reunioes_agenda.sql:244` |

### Notificações

`notificacoes` só é escrita pelo banco (`app._notificar`); o usuário só marca como lida.

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `app.marcar_notificacao_lida(p_id uuid)` → `integer` | Marca uma notificação (ou todas, com p_id nulo) como lida. | logado; só marca as próprias | grava `notificacoes` | ✓ | `20261015000700_notificacoes.sql:398` |
| `app.configurar_notificacao(p_empresa uuid, p_codigo text, p_ativo boolean, p_dias_antes integer[], p_email_padrao boolean)` → `void` | Administrador liga/desliga um tipo, define os lembretes padrão e se vai por e-mail para quem não escolheu. | administrador | grava `tipos_notificacao` |  | `20261015000700_notificacoes.sql:412` |
| `app.salvar_preferencia_notificacao(p_empresa uuid, p_tipo text, p_email boolean)` → `void` | Cada pessoa escolhe, por tipo, se recebe também por e-mail (nulo = volta ao padrão do tipo). | membro (a própria preferência) | grava `preferencias_notificacao` |  | `20261015000700_notificacoes.sql:427` |

### Tarefas (fluxo): quadro, listas e checklist

Cartões, listas, etiquetas, checklists e anexos são gravados direto nas tabelas do `fluxo`, filtrados pela RLS (quem edita o cartão). As funções abaixo cobrem o que tem regra.

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `fluxo.quadro_de(p_empresa uuid, p_tipo text, p_objeto uuid, p_nome text)` → `uuid` | Quadro do objeto (cria na primeira vez, com as listas do modelo da empresa). | membro (cria o quadro se não existe) | grava `fluxo.listas`, `fluxo.quadros` |  | `20261015000150_fluxo.sql:334` |
| `fluxo.salvar_lista_modelo(p_empresa uuid, p_id uuid, p_nome text, p_ordem integer, p_tipo text, p_ativo boolean)` → `uuid` | Administrador: lista padrão da empresa (cria, renomeia, reordena, muda o tipo ou desativa). Na primeira mudança, a empresa ganha a cópia do padrão. Vale para quadros novos; os existentes mantêm as suas listas. | administrador | grava `fluxo.listas_modelo` |  | `20261015000150_fluxo.sql:356` |
| `fluxo.item_para_tarefa(p_item uuid)` → `uuid` | Item do checklist vira cartão no mesmo quadro (o item fica, apontando para ele, e conta como feito). | quem edita o cartão | grava `fluxo.anexos`, `fluxo.checklist_itens`, `fluxo.tarefa_acessos`, `fluxo.tarefas` |  | `20261015000150_fluxo.sql:383` |
| `fluxo.salvar_regras(p_empresa uuid, p_conclui_exige_checklist boolean)` → `void` | Administrador: concluir exige o checklist completo? | administrador | grava `fluxo.regras` |  | `20261015000150_fluxo.sql:1281` |

### Tarefas (fluxo): cronograma, calendário e linha de base

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `fluxo.usa_dias_uteis(p_empresa uuid)` → `boolean` | Se a empresa conta prazos em dias úteis. | qualquer logado | só lê |  | `20261015000150_fluxo.sql:540` |
| `fluxo.dia_util(p_empresa uuid, p_dia date)` → `boolean` | Se a data é dia útil no calendário da empresa (sem sábado, domingo e feriados nacionais de `fluxo.feriados`). | qualquer logado | só lê |  | `20261015000150_fluxo.sql:544` |
| `fluxo.somar_dias(p_empresa uuid, p_dia date, p_n integer)` → `date` | p_dia + n dias no calendário da empresa (n negativo volta). Em dias úteis, um dia de folga anda primeiro para o dia útil seguinte (ou anterior, se n < 0). | qualquer logado | só lê |  | `20261015000150_fluxo.sql:551` |
| `fluxo.duracao_dias(p_empresa uuid, p_inicio date, p_prazo date)` → `integer` | Duração de início a prazo, contando os dois (mínimo 1). | qualquer logado | só lê |  | `20261015000150_fluxo.sql:566` |
| `fluxo.inicio_cedo(p_tarefa uuid, p_dur integer)` → `date` | O início mais cedo que os vínculos permitem para uma tarefa de duração p_dur. | qualquer logado | só lê |  | `20261015000150_fluxo.sql:592` |
| `fluxo.aprova_linha_base(p_empresa uuid, p_pedinte uuid)` → `boolean` | Quem aprova a linha de base pedida por p_pedinte: o administrador, um diretor, ou um gestor acima de quem pediu (o gestor que pede já tem o nível). | qualquer logado | só lê |  | `20261015000150_fluxo.sql:727` |
| `fluxo.enviar_cronograma(p_quadro uuid, p_motivo text)` → `uuid` | Manda o cronograma do quadro (as tarefas não arquivadas com início e prazo) para aprovação. Quem já aprova (gestor, diretor, administrador) tem a sua aprovada na hora. Um pedido novo cancela o pendente. | editor (diretor, gestor, analista) | grava `fluxo.linha_base_itens`, `fluxo.linhas_base` |  | `20261015000150_fluxo.sql:746` |
| `fluxo.decidir_linha_base(p_id uuid, p_aprovar boolean, p_motivo text)` → `void` | Aprova ou recusa a linha de base pedida; quem pediu pode desistir. Decide o gestor de quem pediu, quem está acima ou o administrador (`aprova_linha_base`). | gestor de quem pediu, superior ou administrador; quem pediu desiste | grava `fluxo.linhas_base` |  | `20261015000150_fluxo.sql:769` |
| `fluxo.salvar_calendario(p_empresa uuid, p_dias_uteis boolean)` → `void` | Administrador: dias corridos ou úteis | administrador | grava `fluxo.calendarios` |  | `20261015000150_fluxo.sql:793` |
| `fluxo.predecessoras_pendentes(p_tarefa uuid)` → `text[]` | Predecessoras que ainda não deixam concluir (decisão do Moisés, 30/out/2026): em TI e TT a predecessora precisa estar concluída; em II e IT, ter começado (concluída ou com o início já chegado, porque o início real não é guardado). Arquivada não conta. Devolve os códigos. | qualquer logado; a RLS filtra | só lê |  | `20261015000150_fluxo.sql:2317` |
| `fluxo.salvar_regra_predecessoras(p_empresa uuid, p_bloqueia boolean)` → `void` | Administrador: predecessora pendente bloqueia a conclusão? (desligado = o app só avisa) | administrador | grava `fluxo.regras` |  | `20261015000150_fluxo.sql:2325` |

### Tarefas (fluxo): modelos de quadro e cópia de cartão

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `fluxo.edita_modelo(p_modelo uuid)` → `boolean` | Quem mexe no modelo: o dono, ou o administrador no modelo da empresa. | qualquer logado | só lê |  | `20261015000150_fluxo.sql:903` |
| `fluxo.aplicar_modelo(p_modelo uuid, p_quadro uuid, p_data date, p_resp_objeto uuid)` → `integer` | Aplicar à mão: quem edita, com um modelo da empresa ou dele mesmo. | editor (diretor, gestor, analista) | grava por funções internas (ver o código) |  | `20261015000150_fluxo.sql:1018` |
| `fluxo.salvar_quadro_como_modelo(p_quadro uuid, p_nome text, p_da_empresa boolean, p_resp_objeto uuid)` → `uuid` | Salva os cartões abertos de um quadro como modelo (prazos relativos ao primeiro início do quadro). Da empresa, só pelo administrador. | editor; modelo da empresa só administrador | grava `fluxo.modelo_tarefas`, `fluxo.modelo_vinculos`, `fluxo.modelos_quadro` |  | `20261015000150_fluxo.sql:1041` |
| `fluxo.definir_modelo_padrao(p_empresa uuid, p_modelo uuid, p_objeto_tipo text)` → `void` | Administrador: o modelo da empresa que entra sozinho nos quadros novos (nulo tira o padrão). | administrador | grava `fluxo.modelos_quadro` |  | `20261015000150_fluxo.sql:1086` |
| `fluxo.copiar_tarefa(p_tarefa uuid, p_lista uuid, p_titulo text, p_itens text[])` → `uuid` | Roda com os direitos de quem copia: só copia o que vê e só grava onde edita (RLS de cada tabela). | invoker: só copia o que vê e só grava onde edita | grava `fluxo.anexos`, `fluxo.checklist_itens`, `fluxo.checklists`, `fluxo.tarefa_acessos`, `fluxo.tarefa_campos`, `fluxo.tarefa_etiquetas`, `fluxo.tarefa_itens`, `fluxo.tarefa_pessoas`, `fluxo.tarefas` |  | `20261015000150_fluxo.sql:2620` |

### Tarefas (fluxo): aprovação formal e pausa

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `fluxo.pedir_aprovacao(p_tarefa uuid, p_motivo text)` → `uuid` | Pede a aprovação. Só com o resto pronto (checklist, se a regra vale). Um aprovador que pede tem o próprio voto dado na hora. | quem edita o cartão | grava `fluxo.aprovacao_votos`, `fluxo.aprovacoes` |  | `20261015000150_fluxo.sql:1207` |
| `fluxo.decidir_aprovacao(p_aprovacao uuid, p_aprovar boolean, p_justificativa text)` → `void` | Decide o pedido. O voto é o do próprio aprovador ou, por um superior, o de um aprovador abaixo dele; em sequência, só o da vez. | aprovador do cartão ou superior dele | grava `fluxo.aprovacao_votos`, `fluxo.aprovacoes` | ✓ | `20261015000150_fluxo.sql:1243` |
| `fluxo.cancelar_aprovacao(p_aprovacao uuid)` → `void` | Quem pediu (ou quem edita a tarefa) desiste do pedido | quem edita o cartão | grava `fluxo.aprovacoes` | ✓ | `20261015000150_fluxo.sql:1269` |
| `fluxo.votos_da_vez(p_aprovacao uuid)` → `SETOF fluxo.aprovacao_votos` | Votos do pedido de aprovação que estão na vez, só para quem vê o cartão. | quem vê o cartão | só lê |  | `20261015000150_fluxo.sql:2375` |
| `fluxo.nivel_pausa(p_empresa uuid)` → `integer` | Nível que pausa sem pedir, pela regra da empresa (ninguém, gestor ou diretor). | qualquer logado | só lê |  | `20261015000150_fluxo.sql:1337` |
| `fluxo.aprova_pausa(p_empresa uuid, p_pedinte uuid)` → `boolean` | Quem aprova a pausa pedida por p_pedinte | qualquer logado | só lê |  | `20261015000150_fluxo.sql:1343` |
| `fluxo.pausar(p_tarefa uuid, p_motivo text)` → `uuid` | Pede ou faz a pausa do cartão, com motivo. Quem tem o nível configurado (`nivel_pausa`) pausa direto; os demais pedem. | quem edita o cartão | grava `fluxo.pausas` |  | `20261015000150_fluxo.sql:1368` |
| `fluxo.decidir_pausa(p_pausa uuid, p_aprovar boolean, p_motivo text)` → `void` | Aprovar ou recusar (com motivo); quem pediu pode desistir (aprovar = false) | quem tem o nível que aprova; quem pediu desiste | grava `fluxo.pausas` |  | `20261015000150_fluxo.sql:1385` |
| `fluxo.retomar(p_tarefa uuid)` → `integer` | Retomar: volta para a lista de antes e empurra o prazo pelos dias pausados. A pausa vinda de fora só o próprio objeto retoma (fluxo._retomar). | quem edita o cartão | grava por funções internas (ver o código) |  | `20261015000150_fluxo.sql:1426` |
| `fluxo.salvar_regra_pausa(p_empresa uuid, p_pausa_aprova text)` → `void` | Administrador: quem aprova a pausa (ninguem, gestor, diretor) | administrador | grava `fluxo.regras` |  | `20261015000150_fluxo.sql:1465` |

### Tarefas (fluxo): visibilidade e papel no cartão

Base da RLS do `fluxo`: `papel_tarefa` devolve nulo para quem não vê o cartão.

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `fluxo.ve_objeto(p_tipo text, p_id uuid, p_user uuid)` → `boolean` | O teto: a pessoa vê o objeto do quadro? Chama a função registrada em `fluxo.objeto_tipos` (no BKM, `app.ve_terreno`); sem registro, a empresa é o teto. | qualquer logado (responde para qualquer `p_user`) | só lê |  | `20261015000150_fluxo.sql:1532` |
| `fluxo.nivel_cartao(p text)` → `integer` | Número do papel no cartão (leitor < comentarista < editor < administrador), para comparar. | qualquer logado; a RLS filtra | só lê |  | `20261015000150_fluxo.sql:1576` |
| `fluxo.papel_cartao(p_id uuid, p_empresa uuid, p_quadro uuid, p_vis text, p_criado_por uuid, p_solicitante uuid, p_responsavel uuid, p_user uuid)` → `text` | O papel de uma pessoa no cartão (nulo = não vê); por padrão, quem está lendo. Recebe as colunas da linha, para servir à RLS também no insert (a linha nova ainda não aparece numa consulta por id). Com outra pessoa, serve para saber se ela pode ser marcada com @ (só quem vê o cartão). | qualquer logado (responde para qualquer `p_user`) | só lê |  | `20261015000150_fluxo.sql:1584` |
| `fluxo.papel_tarefa(p_tarefa uuid, p_user uuid)` → `text` | Papel de uma pessoa no cartão (`leitor`, `comentarista`, `editor`, `administrador`) ou nulo se não vê. Base das políticas de RLS das tabelas do cartão. | quem vê o cartão | só lê |  | `20261015000150_fluxo.sql:1617` |
| `fluxo.edita_tarefa(p_tarefa uuid)` → `boolean` | Verdadeiro se quem chama edita o cartão. | quem vê o cartão | só lê |  | `20261015000150_fluxo.sql:1622` |
| `fluxo.comenta_tarefa(p_tarefa uuid)` → `boolean` | Verdadeiro se quem chama pode comentar no cartão. | quem vê o cartão | só lê |  | `20261015000150_fluxo.sql:1626` |
| `fluxo.gerencia_tarefa(p_tarefa uuid)` → `boolean` | Dá acesso e muda a visibilidade: administrador do cartão (quem criou ou quem recebeu o papel; o do sistema também cai aqui) ou diretor que vê o cartão. | quem vê o cartão | só lê |  | `20261015000150_fluxo.sql:1632` |
| `fluxo.exigir_edicao_tarefa(p_tarefa uuid)` → `void` | Erro 42501 se quem chama não edita o cartão. | quem edita o cartão | só lê |  | `20261015000150_fluxo.sql:1638` |
| `fluxo.configura_tarefa(p_tarefa uuid, p_user uuid)` → `boolean` | Quem configura as regras do cartão: diretor, administrador ou quem criou a tarefa (e vê o cartão) | quem vê o cartão | só lê |  | `20261015000150_fluxo.sql:2063` |
| `fluxo.tarefa_do_checklist(p_checklist uuid)` → `uuid` | Cartão dono de um checklist (para a RLS de `checklist_itens`). | qualquer logado | só lê |  | `20261015000150_fluxo.sql:1749` |
| `fluxo.tarefa_do_comentario(p_comentario uuid)` → `uuid` | Cartão dono de um comentário (para a RLS das reações). | qualquer logado | só lê |  | `20261015000150_fluxo.sql:1751` |
| `fluxo.tarefa_do_log(p_tabela text, p_registro uuid, p_antes jsonb, p_depois jsonb)` → `uuid` | O histórico (app.auditoria) não mostra o que se passa num cartão que a pessoa não vê | qualquer logado | só lê |  | `20261015000150_fluxo.sql:1816` |

### Tarefas (fluxo): formulário, itens em branco e conclusão

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `fluxo.validar_formato(p_formato text, p_valor text)` → `text` | Máscara de texto (1/nov/2026): confere e devolve o valor como fica guardado. E-mail em minúsculas; telefone, CPF e CNPJ só com os dígitos (CPF e CNPJ com os dígitos verificadores; telefone com DDD, 10 ou 11 dígitos); CEP com 8 dígitos. Formato desconhecido ou nulo devolve o texto aparado. | qualquer logado; a RLS filtra | só lê |  | `20261015000150_fluxo.sql:1894` |
| `fluxo.formas(p_tipo text, p_opcoes integer)` → `text[]` | Formas de responder de cada tipo de dado (a primeira é o padrão). | qualquer logado; a RLS filtra | só lê |  | `20261015000150_fluxo.sql:2119` |
| `fluxo.itens_em_branco(p_tarefa uuid)` → `TABLE(tipo text, ref text, nome text, regra text)` | Itens em branco que pedem algo para concluir agora (regra justificativa ou bloqueia, com a condição valendo) | quem vê o cartão | só lê |  | `20261015000150_fluxo.sql:2230` |
| `fluxo.concluir_justificando(p_tarefa uuid, p_texto text)` → `text` | Concluir com item em branco: grava a justificativa e conclui (ou, com aprovador, pede a aprovação). Item que bloqueia: gestor e diretor passam. | quem edita o cartão | grava `fluxo.conclusao_justificativas`, `fluxo.tarefas` |  | `20261015000150_fluxo.sql:2268` |
| `fluxo.condicao_vale(p_tarefa uuid, p_cond jsonb)` → `boolean` | Portas para a tela das funções internas acima (condição, campo, pendências e votos): só respondem sobre o cartão que quem pergunta vê. Por dentro, o banco chama as internas, que olham também cartões que quem age não vê (revisão de 2/nov/2026: as internas respondiam sobre terrenos de outra empresa). | quem vê o cartão | só lê |  | `20261015000150_fluxo.sql:2357` |
| `fluxo.campo_do_objeto(p_tarefa uuid, p_chave text)` → `jsonb` | Campo do objeto (terreno) como o cartão mostra, só para quem vê o cartão. | quem vê o cartão | só lê |  | `20261015000150_fluxo.sql:2363` |
| `fluxo.pendencias_conclusao(p_tarefa uuid)` → `text[]` | O que falta para concluir o cartão (checklist, subtarefas, aprovação, itens), só para quem vê o cartão. | quem vê o cartão | só lê |  | `20261015000150_fluxo.sql:2369` |

### Tarefas (fluxo): recorrência e automações

| Função | O que faz | Quem pode | Grava | Front | Onde |
| --- | --- | --- | --- | --- | --- |
| `fluxo.proxima_ocorrencia(r fluxo.recorrencias, p_de date)` → `date` | Próxima data depois de p_de (p_de é sempre uma data da série). | qualquer logado; a RLS filtra | só lê |  | `20261015000150_fluxo.sql:2420` |
| `fluxo.agenda_hoje(p_freq text, p_dias integer[], p_hoje date)` → `boolean` | A regra agendada roda hoje? Mensal no dia 31 roda no último dia dos meses mais curtos. | qualquer logado; a RLS filtra | só lê |  | `20261015000150_fluxo.sql:3124` |
| `fluxo.botoes_cartao(p_tarefa uuid)` → `TABLE(id uuid, nome text, escopo text)` | Botões do cartão: os que valem para ele (escopo, ligado, dono com direito e condições). Quem não edita o cartão não vê botão. | quem edita o cartão (os outros recebem lista vazia) | só lê |  | `20261015000150_fluxo.sql:3160` |
| `fluxo.apertar_botao(p_botao uuid, p_tarefa uuid)` → `fluxo.automacao_execucoes` | Aperta um botão no cartão: quem aperta edita o cartão; as ações rodam como numa regra (sem disparar outras) e ficam registradas. | quem edita o cartão | grava por funções internas (ver o código) |  | `20261015000150_fluxo.sql:3177` |

### Fora dos esquemas app e fluxo

O front também chama `public.im_tabela_empreendimento(p_id)` (`apps/web/src/mapa/Concorrencia.tsx:247`), do banco do monitor de mercado (repositório `Mbekerman/bkm-monitor-mercado`), só de leitura e aberta à chave publicável. Ela não está nas migrations deste repositório e não deve ser criada nem alterada daqui (ver `banco.md`, "O esquema public é do monitor").

## Funções só do servidor e do próprio banco

- `app._apagar_terreno(p_terreno, p_por)` (9/nov/2026): apaga o terreno e tudo dele, na ordem das chaves sem cascata (cartões e quadro do `fluxo`, diligências, documentos, atividades, reuniões, propostas, negociações, processos, ofertas, viabilidades, `terreno_pessoas`, e o terreno com as cascatas), depois os logs (`auditoria` pelos ids, pelo `terreno_id` no jsonb e os gravados pela própria exclusão: `id > v_aud0 and xmin = pg_current_xact_id()::xid`). Liga `app.apagando_terreno` na transação para as travas de "não se apaga" deixarem passar. Grava a linha em `app.terrenos_apagados`. Sem `grant`. `app.purgar_terrenos_excluidos(p_hoje)` chama por `rotina_diaria` os excluídos há 180 dias ou mais. `app.terreno_excluido(id)` e `app.terrenos_ocultos()` servem às rotinas e às políticas.

Sem `execute` para `authenticated`: o front não consegue chamá-las. Ou rodam como `service_role` (funções do servidor, como a integração com o Google Agenda, a fazer), ou são chamadas por dentro de outras funções e triggers, ou pelo dono do banco (carga, pg_cron, gancho do Auth).

| Função | O que faz | Quem chama | Onde |
| --- | --- | --- | --- |
| `app.agenda_confirmar(p_reuniao uuid, p_evento_id text, p_evento_link text, p_meet_link text, p_erro text)` | Devolve o resultado da gravação do evento no Google (id, link, Meet ou erro) para a fila `reuniao_agenda`. | `service_role` (função do servidor, a fazer) | `20261015001600_reunioes_agenda.sql:157` |
| `app.agenda_evento_mudou(p_reuniao uuid, p_inicio timestamp with time zone, p_duracao_min integer, p_cancelado boolean)` | Mudança feita direto na Agenda (data, duração ou cancelamento) volta para a reunião. | `service_role` | `20261015001600_reunioes_agenda.sql:180` |
| `app.agenda_resposta(p_reuniao uuid, p_email text, p_resposta text)` | Resposta de um convidado (aceitou, recusou, talvez, sem resposta), pelo e-mail. | `service_role` | `20261015001600_reunioes_agenda.sql:195` |
| `app.avaliar_condicao(p_terreno uuid, p_cond jsonb)` | A condição vale para o terreno? (registrado em fluxo.objeto_tipos.avalia_condicao) Sem condição, vale. | outras funções do banco | `20261015001200_campos.sql:389` |
| `app.colunas_mudadas(a jsonb, b jsonb)` | Colunas que mudaram entre dois retratos jsonb, sem as de controle. | auditoria | `20261015000100_base.sql:240` |
| `app.criar_empresa(p_nome text, p_meu_nome text, p_dono uuid)` | Cria a empresa (e, com `p_dono`, o diretor administrador). Fechada ao usuário desde 4/nov/2026: só a carga (`supabase/carga/bkm.sql`) ou o dono do banco. | dono do banco | `20261015000100_base.sql:172` |
| `app.dominio_do_usuario(p_user uuid)` | Domínio do e-mail de um usuário (lê `auth.users`). | triggers de `membros` e `empresa_dominios` | `20261015001100_usuarios.sql:23` |
| `app.gerar_arroba(p_email text, p_user uuid)` | Gera o @ único a partir do e-mail. | trigger do primeiro login | `20261015001100_usuarios.sql:73` |
| `app.hook_antes_de_criar_usuario(event jsonb)` | Gancho "Before User Created" do Supabase Auth (Authentication › Auth Hooks): só cria usuário com e-mail de domínio cadastrado. O parâmetro hd do Google é só uma dica na tela; a barreira é esta. | `supabase_auth_admin` (gancho "Before User Created" do Supabase Auth) | `20261015001100_usuarios.sql:180` |
| `app.janela_log(p_tabela text, p_cols text[])` | Janela para juntar logs seguidos: 7 s, ou 2 min em ajuste de poligonal. | `juntar_auditoria`, `definir_temperatura` | `20261015000100_base.sql:233` |
| `app.juntar_auditoria(p_tabela text, p_old jsonb, p_new jsonb)` | Junta a alteração ao último log do mesmo usuário e colunas dentro da janela; some se voltou ao valor de antes. | `tg_auditoria` | `20261015000100_base.sql:247` |
| `app.negociacao_do_terreno(p_terreno uuid)` | A negociação do terreno: o processo da fase de entrada sem parte (o aberto; senão, o mais recente) | outras funções do banco | `20261015001200_campos.sql:227` |
| `app.oferta_do_terreno(p_terreno uuid)` | Oferta de referência: a da negociação; sem ela, a ativa mais recente do terreno | outras funções do banco | `20261015001200_campos.sql:234` |
| `app.proposta_vigente(p_processo uuid)` | Proposta vigente: a última versão apresentada, em análise ou aceita da negociação | outras funções do banco | `20261015001200_campos.sql:241` |
| `app.registrar_gravacao(p_reuniao uuid, p_gravacao_url text, p_transcricao_url text, p_transcricao text, p_anotacoes_url text)` | Gravação, transcrição e Anotações do Gemini da reunião online. | `service_role` | `20261015001600_reunioes_agenda.sql:209` |
| `app.registrar_resumo_ia(p_reuniao uuid, p_resumo text, p_encaminhamentos text, p_origem text)` | Rascunho do resumo (das Anotações do Gemini ou da IA do sistema): não toca no resumo da reunião; quem marcou é avisado para conferir. | `service_role` | `20261015001600_reunioes_agenda.sql:221` |
| `app.rotina_diaria(p_hoje date)` | Rotina diária: lembretes com antecedência, ocorrências das recorrências, automações de prazo e agendadas, tarefa atrasada e subetapa com prazo estourado. `p_hoje` deixa testar outro dia. | pg_cron, 9h UTC (`bkm-terrenos-rotina-diaria`) | `20261015000700_notificacoes.sql:346` |
| `app.terreno_da_tarefa(p_tarefa uuid)` | Quadro do terreno de uma tarefa (nulo se a tarefa é de outro tipo de quadro). | outras funções do banco | `20261015000300_terrenos.sql:897` |
| `fluxo.aplicar_modelo_interno(p_modelo uuid, p_quadro uuid, p_data date, p_resp_objeto uuid)` | Aplica um modelo de tarefas ao quadro sem conferir permissão (uso pelas tarefas da etapa). | outras funções do banco | `20261015000150_fluxo.sql:1012` |
| `fluxo.aplicar_modelo_mapa(p_modelo uuid, p_quadro uuid, p_data date, p_resp_objeto uuid, p_pular uuid[], p_existentes jsonb)` | Cria os cartões do modelo no quadro (sem conferir permissão: uso interno). Tarefa do modelo com condição que não vale para o objeto não nasce. Devolve {tarefa do modelo: cartão criado}. | outras funções do banco | `20261015000150_fluxo.sql:953` |
| `fluxo.aplicar_padrao(p_quadro uuid, p_resp_objeto uuid)` | Quadro novo do tipo recebe o modelo padrão da empresa. | outras funções do banco | `20261015000150_fluxo.sql:1029` |
| `fluxo.aprovar_linha_base_interna(p_id uuid)` | Aprova a linha de base: a anterior vira substituída e a nova passa a valer. | outras funções do banco | `20261015000150_fluxo.sql:732` |
| `fluxo.automacoes_agenda(p_hoje date)` | Rotina diária: regras agendadas para hoje, em cada cartão do escopo que passa nas condições, uma vez por dia. | outras funções do banco | `20261015000150_fluxo.sql:3135` |
| `fluxo.automacoes_prazo(p_hoje date)` | Rotina diária: prazo vencendo em N dias (ou hoje) e prazo vencido, uma vez por prazo; pausada não conta. | outras funções do banco | `20261015000150_fluxo.sql:3106` |
| `fluxo.condicao_objeto(p_quadro uuid, p_cond jsonb)` | A condição vale para o objeto do quadro? Sem condição (ou sem quem confira), vale. | outras funções do banco | `20261015000150_fluxo.sql:937` |
| `fluxo.disparar_automacoes(p_tarefa uuid, p_gatilho text, p_lista uuid, p_etiqueta uuid, p_campo uuid, p_referencia date, p_etapa text)` | Procura as regras ligadas para o que aconteceu no cartão e roda as que passam nas condições. p_lista, p_etiqueta, p_campo: o que o gatilho diz (lista em que entrou, etiqueta posta, campo mudado). | outras funções do banco | `20261015000150_fluxo.sql:3032` |
| `fluxo.gerar_recorrencias(p_hoje date)` | Rotina diária: cria as ocorrências com data até hoje (se a rotina falhou um dia, a data perdida também nasce, na ordem) e encerra as séries que chegaram ao fim. | outras funções do banco | `20261015000150_fluxo.sql:2515` |
| `fluxo.reprogramar_sucessoras(p_tarefas uuid[])` | Reposiciona as sucessoras de uma tarefa (e, por elas, as seguintes). | outras funções do banco | `20261015000150_fluxo.sql:635` |

### Varredura do GeoSanja (10/nov/2026)

Só o job `tools/geosanja/varredura` (`service_role`), menos o relatório, que o membro da empresa também lê. A gravação repete a regra de `guardar_lotes_prefeitura` (PR #290) e falha com mensagem clara se aquelas tabelas ainda não existirem. Não há `execute` para `anon`.

| Função | O que faz | Quem chama | Onde |
| --- | --- | --- | --- |
| `app.varredura_sjc_relatorio(p_empresa uuid)` | Uma linha por noite e o progresso da grade (`pct_celulas`, `lotes_na_base`). | `authenticated` da empresa e `service_role` | `20261015001900_varredura_sjc.sql` |
| `app.varredura_sjc_guardar(p_empresa uuid, p_base text, p_lotes jsonb, p_quadras text[])` | Grava lotes e, nas quadras montadas, apaga o que saiu do cadastro. Devolve novos, atualizados e apagados. | `service_role` | `20261015001900_varredura_sjc.sql` |
| `app.varredura_sjc_tabelas_lotes()` | As tabelas do PR #290 já existem? | `service_role` | `20261015001900_varredura_sjc.sql` |
| `app.varredura_sjc_garantir_celulas(p_empresa uuid, p_celulas jsonb)` | Inclui a grade; célula já andada não muda de lugar. | `service_role` | `20261015001900_varredura_sjc.sql` |
| `app.varredura_sjc_abrir_execucao(p_empresa uuid)` | Abre a noite. Execução aberta vira `queda`; célula em andamento volta a pendente. | `service_role` | `20261015001900_varredura_sjc.sql` |
| `app.varredura_sjc_anotar_execucao(...)` / `app.varredura_sjc_fechar_execucao(...)` | Atualiza os contadores e encerra com o motivo. | `service_role` | `20261015001900_varredura_sjc.sql` |
| `app.varredura_sjc_proxima_celula(p_empresa uuid)` | A próxima pendente, pela ordem, e marca em andamento. | `service_role` | `20261015001900_varredura_sjc.sql` |
| `app.varredura_sjc_fechar_celula(...)` | Conclui, marca vazia ou devolve a pendente. | `service_role` | `20261015001900_varredura_sjc.sql` |
| `app.varredura_sjc_lotes_conhecidos(...)` / `app.varredura_sjc_quadras_prontas(...)` | Lotes e quadras com menos de 90 dias, para não pedir de novo. | `service_role` | `20261015001900_varredura_sjc.sql` |

## Funções internas (prefixo _)

Convenção do projeto: o prefixo `_` marca função de uso interno, chamada só por outras funções. Quase todas têm o `execute` tirado de `public`; as que aparecem com ✓ na coluna "logado executa" ficaram executáveis por `authenticated` (algumas de propósito, como `fluxo._copiar_automacoes`, que roda com os direitos de quem copia).

| Função | O que faz | Logado executa | Onde |
| --- | --- | --- | --- |
| `app._abrir_fases_liberadas` | Abre sozinhas as fases cujas dependências acabaram de se cumprir: só fase ativa, com ao menos uma dependência, que o terreno nunca teve (fase encerrada não reabre sozinha). Repete enquanto abrir alguma (uma fase pode depender da etapa inicial de outra). |  | `20261015000500_regras.sql:576` |
| `app._abrir_negociacoes_partes` | Abre a negociação de cada parte ativa que ainda não tem uma, quando a do terreno está ativa, na etapa da divisão ou depois, e há duas ou mais partes. |  | `20261015000500_regras.sql:1473` |
| `app._abrir_processo` | Abre o processo na primeira etapa (com subetapa ativa) da fase. Sem checar dependências nem permissão: quem chama já checou. |  | `20261015000500_regras.sql:519` |
| `app._agenda_marcar` | Põe o evento da reunião na fila do Google Agenda (`reuniao_agenda.situacao = pendente`); mudança vinda do próprio Google (`app.agenda_sync = on`) não volta para lá. |  | `20261015001600_reunioes_agenda.sql:77` |
| `app._aplicar_equipe_prevista` | No primeiro login, aplica o papel, a marca de administrador e o superior combinados em `equipe_prevista`. |  | `20261015001100_usuarios.sql:111` |
| `app._aprovacoes_exigidas` | Níveis de aprovação que a passagem pede a quem move (p_ator), já sem os dispensados. Entrar numa etapa também entra na subetapa inicial dela. |  | `20261015000500_regras.sql:888` |
| `app._area_sqls` | Área cadastral do terreno pela soma dos SQLs (pedido do Moisés, 6/nov/2026): a soma das áreas cadastrais de todas as inscrições do terreno, só quando todas têm área (sem isso, nula). |  | `20261015000500_regras.sql:2033` |
| `app._avisar_aprovadores` | Avisa quem está na vez de decidir o pedido. |  | `20261015000500_regras.sql:936` |
| `app._chaves_permitidas` | Recusa chave de `p_dados` fora da lista permitida (configuração do funil). |  | `20261015000500_regras.sql:2198` |
| `app._condicao_config` | "Vale quando" do documento do checklist e do pré-requisito (vazio = sempre). |  | `20261015001300_funil_tarefas.sql:437` |
| `app._condicao_item` | Uma condição simples sobre o terreno |  | `20261015001200_campos.sql:360` |
| `app._conferir_movimento` | Quem pode ir para onde quando o terreno tem partes: a negociação do terreno dividida não se move à mão (etapa e subetapa vêm das partes); a de uma parte só anda a partir da etapa da divisão e enquanto a do terreno está ativa. |  | `20261015000500_regras.sql:1019` |
| `app._dependencias_fase` | Situação de cada dependência da fase no terreno. |  | `20261015000500_regras.sql:545` |
| `app._encerrar_partes` | Encerrar a negociação do terreno leva junto as partes em aberto: perdido e descartado com o mesmo motivo, stand by com a mesma data de retomada. |  | `20261015000500_regras.sql:1639` |
| `app._executar_passagem` | Executa a passagem já liberada. Grava a transição com quem pediu. |  | `20261015000500_regras.sql:957` |
| `app._fase_entrada` | Código da fase de entrada da empresa (`fases_modelo.entrada`), a que a oferta abre. |  | `20261015000500_regras.sql:512` |
| `app._item_lembrete` | Data, responsável e texto do item de um lembrete (null = não há o que lembrar). |  | `20261015000700_notificacoes.sql:141` |
| `app._jornada_lugar` | Confere que a etapa e a subetapa existem e combinam (configuração da Jornada). |  | `20261015001400_jornada.sql:153` |
| `app._jornada_na_saida` | O item (ou a regra) de p_etapa/p_sub vale para esta passagem? |  | `20261015001400_jornada.sql:78` |
| `app._jornada_pede` | Alguma regra pelo valor pede este nível de aprovação nesta passagem? |  | `20261015001400_jornada.sql:119` |
| `app._jornada_pendencias` | Pendências da jornada para a passagem (entram em app._pendencias) |  | `20261015001400_jornada.sql:89` |
| `app._lembretes_padrao` | Lembretes padrão do tipo para um item, se ele ainda não tiver nenhum. |  | `20261015000700_notificacoes.sql:127` |
| `app._massa_propagar` | As viabilidades presas a um estudo (ou que seguem o válido do terreno). |  | `20261015001500_estudos_massa.sql:182` |
| `app._notificar` | Cria a notificação (ou nada: tipo desligado, sem destinatário, avisar a si mesmo, repetida). |  | `20261015000700_notificacoes.sql:98` |
| `app._ordem_etapa` | Ordem da etapa na fase. |  | `20261015000500_regras.sql:1412` |
| `app._ordem_subetapa` | Ordem da subetapa na fase. |  | `20261015001300_funil_tarefas.sql:86` |
| `app._parte_pode_sair` | O terreno fica sempre com uma parte. |  | `20261015000500_regras.sql:1605` |
| `app._passagem` | Coração do funil: toda passagem de etapa, subetapa ou status. Confere editor, processo ativo, pedido de aprovação aberto e movimento permitido; junta as pendências (`_pendencias`); sem pendência ou com força de gestor/diretor e justificativa, pede as aprovações configuradas ou executa a passagem (`_executar_passagem`). |  | `20261015000500_regras.sql:1044` |
| `app._passou_por` | Se o processo já passou pela subetapa (lido de `processo_transicoes`), para os pré-requisitos. |  | `20261015000500_regras.sql:796` |
| `app._pendencias` | Pendências que travam a passagem. Cada item: ok, tipo, texto, bloqueio_gestor (true = nem o gestor força). |  | `20261015000500_regras.sql:803` |
| `app._pode_decidir` | Quem decide uma linha de aprovação: tem o nível, não é quem pediu, e é o aprovador previsto ou está acima dele na hierarquia (qualquer superior aprova por quem está abaixo). Sem previsto, qualquer um do nível. |  | `20261015000500_regras.sql:925` |
| `app._recalcular_viabilidade` | Refaz e guarda os totais do estudo de viabilidade (chamada pelos triggers das linhas e tipologias). |  | `20261015001000_viabilidade.sql:416` |
| `app._regra_branco` | Regra em branco de um item (jornada, 1/nov/2026): a primeira regra condicional cuja condição vale para o terreno decide; nenhuma vale (ou não há) = a regra única. |  | `20261015000500_regras.sql:160` |
| `app._regra_cond_config` | Regra condicional (jornada, 1/nov/2026): [{condicao, regra}], cada uma com condição; nulo ou '[]' = sem regra condicional. |  | `20261015001300_funil_tarefas.sql:449` |
| `app._sincronizar_area_cadastral` | Refaz a cadastral do terreno pela soma, se ninguém digitou outra; só grava quando muda. |  | `20261015000500_regras.sql:2040` |
| `app._sincronizar_massa` | Traz do estudo de massa as tipologias e a área construída. "Seguir o válido" troca antes o estudo pelo válido do terreno (sem válido, fica o último). |  | `20261015001500_estudos_massa.sql:144` |
| `app._sincronizar_principal` | Etapa e subetapa da negociação do terreno = as da parte mais atrasada em aberto (sem nenhuma em aberto, a mais adiantada das compradas). Cada mudança vira uma transição, como qualquer passagem. |  | `20261015000500_regras.sql:1426` |
| `app._subetapa_inicial` | Primeira subetapa ativa de uma etapa. |  | `20261015000500_regras.sql:787` |
| `app._substituir_zonas` | Troca as zonas de um lote (ou da parte sem inscrição) numa análise urbanística nova, que copia os outros lotes da vigente; a anterior fica substituída. Nada muda se as zonas do lote são as mesmas. |  | `20261015000500_regras.sql:2838` |
| `app._tarefa_tem_trabalho` | Teve trabalho? Comentário, anexo, item marcado, subtarefa, campo preenchido ou troca de lista. |  | `20261015001300_funil_tarefas.sql:268` |
| `app._tarefas_ao_encerrar` | Encerrar a fase: Stand By pausa as tarefas abertas dela (sem pedido); Perdido e Descartado arquivam (padrão) ou mantêm (dados.tarefas = 'manter'). Concluir não mexe. |  | `20261015001300_funil_tarefas.sql:310` |
| `app._tarefas_ao_entrar` | Entrar na etapa (p_tipo etapa, já com a subetapa inicial) ou numa subetapa. |  | `20261015001300_funil_tarefas.sql:192` |
| `app._tarefas_ao_retomar` | Retomar a fase: as tarefas que o Stand By pausou voltam (prazo + dias parados). |  | `20261015001300_funil_tarefas.sql:327` |
| `app._tarefas_ao_voltar` | Voltar de etapa: as tarefas abertas das etapas que ficaram à frente do destino. |  | `20261015001300_funil_tarefas.sql:279` |
| `app._tarefas_travando` | Tarefas abertas que travam a saída (p_saida: etapa ou subetapa), como itens de pendência. |  | `20261015001300_funil_tarefas.sql:122` |
| `app._tem_partes` | A negociação do terreno anda pelas partes? |  | `20261015000500_regras.sql:1418` |
| `app._trava_tarefa` | Situação da tarefa na etapa: nivel (o que ela trava: etapa, subetapa ou nada), situacao (ativa, deixada, arquivada_auto, nao_se_aplica) e trava (trava agora, se estiver aberta). |  | `20261015001300_funil_tarefas.sql:93` |
| `app._valor_campo` | Valor do campo no terreno (jsonb; nulo = em branco). Não confere quem vê: uso interno. |  | `20261015001200_campos.sql:247` |
| `app._viab_soma` | Soma das linhas de grupos do estudo de viabilidade, pelas bases de cálculo. | ✓ | `20261015001000_viabilidade.sql:323` |
| `app._viab_valor` | Valor de uma linha com as bases do estudo (b: área, unidades vendidas, VGV líquido, obras, lucro). | ✓ | `20261015001000_viabilidade.sql:315` |
| `fluxo._acoes_automacao` | Faz as ações de uma regra num cartão e devolve o resumo. |  | `20261015000150_fluxo.sql:2941` |
| `fluxo._avisar` | Aviso das automações de tarefas (bloco 5a): o app ocupa o gancho do fluxo. A origem é a execução da regra (uma por disparo), para dois avisos da mesma regra no mesmo dia não se juntarem. |  | `20261015000700_notificacoes.sql:294` |
| `fluxo._campo_do_objeto` | Campo do objeto como o cartão mostra: {titulo, tipo, valor, editavel, cartao} |  | `20261015000150_fluxo.sql:2089` |
| `fluxo._condicao_vale` | A condição vale para a tarefa? Sem condição (ou sem quem confira), vale. |  | `20261015000150_fluxo.sql:2077` |
| `fluxo._condicoes_ok` | Condições da regra no cartão. | ✓ | `20261015000150_fluxo.sql:2897` |
| `fluxo._copiar_automacoes` | Regras de um cartão vão para outro (cópia e ocorrência de série). No mesmo quadro, as listas são as mesmas; em outro, pelo nome, e a regra cuja lista não existe lá fica de fora. p_dono vazio = mantém o dono de cada regra, que precisa editar o cartão novo. | ✓ | `20261015000150_fluxo.sql:3229` |
| `fluxo._criar_ocorrencia` | Cria uma ocorrência na data, copiando o cartão de origem. |  | `20261015000150_fluxo.sql:2479` |
| `fluxo._dono_vale` | O dono ainda pode ter a regra: administrador (regra da empresa), quem edita (regra do quadro) ou quem edita o cartão (regra do cartão). | ✓ | `20261015000150_fluxo.sql:2890` |
| `fluxo._executar_automacao` | Roda uma regra num cartão: as ações não disparam outras regras; erro vira registro, sem desfazer o que a pessoa fez. |  | `20261015000150_fluxo.sql:3013` |
| `fluxo._fechar_aprovacao` | Fecha o pedido aprovado por todos: aprova e conclui o cartão |  | `20261015000150_fluxo.sql:1193` |
| `fluxo._formato_ok` | O texto segue o formato? (sem levantar erro) |  | `20261015000150_fluxo.sql:1958` |
| `fluxo._iniciar_pausa` | Move o cartão para a lista de pausa e abre o período em `fluxo.pausas`. |  | `20261015000150_fluxo.sql:1349` |
| `fluxo._justificada` | Justificada nesta mesma gravação? (p_bloqueio: e por quem pode passar por item que bloqueia) |  | `20261015000150_fluxo.sql:2262` |
| `fluxo._lista_auto` | Lista de uma regra no quadro do cartão: pelo id (regra do quadro) ou pelo nome (regra da empresa). | ✓ | `20261015000150_fluxo.sql:2743` |
| `fluxo._objeto_da_tarefa` | Funções que o app registrou para o tipo do quadro da tarefa |  | `20261015000150_fluxo.sql:2070` |
| `fluxo._pausar_de_fora` | Pausa vinda de fora (o app pausa as tarefas de um objeto parado; sem pedido nem conferência de permissão: uso interno). Tarefa já pausada fica como está; pedido de pausa em aberto é cancelado; quadro sem lista de pausa não pausa. Devolve se pausou. |  | `20261015000150_fluxo.sql:1410` |
| `fluxo._pendencias_conclusao` | O que impede concluir. Itens em branco (31/out/2026): checklist e campos com regra "bloqueia" (gestor e diretor passam com justificativa) e, com regra "justificativa", 'justificar' até alguém justificar nesta gravação. |  | `20261015000150_fluxo.sql:2338` |
| `fluxo._regra_item` | Confere a condição (vazia vira nula) e quem pode mexer na regra. |  | `20261015000150_fluxo.sql:2100` |
| `fluxo._resposta` | Resposta da pergunta "só no cartão" no tipo dela (e-mail, telefone, CPF e CNPJ como ficam guardados) |  | `20261015000150_fluxo.sql:2147` |
| `fluxo._retomar` | Fecha a pausa, volta à lista de antes e empurra o prazo pelos dias pausados. |  | `20261015000150_fluxo.sql:1440` |
| `fluxo._tipo_item` | Tipo e número de opções do item, para conferir a forma |  | `20261015000150_fluxo.sql:2132` |
| `fluxo._votos_da_vez` | Votos que esperam decisão agora (em sequência, só o da vez) |  | `20261015000150_fluxo.sql:1186` |

## Funções de trigger

Rodam sozinhas em `insert`/`update`/`delete`. Não são chamadas pelo front (as que aparecem com `execute` para `authenticated` não fazem nada fora de um trigger). As mais importantes: `app.tg_auditoria` (log de tudo), `app.tg_atualizado_em` (atualizado_em, atualizado_por e versão), `app.tg_mesma_empresa` e `fluxo.tg_mesma_empresa` (filho na mesma empresa e no mesmo terreno do pai), `app.tg_copiar_configuracao` (empresa nova recebe o funil padrão), `app.tg_terreno_quadro` (terreno nasce com quadro de tarefas), `app.tg_terreno_parte_inicial` (parte "Vendedor 1"), `app.tg_terreno_sobreposicao` (poligonal sobreposta só confirmada) e `app.tg_usuario_novo` (primeiro login).

| Função | O que faz | Tabelas em que dispara | Onde |
| --- | --- | --- | --- |
| `app.tg_analise_substituida` | Análise urbanística substituída é histórico e não muda. | analise_zoneamentos, analises_urbanisticas | `20261015000300_terrenos.sql:677` |
| `app.tg_analise_vigente` | Nova análise vigente aposenta a anterior. | analises_urbanisticas | `20261015000300_terrenos.sql:666` |
| `app.tg_analise_zona_lote` | O lote da linha tem que ser do terreno da análise. | analise_zoneamentos | `20261015000300_terrenos.sql:653` |
| `app.tg_aprovacao_notificar` | Avisa o aprovador na vez e quem pediu quando decidido. | fluxo.aprovacoes | `20261015000700_notificacoes.sql:248` |
| `app.tg_atualizado_em` | Preenche atualizado_em e, quando a tabela tiver a coluna, atualizado_por. | concorrencia_empreendimentos, concorrentes, diligencias, documentos, estudos_massa, filtros_salvos, pessoas, processos, reunioes, terrenos, viabilidade_modelos, zona_parametros | `20261015000100_base.sql:189` |
| `app.tg_auditoria` | Grava cada insert, update e delete em `app.auditoria` (antes, depois, usuário, instante com `clock_timestamp()`), juntando cliques seguidos por `juntar_auditoria` (menos em `processos`). | 90 tabelas (lista completa: consulta a pg_trigger) | `20261015000100_base.sql:274` |
| `app.tg_comentario_notificar` | Comentário novo avisa quem acompanha o cartão. | fluxo.comentarios | `20261015000700_notificacoes.sql:216` |
| `app.tg_concorrencia_integridade` | Filho na mesma empresa do pai, sem trocar de pai; apuração sem data futura. | concorrencia_empreendimentos, concorrencia_precos, concorrencia_tipologias | `20261015000800_concorrencia.sql:80` |
| `app.tg_copiar_configuracao` | Empresa nova começa com uma cópia do modelo padrão. | empresas | `20261015000200_cadastros.sql:432` |
| `app.tg_diligencia` | Regras da diligência (resolução e evidência). | diligencias | `20261015000400_negociacao.sql:362` |
| `app.tg_documento_lembretes` | Documento com vencimento ganha os lembretes padrão. | documentos | `20261015000700_notificacoes.sql:310` |
| `app.tg_dominio_empresa` | Domínio de login cadastrado é o do e-mail de quem cadastra e nunca um e-mail gratuito. | empresa_dominios | `20261015001100_usuarios.sql:43` |
| `app.tg_etiqueta_parte` | A etiqueta é do terreno da matrícula ou do SQL, numa parte ativa dele, e os percentuais do mesmo lote não passam de 100%. | inscricao_partes, matricula_partes | `20261015000300_terrenos.sql:451` |
| `app.tg_inscricao_area` | Refaz a área cadastral do terreno pela soma dos SQLs quando uma inscrição muda. | inscricoes_municipais | `20261015000500_regras.sql:2048` |
| `app.tg_inscricao_historico` | Histórico não se apaga (regra 8; revisão de 2/nov/2026): a inscrição com IPTU ou valor venal lançado, ou que está numa análise já substituída, não sai do terreno; a análise substituída e as zonas dela não mudam mais. Valem para quem usa o sistema (auth.uid); a manutenção pelo banco passa. | inscricoes_municipais | `20261015000300_terrenos.sql:342` |
| `app.tg_inscricao_municipio` | A inscrição escolhida numa cidade tem que ser da cidade do terreno (nulo = outro município). | inscricoes_municipais | `20261015000300_terrenos.sql:932` |
| `app.tg_inscricao_valor` | Nova linha do mesmo exercício vira a próxima revisão e aposenta a anterior. Linha gravada não muda (só deixa de ser vigente). | inscricao_valores | `20261015000300_terrenos.sql:313` |
| `app.tg_item_notificar` | Item de checklist com responsável avisa a pessoa. | fluxo.checklist_itens | `20261015000700_notificacoes.sql:202` |
| `app.tg_lembrete_valido` | Lembrete gravado à mão: o item tem que ser da mesma empresa; destinatário, membro dela. | lembretes | `20261015000700_notificacoes.sql:322` |
| `app.tg_matricula_leva_sqls` | Os SQLs andam com a matrícula: ela mudou de parte (ou ficou solta), eles vão junto; ela saiu, eles ficam soltos. | matricula_partes | `20261015000300_terrenos.sql:488` |
| `app.tg_matricula_repetida` | Cartório em branco conta como o mesmo (decisão do Moisés, 4/nov/2026): a matrícula sem cartório não entra se o número já está noutro terreno em qualquer cartório, e a com cartório não entra se o número já está noutro terreno sem cartório. O índice único cuida de dois cartórios iguais. | matriculas | `20261015000300_terrenos.sql:201` |
| `app.tg_membro_dominio` | A equipe só recebe quem tem e-mail de um domínio da empresa (ou do mesmo domínio de quem inclui). | membros | `20261015001100_usuarios.sql:28` |
| `app.tg_membro_hierarquia` | Superior sempre um nível acima; ninguém sai com subordinados; a empresa nunca fica sem administrador. | membros | `20261015000100_base.sql:48` |
| `app.tg_mencoes` | Gatilho genérico: os argumentos são as colunas de texto da tabela. | atividades, fluxo.comentarios, fluxo.tarefas, reunioes | `20261015001100_usuarios.sql:264` |
| `app.tg_mesma_empresa` | O filho é da mesma empresa do pai (terreno, processo, análise) e não muda de terreno depois de criado. | 28 tabelas (lista completa: consulta a pg_trigger) | `20261015000300_terrenos.sql:778` |
| `app.tg_normalizar_pessoa` | Normaliza CPF/CNPJ e contatos da pessoa (só dígitos). | pessoas | `20261015000200_cadastros.sql:522` |
| `app.tg_normalizar_terreno` | CEP só com dígitos, nome sem espaços, área adotada pela fonte (nasce e volta pela cadastral; topográfica digitada toma o lugar), e poligonal nova apaga a medição topográfica. | terrenos | `20261015000300_terrenos.sql:852` |
| `app.tg_oferta_corretor` | Corretor de uma oferta passa a constar no terreno; o primeiro vira principal. | ofertas | `20261015000400_negociacao.sql:33` |
| `app.tg_oferta_parte` | A parte coberta pela oferta é do terreno da oferta. | oferta_partes | `20261015000400_negociacao.sql:59` |
| `app.tg_parte_corretor` | Corretor da parte: mesma empresa e parte ativa. | parte_corretores | `20261015000300_terrenos.sql:521` |
| `app.tg_parte_do_terreno` | Matrícula, inscrição e pessoa só entram numa parte ativa do mesmo terreno. | terreno_pessoas | `20261015000300_terrenos.sql:404` |
| `app.tg_participante_agenda` | Mudança nos participantes põe o evento na fila; a resposta ao convite só vem do Google. | reuniao_participantes | `20261015001600_reunioes_agenda.sql:122` |
| `app.tg_pausa_notificar` | Pausa (SLA): o pedido vai ao primeiro superior de quem pediu com o nível que a empresa exige; a decisão volta para quem pediu e para o responsável. | fluxo.pausas | `20261015000700_notificacoes.sql:266` |
| `app.tg_reuniao` | Presencial tem local, online não; realizada não tem data futura. | reunioes | `20261015000400_negociacao.sql:315` |
| `app.tg_reuniao_agenda` | Mudança na reunião põe o evento na fila do Google Agenda. | reunioes | `20261015001600_reunioes_agenda.sql:102` |
| `app.tg_reuniao_lembretes` | Reunião agendada ganha os lembretes padrão. | reunioes | `20261015000700_notificacoes.sql:301` |
| `app.tg_soma_participacao` | Participações conhecidas dos proprietários somam no máximo 100% (em cada parte, quando há partes). | terreno_pessoas | `20261015000300_terrenos.sql:386` |
| `app.tg_tarefa_notificar` | Tarefas (esquema fluxo): o responsável e quem entra como executor são avisados; quem acompanha recebe a conclusão e cada comentário novo. | fluxo.tarefas | `20261015000700_notificacoes.sql:170` |
| `app.tg_tarefa_pessoa_notificar` | Executor incluído no cartão é avisado. | fluxo.tarefa_pessoas | `20261015000700_notificacoes.sql:189` |
| `app.tg_tarefa_pode_avancar` | Concluída a última tarefa que trava: o responsável do terreno fica sabendo que pode avançar. | fluxo.tarefas | `20261015001300_funil_tarefas.sql:338` |
| `app.tg_tarefa_processo` | Etapa do funil do cartão (lote B, 31/out/2026): a tarefa nova nasce na etapa e na subetapa atuais do terreno (o processo aberto da fase mais adiantada; subetapa desde 1/nov/2026); quem cria pode escolher outra etapa e subetapa; etapa 'nenhuma' deixa a tarefa sem etapa (nunca trava). | fluxo.tarefas | `20261015000400_negociacao.sql:237` |
| `app.tg_tarefa_trava` | Tarefa que trava (revisão de 2/nov/2026): sair da etapa, mudar de processo, arquivar ou virar modelo tiraria a trava sem justificativa; só gestor e diretor fazem isso à mão. O próprio funil (voltar, encerrar, entrar) marca app.tarefas_funil e passa. | fluxo.tarefas | `20261015001300_funil_tarefas.sql:142` |
| `app.tg_terreno_controle` | Terreno cadastrado direto: o código e quem criou são do banco, não do usuário. | terrenos | `20261015000400_negociacao.sql:509` |
| `app.tg_terreno_parte_inicial` | Todo terreno nasce com uma parte, a "Vendedor 1" (decisão do Moisés, 4/nov/2026). Matrículas e inscrições se ligam direto à parte (parte_id, escrita direta conferida por t_parte); sem parte, ficam no quadro de cima da aba Terreno até alguém arrastá-las para uma parte. | terrenos | `20261015000300_terrenos.sql:961` |
| `app.tg_terreno_quadro` | Cada terreno nasce com o seu quadro de tarefas (fluxo), com as listas do modelo da empresa. | terrenos | `20261015000300_terrenos.sql:877` |
| `app.tg_terreno_sobreposicao` | Poligonal que ocupa parte de outro terreno da empresa só entra se o usuário confirmou que é outro terreno (sobreposicoes_aceitas). A tela pergunta antes, com app.terrenos_sobrepostos; aqui é a garantia para qualquer caminho (importação, API). | terrenos | `20261015000300_terrenos.sql:905` |
| `app.tg_usuario_login` | A cada login o Google manda nome e foto de novo: o perfil acompanha. O @ fica. | auth.users | `20261015001100_usuarios.sql:161` |
| `app.tg_usuario_novo` | Novo usuário no Auth: cria o perfil e, pelo domínio do e-mail, o membro básico. | auth.users | `20261015001100_usuarios.sql:132` |
| `app.tg_viab_outra` | Viabilidade técnica incluída pelo usuário: limpa o nome, recusa em branco e o nome de um serviço fixo do catálogo. | terreno_viabilidades_outras | `20261015000300_terrenos.sql` |
| `app.tg_viab_tecnica` | Viabilidade técnica só para serviços que a têm (energia, água, esgoto, gás). | terreno_viabilidades_tecnicas | `20261015000300_terrenos.sql:570` |
| `app.tg_viab_tipologia_massa` | Presa ao estudo, a viabilidade não inclui, não tira nem muda o nome, a área ou a quantidade de uma tipologia (só app._sincronizar_massa, com app.massa_sync). | viabilidade_tipologias | `20261015001500_estudos_massa.sql:126` |
| `app.tg_viabilidade_filha` | Filhas só de estudo estático, da mesma empresa, sem trocar de estudo. Linha: item ativo da lista (ao entrar ou trocar), base aceita pelo grupo do item e, nos grupos fixos, uma linha só por item. | viabilidade_linhas, viabilidade_tipologias | `20261015001000_viabilidade.sql:261` |
| `app.tg_viabilidade_linha_apagar` | Taxas e Despesas financeiras do estudo: só a diretoria apaga. | viabilidade_linhas | `20261015001000_viabilidade.sql:299` |
| `app.tg_viabilidade_recalcular` | Recalcula o estudo de viabilidade quando linhas ou tipologias mudam. | viabilidade_despesas, viabilidade_linhas, viabilidade_tipologias | `20261015001000_viabilidade.sql:436` |
| `app.tg_viabilidade_tipologia` | Preço unitário, preço por m² e área privativa ligados (o mesmo que o protótipo faz em vbNorm): com a área, mudar o preço unitário refaz o m² e mudar o m² refaz o unitário; mudar a área refaz o m² quando há os dois preços e completa o que falta quando há um só. Apagar um preço não refaz. | viabilidade_tipologias | `20261015001000_viabilidade.sql:237` |
| `app.tg_vinculos_empresa` | Pessoa, corretor e ofertante são da mesma empresa; responsável e participante da BKM são membros dela. | corretores, ofertas, parte_corretores, reuniao_participantes, terreno_corretores, terreno_pessoas, terrenos | `20261015000400_negociacao.sql:465` |
| `app.tg_voto_notificar` | Aprovação da tarefa (bloco 3): o aprovador na vez recebe o pedido (em sequência, o próximo quando o anterior aprova); quem pediu e o responsável recebem a decisão. | fluxo.aprovacao_votos | `20261015000700_notificacoes.sql:232` |
| `fluxo.tg_apontamento` | Apontamento de horas: nada no futuro, no máximo 24 h por pessoa no dia, não muda de pessoa. | fluxo.apontamentos | `20261015000150_fluxo.sql:2565` |
| `fluxo.tg_aprovadores` | Aprovadores (revisão de 2/nov/2026): só quem gerencia o cartão (quem criou, o administrador do sistema ou o diretor) os põe, troca ou tira, e nunca com um pedido de aprovação em aberto. Antes, qualquer editor tirava o aprovador e concluía, ou se punha no lugar dele e se aprovava. | fluxo.tarefa_pessoas | `20261015000150_fluxo.sql:1699` |
| `fluxo.tg_auto_filho` | Dispara automações quando muda um filho do cartão (etiqueta, checklist, campo). | fluxo.checklist_itens, fluxo.tarefa_campos, fluxo.tarefa_etiquetas | `20261015000150_fluxo.sql:3078` |
| `fluxo.tg_auto_tarefa` | Gatilhos no cartão. Cartão criado nesta transação (criado_em = now()) só dispara "criada", no fim dela, com tudo gravado: etiquetas, pessoas e campos de uma cópia ou de um modelo não contam como acréscimo. | fluxo.tarefas | `20261015000150_fluxo.sql:3064` |
| `fluxo.tg_automacao` | Confere a regra: escopo, gatilho, condições e ações. | fluxo.automacoes | `20261015000150_fluxo.sql:2750` |
| `fluxo.tg_automacao_apagar` | Regra com execuções não se apaga (o histórico fica): desliga. | fluxo.automacoes | `20261015000150_fluxo.sql:2879` |
| `fluxo.tg_campo_guarda` | Tipo não muda depois de ter valor; campo e opção com valor não se apagam (desativam). | fluxo.campo_opcoes, fluxo.campos | `20261015000150_fluxo.sql:1963` |
| `fluxo.tg_campo_incluido` | Preencher um campo personalizado o inclui no cartão (se ainda não estava) | fluxo.tarefa_campos | `20261015000150_fluxo.sql:2221` |
| `fluxo.tg_comentario` | Comentário: só o autor edita (marca editado_em) e o texto apagado some da tela. | fluxo.comentarios | `20261015000150_fluxo.sql:319` |
| `fluxo.tg_controle_tarefa` | Colunas de controle não mudam pela tela (revisão de 2/nov/2026): quem criou (gravá-lo dava o papel de administrador do cartão a qualquer editor), código, série, quem concluiu e quem arquivou ficam como o sistema deixou. | fluxo.tarefas | `20261015000150_fluxo.sql:1678` |
| `fluxo.tg_cronograma` | Antes de gravar: guarda o que a pessoa digitou (início mínimo e duração) e põe a tarefa no início mais cedo que os vínculos deixam. Na cascata (fluxo.cascata = 1) só reposiciona, sem tomar o início como digitado. | fluxo.tarefas | `20261015000150_fluxo.sql:605` |
| `fluxo.tg_cronograma_cascata` | Mudou início ou prazo: as sucessoras andam em cascata. | fluxo.tarefas | `20261015000150_fluxo.sql:645` |
| `fluxo.tg_item_concluido` | Marca quem e quando concluiu o item do checklist. | fluxo.checklist_itens | `20261015000150_fluxo.sql:310` |
| `fluxo.tg_lista_tipo` | O tipo da lista (aberta, pausa, conclui) decide se o cartão atrasa e se conclui: lista nova de quem edita nasce aberta, e só gestor, diretor ou o administrador criam lista de outro tipo ou mudam o tipo. | fluxo.listas | `20261015000150_fluxo.sql:463` |
| `fluxo.tg_mesma_empresa` | Pai e filho na mesma empresa; lista do mesmo quadro; cartão não troca de quadro. | 16 tabelas (lista completa: consulta a pg_trigger) | `20261015000150_fluxo.sql:217` |
| `fluxo.tg_modelo` | Modelo de cartão: não conclui, não é recorrente nem ocorrência de série. | fluxo.tarefas | `20261015000150_fluxo.sql:2608` |
| `fluxo.tg_modelo_filho` | Tarefas do modelo e as do modelo ligadas entre si ficam no mesmo modelo. | fluxo.modelo_tarefas, fluxo.modelo_vinculos | `20261015000150_fluxo.sql:910` |
| `fluxo.tg_pessoa_restringe` | Pôr outra pessoa num cartão Individual o torna Restrito. | fluxo.tarefa_pessoas | `20261015000150_fluxo.sql:1664` |
| `fluxo.tg_recorrencia` | Confere a regra: cartão de origem (não uma ocorrência), lista do quadro e aberta, e preenche dia do mês e próxima data. | fluxo.recorrencias | `20261015000150_fluxo.sql:2442` |
| `fluxo.tg_subtarefa` | Subtarefa no mesmo quadro, um nível só. | fluxo.tarefas | `20261015000150_fluxo.sql:3279` |
| `fluxo.tg_tarefa_campo` | O valor vai na coluna do tipo do campo, e a opção é do próprio campo; campo desativado não recebe valor novo. | fluxo.tarefa_campos | `20261015000150_fluxo.sql:1933` |
| `fluxo.tg_tarefa_item` | Item com regra para concluir só sai por diretor, administrador ou quem criou a tarefa. | fluxo.checklist_itens, fluxo.tarefa_itens | `20261015000150_fluxo.sql:2170` |
| `fluxo.tg_tarefa_lista` | Entrar numa lista "conclui" conclui; sair dela reabre. Concluir à mão (concluida_em) leva o cartão para a primeira lista "conclui" do quadro, e reabrir leva para a primeira aberta. | fluxo.tarefas | `20261015000150_fluxo.sql:248` |
| `fluxo.tg_vinculo` | Vínculo: mesma empresa e sem ciclo; ao criar, mudar ou tirar, a sucessora se reposiciona. | fluxo.vinculos | `20261015000150_fluxo.sql:655` |
| `fluxo.tg_vinculo_depois` | Vínculo entre tarefas não fecha círculo; a sucessora se reposiciona. | fluxo.vinculos | `20261015000150_fluxo.sql:681` |
| `fluxo.tg_visibilidade` | Visibilidade só muda por quem gerencia; pôr outra pessoa num individual o torna restrito. | fluxo.tarefas | `20261015000150_fluxo.sql:1647` |

## Observações sobre permissões encontradas ao montar o catálogo

Pontos para quem cuida da segurança conferir; nenhum deles foi alterado nesta documentação.

1. **Funções criadas depois de `20261015000500_regras.sql` nascem executáveis por `public`.** O `revoke execute on all functions in schema app from public` (`20261015000500_regras.sql:2970`) só pega as funções que já existiam; as migrations seguintes revogam uma a uma, e algumas ficaram de fora (por exemplo `app.concorrencia_resumo`, `app.estatisticas_*`, `app.perfil_*`, `app.setores_no_retangulo`, `app.viab_*`, várias de trigger e várias do `fluxo`). Hoje isso não abre nada ao anônimo, porque `anon` não tem `usage` nos esquemas `app` e `fluxo`; mas se um dia alguém der esse `usage`, elas passam a responder. Melhor seria um `alter default privileges ... revoke execute on functions from public` no começo, ou o revoke geral no fim da última migration.
2. **`app.campo_def(p_empresa, p_chave)` não confere se quem chama é da empresa** (SECURITY DEFINER, `20261015001200_campos.sql:170`): devolve título, tipo e opções de um campo personalizado de qualquer empresa, se a pessoa souber o `empresa_id` e a chave. Vazamento pequeno (metadado, não valor), mas quebra o isolamento por empresa.
3. **`app.ve_terreno(p_terreno, p_user)`, `fluxo.ve_objeto(...)` e `fluxo.papel_cartao(...)` respondem para qualquer `p_user`.** Precisam disso para a RLS e para filtrar avisos, mas um usuário logado consegue perguntar "fulano vê este cartão?" sobre outra pessoa. A conferir se isso importa.
4. **`app.classificar_topografia(p_empresa, ...)` e as funções de calendário do `fluxo` (`dia_util`, `somar_dias`, `duracao_dias`, `usa_dias_uteis`, `nivel_pausa`) leem configuração de qualquer empresa pelo id.** Só configuração, sem dado de negócio.
5. **Conteúdo vindo do navegador.** `registrar_consulta_lote`, `registrar_consulta_area`, `salvar_entorno`, `salvar_distancias_pontos`, `registrar_topografia` e `guardar_lotes_prefeitura` gravam o que o navegador obteve do GeoSampa, do GeoSanja e do Google. O banco confere a coerência (lote da inscrição, cidade da base, coordenada atual do terreno, raio da categoria), não a origem: um editor mal-intencionado pode gravar camadas ou distâncias falsas. É uma escolha consciente de arquitetura (a consulta passa pelo Caddy no navegador), mas vale saber.

## Consulta usada para gerar a lista

```sql
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as retorno,
       case when p.prosecdef then 'definer' else 'invoker' end as seguranca,
       has_function_privilege('authenticated', p.oid, 'execute') as logado_executa
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('app', 'fluxo')
order by 1, 2;
```

