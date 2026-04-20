import { query } from "../database/sqlite.js";

const TABLE_NAME = "maturacao_forcada_catalogo";
const SEED_ROWS = [
  { comprador: "EUDES", produtor: "ASA BRANCA", parcela: "PC:02V.4 e V.7" },
  { comprador: "NAIDE", produtor: "ASA BRANCA", parcela: "PC; 01" },
  { comprador: "FERNANDO", produtor: "TEXEIRA", parcela: "PC; 03" },
  { comprador: "EUDES", produtor: "PONTAL", parcela: "PC; 07/08" },
  { comprador: "EUDES", produtor: "NECTAR B", parcela: "PC; 07/08" },
  { comprador: "EUDES", produtor: "GAZULAR", parcela: "PC; 01" },
  { comprador: "FERNANDO", produtor: "EFRAIM", parcela: "PC; 09" },
  { comprador: "EUDES", produtor: "SURUBIM", parcela: "PC; P1V1" },
  { comprador: "EUDES", produtor: "ASA BRANCA", parcela: "PC; 02/V4-V7" },
  { comprador: "FERNANDO", produtor: "SITIO F FRUTAS", parcela: "PC; A3" },
  { comprador: "EUDES", produtor: "GREEN VALLE", parcela: "PC; 10" },
  { comprador: "FERNANDO", produtor: "IV FRUTAS", parcela: "PC; B 15" },
  { comprador: "FERNANDO", produtor: "SITIO BURRA LEITEIRA", parcela: "PC; 04" },
  { comprador: "FERNANDO", produtor: "FAZ. MARAVILHA", parcela: "PC; 15" },
  { comprador: "EUDES", produtor: "LOTE 17", parcela: "PC; 01" },
  { comprador: "FERNANDO", produtor: "FAZ .SAMPAIO", parcela: "PC; 01" },
  { comprador: "NAIDE", produtor: "ASA BRANCA", parcela: "AB-15" },
  { comprador: "EUDES", produtor: "FAZ. ELDOURADO", parcela: "PC; 02" },
  { comprador: "EUDES", produtor: "LOTE 179", parcela: "PC; 01" },
  { comprador: "FERNANDO", produtor: "FAZ. SAVIO", parcela: "PC; A 10" },
  { comprador: "FERNANDO", produtor: "MARAVILHA", parcela: "PC; 08" },
  { comprador: "EUDES", produtor: "SITIO MONTEIRO", parcela: "PC; 02" },
  { comprador: "EUDES", produtor: "SITIO MONTEIRO", parcela: "PC; 03" },
  { comprador: "EUDES", produtor: "SÍTIO MONTEIRO", parcela: "PC; 10" },
  { comprador: "FERNANDO", produtor: "FAZ. MÃE RAINHA", parcela: "PC; 03" },
  { comprador: "FERNANDO", produtor: "FAZ. CARVALHO", parcela: "PC; 02" },
  { comprador: "FERNANDO", produtor: "FAZ. TRÊS IRMÃOS", parcela: "PC; 06" },
  { comprador: "FERNANDO", produtor: "SÍTIO BURRA LEITEIRA", parcela: "PC; C 12" },
  { comprador: "EUDES", produtor: "FAZENDA NOVA", parcela: "PC; 3B" },
  { comprador: "FERNANDO", produtor: "MARAVILHA", parcela: "16C" },
  { comprador: "NAIDE", produtor: "ASSIS", parcela: "PC; 01" },
  { comprador: "EUDES", produtor: "FAZ. JS", parcela: "PC;01/02" },
  { comprador: "NAIDE", produtor: "FAZ. BOM JESUS", parcela: "JM-002" },
  { comprador: "NAIDE", produtor: "FAZ. ASSIS", parcela: "PC;01" },
  { comprador: "FERNANDO", produtor: "FAZ. MARAVILHA", parcela: "PC;026C" },
  { comprador: "EUDES", produtor: "SALITRE LOTE 210", parcela: "PC;001" },
  { comprador: "EUDES", produtor: "SÍTIO BEATRIZ", parcela: "PC;04" },
  { comprador: "EUDES", produtor: "FAZ. PONTAL", parcela: "PC;07/08" },
  { comprador: "EUDES", produtor: "SITIO MONTEIRO", parcela: "PC;03" },
  { comprador: "EUDES", produtor: "FAZ. BEATRIZ", parcela: "PC;03" },
  { comprador: "EUDES", produtor: "FAZ. HECULANO", parcela: "PC;03" },
  { comprador: "NAIDE", produtor: "FAZ. ASA BRANCA", parcela: "AB-09" },
  { comprador: "NAIDE", produtor: "FAZ. ASA BRANCA", parcela: "AB-05" },
  { comprador: "EUDES", produtor: "BELO JARDIM", parcela: "PC 01/02" },
  { comprador: "PRÓPRIA", produtor: "GLAUCO", parcela: "PC 2V2" },
  { comprador: "PRÓPRIA", produtor: "VALVERDE", parcela: "FV-07" },
  { comprador: "PRÓPRIA", produtor: "VALVERDE", parcela: "FV-06" },
  { comprador: "PRÓPRIA", produtor: "RODA D'ÁGUA", parcela: "RD026" },
];

