const pool = require("../mysql").pool;

function runQuery(executor, sql, params = []) {
  return new Promise((resolve, reject) => {
    executor.query(sql, params, (error, results) => {
      if (error) {
        if (["ER_DUP_ENTRY", "ER_ROW_IS_REFERENCED_2", "ER_SIGNAL_EXCEPTION", "ER_CHECK_CONSTRAINT_VIOLATED"].includes(error.code)) {
          error.status = 409;
        } else if (error.code === "ER_NO_REFERENCED_ROW_2") {
          error.status = 400;
        }
        reject(error);
        return;
      }
      resolve(results);
    });
  });
}

function getConnection() {
  return new Promise((resolve, reject) => {
    pool.getConnection((error, connection) => {
      if (error) return reject(error);
      resolve(connection);
    });
  });
}

function query(sql, params = []) {
  return runQuery(pool, sql, params);
}

function queryOn(connection, sql, params = []) {
  return runQuery(connection, sql, params);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isNumeric(value) {
  return (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
}

function isPositiveInteger(value) {
  return isNumeric(value) && Number.isInteger(Number(value)) && Number(value) > 0;
}

function isNonNegativeInteger(value) {
  return isNumeric(value) && Number.isInteger(Number(value)) && Number(value) >= 0;
}

async function ensureUpdated(result, table, idColumn, id, message) {
  if (result.affectedRows) return;
  const rows = await query(`SELECT 1 FROM ${table} WHERE ${idColumn} = ?`, [id]);
  if (!rows.length) throw httpError(404, message);
}

module.exports = {
  query,
  queryOn,
  getConnection,
  httpError,
  ensureUpdated,
  isNumeric,
  isPositiveInteger,
  isNonNegativeInteger
};