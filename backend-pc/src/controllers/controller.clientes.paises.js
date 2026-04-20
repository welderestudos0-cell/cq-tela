import repository from "../repositories/repository.clientes.paises.js";

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
    const { cliente, pais } = req.body;
    if (!cliente || !pais) return res.status(400).json({ error: "cliente e pais são obrigatórios" });
    const item = await repository.Criar({ cliente, pais });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const Atualizar = async (req, res) => {
  try {
    const { cliente, pais } = req.body;
    if (!cliente || !pais) return res.status(400).json({ error: "cliente e pais são obrigatórios" });
    const item = await repository.Atualizar(req.params.id, { cliente, pais });
    if (!item) return res.status(404).json({ error: "Não encontrado" });
    res.json(item);
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

export default { Listar, BuscarPorId, Criar, Atualizar, Deletar };
