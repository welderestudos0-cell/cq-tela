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
  Easing,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext.js';
import api from "../../services/api.js";
import ProfileIconAnimation from './ProfileIconAnimation.js';

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

  const { signOut, user } = useAuth();
  const insets = useSafeAreaInsets();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const modalAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  
const detectarTipoDados = (item, key) => {
  // Detectar dados de limpeza
  if (item.tipo_limpeza ||
      key === 'limpezas_offline' ||
      key.includes('limpeza')) {
    return {
      tipo: 'Limpeza de Arraste',
      emoji: '🌀',
      icone: 'cleaning-services'
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
      
      // Incluir chaves genéricas de dados (ADICIONADA limpezas_offline)
      const isGenericKey = 
        key === 'monitoramentos_offline' ||  // Principal para dados offline
        key === 'dadosVazaoLinhas' ||        // Dados de vazão (se ainda existirem)
        key === 'limpezas_offline' ||        // NOVO: Dados de limpeza offline
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
  id: item.id || `${key}_${index}_${Date.now()}`,
  origem: key === 'monitoramentos_offline' ? 'monitoramento_offline' : 
         key === 'dadosVazaoLinhas' ? 'vazao_linhas' :
         key === 'limpezas_offline' ? 'limpeza_offline' :
         key.replace(`user_${userData.matricula}_`, ''),
  tipo: tipoDetectado.tipo,
  emoji: tipoDetectado.emoji,
  icone: tipoDetectado.icone,
  
  // Dados principais com fallbacks seguros
  fazenda: item.fazenda || 'Não informada',
  talhao: item.talhao || 'Não informado', 
  usuario: item.usuario || 'Não informado',
  dataColeta: dataColeta, // ✅ ADICIONADO
  
  // Campos específicos
  ramal: item.ramal,
  linha: item.linha,
  mediaVazao: item.mediaVazao,
  pressaoFinal: item.pressaoFinal,
  ponto: item.ponto,
  zero_a_trinta_cm: item.zero_a_trinta_cm,
  trinta_a_sessenta_cm: item.trinta_a_sessenta_cm,
  umidade_0_30: item.umidade_0_30,
  umidade_30_60: item.umidade_30_60,
  tipo_limpeza: item.tipo_limpeza,
  
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
        limpeza: filteredData.filter(d => d.tipo === 'Limpeza de Arraste').length, // NOVO
        outros: filteredData.filter(d => d.tipo === 'Dados Gerais').length
      }
    });
    
    setPendingData(consolidatedData);
    setFilteredPendingData(filteredData);
    setNotificationCount(filteredData.length);
    
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
      
      // Importar dinamicamente
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

    console.log('Dados encontrados:', { vazaoCount, monitoramentoCount, limpezaCount });

    // Confirmar restauração
    Alert.alert(
      'Confirmar Restauração',
      `Encontrados ${backupData.length} registros:\n\n` +
      `• ${vazaoCount} Testes de Vazão\n` +
      `• ${monitoramentoCount} Monitoramentos de Solo\n` +
      `• ${limpezaCount} Limpezas de Arraste\n\n` +
      'Os dados irão para o sininho. Continuar?',
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






const syncSingleItem = async (item) => {

  
  try {
    if (!item || !item.id || !item.asyncStorageKey) {
      throw new Error('Item inválido ou faltando propriedades obrigatórias.');
    }

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

    // Verificar conexão antes de tentar sincronizar
    const isServerOnline = await checkInternetConnection();
    if (!isServerOnline) {
      console.log('❌ Servidor offline, tentando encontrar alternativo...');
      
      const findResult = await api.findWorkingURL();
      if (!findResult.success) {
        throw new Error('Nenhum servidor disponível. Verifique sua conexão Wi-Fi.');
      }
      
      console.log(`✅ Servidor alternativo encontrado: ${findResult.workingUrl}`);
    }

    // Preparar dados conforme o tipo
    let serverData;
    let endpoint;
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
      serverData = {
        id: item.id,
        fazenda: item.fazenda || userData?.fazenda || '',
        talhao: item.talhao || '',
        usuario: item.usuario || userData?.nome || '',
        timestamp: item.timestamp || item.momento || item.dataColeta || new Date().toISOString(),
        ramal: parseInt(item.ramal) || 1,
        linha: parseInt(item.linha) || 1,
        tempo: item.tempo,
        vazao1: item.vazao1,
        vazao2: item.vazao2,
        vazao3: item.vazao3,
        mediaVazao: item.mediaVazao || item.media_vazao,
        pressaoFinal: item.pressaoFinal || item.pressao_final,
        paf: item.paf || item.originalData?.paf,
        pdf: item.pdf || item.originalData?.pdf,
        pav: item.pav || item.originalData?.pav,
        pdv: item.pdv || item.originalData?.pdv,
        gps: item.gps || item.coordenadas || item.originalData?.gps,
        matricula: item.matricula || userData?.matricula || 'Não Informada',
        tipo_monitoramento: 'Teste de Vazão',
      };

    // DADOS DE MONITORAMENTO DE SOLO
    } else if (item.tipo === 'Monitoramento de Solo' || item.asyncStorageKey === 'monitoramentos_offline') {
      
      endpoint = '/monitoramento';
      serverData = {
        fazenda: item.fazenda || item.originalData?.fazenda || '',
        talhao: item.talhao || item.originalData?.talhao || '',
        ponto: item.ponto || item.originalData?.ponto || '',
        usuario: item.usuario || item.originalData?.usuario || '',
        momento: formatDateForOracle(item.dataColeta || item.momento || new Date().toISOString()),
        gps: item.coordenadas || item.gps || item.originalData?.gps || null,
        zero_a_trinta_cm: item.umidade_0_30 || item.zero_a_trinta_cm || item.originalData?.zero_a_trinta_cm || null,
        trinta_a_sessenta_cm: item.umidade_30_60 || item.trinta_a_sessenta_cm || item.originalData?.trinta_a_sessenta_cm || null,
        possui_minhoca: item.possui_minhoca || item.originalData?.possui_minhoca || false,
        possui_enraizamento: item.possui_enraizamento || item.originalData?.possui_enraizamento || false,
        matricula: item.matricula || item.originalData?.matricula || userData?.matricula || 'Não Informada',
      };

    } else {
      throw new Error(`Tipo de dados não suportado: ${item.tipo}`);
    }

    console.log('📦 Enviando dados para:', endpoint);
    console.log('📄 Dados do servidor:', JSON.stringify(serverData, null, 2));

    // *** TENTATIVA 1: SERVIDOR LOCAL (Oracle/SQLite) ***
    try {
      console.log('📤 Tentando SQLite/Oracle primeiro...');
      const oracleResponse = await api.post(endpoint, serverData);
      if (oracleResponse.success) {
        console.log('✅ Sucesso SQLite/Oracle:', oracleResponse);
        oracleSuccess = true;
      } else {
        console.warn('⚠️ Falha SQLite/Oracle:', oracleResponse.error);
      }
    } catch (error) {
      console.warn('⚠️ Erro SQLite/Oracle:', error.message);
    }

    // *** TENTATIVA 2: SERVIDOR NUVEM (FastAPI) ***
    try {
      console.log('📤 Tentando FastAPI/Nuvem...');
      
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
        fastApiData = serverData;
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
      }
      
      const fastApiResult = await syncWithFastApi(fastApiData, usuario, senha, modulo);
      
      if (fastApiResult.success) {
        console.log('✅ Sucesso FastAPI/Nuvem:', fastApiResult);
        fastApiSuccess = true;
      } else {
        console.warn('⚠️ Falha FastAPI/Nuvem:', fastApiResult.error);
      }
    } catch (error) {
      console.warn('⚠️ Erro FastAPI/Nuvem:', error.message);
    }

    // *** AVALIAR RESULTADO FINAL ***
    if (oracleSuccess || fastApiSuccess) {
      let message;
      if (oracleSuccess && fastApiSuccess) {
        message = 'Dados salvos em ambos os sistemas (Local + Nuvem)';
        console.log('🎉 SUCESSO TOTAL: Dados salvos LOCAL + NUVEM');
      } else if (oracleSuccess) {
        message = 'Dados salvos localmente (falha na sincronização com a nuvem)';
        console.log('✅ SUCESSO PARCIAL: Salvo apenas LOCALMENTE');
      } else {
        message = 'Dados salvos na nuvem (falha no sistema local)';
        console.log('✅ SUCESSO PARCIAL: Salvo apenas na NUVEM');
      }

      // Marcar como sincronizado
      const itemId = item.originalData?.id || item.originalData?._id || item.id;
      if (itemId) {
        await updateSyncStatus(item.asyncStorageKey, itemId, 'synced', 'server_success');
      }

      // Remover da lista pendente (sininho)
      setFilteredPendingData(prev => prev.filter(p => p.id !== item.id));
      setNotificationCount(prev => Math.max(0, prev - 1));

      console.log('✅ Item marcado como sincronizado e removido do sininho');
      return { success: true, message };

    } else {
      throw new Error('Falha em ambos os servidores (Local e Nuvem)');
    }

  } catch (error) {
    console.error(`❌ Erro na sincronização ${item?.id}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    // Tratamento específico de erros
    let userMessage = 'Erro na sincronização';
    
    if (error.response?.status === 401) {
      userMessage = 'Token de acesso inválido. Faça login novamente.';
    } else if (error.response?.status === 400) {
      userMessage = 'Dados inválidos enviados ao servidor.';
    } else if (error.response?.status === 500) {
      userMessage = 'Erro interno do servidor.';
    } else if (error.code === 'ECONNREFUSED') {
      userMessage = 'Servidor indisponível.';
    } else if (error.code === 'ECONNABORTED') {
      userMessage = 'Tempo limite excedido.';
    } else if (error.message.includes('Network Error')) {
      userMessage = 'Erro de rede. Verifique sua conexão.';
    } else {
      userMessage = error.response?.data?.message || error.message;
    }

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

  try {
    // Verificar servidor antes de começar
    const serverStatus = await api.checkServerStatus();
    if (!serverStatus.success) {
      Alert.alert(
        'Servidor Indisponível', 
        'Não foi possível conectar a nenhum servidor. Verifique sua conexão Wi-Fi.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsOnline(true);

    const dataToSync = filteredPendingData;
    if (dataToSync.length === 0) {
      Alert.alert('Info', 'Nenhum dado pendente para sincronizar.');
      return;
    }

    let syncedCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < dataToSync.length; i++) {
      const item = dataToSync[i];
      console.log(`🔄 Sincronizando item ${i + 1}/${dataToSync.length}: ${item.tipo}`);
      
      const result = await syncSingleItem(item);
      
      if (result.success) {
        syncedCount++;
        console.log(`✅ Item ${i + 1} sincronizado`);
      } else {
        errorCount++;
        errors.push({
          tipo: item.tipo || 'Desconhecido',
          talhao: item.talhao || 'N/A',
          error: result.error || 'Erro desconhecido',
        });
        console.log(`❌ Item ${i + 1} falhou: ${result.error}`);
      }
      
      // Atualizar progresso
      setSyncProgress(Math.round(((i + 1) / dataToSync.length) * 100));
      
      // Pequena pausa para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 100));
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
        `${syncedCount} enviados com sucesso, ${errorCount} com erro.`,
        [
          { 
            text: 'Ver Erros', 
            onPress: () => {
              console.log('📋 ERROS DETALHADOS:', errors);
              Alert.alert(
                'Detalhes dos Erros',
                errors.map(e => `• ${e.tipo} (${e.talhao}): ${e.error}`).join('\n')
              );
            }
          },
          { text: 'OK' }
        ]
      );
    } else {
      Alert.alert(
        'Falha na Sincronização', 
        `Nenhum dado foi sincronizado. ${errorCount} erros encontrados.`
      );
    }

  } catch (error) {
    console.error('❌ Erro geral na sincronização:', error);
    Alert.alert(
      'Erro na Sincronização', 
      `Erro inesperado: ${error.message}`
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
        data = data.map(item => {
          if ((item.id && item.id === itemIdToUpdate) || (item._id && item._id === itemIdToUpdate)) {
            updated = true;
            return {
              ...item,
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
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    if (userData) fetchOfflineData();
  }, [userData]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (userData) fetchOfflineData();
    });
    return unsubscribe;
  }, [navigation, userData]);

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
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.cubic }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
  }, [loading]);

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
    setShowNotificationModal(true);
    Animated.spring(modalAnim, { toValue: 1, friction: 6, useNativeDriver: true }).start();
  };

  const handleCloseModal = () => {
    Animated.timing(modalAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setShowNotificationModal(false);
    });
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
    if (!userData) return 'Usuário';
    const possibleNames = [
      userData.name, userData.NAME, userData.FULL_NAME, userData.full_name,
      userData.nome, userData.NOME, userData.firstName, userData.first_name,
    ];
    for (let name of possibleNames) {
      if (name && typeof name === 'string' && name.trim()) return name.trim();
    }
    return 'Usuário';
  };

 
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
        <Image source={require('../../assets/logohorizontal.png')} style={styles.topLogo} resizeMode="contain" />
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
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.userAvatarContainer}>
            <ProfileIconAnimation />
          </View>
          <Text style={styles.welcomeText}>Olá, {getUserName()}!</Text>
          <Text style={styles.cargoText}>{getUserCargo()}</Text>
          {getUserMatricula() && (
            <Text style={styles.matriculaText}>Matrícula: {getUserMatricula()}</Text>
          )}
          <Text style={styles.subtitle}>Seja bem-vindo ao Agrodan Irriga</Text>
          {userData?.fazenda && (
            <View style={styles.fazendaContainer}>
              <MaterialIcons name="location-on" size={18} color="#5E8B5C" />
              <Text style={styles.fazendaText}>{userData.fazenda}</Text>
            </View>
          )}
        </Animated.View>

        {notificationCount > 0 && (
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

        <Animated.View style={[styles.menuContainer, { opacity: fadeAnim }]}>
     
<TouchableOpacity 
  style={[styles.card, styles.primaryCard]} 
  onPress={() => navigation.navigate('LoadingScreen', {
    destination: 'Solo',
    targetScreen: 'MonitoramentoSolo'
  })}
  activeOpacity={0.8}  // Reduz o efeito cinza
  delayPressIn={0}     // Remove delay do press
  delayPressOut={0}    // Remove delay do release
>
  <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
    <MaterialIcons name="eco" size={28} color="#2E7D32" />
  </View>
  <Text style={styles.cardTitle}>Monitoramento do Solo</Text>
  <Text style={styles.cardText}>Acompanhe em tempo real</Text>
</TouchableOpacity>

<TouchableOpacity 
  style={styles.card} 
  onPress={() => navigation.navigate('LoadingScreen', {
    destination: 'Pressao',
    targetScreen: 'TesteVazaoInicial'
  })}
  activeOpacity={0.8}
  delayPressIn={0}
  delayPressOut={0}
>
  <View style={[styles.iconContainer, { backgroundColor: '#E3F2FD' }]}>
    <MaterialIcons name="water-drop" size={28} color="#1976D2" />
  </View>
  <Text style={styles.cardTitle}>Teste de Vazão e Pressão</Text>
  <Text style={styles.cardText}>Verifique sistema de irrigação</Text>
</TouchableOpacity>

<TouchableOpacity 
  style={styles.card} 
  onPress={() => navigation.navigate('LoadingScreen', {
    destination: 'limpeza',
    targetScreen: 'limpeza'
  })}
  activeOpacity={0.8}
  delayPressIn={0}
  delayPressOut={0}
>
  <View style={[styles.iconContainer, { backgroundColor: '#ffeadcff' }]}>
    <MaterialIcons name="plumbing" size={28} color="#ff7411ff" />
  </View>
  <Text style={styles.cardTitle}>Limpeza Arraste/Química</Text>
  <Text style={styles.cardText}>Mantenha tubulações limpas</Text>
</TouchableOpacity>

<TouchableOpacity 
  style={styles.card} 
  onPress={() => navigation.navigate('LoadingScreen', {
    destination: 'Bomba',
    targetScreen: 'Bomba'
  })}
  activeOpacity={0.8}
  delayPressIn={0}
  delayPressOut={0}
>
  <View style={[styles.iconContainer, { backgroundColor: '#fbfecaff' }]}>
    <MaterialIcons name="build" size={28} color="#bcb307ff" />
  </View>
  <Text style={styles.cardTitle}>Manutenção da Bomba</Text>
  <Text style={styles.cardText}>Verifique e registre serviços</Text>
</TouchableOpacity>

<TouchableOpacity 
  style={styles.card} 
  onPress={() => navigation.navigate('Dados')}
  activeOpacity={0.8}
  delayPressIn={0}
  delayPressOut={0}
>
  <View style={[styles.iconContainer, { backgroundColor: '#E3F2FD' }]}>
    <MaterialIcons name="history" size={28} color="#1976D2" />
  </View>
  <Text style={styles.cardTitle}>Histórico</Text>
  <Text style={styles.cardText}>Acompanhe seus dados</Text>
</TouchableOpacity>

<TouchableOpacity 
  style={styles.card} 
  onPress={() => navigation.navigate('Limpa')}
  activeOpacity={0.8}
  delayPressIn={0}
  delayPressOut={0}
>
  <View style={[styles.iconContainer, { backgroundColor: '#FFEBEE' }]}>
    <MaterialIcons name="auto-delete" size={28} color="#E53935" />
  </View>
  <Text style={styles.cardTitle}>Limpar Dados</Text>
  <Text style={styles.cardText}>Gerenciamento de Dados</Text>
</TouchableOpacity>

<TouchableOpacity 
  style={styles.card} 
  onPress={() => navigation.navigate('Ajuda')}
  activeOpacity={0.8}
  delayPressIn={0}
  delayPressOut={0}
>
  <View style={[styles.iconContainer, { backgroundColor: '#F3E5F5' }]}>
    <MaterialIcons name="help-outline" size={28} color="#8E24AA" />
  </View>
  <Text style={styles.cardTitle}>Ajuda</Text>
  <Text style={styles.cardText}>Tutoriais e suporte</Text>
</TouchableOpacity>
  

        </Animated.View>

        {userData && (
          <Animated.View style={[styles.userInfo, { opacity: fadeAnim }]}>
            <Text style={styles.userInfoTitle}>Informações da Conta</Text>
            <View style={styles.userInfoRow}>
              <MaterialIcons name="person" size={20} color="#666" />
              <View style={styles.userInfoContent}>
                <Text style={styles.userInfoLabel}>Nome</Text>
                <Text style={styles.userInfoValue}>{getUserName()}</Text>
              </View>
            </View>
            <View style={styles.userInfoRow}>
              <MaterialIcons name="work" size={20} color="#666" />
              <View style={styles.userInfoContent}>
                <Text style={styles.userInfoLabel}>Cargo</Text>
                <Text style={styles.userInfoValue}>{getUserCargo()}</Text>
              </View>
            </View>
            {getUserMatricula() && (
              <View style={styles.userInfoRow}>
                <MaterialIcons name="badge" size={20} color="#666" />
                <View style={styles.userInfoContent}>
                  <Text style={styles.userInfoLabel}>Matrícula</Text>
                  <Text style={styles.userInfoValue}>{getUserMatricula()}</Text>
                </View>
              </View>
            )}
            {userData.email && (
              <View style={styles.userInfoRow}>
                <MaterialIcons name="email" size={20} color="#666" />
                <View style={styles.userInfoContent}>
                  <Text style={styles.userInfoLabel}>Usuário</Text>
                  <Text style={styles.userInfoValue}>{userData.email}</Text>
                </View>
              </View>
            )}
            {userData.fazenda && (
              <View style={styles.userInfoRow}>
                <MaterialIcons name="agriculture" size={20} color="#666" />
                <View style={styles.userInfoContent}>
                  <Text style={styles.userInfoLabel}>Fazenda</Text>
                  <Text style={styles.userInfoValue}>{userData.fazenda}</Text>
                </View>
              </View>
            )}
          </Animated.View>
        )}

        // Substitua a seção backupSection existente por esta versão:

<Animated.View style={[styles.backupSection, { opacity: fadeAnim }]}>
  <Text style={styles.backupSectionTitle}>Ferramentas de Recuperação</Text>
  
  <TouchableOpacity 
    style={styles.backupButton} 
    onPress={() => handleBackupAllData(filteredPendingData)}
    activeOpacity={0.7}
  >
    <View style={styles.backupButtonIcon}>
      <MaterialIcons name="cloud-download" size={24} color="#ff9345ff" />
    </View>
    <View style={styles.backupButtonContent}>
      <Text style={styles.backupButtonTitle}>Backup de Dados</Text>
      <Text style={styles.backupButtonSubtitle}>
        Baixar backup dos dados pendentes
      </Text>
    </View>
    <MaterialIcons name="arrow-forward-ios" size={16} color="#ff9345ff" />
  </TouchableOpacity>

  <TouchableOpacity 
    style={[styles.backupButton, styles.restoreButton]} 
    onPress={handleRestoreData}
    activeOpacity={0.7}
  >
    <View style={[styles.backupButtonIcon, styles.restoreButtonIcon]}>
      <MaterialIcons name="restore" size={24} color="#4CAF50" />
    </View>
    <View style={styles.backupButtonContent}>
      <Text style={styles.backupButtonTitle}>Restaurar Dados</Text>
      <Text style={styles.backupButtonSubtitle}>
        Importar arquivo de backup SQL/JSON
      </Text>
    </View>
    <MaterialIcons name="arrow-forward-ios" size={16} color="#4CAF50" />
  </TouchableOpacity>

  {notificationCount > 0 && (
    <View style={styles.backupWarning}>
      <MaterialIcons name="info" size={16} color="#ff9345ff" />
      <Text style={styles.backupWarningText}>
        {notificationCount} registro(s) pendente(s) disponível para backup
      </Text>
    </View>
  )}
</Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        <Text style={styles.footerText}>Última atualização: {new Date().toLocaleString('pt-BR')}</Text>
        <Text style={[styles.footerStatus, styles.bottomTextFooter]}>
          {notificationCount > 0 ? `${notificationCount} dados pendentes` : 'Todos os dados sincronizados'}
        </Text>
      </View>

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
            <ScrollView style={styles.pendingDataContainer} showsVerticalScrollIndicator={false}>
              {filteredPendingData.length === 0 ? (
                <Text style={styles.noPendingDataText}>Nenhum dado pendente</Text>
              ) : (
                filteredPendingData.map((item, index) => (
                  <View key={item.id} style={styles.pendingDataItem}>
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
                ))
              )}
              {filteredPendingData.length > 10 && (
                <View style={styles.moreItemsContainer}>
                  <Text style={styles.moreItemsText}>
                    ... e mais {filteredPendingData.length - 10} registros
                  </Text>
                </View>
              )}
            </ScrollView>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCloseModal}
                disabled={syncInProgress}
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
    backgroundColor: '#F8F9FA',
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
    paddingHorizontal: 20,
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
    width: 150,
    height: 45,
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
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 25,
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  userAvatarContainer: {
    marginBottom: 15,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
    marginBottom: 8,
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
  menuContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    padding: 22,
    borderRadius: 18,
    marginBottom: 16,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  primaryCard: {
    borderWidth: 2,
    borderColor: '#E8F5E9',
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
});

export default Home;