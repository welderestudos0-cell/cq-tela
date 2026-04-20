// import { query } from "../database/sqlite.js";

// const TABLE = "bot_mensagens";

// const MENSAGENS_PADRAO = [
//   { chave: "menu_principal", titulo: "Menu Principal", descricao: "Menu para usuarios sem setor", modulo: "menu", conteudo: "{saudacao}, {nome}.\n\nO que vc deseja?\n\n1. Cadastrar usuario\n2. Maturacao forcada\n3. TI\n4. Controle de qualidade\n\nDigite o numero.\nPalavras diretas para a MF: maturacao, analise, mf" },
//   { chave: "menu_ti", titulo: "Menu TI", descricao: "Menu do setor de TI", modulo: "menu", conteudo: "{saudacao}, {nome}.\n\nTI - o que vc deseja?\n\n1. Falar com atendente\n2. Problema com SIA/SIAGRO\n3. Problema com MEGA/MEGADADOS\n4. Internet\n5. Solicitacao de notebook, celular\n\nDigite o numero.\nDigite C para cancelar." },
//   { chave: "menu_cq", titulo: "Menu Controle de Qualidade", descricao: "Menu do setor de CQ", modulo: "menu", conteudo: "{saudacao}, {nome}.\n\nControle de qualidade - o que vc deseja?\n\n1. Maturacao forcada\n2. Analise de furtos\n3. Pre-colheita\n\nDigite o numero.\nDigite C para cancelar." },
//   { chave: "menu_admin", titulo: "Menu Admin", descricao: "Menu para administradores", modulo: "menu", conteudo: "{saudacao}, {nome}.\n\nMenu admin - o que vc deseja?\n\n1. Cadastrar usuario\n2. Ver setores cadastrados\n3. TI\n4. Controle de qualidade\n5. Maturacao forcada\n\nDigite o numero.\nSe digitar um numero cadastrado, eu envio o contato.\nDigite C para cancelar." },
//   { chave: "ti_atendente_prompt", titulo: "TI - Pedir descricao do problema", descricao: "Solicita detalhes antes de encaminhar", modulo: "ti", conteudo: "Certo. Descreva o problema com o maximo de detalhes possivel." },
//   { chave: "ti_atendente_ok", titulo: "TI - Confirmacao do atendente", descricao: "Confirma que foi encaminhado para TI", modulo: "ti", conteudo: "Mensagem recebida.\n\nVou encaminhar para o atendimento de TI." },
//   { chave: "ti_sia_siagro", titulo: "TI - SIA/SIAGRO", descricao: "Resposta para problema com SIA ou SIAGRO", modulo: "ti", conteudo: "Problema com SIA/SIAGRO.\n\nMe informe o erro exibido e o usuario." },
//   { chave: "ti_mega", titulo: "TI - MEGA/MEGADADOS", descricao: "Resposta para problema com MEGA", modulo: "ti", conteudo: "Problema com MEGA/MEGADADOS.\n\nMe informe o erro exibido e a maquina." },
//   { chave: "ti_internet", titulo: "TI - Internet", descricao: "Resposta para problema de internet", modulo: "ti", conteudo: "Problema de internet.\n\nMe informe a localizacao e o que esta acontecendo." },
//   { chave: "ti_equipamento", titulo: "TI - Equipamento", descricao: "Solicitacao de notebook ou celular", modulo: "ti", conteudo: "Solicitacao de notebook ou celular.\n\nMe informe o equipamento e a justificativa." },
//   { chave: "cq_furtos_prompt", titulo: "CQ - Furtos (pedir dados)", descricao: "Solicita informacoes de furtos", modulo: "cq", conteudo: "Analise de furtos.\n\nMe informe a data, a fazenda e a parcela." },
//   { chave: "cq_furtos_ok", titulo: "CQ - Furtos (confirmacao)", descricao: "Confirmacao da analise de furtos", modulo: "cq", conteudo: "Solicitacao de analise de furtos recebida.\n\nNossa equipe vai avaliar as informacoes enviadas." },
//   { chave: "cq_precolheita_prompt", titulo: "CQ - Pre-colheita (pedir dados)", descricao: "Solicita informacoes de pre-colheita", modulo: "cq", conteudo: "Pre-colheita.\n\nMe informe a fazenda, a parcela e as observacoes." },
//   { chave: "cq_precolheita_ok", titulo: "CQ - Pre-colheita (confirmacao)", descricao: "Confirmacao da pre-colheita", modulo: "cq", conteudo: "Solicitacao de pre-colheita recebida.\n\nObrigado pelas informacoes." },
//   { chave: "cadastro_inicial", titulo: "Cadastro - Boas-vindas", descricao: "Primeiro contato de usuario nao cadastrado", modulo: "cadastro", conteudo: "{saudacao}, {nome}.\n\nSeu cadastro ainda nao foi encontrado.\n\nDigite o numero para cadastro.\nSe quiser, envie apenas:\n1. Cadastrar usuario\n2. Maturacao forcada\nDigite C para cancelar." },
//   { chave: "cadastro_setor", titulo: "Cadastro - Escolher setor", descricao: "Pergunta o setor do usuario", modulo: "cadastro", conteudo: "Escolha o setor:\n\n1. TI\n2. Controle de qualidade\n\nDigite o numero.\nDigite C para cancelar." },
// ];

