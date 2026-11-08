# BKM Terrenos: auditoria de segurança do banco (8/nov/2026)

Escopo: `supabase/migrations/*.sql` (schemas `app` e `fluxo`), `supabase/tests/regras.sql`, `supabase/carga/bkm.sql`, olhando o banco a partir do PostgREST (papéis `authenticated` e `anon`). Ficaram de fora o front, o Caddy e o repositório do monitor (`public.im_*`). Método: modelo de ameaça (STRIDE) seguindo a skill security-and-hardening, leitura do código e provas num Postgres 16 temporário que carrega o shim, as migrations, os fixtures de `regras.sql` e a carga (`provas/subir.sh`). Nada foi alterado no repositório.

Todas as provas ficam em `docs/tecnico/seguranca/provas/`, cada uma com o script `.sql` e a saída `.out`.

## (a) Modelo de ameaça

**Fronteiras de confiança**
1. Navegador → PostgREST → Postgres. Tudo que tem GRANT em `app` e `fluxo` pode ser chamado direto, sem passar pela tela. O JWT diz quem é o usuário, e todo parâmetro de RPC é dado não confiável.
2. Supabase Auth → `auth.users` → triggers `t_usuario_novo` e `t_usuario_login`, mais o gancho `hook_antes_de_criar_usuario`. O e-mail e o `raw_user_meta_data` vêm do provedor **e do próprio usuário**.
3. Dados de fora que o navegador busca e grava (GeoSampa, GeoSanja, Google Places, laser e topografia). O banco recebe isso como digitado pelo analista.
4. Servidor (`service_role`): funções da Agenda e do resumo da IA. A integração ainda está por fazer, e o servidor vai agir **na conta Google de uma pessoa**.
5. pg_cron (`app.rotina_diaria`): roda como dono do banco sobre regras e dados que os usuários escreveram.
6. Mesmo projeto Supabase do monitor de mercado: outros apps e usuários no mesmo `auth.users`, e o schema `public` aberto à chave publicável.

**Ativos**: ofertas, propostas e valores (sigilo comercial), documentos no Storage (matrículas, contratos, CPF e CNPJ), estudos de viabilidade (Taxas e Financeiras restritas à diretoria), cartões Restritos, equipe e papéis (administrador), histórico e auditoria (não repúdio), contas Google dos usuários (Agenda e Gmail, futuro).

**STRIDE resumido**
- S (falsificação): metadados do usuário editáveis por ele mesmo (achado M3); convite da Agenda saindo pela conta do organizador (M4); login que só confia no e-mail (M5).
- T (adulteração): datas de conclusão enviadas pelo cliente (M6); procedência "do GeoSampa" e "do laser" definida pelo cliente (B3).
- R (repúdio): auditoria por trigger, que o usuário não escreve; a autoria vinda do cliente fica registrada no log com o usuário real (B4).
- I (vazamento): log mostrando linhas que a RLS esconde (M1); oráculos `security definer` sobre cartões Restritos e entre empresas (M2, B1); `basico` lendo tudo (I1).
- D (negação de serviço): funções geométricas sem limite de tamanho (B5).
- E (elevação de privilégio): não achei elevação de papel. Entre empresas, o único efeito foi o quadro que aponta para um terreno de outra empresa (M7): bloqueia uma etapa e revela a etapa do terreno.

**Casos de abuso testados**: um diretor de outra empresa chamando cada função exposta com ids da BKM (`fuzz_intruso*.sql`); um administrador de outra empresa passando a própria empresa com ids da BKM (`fuzz_deputado.sql`); `anon` com o schema liberado (`fuzz_anon.sql`); analista, leitura e basico contra as regras de tarefa, de reunião e do log.

## (b) Achados por gravidade

Não encontrei nada **Crítico** nem **Alto** confirmado. As 7 graves e 13 médias da revisão de 2/nov continuam fechadas nos pontos que conferi.

### Médio

