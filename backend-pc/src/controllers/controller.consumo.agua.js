// backend/src/controllers/controller.consumo.agua.js
import serviceConsumoAgua from "../services/service.consumo.agua.js";

// ========== INSERIR CONSUMO DE ÁGUA ==========
const Inserir = async (req, res) => {
  try {
    console.log("🚰 Controller: Recebendo dados de consumo de água:", req.body);

    const {
      id,
      fazenda,
      talhao,
      usuario,
      cargo,
      matricula,
      tipo_lancamento,
      dia_lancamento,
      hidrometros,
      data_momento,
      timestamp,
    } = req.body;

    if (!fazenda || !usuario) {
      return res.status(400).json({
        error: "Campos obrigatórios não fornecidos",
        required: ["fazenda", "usuario"],
      });
    }

    const result = await serviceConsumoAgua.Inserir({
      id: id || Date.now(),
      fazenda,
      talhao: talhao || "Não informado",
      usuario,
      cargo: cargo || "",
      matricula: matricula || "",
      tipo_lancamento: tipo_lancamento || "",
      dia_lancamento: dia_lancamento || "",
      hidrometros,
      data_momento: data_momento || new Date().toISOString(),
      timestamp: timestamp || new Date().toISOString(),
    });

    console.log("✅ Consumo de água salvo com sucesso");
    return res.status(201).json({
      success: true,
      message: "Consumo de água registrado com sucesso",
      data: result,
    });
  } catch (error) {
    console.error("❌ Erro ao salvar consumo de água:", error);
    return res.status(500).json({
      error: "Erro ao salvar consumo de água",
      details: error.message,
    });
  }
};

// ========== LISTAR ==========
const Listar = async (req, res) => {
  try {
    const { fazenda, mes, tipo_lancamento } = req.query;
    const filtros = {};
    if (fazenda) filtros.fazenda = fazenda;
    if (mes) filtros.mes = mes;
    if (tipo_lancamento) filtros.tipo_lancamento = tipo_lancamento;
    const result = await serviceConsumoAgua.Listar(filtros);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao listar consumo de água", details: error.message });
  }
};

// ========== ATUALIZAR (leitura final) ==========
const Atualizar = async (req, res) => {
  try {
    const { consumo_id } = req.params;
    if (!consumo_id) {
      return res.status(400).json({ error: "consumo_id é obrigatório" });
    }
    const result = await serviceConsumoAgua.Atualizar(consumo_id, req.body);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("❌ Erro ao atualizar consumo de água:", error);
    return res.status(500).json({ error: "Erro ao atualizar consumo de água", details: error.message });
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await serviceConsumoAgua.BuscarPorId(id);
    if (!result) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar consumo de água", details: error.message });
  }
};

export default { Inserir, Atualizar, Listar, BuscarPorId };
