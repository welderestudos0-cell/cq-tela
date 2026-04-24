import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Configuração padrão
const DEFAULT_CONFIG = {
    baseURL: 'http://10.107.114.11:5151/api',


  // baseURL: 'http://10.107.114.11:5151/api', 
  
    // baseURL: 'http://192.168.56.1:3000/api', 

    // baseURL: 'http://192.168.2.113:3000/api', 

  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Cache-Control': 'no-cache',
  }
};

// URLs de fallback - IPs locais
const FALLBACK_URLS = [
  'http://10.107.114.11:5151/api',
];

// Criar instância da API
const api = axios.create(DEFAULT_CONFIG);

// Variável para controlar inicialização
let isInitializing = false;
let isInitialized = false;

// Função para obter URL salva
const getSavedURL = () => {
  return new Promise((resolve) => {
    AsyncStorage.getItem('api_base_url')
      .then(url => {
        // Se a URL salva for diferente da padrão atual, ignora e usa a padrão
        if (url && url !== DEFAULT_CONFIG.baseURL) {
          console.log('URL salva diverge da padrão, usando padrão:', DEFAULT_CONFIG.baseURL);
          AsyncStorage.setItem('api_base_url', DEFAULT_CONFIG.baseURL).catch(() => {});
          resolve(DEFAULT_CONFIG.baseURL);
        } else {
          resolve(DEFAULT_CONFIG.baseURL);
        }
      })
      .catch(() => {
        console.log('Nenhuma URL salva, usando padrão');
        resolve(DEFAULT_CONFIG.baseURL);
      });
  });
};

// Inicializar API de forma segura
api.safeInitialize = () => {
  if (isInitializing || isInitialized) {
    return Promise.resolve(api.defaults.baseURL);
  }
  
  isInitializing = true;
  
  return getSavedURL()
    .then(savedUrl => {
      api.defaults.baseURL = savedUrl;
      isInitialized = true;
      isInitializing = false;
      console.log('API inicializada com URL:', savedUrl);
      return savedUrl;
    })
    .catch(error => {
      console.error('Erro na inicialização da API:', error);
      isInitializing = false;
      return DEFAULT_CONFIG.baseURL;
    });
};

// Atualizar URL da API
api.updateBaseURL = async (newUrl) => {
  try {
    console.log('Atualizando URL da API para:', newUrl);
    
    // Salvar no AsyncStorage
    await AsyncStorage.setItem('api_base_url', newUrl);
    
    // Atualizar a instância do axios
    api.defaults.baseURL = newUrl;
    
    console.log('URL da API atualizada com sucesso');
    return true;
  } catch (error) {
    console.error('Erro ao atualizar URL:', error);
    return false;
  }
};

// Obter URL atual
api.getCurrentURL = () => {
  return api.defaults.baseURL;
};

// Teste de conexão
api.testConnection = async (urlToTest = null) => {
  const testUrl = urlToTest || api.defaults.baseURL;
  try {
    console.log('Testando conexão com:', testUrl);
    
    const testInstance = axios.create({
      baseURL: testUrl,
      timeout: 10000,
      headers: DEFAULT_CONFIG.headers
    });
    
    // Tenta diferentes rotas de teste
    let response;
    try {
      response = await testInstance.get('/health');
      console.log('Resposta do /health:', response.data);
    } catch (healthError) {
      try {
        response = await testInstance.get('/test');
        console.log('Resposta do /test:', response.data);
      } catch (testError) {
        try {
          response = await testInstance.get('/');
          console.log('Resposta da raiz:', response.data);
        } catch (rootError) {
          throw rootError;
        }
      }
    }
    
    return { 
      success: true, 
      data: response.data || 'Servidor respondeu',
      url: testUrl,
      message: 'Conexão OK!'
    };
  } catch (error) {
    console.error('Teste de conexão falhou:', error.message);
    
    let errorMessage = 'Erro de conexão';
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Servidor não está rodando';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'IP não encontrado';
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Timeout - servidor demorou para responder';
    } else if (error.message?.includes('Network Error')) {
      errorMessage = 'Erro de rede - verifique WiFi';
    }
    
    return { 
      success: false, 
      error: errorMessage,
      details: error.message,
      url: testUrl
    };
  }
};

// Testar múltiplas URLs até encontrar uma que funcione
api.findWorkingURL = async (urls = FALLBACK_URLS) => {
  console.log('Procurando servidor disponível...');
  
  const results = [];
  
  for (const url of urls) {
    console.log(`Testando URL: ${url}`);
    const result = await api.testConnection(url);
    results.push({ url, ...result });
    
    if (result.success) {
      console.log(`Servidor encontrado: ${url}`);
      await api.updateBaseURL(url);
      return { success: true, workingUrl: url, allResults: results };
    }
  }
  
  console.log('Nenhum servidor disponível');
  return { success: false, workingUrl: null, allResults: results };
};

