import { query } from "../database/sqlite.js";

const TABLE = "atendentes";

const criarTabela = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      numero TEXT NOT NULL UNIQUE,
      ativo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    [],
    "run"
  );
};

criarTabela().catch((err) =>
  console.error("Erro ao criar tabela atendentes:", err)
);

const Listar = () =>
  query(`SELECT * FROM ${TABLE} WHERE ativo = 1 ORDER BY nome`, [], "all");

const BuscarPorNumero = (numero) =>
  query(`SELECT * FROM ${TABLE} WHERE numero = ? LIMIT 1`, [String(numero).replace(/\D/g, "")], "get");

const Salvar = async ({ nome, numero }) => {
  const nomeLimpo = String(nome || "").trim();
  const numeroLimpo = String(numero || "").replace(/\D/g, "");
  if (!nomeLimpo || !numeroLimpo) throw new Error("nome e numero sao obrigatorios");
  await query(
    `INSERT INTO ${TABLE} (nome, numero) VALUES (?, ?)
     ON CONFLICT(numero) DO UPDATE SET nome=excluded.nome, ativo=1`,
    [nomeLimpo, numeroLimpo],
    "run"
  );
  return BuscarPorNumero(numeroLimpo);
};

const Remover = async (numero) => {
  const numeroLimpo = String(numero || "").replace(/\D/g, "");
  await query(`UPDATE ${TABLE} SET ativo = 0 WHERE numero = ?`, [numeroLimpo], "run");
  return { ok: true };
};

export default { Listar, BuscarPorNumero, Salvar, Remover };
