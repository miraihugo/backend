# API do sistema de gestão de estoque e vendas

## Objetivo

Esta API fornece operações HTTP para administrar os dados de um sistema de gestão
comercial. Ela centraliza o cadastro de usuários, categorias, produtos, clientes,
fornecedores e funcionários, além do controle de estoque, entradas, saídas e
pedidos.

## Tecnologias e execução

- Node.js com Express.
- MariaDB/MySQL para persistência dos dados.
- `bcryptjs` para armazenar e comparar senhas com hash.
- O servidor carrega as configurações do ambiente e, por padrão, escuta na porta
  `5000`.
- As configurações do banco são lidas das variáveis `DB_HOST`, `DB_PORT`,
  `DB_USER`, `DB_PASSWORD` e `DB_NAME`. Não inclua credenciais reais neste
  documento nem as compartilhe publicamente.

As requisições podem enviar JSON (`Content-Type: application/json`) ou dados
URL-encoded. O CORS está configurado para aceitar origens de qualquer domínio.

## Endereço-base e convenções

O endereço-base depende do ambiente em que o servidor está executando. Em
desenvolvimento local, normalmente é:

```text
http://localhost:5000
```

Não há prefixo de versão nas rotas. Os exemplos abaixo usam JSON. Os parâmetros
`:id` e `:itemId` são identificadores numéricos dos registros correspondentes.

- `GET` consulta dados.
- `POST` cria registros ou executa ações.
- `PATCH` atualiza somente os campos informados, exceto onde indicado.
- `DELETE` remove registros.
- Campos `ativo` e `status` aceitam `0` ou `1` (número ou texto), conforme a
  rota.
- Datas informadas pela API devem usar `YYYY-MM-DD` quando esse campo é aceito.
- As respostas são JSON. Os formatos e nomes dos campos variam por recurso.

## Verificação do serviço

### `GET /teste`

Verifica se o servidor está respondendo.

Resposta `200`:

```json
{
  "mensagem": "Tudo OK"
}
```

## Usuários e login

Prefixo: `/usuario`

### `POST /usuario/login`

Autentica um usuário pelo e-mail e senha. A senha é comparada com o hash
armazenado no banco.

Corpo:

```json
{
  "email": "usuario@exemplo.com",
  "senha": "minha-senha"
}
```

Em caso de sucesso, retorna `200` com `mensagem` e os dados do usuário, sem
incluir a senha. Credenciais inválidas retornam `401`; usuário inativo retorna
`403`; campos ausentes ou vazios retornam `400`.

**Observação:** o login não emite token nem cria sessão. As demais rotas não
exigem autenticação atualmente.

### Demais operações

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/usuario` | Lista usuários sem expor as senhas. |
| `GET` | `/usuario/:id` | Consulta usuário pelo identificador. |
| `POST` | `/usuario` | Cria usuário; exige `nome`, `email` e `senha`. |
| `PATCH` | `/usuario/:id` | Atualiza nome, e-mail e senha; os três campos são exigidos. |
| `DELETE` | `/usuario/:id` | Remove usuário. |

As senhas são armazenadas com hash bcrypt. A criação retorna `201`; a atualização
e a remoção retornam `202`.

## Categorias

Prefixo: `/categorias`

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/categorias` | Lista categorias ordenadas por nome. |
| `GET` | `/categorias/:id` | Consulta uma categoria. |
| `POST` | `/categorias` | Cria categoria. |
| `PATCH` | `/categorias/:id` | Atualiza `nome`, `descricao` e/ou `ativo`. |
| `DELETE` | `/categorias/:id` | Remove categoria. |

Na criação, `nome` é obrigatório; `descricao` é opcional e `ativo` assume `1`
quando omitido. `ativo` aceita `0` ou `1`.

Exemplo de criação:

```json
{
  "nome": "Limpeza",
  "descricao": "Produtos para limpeza",
  "ativo": 1
}
```

## Produtos

Prefixo: `/produtos`

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/produtos` | Lista produtos; aceita filtros `categoria` e `nome`. |
| `GET` | `/produtos/:id` | Consulta produto e o nome da categoria associada. |
| `POST` | `/produtos` | Cria produto. |
| `PATCH` | `/produtos/:id` | Atualiza campos enviados. |
| `DELETE` | `/produtos/:id` | Remove produto. |

Para criar um produto, informe `nome`, `descricao`, `preco` e
`imagem_produto`. `id_categoria` é opcional e pode ser `null`. O preço deve ser
numérico e não negativo.

Exemplo:

```json
{
  "nome": "Detergente",
  "descricao": "Detergente líquido",
  "preco": 4.5,
  "imagem_produto": "https://exemplo.com/detergente.jpg",
  "id_categoria": 1
}
```

Filtros de listagem podem ser combinados, por exemplo:

```text
GET /produtos?categoria=1&nome=detergente
```

## Clientes

Prefixo: `/clientes`

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/clientes` | Lista clientes. |
| `GET` | `/clientes/:id` | Consulta um cliente. |
| `POST` | `/clientes` | Cria cliente. |
| `PATCH` | `/clientes/:id` | Atualiza `nome`, `email`, `contato` e/ou `ativo`. |
| `DELETE` | `/clientes/:id` | Remove cliente. |

Na criação, `nome` e `email` são obrigatórios. `contato` é opcional e `ativo`
assume `1` quando omitido.

## Fornecedores