**M1. O log (`app.auditoria`) mostra a qualquer membro, inclusive `basico`, linhas que a RLS da tabela de origem esconde.** CONFIRMADO.
- Onde: `20261015000100_base.sql` (policy `auditoria_ver`, refeita depois com o filtro `fluxo.tarefa_do_log`) e `fluxo.tarefa_do_log` em `20261015000150_fluxo.sql`, cuja lista de tabelas não inclui `automacoes`, `lembretes`, `modelos_quadro`, `modelo_tarefas`, `modelo_vinculos`, `tarefas_etapa` e `equipe_prevista`.
- Cenário: um usuário `basico` lê `app.auditoria` e vê a equipe prevista (e-mail, papel, administrador; a tabela é só do administrador), as regras de automação e os lembretes de um cartão Restrito (com o id do cartão) e os modelos de tarefas pessoais de outra pessoa.
- Impacto: quebra a visibilidade por cartão e a privacidade dos modelos pessoais, e expõe dados de RH da equipe.
- Prova: `p04_auditoria_vaza.sql` / `.out`. A consulta direta às tabelas devolve 0 linhas; o log devolve as 5 linhas.
- Correção: na policy, só mostrar o log de uma tabela a quem passa na RLS dela. Exemplo: `and (tabela <> 'equipe_prevista' or app.eh_administrador(empresa_id))`, `and (tabela not in ('modelos_quadro','modelo_tarefas','modelo_vinculos') or <dono ou modelo da empresa>)`, e ensinar `fluxo.tarefa_do_log` a achar a tarefa em `automacoes.tarefa_id`, `lembretes.origem_id` (quando `origem_tabela = 'tarefas'`) e `tarefas_etapa.tarefa_id`. Melhor ainda: uma função `app.pode_ver_log(tabela, antes, depois)` com uma lista **permitida**, em que tabela nova fica escondida até alguém liberar.
- Teste para `regras.sql`: como basico, `count(*) = 0` em `app.auditoria where tabela = 'equipe_prevista'`; como analista sem acesso, nenhum log de `automacoes` ou `lembretes` de um cartão Restrito.

**M2. Oráculo sobre cartão Restrito: `fluxo._condicoes_ok` é `security definer`, está exposta e não confere quem chama. `app.mencoes` entrega o id do cartão.** CONFIRMADO.
- Onde: `fluxo._condicoes_ok` (`20261015000150_fluxo.sql`, bloco das automações; sem `revoke from public`, por isso também executável por `anon`) e a policy `ver` de `app.mencoes` (`20261015001100_usuarios.sql`), que libera a empresa inteira.
- Cenário: o analista não vê o cartão Restrito, mas acha o id dele em `app.mencoes` (`origem_id`) e pergunta à função, com uma "automação" e uma "tarefa" montadas por ele, se o cartão tem certa etiqueta ou se um campo personalizado tem certo valor. O mesmo funciona para um usuário de outra empresa que tenha o id.
- Impacto: vazam etiquetas e valores de campos (sim/não e lista por inteiro; número e texto por chute) de cartões que a pessoa não deveria ver, além da existência do cartão, de quem foi mencionado e de quem o criou.
- Prova: `p02_cartao_restrito.sql` / `.out`.
- Correção: `revoke execute on function fluxo._condicoes_ok(fluxo.automacoes, fluxo.tarefas), fluxo._dono_vale(fluxo.automacoes), fluxo._lista_auto(uuid, uuid, text) from public, anon, authenticated;`. Elas só servem às funções do motor, que são definer. Em `app.mencoes`, restringir a `user_id = auth.uid() or por = auth.uid()`, ou, quando a origem é uma tarefa, a `fluxo.papel_tarefa(...) is not null`.
- Teste: como analista, `pg_temp.falha('select fluxo._condicoes_ok(...)')` e zero linhas em `app.mencoes` de um cartão que ele não vê.

**M3. O próprio usuário troca o nome e a foto do perfil por `updateUser({data})`, contornando `app.salvar_minha_foto`.** CONFIRMADO no banco. O passo do GoTrue é comportamento documentado do Supabase: o usuário edita o `user_metadata` com o próprio token.
- Onde: `app.tg_usuario_login` (`20261015001100_usuarios.sql`), disparado em `update of ... raw_user_meta_data` e copiando `full_name` e `avatar_url` sem validar.
- Cenário: um usuário basico se renomeia "Moisés Bekerman (Diretor)" e põe a foto num endereço externo de rastreio. O nome falso aparece nos avisos ("X mencionou você"), nos comentários e nas listas; a foto registra o IP de todo colega que abre a tela.
- Impacto: alguém se passa por outra pessoa dentro do sistema e consegue rastrear colegas. A validação de `salvar_minha_foto` vira enfeite.
- Prova: `p05_metadados_usuario.sql` / `.out`.
- Correção: no trigger, ler nome e foto de `raw_app_meta_data` ou de `auth.identities` (provedor google, `identity_data`), que o usuário não edita, ou aplicar a mesma regex de `salvar_minha_foto` e manter o nome atual quando a mudança não vier de um login (por exemplo, só atualizar quando `last_sign_in_at` mudou).
- Teste: `update auth.users set raw_user_meta_data = ... avatar_url = 'https://x.test/a.gif'` não muda `app.usuarios.foto_url`.

