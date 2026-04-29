// projeto\src\services\networkConfig.js
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class NetworkConfig {
  static servers = [
    'http://192.168.0.116:3000/api',
    'http://192.168.1.116:3000/api',
    'http://10.0.0.116:3000/api',
    'http://172.16.0.116:3000/api',
    'http://192.168.1.13/api', // Rede corporativa comum
  ];

  // ✅ Testa qual servidor está disponível
  static async findAvailableServer() {
    console.log('🔍 Procurando servidor disponível...');
    
    for (const serverUrl of this.servers) {
      try {
        console.log(`🌐 Testando: ${serverUrl}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${serverUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          console.log(`✅ Servidor encontrado: ${serverUrl}`);
          return serverUrl;
        }
      } catch (error) {
        console.log(`❌ Falhou: ${serverUrl} - ${error.message}`);
        continue;
      }
    }
    
    console.error('❌ Nenhum servidor disponível');
    throw new Error('Não foi possível conectar ao servidor');
  }

  // ✅ Descobre o IP automaticamente (Android)
  static async discoverLocalIP() {
    if (Platform.OS !== 'android') return null;
    
    try {
      // Tenta descobrir através de requisições de teste
      const commonRanges = [
        '192.168.0',
        '192.168.1', 
        '10.0.0',
        '172.16.0'
      ];
      
      for (const range of commonRanges) {
        for (let i = 100; i <= 120; i++) {
          const testUrl = `http://${range}.${i}:3000/api/health`;
          try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 2000);
            
            const response = await fetch(testUrl, {
              signal: controller.signal,
              method: 'GET'
            });
            
            if (response.ok) {
              console.log(`🎯 IP descoberto: ${range}.${i}`);
              return `http://${range}.${i}:3000/api`;
            }
          } catch (error) {
            // Ignora erros e continua testando
            continue;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Erro ao descobrir IP:', error);
      return null;
    }
  }
}

// projeto\src\services\api.js - VERSÃO ATUALIZADA
import axios from 'axios';
import { NetworkConfig } from './networkConfig';

class ApiService {
  constructor() {
    this.baseURL = null;
    this.api = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized && this.api) {
      return this.api;
    }

    try {
      console.log('🚀 Inicializando API...');
      
      // Tenta encontrar servidor disponível
      this.baseURL = await NetworkConfig.findAvailableServer();
      
      // Se não encontrou, tenta descobrir automaticamente
      if (!this.baseURL) {
        console.log('🔍 Tentando descobrir IP automaticamente...');
        this.baseURL = await NetworkConfig.discoverLocalIP();
      }
      
      if (!this.baseURL) {
        throw new Error('Nenhum servidor encontrado na rede');
      }

      this.api = axios.create({
        baseURL: this.baseURL,
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      this.setupInterceptors();
      this.initialized = true;
      
      console.log('✅ API inicializada com:', this.baseURL);
      return this.api;
      
    } catch (error) {
      console.error('❌ Erro ao inicializar API:', error);
      throw error;
    }
  }

  setupInterceptors() {
    // Request interceptor
    this.api.interceptors.request.use(async (config) => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.error('Erro ao configurar token:', error);
      }
      return config;
    });

    // Response interceptor
    this.api.interceptors.response.use(
      response => response.data,
      error => {
        console.error('Erro na API:', {
          message: error.message,
          status: error.response?.status,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  async testConnection() {
    try {
      const api = await this.initialize();
      const response = await api.get('/health');
      return { success: true, data: response };
    } catch (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async request(method, endpoint, data = null) {
    try {
      const api = await this.initialize();
      const response = await api[method](endpoint, data);
      return response;
    } catch (error) {
      console.error(`Erro em ${method.toUpperCase()} ${endpoint}:, error`);
      throw error;
    }
  }

  // Métodos convenientes
  async get(endpoint) {
    return this.request('get', endpoint);
  }

  async post(endpoint, data) {
    return this.request('post', endpoint, data);
  }

  async put(endpoint, data) {
    return this.request('put', endpoint, data);
  }

  async delete(endpoint) {
    return this.request('delete', endpoint);
  }
}

const apiService = new ApiService();
export default apiService;