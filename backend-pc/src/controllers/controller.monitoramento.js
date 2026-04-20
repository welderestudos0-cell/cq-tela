// backend\src\controllers\controller.monitoramento.js--
import serviceMonitoramento from "../services/service.monitoramento.js";
import jwt from "../token.js";

const Inserir = async (req, res) => {
  try {
    // Extrai os dados do corpo da requisição
    const {
      fazenda,
      talhao,
      usuario,
      momento,
      gps,
      zero_a_trinta_cm,
      trinta_a_sessenta_cm,
      possui_minhoca,
      possui_enraizamento
    } = req.body;

    // Validação básica dos campos obrigatórios
    if (!fazenda || !talhao || !usuario || !zero_a_trinta_cm || !trinta_a_sessenta_cm) {
      return res.status(400).json({ error: "Todos os campos obrigatórios devem ser preenchidos" });
    }

    // Chama o serviço para inserir no banco
    const resultado = await serviceMonitoramento.Inserir({
      fazenda,
      talhao,
      usuario,
      momento,
      gps,
      zero_a_trinta_cm,
      trinta_a_sessenta_cm,
      possui_minhoca,
      possui_enraizamento
    });

    // Retorna sucesso
    res.status(201).json({
      message: "Monitoramento registrado com sucesso",
      id: resultado.id
    });

  } catch (error) {
    console.error("Erro no controller de monitoramento:", error);
    res.status(500).json({ error: "Erro interno ao registrar monitoramento" });
  }
};

export default { Inserir };