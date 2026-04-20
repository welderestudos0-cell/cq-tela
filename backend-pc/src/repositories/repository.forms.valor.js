import { query } from "../database/sqlite.js";

const TABLE = "forms_tot_valor";

const criarTabela = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao_lista TEXT NOT NULL,
      valor TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    [],
    "run"
  );

  // Popular dados padrão se a tabela estiver vazia
  const existentes = await query(
    `SELECT COUNT(*) as total FROM ${TABLE}`,
    [],
    "get"
  );

  if (existentes.total === 0) {
    const dadosPadrao = [
      // Tipos de análise — espelho do Oracle AGDTI.DXDW_FORMS_TOT_VALOR
      { descricao_lista: "lista_analises_frutos", valor: "Análise de Produção" },
      { descricao_lista: "lista_analises_frutos", valor: "Análise de Pré - Colheita" },
      { descricao_lista: "lista_analises_frutos", valor: "Análise de Acompanhamento" },
      { descricao_lista: "lista_analises_frutos", valor: "Análise de Shelf Life" },
      { descricao_lista: "lista_analises_frutos", valor: "Análise de Maturação Forçada (com Graduate)" },
      { descricao_lista: "lista_analises_frutos", valor: "Análise de Maturação Forçada (sem Graduate)" },
      { descricao_lista: "lista_analises_frutos", valor: "Análise de Campo" },
      { descricao_lista: "lista_analises_frutos", valor: "Análise de contentores" },
      // Danos internos
      { descricao_lista: "lista_danos_internos", valor: "Dano Mecânico" },
      { descricao_lista: "lista_danos_internos", valor: "Podridão Interna" },
      { descricao_lista: "lista_danos_internos", valor: "Escurecimento Interno" },
      { descricao_lista: "lista_danos_internos", valor: "Fibrosidade" },
      { descricao_lista: "lista_danos_internos", valor: "Colapso de Polpa" },
      { descricao_lista: "lista_danos_internos", valor: "Desidratação" },
      { descricao_lista: "lista_danos_internos", valor: "Fermentação" },
    ];

    for (const item of dadosPadrao) {
      await query(
        `INSERT OR IGNORE INTO ${TABLE} (descricao_lista, valor) VALUES (?, ?)`,
        [item.descricao_lista, item.valor],
        "run"
      );
    }
    console.log(`[FormsValor] Tabela ${TABLE} populada com dados padrão.`);
  }

  // Migração: sincroniza bases já populadas com o Oracle
  // Remove entradas que não existem no Oracle
  await query(
    `DELETE FROM ${TABLE} WHERE descricao_lista = 'lista_analises_frutos' AND valor = 'Análise de Lote'`,
    [],
    "run"
  );
  // Insere entradas que faltam
  const migrar = [
    { descricao_lista: "lista_analises_frutos", valor: "Análise de Produção" },
    { descricao_lista: "lista_analises_frutos", valor: "Análise de Acompanhamento" },
    { descricao_lista: "lista_analises_frutos", valor: "Análise de Maturação Forçada (com Graduate)" },
    { descricao_lista: "lista_analises_frutos", valor: "Análise de Maturação Forçada (sem Graduate)" },
    { descricao_lista: "lista_analises_frutos", valor: "Análise de Campo" },
    { descricao_lista: "lista_analises_frutos", valor: "Análise de contentores" },
  ];
  for (const item of migrar) {
    await query(
      `INSERT INTO ${TABLE} (descricao_lista, valor)
       SELECT ?, ? WHERE NOT EXISTS (
         SELECT 1 FROM ${TABLE} WHERE descricao_lista = ? AND valor = ?
       )`,
      [item.descricao_lista, item.valor, item.descricao_lista, item.valor],
      "run"
    );
  }
};

criarTabela().catch((err) =>
  console.error("Erro ao inicializar tabela forms_tot_valor:", err)
);

const Listar = () =>
  query(`SELECT * FROM ${TABLE} ORDER BY descricao_lista, valor ASC`, [], "all");

const ListarPorDescricao = (descricao_lista) =>
  query(
    `SELECT * FROM ${TABLE} WHERE descricao_lista = ? ORDER BY valor ASC`,
    [descricao_lista],
    "all"
  );

const Criar = async ({ descricao_lista, valor }) => {
  const result = await query(
    `INSERT OR IGNORE INTO ${TABLE} (descricao_lista, valor) VALUES (?, ?)`,
    [String(descricao_lista).trim(), String(valor).trim()],
    "run"
  );
  return { id: result.lastID, descricao_lista, valor };
};

const Deletar = async (id) => {
  await query(`DELETE FROM ${TABLE} WHERE id = ?`, [id], "run");
  return { ok: true };
};

export default { Listar, ListarPorDescricao, Criar, Deletar };
