import * as SQLite from 'expo-sqlite';

let db = null;

const getDb = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync('conferencia_camaras.db');
  }
  return db;
};

// ─── Criação das tabelas ───────────────────────────────────────────────────────

export const initDB = async () => {
  const database = await getDb();

  // Tabela de containers — espelho de DXDW_CQ_CAMARAS_QL_CONTAINERS
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS DXDW_CQ_CAMARAS_QL_CONTAINERS (
      CONTAINER   TEXT,
      N_ETIQUETA  TEXT,
      TERMOGRAFO  TEXT,
      ID_1        TEXT,
      ID_2        TEXT,
      ID_3        TEXT,
      ID_4        TEXT,
      ID_5        TEXT,
      ID_6        TEXT,
      ID_7        TEXT,
      ID_8        TEXT,
      ID_9        TEXT,
      ID_10       TEXT,
      ID_11       TEXT,
      ID_12       TEXT,
      ID_13       TEXT,
      ID_14       TEXT,
      ID_15       TEXT,
      ID_16       TEXT,
      ID_17       TEXT,
      ID_18       TEXT,
      ID_19       TEXT,
      ID_20       TEXT,
      ID_21       TEXT,
      ID_22       TEXT,
      usuario     TEXT,
      momento     TEXT,
      sincronizado INTEGER DEFAULT 0,
      PRIMARY KEY (CONTAINER)
    );
  `);

  // Tabela de pallets — espelho de DXDW_CQ_CAMARAS_QL_PALLETS
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS DXDW_CQ_CAMARAS_QL_PALLETS (
      CONTAINER    TEXT,
      ETIQUETA     TEXT,
      PALLET       TEXT,
      TEMPERATURA_1 TEXT,
      TEMPERATURA_2 TEXT,
      PRIMARY KEY (CONTAINER, PALLET)
    );
  `);

  console.log('[DB] Tabelas criadas/verificadas com sucesso.');
};

// ─── Containers ───────────────────────────────────────────────────────────────

/**
 * Salva ou atualiza um container no SQLite.
 * O checklist (16 perguntas) é mapeado para ID_1...ID_22 igual ao banco Oracle.
 *
 * analise_carregamento = [{ id, key, conforme, valor }]
 */
export const salvarContainer = async ({ container, n_etiqueta, termografo, usuario, momento, analise_carregamento = [] }) => {
  const database = await getDb();

  // Monta colunas ID_1..ID_22 a partir do array de perguntas
  const ids = {};
  for (let i = 1; i <= 22; i++) ids[`ID_${i}`] = '';

  analise_carregamento.forEach(({ id, conforme, valor }) => {
    const col = `ID_${id}`;
    if (col in ids) {
      // IDs 8, 13, 21, 22 gravam "conforme - valor" juntos
      if ([8, 13, 21, 22].includes(id) && valor) {
        ids[col] = `${conforme} - ${valor}`;
      } else {
        ids[col] = String(conforme);
      }
    }
  });

  await database.runAsync(
    `INSERT INTO DXDW_CQ_CAMARAS_QL_CONTAINERS (
      CONTAINER, N_ETIQUETA, TERMOGRAFO,
      ID_1, ID_2, ID_3, ID_4, ID_5, ID_6, ID_7, ID_8, ID_9, ID_10, ID_11,
      ID_12, ID_13, ID_14, ID_15, ID_16, ID_17, ID_18, ID_19, ID_20, ID_21, ID_22,
      usuario, momento, sincronizado
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, 0
    )
    ON CONFLICT(CONTAINER) DO UPDATE SET
      N_ETIQUETA  = excluded.N_ETIQUETA,
      TERMOGRAFO  = excluded.TERMOGRAFO,
      ID_1 = excluded.ID_1, ID_2 = excluded.ID_2, ID_3 = excluded.ID_3,
      ID_4 = excluded.ID_4, ID_5 = excluded.ID_5, ID_6 = excluded.ID_6,
      ID_7 = excluded.ID_7, ID_8 = excluded.ID_8, ID_9 = excluded.ID_9,
      ID_10 = excluded.ID_10, ID_11 = excluded.ID_11, ID_12 = excluded.ID_12,
      ID_13 = excluded.ID_13, ID_14 = excluded.ID_14, ID_15 = excluded.ID_15,
      ID_16 = excluded.ID_16, ID_17 = excluded.ID_17, ID_18 = excluded.ID_18,
      ID_19 = excluded.ID_19, ID_20 = excluded.ID_20, ID_21 = excluded.ID_21,
      ID_22 = excluded.ID_22,
      usuario  = excluded.usuario,
      momento  = excluded.momento;`,
    [
      String(container), n_etiqueta || '', termografo || '',
      ids.ID_1, ids.ID_2, ids.ID_3, ids.ID_4, ids.ID_5, ids.ID_6,
      ids.ID_7, ids.ID_8, ids.ID_9, ids.ID_10, ids.ID_11, ids.ID_12,
      ids.ID_13, ids.ID_14, ids.ID_15, ids.ID_16, ids.ID_17, ids.ID_18,
      ids.ID_19, ids.ID_20, ids.ID_21, ids.ID_22,
      usuario || '', momento || '',
    ]
  );
};

