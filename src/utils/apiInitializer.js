// src/utils/apiInitializer.js
import api from '../services/api';

let isInitialized = false;

export const initializeAPI = async () => {
  if (isInitialized) {
    return true;
  }

  try {
    console.log('🚀 Inicializando API...');
    await api.initialize();
    isInitialized = true;
    console.log('✅ API inicializada com sucesso');
    return true;
  } catch (error) {
    console.error('❌ Erro ao inicializar API:', error);
    return false;
  }
};

export const resetAPIInitialization = () => {
  isInitialized = false;
};