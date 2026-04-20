// backend/src/controllers/controller.kc.js
import serviceKC from "../services/service.kc.js";

// ========== INSERIR ÚNICO (vindo do sininho) ==========
const Inserir = async (req, res) => {
  try {
    console.log('📊 Controller KC: Recebendo registro único:', req.body);
    const data = req.body;

    if (!data || !data.talhao) {
      return res.status(400).json({ error: 'Dados inválidos: talhao é obrigatório' });
    }

    const resultado = await serviceKC.Inserir(data);
    console.log('✅ Controller KC: Registro salvo:', resultado);

    res.status(201).json({ success: true, message: 'KC salvo com sucesso', id: resultado.id });
  } catch (error) {
    console.error('❌ Controller KC: Erro ao inserir:', error);
    res.status(500).json({ error: 'Erro ao salvar KC', details: error.message });
  }
};

// ========== INSERIR BATCH DE KC ==========
const InserirBatch = async (req, res) => {
  try {
    console.log('📊 Controller KC: Recebendo batch:', req.body);

    const { registros } = req.body;

    if (!registros || !Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({
        error: "Lista de registros inválida ou vazia",
        expected: "Array de objetos com dados de KC",
      });
    }

    const resultado = await serviceKC.InserirBatch(registros);

    console.log('✅ Controller KC: Batch processado:', resultado);

    res.status(201).json({
      success: true,
      message: `${resultado.sucessos} KC(s) salvos com sucesso`,
      total: resultado.total,
      sucessos: resultado.sucessos,
      falhas: resultado.falhas,
      resultados: resultado.resultados,
    });
  } catch (error) {
    console.error('❌ Controller KC: Erro no batch:', error);
    res.status(500).json({ error: "Erro ao salvar KC", details: error.message });
  }
};

// ========== LISTAR KC ==========
const Listar = async (req, res) => {
  try {
    const filtros = {
      fazenda: req.query.fazenda,
      talhao: req.query.talhao,
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      limit: req.query.limit,
    };
    Object.keys(filtros).forEach((k) => { if (!filtros[k]) delete filtros[k]; });

    const resultado = await serviceKC.Listar(filtros);

    res.status(200).json({
      success: true,
      total: resultado.total,
      data: resultado.data,
      filtros: resultado.filtros,
    });
  } catch (error) {
    console.error('❌ Controller KC: Erro ao listar:', error);
    res.status(500).json({ error: "Erro ao listar KC", details: error.message });
  }
};

export default { Inserir, InserirBatch, Listar };
