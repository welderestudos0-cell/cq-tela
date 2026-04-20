// // backend/src/repositories/repository.monitoramento.vazao.js
// import { query } from "../database/sqlite.js";

// // ========== INSERIR TESTE DE VAZÃO E PRESSÃO ==========
// const Inserir = async (data) => {
//   try {
//     console.log('📊 Repository: Inserindo teste de vazão e pressão:', data);

//     // Validar dados obrigatórios
//     const { fazenda, usuario, ramal, linha } = data;
//     if (!fazenda || !usuario || !ramal || !linha) {
//       throw new Error('Dados obrigatórios não fornecidos: fazenda, usuario, ramal, linha');
//     }

//     // Gerar ID único
//     const id = data.id || `${Date.now()}_${ramal}_${linha}_${Math.random().toString(36).substr(2, 9)}`;

//     // ========== PROCESSAMENTO GPS CORRIGIDO ==========
//     let gpsFormatted = null; // Mudar padrão para null em vez de [0,0]
    
//     if (data.gps) {
//       let latitude = null;
//       let longitude = null;

//       // Se GPS é um objeto {latitude, longitude}
//       if (data.gps.latitude && data.gps.longitude) {
//         latitude = parseFloat(data.gps.latitude);
//         longitude = parseFloat(data.gps.longitude);
//       }
//       // Se GPS é um array [longitude, latitude] (formato do frontend)
//       else if (Array.isArray(data.gps) && data.gps.length >= 2) {
//         longitude = parseFloat(data.gps[0]);
//         latitude = parseFloat(data.gps[1]);
//       }

//       // Validar coordenadas (só salva se diferentes de 0)
//       if (latitude && longitude && 
//           latitude !== 0 && longitude !== 0 &&
//           Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
        
//         gpsFormatted = `[${latitude}, ${longitude}]`; // Formato do banco: [latitude, longitude]
//         console.log(`✅ GPS válido processado: [${latitude}, ${longitude}]`);
//       } else {
//         console.log('⚠️ Coordenadas GPS inválidas ou zero, não salvando GPS:', { latitude, longitude });
//         // Não salvar registro se GPS for inválido
//         throw new Error('GPS inválido ou não capturado. Coordenadas necessárias para salvar.');
//       }
//     } else {
//       console.log('❌ GPS não fornecido');
//       throw new Error('GPS é obrigatório para salvar o registro');
//     }

//     // Se chegou até aqui, GPS é válido
    
//     // Processar leituras de filtro
//     let paf = null;
//     let pdf = null;
//     if (data.leituraFiltro) {
//       paf = data.leituraFiltro.paf ? parseFloat(data.leituraFiltro.paf) : null;
//       pdf = data.leituraFiltro.pdf ? parseFloat(data.leituraFiltro.pdf) : null;
//     }

//     // Processar leituras de válvula
//     let pav = null;
//     let pdv = null;
//     if (data.leituraValvula) {
//       pav = data.leituraValvula.pav ? parseFloat(data.leituraValvula.pav) : null;
//       pdv = data.leituraValvula.pdv ? parseFloat(data.leituraValvula.pdv) : null;
//     }

//     // Processar timestamp no formato momento (YYYY-MM-DD HH:mm:ss)
//     let momentoFormatado;
//     try {
//       const dataObj = data.timestamp ? new Date(data.timestamp) : new Date();
//       momentoFormatado = `${dataObj.getFullYear()}-${String(dataObj.getMonth() + 1).padStart(2, '0')}-${String(dataObj.getDate()).padStart(2, '0')} ${String(dataObj.getHours()).padStart(2, '0')}:${String(dataObj.getMinutes()).padStart(2, '0')}:${String(dataObj.getSeconds()).padStart(2, '0')}`;
//     } catch (dateError) {
//       console.error('❌ Erro ao processar timestamp:', dateError);
//       const agora = new Date();
//       momentoFormatado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')} ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`;
//     }

