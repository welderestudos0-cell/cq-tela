// backend/src/controllers/controller.configuracoes.celular.js--
import serviceConfiguracoesCelular from "../services/service.configuracoes.celular.js";

// ========== INSERIR CONFIGURAÇÃO DO CELULAR ==========
const Inserir = async (req, res) => {
  try {
    console.log('📱 Controller: Recebendo dados de configuração do celular:', req.body);

    // Extrai os dados do corpo da requisição
    const {
      nome_celular,
      wifi_nome,
      versao_app,
      nome_usuario,
      data_hora,
      sistema_operacional,  // ← ADICIONAR ESTE CAMPO
      versao_so            // ← ADICIONAR ESTE CAMPO
    } = req.body;

    // Validação básica dos campos obrigatórios
    if (!nome_celular || !versao_app || !nome_usuario) {
      console.log('❌ Controller: Campos obrigatórios não preenchidos');
      return res.status(400).json({ 
        error: "Nome do celular, versão do app e nome do usuário são obrigatórios" 
      });
    }

    // Chama o serviço para inserir no banco
    const resultado = await serviceConfiguracoesCelular.Inserir({
      nome_celular,
      wifi_nome,
      versao_app,
      nome_usuario,
      data_hora,
      sistema_operacional,  // ← ADICIONAR ESTE CAMPO
      versao_so            // ← ADICIONAR ESTE CAMPO
    }, req);

    console.log('✅ Controller: Configuração inserida com sucesso');

    // Retorna sucesso
    res.status(201).json({
      message: "Configuração do celular registrada com sucesso",
      id: resultado.id,
      data: resultado.data
    });

  } catch (error) {
    console.error('❌ Controller: Erro ao registrar configuração do celular:', error);
    res.status(500).json({ 
      error: "Erro interno ao registrar configuração do celular",
      details: error.message
    });
  }
};

// ========== LISTAR CONFIGURAÇÕES ==========
const Listar = async (req, res) => {
  try {
    console.log('📱 Controller: Listando configurações de celulares');

    // Extrair filtros da query string
    const {
      nome_usuario,
      nome_celular,
      versao_app,
      dataInicio,
      dataFim,
      limit
    } = req.query;

    const filtros = {};
    if (nome_usuario) filtros.nome_usuario = nome_usuario;
    if (nome_celular) filtros.nome_celular = nome_celular;
    if (versao_app) filtros.versao_app = versao_app;
    if (dataInicio) filtros.dataInicio = dataInicio;
    if (dataFim) filtros.dataFim = dataFim;
    if (limit) filtros.limit = limit;

    const resultado = await serviceConfiguracoesCelular.Listar(filtros);

    console.log('✅ Controller: Configurações listadas:', resultado.total);

    res.status(200).json({
      message: "Configurações listadas com sucesso",
      total: resultado.total,
      data: resultado.data
    });

  } catch (error) {
    console.error('❌ Controller: Erro ao listar configurações:', error);
    res.status(500).json({ 
      error: "Erro interno ao listar configurações",
      details: error.message
    });
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('📱 Controller: Buscando configuração por ID:', id);

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const resultado = await serviceConfiguracoesCelular.BuscarPorId(parseInt(id));

    if (!resultado) {
      return res.status(404).json({ error: "Configuração não encontrada" });
    }

    console.log('✅ Controller: Configuração encontrada');

    res.status(200).json({
      message: "Configuração encontrada",
      data: resultado.data
    });

  } catch (error) {
    console.error('❌ Controller: Erro ao buscar configuração por ID:', error);
    res.status(500).json({ 
      error: "Erro interno ao buscar configuração",
      details: error.message
    });
  }
};

// ========== ATUALIZAR CONFIGURAÇÃO ==========
const Atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const dadosAtualizacao = req.body;

    console.log('📱 Controller: Atualizando configuração ID:', id);

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    if (!dadosAtualizacao || Object.keys(dadosAtualizacao).length === 0) {
      return res.status(400).json({ error: "Nenhum dado para atualizar foi fornecido" });
    }

    const resultado = await serviceConfiguracoesCelular.Atualizar(parseInt(id), dadosAtualizacao);

    console.log('✅ Controller: Configuração atualizada');

    res.status(200).json({
      message: "Configuração atualizada com sucesso",
      id: resultado.id
    });

  } catch (error) {
    console.error('❌ Controller: Erro ao atualizar configuração:', error);
    
    if (error.message === 'Configuração não encontrada') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: "Erro interno ao atualizar configuração",
      details: error.message
    });
  }
};

// ========== DELETAR CONFIGURAÇÃO ==========
const Deletar = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('📱 Controller: Deletando configuração ID:', id);

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const resultado = await serviceConfiguracoesCelular.Deletar(parseInt(id));

    console.log('✅ Controller: Configuração deletada');

    res.status(200).json({
      message: "Configuração deletada com sucesso"
    });

  } catch (error) {
    console.error('❌ Controller: Erro ao deletar configuração:', error);
    
    if (error.message === 'Configuração não encontrada') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: "Erro interno ao deletar configuração",
      details: error.message
    });
  }
};

// ========== BUSCAR ÚLTIMA CONFIGURAÇÃO POR USUÁRIO ==========
const BuscarUltimaPorUsuario = async (req, res) => {
  try {
    const { nomeUsuario } = req.params;

    console.log('📱 Controller: Buscando última configuração do usuário:', nomeUsuario);

    if (!nomeUsuario) {
      return res.status(400).json({ error: "Nome do usuário é obrigatório" });
    }

    const resultado = await serviceConfiguracoesCelular.BuscarUltimaPorUsuario(nomeUsuario);

    if (!resultado.success) {
      return res.status(404).json({ 
        error: resultado.message || "Nenhuma configuração encontrada" 
      });
    }

    console.log('✅ Controller: Última configuração encontrada');

    res.status(200).json({
      message: "Última configuração encontrada",
      data: resultado.data
    });

  } catch (error) {
    console.error('❌ Controller: Erro ao buscar última configuração por usuário:', error);
    res.status(500).json({ 
      error: "Erro interno ao buscar última configuração",
      details: error.message
    });
  }
};

// ========== REGISTRAR ACESSO NO LOGIN ==========
const RegistrarAcesso = async (req, res) => {
  try {
    console.log('📱 Controller: Registrando acesso no login:', req.body);

    const {
      nome_celular,
      wifi_nome,
      versao_app,
      nome_usuario
    } = req.body;

    // Validação básica
    if (!nome_usuario) {
      return res.status(400).json({ 
        error: "Nome do usuário é obrigatório para registrar acesso" 
      });
    }

    const resultado = await serviceConfiguracoesCelular.RegistrarAcesso({
      nome_celular,
      wifi_nome,
      versao_app,
      nome_usuario
    }, req);

    console.log('✅ Controller: Acesso registrado');

    res.status(201).json({
      message: "Acesso registrado com sucesso",
      success: resultado.success,
      id: resultado.id
    });

  } catch (error) {
    console.error('❌ Controller: Erro ao registrar acesso:', error);
    // Não bloquear processo de login
    res.status(200).json({ 
      message: "Acesso registrado com ressalvas",
      success: false,
      error: error.message
    });
  }
};

export default { 
  Inserir,
  Listar,
  BuscarPorId,
  Atualizar,
  Deletar,
  BuscarUltimaPorUsuario,
  RegistrarAcesso
};