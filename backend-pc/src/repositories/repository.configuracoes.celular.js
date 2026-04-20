// backend/src/repositories/repository.configuracoes.celular.js--
import { query } from "../database/sqlite.js";

// ========== INSERIR CONFIGURAÇÃO DO CELULAR ==========
const Inserir = async (data) => {
  try {
    console.log('📱 Repository: Inserindo configuração do celular:', data);

    // Validar dados obrigatórios
    const { nome_celular, versao_app, nome_usuario } = data;
    if (!nome_celular || !versao_app || !nome_usuario) {
      throw new Error('Dados obrigatórios não fornecidos: nome_celular, versao_app, nome_usuario');
    }

    // Processar timestamp no formato (YYYY-MM-DD HH:mm:ss)
    let dataHoraFormatada;
    try {
      const dataObj = data.data_hora ? new Date(data.data_hora) : new Date();
      dataHoraFormatada = `${dataObj.getFullYear()}-${String(dataObj.getMonth() + 1).padStart(2, '0')}-${String(dataObj.getDate()).padStart(2, '0')} ${String(dataObj.getHours()).padStart(2, '0')}:${String(dataObj.getMinutes()).padStart(2, '0')}:${String(dataObj.getSeconds()).padStart(2, '0')}`;
    } catch (dateError) {
      console.error('❌ Erro ao processar timestamp:', dateError);
      const agora = new Date();
      dataHoraFormatada = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')} ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`;
    }

    const sql = `
      INSERT INTO configuracoes_celular (
        nome_celular,
        wifi_nome,
        versao_app,
        nome_usuario,
        data_hora,
        sistema_operacional,
        versao_so,
        total_logins
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `;

    const params = [
      data.nome_celular,
      data.wifi_nome || null,
      data.versao_app,
      data.nome_usuario,
      dataHoraFormatada,
      data.sistema_operacional || null,
      data.versao_so || null
    ];

    console.log('📱 Repository: Executando SQL com parâmetros:', {
      nome_celular: data.nome_celular,
      wifi_nome: data.wifi_nome,
      versao_app: data.versao_app,
      nome_usuario: data.nome_usuario,
      data_hora: dataHoraFormatada,
      sistema_operacional: data.sistema_operacional,
      versao_so: data.versao_so,
      total_logins: 1
    });

    const result = await query(sql, params, 'run');

    console.log('✅ SQLite run executado:', result);
    console.log('✅ Repository: Configuração do celular inserida com contador inicial = 1:', result.lastID);

    return {
      id: result.lastID,
      changes: result.changes,
      success: true
    };

  } catch (error) {
    console.error('❌ Repository: Erro ao inserir configuração do celular:', error);
    throw error;
  }
};

