
// ─────────────────────────────────────────────────────────────────────────────
// HOME PRINCIPAL DO APLICATIVO
// Tela inicial exibida após o login. Contém o dashboard geral com acesso a todos
// os módulos do sistema (Irrigação, Monitoramento, Controle de Qualidade, etc.).
// Gerencia sincronização offline/online e navegação entre módulos.
// Rota: "Home" em routes.js → AuthenticatedStack
// ─────────────────────────────────────────────────────────────────────────────

import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Image,
  InteractionManager,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext.js';
import api from "../../services/api.js";
import { cleanOldDataFromCache } from './cleanupService.js';

// ========== FUNÇÕES FASTAPI ==========
const getFastApiToken = async (usuario, senha, modulo) => {
  try {
    const response = await fetch("http://10.107.114.11:3003/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usuario, password: senha, modulo }),
    });
    const data = await response.json();
    console.log("Resposta FastAPI:", data);
    return data.access_token;
  } catch (error) {
    console.error("Erro ao autenticar na FastAPI:", error);
    return null;
  }
};



const checkInternetConnection = async () => {
  try {
    console.log('🔍 Verificando conexão com servidor...');
    
    // Primeiro, garantir que a API está inicializada
    await api.safeInitialize();
    
    // Testar conexão usando a função do api.js
    const result = await api.testConnection();
    
    console.log('📡 Resultado do teste:', {
      success: result.success,
      url: result.url,
      message: result.success ? result.message : result.error
    });
    
    return result.success;
    
  } catch (error) {
    console.error('❌ Erro ao verificar conexão:', error);
    return false;
  }
};

const SERVIDOR_PRINCIPAL = 'http://10.107.114.51:3000/api';
const SERVIDORES_PADRAO = [
  { id: 1, label: 'Servidor 1 (Fixo)', url: 'http://10.107.114.11:3003' },
  { id: 2, label: 'Servidor 2 (Fixo)', url: 'http://10.107.114.51:3000/api' },
];

