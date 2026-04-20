import { query } from "../database/sqlite.js";

const TABLE = "navios";

const criarTabela = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    [],
    "run"
  );
};

criarTabela().catch((err) =>
  console.error("Erro ao verificar tabela navios:", err)
);

const Listar = () =>
  query(`SELECT * FROM ${TABLE} ORDER BY nome ASC`, [], "all");

const BuscarPorId = (id) =>
  query(`SELECT * FROM ${TABLE} WHERE id = ? LIMIT 1`, [id], "get");

const Criar = async ({ nome }) => {
  const result = await query(
    `INSERT OR IGNORE INTO ${TABLE} (nome) VALUES (?)`,
    [String(nome).trim().toUpperCase()],
    "run"
  );
  return BuscarPorId(result.lastID);
};

const Deletar = async (id) => {
  await query(`DELETE FROM ${TABLE} WHERE id = ?`, [id], "run");
  return { ok: true };
};

export default { Listar, BuscarPorId, Criar, Deletar };
