// backend/src/services/service.auditoria.luciano.js
import repositoryAuditoria from "../repositories/repository.auditoria.luciano.js";

const Inserir = async (dados) => {
  if (!dados.fazenda || !dados.usuario) throw new Error('Fazenda e usuário são obrigatórios');
  if (!Array.isArray(dados.checklist)) throw new Error('Checklist deve ser um array');
  return repositoryAuditoria.Inserir(dados);
};

const Listar = async () => repositoryAuditoria.Listar();

const BuscarPorId = async (id) => repositoryAuditoria.BuscarPorId(id);

const AtualizarPergunta = async (form_id, pergunta_id, status, observacao) => {
  if (!form_id || pergunta_id === undefined) throw new Error('form_id e pergunta_id são obrigatórios');
  return repositoryAuditoria.AtualizarPergunta(form_id, pergunta_id, status, observacao);
};

const DeletarPorFormId = async (form_id) => {
  if (!form_id) throw new Error('form_id é obrigatório');
  return repositoryAuditoria.DeletarPorFormId(form_id);
};

const RemoverFotoUrl = async (form_id, pergunta_id) => {
  if (!form_id || !pergunta_id) throw new Error('form_id e pergunta_id são obrigatórios');
  return repositoryAuditoria.RemoverFotoUrl(form_id, pergunta_id);
};

export default { Inserir, Listar, BuscarPorId, AtualizarPergunta, DeletarPorFormId, RemoverFotoUrl };
