import { query } from "../database/sqlite.js";

const TABLE = "clientes_paises";

const criarTabela = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      pais TEXT NOT NULL
    )`,
    [],
    "run"
  );
};

criarTabela().catch((err) =>
  console.error("Erro ao verificar tabela clientes_paises:", err)
);

const Listar = () =>
  query(`SELECT * FROM ${TABLE} ORDER BY cliente ASC`, [], "all");

const BuscarPorId = (id) =>
  query(`SELECT * FROM ${TABLE} WHERE id = ? LIMIT 1`, [id], "get");

const Criar = async ({ cliente, pais }) => {
  const result = await query(
    `INSERT INTO ${TABLE} (cliente, pais) VALUES (?, ?)`,
    [String(cliente).trim(), String(pais).trim()],
    "run"
  );
  return BuscarPorId(result.lastID);
};

const Atualizar = async (id, { cliente, pais }) => {
  await query(
    `UPDATE ${TABLE} SET cliente = ?, pais = ? WHERE id = ?`,
    [String(cliente).trim(), String(pais).trim(), id],
    "run"
  );
  return BuscarPorId(id);
};

const Deletar = async (id) => {
  await query(`DELETE FROM ${TABLE} WHERE id = ?`, [id], "run");
  return { ok: true };
};

export default { Listar, BuscarPorId, Criar, Atualizar, Deletar };