// const criarTabela = async () => {
//   await query(
//     `CREATE TABLE IF NOT EXISTS ${TABLE} (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       chave TEXT NOT NULL UNIQUE,
//       titulo TEXT NOT NULL,
//       descricao TEXT DEFAULT '',
//       modulo TEXT DEFAULT 'geral',
//       conteudo TEXT NOT NULL,
//       updated_at TEXT DEFAULT (datetime('now'))
//     )`,
//     [], "run"
//   );
//   // migration: add modulo column if not exists
//   await query(`ALTER TABLE ${TABLE} ADD COLUMN modulo TEXT DEFAULT 'geral'`, [], "run").catch(() => {});

//   for (const m of MENSAGENS_PADRAO) {
//     await query(
//       `INSERT OR IGNORE INTO ${TABLE} (chave, titulo, descricao, modulo, conteudo) VALUES (?,?,?,?,?)`,
//       [m.chave, m.titulo, m.descricao, m.modulo, m.conteudo], "run"
//     );
//     // update modulo for existing rows that have default 'geral'
//     await query(
//       `UPDATE ${TABLE} SET modulo=? WHERE chave=? AND (modulo IS NULL OR modulo='geral')`,
//       [m.modulo, m.chave], "run"
//     );
//   }
// };

// criarTabela().catch((err) => console.error("Erro ao criar tabela bot_mensagens:", err));

// const Listar = () => query(`SELECT * FROM ${TABLE} ORDER BY modulo, id`, [], "all");

// const BuscarPorChave = (chave) =>
//   query(`SELECT * FROM ${TABLE} WHERE chave = ? LIMIT 1`, [chave], "get");

// const Criar = async ({ chave, titulo, descricao, modulo, conteudo }) => {
//   const result = await query(
//     `INSERT INTO ${TABLE} (chave, titulo, descricao, modulo, conteudo) VALUES (?,?,?,?,?)`,
//     [String(chave).trim(), String(titulo), String(descricao || ""), String(modulo || "geral"), String(conteudo)],
//     "run"
//   );
//   return query(`SELECT * FROM ${TABLE} WHERE id=? LIMIT 1`, [result.lastID], "get");
// };

// const Atualizar = async ({ chave, conteudo }) => {
//   await query(
//     `UPDATE ${TABLE} SET conteudo=?, updated_at=datetime('now') WHERE chave=?`,
//     [String(conteudo), String(chave)], "run"
//   );
//   return BuscarPorChave(chave);
// };

// const Resetar = async (chave) => {
//   const padrao = MENSAGENS_PADRAO.find((m) => m.chave === chave);
//   if (!padrao) return null;
//   return Atualizar({ chave, conteudo: padrao.conteudo });
// };

// const Deletar = async (chave) => {
//   await query(`DELETE FROM ${TABLE} WHERE chave=?`, [String(chave)], "run");
//   return { ok: true };
// };

// export default { Listar, BuscarPorChave, Criar, Atualizar, Resetar, Deletar };


import { query } from "../database/sqlite.js";

const TABLE = "bot_mensagens";

