// backend/src/services/service.kc.js
import repositoryKC from "../repositories/repository.kc.js";

const Inserir = async (data) => {
  return await repositoryKC.Inserir(data);
};

const InserirBatch = async (registros) => {
  return await repositoryKC.InserirBatch(registros);
};

const Listar = async (filtros) => {
  const data = await repositoryKC.Listar(filtros);
  return { total: data.length, data, filtros };
};

export default { Inserir, InserirBatch, Listar };
