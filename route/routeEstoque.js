const express = require("express");
const router = express.Router();
const { query, httpError, ensureUpdated, isNonNegativeInteger } = require("./db");

router.get("/", async (req, res) => {
  const estoque = await query(
    `SELECT e.id_estoque, e.id_produto, p.nome AS produto, e.quantidade,
      e.estoque_minimo, e.estoque_maximo, e.localizacao
      FROM estoque e JOIN produtos p ON p.id_produto = e.id_produto
      ORDER BY p.nome, e.id_estoque`
  );
  res.status(200).send({ estoque });
});

router.get("/produto/:id", async (req, res) => {
  const registros = await query(
    `SELECT e.id_estoque, e.id_produto, p.nome AS produto, e.quantidade,
      e.estoque_minimo, e.estoque_maximo, e.localizacao
      FROM estoque e JOIN produtos p ON p.id_produto = e.id_produto
      WHERE e.id_produto = ? ORDER BY e.id_estoque`,
    [req.params.id]
  );
  res.status(200).send({ estoque: registros });
});

router.patch("/:id", async (req, res) => {
  const allowed = ["estoque_minimo", "estoque_maximo", "localizacao"];
  const fields = [];
  const values = [];
  for (const column of allowed) {
    if (!Object.hasOwn(req.body, column)) continue;
    const value = req.body[column];
    if (["estoque_minimo", "estoque_maximo"].includes(column) &&
      value !== null && !isNonNegativeInteger(value)) {
      throw httpError(400, `${column} deve ser um inteiro não negativo ou null.`);
    }
    fields.push(`${column} = ?`);
    values.push(["estoque_minimo", "estoque_maximo"].includes(column) && value !== null ? Number(value) : value);
  }
  if (!fields.length) throw httpError(400, "Informe limites ou localização para atualizar.");
  values.push(req.params.id);
  const result = await query(`UPDATE estoque SET ${fields.join(", ")} WHERE id_estoque = ?`, values);
  await ensureUpdated(result, "estoque", "id_estoque", req.params.id, "Registro de estoque não encontrado.");
  res.status(200).send({ mensagem: "Configurações do estoque atualizadas." });
});

module.exports = router;