// ========== VERIFICAR SE JÁ EXISTE CONFIGURAÇÃO ==========
const VerificarExistente = async (nome_celular, nome_usuario) => {
  try {
    const sql = `
      SELECT 
        id,
        nome_celular,
        nome_usuario,
        data_hora,
        total_logins,
        created_at
      FROM configuracoes_celular
      WHERE nome_celular = ? AND nome_usuario = ?
      ORDER BY data_hora DESC
      LIMIT 1
    `;

    console.log('🔍 Repository: Verificando se já existe configuração para:', {
      nome_celular,
      nome_usuario
    });
    
    const result = await query(sql, [nome_celular, nome_usuario], 'get');
    
    console.log('🔍 Repository: Configuração existente encontrada:', !!result);
    if (result) {
      console.log('📊 Total de logins atual:', result.total_logins);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Repository: Erro ao verificar configuração existente:', error);
    throw error;
  }
};

// ========== ATUALIZAR ÚLTIMO ACESSO E INCREMENTAR CONTADOR ==========
const AtualizarUltimoAcesso = async (id) => {
  try {
    const sql = `
      UPDATE configuracoes_celular 
      SET data_hora = ?, 
          total_logins = total_logins + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const agora = new Date();
    const dataHoraFormatada = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')} ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`;

    console.log('🔄 Repository: Atualizando último acesso e incrementando contador ID:', id);
    
    const result = await query(sql, [dataHoraFormatada, id], 'run');
    
    console.log('✅ Repository: Último acesso atualizado e contador incrementado, changes:', result.changes);
    
    // Buscar o valor atualizado para mostrar no log
    const sqlGet = `SELECT total_logins FROM configuracoes_celular WHERE id = ?`;
    const updatedRecord = await query(sqlGet, [id], 'get');
    if (updatedRecord) {
      console.log('📊 Novo total de logins:', updatedRecord.total_logins);
    }
    
    return {
      id,
      changes: result.changes,
      success: result.changes > 0,
      novo_total_logins: updatedRecord?.total_logins || 'N/A'
    };
    
  } catch (error) {
    console.error('❌ Repository: Erro ao atualizar último acesso:', error);
    throw error;
  }
};

// ========== LISTAR CONFIGURAÇÕES DOS CELULARES ==========
const Listar = async (filtros = {}) => {
  try {
    let sql = `
      SELECT 
        id,
        nome_celular,
        wifi_nome,
        versao_app,
        nome_usuario,
        data_hora,
        sistema_operacional,
        versao_so,
        total_logins,
        created_at
      FROM configuracoes_celular
      WHERE 1=1
    `;
    
    const params = [];
    
    if (filtros.nome_usuario) {
      sql += ` AND nome_usuario = ?`;
      params.push(filtros.nome_usuario);
    }
    
    if (filtros.nome_celular) {
      sql += ` AND nome_celular LIKE ?`;
      params.push(`%${filtros.nome_celular}%`);
    }
    
    if (filtros.versao_app) {
      sql += ` AND versao_app = ?`;
      params.push(filtros.versao_app);
    }
    
    if (filtros.dataInicio) {
      sql += ` AND data_hora >= ?`;
      params.push(filtros.dataInicio);
    }
    
    if (filtros.dataFim) {
      sql += ` AND data_hora <= ?`;
      params.push(filtros.dataFim);
    }
    
    sql += ` ORDER BY data_hora DESC`;
    
    if (filtros.limit) {
      sql += ` LIMIT ?`;
      params.push(parseInt(filtros.limit));
    }

    console.log('🔍 Repository: Listando configurações de celulares com filtros:', filtros);
    
    const result = await query(sql, params, 'all');
    
    console.log('✅ Repository: Encontradas', result.length, 'configurações de celulares');
    
    return result;
    
  } catch (error) {
    console.error('❌ Repository: Erro ao listar configurações de celulares:', error);
    throw error;
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (id) => {
  try {
    const sql = `
      SELECT 
        id,
        nome_celular,
        wifi_nome,
        versao_app,
        nome_usuario,
        data_hora,
        sistema_operacional,
        versao_so,
        total_logins,
        created_at
      FROM configuracoes_celular
      WHERE id = ?
    `;

    console.log('🔍 Repository: Buscando configuração por ID:', id);
    
    const result = await query(sql, [id], 'get');
    
    console.log('✅ Repository: Configuração encontrada:', !!result);
    
    return result;
    
  } catch (error) {
    console.error('❌ Repository: Erro ao buscar configuração por ID:', error);
    throw error;
  }
};

// ========== ATUALIZAR CONFIGURAÇÃO ==========
const Atualizar = async (id, dadosAtualizacao) => {
  try {
    const campos = [];
    const params = [];
    
    if (dadosAtualizacao.nome_celular !== undefined) {
      campos.push('nome_celular = ?');
      params.push(dadosAtualizacao.nome_celular);
    }
    
    if (dadosAtualizacao.wifi_nome !== undefined) {
      campos.push('wifi_nome = ?');
      params.push(dadosAtualizacao.wifi_nome);
    }
    
    if (dadosAtualizacao.versao_app !== undefined) {
      campos.push('versao_app = ?');
      params.push(dadosAtualizacao.versao_app);
    }
    
    if (dadosAtualizacao.nome_usuario !== undefined) {
      campos.push('nome_usuario = ?');
      params.push(dadosAtualizacao.nome_usuario);
    }
    
    if (campos.length === 0) {
      throw new Error('Nenhum campo para atualizar foi fornecido');
    }
    
    campos.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    const sql = `
      UPDATE configuracoes_celular 
      SET ${campos.join(', ')}
      WHERE id = ?
    `;

    console.log('🔄 Repository: Atualizando configuração ID:', id);
    
    const result = await query(sql, params, 'run');
    
    console.log('✅ Repository: Configuração atualizada, changes:', result.changes);
    
    return {
      id,
      changes: result.changes,
      success: result.changes > 0
    };
    
  } catch (error) {
    console.error('❌ Repository: Erro ao atualizar configuração:', error);
    throw error;
  }
};

// ========== DELETAR CONFIGURAÇÃO ==========
const Deletar = async (id) => {
  try {
    const sql = `DELETE FROM configuracoes_celular WHERE id = ?`;

    console.log('🗑️ Repository: Deletando configuração ID:', id);
    
    const result = await query(sql, [id], 'run');
    
    console.log('✅ Repository: Configuração deletada, changes:', result.changes);
    
    return {
      id,
      changes: result.changes,
      success: result.changes > 0
    };
    
  } catch (error) {
    console.error('❌ Repository: Erro ao deletar configuração:', error);
    throw error;
  }
};

// ========== BUSCAR ÚLTIMA CONFIGURAÇÃO POR USUÁRIO ==========
const BuscarUltimaPorUsuario = async (nomeUsuario) => {
  try {
    const sql = `
      SELECT 
        id,
        nome_celular,
        wifi_nome,
        versao_app,
        nome_usuario,
        data_hora,
        sistema_operacional,
        versao_so,
        total_logins,
        created_at
      FROM configuracoes_celular
      WHERE nome_usuario = ?
      ORDER BY data_hora DESC
      LIMIT 1
    `;

    console.log('🔍 Repository: Buscando última configuração do usuário:', nomeUsuario);
    
    const result = await query(sql, [nomeUsuario], 'get');
    
    console.log('✅ Repository: Última configuração encontrada:', !!result);
    
    return result;
    
  } catch (error) {
    console.error('❌ Repository: Erro ao buscar última configuração por usuário:', error);
    throw error;
  }
};

export default { 
  Inserir,
  Listar,
  BuscarPorId,
  Atualizar,
  Deletar,
  BuscarUltimaPorUsuario,
  VerificarExistente,
  AtualizarUltimoAcesso
};