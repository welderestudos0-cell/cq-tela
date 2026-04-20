// backend/src/services/service.monitoramento.limpeza.js
import repositoryMonitoramentoLimpeza from "../repositories/repository.monitoramento.limpeza.js";

// ========== INSERIR MONITORAMENTO DE LIMPEZA ==========
const Inserir = async (data, req = null) => {
  try {
    console.log('📊 Service: Processando dados de monitoramento de limpeza:', data);
    
    // Se não foi passado usuario e temos req, pegar do token
    if (!data.usuario && req && req.id_user) {
      data.usuario = req.id_user;
      console.log('👤 Service: Usuario obtido do token:', data.usuario);
    }

    // Validações obrigatórias
    const { fazenda, talhao, usuario, tipo_limpeza } = data;

    if (!fazenda || !talhao || !usuario || !tipo_limpeza) {
      throw new Error('Fazenda, talhão, usuário e tipo de limpeza são obrigatórios');
    }

    // Validar tipo de limpeza
    const tiposValidos = ['quimica', 'arraste', 'manutencao'];
    if (!tiposValidos.includes(tipo_limpeza)) {
      throw new Error(`Tipo de limpeza inválido. Valores aceitos: ${tiposValidos.join(', ')}`);
    }

    // VALIDAÇÃO GPS NO SERVICE - CRÍTICA
    if (!data.gps) {
      throw new Error('GPS é obrigatório para registrar monitoramento de limpeza');
    }

    let gpsValido = false;
    let coordenadas = { latitude: 0, longitude: 0 };

    // Verificar formato do GPS
    if (Array.isArray(data.gps) && data.gps.length >= 2) {
      const [latitude, longitude] = data.gps;
      if (latitude !== 0 && longitude !== 0 && 
          Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
        gpsValido = true;
        coordenadas = { latitude, longitude };
      }
    } else if (data.gps.latitude && data.gps.longitude) {
      const { latitude, longitude } = data.gps;
      if (latitude !== 0 && longitude !== 0 && 
          Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
        gpsValido = true;
        coordenadas = { latitude, longitude };
      }
    }

    if (!gpsValido) {
      console.log('❌ Service: GPS inválido detectado:', data.gps);
      throw new Error('Coordenadas GPS inválidas ou não capturadas. Apenas registros com GPS válido podem ser salvos.');
    }

    console.log(`✅ Service: GPS válido confirmado: [${coordenadas.latitude}, ${coordenadas.longitude}]`);

    // Processar timestamp se não fornecido
    if (!data.momento && !data.timestamp) {
      data.momento = new Date().toISOString();
      console.log('📅 Service: Timestamp não fornecido, usando atual:', data.momento);
    }

    // Chamar repository para inserir
    const resultado = await repositoryMonitoramentoLimpeza.Inserir(data);

    console.log('✅ Service: Monitoramento de limpeza inserido com sucesso:', resultado);

    return {
      success: true,
      id: resultado.id,
      message: 'Monitoramento de limpeza registrado com sucesso',
      data: {
        id: resultado.id,
        fazenda: data.fazenda,
        talhao: data.talhao,
        usuario: data.usuario,
        tipo_limpeza: data.tipo_limpeza,
        matricula: data.matricula,
        momento: data.momento,
        gpsValido: true,
        coordenadas: coordenadas
      }
    };

  } catch (error) {
    console.error('❌ Service: Erro ao processar monitoramento de limpeza:', error);
    throw error;
  }
};

