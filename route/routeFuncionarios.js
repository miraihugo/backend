const express = require("express");
const router = express.Router();
const { query, httpError, ensureUpdated, isNumeric } = require("./db");

const columns = `id_funcionario, nome, cargo, salario, telefone, email,
  data_admissao, ativo, criado_em, atualizado_em`;
const editableFields = ["nome", "cargo", "salario", "telefone", "email", "data_admissao", "ativo"];

function validateEmployee(body, partial = false) {
  for (const field of ["nome", "cargo"]) {
    if ((!partial || Object.hasOwn(body, field)) &&
      (typeof body[field] !== "string" || !body[field].trim())) {
      throw httpError(400, `${field} é obrigatório.`);
    }
  }
  if ((!partial || Object.hasOwn(body, "salario")) &&
    (!isNumeric(body.salario) || Number(body.salario) < 0)) {
    throw httpError(400, "Salário deve ser um valor numérico não negativo.");
  }
  if (Object.hasOwn(body, "ativo") && ![0, 1, "0", "1"].includes(body.ativo)) {
    throw httpError(400, "O campo ativo deve ser 0 ou 1.");
  }
  for (const field of ["telefone", "email"]) {
    if (Object.hasOwn(body, field) && body[field] !== null && typeof body[field] !== "string") {
      throw httpError(400, `${field} deve ser texto ou null.`);
    }
  }
  if (Object.hasOwn(body, "data_admissao") && body.data_admissao !== null &&
    (typeof body.data_admissao !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.data_admissao))) {
    throw httpError(400, "data_admissao deve estar no formato YYYY-MM-DD ou ser null.");
  }
}

router.get("/", async (req, res) => {
  const funcionarios = await query(
    `SELECT ${columns} FROM funcionarios ORDER BY nome`
  );
  res.status(200).send({ funcionarios });
});

router.get("/:id", async (req, res) => {
  const funcionarios = await query(
    `SELECT ${columns} FROM funcionarios WHERE id_funcionario = ?`,
    [req.params.id]
  );
  if (!funcionarios.length) throw httpError(404, "Funcionário não encontrado.");
  res.status(200).send({ funcionario: funcionarios[0] });
});

router.post("/", async (req, res) => {
  validateEmployee(req.body);
  const {
    nome, cargo, salario, telefone = null, email = null,
    data_admissao = null, ativo = 1
  } = req.body;
  const result = await query(
    `INSERT INTO funcionarios (nome, cargo, salario, telefone, email, data_admissao, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [nome.trim(), cargo.trim(), Number(salario), telefone, email, data_admissao, Number(ativo)]
  );
  res.status(201).send({ mensagem: "Funcionário criado.", id_funcionario: result.insertId });
});

router.patch("/:id", async (req, res) => {
  validateEmployee(req.body, true);
  const fields = [];
  const values = [];
  for (const field of editableFields) {
    if (!Object.hasOwn(req.body, field)) continue;
    fields.push(`${field} = ?`);
    const value = req.body[field];
    values.push(["salario", "ativo"].includes(field) ? Number(value) :
      ["nome", "cargo"].includes(field) ? value.trim() : value);
  }
  if (!fields.length) throw httpError(400, "Informe ao menos um campo para atualizar.");
  values.push(req.params.id);
  const result = await query(
    `UPDATE funcionarios SET ${fields.join(", ")} WHERE id_funcionario = ?`,
    values
  );
  await ensureUpdated(result, "funcionarios", "id_funcionario", req.params.id, "Funcionário não encontrado.");
  res.status(200).send({ mensagem: "Funcionário atualizado." });
});

router.delete("/:id", async (req, res) => {
  const result = await query("DELETE FROM funcionarios WHERE id_funcionario = ?", [req.params.id]);
  if (!result.affectedRows) throw httpError(404, "Funcionário não encontrado.");
  res.status(200).send({ mensagem: "Funcionário removido." });
});

module.exports = router;
