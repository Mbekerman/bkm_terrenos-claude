# Arquitetura do bkm_tarefas (4/nov/2026)

Sistema de tarefas num banco próprio (ver `docs/adr/0002-tarefas-em-banco-proprio.md`). Decisões do Moisés de 4/nov/2026 (rodada 6, Q24 a Q28): repositório próprio, login único, cópia de acessos, telas num pacote só e avanço que espera quando a trava não pode ser conferida.

## Peças

| Peça | Onde mora | O que faz |
|---|---|---|
| Banco das tarefas | Supabase `bkm_tarefas` | quadros, listas, cartões, cronograma, aprovações, pausas, automações, formulário, comentários, avisos |
| Banco dos terrenos | Supabase `BKM_Desenvolvimento_Imobiliario` | terrenos, funil, Jornada, catálogo de campos; dono dos dados que o cartão grava |
| Repositório | GitHub [`Mbekerman/bkm_tarefas`](https://github.com/Mbekerman/bkm_tarefas) | migrations e testes do banco das tarefas, funções do servidor e as telas de tarefas |
| Telas | pacote do repositório `bkm_tarefas` | usadas dentro do BKM Terrenos (ficha, página Tarefas) e no app de tarefas sozinho |

## Quem é quem: um login, duas sessões

- Nos dois bancos, as pessoas da BKM entram só pela conta Google da BKM; e-mail e senha só para convidados de fora (decisão do Moisés, 4/nov/2026; ver "Convidados de fora").
- A pessoa entra uma vez pelo Google (o mesmo app OAuth "Interno" da BKM). O front pega a identificação do Google e abre a sessão nos dois bancos com ela (`signInWithIdToken`), sem pedir login de novo. **A testar no começo**: o mesmo token aceito pelos dois projetos.
- Cada banco tem o seu cadastro de usuários; a ligação entre eles é o e-mail do Google, que é o mesmo.
- O `bkm_tarefas` tem os seus próprios **espaços de trabalho** (a "empresa" das tarefas), pessoas, papéis e auditoria. A BKM é um espaço.

## Sistemas ligados

- Cada sistema que usa tarefas se registra no `bkm_tarefas`: nome ("BKM Terrenos"), tipos de objeto (terreno), endereço das funções dele e uma chave de serviço guardada no cofre (Vault). O "Sistema" do "Grava em" lê essa lista.
- O sistema publica o **catálogo de campos** que aceita receber (o de Configurações › Campos): nome, título, tipo, opções, máscara. A tarefa guarda só `sistema + objeto + campo`.

## As quatro conversas entre os bancos

1. **Quem vê o objeto.** O sistema dono manda para o `bkm_tarefas` uma cópia das pessoas e de quem vê cada objeto, sempre que muda (fila com nova tentativa). Assim a regra de acesso das tarefas roda dentro do próprio banco, rápida e sem depender do outro estar no ar.
2. **Responder uma pergunta do cartão que grava no terreno.** O valor mora só no terreno (fonte única). O front grava pelo sistema dono com a sessão da pessoa (`app.gravar_campo`, com as regras e o log de lá); o cartão mostra o valor lido de lá. Para concluir, a função do servidor do `bkm_tarefas` confere no sistema dono se os campos exigidos estão preenchidos.
3. **Tarefas da etapa.** Ao entrar numa etapa, o banco dos terrenos põe um pedido numa fila de saída; uma função envia ao `bkm_tarefas`, que cria as tarefas (sem duplicar se o pedido chegar duas vezes). Ao concluir, o `bkm_tarefas` avisa de volta ("pode avançar").
4. **Trava do avanço.** Ao avançar, o banco dos terrenos pergunta ao `bkm_tarefas` quais tarefas que travam estão abertas. Se a etapa tem tarefa que trava e o `bkm_tarefas` não responde, o avanço espera, com "tarefas indisponíveis, tente de novo"; etapa sem tarefa que trava avança normalmente.

## Convidados de fora

Só eles entram com e-mail e senha, e só por convite (sem cadastro aberto). Pontos em aberto na rodada 7.

## Regras que continuam

- Regra de negócio mora no banco de cada um; nenhum sistema escreve direto nas tabelas do outro.
- "Não informado" nunca vira zero; histórico em vez de sobrescrita; isolamento por espaço de trabalho com RLS.
- Toda conversa entre bancos tem nova tentativa, registro do que falhou e não duplica quando repetida.

## Ordem

As tarefas estão fora da primeira versão do BKM Terrenos. Depois do primeiro uso: repositório e banco do `bkm_tarefas` (reescrever o `fluxo` com espaços, pessoas e auditoria próprios), login nos dois, cópia de acessos, catálogo de campos, tarefas da etapa e trava. O esquema `fluxo` sai do banco dos terrenos quando o `bkm_tarefas` estiver no ar.
