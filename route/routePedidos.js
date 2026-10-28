const express = require("express");
const router = express.Router();
const {
  query,
  queryOn,
  getConnection,
  httpError,
  ensureUpdated,
  isPositiveInteger
} = require("./db");

async function getOrder(id) {
  const orders = await query(
    `SELECT p.id_pedido, p.status, p.data_pedido, p.id_cliente,
      c.nome AS cliente, p.criado_em, p.atualizado_em
      FROM pedidos p LEFT JOIN clientes c ON c.id_cliente = p.id_cliente
      WHERE p.id_pedido = ?`,
    [id]
  );
  if (!orders.length) return null;
  const itens = await query(
    `SELECT i.id_item, i.id_pedido, i.id_produto, p.nome AS produto,
      i.quantidade, i.valor_unitario, i.subtotal
      FROM pedido_itens i LEFT JOIN produtos p ON p.id_produto = i.id_produto
      WHERE i.id_pedido = ? ORDER BY i.id_item`,
    [id]
  );
  return { ...orders[0], itens };
}

function validateItems(itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw httpError(400, "O pedido deve conter ao menos um item.");
  }
  for (const item of itens) {
    if (!item || typeof item !== "object" ||
      !isPositiveInteger(item.id_produto) || !isPositiveInteger(item.quantidade)) {
      throw httpError(400, "Cada item deve informar produto e quantidade inteira maior que zero.");
    }
  }
}

router.get("/", async (req, res) => {
  const pedidos = await query(
    `SELECT p.id_pedido, p.status, p.data_pedido, p.id_cliente,
      c.nome AS cliente, p.criado_em, p.atualizado_em
      FROM pedidos p LEFT JOIN clientes c ON c.id_cliente = p.id_cliente
      ORDER BY p.id_pedido DESC`
  );
  res.status(200).send({ pedidos });
});

router.get("/:id", async (req, res) => {
  const pedido = await getOrder(req.params.id);
  if (!pedido) throw httpError(404, "Pedido não encontrado.");
  res.status(200).send({ pedido });
});

router.get("/:id/itens", async (req, res) => {
  const pedido = await query("SELECT id_pedido FROM pedidos WHERE id_pedido = ?", [req.params.id]);
  if (!pedido.length) throw httpError(404, "Pedido não encontrado.");
  const itens = await query(
    `SELECT i.id_item, i.id_pedido, i.id_produto, p.nome AS produto,
      i.quantidade, i.valor_unitario, i.subtotal
      FROM pedido_itens i LEFT JOIN produtos p ON p.id_produto = i.id_produto
      WHERE i.id_pedido = ? ORDER BY i.id_item`,
    [req.params.id]
  );
  res.status(200).send({ itens });
});

router.post("/:id/itens", async (req, res) => {
  const { id_produto, quantidade } = req.body;
  if (!isPositiveInteger(id_produto) || !isPositiveInteger(quantidade)) {
    throw httpError(400, "Informe produto e quantidade inteira maior que zero.");
  }

  const orders = await query("SELECT id_pedido FROM pedidos WHERE id_pedido = ?", [req.params.id]);
  if (!orders.length) throw httpError(404, "Pedido não encontrado.");
  const products = await query("SELECT preco FROM produtos WHERE id_produto = ?", [id_produto]);
  if (!products.length) throw httpError(400, "Produto não encontrado.");

  const price = Number(products[0].preco);
  const quantity = Number(quantidade);
  const result = await query(
    "INSERT INTO pedido_itens (id_pedido, id_produto, quantidade, valor_unitario, subtotal) VALUES (?, ?, ?, ?, ?)",
    [req.params.id, id_produto, quantity, price, Number((price * quantity).toFixed(2))]
  );
  res.status(201).send({ mensagem: "Item adicionado.", id_item: result.insertId });
});

router.patch("/:id/itens/:itemId", async (req, res) => {
  if (!isPositiveInteger(req.body.quantidade)) {
    throw httpError(400, "A quantidade deve ser um inteiro maior que zero.");
  }
  const quantity = Number(req.body.quantidade);
  const result = await query(
    `UPDATE pedido_itens
      SET quantidade = ?, subtotal = ROUND(valor_unitario * ?, 2)
      WHERE id_item = ? AND id_pedido = ?`,
    [quantity, quantity, req.params.itemId, req.params.id]
  );
  await ensureUpdated(
    result,
    "pedido_itens",
    "id_item",
    req.params.itemId,
    "Item não encontrado neste pedido."
  );
  const items = await query(
    "SELECT id_item, id_pedido, id_produto, quantidade, valor_unitario, subtotal FROM pedido_itens WHERE id_item = ? AND id_pedido = ?",
    [req.params.itemId, req.params.id]
  );
  if (!items.length) throw httpError(404, "Item não encontrado neste pedido.");
  res.status(200).send({ mensagem: "Quantidade atualizada.", item: items[0] });
});

