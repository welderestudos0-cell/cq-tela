// backend/src/services/service.configuracoes.celular.js
import repositoryConfiguracoesCelular from "../repositories/repository.configuracoes.celular.js";

// ========== INSERIR CONFIGURAÇÃO DO CELULAR COM ANTI-DUPLICATAS ==========
const Inserir = async (data, req = null) => {
  try {
    console.log('📱 Service: Processando dados de configuração do celular:', data);
    
    // Se não foi passado nome_usuario e temos req, pegar do token
    if (!data.nome_usuario && req && req.user_name) {
      data.nome_usuario = req.user_name;
      console.log('👤 Service: Usuario obtido do token:', data.nome_usuario);
    }

    // Validações obrigatórias
    const { nome_celular, versao_app, nome_usuario } = data;

    if (!nome_celular || !versao_app || !nome_usuario) {
      throw new Error('Nome do celular, versão do app e nome do usuário são obrigatórios');
    }

    // Processar data_hora se não fornecida
    if (!data.data_hora) {
      data.data_hora = new Date().toISOString();
      console.log('📅 Service: Data/hora não fornecida, usando atual:', data.data_hora);
    }

    // ========== VERIFICAR SE JÁ EXISTE CONFIGURAÇÃO PARA ESTE CELULAR/USUÁRIO ==========
    console.log('🔍 Service: Verificando se já existe configuração para este celular...');
    const configuracaoExistente = await repositoryConfiguracoesCelular.VerificarExistente(
      data.nome_celular, 
      data.nome_usuario
    );

    if (configuracaoExistente) {
      console.log('📱 Service: Configuração já existe! Atualizando último acesso...');
      console.log('📱 Configuração existente:', configuracaoExistente);
      
      // Atualizar apenas o último acesso
      const resultadoAtualizacao = await repositoryConfiguracoesCelular.AtualizarUltimoAcesso(
        configuracaoExistente.id
      );
      
      console.log('✅ Service: Último acesso atualizado para ID:', configuracaoExistente.id);
      
      return {
        success: true,
        id: configuracaoExistente.id,
        message: 'Último acesso atualizado (configuração já existia)',
        data: data,
        acao: 'atualizado'
      };
    } else {
      console.log('📱 Service: Nova configuração, inserindo no banco...');
      
      // Chamar repository para inserir nova configuração
      const resultado = await repositoryConfiguracoesCelular.Inserir(data);

      console.log('✅ Service: Nova configuração inserida com sucesso:', resultado);

      return {
        success: true,
        id: resultado.id,
        message: 'Nova configuração registrada com sucesso',
        data: data,
        acao: 'inserido'
      };
    }

  } catch (error) {
    console.error('❌ Service: Erro ao processar configuração do celular:', error);
    throw error;
  }
};

// ========== LISTAR CONFIGURAÇÕES ==========
const Listar = async (filtros = {}) => {
  try {
    console.log('📱 Service: Listando configurações de celulares com filtros:', filtros);

    const configuracoes = await repositoryConfiguracoesCelular.Listar(filtros);

    return {
      success: true,
      data: configuracoes,
      total: configuracoes.length
    };

  } catch (error) {
    console.error('❌ Service: Erro ao listar configurações de celulares:', error);
    throw error;
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (id) => {
  try {
    console.log('📱 Service: Buscando configuração por ID:', id);

    const configuracao = await repositoryConfiguracoesCelular.BuscarPorId(id);

    if (!configuracao) {
      return null;
    }

    return {
      success: true,
      data: configuracao
    };

  } catch (error) {
    console.error('❌ Service: Erro ao buscar configuração por ID:', error);
    throw error;
  }
};

// ========== ATUALIZAR ==========
const Atualizar = async (id, dadosAtualizacao) => {
  try {
    console.log('📱 Service: Atualizando configuração ID:', id, dadosAtualizacao);

    // Validar se existe
    const existe = await repositoryConfiguracoesCelular.BuscarPorId(id);
    if (!existe) {
      throw new Error('Configuração não encontrada');
    }

    const resultado = await repositoryConfiguracoesCelular.Atualizar(id, dadosAtualizacao);

    return {
      success: true,
      id: id,
      message: 'Configuração atualizada com sucesso'
    };

  } catch (error) {
    console.error('❌ Service: Erro ao atualizar configuração:', error);
    throw error;
  }
};

// ========== DELETAR ==========
const Deletar = async (id) => {
  try {
    console.log('📱 Service: Deletando configuração ID:', id);

    // Validar se existe
    const existe = await repositoryConfiguracoesCelular.BuscarPorId(id);
    if (!existe) {
      throw new Error('Configuração não encontrada');
    }

    const resultado = await repositoryConfiguracoesCelular.Deletar(id);

    return {
      success: true,
      message: 'Configuração deletada com sucesso'
    };

  } catch (error) {
    console.error('❌ Service: Erro ao deletar configuração:', error);
    throw error;
  }
};

// ========== BUSCAR ÚLTIMA CONFIGURAÇÃO POR USUÁRIO ==========
const BuscarUltimaPorUsuario = async (nomeUsuario) => {
  try {
    console.log('📱 Service: Buscando última configuração do usuário:', nomeUsuario);

    const configuracao = await repositoryConfiguracoesCelular.BuscarUltimaPorUsuario(nomeUsuario);

    if (!configuracao) {
      return {
        success: false,
        message: 'Nenhuma configuração encontrada para este usuário'
      };
    }

    return {
      success: true,
      data: configuracao
    };

  } catch (error) {
    console.error('❌ Service: Erro ao buscar última configuração por usuário:', error);
    throw error;
  }
};

// ========== REGISTRAR ACESSO (FUNÇÃO ESPECIAL PARA LOGIN) ==========
const RegistrarAcesso = async (dadosAcesso, req = null) => {
  try {
    console.log('📱 Service: Registrando acesso no login:', dadosAcesso);

    // Dados padrão para acesso no login
    const dadosCompletos = {
      nome_celular: dadosAcesso.nome_celular || 'Dispositivo não identificado',
      wifi_nome: dadosAcesso.wifi_nome || null,
      versao_app: dadosAcesso.versao_app || '1.0.0',
      nome_usuario: dadosAcesso.nome_usuario,
      data_hora: new Date().toISOString()
    };

    const resultado = await Inserir(dadosCompletos, req);

    return resultado;

  } catch (error) {
    console.error('❌ Service: Erro ao registrar acesso:', error);
    // Não bloquear login se falhar o registro da configuração
    console.log('⚠️ Continuando login mesmo com erro na configuração');
    return {
      success: false,
      message: 'Erro ao registrar configuração, mas login continua',
      error: error.message
    };
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