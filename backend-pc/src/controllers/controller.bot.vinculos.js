import repositoryBotVinculos from "../repositories/repository.bot.vinculos.js";
import { recarregarVinculos } from "../services/service.whatsapp.js";

const reload = async () => {
  try {
    await recarregarVinculos();
  } catch {}
};

const responderErro = (res, error) => {
  if (String(error?.message || "").includes("UNIQUE constraint failed")) {
    return res.status(409).json({
      error: "Ja existe um vinculo para esse destino. Edite o atual ou apague antes.",
    });
  }

  return res.status(500).json({ error: error.message });
};

const Listar = async (req, res) => {
  try {
    const vinculos = await repositoryBotVinculos.Listar();
    res.json(vinculos);
  } catch (error) {
    responderErro(res, error);
  }
};

const Criar = async (req, res) => {
  try {
    const { fluxo_id, tipo, valor, observacao, ativo } = req.body;
    if (!fluxo_id || !tipo) {
      return res.status(400).json({ error: "fluxo_id e tipo sao obrigatorios" });
    }

    const vinculo = await repositoryBotVinculos.Criar({
      fluxo_id,
      tipo,
      valor,
      observacao,
      ativo,
    });

    await reload();
    res.status(201).json(vinculo);
  } catch (error) {
    responderErro(res, error);
  }
};

const Atualizar = async (req, res) => {
  try {
    const vinculo = await repositoryBotVinculos.Atualizar(req.params.id, req.body);
    if (!vinculo) {
      return res.status(404).json({ error: "Vinculo nao encontrado" });
    }

    await reload();
    res.json(vinculo);
  } catch (error) {
    responderErro(res, error);
  }
};

const Deletar = async (req, res) => {
  try {
    await repositoryBotVinculos.Deletar(req.params.id);
    await reload();
    res.json({ ok: true });
  } catch (error) {
    responderErro(res, error);
  }
};

export default {
  Listar,
  Criar,
  Atualizar,
  Deletar,
};
