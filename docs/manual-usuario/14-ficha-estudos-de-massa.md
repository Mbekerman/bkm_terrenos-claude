# 14. Ficha: aba Estudos de massa

**Disponível.** Ficha › **Estudos Técnicos** › **Estudos de massa** (endereço `/terrenos/A123/massa`).

## Para que serve

Pedir a um arquiteto da equipe o estudo do que cabe no terreno e guardar o resultado: as tipologias (quantos apartamentos de cada tamanho), as áreas, as vagas, a área construída e os coeficientes de aproveitamento. O estudo entregue e marcado como **válido** é a base do estudo de viabilidade.

A aba mostra, em cima, o **Resumo do estudo de massa** válido e, embaixo, a lista dos estudos, como a de Estudos de viabilidade. Pedir, lançar, ver e editar um estudo acontece numa janela por cima da ficha.

## Resumo do estudo de massa

No alto da aba, como no Resumo da viabilidade: o seletor **Estudo válido** (só os estudos entregues; escolher um o torna o válido), **"Abrir estudo"** e **"+ Novo estudo"**. Embaixo, em destaque, as **Unidades** e a **Área privativa total** do estudo válido e uma linha por tipologia: **quantidade**, **área privativa** e **área total** (quantidade × área privativa). Na linha **Total**, a soma das unidades e a soma das áreas totais. Sem estudo válido, o quadro diz "Nenhum estudo marcado como válido".

## Pedir um estudo

1. No quadro **Estudos de massa**, clique em **"Solicitar estudo"**. Abre a janela do pedido.
2. Escolha o **Arquiteto** (alguém da equipe), o **Prazo** (opcional) e escreva o **Briefing**, uma linha por item ("Torre única", "Só 2 dormitórios"...).
3. Clique em **"Solicitar"**.

O estudo nasce como **Solicitado**, com o nome "Estudo de massa 1", 2, 3..., e o arquiteto recebe o aviso no sino. O que você digita no formulário fica guardado no navegador até registrar (como nos outros formulários; **"Limpar dados do formulário"** apaga).

## Lançar um estudo que já está pronto

Quando o estudo já chegou pronto (de um arquiteto de fora, por e-mail, ou feito antes do sistema), não precisa pedir:

1. No quadro **Estudos de massa**, clique em **"Novo estudo"** (o botão com o +). Abre a janela.
2. Dê um **Nome** (em branco, vira "Estudo de massa 1", 2, 3...) e escolha o **Responsável na equipe** (vem marcado com você; é quem responde pelo estudo dentro da BKM).
3. Clique em **"Criar e lançar"**.

O estudo nasce **Em elaboração**, ninguém recebe aviso, e o estudo abre na janela para você digitar as tipologias, as áreas, as vagas e os índices. Depois, **"Salvar"** (no fim do estudo) e, se for o caso, **"Marcar como válido"**, como num estudo pedido.

## A lista

Uma tabela como a dos estudos de viabilidade, com cabeçalho e uma linha por estudo: **Estudo** (o nome), **Unidades**, **A.P.** (área privativa total), **Atualizado** (a data da última alteração) e **Válido** (o selo Válido ou Inválido).

**Clique em qualquer lugar da linha** para abrir o estudo na janela (o cursor vira a mãozinha). O selo é a exceção: ele só liga e desliga o válido, sem abrir o estudo.

A janela do estudo tem sempre o mesmo tamanho, a altura da tela inteira, com o estudo grande ou pequeno, aberto ou recolhido: o que não cabe rola dentro dela.

**O selo é clicável** (para quem edita):

- Clicar em **Inválido** torna aquele estudo o válido, e o que era o válido passa a inválido. Os estudos de viabilidade que seguem o válido passam a usar o novo.
- Clicar em **Válido** tira a marca: o terreno fica **sem estudo de massa válido**. Os estudos de viabilidade que seguem o válido ficam com os dados que tinham até outro estudo ser marcado.

**Regra:** só um estudo é o válido por terreno, e só um estudo **entregue** pode ser o válido (no estudo ainda não entregue, o selo não clica).

## A janela do estudo

A janela fecha no **X** ou com **Esc**. No título: o nome, a situação, o selo **Válido** e **"Ver pedido"**, que abre a janela com a data do pedido, quem pediu, o nome do estudo, o arquiteto, o prazo e o briefing. Quem edita muda ali o nome, o arquiteto (o novo arquiteto é avisado), o prazo e o briefing e clica em **"Salvar"**.

Os campos se editam no lugar, sem botão de salvar: cada um grava ao sair dele.

- **Tipologias:** título, área privativa e quantidade; a área privativa total de cada uma e o total (unidades e área) se calculam sozinhos. **"Adicionar tipologia"** cria uma nova já pronta para digitar o título; o **x** tira. Dois títulos iguais não são aceitos.
- **Áreas:** lazer coberto e descoberto na torre e fora dela, circulação, anexos, estacionamento coberto e descoberto, contenção até 1,5 m e acima de 1,5 m, todas em m².
- **Vagas:** cobertas e descobertas.
- **Índices:** área privativa total (soma das tipologias), **área construída total**, **eficiência** (privativa ÷ construída, calculada), **C.A. legal** e **C.A. venal**.
- **Análise:** observações do analista.
- Embaixo, os **estudos de viabilidade** feitos com este estudo de massa (o clique abre o estudo).

**Regra:** o primeiro dado lançado passa o estudo de **Solicitado** para **Em elaboração**.

## Botões da janela

- **"Salvar"**, no fim do estudo: o estudo passa a **Entregue**. Só pede pelo menos uma unidade lançada nas tipologias; o resto (áreas, vagas, área construída, índices) pode ficar em branco e ser completado depois. Quem pediu o estudo é avisado no sino. Os campos gravam sozinhos ao sair deles; o Salvar é o que dá o estudo por pronto.
- **"Marcar como válido"**: no estudo entregue que ainda não é o válido.
- **"Criar estudo de viabilidade"**: no estudo entregue. Cria o estudo de viabilidade com o modelo padrão da empresa, já com as tipologias (título, área e quantidade) e a área construída deste estudo, que lá não se editam; preços, permuta e comissão são da viabilidade. No estudo válido, a janela pergunta se a viabilidade **segue o estudo de massa válido** (trocou o válido, ela troca junto) ou **fica presa a este estudo**. Criado, o estudo de viabilidade abre na hora.
- **"Apagar"**: só no estudo que não é o válido e não tem estudo de viabilidade preso a ele, com confirmação. Apagado, a janela fecha.

Leitura vê tudo, sem editar.

## O que ainda não dá

- Enviar o **PDF** e o **DWG** do estudo: entram com a aba Documentos.
