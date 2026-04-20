// backend/src/repositories/repository.monitoramento.limpeza.js--
import { query } from "../database/sqlite.js";

// ========== INSERIR MONITORAMENTO DE LIMPEZA ==========
const Inserir = async (data) => {
  try {
    console.log('📊 Repository: Inserindo monitoramento de limpeza:', data);

    // Validar dados obrigatórios
    const { fazenda, talhao, usuario, tipo_limpeza } = data;
    if (!fazenda || !talhao || !usuario || !tipo_limpeza) {
      throw new Error('Dados obrigatórios não fornecidos: fazenda, talhao, usuario, tipo_limpeza');
    }

    // ========== PROCESSAMENTO GPS CORRIGIDO ==========
    let gpsFormatted = null;
    
    if (data.gps) {
      let latitude = null;
      let longitude = null;

      // Se GPS é um objeto {latitude, longitude}
      if (data.gps.latitude && data.gps.longitude) {
        latitude = parseFloat(data.gps.latitude);
        longitude = parseFloat(data.gps.longitude);
      }
      // Se GPS é um array [latitude, longitude] 
      else if (Array.isArray(data.gps) && data.gps.length >= 2) {
        latitude = parseFloat(data.gps[0]);
        longitude = parseFloat(data.gps[1]);
      }

      // Validar coordenadas (só salva se diferentes de 0)
      if (latitude && longitude && 
          latitude !== 0 && longitude !== 0 &&
          Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
        
        gpsFormatted = `[${latitude}, ${longitude}]`;
        console.log(`✅ GPS válido processado: [${latitude}, ${longitude}]`);
      } else {
        console.log('⚠️ Coordenadas GPS inválidas ou zero, não salvando GPS:', { latitude, longitude });
        throw new Error('GPS inválido ou não capturado. Coordenadas necessárias para salvar.');
      }
    } else {
      console.log('❌ GPS não fornecido');
      throw new Error('GPS é obrigatório para salvar o registro');
    }

    // Processar timestamp no formato momento (YYYY-MM-DD HH:mm:ss)
    let momentoFormatado;
    try {
      const dataObj = data.momento ? new Date(data.momento) : 
                      data.timestamp ? new Date(data.timestamp) : new Date();
      momentoFormatado = `${dataObj.getFullYear()}-${String(dataObj.getMonth() + 1).padStart(2, '0')}-${String(dataObj.getDate()).padStart(2, '0')} ${String(dataObj.getHours()).padStart(2, '0')}:${String(dataObj.getMinutes()).padStart(2, '0')}:${String(dataObj.getSeconds()).padStart(2, '0')}`;
    } catch (dateError) {
      console.error('❌ Erro ao processar timestamp:', dateError);
      const agora = new Date();
      momentoFormatado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')} ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`;
    }

    const sql = `
      INSERT INTO monitoramento_limpeza (
        fazenda,
        talhao,
        usuario,
        momento,
        tipo_limpeza,
        matricula,
        gps
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      data.fazenda,
      data.talhao,
      data.usuario,
      momentoFormatado,
      data.tipo_limpeza,
      data.matricula || null,
      gpsFormatted
    ];

    console.log('📊 Repository: Executando SQL com parâmetros válidos:', {
      fazenda: data.fazenda,
      talhao: data.talhao,
      usuario: data.usuario,
      momento: momentoFormatado,
      tipo_limpeza: data.tipo_limpeza,
      matricula: data.matricula,
      gps: gpsFormatted
    });

    const result = await query(sql, params, 'run');

    console.log('✅ SQLite run executado:', result);
    console.log('✅ Repository: Monitoramento de limpeza inserido com GPS válido:', result.lastID);

    return {
      id: result.lastID,
      changes: result.changes,
      success: true
    };

  } catch (error) {
    console.error('❌ Repository: Erro ao inserir monitoramento de limpeza:', error);
    throw error;
  }
};

// ========== INSERIR MÚLTIPLOS REGISTROS (BATCH) ==========
const InserirBatch = async (registros) => {
  try {
    console.log('📊 Repository: Inserindo batch de', registros.length, 'registros de limpeza');

    const resultados = [];
    let registrosComGPSValido = 0;
    let registrosRejeitados = 0;
    
    for (const registro of registros) {
      try {
        const resultado = await Inserir(registro);
        
        resultados.push({
          success: true,
          id: resultado.id,
          data: registro
        });
        registrosComGPSValido++;
        console.log(`✅ Registro de limpeza inserido com GPS válido: ${resultado.id}`);
      } catch (error) {
        console.error('❌ Erro ao inserir registro individual de limpeza:', error.message);
        
        if (error.message.includes('GPS')) {
          registrosRejeitados++;
          console.log(`🚫 Registro rejeitado por GPS inválido: ${registro.talhao}, ${registro.tipo_limpeza}`);
        }
        
        resultados.push({
          success: false,
          error: error.message,
          data: registro
        });
      }
    }

    const sucessos = resultados.filter(r => r.success).length;
    const falhas = resultados.filter(r => !r.success).length;

    console.log(`📊 Batch de limpeza concluído: ${sucessos} sucessos, ${falhas} falhas`);
    console.log(`📍 GPS Stats: ${registrosComGPSValido} com GPS válido, ${registrosRejeitados} rejeitados por GPS inválido`);

    return {
      total: registros.length,
      sucessos,
      falhas,
      registrosComGPSValido,
      registrosRejeitados,
      resultados
    };

  } catch (error) {
    console.error('❌ Repository: Erro no batch insert de limpeza:', error);
    throw error;
  }
};

// ========== LISTAR MONITORAMENTOS DE LIMPEZA ==========
const Listar = async (filtros = {}) => {
  try {
    let sql = `
      SELECT 
        id,
        fazenda,
        talhao,
        usuario,
        momento,
        tipo_limpeza,
        matricula,
        gps,
        created_at
      FROM monitoramento_limpeza
      WHERE 1=1
    `;
    
    const params = [];
    
    if (filtros.fazenda) {
      sql += ` AND fazenda = ?`;
      params.push(filtros.fazenda);
    }
    
    if (filtros.talhao) {
      sql += ` AND talhao = ?`;
      params.push(filtros.talhao);
    }
    
    if (filtros.usuario) {
      sql += ` AND usuario = ?`;
      params.push(filtros.usuario);
    }
    
    if (filtros.tipo_limpeza) {
      sql += ` AND tipo_limpeza = ?`;
      params.push(filtros.tipo_limpeza);
    }
    
    if (filtros.dataInicio) {
      sql += ` AND momento >= ?`;
      params.push(filtros.dataInicio);
    }
    
    if (filtros.dataFim) {
      sql += ` AND momento <= ?`;
      params.push(filtros.dataFim);
    }
    
    sql += ` ORDER BY momento DESC`;
    
    if (filtros.limit) {
      sql += ` LIMIT ?`;
      params.push(parseInt(filtros.limit));
    }

    console.log('🔍 Repository: Listando monitoramentos de limpeza com filtros:', filtros);
    
    const result = await query(sql, params, 'all');
    
    console.log('✅ Repository: Encontrados', result.length, 'monitoramentos de limpeza');
    
    return result;
    
  } catch (error) {
    console.error('❌ Repository: Erro ao listar monitoramentos de limpeza:', error);
    throw error;
  }
};

export default { 
  Inserir,
  InserirBatch,
  Listar
};