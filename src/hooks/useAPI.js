// src/hooks/useAPI.js
import { useEffect, useRef, useState } from 'react';
import api from '../services/api';

export const useAPI = () => {
  const [isAPIReady, setIsAPIReady] = useState(false);
  const [apiError, setApiError] = useState(null);
  const initializeRef = useRef(false);

  useEffect(() => {
    // Evitar múltiplas inicializações
    if (initializeRef.current) {
      return;
    }
    
    initializeRef.current = true;
    
    const initializeAPI = async () => {
      try {
        console.log('🚀 Inicializando API via hook...');
        await api.safeInitialize();
        setIsAPIReady(true);
        setApiError(null);
        console.log('✅ API pronta via hook');
      } catch (error) {
        console.error('❌ Erro na inicialização via hook:', error);
        setApiError(error.message);
        setIsAPIReady(false);
      }
    };

    // Usar setTimeout para evitar problemas com useInsertionEffect
    const timeoutId = setTimeout(initializeAPI, 100);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  const updateURL = async (newUrl) => {
    try {
      const success = await api.updateBaseURL(newUrl);
      if (success) {
        setApiError(null);
      }
      return success;
    } catch (error) {
      setApiError(error.message);
      return false;
    }
  };

  const testConnection = async (url = null) => {
    try {
      const result = await api.testConnection(url);
      return result;
    } catch (error) {
      setApiError(error.message);
      return { success: false, error: error.message };
    }
  };

  const testMultipleUrls = async (urls) => {
    try {
      const results = await api.testMultipleUrls(urls);
      return results;
    } catch (error) {
      setApiError(error.message);
      return [];
    }
  };

  return {
    isAPIReady,
    apiError,
    updateURL,
    testConnection,
    testMultipleUrls,
    getCurrentURL: () => api.defaults.baseURL
  };
};