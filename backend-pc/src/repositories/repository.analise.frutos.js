import { query } from "../database/sqlite.js";

const TABLE_NAME = "analise_frutos";
const BASE_COLUMNS = [
  "form_id",
  "tipo_analise",
  "fazenda_talhao",
  "talhao",
  "safra",
  "semana",
  "data_ref",
  "controle",
  "variedade",
  "qtd_frutos",
  "criterio",
  "observacoes",
  "peso_final_caixa",
  "frutos_count",
  "lotes_count",
  "pdf_path",
  "json_path",
  "payload_json",
];

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id TEXT UNIQUE,
    tipo_analise TEXT,
    fazenda_talhao TEXT,
    talhao TEXT,
    safra TEXT,
    semana INTEGER,
    data_ref TEXT,
    controle INTEGER,
    variedade TEXT,
    qtd_frutos INTEGER DEFAULT 0,
    criterio TEXT,
    observacoes TEXT,
    peso_final_caixa REAL DEFAULT 0,
    frutos_count INTEGER DEFAULT 0,
    lotes_count INTEGER DEFAULT 0,
    pdf_path TEXT,
    json_path TEXT,
    payload_json TEXT,
    whatsapp_enviado INTEGER DEFAULT 0,
    whatsapp_enviado_em TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`;

const TABLE_LOTES = "analise_frutos_lotes";

const CREATE_TABLE_LOTES_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE_LOTES} (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id         TEXT,
    tipo_analise    TEXT,
    fazenda_talhao  TEXT,
    talhao          TEXT,
    semana          INTEGER,
    data_ref        TEXT,
    controle        INTEGER,
    variedade       TEXT,
    qtd_frutos      INTEGER DEFAULT 0,
    criterio        TEXT,
    numero_fruto    INTEGER,
    valor           REAL,
    danos_internos  TEXT,
    momento         TEXT,
    pdf_path        TEXT,
    json_path       TEXT,
    payload_json    TEXT,
    whatsapp_enviado    INTEGER DEFAULT 0,
    whatsapp_enviado_em TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  )
`;