// Interceptador de requisição
api.interceptors.request.use(
  async (config) => {
    try {
      // Garantir que a API está inicializada
      if (!isInitialized && !isInitializing) {
        await api.safeInitialize();
      }
      
      const token = await AsyncStorage.getItem('userToken');
      if (token && token !== 'null' && token !== 'undefined') {
        config.headers.Authorization = `Bearer ${token}`;
      }
      
      console.log('Fazendo requisição:', {
        method: config.method?.toUpperCase() || 'GET',
        url: config.url,
        baseURL: config.baseURL,
        params: config.params || null,
        hasToken: !!token
      });
      
    } catch (error) {
      console.error('Erro no interceptador de requisição:', error);
    }
    
    return config;
  },
  (error) => {
    console.error('Erro no interceptador de requisição:', error);
    return Promise.reject(error);
  }
);

// Interceptador de resposta
api.interceptors.response.use(
  (response) => {
    console.log('Resposta recebida com sucesso:', {
      status: response.status,
      url: response.config.url
    });
    return response.data;
  },
  async (error) => {
    console.error('Erro na resposta da API:', {
      status: error.response?.status || 'N/A',
      message: error.message,
      url: error.config?.url || 'N/A'
    });
    
    // Se o servidor não responder, tenta encontrar outro
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.log('Servidor não responde, procurando alternativo...');
      const result = await api.findWorkingURL();
      if (result.success) {
        console.log('Novo servidor encontrado, tente novamente a requisição');
      }
    }
    
    // Limpar dados se token expirado
    if (error.response?.status === 401) {
      console.log('Token expirado, limpando dados de autenticação...');
      try {
        await AsyncStorage.multiRemove(['userToken', 'userId', 'userData']);
      } catch (cleanupError) {
        console.error('Erro ao limpar dados de autenticação:', cleanupError);
      }
    }
    
    return Promise.reject(error);
  }
);

// Reset da configuração
api.reset = async () => {
  console.log('Resetando configuração da API...');
  isInitialized = false;
  isInitializing = false;
  api.defaults.baseURL = DEFAULT_CONFIG.baseURL;
  
  // Limpar URL salva
  try {
    await AsyncStorage.removeItem('api_base_url');
    console.log('Configuração da API resetada');
  } catch (error) {
    console.error('Erro ao resetar configuração:', error);
  }
};

// Função utilitária para verificar se o servidor está rodando
api.checkServerStatus = async () => {
  console.log('Verificando status do servidor...');
  const result = await api.testConnection();
  if (!result.success) {
    console.log('Servidor principal não disponível, procurando alternativo...');
    const findResult = await api.findWorkingURL();
    return findResult;
  }
  return { success: true, workingUrl: api.defaults.baseURL };
};

// Função para limpar dados antigos (incluindo ngrok)
api.cleanupOldData = async () => {
  try {
    console.log('Removendo dados antigos...');
    const keysToRemove = [
      'ngrok_url',           // Remove chave antiga do ngrok
      'ngrok_tunnel_url',    // Outras possíveis chaves do ngrok
      'tunnel_url'
    ];
    
    await AsyncStorage.multiRemove(keysToRemove);
    console.log('Dados antigos removidos com sucesso');
  } catch (error) {
    console.error('Erro ao remover dados antigos:', error);
  }
};

// Função para formatar URL automaticamente
api.formatURL = (inputUrl) => {
  let formattedUrl = inputUrl.trim();
  
  // Adicionar http:// se não tiver protocolo
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = 'http://' + formattedUrl;
  }
  
  // Remover /api se existir para adicionar corretamente
  if (formattedUrl.endsWith('/api')) {
    formattedUrl = formattedUrl.slice(0, -4);
  }
  
  // Remover barra final se existir
  if (formattedUrl.endsWith('/')) {
    formattedUrl = formattedUrl.slice(0, -1);
  }
  
  // Adicionar /api no final
  formattedUrl = formattedUrl + '/api';
  
  return formattedUrl;
};

// Função para testar e salvar nova URL
api.testAndSaveURL = async (inputUrl) => {
  try {
    console.log('Testando e salvando nova URL:', inputUrl);
    
    // Formatar URL
    const formattedUrl = api.formatURL(inputUrl);
    console.log('URL formatada:', formattedUrl);
    
    // Testar conexão
    const testResult = await api.testConnection(formattedUrl);
    
    if (testResult.success) {
      // Salvar se funcionou
      const saveSuccess = await api.updateBaseURL(formattedUrl);
      if (saveSuccess) {
        return {
          success: true,
          url: formattedUrl,
          message: testResult.data?.message || 'Conexão OK',
          data: testResult.data
        };
      } else {
        return {
          success: false,
          error: 'Falha ao salvar URL'
        };
      }
    } else {
      return {
        success: false,
        error: testResult.error,
        details: testResult.details
      };
    }
  } catch (error) {
    console.error('Erro ao testar e salvar URL:', error);
    return {
      success: false,
      error: 'Erro inesperado: ' + error.message
    };
  }
};

export default api;