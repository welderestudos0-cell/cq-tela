

// projeto\src\screens\login\login.jsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import { login } from '../../services/auth';


import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../context/AuthContext.js';

import { useAPI } from '../../hooks/useAPI';

const { width } = Dimensions.get('window');

export default function Login({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
  // Estados para configuração da URL
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [clickCount, setClickCount] = useState(0);


  // Usar o hook da API
  const { 
    isAPIReady, 
    apiError, 
    updateURL, 
    testConnection, 
    testMultipleUrls, 
    getCurrentURL 
  } = useAPI();


  const { signIn } = useAuth();

  // Carregar URL atual quando a API estiver pronta
  useEffect(() => {
    if (isAPIReady) {
      loadCurrentUrl();
    }
  }, [isAPIReady]);

  const loadCurrentUrl = useCallback(async () => {
    try {
      const savedUrl = await AsyncStorage.getItem('ngrok_url');
      const apiUrl = getCurrentURL();
      
      if (savedUrl) {
        setCurrentUrl(savedUrl);
        setNewUrl(savedUrl);
      } else {
        setCurrentUrl(apiUrl);
        setNewUrl(apiUrl);
      }
      
      console.log('📱 URL carregada:', savedUrl || apiUrl);
    } catch (error) {
      console.error('Erro ao carregar URL:', error);
      const fallbackUrl = getCurrentURL();
      setCurrentUrl(fallbackUrl);
      setNewUrl(fallbackUrl);
    }
  }, [getCurrentURL]);

  const openUrlModal = useCallback(() => {
    setNewUrl(currentUrl);
    setShowUrlModal(true);
  }, [currentUrl]);

  const saveNewUrl = useCallback(async () => {
    if (!newUrl.trim()) {
      Alert.alert('Erro', 'Por favor, digite uma URL válida.');
      return;
    }

    try {
      // Formatar a URL
      let formattedUrl = newUrl.trim();
      if (!formattedUrl.startsWith('http')) {
        formattedUrl = 'http://' + formattedUrl;
      }
      if (!formattedUrl.endsWith('/api')) {
        formattedUrl = formattedUrl + '/api';
      }

      console.log('🔧 Testando nova URL:', formattedUrl);
      
      // Testar antes de salvar
      const testResult = await testConnection(formattedUrl);
      
      if (!testResult.success) {
        Alert.alert(
          'Erro na URL', 
          `Não foi possível conectar:\n\n${testResult.error}\n\nTente uma URL diferente.`
        );
        return;
      }

      // Salvar e atualizar
      const success = await updateURL(formattedUrl);
      if (success) {
        setCurrentUrl(formattedUrl);
        setShowUrlModal(false);
        
        Alert.alert(
          'Sucesso!', 
          `URL atualizada:\n\n${formattedUrl}\n\nServidor: ${testResult.data?.message || 'OK'}`
        );
      } else {
        Alert.alert('Erro', 'Não foi possível salvar a URL.');
      }
      
    } catch (error) {
      console.error('Erro ao salvar URL:', error);
      Alert.alert('Erro', 'Falha ao configurar URL.');
    }
  }, [newUrl, testConnection, updateURL]);

  const capturarConfiguracoesCelular = async (nomeUsuario) => {
  try {
    console.log('📱 ==> CAPTURANDO CONFIGURAÇÕES DO CELULAR para:', nomeUsuario);

    // Informações básicas do dispositivo
    const deviceName = Platform.OS === 'ios' ? 'iPhone' : 'Android';
    const appVersion = '1.0.0';
    const sistemaOperacional = Platform.OS; // "android" ou "ios"
    const versaoSO = Platform.Version;       // "33", "17.0", etc.

    // Tentar capturar informações do WiFi
    let wifiName = null;
    try {
      console.log('📶 Tentando capturar informações de rede...');
      const netInfo = await NetInfo.fetch();
      
      console.log('📶 Tipo de conexão:', netInfo.type);
      console.log('📶 Está conectado:', netInfo.isConnected);
      
      if (netInfo.type === 'wifi' && netInfo.isConnected && netInfo.details) {
        wifiName = netInfo.details.ssid || null;
        console.log('📶 Nome do WiFi capturado:', wifiName);
      } else {
        console.log('📶 Não conectado ao WiFi ou usando dados móveis');
      }
    } catch (wifiError) {
      console.log('⚠️ Erro ao capturar WiFi:', wifiError.message);
      wifiName = null;
    }

    const configuracoes = {
      nome_celular: `${deviceName} - ${sistemaOperacional} ${versaoSO}`,
      wifi_nome: wifiName,
      versao_app: appVersion,
      nome_usuario: nomeUsuario,
      data_hora: new Date().toISOString(),
      sistema_operacional: sistemaOperacional,
      versao_so: versaoSO.toString()
    };

    console.log('📱 ✅ Configurações capturadas:', JSON.stringify(configuracoes, null, 2));
    return configuracoes;

  } catch (error) {
    console.error('❌ Erro ao capturar configurações:', error);
    return {
      nome_celular: Platform.OS === 'ios' ? 'iPhone' : 'Android',
      wifi_nome: null,
      versao_app: '1.0.0',
      nome_usuario: nomeUsuario,
      data_hora: new Date().toISOString(),
      sistema_operacional: Platform.OS,
      versao_so: Platform.Version.toString()
    };
  }
};


const handleLogoPress = useCallback(() => {
  setClickCount(prev => prev + 1);
  
  // Resetar contador após 3 segundos
  setTimeout(() => {
    setClickCount(0);
  }, 3000);
  
  // Se clicar 5 vezes em 3 segundos, abrir modal
  if (clickCount >= 4) { // 4 porque será o 5º clique
    console.log('🔧 Modo desenvolvedor ativado!');
    setClickCount(0);
    setNewUrl(currentUrl);
    setShowUrlModal(true);
  }
}, [clickCount, currentUrl]);



const TesteInserir = async (req, res) => {
  try {
    console.log('🧪 TESTE DEBUG - Body recebido:', JSON.stringify(req.body, null, 2));
    
    // Log detalhado de cada campo
    console.log('🧪 nome_celular:', req.body.nome_celular, 'tipo:', typeof req.body.nome_celular);
    console.log('🧪 sistema_operacional:', req.body.sistema_operacional, 'tipo:', typeof req.body.sistema_operacional);
    console.log('🧪 versao_so:', req.body.versao_so, 'tipo:', typeof req.body.versao_so);
    
    // Chamar o serviço normal
    const resultado = await serviceConfiguracoesCelular.Inserir(req.body, req);
    
    console.log('🧪 TESTE - Resultado:', JSON.stringify(resultado, null, 2));
    
    res.status(201).json({
      message: "TESTE - Configuração inserida com sucesso",
      id: resultado.id,
      debug: {
        body_recebido: req.body,
        tipos: {
          sistema_operacional: typeof req.body.sistema_operacional,
          versao_so: typeof req.body.versao_so
        }
      }
    });

  } catch (error) {
    console.error('🧪 TESTE - Erro:', error);
    res.status(500).json({ 
      error: "Erro no teste",
      details: error.message,
      body_recebido: req.body
    });
  }
};



  

  const testarConexao = useCallback(async () => {
    try {
      console.log('🔍 Testando conexão...');
      
      Alert.alert('Testando...', 'Verificando servidor...');
      
      // Testar URL atual
      const currentResult = await testConnection();
      
      if (currentResult.success) {
        Alert.alert(
          '✅ Sucesso!', 
          `Conexão OK!\n\nServidor: ${currentResult.data?.message || 'Respondendo'}\nURL: ${currentResult.url}`
        );
        return currentResult;
      }
      
      // Testar URLs alternativas
      console.log('❌ Testando alternativas...');
      Alert.alert('Testando...', 'Buscando servidores alternativos...');
      
      const results = await testMultipleUrls();
      const successResult = results.find(r => r.success);
      
      if (successResult) {
        Alert.alert(
          '✅ Servidor encontrado!', 
          `URL alternativa funcionando:\n\n${successResult.url}\nStatus: ${successResult.data?.message || 'OK'}`
        );
        setCurrentUrl(successResult.url);
        return successResult;
      } else {
        const errors = results.map(r => `${r.url}: ${r.error}`).join('\n');
        Alert.alert(
          '❌ Nenhum servidor', 
          `Falha em todos os testes:\n\n${errors}\n\nVerifique se o servidor está rodando.`
        );
        return { success: false, error: 'Nenhum servidor disponível' };
      }
      
    } catch (error) {
      Alert.alert('❌ Erro', `Falha no teste:\n${error.message}`);
      console.error('❌ Erro no teste:', error);
      return { success: false, error: error.message };
    }
  }, [testConnection, testMultipleUrls]);

  

// ========== SUBSTITUIR A FUNÇÃO fazerLogin POR ESTA VERSÃO CORRIGIDA ==========

const fazerLogin = useCallback(async () => {
  console.log('🔐 ==> INICIANDO PROCESSO DE LOGIN...');
  
  Keyboard.dismiss();
  setIsLoading(true);

  // Validação básica
  if (!email.trim() || !password.trim()) {
    console.log('❌ Campos vazios detectados');
    Alert.alert('Atenção', 'Por favor, preencha todos os campos.');
    setIsLoading(false);
    return;
  }

  // Verificar se API está pronta
  if (!isAPIReady) {
    console.log('❌ API não está pronta');
    Alert.alert('Aguarde', 'API ainda não está pronta. Tente novamente.');
    setIsLoading(false);
    return;
  }

  try {
    const credentials = {
      email: email.trim(),
      password: password.trim(),
    };

    console.log('📡 Enviando credenciais para API:', {
      email: credentials.email,
      password: '******'
    });

    // Chamar função de login da API
    const response = await login(credentials);
    
    console.log('📥 Resposta da API recebida:', {
      hasToken: !!response?.token,
      hasUser: !!response?.user,
      userId: response?.user?.id || response?.user?.ID_USER,
      userName: response?.user?.name || response?.user?.NAME || response?.user?.FULL_NAME,
      userEmail: response?.user?.email || response?.user?.EMAIL
    });

    // Verificar se a resposta é válida
    if (response && response.token && response.user && (response.user.id || response.user.ID_USER)) {
      
      console.log('✅ Dados válidos recebidos da API');
      console.log('🔐 Iniciando processo de autenticação com AuthContext...');
      
      // ========== USAR AUTHCONTEXT PARA SALVAR LOGIN PRIMEIRO ==========
      const authSuccess = await signIn(response.token, response.user);
      
      console.log('💾 Resultado do AuthContext signIn:', authSuccess);
      
      if (authSuccess) {
        console.log('✅ ==> LOGIN REALIZADO E SALVO COM SUCESSO!');
        
        // ========== AGORA SALVAR CONFIGURAÇÕES DO CELULAR (APÓS LOGIN) ==========
        try {
          console.log('📱 ==> INICIANDO CAPTURA DAS CONFIGURAÇÕES DO CELULAR (PÓS-LOGIN)...');
          
          const nomeUsuario = response.user.name || response.user.NAME || response.user.FULL_NAME || email;
          const configuracoes = await capturarConfiguracoesCelular(nomeUsuario);
          
          console.log('📱 Configurações capturadas, aguardando 1 segundo para salvar...');
          
          // Aguardar 1 segundo para garantir que o token foi salvo
          setTimeout(async () => {
            try {
              const resultadoSalvar = await salvarConfiguracoesCelular(configuracoes, response.token);
              
              if (resultadoSalvar.success) {
                console.log('✅ CONFIGURAÇÕES DO CELULAR SALVAS APÓS LOGIN!');
              } else {
                console.log('⚠️ Não foi possível salvar configurações:', resultadoSalvar.error);
              }
            } catch (saveError) {
              console.log('⚠️ Erro ao salvar configurações (não crítico):', saveError.message);
            }
          }, 1000);
          
        } catch (configError) {
          console.error('❌ Erro ao processar configurações do celular:', configError);
          console.log('⚠️ Continuando login mesmo com erro nas configurações');
        }
        
        console.log('🎯 AuthProvider irá automaticamente redirecionar para LoadingScreen');
        
      } else {
        console.error('❌ Falha ao salvar dados no AuthContext');
        throw new Error('Erro ao salvar dados de login no sistema.');
      }
      
    } else {
      console.error('❌ Estrutura de resposta inválida:', response);
      throw new Error('Dados de login inválidos recebidos do servidor.');
    }

  } catch (error) {
    console.error('❌ ==> ERRO NO PROCESSO DE LOGIN:', error);
    console.error('❌ Tipo do erro:', typeof error);
    console.error('❌ Mensagem do erro:', error.message);
    console.error('❌ Stack do erro:', error.stack);

    let errorMessage = 'Erro ao fazer login. Verifique suas credenciais.';

    // Tratamento específico de erros de rede
    if (error.message?.includes('Network Error') || error.code === 'ECONNREFUSED') {
      console.log('🌐 Erro de rede detectado');
      
      Alert.alert(
        'Erro de Conexão',
        'Não foi possível conectar ao servidor. Deseja testar a conexão automaticamente?',
        [
          { 
            text: 'Cancelar', 
            style: 'cancel',
            onPress: () => console.log('❌ Usuário cancelou teste de conexão')
          },
          { 
            text: 'Testar Conexão', 
            onPress: async () => {
              console.log('🔍 Iniciando teste de conexão automático...');
              const testResult = await testarConexao();
              if (testResult.success) {
                Alert.alert('Conexão OK', 'A conexão foi restabelecida. Tente fazer login novamente.');
                console.log('✅ Conexão restabelecida');
              } else {
                console.log('❌ Teste de conexão falhou');
              }
            }
          }
        ]
      );
    } 
    // Tratamento de outros tipos de erro
    else {
      if (typeof error === 'string') {
        errorMessage = error;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.response && error.response.data && error.response.data.message) {
        errorMessage = error.response.data.message;
      }
      
      console.log('📱 Exibindo erro para usuário:', errorMessage);
      Alert.alert('Erro', errorMessage);
    }

  } finally {
    console.log('🔄 Finalizando processo de login, removendo loading...');
    setIsLoading(false);
  }
}, [email, password, isAPIReady, testarConexao, signIn]);


const salvarConfiguracoesCelular = async (configuracoes, token = null) => {
  try {
    console.log('💾 ==> INICIANDO SALVAMENTO DAS CONFIGURAÇÕES...');
    console.log('📋 Dados a serem salvos:', JSON.stringify(configuracoes, null, 2));

    // Pegar a URL base
    const baseURL = getCurrentURL();
    console.log('🌐 URL base:', baseURL);
    
    // Usar o token passado como parâmetro ou tentar pegar do AsyncStorage
    let authToken = token;
    if (!authToken) {
      authToken = await AsyncStorage.getItem('userToken');
    }
    
    console.log('🔑 Token para requisição:', authToken ? 'DISPONÍVEL' : 'NÃO DISPONÍVEL');
    
    if (!authToken) {
      console.log('❌ Token não disponível, não é possível salvar configurações');
      return { success: false, error: 'Token não disponível' };
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    };

    console.log('📡 Fazendo requisição para:', `${baseURL}/configuracoes-celular`);
    console.log('📡 Headers:', { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken.substring(0, 20)}...`
    });
    
    const response = await fetch(`${baseURL}/configuracoes-celular`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(configuracoes)
    });

    console.log('📥 Status da resposta:', response.status);
    console.log('📥 Response OK:', response.ok);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ ==> CONFIGURAÇÕES SALVAS COM SUCESSO!');
      console.log('📄 Resultado completo:', JSON.stringify(result, null, 2));
      
      // Adicionar um JSON para saber que foi salvo
      console.log('🎯 CONFIGURAÇÃO_SALVA:', JSON.stringify({
        sucesso: true,
        id: result.id,
        usuario: configuracoes.nome_usuario,
        celular: configuracoes.nome_celular,
        timestamp: new Date().toISOString()
      }));
      
      return { success: true, id: result.id };
    } else {
      const errorText = await response.text();
      console.log('❌ Erro na resposta:', errorText);
      return { success: false, error: `Erro ${response.status}: ${errorText}` };
    }

  } catch (error) {
    console.error('❌ ==> ERRO AO SALVAR CONFIGURAÇÕES:', error);
    console.error('❌ Detalhes do erro:', error.message);
    console.error('❌ Stack:', error.stack);
    return { success: false, error: error.message };
  }
};


  // Mostrar loading enquanto API não estiver pronta
  if (!isAPIReady) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#5E8B5C" />
        <Text style={{ marginTop: 10, color: '#666' }}>
          {apiError ? `Erro: ${apiError}` : 'Inicializando...'}
        </Text>
      </View>
    );
  }

  return (
    <ImageBackground
      source={require('../../assets/fundooo.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}
      >
        {/* <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        > */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.inner}>
              <StatusBar style="light" />

              <View style={styles.header}>
                <View style={styles.logoContainer}>
                  <Image
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
              </View>

              <View style={styles.formContainer}>
                <View style={styles.formHeader}>
                  <MaterialCommunityIcons name="account-circle" size={28} color="#5E8B5C" />
                  <Text style={styles.loginTitle}>ACESSO AO SISTEMA</Text>
                </View>

                <View style={styles.inputContainer}>
                  <Icon name="email" size={20} color="#5E8B5C" style={styles.icon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Usuário"
                    placeholderTextColor="#999"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Icon name="lock" size={20} color="#5E8B5C" style={styles.icon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Senha"
                    placeholderTextColor="#999"
                    secureTextEntry={secureText}
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setSecureText(!secureText)}
                    style={styles.eyeIcon}
                  >
                    <Icon
                      name={secureText ? 'visibility-off' : 'visibility'}
                      size={20}
                      color="#666"
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.loginButton, isLoading && styles.botaoDisabled]}
                  onPress={fazerLogin}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={[styles.loginButtonText, { marginLeft: 8 }]}>ENTRANDO...</Text>
                    </View>
                  ) : (
                    <Text style={styles.loginButtonText}>
                      <MaterialCommunityIcons name="login" size={16} /> ENTRAR
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Botões de configuração */}
                {/* <View style={styles.configButtons}>
                  <TouchableOpacity 
                    style={styles.configButton} 
                    onPress={openUrlModal}
                  >
                    <MaterialCommunityIcons name="cog" size={16} color="#666" />
                    <Text style={styles.configButtonText}> Configurar URL</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.testButton} 
                    onPress={testarConexao}
                  >
                    <MaterialCommunityIcons name="wifi" size={16} color="#666" />
                    <Text style={styles.testButtonText}> Testar Conexão</Text>
                  </TouchableOpacity>
                </View> */}

                <View style={styles.footerLinks}>
                  <TouchableOpacity
                    onPress={() => Alert.alert('Recuperação', 'Entre em contato com o administrador.')}
                  >
                    <Text style={styles.linkText}>
                      <MaterialCommunityIcons name="help-circle" size={14} /> Esqueceu a senha?
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.developer}>Setor Desenvolimento/TI</Text>
                </View>
<View style={styles.agrodanContainer}>
  <Text style={styles.poweredBy}>Powered by</Text>
  <TouchableOpacity 
    onPress={handleLogoPress}
    activeOpacity={0.7}
  >
    <Image
      source={require('../../assets/logoagrodann.png')}
      style={styles.agrodanLogo}
      resizeMode="contain"
    />
  </TouchableOpacity>
  <Text style={styles.slogan}>A maior produtora e exportadora</Text>
  <Text style={styles.slogan}>de mangas do Brasil</Text>
  
  {/* Indicador visual quando está clicando (opcional) */}
  {clickCount > 0 && (
    <Text style={styles.clickIndicator}>
      {Array(clickCount).fill('●').join('')}{Array(5 - clickCount).fill('○').join('')}
    </Text>
  )}
</View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        {/* </ScrollView> */}
      </KeyboardAvoidingView>

      {/* Modal para configurar URL */}
      <Modal
        visible={showUrlModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowUrlModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="cog" size={24} color="#5E8B5C" />
              <Text style={styles.modalTitle}>Configurar URL do Servidor</Text>
            </View>
            
            <Text style={styles.modalSubtitle}>
              Digite a URL do seu servidor:
            </Text>
            
            <TextInput
              style={styles.urlInput}
              placeholder="http://192.168.0.116:3000 ou https://seu-ngrok.ngrok-free.app"
              placeholderTextColor="#999"
              value={newUrl}
              onChangeText={setNewUrl}
              autoCapitalize="none"
              autoCorrect={false}
              multiline={true}
              numberOfLines={2}
            />
            
            <Text style={styles.currentUrlText}>
              URL Atual: {currentUrl}
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowUrlModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveNewUrl}
              >
                <MaterialCommunityIcons name="check" size={16} color="#fff" />
                <Text style={styles.saveButtonText}> Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

// Mantenha os estilos que você já tem
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: -60,
  },
  logoContainer: {
    marginBottom: 20,
  },
  logoImage: {
    width: 340,
    height: 186,
  },
  formContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E8ECE8',
    width: '100%',
    maxWidth: 400,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 25,
  },
  loginTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C3E50',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9F8',
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E0E4E0',
    height: 50,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#2C3E50',
    fontWeight: '500',
  },
  icon: {
    marginRight: 10,
  },
  eyeIcon: {
    padding: 8,
  },
  loginButton: {
    backgroundColor: '#5E8B5C',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  botaoDisabled: {
    backgroundColor: '#A0B0A0',
    shadowOpacity: 0.1,
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  configButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
    marginBottom: 10,
  },
  configButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4F0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D8D0',
    flex: 0.48,
  },
  configButtonText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F4E8',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C0D0C0',
    flex: 0.48,
  },
  testButtonText: {
    color: '#5E8B5C',
    fontSize: 12,
    fontWeight: '500',
  },
  footerLinks: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 15,
  },
  linkText: {
    color: '#5E8B5C',
    fontSize: 13,
    fontWeight: '600',
  },
  agrodanContainer: {
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E8ECE8',
  },
  poweredBy: {
    fontSize: 11,
    color: '#888',
    marginBottom: 5,
  },
  agrodanLogo: {
    width: 90,
    height: 35,
    marginBottom: 5,
  },
  slogan: {
    fontSize: 9,
    color: '#777',
    marginBottom: 5,
  },
  developer: {
    fontSize: 11,
    color: '#777',
    fontStyle: 'italic',
    marginTop: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 25,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C3E50',
    marginLeft: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
  urlInput: {
    backgroundColor: '#F8F9F8',
    borderRadius: 10,
    padding: 15,
    fontSize: 14,
    color: '#2C3E50',
    borderWidth: 1,
    borderColor: '#E0E4E0',
    marginBottom: 15,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  currentUrlText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    backgroundColor: '#F0F0F0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    flex: 0.45,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 14,
  },
  clickIndicator: {
  fontSize: 12,
  color: '#5E8B5C',
  marginTop: 5,
  letterSpacing: 2,
},
  saveButton: {
    backgroundColor: '#5E8B5C',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    flex: 0.45,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});