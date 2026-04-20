import { query } from "../database/sqlite.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tabela: maturacao_firmeza
// Registro fotográfico por variedade na aba Maturação do Relatório de Embarque.
// Cada linha = uma variedade de manga em um embarque específico.
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = "maturacao_firmeza";

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    fazenda               TEXT,
    variedade             TEXT,
    controle              INTEGER,
    foto_aparencia        TEXT,
    foto_temperatura_polpa TEXT,
    foto_maturacao        TEXT,
    foto_firmeza          TEXT,
    created_at            TEXT DEFAULT (datetime('now')),
    updated_at            TEXT DEFAULT (datetime('now'))
  )
`;

await query(CREATE_SQL, [], "run").catch((e) =>
  console.error("[maturacao_firmeza] Erro ao criar tabela:", e.message)
);

const Inserir = (dados) =>
  query(
    `INSERT INTO ${TABLE}
       (fazenda, variedade, controle, foto_aparencia, foto_temperatura_polpa, foto_maturacao, foto_firmeza)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      dados.fazenda,
      dados.variedade,
      dados.controle ?? null,
      dados.foto_aparencia ?? null,
      dados.foto_temperatura_polpa ?? null,
      dados.foto_maturacao ?? null,
      dados.foto_firmeza ?? null,
    ],
    "run"
  );

const Atualizar = (id, dados) =>
  query(
    `UPDATE ${TABLE} SET
       fazenda=?, variedade=?, controle=?,
       foto_aparencia=?, foto_temperatura_polpa=?, foto_maturacao=?, foto_firmeza=?,
       updated_at=datetime('now')
     WHERE id=?`,
    [
      dados.fazenda,
      dados.variedade,
      dados.controle ?? null,
      dados.foto_aparencia ?? null,
      dados.foto_temperatura_polpa ?? null,
      dados.foto_maturacao ?? null,
      dados.foto_firmeza ?? null,
      id,
    ],
    "run"
  );

const Listar = () =>
  query(`SELECT * FROM ${TABLE} ORDER BY created_at DESC`, [], "all");

const BuscarPorVariedade = (variedade, fazenda) =>
  query(
    `SELECT * FROM ${TABLE} WHERE variedade = ? AND fazenda = ? ORDER BY created_at DESC`,
    [variedade, fazenda],
    "all"
  );

const BuscarPorControle = (controle) =>
  query(`SELECT * FROM ${TABLE} WHERE controle = ?`, [controle], "get");

export default { Inserir, Atualizar, Listar, BuscarPorVariedade, BuscarPorControle };
