// src/repositories/repository.versao.js
import { query } from "../database/sqlite.js";

// ========== CRIAR TABELA SE NÃO EXISTIR ==========
const inicializarTabela = async () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS VERSAO_APP (
            ID          INTEGER PRIMARY KEY AUTOINCREMENT,
            versao      VARCHAR(20) NOT NULL,
            mensagem    TEXT,
            obrigatorio INTEGER DEFAULT 0,
            ativo       INTEGER DEFAULT 1,
            criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `;
    await query(sql, [], "run");
    console.log("✅ Tabela VERSAO_APP verificada/criada");
};

// ========== BUSCAR VERSÃO ATIVA MAIS RECENTE ==========
const BuscarVersaoAtiva = async () => {
    const sql = `
        SELECT id, versao, mensagem, obrigatorio, ativo, criado_em
        FROM VERSAO_APP
        WHERE ativo = 1
        ORDER BY id DESC
        LIMIT 1
    `;
    const result = await query(sql, [], "get");
    return result || null;
};

// ========== INSERIR NOVA VERSÃO ==========
const Inserir = async ({ versao, mensagem, obrigatorio }) => {
    // Desativar versões anteriores
    await query(`UPDATE VERSAO_APP SET ativo = 0`, [], "run");

    const sql = `
        INSERT INTO VERSAO_APP (versao, mensagem, obrigatorio, ativo)
        VALUES (?, ?, ?, 1)
    `;
    const result = await query(sql, [versao, mensagem || null, obrigatorio ? 1 : 0], "run");
    return { id: result.lastID };
};

// ========== ATUALIZAR VERSÃO POR ID ==========
const Atualizar = async (id, { versao, mensagem, obrigatorio, ativo }) => {
    const sql = `
        UPDATE VERSAO_APP
        SET versao = ?, mensagem = ?, obrigatorio = ?, ativo = ?
        WHERE id = ?
    `;
    const result = await query(sql, [versao, mensagem || null, obrigatorio ? 1 : 0, ativo ? 1 : 0, id], "run");
    return { changes: result.changes };
};

export default { inicializarTabela, BuscarVersaoAtiva, Inserir, Atualizar };
