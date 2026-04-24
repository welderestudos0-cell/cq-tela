import { query } from "../database/sqlite.js";

const TABLE_NAME = "maturacao_forcada_catalogo";
const SEED_ROWS = [];

const cleanText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text.length ? text : null;
};

const ensureTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comprador TEXT NOT NULL,
      produtor TEXT NOT NULL,
      parcela TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `, [], 'run');

  const countRow = await query(`SELECT COUNT(*) AS total FROM ${TABLE_NAME}`, [], 'get');
  if (countRow && Number(countRow.total) > 0) {
    return;
  }

  for (const row of SEED_ROWS) {
    await query(
      `INSERT INTO ${TABLE_NAME} (comprador, produtor, parcela) VALUES (?, ?, ?)` ,
      [cleanText(row.comprador), cleanText(row.produtor), cleanText(row.parcela)],
      'run'
    );
  }
};

ensureTable().catch((error) => {
  console.error('Erro ao criar/seedar tabela maturacao_forcada_catalogo:', error);
});

const Listar = async (filtros = {}) => {
  let sql = `
    SELECT DISTINCT comprador, produtor, parcela
    FROM ${TABLE_NAME}
    WHERE 1=1
  `;
  const params = [];

  if (filtros.comprador) {
    sql += ` AND comprador = ?`;
    params.push(cleanText(filtros.comprador));
  }

  if (filtros.produtor) {
    sql += ` AND produtor = ?`;
    params.push(cleanText(filtros.produtor));
  }

  if (filtros.parcela) {
    sql += ` AND parcela = ?`;
    params.push(cleanText(filtros.parcela));
  }

  sql += ` ORDER BY comprador, produtor, parcela`;

  if (filtros.limit) {
    const limit = parseInt(filtros.limit, 10);
    if (Number.isFinite(limit)) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }
  }

  return await query(sql, params, 'all');
};

const ListarCompradores = async () => {
  return await query(
    `SELECT DISTINCT comprador FROM ${TABLE_NAME} WHERE comprador IS NOT NULL AND comprador != '' ORDER BY comprador`,
    [],
    'all'
  );
};

const ListarProdutores = async (comprador = null) => {
  let sql = `
    SELECT DISTINCT produtor
    FROM ${TABLE_NAME}
    WHERE produtor IS NOT NULL AND produtor != ''
  `;
  const params = [];

  if (comprador) {
    sql += ` AND comprador = ?`;
    params.push(cleanText(comprador));
  }

  sql += ` ORDER BY produtor`;
  return await query(sql, params, 'all');
};

const ListarParcelas = async ({ comprador = null, produtor = null } = {}) => {
  let sql = `
    SELECT DISTINCT parcela
    FROM ${TABLE_NAME}
    WHERE parcela IS NOT NULL AND parcela != ''
  `;
  const params = [];

  if (comprador) {
    sql += ` AND comprador = ?`;
    params.push(cleanText(comprador));
  }

  if (produtor) {
    sql += ` AND produtor = ?`;
    params.push(cleanText(produtor));
  }

  sql += ` ORDER BY parcela`;
  return await query(sql, params, 'all');
};

export default {
  Listar,
  ListarCompradores,
  ListarProdutores,
  ListarParcelas,
};
