// backend/src/repositories/repository.manutencao.bomba.js
import { query } from "../database/sqlite.js";

// ========== INSERIR MANUTENÇÃO DE BOMBA ==========
const Inserir = async (data) => {
  try {
    console.log('📊 Repository: Inserindo manutenção de bomba:', data);

    // Validar dados obrigatórios
    const { fazenda, bomba, usuario, manutencoes } = data;
    if (!fazenda || !bomba || !usuario || !manutencoes) {
      throw new Error('Dados obrigatórios não fornecidos: fazenda, bomba, usuario, manutencoes');
    }

    // Gerar ID único se não fornecido
    const id = data.id || Date.now();

    // Processar timestamp no formato momento (YYYY-MM-DD HH:mm:ss)
    let momentoFormatado;
    try {
      const dataObj = data.momento ? new Date(data.momento) : (data.timestamp ? new Date(data.timestamp) : new Date());
      momentoFormatado = `${dataObj.getFullYear()}-${String(dataObj.getMonth() + 1).padStart(2, '0')}-${String(dataObj.getDate()).padStart(2, '0')} ${String(dataObj.getHours()).padStart(2, '0')}:${String(dataObj.getMinutes()).padStart(2, '0')}:${String(dataObj.getSeconds()).padStart(2, '0')}`;
    } catch (dateError) {
      console.error('❌ Erro ao processar timestamp:', dateError);
      const agora = new Date();
      momentoFormatado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')} ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`;
    }

    // Processar timestamp original
    let timestampFormatado;
    try {
      const tsObj = data.timestamp ? new Date(data.timestamp) : new Date();
      timestampFormatado = `${tsObj.getFullYear()}-${String(tsObj.getMonth() + 1).padStart(2, '0')}-${String(tsObj.getDate()).padStart(2, '0')} ${String(tsObj.getHours()).padStart(2, '0')}:${String(tsObj.getMinutes()).padStart(2, '0')}:${String(tsObj.getSeconds()).padStart(2, '0')}`;
    } catch (dateError) {
      timestampFormatado = momentoFormatado;
    }

    const sql = `
      INSERT INTO manutencao_bomba (
        id,
        fazenda,
        bomba,
        equipamento,
        usuario,
        matricula,
        momento,
        manutencoes,
        timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id,
      data.fazenda,
      data.bomba,
      data.equipamento || null,
      data.usuario,
      data.matricula || null,
      momentoFormatado,
      data.manutencoes,
      timestampFormatado
    ];

    console.log('📊 Repository: Executando SQL com parâmetros:', {
      id,
      fazenda: data.fazenda,
      bomba: data.bomba,
      equipamento: data.equipamento,
      usuario: data.usuario,
      matricula: data.matricula,
      momento: momentoFormatado,
      manutencoes: data.manutencoes,
      timestamp: timestampFormatado
    });

    const result = await query(sql, params, 'run');

    console.log('✅ SQLite run executado:', result);
    console.log('✅ Repository: Manutenção de bomba inserida com sucesso, ID:', id);

    return {
      id: id,
      lastID: result.lastID,
      changes: result.changes,
      success: true
    };

  } catch (error) {
    console.error('❌ Repository: Erro ao inserir manutenção de bomba:', error);
    throw error;
  }
};

// ========== INSERIR MÚLTIPLOS REGISTROS (BATCH) ==========
const InserirBatch = async (registros) => {
  try {
    console.log('📊 Repository: Inserindo batch de', registros.length, 'manutenções de bomba');

    const resultados = [];
    let registrosInseridos = 0;
    let registrosRejeitados = 0;
    
    for (const registro of registros) {
      try {
        const resultado = await Inserir(registro);
        
        resultados.push({
          success: true,
          id: resultado.id,
          data: registro
        });
        registrosInseridos++;
        console.log(`✅ Registro inserido: ${resultado.id}`);
      } catch (error) {
        console.error('❌ Erro ao inserir registro individual:', error.message);
        
        registrosRejeitados++;
        console.log(`🚫 Registro rejeitado: Bomba ${registro.bomba}`);
        
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

    return {
      total: registros.length,
      sucessos,
      falhas,
      registrosInseridos,
      registrosRejeitados,
      resultados
    };

  } catch (error) {
    console.error('❌ Repository: Erro no batch insert:', error);
    throw error;
  }
};

// ========== LISTAR MANUTENÇÕES DE BOMBA ==========
const Listar = async (filtros = {}) => {
  try {
    console.log('📊 Repository: Listando manutenções de bomba com filtros:', filtros);

    let sql = 'SELECT * FROM manutencao_bomba WHERE 1=1';
    const params = [];

    // Aplicar filtros
    if (filtros.fazenda) {
      sql += ' AND fazenda = ?';
      params.push(filtros.fazenda);
    }

    if (filtros.bomba) {
      sql += ' AND bomba LIKE ?';
      params.push(`%${filtros.bomba}%`);
    }

    if (filtros.equipamento) {
      sql += ' AND equipamento = ?';
      params.push(filtros.equipamento);
    }

    if (filtros.usuario) {
      sql += ' AND usuario LIKE ?';
      params.push(`%${filtros.usuario}%`);
    }

    if (filtros.matricula) {
      sql += ' AND matricula = ?';
      params.push(filtros.matricula);
    }

    if (filtros.manutencoes) {
      sql += ' AND manutencoes = ?';
      params.push(filtros.manutencoes);
    }

    if (filtros.dataInicio) {
      sql += ' AND momento >= ?';
      params.push(filtros.dataInicio);
    }

    if (filtros.dataFim) {
      sql += ' AND momento <= ?';
      params.push(filtros.dataFim);
    }

    // Ordenar por momento decrescente
    sql += ' ORDER BY momento DESC';

    // Limite de registros
    if (filtros.limit) {
      sql += ' LIMIT ?';
      params.push(parseInt(filtros.limit));
    }

    const result = await query(sql, params, 'all');

    console.log(`✅ Repository: ${result.length} manutenções de bomba encontradas`);

    return result;

  } catch (error) {
    console.error('❌ Repository: Erro ao listar manutenções de bomba:', error);
    throw error;
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (id) => {
  try {
    console.log('📊 Repository: Buscando manutenção de bomba por ID:', id);

    const sql = 'SELECT * FROM manutencao_bomba WHERE id = ?';
    const result = await query(sql, [id], 'get');

    return result || null;

  } catch (error) {
    console.error('❌ Repository: Erro ao buscar manutenção de bomba:', error);
    throw error;
  }
};




// ========== DELETAR POR ID ==========
const Deletar = async (id) => {
  try {
    console.log('📊 Repository: Deletando manutenção de bomba:', id);

    const sql = 'DELETE FROM manutencao_bomba WHERE id = ?';
    const result = await query(sql, [id], 'run');

    return { 
      id, 
      changes: result.changes,
      success: result.changes > 0
    };

  } catch (error) {
    console.error('❌ Repository: Erro ao deletar manutenção de bomba:', error);
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