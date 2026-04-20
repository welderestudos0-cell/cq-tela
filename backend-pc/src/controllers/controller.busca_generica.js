import repositoryFormsValor from "../repositories/repository.forms.valor.js";

const normalizeDescricaoLista = (value = "") =>
  String(value || "").trim().toLowerCase();

const extrairDescricaoListaDoComando = (comando = "") => {
  const sql = String(comando || "").trim();
  if (!sql) return "";

  // Suporta: WHERE "descricao_lista" LIKE '%lista_analises_frutos%'
  const likeMatch = sql.match(/descricao_lista\s*"?\s*LIKE\s*'%([^%']+)%'/i)
    || sql.match(/"descricao_lista"\s+LIKE\s+'%([^%']+)%'/i);
  if (likeMatch?.[1]) return normalizeDescricaoLista(likeMatch[1]);

  // Suporta: WHERE descricao_lista = 'lista_analises_frutos'
  const eqMatch = sql.match(/descricao_lista\s*"?\s*=\s*'([^']+)'/i)
    || sql.match(/"descricao_lista"\s*=\s*'([^']+)'/i);
  if (eqMatch?.[1]) return normalizeDescricaoLista(eqMatch[1]);

  return "";
};

// Simula o endpoint /busca_generica/comandoGenerico do servidor externo
// Executa filtros simples por descricao_lista quando vierem no SQL de comando.
const ComandoGenerico = async (req, res) => {
  try {
    const comando = req.query?.comando;
    const descricaoLista = extrairDescricaoListaDoComando(comando);

    const rows = descricaoLista
      ? await repositoryFormsValor.ListarPorDescricao(descricaoLista)
      : await repositoryFormsValor.Listar();

    return res.status(200).json({
      rows,
      metaData: [
        { name: "ID" },
        { name: "DESCRICAO_LISTA" },
        { name: "VALOR" },
        { name: "CREATED_AT" },
      ],
    });
  } catch (error) {
    console.error("[BuscaGenerica] Erro ao buscar dados locais:", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao buscar dados locais",
      details: error.message,
    });
  }
};

export default { ComandoGenerico };
