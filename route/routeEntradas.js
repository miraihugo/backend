const express = require("express");
const router = express.Router();
const { query, httpError, ensureUpdated, isNumeric, isPositiveInteger } = require("./db");

const selectEntries = `SELECT e.id_entrada, e.id_produto, p.nome AS produto,
  e.id_fornecedor, f.nome AS fornecedor, f.empresa AS empresa_fornecedor,
  e.quantidade, e.valor_unitario, e.data_entrada, e.observacao,
  e.criado_em, e.atualizado_em
  FROM entradas e
  JOIN produtos p ON p.id_produto = e.id_produto
  JOIN fornecedores f ON f.id_fornecedor = e.id_fornecedor`;
const editableFields = ["id_produto", "id_fornecedor", "quantidade", "valor_unitario", "data_entrada", "observacao"];

function validateEntry(body, partial = false) {
  for (const field of ["id_produto", "id_fornecedor", "quantidade"]) {
    if ((!partial || Object.hasOwn(body, field)) && !isPositiveInteger(body[field])) {
      throw httpError(400, `${field} deve ser um inteiro positivo.`);
    }
  }
  if ((!partial || Object.hasOwn(body, "valor_unitario")) &&
    (!isNumeric(body.valor_unitario) || Number(body.valor_unitario) < 0)) {
    throw httpError(400, "valor_unitario deve ser numérico e não negativo.");
  }
  if (Object.hasOwn(body, "data_entrada") && body.data_entrada !== null &&
    (typeof body.data_entrada !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.data_entrada))) {
    throw httpError(400, "data_entrada deve estar no formato YYYY-MM-DD ou ser null.");
  }
  if (Object.hasOwn(body, "observacao") && body.observacao !== null && typeof body.observacao !== "string") {
    throw httpError(400, "observacao deve ser texto ou null.");
  }
}

router.get("/", async (req, res) => {
  let sql = `${selectEntries} WHERE 1 = 1`;
  const params = [];
  if (req.query.produto) {
    if (!isPositiveInteger(req.query.produto)) throw httpError(400, "Filtro produto inválido.");
    sql += " AND e.id_produto = ?";
    params.push(Number(req.query.produto));
  }
  if (req.query.fornecedor) {
    if (!isPositiveInteger(req.query.fornecedor)) throw httpError(400, "Filtro fornecedor inválido.");
    sql += " AND e.id_fornecedor = ?";
    params.push(Number(req.query.fornecedor));
  }
  if (req.query.data_inicio) {
    sql += " AND e.data_entrada >= ?";
    params.push(req.query.data_inicio);
  }
  if (req.query.data_fim) {
    sql += " AND e.data_entrada <= ?";
    params.push(req.query.data_fim);
  }
  const entradas = await query(`${sql} ORDER BY e.data_entrada DESC, e.id_entrada DESC`, params);
  res.status(200).send({ entradas });
});

router.get("/:id", async (req, res) => {
  const entradas = await query(`${selectEntries} WHERE e.id_entrada = ?`, [req.params.id]);
  if (!entradas.length) throw httpError(404, "Entrada não encontrada.");
  res.status(200).send({ entrada: entradas[0] });
});

router.post("/", async (req, res) => {
  validateEntry(req.body);
  const {
    id_produto, id_fornecedor, quantidade, valor_unitario,
    data_entrada = null, observacao = null
  } = req.body;
  const result = await query(
    `INSERT INTO entradas
      (id_produto, id_fornecedor, quantidade, valor_unitario, data_entrada, observacao)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [Number(id_produto), Number(id_fornecedor), Number(quantidade), Number(valor_unitario), data_entrada, observacao]
  );
  res.status(201).send({
    mensagem: "Entrada registrada e estoque atualizado.",
    id_entrada: result.insertId
  });
});

router.patch("/:id", async (req, res) => {
  validateEntry(req.body, true);
  const fields = [];
  const values = [];
  for (const field of editableFields) {
    if (!Object.hasOwn(req.body, field)) continue;
    fields.push(`${field} = ?`);
    const value = req.body[field];
    values.push(["id_produto", "id_fornecedor", "quantidade"].includes(field) ? Number(value) :
      field === "valor_unitario" ? Number(value) : value);
  }
  if (!fields.length) throw httpError(400, "Informe ao menos um campo para atualizar.");
  values.push(req.params.id);
  const result = await query(
    `UPDATE entradas SET ${fields.join(", ")} WHERE id_entrada = ?`,
    values
  );
  await ensureUpdated(result, "entradas", "id_entrada", req.params.id, "Entrada não encontrada.");
  res.status(200).send({ mensagem: "Entrada atualizada e estoque ajustado." });
});

router.delete("/:id", async (req, res) => {
  const result = await query("DELETE FROM entradas WHERE id_entrada = ?", [req.params.id]);
  if (!result.affectedRows) throw httpError(404, "Entrada não encontrada.");
  res.status(200).send({ mensagem: "Entrada removida e estoque ajustado." });
});

module.exports = router;
