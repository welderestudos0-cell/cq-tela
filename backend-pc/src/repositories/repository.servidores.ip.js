// backend/src/repositories/repository.servidores.ip.js
import { query } from "../database/sqlite.js";

// ========== LISTAR SERVIDORES POR USUARIO ==========
const ListarPorUsuario = async (id_user) => {
  try {
    const sql = `
      SELECT id, id_user, nome_servidor, ip_endereco, ip_fixo, created_at, updated_at
      FROM servidores_ip
      WHERE id_user = ?
      ORDER BY id ASC
    `;

    const result = await query(sql, [id_user], 'all');
    return result;

  } catch (error) {
    console.error('Erro ao listar servidores do usuario:', error);
    throw error;
  }
};

// ========== LISTAR TODOS ==========
const Listar = async () => {
  try {
    const sql = `
      SELECT s.id, s.id_user, u.NAME as nome_usuario, s.nome_servidor, s.ip_endereco, s.ip_fixo, s.created_at, s.updated_at
      FROM servidores_ip s
      LEFT JOIN USERS u ON u.ID_USER = s.id_user
      ORDER BY s.id_user ASC, s.id ASC
    `;

    const result = await query(sql, [], 'all');
    return result;

  } catch (error) {
    console.error('Erro ao listar servidores:', error);
    throw error;
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (id) => {
  try {
    const sql = `
      SELECT id, id_user, nome_servidor, ip_endereco, ip_fixo, created_at, updated_at
      FROM servidores_ip
      WHERE id = ?
    `;

    const result = await query(sql, [id], 'get');
    return result;

  } catch (error) {
    console.error('Erro ao buscar servidor por ID:', error);
    throw error;
  }
};

// ========== INSERIR SERVIDOR PRA UM USUARIO ==========
const Inserir = async (id_user, nome_servidor, ip_endereco, ip_fixo) => {
  try {
    const sql = `
      INSERT INTO servidores_ip (id_user, nome_servidor, ip_endereco, ip_fixo)
      VALUES (?, ?, ?, ?)
    `;

    const result = await query(sql, [id_user, nome_servidor, ip_endereco, ip_fixo || null], 'run');

    return {
      id: result.lastID,
      changes: result.changes
    };

  } catch (error) {
    console.error('Erro ao inserir servidor:', error);
    throw error;
  }
};

// ========== ATUALIZAR SERVIDOR ==========
const Atualizar = async (id, dados) => {
  try {
    const campos = [];
    const params = [];

    if (dados.nome_servidor !== undefined) {
      campos.push('nome_servidor = ?');
      params.push(dados.nome_servidor);
    }

    if (dados.ip_endereco !== undefined) {
      campos.push('ip_endereco = ?');
      params.push(dados.ip_endereco);
    }

    // ip_fixo pode ser null (pra limpar) ou um valor
    if ('ip_fixo' in dados) {
      campos.push('ip_fixo = ?');
      params.push(dados.ip_fixo);
    }

    if (campos.length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    campos.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const sql = `
      UPDATE servidores_ip
      SET ${campos.join(', ')}
      WHERE id = ?
    `;

    const result = await query(sql, params, 'run');

    return {
      id,
      changes: result.changes,
      success: result.changes > 0
    };

  } catch (error) {
    console.error('Erro ao atualizar servidor:', error);
    throw error;
  }
};

// ========== DELETAR SERVIDOR ==========
const Deletar = async (id) => {
  try {
    const sql = `DELETE FROM servidores_ip WHERE id = ?`;

    const result = await query(sql, [id], 'run');

    return {
      id,
      changes: result.changes,
      success: result.changes > 0
    };

  } catch (error) {
    console.error('Erro ao deletar servidor:', error);
    throw error;
  }
};

export default { Listar, ListarPorUsuario, BuscarPorId, Inserir, Atualizar, Deletar };
