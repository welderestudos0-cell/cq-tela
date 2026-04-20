import { query } from "../database/sqlite.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tabela: priorizacao
// Um registro por carregamento (OC). Agrupa os pallets e o checklist.
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = "priorizacao";

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    oc          INTEGER NOT NULL,
    safra       TEXT,
    apelido     TEXT,
    container   TEXT,
    data_saida  TEXT,
    motorista   TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  )
`;

await query(CREATE_SQL, [], "run").catch((e) =>
  console.error("[priorizacao] Erro ao criar tabela:", e.message)
);

const Inserir = (dados) =>
  query(
    `INSERT INTO ${TABLE} (oc, safra, apelido, container, data_saida, motorista)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [dados.oc, dados.safra, dados.apelido, dados.container, dados.data_saida, dados.motorista],
    "run"
  );

const BuscarPorOC = (oc) =>
  query(`SELECT * FROM ${TABLE} WHERE oc = ? ORDER BY created_at DESC LIMIT 1`, [oc], "get");

const Listar = () =>
  query(`SELECT * FROM ${TABLE} ORDER BY created_at DESC`, [], "all");

const Atualizar = (id, dados) =>
  query(
    `UPDATE ${TABLE} SET safra=?, apelido=?, container=?, data_saida=?, motorista=?, updated_at=datetime('now') WHERE id=?`,
    [dados.safra, dados.apelido, dados.container, dados.data_saida, dados.motorista, id],
    "run"
  );

export default { Inserir, BuscarPorOC, Listar, Atualizar };