const criarTabela = async () => {
  await query(CREATE_TABLE_SQL, [], "run");
  await query(CREATE_TABLE_LOTES_SQL, [], "run");

  const columns = await query(`PRAGMA table_info(${TABLE_NAME})`, [], "all");
  const existing = new Set(columns.map((column) => column.name));

  const additions = [
    ["whatsapp_enviado", "INTEGER DEFAULT 0"],
    ["whatsapp_enviado_em", "TEXT"],
    ["pdf_path", "TEXT"],
    ["json_path", "TEXT"],
    ["payload_json", "TEXT"],
    ["api_externa_enviado", "INTEGER DEFAULT 0"],
    ["api_externa_enviado_em", "TEXT"],
    ["api_externa_linhas", "INTEGER DEFAULT 0"],
    ["safra", "TEXT"],
  ];

  for (const [name, definition] of additions) {
    if (!existing.has(name)) {
      await query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN ${name} ${definition}`, [], "run");
    }
  }
};

criarTabela().catch((error) => {
  console.error("Erro ao criar tabela analise_frutos:", error);
});

const cleanText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  return text.length ? text : null;
};

const toInt = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloatOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseJson = (value, fallback = null) => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    payload_json: parseJson(row.payload_json, row.payload_json),
  };
};

const Inserir = async (data) => {
  const values = BASE_COLUMNS.map((column) => {
    switch (column) {
      case "form_id": return cleanText(data.form_id);
      case "tipo_analise": return cleanText(data.tipo_analise);
      case "fazenda_talhao": return cleanText(data.fazenda_talhao);
      case "talhao": return cleanText(data.talhao);
      case "safra": return cleanText(data.safra);
      case "semana": return toInt(data.semana, 0);
      case "data_ref": return cleanText(data.data_ref);
      case "controle": return toInt(data.controle, 0);
      case "variedade": return cleanText(data.variedade);
      case "qtd_frutos": return toInt(data.qtd_frutos, 0);
      case "criterio": return cleanText(data.criterio);
      case "observacoes": return cleanText(data.observacoes);
      case "peso_final_caixa": return toFloatOrNull(data.peso_final_caixa);
      case "frutos_count": return toInt(data.frutos_count, 0);
      case "lotes_count": return toInt(data.lotes_count, 0);
      case "pdf_path": return cleanText(data.pdf_path);
      case "json_path": return cleanText(data.json_path);
      case "payload_json":
        return typeof data.payload_json === "string" ? data.payload_json : JSON.stringify(data.payload_json ?? null);
      default: return null;
    }
  });

  const sql = `
    INSERT INTO ${TABLE_NAME} (${BASE_COLUMNS.join(", ")})
    VALUES (${BASE_COLUMNS.map(() => "?").join(", ")})
  `;

  const result = await query(sql, values, "run");
  return {
    id: result.lastID,
    changes: result.changes,
    form_id: data.form_id || null,
  };
};

const Listar = async (filtros = {}) => {
  let sql = `SELECT * FROM ${TABLE_NAME} WHERE 1=1`;
  const params = [];

  if (filtros.id) {
    sql += ` AND (id = ? OR form_id = ?)`;
    params.push(filtros.id, filtros.id);
  }

  if (filtros.form_id) {
    sql += ` AND form_id = ?`;
    params.push(filtros.form_id);
  }

  if (filtros.tipo_analise) {
    sql += ` AND LOWER(COALESCE(tipo_analise, '')) LIKE LOWER(?)`;
    params.push(`%${String(filtros.tipo_analise).trim()}%`);
  }

  if (filtros.dataInicio) {
    sql += ` AND created_at >= ?`;
    params.push(filtros.dataInicio);
  }

  if (filtros.dataFim) {
    sql += ` AND created_at <= ?`;
    params.push(filtros.dataFim);
  }

  sql += ` ORDER BY datetime(created_at) DESC, id DESC`;

  if (filtros.limit) {
    const limit = parseInt(filtros.limit, 10);
    if (Number.isFinite(limit)) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }
  }

  const rows = await query(sql, params, "all");
  return rows.map(mapRow);
};

const ListarPendentes = async (limit = 100) => {
  const rows = await query(
    `SELECT * FROM ${TABLE_NAME}
     WHERE whatsapp_enviado IS NULL OR whatsapp_enviado = 0
     ORDER BY id ASC
     LIMIT ?`,
    [Number(limit) || 100],
    "all",
  );
  return rows.map(mapRow);
};

const BuscarPorId = async (id) => {
  const rows = await query(
    `SELECT * FROM ${TABLE_NAME} WHERE id = ? OR form_id = ? LIMIT 1`,
    [id, id],
    "all",
  );
  return rows.length ? mapRow(rows[0]) : null;
};

const Remover = async (idOuFormId) => {
  const registro = await BuscarPorId(idOuFormId);
  if (!registro) return { changes: 0, form_id: null };

  if (registro.form_id) {
    await query(
      `DELETE FROM ${TABLE_LOTES} WHERE form_id = ?`,
      [registro.form_id],
      "run",
    );
  }

  const result = await query(
    `DELETE FROM ${TABLE_NAME} WHERE id = ? OR form_id = ?`,
    [idOuFormId, idOuFormId],
    "run",
  );

  return {
    changes: result?.changes || 0,
    form_id: registro.form_id || null,
  };
};

const MarcarEnviado = async (form_id, enviado = true) => {
  await query(
    `UPDATE ${TABLE_NAME}
     SET whatsapp_enviado = ?, whatsapp_enviado_em = datetime('now'), updated_at = datetime('now')
     WHERE form_id = ?`,
    [enviado ? 1 : 0, String(form_id)],
    "run",
  );
};

const InserirLotes = async (data) => {
  const lotes = Array.isArray(data.lotes) ? data.lotes : [];
  if (!lotes.length) return { inseridos: 0 };

  const momento = data.momento || new Date().toISOString();
  const cabecalho = {
    form_id:        cleanText(data.form_id),
    tipo_analise:   cleanText(data.tipo_analise),
    fazenda_talhao: cleanText(data.fazenda_talhao),
    talhao:         cleanText(data.talhao),
    semana:         toInt(data.semana, 0),
    data_ref:       cleanText(data.data_ref || data.data),
    controle:       toInt(data.controle, 0),
    variedade:      cleanText(data.variedade),
    qtd_frutos:     toInt(data.qtd_frutos, 0),
    pdf_path:       cleanText(data.pdf_path),
    json_path:      cleanText(data.json_path),
    payload_json:   typeof data.payload_json === "string" ? data.payload_json : JSON.stringify(data.payload_json ?? null),
  };

  const sql = `
    INSERT INTO ${TABLE_LOTES}
      (form_id, tipo_analise, fazenda_talhao, talhao, semana, data_ref,
       controle, variedade, qtd_frutos, criterio, numero_fruto, valor, danos_internos, momento,
       pdf_path, json_path, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const lote of lotes) {
    await query(sql, [
      cabecalho.form_id,
      cabecalho.tipo_analise,
      cabecalho.fazenda_talhao,
      cabecalho.talhao,
      cabecalho.semana,
      cabecalho.data_ref,
      cabecalho.controle,
      cabecalho.variedade,
      cabecalho.qtd_frutos,
      cleanText(lote.criterio),
      toInt(lote.numero_fruto, 0),
      toFloatOrNull(lote.valor),
      cleanText(lote.danos_internos) || null,
      momento,
      cabecalho.pdf_path,
      cabecalho.json_path,
      cabecalho.payload_json,
    ], "run");
  }

  return { inseridos: lotes.length };
};

const MarcarEnviadoLotes = async (form_id, enviado = true) => {
  await query(
    `UPDATE ${TABLE_LOTES}
     SET whatsapp_enviado = ?, whatsapp_enviado_em = datetime('now'), updated_at = datetime('now')
     WHERE form_id = ?`,
    [enviado ? 1 : 0, String(form_id)],
    "run",
  );
};

const ListarLotesPendentes = async (limit = 100) => {
  const rows = await query(
    `SELECT * FROM ${TABLE_LOTES}
     WHERE whatsapp_enviado IS NULL OR whatsapp_enviado = 0
     ORDER BY id ASC
     LIMIT ?`,
    [Number(limit) || 100],
    "all",
  );
  return rows;
};

const MarcarEnviadoApiExterna = async (form_id, linhas = 0) => {
  await query(
    `UPDATE ${TABLE_NAME}
     SET api_externa_enviado = 1,
         api_externa_enviado_em = datetime('now'),
         api_externa_linhas = ?,
         updated_at = datetime('now')
     WHERE form_id = ?`,
    [linhas, String(form_id)],
    "run"
  );
};

export default {
  Inserir,
  InserirLotes,
  Listar,
  ListarPendentes,
  ListarLotesPendentes,
  BuscarPorId,
  Remover,
  MarcarEnviado,
  MarcarEnviadoLotes,
  MarcarEnviadoApiExterna,
};

