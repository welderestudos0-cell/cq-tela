// backend_agro_solo/src/repositories/repository.user.js
import { query } from "../database/sqlite.js";

// ========== LOGIN - LISTARBYEMAIL ==========
const ListarByEmail = async (email) => {
    console.log('🔍 Repository: Buscando usuário por email:', email);

    let sql = `SELECT *, COALESCE(NIVEL_ACESSO, 'usuario') AS NIVEL_ACESSO, COALESCE(ATIVO, 1) AS ATIVO FROM USERS WHERE email = ?`;
    const users = await query(sql, [email]);

    console.log('📊 Repository: Usuários encontrados:', users.length);

    return users.length ? users[0] : null;
};

// ========== PROFILE ==========
const Profile = async (id_user) => {
    console.log('👤 Repository: Buscando perfil do usuário:', id_user);

    let sql = `
        SELECT
            ID_USER,
            NAME,
            EMAIL,
            FULL_NAME,
            CARGO,
            CPF,
            MATRICULA,
            FAZENDA,
            COALESCE(ATIVO, 1) AS ATIVO,
            COALESCE(NIVEL_ACESSO, 'usuario') AS NIVEL_ACESSO
        FROM USERS
        WHERE ID_USER = ?
    `;

    const users = await query(sql, [id_user]);

    console.log('📊 Repository: Perfil encontrado:', users.length > 0);

    return users.length ? users[0] : null;
};

