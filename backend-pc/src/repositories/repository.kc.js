// backend/src/repositories/repository.kc.js
import { query } from "../database/sqlite.js";

// ========== CRIAR TABELA SE NÃO EXISTIR ==========
const criarTabela = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS kc_talhao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fazenda TEXT,
      talhao TEXT NOT NULL,
      data TEXT NOT NULL,
      kc REAL,
      eto REAL,
      precipitacao REAL,
      usuario TEXT,
      cargo TEXT,
      matricula TEXT,
      momento TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await query(sql, [], 'run');
};

criarTabela().catch(err => console.error('Erro ao criar tabela kc_talhao:', err));

// ========== INSERIR / ATUALIZAR KC (upsert por fazenda+talhao+data) ==========
const Inserir = async (data) => {
  try {
    const kc           = data.kc           !== undefined && data.kc           !== null ? data.kc           : null;
    const eto          = data.eto          !== undefined && data.eto          !== null ? data.eto          : null;
    const precipitacao = data.precipitacao !== undefined && data.precipitacao !== null ? data.precipitacao : null;

    // Verifica se já existe registro para mesma fazenda + talhão + data
    const existing = await query(
      `SELECT id FROM kc_talhao WHERE fazenda = ? AND talhao = ? AND data = ?`,
      [data.fazenda || null, data.talhao, data.data],
      'get'
    );

    if (existing) {
      // Atualiza o registro existente
      await query(
        `UPDATE kc_talhao SET kc=?, eto=?, precipitacao=?, usuario=?, cargo=?, matricula=?, momento=? WHERE id=?`,
        [kc, eto, precipitacao, data.usuario || null, data.cargo || null, data.matricula || null, data.momento || null, existing.id],
        'run'
      );
      console.log(`🔄 KC atualizado (id=${existing.id}, talhao=${data.talhao}, data=${data.data})`);
      return { id: existing.id, success: true, action: 'updated' };
    }

    // Insere novo registro
    const result = await query(
      `INSERT INTO kc_talhao (fazenda, talhao, data, kc, eto, precipitacao, usuario, cargo, matricula, momento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.fazenda || null, data.talhao, data.data, kc, eto, precipitacao,
       data.usuario || null, data.cargo || null, data.matricula || null, data.momento || null],
      'run'
    );
    console.log(`✅ KC inserido (id=${result.lastID}, talhao=${data.talhao}, data=${data.data})`);
    return { id: result.lastID, success: true, action: 'inserted' };
  } catch (error) {
    console.error('❌ Repository KC: Erro ao inserir/atualizar:', error);
    throw error;
  }
};

// ========== INSERIR BATCH ==========
const InserirBatch = async (registros) => {
  try {
    const resultados = [];
    for (const registro of registros) {
      try {
        const resultado = await Inserir(registro);
        resultados.push({ success: true, id: resultado.id });
      } catch (error) {
        resultados.push({ success: false, error: error.message });
      }
    }
    const sucessos = resultados.filter(r => r.success).length;
    const falhas = resultados.filter(r => !r.success).length;
    return { total: registros.length, sucessos, falhas, resultados };
  } catch (error) {
    console.error('❌ Repository KC: Erro no batch:', error);
    throw error;
  }
};

// ========== LISTAR ==========
const Listar = async (filtros = {}) => {
  try {
    let sql = `SELECT * FROM kc_talhao WHERE 1=1`;
    const params = [];

    if (filtros.fazenda) { sql += ` AND fazenda = ?`; params.push(filtros.fazenda); }
    if (filtros.talhao) { sql += ` AND talhao = ?`; params.push(filtros.talhao); }
    if (filtros.dataInicio) { sql += ` AND data >= ?`; params.push(filtros.dataInicio); }
    if (filtros.dataFim) { sql += ` AND data <= ?`; params.push(filtros.dataFim); }

    sql += ` ORDER BY data DESC, created_at DESC`;

    if (filtros.limit) { sql += ` LIMIT ?`; params.push(parseInt(filtros.limit)); }

    const result = await query(sql, params, 'all');
    return result;
  } catch (error) {
    console.error('❌ Repository KC: Erro ao listar:', error);
    throw error;
  }
};

export default { Inserir, InserirBatch, Listar };
