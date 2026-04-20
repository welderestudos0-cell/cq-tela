// backend/src/controllers/controller.acessos.js
import serviceAcessos from "../services/service.acessos.js";

// ========== INSERIR ACESSO ==========
const Inserir = async (req, res) => {
  try {
    const resultado = await serviceAcessos.Inserir(req.body, req);

    return res.status(201).json({
      success: true,
      message: "Acesso registrado com sucesso",
      id: resultado.id,
      data: resultado.data
    });
  } catch (error) {
    console.error("Controller Acessos: Erro ao inserir acesso:", error);

    if (error.message.includes("obrigatorio") || error.message.includes("invalido")) {
      return res.status(400).json({
        error: error.message,
        success: false
      });
    }

    return res.status(500).json({
      error: "Erro interno ao registrar acesso",
      details: error.message
    });
  }
};

// ========== LISTAR ACESSOS ==========
const Listar = async (req, res) => {
  try {
    console.log("Controller Acessos: Listando acessos com filtros:", req.query);
    const filtros = {};

    if (req.query.usuario_id) {
      const usuarioId = parseInt(req.query.usuario_id, 10);
      if (Number.isNaN(usuarioId)) {
        return res.status(400).json({ error: "usuario_id invalido" });
      }
      filtros.usuario_id = usuarioId;
    }

    if (req.query.status) filtros.status = req.query.status;
    if (req.query.sentido) filtros.sentido = req.query.sentido;
    if (req.query.dataInicio) filtros.dataInicio = req.query.dataInicio;
    if (req.query.dataFim) filtros.dataFim = req.query.dataFim;
    if (req.query.confirmacaoInicio) filtros.confirmacaoInicio = req.query.confirmacaoInicio;
    if (req.query.confirmacaoFim) filtros.confirmacaoFim = req.query.confirmacaoFim;

    if (req.query.limit) {
      const limit = parseInt(req.query.limit, 10);
      if (Number.isNaN(limit)) {
        return res.status(400).json({ error: "limit invalido" });
      }
      filtros.limit = limit;
    }

    const resultado = await serviceAcessos.Listar(filtros);

    console.log("Controller Acessos: Total de acessos encontrados:", resultado.total);

    return res.status(200).json({
      success: true,
      total: resultado.total,
      data: resultado.data,
      filtros: resultado.filtros
    });
  } catch (error) {
    console.error("Controller Acessos: Erro ao listar acessos:", error);
    return res.status(500).json({
      error: "Erro interno ao listar acessos",
      details: error.message
    });
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || Number.isNaN(parseInt(id, 10))) {
      return res.status(400).json({ error: "ID invalido" });
    }

    const resultado = await serviceAcessos.BuscarPorId(parseInt(id, 10));

    if (!resultado) {
      return res.status(404).json({ error: "Acesso nao encontrado" });
    }

    return res.status(200).json({
      success: true,
      data: resultado.data
    });
  } catch (error) {
    console.error("Controller Acessos: Erro ao buscar acesso:", error);
    return res.status(500).json({
      error: "Erro interno ao buscar acesso",
      details: error.message
    });
  }
};

// ========== ATUALIZAR ACESSO ==========
const Atualizar = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || Number.isNaN(parseInt(id, 10))) {
      return res.status(400).json({ error: "ID invalido" });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: "Nenhum dado para atualizar foi fornecido" });
    }

    const resultado = await serviceAcessos.Atualizar(parseInt(id, 10), req.body);

    return res.status(200).json({
      success: true,
      id: resultado.id,
      changes: resultado.changes
    });
  } catch (error) {
    console.error("Controller Acessos: Erro ao atualizar acesso:", error);

    if (error.message.includes("nao encontrado")) {
      return res.status(404).json({ error: "Acesso nao encontrado" });
    }
    if (error.message.includes("obrigatorio") || error.message.includes("invalido")) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({
      error: "Erro interno ao atualizar acesso",
      details: error.message
    });
  }
};

// ========== CONFIRMAR ACESSO ==========
const Confirmar = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!id || Number.isNaN(parseInt(id, 10))) {
      return res.status(400).json({ error: "ID invalido" });
    }

    const resultado = await serviceAcessos.Confirmar(parseInt(id, 10), status || "confirmado");

    return res.status(200).json({
      success: true,
      id: resultado.id,
      status: resultado.status,
      data_confirmacao: resultado.data_confirmacao
    });
  } catch (error) {
    console.error("Controller Acessos: Erro ao confirmar acesso:", error);

    if (error.message.includes("nao encontrado")) {
      return res.status(404).json({ error: "Acesso nao encontrado" });
    }

    return res.status(500).json({
      error: "Erro interno ao confirmar acesso",
      details: error.message
    });
  }
};

// ========== DELETAR ACESSO ==========
const Deletar = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("Controller Acessos: Deletando acesso ID:", id);

    if (!id || Number.isNaN(parseInt(id, 10))) {
      return res.status(400).json({ error: "ID invalido" });
    }

    const resultado = await serviceAcessos.Deletar(parseInt(id, 10));

    console.log("Controller Acessos: Acesso deletado com sucesso:", resultado.id);

    return res.status(200).json({
      success: true,
      id: resultado.id
    });
  } catch (error) {
    console.error("Controller Acessos: Erro ao deletar acesso:", error);

    if (error.message.includes("nao encontrado")) {
      return res.status(404).json({ error: "Acesso nao encontrado" });
    }

    return res.status(500).json({
      error: "Erro interno ao deletar acesso",
      details: error.message
    });
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
