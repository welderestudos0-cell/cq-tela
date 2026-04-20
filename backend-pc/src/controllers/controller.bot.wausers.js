import repositoryWhatsappUsuario from "../repositories/repository.whatsapp.usuario.js";

const Listar = async (req, res) => {
  try {
    res.json(await repositoryWhatsappUsuario.Listar());
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const SalvarOuAtualizar = async (req, res) => {
  try {
    const { numero, nome, setor } = req.body;
    if (!numero || !nome || !setor) {
      return res.status(400).json({ error: "numero, nome e setor sao obrigatorios" });
    }
    res.json(await repositoryWhatsappUsuario.SalvarOuAtualizar({ numero, nome, setor }));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const Deletar = async (req, res) => {
  try {
    await repositoryWhatsappUsuario.DeletarPorNumero(req.params.numero);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

export default { Listar, SalvarOuAtualizar, Deletar };
