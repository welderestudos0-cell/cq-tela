import { query } from "../database/sqlite.js";

const TABLE_NAME = "priorizacao_pallets";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plancarreg_codigo INTEGER,
    nro_container TEXT,
    apelido TEXT,
    data_saida TEXT,
    motorista TEXT,
    planpal_codigo INTEGER,
    qtd_caixas INTEGER DEFAULT 0,
    caixa_descricao TEXT,
    calibre INTEGER,
    classe_prod INTEGER,
    safra TEXT,
    etiqueta TEXT,
    temperatura_1 TEXT,
    temperatura_2 TEXT,
    checklist_json TEXT,
    fotos_json TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`;

const criarTabela = async () => {
  await query(CREATE_TABLE_SQL, [], "run");
};

criarTabela().catch((error) => {
  console.error("Erro ao criar tabela priorizacao_pallets:", error);
});

const Inserir = async (dados) => {
  const sql = `
    INSERT INTO ${TABLE_NAME}
      (plancarreg_codigo, nro_container, apelido, data_saida, motorista,
       planpal_codigo, qtd_caixas, caixa_descricao, calibre, classe_prod,
       safra, etiqueta, temperatura_1, temperatura_2, checklist_json, fotos_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  return query(sql, [
    dados.plancarreg_codigo,
    dados.nro_container,
    dados.apelido,
    dados.data_saida,
    dados.motorista,
    dados.planpal_codigo,
    dados.qtd_caixas,
    dados.caixa_descricao,
    dados.calibre,
    dados.classe_prod,
    dados.safra,
    dados.etiqueta,
    dados.temperatura_1,
    dados.temperatura_2,
    dados.checklist_json || null,
    dados.fotos_json || null,
  ], "run");
};

const Listar = async () => {
  return query(`SELECT * FROM ${TABLE_NAME} ORDER BY created_at DESC`, [], "all");
};

const BuscarPorCarregamento = async (plancarregCodigo) => {
  return query(
    `SELECT * FROM ${TABLE_NAME} WHERE plancarreg_codigo = ? ORDER BY planpal_codigo`,
    [plancarregCodigo],
    "all",
  );
};

export default { Inserir, Listar, BuscarPorCarregamento };