function Home({ navigation, route }) {
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [showNotificationModal, setShowNotificationModal] = React.useState(false);
  const [pendingData, setPendingData] = React.useState([]);
  const [filteredPendingData, setFilteredPendingData] = React.useState([]);
  const [notificationCount, setNotificationCount] = React.useState(0);
  const [userData, setUserData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [syncInProgress, setSyncInProgress] = React.useState(false);
  const [syncProgress, setSyncProgress] = React.useState(0);
  const [isOnline, setIsOnline] = React.useState(true);
  const [isWifiConnected, setIsWifiConnected] = React.useState(false);
  const [showIPConfigModal, setShowIPConfigModal] = React.useState(false);
  const [selectedIP, setSelectedIP] = React.useState(null);
  const [testingIP, setTestingIP] = React.useState(false);
  const [cancelSync, setCancelSync] = React.useState(false);
  const [modalListReady, setModalListReady] = React.useState(false);
  const [novaVersao, setNovaVersao] = React.useState(null); // { versao, mensagem } ou null

  const { signOut, user } = useAuth();
  const insets = useSafeAreaInsets();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const modalAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const heroAvatarAnim = useRef(new Animated.Value(0)).current;
  const heroAvatarSpinAnim = useRef(new Animated.Value(0)).current;
  const heroAvatarSequenceRef = useRef(null);
  const fixedIpAppliedRef = useRef(false);

  const hasAccessToData = (dataItem) => {
    if (!userData || !userData.matricula) return true;
    const dataMatricula = dataItem.matricula || dataItem.originalData?.matricula ||
                         dataItem.usuario_matricula || dataItem.originalData?.usuario_matricula ||
                         'Não Informada';
    return dataMatricula === userData.matricula || dataMatricula === 'Não Informada';
  };

  const filterDataByMatricula = (data) => {
    if (!userData || !userData.matricula) return data;
    return data.filter(item => hasAccessToData(item));
  };

  const startHeroAvatarAnimation = () => {
    heroAvatarSequenceRef.current?.stop?.();
    heroAvatarAnim.stopAnimation();
    heroAvatarSpinAnim.stopAnimation();
    heroAvatarAnim.setValue(0);
    heroAvatarSpinAnim.setValue(0);

    const heroAvatarSequence = Animated.sequence([
      Animated.delay(3000),
      Animated.parallel([
        Animated.timing(heroAvatarAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(heroAvatarSpinAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
      Animated.delay(4000),
      Animated.parallel([
        Animated.timing(heroAvatarAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(heroAvatarSpinAnim, { toValue: 2, duration: 900, useNativeDriver: true }),
      ]),
    ]);

    heroAvatarSequenceRef.current = heroAvatarSequence;
    heroAvatarSequence.start(({ finished }) => {
      if (finished) {
        heroAvatarAnim.setValue(0);
        heroAvatarSpinAnim.setValue(0);
      }
      heroAvatarSequenceRef.current = null;
    });
  };

  const fetchUserData = async () => {
    try {
      setLoading(true);
      if (user) {
        console.log('✅ Usando dados do AuthContext:', user);
        setUserData(user);
        return;
      }
      console.log('⚠️ AuthContext sem dados, buscando do AsyncStorage...');
      const userToken = await AsyncStorage.getItem('userToken');
      const storedUserData = await AsyncStorage.getItem('userData');
      if (!userToken || !storedUserData) {
        console.error('❌ Dados não encontrados no AsyncStorage');
        Alert.alert('Erro', 'Sessão expirada. Faça login novamente.');
        const logoutSuccess = await signOut();
        if (!logoutSuccess) {
          console.error('❌ Falha ao fazer logout automático');
        }
        return;
      }
      const parsedUserData = JSON.parse(storedUserData);
      console.log('✅ Dados carregados do AsyncStorage:', parsedUserData);
      setUserData(parsedUserData);
    } catch (error) {
      console.error('❌ Erro ao carregar dados do usuário:', error);
      Alert.alert('Erro', 'Não foi possível carregar seus dados. Faça login novamente.', [
        {
          text: 'OK',
          onPress: async () => {
            const logoutSuccess = await signOut();
            if (!logoutSuccess) {
              console.error('❌ Falha ao fazer logout após erro');
            }
          }
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

 const getUniqueKey = (item) => {
  const fields = [
    item.dataColeta || item.timestamp || item.momento || item.data || '',
    item.fazenda || '',
    item.talhao || '',
    item.ponto || '',
    item.ramal || '',
    item.linha || '',
    item.usuario || '',
    item.origem || '',
    item.tipo || '',
    item.zero_a_trinta_cm || item.umidade_0_30 || '',
    item.trinta_a_sessenta_cm || item.umidade_30_60 || '',
    item.mediaVazao || '',
    item.pressaoFinal || '',
    item.tipo_limpeza || '', // NOVO: Campo de tipo de limpeza
    item.matricula || '',    // NOVO: Matricula para diferenciação
  ];
  return fields.join('|');
};

const buildAnaliseFrutosFormData = (payload = {}) => {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if ([
      'fotos',
      'fotos_producao',
      'originalData',
      '_syncStatus',
      '_createdOfflineAt',
      '_syncError',
      '_syncedAt',
      '_serverId',
      'syncStatus',
      'asyncStorageKey',
      'emoji',
      'icone',
      'tipo',
      'origem',
      'usuario',
      'dataColeta',
      'sincronizado',
    ].includes(key)) return;

    if (typeof value === 'object' && value !== null) {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, value == null ? '' : String(value));
    }
  });

  (payload.fotos || []).forEach((uri, idx) => {
    if (!uri) return;
    const ext = String(uri).split('.').pop()?.toLowerCase() || 'jpg';
    formData.append('fotos', {
      uri,
      name: `foto_analise_${idx + 1}.${ext}`,
      type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
    });
  });

  const fotosProducao = payload.fotos_producao && typeof payload.fotos_producao === 'object'
    ? payload.fotos_producao
    : {};
  ['firmeza', 'maturacao', 'danos_internos'].forEach((campo) => {
    (fotosProducao[campo] || []).forEach((uri, idx) => {
      if (!uri) return;
      const ext = String(uri).split('.').pop()?.toLowerCase() || 'jpg';
      formData.append(`fotos_${campo}`, {
        uri,
        name: `foto_${campo}_${idx + 1}.${ext}`,
        type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
      });
    });
  });

  return formData;
};

  
const detectarTipoDados = (item, key) => {
  if (key === 'analise_frutos_offline' || item.tipo === 'Análise de Frutos' || item.tipo_analise || item.frutos || item.lotes) {
    return {
      tipo: 'Análise de Frutos',
      emoji: '🥭',
      icone: 'query-stats'
    };
  }

  // Detectar dados de maturação forçada
  if (key === 'maturacao_forcada_offline' || item.tipo === 'Maturação Forçada') {
    return {
      tipo: 'Maturação Forçada',
      emoji: '🥭',
      icone: 'science'
    };
  }

  // Detectar dados de auditoria Luciano
  if (key === 'auditoria_luciano_offline' || item.checklist) {
    return {
      tipo: 'Auditoria Luciano',
      emoji: '📋',
      icone: 'fact-check'
    };
  }

  // Detectar dados de consumo de água
  if (key === 'consumo_agua_offline' || item.hidrometros) {
    return {
      tipo: 'Consumo de Água',
      emoji: '🚰',
      icone: 'water'
    };
  }

  // Detectar dados de cadastro KC
  if (key === 'kc_talhao_offline' || (item.kc !== undefined && item.kc !== null)) {
    return {
      tipo: 'Cadastro KC',
      emoji: '🌿',
      icone: 'grass'
    };
  }

  // Detectar dados de manutenção de bomba
  if (item.manutencoes ||
      item.bomba ||
      item.equipamento ||
      key === 'manutencoes_offline' ||
      key.includes('manutencao')) {
    return {
      tipo: 'Manutenção de Bomba',
      emoji: '🔧',
      icone: 'build'
    };
  }
  
  // Detectar dados de limpeza
  if (item.tipo_limpeza ||
      key === 'limpezas_offline' ||
      key.includes('limpeza')) {

    // Verificar o tipo específico de limpeza
    const isQuimica = item.tipo_limpeza === 'quimica';

    return {
      tipo: isQuimica ? 'Limpeza Química' : 'Limpeza de Arraste',
      emoji: isQuimica ? '🧪' : '🌀',
      icone: isQuimica ? 'science' : 'cleaning-services'
    };
  }
  
  // Detectar dados de vazão
  if (item.tipo_monitoramento === 'Teste de Vazão' ||
      item.ramal ||
      item.linha ||
      key.includes('vazao') ||
      key === 'dadosVazaoLinhas' ||
      item.mediaVazao ||
      item.pressaoFinal ||
      item.vazao1 || item.vazao2 || item.vazao3 ||
      item.paf || item.pdf || item.pav || item.pdv) {
    return {
      tipo: 'Teste de Vazão',
      emoji: '💧',
      icone: 'water-drop'
    };
  }
  
  // Detectar dados de monitoramento de solo
  if (item.zero_a_trinta_cm ||
      item.trinta_a_sessenta_cm ||
      item.umidade_0_30 ||
      item.umidade_30_60 ||
      key === 'monitoramentos_offline') {
    return {
      tipo: 'Monitoramento de Solo',
      emoji: '🌱',
      icone: 'eco'
    };
  }
  
  // Tipo padrão
  return {
    tipo: 'Dados Gerais',
    emoji: '📊',
    icone: 'data-usage'
  };
};



const fetchOfflineData = async () => {
  try {
    if (!userData?.matricula) {
      console.warn('⚠️ userData ou matricula não definido');
      setPendingData([]);
      setFilteredPendingData([]);
      setNotificationCount(0);
      return;
    }

    const allKeys = await AsyncStorage.getAllKeys();
    
    // Log para debug
    console.log('🔍 Todas as chaves do AsyncStorage:', allKeys);
    
    // Filtrar chaves relevantes (incluindo limpezas_offline)
    const offlineKeys = allKeys.filter(key => {
      // Ignorar chave temporária
      if (key === 'dadosVazaoLinhas_temp') {
        console.log('⏭️ Ignorando chave temporária:', key);
        return false;
      }
      
      // Ignorar chaves de configuração/usuário
      if (key === 'userToken' || key === 'userData' || key === 'userProfile') {
        return false;
      }
      
      // Incluir chaves específicas do usuário
      const isUserSpecificKey = userData?.matricula && key.startsWith(`user_${userData.matricula}_`);
      
      // Incluir chaves genéricas de dados (ADICIONADA limpezas_offline e manutencoes_offline)
      const isGenericKey =
        key === 'monitoramentos_offline' ||      // Principal para dados offline
        key === 'dadosVazaoLinhas' ||            // Dados de vazão (se ainda existirem)
        key === 'limpezas_offline' ||            // Dados de limpeza offline
        key === 'manutencoes_offline' ||         // Dados de manutenção de bomba offline
        key === 'consumo_agua_offline' ||        // Dados de consumo de água offline
        key === 'kc_talhao_offline' ||           // Dados de cadastro KC offline
        key === 'auditoria_luciano_offline' ||   // Dados de auditoria Luciano offline
        key === 'maturacao_forcada_offline' ||   // Dados de maturação forçada offline
        key === 'analise_frutos_offline' ||      // Dados de análise de frutos offline
        key.includes("pending") ||
        key.includes("restored");
      
      return isUserSpecificKey || isGenericKey;
    });

    console.log('📋 Chaves filtradas para processar:', offlineKeys);

    if (offlineKeys.length === 0) {
      console.log('❌ Nenhuma chave offline encontrada');
      setPendingData([]);
      setFilteredPendingData([]);
      setNotificationCount(0);
      return;
    }

    // Processar dados de cada chave
    const offlineDataPromises = offlineKeys.map(async (key) => {
      try {
        const data = await AsyncStorage.getItem(key);
        if (!data) return null;
        
        const parsedData = JSON.parse(data);
        console.log(`📦 Dados da chave ${key}:`, {
          isArray: Array.isArray(parsedData),
          length: Array.isArray(parsedData) ? parsedData.length : 1
        });
        
        return { key, data: parsedData, isArray: Array.isArray(parsedData) };
      } catch (error) {
        console.error(`❌ Erro ao parsear ${key}:`, error);
        return null;
      }
    });

    const offlineDataResults = await Promise.all(offlineDataPromises);
    const validOfflineData = offlineDataResults.filter(result => result !== null);

    let consolidatedData = [];
    const seen = new Set();
validOfflineData.forEach(({ key, data, isArray }) => {
  if (isArray) {
    data.forEach((item, index) => {
      // CORREÇÃO: Pular itens já sincronizados para não aparecer no sininho
      if (item._syncStatus === 'synced' || item.sincronizado === true) {
        console.log(`⏭️ Pulando item sincronizado da chave ${key} (não aparece no sininho)`);
        return;
      }
      
      const tipoDetectado = detectarTipoDados(item, key);
      
      // Criar item formatado para exibição
      // Normalizar data primeiro
let dataColeta;
const possibleDateFields = [
  item.dataColeta,
  item.timestamp,
  item.momento,
  item.data,
  item.originalData?.dataColeta,
  item.originalData?.timestamp,
  item.originalData?.momento,
  item.originalData?.data
];

for (const dateField of possibleDateFields) {
  if (dateField && 
      dateField !== 'undefined' && 
      dateField !== 'null' && 
      dateField !== null && 
      dateField !== undefined) {
    try {
      const testDate = new Date(dateField);
      if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1900) {
        dataColeta = dateField;
        break;
      }
    } catch (e) {
      // Continuar tentando outros campos
    }
  }
}

if (!dataColeta) {
  dataColeta = new Date().toISOString();
  console.warn(`⚠️ Data inválida para item ${index} da chave ${key}, usando data atual`);
}

const newItem = {
  id: item.id || `${key}_${index}`,
  origem: key === 'monitoramentos_offline' ? 'monitoramento_offline' : 
         key === 'dadosVazaoLinhas' ? 'vazao_linhas' :
         key === 'limpezas_offline' ? 'limpeza_offline' :
         key === 'manutencoes_offline' ? 'manutencao_bomba' :
         key === 'analise_frutos_offline' ? 'analise_frutos_offline' :
         key.replace(`user_${userData.matricula}_`, ''),
  // Campos específicos de manutenção de bomba
  bomba: item.bomba,
  equipamento: item.equipamento,
  manutencoes: item.manutencoes,
  tipo: tipoDetectado.tipo,
  emoji: tipoDetectado.emoji,
  icone: tipoDetectado.icone,
  
  // Dados principais com fallbacks seguros
  fazenda: item.fazenda || item.fazenda_talhao || 'Não informada',
  talhao: item.talhao || 'Não informado', 
  usuario: item.usuario || 'Não informado',
  dataColeta: dataColeta, // ✅ ADICIONADO
  
  // Campos específicos
  ramal: item.ramal,
  linha: item.linha,
  tempo: item.tempo ?? item.originalData?.tempo ?? null,
  vazao1: item.vazao1 ?? item.v1 ?? item.originalData?.vazao1 ?? item.originalData?.v1 ?? null,
  vazao2: item.vazao2 ?? item.v2 ?? item.originalData?.vazao2 ?? item.originalData?.v2 ?? null,
  vazao3: item.vazao3 ?? item.v3 ?? item.originalData?.vazao3 ?? item.originalData?.v3 ?? null,
  mediaVazao: item.mediaVazao,
  media_vazao: item.media_vazao ?? item.originalData?.media_vazao ?? item.mediaVazao ?? null,
  pressaoFinal: item.pressaoFinal,
  pressao_final: item.pressao_final ?? item.originalData?.pressao_final ?? item.pressaoFinal ?? null,
  paf: item.paf ?? item.originalData?.paf ?? null,
  pdf: item.pdf ?? item.originalData?.pdf ?? null,
  pav: item.pav ?? item.originalData?.pav ?? null,
  pdv: item.pdv ?? item.originalData?.pdv ?? null,
  ponto: item.ponto,
  zero_a_trinta_cm: item.zero_a_trinta_cm,
  trinta_a_sessenta_cm: item.trinta_a_sessenta_cm,
  umidade_0_30: item.umidade_0_30,
  umidade_30_60: item.umidade_30_60,
  tipo_limpeza: item.tipo_limpeza,
  gps: item.gps || item.coordenadas || null,
  coordenadas: item.coordenadas || item.gps || null,

  syncStatus: item._syncStatus || 'pending',
  originalData: item,
  matricula: item.matricula || 'Não Informada',
  asyncStorageKey: key,
};
      
      // Criar chave única para evitar duplicatas
      const uniqueKey = getUniqueKey(newItem);
      
      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        consolidatedData.push(newItem);
        console.log(`✅ Item adicionado ao sininho: ${tipoDetectado.tipo} da chave ${key}`);
      } else {
        console.log(`⏭️ Duplicata ignorada da chave ${key}`);
      }
    });
      } else {
        // Processar objeto único (não array)
        if (data && !data._syncStatus && !data.sincronizado) {
          const tipoDetectado = detectarTipoDados(data, key);
          const newItem = {
            id: data.id || `${key}_single_${Date.now()}`,
            origem: key,
            tipo: tipoDetectado.tipo,
            emoji: tipoDetectado.emoji,
            icone: tipoDetectado.icone,
            ...data,
            dataColeta: data.momento || data.timestamp || new Date().toISOString(),
            syncStatus: 'pending',
            originalData: data,
            matricula: data.matricula || 'Não Informada',
            asyncStorageKey: key,
          };
          
          const uniqueKey = getUniqueKey(newItem);
          if (!seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            consolidatedData.push(newItem);
          }
        }
      }
    });

    // Ordenar por data (mais recente primeiro)
    consolidatedData.sort((a, b) => {
      const dateA = new Date(a.dataColeta);
      const dateB = new Date(b.dataColeta);
      return dateB - dateA;
    });

    // Filtrar por matrícula
    const filteredData = filterDataByMatricula(consolidatedData);
    
    console.log('📊 Resumo final:', {
      totalConsolidado: consolidatedData.length,
      totalFiltrado: filteredData.length,
      porTipo: {
        vazao: filteredData.filter(d => d.tipo === 'Teste de Vazão').length,
        solo: filteredData.filter(d => d.tipo === 'Monitoramento de Solo').length,
        limpezaArraste: filteredData.filter(d => d.tipo === 'Limpeza de Arraste').length,
        limpezaQuimica: filteredData.filter(d => d.tipo === 'Limpeza Química').length,
        manutencao: filteredData.filter(d => d.tipo === 'Manutenção de Bomba').length,
        consumoAgua: filteredData.filter(d => d.tipo === 'Consumo de Água').length,
        cadastroKC: filteredData.filter(d => d.tipo === 'Cadastro KC').length,
        outros: filteredData.filter(d => d.tipo === 'Dados Gerais').length
      }
    });
    
    setPendingData(consolidatedData);
    setFilteredPendingData(filteredData);
    setNotificationCount(filteredData.length);

    // *** LIMPEZA AUTOMÁTICA: Remover itens sincronizados do AsyncStorage ***
    // Isso previne que itens sincronizados reapareçam no sininho
    for (const key of offlineKeys) {
      try {
        const storedData = await AsyncStorage.getItem(key);
        if (storedData) {
          const data = JSON.parse(storedData);
          if (Array.isArray(data)) {
            const pendingItems = data.filter(item => 
              item._syncStatus !== 'synced' && item.sincronizado !== true
            );
            // Se havia itens sincronizados, atualizar o storage
            if (pendingItems.length < data.length) {
              console.log(`🧹 Limpando ${data.length - pendingItems.length} itens sincronizados de ${key}`);
              await AsyncStorage.setItem(key, JSON.stringify(pendingItems));
            }
          }
        }
      } catch (cleanupError) {
        console.error(`Erro ao limpar itens sincronizados de ${key}:`, cleanupError);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro em fetchOfflineData:', error);
    setPendingData([]);
    setFilteredPendingData([]);
    setNotificationCount(0);
  }
};

 
// Função para formatar data para Oracle
const formatDateForOracle = (dateString) => {
  try {
    if (!dateString) return new Date().toISOString();
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.warn('Data inválida, usando data atual:', dateString);
      return new Date().toISOString();
    }
    
    // Formato esperado pelo Oracle: YYYY-MM-DD HH24:MI:SS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return new Date().toISOString();
  }
};


const syncWithFastApi = async (data, usuario, senha, modulo) => {
  const token = await getFastApiToken(usuario, senha, modulo);
  console.log('🔑 Token FastAPI:', token);
  if (!token) {
    console.error("Token FastAPI não obtido");
    return { success: false, error: "Token não obtido" };
  }
  
  try {
    let endpoint;
    let payload;

    console.log('🔍 syncWithFastApi recebeu:', { 
      tipo_limpeza: data.tipo_limpeza, 
      modulo: modulo, 
      keys: Object.keys(data)
    });

    // *** LIMPEZA ***
    if (data.tipo_limpeza || 
        modulo === "dev_monitoramento_limpeza" || 
        (data.fazenda && data.talhao && data.usuario && data.momento && data.matricula && data.gps && !data.ponto && !data.ramal && !data.linha)) {
      
      console.log('📤 Detectado como dados de LIMPEZA');
      endpoint = "http://10.107.114.11:3003/dev_monitoramento_limpeza";
      
      payload = {
  fazenda: data.fazenda || '',
  talhao: data.talhao || '',
  usuario: data.usuario || '',
  // Garante que o momento do evento seja sempre salvo corretamente
  momento: data.momento && data.momento !== 'undefined' && data.momento !== 'null' ? data.momento : (data.dataColeta || new Date().toISOString()),
  tipo_limpeza: data.tipo_limpeza || 'arraste',
  matricula: data.matricula || '',
  gps: data.gps || '[0, 0]' // Já formatado como string
      };
    
    } else if (modulo === "controladoria_umidade") {
      console.log('📤 Detectado como dados de SOLO');
      endpoint = "http://10.107.114.11:3003/controladoria_umidade/umidade-solo";
      payload = {
  fazenda: data.fazenda || '',
  talhao: data.talhao || '',
  usuario: data.usuario || '',
  momento: data.momento && data.momento !== 'undefined' && data.momento !== 'null' ? data.momento : (data.dataColeta || new Date().toISOString()),
  gps: data.gps || null,
  ponto: data.ponto || '',
  zero_a_trinta: data.zero_a_trinta_cm || null,
  trinta_a_sessenta: data.trinta_a_sessenta_cm || null,
  possui_minhoca: data.possui_minhoca ?? false,
  possui_enraizamento: data.possui_enraizamento ?? false,
      };
      
    } else if (modulo === "teste_vazao_pressao") {
      console.log('📤 Detectado como dados de VAZÃO');
      endpoint = "http://10.107.114.11:3003/teste_vazao_pressao";
      // Garante que timestamp e timestampPressao estejam sempre preenchidos e formatados corretamente
      const formatDateForOracle = (dateString) => {
        try {
          if (!dateString) return new Date().toISOString();
          const date = new Date(dateString);
          if (isNaN(date.getTime())) {
            console.warn('Data inválida, usando data atual:', dateString);
            return formatDateForOracle(new Date().toISOString());
          }
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } catch (error) {
          return new Date().toISOString();
        }
      };
      payload = {
        fazenda: data.fazenda || '',
        usuario: data.usuario || '',
        ramal: data.ramal ? parseInt(data.ramal) : 0,
        linha: data.linha ? parseInt(data.linha) : 0,
        talhao: data.talhao || '',
        tempo: data.tempo || '',
        vazao1: data.vazao1 || 0,
        vazao2: data.vazao2 || 0,
        vazao3: data.vazao3 || 0,
        mediaVazao: data.mediaVazao || 0,
        pressaoFinal: data.pressaoFinal || 0,
        paf: data.paf || 0,
        pdf: data.pdf || 0,
        pav: data.pav || 0,
        pdv: data.pdv || 0,
        leituraFiltro: data.leituraFiltro || { paf: 0, pdf: 0 },
        leituraValvula: data.leituraValvula || { pav: 0, pdv: 0 },
        gps: data.gps || null,
        timestamp: formatDateForOracle(data.timestamp || new Date().toISOString()),
        id: data.id || '',
        timestampPressao: formatDateForOracle(data.timestampPressao || data.timestamp || new Date().toISOString()),
        tipo_monitoramento: data.tipo_monitoramento || 'Teste de Vazão',
      };
    } else {
      console.error("❌ Tipo de dado desconhecido para FastAPI:", modulo);
      return { success: false, error: "Tipo de dado desconhecido" };
    }

    console.log('📤 Payload sendo enviado para FastAPI:', JSON.stringify(payload, null, 2));
    console.log('📤 Endpoint:', endpoint);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      timeout: 15000,
    });
    
    if (!response.ok) {
  const errorText = await response.text();
  console.error(`❌ Erro HTTP ${response.status} no FastAPI:`, errorText);
  console.error('🔑 Token usado:', token);
  console.error('🕒 Momento enviado:', payload.momento);
  throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ FastAPI respondeu com sucesso:', result);
    return { success: true, data: result };
    
  } catch (error) {
    console.error(`❌ Erro ao sincronizar com FastAPI:`, error);
    return { success: false, error: error.message };
  }
};


// Adicione estas funções no seu componente Home, junto com as outras funções

const handleRestoreData = async () => {
  try {
    Alert.alert(
      "Restaurar Dados",
      "Escolha um arquivo JSON de backup para restaurar no sininho.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Selecionar Arquivo",
          onPress: async () => {
            // Tentar diferentes métodos de seleção
            await trySelectFile();
          }
        }
      ]
    );
  } catch (error) {
    console.error('Erro na restauração:', error);
    Alert.alert('Erro', 'Erro ao iniciar restauração.');
  }
};


const trySelectFile = async () => {
  try {
    // Método 1: Tentar DocumentPicker se disponível
    try {
      console.log('Tentando DocumentPicker...');

      if (DocumentPicker && DocumentPicker.getDocumentAsync) {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/json', 'text/plain', '*/*'],
          copyToCacheDirectory: true,
          multiple: false
        });

        console.log('DocumentPicker result:', result);

        if (!result.canceled && result.assets && result.assets.length > 0) {
          const file = result.assets[0];
          console.log('Arquivo selecionado:', file.name);
          await processRestoreFile(file.uri);
          return; // Sucesso!
        } else {
          console.log('Usuário cancelou seleção');
          return;
        }
      }
    } catch (docPickerError) {
      console.log('DocumentPicker falhou:', docPickerError.message);
    }
    
    // Método 2: Usar pasta Documentos como fallback
    console.log('Usando método de pasta Documentos...');
    await selectFromDocumentsFolder();
    
  } catch (error) {
    console.error('Todos os métodos falharam:', error);
    Alert.alert(
      'Erro na Seleção', 
      'Não foi possível abrir o seletor de arquivos. Coloque o arquivo JSON na pasta Documentos do app e tente novamente.'
    );
  }
};

// 4. MÉTODO FALLBACK: Buscar na pasta Documentos
const selectFromDocumentsFolder = async () => {
  try {
    console.log('Procurando arquivos JSON na pasta Documentos...');
    
    const documentsDir = FileSystem.documentDirectory;
    const files = await FileSystem.readDirectoryAsync(documentsDir);
    
    // Filtrar apenas JSONs de backup
    const jsonFiles = files.filter(file => 
      file.toLowerCase().endsWith('.json') && 
      (file.toLowerCase().includes('agroirriga') || 
       file.toLowerCase().includes('backup'))
    );
    
    console.log('Arquivos JSON encontrados:', jsonFiles.length);
    
    if (jsonFiles.length === 0) {
      Alert.alert(
        'Nenhum Backup Encontrado',
        'Nenhum arquivo de backup foi encontrado na pasta Documentos.\n\n' +
        'Para usar este método:\n' +
        '1. Conecte o dispositivo ao computador\n' +
        '2. Copie o arquivo JSON para a pasta Documentos do app\n' +
        '3. Tente novamente'
      );
      return;
    }
    
    // Se apenas um arquivo, usar automaticamente
    if (jsonFiles.length === 1) {
      const fileUri = documentsDir + jsonFiles[0];
      console.log('Usando arquivo único:', jsonFiles[0]);
      await processRestoreFile(fileUri);
    } else {
      // Múltiplos arquivos - mostrar seleção
      showFileSelectionDialog(documentsDir, jsonFiles);
    }
    
  } catch (error) {
    console.error('Erro ao acessar Documentos:', error);
    Alert.alert('Erro', 'Não foi possível acessar a pasta Documentos.');
  }
};

// 5. DIALOG PARA MÚLTIPLOS ARQUIVOS
const showFileSelectionDialog = (documentsDir, jsonFiles) => {
  const fileOptions = jsonFiles.map(fileName => ({
    text: fileName.length > 40 ? `...${fileName.slice(-37)}` : fileName,
    onPress: async () => {
      const fileUri = documentsDir + fileName;
      await processRestoreFile(fileUri);
    }
  }));
  
  fileOptions.push({ text: 'Cancelar', style: 'cancel' });
  
  Alert.alert(
    'Selecionar Backup', 
    `Escolha um dos ${jsonFiles.length} arquivos encontrados:`, 
    fileOptions
  );
};


const showFileSelection = (directoryUri, jsonFiles) => {
  const fileOptions = jsonFiles.map(fileName => ({
    text: fileName,
    onPress: async () => {
      const fileUri = directoryUri + '/' + encodeURIComponent(fileName);
      await processRestoreFile(fileUri);
    }
  }));
  
  fileOptions.push({ text: 'Cancelar', style: 'cancel' });
  
  Alert.alert('Selecionar Arquivo', 'Escolha o arquivo de backup:', fileOptions);
};

// Função para processar o arquivo de backup selecionado
// Função utilitária para normalizar GPS durante restauração de backup
function normalizeGPSForRestore(gps) {
  if (!gps) return null;
  // Se já é objeto, retorna como está
  if (typeof gps === 'object' && gps.latitude !== undefined && gps.longitude !== undefined) {
    return gps;
  }
  // Se é string tipo '[lat, long]' ou 'lat,long'
  if (typeof gps === 'string') {
    const match = gps.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (match) {
      return {
        latitude: Number(match[1]),
        longitude: Number(match[2]),
        accuracy: 999
      };
    }
  }
  return null;
}
// Substitua a função processRestoreFile por esta versão corrigida:


const processRestoreFile = async (fileUri) => {
  try {
    console.log('Processando arquivo:', fileUri);
    
    // Ler conteúdo
    const fileContent = await FileSystem.readAsStringAsync(fileUri);
    
    if (!fileContent || fileContent.trim().length === 0) {
      throw new Error('Arquivo vazio');
    }

    console.log('Arquivo lido, tamanho:', fileContent.length, 'bytes');

    // Parsear JSON
    const backupData = JSON.parse(fileContent);
    
    if (!Array.isArray(backupData)) {
      throw new Error('Formato inválido - esperado lista de dados');
    }

    if (backupData.length === 0) {
      Alert.alert('Aviso', 'Arquivo de backup vazio.');
      return;
    }

    // Contar por tipo
    const vazaoCount = backupData.filter(d =>
      d._backupTipo === 'Teste de Vazão' || d.ramal || d.mediaVazao || d.tipo_monitoramento
    ).length;

    const monitoramentoCount = backupData.filter(d =>
      d._backupTipo === 'Monitoramento de Solo' || d.ponto || d.zero_a_trinta_cm
    ).length;

    const limpezaCount = backupData.filter(d =>
      d._backupTipo === 'Limpeza de Arraste' || d.tipo_limpeza
    ).length;

    const analiseFrutosCount = backupData.filter(d =>
      d._backupTipo === 'Análise de Frutos' || d.tipo_analise || d.frutos || d.lotes
    ).length;

    const maturacaoCount = backupData.filter(d =>
      d._backupTipo === 'Maturação Forçada' || d.maturacao_tipo || d.maturacoes
    ).length;

    console.log('Dados encontrados:', { vazaoCount, monitoramentoCount, limpezaCount, analiseFrutosCount, maturacaoCount });

    // Confirmar restauração
    Alert.alert(
      'Confirmar Restauração',
      `Encontrados ${backupData.length} registros:\n\n` +
      (vazaoCount > 0 ? `• ${vazaoCount} Testes de Vazão\n` : '') +
      (monitoramentoCount > 0 ? `• ${monitoramentoCount} Monitoramentos de Solo\n` : '') +
      (limpezaCount > 0 ? `• ${limpezaCount} Limpezas de Arraste\n` : '') +
      (analiseFrutosCount > 0 ? `• ${analiseFrutosCount} Análises de Frutos\n` : '') +
      (maturacaoCount > 0 ? `• ${maturacaoCount} Maturações Forçadas\n` : '') +
      '\nOs dados irão para o sininho. Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: async () => {
            await importBackupData(backupData);
          }
        }
      ]
    );

  } catch (error) {
    console.error('Erro ao processar arquivo:', error);
    
    if (error.name === 'SyntaxError') {
      Alert.alert('Erro', 'Arquivo JSON inválido ou corrompido.');
    } else if (error.message.includes('read')) {
      Alert.alert('Erro', 'Não foi possível ler o arquivo selecionado.');
    } else {
      Alert.alert('Erro', `Erro ao processar: ${error.message}`);
    }
  }
};

const importBackupData = async (backupData) => {
  try {
    let importedCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

    console.log('Iniciando importação de', backupData.length, 'itens...');

    for (const item of backupData) {
      try {
        // Detectar tipo do item
        let itemType = item._backupTipo;
        if (!itemType) {
          if (item.tipo_limpeza) {
            itemType = 'Limpeza de Arraste';
          } else if (item.ramal || item.mediaVazao || item.tipo_monitoramento) {
            itemType = 'Teste de Vazão';
          } else if (item.ponto || item.zero_a_trinta_cm) {
            itemType = 'Monitoramento de Solo';
          } else if (item.tipo_analise || item.frutos || item.lotes) {
            itemType = 'Análise de Frutos';
          } else if (item.maturacao_tipo || item.maturacoes) {
            itemType = 'Maturação Forçada';
          } else {
            itemType = 'Dados Gerais';
          }
        }
        
        // Preparar item para o sininho com correções específicas
        const restoredItem = {
          ...item,
          
          // ID único
          id: item.id || `restored_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          
          // Corrigir GPS baseado no tipo
          gps: itemType === 'Monitoramento de Solo' 
            ? (item.gps && typeof item.gps === 'object' 
                ? `[${item.gps.latitude}, ${item.gps.longitude}]`
                : item.gps || null)
            : normalizeGPSForRestore(item.gps || item.coordenadas),
          
          // Garantir timestamp correto (usar o original do ponto, não o atual)
          timestamp: item.timestamp || item.momento || item.dataColeta || new Date().toISOString(),
          momento: item.momento || item.timestamp || item.dataColeta || new Date().toISOString(),
          
          // Campos específicos por tipo
          ...(itemType === 'Teste de Vazão' && {
            ramal: item.ramal ? Number(item.ramal) : 1,
            linha: item.linha ? Number(item.linha) : 1,
            vazao1: item.vazao1 ? Number(item.vazao1) : null,
            vazao2: item.vazao2 ? Number(item.vazao2) : null,
            vazao3: item.vazao3 ? Number(item.vazao3) : null,
            mediaVazao: item.mediaVazao ? Number(item.mediaVazao) : null,
            pressaoFinal: item.pressaoFinal ? Number(item.pressaoFinal) : null,
            paf: item.paf ? Number(item.paf) : 0,
            pdf: item.pdf ? Number(item.pdf) : 0,
            pav: item.pav ? Number(item.pav) : 0,
            pdv: item.pdv ? Number(item.pdv) : 0,
            leituraFiltro: {
              paf: item.leituraFiltro?.paf ? Number(item.leituraFiltro.paf) : (item.paf ? Number(item.paf) : 0),
              pdf: item.leituraFiltro?.pdf ? Number(item.leituraFiltro.pdf) : (item.pdf ? Number(item.pdf) : 0)
            },
            leituraValvula: {
              pav: item.leituraValvula?.pav ? Number(item.leituraValvula.pav) : (item.pav ? Number(item.pav) : 0),
              pdv: item.leituraValvula?.pdv ? Number(item.leituraValvula.pdv) : (item.pdv ? Number(item.pdv) : 0)
            },
            tipo_monitoramento: 'Teste de Vazão'
          }),
          
          ...(itemType === 'Monitoramento de Solo' && {
            ponto: item.ponto ? Number(item.ponto) : 1,
            zero_a_trinta_cm: item.zero_a_trinta_cm || 'N/A',
            trinta_a_sessenta_cm: item.trinta_a_sessenta_cm || 'N/A',
            possui_minhoca: Boolean(item.possui_minhoca || false),
            possui_enraizamento: Boolean(item.possui_enraizamento || false)
          }),
          
          ...(itemType === 'Limpeza de Arraste' && {
            tipo_limpeza: item.tipo_limpeza || 'arraste'
          }),
          
          // Campos obrigatórios
          fazenda: item.fazenda || userData?.fazenda || 'Fazenda Padrão',
          talhao: item.talhao || 'Talhão Padrão',
          usuario: item.usuario || userData?.nome || 'Usuário',
          matricula: item.matricula || userData?.matricula || 'Não Informada',
          
          // Status para aparecer no sininho
          _syncStatus: 'pending',
          _restoredAt: new Date().toISOString(),
          sincronizado: false,
          
          // Limpar metadados
          _backupTipo: undefined,
          _backupOrigem: undefined
        };

        console.log(`Dados restaurados para ${itemType}:`, {
          id: restoredItem.id,
          gps: restoredItem.gps,
          timestamp: restoredItem.timestamp,
          momento: restoredItem.momento
        });

        // Determinar chave do AsyncStorage
        let storageKey;
        if (itemType === 'Limpeza de Arraste') {
          storageKey = 'limpezas_offline';
        } else if (itemType === 'Teste de Vazão') {
          storageKey = 'dadosVazaoLinhas';
        } else if (itemType === 'Monitoramento de Solo') {
          storageKey = 'monitoramentos_offline';
        } else if (itemType === 'Análise de Frutos') {
          storageKey = 'analise_frutos_offline';
        } else if (itemType === 'Maturação Forçada') {
          storageKey = 'maturacao_forcada_offline';
        } else {
          storageKey = 'monitoramentos_offline';
        }

        // Salvar no AsyncStorage
        const existingData = await AsyncStorage.getItem(storageKey);
        let dataArray = existingData ? JSON.parse(existingData) : [];
        
        // Verificação de duplicatas
        const exists = dataArray.some(existing => {
          const sameUser = existing.usuario === restoredItem.usuario;
          const sameFazenda = existing.fazenda === restoredItem.fazenda;
          const sameTalhao = existing.talhao === restoredItem.talhao;
          
          if (itemType === 'Teste de Vazão') {
            return sameUser && sameFazenda && sameTalhao &&
                   existing.ramal === restoredItem.ramal &&
                   existing.linha === restoredItem.linha;
          } else if (itemType === 'Monitoramento de Solo') {
            return sameUser && sameFazenda && sameTalhao &&
                   existing.ponto === restoredItem.ponto;
          } else if (itemType === 'Análise de Frutos') {
            return sameUser && sameFazenda &&
                   existing.controle === restoredItem.controle &&
                   existing.variedade === restoredItem.variedade &&
                   existing.tipo_analise === restoredItem.tipo_analise;
          } else {
            const sameTime = Math.abs(
              new Date(existing.momento || existing.timestamp || 0) -
              new Date(restoredItem.momento || restoredItem.timestamp || 0)
            ) < 60000;
            return sameUser && sameFazenda && sameTalhao && sameTime;
          }
        });

        if (!exists) {
          dataArray.push(restoredItem);
          await AsyncStorage.setItem(storageKey, JSON.stringify(dataArray));
          importedCount++;
          console.log(`✓ ${itemType} restaurado em ${storageKey}`);
        } else {
          duplicateCount++;
          console.log(`- Duplicata ignorada: ${itemType}`);
        }

      } catch (itemError) {
        console.error('Erro no item:', itemError);
        errorCount++;
      }
    }

    // Atualizar sininho
    await fetchOfflineData();

    // Mostrar resultado
    if (importedCount > 0) {
      Alert.alert(
        'Restauração Concluída!',
        `✓ ${importedCount} registro(s) restaurado(s)!\n` +
        (duplicateCount > 0 ? `- ${duplicateCount} duplicata(s) ignorada(s)\n` : '') +
        (errorCount > 0 ? `✗ ${errorCount} erro(s)\n` : '') +
        '\nDados corrigidos disponíveis no sininho para sincronização.',
        [
          {
            text: 'Ver Sininho',
            onPress: () => handleNotificationPress()
          },
          { text: 'OK' }
        ]
      );
    } else {
      Alert.alert(
        'Nenhum Dado Novo',
        duplicateCount > 0 
          ? `Todos os ${duplicateCount} registros já existiam`
          : errorCount > 0
            ? `Todos falharam (${errorCount} erros)`
            : 'Nenhum dado válido encontrado'
      );
    }

  } catch (error) {
    console.error('Erro geral na importação:', error);
    Alert.alert('Erro', 'Falha na importação dos dados.');
  }
};


const validateRestoredData = (item) => {
  console.log('Validando dados restaurados antes da sincronização:', {
    id: item.id,
    tipo: item.tipo,
    gps: item.gps,
    timestamp: item.timestamp,
    campos_obrigatorios: {
      fazenda: item.fazenda,
      talhao: item.talhao,
      usuario: item.usuario
    }
  });

  // Se dados foram restaurados, garantir normalização
  if (item._restoredAt) {
    console.log('Dados identificados como restaurados, aplicando normalização final...');
    
    // Normalizar GPS para formato string se necessário (para FastAPI de solo)
    if (item.tipo === 'Monitoramento de Solo' && item.gps && typeof item.gps === 'object') {
      item.gps = `[${item.gps.latitude}, ${item.gps.longitude}]`;
    }
    
    // Garantir formato correto de timestamp
    if (item.timestamp) {
      try {
        const date = new Date(item.timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        item.momento = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      } catch (error) {
        console.error('Erro ao formatar timestamp restaurado:', error);
        item.momento = new Date().toISOString();
      }
    }
  }
  
  return item;
};

// Função para importar os dados do backup




const normalizeGPSData = (gpsData) => {
  if (!gpsData) return null;
  
  // Se já é string no formato correto
  if (typeof gpsData === 'string') {
    if (gpsData === '[0, 0]' || gpsData === null || gpsData === 'null') {
      return null;
    }
    return gpsData;
  }
  
  // Se é objeto com latitude e longitude
  if (typeof gpsData === 'object' && gpsData.latitude && gpsData.longitude) {
    return {
      latitude: Number(gpsData.latitude),
      longitude: Number(gpsData.longitude),
      accuracy: Number(gpsData.accuracy || 999)
    };
  }
  
  // Se é array [lat, lng]
  if (Array.isArray(gpsData) && gpsData.length >= 2) {
    return {
      latitude: Number(gpsData[0]),
      longitude: Number(gpsData[1]),
      accuracy: 999
    };
  }
  
  return null;
};

// 2. Normalizar coordenadas para formato específico
const normalizeCoordinatesData = (gpsData) => {
  const normalized = normalizeGPSData(gpsData);
  return normalized;
};

// 3. Normalizar timestamp
const normalizeTimestamp = (timestamp) => {
  if (!timestamp) return new Date().toISOString();
  
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      console.warn('Timestamp inválido, usando atual:', timestamp);
      return new Date().toISOString();
    }
    return date.toISOString();
  } catch (error) {
    console.error('Erro ao normalizar timestamp:', error);
    return new Date().toISOString();
  }
};

// 4. Normalizar campos por tipo de dados
const normalizeFieldsByType = (item, itemType) => {
  if (itemType === 'Teste de Vazão') {
    return {
      // Garantir campos numéricos
      ramal: item.ramal ? Number(item.ramal) : 1,
      linha: item.linha ? Number(item.linha) : 1,
      vazao1: item.vazao1 ? Number(item.vazao1) : null,
      vazao2: item.vazao2 ? Number(item.vazao2) : null,
      vazao3: item.vazao3 ? Number(item.vazao3) : null,
      mediaVazao: item.mediaVazao ? Number(item.mediaVazao) : null,
      pressaoFinal: item.pressaoFinal ? Number(item.pressaoFinal) : null,
      
      // Garantir dados de pressão
      paf: item.paf ? Number(item.paf) : (item.leituraFiltro?.paf ? Number(item.leituraFiltro.paf) : 0),
      pdf: item.pdf ? Number(item.pdf) : (item.leituraFiltro?.pdf ? Number(item.leituraFiltro.pdf) : 0),
      pav: item.pav ? Number(item.pav) : (item.leituraValvula?.pav ? Number(item.leituraValvula.pav) : 0),
      pdv: item.pdv ? Number(item.pdv) : (item.leituraValvula?.pdv ? Number(item.leituraValvula.pdv) : 0),
      
      // Estruturas aninhadas
      leituraFiltro: {
        paf: item.leituraFiltro?.paf ? Number(item.leituraFiltro.paf) : (item.paf ? Number(item.paf) : 0),
        pdf: item.leituraFiltro?.pdf ? Number(item.leituraFiltro.pdf) : (item.pdf ? Number(item.pdf) : 0)
      },
      leituraValvula: {
        pav: item.leituraValvula?.pav ? Number(item.leituraValvula.pav) : (item.pav ? Number(item.pav) : 0),
        pdv: item.leituraValvula?.pdv ? Number(item.leituraValvula.pdv) : (item.pdv ? Number(item.pdv) : 0)
      },
      
      tipo_monitoramento: 'Teste de Vazão',
      tempo: item.tempo ? String(item.tempo) : ''
    };
    
  } else if (itemType === 'Monitoramento de Solo') {
    return {
      ponto: item.ponto ? Number(item.ponto) : 1,
      zero_a_trinta_cm: item.zero_a_trinta_cm || item.umidade_0_30 || 'N/A',
      trinta_a_sessenta_cm: item.trinta_a_sessenta_cm || item.umidade_30_60 || 'N/A',
      possui_minhoca: Boolean(item.possui_minhoca || false),
      possui_enraizamento: Boolean(item.possui_enraizamento || false)
    };
    
  } else if (itemType === 'Limpeza de Arraste') {
    return {
      tipo_limpeza: item.tipo_limpeza || 'arraste'
    };
  }
  
  return {};
};

const isDuplicateData = (existing, newItem, itemType) => {
  const sameUser = existing.usuario === newItem.usuario;
  const sameFazenda = existing.fazenda === newItem.fazenda;
  const sameTalhao = existing.talhao === newItem.talhao;
  
  if (itemType === 'Teste de Vazão') {
    return sameUser && sameFazenda && sameTalhao && 
           existing.ramal === newItem.ramal && 
           existing.linha === newItem.linha;
           
  } else if (itemType === 'Monitoramento de Solo') {
    return sameUser && sameFazenda && sameTalhao && 
           existing.ponto === newItem.ponto;
           
  } else if (itemType === 'Limpeza de Arraste') {
    const timeDiff = Math.abs(
      new Date(existing.momento || existing.timestamp || 0) - 
      new Date(newItem.momento || newItem.timestamp || 0)
    );
    return sameUser && sameFazenda && sameTalhao && timeDiff < 60000; // 1 minuto
  }
  
  return false;
};






const syncSingleItem = async (item, useFastAPI = false) => {


  try {
    if (!item || !item.id || !item.asyncStorageKey) {
      throw new Error('Item inválido ou faltando propriedades obrigatórias.');
    }

    const parseGpsString = (gpsString) => {
      if (!gpsString || typeof gpsString !== 'string') return null;
      const cleaned = gpsString.replace(/[\[\]]/g, '').trim();
      const parts = cleaned.split(',').map(s => s.trim());
      if (parts.length < 2) return null;
      const latitude = Number(parts[0]);
      const longitude = Number(parts[1]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return { latitude, longitude, accuracy: 999 };
    };

    const formatGpsString = (gpsValue) => {
      if (!gpsValue) return null;
      if (typeof gpsValue === 'string') return gpsValue;
      if (typeof gpsValue === 'object' && gpsValue.latitude != null && gpsValue.longitude != null) {
        return `[${gpsValue.latitude}, ${gpsValue.longitude}]`;
      }
      return null;
    };

    const validateRestoredDataForSync = (item) => {
  if (item._restoredAt) {
    console.log('Aplicando correções finais para dados restaurados...');

    // Para Monitoramento de Solo: GPS como string para FastAPI
    if (item.tipo === 'Monitoramento de Solo' && item.gps && typeof item.gps === 'object') {
      item.gps = `[${item.gps.latitude}, ${item.gps.longitude}]`;
    }

    // Para Teste de Vazão: formato de data Oracle
    if (item.tipo === 'Teste de Vazão' && item.timestamp) {
      item.momento = formatDateForOracle(item.timestamp);
      item.timestampPressao = formatDateForOracle(item.timestamp);
    }

    // Para Monitoramento de Solo: formato de data
    if (item.tipo === 'Monitoramento de Solo' && (item.timestamp || item.momento)) {
      const date = new Date(item.timestamp || item.momento);
      item.momento = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    }
  }
  return item;
};
    console.log(`📤 Iniciando sincronização: ${item.id} (${item.tipo})`);
    console.log(`🚀 FastAPI: ${useFastAPI ? 'ATIVADO' : 'DESATIVADO (apenas servidor local)'}`);

    // Preparar dados conforme o tipo
    let serverData;
    let endpoint;
    let requestConfig = {};
    let oracleSuccess = false;
    let fastApiSuccess = false;

    // *** DADOS DE LIMPEZA ***
    if (item.tipo === 'Limpeza de Arraste' ||
        item.asyncStorageKey === 'limpezas_offline' ||
        item.tipo_limpeza) {
      
      endpoint = '/limpeza';
      
      // Extrair coordenadas GPS corretamente
      let gpsData = null;
      const possibleGpsFields = [
        item.coordenadas,
        item.gps, 
        item.originalData?.coordenadas,
        item.originalData?.gps
      ];
      
      for (const gpsField of possibleGpsFields) {
        if (gpsField && gpsField.latitude && gpsField.longitude) {
          gpsData = {
            latitude: Number(gpsField.latitude),
            longitude: Number(gpsField.longitude),
            accuracy: Number(gpsField.accuracy || 999)
          };
          break;
        }
      }
      
      console.log('🗺️ GPS extraído para limpeza:', gpsData);
      
      serverData = {
        id: item.id,
        fazenda: item.fazenda || userData?.fazenda || '',
        talhao: item.talhao || '',
        usuario: item.usuario || userData?.nome || '',
        matricula: item.matricula || userData?.matricula || 'Não Informada',
        momento: formatDateForOracle(item.timestamp || item.momento || item.dataColeta || new Date().toISOString()),
        gps: gpsData,
        tipo_limpeza: item.tipo_limpeza || item.originalData?.tipo_limpeza || '',
        timestamp: formatDateForOracle(new Date()),
      };

    // DADOS DE VAZÃO
    } else if (item.tipo === 'Teste de Vazão' ||
        item.asyncStorageKey === 'dadosVazaoLinhas' ||
        item.ramal || item.linha || item.mediaVazao || item.pressaoFinal) {

      endpoint = '/salvar-dados-vazao';

      // 🔍 DEBUG: Verificar GPS antes de enviar
      const gpsField = item.gps || item.coordenadas || item.originalData?.gps;
      console.log('🔍 DEBUG TESTE DE VAZÃO - GPS:', {
        item_gps: item.gps,
        item_coordenadas: item.coordenadas,
        originalData_gps: item.originalData?.gps,
        gps_final: gpsField,
        gps_valido: !!(gpsField && gpsField.latitude !== 0 && gpsField.longitude !== 0),
        ramal: item.ramal,
        linha: item.linha
      });

      serverData = {
        id: item.id,
        fazenda: item.fazenda || userData?.fazenda || '',
        talhao: item.talhao || '',
        usuario: item.usuario || userData?.nome || '',
        timestamp: item.timestamp || item.momento || item.dataColeta || new Date().toISOString(),
        ramal: parseInt(item.ramal) || 1,
        linha: parseInt(item.linha) || 1,
        tempo: item.tempo ?? item.originalData?.tempo ?? null,
        vazao1: item.vazao1 ?? item.v1 ?? item.originalData?.vazao1 ?? item.originalData?.v1 ?? null,
        vazao2: item.vazao2 ?? item.v2 ?? item.originalData?.vazao2 ?? item.originalData?.v2 ?? null,
        vazao3: item.vazao3 ?? item.v3 ?? item.originalData?.vazao3 ?? item.originalData?.v3 ?? null,
        mediaVazao: item.mediaVazao ?? item.media_vazao ?? item.originalData?.mediaVazao ?? item.originalData?.media_vazao ?? null,
        media_vazao: item.media_vazao ?? item.mediaVazao ?? item.originalData?.media_vazao ?? item.originalData?.mediaVazao ?? null,
        pressaoFinal: item.pressaoFinal ?? item.pressao_final ?? item.originalData?.pressaoFinal ?? item.originalData?.pressao_final ?? null,
        pressao_final: item.pressao_final ?? item.pressaoFinal ?? item.originalData?.pressao_final ?? item.originalData?.pressaoFinal ?? null,
        paf: item.paf || item.originalData?.paf,
        pdf: item.pdf || item.originalData?.pdf,
        pav: item.pav || item.originalData?.pav,
        pdv: item.pdv || item.originalData?.pdv,
        gps: gpsField,
        matricula: item.matricula || userData?.matricula || 'Não Informada',
        tipo_monitoramento: 'Teste de Vazão',
      };

    // DADOS DE MONITORAMENTO DE SOLO
    } else if (item.tipo === 'Monitoramento de Solo' || item.asyncStorageKey === 'monitoramentos_offline') {
      
      endpoint = '/monitoramento';

      const gpsObject =
        (item.coordenadas && item.coordenadas.latitude && item.coordenadas.longitude)
          ? { latitude: Number(item.coordenadas.latitude), longitude: Number(item.coordenadas.longitude), accuracy: Number(item.coordenadas.accuracy || 999) }
          : (item.gps && typeof item.gps === 'object' && item.gps.latitude && item.gps.longitude)
            ? { latitude: Number(item.gps.latitude), longitude: Number(item.gps.longitude), accuracy: Number(item.gps.accuracy || 999) }
            : (item.originalData?.gps && typeof item.originalData.gps === 'object' && item.originalData.gps.latitude && item.originalData.gps.longitude)
              ? { latitude: Number(item.originalData.gps.latitude), longitude: Number(item.originalData.gps.longitude), accuracy: Number(item.originalData.gps.accuracy || 999) }
              : parseGpsString(item.gps || item.originalData?.gps);

      const gpsString =
        formatGpsString(item.gps) ||
        formatGpsString(item.coordenadas) ||
        formatGpsString(item.originalData?.gps);

      serverData = {
        fazenda: item.fazenda || item.originalData?.fazenda || '',
        talhao: item.talhao || item.originalData?.talhao || '',
        ponto: item.ponto || item.originalData?.ponto || '',
        usuario: item.usuario || item.originalData?.usuario || '',
        momento: formatDateForOracle(item.dataColeta || item.momento || new Date().toISOString()),
        gps: gpsObject,
        gps_string: gpsString,
        zero_a_trinta_cm: item.umidade_0_30 || item.zero_a_trinta_cm || item.originalData?.zero_a_trinta_cm || null,
        trinta_a_sessenta_cm: item.umidade_30_60 || item.trinta_a_sessenta_cm || item.originalData?.trinta_a_sessenta_cm || null,
        possui_minhoca: item.possui_minhoca || item.originalData?.possui_minhoca || false,
        possui_enraizamento: item.possui_enraizamento || item.originalData?.possui_enraizamento || false,
        matricula: item.matricula || item.originalData?.matricula || userData?.matricula || 'Não Informada',
      };

    // DADOS DE MANUTENÇÃO DE BOMBA
    } else if (item.tipo === 'Manutenção de Bomba' || 
               item.asyncStorageKey === 'manutencoes_offline' ||
               item.bomba || item.equipamento || item.manutencoes) {
      
      endpoint = '/manutencao-bomba';
      serverData = {
        id: item.id,
        fazenda: item.fazenda || item.originalData?.fazenda || userData?.fazenda || '',
        talhao: item.talhao || item.originalData?.talhao || '',
        bomba: item.bomba || item.originalData?.bomba || '',
        equipamento: item.equipamento || item.originalData?.equipamento || '',
        usuario: item.usuario || item.originalData?.usuario || userData?.nome || '',
        matricula: item.matricula || item.originalData?.matricula || userData?.matricula || 'Não Informada',
        momento: formatDateForOracle(item.dataColeta || item.momento || item.timestamp || new Date().toISOString()),
        manutencoes: item.manutencoes || item.originalData?.manutencoes || '',
        timestamp: formatDateForOracle(new Date()),
      };

    // DADOS DE CONSUMO DE ÁGUA
    } else if (item.tipo === 'Consumo de Água' || item.asyncStorageKey === 'consumo_agua_offline' || item.hidrometros) {

      endpoint = '/consumo-agua';
      serverData = {
        id: item.id,
        fazenda: item.fazenda || item.originalData?.fazenda || userData?.fazenda || '',
        talhao: item.talhao || item.originalData?.talhao || '',
        usuario: item.usuario || item.originalData?.usuario || userData?.nome || '',
        cargo: item.cargo || item.originalData?.cargo || userData?.cargo || '',
        matricula: item.matricula || item.originalData?.matricula || userData?.matricula || '',
        tipo_lancamento: item.tipo_lancamento || item.originalData?.tipo_lancamento || '',
        dia_lancamento: item.dia_lancamento || item.originalData?.dia_lancamento || '',
        hidrometros: item.hidrometros || item.originalData?.hidrometros || '[]',
        data_momento: item.data_momento || item.dataColeta || item.timestamp || new Date().toISOString(),
        timestamp: item.timestamp || new Date().toISOString(),
      };

    // DADOS DE CADASTRO KC
    } else if (item.tipo === 'Cadastro KC' || item.asyncStorageKey === 'kc_talhao_offline') {

      endpoint = '/kc-talhao';
      serverData = {
        id: item.id,
        fazenda: item.fazenda || item.originalData?.fazenda || userData?.fazenda || '',
        talhao: item.talhao || item.originalData?.talhao || '',
        usuario: item.usuario || item.originalData?.usuario || userData?.nome || '',
        cargo: item.cargo || item.originalData?.cargo || userData?.cargo || '',
        matricula: item.matricula || item.originalData?.matricula || userData?.matricula || '',
        kc: item.kc ?? item.originalData?.kc ?? 0,
        eto: item.eto ?? item.originalData?.eto ?? null,
        precipitacao: item.precipitacao ?? item.originalData?.precipitacao ?? null,
        data: item.data || item.originalData?.data || '',
        momento: item.momento || item.data_momento || item.dataColeta || item.timestamp || new Date().toISOString(),
        data_momento: item.data_momento || item.dataColeta || item.timestamp || new Date().toISOString(),
        timestamp: item.timestamp || new Date().toISOString(),
      };

    // DADOS DE AUDITORIA LUCIANO
    } else if (item.tipo === 'Auditoria Luciano' || item.asyncStorageKey === 'auditoria_luciano_offline') {

      endpoint = '/auditoria-luciano';
      const originalData = item.originalData || item;
      const checklistParaEnviar = (originalData.checklist || []).map(c => ({
        pergunta_id: c.pergunta_id,
        pergunta: c.pergunta,
        status: c.status,
        observacao: c.observacao || '',
      }));
      serverData = {
        form_id: originalData.id || item.id || null,
        momento: originalData.momento || new Date().toISOString(),
        data: originalData.data || '',
        fazenda: originalData.fazenda || userData?.fazenda || '',
        usuario: originalData.usuario || userData?.nome || '',
        matricula: originalData.matricula || userData?.matricula || '',
        checklist: checklistParaEnviar,
      };
      // Fotos ficam no originalData.checklist para upload após o POST principal
      serverData._fotosChecklist = originalData.checklist || [];

    // DADOS DE MATURAÇÃO FORÇADA
    } else if (item.tipo === 'Maturação Forçada' || item.asyncStorageKey === 'maturacao_forcada_offline') {

      endpoint = '/maturacao-forcada';
      const mf = item.originalData || item;
      const formDataMF = new FormData();
      formDataMF.append('comprador',    mf.comprador    || '');
      formDataMF.append('produtor',     mf.produtor     || '');
      formDataMF.append('parcela',      mf.parcela      || '');
      formDataMF.append('responsavel',  mf.responsavel  || '');
      formDataMF.append('variedade',    mf.variedade    || '');
      formDataMF.append('dataRec',      mf.dataRec      || '');
      formDataMF.append('dataAna',      mf.dataAna      || '');
      formDataMF.append('obs',          mf.obs          || '');
      formDataMF.append('qtd',          String(mf.qtd   || '0'));
      formDataMF.append('te',           String(mf.te    || '0'));
      formDataMF.append('pc',           mf.pc           || '[]');
      formDataMF.append('df',           mf.df           || '[]');
      formDataMF.append('peduncular',   mf.peduncular   || '[]');
      formDataMF.append('antracnose',   String(mf.antracnose  || '0'));
      formDataMF.append('colapso',      String(mf.colapso     || '0'));
      formDataMF.append('germinacao',   String(mf.germinacao  || '0'));
      formDataMF.append('alternaria',   String(mf.alternaria  || '0'));
      formDataMF.append('totalDefeito', String(mf.totalDefeito || '0'));
      formDataMF.append('incidencia',   String(mf.incidencia  || '0'));
      formDataMF.append('momento',      mf.momento || new Date().toISOString());
      formDataMF.append('usuario',      mf.usuario    || userData?.nome    || '');
      formDataMF.append('matricula',    mf.matricula  || userData?.matricula || '');
      serverData = formDataMF;
      requestConfig = { headers: { 'Content-Type': 'multipart/form-data' } };

    // DADOS DE ANÁLISE DE FRUTOS
    } else if (item.tipo === 'Análise de Frutos' || item.asyncStorageKey === 'analise_frutos_offline') {

      endpoint = '/analise-frutos';
      const analisePayload = item.originalData || item;
      serverData = buildAnaliseFrutosFormData(analisePayload);
      requestConfig = {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      };

    } else {
      throw new Error(`Tipo de dados não suportado: ${item.tipo}`);
    }

    console.log('📦 Enviando dados para:', endpoint);
    console.log('📄 Dados do servidor:', JSON.stringify(serverData, null, 2));

    // Extrair fotos da auditoria antes de enviar (não enviar URIs locais no JSON)
    const fotosAuditoria = serverData._fotosChecklist || null;
    if (serverData._fotosChecklist) delete serverData._fotosChecklist;

    // *** TENTATIVA 1: SERVIDOR LOCAL (Oracle/SQLite) ***
    try {
      console.log('📤 Tentando SQLite/Oracle primeiro...');
      const oracleResponse = await api.post(endpoint, serverData, requestConfig);
      // api.post retorna response.data diretamente (interceptor linha 225 de api.js)
      // Se não lançou exceção, o envio foi bem-sucedido
      console.log('✅ Sucesso SQLite/Oracle:', oracleResponse);
      oracleSuccess = true;

      // Upload de fotos da auditoria em paralelo (se houver)
      if (fotosAuditoria && endpoint === '/auditoria-luciano') {
        const fazendaAuditoria = serverData.fazenda || '';
        const formIdAuditoria = serverData.form_id || null;
        const itemsComFoto = fotosAuditoria.filter(c => c.fotoUri);
        await Promise.all(itemsComFoto.map(async (checkItem) => {
          try {
            const formDataFoto = new FormData();
            formDataFoto.append('fazenda', fazendaAuditoria);
            formDataFoto.append('pergunta_id', String(checkItem.pergunta_id));
            if (formIdAuditoria) formDataFoto.append('form_id', String(formIdAuditoria));
            const ext = checkItem.fotoUri.split('.').pop()?.toLowerCase() || 'jpg';
            formDataFoto.append('foto', {
              uri: checkItem.fotoUri,
              name: `auditoria_pergunta_${checkItem.pergunta_id}.${ext}`,
              type: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
            });
            await api.post('/upload-fotos-auditoria', formDataFoto, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            console.log(`📸 Foto pergunta ${checkItem.pergunta_id} enviada`);
          } catch (fotoErr) {
            console.warn(`⚠️ Falha upload foto pergunta ${checkItem.pergunta_id}:`, fotoErr.message);
          }
        }));
      }
    } catch (error) {
      console.warn('⚠️ Erro SQLite/Oracle:', error.message);
      if (item.tipo === 'Teste de Vazão') {
        console.log('🔍 DEBUG: Teste de Vazão com ERRO no servidor local');
        console.log('🔍 Erro completo:', error);
      }
    }

    // *** TENTATIVA 2: SERVIDOR NUVEM (FastAPI) ***
    // NOTA: Só usa FastAPI se IP selecionado for 10.107.114.11:3003 E não for Manutenção de Bomba
    if (useFastAPI && item.tipo !== 'Manutenção de Bomba') {
      try {
        console.log('📤 Tentando FastAPI/Nuvem (IP: 10.107.114.11:3003)...');

        // Preparar dados para FastAPI baseado no tipo
        let fastApiData;
        let usuario = "controladoria";
        let senha = "n1q305V27aq";
        let modulo = "dev_monitoramento_limpeza";

        if (item.tipo === 'Limpeza de Arraste' || item.tipo_limpeza) {
        modulo = "dev_monitoramento_limpeza";
        // Função para converter para formato Oracle
        function formatDateForOracle(dateString) {
          try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          } catch {
            return dateString;
          }
        }
        fastApiData = {
          ...serverData,
          // Converter momento para formato Oracle
          momento: formatDateForOracle(item.momento || item.dataColeta || serverData.momento),
          gps: serverData.gps && serverData.gps.latitude && serverData.gps.longitude
            ? `[${serverData.gps.latitude}, ${serverData.gps.longitude}]`
            : '[0, 0]'
        };
      } else if (item.tipo === 'Monitoramento de Solo') {
        modulo = "controladoria_umidade";
        fastApiData = {
          ...serverData,
          gps: serverData.gps_string || (serverData.gps ? `[${serverData.gps.latitude}, ${serverData.gps.longitude}]` : null),
        };
      } else if (item.tipo === 'Teste de Vazão') {
        modulo = "teste_vazao_pressao";
        fastApiData = {
          ...serverData,
          leituraFiltro: {
            paf: serverData.paf || 0,
            pdf: serverData.pdf || 0,
          },
          leituraValvula: {
            pav: serverData.pav || 0,
            pdv: serverData.pdv || 0,
          },
          timestampPressao: serverData.timestamp,
        };
        // 🔍 DEBUG: Ver GPS enviado para FastAPI
        console.log('🔍 DEBUG: GPS sendo enviado para FastAPI:', {
          gps: fastApiData.gps,
          gps_valido: !!(fastApiData.gps && fastApiData.gps.latitude !== 0 && fastApiData.gps.longitude !== 0)
        });
      }

      const fastApiResult = await syncWithFastApi(fastApiData, usuario, senha, modulo);

      if (fastApiResult.success) {
        console.log('✅ Sucesso FastAPI/Nuvem:', fastApiResult);
        fastApiSuccess = true;
      } else {
        console.warn('⚠️ Falha FastAPI/Nuvem:', fastApiResult.error);
        // 🔍 DEBUG: Ver se foi rejeitado por GPS
        if (item.tipo === 'Teste de Vazão') {
          console.log('🔍 DEBUG: Teste de Vazão REJEITADO no FastAPI');
          console.log('🔍 Erro completo:', JSON.stringify(fastApiResult, null, 2));
        }
      }
    } catch (error) {
      console.warn('⚠️ Erro FastAPI/Nuvem:', error.message);
    }
    } else {
      // FastAPI não será usado (IP diferente de 10.107.114.11:3003 OU é Manutenção de Bomba)
      if (item.tipo === 'Manutenção de Bomba') {
        console.log('ℹ️ Manutenção de Bomba: Usando apenas servidor local (sem FastAPI)');
      } else {
        console.log('ℹ️ IP selecionado não usa FastAPI - dados serão salvos apenas no servidor local');
      }
    }

    // *** AVALIAR RESULTADO FINAL ***
    // 🔥 NOVA REGRA BASEADA NO IP SELECIONADO:
    // - Se useFastAPI = true (IP 10.107.114.11:3003) E não for Manutenção de Bomba → PRECISA de AMBOS (LOCAL + FastAPI)
    // - Se useFastAPI = false (outros IPs) OU for Manutenção de Bomba → só precisa do LOCAL

    const isBomba = item.tipo === 'Manutenção de Bomba';

    let syncSuccess;
    let failureReason = '';

    if (useFastAPI && !isBomba) {
      // IP 10.107.114.11:3003: PRECISA de AMBOS (LOCAL + FastAPI)
      syncSuccess = oracleSuccess && fastApiSuccess;

      if (!oracleSuccess && !fastApiSuccess) {
        failureReason = 'Falha em AMBOS servidores (Local + Nuvem)';
      } else if (!oracleSuccess) {
        failureReason = 'Falha no servidor LOCAL (SQLite/Oracle)';
      } else if (!fastApiSuccess) {
        failureReason = 'Falha no servidor NUVEM (FastAPI) - dados NÃO foram para nuvem';
      }
    } else {
      // Outros IPs ou Manutenção de Bomba: só precisa do LOCAL
      syncSuccess = oracleSuccess;
      if (!oracleSuccess) {
        failureReason = 'Falha ao salvar no servidor local';
      }
    }

    if (syncSuccess) {
      // Upload de fotos do hidrômetro (Consumo de Água)
      if (item.tipo === 'Consumo de Água' || item.asyncStorageKey === 'consumo_agua_offline') {
        const hidrometrosList = item.hidrometros || item.originalData?.hidrometros || [];
        const parsedHidrometros = typeof hidrometrosList === 'string' ? JSON.parse(hidrometrosList) : hidrometrosList;
        const fazenda = item.fazenda || item.originalData?.fazenda || userData?.fazenda || '';
        const tipoLancamento = item.tipo_lancamento || item.originalData?.tipo_lancamento || '';
        const mesSelecionado = item.mes || item.originalData?.mes || '';

        for (let i = 0; i < parsedHidrometros.length; i++) {
          const medidor = parsedHidrometros[i];
          // Upload foto inicial
          if (medidor.fotoInicial) {
            try {
              const formDataUpload = new FormData();
              formDataUpload.append('fazenda', fazenda);
              formDataUpload.append('medidor_numero', String(i + 1));
              formDataUpload.append('tipo', 'inicial');
              formDataUpload.append('leitura', String(medidor.inicial || '0'));
              formDataUpload.append('tipo_lancamento', tipoLancamento);
              formDataUpload.append('mes', mesSelecionado);
              const ext = medidor.fotoInicial.split('.').pop() || 'jpg';
              formDataUpload.append('fotos', {
                uri: medidor.fotoInicial,
                name: `hidrometro_${i + 1}_inicial.${ext}`,
                type: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
              });
              await api.post('/upload-fotos-hidrometro', formDataUpload, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
              console.log(`📸 Foto inicial do Medidor ${i + 1} enviada`);
            } catch (uploadErr) {
              console.warn(`⚠️ Erro ao enviar foto inicial Medidor ${i + 1}:`, uploadErr.message);
            }
          }
          // Upload foto final
          if (medidor.fotoFinal) {
            try {
              const formDataUpload = new FormData();
              formDataUpload.append('fazenda', fazenda);
              formDataUpload.append('medidor_numero', String(i + 1));
              formDataUpload.append('tipo', 'final');
              formDataUpload.append('leitura', String(medidor.final || '0'));
              formDataUpload.append('tipo_lancamento', tipoLancamento);
              formDataUpload.append('mes', mesSelecionado);
              const ext = medidor.fotoFinal.split('.').pop() || 'jpg';
              formDataUpload.append('fotos', {
                uri: medidor.fotoFinal,
                name: `hidrometro_${i + 1}_final.${ext}`,
                type: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
              });
              await api.post('/upload-fotos-hidrometro', formDataUpload, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
              console.log(`📸 Foto final do Medidor ${i + 1} enviada`);
            } catch (uploadErr) {
              console.warn(`⚠️ Erro ao enviar foto final Medidor ${i + 1}:`, uploadErr.message);
            }
          }
        }
      }

      let message;
      if (useFastAPI && !isBomba) {
        // IP 10.107.114.11:3003: Ambos funcionaram
        message = '✅ Dados salvos em AMBOS sistemas (Local + Nuvem)';
        console.log('🎉 SUCESSO TOTAL: Dados salvos LOCAL + NUVEM (FastAPI)');
      } else {
        // Outros IPs ou Manutenção de Bomba: apenas local
        message = 'Dados enviados com sucesso!';
        console.log('✅ SUCESSO: Dados salvos LOCALMENTE');
      }

      // Remover da lista pendente (sininho) - AsyncStorage é removido em lote no syncOfflineData
      setFilteredPendingData(prev => prev.filter(p => p.id !== item.id));
      setNotificationCount(prev => Math.max(0, prev - 1));

      console.log('✅ Item sincronizado');
      return { success: true, message, syncedItem: item };

    } else {
      // 🔥 FALHA: Pelo menos um servidor necessário falhou
      // Log detalhado apenas no console (para debug técnico)
      console.error(`❌ FALHA NA SINCRONIZAÇÃO: ${failureReason}`);
      console.error(`   - Oracle/Local: ${oracleSuccess ? '✅' : '❌'}`);
      console.error(`   - FastAPI/Nuvem: ${fastApiSuccess ? '✅' : '❌'} ${useFastAPI ? '(obrigatório)' : '(não usado)'}`);

      // Mensagem simples para o usuário (sem detalhes técnicos)
      throw new Error('Falha na sincronização. Verifique se está conectado ao Wi-Fi corporativo.');
    }

  } catch (error) {
    // Log detalhado no console para debug
    console.error(`❌ Erro na sincronização ${item?.id}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    // 📱 Mensagem SIMPLES e AMIGÁVEL para o usuário
    let userMessage = 'Não foi possível sincronizar. Verifique se está conectado ao Wi-Fi corporativo.';

    // Atualizar status de erro
    const itemId = item.originalData?.id || item.originalData?._id || item.id;
    if (itemId && item.asyncStorageKey) {
      await updateSyncStatus(
        item.asyncStorageKey,
        itemId,
        'error',
        null,
        userMessage
      );
    }

    return { success: false, error: userMessage };
  }
};


const syncWithFastApiSafely = async (item, serverData) => {
  try {
    let usuarioFastApi, senhaFastApi, moduloFastApi, fastApiData;
    
    // *** NOVO: SUPORTE PARA LIMPEZA ***
    if (item.tipo === 'Limpeza de Arraste' || 
        item.asyncStorageKey === 'limpezas_offline' ||
        item.tipo_limpeza) {
      
      usuarioFastApi = "controladoria";
      senhaFastApi = "n1q305V27aq";
      moduloFastApi = "dev_monitoramento_limpeza";
      
      fastApiData = {
        fazenda: serverData.fazenda,
        talhao: serverData.talhao,
        usuario: serverData.usuario,
        momento: formatDateForOracle(serverData.momento),
        tipo_limpeza: serverData.tipo_limpeza,
        matricula: serverData.matricula,
        // Formatação correta do GPS para FastAPI
        gps: serverData.gps && serverData.gps.latitude && serverData.gps.longitude 
          ? `[${serverData.gps.latitude}, ${serverData.gps.longitude}]`
          : '[0, 0]'
      };

    } else if (item.tipo === 'Monitoramento de Solo') {
      usuarioFastApi = "controladoria";
      senhaFastApi = "n1q305V27aq";
      moduloFastApi = "controladoria_umidade";
      
      fastApiData = {
        tipo: 'Monitoramento de Solo',
        fazenda: serverData.fazenda,
        talhao: serverData.talhao,
        usuario: serverData.usuario,
        momento: serverData.momento,
        gps: serverData.gps,
        ponto: serverData.ponto,
        zero_a_trinta_cm: serverData.zero_a_trinta_cm,
        trinta_a_sessenta_cm: serverData.trinta_a_sessenta_cm,
        possui_minhoca: serverData.possui_minhoca,
        possui_enraizamento: serverData.possui_enraizamento,
      };

    } else if (item.tipo === 'Teste de Vazão') {
      usuarioFastApi = "controladoria";
      senhaFastApi = "n1q305V27aq";
      moduloFastApi = "teste_vazao_pressao";
      
      // Formatação correta da data para Oracle
      const timestampFormatado = formatDateForOracle(serverData.timestamp);
      
      fastApiData = {
        tipo: 'Teste de Vazão',
        fazenda: serverData.fazenda,
        usuario: serverData.usuario,
        ramal: serverData.ramal,
        linha: serverData.linha,
        talhao: serverData.talhao,
        tempo: serverData.tempo,
        vazao1: serverData.vazao1,
        vazao2: serverData.vazao2,
        vazao3: serverData.vazao3,
        mediaVazao: serverData.mediaVazao,
        pressaoFinal: serverData.pressaoFinal,
        paf: serverData.paf,
        pdf: serverData.pdf,
        pav: serverData.pav,
        pdv: serverData.pdv,
        leituraFiltro: {
          paf: serverData.paf,
          pdf: serverData.pdf,
        },
        leituraValvula: {
          pav: serverData.pav,
          pdv: serverData.pdv,
        },
        gps: serverData.gps,
        timestamp: timestampFormatado,
        id: serverData.id,
        timestampPressao: timestampFormatado,
        tipo_monitoramento: serverData.tipo_monitoramento,
      };
    }

    if (fastApiData && usuarioFastApi && senhaFastApi && moduloFastApi) {
      console.log('📤 Tentando sincronizar com FastAPI...');
      
      const fastApiResult = await Promise.race([
        syncWithFastApi(fastApiData, usuarioFastApi, senhaFastApi, moduloFastApi),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('FastAPI timeout')), 15000)
        )
      ]);
      
      if (fastApiResult.success) {
        console.log('✅ FastAPI: Sincronização bem-sucedida');
      } else {
        console.warn('⚠️ FastAPI falhou:', fastApiResult.error);
      }
    }

  } catch (error) {
    console.warn('⚠️ FastAPI error (não crítico):', error.message);
    // FastAPI é opcional, então não propagamos o erro
  }
};




const showDetailedError = (error, context = '') => {
  let title = 'Erro na Sincronização';
  let message = error.message || 'Erro desconhecido';
  let actions = [{ text: 'OK' }];

  if (error.message?.includes('Token') || error.message?.includes('Sessão')) {
    title = 'Sessão Expirada';
    message = 'Sua sessão expirou. Você precisa fazer login novamente.';
    actions = [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Fazer Login', 
        onPress: async () => {
          const logoutSuccess = await signOut();
          if (!logoutSuccess) {
            console.error('❌ Falha no logout automático');
          }
        }
      }
    ];

  } else if (error.message?.includes('Servidor') || error.message?.includes('conexão')) {
    title = 'Problema de Conexão';
    message = 'Não foi possível conectar ao servidor. Verifique sua conexão Wi-Fi e tente novamente.';
    actions = [
      { text: 'Tentar Depois' },
      { text: 'Tentar Agora', onPress: () => syncOfflineData() }
    ];

  } else if (error.message?.includes('Timeout')) {
    title = 'Tempo Limite Excedido';
    message = 'A sincronização está demorando muito. Verifique sua conexão.';
  }

  Alert.alert(title, message, actions);
};


  const syncOfflineData = async () => {
  if (syncInProgress) {
    console.log('ℹ️ Sincronização já em andamento...');
    return;
  }

  setSyncInProgress(true);
  setSyncProgress(0);
  setCancelSync(false);

  try {
    // Verificar servidor antes de começar
    const serverStatus = await api.checkServerStatus();
    if (!serverStatus.success) {
      Alert.alert(
        'Sem Conexão',
        'Verifique se está conectado ao Wi-Fi corporativo.',
        [{ text: 'OK' }]
      );
      setSyncInProgress(false);
      return;
    }

    setIsOnline(true);

    const dataToSync = filteredPendingData;
    if (dataToSync.length === 0) {
      Alert.alert('Info', 'Nenhum dado pendente para sincronizar.');
      setSyncInProgress(false);
      return;
    }

    // Obter IP selecionado e determinar se usa FastAPI
    const currentURL = api.getCurrentURL();
    const useFastAPI = currentURL === 'http://10.107.114.11:3003';

    console.log(`📡 IP selecionado: ${currentURL}`);
    console.log(`🚀 FastAPI: ${useFastAPI ? 'ATIVADO' : 'DESATIVADO (apenas servidor local)'}`);

    // Verificar servidor LOCAL uma única vez
    const isLocalOnline = await checkInternetConnection();
    if (!isLocalOnline) {
      console.log('❌ Servidor LOCAL offline, tentando alternativo...');
      const findResult = await api.findWorkingURL();
      if (!findResult.success) {
        throw new Error('Servidor LOCAL não disponível. Verifique sua conexão Wi-Fi.');
      }
      console.log(`✅ Servidor LOCAL alternativo encontrado: ${findResult.workingUrl}`);
    }

    let syncedCount = 0;
    let errorCount = 0;
    const errors = [];
    const BATCH_SIZE = 20;

    // Processar em lotes de 20 itens
    for (let batchStart = 0; batchStart < dataToSync.length; batchStart += BATCH_SIZE) {
      // Verificar se foi cancelado
      if (cancelSync) {
        console.log('⏸️ Sincronização cancelada pelo usuário');
        Alert.alert(
          'Sincronização Cancelada',
          `${syncedCount} de ${dataToSync.length} itens foram sincronizados antes do cancelamento.`
        );
        break;
      }

      const batchEnd = Math.min(batchStart + BATCH_SIZE, dataToSync.length);
      const batch = dataToSync.slice(batchStart, batchEnd);

      console.log(`📦 Processando lote ${Math.floor(batchStart / BATCH_SIZE) + 1}: itens ${batchStart + 1} a ${batchEnd} de ${dataToSync.length}`);

      // Processar todos os itens do lote em paralelo
      const batchResults = await Promise.all(
        batch.map(item => syncSingleItem(item, useFastAPI))
      );

      // Contar sucessos e erros do lote
      const syncedItemsThisBatch = [];
      batchResults.forEach((result, index) => {
        const item = batch[index];
        const globalIndex = batchStart + index;

        if (result.success) {
          syncedCount++;
          syncedItemsThisBatch.push(item);
          console.log(`✅ Item ${globalIndex + 1}/${dataToSync.length} sincronizado: ${item.tipo}`);
        } else {
          errorCount++;
          errors.push({
            tipo: item.tipo || 'Desconhecido',
            talhao: item.talhao || 'N/A',
            error: result.error || 'Erro desconhecido',
          });
          console.log(`❌ Item ${globalIndex + 1}/${dataToSync.length} falhou: ${result.error}`);
        }
      });

      // Remover itens sincronizados do AsyncStorage em lote (1 leitura+escrita por chave, sem race condition)
      if (syncedItemsThisBatch.length > 0) {
        const byKey = {};
        syncedItemsThisBatch.forEach(item => {
          if (!byKey[item.asyncStorageKey]) byKey[item.asyncStorageKey] = [];
          byKey[item.asyncStorageKey].push(item);
        });

        for (const [key, items] of Object.entries(byKey)) {
          try {
            const storedRaw = await AsyncStorage.getItem(key);
            if (storedRaw) {
              let stored = JSON.parse(storedRaw);
              if (Array.isArray(stored)) {
                items.forEach(item => {
                  const origId = item.originalData?.id || item.originalData?._id;
                  if (origId) {
                    stored = stored.filter(s => s.id !== origId && s._id !== origId);
                  } else {
                    const origKey = getUniqueKey(item.originalData || item);
                    stored = stored.filter(s => getUniqueKey(s) !== origKey);
                  }
                });
                await AsyncStorage.setItem(key, JSON.stringify(stored));
                console.log(`🗑️ ${items.length} item(s) removido(s) de ${key}`);
              }
            }
          } catch (removeError) {
            console.error(`Erro ao remover itens de ${key}:`, removeError);
          }
        }
      }

      // Atualizar progresso após cada lote
      setSyncProgress(Math.round((batchEnd / dataToSync.length) * 100));

      console.log(`📊 Progresso: ${syncedCount} sucesso, ${errorCount} erros de ${batchEnd} processados`);
    }

    // Atualizar dados offline após sincronização
    await fetchOfflineData();

    // Mostrar resultado
    if (syncedCount > 0 && errorCount === 0) {
      Alert.alert(
        'Sincronização Completa!',
        `Todos os ${syncedCount} dados foram enviados com sucesso!`
      );
    } else if (syncedCount > 0 && errorCount > 0) {
      Alert.alert(
        'Sincronização Parcial',
        `${syncedCount} dados enviados com sucesso.\n${errorCount} não puderam ser enviados.\n\nVerifique sua conexão Wi-Fi.`,
        [
          { text: 'OK' }
        ]
      );
    } else {
      Alert.alert(
        'Falha na Sincronização',
        'Verifique se está conectado ao Wi-Fi corporativo e tente novamente.'
      );
    }

  } catch (error) {
    console.error('❌ Erro geral na sincronização:', error);
    Alert.alert(
      'Erro na Sincronização',
      'Verifique sua conexão Wi-Fi e tente novamente.'
    );
  } finally {
    setSyncInProgress(false);
    setSyncProgress(0);
    handleCloseModal();
  }
};

  const updateSyncStatus = async (asyncStorageKey, itemIdToUpdate, status, serverId = null, error = null) => {
    try {
      if (!userData || !userData.matricula) {
        console.warn('⚠️ updateSyncStatus: userData ou matricula não definido.');
        return;
      }
      if (!asyncStorageKey || !itemIdToUpdate) {
        console.warn('⚠️ updateSyncStatus: asyncStorageKey ou itemIdToUpdate inválido.');
        return;
      }
      const storedData = await AsyncStorage.getItem(asyncStorageKey);
      if (!storedData) {
        console.warn(`⚠️ updateSyncStatus: Nenhum dado encontrado para a chave ${asyncStorageKey}.`);
        return;
      }
      let data = JSON.parse(storedData);
      if (Array.isArray(data)) {
        let updated = false;
        // itemIdToUpdate pode ser sintético (ex: "maturacao_forcada_offline_2") quando o item
        // não tinha id no AsyncStorage — nesse caso extrai o índice do sufixo
        const syntheticMatch = itemIdToUpdate.match(new RegExp(`^${asyncStorageKey}_(\\d+)$`));
        const syntheticIndex = syntheticMatch ? parseInt(syntheticMatch[1], 10) : -1;

        data = data.map((item, idx) => {
          const matchById = (item.id && item.id === itemIdToUpdate) || (item._id && item._id === itemIdToUpdate);
          const matchByIndex = syntheticIndex >= 0 && idx === syntheticIndex && !item.id;
          if (matchById || matchByIndex) {
            updated = true;
            return {
              ...item,
              id: item.id || itemIdToUpdate,
              _syncStatus: status,
              _syncedAt: status === 'synced' ? new Date().toISOString() : undefined,
              _serverId: serverId,
              _syncError: error,
            };
          }
          return item;
        });
        if (!updated) {
          console.warn(`⚠️ Nenhum item correspondente encontrado em ${asyncStorageKey}. ID: ${itemIdToUpdate}`);
        }
      } else {
        data = {
          ...data,
          _syncStatus: status,
          _syncedAt: status === 'synced' ? new Date().toISOString() : undefined,
          _serverId: serverId,
          _syncError: error,
        };
      }
      await AsyncStorage.setItem(asyncStorageKey, JSON.stringify(data));
      console.log(`✅ Status atualizado para ${asyncStorageKey}: ${status}`);
    } catch (error) {
      console.error(`Erro ao atualizar status para ${asyncStorageKey}:`, error);
    }
  };

  const clearSyncedData = async () => {
    try {
      const monitoramentosOffline = await AsyncStorage.getItem('monitoramentos_offline');
      if (!monitoramentosOffline) {
        Alert.alert('Nada para Limpar', 'Não há dados sincronizados para remover.');
        return;
      }
      const monitoramentos = JSON.parse(monitoramentosOffline);
      const syncedItems = monitoramentos.filter(item => item._syncStatus === 'synced');
      const remainingItems = monitoramentos.filter(item => item._syncStatus !== 'synced');
      if (syncedItems.length === 0) {
        Alert.alert('Nada para Limpar', 'Não há dados sincronizados para remover.');
        return;
      }
      Alert.alert('Confirmar Limpeza', `Deseja remover ${syncedItems.length} item(s)?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.setItem('monitoramentos_offline', JSON.stringify(remainingItems));
            Alert.alert('Limpeza Concluída', `${syncedItems.length} item(s) removido(s).`);
            await fetchOfflineData();
          },
        },
      ]);
    } catch (error) {
      console.error('Erro ao limpar dados:', error);
      Alert.alert('Erro', 'Não foi possível limpar os dados sincronizados.');
    }
  };
  
useEffect(() => {
  const initializeApp = async () => {
    try {
      console.log('🚀 Inicializando aplicação...');
      
      // *** NOVA: Limpeza específica de cache desnecessário ***
      await cleanupUnnecessaryCache();
      
      // Limpar dados antigos (ngrok, etc.)
      await api.cleanupOldData();
      
      // Inicializar API
      await api.safeInitialize();
      
      // Verificar status do servidor
      const serverStatus = await api.checkServerStatus();
      if (serverStatus.success) {
        console.log('✅ Servidor disponível:', serverStatus.workingUrl);
        setIsOnline(true);

        // Pré-carrega e salva listas offline para uso sem internet
        api.get('/talhoes')
          .then(res => {
            const list = res?.data ?? res;
            if (Array.isArray(list) && list.length > 0)
              AsyncStorage.setItem('@maturacao:talhoes', JSON.stringify(list));
          })
          .catch(() => {});

        api.get('/maturacao-forcada/catalogo/parcelas')
          .then(res => {
            const list = res?.data ?? res;
            if (Array.isArray(list) && list.length > 0)
              AsyncStorage.setItem('@maturacao:catalogo', JSON.stringify(list));
          })
          .catch(() => {});

      } else {
        console.log('❌ Nenhum servidor disponível');
        setIsOnline(false);
      }
      
    } catch (error) {
      console.error('❌ Erro na inicialização:', error);
      setIsOnline(false);
    }
  };

  initializeApp();
}, []);
  

  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();
        const isConnected = networkState.type === Network.NetworkStateType.WIFI && networkState.isConnected;
        setIsWifiConnected(isConnected);
      } catch (error) {
        console.error('Erro ao verificar conexão Wi-Fi:', error);
        setIsWifiConnected(false);
      }
    };
    checkNetwork();
    const intervalId = setInterval(checkNetwork, 5000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      await fetchUserData();
      const isConnected = await checkInternetConnection();
      setIsOnline(isConnected);

      // *** LIMPEZA AUTOMÁTICA: Remove dados com +30 dias do cache ***
      console.log('🗑️ Executando limpeza automática de dados antigos...');
      const cleanupResult = await cleanOldDataFromCache();

      if (cleanupResult.success) {
        console.log(`✅ Limpeza concluída: ${cleanupResult.totalRemoved} registros removidos`);
        console.log('📊 Detalhes:', cleanupResult.details);
      } else {
        console.error('❌ Erro na limpeza automática:', cleanupResult.error);
      }
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    if (userData) fetchOfflineData();
  }, [userData]);

  // Versão atual do app (deve bater com ajuda.jsx)
  const APP_VERSION = 'Teste - 1.3.5';

  // Comparar versões semanticamente: "1.0.6" > "1.0.5" → true
  const isNewerVersion = (serverVer, appVer) => {
    const parse = v => String(v).split('.').map(Number);
    const s = parse(serverVer);
    const a = parse(appVer);
    for (let i = 0; i < Math.max(s.length, a.length); i++) {
      const sv = s[i] || 0;
      const av = a[i] || 0;
      if (sv > av) return true;
      if (sv < av) return false;
    }
    return false;
  };

  useEffect(() => {
    const verificarVersao = async () => {
      try {
        const baseURL = api.defaults.baseURL || 'http://10.107.114.51:3000/api';
        const response = await fetch(`${baseURL}/versao-app`, { method: 'GET' });
        if (!response.ok) return;
        const data = await response.json();
        if (data.versao && isNewerVersion(data.versao, APP_VERSION)) {
          setNovaVersao({
            versao: data.versao,
            mensagem: data.mensagem || 'Nova versão disponível! Conecte ao Wi-Fi Visitante e atualize o app.',
          });
        } else {
          setNovaVersao(null);
        }
      } catch {
        // Sem conexão ou servidor offline — não mostra nada
      }
    };
    verificarVersao();
  }, []);

  useEffect(() => {
    if (!userData || fixedIpAppliedRef.current) return;
    fixedIpAppliedRef.current = true;
    applyFixedIpFromBanco();
  }, [userData]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (userData) fetchOfflineData();
      if (!loading) startHeroAvatarAnimation();
    });
    return unsubscribe;
  }, [loading, navigation, userData]);

  useEffect(() => {
    if (notificationCount > 0) {
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulseAnimation.start();
      return () => pulseAnimation.stop();
    }
  }, [notificationCount]);

  useEffect(() => {
    if (loading) {
      heroAvatarSequenceRef.current?.stop?.();
      heroAvatarAnim.setValue(0);
      heroAvatarSpinAnim.setValue(0);
      return undefined;
    }

    startHeroAvatarAnimation();

    return () => {
      heroAvatarSequenceRef.current?.stop?.();
      heroAvatarAnim.stopAnimation();
      heroAvatarSpinAnim.stopAnimation();
      heroAvatarAnim.setValue(0);
      heroAvatarSpinAnim.setValue(0);
    };
  }, [heroAvatarAnim, heroAvatarSpinAnim, loading]);

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.cubic }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
  }, [loading]);

  // Carregar IP selecionado ao iniciar
  useEffect(() => {
    const loadCurrentIP = async () => {
      try {
        const currentURL = await AsyncStorage.getItem('api_base_url');
        setSelectedIP(currentURL || api.getCurrentURL());
      } catch (error) {
        console.error('Erro ao carregar IP atual:', error);
      }
    };

    loadCurrentIP();
  }, []);

  // *** LIMPEZA AUTOMÁTICA A CADA 24 HORAS ***
  useEffect(() => {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 horas em ms

    const cleanupInterval = setInterval(async () => {
      console.log('⏰ Executando limpeza automática programada (24h)...');
      const result = await cleanOldDataFromCache();

      if (result.success && result.totalRemoved > 0) {
        console.log(`✅ Limpeza automática: ${result.totalRemoved} registros antigos removidos`);
      }
    }, TWENTY_FOUR_HOURS);

    console.log('🔄 Limpeza automática configurada para executar a cada 24 horas');

    return () => clearInterval(cleanupInterval);
  }, []);

  const handleLogout = () => {
    Alert.alert("Sair", "Deseja realmente sair?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        onPress: async () => {
          console.log('🚪 Iniciando logout via AuthContext...');
          setIsLoggingOut(true);
          try {
            const success = await signOut();
            if (success) {
              console.log('✅ Logout realizado com sucesso via AuthContext');
              Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
                Animated.timing(scaleAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
              ]).start(() => {
                console.log('🎯 AuthProvider irá redirecionar automaticamente para Login');
              });
            } else {
              console.error('❌ Falha no logout via AuthContext');
              Alert.alert('Erro', 'Não foi possível fazer logout. Tente novamente.');
              setIsLoggingOut(false);
            }
          } catch (error) {
            console.error('❌ Erro no logout:', error);
            Alert.alert('Erro', 'Erro inesperado ao fazer logout.');
            setIsLoggingOut(false);
          }
        },
      },
    ]);
  };

  const openDeviceWifiSettings = async () => {
    try {
      if (Platform.OS === 'android' && typeof Linking.sendIntent === 'function') {
        try {
          await Linking.sendIntent('android.settings.WIFI_SETTINGS');
          return true;
        } catch (wifiError) {
          console.warn('⚠️ Não foi possível abrir WIFI_SETTINGS, tentando WIRELESS_SETTINGS:', wifiError);
          await Linking.sendIntent('android.settings.WIRELESS_SETTINGS');
          return true;
        }
      }

      await Linking.openSettings();
      return true;
    } catch (error) {
      console.error('❌ Erro ao abrir configurações de rede:', error);
      return false;
    }
  };

  const handleUpdateBannerPress = () => {
    Alert.alert(
      'Atualização disponível',
      'Vamos sair da conta e abrir as configurações de rede para você trocar o Wi-Fi. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: async () => {
            try {
              setIsLoggingOut(true);
              const logoutSuccess = await signOut();

              if (!logoutSuccess) {
                Alert.alert('Erro', 'Nao foi possivel sair da conta. Tente novamente.');
                setIsLoggingOut(false);
                return;
              }

              const settingsOpened = await openDeviceWifiSettings();
              if (!settingsOpened) {
                Alert.alert('Aviso', 'Nao foi possivel abrir as configuracoes de rede automaticamente.');
              }

              if (Platform.OS === 'android') {
                setTimeout(() => {
                  BackHandler.exitApp();
                }, 450);
              } else {
                setIsLoggingOut(false);
              }
            } catch (error) {
              console.error('Erro ao processar atualizacao de versao:', error);
              Alert.alert('Erro', 'Nao foi possivel finalizar essa acao. Tente novamente.');
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };


const cleanupUnnecessaryCache = async () => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const now = Date.now();
    const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 dias
    
    // APENAS chaves que podem ser removidas (NÃO incluir talhoes_cache_)
    const unnecessaryCacheKeys = allKeys.filter(key => 
      key.startsWith('leituras_ramal_') ||           // Cache de pressão específica
      key.startsWith('teste_vazao_pressao_ramal_') || // Cache de teste específico
      key.startsWith('backup_dados_erro_') ||        // Backups de erro antigos
      key.startsWith('cache_pressao') ||             // Cache de pressão geral
      key.startsWith('cache_vazao') ||               // Cache de vazão geral
      key.includes('_temp') ||                       // Dados temporários
      key.includes('restored_') ||                   // Dados restaurados antigos
      (key.includes('backup_') && !key.includes('talhoes')) // Backups (exceto talhões)
    );
    
    console.log('🔍 Verificando cache desnecessário:', unnecessaryCacheKeys.length, 'chaves');
    
    const keysToRemove = [];
    
    for (const key of unnecessaryCacheKeys) {
      try {
        const data = await AsyncStorage.getItem(key);
        
        if (data) {
          const parsed = JSON.parse(data);
          const cacheTimestamp = parsed.timestamp || parsed._timestamp || 0;
          
          // Se cache é antigo (7 dias), marcar para remoção
          if (now - cacheTimestamp > CACHE_EXPIRY) {
            keysToRemove.push(key);
          }
        }
      } catch (error) {
        // Se não conseguir parsear, é cache corrompido - remover
        keysToRemove.push(key);
      }
    }
    
    // Remover caches desnecessários
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
      console.log('🧹 Cache desnecessário limpo:', keysToRemove.length, 'chaves removidas');
    }
    
    // Limpeza de arquivos temporários
    await cleanupTempFiles();
    
  } catch (error) {
    console.error('❌ Erro na limpeza de cache desnecessário:', error);
  }
};

const cleanupTempFiles = async () => {
  try {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const files = await FileSystem.readDirectoryAsync(cacheDir);
        
        const now = Date.now();
        const FILE_EXPIRY = 2 * 60 * 60 * 1000; // 2 horas para arquivos de backup temp
        
        for (const file of files) {
          try {
            if (file.includes('AgrodanIrriga_Backup_') || 
                file.endsWith('.sql') || 
                file.includes('backup_temp')) {
              
              const filePath = cacheDir + file;
              const fileInfo = await FileSystem.getInfoAsync(filePath);
              
              if (fileInfo.exists && 
                  fileInfo.modificationTime && 
                  now - fileInfo.modificationTime > FILE_EXPIRY) {
                
                await FileSystem.deleteAsync(filePath, { idempotent: true });
                console.log('🗑️ Arquivo temporário antigo removido:', file);
              }
            }
          } catch (fileError) {
            console.log('⚠️ Erro ao processar arquivo:', file);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro na limpeza de arquivos temporários:', error);
  }
};



  const handleNotificationPress = () => {
    if (notificationCount === 0) {
      Alert.alert("Info", "Não há dados pendentes para enviar.");
      return;
    }
    setModalListReady(false);
    setShowNotificationModal(true);
    Animated.spring(modalAnim, { toValue: 1, friction: 6, useNativeDriver: true }).start(() => {
      // Só renderiza a lista depois que a animação terminar
      InteractionManager.runAfterInteractions({
        name: 'renderModalList',
        run: () => setModalListReady(true),
      });
    });
  };

  const handleCloseModal = () => {
    // Fechar modal (sincronização continua em segundo plano se estiver rodando)
    Animated.timing(modalAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setShowNotificationModal(false);
    });
  };

  const handleCancelSync = () => {
    if (syncInProgress) {
      // Se está sincronizando, perguntar se quer cancelar
      Alert.alert(
        'Cancelar Sincronização?',
        'Tem certeza que deseja cancelar a sincronização em andamento?',
        [
          { text: 'Não', style: 'cancel' },
          {
            text: 'Sim, Cancelar',
            style: 'destructive',
            onPress: () => {
              setCancelSync(true);
            }
          }
        ]
      );
    } else {
      // Se não está sincronizando, apenas fechar o modal
      handleCloseModal();
    }
  };

  // Configuração de IP
  const [savedCustomIP, setSavedCustomIP] = React.useState(null);
  const [appOptions, setAppOptions] = React.useState(
    SERVIDORES_PADRAO.map((item) => ({ ...item }))
  );
  const [bankOptions, setBankOptions] = React.useState([]);
  const [serverListMode, setServerListMode] = React.useState('app'); // app | banco

  const [customIP, setCustomIP] = React.useState('');
  const [testAbortController, setTestAbortController] = React.useState(null);
  const optionsToRender = serverListMode === 'app' ? appOptions : bankOptions;

  const handleOpenIPConfig = async () => {
    try {
      // Carregar IP atual
      const currentURL = await AsyncStorage.getItem('api_base_url');
      setSelectedIP(currentURL || api.getCurrentURL());

      // IPs padrao (fixos do app)
      setServerListMode('app');
      let appDisponiveis = SERVIDORES_PADRAO.map((item) => ({ ...item }));
      let servidoresBanco = [];

      // Tentar buscar IPs do banco de dados
      try {
        const storedUserId = await AsyncStorage.getItem('userId');
        const idUser =
          storedUserId ||
          userData?.id ||
          userData?.ID_USER ||
          userData?.id_user ||
          userData?.matricula;

        if (!idUser) {
          console.log('Sem id_user para filtrar servidores do banco');
          setAppOptions(appDisponiveis);
          setBankOptions(servidoresBanco);
          setShowIPConfigModal(true);
          return;
        }

        console.log('Buscando servidores do banco...');

        // Tentar conectar ao servidor principal para buscar a lista
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${SERVIDOR_PRINCIPAL}/servidores-ip/usuario/${idUser}`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          }
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const resultado = await response.json();
          console.log('Servidores obtidos do banco (filtrado por usuario):', resultado);

          if (resultado.data && resultado.data.length > 0) {
            let bancoId = 1;
            const listaBanco = [];
            const listaFixos = []; // IPs fixos que vão SUBSTITUIR os padrão

            resultado.data.forEach((servidor) => {
              // ip_fixo SUBSTITUI os servidores padrão
              if (servidor?.ip_fixo) {
                let urlFixo = servidor.ip_fixo;

                // Adicionar http:// se não tiver
                if (!urlFixo.startsWith('http://') && !urlFixo.startsWith('https://')) {
                  urlFixo = 'http://' + urlFixo;
                }

                listaFixos.push({
                  id: listaFixos.length + 1,
                  label: servidor.nome_servidor || 'Servidor (Banco)',
                  url: urlFixo
                });
              }

              // ip_endereco vai para "Meus Servidores"
              if (servidor?.ip_endereco) {
                let url = servidor.ip_endereco;

                // Adicionar http:// se não tiver
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                  url = 'http://' + url;
                }

                listaBanco.push({
                  id: bancoId++,
                  label: servidor.nome_servidor || 'Servidor (Banco)',
                  url: url
                });
              }
            });

            // Se tiver ip_fixo no banco, SUBSTITUI os servidores padrão
            if (listaFixos.length > 0) {
              console.log('✅ IPs fixos do banco encontrados, substituindo servidores padrão');
              appDisponiveis = listaFixos;
            } else {
              console.log('ℹ️ Sem ip_fixo no banco, mantendo servidores padrão');
            }

            // Remover duplicados dos servidores do banco
            const urlsJaInclusas = new Set();
            servidoresBanco = listaBanco.filter((srv) => {
              if (!srv.url || urlsJaInclusas.has(srv.url)) return false;
              urlsJaInclusas.add(srv.url);
              return true;
            });

            console.log('IPs do banco (Meus Servidores):', servidoresBanco);
            console.log('IPs padrão:', appDisponiveis);
          }
        } else {
          console.log('Resposta nao OK do servidor, usando IPs padrao');
        }
      } catch (fetchError) {
        console.log('Nao foi possivel buscar IPs do banco, usando padrao:', fetchError.message);
      }

      // Carregar IP customizado salvo localmente
      const savedCustom = await AsyncStorage.getItem('custom_ip_saved');
      if (savedCustom) {
        setSavedCustomIP(savedCustom);

        // Adicionar IP customizado se nao estiver na lista do app
        const jaExisteNaLista = appDisponiveis.some(srv => srv.url === savedCustom);
        if (!jaExisteNaLista) {
          appDisponiveis.push({
            id: appDisponiveis.length + 1,
            label: 'IP Personalizado (Local)',
            url: savedCustom
          });
        }
      }

      setAppOptions(appDisponiveis);
      setBankOptions(servidoresBanco);
      setShowIPConfigModal(true);
    } catch (error) {
      console.error('Erro ao abrir configuração de IP:', error);
      setShowIPConfigModal(true);
    }
  };

  const applyFixedIpFromBanco = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('userId');
      const idUser =
        storedUserId ||
        userData?.id ||
        userData?.ID_USER ||
        userData?.id_user ||
        userData?.matricula;

      if (!idUser) {
        console.log('Sem id_user para aplicar ip_fixo do banco');
        return false;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let response;
      try {
        response = await fetch(`${SERVIDOR_PRINCIPAL}/servidores-ip/usuario/${idUser}`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          }
        });
      } catch (_fetchError) {
        return false;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response || !response.ok) {
        return false;
      }

      const resultado = await response.json();
      const servidores = Array.isArray(resultado?.data) ? resultado.data : [];
      if (!servidores.length) {
        return false;
      }

      const servidorFixo = servidores.find(s => s?.ip_fixo && String(s.ip_fixo).trim() !== '');
      if (!servidorFixo) {
        return false;
      }

      const formattedUrl = api.formatURL(servidorFixo.ip_fixo);
      await api.updateBaseURL(formattedUrl);
      setSelectedIP(formattedUrl);

      setBankOptions((prev) => {
        if (prev.some(opt => opt.url === formattedUrl)) return prev;
        return [
          ...prev,
          { id: prev.length + 1, label: 'Servidor Fixo (Banco)', url: formattedUrl }
        ];
      });

      console.log('IP fixo aplicado do banco:', formattedUrl);
      return true;

      console.log('Nenhum IP fixo encontrado no banco');
      return false;
    } catch (error) {
      console.log('Erro ao aplicar IP fixo do banco:', error?.message || error);
      return false;
    }
  };

  const handleCancelTest = () => {
    if (testAbortController) {
      testAbortController.abort();
      setTestAbortController(null);
    }
    setTestingIP(false);
  };

  const handleSelectIP = async (ipUrl) => {
    setTestingIP(true);

    // Criar AbortController para poder cancelar
    const controller = new AbortController();
    setTestAbortController(controller);

    try {
      // Testar conexão com o IP
      const result = await api.testConnection(ipUrl);

      // Se foi cancelado, não fazer nada
      if (controller.signal.aborted) {
        return;
      }

      if (result.success) {
        // Salvar IP selecionado
        await api.updateBaseURL(ipUrl);
        setSelectedIP(ipUrl);

        // Se for um IP customizado (nao esta nos servidores padrao e nem no banco), salvar
        const isFromBanco = bankOptions.some(opt => opt.url === ipUrl);
        const isCustomIP = !SERVIDORES_PADRAO.some(opt => opt.url === ipUrl) && !isFromBanco;
        if (isCustomIP) {
          await AsyncStorage.setItem('custom_ip_saved', ipUrl);
          setSavedCustomIP(ipUrl);
          // Atualizar lista de op??es
          setAppOptions((prev) => {
            const baseUrls = new Set(SERVIDORES_PADRAO.map(s => s.url));
            const extras = prev.filter(opt => !baseUrls.has(opt.url) && opt.url !== ipUrl);
            return [
              ...SERVIDORES_PADRAO,
              ...extras,
              { id: SERVIDORES_PADRAO.length + extras.length + 1, label: 'IP Personalizado', url: ipUrl },
            ];
          });
        }

        setCustomIP(''); // Limpar campo customizado

        Alert.alert(
          'Sucesso!',
          `IP configurado com sucesso!\n\n${ipUrl}`,
          [
            {
              text: 'OK',
              onPress: () => setShowIPConfigModal(false)
            }
          ]
        );
      } else {
        Alert.alert(
          'Erro de Conexão',
          `Não foi possível conectar ao servidor:\n\n${result.error}\n\nVerifique se o servidor está ativo.`
        );
      }
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) {
        console.log('Teste cancelado pelo usuário');
        return;
      }
      Alert.alert(
        'Erro',
        'Erro ao testar conexão com o servidor.'
      );
    } finally {
      setTestingIP(false);
      setTestAbortController(null);
    }
  };

  const handleSaveCustomIP = async () => {
    if (!customIP.trim()) {
      Alert.alert('Atenção', 'Digite um IP válido');
      return;
    }

    // Formatar URL se necessário
    let formattedIP = customIP.trim();
    if (!formattedIP.startsWith('http://') && !formattedIP.startsWith('https://')) {
      formattedIP = 'http://' + formattedIP;
    }

    await handleSelectIP(formattedIP);
  };

  const formatDate = (dateString) => {
  try {
    if (!dateString || 
        dateString === 'undefined' || 
        dateString === 'null' || 
        dateString === null || 
        dateString === undefined) {
      console.warn('formatDate: dateString inválido:', dateString);
      return 'Data não informada';
    }

    if (typeof dateString === 'string' && dateString.includes('/') && dateString.length < 25) {
      return dateString;
    }

    const date = new Date(dateString);
    
    if (isNaN(date.getTime())) {
      console.warn('formatDate: Data inválida:', dateString);
      return 'Data inválida';
    }
    
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) {
      console.warn('formatDate: Data fora do intervalo:', dateString);
      return 'Data incorreta';
    }
    
    return date.toLocaleDateString('pt-BR') + ' ' + 
           date.toLocaleTimeString('pt-BR', { 
             hour: '2-digit', 
             minute: '2-digit' 
           });
  } catch (error) {
    console.error('formatDate: Erro:', error, 'Input:', dateString);
    return 'Erro na data';
  }
};

  const getUserName = () => {
    if (!userData) {
      if (user) {
        const n = user.nome || user.name || user.NAME || user.userName || user.username;
        if (n && typeof n === 'string' && n.trim()) return n.trim();
      }
      return 'Usuário';
    }
    const possibleNames = [
      userData.nome, userData.name, userData.NAME, userData.userName,
      userData.username, userData.FULL_NAME, userData.full_name,
      userData.firstName, userData.first_name,
    ];
    for (let name of possibleNames) {
      if (name && typeof name === 'string' && name.trim()) return name.trim();
    }
    return 'Usuário';
  };

  const getUserField = (...fields) => {
    const source = userData || user || {};
    for (const field of fields) {
      const value = source?.[field];
      if (value !== null && value !== undefined) {
        const parsed = String(value).trim();
        if (parsed) return parsed;
      }
    }
    return '-';
  };

  const profileName = getUserName();
  const profileFuncao = getUserField('funcao', 'cargo', 'setor', 'modulo');
  const heroIconOpacity = heroAvatarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const heroIconScale = heroAvatarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.92],
  });
  const heroMangaScale = heroAvatarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });
  const heroMangaRotate = heroAvatarSpinAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['0deg', '360deg', '720deg'],
  });

 
// 1. BACKUP: Copia exata dos dados do sininho


const handleBackupAllData = async (filteredPendingData = []) => {
  try {
    if (!filteredPendingData || filteredPendingData.length === 0) {
      Alert.alert("Info", "Nenhum dado pendente para backup.");
      return;
    }

    console.log('📦 Criando backup de', filteredPendingData.length, 'itens do sininho');

    // Preparar dados do backup
    const backupData = filteredPendingData.map(item => ({
      ...item.originalData,  // Dados originais completos
      // Garantir campos essenciais
      fazenda: item.originalData?.fazenda || item.fazenda,
      talhao: item.originalData?.talhao || item.talhao,
      usuario: item.originalData?.usuario || item.usuario,
      timestamp: item.originalData?.timestamp || item.timestamp,
      matricula: item.originalData?.matricula || item.matricula,
      // Metadado para restauração
      _backupTipo: item.tipo,
      _backupOrigem: item.asyncStorageKey
    }));

    const jsonString = JSON.stringify(backupData, null, 2);
    const fileName = `AgroIrriga_Backup_${new Date().toISOString().split('T')[0]}.json`;

    console.log('Tentando salvar backup:', fileName);

    // Tentar usar StorageAccessFramework primeiro (Android)
    if (Platform.OS === 'android') {
      try {
        console.log('Tentando StorageAccessFramework...');
        
        // Verificar se SAF está disponível
        if (FileSystem.StorageAccessFramework && FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync) {
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          
          if (permissions.granted) {
            console.log('Permissão concedida, criando arquivo...');
            
            const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
              permissions.directoryUri,
              fileName,
              'application/json'
            );
            
            await FileSystem.writeAsStringAsync(fileUri, jsonString);
            
            Alert.alert(
              "Backup Salvo!",
              `${backupData.length} registros salvos na pasta selecionada.\nArquivo: ${fileName}`
            );
            return; // Sucesso! Sair da função
          }
        }
        
        // Se chegou aqui, SAF não funcionou, usar fallback
        throw new Error('SAF não disponível');
        
      } catch (safError) {
        console.log('StorageAccessFramework falhou, usando sharing...', safError.message);
      }
    }
    
    // Fallback: Usar sharing (funciona sempre)
    console.log('Usando método de compartilhamento...');
    
    const tempUri = FileSystem.cacheDirectory + fileName;
    await FileSystem.writeAsStringAsync(tempUri, jsonString);
    
    await Sharing.shareAsync(tempUri, {
      mimeType: 'application/json',
      dialogTitle: 'Salvar Backup AgrodanIrriga'
    });

    Alert.alert(
      "Backup Criado!",
      `${backupData.length} registros prontos para salvar.\nUse o compartilhamento para escolher onde guardar o arquivo.`
    );

    // Limpar arquivo temporário
    setTimeout(async () => {
      try {
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
        console.log('Arquivo temporário removido');
      } catch (e) {
        console.log('Erro na limpeza:', e.message);
      }
    }, 5000);

  } catch (error) {
    console.error("Erro no backup:", error);
    Alert.alert("Erro no Backup", `Não foi possível criar backup: ${error.message}`);
  }
};






  // Verifica se o usuário tem acesso ao módulo
  const temModulo = (chave) => {
    const modulos = userData?.modulos || userData?.MODULOS;
    if (!modulos || !Array.isArray(modulos)) return true; // sem restrição = mostra tudo
    return modulos.includes(chave);
  };

  const getUserCargo = () => {
    if (!userData) return 'Dados não encontrados';
    const possibleFields = [
      userData.cargo, userData.CARGO, userData.position, userData.POSITION,
      userData.funcao, userData.FUNCAO, userData.role, userData.ROLE,
      userData.jobTitle, userData.JOB_TITLE, userData?.profile?.cargo,
      userData?.profile?.position, userData?.user_info?.funcao, userData?.user_info?.cargo,
    ];
    for (let field of possibleFields) {
      if (field && typeof field === 'string' && field.trim()) return field.trim();
    }
    return 'Cargo não especificado';
  };

  const handleBackupErrorData = async () => {
    try {
      Alert.alert(
        "Backup de Dados com Erro",
        "Esta função irá criar um backup dos dados que falharam na sincronização. Deseja continuar?",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Criar Backup",
            onPress: async () => {
              try {
                // Buscar dados com erro
                const allKeys = await AsyncStorage.getAllKeys();
                const relevantKeys = allKeys.filter(key => 
                  key === 'monitoramentos_offline' ||
                  key === 'dadosVazaoLinhas' ||
                  key.includes('pending') ||
                  key.includes('dados')
                );

                if (relevantKeys.length === 0) {
                  Alert.alert('Info', 'Nenhum dado encontrado para backup.');
                  return;
                }

                let errorDataFound = [];
                let allDataBackup = [];

                for (const key of relevantKeys) {
                  try {
                    const data = await AsyncStorage.getItem(key);
                    if (data) {
                      const parsedData = JSON.parse(data);
                      const dataArray = Array.isArray(parsedData) ? parsedData : [parsedData];
                      
                      // Adicionar todos os dados ao backup geral
                      allDataBackup.push({
                        storageKey: key,
                        data: dataArray,
                        timestamp: new Date().toISOString()
                      });

                      // Separar dados com erro
                      const errorData = dataArray.filter(item => 
                        item._syncStatus === 'error' || 
                        item._syncError ||
                        item.syncStatus === 'error'
                      );

                      if (errorData.length > 0) {
                        errorDataFound.push({
                          storageKey: key,
                          errorData: errorData,
                          totalItems: dataArray.length,
                          errorCount: errorData.length
                        });
                      }
                    }
                  } catch (parseError) {
                    console.error(`Erro ao processar chave ${key}:`, parseError);
                  }
                }

                // Criar backup completo
                const backupData = {
                  backupTimestamp: new Date().toISOString(),
                  userData: {
                    nome: userData?.nome || userData?.name,
                    matricula: userData?.matricula,
                    fazenda: userData?.fazenda
                  },
                  totalDataSources: allDataBackup.length,
                  errorDataSources: errorDataFound.length,
                  allData: allDataBackup,
                  errorDataOnly: errorDataFound
                };

                // Salvar backup
                const backupKey = `backup_dados_erro_${new Date().toISOString().replace(/:/g, '-').split('.')[0]}`;
                await AsyncStorage.setItem(backupKey, JSON.stringify(backupData));

                // Mostrar resultado
                if (errorDataFound.length > 0) {
                  const totalErrorItems = errorDataFound.reduce((sum, source) => sum + source.errorCount, 0);
                  Alert.alert(
                    'Backup Criado!',
                    `Backup salvo com sucesso!\n\n` +
                    `• ${errorDataFound.length} fontes com dados com erro\n` +
                    `• ${totalErrorItems} registros com erro encontrados\n` +
                    `• ${allDataBackup.length} fontes de dados no total\n\n` +
                    `Chave do backup: ${backupKey}`,
                    [
                      {
                        text: 'Ver Detalhes',
                        onPress: () => {
                          console.log('📋 DETALHES DO BACKUP:');
                          console.log('Total de fontes:', allDataBackup.length);
                          console.log('Fontes com erro:', errorDataFound.length);
                          errorDataFound.forEach((source, index) => {
                            console.log(`${index + 1}. ${source.storageKey}: ${source.errorCount}/${source.totalItems} com erro`);
                          });
                        }
                      },
                      { text: 'OK' }
                    ]
                  );
                } else {
                  Alert.alert(
                    'Backup Criado',
                    `Backup salvo, mas nenhum dado com erro foi encontrado.\n\n` +
                    `• ${allDataBackup.length} fontes de dados salvas\n` +
                    `• Chave do backup: ${backupKey}`
                  );
                }

              } catch (error) {
                console.error('Erro ao criar backup:', error);
                Alert.alert('Erro', 'Não foi possível criar o backup dos dados.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Erro na função de backup:', error);
      Alert.alert('Erro', 'Erro inesperado ao preparar backup.');
    }
  };

  const getUserMatricula = () => {
    if (!userData) return null;
    const possibleFields = [
      userData.matricula, userData.MATRICULA, userData.registration, userData.REGISTRATION,
      userData.employee_id, userData.EMPLOYEE_ID, userData?.profile?.matricula, userData?.user_info?.matricula,
    ];
    for (let field of possibleFields) {
      if (field && (typeof field === 'string' || typeof field === 'number')) return String(field).trim();
    }
    return null;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.mainContainer, styles.loadingContainer]}>
        <Animated.View style={[styles.loadingContent, { opacity: fadeAnim }]}>
          <Image source={require('../../assets/logoagrodan.png')} style={styles.loadingLogo} resizeMode="contain" />
          <ActivityIndicator size="large" color="#0000ff" style={styles.loadingSpinner} />
          <Text style={styles.loadingText}>Carregando dados...</Text>
        </Animated.View>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView style={[styles.mainContainer, { paddingTop: insets.top }]}>
      <View style={[styles.wifiContainer, { backgroundColor: isWifiConnected ? '#1976D2' : '#D32F2F' }]}>
        <MaterialIcons
          name={isWifiConnected ? 'wifi' : 'wifi-off'}
          size={18}
          color="#FFFFFF"
        />
        <Text style={styles.wifiText}>
          {isWifiConnected ? 'Conectado ao Wi-Fi' : 'Sem Wi-Fi'}
        </Text>
      </View>

      <View style={styles.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={require('../../assets/logoagrodann.png')} style={styles.topLogo} resizeMode="contain" />
          <View style={{ width: 1, height: 22, backgroundColor: '#2E7D32' }} />
          <Image source={require('../../../assets/CQLETRA.png')} style={styles.topLogoCQ} resizeMode="contain" />
        </View>
        <View style={styles.iconsContainer}>
          <TouchableOpacity style={styles.iconButton} onPress={handleNotificationPress}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }]}}>
              <MaterialIcons name="notifications" size={24} color={notificationCount > 0 ? "#E74C3C" : "#5E8C8D"} />
            </Animated.View>
            {notificationCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{notificationCount > 99 ? '99+' : notificationCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={handleLogout} disabled={isLoggingOut}>
            <MaterialIcons name="logout" size={24} color={isLoggingOut ? "#BDBDBD" : "#E74C3C"} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
        {novaVersao && (
          <TouchableOpacity activeOpacity={0.9} onPress={handleUpdateBannerPress} disabled={isLoggingOut}>
            <Animated.View style={[styles.updateBanner, { opacity: fadeAnim }]}>
              <MaterialIcons name="system-update" size={22} color="#FFF" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.updateBannerTitle}>Atualização disponível — v{novaVersao.versao}</Text>
                <Text style={styles.updateBannerText}>{novaVersao.mensagem}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#FFF" />
            </Animated.View>
          </TouchableOpacity>
        )}

        {notificationCount > 1 && (
          <Animated.View style={[styles.alertBanner, { opacity: fadeAnim }]}>
            <MaterialIcons name="warning" size={22} color="#E67E22" />
            <View style={styles.alertContent}>
              <Text style={styles.alertText}>{notificationCount} dado(s) offline pendente(s)</Text>
              <Text style={styles.alertSubtext}>Toque para sincronizar com o servidor</Text>
            </View>
            <TouchableOpacity style={styles.alertButton} onPress={handleNotificationPress}>
              <Text style={styles.alertButtonText}>Ver</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={styles.profileHeroCard}>
          <View style={styles.profileHeroHeaderRow}>
            <View style={styles.profileHeroIconWrap}>
              <Animated.View
                style={[
                  styles.profileHeroAvatarLayer,
                  {
                    opacity: heroIconOpacity,
                    transform: [{ scale: heroIconScale }],
                  },
                ]}
              >
                <MaterialIcons name="person-outline" size={46} color="#2F6A35" />
              </Animated.View>
              <Animated.View
                style={[
                  styles.profileHeroAvatarLayer,
                  {
                    opacity: heroAvatarAnim,
                    transform: [{ scale: heroMangaScale }, { rotate: heroMangaRotate }],
                  },
                ]}
              >
                <Image
                  source={require('../../../assets/logomanga.png')}
                  style={styles.profileHeroMangaImage}
                  resizeMode="contain"
                />
              </Animated.View>
            </View>
            <View style={styles.profileHeroTextCol}>
              <Text style={styles.profileHeroName}>Olá, {profileName}!</Text>
              <Text style={styles.profileHeroWelcome}>Seja bem-vindo ao aplicativo CQ!</Text>
              <View style={styles.profileHeroDivider} />
              <View style={styles.profileHeroMetaRow}>
                <View style={styles.profileHeroChip}>
                  <MaterialIcons name="badge" size={14} color="#1B5E20" />
                  <Text style={styles.profileHeroChipText}>{profileFuncao !== '-' ? profileFuncao : 'Equipe CQ'}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Módulos do Sistema</Text>
        <Animated.View style={[styles.menuContainer, { opacity: fadeAnim }]}>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('AnaliseFrutos')}
          activeOpacity={0.8}
          delayPressIn={0}
          delayPressOut={0}
        >
          <Image source={require('../../assets/analise_frutos.png')} style={styles.cardImage} resizeMode="cover" />
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Análise de Frutos</Text>
            <Text style={styles.cardText}>Realizar avaliação da qualidade dos frutos, registrar dados e acompanhar resultados</Text>
          </View>
        </TouchableOpacity>

<TouchableOpacity
  style={styles.card}
  onPress={() => navigation.navigate('RelatorioEmbarqueSede')}
  activeOpacity={0.8}
  delayPressIn={0}
  delayPressOut={0}
>
  <Image source={require('../../assets/embarquecard.png')} style={[styles.cardImage, { opacity: 0.5 }]} resizeMode="cover" />
  <View style={styles.cardContent}>
    <Text style={[styles.cardTitle, { opacity: 0.5 }]}>Relatorio de Embarque</Text>
    <Text style={[styles.cardText, { opacity: 0.5 }]}>Registrar informações de embarque, conferência de cargas e geração de relatório</Text>
  </View>
</TouchableOpacity>

<TouchableOpacity
  style={styles.card}
  onPress={() => navigation.navigate('MaturacaoForcada')}
  activeOpacity={0.8}
  delayPressIn={0}
  delayPressOut={0}
>
  <Image source={require('../../assets/maturacao.png')} style={[styles.cardImage, { opacity: 0.5 }]} resizeMode="cover" />
  <View style={styles.cardContent}>
    <Text style={[styles.cardTitle, { opacity: 0.5 }]}>Análise de Maturação Forçada</Text>
    <Text style={[styles.cardText, { opacity: 0.5 }]}>Registrar análises de maturação, anexar fotos e gerar relatório em PDF</Text>
  </View>
</TouchableOpacity>


        </Animated.View>

        <View style={styles.recoverySection}>
          <Text style={styles.recoverySectionTitle}>Ferramentas de Recuperação</Text>

          <TouchableOpacity style={styles.recoveryCard} onPress={() => handleBackupAllData(filteredPendingData)} activeOpacity={0.8}>
            <View style={[styles.recoveryIconWrap, { backgroundColor: '#FFF3E0' }]}>
              <MaterialIcons name="cloud-download" size={26} color="#E65100" />
            </View>
            <View style={styles.recoveryCardContent}>
              <Text style={styles.recoveryCardTitle}>Backup de Dados</Text>
              <Text style={styles.recoveryCardText}>Baixar backup dos dados pendentes</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="#BDBDBD" />
          </TouchableOpacity>

          <View style={styles.recoverySeparator} />

          <TouchableOpacity style={styles.recoveryCard} onPress={handleRestoreData} activeOpacity={0.8}>
            <View style={[styles.recoveryIconWrap, { backgroundColor: '#E8F5E9' }]}>
              <MaterialIcons name="restore" size={26} color="#2E7D32" />
            </View>
            <View style={styles.recoveryCardContent}>
              <Text style={styles.recoveryCardTitle}>Restaurar Dados</Text>
              <Text style={styles.recoveryCardText}>Importar arquivo de backup SQL/JSON</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="#BDBDBD" />
          </TouchableOpacity>
        </View>

      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        <Text style={styles.footerText}>Última atualização: {new Date().toLocaleString('pt-BR')}</Text>
        <Text style={[styles.footerStatus, styles.bottomTextFooter]}>
          {notificationCount > 0 ? `${notificationCount} dados pendentes` : 'Todos os dados sincronizados'}
        </Text>
      </View>

      {/* Modal de Configuração de IP */}
      <Modal
        visible={showIPConfigModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowIPConfigModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.ipConfigModalContainer]}>
            <TouchableOpacity
              onPress={() => setShowIPConfigModal(false)}
              style={styles.ipConfigCloseButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="close" size={24} color="#7F8C8D" />
            </TouchableOpacity>

            <View style={styles.ipConfigHeader}>
              <MaterialIcons name="settings" size={40} color="#5E8B5C" />
              <Text style={styles.ipConfigTitle}>Configuração de Servidor</Text>
              <Text style={styles.ipConfigSubtitle}>Selecione o servidor para conectar</Text>
            </View>

            <View style={styles.ipConfigContent}>
              <View style={styles.ipConfigTabs}>
                <TouchableOpacity
                  style={[
                    styles.ipConfigTabButton,
                    styles.ipConfigTabButtonLeft,
                    serverListMode === 'app' && styles.ipConfigTabButtonActive
                  ]}
                  onPress={() => setServerListMode('app')}
                  disabled={testingIP}
                >
                  <Text
                    style={[
                      styles.ipConfigTabText,
                      serverListMode === 'app' && styles.ipConfigTabTextActive
                    ]}
                  >
                    Servidores Padrão
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.ipConfigTabButton,
                    serverListMode === 'banco' && styles.ipConfigTabButtonActive
                  ]}
                  onPress={() => setServerListMode('banco')}
                  disabled={testingIP}
                >
                  <Text
                    style={[
                      styles.ipConfigTabText,
                      serverListMode === 'banco' && styles.ipConfigTabTextActive
                    ]}
                  >
                    Meus Servidores
                  </Text>
                </TouchableOpacity>
              </View>

              {optionsToRender.length === 0 && (
                <Text style={styles.ipConfigEmptyText}>
                  Nenhum servidor disponivel para mostrar.
                </Text>
              )}

              {optionsToRender.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.ipConfigOption,
                    selectedIP === option.url && styles.ipConfigOptionSelected
                  ]}
                  onPress={() => handleSelectIP(option.url)}
                  disabled={testingIP}
                >
                  <View style={styles.ipConfigOptionContent}>
                    <MaterialIcons
                      name={selectedIP === option.url ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={24}
                      color={selectedIP === option.url ? '#5E8B5C' : '#7F8C8D'}
                    />
                    <View style={styles.ipConfigOptionText}>
                      <Text style={styles.ipConfigOptionLabel}>{option.label}</Text>
                      <Text style={styles.ipConfigOptionURL}>{option.url}</Text>
                    </View>
                  </View>
                  {testingIP && selectedIP !== option.url && (
                    <ActivityIndicator size="small" color="#5E8B5C" />
                  )}
                </TouchableOpacity>
              ))}

              {serverListMode === 'app' && (
                <>
                  {/* Campo para digitar IP customizado */}
                  <View style={{ marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#E0E0E0' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 10 }}>
                      Ou digite um IP personalizado:
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TextInput
                        style={{
                          flex: 1,
                          height: 45,
                          borderWidth: 1,
                          borderColor: '#DDD',
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          fontSize: 14,
                          backgroundColor: '#FFF',
                          marginRight: 10,
                        }}
                        placeholder="Ex: 192.168.1.34:3000/api"
                        value={customIP}
                        onChangeText={setCustomIP}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!testingIP}
                      />
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#5E8B5C',
                          paddingHorizontal: 20,
                          paddingVertical: 12,
                          borderRadius: 8,
                          opacity: testingIP || !customIP.trim() ? 0.5 : 1,
                        }}
                        onPress={handleSaveCustomIP}
                        disabled={testingIP || !customIP.trim()}
                      >
                        <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 14 }}>Salvar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </View>

            {testingIP && (
              <View style={styles.ipConfigTestingContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <ActivityIndicator size="small" color="#5E8B5C" />
                  <Text style={[styles.ipConfigTestingText, { marginLeft: 10 }]}>Testando conexão...</Text>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#E74C3C',
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderRadius: 8,
                    alignSelf: 'center',
                  }}
                  onPress={handleCancelTest}
                >
                  <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 14 }}>Cancelar Teste</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showNotificationModal} transparent={true} animationType="none" onRequestClose={handleCloseModal}>
        <View style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Animated.View style={[styles.modalContainer, { opacity: modalAnim, transform: [{ scale: modalAnim }] }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconContainer}>
                <MaterialIcons name="cloud-upload" size={32} color="#E67E22" />
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={handleCloseModal}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalTitle}>Sincronização de Dados</Text>
            <Text style={styles.modalSubtitle}>
              {notificationCount} dado(s) offline encontrado(s)
              {getUserMatricula() && (
                <Text style={styles.modalSubtext}> Toque para sincronizar.</Text>
              )}
            </Text>
            {syncInProgress && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${syncProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>{syncProgress}%</Text>
              </View>
            )}
            <FlatList
              style={styles.pendingDataContainer}
              data={modalListReady ? filteredPendingData : []}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={true}
              ListEmptyComponent={
                modalListReady ? (
                  <Text style={{ textAlign: 'center', color: '#999', marginTop: 20 }}>Nenhum dado pendente</Text>
                ) : (
                  <ActivityIndicator style={{ marginTop: 20 }} color="#E67E22" />
                )
              }
              renderItem={({ item }) => (
                <View style={styles.pendingDataItem}>
                  <View style={styles.pendingDataHeader}>
                    <Text style={{ fontSize: 20, marginRight: 8 }}>{item.emoji}</Text>
                    <Text style={styles.pendingDataType}>{item.tipo}</Text>
                  </View>
                  <Text style={styles.pendingDataDate}>{formatDate(item.dataColeta)}</Text>
                  {item.talhao && (
                    <Text style={styles.pendingDataDetail}>Talhão: {item.talhao}</Text>
                  )}
                  {item.ponto && (
                    <Text style={styles.pendingDataDetail}>Ponto: {item.ponto}</Text>
                  )}
                  {item.ramal && (
                    <Text style={styles.pendingDataDetail}>Ramal: {item.ramal}</Text>
                  )}
                  {item.linha && (
                    <Text style={styles.pendingDataDetail}>Linha: {item.linha}</Text>
                  )}
                  {item.usuario && (
                    <Text style={styles.pendingDataDetail}>Usuário: {item.usuario}</Text>
                  )}
                  <Text style={styles.pendingDataOrigin}>Origem: {item.origem}</Text>
                  {item.syncStatus === 'error' && (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>Erro: {item._syncError || 'Desconhecido'}</Text>
                      <TouchableOpacity
                        style={styles.retryButton}
                        onPress={() => syncSingleItem(item)}
                        disabled={syncInProgress}
                      >
                        <Text style={styles.retryButtonText}>Tentar novamente</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            />
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCancelSync}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, syncInProgress && styles.disabledButton]}
                onPress={syncOfflineData}
                disabled={syncInProgress}
              >
                {syncInProgress ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="cloud-upload" size={20} color="#FFF" />
                    <Text style={styles.confirmButtonText}>Sincronizar Todos</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#F1F3F5',
  },
  wifiContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  bottomTextFooter: {
    paddingBottom: 10,
  },
  wifiText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingLogo: {
    width: 150,
    height: 50,
    marginBottom: 30,
  },
  loadingSpinner: {
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 18,
    color: '#5E8B5C',
    fontWeight: '500',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  topLogo: {
    width: 110,
    height: 32,
  },
  topLogoCQ: {
    width: 48,
    height: 22,
  },
  iconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    padding: 10,
    borderRadius: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#E74C3C',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
  container: {
    paddingVertical: 20,
    paddingHorizontal: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    gap: 14,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2C3E50',
    flex: 1,
  },
  cargoText: {
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 8,
  },
  matriculaText: {
    fontSize: 14,
    color: '#5E8B5C',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 8,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  subtitle: {
    fontSize: 18,
    color: '#5E8B5C',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 15,
  },
  fazendaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 10,
  },
  fazendaText: {
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: '600',
    marginLeft: 6,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    padding: 18,
    borderRadius: 15,
    marginBottom: 25,
    borderLeftWidth: 5,
    borderLeftColor: '#E67E22',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  alertContent: {
    flex: 1,
    marginLeft: 12,
  },
  alertText: {
    color: '#856404',
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 2,
  },
  alertSubtext: {
    color: '#856404',
    fontSize: 13,
    opacity: 0.8,
  },
  alertButton: {
    backgroundColor: '#E67E22',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  alertButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F39C12',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  updateBannerTitle: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  updateBannerText: {
    color: '#FFF',
    fontSize: 12,
    marginTop: 2,
    opacity: 0.92,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B8B8B8',
    letterSpacing: 1.2,
    marginBottom: 14,
    marginTop: 4,
  },
  menuContainer: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginBottom: 25,
  },
  card: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginBottom: 18,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  cardImage: {
    width: '100%',
    height: 110,
  },
  cardContent: {
    padding: 12,
  },
  cardTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  cardTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  cardTagGreen: {
    backgroundColor: '#E8F5E9',
  },
  cardTagText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  primaryCard: {
    borderWidth: 0,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
    marginBottom: 6,
  },
  cardText: {
    fontSize: 13,
    color: '#7F8C8D',
    textAlign: 'center',
    lineHeight: 18,
  },
  userInfo: {
    backgroundColor: '#FFFFFF',
    padding: 25,
    borderRadius: 18,
    marginBottom: 25,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  userInfoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 20,
    textAlign: 'center',
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
  },
  userInfoContent: {
    marginLeft: 15,
    flex: 1,
  },
  userInfoLabel: {
    fontSize: 13,
    color: '#7F8C8D',
    fontWeight: '500',
    marginBottom: 2,
  },
  userInfoValue: {
    fontSize: 15,
    color: '#2C3E50',
    fontWeight: '600',
  },
  versionRow: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E8ECE8',
    alignItems: 'center',
  },
  versionLabel: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
  footer: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    alignItems: 'center',
  },
  footerText: {
    textAlign: 'center',
    color: '#7F8C8D',
    fontSize: 12,
    marginBottom: 6,
  },
  footerStatus: {
    textAlign: 'center',
    color: '#5E8B5C',
    fontSize: 12,
    fontWeight: '500',
  },
  profileHeroCard: {
    backgroundColor: '#FCFDFE',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DFE6EE',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  profileHeroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    gap: 12,
  },
  profileHeroTextCol: {
    flex: 1,
    paddingTop: 2,
  },
  profileHeroIconWrap: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    position: 'relative',
  },
  profileHeroAvatarLayer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeroMangaImage: {
    width: 46,
    height: 46,
  },
  profileHeroName: {
    fontSize: 18,
    color: '#1B5E20',
    fontWeight: '800',
    textAlign: 'left',
    marginBottom: 3,
  },
  profileHeroRole: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'left',
    marginBottom: 4,
  },
  profileHeroWelcome: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
    textAlign: 'left',
    marginBottom: 8,
    lineHeight: 19,
  },
  profileHeroDivider: {
    height: 1,
    backgroundColor: '#E8EDF3',
    marginBottom: 8,
  },
  profileHeroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  profileHeroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF7EE',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#D9EAD9',
  },
  profileHeroChipText: {
    color: '#1B5E20',
    fontSize: 11,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
  backgroundColor: '#FFFFFF',
  borderRadius: 20, // arredonda todos os cantos
  width: '90%',
  maxHeight: '80%',
  overflow: 'hidden', // garante que os filhos respeitem o arredondamento
},
  modalHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 20,
  borderBottomWidth: 1,
  borderBottomColor: '#F0F0F0',
  borderTopLeftRadius: 20, // arredonda topo esquerdo
  borderTopRightRadius: 20, // arredonda topo direito
  backgroundColor: '#FFFFFF',
},
  modalIconContainer: {
    flex: 1,
    alignItems: 'center',
  },
  modalCloseButton: {
    padding: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#7F8C8D',
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  modalSubtext: {
    fontSize: 12,
    color: '#5E8B5C',
    fontWeight: '600',
  },
  progressContainer: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#5E8B5C',
  },
  progressText: {
    textAlign: 'center',
    color: '#2C3E50',
    fontSize: 12,
    marginTop: 8,
  },
  pendingDataContainer: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  pendingDataItem: {
    backgroundColor: '#F8F9FA',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  pendingDataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pendingDataType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E50',
    marginLeft: 8,
  },
  pendingDataDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  pendingDataDetail: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  pendingDataOrigin: {
    fontSize: 12,
    color: '#7F8C8D',
    fontStyle: 'italic',
  },
  errorContainer: {
    marginTop: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E74C3C',
    borderRadius: 5,
  },
  errorText: {
    fontSize: 12,
    color: '#E74C3C',
    marginBottom: 4,
  },
  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#E74C3C',
    borderRadius: 5,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  moreItemsContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  moreItemsText: {
    fontSize: 12,
    color: '#666',
  },
  modalButtonContainer: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  paddingHorizontal: 20,
  paddingVertical: 15,
  borderTopWidth: 1,
  borderTopColor: '#F0F0F0',
  backgroundColor: '#FFFFFF',
  borderBottomLeftRadius: 20, // arredonda fundo esquerdo
  borderBottomRightRadius: 20, // arredonda fundo direito
},
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cancelButton: {
    backgroundColor: '#E0E0E0',
  },
  cancelButtonText: {
    color: '#2C3E50',
    fontWeight: '600',
    fontSize: 16,
  },
  confirmButton: {
    backgroundColor: '#5E8B5C',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
  disabledButton: {
    backgroundColor: '#B0C4B5',
  },
  recoverySectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A2E22',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  recoverySection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  recoveryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  recoveryIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  recoveryCardContent: {
    flex: 1,
  },
  recoveryCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A2E22',
    marginBottom: 2,
  },
  recoveryCardText: {
    fontSize: 12,
    color: '#7B8C81',
    lineHeight: 16,
  },
  recoverySeparator: {
    height: 1,
    backgroundColor: '#F0F4F1',
    marginHorizontal: 16,
  },
  backupModuleCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  backupModuleIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  backupModuleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F3527',
    textAlign: 'center',
    marginBottom: 3,
  },
  backupModuleText: {
    fontSize: 11,
    color: '#6B7C72',
    textAlign: 'center',
    lineHeight: 15,
  },
  backupSection: {
  backgroundColor: '#FFFFFF',
  padding: 25,
  borderRadius: 18,
  marginBottom: 25,
  elevation: 3,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 6,
},
// Adicione apenas estes estilos no StyleSheet.create:

