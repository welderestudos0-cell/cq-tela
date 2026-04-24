import repositoryFormsValor from "../repositories/repository.forms.valor.js";
import axios from "axios";

const ORACLE_API = "http://10.107.114.11:3000/backend/busca_generica/comandoGenerico";
const ORACLE_SQL  = "SELECT * FROM AGDTI.DXDW_FORMS_TOT_VALOR";

const normalizeDescricaoLista = (value = "") =>
  String(value || "").trim().toLowerCase();

// Sincroniza lista_fazenda_talhao do Oracle para o SQLite local.
const SincronizarFazendaTalhao = async (req, res) => {
  try {
    const { data } = await axios.get(ORACLE_API, {
      params: { comando: ORACLE_SQL },
      timeout: 15000,
    });

    const rows = Array.isArray(data) ? data : (Array.isArray(data?.rows) ? data.rows : []);
    const itens = rows.filter((r) =>
      String(r?.descricao_lista || r?.DESCRICAO_LISTA || "").trim().toLowerCase() === "lista_fazenda_talhao"
    );

    let inseridos = 0;
    for (const item of itens) {
      const valor = String(item?.valor || item?.VALOR || "").trim();
      if (!valor) continue;
      const result = await repositoryFormsValor.Criar({ descricao_lista: "lista_fazenda_talhao", valor });
      if (result?.id) inseridos++;
    }

    console.log(`[BuscaGenerica] Sincronizados ${inseridos} de ${itens.length} itens lista_fazenda_talhao`);
    return res.json({ success: true, total: itens.length, inseridos });
  } catch (err) {
    console.error("[BuscaGenerica] Erro ao sincronizar Oracle:", err.message);
    return res.status(502).json({ success: false, error: err.message });
  }
};

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

export default { ComandoGenerico, SincronizarFazendaTalhao };