router.delete("/:id/itens/:itemId", async (req, res) => {
  const result = await query(
    "DELETE FROM pedido_itens WHERE id_item = ? AND id_pedido = ?",
    [req.params.itemId, req.params.id]
  );
  if (!result.affectedRows) throw httpError(404, "Item não encontrado neste pedido.");
  res.status(200).send({ mensagem: "Item removido." });
});

router.post("/", async (req, res) => {
  const { id_cliente = null, data_pedido = null, status = 1, itens } = req.body;
  validateItems(itens);
  if (![0, 1, "0", "1"].includes(status)) throw httpError(400, "O status deve ser 0 ou 1.");

  const connection = await getConnection();
  let orderId;
  try {
    await queryOn(connection, "START TRANSACTION");
    const order = await queryOn(
      connection,
      "INSERT INTO pedidos (id_cliente, data_pedido, status) VALUES (?, ?, ?)",
      [id_cliente, data_pedido, Number(status)]
    );
    orderId = order.insertId;

    for (const item of itens) {
      const products = await queryOn(
        connection,
        "SELECT preco FROM produtos WHERE id_produto = ?",
        [item.id_produto]
      );
      if (!products.length) throw httpError(400, `Produto ${item.id_produto} não encontrado.`);
      const price = Number(products[0].preco);
      const quantity = Number(item.quantidade);
      await queryOn(
        connection,
        "INSERT INTO pedido_itens (id_pedido, id_produto, quantidade, valor_unitario, subtotal) VALUES (?, ?, ?, ?, ?)",
        [orderId, item.id_produto, quantity, price, Number((price * quantity).toFixed(2))]
      );
    }
    await queryOn(connection, "COMMIT");
  } catch (error) {
    try {
      await queryOn(connection, "ROLLBACK");
    } catch (_) {
      // Keep the original database or validation error.
    }
    throw error;
  } finally {
    connection.release();
  }

  res.status(201).send({ mensagem: "Pedido criado.", pedido: await getOrder(orderId) });
});

router.patch("/:id", async (req, res) => {
  const allowed = ["status", "data_pedido", "id_cliente"];
  const fields = [];
  const values = [];
  for (const column of allowed) {
    if (!Object.hasOwn(req.body, column)) continue;
    const value = req.body[column];
    if (column === "status" && ![0, 1, "0", "1"].includes(value)) {
      throw httpError(400, "O status deve ser 0 ou 1.");
    }
    fields.push(`${column} = ?`);
    values.push(column === "status" && value !== null ? Number(value) : value);
  }
  if (!fields.length) throw httpError(400, "Informe ao menos um campo para atualizar.");
  values.push(req.params.id);
  const result = await query(`UPDATE pedidos SET ${fields.join(", ")} WHERE id_pedido = ?`, values);
  await ensureUpdated(result, "pedidos", "id_pedido", req.params.id, "Pedido não encontrado.");
  res.status(200).send({ mensagem: "Pedido atualizado." });
});

router.delete("/:id", async (req, res) => {
  const connection = await getConnection();
  try {
    await queryOn(connection, "START TRANSACTION");
    await queryOn(connection, "DELETE FROM pedido_itens WHERE id_pedido = ?", [req.params.id]);
    const result = await queryOn(connection, "DELETE FROM pedidos WHERE id_pedido = ?", [req.params.id]);
    if (!result.affectedRows) {
      await queryOn(connection, "ROLLBACK");
      throw httpError(404, "Pedido não encontrado.");
    }
    await queryOn(connection, "COMMIT");
  } catch (error) {
    try {
      await queryOn(connection, "ROLLBACK");
    } catch (_) {
      // Keep the original database error.
    }
    throw error;
  } finally {
    connection.release();
  }
  res.status(200).send({ mensagem: "Pedido removido." });
});

module.exports = router;