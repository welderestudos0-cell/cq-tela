// backend/src/services/service.manutencao.bomba.js
import repositoryManutencaoBomba from "../repositories/repository.manutencao.bomba.js";

// ========== INSERIR MANUTENÇÃO DE BOMBA ==========
const Inserir = async (data, req = null) => {
  try {
    console.log('🔧 Service: Processando dados de manutenção de bomba:', data);
    
    // Se não foi passado usuario e temos req, pegar do token
    if (!data.usuario && req && req.id_user) {
      data.usuario = req.id_user;
      console.log('👤 Service: Usuario obtido do token:', data.usuario);
    }

    // Validações obrigatórias
    const { fazenda, bomba, usuario, manutencoes } = data;

    if (!fazenda || !bomba || !usuario || !manutencoes) {
      throw new Error('Fazenda, bomba, usuário e tipo de manutenção são obrigatórios');
    }

    // Processar timestamp se não fornecido
    if (!data.momento && !data.timestamp) {
      data.momento = new Date().toISOString();
      console.log('📅 Service: Timestamp não fornecido, usando atual:', data.momento);
    }

    // Chamar repository para inserir
    const resultado = await repositoryManutencaoBomba.Inserir(data);

    console.log('✅ Service: Manutenção de bomba inserida com sucesso:', resultado);

    return {
      success: true,
      id: resultado.id,
      message: 'Manutenção de bomba registrada com sucesso',
      data: {
        id: resultado.id,
        fazenda: data.fazenda,
        bomba: data.bomba,
        equipamento: data.equipamento,
        usuario: data.usuario,
        matricula: data.matricula,
        manutencoes: data.manutencoes,
        momento: data.momento
      }
    };

  } catch (error) {
    console.error('❌ Service: Erro ao processar manutenção de bomba:', error);
    throw error;
  }
};

// ========== INSERIR MÚLTIPLAS MANUTENÇÕES (BATCH) ==========
const InserirBatch = async (registros, req = null) => {
  try {
    console.log('🔧 Service: Processando batch de', registros.length, 'manutenções de bomba');

    if (!Array.isArray(registros) || registros.length === 0) {
      throw new Error('Lista de registros inválida ou vazia');
    }

    // Validar e processar cada registro
    const registrosProcessados = [];
    const errosValidacao = [];

    for (let i = 0; i < registros.length; i++) {
      const registro = registros[i];
      
      try {
        // Se não foi passado usuario e temos req, adicionar aos dados
        if (!registro.usuario && req && req.id_user) {
          registro.usuario = req.id_user;
        }

        // Validações básicas
        const { fazenda, bomba, usuario, manutencoes } = registro;
        if (!fazenda || !bomba || !usuario || !manutencoes) {
          throw new Error(`Registro ${i + 1}: Fazenda, bomba, usuário e tipo de manutenção são obrigatórios`);
        }

        // Timestamp se não fornecido
        if (!registro.momento && !registro.timestamp) {
          registro.momento = new Date().toISOString();
        }

        registrosProcessados.push(registro);

      } catch (error) {
        errosValidacao.push({
          indice: i,
          erro: error.message,
          registro: {
            bomba: registro.bomba,
            manutencoes: registro.manutencoes,
            usuario: registro.usuario
          }
        });
      }
    }

    console.log(`🔧 Service: Validação concluída - ${registrosProcessados.length} válidos, ${errosValidacao.length} rejeitados`);

    if (errosValidacao.length > 0) {
      console.warn('⚠️ Service: Erros de validação encontrados:', errosValidacao);
    }

    if (registrosProcessados.length === 0) {
      throw new Error('Nenhum registro válido para processar. Todos foram rejeitados por problemas de validação.');
    }

    // Chamar repository para inserir batch
    const resultado = await repositoryManutencaoBomba.InserirBatch(registrosProcessados);

    console.log('✅ Service: Batch de manutenção de bomba processado:', resultado);

    return {
      success: true,
      message: `Batch processado: ${resultado.sucessos} sucessos, ${resultado.falhas} falhas`,
      total: resultado.total,
      sucessos: resultado.sucessos,
      falhas: resultado.falhas,
      errosValidacao: errosValidacao,
      detalhes: resultado.resultados
    };

  } catch (error) {
    console.error('❌ Service: Erro ao processar batch de manutenção de bomba:', error);
    throw error;
  }
};

// ========== LISTAR MANUTENÇÕES DE BOMBA ==========
const Listar = async (filtros = {}) => {
  try {
    console.log('🔧 Service: Listando manutenções de bomba com filtros:', filtros);

    const resultado = await repositoryManutencaoBomba.Listar(filtros);

    console.log('✅ Service: Listagem concluída:', resultado.length, 'registros encontrados');

    return {
      success: true,
      total: resultado.length,
      data: resultado,
      filtros: filtros
    };

  } catch (error) {
    console.error('❌ Service: Erro ao listar manutenções de bomba:', error);
    throw error;
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (id) => {
  try {
    console.log('🔧 Service: Buscando manutenção de bomba por ID:', id);

    const resultado = await repositoryManutencaoBomba.BuscarPorId(id);

    return resultado;

  } catch (error) {
    console.error('❌ Service: Erro ao buscar manutenção de bomba:', error);
    throw error;
  }
};


// ========== DELETAR POR ID ==========
const Deletar = async (id) => {
  try {
    console.log('🔧 Service: Deletando manutenção de bomba:', id);

    const resultado = await repositoryManutencaoBomba.Deletar(id);

    return resultado;

  } catch (error) {
    console.error('❌ Service: Erro ao deletar manutenção de bomba:', error);
    throw error;
  }
};

export default { 
  Inserir,
  InserirBatch,
  Listar,
  BuscarPorId,
  Deletar
};