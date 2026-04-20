import { query } from "../database/sqlite.js";

const TABLE = "variedades";

const criarTabela = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE
    )`,
    [],
    "run"
  );
};

criarTabela().catch((err) =>
  console.error("Erro ao verificar tabela variedades:", err)
);

const Listar = () =>
  query(`SELECT * FROM ${TABLE} ORDER BY nome ASC`, [], "all");

const BuscarPorId = (id) =>
  query(`SELECT * FROM ${TABLE} WHERE id = ? LIMIT 1`, [id], "get");

const Criar = async ({ nome }) => {
  const result = await query(
    `INSERT INTO ${TABLE} (nome) VALUES (?)`,
    [String(nome).trim().toUpperCase()],
    "run"
  );
  return BuscarPorId(result.lastID);
};

const Atualizar = async (id, { nome }) => {
  await query(
    `UPDATE ${TABLE} SET nome = ? WHERE id = ?`,
    [String(nome).trim().toUpperCase(), id],
    "run"
  );
  return BuscarPorId(id);
};

const Deletar = async (id) => {
  await query(`DELETE FROM ${TABLE} WHERE id = ?`, [id], "run");
  return { ok: true };
};

export default { Listar, BuscarPorId, Criar, Atualizar, Deletar };