**M4. Um editor que não é o organizador muda a pauta e os convidados de uma reunião que já está no Google Agenda, e o servidor vai reenviar o convite pela conta Google do organizador.** CONFIRMADO no banco; o efeito no Google é PROVÁVEL, porque a integração ainda está por fazer.
- Onde: `app.tg_reuniao_agenda` e `app.tg_participante_agenda` (`20261015001600_reunioes_agenda.sql`). Escrita direta em `reunioes` e `reuniao_participantes` liberada a qualquer editor, e `organizador_id` fixo em quem marcou.
- Cenário: o diretor marca a reunião. Um analista troca a pauta por um texto de phishing e inclui um e-mail externo. A fila fica `pendente/atualizar` com organizador = diretor, e o servidor manda o convite da conta do diretor para o endereço de fora.
- Impacto: e-mail com aparência legítima saindo da conta de um diretor da BKM, com conteúdo de outra pessoa.
- Prova: `p03_reuniao_convite.sql` / `.out`.
- Correção: num evento já sincronizado, só o organizador, os superiores dele ou o administrador mudam pauta, local, data e convidados (trigger que recusa os demais, ou RPC `app.salvar_reuniao`). Registrar em `reuniao_agenda` quem pediu a última mudança e, no servidor, só agir com o token de quem pediu, ou pedir confirmação do organizador. Considerar lista de domínios externos permitidos.
- Teste: como analista, `pg_temp.falha` ao mudar a pauta ou incluir um participante numa reunião do diretor com `evento_id`.

**M5. O login confia só no domínio do e-mail. O gancho não confere o provedor nem se o e-mail foi confirmado, e o trigger já cria o membro, inclusive com o papel da equipe prevista, no `insert` em `auth.users`.** PROVÁVEL, porque depende da configuração do Auth, que não está no repositório.
- Onde: `app.hook_antes_de_criar_usuario` e `app.tg_usuario_novo` (`20261015001100_usuarios.sql`).
- Cenário: hoje o `docs/modelo.md` diz que e-mail e senha estão desligados e que o app OAuth é "Interno". Se alguém ligar e-mail e senha (sobretudo sem confirmação), outro provedor (Microsoft, GitHub) ou passar o OAuth para "Externo", qualquer pessoa que digitar `fulano@bkm.com.br` vira membro `basico`, com leitura de tudo, ou, se o e-mail estiver em `equipe_prevista`, ganha o papel e a marca de administrador previstos.
- Impacto: acesso de leitura total, ou administrador, por terceiros. A gravidade sobe para Alto se a configuração mudar.
- Correção: no gancho, recusar quando `event->'user'->'app_metadata'->>'provider' <> 'google'`. Em `tg_usuario_novo`, só criar o membro e aplicar a equipe prevista quando `new.raw_app_meta_data->>'provider' = 'google'` e `new.email_confirmed_at is not null`; se não, fazer isso em `t_usuario_login`, quando a confirmação chegar. Pôr no checklist de implantação: e-mail e senha, telefone, anônimo e outros provedores desligados.
- Teste: um `insert` em `auth.users` com `raw_app_meta_data = '{"provider":"email"}'` não cria membro. (O shim precisa ganhar as colunas `raw_app_meta_data` e `email_confirmed_at`.)

**M6. A data de conclusão da tarefa vem do cliente: dá para concluir uma tarefa atrasada com data no passado, ou criar uma tarefa já concluída em 2019.** CONFIRMADO.
- Onde: `fluxo.tg_tarefa_lista` (`new.concluida_em := coalesce(new.concluida_em, now())`) e `fluxo.tg_controle_tarefa`, que só fixa a data depois que ela já existe.
- Cenário: o analista grava `concluida_em = '2020-01-01'` numa tarefa com prazo vencido há 30 dias, e ela deixa de contar como atrasada nos indicadores e no SLA.
- Impacto: indicadores de prazo e SLA falsificáveis. O log guarda quem fez a mudança, o que atenua.
- Prova: `p01_tarefa_datas.sql` / `.out`.
- Correção: com `auth.uid()` presente, `new.concluida_em := clock_timestamp()` sempre que a tarefa entra em conclusão (insert ou update), ignorando o que o cliente mandou. Vale o mesmo para `arquivada_por` no insert.
- Teste: um `update set concluida_em = '2020-01-01'` deixa `concluida_em::date = current_date`.

