// backend/src/services/service.consumo.agua.js
import repositoryConsumoAgua from "../repositories/repository.consumo.agua.js";

// ========== INSERIR ==========
const Inserir = async (data) => {
  try {
    console.log("📊 Service: Processando consumo de água:", data);

    if (!data.fazenda || !data.usuario) {
      throw new Error("Fazenda e usuário são obrigatórios");
    }

    const result = await repositoryConsumoAgua.Inserir(data);
    return result;
  } catch (error) {
    console.error("❌ Service: Erro ao inserir consumo de água:", error);
    throw error;
  }
};

// ========== LISTAR ==========
const Listar = async (filtros = {}) => {
  return await repositoryConsumoAgua.Listar(filtros);
};

// ========== ATUALIZAR ==========
const Atualizar = async (consumo_id, dados) => {
  return await repositoryConsumoAgua.Atualizar(consumo_id, dados);
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (id) => {
  return await repositoryConsumoAgua.BuscarPorId(id);
};

export default { Inserir, Atualizar, Listar, BuscarPorId };
