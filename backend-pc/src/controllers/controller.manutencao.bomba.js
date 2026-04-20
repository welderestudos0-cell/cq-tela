// backend/src/controllers/controller.manutencao.bomba.js
import serviceManutencaoBomba from "../services/service.manutencao.bomba.js";

// ========== INSERIR MANUTENÇÃO DE BOMBA ==========
const Inserir = async (req, res) => {
  try {
    console.log('🔧 Controller: Recebendo dados de manutenção de bomba:', req.body);

    // Extrai os dados do corpo da requisição
    const {
      id,
      fazenda,
      bomba,
      equipamento,
      usuario,
      matricula,
      momento,
      manutencoes,
      timestamp
    } = req.body;

    // Validação básica dos campos obrigatórios
    if (!fazenda || !bomba || !usuario || !manutencoes) {
      return res.status(400).json({ 
        error: "Campos obrigatórios não fornecidos",
        required: ["fazenda", "bomba", "usuario", "manutencoes"],
        received: { 
          fazenda: !!fazenda, 
          bomba: !!bomba, 
          usuario: !!usuario, 
          manutencoes: !!manutencoes 
        }
      });
    }

    // Preparar dados para o service
    const dadosManutencao = {
      id,
      fazenda,
      bomba,
      equipamento,
      usuario,
      matricula,
      momento: momento || timestamp,
      manutencoes,
      timestamp
    };

    console.log('📤 Controller: Enviando para service:', dadosManutencao);

    // Chama o serviço para inserir no banco
    const resultado = await serviceManutencaoBomba.Inserir(dadosManutencao, req);

    console.log('✅ Controller: Manutenção de bomba inserida com sucesso:', resultado);

    // Retorna sucesso
    res.status(201).json({
      success: true,
      message: "Manutenção de bomba registrada com sucesso",
      id: resultado.id,
      data: resultado.data
    });

  } catch (error) {
    console.error("❌ Controller: Erro ao registrar manutenção de bomba:", error);
    
    if (error.message.includes('obrigatório')) {
      return res.status(400).json({ 
        error: "Dados obrigatórios não fornecidos", 
        details: error.message 
      });
    }

    res.status(500).json({ 
      error: "Erro interno ao registrar manutenção de bomba",
      details: error.message
    });
  }
};

// ========== INSERIR BATCH DE MANUTENÇÕES ==========
const InserirBatch = async (req, res) => {
  try {
    console.log('🔧 Controller: Recebendo batch de manutenções de bomba:', req.body);

    const { registros } = req.body;

    // Validação básica
    if (!registros || !Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ 
        error: "Lista de registros inválida ou vazia",
        expected: "Array de objetos com dados de manutenção de bomba"
      });
    }

    console.log(`📤 Controller: Processando batch de ${registros.length} registros`);

    // Chama o serviço para inserir batch
    const resultado = await serviceManutencaoBomba.InserirBatch(registros, req);

    console.log('✅ Controller: Batch de manutenção de bomba processado:', resultado);

    // Retorna resultado do batch
    res.status(201).json({
      success: true,
      message: `Batch processado: ${resultado.sucessos} sucessos, ${resultado.falhas} falhas`,
      total: resultado.total,
      sucessos: resultado.sucessos,
      falhas: resultado.falhas,
      errosValidacao: resultado.errosValidacao,
      detalhes: resultado.detalhes
    });

  } catch (error) {
    console.error("❌ Controller: Erro no batch de manutenção de bomba:", error);
    
    res.status(500).json({ 
      error: "Erro interno ao processar batch de manutenções de bomba",
      details: error.message
    });
  }
};

// ========== LISTAR MANUTENÇÕES DE BOMBA ==========
const Listar = async (req, res) => {
  try {
    console.log('🔧 Controller: Listando manutenções de bomba com query params:', req.query);

    // Extrair filtros da query string
    const filtros = {
      fazenda: req.query.fazenda,
      bomba: req.query.bomba,
      equipamento: req.query.equipamento,
      usuario: req.query.usuario,
      matricula: req.query.matricula,
      manutencoes: req.query.manutencoes,
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
    const resultado = await serviceManutencaoBomba.Listar(filtros);

    console.log('✅ Controller: Listagem concluída:', resultado.total, 'registros');

    // Retorna lista
    res.status(200).json({
      success: true,
      message: `${resultado.total} registros de manutenção de bomba encontrados`,
      total: resultado.total,
      filtros: resultado.filtros,
      data: resultado.data
    });

  } catch (error) {
    console.error("❌ Controller: Erro ao listar manutenções de bomba:", error);
    
    res.status(500).json({ 
      error: "Erro interno ao listar manutenções de bomba",
      details: error.message
    });
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🔧 Controller: Buscando manutenção de bomba por ID:', id);

    if (!id) {
      return res.status(400).json({ 
        error: "ID não fornecido"
      });
    }

    const resultado = await serviceManutencaoBomba.BuscarPorId(id);

    if (!resultado) {
      return res.status(404).json({ 
        error: "Manutenção de bomba não encontrada",
        id: id
      });
    }

    console.log('✅ Controller: Manutenção encontrada:', resultado);

    res.status(200).json({
      success: true,
      data: resultado
    });

  } catch (error) {
    console.error("❌ Controller: Erro ao buscar manutenção de bomba:", error);
    
    res.status(500).json({ 
      error: "Erro interno ao buscar manutenção de bomba",
      details: error.message
    });
  }
};

// ========== DELETAR MANUTENÇÃO DE BOMBA ==========
const Deletar = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🔧 Controller: Deletando manutenção de bomba por ID:', id);

    if (!id) {
      return res.status(400).json({ 
        error: "ID não fornecido"
      });
    }

    const resultado = await serviceManutencaoBomba.Deletar(id);

    if (!resultado.success) {
      return res.status(404).json({ 
        error: "Manutenção de bomba não encontrada para deletar",
        id: id
      });
    }

    console.log('✅ Controller: Manutenção deletada:', resultado);

    res.status(200).json({
      success: true,
      message: "Manutenção de bomba deletada com sucesso",
      id: id
    });

  } catch (error) {
    console.error("❌ Controller: Erro ao deletar manutenção de bomba:", error);
    
    res.status(500).json({ 
      error: "Erro interno ao deletar manutenção de bomba",
      details: error.message
    });
  }
};



export default { 
  Inserir,
  InserirBatch,
  Listar,
  BuscarPorId,
  Deletar,
};