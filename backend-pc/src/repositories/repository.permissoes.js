// backend/src/repositories/repository.permissoes.js
import { query } from "../database/sqlite.js";
import bcrypt from 'bcryptjs';

const MODULOS_PADRAO = ['monitoramento_solo', 'limpeza', 'manutencao_bomba', 'teste_vazao', 'cadastro_kc', 'consumo_agua'];
const MODULOS_ADMIN  = [...MODULOS_PADRAO, 'auditoria_luciano'];

// Adicionar coluna apenas se não existir
const adicionarColuna = async (nome, definicao) => {
  const colunas = await query(`PRAGMA table_info(USERS)`, [], 'all');
  const existe = colunas.some(c => c.name.toUpperCase() === nome.toUpperCase());
  if (!existe) {
    await query(`ALTER TABLE USERS ADD COLUMN ${nome} ${definicao}`, [], 'run');
  }
};

const criarColunas = async () => {
  await adicionarColuna('modulos', 'TEXT');
  await adicionarColuna('ATIVO', 'INTEGER DEFAULT 1');
  await adicionarColuna('NIVEL_ACESSO', "TEXT DEFAULT 'usuario'");
};

criarColunas().catch(() => {});

// ========== LISTAR TODOS OS USUÁRIOS ==========
const ListarUsuarios = async () => {
  const sql = `
    SELECT ID_USER, NAME, FULL_NAME, EMAIL, CARGO, MATRICULA, FAZENDA, modulos,
           COALESCE(ATIVO, 1) AS ATIVO,
           COALESCE(NIVEL_ACESSO, 'usuario') AS NIVEL_ACESSO
    FROM USERS
    ORDER BY NAME ASC
  `;
  const rows = await query(sql, [], 'all');
  return rows.map(u => ({
    ...u,
    modulos: u.modulos ? JSON.parse(u.modulos) : MODULOS_PADRAO,
  }));
};

// ========== ATUALIZAR MÓDULOS DO USUÁRIO ==========
const AtualizarModulos = async (id_user, modulos) => {
  const sql = `UPDATE USERS SET modulos = ? WHERE ID_USER = ?`;
  const result = await query(sql, [JSON.stringify(modulos), id_user], 'run');
  return { changes: result.changes };
};

// ========== BUSCAR MÓDULOS DE UM USUÁRIO ==========
const BuscarModulos = async (id_user) => {
  const sql = `SELECT modulos FROM USERS WHERE ID_USER = ?`;
  const rows = await query(sql, [id_user], 'all');
  if (!rows.length) return MODULOS_PADRAO;
  return rows[0].modulos ? JSON.parse(rows[0].modulos) : MODULOS_PADRAO;
};

// ========== CRIAR USUÁRIO ==========
const CriarUsuario = async ({ nome, email, senha, cargo, fazenda, matricula, nivel_acesso }) => {
  const senhaHash = await bcrypt.hash(senha, 10);
  const nivel = nivel_acesso || 'usuario';
  const modulosIniciais = (nivel === 'admin' || nivel === 'gerente') ? MODULOS_ADMIN : MODULOS_PADRAO;
  const sql = `
    INSERT INTO USERS (NAME, EMAIL, PASSWORD, CARGO, FAZENDA, MATRICULA, modulos, ATIVO, NIVEL_ACESSO)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `;
  const result = await query(sql, [nome, email || '', senhaHash, cargo || '', fazenda || '', matricula || '', JSON.stringify(modulosIniciais), nivel], 'run');
  return { id: result.lastID };
};

// ========== ALTERAR SENHA ==========
const AlterarSenha = async (id_user, novaSenha) => {
  const senhaHash = await bcrypt.hash(novaSenha, 10);
  const sql = `UPDATE USERS SET PASSWORD = ? WHERE ID_USER = ?`;
  const result = await query(sql, [senhaHash, id_user], 'run');
  return { changes: result.changes };
};

// ========== ATUALIZAR NIVEL_ACESSO ==========
const AtualizarNivelAcesso = async (id_user, nivel_acesso) => {
  const sql = `UPDATE USERS SET NIVEL_ACESSO = ? WHERE ID_USER = ?`;
  const result = await query(sql, [nivel_acesso, id_user], 'run');
  return { changes: result.changes };
};

// ========== DELETAR USUÁRIO ==========
const DeletarUsuario = async (id_user) => {
  const sql = `DELETE FROM USERS WHERE ID_USER = ?`;
  const result = await query(sql, [id_user], 'run');
  return { changes: result.changes };
};

// ========== TOGGLE ATIVO ==========
const ToggleAtivo = async (id_user) => {
  const sql = `UPDATE USERS SET ATIVO = CASE WHEN COALESCE(ATIVO,1) = 1 THEN 0 ELSE 1 END WHERE ID_USER = ?`;
  await query(sql, [id_user], 'run');
  // retornar novo valor
  const rows = await query(`SELECT COALESCE(ATIVO,1) AS ATIVO FROM USERS WHERE ID_USER = ?`, [id_user], 'all');
  return { ativo: rows[0]?.ATIVO ?? 1 };
};

export default { ListarUsuarios, AtualizarModulos, BuscarModulos, CriarUsuario, AlterarSenha, DeletarUsuario, ToggleAtivo, AtualizarNivelAcesso, MODULOS_PADRAO, MODULOS_ADMIN };