**M7. Membro de outra empresa cria, na empresa dele, um quadro que aponta para um terreno da BKM: fica sabendo da etapa do terreno e trava a entrada dele em etapa com modelo de tarefas.** CONFIRMADO, desde que ele tenha o UUID do terreno.
- Onde: `fluxo.quadro_de` (`20261015000150_fluxo.sql`) confere só que a pessoa é membro de `p_empresa`, não que o objeto é dessa empresa. As buscas de quadro só por `objeto_tipo` e `objeto_id`, sem a empresa: `app._tarefas_ao_entrar` (`20261015001300_funil_tarefas.sql:200`, `select id into v_quadro ... where objeto_tipo = 'terreno' and objeto_id = t.id`), `app.tg_tarefa_processo` (`20261015000400_negociacao.sql:245, 254`) e as subconsultas de `v_terrenos` (`20261015000500_regras.sql:234, 300`).
- O que a prova mediu (`p06_quadro_outra_empresa.sql`, `p06b_controle.sql`, `p06c_sem_modelo.sql`, `p06d_controle_sem_modelo.sql`, com as `.out`):
  - (a) Uma tarefa criada nesse quadro já nasce com o `processo_id`, a etapa e a subetapa do processo da BKM (`triagem / aguardando_documentos`). Por `v_terrenos`, `v_tarefas_funil`, `processos`, `tarefas_abertas_fase`, `jornada_processo` e `campo_cartao` ele não lê nada (0 linhas ou nulo).
  - (b) Quando a BKM leva o terreno para uma etapa cuja regra aplica um modelo de tarefas, `_tarefas_ao_entrar` pega o quadro da outra empresa e o avanço inteiro falha ("Modelo não encontrado nesta empresa"). Sem esse quadro (controle), o mesmo avanço passa. Com a regra de modelo desligada, o avanço passa e a tarefa dele não muda nem é arquivada. Não consegui criar nos fixtures uma regra de tarefa única que dispare na entrada, então fica sem prova se as tarefas de regra da BKM iriam parar no quadro dele.
  - (c) A tarefa dele não aparece nas pendências do avanço da BKM, ou seja, não trava (tarefa feita à mão nunca trava).
  - (d) Ele não recebe aviso sobre o terreno da BKM, e a tarefa dele não gera aviso para ninguém da BKM.
- Impacto: integridade e disponibilidade entre empresas (bloqueia uma etapa do funil da BKM) e vazamento da etapa atual de um terreno. Hoje é limitado pelo UUID, que é difícil de adivinhar, e por haver uma empresa só em produção. O risco cresce com multi-tenant ou se um id vazar (link, log, exportação).
- Correção: em `fluxo.quadro_de`, recusar quando `not fluxo.ve_objeto(p_tipo, p_objeto)` ou quando o objeto não é de `p_empresa`. Em todas as buscas de quadro por objeto, filtrar também `q.empresa_id = t.empresa_id` (ou `= p.empresa_id`). Em `tg_tarefa_processo`, exigir `p.empresa_id = new.empresa_id`. Opcional: índice único em `(objeto_tipo, objeto_id)` para tipos de objeto que são de uma empresa só.
- Teste para `regras.sql`: como membro de outra empresa, `pg_temp.falha('select fluxo.quadro_de(<sua empresa>, ''terreno'', <terreno da BKM>, ''x'')')`. E, com um quadro estranho inserido como superusuário, o avanço da BKM para uma etapa com modelo continua passando e as tarefas nascem no quadro da BKM.

### Baixo

