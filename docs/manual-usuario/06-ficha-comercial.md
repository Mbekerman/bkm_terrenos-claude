# 06. Ficha: aba Comercial

**Disponível.** Ficha › aba **Comercial** (endereço `/terrenos/A123/comercial`).

## Para que serve

Acompanhar a compra do terreno: o que o vendedor pede, quem trouxe o terreno, as propostas trocadas e as reuniões. Os quadros, nesta ordem: **Negociação**, **Condições pedidas**, **Partes** (com duas ou mais partes), **Ofertas recebidas**, **Corretores do terreno**, **Propostas** e **Reuniões**.

**Regra:** a negociação só existe depois da **primeira oferta**. Terreno sem oferta está em **Backlog**: registre uma oferta para começar.

## Negociação

Resumo de onde a negociação está:

- **Situação** (Ativo, Stand By, Perdido, Descartado, Comprado), a subetapa com os dias nela e o motivo, quando há;
- **Temperatura** (a mesma do topo; pode mudar aqui);
- **Última proposta**;
- **Próxima reunião**.

Para mover a negociação (avançar, Stand By, Perdido...), use o quadro de avanço no painel. Ver [09](09-avanco-e-logs.md).

## Condições pedidas

Mostra o que o vendedor pede, na **oferta de referência** (a primeira, até alguém escolher outra em Ofertas recebidas). Tudo se edita no lugar e grava na própria oferta.

| Campo | Observação |
|---|---|
| **Valor pedido** | Aceita "12 mi". Precisa ser maior que zero. |
| **Por m²** | Valor pedido ÷ área adotada. |
| **Forma de pagamento** | Dinheiro, Permuta física, Permuta financeira, Permuta geral ou Permuta com torna. |
| **Corretor** | Quem trouxe a oferta, ou "Sem corretor / direto". |
| **Aceita permuta** | E o texto "Como o vendedor encara a permuta e em que condições". |
| **Pagamento** | "Observação sobre a forma de pagamento" (entrada, parcelas, torna, condição suspensiva). |

## Partes

Aparece quando o terreno tem **duas ou mais partes** (ver [05](05-ficha-terreno.md#partes)). Uma linha por parte, com:

- a **área da parte** (pelas matrículas; sem elas, pelos SQLs);
- o **zoneamento**;
- o **valor pedido** e o **valor por m²**, que se calculam um pelo outro (digite um e o outro muda);
- a **condição de pagamento**.

Embaixo, o **Total**. Esses valores são da oferta de referência.

Com uma parte só, o quadro não aparece: o valor é o da própria oferta e a área é a adotada do terreno.

## Ofertas recebidas

**Para que serve:** guardar cada oferta que chega, inclusive o mesmo terreno oferecido por outro corretor ou por outro valor.

**Como registrar uma oferta:**

1. Clique em **"Registrar oferta"**.
2. Preencha: **Corretor** (ou "Sem corretor / direto"), **Valor pedido**, **Forma de pagamento pedida**, **Validade**, observação e **Aceita permuta**.
3. Clique em **Registrar**.

A **primeira oferta abre a negociação** ("Oferta registrada. A negociação foi aberta."): o terreno sai do Backlog e entra na primeira etapa de Novos Negócios.

Na lista, a primeira oferta tem o selo **"Primeira"** e a de referência, **"Referência"**. **"Usar como referência"** troca a oferta cujas condições a ficha mostra.

**Dica:** o "Valor pedido na entrada" do Resumo é sempre a **primeira** oferta, para comparar com o que veio depois.

## Corretores do terreno

Lista os corretores que trouxeram ofertas deste terreno. Eles "entram automaticamente quando apresentam uma oferta". A **estrela** marca o **principal** ("Marcar como principal"), que aparece no Resumo da Visão geral.

## Propostas

**Para que serve:** registrar cada valor que a BKM propõe e cada contraproposta do vendedor, com o histórico das versões.

**Como registrar:**

1. Clique em **"Nova proposta"**.
2. Preencha:
   - **Origem**: **BKM** (a BKM propõe) ou **Vendedor** (contraproposta);
   - **Valor total**;
   - **Forma de pagamento**;
   - **Status**: Apresentada, Em análise ou Rascunho;
   - **Apresentada em** (data) e **Validade** (vem com 15 dias depois);
   - **Condições de pagamento** (texto).
3. Clique em **Registrar**.

**Versões:** cada proposta ganha um número (v1, v2, v3...). O formulário avisa a qual versão a nova responde:

- se a nova vem **do outro lado** (BKM responde ao vendedor, ou vice-versa), a anterior vira **Recusada**;
- se vem **do mesmo lado**, a anterior vira **Substituída**.

**Mudar o status de uma proposta:** clique no chip do status na linha da proposta e escolha: Rascunho, Apresentada, Em análise, Aceita, Recusada, Expirada, Retirada ou Substituída.

**Regra:** proposta nunca é apagada nem sobrescrita: cada mudança vira histórico.

## Reuniões

**Para que serve:** registrar as conversas com o vendedor, corretor ou advogado, o que foi falado e o que ficou combinado.

**Como registrar:**

1. Clique em **"Registrar reunião"**.
2. Escolha **Realizada** ou **Agendada**.
3. Preencha: data e hora, **Presencial** ou **Online**, **Na BKM** ou **Externa** (com o endereço: "Escritório do vendedor, no terreno..."), **Participantes da BKM**, **Participantes externos** ("Vendedor, corretor, advogado"), **Pauta**, **O que foi tratado** ("Posições de cada lado, valores citados, objeções") e **Encaminhamentos** ("Quem faz o quê, até quando").
4. Clique em **Registrar**.

Uma reunião **Agendada** ganha o botão **"Marcar realizada"** quando acontece.

**Regra:** reunião realizada não pode ter data futura.

## Avisos

Ofertas, propostas e reuniões geram aviso no sino de quem acompanha o terreno, e o clique no aviso abre esta aba.

## O que não é possível na aba Comercial hoje

- **Ainda não disponível:** criar a reunião no Google Agenda, convidar os participantes, gerar link do Meet e receber a gravação e o resumo do Gemini. Hoje a reunião fica só no sistema.
- **Ainda não disponível:** o quadro de negociação separada por parte (cada parte com sua própria etapa, propostas e botão de avançar).
- **Ainda não disponível:** a próxima tarefa no quadro Negociação (entra com as tarefas).
- **Ainda não disponível:** o aviso "Rentabilidade abaixo da mínima" (depende do estudo de viabilidade).
- Apagar uma oferta ou proposta: não existe, de propósito. Use os status (Retirada, Expirada) para tirar de cena.
