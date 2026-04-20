import { query } from "../database/sqlite.js";

const TABLE = "manga_fotos";

const criarTabela = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      controle TEXT NOT NULL,
      campo TEXT NOT NULL,
      url TEXT NOT NULL,
      nome_arquivo TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    [],
    "run"
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_manga_fotos_controle ON ${TABLE}(controle)`,
    [],
    "run"
  );
};

criarTabela().catch((err) =>
  console.error("Erro ao inicializar tabela manga_fotos:", err)
);

// Insere uma foto para um controle/campo
const Inserir = async ({ controle, campo, url, nome_arquivo }) => {
  const result = await query(
    `INSERT INTO ${TABLE} (controle, campo, url, nome_arquivo) VALUES (?, ?, ?, ?)`,
    [String(controle), String(campo), String(url), nome_arquivo || null],
    "run"
  );
  return { id: result.lastID };
};

// Busca todas as fotos de um controle, agrupadas por campo
const BuscarPorControle = async (controle) => {
  const rows = await query(
    `SELECT * FROM ${TABLE} WHERE controle = ? ORDER BY campo, created_at ASC`,
    [String(controle)],
    "all"
  );
  // Agrupa por campo
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.campo]) grouped[row.campo] = [];
    grouped[row.campo].push({ id: row.id, url: row.url, nome_arquivo: row.nome_arquivo });
  }
  return grouped;
};

// Verifica se existe ao menos uma foto para um controle/campo específico
const TemFotos = async (controle, campo) => {
  const row = await query(
    `SELECT COUNT(*) as total FROM ${TABLE} WHERE controle = ? AND campo = ?`,
    [String(controle), String(campo)],
    "get"
  );
  return row.total > 0;
};

// Resumo: quantas fotos por campo para um controle
const ResumoPorControle = async (controle) => {
  const rows = await query(
    `SELECT campo, COUNT(*) as total FROM ${TABLE} WHERE controle = ? GROUP BY campo`,
    [String(controle)],
    "all"
  );
  const resumo = {};
  for (const row of rows) resumo[row.campo] = row.total;
  return resumo;
};

export default { Inserir, BuscarPorControle, TemFotos, ResumoPorControle };
