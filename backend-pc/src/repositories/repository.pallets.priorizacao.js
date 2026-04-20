import { query } from "../database/sqlite.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tabela: pallets_priorizacao
// Um registro por pallet dentro de uma priorização.
// Os campos variedade, fazenda e controle vêm da API 3002 (dados enriquecidos).
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = "pallets_priorizacao";

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    id_priorizacao   INTEGER NOT NULL,
    safra            TEXT,
    oc               INTEGER,
    nro_container    TEXT,
    apelido          TEXT,
    data_saida       TEXT,
    motorista        TEXT,
    planpal          INTEGER,
    qtd_caixas       INTEGER DEFAULT 0,
    caixa_descricao  TEXT,
    controle         INTEGER,
    calibre          INTEGER,
    variedade        TEXT,
    fazenda          TEXT,
    id_checklist     INTEGER,
    classe_prod      INTEGER,
    etiqueta         TEXT,
    temperatura_1    TEXT,
    temperatura_2    TEXT,
    fotos_json       TEXT,
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_priorizacao) REFERENCES priorizacao(id)
  )
`;

await query(CREATE_SQL, [], "run").catch((e) =>
  console.error("[pallets_priorizacao] Erro ao criar tabela:", e.message)
);

const Inserir = (dados) =>
  query(
    `INSERT INTO ${TABLE}
       (id_priorizacao, safra, oc, nro_container, apelido, data_saida, motorista,
        planpal, qtd_caixas, caixa_descricao, controle, calibre, variedade, fazenda,
        id_checklist, classe_prod, etiqueta, temperatura_1, temperatura_2, fotos_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      dados.id_priorizacao,
      dados.safra,
      dados.oc,
      dados.nro_container,
      dados.apelido,
      dados.data_saida,
      dados.motorista,
      dados.planpal,
      dados.qtd_caixas,
      dados.caixa_descricao,
      dados.controle,
      dados.calibre,
      dados.variedade,
      dados.fazenda,
      dados.id_checklist ?? null,
      dados.classe_prod,
      dados.etiqueta,
      dados.temperatura_1,
      dados.temperatura_2,
      dados.fotos_json ?? null,
    ],
    "run"
  );

const AtualizarEtiquetaTemp = (id, etiqueta, temperatura_1, temperatura_2) =>
  query(
    `UPDATE ${TABLE} SET etiqueta=?, temperatura_1=?, temperatura_2=?, updated_at=datetime('now') WHERE id=?`,
    [etiqueta, temperatura_1, temperatura_2, id],
    "run"
  );

const AtualizarChecklist = (id, id_checklist) =>
  query(
    `UPDATE ${TABLE} SET id_checklist=?, updated_at=datetime('now') WHERE id=?`,
    [id_checklist, id],
    "run"
  );

const AtualizarFotos = (id, fotos_json) =>
  query(
    `UPDATE ${TABLE} SET fotos_json=?, updated_at=datetime('now') WHERE id=?`,
    [fotos_json, id],
    "run"
  );

const ListarPorPriorizacao = (id_priorizacao) =>
  query(
    `SELECT * FROM ${TABLE} WHERE id_priorizacao = ? ORDER BY planpal`,
    [id_priorizacao],
    "all"
  );

const BuscarPorId = (id) =>
  query(`SELECT * FROM ${TABLE} WHERE id = ?`, [id], "get");

const DeletarPorPriorizacao = (id_priorizacao) =>
  query(`DELETE FROM ${TABLE} WHERE id_priorizacao = ?`, [id_priorizacao], "run");

const BuscarPorPlanpal = (id_priorizacao, planpal) =>
  query(`SELECT * FROM ${TABLE} WHERE id_priorizacao = ? AND planpal = ?`, [id_priorizacao, planpal], "get");

const AtualizarCampos = (id, dados) =>
  query(
    `UPDATE ${TABLE} SET
       etiqueta=?, temperatura_1=?, temperatura_2=?,
       controle=?, variedade=?, fazenda=?,
       qtd_caixas=?, caixa_descricao=?, calibre=?, classe_prod=?,
       id_checklist=?, updated_at=datetime('now')
     WHERE id=?`,
    [
      dados.etiqueta ?? null,
      dados.temperatura_1 ?? null,
      dados.temperatura_2 ?? null,
      dados.controle ?? null,
      dados.variedade ?? null,
      dados.fazenda ?? null,
      dados.qtd_caixas ?? 0,
      dados.caixa_descricao ?? null,
      dados.calibre ?? null,
      dados.classe_prod ?? null,
      dados.id_checklist ?? null,
      id,
    ],
    "run"
  );

export default { Inserir, AtualizarEtiquetaTemp, AtualizarChecklist, AtualizarFotos, ListarPorPriorizacao, BuscarPorId, DeletarPorPriorizacao, BuscarPorPlanpal, AtualizarCampos };
