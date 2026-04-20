import repositoryBotFluxos from "../repositories/repository.bot.fluxos.js";
import { recarregarFluxos } from "../services/service.whatsapp.js";

const reload = async () => {
  try { await recarregarFluxos(); } catch {}
};

const ListarFluxos = async (req, res) => {
  try {
    const fluxos = await repositoryBotFluxos.ListarFluxos();
    for (const f of fluxos) {
      const etapas = await repositoryBotFluxos.ListarEtapasPorFluxo(f.id);
      f.total_etapas = etapas.length;
    }
    res.json(fluxos);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const BuscarFluxo = async (req, res) => {
  try {
    const fluxo = await repositoryBotFluxos.BuscarFluxoPorId(req.params.id);
    if (!fluxo) return res.status(404).json({ error: "Fluxo nao encontrado" });
    const etapas = await repositoryBotFluxos.ListarEtapasPorFluxo(req.params.id);
    res.json({ ...fluxo, etapas });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const CriarFluxo = async (req, res) => {
  try {
    const { nome, descricao, gatilho_palavras } = req.body;
    if (!nome) return res.status(400).json({ error: "nome e obrigatorio" });
    const novo = await repositoryBotFluxos.CriarFluxo({ nome, descricao, gatilho_palavras });
    await reload();
    res.status(201).json(novo);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const AtualizarFluxo = async (req, res) => {
  try {
    const atualizado = await repositoryBotFluxos.AtualizarFluxo(req.params.id, req.body);
    await reload();
    res.json(atualizado);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const DeletarFluxo = async (req, res) => {
  try {
    await repositoryBotFluxos.DeletarFluxo(req.params.id);
    await reload();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const CriarEtapa = async (req, res) => {
  try {
    const nova = await repositoryBotFluxos.CriarEtapa(req.params.id, req.body);
    await reload();
    res.status(201).json(nova);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const AtualizarEtapa = async (req, res) => {
  try {
    const atualizada = await repositoryBotFluxos.AtualizarEtapa(req.params.etapa_id, req.body);
    await reload();
    res.json(atualizada);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const DeletarEtapa = async (req, res) => {
  try {
    await repositoryBotFluxos.DeletarEtapa(req.params.etapa_id);
    await reload();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

export default { ListarFluxos, BuscarFluxo, CriarFluxo, AtualizarFluxo, DeletarFluxo, CriarEtapa, AtualizarEtapa, DeletarEtapa };
