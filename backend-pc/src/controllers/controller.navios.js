import repository from "../repositories/repository.navios.js";

const Listar = async (req, res) => {
  try {
    const data = await repository.Listar();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const Criar = async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ error: "Nome do navio é obrigatório" });
    }
    const item = await repository.Criar({ nome });
    res.status(201).json(item);
  } catch (err) {
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

export default { Listar, Criar, Deletar };
