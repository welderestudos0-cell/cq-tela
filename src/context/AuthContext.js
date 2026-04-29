// src/contexts/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  console.log('🔄 AuthProvider renderizado - Estado atual:', {
    isLoading,
    isAuthenticated,
    hasUser: !!user
  });

  // � NOVO: Múltiplas estratégias de backup para evitar "Usuário Padrão"
  const saveUserDataWithBackups = async (userData, token) => {
  try {
    const dataToSave = JSON.stringify(userData);
    const timestamp = Date.now();
    
    // ✅ CONVERTER TODOS OS VALORES PARA STRING
    const userId = String(userData.id || userData.ID_USER || userData.matricula);
    const userName = String(userData.nome || userData.name || userData.NAME || '');
    const userEmail = String(userData.email || userData.EMAIL || '');
    
    // Salvar em múltiplas chaves para redundância
    await AsyncStorage.multiSet([
      ['userData', dataToSave],
      ['userProfile', dataToSave],
      ['lastValidUser', dataToSave],
      ['userBackup_' + timestamp, dataToSave],
      ['userToken', token],
      ['userId', userId],                    // ← AGORA É STRING
      ['userName', userName],                 // ← AGORA É STRING
      ['userEmail', userEmail],               // ← AGORA É STRING
      ['lastLoginTimestamp', timestamp.toString()]
    ]);
    
    console.log('💾 Dados do usuário salvos com múltiplos backups');
    return true;
  } catch (error) {
    console.error('❌ Erro ao salvar dados do usuário:', error);
    return false;
  }
};

  // 🔥 NOVO: Recuperar dados com múltiplas tentativas
  const getUserDataWithFallbacks = async () => {
    try {
      // Tentar recuperar de múltiplas fontes
      const keys = ['userData', 'userProfile', 'lastValidUser'];
      
      for (const key of keys) {
        try {
          const data = await AsyncStorage.getItem(key);
          if (data && data !== 'null') {
            const parsed = JSON.parse(data);
            if (parsed && (parsed.nome || parsed.name || parsed.NAME)) {
              console.log(`✅ Dados recuperados de ${key}:`, parsed.nome || parsed.name);
              return parsed;
            }
          }
        } catch (error) {
          console.log(`⚠️ Falha ao recuperar de ${key}, tentando próximo...`);
        }
      }
      
      // Último recurso: buscar backups por timestamp
      const allKeys = await AsyncStorage.getAllKeys();
      const backupKeys = allKeys.filter(key => key.startsWith('userBackup_')).sort().reverse();
      
      for (const backupKey of backupKeys.slice(0, 5)) { // Últimos 5 backups
        try {
          const data = await AsyncStorage.getItem(backupKey);
          if (data) {
            const parsed = JSON.parse(data);
            if (parsed && (parsed.nome || parsed.name)) {
              console.log(`✅ Dados recuperados do backup ${backupKey}`);
              return parsed;
            }
          }
        } catch (error) {
          console.log(`⚠️ Backup ${backupKey} corrompido`);
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ Erro ao recuperar dados do usuário:', error);
      return null;
    }
  };

  // �🔍 Verificar se token é válido
  const isTokenValid = (token) => {
    try {
      if (!token || token === 'null' || token === 'undefined') {
        console.log('❌ Token inválido:', token);
        return false;
      }

      console.log('🔑 Token válido encontrado');
      return true;
    } catch (error) {
      console.error('❌ Erro ao verificar token:', error);
      return false;
    }
  };

  // 🚀 Verificar autenticação ao iniciar app
  const checkAuthStatus = async () => {
    try {
      console.log('🔍 ==> INICIANDO VERIFICAÇÃO DE AUTENTICAÇÃO...');
      setIsLoading(true);

      // 🔥 NOVO: Usar sistema de fallbacks para recuperar dados
      const savedUserData = await getUserDataWithFallbacks();
      const userToken = await AsyncStorage.getItem('userToken');

      console.log('📱 Dados recuperados:', {
        userToken: userToken ? `${userToken.substring(0, 20)}...` : 'NULL',
        userData: savedUserData ? `${savedUserData.nome || savedUserData.name}` : 'NULL'
      });

      if (savedUserData && userToken && isTokenValid(userToken)) {
        setUser(savedUserData);
        setIsAuthenticated(true);
        
        console.log('✅ ==> USUÁRIO AUTENTICADO COM SUCESSO:', {
          nome: savedUserData.nome || savedUserData.name,
          matricula: savedUserData.matricula,
          fazenda: savedUserData.fazenda
        });
        
        return true;
      } else if (savedUserData && !userToken) {
        // Se tem dados do usuário mas não tem token, manter usuário mas como não autenticado
        console.log('⚠️ Dados do usuário encontrados mas sem token válido');
        setUser(savedUserData);
        setIsAuthenticated(false);
        return false;
      } else {
        console.log('❌ Nenhum dado válido encontrado');
        await clearAuthData();
        return false;
      }
    } catch (error) {
      console.error('❌ ERRO CRÍTICO na verificação de autenticação:', error);
      // Mesmo com erro, tentar recuperar dados do usuário
      try {
        const fallbackData = await getUserDataWithFallbacks();
        if (fallbackData) {
          console.log('🔄 Recuperação de emergência bem-sucedida');
          setUser(fallbackData);
          setIsAuthenticated(false); // Sem token, não autenticado
        }
      } catch (fallbackError) {
        console.error('❌ Falha na recuperação de emergência:', fallbackError);
        await clearAuthData();
      }
      return false;
    } finally {
      console.log('🔄 Finalizando verificação, isLoading = false');
      setIsLoading(false);
    }
  };

  // 🔐 Fazer login
  const signIn = async (token, userData) => {
    try {
      console.log('🔐 ==> INICIANDO PROCESSO DE LOGIN...');
      console.log('📤 Dados para salvar:', {
        token: token ? `${token.substring(0, 20)}...` : 'NULL',
        nome: userData.nome || userData.name,
        matricula: userData.matricula
      });
      
      // 🔥 NOVO: Usar sistema de múltiplos backups
      const saveSuccess = await saveUserDataWithBackups(userData, token);
      
      if (saveSuccess) {
        setUser(userData);
        setIsAuthenticated(true);
        
        console.log('✅ ==> LOGIN REALIZADO COM SUCESSO E DADOS SALVOS');
        return { success: true };
      } else {
        console.error('❌ Falha ao salvar dados do login');
        return { success: false, error: 'Falha ao salvar dados' };
      }
    } catch (error) {
      console.error('❌ ERRO CRÍTICO ao salvar login:', error);
      return { success: false, error: error.message };
    }
  };

  // 🚪 Fazer logout
  const signOut = async () => {
    try {
      console.log('🚪 ==> INICIANDO LOGOUT...');
      await clearAuthData();
      console.log('✅ ==> LOGOUT CONCLUÍDO');
      return true;
    } catch (error) {
      console.error('❌ Erro ao fazer logout:', error);
      return false;
    }
  };

  // 🧹 Limpar dados de autenticação
  const clearAuthData = async () => {
    try {
      console.log('🧹 Limpando dados de autenticação...');
      
      await AsyncStorage.multiRemove([
        'userToken',
        'userId',
        'userData'
      ]);
      
      setUser(null);
      setIsAuthenticated(false);
      
      console.log('🧹 Dados de autenticação limpos');
    } catch (error) {
      console.error('❌ Erro ao limpar dados:', error);
    }
  };

  useEffect(() => {
    console.log('🚀 AuthProvider useEffect executado');
    checkAuthStatus();
  }, []);

  const value = {
    user,
    isLoading,
    isAuthenticated,
    signIn,
    signOut,
    clearAuthData,
    checkAuthStatus
  };

  console.log('📤 AuthProvider fornecendo valores:', {
    isLoading,
    isAuthenticated,
    hasUser: !!user
  });

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};