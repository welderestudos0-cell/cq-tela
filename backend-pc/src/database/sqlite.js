import sqlite3 from "sqlite3";

const SQLite = sqlite3.verbose();

// ========== FUNÇÃO QUERY CORRIGIDA ==========
function query(command, params, method = "all") {
    return new Promise(function (resolve, reject) {
        
        // ✅ CORREÇÃO: Tratar método 'run' separadamente
        if (method === "run") {
            // Para db.run(), o resultado vem no contexto 'this', não como parâmetro
            db.run(command, params, function (error) {
                if (error) {
                    if (!error.message?.includes("duplicate column name")) {
                        console.error("❌ Erro no SQLite run:", error);
                    }
                    reject(error);
                } else {
                    // ✅ CORREÇÃO: Usar 'this' para acessar lastID e changes
                    console.log("✅ SQLite run executado:", {
                        lastID: this.lastID,
                        changes: this.changes
                    });
                    
                    resolve({
                        lastID: this.lastID,
                        changes: this.changes
                    });
                }
            });
        } else {
            // Para outros métodos (all, get, each), usar o padrão normal
            db[method](command, params, function (error, result) {
                if (error) {
                    console.error(`❌ Erro no SQLite ${method}:`, error);
                    reject(error);
                } else {
                    console.log(`✅ SQLite ${method} executado:`, {
                        resultType: typeof result,
                        resultLength: Array.isArray(result) ? result.length : 'N/A'
                    });
                    resolve(result);
                }
            });
        }
    });
}

// ========== CONEXÃO DO BANCO ==========
const db = new SQLite.Database("./src/database/banco.db", SQLite.OPEN_READWRITE, (err) => {
    if (err) {
        console.error("❌ Erro ao conectar com o banco:", err.message);
        return;
    }
    console.log("✅ Conectado ao banco SQLite com sucesso!");
    
    // Configurar algumas otimizações
    db.run("PRAGMA foreign_keys = ON;");
    db.run("PRAGMA journal_mode = WAL;");
});

// ========== FUNÇÃO PARA FECHAR CONEXÃO ==========
const closeDatabase = () => {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) {
                console.error("❌ Erro ao fechar banco:", err.message);
                reject(err);
            } else {
                console.log("✅ Conexão com banco fechada");
                resolve();
            }
        });
    });
};

export { db, query, closeDatabase };

// 1. SQLITE.JS CORRIGIDO - backend_agro_solo/src/database/sqlite.js
// ==========================================

// import { query } from "./sqlite.js";
// import sqlite3 from "sqlite3";
// const SQLite = sqlite3.verbose();


// // ========== CRIANDO USER ==========
// const Inserir = async (name, email, password, fullName, cpf, matricula, fazenda, cargo = null) => {
//     console.log('📝 Repository: Inserindo usuário:', {
//         name, email, fullName, cargo, cpf, matricula, fazenda
//     });

//     let sql = `
//         INSERT INTO USERS (name, email, password, full_name, cargo, cpf, matricula, fazenda)
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//     `;
    
//     const result = await query(sql, [name, email, password, fullName, cargo, cpf, matricula, fazenda]);
    
//     console.log('✅ Repository: Usuário inserido com ID:', result.id);
    
//     return {
//         id_user: result.id,
//         lastID: result.lastID
//     };
// };

// // ========== LOGIN - LISTARBYEMAIL ==========
// const ListarByEmail = async (email) => {
//     console.log('🔍 Repository: Buscando usuário por email:', email);
    
//     let sql = `SELECT * FROM USERS WHERE email = ?`;
//     const users = await query(sql, [email]);
    
//     console.log('📊 Repository: Usuários encontrados:', users.length);
    
//     return users.length ? users[0] : null;
// };

// // ========== PROFILE ==========
// const Profile = async (id_user) => {
//     console.log('👤 Repository: Buscando perfil do usuário:', id_user);
    
//     let sql = `
//         SELECT 
//             ID_USER, 
//             NAME, 
//             EMAIL, 
//             FULL_NAME,
//             CARGO,
//             CPF,
//             MATRICULA,
//             FAZENDA
//         FROM USERS 
//         WHERE id_user = ?
//     `;
    
//     const users = await query(sql, [id_user]);
    
//     console.log('📊 Repository: Perfil encontrado:', users.length > 0);
    
//     return users.length ? users[0] : null;
// };

// // ========== INSERIR MONITORAMENTO DO SOLO ==========
// const InserirMonitoramento = async (fazenda, talhao, usuario, momento, gps, ponto, zero_a_trinta_cm, trinta_a_sessenta_cm, possui_minhoca, possui_enraizamento) => {
//     console.log('📊 Repository: Inserindo monitoramento:', {
//         fazenda, talhao, usuario, momento
//     });

//     let sql = `
//         INSERT INTO MONITORAMENTO_SOLO (
//             fazenda, 
//             talhao, 
//             usuario, 
//             momento, 
//             gps,
//             ponto, 
//             zero_a_trinta_cm, 
//             trinta_a_sessenta_cm, 
//             possui_minhoca, 
//             possui_enraizamento
//         )
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     const result = await query(sql, [
//         fazenda, 
//         talhao, 
//         usuario, 
//         momento, 
//         gps,
//         ponto, 
//         zero_a_trinta_cm, 
//         trinta_a_sessenta_cm, 
//         possui_minhoca, 
//         possui_enraizamento
//     ]);
    
//     console.log('✅ Repository: Monitoramento inserido com ID:', result.id);
    
//     return {
//         id: result.id,
//         lastID: result.lastID
//     };
// };

// export default { Inserir, ListarByEmail, Profile, InserirMonitoramento };