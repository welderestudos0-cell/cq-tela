// // backend\src\services\service.monitoramento.js
// import repositoryMonitoramento from "../repositories/repository.monitoramento.js";

// const Inserir = async (data) => {
//   try {
//     // Validações adicionais podem ser feitas aqui
//     const resultado = await repositoryMonitoramento.Inserir(data);
//     return resultado;
//   } catch (error) {
//     console.error("Erro no service de monitoramento:", error);
//     throw error;
//   }
// };

// export default { Inserir };

// backend\src\services\service.monitoramento.js
import repositoryMonitoramento from "../repositories/repository.monitoramento.js";

const Inserir = async (data, req = null) => {
  try {
    console.log('📊 Service: Processando dados de monitoramento:', data);
    
    // Se não foi passado usuario e temos req, pegar do token
    if (!data.usuario && req && req.id_user) {
      data.usuario = req.id_user;
      console.log('👤 Service: Usuario obtido do token:', data.usuario);
    }

    // Validações obrigatórias
    const { fazenda, talhao, usuario, zero_a_trinta_cm, trinta_a_sessenta_cm } = data;

    if (!fazenda || !talhao || !usuario || !zero_a_trinta_cm || !trinta_a_sessenta_cm) {
      throw new Error('Fazenda, talhão, usuário, zero_a_trinta_cm e trinta_a_sessenta_cm são obrigatórios');
    }

    // Processar momento se não fornecido
    if (!data.momento) {
      data.momento = new Date().toISOString();
      console.log('📅 Service: Momento não fornecido, usando atual:', data.momento);
    }

    // Chamar repository Oracle para inserir
    const resultado = await repositoryMonitoramento.Inserir(data);

    console.log('✅ Service: Monitoramento inserido com sucesso:', resultado);

    return {
      success: true,
      id: resultado.id,
      message: 'Monitoramento registrado com sucesso no Oracle',
      data: data
    };

  } catch (error) {
    console.error('❌ Service: Erro ao processar monitoramento:', error);
    throw error;
  }
};

// ========== LISTAR MONITORAMENTOS ==========
const Listar = async (filtros = {}) => {
  try {
    console.log('📊 Service: Listando monitoramentos com filtros:', filtros);

    const monitoramentos = await repositoryMonitoramento.Listar(filtros);

    return {
      success: true,
      data: monitoramentos,
      total: monitoramentos.length
    };

  } catch (error) {
    console.error('❌ Service: Erro ao listar monitoramentos:', error);
    throw error;
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (id) => {
  try {
    console.log('📊 Service: Buscando monitoramento por ID:', id);

    const monitoramento = await repositoryMonitoramento.BuscarPorId(id);

    if (!monitoramento) {
      return null;
    }

    return {
      success: true,
      data: monitoramento
    };

  } catch (error) {
    console.error('❌ Service: Erro ao buscar por ID:', error);
    throw error;
  }
};

// ========== ATUALIZAR ==========
const Atualizar = async (id, dadosAtualizacao) => {
  try {
    console.log('📊 Service: Atualizando monitoramento ID:', id, dadosAtualizacao);

    // Validar se existe
    const existe = await repositoryMonitoramento.BuscarPorId(id);
    if (!existe) {
      throw new Error('Monitoramento não encontrado');
    }

    const resultado = await repositoryMonitoramento.Atualizar(id, dadosAtualizacao);

    return {
      success: true,
      id: id,
      message: 'Monitoramento atualizado com sucesso'
    };

  } catch (error) {
    console.error('❌ Service: Erro ao atualizar:', error);
    throw error;
  }
};

// ========== DELETAR ==========
const Deletar = async (id) => {
  try {
    console.log('📊 Service: Deletando monitoramento ID:', id);

    // Validar se existe
    const existe = await repositoryMonitoramento.BuscarPorId(id);
    if (!existe) {
      throw new Error('Monitoramento não encontrado');
    }

    const resultado = await repositoryMonitoramento.Deletar(id);

    return {
      success: true,
      message: 'Monitoramento deletado com sucesso'
    };

  } catch (error) {
    console.error('❌ Service: Erro ao deletar:', error);
    throw error;
  }
};

export default { 
  Inserir,
  Listar,
  BuscarPorId,
  Atualizar,
  Deletar 
};