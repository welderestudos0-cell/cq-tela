// backend/src/repositories/repository.consumo.agua.js
import { query } from "../database/sqlite.js";

// ========== CRIAR / MIGRAR TABELA ==========
const criarTabela = async () => {
  try {
    // Detecta qual versão existe
    const cols = await query("PRAGMA table_info(consumo_agua)", [], "all").catch(() => []);
    const colNames = (cols || []).map(c => c.name);

    const hasHidrometrosJson  = colNames.includes("hidrometros");     // v1: JSON
    const hasConsumoId        = colNames.includes("consumo_id");       // v3: flat (já atualizado)
    const hasV2               = colNames.length > 0 && !hasHidrometrosJson && !hasConsumoId; // v2: 2 tabelas

    if (hasHidrometrosJson || hasV2) {
      console.log("🔄 Migrando consumo_agua para schema flat...");
      await query("ALTER TABLE consumo_agua RENAME TO _consumo_agua_legacy_flat", [], "run");
    }

    // ===== TABELA ÚNICA COM TUDO =====
    await query(
      `CREATE TABLE IF NOT EXISTS consumo_agua (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        consumo_id      TEXT    NOT NULL,
        fazenda         TEXT    NOT NULL,
        talhao          TEXT,
        usuario         TEXT    NOT NULL,
        cargo           TEXT,
        matricula       TEXT,
        tipo_lancamento TEXT,
        dia_lancamento  TEXT,
        data_momento    TEXT,
        timestamp       TEXT,
        created_at      TEXT    DEFAULT (datetime('now', 'localtime')),
        hidrometro_nome TEXT,
        leitura_inicial REAL,
        leitura_final   REAL,
        consumo         REAL,
        foto_inicial    TEXT,
        foto_final      TEXT
      )`,
      [], "run"
    );

    // ===== MIGRAÇÃO v1 (JSON) =====
    if (hasHidrometrosJson) {
      const oldRows = await query("SELECT * FROM _consumo_agua_legacy_flat", [], "all").catch(() => []);
      for (const row of (oldRows || [])) {
        let hidros = [];
        try { hidros = JSON.parse(row.hidrometros || "[]"); } catch { hidros = []; }
        if (hidros.length === 0) hidros = [{}]; // garante ao menos 1 linha

        for (const h of hidros) {
          await query(
            `INSERT INTO consumo_agua (consumo_id, fazenda, talhao, usuario, cargo, matricula, tipo_lancamento, dia_lancamento, data_momento, timestamp, created_at, hidrometro_nome, leitura_inicial, leitura_final, consumo, foto_inicial, foto_final)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              String(row.id), row.fazenda, row.talhao, row.usuario, row.cargo, row.matricula,
              row.tipo_lancamento, row.dia_lancamento, row.data_momento, row.timestamp, row.created_at,
              h.nome || null, h.inicial ?? null, h.final ?? null, h.consumo ?? null,
              h.fotoInicial || null, h.fotoFinal || null,
            ], "run"
          );
        }
      }
      console.log(`✅ Migração v1→flat: ${(oldRows || []).length} registros`);
    }

    // ===== MIGRAÇÃO v2 (2 tabelas) =====
    if (hasV2) {
      const oldRows = await query("SELECT * FROM _consumo_agua_legacy_flat", [], "all").catch(() => []);
      const hidTable = await query("PRAGMA table_info(consumo_agua_hidrometros)", [], "all").catch(() => []);

      for (const row of (oldRows || [])) {
        let hidros = [];
        if (hidTable.length > 0) {
          hidros = await query(
            "SELECT * FROM consumo_agua_hidrometros WHERE consumo_agua_id = ?", [row.id], "all"
          ).catch(() => []);
        }
        if (!hidros || hidros.length === 0) hidros = [{}];

        for (const h of hidros) {
          await query(
            `INSERT INTO consumo_agua (consumo_id, fazenda, talhao, usuario, cargo, matricula, tipo_lancamento, dia_lancamento, data_momento, timestamp, created_at, hidrometro_nome, leitura_inicial, leitura_final, consumo, foto_inicial, foto_final)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              String(row.id), row.fazenda, row.talhao, row.usuario, row.cargo, row.matricula,
              row.tipo_lancamento, row.dia_lancamento, row.data_momento, row.timestamp, row.created_at,
              h.nome || null, h.leitura_inicial ?? null, h.leitura_final ?? null, h.consumo ?? null,
              h.foto_inicial || null, h.foto_final || null,
            ], "run"
          );
        }
      }
      console.log(`✅ Migração v2→flat: ${(oldRows || []).length} registros`);
    }

    console.log("✅ Tabela consumo_agua (flat) verificada/criada");
  } catch (error) {
    console.error("❌ Erro ao criar tabela consumo_agua:", error);
  }
};

criarTabela();