restoreButton: {
  borderColor: '#4CAF50',
  backgroundColor: '#E8F5E9',
},

restoreButtonIcon: {
  backgroundColor: '#C8E6C9',
},

backupSectionTitle: {
  fontSize: 20,
  fontWeight: 'bold',
  color: '#2C3E50',
  marginBottom: 20,
  textAlign: 'center',
},

backupButton: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#FFF8E1',
  padding: 16,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: '#E67E22',
  marginBottom: 12,
},

backupButtonIcon: {
  width: 48,
  height: 48,
  backgroundColor: '#FFF3E0',
  borderRadius: 24,
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 16,
},

backupButtonContent: {
  flex: 1,
},

backupButtonTitle: {
  fontSize: 16,
  fontWeight: 'bold',
  color: '#2C3E50',
  marginBottom: 4,
},

backupButtonSubtitle: {
  fontSize: 13,
  color: '#7F8C8D',
  lineHeight: 18,
},

backupWarning: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#FFF3CD',
  padding: 12,
  borderRadius: 8,
  borderLeftWidth: 4,
  borderLeftColor: '#E67E22',
},

backupWarningText: {
  fontSize: 13,
  color: '#856404',
  fontWeight: '500',
  marginLeft: 8,
},

// Estilos do Modal de Configuração de IP
ipConfigModalContainer: {
  backgroundColor: '#fff',
  borderRadius: 20,
  padding: 30,
  width: '90%',
  maxWidth: 400,
  elevation: 10,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.3,
  shadowRadius: 10,
},

