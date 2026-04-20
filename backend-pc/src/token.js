// backend_agro_solo/src/token.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'agrosolo-secret-key';

// DEBUG: Log da chave secreta na inicialização
console.log('🔑 JWT_SECRET no Token middleware:', JWT_SECRET);

// Middleware para validar token JWT
const ValidateToken = (req, res, next) => {
    try {
        console.log('🔐 Validando token JWT...');
        console.log('🔑 JWT_SECRET na validação:', JWT_SECRET);

        // Buscar token no header Authorization
        const authHeader = req.headers.authorization;

        console.log('📋 Headers recebidos:', {
            'user-agent': req.headers['user-agent'],
            'content-type': req.headers['content-type'],
            'authorization': authHeader ? `Bearer ${authHeader.split(' ')[1]?.substring(0, 20)}...` : 'NÃO FORNECIDO'
        });

        if (!authHeader) {
            console.log('❌ Token não fornecido no header Authorization');
            return res.status(401).json({
                error: 'Token de acesso não fornecido',
                code: 'NO_TOKEN',
                success: false,
                details: 'Header Authorization não encontrado'
            });
        }

        // Extrair token (formato: "Bearer TOKEN")
        const tokenParts = authHeader.split(' ');

        if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
            console.log('❌ Formato de token inválido:', authHeader);
            return res.status(401).json({
                error: 'Formato de token inválido',
                code: 'INVALID_TOKEN_FORMAT',
                success: false,
                details: 'Esperado: Bearer <token>'
            });
        }

        const token = tokenParts[1];

        if (!token || token === 'null' || token === 'undefined') {
            console.log('❌ Token vazio ou inválido');
            return res.status(401).json({
                error: 'Token vazio ou inválido',
                code: 'EMPTY_TOKEN',
                success: false
            });
        }

        console.log('🔍 Token recebido (primeiros 30 chars):', token.substring(0, 30) + '...');
        console.log('🔍 Token completo length:', token.length);

        // Verificar e decodificar token
        const decoded = jwt.verify(token, JWT_SECRET);

        console.log('✅ Token válido. Dados decodificados:', {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            cargo: decoded.cargo,
            iat: new Date(decoded.iat * 1000).toISOString(),
            exp: new Date(decoded.exp * 1000).toISOString()
        });

        // Verificar se o token não expirou
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp < now) {
            console.log('❌ Token expirado:', {
                exp: new Date(decoded.exp * 1000).toISOString(),
                now: new Date(now * 1000).toISOString()
            });
            return res.status(401).json({
                error: 'Token expirado - faça login novamente',
                code: 'TOKEN_EXPIRED',
                success: false
            });
        }

        // Adicionar dados do usuário ao request
        req.id_user = decoded.id;
        req.user_email = decoded.email;
        req.user_name = decoded.name;
        req.user_cargo = decoded.cargo;
        req.token_data = decoded;

        console.log('✅ Token validado com sucesso. Usuário autenticado:', decoded.id);

        // Continuar para próximo middleware/rota
        next();

    } catch (error) {
        console.error('❌ Erro na validação do token:', error);
        console.error('❌ Tipo do erro:', error.name);
        console.error('❌ Mensagem completa:', error.message);
        console.error('❌ Stack trace:', error.stack);

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expirado - faça login novamente',
                code: 'TOKEN_EXPIRED',
                success: false,
                details: `Token expirou em: ${new Date(error.expiredAt).toISOString()}`
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Token inválido - faça login novamente',
                code: 'INVALID_TOKEN',
                success: false,
                details: error.message
            });
        }

        if (error.name === 'NotBeforeError') {
            return res.status(401).json({
                error: 'Token ainda não válido',
                code: 'TOKEN_NOT_ACTIVE',
                success: false
            });
        }

        return res.status(500).json({
            error: 'Erro interno na validação do token',
            code: 'TOKEN_VALIDATION_ERROR',
            success: false,
            details: error.message
        });
    }
};

// Função para gerar token JWT
const GenerateToken = (userData) => {
    try {
        console.log('🔐 Gerando token para usuário:', userData.id || userData.ID_USER);
        console.log('🔑 JWT_SECRET na geração:', JWT_SECRET);

        const payload = {
            id: userData.id || userData.ID_USER,
            email: userData.email || userData.EMAIL,
            name: userData.name || userData.NAME,
            cargo: userData.cargo || userData.CARGO,
            iat: Math.floor(Date.now() / 1000)
        };

        console.log('📋 Payload do token:', payload);

        const options = {
            expiresIn: '24h',
            issuer: 'agrosolo-api',
            audience: 'agrosolo-app'
        };

        const token = jwt.sign(payload, JWT_SECRET, options);

        console.log('✅ Token gerado com sucesso');
        console.log('🔍 Token gerado (primeiros 30 chars):', token.substring(0, 30) + '...');
        console.log('🔍 Token length:', token.length);

        // Verificar se o token gerado é válido
        try {
            const testDecode = jwt.verify(token, JWT_SECRET);
            console.log('✅ Teste de validação do token gerado: OK');
            console.log('📋 Dados decodificados:', testDecode);
        } catch (testError) {
            console.error('❌ ERRO: Token gerado não é válido!', testError);
        }

        return token;

    } catch (error) {
        console.error('❌ Erro ao gerar token:', error);
        throw error;
    }
};

// Função para verificar token (sem middleware)
const VerifyToken = (token) => {
    try {
        console.log('🔍 Verificando token externamente...');
        console.log('🔍 Token (primeiros 30 chars):', token.substring(0, 30) + '...');
        console.log('🔑 JWT_SECRET na verificação:', JWT_SECRET);

        const decoded = jwt.verify(token, JWT_SECRET);

        console.log('✅ Token verificado com sucesso:', {
            id: decoded.id,
            email: decoded.email,
            exp: new Date(decoded.exp * 1000).toISOString()
        });

        return {
            valid: true,
            data: decoded
        };
    } catch (error) {
        console.error('❌ Erro na verificação do token:', error);
        return {
            valid: false,
            error: error.message,
            name: error.name
        };
    }
};

// Função para decodificar token sem verificar (para debug)
const DecodeToken = (token) => {
    try {
        const decoded = jwt.decode(token, { complete: true });
        console.log('🔍 Token decodificado (sem verificação):', decoded);
        return decoded;
    } catch (error) {
        console.error('❌ Erro ao decodificar token:', error);
        return null;
    }
};

export default {
    ValidateToken,
    GenerateToken,
    VerifyToken,
    DecodeToken
};
