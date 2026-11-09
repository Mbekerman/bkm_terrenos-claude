# Como manter este manual

Um manual técnico só serve enquanto diz a verdade. Esta página diz **o que atualizar a cada mudança**, para que qualquer pessoa ou agente que trabalhe no projeto mantenha o manual em dia sem precisar de uma faxina periódica.

## A regra (vale para toda thread, pessoa ou agente)

Toda mudança que entra na `develop` atualiza, **no mesmo PR**:

1. **`docs/tecnico/CHANGELOG.md`**: uma linha na seção do dia, com o número do PR, o que mudou e o arquivo do manual que foi tocado. Sempre, até em correção pequena.
2. **O arquivo do manual que trata do assunto**, quando a mudança altera algo que ele descreve (tabela abaixo).
3. **`docs/tecnico/seguranca.md`**, quando a mudança mexe em permissão, login, RLS, função `security definer`, Caddy, segredo, workflow, integração externa, ou corrige um achado (marque o achado como resolvido, com o PR).
4. **`CLAUDE.md`** e **`docs/modelo.md`**, como já era regra: a especificação da tela e o modelo de dados.
5. **`apps/web/versao.json`** com o número do PR (regra de 6/nov).

Se a mudança não muda nada do que o manual descreve, só a linha do CHANGELOG basta.

## Qual arquivo atualizar

| Se você mexeu em... | Atualize |
| --- | --- |
| `supabase/migrations/*` (tabela, coluna, RLS, grant) | `banco.md`, e `docs/modelo.md` |
| função RPC nova, renomeada, removida ou com outro papel exigido | `funcoes.md` |
| `supabase/tests/*`, `run.sh`, forma de aplicar SQL | `testes-banco.md` |
| `apps/web/src/*` (rota, tela portada, chave de `localStorage`, padrão de dados) | `front.md` (e a lista "o que ainda não foi portado") |
| `tools/prototipo/*` | `prototipo.md` |
| chamada a serviço externo, chave, custo, `tools/setores`, `tools/parametros`, `tools/mercado` | `integracoes.md` |
| `Dockerfile`, `Caddyfile`, `.dockerignore`, `.github/workflows/*`, variável de serviço, Supabase Auth | `deploy-e-ambientes.md` e `seguranca.md` |
| decisão estrutural (troca de tecnologia, separação de sistemas) | um ADR novo em `docs/adr/` e `arquitetura.md` |
| marco do projeto (fase nova, primeiro uso, banco de produção limpo) | `historico.md` |

## Formato do CHANGELOG

Uma seção por dia, do mais recente ao mais antigo. Cada linha: o PR, o assunto em linguagem simples, e entre parênteses os arquivos do manual tocados.

```markdown
## 2026-11-09

- #250 Proposta com validade: campo novo `propostas.valida_ate` e aviso de vencida (banco.md, funcoes.md)
- #251 Correção: botão Avançar não aparecia para o gestor (sem mudança no manual)
```

Não escreva o CHANGELOG antes do PR existir; se não souber o número, escreva `#?` e corrija antes do merge.

## Quando a regra de editar migrations no lugar acabar

Hoje as migrations são editadas no lugar (não há banco de produção em uso). Quando o primeiro uso começar, toda mudança vira **migration nova**. Nesse dia:

- atualize `testes-banco.md` e `deploy-e-ambientes.md` com o novo procedimento;
- registre o marco em `historico.md`;
- tire do `CLAUDE.md` a frase "altere os arquivos de `supabase/migrations/` no lugar".

## Revisão periódica

Mesmo com a regra, coisas escapam. Uma vez por mês (ou ao fechar um lote grande), alguém confere:

- se a lista de funções de `funcoes.md` bate com o banco (o arquivo explica como gerar a lista);
- se as rotas e as chaves do navegador de `front.md` batem com o código (`grep -rn "bkm-terrenos-" apps/web/src`);
- se os achados abertos de `seguranca.md` continuam abertos;
- se o `README.md` da raiz e o `CLAUDE.md` contradizem o manual (ver "Incoerências conhecidas" abaixo).

## Incoerências conhecidas (8/nov/2026)

Encontradas ao escrever este manual e ainda não corrigidas nos arquivos de origem:

- O `README.md` da raiz ainda descreve login por e-mail, variáveis `VITE_SUPABASE_ANON_KEY` no build e "Carregar dados de exemplo"; hoje o login é só Google e a configuração chega pelas variáveis do serviço (ver deploy-e-ambientes.md).
- O `CLAUDE.md` diz, no fim de "Comandos", "Fase atual: estrutura em desenho, sem banco criado", mas o banco foi aplicado em 5/nov/2026.
- O `CLAUDE.md` cita "1230 testes"; em 8/nov o `run.sh` roda 1262 verificações `ok`.

- O `CLAUDE.md` diz que, sem chave do Google, o mapa cai no Leaflet: isso só vale no protótipo; o React não tem Leaflet.
- O `CLAUDE.md` usa endereços `/fases/...` e diz que o React "só tem `/terrenos/:id/:aba`"; o React usa `/funil/<fase>/<etapa>` e manda `/fases/*` para `/funil`.
- O React lê os dados públicos (setores, demografia, mercado, Quota Ambiental) de `/prototipo/dados/`; apagar o protótipo da imagem quebra o sistema real. No `npm run dev` esses arquivos não carregam.
- `apps/web/src/styles.css` é gerado pelo `build.py` do protótipo e já tem ajustes à mão que um novo build apagaria (ver front.md).

- O `docs/modelo.md` diz "Tudo no schema app", mas quadros e tarefas ficam no `fluxo`; e lista 11 dos 18 tipos de notificação que existem nas migrations.
- A regra 6 do `CLAUDE.md` (auditoria automática "em toda tabela") não vale para todas: `pessoas`, `corretores`, `terreno_infraestrutura`, `viabilidades` e outras não têm o gatilho `t_aud` (lista em banco.md).
- Os SQLs avulsos rodados no banco ao vivo (pasta `/mnt/project-files/saida-prototipo/`) não deixam registro no repositório de quais já foram aplicados. Sugestão: anotar cada um no CHANGELOG com "aplicado no banco em <data>".

As outras incoerências achadas pelos agentes que escreveram o manual estão anotadas nos próprios arquivos (`banco.md`, `front.md`), na seção de cada assunto.
