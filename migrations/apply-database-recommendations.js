require("dotenv").config();

const bcrypt = require("bcryptjs");
const fs = require("fs");
const os = require("os");
const path = require("path");
const mysql = require("mysql");

const backupDirectory = process.env.DB_BACKUP_DIR ||
  path.join(os.homedir(), ".copilot", "database-backups");
const backupPath = path.join(backupDirectory, `before-shop-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const tablesToBackup = [
  "categorias",
  "clientes",
  "entradas",
  "estoque",
  "pedido_itens",
  "produtos",
  "saidas",
  "usuarios"
];

function query(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function bcryptHash(value) {
  return bcrypt.hash(value, 12);
}

async function createBackup(connection) {
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backup = { createdAt: new Date().toISOString(), tables: {}, triggers: [] };
  for (const table of tablesToBackup) {
    backup.tables[table] = await query(connection, "SELECT * FROM ??", [table]);
  }
  backup.triggers = await query(
    connection,
    "SHOW TRIGGERS WHERE `Table` IN ('entradas', 'saidas', 'pedido_itens')"
  );
  fs.writeFileSync(backupPath, JSON.stringify(backup), { flag: "wx" });
}

async function hasIndex(connection, table, indexName) {
  const rows = await query(connection, "SHOW INDEX FROM ?? WHERE Key_name = ?", [table, indexName]);
  return rows.length > 0;
}

async function hasConstraint(connection, table, constraintName) {
  const rows = await query(
    connection,
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [table, constraintName]
  );
  return rows.length > 0;
}

async function ensureCheck(connection, table, name, expression) {
  if (!(await hasConstraint(connection, table, name))) {
    await query(connection, `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (${expression})`, [table, name]);
  }
}

async function normalizeCategories(connection) {
  const misspelled = await query(connection, "SELECT id_categoria FROM categorias WHERE id_categoria = 4 AND nome = 'Desifetante'");
  if (misspelled.length) {
    await query(connection, "UPDATE categorias SET nome = 'Desinfetante' WHERE id_categoria = 4");
  }

  const categories = [
    ["Detergente", "Produtos detergentes e sabão em pó"],
    ["Água Sanitária", "Produtos de água sanitária"],
    ["Amaciante", "Produtos amaciantes"],
    ["Desinfetante", "Desinfetantes e limpadores"],
    ["Esponja", "Esponjas de limpeza"],
    ["Limpador", "Produtos limpadores"],
    ["Álcool", "Produtos de álcool para limpeza"],
    ["Sabonete", "Produtos de higiene pessoal"],
    ["Lustra-móveis", "Produtos para limpeza de móveis"]
  ];
  const ids = {};
  for (const [name, description] of categories) {
    const existing = await query(connection, "SELECT id_categoria FROM categorias WHERE nome = ? LIMIT 1", [name]);
    if (existing.length) {
      ids[name] = existing[0].id_categoria;
      continue;
    }
    const inserted = await query(
      connection,
      "INSERT INTO categorias (nome, descricao, ativo) VALUES (?, ?, 1)",
      [name, description]
    );
    ids[name] = inserted.insertId;
  }

  const productCategories = [
    [1, "Detergente"],
    [2, "Detergente"],
    [3, "Água Sanitária"],
    [4, "Desinfetante"],
    [5, "Esponja"],
    [6, "Amaciante"],
    [7, "Limpador"],
    [8, "Álcool"],
    [9, "Sabonete"],
    [10, "Lustra-móveis"]
  ];
  for (const [productId, categoryName] of productCategories) {
    await query(
      connection,
      "UPDATE produtos SET id_categoria = ? WHERE id_produto = ?",
      [ids[categoryName], productId]
    );
  }
}

async function consolidateStock(connection) {
  const duplicates = await query(
    connection,
    `SELECT id_produto, COUNT(*) AS records, SUM(quantidade) AS total
      FROM estoque GROUP BY id_produto HAVING COUNT(*) > 1`
  );
  for (const duplicate of duplicates) {
    const rows = await query(
      connection,
      `SELECT id_estoque, quantidade, estoque_minimo, estoque_maximo, localizacao
        FROM estoque WHERE id_produto = ? ORDER BY id_estoque`,
      [duplicate.id_produto]
    );
    const distinctLocations = [...new Set(rows.map(row => row.localizacao).filter(Boolean))];
    const distinctMinimums = [...new Set(rows.map(row => row.estoque_minimo).filter(value => value !== null))];
    const distinctMaximums = [...new Set(rows.map(row => row.estoque_maximo).filter(value => value !== null))];
    if (distinctLocations.length > 1 || distinctMinimums.length > 1 || distinctMaximums.length > 1) {
      throw new Error(`Estoque duplicado do produto ${duplicate.id_produto} tem metadados conflitantes.`);
    }
    const keep = rows[0];
    await query(
      connection,
      `UPDATE estoque SET quantidade = ?, estoque_minimo = ?, estoque_maximo = ?, localizacao = ?
        WHERE id_estoque = ?`,
      [
        duplicate.total,
        distinctMinimums[0] ?? null,
        distinctMaximums[0] ?? null,
        distinctLocations[0] ?? null,
        keep.id_estoque
      ]
    );
    await query(
      connection,
      "DELETE FROM estoque WHERE id_produto = ? AND id_estoque <> ?",
      [duplicate.id_produto, keep.id_estoque]
    );
  }

  await query(
    connection,
    `INSERT INTO estoque (id_produto, quantidade)
      SELECT p.id_produto, 0 FROM produtos p
      LEFT JOIN estoque e ON e.id_produto = p.id_produto
      WHERE e.id_produto IS NULL`
  );
  const negativeStock = await query(connection, "SELECT id_produto FROM estoque WHERE quantidade < 0 LIMIT 1");
  if (negativeStock.length) {
    throw new Error(`O produto ${negativeStock[0].id_produto} está com saldo negativo; ajuste manual necessário.`);
  }
}

async function migratePasswords(connection) {
  const users = await query(connection, "SELECT id_usu, senha FROM usuarios");
  for (const user of users) {
    if (/^\$2[aby]\$\d{2}\$/.test(user.senha)) continue;
    const hashed = await bcryptHash(user.senha);
    await query(connection, "UPDATE usuarios SET senha = ? WHERE id_usu = ?", [hashed, user.id_usu]);
  }
}

async function replaceTrigger(connection, name, table, timing, event, body) {
  await query(connection, `DROP TRIGGER IF EXISTS ??`, [name]);
  await query(
    connection,
    `CREATE TRIGGER ?? ${timing} ${event} ON ?? FOR EACH ROW ${body}`,
    [name, table]
  );
}

async function migrateTriggers(connection) {
  await query(connection, "DROP TRIGGER IF EXISTS trg_entrada_estoque");
  await query(connection, "DROP TRIGGER IF EXISTS trg_saida_estoque");

  await replaceTrigger(connection, "trg_entrada_validate_bi", "entradas", "BEFORE", "INSERT", `
    BEGIN
      IF NEW.quantidade <= 0 OR NEW.valor_unitario < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantidade deve ser positiva e valor não negativo';
      END IF;
    END
  `);
  await replaceTrigger(connection, "trg_entrada_validate_bu", "entradas", "BEFORE", "UPDATE", `
    BEGIN
      IF NEW.quantidade <= 0 OR NEW.valor_unitario < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantidade deve ser positiva e valor não negativo';
      END IF;
    END
  `);
  await replaceTrigger(connection, "trg_entrada_stock_ai", "entradas", "AFTER", "INSERT", `
    BEGIN
      INSERT INTO estoque (id_produto, quantidade)
      VALUES (NEW.id_produto, NEW.quantidade)
      ON DUPLICATE KEY UPDATE quantidade = quantidade + NEW.quantidade;
    END
  `);
  await replaceTrigger(connection, "trg_entrada_stock_au", "entradas", "AFTER", "UPDATE", `
    BEGIN
      IF OLD.id_produto = NEW.id_produto THEN
        UPDATE estoque
        SET quantidade = quantidade - OLD.quantidade + NEW.quantidade
        WHERE id_produto = NEW.id_produto;
      ELSE
        UPDATE estoque SET quantidade = quantidade - OLD.quantidade
        WHERE id_produto = OLD.id_produto;
        INSERT INTO estoque (id_produto, quantidade)
        VALUES (NEW.id_produto, NEW.quantidade)
        ON DUPLICATE KEY UPDATE quantidade = quantidade + NEW.quantidade;
      END IF;
    END
  `);
  await replaceTrigger(connection, "trg_entrada_stock_ad", "entradas", "AFTER", "DELETE", `
    BEGIN
      UPDATE estoque SET quantidade = quantidade - OLD.quantidade
      WHERE id_produto = OLD.id_produto;
    END
  `);

  await replaceTrigger(connection, "trg_saida_validate_bi", "saidas", "BEFORE", "INSERT", `
    BEGIN
      DECLARE available INT DEFAULT 0;
      DECLARE CONTINUE HANDLER FOR NOT FOUND SET available = 0;
      IF NEW.quantidade <= 0 OR NEW.valor_unitario < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantidade deve ser positiva e valor não negativo';
      END IF;
      SELECT quantidade INTO available FROM estoque
      WHERE id_produto = NEW.id_produto FOR UPDATE;
      IF available < NEW.quantidade THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Estoque insuficiente para esta saída';
      END IF;
    END
  `);
  await replaceTrigger(connection, "trg_saida_validate_bu", "saidas", "BEFORE", "UPDATE", `
    BEGIN
      DECLARE available INT DEFAULT 0;
      DECLARE CONTINUE HANDLER FOR NOT FOUND SET available = 0;
      IF NEW.quantidade <= 0 OR NEW.valor_unitario < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantidade deve ser positiva e valor não negativo';
      END IF;
      SELECT quantidade INTO available FROM estoque
      WHERE id_produto = NEW.id_produto FOR UPDATE;
      IF OLD.id_produto = NEW.id_produto THEN
        SET available = available + OLD.quantidade;
      END IF;
      IF available < NEW.quantidade THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Estoque insuficiente para esta saída';
      END IF;
    END
  `);
  await replaceTrigger(connection, "trg_saida_stock_ai", "saidas", "AFTER", "INSERT", `
    BEGIN
      UPDATE estoque SET quantidade = quantidade - NEW.quantidade
      WHERE id_produto = NEW.id_produto;
    END
  `);
  await replaceTrigger(connection, "trg_saida_stock_au", "saidas", "AFTER", "UPDATE", `
    BEGIN
      IF OLD.id_produto = NEW.id_produto THEN
        UPDATE estoque
        SET quantidade = quantidade + OLD.quantidade - NEW.quantidade
        WHERE id_produto = NEW.id_produto;
      ELSE
        UPDATE estoque SET quantidade = quantidade + OLD.quantidade
        WHERE id_produto = OLD.id_produto;
        UPDATE estoque SET quantidade = quantidade - NEW.quantidade
        WHERE id_produto = NEW.id_produto;
      END IF;
    END
  `);
  await replaceTrigger(connection, "trg_saida_stock_ad", "saidas", "AFTER", "DELETE", `
    BEGIN
      UPDATE estoque SET quantidade = quantidade + OLD.quantidade
      WHERE id_produto = OLD.id_produto;
    END
  `);

  await replaceTrigger(connection, "trg_pedido_itens_subtotal_bi", "pedido_itens", "BEFORE", "INSERT", `
    BEGIN
      IF NEW.quantidade IS NULL OR NEW.quantidade <= 0 OR NEW.valor_unitario IS NULL OR NEW.valor_unitario < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantidade deve ser positiva e valor não negativo';
      END IF;
      SET NEW.subtotal = ROUND(NEW.quantidade * NEW.valor_unitario, 2);
    END
  `);
  await replaceTrigger(connection, "trg_pedido_itens_subtotal_bu", "pedido_itens", "BEFORE", "UPDATE", `
    BEGIN
      IF NEW.quantidade IS NULL OR NEW.quantidade <= 0 OR NEW.valor_unitario IS NULL OR NEW.valor_unitario < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantidade deve ser positiva e valor não negativo';
      END IF;
      SET NEW.subtotal = ROUND(NEW.quantidade * NEW.valor_unitario, 2);
    END
  `);
}

async function verifyInventoryTriggers(connection) {
  const products = await query(
    connection,
    `SELECT e.id_produto, e.quantidade FROM estoque e
      WHERE e.id_produto IN (1, 2) ORDER BY e.id_produto`
  );
  const supplier = await query(connection, "SELECT id_fornecedor FROM fornecedores ORDER BY id_fornecedor LIMIT 1");
  const employee = await query(connection, "SELECT id_funcionario FROM funcionarios ORDER BY id_funcionario LIMIT 1");
  if (products.length !== 2 || !supplier.length || !employee.length || products[0].quantidade < 3) {
    throw new Error("Não há dados suficientes para testar as triggers de estoque com segurança.");
  }
  const [first, second] = products;
  await query(connection, "START TRANSACTION");
  try {
    const entry = await query(
      connection,
      "INSERT INTO entradas (id_produto, id_fornecedor, quantidade, valor_unitario) VALUES (?, ?, 2, 0)",
      [first.id_produto, supplier[0].id_fornecedor]
    );
    await assertStock(connection, first.id_produto, first.quantidade + 2);
    await query(connection, "UPDATE entradas SET quantidade = 3 WHERE id_entrada = ?", [entry.insertId]);
    await assertStock(connection, first.id_produto, first.quantidade + 3);
    await query(
      connection,
      "UPDATE entradas SET id_produto = ? WHERE id_entrada = ?",
      [second.id_produto, entry.insertId]
    );
    await assertStock(connection, first.id_produto, first.quantidade);
    await assertStock(connection, second.id_produto, second.quantidade + 3);
    await query(connection, "DELETE FROM entradas WHERE id_entrada = ?", [entry.insertId]);
    await assertStock(connection, second.id_produto, second.quantidade);

    const exit = await query(
      connection,
      "INSERT INTO saidas (id_produto, id_funcionario, quantidade, valor_unitario) VALUES (?, ?, 1, 0)",
      [first.id_produto, employee[0].id_funcionario]
    );
    await assertStock(connection, first.id_produto, first.quantidade - 1);
    await query(connection, "UPDATE saidas SET quantidade = 2 WHERE id_saida = ?", [exit.insertId]);
    await assertStock(connection, first.id_produto, first.quantidade - 2);
    await query(
      connection,
      "UPDATE saidas SET id_produto = ? WHERE id_saida = ?",
      [second.id_produto, exit.insertId]
    );
    await assertStock(connection, first.id_produto, first.quantidade);
    await assertStock(connection, second.id_produto, second.quantidade - 2);
    await query(connection, "DELETE FROM saidas WHERE id_saida = ?", [exit.insertId]);
    await assertStock(connection, second.id_produto, second.quantidade);

    let rejectedOversell = false;
    try {
      await query(
        connection,
        `INSERT INTO saidas (id_produto, id_funcionario, quantidade, valor_unitario)
          VALUES (?, ?, ?, 0)`,
        [first.id_produto, employee[0].id_funcionario, first.quantidade + 1]
      );
    } catch (error) {
      if (!["ER_SIGNAL_EXCEPTION", "ER_CHECK_CONSTRAINT_VIOLATED"].includes(error.code)) throw error;
      rejectedOversell = true;
    }
    if (!rejectedOversell) throw new Error("A trigger permitiu uma saída maior que o estoque disponível.");
    console.log("Teste transacional das triggers de estoque: aprovado.");
  } finally {
    await query(connection, "ROLLBACK");
  }
}

async function assertStock(connection, productId, expected) {
  const rows = await query(connection, "SELECT quantidade FROM estoque WHERE id_produto = ?", [productId]);
  if (!rows.length || Number(rows[0].quantidade) !== Number(expected)) {
    throw new Error(`Falha na validação do estoque do produto ${productId}.`);
  }
}

async function applyMigration(connection) {
  const counts = await query(connection, "SELECT COUNT(*) AS total FROM usuarios");
  if (!counts[0].total) throw new Error("A tabela usuarios está vazia; estado inesperado.");

  await createBackup(connection);
  console.log(`Backup privado criado em: ${backupPath}`);

  await query(connection, "START TRANSACTION");
  try {
    await normalizeCategories(connection);
    await consolidateStock(connection);
    await query(
      connection,
      `UPDATE pedido_itens
        SET subtotal = ROUND(quantidade * valor_unitario, 2)
        WHERE subtotal IS NULL OR subtotal <> ROUND(quantidade * valor_unitario, 2)`
    );
    await migratePasswords(connection);
    await query(connection, "COMMIT");
  } catch (error) {
    await query(connection, "ROLLBACK");
    throw error;
  }

  if (await hasIndex(connection, "entradas", "id_produto")) {
    await query(connection, "ALTER TABLE entradas DROP INDEX id_produto");
  }
  if (await hasIndex(connection, "saidas", "id_produto")) {
    await query(connection, "ALTER TABLE saidas DROP INDEX id_produto");
  }
  if (await hasIndex(connection, "clientes", "uk_cliente_email")) {
    await query(connection, "ALTER TABLE clientes DROP INDEX uk_cliente_email");
  }

  if (!(await hasIndex(connection, "estoque", "uq_estoque_produto"))) {
    await query(connection, "ALTER TABLE estoque ADD UNIQUE KEY uq_estoque_produto (id_produto)");
  }

  await ensureCheck(connection, "estoque", "chk_estoque_quantidade", "quantidade >= 0");
  await ensureCheck(connection, "entradas", "chk_entradas_quantidade", "quantidade > 0 AND valor_unitario >= 0");
  await ensureCheck(connection, "saidas", "chk_saidas_quantidade", "quantidade > 0 AND valor_unitario >= 0");
  await ensureCheck(connection, "pedido_itens", "chk_pedido_itens_quantidade", "quantidade > 0 AND valor_unitario >= 0");
  await query(
    connection,
    `ALTER TABLE pedido_itens
      MODIFY quantidade INT NOT NULL,
      MODIFY valor_unitario DECIMAL(10,2) NOT NULL,
      MODIFY subtotal DECIMAL(10,2) NOT NULL`
  );
  await migrateTriggers(connection);
  await verifyInventoryTriggers(connection);

  const verification = await query(connection, `
    SELECT
      (SELECT COUNT(*) FROM (SELECT id_produto FROM estoque GROUP BY id_produto HAVING COUNT(*) > 1) duplicates) AS duplicate_stock,
      (SELECT COUNT(*) FROM produtos WHERE id_categoria IS NULL) AS uncategorized_products,
      (SELECT COUNT(*) FROM pedido_itens WHERE subtotal IS NULL OR subtotal <> ROUND(quantidade * valor_unitario, 2)) AS invalid_subtotals,
      (SELECT COUNT(*) FROM usuarios WHERE senha NOT REGEXP '^\\\\$2[aby]\\\\$[0-9]{2}\\\\$') AS unhashed_passwords
  `);
  console.log("Migração aplicada; verificações finais: " + JSON.stringify(verification[0]));
}

async function main() {
  if (!process.argv.includes("--apply")) {
    throw new Error("Confirme a execução com o argumento --apply.");
  }
  const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: "utf8mb4",
    supportBigNumbers: true
  });
  await new Promise((resolve, reject) => connection.connect(error => error ? reject(error) : resolve()));
  try {
    await applyMigration(connection);
  } finally {
    connection.end();
  }
}

main().catch(error => {
  console.error("Migração não concluída:", error.code || error.message);
  process.exitCode = 1;
});
