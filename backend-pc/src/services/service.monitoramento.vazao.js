// backend/src/services/service.monitoramento.vazao.js
import repositoryMonitoramentoVazao from "../repositories/repository.monitoramento.vazao.js";

// ========== INSERIR TESTE DE VAZÃO ==========
const Inserir = async (data, req = null) => {
  try {
    console.log('📊 Service: Processando dados de teste de vazão:', data);
    
    // Se não foi passado usuario e temos req, pegar do token
    if (!data.usuario && req && req.id_user) {
      data.usuario = req.id_user;
      console.log('👤 Service: Usuario obtido do token:', data.usuario);
    }

    // Validações obrigatórias
    const { fazenda, usuario, ramal, linha } = data;

    if (!fazenda || !usuario || !ramal || !linha) {
      throw new Error('Fazenda, usuário, ramal e linha são obrigatórios');
    }

    // Validar tipos de dados
    if (isNaN(ramal) || isNaN(linha)) {
      throw new Error('Ramal e linha devem ser números');
    }

    // VALIDAÇÃO GPS NO SERVICE - CRÍTICA
    if (!data.gps) {
      throw new Error('GPS é obrigatório para registrar teste de vazão');
    }

    let gpsValido = false;
    let coordenadas = { latitude: 0, longitude: 0 };

    // Verificar formato do GPS
    if (Array.isArray(data.gps) && data.gps.length >= 2) {
      const [longitude, latitude] = data.gps;
      if (longitude !== 0 && latitude !== 0 && 
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

    // Calcular média de vazão se não fornecida
    if (!data.mediaVazao && (data.vazao1 || data.vazao2 || data.vazao3)) {
      const vazoes = [data.vazao1, data.vazao2, data.vazao3].filter(v => v != null && !isNaN(v));
      if (vazoes.length > 0) {
        data.mediaVazao = vazoes.reduce((sum, v) => sum + v, 0) / vazoes.length;
        data.mediaVazao = parseFloat(data.mediaVazao.toFixed(2));
        console.log('🧮 Service: Média de vazão calculada:', data.mediaVazao);
      }
    }

    // Processar timestamp se não fornecido
    if (!data.timestamp) {
      data.timestamp = new Date().toISOString();
      console.log('📅 Service: Timestamp não fornecido, usando atual:', data.timestamp);
    }

    // Chamar repository para inserir
    const resultado = await repositoryMonitoramentoVazao.Inserir(data);

    console.log('✅ Service: Teste de vazão inserido com sucesso:', resultado);

    return {
      success: true,
      id: resultado.id,
      message: 'Teste de vazão registrado com sucesso',
      data: {
        id: resultado.id,
        fazenda: data.fazenda,
        talhao: data.talhao,
        usuario: data.usuario,
        ramal: data.ramal,
        linha: data.linha,
        timestamp: data.timestamp,
        gpsValido: true,
        coordenadas: coordenadas
      }
    };

  } catch (error) {
    console.error('❌ Service: Erro ao processar teste de vazão:', error);
    throw error;
  }
};

// ========== INSERIR MÚLTIPLOS TESTES (BATCH) ==========
const InserirBatch = async (registros, req = null) => {
  try {
    console.log('📊 Service: Processando batch de', registros.length, 'registros');

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
        const { fazenda, usuario, ramal, linha } = registro;
        if (!fazenda || !usuario || !ramal || !linha) {
          throw new Error(`Registro ${i + 1}: Fazenda, usuário, ramal e linha são obrigatórios`);
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
          const [longitude, latitude] = registro.gps;
          if (longitude !== 0 && latitude !== 0 && 
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

        // Calcular média se não fornecida
        if (!registro.mediaVazao && (registro.vazao1 || registro.vazao2 || registro.vazao3)) {
          const vazoes = [registro.vazao1, registro.vazao2, registro.vazao3].filter(v => v != null && !isNaN(v));
          if (vazoes.length > 0) {
            registro.mediaVazao = vazoes.reduce((sum, v) => sum + v, 0) / vazoes.length;
            registro.mediaVazao = parseFloat(registro.mediaVazao.toFixed(2));
          }
        }

        // Timestamp se não fornecido
        if (!registro.timestamp) {
          registro.timestamp = new Date().toISOString();
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
            ramal: registro.ramal,
            linha: registro.linha,
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
    const resultado = await repositoryMonitoramentoVazao.InserirBatch(registrosProcessados);

    console.log('✅ Service: Batch processado:', resultado);

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
    console.error('❌ Service: Erro ao processar batch:', error);
    throw error;
  }
};

export default { 
  Inserir,
  InserirBatch
};