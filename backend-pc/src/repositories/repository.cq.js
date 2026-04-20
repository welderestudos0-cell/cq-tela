import { query } from "../database/sqlite.js";

const criarTabela = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS controle_qualidade (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto TEXT NOT NULL,
      lote TEXT NOT NULL,
      responsavel TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Aprovado', 'Reprovado', 'Em Análise')),
      observacoes TEXT,
      foto_path TEXT,
      data_criacao TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      sincronizado INTEGER DEFAULT 0
    )
  `;

  await query(sql, [], "run");
  console.log("Tabela controle_qualidade verificada/criada");
};

const Inserir = async (data) => {
  const { produto, lote, responsavel, status, observacoes, foto_path, data_criacao } = data;

  if (!produto || !lote || !responsavel || !status) {
    throw new Error("Campos obrigatorios: produto, lote, responsavel, status");
  }

  const sql = `
    INSERT INTO controle_qualidade (
      produto, lote, responsavel, status, observacoes, foto_path, data_criacao
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    produto,
    lote,
    responsavel,
    status,
    observacoes || null,
    foto_path || null,
    data_criacao || new Date().toISOString(),
  ];

  const resultado = await query(sql, params, "run");
  return { id: resultado.lastID };
};

const Listar = async (filtros = {}) => {
  let sql = `SELECT * FROM controle_qualidade WHERE 1=1`;
  const params = [];

  if (filtros.status) {
    sql += ` AND status = ?`;
    params.push(filtros.status);
  }

  if (filtros.responsavel) {
    sql += ` AND responsavel LIKE ?`;
    params.push(`%${filtros.responsavel}%`);
  }

  if (filtros.dataInicio) {
    sql += ` AND data_criacao >= ?`;
    params.push(filtros.dataInicio);
  }

  if (filtros.dataFim) {
    sql += ` AND data_criacao <= ?`;
    params.push(filtros.dataFim);
  }

  if (filtros.hoje === "true" || filtros.hoje === true) {
    sql += ` AND date(data_criacao) = date('now', 'localtime')`;
  }

  sql += ` ORDER BY data_criacao DESC`;

  if (filtros.limit) {
    sql += ` LIMIT ?`;
    params.push(Number(filtros.limit));
  }

  return await query(sql, params, "all");
};

const BuscarPorId = async (id) => {
  const sql = `SELECT * FROM controle_qualidade WHERE id = ?`;
  const resultado = await query(sql, [id], "get");
  return resultado || null;
};

const Deletar = async (id) => {
  const sql = `DELETE FROM controle_qualidade WHERE id = ?`;
  const resultado = await query(sql, [id], "run");
  return { success: resultado.changes > 0 };
};

const BuscarHoje = async () => {
  const sql = `
    SELECT * FROM controle_qualidade
    WHERE date(data_criacao) = date('now', 'localtime')
    ORDER BY data_criacao ASC
  `;

  return await query(sql, [], "all");
};

criarTabela().catch((error) => {
  console.error("Erro ao criar tabela controle_qualidade:", error);
});

export default {
  Inserir,
  Listar,
  BuscarPorId,
  Deletar,
  BuscarHoje,
};