ipConfigCloseButton: {
  position: 'absolute',
  top: 15,
  right: 15,
  zIndex: 1,
  padding: 5,
},

ipConfigHeader: {
  alignItems: 'center',
  marginBottom: 25,
},

ipConfigTitle: {
  fontSize: 22,
  fontWeight: 'bold',
  color: '#2C3E50',
  marginTop: 15,
  marginBottom: 8,
  textAlign: 'center',
},

ipConfigSubtitle: {
  fontSize: 14,
  color: '#7F8C8D',
  textAlign: 'center',
},

ipConfigContent: {
  width: '100%',
},

ipConfigTabs: {
  flexDirection: 'row',
  marginBottom: 16,
},

ipConfigTabButton: {
  flex: 1,
  paddingVertical: 10,
  borderRadius: 10,
  backgroundColor: '#F1F2F3',
  borderWidth: 1,
  borderColor: '#E0E0E0',
  alignItems: 'center',
  justifyContent: 'center',
},

ipConfigTabButtonLeft: {
  marginRight: 10,
},

ipConfigTabButtonActive: {
  backgroundColor: '#E8F5E8',
  borderColor: '#5E8B5C',
},

ipConfigTabText: {
  fontSize: 13,
  fontWeight: '600',
  color: '#5F6B6D',
},

