import repositoryBotMensagens from "../repositories/repository.bot.mensagens.js";
import { recarregarMensagens } from "../services/service.whatsapp.js";

const reload = async () => { try { await recarregarMensagens(); } catch {} };

const Listar = async (req, res) => {
  try { res.json(await repositoryBotMensagens.Listar()); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

const Criar = async (req, res) => {
  try {
    const { chave, titulo, descricao, modulo, conteudo } = req.body;
    if (!chave || !titulo || !conteudo) return res.status(400).json({ error: "chave, titulo e conteudo sao obrigatorios" });
    const nova = await repositoryBotMensagens.Criar({ chave, titulo, descricao, modulo, conteudo });
    await reload();
    res.status(201).json(nova);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const Atualizar = async (req, res) => {
  try {
    const { chave } = req.params;
    const { conteudo } = req.body;
    if (conteudo === undefined) return res.status(400).json({ error: "conteudo e obrigatorio" });
    const atualizado = await repositoryBotMensagens.Atualizar({ chave, conteudo });
    if (!atualizado) return res.status(404).json({ error: "Mensagem nao encontrada" });
    await reload();
    res.json(atualizado);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const Resetar = async (req, res) => {
  try {
    const resetado = await repositoryBotMensagens.Resetar(req.params.chave);
    if (!resetado) return res.status(404).json({ error: "Mensagem nao encontrada" });
    await reload();
    res.json(resetado);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const Deletar = async (req, res) => {
  try {
    await repositoryBotMensagens.Deletar(req.params.chave);
    await reload();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

export default { Listar, Criar, Atualizar, Resetar, Deletar };
