import { query } from "../database/sqlite.js";

const TABLE_NAME = "relatorio_embarque_sede";
const BASE_COLUMNS = [
  "form_id",
  "analysis_date",
  "farm",
  "talhao",
  "variety",
  "customer",
  "container",
  "loading",
  "etd",
  "eta",
  "vessel",
  "total_sections",
  "total_items",
  "total_photos",
  "pdf_path",
  "json_path",
  "payload_json",
];

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id TEXT UNIQUE,
    analysis_date TEXT,
    farm TEXT,
    talhao TEXT,
    variety TEXT,
    customer TEXT,
    container TEXT,
    loading TEXT,
    etd TEXT,
    eta TEXT,
    vessel TEXT,
    total_sections INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    total_photos INTEGER DEFAULT 0,
    pdf_path TEXT,
    json_path TEXT,
    payload_json TEXT,
    whatsapp_enviado INTEGER DEFAULT 0,
    whatsapp_enviado_em TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`;

const criarTabela = async () => {
  await query(CREATE_TABLE_SQL, [], "run");

  const columns = await query(`PRAGMA table_info(${TABLE_NAME})`, [], "all");
  const existing = new Set(columns.map((column) => column.name));

  const additions = [
    ["whatsapp_enviado", "INTEGER DEFAULT 0"],
    ["whatsapp_enviado_em", "TEXT"],
    ["pdf_path", "TEXT"],
    ["json_path", "TEXT"],
    ["payload_json", "TEXT"],
  ];

  for (const [name, definition] of additions) {
    if (!existing.has(name)) {
      await query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN ${name} ${definition}`, [], "run");
    }
  }
};

criarTabela().catch((error) => {
  console.error("Erro ao criar tabela relatorio_embarque_sede:", error);
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
      case "analysis_date": return cleanText(data.analysis_date);
      case "farm": return cleanText(data.farm);
      case "talhao": return cleanText(data.talhao);
      case "variety": return cleanText(data.variety);
      case "customer": return cleanText(data.customer);
      case "container": return cleanText(data.container);
      case "loading": return cleanText(data.loading);
      case "etd": return cleanText(data.etd);
      case "eta": return cleanText(data.eta);
      case "vessel": return cleanText(data.vessel);
      case "total_sections": return toInt(data.total_sections, 0);
      case "total_items": return toInt(data.total_items, 0);
      case "total_photos": return toInt(data.total_photos, 0);
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

const MarcarEnviado = async (form_id, enviado = true) => {
  await query(
    `UPDATE ${TABLE_NAME}
     SET whatsapp_enviado = ?, whatsapp_enviado_em = datetime('now'), updated_at = datetime('now')
     WHERE form_id = ?`,
    [enviado ? 1 : 0, String(form_id)],
    "run",
  );
};

export default {
  Inserir,
  Listar,
  ListarPendentes,
  BuscarPorId,
  MarcarEnviado,
};

