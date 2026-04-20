// backend/src/controllers/controller.monitoramento.limpeza.js--
import serviceMonitoramentoLimpeza from "../services/service.monitoramento.limpeza.js";

// ========== INSERIR MONITORAMENTO DE LIMPEZA ==========
const Inserir = async (req, res) => {
  try {
    console.log('📊 Controller: Recebendo dados de limpeza:', req.body);

    // Extrai os dados do corpo da requisição
    const {
      fazenda,
      talhao,
      usuario,
      momento,
      gps,
      tipo_limpeza,
      matricula,
      id,
      timestamp
    } = req.body;

    // Validação básica dos campos obrigatórios
    if (!fazenda || !talhao || !usuario || !tipo_limpeza) {
      return res.status(400).json({ 
        error: "Campos obrigatórios não fornecidos",
        required: ["fazenda", "talhao", "usuario", "tipo_limpeza"],
        received: { fazenda: !!fazenda, talhao: !!talhao, usuario: !!usuario, tipo_limpeza: !!tipo_limpeza }
      });
    }

    // Validar tipo de limpeza
    const tiposValidos = ['quimica', 'arraste', 'manutencao'];
    if (!tiposValidos.includes(tipo_limpeza)) {
      return res.status(400).json({ 
        error: "Tipo de limpeza inválido",
        tiposValidos: tiposValidos,
        recebido: tipo_limpeza
      });
    }

    // Preparar dados para o service
    const dadosLimpeza = {
      fazenda,
      talhao,
      usuario,
      momento: momento || timestamp,
      gps,
      tipo_limpeza,
      matricula,
      id,
      timestamp
    };

    console.log('📤 Controller: Enviando para service:', dadosLimpeza);

    // Chama o serviço para inserir no banco
    const resultado = await serviceMonitoramentoLimpeza.Inserir(dadosLimpeza, req);

    console.log('✅ Controller: Limpeza inserida com sucesso:', resultado);

    // Retorna sucesso
    res.status(201).json({
      success: true,
      message: "Monitoramento de limpeza registrado com sucesso",
      id: resultado.id,
      data: resultado.data
    });

  } catch (error) {
    console.error("❌ Controller: Erro ao registrar limpeza:", error);
    
    // Tratar diferentes tipos de erro
    if (error.message.includes('GPS')) {
      return res.status(400).json({ 
        error: "Erro de GPS", 
        details: error.message 
      });
    }
    
    if (error.message.includes('obrigatório')) {
      return res.status(400).json({ 
        error: "Dados obrigatórios não fornecidos", 
        details: error.message 
      });
    }

    res.status(500).json({ 
      error: "Erro interno ao registrar monitoramento de limpeza",
      details: error.message
    });
  }
};

// ========== INSERIR BATCH DE LIMPEZAS ==========
const InserirBatch = async (req, res) => {
  try {
    console.log('📊 Controller: Recebendo batch de limpezas:', req.body);

    const { registros } = req.body;

    // Validação básica
    if (!registros || !Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ 
        error: "Lista de registros inválida ou vazia",
        expected: "Array de objetos com dados de limpeza"
      });
    }

    console.log(`📤 Controller: Processando batch de ${registros.length} registros`);

    // Chama o serviço para inserir batch
    const resultado = await serviceMonitoramentoLimpeza.InserirBatch(registros, req);

    console.log('✅ Controller: Batch de limpeza processado:', resultado);

    // Retorna resultado do batch
    res.status(201).json({
      success: true,
      message: `Batch processado: ${resultado.sucessos} sucessos, ${resultado.falhas} falhas`,
      total: resultado.total,
      sucessos: resultado.sucessos,
      falhas: resultado.falhas,
      registrosComGPSValido: resultado.registrosComGPSValido,
      registrosRejeitadosGPS: resultado.registrosRejeitadosGPS,
      errosValidacao: resultado.errosValidacao,
      detalhes: resultado.detalhes
    });

  } catch (error) {
    console.error("❌ Controller: Erro no batch de limpeza:", error);
    
    res.status(500).json({ 
      error: "Erro interno ao processar batch de limpezas",
      details: error.message
    });
  }
};

// ========== LISTAR MONITORAMENTOS DE LIMPEZA ==========
const Listar = async (req, res) => {
  try {
    console.log('📊 Controller: Listando limpezas com query params:', req.query);

    // Extrair filtros da query string
    const filtros = {
      fazenda: req.query.fazenda,
      talhao: req.query.talhao,
      usuario: req.query.usuario,
      tipo_limpeza: req.query.tipo_limpeza,
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      limit: req.query.limit
    };

    // Remover filtros vazios
    Object.keys(filtros).forEach(key => {
      if (!filtros[key]) delete filtros[key];
    });

    console.log('📤 Controller: Enviando filtros para service:', filtros);

    // Chama o serviço para listar
    const resultado = await serviceMonitoramentoLimpeza.Listar(filtros);

    console.log('✅ Controller: Listagem concluída:', resultado.total, 'registros');

    // Retorna lista
    res.status(200).json({
      success: true,
      message: `${resultado.total} registros de limpeza encontrados`,
      total: resultado.total,
      filtros: resultado.filtros,
      data: resultado.data
    });

  } catch (error) {
    console.error("❌ Controller: Erro ao listar limpezas:", error);
    
    res.status(500).json({ 
      error: "Erro interno ao listar monitoramentos de limpeza",
      details: error.message
    });
  }
};

export default { 
  Inserir,
  InserirBatch,
  Listar
};