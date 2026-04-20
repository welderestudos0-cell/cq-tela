// backend/src/services/service.acessos.js
import repositoryAcessos from "../repositories/repository.acessos.js";

const parseUsuarioId = (value) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error("usuario_id invalido");
  }
  return parsed;
};

// ========== INSERIR ACESSO ==========
const Inserir = async (data, req = null) => {
  try {
    const payload = { ...data };

    if (!payload.usuario_id && req && req.id_user) {
      payload.usuario_id = req.id_user;
    }

    if (!payload.usuario_id) {
      throw new Error("usuario_id e obrigatorio");
    }

    if (!payload.status) {
      throw new Error("status e obrigatorio");
    }

    payload.usuario_id = parseUsuarioId(payload.usuario_id);
    if (!payload.data_criacao) {
      payload.data_criacao = new Date().toISOString();
    }

    const resultado = await repositoryAcessos.Inserir(payload);

    return {
      success: true,
      id: resultado.id,
      data: {
        usuario_id: payload.usuario_id,
        status: payload.status,
        sentido: payload.sentido || null,
        data_criacao: payload.data_criacao || null,
        data_confirmacao: payload.data_confirmacao || null
      }
    };
  } catch (error) {
    console.error("Service Acessos: Erro ao inserir acesso:", error);
    throw error;
  }
};

// ========== LISTAR ACESSOS ==========
const Listar = async (filtros = {}) => {
  try {
    const resultado = await repositoryAcessos.Listar(filtros);
    return {
      success: true,
      total: resultado.length,
      data: resultado,
      filtros
    };
  } catch (error) {
    console.error("Service Acessos: Erro ao listar acessos:", error);
    throw error;
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (id) => {
  try {
    const acesso = await repositoryAcessos.BuscarPorId(id);
    if (!acesso) {
      return null;
    }
    return {
      success: true,
      data: acesso
    };
  } catch (error) {
    console.error("Service Acessos: Erro ao buscar acesso por ID:", error);
    throw error;
  }
};

// ========== ATUALIZAR ACESSO ==========
const Atualizar = async (id, dadosAtualizacao) => {
  try {
    const existente = await repositoryAcessos.BuscarPorId(id);
    if (!existente) {
      throw new Error("Acesso nao encontrado");
    }

    const dadosProcessados = { ...dadosAtualizacao };
    if (dadosProcessados.usuario_id !== undefined) {
      dadosProcessados.usuario_id = parseUsuarioId(dadosProcessados.usuario_id);
    }

    const resultado = await repositoryAcessos.Atualizar(id, dadosProcessados);

    return {
      success: true,
      id,
      changes: resultado.changes
    };
  } catch (error) {
    console.error("Service Acessos: Erro ao atualizar acesso:", error);
    throw error;
  }
};

// ========== CONFIRMAR ACESSO ==========
const Confirmar = async (id, status = "confirmado") => {
  try {
    const existente = await repositoryAcessos.BuscarPorId(id);
    if (!existente) {
      throw new Error("Acesso nao encontrado");
    }

    const resultado = await repositoryAcessos.Confirmar(id, status);

    return {
      success: true,
      id,
      status: resultado.status,
      data_confirmacao: resultado.data_confirmacao
    };
  } catch (error) {
    console.error("Service Acessos: Erro ao confirmar acesso:", error);
    throw error;
  }
};

// ========== DELETAR ACESSO ==========
const Deletar = async (id) => {
  try {
    const existente = await repositoryAcessos.BuscarPorId(id);
    if (!existente) {
      throw new Error("Acesso nao encontrado");
    }

    const resultado = await repositoryAcessos.Deletar(id);

    return {
      success: true,
      id,
      changes: resultado.changes
    };
  } catch (error) {
    console.error("Service Acessos: Erro ao deletar acesso:", error);
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
