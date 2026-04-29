import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Gerenciador de dados offline com isolamento por usuário
 * Garante que cada usuário tenha seus próprios dados no AsyncStorage
 */

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
 * Salva múltiplos dados offline como array com chave específica do usuário
 * @param {string} baseKey - Chave base para identificar o tipo de dado
 * @param {Array} dataArray - Array de dados a serem salvos
 * @param {string} matricula - Matrícula do usuário
 * @param {Object} options - Opções adicionais
 * @returns {Promise<boolean>} - True se salvou com sucesso, false caso contrário
 */
export const saveOfflineDataArray = async (baseKey, dataArray, matricula, options = {}) => {
  try {
    if (!matricula) {
      console.error('❌ Matrícula é obrigatória para salvar dados offline');
      return false;
    }

    if (!baseKey) {
      console.error('❌ BaseKey é obrigatória para salvar dados offline');
      return false;
    }

    if (!Array.isArray(dataArray)) {
      console.error('❌ DataArray deve ser um array');
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

    // Adicionar metadados a cada item do array
    const dataWithMetadata = dataArray.map((item, index) => ({
      ...item,
      id: item.id || `${userSpecificKey}_${Date.now()}_${index}`, // Gerar ID único se não existir
      _metadata: {
        savedAt: new Date().toISOString(),
        matricula: matricula,
        baseKey: baseKey,
        version: '1.0',
        index: index,
        ...options.metadata
      },
      _syncStatus: item._syncStatus || options.syncStatus || 'pending',
      matricula: matricula // Garantir que a matrícula esteja sempre presente
    }));

    // Combinar com dados existentes se necessário
    let finalData;
    if (options.append) {
      finalData = [...existingData, ...dataWithMetadata];
    } else {
      finalData = dataWithMetadata;
    }

    await AsyncStorage.setItem(userSpecificKey, JSON.stringify(finalData));
    
    console.log(`✅ Array de dados salvos offline com sucesso: ${userSpecificKey}`);
    console.log(`📄 ${finalData.length} itens salvos`);
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao salvar array de dados offline:', error);
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
 * Busca dados offline específicos do usuário
 * @param {string} baseKey - Chave base para identificar o tipo de dado
 * @param {string} matricula - Matrícula do usuário
 * @returns {Promise<any|null>} - Dados encontrados ou null
 */
export const getOfflineData = async (baseKey, matricula) => {
  try {
    if (!matricula) {
      console.error('❌ Matrícula é obrigatória para buscar dados offline');
      return null;
    }

    const userSpecificKey = getUserSpecificKey(baseKey, matricula);
    const dataString = await AsyncStorage.getItem(userSpecificKey);
    
    if (!dataString) {
      console.log(`ℹ️ Nenhum dado offline encontrado para: ${userSpecificKey}`);
      return null;
    }

    const data = JSON.parse(dataString);
    console.log(`✅ Dados offline encontrados: ${userSpecificKey}`);
    
    return data;
  } catch (error) {
    console.error('❌ Erro ao buscar dados offline:', error);
    return null;
  }
};

/**
 * Remove dados offline específicos do usuário
 * @param {string} baseKey - Chave base para identificar o tipo de dado
 * @param {string} matricula - Matrícula do usuário
 * @returns {Promise<boolean>} - True se removeu com sucesso, false caso contrário
 */
export const removeOfflineData = async (baseKey, matricula) => {
  try {
    if (!matricula) {
      console.error('❌ Matrícula é obrigatória para remover dados offline');
      return false;
    }

    const userSpecificKey = getUserSpecificKey(baseKey, matricula);
    await AsyncStorage.removeItem(userSpecificKey);
    
    console.log(`✅ Dados offline removidos: ${userSpecificKey}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao remover dados offline:', error);
    return false;
  }
};

/**
 * Lista todas as chaves de dados offline do usuário
 * @param {string} matricula - Matrícula do usuário
 * @returns {Promise<Array>} - Array de chaves encontradas
 */
export const listUserOfflineKeys = async (matricula) => {
  try {
    if (!matricula) {
      console.error('❌ Matrícula é obrigatória para listar chaves offline');
      return [];
    }

    const allKeys = await AsyncStorage.getAllKeys();
    const userKeys = allKeys.filter(key => key.startsWith(`user_${matricula}_`));
    
    console.log(`📋 ${userKeys.length} chaves offline encontradas para usuário ${matricula}`);
    return userKeys;
  } catch (error) {
    console.error('❌ Erro ao listar chaves offline do usuário:', error);
    return [];
  }
};

/**
 * Limpa todos os dados offline do usuário
 * @param {string} matricula - Matrícula do usuário
 * @returns {Promise<boolean>} - True se limpou com sucesso, false caso contrário
 */
export const clearUserOfflineData = async (matricula) => {
  try {
    if (!matricula) {
      console.error('❌ Matrícula é obrigatória para limpar dados offline');
      return false;
    }

    const userKeys = await listUserOfflineKeys(matricula);
    
    if (userKeys.length === 0) {
      console.log(`ℹ️ Nenhum dado offline encontrado para limpar (usuário: ${matricula})`);
      return true;
    }

    await AsyncStorage.multiRemove(userKeys);
    
    console.log(`✅ ${userKeys.length} chaves de dados offline removidas para usuário ${matricula}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao limpar dados offline do usuário:', error);
    return false;
  }
};

// Exemplos de uso para diferentes tipos de dados

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
 * Busca dados de monitoramento de solo
 * @param {string} matricula - Matrícula do usuário
 * @returns {Promise<Array>}
 */
export const getMonitoramentoSolo = async (matricula) => {
  const data = await getOfflineData('monitoramento_solo', matricula);
  return Array.isArray(data) ? data : [];
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

/**
 * Busca dados gerais
 * @param {string} matricula - Matrícula do usuário
 * @returns {Promise<Array>}
 */
export const getDadosGerais = async (matricula) => {
  const data = await getOfflineData('dados_gerais', matricula);
  return Array.isArray(data) ? data : [];
};

