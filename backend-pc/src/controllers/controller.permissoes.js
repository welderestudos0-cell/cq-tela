// backend/src/controllers/controller.permissoes.js
import servicePermissoes from "../services/service.permissoes.js";

const ListarUsuarios = async (req, res) => {
  try {
    const usuarios = await servicePermissoes.ListarUsuarios();
    res.status(200).json({ success: true, total: usuarios.length, data: usuarios });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar usuários', details: error.message });
  }
};

const AtualizarModulos = async (req, res) => {
  try {
    const { id } = req.params;
    const { modulos } = req.body;
    if (!modulos) return res.status(400).json({ error: 'Campo "modulos" é obrigatório' });
    const resultado = await servicePermissoes.AtualizarModulos(id, modulos);
    res.status(200).json({ success: true, message: 'Módulos atualizados com sucesso', changes: resultado.changes });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const BuscarMeusModulos = async (req, res) => {
  try {
    const { id } = req.params;
    const modulos = await servicePermissoes.BuscarModulos(id);
    res.status(200).json({ success: true, modulos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const CriarUsuario = async (req, res) => {
  try {
    const { nome, email, senha, cargo, fazenda, matricula } = req.body;
    const resultado = await servicePermissoes.CriarUsuario({ nome, email, senha, cargo, fazenda, matricula });
    res.status(201).json({ success: true, id: resultado.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const AlterarSenha = async (req, res) => {
  try {
    const { id } = req.params;
    const { novaSenha } = req.body;
    if (!novaSenha) return res.status(400).json({ error: 'novaSenha é obrigatório' });
    await servicePermissoes.AlterarSenha(id, novaSenha);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const DeletarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    await servicePermissoes.DeletarUsuario(id);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const ToggleAtivo = async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await servicePermissoes.ToggleAtivo(id);
    res.status(200).json({ success: true, ativo: resultado.ativo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const AtualizarNivelAcesso = async (req, res) => {
  try {
    const { id } = req.params;
    const { nivel_acesso } = req.body;
    if (!nivel_acesso) return res.status(400).json({ error: 'nivel_acesso é obrigatório' });
    await servicePermissoes.AtualizarNivelAcesso(id, nivel_acesso);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export default { ListarUsuarios, AtualizarModulos, BuscarMeusModulos, CriarUsuario, AlterarSenha, DeletarUsuario, ToggleAtivo, AtualizarNivelAcesso };
