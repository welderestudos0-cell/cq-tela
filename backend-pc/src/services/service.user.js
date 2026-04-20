// backend_agro_solo/src/services/service.user.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import repositoryUser from "../repositories/repository.user.js";

const JWT_SECRET = process.env.JWT_SECRET || 'agrosolo-secret-key';

// DEBUG: Log da chave secreta
console.log('🔑 JWT_SECRET no Service:', JWT_SECRET);

// ========== LOGIN CORRIGIDO ==========
const Login = async (email, password) => {
    try {
        console.log('🔐 Service: Tentativa de login:', { email, password: '***' });

        if (!email || !password) {
            throw new Error('Email e senha são obrigatórios');
        }

        // Buscar usuário por email no banco
        const usuario = await repositoryUser.ListarByEmail(email);

        if (!usuario) {
            console.log('❌ Usuário não encontrado no banco:', email);
            return null;
        }

        console.log('👤 Usuário encontrado no banco:', {
            id: usuario.ID_USER,
            name: usuario.NAME,
            email: usuario.EMAIL,
            cargo: usuario.CARGO,
            hasPassword: !!usuario.PASSWORD
        });

        // ✅ VALIDAÇÃO DE SENHA CORRIGIDA
        let senhaValida = false;

        try {
            if (usuario.PASSWORD) {
                // Tentar primeiro com bcrypt (senha criptografada)
                if (usuario.PASSWORD.startsWith('$2b$') || usuario.PASSWORD.startsWith('$2a$')) {
                    console.log('🔐 Verificando senha com bcrypt...');
                    senhaValida = await bcrypt.compare(password, usuario.PASSWORD);
                    console.log('🔐 Resultado bcrypt:', senhaValida);
                } else {
                    // Se não é hash bcrypt, comparar texto simples
                    console.log('🔐 Verificando senha em texto simples...');
                    senhaValida = (password === usuario.PASSWORD);
                    console.log('🔐 Resultado texto simples:', senhaValida);
                }
            } else {
                console.log('❌ Usuário sem senha cadastrada');
                return null;
            }
        } catch (bcryptError) {
            console.error('⚠️ Erro na verificação de senha:', bcryptError);
            // Fallback: tentar comparação simples
            senhaValida = (password === usuario.PASSWORD);
            console.log('🔐 Fallback - resultado:', senhaValida);
        }

        if (!senhaValida) {
            console.log('❌ Senha inválida para:', email);
            return null;
        }

        console.log('✅ Login validado com sucesso para:', email);

        // ✅ GERAR TOKEN JWT
        console.log('🔐 Gerando token JWT...');

        const tokenPayload = {
            id: usuario.ID_USER,
            email: usuario.EMAIL,
            name: usuario.NAME,
            cargo: usuario.CARGO
        };

        console.log('📋 Payload do token:', tokenPayload);

        const token = jwt.sign(
            tokenPayload,
            JWT_SECRET,
            {
                expiresIn: '24h',
                issuer: 'agrosolo-api',
                audience: 'agrosolo-app'
            }
        );

        console.log('✅ Token gerado:', token.substring(0, 30) + '...');

        // ✅ RETORNO PADRONIZADO
        return {
            success: true,
            message: 'Login realizado com sucesso',
            ID_USER: usuario.ID_USER,
            NAME: usuario.NAME,
            EMAIL: usuario.EMAIL,
            FULL_NAME: usuario.FULL_NAME || usuario.NAME,
            CARGO: usuario.CARGO,
            CPF: usuario.CPF,
            MATRICULA: usuario.MATRICULA,
            FAZENDA: usuario.FAZENDA,
            NIVEL_ACESSO: (usuario.NIVEL_ACESSO || 'usuario').toLowerCase(),
            ATIVO: usuario.ATIVO ?? 1,
            MODULOS: usuario.modulos || null,
            token: token
        };

    } catch (error) {
        console.error('❌ Erro no service de login:', error);
        throw error;
    }
};

// ========== PROFILE ==========
const Profile = async (id_user) => {
    try {
        console.log('👤 Service: Buscando perfil do usuário:', id_user);

        if (!id_user) {
            throw new Error('ID do usuário é obrigatório');
        }

        const usuario = await repositoryUser.Profile(id_user);

        if (!usuario) {
            throw new Error('Usuário não encontrado');
        }

        console.log('✅ Perfil encontrado:', usuario);

        return {
            success: true,
            ID_USER: usuario.ID_USER,
            NAME: usuario.NAME,
            EMAIL: usuario.EMAIL,
            FULL_NAME: usuario.FULL_NAME || usuario.NAME,
            CARGO: usuario.CARGO,
            CPF: usuario.CPF,
            MATRICULA: usuario.MATRICULA,
            FAZENDA: usuario.FAZENDA
        };

    } catch (error) {
        console.error('❌ Erro no service de profile:', error);
        throw error;
    }
};