const MENSAGENS_PADRAO = [
  {
    chave: "menu_principal",
    titulo: "Menu Principal",
    descricao: "Menu para usuários sem setor definido",
    modulo: "menu",
    conteudo: "{saudacao}, {nome}.\n\nComo posso ajudar?\n\n1. Cadastrar usuário\n2. Maturação forçada\n3. TI\n4. Controle de qualidade\n\nDigite o número da opção desejada.\nPalavras-chave para MF: maturação, análise, mf"
  },
  {
    chave: "menu_ti",
    titulo: "Menu TI",
    descricao: "Menu do setor de TI",
    modulo: "menu",
    conteudo: "{saudacao}, {nome}.\n\nTI - como posso ajudar?\n\n1. Falar com atendente\n2. Problema com SIA/SIAGRO\n3. Problema com MEGA/MEGADADOS\n4. Internet\n5. Solicitação de notebook ou celular\n\nDigite o número da opção desejada.\nDigite C para cancelar."
  },
  {
    chave: "menu_cq",
    titulo: "Menu Controle de Qualidade",
    descricao: "Menu do setor de Controle de Qualidade",
    modulo: "menu",
    conteudo: "{saudacao}, {nome}.\n\nControle de Qualidade - como posso ajudar?\n\n1. Maturação forçada\n2. Análise de furtos\n3. Pré-colheita\n\nDigite o número da opção desejada.\nDigite C para cancelar."
  },
  {
    chave: "menu_admin",
    titulo: "Menu Admin",
    descricao: "Menu para administradores",
    modulo: "menu",
    conteudo: "{saudacao}, {nome}.\n\nMenu administrativo - como posso ajudar?\n\n1. Cadastrar usuário\n2. Ver setores cadastrados\n3. TI\n4. Controle de qualidade\n5. Maturação forçada\n6. Falar com atendente\n7. Gerenciar atendentes\n\nDigite o número da opção desejada.\nSe informar um número já cadastrado, enviarei o contato correspondente.\nDigite C para cancelar."
  },
  {
    chave: "ti_atendente_prompt",
    titulo: "TI - Solicitar descrição do problema",
    descricao: "Solicita detalhes antes de encaminhar",
    modulo: "ti",
    conteudo: "Certo.\n\nDescreva o problema com o máximo de detalhes possível."
  },
  {
    chave: "ti_atendente_ok",
    titulo: "TI - Confirmação do atendimento",
    descricao: "Confirma que a solicitação foi encaminhada para TI",
    modulo: "ti",
    conteudo: "Mensagem recebida com sucesso.\n\nSua solicitação será encaminhada para o atendimento de TI."
  },
  {
    chave: "ti_sia_siagro",
    titulo: "TI - SIA/SIAGRO",
    descricao: "Resposta para problema com SIA ou SIAGRO",
    modulo: "ti",
    conteudo: "Atendimento para SIA/SIAGRO.\n\nInforme, por favor, o erro apresentado e o usuário."
  },
  {
    chave: "ti_mega",
    titulo: "TI - MEGA/MEGADADOS",
    descricao: "Resposta para problema com MEGA",
    modulo: "ti",
    conteudo: "Atendimento para MEGA/MEGADADOS.\n\nInforme, por favor, o erro apresentado e a máquina."
  },
  {
    chave: "ti_internet",
    titulo: "TI - Internet",
    descricao: "Resposta para problema de internet",
    modulo: "ti",
    conteudo: "Atendimento para problema de internet.\n\nInforme, por favor, a localização e o que está ocorrendo."
  },
  {
    chave: "ti_equipamento",
    titulo: "TI - Equipamento",
    descricao: "Solicitação de notebook ou celular",
    modulo: "ti",
    conteudo: "Solicitação de notebook ou celular.\n\nInforme, por favor, o equipamento solicitado e a justificativa."
  },
  {
    chave: "cq_furtos_prompt",
    titulo: "CQ - Furtos (solicitar dados)",
    descricao: "Solicita informações sobre furtos",
    modulo: "cq",
    conteudo: "Análise de furtos.\n\nInforme, por favor, a data, a fazenda e a parcela."
  },
  {
    chave: "cq_furtos_ok",
    titulo: "CQ - Furtos (confirmação)",
    descricao: "Confirmação da análise de furtos",
    modulo: "cq",
    conteudo: "Solicitação de análise de furtos recebida com sucesso.\n\nNossa equipe avaliará as informações enviadas."
  },
  {
    chave: "cq_precolheita_prompt",
    titulo: "CQ - Pré-colheita (solicitar dados)",
    descricao: "Solicita informações de pré-colheita",
    modulo: "cq",
    conteudo: "Pré-colheita.\n\nInforme, por favor, a fazenda, a parcela e as observações."
  },
  {
    chave: "cq_precolheita_ok",
    titulo: "CQ - Pré-colheita (confirmação)",
    descricao: "Confirmação da pré-colheita",
    modulo: "cq",
    conteudo: "Solicitação de pré-colheita recebida com sucesso.\n\nAgradecemos pelas informações."
  },
  {
    chave: "cadastro_inicial",
    titulo: "Cadastro - Boas-vindas",
    descricao: "Primeiro contato de usuário não cadastrado",
    modulo: "cadastro",
    conteudo: "{saudacao}, {nome}.\n\nNão localizamos seu cadastro em nossa base.\n\nDigite o número da opção desejada:\n1. Cadastrar usuário\n2. Maturação forçada\n\nDigite C para cancelar."
  },
  {
    chave: "cadastro_setor",
    titulo: "Cadastro - Escolher setor",
    descricao: "Solicita o setor do usuário",
    modulo: "cadastro",
    conteudo: "Selecione o setor desejado:\n\n1. TI\n2. Controle de qualidade\n\nDigite o número da opção desejada.\nDigite C para cancelar."
  },
];

