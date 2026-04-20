import { gerarRelatorioPDF } from "../services/service.pdf.js";
import { enviarPDF, isConectado } from "../services/service.whatsapp.js";

const Disparar = async (req, res) => {
  try {
    const { data } = req.body;

    if (!isConectado()) {
      return res.status(503).json({
        error: "WhatsApp nao esta conectado",
        instrucao: "Verifique o terminal do servidor e escaneie o QR Code para conectar",
      });
    }

    const caminhoPDF = await gerarRelatorioPDF(data);

    const dataFormatada = data
      ? new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR")
      : new Date().toLocaleDateString("pt-BR");

    const legenda =
      `RELATORIO DE CONTROLE DE QUALIDADE\n` +
      `Data: ${dataFormatada}\n` +
      `Gerado em: ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}\n` +
      `_Sistema CQ Automatico_`;

    const resultados = await enviarPDF(caminhoPDF, legenda);

    const sucessos = resultados.filter((r) => r.status === "enviado").length;
    const falhas = resultados.filter((r) => r.status === "erro").length;

    return res.status(200).json({
      success: true,
      message: `Relatorio enviado: ${sucessos} sucesso(s), ${falhas} falha(s)`,
      data: dataFormatada,
      resultados,
    });
  } catch (error) {
    console.error("Controller Relatorio: erro ao disparar:", error);
    return res.status(500).json({
      error: "Erro ao gerar ou enviar relatorio",
      details: error.message,
    });
  }
};

const Status = async (req, res) => {
  return res.status(200).json({
    success: true,
    conectado: isConectado(),
    mensagem: isConectado()
      ? "WhatsApp conectado e pronto"
      : "WhatsApp desconectado - escaneie o QR Code no terminal",
  });
};

export default { Disparar, Status };
