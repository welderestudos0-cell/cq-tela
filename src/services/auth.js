
import api from './api';

export const login = async ({ email, password }) => {
  try {
    // Validação básica
    if (!email || !password) {
      throw new Error('Email e senha são obrigatórios');
    }

    console.log('🔐 Tentando login com:', { email, password: '******' });

    // Requisição de login
    const response = await api.post('/users/login', {
      email: email.toLowerCase().trim(),
      password: password.trim()
    });

    console.log('📡 Resposta completa do login:', response);

    // Verificação do token
    const token = response.token;
    if (!token) {
      console.error('❌ Token não encontrado na resposta');
      throw new Error('Problema na autenticação. Tente novamente.');
    }

    const MODULOS_PADRAO = ['monitoramento_solo','limpeza','manutencao_bomba','teste_vazao','cadastro_kc','consumo_agua'];
    const modulosRaw = response.MODULOS;
    const modulos = modulosRaw
      ? (typeof modulosRaw === 'string' ? JSON.parse(modulosRaw) : modulosRaw)
      : MODULOS_PADRAO;

    // Dados do usuário
    const userData = {
      id: response.ID_USER,
      name: response.NAME || response.FULL_NAME,
      fullName: response.FULL_NAME,
      email: response.EMAIL,
      cpf: response.CPF,
      fazenda: response.FAZENDA,
      matricula: response.MATRICULA,
      cargo: response.CARGO,
      nivel_acesso: (response.NIVEL_ACESSO || 'usuario').toLowerCase(),
      modulos,
      // Campos alternativos para compatibilidade
      CARGO: response.CARGO,
      NIVEL_ACESSO: (response.NIVEL_ACESSO || 'usuario').toLowerCase(),
      MODULOS: modulos,
      NAME: response.NAME,
      FULL_NAME: response.FULL_NAME,
      EMAIL: response.EMAIL,
      CPF: response.CPF,
      FAZENDA: response.FAZENDA,
      MATRICULA: response.MATRICULA,
      ID_USER: response.ID_USER
    };

    if (!userData.id) {
      throw new Error('Dados do usuário incompletos na resposta');
    }

    console.log('✅ Login bem-sucedido:', userData);

    return {
      token,
      user: userData
    };

  } catch (error) {
    console.error('❌ Erro no login:', error);

    let userMessage = 'Erro ao fazer login';
        
    if (error.message?.includes('Network Error')) {
      userMessage = 'Não foi possível conectar ao servidor';
    } else if (error.response?.status === 401) {
      userMessage = 'Email ou senha incorretos';
    } else if (error.message?.includes('Token não encontrado')) {
      userMessage = 'Problema na autenticação. Tente novamente.';
    } else if (error.message) {
      userMessage = error.message;
    }

    throw new Error(userMessage);
  }
};

// Função para registro
export const register = async (userData) => {
  try {
    console.log('📝 Tentando registrar usuário:', userData);
    
    const response = await api.post('/users/register', userData);
    
    console.log('✅ Usuário registrado com sucesso:', response);
    
    return response;
  } catch (error) {
    console.error('❌ Erro no registro:', error);
    
    let userMessage = 'Erro ao cadastrar usuário';
    
    if (error.response?.status === 400) {
      userMessage = 'Dados inválidos. Verifique as informações.';
    } else if (error.response?.status === 409) {
      userMessage = 'Email já cadastrado no sistema.';
    } else if (error.message) {
      userMessage = error.message;
    }
    
    throw new Error(userMessage);
  }}