export const buscarContainer = async (container) => {
  const database = await getDb();
  return await database.getFirstAsync(
    'SELECT * FROM DXDW_CQ_CAMARAS_QL_CONTAINERS WHERE CONTAINER = ?',
    [String(container)]
  );
};

export const buscarTodosContainers = async () => {
  const database = await getDb();
  return await database.getAllAsync('SELECT * FROM DXDW_CQ_CAMARAS_QL_CONTAINERS ORDER BY momento DESC');
};

export const marcarContainerSincronizado = async (container) => {
  const database = await getDb();
  await database.runAsync(
    'UPDATE DXDW_CQ_CAMARAS_QL_CONTAINERS SET sincronizado = 1 WHERE CONTAINER = ?',
    [String(container)]
  );
};

// ─── Pallets ──────────────────────────────────────────────────────────────────

/**
 * Salva ou atualiza um pallet de um container.
 * pallets = [{ PLANCARREG_IN_CODIGO, PLANPAL_IN_CODIGO, TEMPERATURA_1, TEMPERATURA_2, ETIQUETA }]
 */
export const salvarPallets = async (container, pallets = []) => {
  const database = await getDb();

  for (const p of pallets) {
    await database.runAsync(
      `INSERT INTO DXDW_CQ_CAMARAS_QL_PALLETS (CONTAINER, ETIQUETA, PALLET, TEMPERATURA_1, TEMPERATURA_2)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(CONTAINER, PALLET) DO UPDATE SET
         ETIQUETA      = excluded.ETIQUETA,
         TEMPERATURA_1 = excluded.TEMPERATURA_1,
         TEMPERATURA_2 = excluded.TEMPERATURA_2;`,
      [
        String(container),
        p.ETIQUETA ? 'true' : 'false',
        String(p.PLANPAL_IN_CODIGO),
        String(p.TEMPERATURA_1 || '').replace(',', '.'),
        String(p.TEMPERATURA_2 || '').replace(',', '.'),
      ]
    );
  }
};

export const buscarPalletsDoContainer = async (container) => {
  const database = await getDb();
  return await database.getAllAsync(
    'SELECT * FROM DXDW_CQ_CAMARAS_QL_PALLETS WHERE CONTAINER = ?',
    [String(container)]
  );
};

export const deletarPalletsDoContainer = async (container) => {
  const database = await getDb();
  await database.runAsync(
    'DELETE FROM DXDW_CQ_CAMARAS_QL_PALLETS WHERE CONTAINER = ?',
    [String(container)]
  );
};

// ─── Montar payload para a API (inserirAvaliacaoContainer) ───────────────────

/**
 * Lê o SQLite e monta o JSON exato que a API 5 espera.
 */
export const buildPayloadAPI = async ({ container, carregamento, usuario }) => {
  const contRow = await buscarContainer(container);
  const palletRows = await buscarPalletsDoContainer(container);

  if (!contRow) return null;

  // Reconstrói o array analise_carregamento a partir das colunas ID_1..ID_22
  const analise_carregamento = [];
  for (let i = 1; i <= 22; i++) {
    const val = contRow[`ID_${i}`] || '';
    // Colunas com valor "conforme - valor" (IDs 8, 13, 21, 22)
    if ([8, 13, 21, 22].includes(i) && val.includes(' - ')) {
      const [confStr, valor] = val.split(' - ');
      analise_carregamento.push({ id: i, conforme: confStr === 'true', valor: valor || '' });
    } else {
      analise_carregamento.push({ id: i, conforme: val === 'true', valor: '' });
    }
  }

  const pallets = palletRows.map((p) => ({
    PLANCARREG_IN_CODIGO: Number(carregamento),
    PLANPAL_IN_CODIGO: Number(p.PALLET),
    TEMPERATURA_1: p.TEMPERATURA_1 || '',
    TEMPERATURA_2: p.TEMPERATURA_2 || '',
    ETIQUETA: p.ETIQUETA === 'true',
  }));

  return {
    carregamento: Number(carregamento),
    n_etiqueta: contRow.N_ETIQUETA || '',
    termografo: contRow.TERMOGRAFO || '',
    usuario: usuario || contRow.usuario || '',
    momento: contRow.momento || new Date().toISOString().replace('T', ' ').substring(0, 19),
    sincronizado: contRow.sincronizado === 1,
    pallets,
    analise_carregamento,
  };
};
