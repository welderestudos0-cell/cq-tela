// backend/src/services/service.permissoes.js
import repositoryPermissoes from "../repositories/repository.permissoes.js";

const MODULOS_VALIDOS = [...repositoryPermissoes.MODULOS_ADMIN]; // inclui auditoria_luciano

const ListarUsuarios = async () => repositoryPermissoes.ListarUsuarios();

const AtualizarModulos = async (id_user, modulos) => {
  if (!id_user) throw new Error('ID do usuário é obrigatório');
  if (!Array.isArray(modulos)) throw new Error('Módulos deve ser um array');
  const invalidos = modulos.filter(m => !MODULOS_VALIDOS.includes(m));
  if (invalidos.length > 0) throw new Error(`Módulos inválidos: ${invalidos.join(', ')}`);
  return repositoryPermissoes.AtualizarModulos(id_user, modulos);
};

const BuscarModulos = async (id_user) => repositoryPermissoes.BuscarModulos(id_user);

const CriarUsuario = async (dados) => {
  if (!dados.nome || !dados.senha) throw new Error('Nome e senha são obrigatórios');
  return repositoryPermissoes.CriarUsuario(dados);
};

const AlterarSenha = async (id_user, novaSenha) => {
  if (!novaSenha || novaSenha.length < 4) throw new Error('Senha deve ter ao menos 4 caracteres');
  return repositoryPermissoes.AlterarSenha(id_user, novaSenha);
};

const DeletarUsuario = async (id_user) => repositoryPermissoes.DeletarUsuario(id_user);

const ToggleAtivo = async (id_user) => repositoryPermissoes.ToggleAtivo(id_user);

const AtualizarNivelAcesso = async (id_user, nivel_acesso) => {
  const validos = ['usuario', 'coordenador', 'gerente', 'admin'];
  if (!validos.includes(nivel_acesso)) throw new Error(`Nível inválido. Use: ${validos.join(', ')}`);
  return repositoryPermissoes.AtualizarNivelAcesso(id_user, nivel_acesso);
};

export default { ListarUsuarios, AtualizarModulos, BuscarModulos, CriarUsuario, AlterarSenha, DeletarUsuario, ToggleAtivo, AtualizarNivelAcesso, MODULOS_VALIDOS };