//     const sql = `
//       INSERT INTO teste_vazao_pressao (
//         ramal,
//         linha,
//         usuario,
//         fazenda,
//         talhao,
//         tempo,
//         timestamp,
//         vazao1,
//         vazao2,
//         vazao3,
//         media_vazao,
//         pressao_final,
//         paf,
//         pdf,
//         pav,
//         pdv,
//         gps
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     const params = [
//       parseInt(data.ramal),
//       parseInt(data.linha),
//       data.usuario,
//       data.fazenda,
//       data.talhao || null,
//       data.tempo ? parseFloat(data.tempo) : null,
//       momentoFormatado,
//       data.vazao1 ? parseFloat(data.vazao1) : null,
//       data.vazao2 ? parseFloat(data.vazao2) : null,
//       data.vazao3 ? parseFloat(data.vazao3) : null,
//       data.mediaVazao ? parseFloat(data.mediaVazao) : null,
//       data.pressaoFinal ? parseFloat(data.pressaoFinal) : null,
//       paf,
//       pdf,
//       pav,
//       pdv,
//       gpsFormatted // Só será salvo se GPS for válido
//     ];

//     console.log('📊 Repository: Executando SQL com parâmetros válidos:', {
//       id,
//       fazenda: data.fazenda,
//       talhao: data.talhao,
//       usuario: data.usuario,
//       ramal: data.ramal,
//       linha: data.linha,
//       timestamp: momentoFormatado,
//       gps: gpsFormatted // Coordenadas reais válidas
//     });

//     const result = await query(sql, params, 'run');

//     console.log('✅ Repository: Teste de vazão inserido com GPS válido:', id);

//     return {
//       id: result.lastID,
//       lastID: id,
//       changes: result.changes,
//       success: true
//     };

//   } catch (error) {
//     console.error('❌ Repository: Erro ao inserir teste de vazão:', error);
//     throw error;
//   }
// };

// // ========== INSERIR MÚLTIPLOS REGISTROS (BATCH) ==========
// const InserirBatch = async (registros) => {
//   try {
//     console.log('📊 Repository: Inserindo batch de', registros.length, 'registros');

//     const resultados = [];
//     let registrosComGPSValido = 0;
//     let registrosRejeitados = 0;
    
//     for (const registro of registros) {
//       try {
//         const resultado = await Inserir(registro);
//         resultados.push({
//           success: true,
//           id: resultado.id,
//           data: registro
//         });
//         registrosComGPSValido++;
//         console.log(`✅ Registro inserido com GPS válido: ${resultado.id}`);
//       } catch (error) {
//         console.error('❌ Erro ao inserir registro individual:', error.message);
        
//         // Se erro for de GPS, contar como rejeitado
//         if (error.message.includes('GPS')) {
//           registrosRejeitados++;
//           console.log(`🚫 Registro rejeitado por GPS inválido: Ramal ${registro.ramal}, Linha ${registro.linha}`);
//         }
        
//         resultados.push({
//           success: false,
//           error: error.message,
//           data: registro
//         });
//       }
//     }

//     const sucessos = resultados.filter(r => r.success).length;
//     const falhas = resultados.filter(r => !r.success).length;

//     console.log(`📊 Batch concluído: ${sucessos} sucessos, ${falhas} falhas`);
//     console.log(`📍 GPS Stats: ${registrosComGPSValido} com GPS válido, ${registrosRejeitados} rejeitados por GPS inválido`);

//     return {
//       total: registros.length,
//       sucessos,
//       falhas,
//       registrosComGPSValido,
//       registrosRejeitados,
//       resultados
//     };

//   } catch (error) {
//     console.error('❌ Repository: Erro no batch insert:', error);
//     throw error;
//   }
// };

// export default { 
//   Inserir,
//   InserirBatch
// };


// backend/src/repositories/repository.monitoramento.vazao.js
import { query } from "../database/sqlite.js";

// ========== INSERIR TESTE DE VAZÃO E PRESSÃO ==========
const Inserir = async (data) => {
  try {
    console.log('📊 Repository: Inserindo teste de vazão e pressão:', data);

    // Validar dados obrigatórios
    const { fazenda, usuario, ramal, linha } = data;
    if (!fazenda || !usuario || !ramal || !linha) {
      throw new Error('Dados obrigatórios não fornecidos: fazenda, usuario, ramal, linha');
    }

    // Gerar ID único
    const id = data.id || `${Date.now()}_${ramal}_${linha}_${Math.random().toString(36).substr(2, 9)}`;

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
      // Se GPS é um array [longitude, latitude] (formato do frontend)
      else if (Array.isArray(data.gps) && data.gps.length >= 2) {
        longitude = parseFloat(data.gps[0]);
        latitude = parseFloat(data.gps[1]);
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

    // *** CORREÇÃO: PROCESSAR DADOS DE PRESSÃO DE MÚLTIPLAS FONTES ***
    let paf = null;
    let pdf = null;
    let pav = null;
    let pdv = null;

    // PRIORIDADE 1: Dados diretos (vindos do Home.js)
    if (data.paf !== undefined && data.paf !== null) {
      paf = parseFloat(data.paf);
    }
    if (data.pdf !== undefined && data.pdf !== null) {
      pdf = parseFloat(data.pdf);
    }
    if (data.pav !== undefined && data.pav !== null) {
      pav = parseFloat(data.pav);
    }
    if (data.pdv !== undefined && data.pdv !== null) {
      pdv = parseFloat(data.pdv);
    }

    // PRIORIDADE 2: Estruturas aninhadas (compatibilidade com TesteVazaoInicial.js)
    if (data.leituraFiltro) {
      if (paf === null && data.leituraFiltro.paf !== undefined && data.leituraFiltro.paf !== null) {
        paf = parseFloat(data.leituraFiltro.paf);
      }
      if (pdf === null && data.leituraFiltro.pdf !== undefined && data.leituraFiltro.pdf !== null) {
        pdf = parseFloat(data.leituraFiltro.pdf);
      }
    }

    if (data.leituraValvula) {
      if (pav === null && data.leituraValvula.pav !== undefined && data.leituraValvula.pav !== null) {
        pav = parseFloat(data.leituraValvula.pav);
      }
      if (pdv === null && data.leituraValvula.pdv !== undefined && data.leituraValvula.pdv !== null) {
        pdv = parseFloat(data.leituraValvula.pdv);
      }
    }

    console.log('🔍 Repository: Dados de pressão processados:', {
      paf_final: paf,
      pdf_final: pdf,
      pav_final: pav,
      pdv_final: pdv,
      fonte_paf: data.paf !== undefined ? 'direto' : (data.leituraFiltro?.paf !== undefined ? 'leituraFiltro' : 'nenhuma'),
      fonte_pdf: data.pdf !== undefined ? 'direto' : (data.leituraFiltro?.pdf !== undefined ? 'leituraFiltro' : 'nenhuma'),
      fonte_pav: data.pav !== undefined ? 'direto' : (data.leituraValvula?.pav !== undefined ? 'leituraValvula' : 'nenhuma'),
      fonte_pdv: data.pdv !== undefined ? 'direto' : (data.leituraValvula?.pdv !== undefined ? 'leituraValvula' : 'nenhuma')
    });

    // *** VERIFICAÇÃO CRÍTICA ***
    if (paf === null && pdf === null && pav === null && pdv === null) {
      console.warn('⚠️ Repository: NENHUM dado de pressão foi encontrado!', {
        data_paf: data.paf,
        data_pdf: data.pdf,
        data_pav: data.pav,
        data_pdv: data.pdv,
        leituraFiltro: data.leituraFiltro,
        leituraValvula: data.leituraValvula
      });
    }

    // Processar timestamp no formato momento (YYYY-MM-DD HH:mm:ss)
    let momentoFormatado;
    try {
      const dataObj = data.timestamp ? new Date(data.timestamp) : new Date();
      momentoFormatado = `${dataObj.getFullYear()}-${String(dataObj.getMonth() + 1).padStart(2, '0')}-${String(dataObj.getDate()).padStart(2, '0')} ${String(dataObj.getHours()).padStart(2, '0')}:${String(dataObj.getMinutes()).padStart(2, '0')}:${String(dataObj.getSeconds()).padStart(2, '0')}`;
    } catch (dateError) {
      console.error('❌ Erro ao processar timestamp:', dateError);
      const agora = new Date();
      momentoFormatado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')} ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`;
    }

    const sql = `
      INSERT INTO teste_vazao_pressao (
        ramal,
        linha,
        usuario,
        fazenda,
        talhao,
        tempo,
        timestamp,
        vazao1,
        vazao2,
        vazao3,
        media_vazao,
        pressao_final,
        paf,
        pdf,
        pav,
        pdv,
        gps
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      parseInt(data.ramal),
      parseInt(data.linha),
      data.usuario,
      data.fazenda,
      data.talhao || null,
      data.tempo ? parseFloat(data.tempo) : null,
      momentoFormatado,
      data.vazao1 ? parseFloat(data.vazao1) : null,
      data.vazao2 ? parseFloat(data.vazao2) : null,
      data.vazao3 ? parseFloat(data.vazao3) : null,
      data.mediaVazao ? parseFloat(data.mediaVazao) : null,
      data.pressaoFinal ? parseFloat(data.pressaoFinal) : null,
      paf, // *** AGORA VAI PEGAR O VALOR CORRETO ***
      pdf, // *** AGORA VAI PEGAR O VALOR CORRETO ***
      pav, // *** AGORA VAI PEGAR O VALOR CORRETO ***
      pdv, // *** AGORA VAI PEGAR O VALOR CORRETO ***
      gpsFormatted
    ];

    console.log('📊 Repository: Executando SQL com parâmetros válidos:', {
      id,
      fazenda: data.fazenda,
      talhao: data.talhao,
      usuario: data.usuario,
      ramal: data.ramal,
      linha: data.linha,
      timestamp: momentoFormatado,
      gps: gpsFormatted,
      // *** LOG DOS DADOS DE PRESSÃO QUE SERÃO INSERIDOS ***
      paf_inserindo: paf,
      pdf_inserindo: pdf,
      pav_inserindo: pav,
      pdv_inserindo: pdv
    });

    const result = await query(sql, params, 'run');

    console.log('✅ SQLite run executado:', result);
    console.log('✅ Repository: Teste de vazão inserido com GPS válido:', id);

    return {
      id: result.lastID,
      lastID: id,
      changes: result.changes,
      success: true
    };

  } catch (error) {
    console.error('❌ Repository: Erro ao inserir teste de vazão:', error);
    throw error;
  }
};

// ========== INSERIR MÚLTIPLOS REGISTROS (BATCH) ==========
const InserirBatch = async (registros) => {
  try {
    console.log('📊 Repository: Inserindo batch de', registros.length, 'registros');

    const resultados = [];
    let registrosComGPSValido = 0;
    let registrosRejeitados = 0;
    let registrosComPressao = 0;
    
    for (const registro of registros) {
      try {
        const resultado = await Inserir(registro);
        
        // Verificar se tem dados de pressão
        const temPressao = registro.paf || registro.pdf || registro.pav || registro.pdv ||
                          registro.leituraFiltro?.paf || registro.leituraFiltro?.pdf ||
                          registro.leituraValvula?.pav || registro.leituraValvula?.pdv;
        
        if (temPressao) {
          registrosComPressao++;
        }
        
        resultados.push({
          success: true,
          id: resultado.id,
          data: registro
        });
        registrosComGPSValido++;
        console.log(`✅ Registro inserido com GPS válido: ${resultado.id}`);
      } catch (error) {
        console.error('❌ Erro ao inserir registro individual:', error.message);
        
        if (error.message.includes('GPS')) {
          registrosRejeitados++;
          console.log(`🚫 Registro rejeitado por GPS inválido: Ramal ${registro.ramal}, Linha ${registro.linha}`);
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

    console.log(`📊 Batch concluído: ${sucessos} sucessos, ${falhas} falhas`);
    console.log(`📍 GPS Stats: ${registrosComGPSValido} com GPS válido, ${registrosRejeitados} rejeitados por GPS inválido`);
    console.log(`🔧 Pressão Stats: ${registrosComPressao} registros com dados de pressão`);

    return {
      total: registros.length,
      sucessos,
      falhas,
      registrosComGPSValido,
      registrosRejeitados,
      registrosComPressao,
      resultados
    };

  } catch (error) {
    console.error('❌ Repository: Erro no batch insert:', error);
    throw error;
  }
};

export default { 
  Inserir,
  InserirBatch
};