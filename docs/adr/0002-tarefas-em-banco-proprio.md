# Tarefas num banco próprio, o bkm_tarefas

As tarefas (quadros, cartões, cronograma, aprovações, automações, formulário do cartão) saem do banco do BKM Terrenos e vão para um projeto Supabase próprio, o `bkm_tarefas` (organização BKM, criado em 4/nov/2026), para servir a outros apps da BKM e um dia virar um produto sozinho. Decisão do Moisés, 4/nov/2026.

## Opções consideradas

- **Mesmo banco, repositório próprio** (esquema `fluxo` instalado dentro do BKM_Desenvolvimento_Imobiliario): uma operação só para gravar um campo do terreno pelo cartão, login e equipe compartilhados, sem custo a mais. Recusada: amarra o produto de tarefas ao banco de um sistema.
- **Banco próprio** (escolhida): o sistema de tarefas tem vida própria, mas cada ligação com um sistema (quem vê, gravar campo, travar avanço, criar tarefas da etapa) passa a ser uma conversa entre dois bancos, sem transação única, e o projeto custa à parte no plano Pro.

## Consequências

- A tarefa nunca escreve nas tabelas de outro sistema: guarda "sistema + objeto + campo" do catálogo que o sistema publica, e quem grava é o sistema dono, pelas regras dele (decisão do Moisés, Q23).
- O esquema `fluxo` de hoje depende de `app.*` (empresas, membros, papéis, auditoria, notificações) e precisa ser reescrito com essas peças próprias no `bkm_tarefas`.
- Arquitetura detalhada e pontos em aberto em `docs/tarefas-arquitetura.md`.
