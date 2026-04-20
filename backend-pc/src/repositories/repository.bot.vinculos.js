import { query } from "../database/sqlite.js";

const TABLE = "bot_fluxo_vinculos";
const FLUXOS = "bot_fluxos";

const TIPOS_VALIDOS = new Set(["setor", "numero", "admin"]);

const normalizeText = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim().replace(/\s+/g, " ");
};

const normalizeNumero = (value) => normalizeText(value).replace(/\D/g, "");

const normalizeSetor = (value) => {
  const text = normalizeText(value).toUpperCase();
  if (!text) return "";
  if (text === "TI" || text.includes("TECNOLOGIA")) return "TI";
  if (text === "ADMIN" || text === "ADMINISTRADOR" || text === "ADMINISTRATIVO") return "ADMIN";
  if (text.includes("QUALIDADE") || text.includes("CONTROLE")) return "CONTROLE DE QUALIDADE";
  return text;
};

const normalizeTipo = (value) => {
  const tipo = normalizeText(value).toLowerCase();
  if (!TIPOS_VALIDOS.has(tipo)) {
    throw new Error("tipo invalido. Use: setor, numero ou admin");
  }
  return tipo;
};

const normalizeValor = (tipo, valor) => {
  if (tipo === "numero") {
    const numero = normalizeNumero(valor);
    if (numero.length < 8) throw new Error("numero invalido");
    return numero;
  }

  if (tipo === "setor") {
    const setor = normalizeSetor(valor);
    if (!setor) throw new Error("setor invalido");
    return setor;
  }

  return "ADMIN";
};

const criarTabela = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fluxo_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      valor TEXT NOT NULL,
      observacao TEXT DEFAULT '',
      ativo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE (tipo, valor),
      FOREIGN KEY (fluxo_id) REFERENCES ${FLUXOS}(id) ON DELETE CASCADE
    )`,
    [],
    "run"
  );
};

criarTabela().catch((err) => {
  console.error("Erro ao criar tabela bot_fluxo_vinculos:", err);
});

const baseSelect = `
  SELECT
    v.*,
    f.nome AS fluxo_nome,
    f.descricao AS fluxo_descricao,
    f.gatilho_palavras AS fluxo_gatilho_palavras,
    f.ativo AS fluxo_ativo
  FROM ${TABLE} v
  INNER JOIN ${FLUXOS} f ON f.id = v.fluxo_id
`;

const ordenar = `
  ORDER BY
    CASE v.tipo
      WHEN 'numero' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'setor' THEN 3
      ELSE 9
    END,
    v.valor,
    datetime(v.updated_at) DESC,
    v.id DESC
`;

const Listar = () => query(`${baseSelect} ${ordenar}`, [], "all");

const ListarAtivos = () =>
  query(
    `${baseSelect}
     WHERE v.ativo = 1
       AND f.ativo = 1
     ${ordenar}`,
    [],
    "all"
  );

const BuscarPorId = (id) =>
  query(`${baseSelect} WHERE v.id = ? LIMIT 1`, [id], "get");

const Criar = async ({ fluxo_id, tipo, valor, observacao, ativo }) => {
  const tipoNormalizado = normalizeTipo(tipo);
  const valorNormalizado = normalizeValor(tipoNormalizado, valor);
  const fluxoId = Number(fluxo_id);

  if (!Number.isInteger(fluxoId) || fluxoId <= 0) {
    throw new Error("fluxo_id invalido");
  }

  const result = await query(
    `INSERT INTO ${TABLE} (fluxo_id, tipo, valor, observacao, ativo)
     VALUES (?, ?, ?, ?, ?)`,
    [
      fluxoId,
      tipoNormalizado,
      valorNormalizado,
      normalizeText(observacao),
      ativo === undefined ? 1 : ativo ? 1 : 0,
    ],
    "run"
  );

  return BuscarPorId(result.lastID);
};

const Atualizar = async (id, { fluxo_id, tipo, valor, observacao, ativo }) => {
  const atual = await BuscarPorId(id);
  if (!atual) return null;

  const tipoNormalizado = normalizeTipo(tipo ?? atual.tipo);
  const valorNormalizado = normalizeValor(
    tipoNormalizado,
    valor ?? atual.valor
  );
  const fluxoId = Number(fluxo_id ?? atual.fluxo_id);

  if (!Number.isInteger(fluxoId) || fluxoId <= 0) {
    throw new Error("fluxo_id invalido");
  }

  await query(
    `UPDATE ${TABLE}
     SET fluxo_id = ?,
         tipo = ?,
         valor = ?,
         observacao = ?,
         ativo = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      fluxoId,
      tipoNormalizado,
      valorNormalizado,
      normalizeText(observacao ?? atual.observacao),
      ativo === undefined ? (atual.ativo ? 1 : 0) : ativo ? 1 : 0,
      id,
    ],
    "run"
  );

  return BuscarPorId(id);
};

const Deletar = async (id) => {
  await query(`DELETE FROM ${TABLE} WHERE id = ?`, [id], "run");
  return { ok: true };
};

export default {
  Listar,
  ListarAtivos,
  BuscarPorId,
  Criar,
  Atualizar,
  Deletar,
};
