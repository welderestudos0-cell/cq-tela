import { query } from "../database/sqlite.js";

const TF = "bot_fluxos";
const TE = "bot_fluxo_etapas";

const criarTabelas = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TF} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      descricao TEXT DEFAULT '',
      gatilho_palavras TEXT DEFAULT '',
      ativo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`, [], "run"
  );
  await query(
    `CREATE TABLE IF NOT EXISTS ${TE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fluxo_id INTEGER NOT NULL,
      chave TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      opcoes TEXT DEFAULT '[]',
      eh_final INTEGER DEFAULT 0,
      ordem INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (fluxo_id) REFERENCES ${TF}(id) ON DELETE CASCADE
    )`, [], "run"
  );
};

criarTabelas().catch((err) => console.error("Erro ao criar tabelas bot_fluxos:", err));

const ListarFluxos = () =>
  query(`SELECT * FROM ${TF} ORDER BY nome`, [], "all");

const ListarFluxosAtivos = () =>
  query(`SELECT * FROM ${TF} WHERE ativo=1 ORDER BY nome`, [], "all");

const BuscarFluxoPorId = (id) =>
  query(`SELECT * FROM ${TF} WHERE id=? LIMIT 1`, [id], "get");

const CriarFluxo = async ({ nome, descricao, gatilho_palavras }) => {
  const r = await query(
    `INSERT INTO ${TF} (nome, descricao, gatilho_palavras) VALUES (?,?,?)`,
    [String(nome).trim(), String(descricao || ""), String(gatilho_palavras || "")], "run"
  );
  return BuscarFluxoPorId(r.lastID);
};

const AtualizarFluxo = async (id, { nome, descricao, gatilho_palavras, ativo }) => {
  await query(
    `UPDATE ${TF} SET nome=?, descricao=?, gatilho_palavras=?, ativo=?, updated_at=datetime('now') WHERE id=?`,
    [String(nome || ""), String(descricao ?? ""), String(gatilho_palavras ?? ""), ativo !== undefined ? (ativo ? 1 : 0) : 1, id],
    "run"
  );
  return BuscarFluxoPorId(id);
};

const DeletarFluxo = (id) =>
  query(`DELETE FROM ${TF} WHERE id=?`, [id], "run");

// Etapas
const ListarEtapasPorFluxo = (fluxo_id) =>
  query(`SELECT * FROM ${TE} WHERE fluxo_id=? ORDER BY ordem, id`, [fluxo_id], "all");

const BuscarEtapaPorId = (id) =>
  query(`SELECT * FROM ${TE} WHERE id=? LIMIT 1`, [id], "get");

const BuscarEtapaPorChave = (fluxo_id, chave) =>
  query(`SELECT * FROM ${TE} WHERE fluxo_id=? AND chave=? LIMIT 1`, [fluxo_id, chave], "get");

const CriarEtapa = async (fluxo_id, { chave, mensagem, opcoes, eh_final, ordem }) => {
  const r = await query(
    `INSERT INTO ${TE} (fluxo_id, chave, mensagem, opcoes, eh_final, ordem) VALUES (?,?,?,?,?,?)`,
    [fluxo_id, String(chave).trim(), String(mensagem), JSON.stringify(opcoes || []), eh_final ? 1 : 0, ordem ?? 0],
    "run"
  );
  return BuscarEtapaPorId(r.lastID);
};

const AtualizarEtapa = async (id, { chave, mensagem, opcoes, eh_final, ordem }) => {
  await query(
    `UPDATE ${TE} SET chave=?, mensagem=?, opcoes=?, eh_final=?, ordem=? WHERE id=?`,
    [String(chave).trim(), String(mensagem), JSON.stringify(opcoes || []), eh_final ? 1 : 0, ordem ?? 0, id],
    "run"
  );
  return BuscarEtapaPorId(id);
};

const DeletarEtapa = (id) =>
  query(`DELETE FROM ${TE} WHERE id=?`, [id], "run");

export default {
  ListarFluxos, ListarFluxosAtivos, BuscarFluxoPorId,
  CriarFluxo, AtualizarFluxo, DeletarFluxo,
  ListarEtapasPorFluxo, BuscarEtapaPorId, BuscarEtapaPorChave,
  CriarEtapa, AtualizarEtapa, DeletarEtapa,
};
