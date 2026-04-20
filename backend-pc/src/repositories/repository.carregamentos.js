import { query } from "../database/sqlite.js";

const TABLE = "carregamentos";

const criarTabela = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plancarreg_codigo TEXT UNIQUE,
      container TEXT,
      apelido TEXT,
      motorista TEXT,
      data_saida TEXT,
      safra TEXT,
      pallets TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    [],
    "run"
  );

  const existentes = await query(
    `SELECT COUNT(*) as total FROM ${TABLE}`,
    [],
    "get"
  );

  const PALLETS_CARR001 = JSON.stringify([
    { palletId: "PAL-001", controle: "526", variedade: "KENT EUA", caixaDescricao: "Caixa 4kg Kent EUA", classProd: "1", calibre: "9",  etiqueta: "EUA-KENT-001", temp1: "-0.5", temp2: "-0.8", qtdCaixas: 80 },
    { palletId: "PAL-002", controle: "526", variedade: "KENT EUA", caixaDescricao: "Caixa 4kg Kent EUA", classProd: "1", calibre: "10", etiqueta: "EUA-KENT-002", temp1: "-0.6", temp2: "-0.7", qtdCaixas: 80 },
    { palletId: "PAL-003", controle: "526", variedade: "KENT EUA", caixaDescricao: "Caixa 4kg Kent EUA", classProd: "2", calibre: "12", etiqueta: "EUA-KENT-003", temp1: "-0.4", temp2: "-0.9", qtdCaixas: 72 },
  ]);

  if (existentes.total === 0) {
    await query(
      `INSERT OR IGNORE INTO ${TABLE} (plancarreg_codigo, container, apelido, motorista, data_saida, safra, pallets)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["CARR-001", "BMOU2345678", "Container Kent EUA", "João Silva", "2026-04-10", "2026", PALLETS_CARR001],
      "run"
    );
    console.log(`[Carregamentos] Tabela ${TABLE} populada com dados fake.`);
  } else {
    // Migração: atualiza pallets do CARR-001 para incluir campo variedade
    const carr001 = await query(`SELECT pallets FROM ${TABLE} WHERE plancarreg_codigo = 'CARR-001'`, [], "get");
    if (carr001) {
      const pallets = carr001.pallets ? JSON.parse(carr001.pallets) : [];
      const precisaMigrar = pallets.some((p) => !p.variedade);
      if (precisaMigrar) {
        await query(
          `UPDATE ${TABLE} SET pallets = ? WHERE plancarreg_codigo = 'CARR-001'`,
          [PALLETS_CARR001],
          "run"
        );
        console.log(`[Carregamentos] CARR-001 migrado com campo variedade.`);
      }
    }
  }
};

criarTabela().catch((err) =>
  console.error("Erro ao inicializar tabela carregamentos:", err)
);

const Listar = async () => {
  const rows = await query(
    `SELECT * FROM ${TABLE} ORDER BY data_saida DESC`,
    [],
    "all"
  );
  return rows.map((c) => ({
    id: c.id,
    container: c.container || "",
    apelido: c.apelido || "",
    motorista: c.motorista || "",
    dataSaida: c.data_saida || "",
    safra: c.safra || "",
    pallets: c.pallets ? JSON.parse(c.pallets) : [],
  }));
};

const BuscarPorId = async (id) => {
  const c = await query(`SELECT * FROM ${TABLE} WHERE id = ? LIMIT 1`, [id], "get");
  if (!c) return null;
  return { ...c, pallets: c.pallets ? JSON.parse(c.pallets) : [] };
};

const InserirAvaliacao = async ({ plancarreg_codigo, pallet_id, avaliacao }) => {
  const carregamento = await query(
    `SELECT * FROM ${TABLE} WHERE plancarreg_codigo = ? LIMIT 1`,
    [String(plancarreg_codigo)],
    "get"
  );
  if (!carregamento) return { ok: false, error: "Carregamento não encontrado" };

  const pallets = carregamento.pallets ? JSON.parse(carregamento.pallets) : [];
  const idx = pallets.findIndex((p) => String(p.palletId) === String(pallet_id));
  if (idx >= 0) {
    pallets[idx].avaliacao = avaliacao;
  }

  await query(
    `UPDATE ${TABLE} SET pallets = ? WHERE plancarreg_codigo = ?`,
    [JSON.stringify(pallets), String(plancarreg_codigo)],
    "run"
  );
  return { ok: true };
};

export default { Listar, BuscarPorId, InserirAvaliacao };