const cleanText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text.length ? text : null;
};

const ensureTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comprador TEXT NOT NULL,
      produtor TEXT NOT NULL,
      parcela TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `, [], 'run');

  const countRow = await query(`SELECT COUNT(*) AS total FROM ${TABLE_NAME}`, [], 'get');
  if (countRow && Number(countRow.total) > 0) {
    return;
  }

  for (const row of SEED_ROWS) {
    await query(
      `INSERT INTO ${TABLE_NAME} (comprador, produtor, parcela) VALUES (?, ?, ?)` ,
      [cleanText(row.comprador), cleanText(row.produtor), cleanText(row.parcela)],
      'run'
    );
  }
};

ensureTable().catch((error) => {
  console.error('Erro ao criar/seedar tabela maturacao_forcada_catalogo:', error);
});

const Listar = async (filtros = {}) => {
  let sql = `
    SELECT DISTINCT comprador, produtor, parcela
    FROM ${TABLE_NAME}
    WHERE 1=1
  `;
  const params = [];

  if (filtros.comprador) {
    sql += ` AND comprador = ?`;
    params.push(cleanText(filtros.comprador));
  }

  if (filtros.produtor) {
    sql += ` AND produtor = ?`;
    params.push(cleanText(filtros.produtor));
  }

  if (filtros.parcela) {
    sql += ` AND parcela = ?`;
    params.push(cleanText(filtros.parcela));
  }

  sql += ` ORDER BY comprador, produtor, parcela`;

  if (filtros.limit) {
    const limit = parseInt(filtros.limit, 10);
    if (Number.isFinite(limit)) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }
  }

  return await query(sql, params, 'all');
};

const ListarCompradores = async () => {
  return await query(
    `SELECT DISTINCT comprador FROM ${TABLE_NAME} WHERE comprador IS NOT NULL AND comprador != '' ORDER BY comprador`,
    [],
    'all'
  );
};

const ListarProdutores = async (comprador = null) => {
  let sql = `
    SELECT DISTINCT produtor
    FROM ${TABLE_NAME}
    WHERE produtor IS NOT NULL AND produtor != ''
  `;
  const params = [];

  if (comprador) {
    sql += ` AND comprador = ?`;
    params.push(cleanText(comprador));
  }

  sql += ` ORDER BY produtor`;
  return await query(sql, params, 'all');
};

const ListarParcelas = async ({ comprador = null, produtor = null } = {}) => {
  let sql = `
    SELECT DISTINCT parcela
    FROM ${TABLE_NAME}
    WHERE parcela IS NOT NULL AND parcela != ''
  `;
  const params = [];

  if (comprador) {
    sql += ` AND comprador = ?`;
    params.push(cleanText(comprador));
  }

  if (produtor) {
    sql += ` AND produtor = ?`;
    params.push(cleanText(produtor));
  }

  sql += ` ORDER BY parcela`;
  return await query(sql, params, 'all');
};

export default {
  Listar,
  ListarCompradores,
  ListarProdutores,
  ListarParcelas,
};
