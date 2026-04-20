import repositoryMangaCadastros from "../repositories/repository.manga.cadastros.js";

// GET /api/manga-cadastros
const Listar = async (req, res) => {
  try {
    const rows = await repositoryMangaCadastros.Listar();
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("[MangaCadastros] Erro ao listar:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/manga-cadastros
// body: { id, fazenda, variedade, controle }
const Criar = async (req, res) => {
  try {
    const { id, fazenda, variedade, controle } = req.body;
    if (!id || !fazenda || !variedade || !controle) {
      return res.status(400).json({ success: false, error: "id, fazenda, variedade e controle são obrigatórios" });
    }
    const result = await repositoryMangaCadastros.Criar({ id, fazenda, variedade, controle });
    return res.status(201).json({ success: true, id: result.id });
  } catch (error) {
    console.error("[MangaCadastros] Erro ao criar:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /api/manga-cadastros/:id
const Deletar = async (req, res) => {
  try {
    const { id } = req.params;
    await repositoryMangaCadastros.Deletar(id);
    return res.json({ success: true });
  } catch (error) {
    console.error("[MangaCadastros] Erro ao deletar:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export default { Listar, Criar, Deletar };
