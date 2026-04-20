import repositoryCQ from "../repositories/repository.cq.js";

const Inserir = async (dados, fotoPath) => {
  const registro = {
    produto: dados.produto?.trim(),
    lote: dados.lote?.trim(),
    responsavel: dados.responsavel?.trim(),
    status: dados.status?.trim(),
    observacoes: dados.observacoes?.trim() || null,
    foto_path: fotoPath || null,
    data_criacao: dados.dataCriacao || new Date().toISOString(),
  };

  if (!registro.produto || !registro.lote || !registro.responsavel || !registro.status) {
    throw new Error("Campos obrigatorios nao fornecidos: produto, lote, responsavel, status");
  }

  const statusValidos = ["Aprovado", "Reprovado", "Em Análise"];
  if (!statusValidos.includes(registro.status)) {
    throw new Error(`Status invalido. Use: ${statusValidos.join(", ")}`);
  }

  const resultado = await repositoryCQ.Inserir(registro);

  return {
    id: resultado.id,
    ...registro,
  };
};

const Listar = async (filtros) => {
  const registros = await repositoryCQ.Listar(filtros);
  return { total: registros.length, filtros, data: registros };
};

const BuscarPorId = async (id) => {
  return await repositoryCQ.BuscarPorId(id);
};

const Deletar = async (id) => {
  return await repositoryCQ.Deletar(id);
};

const ResumoDia = async () => {
  const registros = await repositoryCQ.BuscarHoje();

  const aprovados = registros.filter((r) => r.status === "Aprovado").length;
  const reprovados = registros.filter((r) => r.status === "Reprovado").length;
  const emAnalise = registros.filter((r) => r.status === "Em Análise").length;

  return {
    data: new Date().toLocaleDateString("pt-BR"),
    total: registros.length,
    aprovados,
    reprovados,
    em_analise: emAnalise,
    registros,
  };
};

export default {
  Inserir,
  Listar,
  BuscarPorId,
  Deletar,
  ResumoDia,
};