const criarTabela = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chave TEXT NOT NULL UNIQUE,
      titulo TEXT NOT NULL,
      descricao TEXT DEFAULT '',
      modulo TEXT DEFAULT 'geral',
      conteudo TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    [],
    "run"
  );

  await query(
    `ALTER TABLE ${TABLE} ADD COLUMN modulo TEXT DEFAULT 'geral'`,
    [],
    "run"
  ).catch(() => {});

  for (const m of MENSAGENS_PADRAO) {
    await query(
      `INSERT INTO ${TABLE} (chave, titulo, descricao, modulo, conteudo) VALUES (?,?,?,?,?)
       ON CONFLICT(chave) DO UPDATE SET titulo=excluded.titulo, descricao=excluded.descricao, modulo=excluded.modulo, conteudo=excluded.conteudo`,
      [m.chave, m.titulo, m.descricao, m.modulo, m.conteudo],
      "run"
    );
  }
};

criarTabela().catch((err) =>
  console.error("Erro ao criar tabela bot_mensagens:", err)
);

const Listar = () =>
  query(`SELECT * FROM ${TABLE} ORDER BY modulo, id`, [], "all");

const BuscarPorChave = (chave) =>
  query(`SELECT * FROM ${TABLE} WHERE chave = ? LIMIT 1`, [chave], "get");

const Criar = async ({ chave, titulo, descricao, modulo, conteudo }) => {
  const result = await query(
    `INSERT INTO ${TABLE} (chave, titulo, descricao, modulo, conteudo) VALUES (?,?,?,?,?)`,
    [
      String(chave).trim(),
      String(titulo),
      String(descricao || ""),
      String(modulo || "geral"),
      String(conteudo),
    ],
    "run"
  );

  return query(
    `SELECT * FROM ${TABLE} WHERE id=? LIMIT 1`,
    [result.lastID],
    "get"
  );
};

const Atualizar = async ({ chave, conteudo }) => {
  await query(
    `UPDATE ${TABLE} SET conteudo=?, updated_at=datetime('now') WHERE chave=?`,
    [String(conteudo), String(chave)],
    "run"
  );

  return BuscarPorChave(chave);
};

const Resetar = async (chave) => {
  const padrao = MENSAGENS_PADRAO.find((m) => m.chave === chave);
  if (!padrao) return null;
  return Atualizar({ chave, conteudo: padrao.conteudo });
};

const Deletar = async (chave) => {
  await query(`DELETE FROM ${TABLE} WHERE chave=?`, [String(chave)], "run");
  return { ok: true };
};

export default { Listar, BuscarPorChave, Criar, Atualizar, Resetar, Deletar };