# 08. Ficha: aba Mercado

**Disponível.** Ficha › aba **Mercado** (endereço `/terrenos/A123/mercado`; o link antigo `/terrenos/A123/entorno` cai aqui). Cada quadro é um botão abaixo das abas.

## Para que serve

Responder "a região é boa para um empreendimento MCMV?": o que tem perto a pé, quanto ganham e quantos são os moradores em volta e o que a concorrência está vendendo e a que preço.

Quatro quadros, nesta ordem: **Concorrência no entorno**, **Renda e população do entorno**, **Perfil da população do entorno** e **Pontos de interesse**. O Entorno, que ficava em Estudos Técnicos, saiu.

**Regra:** tudo depende de o terreno estar localizado. Sem ponto no mapa aparece "Localize o terreno (aba Terreno, Localização) para ver o mercado."

## Pontos de interesse

**De onde vêm:** quando o terreno é localizado (ou muda de lugar), o sistema busca no Google, **uma vez por localização**, os lugares a até **1,5 km a pé** destas categorias: estações de metrô ou trem, terminais de ônibus, shopping centers, hospitais e postos de saúde, escolas ou creches, supermercados, parques ou praças e faculdades. Junto entram os pontos cadastrados pela empresa.

**Filtro de ruído:** escola pública, creche, praça, shopping, estação, posto de saúde e hipermercado entram sempre; os demais comércios precisam de 50 avaliações no Google; autoescola, curso de vigilante, veterinário, portaria de parque e afins saem pelo nome; lojas a até 200 m de um shopping saem.

**O que você vê:** uma lista só, ordenada pela distância, cada linha com a categoria (Transporte, Saúde, Escola, Comércio, Lazer...), a **distância a pé** em minutos (pela rota a pé; sem rota, linha reta, e o sistema avisa) e um ícone com o **link da rota a pé** no Google Maps. Aparecem 8 linhas e **"Mostrar mais"**. No fim, "Sem …" para as categorias em que o Google não achou nada.

**Excluir um ponto:** a **lixeira** na linha (menos Leitura), com confirmação. Excluir tira o ponto **só deste terreno**: um lugar do Google continua fora mesmo se a busca for refeita; um ponto da empresa continua nos outros terrenos.

**Restaurar:** **"Excluídos (N)"** no fim do quadro lista os excluídos, com **"Restaurar"**.

**Dica:** a distância a pé da estação de metrô ou trem mais próxima vai para o Resumo da Visão geral.

**O que não dá:**

- Buscar de novo à mão: a busca é refeita só quando o terreno muda de lugar.

## Renda e população do entorno

**Para que serve:** ver a renda familiar e quantas pessoas moram em volta do terreno.

Escolha o **raio**: **500 m, 1 km, 2 km, 3 km** ou **Poligonal** (só o terreno). O quadro mostra:

- **Renda familiar média estimada**;
- **População**, densidade e domicílios;
- **Domicílios pela faixa de renda média do setor** (as mesmas faixas do Mapa de Renda).

**De onde vem:** Censo 2022 do IBGE, por setor censitário (ver [Mapa › Camadas](02-mapa.md#camadas-de-renda-e-densidade)). É sempre **estimada**; o link **Metodologia** explica a conta. Hoje só há dados de São Paulo e São José dos Campos.

## Perfil da população do entorno

Com o **seletor de raio próprio** (independente do quadro da renda): 500 m, 1, 2, 3 km ou Poligonal. Mostra:

- População residente, domicílios ocupados, **moradores por domicílio**;
- **Homens · Mulheres**;
- **Densidade demográfica** em habitantes por km², bruta (a área inclui ruas, praças e vazios);
- **Idade média**, estimada pelas faixas de idade do IBGE (ver as regras abaixo);
- **Pessoas por idade e sexo** (pirâmide): 0–4, 5–14, 15–19, 20–29, 30–39, 40–49, 50–59 e 60+;
- **Domicílios por número de moradores** (1, 2, 3, 4, 5 ou mais);
- **Tipo de domicílio** (casa, vila ou condomínio, apartamento, cortiço, degradada);
- vagos e de uso ocasional ("Fora dos ocupados").

**Regras:** dado em sigilo do IBGE aparece como **"Não divulgado (sigilo)"**, nunca zero. As faixas de idade são os cortes exatos que o IBGE divulga por setor; faixas mais finas exigiriam estimativa. A **idade média** é a única estimativa do quadro: cada pessoa conta pela idade do meio da faixa dela e quem tem 70 ou mais conta como 78 anos (a média real dessa faixa em São Paulo no Censo 2022); conferida com a idade ano a ano da cidade inteira, erra menos de 0,2 ano. Setores com alguma faixa em sigilo ficam fora da média, e o quadro avisa quando eles passam de 5% das pessoas. **"Sobre os dados"** explica a fonte.

## Concorrência no entorno

**Para que serve:** saber o preço por m² e a velocidade de venda dos empreendimentos em volta.

- **R$/m² médio** e **VSO médio** a **1, 2 e 3 km**, com e sem **Programa social**.
- A lista **"Empreendimentos no entorno"** no raio escolhido (**"Raio da lista"**: 1, 2 ou 3 km; padrão 1), com os botões **Lançamento**, **Em obras** e **Entregue** (ligam e desligam cada situação; todos ligados por padrão; ao menos um precisa ficar ligado). O sistema lembra a escolha no navegador.
- Cada empreendimento abre o resumo e **"Ver tabela completa"**, a mesma janela do card do mapa (ver [02](02-mapa.md#concorrência-empreendimentos-de-outras-empresas)).

**De onde vem:** do monitor de mercado (Órulo). Se ele não responder, aparece "Dados da concorrência indisponíveis agora."

## O que não é possível na aba Mercado

- Escolher outros raios além dos listados (os raios definitivos ainda serão escolhidos).
- Renda e perfil fora de São Paulo e São José dos Campos.
- Saber quais unidades da concorrência são HIS ou HMP (o Órulo só marca o empreendimento todo).
