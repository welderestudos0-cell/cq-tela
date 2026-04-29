import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  MONITORAMENTOS: 'monitoramentos_offline',
  LIMPEZAS: 'limpezas_offline',
  VAZAO: 'dadosVazaoLinhas',
  MANUTENCOES: 'manutencoes_offline',
};

// Função específica para limpar dados que já foram sincronizados
export const cleanSyncedData = async () => {
  console.log('🧹 Iniciando limpeza de dados sincronizados...');
  
  try {
    const offlineData = await getOfflineMonitoramentos();
    
    if (!offlineData || offlineData.length === 0) {
      console.log('✅ Nenhum dado offline encontrado');
      return {
        success: true,
        itemsRemoved: 0,
        message: 'Nenhum dado para limpar'
      };
    }

    console.log(`📊 Total de registros encontrados: ${offlineData.length}`);

    // Filtrar apenas dados que NÃO foram sincronizados
    const pendingData = offlineData.filter(item => {
      // Manter item se:
      // 1. Não tem serverId (nunca foi sincronizado)
      // 2. Status não é "synced"
      // 3. Não tem data de sincronização
      // 4. Tem erro de sincronização
      return !item._serverId || 
             item._syncStatus !== 'synced' || 
             !item._syncedAt ||
             item._syncError;
    });

    const syncedCount = offlineData.length - pendingData.length;
    
    console.log(`🗑️ Removendo ${syncedCount} registros já sincronizados`);
    console.log(`📝 Mantendo ${pendingData.length} registros pendentes`);

    // Salvar apenas os dados não sincronizados
    await AsyncStorage.setItem(STORAGE_KEYS.MONITORAMENTOS, JSON.stringify(pendingData));

    // Verificar se realmente foi salvo corretamente
    const verification = await getOfflineMonitoramentos();
    const actualRemoved = offlineData.length - verification.length;

    console.log(`✅ Limpeza concluída! ${actualRemoved} itens removidos`);
    
    return {
      success: true,
      itemsRemoved: actualRemoved,
      remainingItems: verification.length,
      syncedRemoved: syncedCount,
      pendingKept: pendingData.length
    };

  } catch (error) {
    console.error('❌ Erro na limpeza de dados sincronizados:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Função para forçar limpeza completa (use com cuidado)
export const forceCompleteCleanup = async () => {
  console.log('⚠️ ATENÇÃO: Limpeza COMPLETA dos dados offline');
  
  try {
    const beforeData = await getOfflineMonitoramentos();
    const totalCount = beforeData ? beforeData.length : 0;

    await AsyncStorage.removeItem(STORAGE_KEYS.MONITORAMENTOS);

    console.log(`🗑️ ${totalCount} registros removidos completamente`);
    
    return {
      success: true,
      itemsRemoved: totalCount,
      message: 'Todos os dados offline foram removidos'
    };

  } catch (error) {
    console.error('❌ Erro na limpeza completa:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Função para diagnóstico detalhado
export const diagnosticSyncStatus = async () => {
  console.log('🔍 Iniciando diagnóstico de sincronização...');
  
  try {
    const offlineData = await getOfflineMonitoramentos();
    
    if (!offlineData || offlineData.length === 0) {
      return {
        success: true,
        totalRecords: 0,
        analysis: {
          synced: 0,
          pending: 0,
          error: 0,
          orphaned: 0
        },
        issues: []
      };
    }

    const analysis = {
      synced: 0,
      pending: 0,
      error: 0,
      orphaned: 0
    };

    const issues = [];

    offlineData.forEach((item, index) => {
      // Análise de status
      switch (item._syncStatus) {
        case 'synced':
          analysis.synced++;
          break;
        case 'pending':
          analysis.pending++;
          break;
        case 'error':
          analysis.error++;
          break;
        default:
          analysis.orphaned++;
      }

      // Detectar inconsistências
      if (item._serverId && item._syncStatus === 'synced' && item._syncedAt) {
        // Este item deveria ter sido removido
        issues.push({
          type: 'SHOULD_BE_REMOVED',
          index,
          id: item.id,
          serverId: item._serverId,
          syncedAt: item._syncedAt,
          message: 'Item sincronizado que deveria ter sido removido'
        });
      }

      if (item._serverId && item._syncStatus !== 'synced') {
        issues.push({
          type: 'STATUS_MISMATCH',
          index,
          id: item.id,
          serverId: item._serverId,
          status: item._syncStatus,
          message: 'Item tem serverId mas status não é synced'
        });
      }
    });

    console.log('📊 Análise completa:', analysis);
    console.log('⚠️ Issues encontradas:', issues.length);

    return {
      success: true,
      totalRecords: offlineData.length,
      analysis,
      issues,
      needsCleanup: issues.filter(i => i.type === 'SHOULD_BE_REMOVED').length > 0
    };

  } catch (error) {
    console.error('❌ Erro no diagnóstico:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Função auxiliar para obter dados offline
const getOfflineMonitoramentos = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MONITORAMENTOS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Erro ao buscar dados offline:', error);
    return [];
  }
};

// Atualizar a função de limpeza manual existente
export const executeManualCleanup = async () => {
  console.log('🧹 Iniciando limpeza manual completa...');
  
  try {
    // Primeiro, executar diagnóstico
    const diagnostic = await diagnosticSyncStatus();
    
    if (!diagnostic.success) {
      return diagnostic;
    }

    console.log('📊 Diagnóstico inicial:', diagnostic.analysis);

    // Se há dados que deveriam ser removidos, limpar
    if (diagnostic.needsCleanup) {
      console.log('🔧 Dados sincronizados encontrados, executando limpeza...');
      const cleanupResult = await cleanSyncedData();
      
      if (!cleanupResult.success) {
        return cleanupResult;
      }

      // Obter estatísticas após limpeza
      const statsAfter = await getStorageStats();
      
      return {
        success: true,
        itemsRemoved: cleanupResult.itemsRemoved,
        statsAfter,
        diagnostic: diagnostic.analysis,
        message: `${cleanupResult.itemsRemoved} dados sincronizados foram removidos`
      };
    }

    // Se não há dados para limpar, executar limpeza padrão (dados antigos)
    return await executeStandardCleanup();

  } catch (error) {
    console.error('❌ Erro na limpeza manual:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Limpeza padrão (dados antigos)
const executeStandardCleanup = async () => {
  console.log('🧹 Executando limpeza padrão de dados antigos...');

  try {
    const offlineData = await getOfflineMonitoramentos();

    if (!offlineData || offlineData.length === 0) {
      return {
        success: true,
        itemsRemoved: 0,
        statsAfter: await getStorageStats(),
        message: 'Nenhum dado para limpar'
      };
    }

    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    // Filtrar dados para manter
    const filteredData = offlineData.filter(item => {
      // Manter se não foi sincronizado
      if (item._syncStatus !== 'synced' || !item._serverId) {
        return true;
      }

      // Manter se é recente (menos de 15 dias)
      const itemDate = new Date(item._syncedAt || item._timestamp);
      return itemDate > fifteenDaysAgo;
    });

    const removedCount = offlineData.length - filteredData.length;

    if (removedCount > 0) {
      await AsyncStorage.setItem(STORAGE_KEYS.MONITORAMENTOS, JSON.stringify(filteredData));
    }

    const statsAfter = await getStorageStats();

    return {
      success: true,
      itemsRemoved: removedCount,
      statsAfter,
      message: `${removedCount} dados antigos foram removidos`
    };

  } catch (error) {
    console.error('❌ Erro na limpeza padrão:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Obter estatísticas de armazenamento
export const getStorageStats = async () => {
  try {
    const offlineData = await getOfflineMonitoramentos();
    
    if (!offlineData || offlineData.length === 0) {
      return {
        totalRecords: 0,
        syncedRecords: 0,
        pendingRecords: 0,
        errorRecords: 0,
        oldestRecord: null,
        newestRecord: null
      };
    }

    const stats = {
      totalRecords: offlineData.length,
      syncedRecords: 0,
      pendingRecords: 0,
      errorRecords: 0,
      oldestRecord: null,
      newestRecord: null
    };

    let oldestDate = null;
    let newestDate = null;

    offlineData.forEach(item => {
      // Contar por status
      switch (item._syncStatus) {
        case 'synced':
          stats.syncedRecords++;
          break;
        case 'pending':
          stats.pendingRecords++;
          break;
        case 'error':
          stats.errorRecords++;
          break;
      }

      // Encontrar datas mais antiga e mais recente
      const itemDate = new Date(item.momento || item._timestamp);
      
      if (!oldestDate || itemDate < oldestDate) {
        oldestDate = itemDate;
      }
      
      if (!newestDate || itemDate > newestDate) {
        newestDate = itemDate;
      }
    });

    stats.oldestRecord = oldestDate;
    stats.newestRecord = newestDate;

    return stats;

  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    return null;
  }
};

// *** NOVA FUNÇÃO: LIMPEZA AUTOMÁTICA DE DADOS COM +15 DIAS ***
// Limpa TODOS os tipos de dados (Monitoramento, Limpeza, Vazão, Manutenção)
export const cleanOldDataFromCache = async () => {
  console.log('🗑️ Iniciando limpeza automática de dados com +15 dias...');

  const DAYS_TO_KEEP = 15;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - DAYS_TO_KEEP);

  let totalRemoved = 0;
  const results = {};

  try {
    // Iterar por todas as chaves de armazenamento
    for (const [keyName, storageKey] of Object.entries(STORAGE_KEYS)) {
      try {
        console.log(`\n🔍 Processando: ${keyName} (${storageKey})`);

        const data = await AsyncStorage.getItem(storageKey);
        if (!data) {
          console.log(`   ✅ ${keyName}: Nenhum dado encontrado`);
          results[keyName] = { found: 0, kept: 0, removed: 0 };
          continue;
        }

        const parsedData = JSON.parse(data);
        if (!Array.isArray(parsedData) || parsedData.length === 0) {
          console.log(`   ✅ ${keyName}: Array vazio`);
          results[keyName] = { found: 0, kept: 0, removed: 0 };
          continue;
        }

        const originalCount = parsedData.length;
        console.log(`   📊 ${keyName}: ${originalCount} registros encontrados`);

        // Filtrar dados para MANTER apenas:
        // 1. Dados NÃO sincronizados (pendentes ou com erro)
        // 2. Dados sincronizados com MENOS de 30 dias
        const filteredData = parsedData.filter(item => {
          // MANTER se NÃO foi sincronizado
          if (item._syncStatus !== 'synced' || !item._serverId) {
            return true;
          }

          // MANTER se é recente (menos de 30 dias)
          const itemDate = new Date(
            item._syncedAt ||
            item.timestamp ||
            item.momento ||
            item.dataColeta ||
            item._timestamp
          );

          const isRecent = itemDate > thirtyDaysAgo;

          if (!isRecent) {
            console.log(`   🗑️ Removendo item antigo: ${item.id || 'sem ID'} (${itemDate.toLocaleDateString()})`);
          }

          return isRecent;
        });

        const removedCount = originalCount - filteredData.length;

        // Salvar dados filtrados
        if (removedCount > 0) {
          await AsyncStorage.setItem(storageKey, JSON.stringify(filteredData));
          console.log(`   ✅ ${keyName}: ${removedCount} registros removidos, ${filteredData.length} mantidos`);
        } else {
          console.log(`   ✅ ${keyName}: Nenhum dado antigo para remover`);
        }

        totalRemoved += removedCount;
        results[keyName] = {
          found: originalCount,
          kept: filteredData.length,
          removed: removedCount
        };

      } catch (error) {
        console.error(`   ❌ Erro ao processar ${keyName}:`, error.message);
        results[keyName] = { error: error.message };
      }
    }

    console.log('\n✅ Limpeza automática concluída!');
    console.log(`🗑️ Total de registros removidos: ${totalRemoved}`);
    console.log('📊 Resumo por tipo:', results);

    return {
      success: true,
      totalRemoved,
      details: results,
      daysKept: DAYS_TO_KEEP,
      message: `${totalRemoved} registros antigos (>${DAYS_TO_KEEP} dias) foram removidos do cache`
    };

  } catch (error) {
    console.error('❌ Erro na limpeza automática:', error);
    return {
      success: false,
      error: error.message,
      totalRemoved,
      details: results
    };
  }
};

// Hook para limpeza automática ao iniciar o app
export const useAutoCleanup = () => {
  const startAutoCleanup = async () => {
    console.log('🔄 Iniciando serviço de limpeza automática...');

    // Executar limpeza imediatamente ao iniciar
    await cleanOldDataFromCache();

    // Configurar intervalo para limpeza automática a cada 24 horas
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 horas em ms

    const interval = setInterval(async () => {
      console.log('⏰ Executando limpeza automática programada (24h)...');
      await cleanOldDataFromCache();
    }, TWENTY_FOUR_HOURS);

    console.log('✅ Serviço de limpeza automática configurado (executa a cada 24h)');
    return interval;
  };

  return { startAutoCleanup };
};