// ========== INSERIR MONITORAMENTO DO SOLO - CORRIGIDO ==========
const InserirMonitoramento = async (fazenda, talhao, usuario, momento, gps, ponto, zero_a_trinta_cm, trinta_a_sessenta_cm, possui_minhoca, possui_enraizamento) => {
    try {
        console.log('📊 Repository: Inserindo monitoramento:', {
            fazenda,
            talhao,
            usuario,
            momento: momento ? new Date(momento).toISOString() : 'null',
            gps,
            ponto
        });

        // Validar dados obrigatórios
        if (!fazenda || !talhao || !usuario || !momento) {
            throw new Error('Dados obrigatórios não fornecidos');
        }

        // Processar momento para garantir formato correto
        let momentoFormatado;
        try {
            momentoFormatado = new Date(momento).toISOString();
        } catch (dateError) {
            console.error('❌ Erro ao processar momento:', dateError);
            throw new Error('Formato de data/momento inválido');
        }

        let sql = `
            INSERT INTO MONITORAMENTO_SOLO (
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
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            fazenda,
            talhao,
            usuario,
            momentoFormatado,
            gps,
            ponto,
            zero_a_trinta_cm,
            trinta_a_sessenta_cm,
            possui_minhoca ? 1 : 0,  // Converter boolean para integer
            possui_enraizamento ? 1 : 0  // Converter boolean para integer
        ];

        console.log('📊 Repository: Executando SQL com parâmetros:', params);

        const result = await query(sql, params, 'run');

        console.log('✅ Repository: Monitoramento inserido com ID:', result.lastID);

        return {
            id: result.lastID,
            lastID: result.lastID,
            changes: result.changes
        };

    } catch (error) {
        console.error('❌ Repository: Erro ao inserir monitoramento:', error);
        throw error;
    }
};

// ========== LISTAR MONITORAMENTOS ==========
const ListarMonitoramentos = async (usuario = null) => {
    try {
        console.log('📊 Repository: Listando monitoramentos para usuário:', usuario);

        let sql = `
            SELECT
                ID,
                FAZENDA,
                TALHAO,
                USUARIO,
                MOMENTO,
                GPS,
                PONTO,
                ZERO_A_TRINTA_CM,
                TRINTA_A_SESSENTA_CM,
                POSSUI_MINHOCA,
                POSSUI_ENRAIZAMENTO,
                CREATED_AT
            FROM MONITORAMENTO_SOLO
        `;

        let params = [];

        if (usuario) {
            sql += ` WHERE USUARIO = ?`;
            params.push(usuario);
        }

        sql += ` ORDER BY CREATED_AT DESC`;

        const monitoramentos = await query(sql, params);

        console.log('📊 Repository: Monitoramentos encontrados:', monitoramentos.length);

        // Processar dados de retorno
        const processedMonitoramentos = monitoramentos.map(m => ({
            ...m,
            POSSUI_MINHOCA: Boolean(m.POSSUI_MINHOCA),
            POSSUI_ENRAIZAMENTO: Boolean(m.POSSUI_ENRAIZAMENTO)
        }));

        return processedMonitoramentos;

    } catch (error) {
        console.error('❌ Repository: Erro ao listar monitoramentos:', error);
        throw error;
    }
};

export default { ListarByEmail, Profile, InserirMonitoramento, ListarMonitoramentos };





























//-----------------------------------------------------------------------------------------------
// backend/src/database/oracle.js
// import oracledb from 'oracledb';

// // 🔧 Configuração da conexão Oracle
// const oracleConfig = {
//     user: 'controladoria',
//     password: 'n1q30ry27aq',
//     connectString: '10.107.114.11:1521/xe', // Ajuste conforme sua configuração
//     // Ou use o formato completo:
//     // connectString: '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=10.107.114.11)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=xe)))'
// };

// // 🚀 Pool de conexões para melhor performance
// let pool = null;

// const initializePool = async () => {
//     try {
//         if (!pool) {
//             console.log('🔌 Inicializando pool de conexões Oracle...');
            
//             pool = await oracledb.createPool({
//                 ...oracleConfig,
//                 poolMin: 2,
//                 poolMax: 10,
//                 poolIncrement: 1,
//                 poolTimeout: 300, // 5 minutos
//                 enableStatistics: true
//             });
            
//             console.log('✅ Pool Oracle inicializado com sucesso');
//         }
//         return pool;
//     } catch (error) {
//         console.error('❌ Erro ao inicializar pool Oracle:', error);
//         throw error;
//     }
// };

// // 🔍 Função principal para executar queries
// const queryOracle = async (sql, params = [], options = {}) => {
//     let connection = null;
    
//     try {
//         console.log('📊 Oracle Query:', {
//             sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
//             params: params?.length || 0,
//             operation: sql.trim().split(' ')[0].toUpperCase()
//         });

//         // Garantir que o pool está inicializado
//         if (!pool) {
//             await initializePool();
//         }

//         // Obter conexão do pool
//         connection = await pool.getConnection();
        
//         // Configurar opções padrão
//         const queryOptions = {
//             outFormat: oracledb.OUT_FORMAT_OBJECT, // Retorna objetos em vez de arrays
//             autoCommit: true, // Auto commit para INSERT/UPDATE/DELETE
//             ...options
//         };

//         // Executar query
//         const result = await connection.execute(sql, params, queryOptions);

//         console.log('✅ Oracle Query executada:', {
//             rowsAffected: result.rowsAffected || 0,
//             rowsReturned: result.rows?.length || 0
//         });

//         // Para SELECT: retornar rows
//         if (result.rows) {
//             return result.rows;
//         }

//         // Para INSERT/UPDATE/DELETE: retornar informações da operação
//         return {
//             rowsAffected: result.rowsAffected,
//             lastRowid: result.lastRowid,
//             insertId: result.lastRowid, // Compatibilidade
//             success: true
//         };

//     } catch (error) {
//         console.error('❌ Erro na query Oracle:', {
//             message: error.message,
//             code: error.errorNum,
//             sql: sql.substring(0, 100) + '...',
//             params: params
//         });
//         throw error;
//     } finally {
//         // Sempre liberar a conexão de volta para o pool
//         if (connection) {
//             try {
//                 await connection.close();
//             } catch (closeError) {
//                 console.error('⚠️ Erro ao fechar conexão Oracle:', closeError);
//             }
//         }
//     }
// };

// // 🔍 Função para testar conexão
// const testConnection = async () => {
//     try {
//         console.log('🧪 Testando conexão Oracle...');
        
//         const result = await queryOracle('SELECT SYSDATE FROM DUAL');
        
//         console.log('✅ Conexão Oracle OK:', result[0]);
//         return { success: true, data: result[0] };
        
//     } catch (error) {
//         console.error('❌ Teste de conexão Oracle falhou:', error);
//         return { success: false, error: error.message };
//     }
// };

// // 🔧 Função para fechar pool (usar no shutdown da aplicação)
// const closePool = async () => {
//     try {
//         if (pool) {
//             console.log('🔌 Fechando pool de conexões Oracle...');
//             await pool.close(10); // 10 segundos de timeout
//             pool = null;
//             console.log('✅ Pool Oracle fechado');
//         }
//     } catch (error) {
//         console.error('❌ Erro ao fechar pool Oracle:', error);
//     }
// };

// // 🚀 Inicializar pool na importação do módulo
// initializePool().catch(error => {
//     console.error('❌ Falha na inicialização automática do pool Oracle:', error);
// });

// export { 
//     queryOracle,
//     testConnection,
//     closePool,
//     initializePool
// };