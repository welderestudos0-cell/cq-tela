// Funções auxiliares para salvamento offline com isolamento por usuário

// Função auxiliar para gerar chaves específicas do usuário
export const getUserSpecificKey = (baseKey, matricula) => {
  if (!matricula) {
    console.warn('⚠️ Matrícula não fornecida para getUserSpecificKey. Usando chave sem prefixo.');
    return baseKey;
  }
  return `user_${matricula}_${baseKey}`;
};

/**
 * Salva dados offline com chave específica do usuário
 * @param {string} baseKey - Chave base para identificar o tipo de dado
 * @param {any} data - Dados a serem salvos
 * @param {string} matricula - Matrícula do usuário
 * @param {Object} options - Opções adicionais
 * @returns {Promise<boolean>} - True se salvou com sucesso, false caso contrário
 */
export const saveOfflineData = async (baseKey, data, matricula, options = {}) => {
  try {
    if (!matricula) {
      console.error('❌ Matrícula é obrigatória para salvar dados offline');
      return false;
    }

    if (!baseKey) {
      console.error('❌ BaseKey é obrigatória para salvar dados offline');
      return false;
    }

    const userSpecificKey = getUserSpecificKey(baseKey, matricula);
    
    // Adicionar metadados aos dados
    const dataWithMetadata = {
      ...data,
      _metadata: {
        savedAt: new Date().toISOString(),
        matricula: matricula,
        baseKey: baseKey,
        version: '1.0',
        ...options.metadata
      },
      _syncStatus: options.syncStatus || 'pending',
      matricula: matricula // Garantir que a matrícula esteja sempre presente
    };

    await AsyncStorage.setItem(userSpecificKey, JSON.stringify(dataWithMetadata));
    
    console.log(`✅ Dados salvos offline com sucesso: ${userSpecificKey}`);
    console.log('📄 Dados salvos:', dataWithMetadata);
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao salvar dados offline:', error);
    return false;
  }
};

/**
 * Adiciona um item a um array existente de dados offline
 * @param {string} baseKey - Chave base para identificar o tipo de dado
 * @param {any} newItem - Novo item a ser adicionado
 * @param {string} matricula - Matrícula do usuário
 * @param {Object} options - Opções adicionais
 * @returns {Promise<boolean>} - True se adicionou com sucesso, false caso contrário
 */
export const addOfflineDataItem = async (baseKey, newItem, matricula, options = {}) => {
  try {
    if (!matricula) {
      console.error('❌ Matrícula é obrigatória para adicionar dados offline');
      return false;
    }

    const userSpecificKey = getUserSpecificKey(baseKey, matricula);
    
    // Buscar dados existentes
    let existingData = [];
    try {
      const existingDataString = await AsyncStorage.getItem(userSpecificKey);
      if (existingDataString) {
        existingData = JSON.parse(existingDataString);
        if (!Array.isArray(existingData)) {
          existingData = [];
        }
      }
    } catch (error) {
      console.warn('⚠️ Erro ao buscar dados existentes, criando novo array:', error);
      existingData = [];
    }

    // Adicionar metadados ao novo item
    const itemWithMetadata = {
      ...newItem,
      id: newItem.id || `${userSpecificKey}_${Date.now()}_${existingData.length}`,
      _metadata: {
        savedAt: new Date().toISOString(),
        matricula: matricula,
        baseKey: baseKey,
        version: '1.0',
        index: existingData.length,
        ...options.metadata
      },
      _syncStatus: newItem._syncStatus || options.syncStatus || 'pending',
      matricula: matricula
    };

    // Adicionar ao array existente
    existingData.push(itemWithMetadata);

    await AsyncStorage.setItem(userSpecificKey, JSON.stringify(existingData));
    
    console.log(`✅ Item adicionado aos dados offline: ${userSpecificKey}`);
    console.log('📄 Item adicionado:', itemWithMetadata);
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao adicionar item aos dados offline:', error);
    return false;
  }
};

/**
 * Salva dados de monitoramento de solo
 * @param {Object} monitoramentoData - Dados do monitoramento
 * @param {string} matricula - Matrícula do usuário
 * @returns {Promise<boolean>}
 */
export const saveMonitoramentoSolo = async (monitoramentoData, matricula) => {
  return await addOfflineDataItem('monitoramento_solo', {
    ...monitoramentoData,
    tipo: 'Monitoramento de Solo',
    timestamp: new Date().toISOString()
  }, matricula);
};

/**
 * Salva dados gerais
 * @param {Object} dadosGerais - Dados gerais
 * @param {string} matricula - Matrícula do usuário
 * @returns {Promise<boolean>}
 */
export const saveDadosGerais = async (dadosGerais, matricula) => {
  return await addOfflineDataItem('dados_gerais', {
    ...dadosGerais,
    tipo: 'Dados Gerais',
    timestamp: new Date().toISOString()
  }, matricula);
};

