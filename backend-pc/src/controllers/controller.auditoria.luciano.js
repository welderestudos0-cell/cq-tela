// backend/src/controllers/controller.auditoria.luciano.js
import serviceAuditoria from "../services/service.auditoria.luciano.js";

const Inserir = async (req, res) => {
  try {
    const resultado = await serviceAuditoria.Inserir(req.body);
    res.status(201).json({ success: true, id: resultado.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const Listar = async (req, res) => {
  try {
    const dados = await serviceAuditoria.Listar();
    res.status(200).json({ success: true, total: dados.length, data: dados });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const BuscarPorId = async (req, res) => {
  try {
    const dado = await serviceAuditoria.BuscarPorId(req.params.id);
    if (!dado) return res.status(404).json({ error: 'Registro não encontrado' });
    res.status(200).json({ success: true, data: dado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const AtualizarPergunta = async (req, res) => {
  try {
    const { form_id, pergunta_id } = req.params;
    const { status, observacao } = req.body;
    await serviceAuditoria.AtualizarPergunta(form_id, pergunta_id, status ?? '', observacao ?? '');
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const DeletarPorFormId = async (req, res) => {
  try {
    const result = await serviceAuditoria.DeletarPorFormId(req.params.form_id);
    if (!result || result.changes === 0) {
      return res.status(404).json({ error: 'Nenhum registro encontrado com esse form_id' });
    }
    res.status(200).json({ success: true, deletados: result.changes });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const RemoverFotoUrl = async (req, res) => {
  try {
    await serviceAuditoria.RemoverFotoUrl(req.params.form_id, req.params.pergunta_id);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export default { Inserir, Listar, BuscarPorId, AtualizarPergunta, DeletarPorFormId, RemoverFotoUrl };
