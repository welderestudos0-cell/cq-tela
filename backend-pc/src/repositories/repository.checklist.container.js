import { query } from "../database/sqlite.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tabela: checklist_container
// Um registro por priorização. Cada coluna = uma pergunta do checklist.
// Respostas: 'C' | 'NC' | 'S' (Sim) | 'N' (Não) | null (não respondido)
// Perguntas com temperatura têm coluna extra _temp.
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = "checklist_container";

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    id_priorizacao              INTEGER NOT NULL,
    id_pallets_priorizacao      INTEGER,
    oc                          INTEGER,

    -- Pergunta 1: Interior limpo
    interior_limpo              TEXT,
    -- Pergunta 2: Sem estragos / borrachas
    sem_estragos_borrachas      TEXT,
    -- Pergunta 3: Drenagem aberta
    drenagem_aberta             TEXT,
    -- Pergunta 4: Refrigeração operando
    refrigeracao_operando       TEXT,
    -- Pergunta 5: Pré-resfriado (C/NC + temperatura)
    pre_resfriado               TEXT,
    pre_resfriado_temp          TEXT,
    -- Pergunta 6: Ventilação exposta (Sim/Não)
    ventilacao_exposta          TEXT,
    -- Pergunta 7: Ventilação 40 CBM
    ventilacao_40cbm            TEXT,
    -- Pergunta 8: Identificação correta
    identificacao_correta       TEXT,
    -- Pergunta 9: Sensores funcionando
    sensores_funcionando        TEXT,
    -- Pergunta 10: Registradores na posição
    registradores_posicao       TEXT,
    -- Pergunta 11: Absorvedor de etileno (Sim/Não)
    absorvedor_etileno          TEXT,
    -- Pergunta 12: Sanitizado com ácido peracético
    sanitizado_acido            TEXT,
    -- Pergunta 13: Qualidade da paletização
    qualidade_paletizacao       TEXT,
    -- Pergunta 14: Carga na temperatura correta
    carga_temperatura_correta   TEXT,
    -- Pergunta 15: Lacre colocado
    lacre_colocado              TEXT,
    -- Pergunta 16: Temperatura de saída (C/NC + temperatura)
    temperatura_saida           TEXT,
    temperatura_saida_temp      TEXT,

    created_at                  TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (id_priorizacao) REFERENCES priorizacao(id)
  )
`;

await query(CREATE_SQL, [], "run").catch((e) =>
  console.error("[checklist_container] Erro ao criar tabela:", e.message)
);

const Inserir = (dados) =>
  query(
    `INSERT INTO ${TABLE}
       (id_priorizacao, id_pallets_priorizacao, oc,
        interior_limpo, sem_estragos_borrachas, drenagem_aberta, refrigeracao_operando,
        pre_resfriado, pre_resfriado_temp,
        ventilacao_exposta, ventilacao_40cbm, identificacao_correta, sensores_funcionando,
        registradores_posicao, absorvedor_etileno, sanitizado_acido, qualidade_paletizacao,
        carga_temperatura_correta, lacre_colocado,
        temperatura_saida, temperatura_saida_temp)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      dados.id_priorizacao,
      dados.id_pallets_priorizacao ?? null,
      dados.oc,
      dados.interior_limpo ?? null,
      dados.sem_estragos_borrachas ?? null,
      dados.drenagem_aberta ?? null,
      dados.refrigeracao_operando ?? null,
      dados.pre_resfriado ?? null,
      dados.pre_resfriado_temp ?? null,
      dados.ventilacao_exposta ?? null,
      dados.ventilacao_40cbm ?? null,
      dados.identificacao_correta ?? null,
      dados.sensores_funcionando ?? null,
      dados.registradores_posicao ?? null,
      dados.absorvedor_etileno ?? null,
      dados.sanitizado_acido ?? null,
      dados.qualidade_paletizacao ?? null,
      dados.carga_temperatura_correta ?? null,
      dados.lacre_colocado ?? null,
      dados.temperatura_saida ?? null,
      dados.temperatura_saida_temp ?? null,
    ],
    "run"
  );

const BuscarPorPriorizacao = (id_priorizacao) =>
  query(`SELECT * FROM ${TABLE} WHERE id_priorizacao = ?`, [id_priorizacao], "get");

const Atualizar = (id, dados) =>
  query(
    `UPDATE ${TABLE} SET
       interior_limpo=?, sem_estragos_borrachas=?, drenagem_aberta=?, refrigeracao_operando=?,
       pre_resfriado=?, pre_resfriado_temp=?,
       ventilacao_exposta=?, ventilacao_40cbm=?, identificacao_correta=?, sensores_funcionando=?,
       registradores_posicao=?, absorvedor_etileno=?, sanitizado_acido=?, qualidade_paletizacao=?,
       carga_temperatura_correta=?, lacre_colocado=?,
       temperatura_saida=?, temperatura_saida_temp=?
     WHERE id=?`,
    [
      dados.interior_limpo ?? null,
      dados.sem_estragos_borrachas ?? null,
      dados.drenagem_aberta ?? null,
      dados.refrigeracao_operando ?? null,
      dados.pre_resfriado ?? null,
      dados.pre_resfriado_temp ?? null,
      dados.ventilacao_exposta ?? null,
      dados.ventilacao_40cbm ?? null,
      dados.identificacao_correta ?? null,
      dados.sensores_funcionando ?? null,
      dados.registradores_posicao ?? null,
      dados.absorvedor_etileno ?? null,
      dados.sanitizado_acido ?? null,
      dados.qualidade_paletizacao ?? null,
      dados.carga_temperatura_correta ?? null,
      dados.lacre_colocado ?? null,
      dados.temperatura_saida ?? null,
      dados.temperatura_saida_temp ?? null,
      id,
    ],
    "run"
  );

const DeletarPorPriorizacao = (id_priorizacao) =>
  query(`DELETE FROM ${TABLE} WHERE id_priorizacao = ?`, [id_priorizacao], "run");

export default { Inserir, BuscarPorPriorizacao, Atualizar, DeletarPorPriorizacao };
