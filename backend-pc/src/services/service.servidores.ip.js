// backend/src/services/service.servidores.ip.js
import repositoryServidoresIp from "../repositories/repository.servidores.ip.js";

// ========== LISTAR SERVIDORES DO USUARIO (CELULAR CHAMA ESSE) ==========
const ListarPorUsuario = async (id_user) => {
  try {
    const servidores = await repositoryServidoresIp.ListarPorUsuario(id_user);

    return {
      success: true,
      data: servidores,
      total: servidores.length
    };

  } catch (error) {
    console.error('Service: Erro ao listar servidores do usuario:', error);
    throw error;
  }
};

// ========== LISTAR TODOS (ADMIN) ==========
const Listar = async () => {
  try {
    const servidores = await repositoryServidoresIp.Listar();

    return {
      success: true,
      data: servidores,
      total: servidores.length
    };

  } catch (error) {
    console.error('Service: Erro ao listar servidores:', error);
    throw error;
  }
};

// ========== INSERIR SERVIDOR PRA UM USUARIO ==========
const Inserir = async (id_user, nome_servidor, ip_endereco, ip_fixo) => {
  try {
    if (!id_user || !nome_servidor || !ip_endereco) {
      throw new Error('id_user, nome_servidor e ip_endereco sao obrigatorios');
    }

    const resultado = await repositoryServidoresIp.Inserir(id_user, nome_servidor, ip_endereco, ip_fixo);

    return {
      success: true,
      id: resultado.id,
      message: 'Servidor cadastrado para o usuario'
    };

  } catch (error) {
    console.error('Service: Erro ao inserir servidor:', error);
    throw error;
  }
};

// ========== ATUALIZAR SERVIDOR ==========
const Atualizar = async (id, dados) => {
  try {
    const existe = await repositoryServidoresIp.BuscarPorId(id);
    if (!existe) {
      throw new Error('Servidor nao encontrado');
    }

    const resultado = await repositoryServidoresIp.Atualizar(id, dados);

    return {
      success: true,
      id: id,
      message: 'Servidor atualizado com sucesso'
    };

  } catch (error) {
    console.error('Service: Erro ao atualizar servidor:', error);
    throw error;
  }
};

// ========== DELETAR SERVIDOR ==========
const Deletar = async (id) => {
  try {
    const existe = await repositoryServidoresIp.BuscarPorId(id);
    if (!existe) {
      throw new Error('Servidor nao encontrado');
    }

    await repositoryServidoresIp.Deletar(id);

    return {
      success: true,
      message: 'Servidor deletado com sucesso'
    };

  } catch (error) {
    console.error('Service: Erro ao deletar servidor:', error);
    throw error;
  }
};

export default { Listar, ListarPorUsuario, Inserir, Atualizar, Deletar };