- **B1. Oráculos `security definer` que aceitam outro usuário ou outra empresa** (CONFIRMADO, `fuzz_intruso.out` e `fuzz_deputado.out`): `app.ve_terreno(t, p_user)`, `fluxo.papel_tarefa(t, p_user)`, `fluxo.configura_tarefa(t, p_user)`, `fluxo.ve_objeto(..., p_user)`, `fluxo.papel_cartao(...)`, `fluxo.tarefa_do_checklist`, `fluxo.tarefa_do_comentario`, `fluxo.inicio_cedo`, `app.campo_def(p_empresa, ...)`, `app.classificar_topografia(p_empresa, ...)`. Respondem sobre dados de outra empresa ou de outra pessoa a quem tem o id (UUID, difícil de adivinhar). Correção: quando `auth.uid()` não é nulo, ignorar ou recusar `p_user <> auth.uid()`; conferir `app.eh_membro` nas que recebem empresa ou id. As que as policies usam continuam com GRANT, mas sem o parâmetro de outra pessoa.
- **B2. Funções sem `revoke from public` e um padrão frágil "auth.uid() nulo pula a checagem"** (CONFIRMADO, `fuzz_anon.out`). Cerca de 40 funções de `app` e `fluxo` criadas depois do `revoke ... on all functions` de `regras.sql` ficaram executáveis por PUBLIC e `anon`. Hoje o `anon` não tem `usage` nos schemas, mas um `grant usage ... to anon` (passo comum em guias do Supabase) reabre essas funções e todos os caminhos `if auth.uid() is null then return new`. Correção: `alter default privileges in schema app, fluxo revoke execute on functions from public;` na base, repetir o `revoke ... on all functions in schema app, fluxo from public` na última migration, reconceder só o que a tela usa, e um teste que falha se `has_function_privilege('anon', ...)` vier verdadeiro.
- **B3. A procedência é definida pelo cliente**: `registrar_consulta_lote`, `cartorio_da_prefeitura` (marca "do GeoSampa"), `registrar_topografia`, `salvar_entorno` e o `insert` direto em `app.terrenos` (`topo_*`, `cartorio_origem`) aceitam o que o navegador manda. Um analista consegue gravar um dado "do GeoSampa" ou "do laser" que não veio de lá. É risco de projeto (os dados são buscados no navegador): documentar e, quando houver servidor, fazer a consulta por ele. Para o `insert`, aplicar a mesma lista de colunas de `salvar_terreno`.
- **B4. Autoria enviada pelo cliente no insert**: `criado_por` em `fluxo.tarefas` (`tg_controle_tarefa` só age no update), `user_id` em `app.atividades` e outros `default auth.uid()` aceitam valor do cliente. O log guarda o usuário real. Correção: trigger genérico que força `:= auth.uid()` no insert quando há usuário.
- **B5. Negação de serviço barata**: `app.estatisticas_area(geometry)`, `app.perfil_area(geometry)` e `app.setores_no_retangulo` sem limite de área, de vértices ou de envelope; `geojson_poligono_valido` não limita o número de pontos. O `statement_timeout` do Supabase (8 s para `authenticated`) segura em parte. Correção: limitar a área (por exemplo, menos de 50 km²) e os vértices (por exemplo, até 5.000), e recusar envelope maior que um município.
- **B6. Storage**: `registrar_documento` só confere a primeira pasta (empresa), não a do terreno, e o bucket não tem `allowed_mime_types`. Quem faz upload pode mandar HTML ou SVG. Não vaza entre empresas. Correção: conferir `split_part(path, '/', 2) = terreno_id::text` e definir os MIME permitidos (pdf, imagens, dwg, dxf, kml, zip).

### Informativo

- **I1. O papel `basico` (qualquer e-mail @bkm.com.br no primeiro login) lê tudo**: propostas, documentos do Storage, viabilidades (fora as linhas restritas) e o log. É decisão registrada ("por ora como leitura"), mas é o maior raio de exposição do sistema: recomendo que o `basico` nasça sem ver nada até o administrador promover.
- **I2. O `revoke update (padrao) on fluxo.modelos_quadro` não tem efeito**, porque o GRANT de update é da tabela inteira. Hoje não faz mal: o check `not padrao or dono_id is null` e a policy só deixam o administrador. Trocar por um trigger ou tirar a linha, para não dar falsa segurança.
- **I4. Projeto compartilhado com o monitor**: o schema `public` recebe os default privileges do Supabase para `anon`. Rodar o Security Advisor do Supabase e conferir RLS em `public.im_*` e o escopo de `public.im_tabela_empreendimento` (fora deste repositório).
- **I5. Texto do usuário vai para notificações e futuros e-mails** (`_notificar`, títulos, nomes vindos do Google). A função de e-mail precisa escapar HTML e não pôr links montados com dado do usuário.
- **I6. Existência por mensagem de erro**: várias RPCs leem a linha antes de conferir o acesso ("não encontrado" versus "sem acesso"). Só revela se o id existe.

