import { query } from "../database/sqlite.js";

const TABLE_NAME = "maturacao_forcada";
const BASE_COLUMNS = [
  "form_id",
  "data_recebimento",
  "data_analise",
  "comprador",
  "produtor",
  "parcela",
  "responsavel",
  "variedade",
  "quantidade_frutos",
  "te_leve",
  "te_moderado",
  "te_severo",
  "pc_leve",
  "pc_moderado",
  "pc_severo",
  "df_leve",
  "df_moderado",
  "df_severo",
  "peduncular",
  "antracnose",
  "colapso",
  "germinacao",
  "alternaria",
  "total_defeito",
  "incidencia",
  "observacoes",
  "usuario",
  "cargo",
  "matricula",
  "momento",
  "fotos_count",
  "fotos_folder",
  "json_path",
  "payload_json"
];

const LEGACY_COLUMNS = ["fazenda", "talhao", "fornecedor"];

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id TEXT UNIQUE,
    data_recebimento TEXT,
    data_analise TEXT,
    comprador TEXT,
    produtor TEXT,
    parcela TEXT,
    responsavel TEXT,
    variedade TEXT,
    quantidade_frutos INTEGER,
    te_leve INTEGER DEFAULT 0,
    te_moderado INTEGER DEFAULT 0,
    te_severo INTEGER DEFAULT 0,
    pc_leve INTEGER DEFAULT 0,
    pc_moderado INTEGER DEFAULT 0,
    pc_severo INTEGER DEFAULT 0,
    df_leve INTEGER DEFAULT 0,
    df_moderado INTEGER DEFAULT 0,
    df_severo INTEGER DEFAULT 0,
    peduncular INTEGER DEFAULT 0,
    antracnose INTEGER DEFAULT 0,
    colapso INTEGER DEFAULT 0,
    germinacao INTEGER DEFAULT 0,
    alternaria INTEGER DEFAULT 0,
    total_defeito INTEGER DEFAULT 0,
    incidencia REAL DEFAULT 0,
    observacoes TEXT,
    usuario TEXT,
    cargo TEXT,
    matricula TEXT,
    momento TEXT,
    fotos_count INTEGER DEFAULT 0,
    fotos_folder TEXT,
    json_path TEXT,
    payload_json TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`;

const criarTabela = async () => {
  await query(CREATE_TABLE_SQL, [], 'run');

  const columns = await query(`PRAGMA table_info(${TABLE_NAME})`, [], 'all');
  const existing = new Set(columns.map((column) => column.name));

  const hasLegacyColumns = LEGACY_COLUMNS.some((column) => existing.has(column));
  if (hasLegacyColumns) {
    const countRow = await query(`SELECT COUNT(*) AS total FROM ${TABLE_NAME}`, [], 'get');
    if (!countRow || Number(countRow.total) === 0) {
      await query(`DROP TABLE IF EXISTS ${TABLE_NAME}`, [], 'run');
      await query(CREATE_TABLE_SQL, [], 'run');
      return;
    }
  }

  const additions = [
    ["comprador", "TEXT"],
    ["produtor", "TEXT"],
    ["parcela", "TEXT"],
    ["whatsapp_enviado", "INTEGER DEFAULT 0"],
    ["whatsapp_enviado_em", "TEXT"],
  ];

  for (const [name, definition] of additions) {
    if (!existing.has(name)) {
      await query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN ${name} ${definition}`, [], 'run');
    }
  }
};

criarTabela().catch((error) => {
  console.error('Erro ao criar tabela maturacao_forcada:', error);
});

const parseJson = (value, fallback = null) => {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const cleanText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text.length ? text : null;
};

const toInt = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
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
      case 'form_id': return cleanText(data.form_id);
      case 'data_recebimento': return cleanText(data.data_recebimento);
      case 'data_analise': return cleanText(data.data_analise);
      case 'comprador': return cleanText(data.comprador);
      case 'produtor': return cleanText(data.produtor);
      case 'parcela': return cleanText(data.parcela);
      case 'responsavel': return cleanText(data.responsavel);
      case 'variedade': return cleanText(data.variedade);
      case 'quantidade_frutos': return toInt(data.quantidade_frutos, 0);
      case 'te_leve': return toInt(data.te_leve, 0);
      case 'te_moderado': return toInt(data.te_moderado, 0);
      case 'te_severo': return toInt(data.te_severo, 0);
      case 'pc_leve': return toInt(data.pc_leve, 0);
      case 'pc_moderado': return toInt(data.pc_moderado, 0);
      case 'pc_severo': return toInt(data.pc_severo, 0);
      case 'df_leve': return toInt(data.df_leve, 0);
      case 'df_moderado': return toInt(data.df_moderado, 0);
      case 'df_severo': return toInt(data.df_severo, 0);
      case 'peduncular': return toInt(data.peduncular, 0);
      case 'antracnose': return toInt(data.antracnose, 0);
      case 'colapso': return toInt(data.colapso, 0);
      case 'germinacao': return toInt(data.germinacao, 0);
      case 'alternaria': return toInt(data.alternaria, 0);
      case 'total_defeito': return toInt(data.total_defeito, 0);
      case 'incidencia': return toFloat(data.incidencia, 0);
      case 'observacoes': return cleanText(data.observacoes);
      case 'usuario': return cleanText(data.usuario);
      case 'cargo': return cleanText(data.cargo);
      case 'matricula': return cleanText(data.matricula);
      case 'momento': return cleanText(data.momento);
      case 'fotos_count': return toInt(data.fotos_count, 0);
      case 'fotos_folder': return cleanText(data.fotos_folder);
      case 'json_path': return cleanText(data.json_path);
      case 'payload_json': return typeof data.payload_json === 'string' ? data.payload_json : JSON.stringify(data.payload_json ?? null);
      default: return null;
    }
  });

  const sql = `
    INSERT INTO ${TABLE_NAME} (${BASE_COLUMNS.join(', ')})
    VALUES (${BASE_COLUMNS.map(() => '?').join(', ')})
  `;

  const result = await query(sql, values, 'run');

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

  if (filtros.comprador) {
    sql += ` AND comprador = ?`;
    params.push(filtros.comprador);
  }

  if (filtros.produtor) {
    sql += ` AND produtor = ?`;
    params.push(filtros.produtor);
  }

  if (filtros.parcela) {
    sql += ` AND parcela = ?`;
    params.push(filtros.parcela);
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

  const rows = await query(sql, params, 'all');
  return rows.map(mapRow);
};

const BuscarPorId = async (id) => {
  const rows = await query(
    `SELECT * FROM ${TABLE_NAME} WHERE id = ? OR form_id = ? LIMIT 1`,
    [id, id],
    'all'
  );

  return rows.length ? mapRow(rows[0]) : null;
};

const MarcarEnviado = async (form_id, enviado = true) => {
  await query(
    `UPDATE ${TABLE_NAME}
     SET whatsapp_enviado = ?, whatsapp_enviado_em = datetime('now'), updated_at = datetime('now')
     WHERE form_id = ?`,
    [enviado ? 1 : 0, String(form_id)],
    'run'
  );
};

export default {
  Inserir,
  Listar,
  BuscarPorId,
  MarcarEnviado,
};
