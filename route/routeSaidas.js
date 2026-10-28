const express = require("express");
const router = express.Router();
const { query, httpError, ensureUpdated, isNumeric, isPositiveInteger } = require("./db");

const selectExits = `SELECT s.id_saida, s.id_produto, p.nome AS produto,
  s.id_funcionario, f.nome AS funcionario, s.quantidade, s.valor_unitario,
  s.data_saida, s.destino, s.criado_em, s.atualizado_em
  FROM saidas s
  JOIN produtos p ON p.id_produto = s.id_produto
  JOIN funcionarios f ON f.id_funcionario = s.id_funcionario`;
const editableFields = ["id_produto", "id_funcionario", "quantidade", "valor_unitario", "data_saida", "destino"];

function validateExit(body, partial = false) {
  for (const field of ["id_produto", "id_funcionario", "quantidade"]) {
    if ((!partial || Object.hasOwn(body, field)) && !isPositiveInteger(body[field])) {
      throw httpError(400, `${field} deve ser um inteiro positivo.`);
    }
  }
  if ((!partial || Object.hasOwn(body, "valor_unitario")) &&
    (!isNumeric(body.valor_unitario) || Number(body.valor_unitario) < 0)) {
    throw httpError(400, "valor_unitario deve ser numérico e não negativo.");
  }
  if (Object.hasOwn(body, "data_saida") && body.data_saida !== null &&
    (typeof body.data_saida !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.data_saida))) {
    throw httpError(400, "data_saida deve estar no formato YYYY-MM-DD ou ser null.");
  }
  if (Object.hasOwn(body, "destino") && body.destino !== null && typeof body.destino !== "string") {
    throw httpError(400, "destino deve ser texto ou null.");
  }
}

router.get("/", async (req, res) => {
  let sql = `${selectExits} WHERE 1 = 1`;
  const params = [];
  if (req.query.produto) {
    if (!isPositiveInteger(req.query.produto)) throw httpError(400, "Filtro produto inválido.");
    sql += " AND s.id_produto = ?";
    params.push(Number(req.query.produto));
  }
  if (req.query.funcionario) {
    if (!isPositiveInteger(req.query.funcionario)) throw httpError(400, "Filtro funcionário inválido.");
    sql += " AND s.id_funcionario = ?";
    params.push(Number(req.query.funcionario));
  }
  if (req.query.data_inicio) {
    sql += " AND s.data_saida >= ?";
    params.push(req.query.data_inicio);
  }
  if (req.query.data_fim) {
    sql += " AND s.data_saida <= ?";
    params.push(req.query.data_fim);
  }
  const saidas = await query(`${sql} ORDER BY s.data_saida DESC, s.id_saida DESC`, params);
  res.status(200).send({ saidas });
});

router.get("/:id", async (req, res) => {
  const saidas = await query(`${selectExits} WHERE s.id_saida = ?`, [req.params.id]);
  if (!saidas.length) throw httpError(404, "Saída não encontrada.");
  res.status(200).send({ saida: saidas[0] });
});

router.post("/", async (req, res) => {
  validateExit(req.body);
  const {
    id_produto, id_funcionario, quantidade, valor_unitario,
    data_saida = null, destino = null
  } = req.body;
  const result = await query(
    `INSERT INTO saidas
      (id_produto, id_funcionario, quantidade, valor_unitario, data_saida, destino)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [Number(id_produto), Number(id_funcionario), Number(quantidade), Number(valor_unitario), data_saida, destino]
  );
  res.status(201).send({
    mensagem: "Saída registrada e estoque atualizado.",
    id_saida: result.insertId
  });
});

router.patch("/:id", async (req, res) => {
  validateExit(req.body, true);
  const fields = [];
  const values = [];
  for (const field of editableFields) {
    if (!Object.hasOwn(req.body, field)) continue;
    fields.push(`${field} = ?`);
    const value = req.body[field];
    values.push(["id_produto", "id_funcionario", "quantidade"].includes(field) ? Number(value) :
      field === "valor_unitario" ? Number(value) : value);
  }
  if (!fields.length) throw httpError(400, "Informe ao menos um campo para atualizar.");
  values.push(req.params.id);
  const result = await query(
    `UPDATE saidas SET ${fields.join(", ")} WHERE id_saida = ?`,
    values
  );
  await ensureUpdated(result, "saidas", "id_saida", req.params.id, "Saída não encontrada.");
  res.status(200).send({ mensagem: "Saída atualizada e estoque ajustado." });
});

router.delete("/:id", async (req, res) => {
  const result = await query("DELETE FROM saidas WHERE id_saida = ?", [req.params.id]);
  if (!result.affectedRows) throw httpError(404, "Saída não encontrada.");
  res.status(200).send({ mensagem: "Saída removida e estoque ajustado." });
});

module.exports = router;
