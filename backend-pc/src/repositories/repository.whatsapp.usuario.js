import { query } from "../database/sqlite.js";

const TABLE_NAME = "whatsapp_usuarios";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    setor TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`;

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  return text.length ? text : null;
};

const normalizeNumero = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length ? digits : null;
};

const normalizeSetor = (value) => {
  const text = normalizeText(value);
  if (!text) return null;

  const upper = text.toUpperCase();
  if (upper === "TI" || upper.includes("TECNOLOGIA")) return "TI";
  if (upper.includes("QUALIDADE")) return "CONTROLE DE QUALIDADE";
  if (upper.includes("CONTROLE")) return "CONTROLE DE QUALIDADE";
  return upper;
};

const criarTabela = async () => {
  await query(CREATE_TABLE_SQL, [], "run");
};

criarTabela().catch((error) => {
  console.error("Erro ao criar tabela whatsapp_usuarios:", error);
});

const BuscarPorNumero = async (numero) => {
  const numeroLimpo = normalizeNumero(numero);
  if (!numeroLimpo) return null;

  return query(
    `SELECT * FROM ${TABLE_NAME} WHERE numero = ? LIMIT 1`,
    [numeroLimpo],
    "get"
  );
};

const BuscarPorNomeESetor = async (nome, setor) => {
  const nomeLimpo = normalizeText(nome);
  const setorLimpo = normalizeSetor(setor);

  if (!nomeLimpo || !setorLimpo) return null;

  return query(
    `SELECT * FROM ${TABLE_NAME}
     WHERE UPPER(nome) = UPPER(?)
       AND UPPER(setor) = UPPER(?)
     ORDER BY datetime(updated_at) DESC, id DESC
     LIMIT 1`,
    [nomeLimpo, setorLimpo],
    "get"
  );
};

const Listar = async () => {
  return query(
    `SELECT * FROM ${TABLE_NAME} ORDER BY datetime(updated_at) DESC, id DESC`,
    [],
    "all"
  );
};

const SalvarOuAtualizar = async ({ numero, nome, setor }) => {
  const numeroLimpo = normalizeNumero(numero);
  const nomeLimpo = normalizeText(nome);
  const setorLimpo = normalizeSetor(setor);

  if (!numeroLimpo || !nomeLimpo || !setorLimpo) {
    throw new Error("numero, nome e setor sao obrigatorios");
  }

  const existentePorNumero = await BuscarPorNumero(numeroLimpo);
  if (existentePorNumero) {
    await query(
      `UPDATE ${TABLE_NAME}
       SET nome = ?, setor = ?, updated_at = datetime('now')
       WHERE numero = ?`,
      [nomeLimpo, setorLimpo, numeroLimpo],
      "run"
    );
    return BuscarPorNumero(numeroLimpo);
  }

  const existentePorNome = await BuscarPorNomeESetor(nomeLimpo, setorLimpo);
  if (existentePorNome) {
    await query(
      `UPDATE ${TABLE_NAME}
       SET numero = ?, nome = ?, setor = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [numeroLimpo, nomeLimpo, setorLimpo, existentePorNome.id],
      "run"
    );
    return BuscarPorNumero(numeroLimpo);
  }

  const sql = `
    INSERT INTO ${TABLE_NAME} (numero, nome, setor, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `;

  await query(sql, [numeroLimpo, nomeLimpo, setorLimpo], "run");
  return BuscarPorNumero(numeroLimpo);
};

const DeletarPorNumero = async (numero) => {
  const numeroLimpo = normalizeNumero(numero);
  if (!numeroLimpo) throw new Error("numero invalido");
  await query(`DELETE FROM ${TABLE_NAME} WHERE numero=?`, [numeroLimpo], "run");
  return { ok: true };
};

export default {
  BuscarPorNumero,
  BuscarPorNomeESetor,
  Listar,
  SalvarOuAtualizar,
  DeletarPorNumero,
};
