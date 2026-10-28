const express = require("express");
const router = express.Router();
const { query, httpError, ensureUpdated, isNumeric, isPositiveInteger } = require("./db");

const selectProducts = `SELECT p.id_produto, p.nome, p.descricao, p.preco,
  p.imagem_produto, p.id_categoria, c.nome AS categoria,
  p.criado_em, p.atualizado_em
  FROM produtos p LEFT JOIN categorias c ON c.id_categoria = p.id_categoria`;

function validateProduct(body, partial = false) {
  if (!partial || Object.hasOwn(body, "nome")) {
    if (typeof body.nome !== "string" || !body.nome.trim()) {
      throw httpError(400, "Nome inválido.");
    }
  }
  if (!partial || Object.hasOwn(body, "descricao")) {
    if (typeof body.descricao !== "string" || !body.descricao.trim()) {
      throw httpError(400, "Descrição é obrigatória.");
    }
  }
  if (!partial || Object.hasOwn(body, "preco")) {
    if (!isNumeric(body.preco) || Number(body.preco) < 0) {
      throw httpError(400, "Preço inválido.");
    }
  }
  if (!partial || Object.hasOwn(body, "imagem_produto")) {
    if (typeof body.imagem_produto !== "string" || !body.imagem_produto.trim()) {
      throw httpError(400, "Imagem do produto é obrigatória.");
    }
  }
    if (Object.hasOwn(body, "id_categoria") && body.id_categoria !== null &&
      !isPositiveInteger(body.id_categoria)) {
    throw httpError(400, "Categoria inválida.");
  }
}

router.get("/", async (req, res) => {
  let sql = `${selectProducts} WHERE 1 = 1`;
  const params = [];
  if (req.query.categoria) {
    sql += " AND p.id_categoria = ?";
    params.push(req.query.categoria);
  }
  if (req.query.nome) {
    sql += " AND p.nome LIKE ?";
    params.push(`%${req.query.nome}%`);
  }
  const produtos = await query(`${sql} ORDER BY p.nome`, params);
  res.status(200).send({ produtos });
});

router.get("/:id", async (req, res) => {
  const produtos = await query(`${selectProducts} WHERE p.id_produto = ?`, [req.params.id]);
  if (!produtos.length) throw httpError(404, "Produto não encontrado.");
  res.status(200).send({ produto: produtos[0] });
});

router.post("/", async (req, res) => {
  validateProduct(req.body);
  const { nome = null, descricao, preco, imagem_produto, id_categoria = null } = req.body;
  const result = await query(
    "INSERT INTO produtos (nome, descricao, preco, imagem_produto, id_categoria) VALUES (?, ?, ?, ?, ?)",
    [nome, descricao.trim(), Number(preco), imagem_produto.trim(), id_categoria]
  );
  res.status(201).send({ mensagem: "Produto criado.", id_produto: result.insertId });
});

router.patch("/:id", async (req, res) => {
  validateProduct(req.body, true);
  const columns = {
    nome: "nome",
    descricao: "descricao",
    preco: "preco",
    imagem_produto: "imagem_produto",
    id_categoria: "id_categoria"
  };
  const fields = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!Object.hasOwn(req.body, key)) continue;
    fields.push(`${column} = ?`);
    const value = req.body[key];
    values.push(["preco", "id_categoria"].includes(key) && value !== null ? Number(value) :
      ["nome", "descricao", "imagem_produto"].includes(key) ? value.trim() : value);
  }
  if (!fields.length) throw httpError(400, "Informe ao menos um campo para atualizar.");
  values.push(req.params.id);
  const result = await query(
    `UPDATE produtos SET ${fields.join(", ")} WHERE id_produto = ?`,
    values
  );
  await ensureUpdated(result, "produtos", "id_produto", req.params.id, "Produto não encontrado.");
  res.status(200).send({ mensagem: "Produto atualizado." });
});

router.delete("/:id", async (req, res) => {
  const result = await query("DELETE FROM produtos WHERE id_produto = ?", [req.params.id]);
  if (!result.affectedRows) throw httpError(404, "Produto não encontrado.");
  res.status(200).send({ mensagem: "Produto removido." });
});

module.exports = router;