const express = require("express");
const router = express.Router();
const { query, httpError, ensureUpdated } = require("./db");

const columns = ["nome", "email", "contato", "ativo"];

router.get("/", async (req, res) => {
  const clientes = await query(
    "SELECT id_cliente, nome, email, contato, ativo, criado_em, atualizado_em FROM clientes ORDER BY nome"
  );
  res.status(200).send({ clientes });
});

router.get("/:id", async (req, res) => {
  const clientes = await query(
    "SELECT id_cliente, nome, email, contato, ativo, criado_em, atualizado_em FROM clientes WHERE id_cliente = ?",
    [req.params.id]
  );
  if (!clientes.length) throw httpError(404, "Cliente não encontrado.");
  res.status(200).send({ cliente: clientes[0] });
});

router.post("/", async (req, res) => {
  const { nome, email, contato = null, ativo = 1 } = req.body;
  if (typeof nome !== "string" || !nome.trim() || typeof email !== "string" || !email.trim()) {
    throw httpError(400, "Nome e e-mail são obrigatórios.");
  }
  if (![0, 1, "0", "1"].includes(ativo)) throw httpError(400, "O campo ativo deve ser 0 ou 1.");

  const result = await query(
    "INSERT INTO clientes (nome, email, contato, ativo) VALUES (?, ?, ?, ?)",
    [nome.trim(), email.trim(), contato, Number(ativo)]
  );
  res.status(201).send({ mensagem: "Cliente criado.", id_cliente: result.insertId });
});

router.patch("/:id", async (req, res) => {
  const fields = [];
  const values = [];
  for (const column of columns) {
    if (!Object.hasOwn(req.body, column)) continue;
    const value = req.body[column];
    if (["nome", "email"].includes(column) &&
        (typeof value !== "string" || !value.trim())) {
      throw httpError(400, `${column} inválido.`);
    }
    if (column === "ativo" && ![0, 1, "0", "1"].includes(value)) {
      throw httpError(400, "O campo ativo deve ser 0 ou 1.");
    }
    fields.push(`${column} = ?`);
    values.push(column === "ativo" ? Number(value) :
      ["nome", "email"].includes(column) ? value.trim() : value);
  }
  if (!fields.length) throw httpError(400, "Informe ao menos um campo para atualizar.");
  values.push(req.params.id);
  const result = await query(
    `UPDATE clientes SET ${fields.join(", ")} WHERE id_cliente = ?`,
    values
  );
  await ensureUpdated(result, "clientes", "id_cliente", req.params.id, "Cliente não encontrado.");
  res.status(200).send({ mensagem: "Cliente atualizado." });
});

router.delete("/:id", async (req, res) => {
  const result = await query("DELETE FROM clientes WHERE id_cliente = ?", [req.params.id]);
  if (!result.affectedRows) throw httpError(404, "Cliente não encontrado.");
  res.status(200).send({ mensagem: "Cliente removido." });
});

module.exports = router;