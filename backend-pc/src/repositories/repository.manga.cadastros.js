import { query } from "../database/sqlite.js";

const TABLE = "manga_cadastros";

const criarTabela = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      fazenda TEXT NOT NULL,
      variedade TEXT NOT NULL,
      controle TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    [],
    "run"
  );
};

criarTabela().catch((err) =>
  console.error("Erro ao inicializar tabela manga_cadastros:", err)
);

const Listar = async () => {
  const rows = await query(
    `SELECT * FROM ${TABLE} ORDER BY created_at DESC`,
    [],
    "all"
  );
  return rows;
};

const Criar = async ({ id, fazenda, variedade, controle }) => {
  await query(
    `INSERT OR IGNORE INTO ${TABLE} (id, fazenda, variedade, controle) VALUES (?, ?, ?, ?)`,
    [String(id), String(fazenda), String(variedade), String(controle)],
    "run"
  );
  return { id };
};

const Deletar = async (id) => {
  await query(`DELETE FROM ${TABLE} WHERE id = ?`, [String(id)], "run");
  return { ok: true };
};

export default { Listar, Criar, Deletar };
