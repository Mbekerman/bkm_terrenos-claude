# 13. Perguntas frequentes e problemas

Respostas curtas. Cada uma aponta a seção com o detalhe.

## Uso do dia a dia

**Como acho um terreno?**
Pelo código ou nome, digite na busca da barra de cima: ela filtra a lista do Mapa. Também dá para usar os Filtros ou a legenda do Mapa, ou descer no Funil. Ver [01](01-entrar-e-navegar.md#busca-de-cima).

**Busquei pelo número da matrícula (ou SQL) e não achou.**
A busca de cima ainda não procura matrícula nem SQL, apesar do texto do campo. Contorno: tente incluir a matrícula ou o SQL num terreno; se já estiver em outro, o sistema diz qual e oferece "Abrir". Ver [05](05-ficha-terreno.md#matrícula-ou-sql-de-outro-terreno).

**Onde está o botão Salvar?**
Não existe. Cada campo grava sozinho ao sair dele. Esc volta o valor de antes. Ver [04](04-ficha-visao-geral.md#editar-no-lugar).

**Errei uma alteração. Como desfaço?**
Clique fora de qualquer campo e aperte Ctrl+Z (⌘Z no Mac). Ctrl+Y refaz. Vale para campos, etiquetas e poligonal desta sessão; não vale para etapas do funil, registros e exclusões. Ver [01](01-entrar-e-navegar.md#desfazer-e-refazer-ctrlz-e-ctrly).

**Como mudo o endereço do terreno?**
Pelo lápis "Editar no mapa": ajuste a poligonal e, se a rua mudou, aceite "Trocar o endereço?". Só número, complemento, zona, cartório e referência se digitam. Ver [05](05-ficha-terreno.md#endereço-e-localização).

**Por que o terreno está em Backlog?**
Porque ainda não tem oferta. Registre uma oferta na aba Comercial: ela abre a negociação. Ver [06](06-ficha-comercial.md#ofertas-recebidas).

**Não consigo dar temperatura.**
Temperatura é da negociação. Sem oferta, não há negociação. Registre a oferta primeiro.

**Como sei o que falta preencher?**
Clique em "Ficha N% completa" no topo da ficha (ou no alerta da barra das abas). Cada item leva direto ao campo. Ver [04](04-ficha-visao-geral.md#ficha-n-completa).

**Fechei o formulário sem querer. Perdi o que digitei?**
Não. O rascunho fica no navegador e volta ao reabrir o formulário, no mesmo computador. Ver [01](01-entrar-e-navegar.md#rascunhos-de-formulários).

**O mesmo terreno chegou por outro corretor. Cadastro de novo?**
Não. Registre uma nova oferta no terreno existente (aba Comercial › "Registrar oferta"). Se você começar um Novo terreno na mesma área, o sistema detecta a sobreposição e oferece "Nova oferta neste terreno". Ver [03](03-novo-terreno.md#se-outro-terreno-já-ocupa-a-área).

**O terreno tem vários donos. Como faço?**
Se negociam juntos, é uma parte só, com várias pessoas no lápis da parte. Se negociam separado, crie uma parte para cada grupo e leve as matrículas e SQLs de cada um. Ver [05](05-ficha-terreno.md#partes).

**Por que não consigo soltar o SQL na parte?**
O SQL entra sempre dentro de uma matrícula. Leve primeiro a matrícula para a parte. Ver [05](05-ficha-terreno.md#levar-as-etiquetas-para-as-partes).

**Por que a poligonal mudou sozinha?**
Cada SQL incluído ou excluído refaz a poligonal pela soma dos lotes da prefeitura. Ctrl+Z volta. Ver [05](05-ficha-terreno.md#efeitos-de-incluir-ou-tirar-sql).

**Qual área vale?**
A área adotada, em azul em Áreas e dimensões. Clique em outro cartão para trocar. Ver [05](05-ficha-terreno.md#áreas-e-dimensões).

**Não consigo avançar a etapa.**
Há pendência (o analista vê a lista) ou a passagem pede aprovação ("Pedir aprovação"). Gestor e diretor podem passar com justificativa. Também não se move com pedido de aprovação aberto. Ver [09](09-avanco-e-logs.md#avançar-com-pendência).

**Avancei a etapa por engano.**
Ctrl+Z não desfaz etapas. No Funil, desça até as etapas e arraste o card de volta; o sistema pede o motivo. Ver [10](10-funil.md#mover-arrastando).

**Qual a diferença entre Perdido e Descartado?**
Perdido: o lado de fora desistiu ou vendeu para outro. Descartado: a BKM decidiu não seguir. Os dois arquivam as tarefas. Ver [09](09-avanco-e-logs.md#marcar-como-perdido).

**Quem mudou este campo?**
Painel › Logs. Filtre por pessoa e período; clique no log para ir ao campo. Ver [09](09-avanco-e-logs.md#logs).

**Como mando um terreno para um colega?**
Copie o endereço do navegador. O link abre na mesma aba (e com os mesmos filtros, se houver). Ver [01](01-entrar-e-navegar.md#endereço-de-cada-tela).

## Problemas

**"Seu acesso ainda não foi liberado."**
Seu cadastro ainda não foi feito. Peça ao Moises ou ao Rafael e clique em "Tentar de novo".

**Não vejo lápis nem botões de registrar.**
Seu papel é Leitura ou Básico. Peça a promoção a um administrador.

**O GeoSampa não respondeu.**
O site da prefeitura cai às vezes. Use "Tentar de novo" ou "Buscar de novo" mais tarde. A consulta só funciona no endereço publicado do sistema.

**A gravação foi recusada porque outra pessoa mudou a ficha.**
Duas pessoas editaram ao mesmo tempo. Recarregue a página (F5), confira o valor atual e repita sua alteração.

**O mapa abriu num lugar estranho.**
O mapa abre onde você o deixou. Use a busca de endereço ou clique num terreno da lista.

**A camada de renda sumiu.**
Ela desliga sozinha depois de 30 minutos fora do mapa. Ligue de novo em ⋮ › Camadas.

**A renda ou o perfil do entorno não aparecem.**
Só há dados de São Paulo e São José dos Campos. Fora delas, o quadro fica vazio.

**Os pontos de interesse dizem "linha reta".**
A rota a pé do Google não respondeu; a distância é em linha reta, só para referência.

**Unidades e VGV estão vazios.**
Dependem do estudo de viabilidade, que ainda não está no sistema real. Ver [12](12-ainda-nao-disponivel.md).

**Uma aba diz "Esta aba entra depois da primeira versão".**
Ela existe só no protótipo. Ver [12](12-ainda-nao-disponivel.md).

**Como sei qual versão do sistema está no ar?**
No ambiente de desenvolvimento, embaixo do selo "Desenvolvimento" ao lado do logo, aparece "PR #N · dia hora". Compare com o [Registro de mudanças](CHANGELOG.md).

**Algo na tela está diferente do manual.**
Vale a tela. Avise para o manual ser corrigido.
