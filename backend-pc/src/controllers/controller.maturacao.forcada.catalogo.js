import repositoryMaturacaoForcadaCatalogo from "../repositories/repository.maturacao.forcada.catalogo.js";

const Listar = async (req, res) => {
  try {
    const filtros = {
      comprador: req.query.comprador,
      produtor: req.query.produtor,
      parcela: req.query.parcela,
      limit: req.query.limit,
    };

    Object.keys(filtros).forEach((key) => {
      if (filtros[key] === undefined || filtros[key] === null || filtros[key] === "") {
        delete filtros[key];
      }
    });

    const dados = await repositoryMaturacaoForcadaCatalogo.Listar(filtros);

    return res.status(200).json({
      success: true,
      total: dados.length,
      data: dados,
    });
  } catch (error) {
    console.error("Erro ao listar catalogo de maturacao forcada:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao listar catalogo de maturacao forcada",
      details: error.message,
    });
  }
};

const ListarCompradores = async (req, res) => {
  try {
    const dados = await repositoryMaturacaoForcadaCatalogo.ListarCompradores();
    return res.status(200).json({ success: true, total: dados.length, data: dados });
  } catch (error) {
    console.error("Erro ao listar compradores:", error);
    return res.status(500).json({ success: false, error: "Erro interno ao listar compradores", details: error.message });
  }
};

const ListarProdutores = async (req, res) => {
  try {
    const dados = await repositoryMaturacaoForcadaCatalogo.ListarProdutores(req.query.comprador || null);
    return res.status(200).json({ success: true, total: dados.length, data: dados });
  } catch (error) {
    console.error("Erro ao listar produtores:", error);
    return res.status(500).json({ success: false, error: "Erro interno ao listar produtores", details: error.message });
  }
};

const ListarParcelas = async (req, res) => {
  try {
    const dados = await repositoryMaturacaoForcadaCatalogo.ListarParcelas({
      comprador: req.query.comprador || null,
      produtor: req.query.produtor || null,
    });
    return res.status(200).json({ success: true, total: dados.length, data: dados });
  } catch (error) {
    console.error("Erro ao listar parcelas:", error);
    return res.status(500).json({ success: false, error: "Erro interno ao listar parcelas", details: error.message });
  }
};

export default {
  Listar,
  ListarCompradores,
  ListarProdutores,
  ListarParcelas,
};