## (c) O que está bem feito (conferido, não precisa reavaliar)

- Todas as 326 funções `security definer` têm `set search_path` fixo. O SQL dinâmico usa `%I` com coluna do catálogo, ou `%s` com `regproc` de tabela que o usuário só lê (`fluxo.objeto_tipos`).
- Todas as tabelas de `app` e `fluxo` com GRANT têm RLS. As exceções são catálogos globais só de leitura (`campos_catalogo`, `objeto_tipos`, `setores_renda`). Todas as views têm `security_invoker = true`.
- `processos`, `propostas`, `documentos`, `aprovacoes`, `processo_transicoes`, `notificacoes`, `reuniao_agenda` e as consultas da prefeitura: só `select` para o usuário. `terrenos`: sem `update` direto (só `salvar_terreno`, com versão).
- Fuzz com o diretor de outra empresa em **todas** as funções expostas: nenhuma escrita direta passou (o caminho indireto pelo quadro está em M7). Fuzz com o administrador de outra empresa passando a empresa dele: as funções de configuração por código ficam presas à empresa dele.
- `tg_mesma_empresa` (`app` e `fluxo`), `tg_vinculos_empresa`, `tg_lembrete_valido` e as FKs compostas do funil impedem filho de outra empresa e troca de pai.
- Equipe: só o administrador, com hierarquia e o "último administrador" protegidos; inclusão só por domínio da empresa; domínio gratuito recusado; `criar_empresa` fora do alcance do usuário.
- `desfazer_alteracao`: só alterações da ficha, quem fez, os superiores ou o administrador, nunca colunas de controle, e o log não some.
- Tarefas: aprovadores só por quem gerencia o cartão, visibilidade só pelo administrador do cartão, pausa só pelas RPCs, conclusão barrada por aprovação, checklist e campos, colunas de controle fixas no update, comentário e filhos sem troca de tarefa.
- As funções do servidor (`agenda_*`, `registrar_gravacao`, `registrar_resumo_ia`) são só do `service_role`; `rotina_diaria`, `_notificar` e `gerar_recorrencias` não estão expostas.
- Storage: bucket privado, sem update e sem delete, pasta da empresa conferida na leitura e no envio; `registrar_documento` confere a pasta.

## (d) Checklist para quem escrever migration nova

1. Função nova: `security invoker` por padrão. Se for `definer`: `set search_path = ''`, nomes qualificados e, logo no início, `app.exigir_editor` (ou `exigir_membro` / `exigir_administrador`) sobre a empresa **da linha lida**, nunca a que veio no parâmetro.
2. Logo depois: `revoke execute ... from public, anon` e `grant execute ... to authenticated` só se a tela chamar. Interna (`_x`) nunca tem grant.
3. Nunca aceite `p_user` ou `p_empresa` do cliente sem conferir que é `auth.uid()` ou uma empresa dele. Ids recebidos: conferir que são da mesma empresa e do mesmo terreno.
4. Não use `auth.uid() is null` como atalho para pular regra. Para o servidor, crie uma função própria com grant só ao `service_role`.
5. Tabela nova: RLS ligada, policies com `minhas_empresas()` para ler e `empresas_edicao()` para escrever, trigger `t_emp` e `t_aud`. Se a RLS for mais estreita que a empresa, a regra de leitura do log tem de acompanhar (M1).
6. Colunas de controle (autor, datas de sistema, código, situação) fixadas por trigger no insert **e** no update. `revoke update (coluna)` não funciona com grant da tabela inteira.
7. SQL dinâmico só com `%I` / `%L` / `using`; nunca texto do usuário em `%s`.
8. Geometria e listas vindas do cliente com limite de tamanho e de quantidade.
9. Nada de autorização em `raw_user_meta_data` (o usuário edita). Use `raw_app_meta_data` ou `auth.identities`.
10. Integração que age em nome de alguém (Agenda, Gmail): quem pede é quem autoriza; registre quem pediu.
11. Todo caso de abuso vira teste em `regras.sql` (`pg_temp.falha`), inclusive "membro de outra empresa" e "basico".