// ========== INSERIR MÚLTIPLOS MONITORAMENTOS (BATCH) ==========
const InserirBatch = async (registros, req = null) => {
  try {
    console.log('📊 Service: Processando batch de', registros.length, 'registros de limpeza');

    if (!Array.isArray(registros) || registros.length === 0) {
      throw new Error('Lista de registros inválida ou vazia');
    }

    // Validar e processar cada registro
    const registrosProcessados = [];
    const errosValidacao = [];
    let registrosComGPSValido = 0;
    let registrosRejeitadosGPS = 0;

    for (let i = 0; i < registros.length; i++) {
      const registro = registros[i];
      
      try {
        // Se não foi passado usuario e temos req, adicionar aos dados
        if (!registro.usuario && req && req.id_user) {
          registro.usuario = req.id_user;
        }

        // Validações básicas
        const { fazenda, talhao, usuario, tipo_limpeza } = registro;
        if (!fazenda || !talhao || !usuario || !tipo_limpeza) {
          throw new Error(`Registro ${i + 1}: Fazenda, talhão, usuário e tipo de limpeza são obrigatórios`);
        }

        // Validar tipo de limpeza
        const tiposValidos = ['quimica', 'arraste', 'manutencao'];
        if (!tiposValidos.includes(tipo_limpeza)) {
          throw new Error(`Registro ${i + 1}: Tipo de limpeza inválido. Valores aceitos: ${tiposValidos.join(', ')}`);
        }

        // VALIDAÇÃO CRÍTICA GPS
        if (!registro.gps) {
          registrosRejeitadosGPS++;
          throw new Error(`Registro ${i + 1}: GPS obrigatório não fornecido`);
        }

        let gpsValido = false;
        let coordenadas = { latitude: 0, longitude: 0 };

        // Verificar formato do GPS
        if (Array.isArray(registro.gps) && registro.gps.length >= 2) {
          const [latitude, longitude] = registro.gps;
          if (latitude !== 0 && longitude !== 0 && 
              Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
            gpsValido = true;
            coordenadas = { latitude, longitude };
          }
        } else if (registro.gps.latitude && registro.gps.longitude) {
          const { latitude, longitude } = registro.gps;
          if (latitude !== 0 && longitude !== 0 && 
              Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
            gpsValido = true;
            coordenadas = { latitude, longitude };
          }
        }

        if (!gpsValido) {
          registrosRejeitadosGPS++;
          throw new Error(`Registro ${i + 1}: GPS inválido - Coordenadas: ${JSON.stringify(registro.gps)}`);
        }

        registrosComGPSValido++;

        // Timestamp se não fornecido
        if (!registro.momento && !registro.timestamp) {
          registro.momento = new Date().toISOString();
        }

        registrosProcessados.push({
          ...registro,
          coordenadasValidas: coordenadas
        });

      } catch (error) {
        errosValidacao.push({
          indice: i,
          erro: error.message,
          registro: {
            talhao: registro.talhao,
            tipo_limpeza: registro.tipo_limpeza,
            usuario: registro.usuario,
            hasGPS: !!registro.gps
          }
        });
      }
    }

    console.log(`📊 Service: Validação concluída - ${registrosProcessados.length} válidos, ${errosValidacao.length} rejeitados`);
    console.log(`📍 GPS Stats: ${registrosComGPSValido} com GPS válido, ${registrosRejeitadosGPS} rejeitados por GPS inválido`);

    if (errosValidacao.length > 0) {
      console.warn('⚠️ Service: Erros de validação encontrados:', errosValidacao);
    }

    if (registrosProcessados.length === 0) {
      throw new Error('Nenhum registro válido para processar. Todos foram rejeitados por problemas de validação ou GPS inválido.');
    }

    // Chamar repository para inserir batch
    const resultado = await repositoryMonitoramentoLimpeza.InserirBatch(registrosProcessados);

    console.log('✅ Service: Batch de limpeza processado:', resultado);

    return {
      success: true,
      message: `Batch processado: ${resultado.sucessos} sucessos, ${resultado.falhas} falhas`,
      total: resultado.total,
      sucessos: resultado.sucessos,
      falhas: resultado.falhas,
      registrosComGPSValido: registrosComGPSValido,
      registrosRejeitadosGPS: registrosRejeitadosGPS,
      errosValidacao: errosValidacao,
      detalhes: resultado.resultados
    };

  } catch (error) {
    console.error('❌ Service: Erro ao processar batch de limpeza:', error);
    throw error;
  }
};

// ========== LISTAR MONITORAMENTOS DE LIMPEZA ==========
const Listar = async (filtros = {}) => {
  try {
    console.log('📊 Service: Listando monitoramentos de limpeza com filtros:', filtros);

    const resultado = await repositoryMonitoramentoLimpeza.Listar(filtros);

    console.log('✅ Service: Listagem concluída:', resultado.length, 'registros encontrados');

    return {
      success: true,
      total: resultado.length,
      data: resultado,
      filtros: filtros
    };

  } catch (error) {
    console.error('❌ Service: Erro ao listar monitoramentos de limpeza:', error);
    throw error;
  }
};

export default { 
  Inserir,
  InserirBatch,
  Listar
};