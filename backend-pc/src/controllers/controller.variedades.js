import repository from "../repositories/repository.variedades.js";

const Listar = async (req, res) => {
  try {
    const data = await repository.Listar();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const BuscarPorId = async (req, res) => {
  try {
    const item = await repository.BuscarPorId(req.params.id);
    if (!item) return res.status(404).json({ error: "Não encontrado" });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const Criar = async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ error: "nome é obrigatório" });
    const item = await repository.Criar({ nome });
    res.status(201).json(item);
  } catch (err) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({ error: "Variedade já existe" });
    }
    res.status(500).json({ error: err.message });
  }
};

const Atualizar = async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ error: "nome é obrigatório" });
    const item = await repository.Atualizar(req.params.id, { nome });
    if (!item) return res.status(404).json({ error: "Não encontrado" });
    res.json(item);
  } catch (err) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({ error: "Variedade já existe" });
    }
    res.status(500).json({ error: err.message });
  }
};

const Deletar = async (req, res) => {
  try {
    await repository.Deletar(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { Listar, BuscarPorId, Criar, Atualizar, Deletar };