// ========== INSERIR MONITORAMENTO ==========
const InserirMonitoramento = async (monitoramentoData) => {
    try {
        console.log('📊 Service: Dados de monitoramento recebidos:', monitoramentoData);

        // Extrair dados com validação
        const {
            fazenda,
            talhao,
            usuario,
            momento,
            gps,
            ponto,
            zero_a_trinta_cm,
            trinta_a_sessenta_cm,
            possui_minhoca,
            possui_enraizamento
        } = monitoramentoData;

        // Validações obrigatórias
        if (!fazenda || !talhao || !usuario || !momento) {
            throw new Error('Fazenda, talhão, usuário e momento são obrigatórios');
        }

        // Validar formato do GPS se fornecido
        let gpsProcessado = null;
        if (gps) {
            if (typeof gps === 'string') {
                gpsProcessado = gps;
            } else if (typeof gps === 'object' && gps.latitude && gps.longitude) {
                gpsProcessado = `[${gps.latitude}, ${gps.longitude}]`;
            } else {
                console.log('⚠️ Formato de GPS inválido, usando null');
            }
        }

        // Processar momento
        let momentoProcessado = momento;
        if (typeof momento === 'string') {
            const date = new Date(momento);
            if (isNaN(date.getTime())) {
                throw new Error('Formato de momento inválido');
            }
            momentoProcessado = date.toISOString();
        } else if (momento instanceof Date) {
            momentoProcessado = momento.toISOString();
        }

        console.log('📊 Service: Dados processados:', {
            fazenda,
            talhao,
            usuario,
            momento: momentoProcessado,
            gps: gpsProcessado,
            ponto
        });

        // Inserir monitoramento
        const novoMonitoramento = await repositoryUser.InserirMonitoramento(
            fazenda,
            talhao,
            usuario,
            momentoProcessado,
            gpsProcessado,
            ponto || null,
            zero_a_trinta_cm || null,
            trinta_a_sessenta_cm || null,
            possui_minhoca || false,
            possui_enraizamento || false
        );

        // Verificar se o resultado é válido
        if (!novoMonitoramento || typeof novoMonitoramento !== 'object') {
            console.error('❌ Repository retornou resultado inválido:', novoMonitoramento);
            throw new Error('Erro ao inserir monitoramento no banco de dados');
        }

        // Verificar se tem o ID
        const monitoramentoId = novoMonitoramento.id || novoMonitoramento.lastID || novoMonitoramento.insertId;

        if (!monitoramentoId) {
            console.error('❌ ID do monitoramento não encontrado:', novoMonitoramento);
            throw new Error('Erro ao obter ID do monitoramento inserido');
        }

        console.log('✅ Monitoramento inserido com ID:', monitoramentoId);

        return {
            success: true,
            message: 'Monitoramento registrado com sucesso',
            id: monitoramentoId,
            data: {
                ...monitoramentoData,
                momento: momentoProcessado,
                gps: gpsProcessado
            }
        };

    } catch (error) {
        console.error('❌ Erro no service de monitoramento:', error);
        throw error;
    }
};

// ========== LISTAR MONITORAMENTOS ==========
const ListarMonitoramentos = async (usuario = null) => {
    try {
        console.log('📊 Service: Listando monitoramentos para:', usuario);

        const monitoramentos = await repositoryUser.ListarMonitoramentos(usuario);

        return {
            success: true,
            data: monitoramentos,
            total: monitoramentos.length
        };

    } catch (error) {
        console.error('❌ Erro no service de listagem:', error);
        throw error;
    }
};

// ========== FUNÇÃO AUXILIAR PARA CRIPTOGRAFAR SENHA ==========
const CriptografarSenha = async (senha) => {
    try {
        const saltRounds = 10;
        const senhaHash = await bcrypt.hash(senha, saltRounds);
        console.log('🔐 Senha criptografada com sucesso');
        return senhaHash;
    } catch (error) {
        console.error('❌ Erro ao criptografar senha:', error);
        throw error;
    }
};

export default {
    Login,
    Profile,
    InserirMonitoramento,
    ListarMonitoramentos,
    CriptografarSenha
};