ipConfigTabTextActive: {
  color: '#2C3E50',
},

ipConfigEmptyText: {
  fontSize: 13,
  color: '#7F8C8D',
  textAlign: 'center',
  marginBottom: 12,
},

ipConfigOption: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 16,
  backgroundColor: '#F8F9FA',
  borderRadius: 12,
  marginBottom: 12,
  borderWidth: 2,
  borderColor: '#E8E8E8',
},

ipConfigOptionSelected: {
  backgroundColor: '#E8F5E8',
  borderColor: '#5E8B5C',
},

ipConfigOptionContent: {
  flexDirection: 'row',
  alignItems: 'center',
  flex: 1,
},

ipConfigOptionText: {
  marginLeft: 12,
  flex: 1,
},

ipConfigOptionLabel: {
  fontSize: 16,
  fontWeight: 'bold',
  color: '#2C3E50',
  marginBottom: 4,
},

ipConfigOptionURL: {
  fontSize: 12,
  color: '#7F8C8D',
  fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
},

ipConfigTestingContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 15,
  padding: 12,
  backgroundColor: '#E3F2FD',
  borderRadius: 8,
},

ipConfigTestingText: {
  fontSize: 14,
  color: '#1976D2',
  marginLeft: 10,
  fontWeight: '500',
},
});

export default Home;
