// backend/src/controllers/controller.servidores.ip.js
import serviceServidoresIp from "../services/service.servidores.ip.js";

// ========== LISTAR SERVIDORES DO USUARIO (CELULAR CHAMA ESSE) ==========
const ListarPorUsuario = async (req, res) => {
  try {
    const { id_user } = req.params;

    if (!id_user || isNaN(id_user)) {
      return res.status(400).json({ error: "id_user invalido" });
    }

    const resultado = await serviceServidoresIp.ListarPorUsuario(parseInt(id_user));

    res.status(200).json({
      message: "Servidores do usuario listados",
      total: resultado.total,
      data: resultado.data
    });

  } catch (error) {
    console.error('Controller: Erro ao listar servidores do usuario:', error);
    res.status(500).json({
      error: "Erro interno ao listar servidores",
      details: error.message
    });
  }
};

// ========== LISTAR TODOS (VER TODOS OS USUARIOS E SEUS IPS) ==========
const Listar = async (req, res) => {
  try {
    const resultado = await serviceServidoresIp.Listar();

    res.status(200).json({
      message: "Todos os servidores listados",
      total: resultado.total,
      data: resultado.data
    });

  } catch (error) {
    console.error('Controller: Erro ao listar servidores:', error);
    res.status(500).json({
      error: "Erro interno ao listar servidores",
      details: error.message
    });
  }
};

// ========== INSERIR SERVIDOR PRA UM USUARIO ==========
const Inserir = async (req, res) => {
  try {
    const { id_user, nome_servidor, ip_endereco, ip_fixo } = req.body;

    if (!id_user || !nome_servidor || !ip_endereco) {
      return res.status(400).json({
        error: "id_user, nome_servidor e ip_endereco sao obrigatorios"
      });
    }

    const resultado = await serviceServidoresIp.Inserir(id_user, nome_servidor, ip_endereco, ip_fixo);

    res.status(201).json({
      message: "Servidor cadastrado para o usuario",
      id: resultado.id
    });

  } catch (error) {
    console.error('Controller: Erro ao inserir servidor:', error);
    res.status(500).json({
      error: "Erro interno ao cadastrar servidor",
      details: error.message
    });
  }
};

// ========== ATUALIZAR SERVIDOR ==========
const Atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nome_servidor, ip_endereco, ip_fixo } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "ID invalido" });
    }

    // Monta objeto so com os campos enviados
    const dados = {};
    if (nome_servidor !== undefined) dados.nome_servidor = nome_servidor;
    if (ip_endereco !== undefined) dados.ip_endereco = ip_endereco;
    if (ip_fixo !== undefined) dados.ip_fixo = ip_fixo;

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({
        error: "Informe pelo menos um campo para atualizar"
      });
    }

    const resultado = await serviceServidoresIp.Atualizar(parseInt(id), dados);

    res.status(200).json({
      message: "Servidor atualizado com sucesso",
      id: resultado.id
    });

  } catch (error) {
    console.error('Controller: Erro ao atualizar servidor:', error);

    if (error.message === 'Servidor nao encontrado') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: "Erro interno ao atualizar servidor",
      details: error.message
    });
  }
};

// ========== DELETAR SERVIDOR ==========
const Deletar = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "ID invalido" });
    }

    await serviceServidoresIp.Deletar(parseInt(id));

    res.status(200).json({
      message: "Servidor deletado com sucesso"
    });

  } catch (error) {
    console.error('Controller: Erro ao deletar servidor:', error);

    if (error.message === 'Servidor nao encontrado') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: "Erro interno ao deletar servidor",
      details: error.message
    });
  }
};

export default { Listar, ListarPorUsuario, Inserir, Atualizar, Deletar };
