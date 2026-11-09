# 07. Ficha: aba Parâmetros

**Disponível.** Ficha › aba **Parâmetros** (endereço `/terrenos/A123/parametros`).

## Para que serve

Mostrar o que a lei deixa construir no terreno (zoneamento e parâmetros urbanísticos) e o que pode atrapalhar (restrições ambientais, patrimônio, riscos, uso anterior do terreno). É a base para o estudo de massa e a viabilidade.

Três quadros: **Parâmetros urbanísticos**, **Restrições e entorno** e **Histórico de uso**.

## Parâmetros urbanísticos

### Como os dados chegam

- **Em São Paulo**, sozinhos: cada SQL consultado no GeoSampa traz as zonas que tocam o lote, com a área de cada zona no lote. A consulta roda ao cadastrar o SQL (ver [05](05-ficha-terreno.md#janela-da-etiqueta-lápis-ou-clique)).
- **Em São José dos Campos**, pelo GeoSanja (zona da LC 623, macrozona, centralidade).
- **Em outras cidades** ou quando a consulta falha: à mão, por **"Registrar zonas"**.

**Regra:** a análise é guardada **por lote e por zona**. Um terreno com três lotes, um deles cortado por duas zonas, tem quatro linhas. A parte do terreno sem inscrição (sem SQL) pega a zona pela poligonal ("Parte sem inscrição").

### O que você vê

- **Zonas da área**: as zonas do terreno, com a área de cada uma.
- **Potencial construtivo** de **Mercado**, **HIS** e **HMP**, lado a lado: a soma de (área da zona × CA máximo da zona para aquele tipo). Ao lado do potencial aparece o **CA máx.**, o maior CA máximo entre as zonas que admitem aquele tipo. O sistema **nunca** mostra um "CA médio".
- **Panorama do terreno**: os mesmos parâmetros do quadro de cada zona, para o terreno inteiro. Quando os lotes ou as zonas têm valores diferentes, aparecem todos, separados por barra ("4 / 2"), com "varia por zona ou lote" embaixo; parar o mouse sobre o quadrinho mostra de qual zona é cada valor. Logo abaixo, **"Demais parâmetros e restrições"** do terreno inteiro: o que toca algum dos lotes consultados na prefeitura, junto. No fim, **uma vez só**, a lista do que **nenhum** lote toca ("Nenhum dos 2 lotes toca: ZEIS 1, Eixo de estruturação..."). O que toca só um lote aparece no relatório daquele lote.
- **"Ver lote por lote"** (seta para abrir, começa fechado): por lote, um quadro por zona com: CA mínimo, CA básico, CA máximo de cada tipo (ou **"Não admitido"** quando a zona não aceita o tipo), taxa de ocupação, gabarito (altura ou "Sem limite"), recuo de frente, recuos laterais e de fundo, cota-parte máxima, unidades por lote, permeabilidade mínima, lote mínimo, frente mínima e outorga onerosa (Gratuita, "Paga acima do básico" ou Dispensado).
- **"Regras e fontes"**: o texto das regras da zona e de onde veio cada número.
- Dentro de cada lote, **"Demais parâmetros e restrições"**: só o que toca aquele lote na última consulta (Conpresp, tombamento, ZEIS, mananciais, macrozona, operação urbana...). A lista do que não toca saiu do lote e fica no panorama.
- O selo **"A validar"** quando algum parâmetro do catálogo ainda não foi conferido ("Há parâmetros a validar no catálogo").

Os parâmetros vêm de um catálogo da lei, por zona e tipo de empreendimento, mantido pelo administrador. Hoje o catálogo tem São Paulo e São José dos Campos.

### Registrar zonas (à mão)

1. Clique em **"Registrar zonas"**.
2. Escolha o lote (inscrição) ou a parte sem inscrição.
3. Escolha até **3 zonas**, com a **área da zona no lote** (maior que zero). Em São José dos Campos, informe também a **macrozona** (o CA depende dela).
4. Informe a **Fonte** (obrigatória: "GeoSampa, certidão de uso do solo...").
5. Clique em **Registrar**.

**Regra:** registrar zonas novas não apaga a análise anterior: ela fica guardada como substituída ("Zonas registradas. A análise anterior foi preservada.").

### Alterar valores num lote

O preenchimento automático não é definitivo. Se uma consulta prévia, operação urbana, certidão ou projeto aprovado disser outra coisa:

1. No quadro da zona daquele lote, clique em **"Alterar valores"**.
2. Mude qualquer parâmetro. **Cada valor grava ao sair do campo. Vazio segue o catálogo.**
3. A **"Fonte da alteração (opcional)"** registra de onde veio ("Consulta prévia, operação urbana, certidão, projeto aprovado...").

A célula alterada mostra **"valores alterados no lote"** e o valor do catálogo ao lado. Esses campos entram no Ctrl+Z.

**Regras de valor:** CA, cota-parte, unidades, lote e frente são números maiores que zero (ou vazio); taxa de ocupação vai de 0 a 1; permeabilidade de 0 a 100%; recuo não pode ser negativo; gabarito "Limitado" exige a altura.

## Restrições e entorno

**Para que serve:** ver de uma vez, para o terreno inteiro, o que pode impedir ou encarecer a obra.

**Como atualizar:** **"Consultar pela poligonal"** (ou "Consultar de novo"). Sem essa consulta, o quadro usa o que veio dos lotes consultados. Precisa ter poligonal. Em São Paulo, a consulta pela poligonal também roda sozinha depois do cadastro com SQLs.

Temas:

- **Ambiental**: Perímetro de qualificação ambiental (Quota Ambiental; Lei 16.402/2016, Mapa 3), inundação em 5, 25 e 100 anos, córrego a até 30 m, árvores na calçada a até 30 m, vegetação significativa, área contaminada no terreno e a até 30 m, parque ou unidade de conservação, manancial.
- **Patrimônio**: bem tombado, área envoltória (Conpresp, Condephaat, Iphan), interesse arqueológico, ZEPEC.
- **Vias e redes**: classificação viária da CET, melhoramento viário, vila ou rua sem saída, linha de alta tensão e ferrovia a até 30 m, distância da rede da Comgás, influência do Metrô ou da CPTM.
  - **Classificação viária (CET)**: só as ruas que são frente do terreno (as mesmas das frentes medidas pela poligonal), uma linha por rua. A CET classifica a rua por trechos de quarteirão; quando os trechos junto do terreno têm classificações diferentes, vale a mais alta e a outra aparece entre parênteses, por exemplo "R Sebastião Sisson: Coletora (trecho Local)". Rua de frente que a CET não classifica aparece como "sem classificação".
  - **Vila ou rua sem saída**: vila enquadrada pela prefeitura a até 20 m, com a distância, ou rua de frente sem saída. O GeoSampa não tem um cadastro de ruas sem saída: o sistema deduz pela rede de ruas da prefeitura (até 400 m em volta), olhando se a rua de frente só sai por um caminho que termina. Viela, passagem e escadaria aparecem como "só passagem de pedestres". É uma dedução; confira no mapa antes de decidir.
  - **Melhoramento viário** e **faixa não edificável** mostram a lei, o tipo, a largura da faixa (quando a prefeitura informa) e quanto do terreno a faixa atinge, em m². **Córrego**, **vila**, **alta tensão** e **ferrovia** mostram a distância até o terreno ("encosta no terreno" quando toca).
- **Riscos e interferências**: risco geológico, restrição geotécnica, faixa não edificável.

Cada linha diz sim, não, a distância, "Nada cadastrado no terreno nem a até 30 m" ou "Não respondeu" (quando a fonte falhou).

**Fora de São Paulo:** "Não disponível nesta cidade. O que a prefeitura traz está em cada lote, acima."

## Histórico de uso

**Para que serve:** saber se o terreno já teve uso que contamina (posto, indústria), o que muda o custo e o prazo.

- **Automático**: o cadastro de áreas contaminadas (prefeitura e Cetesb).
- **Pesquisa do histórico**: campo de texto livre para o que a equipe apurou.

## O que não é possível na aba Parâmetros

- Escolher um "tipo de empreendimento" do terreno: o sistema mostra Mercado, HIS e HMP sempre lado a lado, de propósito.
- Largura de via e rodovias: ficaram de fora por decisão.
- Catálogo de parâmetros de outras cidades além de São Paulo e São José dos Campos (falta definir).
- Editar o catálogo da lei: **ainda não disponível** no sistema real (fica em Configurações, que não foi portada).
- Baixar a planta (PDF) e o desenho (DXF) do lote: **ainda não disponível** (entra com a aba Documentos).