// ========== INSERIR ==========
const Inserir = async (data) => {
  try {
    console.log("📊 Repository: Inserindo consumo de água:", data);

    let hidros = data.hidrometros;
    if (typeof hidros === "string") {
      try { hidros = JSON.parse(hidros); } catch { hidros = []; }
    }
    if (!Array.isArray(hidros) || hidros.length === 0) hidros = [{}];

    const consumoId = String(data.id || Date.now());

    for (const h of hidros) {
      await query(
        `INSERT INTO consumo_agua (consumo_id, fazenda, talhao, usuario, cargo, matricula, tipo_lancamento, dia_lancamento, data_momento, timestamp, hidrometro_nome, leitura_inicial, leitura_final, consumo, foto_inicial, foto_final)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          consumoId,
          data.fazenda,
          data.talhao || "Não informado",
          data.usuario,
          data.cargo || "",
          data.matricula || "",
          data.tipo_lancamento || "",
          data.dia_lancamento || "",
          data.data_momento || new Date().toISOString(),
          data.timestamp || new Date().toISOString(),
          h.nome || null,
          h.inicial ?? null,
          h.final ?? null,
          h.consumo ?? null,
          h.fotoInicial || null,
          h.fotoFinal || null,
        ],
        "run"
      );
    }

    console.log(`✅ Consumo de água inserido (consumo_id=${consumoId}, ${hidros.length} hidrômetro(s))`);
    return { consumo_id: consumoId, hidrometros_inseridos: hidros.length };
  } catch (error) {
    console.error("❌ Erro ao inserir consumo de água:", error);
    throw error;
  }
};

// ========== LISTAR ==========
// Retorna registros agrupados por consumo_id com array de hidrometros
// filtros: { fazenda, mes, tipo_lancamento }
const Listar = async (filtros = {}) => {
  try {
    let sql = "SELECT * FROM consumo_agua WHERE 1=1";
    const params = [];

    if (filtros.fazenda) {
      sql += " AND LOWER(fazenda) = LOWER(?)";
      params.push(filtros.fazenda);
    }
    if (filtros.mes) {
      sql += " AND tipo_lancamento = 'mensal' AND LOWER(dia_lancamento) = LOWER(?)";
      params.push(filtros.mes);
    }
    if (filtros.tipo_lancamento) {
      sql += " AND tipo_lancamento = ?";
      params.push(filtros.tipo_lancamento);
    }

    sql += " ORDER BY created_at DESC";

    const rows = await query(sql, params, "all");
    return agruparPorConsumoId(rows || []);
  } catch (error) {
    console.error("❌ Erro ao listar consumo de água:", error);
    throw error;
  }
};

// ========== ATUALIZAR (leitura final + foto final) ==========
// Atualiza as linhas existentes de um consumo_id com leitura_final, consumo e foto_final
const Atualizar = async (consumo_id, dados) => {
  try {
    const hidros = dados.hidrometros || [];

    for (const h of hidros) {
      const final   = h.final   !== undefined && h.final   !== null ? h.final   : null;
      const inicial = h.inicial !== undefined && h.inicial !== null ? h.inicial : null;
      const consumo = (inicial !== null && final !== null) ? final - inicial : null;
      const fotoFinal = h.fotoFinal || null;

      await query(
        `UPDATE consumo_agua
           SET leitura_final = ?, consumo = ?, foto_final = ?
         WHERE consumo_id = ? AND LOWER(hidrometro_nome) = LOWER(?)`,
        [final, consumo, fotoFinal, String(consumo_id), h.nome || ''],
        'run'
      );
    }

    console.log(`✅ Consumo de água atualizado (consumo_id=${consumo_id})`);
    return { consumo_id, success: true, action: 'updated' };
  } catch (error) {
    console.error('❌ Erro ao atualizar consumo de água:', error);
    throw error;
  }
};

// ========== BUSCAR POR ID ==========
const BuscarPorId = async (id) => {
  try {
    const rows = await query(
      "SELECT * FROM consumo_agua WHERE consumo_id = ?", [String(id)], "all"
    );
    if (!rows || rows.length === 0) return null;
    const agrupados = agruparPorConsumoId(rows);
    return agrupados[0] || null;
  } catch (error) {
    console.error("❌ Erro ao buscar consumo de água:", error);
    throw error;
  }
};

// ========== HELPER: agrupa linhas flat em objetos com array de hidrometros ==========
const agruparPorConsumoId = (rows) => {
  const mapa = new Map();
  for (const row of rows) {
    if (!mapa.has(row.consumo_id)) {
      mapa.set(row.consumo_id, {
        id: row.consumo_id,
        fazenda: row.fazenda,
        talhao: row.talhao,
        usuario: row.usuario,
        cargo: row.cargo,
        matricula: row.matricula,
        tipo_lancamento: row.tipo_lancamento,
        dia_lancamento: row.dia_lancamento,
        data_momento: row.data_momento,
        timestamp: row.timestamp,
        created_at: row.created_at,
        hidrometros: [],
      });
    }
    if (row.hidrometro_nome !== null || row.leitura_inicial !== null) {
      mapa.get(row.consumo_id).hidrometros.push({
        nome: row.hidrometro_nome,
        inicial: row.leitura_inicial,
        final: row.leitura_final,
        consumo: row.consumo,
        fotoInicial: row.foto_inicial,
        fotoFinal: row.foto_final,
      });
    }
  }
  return Array.from(mapa.values());
};

export default { Inserir, Atualizar, Listar, BuscarPorId };