Prefixo: `/fornecedores`

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/fornecedores` | Lista fornecedores. |
| `GET` | `/fornecedores/:id` | Consulta um fornecedor. |
| `POST` | `/fornecedores` | Cria fornecedor. |
| `PATCH` | `/fornecedores/:id` | Atualiza campos enviados. |
| `DELETE` | `/fornecedores/:id` | Remove fornecedor. |

Na criação, `nome` é obrigatório. `empresa`, `email`, `telefone`, `cidade`,
`estado` e `ativo` são opcionais. A sigla de `estado` deve conter duas letras;
`ativo` aceita `0` ou `1`.

## Funcionários

Prefixo: `/funcionarios`

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/funcionarios` | Lista funcionários. |
| `GET` | `/funcionarios/:id` | Consulta um funcionário. |
| `POST` | `/funcionarios` | Cadastra funcionário. |
| `PATCH` | `/funcionarios/:id` | Atualiza campos enviados. |
| `DELETE` | `/funcionarios/:id` | Remove funcionário. |

Na criação, `nome`, `cargo` e `salario` são obrigatórios. Telefone, e-mail,
data de admissão e situação (`ativo`) são opcionais. Salário deve ser numérico
e não negativo.

## Estoque

Prefixo: `/estoque`

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/estoque` | Lista registros de estoque com o nome do produto. |
| `GET` | `/estoque/produto/:id` | Consulta registros de estoque de um produto. |
| `PATCH` | `/estoque/:id` | Atualiza limites de estoque e localização. |

A atualização aceita `estoque_minimo`, `estoque_maximo` e `localizacao`.
Os limites podem ser inteiros não negativos ou `null`. A quantidade disponível
é ajustada pelas operações de entrada e saída, não por esta rota.

## Entradas de estoque

Prefixo: `/entradas`

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/entradas` | Lista entradas; aceita filtros. |
| `GET` | `/entradas/:id` | Consulta uma entrada. |
| `POST` | `/entradas` | Registra entrada e atualiza o estoque. |
| `PATCH` | `/entradas/:id` | Atualiza entrada e ajusta o estoque. |
| `DELETE` | `/entradas/:id` | Remove entrada e ajusta o estoque. |

Filtros disponíveis: `produto`, `fornecedor`, `data_inicio` e `data_fim`.

Para criar uma entrada, informe `id_produto`, `id_fornecedor`, `quantidade`
(inteiro positivo) e `valor_unitario` (numérico não negativo). `data_entrada` e
`observacao` são opcionais.

## Saídas de estoque

Prefixo: `/saidas`

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/saidas` | Lista saídas; aceita filtros. |
| `GET` | `/saidas/:id` | Consulta uma saída. |
| `POST` | `/saidas` | Registra saída e atualiza o estoque. |
| `PATCH` | `/saidas/:id` | Atualiza saída e ajusta o estoque. |
| `DELETE` | `/saidas/:id` | Remove saída e ajusta o estoque. |

Filtros disponíveis: `produto`, `funcionario`, `data_inicio` e `data_fim`.

Para criar uma saída, informe `id_produto`, `id_funcionario`, `quantidade`
(inteiro positivo) e `valor_unitario` (numérico não negativo). `data_saida` e
`destino` são opcionais.

## Pedidos

Prefixo: `/pedidos`

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/pedidos` | Lista pedidos. |
| `GET` | `/pedidos/:id` | Consulta pedido com seus itens. |
| `GET` | `/pedidos/:id/itens` | Lista os itens do pedido. |
| `POST` | `/pedidos` | Cria pedido e seus itens em uma transação. |
| `PATCH` | `/pedidos/:id` | Atualiza `status`, `data_pedido` e/ou `id_cliente`. |
| `DELETE` | `/pedidos/:id` | Remove pedido e seus itens em uma transação. |
| `POST` | `/pedidos/:id/itens` | Adiciona item ao pedido. |
| `PATCH` | `/pedidos/:id/itens/:itemId` | Atualiza quantidade do item. |
| `DELETE` | `/pedidos/:id/itens/:itemId` | Remove item do pedido. |

Um pedido deve conter ao menos um item. Os campos `id_produto` e `quantidade`
de cada item devem ser inteiros positivos. O preço unitário e o subtotal do item
são calculados com base no preço do produto no momento da inclusão. `id_cliente`
e `data_pedido` são opcionais; `status` aceita `0` ou `1` e, na criação, assume
`1` se omitido.

Exemplo de criação:

```json
{
  "id_cliente": 1,
  "data_pedido": "2026-10-28",
  "status": 1,
  "itens": [
    {
      "id_produto": 1,
      "quantidade": 2
    }
  ]
}
```

## Códigos de resposta

Os códigos mais comuns incluem:

| Código | Significado |
|---|---|
| `200` | Consulta ou atualização concluída. |
| `201` | Registro criado. |
| `202` | Operação aceita; usado em algumas operações de usuário. |
| `400` | Dados ausentes ou inválidos. |
| `401` | Credenciais de login inválidas. |
| `403` | Usuário inativo ao tentar fazer login. |
| `404` | Rota ou registro não encontrado. |
| `409` | Conflito com restrição do banco, como registro duplicado ou relacionado. |
| `500` | Erro interno ou falha de conexão com o banco de dados. |

As mensagens de erro são retornadas em JSON. O formato não é totalmente uniforme
entre todas as rotas: por exemplo, o handler geral usa `erro.mensagem`, enquanto
algumas respostas usam `error`.

## Limitações atuais

- O login valida credenciais, mas não gera JWT nem sessão.
- Não há middleware de autorização aplicado às rotas; os endpoints de gestão
  podem ser chamados sem autenticação.
- Não há prefixo de versão, paginação ou documentação interativa configurada.
- O comportamento depende da disponibilidade e da estrutura do banco MariaDB/MySQL.
