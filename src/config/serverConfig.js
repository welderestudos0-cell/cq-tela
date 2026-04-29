import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_CONFIG = {
  local: {
    url: 'http://10.107.114.51:3000/api',
    active: true,
  },
  fastapi: {
    url: 'http://10.107.114.11:3003',
  },
  custom: [],
};

const STORAGE_KEY = '@server_config';

export async function getServerConfig() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn('Erro ao ler configuração de servidor:', error);
  }
  return DEFAULT_CONFIG;
}

export async function saveServerConfig(config) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn('Erro ao salvar configuração de servidor:', error);
  }
}
