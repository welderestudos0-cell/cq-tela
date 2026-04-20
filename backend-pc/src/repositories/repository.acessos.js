// backend/src/repositories/repository.acessos.js
import { query } from "../database/sqlite.js";

const formatDateTime = (value) => {
  const dateObj = value ? new Date(value) : new Date();
  if (Number.isNaN(dateObj.getTime())) {
    throw new Error("Data/hora invalida");
  }
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")} ${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}:${String(dateObj.getSeconds()).padStart(2, "0")}`;
};

// ========== INSERIR ACESSO ==========
const Inserir = async (data) => {
  try {
    console.log("Repository Acessos: Inserindo acesso:", data);

    const { usuario_id, status, sentido } = data;
    if (!usuario_id || !status) {
      throw new Error("usuario_id e status sao obrigatorios");
    }

    const dataCriacaoFormatada = formatDateTime(data.data_criacao);
    const dataConfirmacaoFormatada = data.data_confirmacao
      ? formatDateTime(data.data_confirmacao)
      : null;

    const sql = `
      INSERT INTO acessos (
        usuario_id,
        status,
        sentido,
        data_criacao,
        data_confirmacao
      )
      VALUES (?, ?, ?, ?, ?)
    `;

    const params = [
      usuario_id,
      status,
      sentido || null,
      dataCriacaoFormatada,
      dataConfirmacaoFormatada
    ];

    const result = await query(sql, params, "run");

    return {
      id: result.lastID,
      changes: result.changes,
      success: true
    };
  } catch (error) {
    console.error("Repository Acessos: Erro ao inserir acesso:", error);
    throw error;
  }
};

// ========== LISTAR ACESSOS ==========
const Listar = async (filtros = {}) => {
  try {
    let sql = `
      SELECT 
        id,
        usuario_id,
        status,
        sentido,
        data_criacao,
        data_confirmacao
      FROM acessos
      WHERE 1=1
    `;

    const params = [];

    if (filtros.usuario_id) {
      sql += " AND usuario_id = ?";
      params.push(filtros.usuario_id);
    }

    if (filtros.status) {
      sql += " AND status = ?";
      params.push(filtros.status);
    }

    if (filtros.sentido) {
      sql += " AND sentido = ?";
      params.push(filtros.sentido);
    }

    if (filtros.dataInicio) {
      sql += " AND data_criacao >= ?";
      params.push(filtros.dataInicio);
    }

    if (filtros.dataFim) {
      sql += " AND data_criacao <= ?";
      params.push(filtros.dataFim);
    }

    if (filtros.confirmacaoInicio) {
      sql += " AND data_confirmacao >= ?";
      params.push(filtros.confirmacaoInicio);
    }

    if (filtros.confirmacaoFim) {
      sql += " AND data_confirmacao <= ?";
      params.push(filtros.confirmacaoFim);
    }

    sql += " ORDER BY data_criacao DESC";

    if (filtros.limit) {
      sql += " LIMIT ?";
      params.push(parseInt(filtros.limit, 10));
    }

    const result = await query(sql, params, "all");

    return result;
  } catch (error) {
    console.error("Repository Acessos: Erro ao listar acessos:", error);
    throw error;
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (id) => {
  try {
    const sql = `
      SELECT 
        id,
        usuario_id,
        status,
        sentido,
        data_criacao,
        data_confirmacao
      FROM acessos
      WHERE id = ?
    `;

    const result = await query(sql, [id], "get");
    return result || null;
  } catch (error) {
    console.error("Repository Acessos: Erro ao buscar acesso por ID:", error);
    throw error;
  }
};

// ========== ATUALIZAR ACESSO ==========
const Atualizar = async (id, dadosAtualizacao) => {
  try {
    const campos = [];
    const params = [];

    if (dadosAtualizacao.usuario_id !== undefined) {
      campos.push("usuario_id = ?");
      params.push(dadosAtualizacao.usuario_id);
    }

    if (dadosAtualizacao.status !== undefined) {
      campos.push("status = ?");
      params.push(dadosAtualizacao.status);
    }

    if (dadosAtualizacao.sentido !== undefined) {
      campos.push("sentido = ?");
      params.push(dadosAtualizacao.sentido);
    }

    if (Object.prototype.hasOwnProperty.call(dadosAtualizacao, "data_confirmacao")) {
      const dataConfirmacaoFormatada = dadosAtualizacao.data_confirmacao
        ? formatDateTime(dadosAtualizacao.data_confirmacao)
        : null;
      campos.push("data_confirmacao = ?");
      params.push(dataConfirmacaoFormatada);
    }

    if (campos.length === 0) {
      throw new Error("Nenhum campo para atualizar foi fornecido");
    }

    const sql = `
      UPDATE acessos
      SET ${campos.join(", ")}
      WHERE id = ?
    `;

    params.push(id);

    const result = await query(sql, params, "run");

    return {
      id,
      changes: result.changes,
      success: result.changes > 0
    };
  } catch (error) {
    console.error("Repository Acessos: Erro ao atualizar acesso:", error);
    throw error;
  }
};

// ========== CONFIRMAR ACESSO ==========
const Confirmar = async (id, status = "confirmado") => {
  try {
    const dataConfirmacaoFormatada = formatDateTime(new Date());

    const sql = `
      UPDATE acessos
      SET status = ?, data_confirmacao = ?
      WHERE id = ?
    `;

    const result = await query(sql, [status, dataConfirmacaoFormatada, id], "run");

    return {
      id,
      status,
      data_confirmacao: dataConfirmacaoFormatada,
      changes: result.changes,
      success: result.changes > 0
    };
  } catch (error) {
    console.error("Repository Acessos: Erro ao confirmar acesso:", error);
    throw error;
  }
};

// ========== DELETAR ACESSO ==========
const Deletar = async (id) => {
  try {
    const sql = "DELETE FROM acessos WHERE id = ?";
    const result = await query(sql, [id], "run");

    return {
      id,
      changes: result.changes,
      success: result.changes > 0
    };
  } catch (error) {
    console.error("Repository Acessos: Erro ao deletar acesso:", error);
    throw error;
  }
};

export default {
  Inserir,
  Listar,
  BuscarPorId,
  Atualizar,
  Confirmar,
  Deletar
};
