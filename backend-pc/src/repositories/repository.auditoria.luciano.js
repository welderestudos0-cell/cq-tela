// backend/src/repositories/repository.auditoria.luciano.js
import { query } from "../database/sqlite.js";

const criarTabela = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS AUDITORIA_LUCIANO (
        ID          INTEGER PRIMARY KEY AUTOINCREMENT,
        FORM_ID     TEXT,
        MOMENTO     TEXT,
        DATA        TEXT,
        FAZENDA     TEXT,
        USUARIO     TEXT,
        MATRICULA   TEXT,
        PERGUNTA_ID INTEGER,
        PERGUNTA    TEXT,
        STATUS      TEXT,
        OBSERVACAO  TEXT,
        CREATED_AT  TEXT DEFAULT (datetime('now'))
      )
    `, [], 'run');
  } catch (e) { /* já existe */ }

  // Migrações seguras de colunas
  try {
    const cols = await query(`PRAGMA table_info(AUDITORIA_LUCIANO)`, [], 'all');
    const nomes = cols.map(c => c.name);
    if (!nomes.includes('FORM_ID')) {
      await query(`ALTER TABLE AUDITORIA_LUCIANO ADD COLUMN FORM_ID TEXT`, [], 'run');
    }
    if (!nomes.includes('FOTO_URL')) {
      await query(`ALTER TABLE AUDITORIA_LUCIANO ADD COLUMN FOTO_URL TEXT`, [], 'run');
    }
  } catch (e) { /* ignora */ }
};

criarTabela().catch(() => {});

// ========== INSERIR ==========
const Inserir = async ({ form_id, momento, data, fazenda, usuario, matricula, checklist }) => {
  const sql = `
    INSERT INTO AUDITORIA_LUCIANO
      (FORM_ID, MOMENTO, DATA, FAZENDA, USUARIO, MATRICULA, PERGUNTA_ID, PERGUNTA, STATUS, OBSERVACAO)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  let lastID = null;
  for (const item of checklist) {
    const result = await query(sql, [
      form_id || null,
      momento,
      data,
      fazenda,
      usuario,
      matricula || 'Nao informada',
      item.pergunta_id || null,
      item.pergunta || '',
      item.status || '',
      item.observacao || '',
    ], 'run');
    if (!lastID) lastID = result.lastID;
  }

  return { id: lastID };
};

// ========== ATUALIZAR FOTO_URL ==========
const AtualizarFotoUrl = async (form_id, pergunta_id, foto_url) => {
  await query(
    `UPDATE AUDITORIA_LUCIANO SET FOTO_URL = ? WHERE FORM_ID = ? AND PERGUNTA_ID = ?`,
    [foto_url, form_id, pergunta_id],
    'run'
  );
};

// ========== LISTAR ==========
const Listar = async () => {
  return await query(`SELECT * FROM AUDITORIA_LUCIANO ORDER BY CREATED_AT DESC, PERGUNTA_ID ASC`, [], 'all');
};

// ========== BUSCAR POR DATA/FAZENDA ==========
const BuscarPorId = async (id) => {
  const rows = await query(`SELECT * FROM AUDITORIA_LUCIANO WHERE ID = ?`, [id], 'all');
  return rows.length ? rows[0] : null;
};

// ========== ATUALIZAR PERGUNTA (status + observacao) ==========
const AtualizarPergunta = async (form_id, pergunta_id, status, observacao) => {
  return await query(
    `UPDATE AUDITORIA_LUCIANO SET STATUS = ?, OBSERVACAO = ? WHERE FORM_ID = ? AND PERGUNTA_ID = ?`,
    [status, observacao, form_id, pergunta_id],
    'run'
  );
};

// ========== DELETAR POR FORM_ID ==========
const DeletarPorFormId = async (form_id) => {
  return await query(
    `DELETE FROM AUDITORIA_LUCIANO WHERE FORM_ID = ?`,
    [form_id],
    'run'
  );
};

// ========== REMOVER FOTO ==========
const RemoverFotoUrl = async (form_id, pergunta_id) => {
  return await query(
    `UPDATE AUDITORIA_LUCIANO SET FOTO_URL = NULL WHERE FORM_ID = ? AND PERGUNTA_ID = ?`,
    [form_id, pergunta_id],
    'run'
  );
};

export default { Inserir, Listar, BuscarPorId, AtualizarFotoUrl, AtualizarPergunta, DeletarPorFormId, RemoverFotoUrl };
