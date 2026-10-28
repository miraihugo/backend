const express = require("express");
const router = express.Router();
const { query, httpError, ensureUpdated } = require("./db");

const columns = `id_fornecedor, nome, empresa, email, telefone, cidade, estado,
  ativo, criado_em, atualizado_em`;
const editableFields = ["nome", "empresa", "email", "telefone", "cidade", "estado", "ativo"];

function validateSupplier(body, partial = false) {
  if ((!partial || Object.hasOwn(body, "nome")) &&
    (typeof body.nome !== "string" || !body.nome.trim())) {
    throw httpError(400, "Nome do fornecedor é obrigatório.");
  }
  if (Object.hasOwn(body, "ativo") && ![0, 1, "0", "1"].includes(body.ativo)) {
    throw httpError(400, "O campo ativo deve ser 0 ou 1.");
  }
  if (Object.hasOwn(body, "estado") && body.estado !== null &&
    (typeof body.estado !== "string" || !/^[a-zA-Z]{2}$/.test(body.estado))) {
    throw httpError(400, "Estado deve conter a sigla de duas letras ou ser null.");
  }
  for (const field of ["empresa", "email", "telefone", "cidade"]) {
    if (Object.hasOwn(body, field) && body[field] !== null && typeof body[field] !== "string") {
      throw httpError(400, `${field} deve ser texto ou null.`);
    }
  }
}

router.get("/", async (req, res) => {
  const fornecedores = await query(
    `SELECT ${columns} FROM fornecedores ORDER BY nome`
  );
  res.status(200).send({ fornecedores });
});

router.get("/:id", async (req, res) => {
  const fornecedores = await query(
    `SELECT ${columns} FROM fornecedores WHERE id_fornecedor = ?`,
    [req.params.id]
  );
  if (!fornecedores.length) throw httpError(404, "Fornecedor não encontrado.");
  res.status(200).send({ fornecedor: fornecedores[0] });
});

router.post("/", async (req, res) => {
  validateSupplier(req.body);
  const { nome, empresa = null, email = null, telefone = null, cidade = null, estado = null, ativo = 1 } = req.body;
  const result = await query(
    `INSERT INTO fornecedores (nome, empresa, email, telefone, cidade, estado, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [nome.trim(), empresa, email, telefone, cidade, estado?.toUpperCase() ?? null, Number(ativo)]
  );
  res.status(201).send({ mensagem: "Fornecedor criado.", id_fornecedor: result.insertId });
});

router.patch("/:id", async (req, res) => {
  validateSupplier(req.body, true);
  const fields = [];
  const values = [];
  for (const field of editableFields) {
    if (!Object.hasOwn(req.body, field)) continue;
    fields.push(`${field} = ?`);
    const value = req.body[field];
    values.push(field === "ativo" ? Number(value) :
      field === "nome" ? value.trim() :
      field === "estado" && value !== null ? value.toUpperCase() : value);
  }
  if (!fields.length) throw httpError(400, "Informe ao menos um campo para atualizar.");
  values.push(req.params.id);
  const result = await query(
    `UPDATE fornecedores SET ${fields.join(", ")} WHERE id_fornecedor = ?`,
    values
  );
  await ensureUpdated(result, "fornecedores", "id_fornecedor", req.params.id, "Fornecedor não encontrado.");
  res.status(200).send({ mensagem: "Fornecedor atualizado." });
});

router.delete("/:id", async (req, res) => {
  const result = await query("DELETE FROM fornecedores WHERE id_fornecedor = ?", [req.params.id]);
  if (!result.affectedRows) throw httpError(404, "Fornecedor não encontrado.");
  res.status(200).send({ mensagem: "Fornecedor removido." });
});

module.exports = router;
