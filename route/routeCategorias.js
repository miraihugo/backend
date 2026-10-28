const express = require("express");
const router = express.Router();
const { query, httpError, ensureUpdated } = require("./db");

router.get("/", async (req, res) => {
  const categorias = await query(
    "SELECT id_categoria, nome, descricao, ativo FROM categorias ORDER BY nome"
  );
  res.status(200).send({ categorias });
});

router.get("/:id", async (req, res) => {
  const categorias = await query(
    "SELECT id_categoria, nome, descricao, ativo FROM categorias WHERE id_categoria = ?",
    [req.params.id]
  );
  if (!categorias.length) throw httpError(404, "Categoria não encontrada.");
  res.status(200).send({ categoria: categorias[0] });
});

router.post("/", async (req, res) => {
  const { nome, descricao = null, ativo = 1 } = req.body;
  if (typeof nome !== "string" || !nome.trim()) {
    throw httpError(400, "O campo nome é obrigatório.");
  }
  if (![0, 1, "0", "1"].includes(ativo)) {
    throw httpError(400, "O campo ativo deve ser 0 ou 1.");
  }

  const result = await query(
    "INSERT INTO categorias (nome, descricao, ativo) VALUES (?, ?, ?)",
    [nome.trim(), descricao, Number(ativo)]
  );
  res.status(201).send({ mensagem: "Categoria criada.", id_categoria: result.insertId });
});

router.patch("/:id", async (req, res) => {
  const fields = [];
  const values = [];
  const { nome, descricao, ativo } = req.body;

  if (Object.hasOwn(req.body, "nome")) {
    if (typeof nome !== "string" || !nome.trim()) throw httpError(400, "Nome inválido.");
    fields.push("nome = ?");
    values.push(nome.trim());
  }
  if (Object.hasOwn(req.body, "descricao")) {
    fields.push("descricao = ?");
    values.push(descricao);
  }
  if (Object.hasOwn(req.body, "ativo")) {
    if (![0, 1, "0", "1"].includes(ativo)) throw httpError(400, "O campo ativo deve ser 0 ou 1.");
    fields.push("ativo = ?");
    values.push(Number(ativo));
  }
  if (!fields.length) throw httpError(400, "Informe ao menos um campo para atualizar.");

  values.push(req.params.id);
  const result = await query(
    `UPDATE categorias SET ${fields.join(", ")} WHERE id_categoria = ?`,
    values
  );
  await ensureUpdated(result, "categorias", "id_categoria", req.params.id, "Categoria não encontrada.");
  res.status(200).send({ mensagem: "Categoria atualizada." });
});

router.delete("/:id", async (req, res) => {
  const result = await query("DELETE FROM categorias WHERE id_categoria = ?", [req.params.id]);
  if (!result.affectedRows) throw httpError(404, "Categoria não encontrada.");
  res.status(200).send({ mensagem: "Categoria removida." });
});

module.exports = router;