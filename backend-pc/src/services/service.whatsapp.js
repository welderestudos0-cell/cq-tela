import pkg from "whatsapp-web.js";
import fs from "fs";
import qrcode from "qrcode-terminal";
import path from "path";
import { fileURLToPath } from "url";
import repositoryWhatsappUsuario from "../repositories/repository.whatsapp.usuario.js";
import repositoryBotMensagens from "../repositories/repository.bot.mensagens.js";
import repositoryBotFluxos from "../repositories/repository.bot.fluxos.js";
import repositoryMF from "../repositories/repository.maturacao.forcada.js";
import repositoryAF from "../repositories/repository.analise.frutos.js";
import repositoryRE from "../repositories/repository.relatorio.embarque.sede.js";
import repositoryBotVinculos from "../repositories/repository.bot.vinculos.js";
import repositoryAtendentes from "../repositories/repository.atendentes.js";
import {
  gerarRelatorioPDF,
  gerarRelatorioMFPDFDetalhado,
  listarDatasMF,
  listarRegistrosMFPorData,
} from "./service.pdf.js";

const { Client, LocalAuth, MessageMedia } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, "../../");
const WA_LOCALAUTH_ROOT = path.join(__dirname, "../../.wwebjs_auth");
const WA_LOCALAUTH_SESSION_DIR = path.join(WA_LOCALAUTH_ROOT, "session");
const WA_STALE_LOCK_FILES = ["SingletonLock", "SingletonCookie", "SingletonSocket", "DevToolsActivePort"];

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: WA_LOCALAUTH_ROOT,
  }),
  puppeteer: {
    headless: true,
    protocolTimeout: 180000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

let clientePronto = false;
let grupoIdCache = null;
let envioPendentesPromise = null;
let initializePromise = null;
let reconexaoPromise = null;

const conversas = new Map();
const mensagensCache = new Map();
const cooldownMap = new Map();
const inactivityTimers = new Map();
const pontes = new Map();
const ponteReversa = new Map();
const COOLDOWN_MS = 3000;
const INACTIVITY_MS = 2 * 60 * 1000;

async function carregarMensagens() {
  try {
    const lista = await repositoryBotMensagens.Listar();
    lista.forEach((m) => mensagensCache.set(m.chave, m.conteudo));
    console.log(`[Bot] ${lista.length} mensagens carregadas do banco.`);
  } catch (err) {
    console.error("[Bot] Erro ao carregar mensagens:", err.message);
  }
}

export async function recarregarMensagens() {
  await carregarMensagens();
}

function getMensagem(chave, vars = {}) {
  let texto = mensagensCache.get(chave) || `[mensagem nao configurada: ${chave}]`;
  texto = texto.replace(/\{saudacao\}/g, saudacao());
  texto = texto.replace(/\{nome\}/g, vars.nome || "");
  texto = texto.replace(/\{cancelar\}/g, "Digite C para cancelar.");
  return texto;
}

carregarMensagens();

// ─── Fluxos dinâmicos ─────────────────────────────────────────────────────────
let fluxosCache = [];
let vinculosCache = [];

async function carregarFluxos() {
  try {
    fluxosCache = await repositoryBotFluxos.ListarFluxosAtivos();
    console.log(`[Bot] ${fluxosCache.length} fluxos dinamicos carregados.`);
  } catch (err) {
    console.error("[Bot] Erro ao carregar fluxos:", err.message);
  }
}

export async function recarregarFluxos() {
  await carregarFluxos();
}

async function carregarVinculos() {
  try {
    vinculosCache = await repositoryBotVinculos.ListarAtivos();
    console.log(`[Bot] ${vinculosCache.length} vinculos de fluxos carregados.`);
  } catch (err) {
    console.error("[Bot] Erro ao carregar vinculos:", err.message);
  }
}

export async function recarregarVinculos() {
  await carregarVinculos();
}

carregarFluxos();
carregarVinculos();

// ─── Cache de atendentes ──────────────────────────────────────────────────────
let atendentesCacheDB = [];

async function carregarAtendentes() {
  try {
    atendentesCacheDB = await repositoryAtendentes.Listar();
    console.log(`[Bot] ${atendentesCacheDB.length} atendente(s) carregado(s).`);
  } catch (err) {
    console.error("[Bot] Erro ao carregar atendentes:", err.message);
  }
}

carregarAtendentes();
// ─────────────────────────────────────────────────────────────────────────────

function fluxoCachePorId(fluxoId) {
  return fluxosCache.find((item) => Number(item.id) === Number(fluxoId)) || null;
}

async function iniciarFluxoDinamico(msg, fluxo) {
  const etapas = await repositoryBotFluxos.ListarEtapasPorFluxo(fluxo.id);
  const inicio = etapas.find((item) => item.chave === "inicio") || etapas[0];
  if (!inicio) return false;

  conversas.set(msg.from, {
    etapa: "fluxo_dinamico",
    dados: { fluxo_id: fluxo.id, etapa_id: inicio.id },
  });
  await msg.reply(inicio.mensagem);
  return true;
}

function normalizarSetor(valor) {
  const texto = String(valor || "").trim().toUpperCase();
  if (!texto) return "";
  if (texto === "TI" || texto.includes("TECNOLOGIA")) return "TI";
  if (texto === "ADMIN" || texto === "ADMINISTRADOR" || texto === "ADMINISTRATIVO") return "ADMIN";
  if (texto.includes("QUALIDADE") || texto.includes("CONTROLE")) return "CONTROLE DE QUALIDADE";
  return texto;
}

function buscarFluxoVinculado({ numero, setor, ehAdmin }) {
  const numeroNormalizado = normalizarNumero(numero);
  const setorNormalizado = normalizarSetor(setor);

  if (numeroNormalizado) {
    const vinculoNumero = vinculosCache.find(
      (item) => item.tipo === "numero" && item.valor === numeroNormalizado
    );
    if (vinculoNumero) {
      return fluxoCachePorId(vinculoNumero.fluxo_id) || { id: vinculoNumero.fluxo_id };
    }
  }

  if (ehAdmin) {
    const vinculoAdmin = vinculosCache.find((item) => item.tipo === "admin");
    if (vinculoAdmin) {
      return fluxoCachePorId(vinculoAdmin.fluxo_id) || { id: vinculoAdmin.fluxo_id };
    }
  }

  if (setorNormalizado) {
    const vinculoSetor = vinculosCache.find(
      (item) =>
        item.tipo === "setor" &&
        normalizarSetor(item.valor) === setorNormalizado
    );
    if (vinculoSetor) {
      return fluxoCachePorId(vinculoSetor.fluxo_id) || { id: vinculoSetor.fluxo_id };
    }
  }

  return null;
}

async function verificarFluxoVinculado(msg, contexto) {
  const fluxo = buscarFluxoVinculado(contexto);
  if (!fluxo) return false;
  return iniciarFluxoDinamico(msg, fluxo);
}

async function verificarFluxoDinamico(msg, textoLower) {
  for (const fluxo of fluxosCache) {
    const gatilhos = String(fluxo.gatilho_palavras || "")
      .split(",")
      .map((g) => normalizarTexto(g.trim()))
      .filter(Boolean);
    if (!gatilhos.length) continue;
    if (!gatilhos.some((g) => textoLower === g || textoLower.includes(g))) continue;
    return iniciarFluxoDinamico(msg, fluxo);
  }
  return false;
}

async function processarEtapaFluxoDinamico(msg, textoLower, estado) {
  if (ehCancelarComando(textoLower)) {
    conversas.delete(msg.from);
    await msg.reply("Atendimento encerrado. Sempre que precisar, estamos à disposição.");
    return true;
  }
  const { fluxo_id, etapa_id } = estado.dados;
  const etapa = await repositoryBotFluxos.BuscarEtapaPorId(etapa_id);
  if (!etapa) { conversas.delete(msg.from); return false; }
  if (etapa.eh_final) { conversas.delete(msg.from); return true; }

  const opcoes = JSON.parse(etapa.opcoes || "[]");
  if (!opcoes.length) { conversas.delete(msg.from); return true; }

  const escolha = opcoes.find((o) => normalizarTexto(String(o.texto || "")) === textoLower);
  if (!escolha) { await msg.reply(etapa.mensagem); return true; }

  if (!escolha.proxima_etapa || escolha.proxima_etapa === "fim") {
    conversas.delete(msg.from);
    if (escolha.mensagem_final) await msg.reply(String(escolha.mensagem_final));
    return true;
  }

  const etapas = await repositoryBotFluxos.ListarEtapasPorFluxo(fluxo_id);
  const proxima = etapas.find((e) => e.chave === escolha.proxima_etapa);
  if (!proxima) { conversas.delete(msg.from); return true; }

  conversas.set(msg.from, {
    etapa: "fluxo_dinamico",
    dados: { fluxo_id, etapa_id: proxima.id },
  });
  await msg.reply(proxima.mensagem);
  return true;
}
// ──────────────────────────────────────────────────────────────────────────────

const ADMIN_NUMEROS = new Set(
  String(process.env.WHATSAPP_ADMINS || "557598042342")
    .split(",")
    .map((numero) => normalizarNumero(numero))
    .filter(Boolean)
);
const ADMIN_PERFIS_FIXOS = {
  "557598042342": {
    nome: "Welder",
    setor: "ADMIN",
  },
  // Para adicionar mais atendentes, copie o bloco acima e troque o número e nome:
  // "55XXXXXXXXXXX": {
  //   nome: "Pedro",
  //   setor: "ADMIN",
  // },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetInactivityTimer(from) {
  if (inactivityTimers.has(from)) {
    clearTimeout(inactivityTimers.get(from));
  }
  if (!conversas.has(from) && !pontes.has(from)) {
    inactivityTimers.delete(from);
    return;
  }
  const timer = setTimeout(async () => {
    inactivityTimers.delete(from);
    if (conversas.has(from) || pontes.has(from)) {
      try {
        await client.sendMessage(from, "Você ainda está aí? 😊 Se precisar de ajuda, é só responder.");
      } catch {}
    }
  }, INACTIVITY_MS);
  inactivityTimers.set(from, timer);
}

function cancelarInactivityTimer(from) {
  if (inactivityTimers.has(from)) {
    clearTimeout(inactivityTimers.get(from));
    inactivityTimers.delete(from);
  }
}

function ehPedidoAtendente(texto) {
  const n = normalizarTexto(texto);
  return n.includes("atendente") || n === "falar com humano" || n === "atendente";
}

function listarAtendentes() {
  const dosBanco = atendentesCacheDB.map((a) => ({ numero: a.numero, nome: a.nome }));
  const fixos = Object.entries(ADMIN_PERFIS_FIXOS)
    .filter(([num]) => !dosBanco.some((a) => a.numero === num))
    .map(([numero, perfil]) => ({ numero, nome: perfil.nome }));
  const lista = [...dosBanco, ...fixos]
    .map((a) => ({
      numero: normalizarNumero(a.numero),
      nome: String(a.nome || "").trim(),
    }))
    .filter((a) => a.nome && a.numero.length >= 10 && a.numero.length <= 15);

  const vistos = new Set();
  return lista.filter((a) => {
    if (vistos.has(a.numero)) return false;
    vistos.add(a.numero);
    return true;
  });
}

function numeroParaJid(numero) {
  return `${normalizarNumero(numero)}@c.us`;
}

function buscarPonteReversaPorJid(remetenteJid, numeroRemetente = "") {
  const direta = ponteReversa.get(remetenteJid);
  if (direta) {
    return { jidAtendente: remetenteJid, jidUsuario: direta };
  }

  const numeroBase = normalizarNumero(numeroRemetente || remetenteJid);
  if (!numeroBase) return null;

  const matches = [];
  for (const [jidAtendente, jidUsuario] of ponteReversa.entries()) {
    const numeroAtendente = normalizarNumero(jidAtendente);
    if (!numeroAtendente) continue;
    const compativel =
      numeroAtendente === numeroBase ||
      numeroAtendente.endsWith(numeroBase) ||
      numeroBase.endsWith(numeroAtendente);
    if (compativel) {
      matches.push({ jidAtendente, jidUsuario });
    }
  }

  if (matches.length !== 1) {
    return null;
  }

  const match = matches[0];
  if (match.jidAtendente !== remetenteJid) {
    // Corrige a chave da ponte reversa para evitar novas falhas de lookup
    ponteReversa.delete(match.jidAtendente);
    ponteReversa.set(remetenteJid, match.jidUsuario);
  }

  return { jidAtendente: remetenteJid, jidUsuario: match.jidUsuario };
}

function atendenteEstaEmAtendimento(numeroAtendente) {
  return ponteReversa.has(numeroParaJid(numeroAtendente));
}

function listarAtendentesDisponiveis() {
  return listarAtendentes().filter((atendente) => !atendenteEstaEmAtendimento(atendente.numero));
}

function textoListaAtendentes(atendentes) {
  const lista = atendentes.map((a, i) => `${i + 1}. ${a.nome}`).join("\n");
  return `Com quem você deseja falar?\n\n${lista}\n\nDigite o número da opção.\n${textoCancelar()}`;
}

function textoSemAtendenteDisponivel() {
  return "Todos os atendentes estão em atendimento no momento. Tente novamente em alguns instantes.";
}

async function iniciarSelecaoAtendente(msg) {
  const atendentesDisponiveis = listarAtendentesDisponiveis();
  if (!atendentesDisponiveis.length) {
    await msg.reply(textoSemAtendenteDisponivel());
    return false;
  }
  conversas.set(msg.from, { etapa: "aguardando_atendente", dados: {} });
  resetInactivityTimer(msg.from);
  await msg.reply(textoListaAtendentes(atendentesDisponiveis));
  return true;
}

function textoMenuGerenciarAtendentes() {
  return `Gerenciar atendentes\n\n1. Listar atendentes\n2. Adicionar atendente\n3. Remover atendente\n\nDigite o número da opção.\n${textoCancelar()}`;
}

function saudacao() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

function normalizarTexto(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizarNumero(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function ehApenasNumero(texto) {
  const bruto = String(texto || "").trim();
  return bruto.length > 0 && /^[\d\s()+-]+$/.test(bruto) && normalizarNumero(bruto).length >= 8;
}

function ehCancelarComando(texto) {
  return normalizarTexto(texto) === "c" || normalizarTexto(texto) === "cancelar";
}

function textoCancelar() {
  return "Digite C para cancelar.";
}

function formatarData(dataStr) {
  if (!dataStr) return "-";

  const partes = String(dataStr).split("-");
  if (partes.length !== 3) return String(dataStr);

  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

function ehPalavraMF(texto) {
  const normalizado = normalizarTexto(texto);
  const ehCQ = normalizado.includes("furto") || normalizado.includes("pre-colheita");

  if (ehCQ) return false;

  return (
    normalizado.includes("maturacao") ||
    normalizado.includes("analise") ||
    normalizado === "mf"
  );
}

function ehPedidoCadastro(texto) {
  const normalizado = normalizarTexto(texto);
  return (
    normalizado === "cadastro" ||
    normalizado === "cadastrar" ||
    normalizado === "registrar" ||
    normalizado.includes("me cadastrar")
  );
}

function ehSaudacao(texto) {
  const normalizado = normalizarTexto(texto);
  return (
    normalizado === "oi" ||
    normalizado === "ola" ||
    normalizado === "bom dia" ||
    normalizado === "boa tarde" ||
    normalizado === "boa noite" ||
    normalizado === "menu"
  );
}

function setorDoTexto(texto) {
  const normalizado = normalizarTexto(texto);

  if (normalizado === "1" || normalizado === "ti" || normalizado.includes("tecnologia")) {
    return "TI";
  }

  if (
    normalizado === "2" ||
    normalizado.includes("qualidade") ||
    normalizado.includes("controle")
  ) {
    return "CONTROLE DE QUALIDADE";
  }

  return null;
}

function textoMenuPrincipal(nomeContato) {
  return getMensagem("menu_principal", { nome: nomeContato });
}

function textoMenuTI(nomeUsuario) {
  return getMensagem("menu_ti", { nome: nomeUsuario });
}

function textoMenuCQ(nomeUsuario) {
  return getMensagem("menu_cq", { nome: nomeUsuario });
}

function textoMenuAdmin(nomeUsuario) {
  return getMensagem("menu_admin", { nome: nomeUsuario });
}

function textoCadastroInicial(nomeContato) {
  return getMensagem("cadastro_inicial", { nome: nomeContato });
}

function gerarVCardContato(usuario) {
  const nome = String(usuario?.nome || usuario?.NAME || "Contato")
    .replace(/\n+/g, " ")
    .replace(/;/g, ",")
    .trim();
  const numero = normalizarNumero(usuario?.numero || usuario?.NUMERO || "");
  const numeroInternacional = numero.startsWith("55") ? numero : `55${numero}`;

  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${nome}`,
    `TEL;TYPE=CELL:+${numeroInternacional}`,
    "END:VCARD",
  ].join("\n");
}

function buscarPerfilFixo(numero) {
  return ADMIN_PERFIS_FIXOS[normalizarNumero(numero)] || null;
}

function textoResumoSetores(usuarios) {
  if (!usuarios.length) {
    return "Nenhum usuário cadastrado na base de dados.";
  }

  const grupos = new Map();

  usuarios.forEach((usuario) => {
    const setor = String(usuario.setor || "SEM SETOR").trim().toUpperCase();
    if (!grupos.has(setor)) {
      grupos.set(setor, []);
    }
    grupos.get(setor).push(usuario);
  });

  const blocos = [];
  Array.from(grupos.keys())
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .forEach((setor) => {
      const itens = grupos.get(setor);
      const linhas = itens.map((item) => `- ${item.nome} | ${item.numero}`).join("\n");
      blocos.push(`${setor} (${itens.length})\n${linhas}`);
    });

  return blocos.join("\n\n");
}

function textoCadastroSetor() {
  return getMensagem("cadastro_setor");
}

function textoListaDatasMF(datas) {
  const lista = datas
    .map((item, index) => `${index + 1}. ${formatarData(item.data)} (${item.total} registro${item.total > 1 ? "s" : ""})`)
    .join("\n");

  return (
    "Análise de Maturação Forçada\n\n" +
    "Selecione a data desejada:\n\n" +
    `${lista}\n\n` +
    "Responda com o número da opção.\n" +
    `${textoCancelar()}`
  );
}

function textoListaRegistrosMF(registros, dataSelecionada) {
  const lista = registros
    .map((registro, index) => {
      const resumo = [
        registro.comprador || "-",
        registro.produtor || "-",
        registro.parcela || "-",
      ].join(" / ");

      return `${index + 1}. ${registro.form_id || `MF-${registro.id}`} - ${resumo} - ${registro.variedade || "-"}`;
    })
    .join("\n");

  return (
    `Data selecionada: ${formatarData(dataSelecionada)}\n\n` +
    "Selecione a análise desejada:\n\n" +
    `${lista}\n\n` +
    "Digite o número da opção.\n" +
    `${textoCancelar()}`
  );
}

function extrairNumeroDeVCard(vcard) {
  const texto = String(vcard || "");
  if (!texto) return null;

  const waid = texto.match(/waid=(\d{8,15})/i);
  if (waid) {
    return waid[1];
  }

  const linhas = texto.split(/\r?\n/);
  for (const linha of linhas) {
    if (!/^TEL/i.test(linha)) continue;

    const parteTelefone = linha.split(":").slice(1).join(":").trim();
    const numero = normalizarNumero(parteTelefone);
    if (numero.length >= 8 && numero.length <= 15) {
      return numero;
    }
  }

  const telefone = texto.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
  if (telefone) {
    const numero = normalizarNumero(telefone[0]);
    if (numero.length >= 8 && numero.length <= 15) {
      return numero;
    }
  }

  return null;
}

function extrairNumeroDoCadastro(msg) {
  const vcards = Array.isArray(msg?.vCards) ? msg.vCards : [];

  for (const vcard of vcards) {
    const numero = extrairNumeroDeVCard(vcard);
    if (numero) return numero;
  }

  const body = String(msg?.body || "").trim();
  if (!body) return null;

  const waid = body.match(/waid=(\d{8,15})/i);
  if (waid) {
    return waid[1];
  }

  const telefone = body.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
  if (telefone) {
    const numero = normalizarNumero(telefone[0]);
    if (numero.length >= 8 && numero.length <= 15) {
      return numero;
    }
  }

  if (/^\d{8,15}$/.test(body)) {
    return body;
  }

  return null;
}

async function buscarIdGrupo(nomeGrupo) {
  if (grupoIdCache) return grupoIdCache;

  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    try {
      const chats = await client.getChats();
      const grupos = chats.filter((chat) => chat.isGroup);
      console.log(`[WA] Grupos disponíveis (${grupos.length}):`, grupos.map((g) => `"${g.name}"`).join(", ") || "(nenhum)");
      console.log(`[WA] Buscando grupo que contenha: "${nomeGrupo}"`);

      const grupo = grupos.find(
        (chat) => normalizarTexto(chat.name).includes(normalizarTexto(nomeGrupo))
      );

      const id = grupo ? grupo.id._serialized : null;
      if (id) {
        grupoIdCache = id;
        console.log(`[WA] Grupo encontrado: "${grupo.name}" → ID cacheado`);
      } else {
        console.warn(`[WA] Nenhum grupo com nome contendo "${nomeGrupo}" foi encontrado.`);
      }

      return id;
    } catch (error) {
      ultimoErro = error;

      if (isSessaoInstavelError(error)) {
        console.warn(`[WA] Sessao instavel ao buscar grupo (tentativa ${tentativa}/3): ${error?.message || error}`);
        await reconectarClienteSafe(`buscar-grupo-${tentativa}`);
      } else if (isProtocolTimeoutError(error)) {
        console.warn(`[WA] Timeout ao buscar grupo (tentativa ${tentativa}/3).`);
      } else {
        throw error;
      }

      await delay(2000 * tentativa);
    }
  }

  throw ultimoErro || new Error("Falha ao buscar grupo do WhatsApp");
}

async function listarGrupos() {
  try {
    const chats = await client.getChats();
    const grupos = chats.filter((chat) => chat.isGroup);

    if (grupos.length === 0) {
      console.log("(nenhum grupo encontrado)");
      return;
    }

    grupos.forEach((grupo) => console.log(`- "${grupo.name}"`));
  } catch (error) {
    console.error("Erro ao listar grupos:", error.message);
  }
}

client.on("qr", (qr) => {
  console.log("\n=== ESCANEIE O QR CODE COM O WHATSAPP ===");
  qrcode.generate(qr, { small: true });
  console.log("Aguardando conexao...\n");
});

const resolveStoragePath = (relativeOrAbsolutePath) => {
  if (!relativeOrAbsolutePath) return null;
  const raw = String(relativeOrAbsolutePath).trim();
  if (!raw) return null;
  if (path.isAbsolute(raw)) return raw;
  return path.join(BACKEND_ROOT, raw);
};

const isSessaoInstavelError = (error) => {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("detached frame") ||
    msg.includes("execution context was destroyed") ||
    msg.includes("target closed") ||
    msg.includes("runtime.callfunctionon")
  );
};

const isBrowserJaExecutandoError = (error) => {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("browser is already running") || msg.includes("already running for");
};

const isProtocolTimeoutError = (error) => {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("runtime.callfunctionon timed out") ||
    (msg.includes("protocolerror") && msg.includes("timed out"))
  );
};

const limparLocksSessaoWhatsapp = () => {
  for (const fileName of WA_STALE_LOCK_FILES) {
    const lockPath = path.join(WA_LOCALAUTH_SESSION_DIR, fileName);
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
        console.warn(`[WA] Lock removido: ${fileName}`);
      }
    } catch (error) {
      console.warn(`[WA] Falha ao remover lock ${fileName}: ${error?.message || error}`);
    }
  }
};

const resetEstadoClienteSafe = async (origem = "manual") => {
  try {
    if (!client?.pupPage) return false;
    await client.resetState();
    console.warn(`[WA] resetState aplicado (${origem}).`);
    return true;
  } catch (error) {
    console.warn(`[WA] resetState falhou (${origem}): ${error?.message || error}`);
    return false;
  }
};

const initializeClientSafe = async (origem = "manual") => {
  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async () => {
    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
      try {
        await client.initialize();
        return;
      } catch (error) {
        ultimoErro = error;
        if (!isBrowserJaExecutandoError(error)) {
          throw error;
        }

        const browserConectado = Boolean(client?.pupBrowser?.isConnected?.());
        console.warn(
          `[WA] initialize bloqueado (${origem}, tentativa ${tentativa}/3): navegador/sessao ja em execucao.`
        );

        if (browserConectado) {
          const resetou = await resetEstadoClienteSafe(`initialize-${origem}-${tentativa}`);
          if (resetou) {
            const pronto = await aguardarClientePronto(12000);
            if (pronto) {
              return;
            }
          }
        } else {
          // Processo Chrome pode estar vivo mesmo sem conexao ativa — mata antes de limpar.
          try {
            const browserProcess = client?.pupBrowser?.process?.();
            if (browserProcess && !browserProcess.killed) {
              browserProcess.kill('SIGKILL');
              console.warn(`[WA] Processo Chrome forcado (initialize-${origem}-${tentativa}).`);
              await delay(800);
            }
          } catch (_) { /* ignora */ }
          limparLocksSessaoWhatsapp();
        }

        await delay(1500 * tentativa);
      }
    }

    throw ultimoErro || new Error("Falha ao inicializar WhatsApp (browser ja em execucao)");
  })()
    .finally(() => {
      initializePromise = null;
    });

  return initializePromise;
};

const reconectarClienteSafe = async (origem = "manual") => {
  if (reconexaoPromise) {
    return reconexaoPromise;
  }

  reconexaoPromise = (async () => {
    console.warn(`[WA] Reiniciando sessao (${origem})...`);

    // Evita corridas: limpa estado local antes de recriar sessao.
    clientePronto = false;
    grupoIdCache = null;

    const browserConectado = Boolean(client?.pupBrowser?.isConnected?.());
    if (browserConectado) {
      const resetou = await resetEstadoClienteSafe(`reconnect-soft-${origem}`);
      if (resetou) {
        const prontoSoft = await aguardarClientePronto(15000);
        if (prontoSoft) {
          return;
        }
      }
    }

    try {
      await client.destroy();
    } catch (error) {
      // Pode falhar se o client/browser ja estiver encerrado; seguimos o fluxo.
      console.warn(`[WA] destroy ignorado (${origem}): ${error?.message || error}`);
    }

    // Força encerramento do processo Chrome caso o destroy() nao tenha matado.
    try {
      const browserProcess = client?.pupBrowser?.process?.();
      if (browserProcess && !browserProcess.killed) {
        browserProcess.kill('SIGKILL');
        console.warn(`[WA] Processo Chrome forcado a encerrar (${origem}).`);
        await delay(1000);
      }
    } catch (_) { /* ignora */ }

    limparLocksSessaoWhatsapp();
    await delay(2200);
    await initializeClientSafe(`reconnect-${origem}`);

    const pronto = await aguardarClientePronto(90000);
    if (!pronto) {
      throw new Error("WhatsApp nao reconectou a tempo");
    }
    // Aguarda estabilizacao extra apos o cliente indicar pronto
    await delay(4000);
  })().finally(() => {
    reconexaoPromise = null;
  });

  return reconexaoPromise;
};

const aguardarClientePronto = async (timeoutMs = 45000) => {
  const startedAt = Date.now();
  while (!clientePronto && (Date.now() - startedAt) < timeoutMs) {
    await delay(500);
  }
  return clientePronto;
};

const resolverGrupoId = async () => {
  const nomeGrupo = process.env.WHATSAPP_GRUPO || "";
  if (!nomeGrupo) throw new Error("WHATSAPP_GRUPO nao configurado no .env");
  const grupoId = grupoIdCache || (await buscarIdGrupo(nomeGrupo));
  if (!grupoId) throw new Error(`Grupo "${nomeGrupo}" nao encontrado`);
  return grupoId;
};

const enviarMediaComRetry = async ({
  grupoIdInicial,
  caminhoArquivo,
  sendOptions = {},
  contexto = "WA",
  tentativas = 3,
  filename = null,
}) => {
  if (!caminhoArquivo || !fs.existsSync(caminhoArquivo)) {
    throw new Error(`Arquivo nao encontrado: ${caminhoArquivo || "(vazio)"}`);
  }

  let grupoId = grupoIdInicial;
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      if (!clientePronto) {
        const pronto = await aguardarClientePronto(8000);
        if (!pronto) {
          throw new Error("CLIENTE_NAO_PRONTO");
        }
      }

      const media = MessageMedia.fromFilePath(caminhoArquivo);
      if (filename) media.filename = filename;
      await client.sendMessage(grupoId, media, sendOptions);
      return;
    } catch (error) {
      ultimoErro = error;
      const msg = String(error?.message || "");
      const msgLower = msg.toLowerCase();
      const ehInstavel =
        isSessaoInstavelError(error) ||
        isProtocolTimeoutError(error) ||
        msg.includes("CLIENTE_NAO_PRONTO") ||
        msgLower.includes("whatsapp nao esta conectado");

      if (!ehInstavel || tentativa >= tentativas) {
        break;
      }

      console.warn(
        `[${contexto}] Sessao instavel ao enviar PDF (tentativa ${tentativa}/${tentativas}): ${error?.message || error}`
      );

      // 1a tentativa: tenta reset rapido; se nao estabilizar, faz reconnect completo.
      if (tentativa === 1 && !msg.includes("CLIENTE_NAO_PRONTO")) {
        const resetou = await resetEstadoClienteSafe(`retry-${contexto}-1`);
        if (resetou) {
          const prontoPosReset = await aguardarClientePronto(10000);
          if (!prontoPosReset) {
            try {
              await reconectarClienteSafe(`retry-${contexto}`);
            } catch (reconnectError) {
              console.warn(`[${contexto}] Falha ao reconectar cliente: ${reconnectError?.message || reconnectError}`);
            }
          }
        } else {
          try {
            await reconectarClienteSafe(`retry-${contexto}`);
          } catch (reconnectError) {
            console.warn(`[${contexto}] Falha ao reconectar cliente: ${reconnectError?.message || reconnectError}`);
          }
        }
      } else {
        try {
          await reconectarClienteSafe(`retry-${contexto}`);
        } catch (reconnectError) {
          console.warn(`[${contexto}] Falha ao reconectar cliente: ${reconnectError?.message || reconnectError}`);
        }
      }

      try {
        grupoId = await resolverGrupoId();
      } catch {}
      await delay(4000 * tentativa);
    }
  }

  throw ultimoErro || new Error("Falha ao enviar arquivo no WhatsApp");
};

const executarComLockPendentes = async (rotulo, tarefa) => {
  if (envioPendentesPromise) {
    console.log(`[Pendentes] ${rotulo} aguardando processamento em andamento...`);
    return envioPendentesPromise;
  }

  envioPendentesPromise = (async () => {
    try {
      return await tarefa();
    } finally {
      envioPendentesPromise = null;
    }
  })();

  return envioPendentesPromise;
};

async function enviarPendentesMF() {
  try {
    const { query } = await import("../database/sqlite.js");
    const pendentes = await query(
      `SELECT * FROM maturacao_forcada WHERE (whatsapp_enviado IS NULL OR whatsapp_enviado = 0) ORDER BY id ASC`,
      [], "all"
    );

    if (!pendentes.length) {
      console.log("[MF] Nenhum PDF pendente de envio.");
      return;
    }

    console.log(`[MF] ${pendentes.length} PDF(s) pendente(s) para enviar no grupo...`);

    const nomeGrupo = process.env.WHATSAPP_GRUPO || "";
    const grupoId = grupoIdCache || (nomeGrupo ? await buscarIdGrupo(nomeGrupo) : null);

    if (!grupoId) {
      console.warn("[MF] Grupo nao encontrado. Nao foi possivel enviar os pendentes.");
      return;
    }

    for (const registro of pendentes) {
      try {
        const formId = registro.form_id || String(registro.id);
        const caminhoPDF = await gerarRelatorioMFPDFDetalhado(formId);

        await enviarMediaComRetry({
          grupoIdInicial: grupoId,
          caminhoArquivo: caminhoPDF,
          sendOptions: { sendMediaAsDocument: true },
          contexto: "MF",
        });
        await repositoryMF.MarcarEnviado(formId, true);
        console.log(`[MF] Enviado: ${formId}`);
        await delay(1500);
      } catch (err) {
        console.error(`[MF] Erro ao enviar ${registro.form_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[MF] Erro ao processar pendentes:", err.message);
  }
}

async function enviarPendentesAF() {
  try {
    const pendentes = await repositoryAF.ListarPendentes(100);

    if (!pendentes.length) {
      console.log("[AF] Nenhum PDF pendente de envio.");
      return;
    }

    console.log(`[AF] ${pendentes.length} PDF(s) pendente(s) para enviar no grupo...`);

    const nomeGrupo = process.env.WHATSAPP_GRUPO || "";
    const grupoId = grupoIdCache || (nomeGrupo ? await buscarIdGrupo(nomeGrupo) : null);

    if (!grupoId) {
      console.warn("[AF] Grupo nao encontrado. Nao foi possivel enviar os pendentes.");
      return;
    }

    for (const registro of pendentes) {
      const formId = registro.form_id || String(registro.id);
      try {
        const caminhoPDF = resolveStoragePath(registro.pdf_path);
        if (!caminhoPDF || !fs.existsSync(caminhoPDF)) {
          throw new Error(`Arquivo PDF nao encontrado para ${formId}`);
        }

        const caption = [
          `📋 *Avaliação:* ${registro.tipo_analise || 'Análise de Frutos'}`,
          `🌿 *Fazenda:* ${registro.fazenda_talhao || '-'}`,
          `🔢 *Controle:* ${registro.controle || '-'}`,
          `📅 *Safra:* ${registro.safra || 'M26'}`,
        ].join('\n');

        const sanitize = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').trim().slice(0, 40);
        const dia = String(new Date().getDate()).padStart(2, '0');
        const nomeCustom = `AF-${sanitize(registro.fazenda_talhao)}-${sanitize(registro.variedade)}-${sanitize(registro.controle)}-${dia}.pdf`;

        await enviarMediaComRetry({
          grupoIdInicial: grupoId,
          caminhoArquivo: caminhoPDF,
          filename: nomeCustom,
          sendOptions: { sendMediaAsDocument: true, caption },
          contexto: "AF",
        });
        await repositoryAF.MarcarEnviado(formId, true);
        console.log(`[AF] Enviado: ${formId}`);
        await delay(1500);
      } catch (err) {
        await repositoryAF.MarcarEnviado(formId, false);
        console.error(`[AF] Erro ao enviar ${formId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[AF] Erro ao processar pendentes:", err.message);
  }
}

async function enviarPendentesRE() {
  try {
    const pendentes = await repositoryRE.ListarPendentes(100);

    if (!pendentes.length) {
      console.log("[RE] Nenhum PDF pendente de envio.");
      return;
    }

    console.log(`[RE] ${pendentes.length} PDF(s) pendente(s) para enviar no grupo...`);

    const nomeGrupo = process.env.WHATSAPP_GRUPO || "";
    const grupoId = grupoIdCache || (nomeGrupo ? await buscarIdGrupo(nomeGrupo) : null);

    if (!grupoId) {
      console.warn("[RE] Grupo nao encontrado. Nao foi possivel enviar os pendentes.");
      return;
    }

    for (const registro of pendentes) {
      const formId = registro.form_id || String(registro.id);
      try {
        const caminhoPDF = resolveStoragePath(registro.pdf_path);
        if (!caminhoPDF || !fs.existsSync(caminhoPDF)) {
          throw new Error(`Arquivo PDF nao encontrado para ${formId}`);
        }

        await enviarMediaComRetry({
          grupoIdInicial: grupoId,
          caminhoArquivo: caminhoPDF,
          sendOptions: { sendMediaAsDocument: true },
          contexto: "RE",
        });
        await repositoryRE.MarcarEnviado(formId, true);
        console.log(`[RE] Enviado: ${formId}`);
        await delay(1500);
      } catch (err) {
        await repositoryRE.MarcarEnviado(formId, false);
        console.error(`[RE] Erro ao enviar ${formId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[RE] Erro ao processar pendentes:", err.message);
  }
}

async function enviarTodosPendentes() {
  await executarComLockPendentes("TODOS", async () => {
    await enviarPendentesMF();
    await enviarPendentesAF();
    await enviarPendentesRE();
  });
}

export async function enviarMFPendentes() {
  if (!clientePronto) return;
  await executarComLockPendentes("MF", async () => {
    await enviarPendentesMF();
  });
}

export async function enviarAFPendentes() {
  if (!clientePronto) {
    console.log("[AF] WhatsApp não pronto — pendente será enviado no próximo flush.");
    return;
  }
  await executarComLockPendentes("AF", async () => {
    await enviarPendentesAF();
  });
}

export async function enviarREPendentes() {
  if (!clientePronto) return;
  await executarComLockPendentes("RE", async () => {
    await enviarPendentesRE();
  });
}

client.on("change_state", (state) => {
  const estado = String(state || "").toUpperCase();
  if (estado === "CONNECTED") return;

  if (clientePronto) {
    console.warn(`[WA] Estado alterado para ${estado}. Sessao marcada como nao pronta.`);
  }
  clientePronto = false;

  if (
    estado === "UNPAIRED" ||
    estado === "UNPAIRED_IDLE" ||
    estado === "CONFLICT" ||
    estado === "TIMEOUT" ||
    estado === "DEPRECATED_VERSION" ||
    estado === "PROXYBLOCK" ||
    estado === "SMB_TOS_BLOCK" ||
    estado === "TOS_BLOCK" ||
    estado === "UNLAUNCHED"
  ) {
    grupoIdCache = null;
  }
});

client.on("ready", async () => {
  clientePronto = true;
  console.log("WhatsApp conectado e pronto!");

  try {
    const nomeGrupo = process.env.WHATSAPP_GRUPO || "";
    if (!nomeGrupo) {
      console.warn("WHATSAPP_GRUPO nao configurado no .env");
      console.log("Grupos disponiveis:");
      await listarGrupos();
      return;
    }

    console.log(`Procurando grupo: "${nomeGrupo}"...`);
    grupoIdCache = await buscarIdGrupo(nomeGrupo);

    if (grupoIdCache) {
      console.log(`Grupo encontrado e conectado: "${nomeGrupo}"`);
      // Envia automaticamente todos os PDFs que nao foram enviados ainda
      setTimeout(() => {
        enviarTodosPendentes().catch((error) => {
          console.error("Erro ao enviar pendentes apos ready:", error?.message || error);
        });
      }, 3000);
    } else {
      console.warn(`Grupo "${nomeGrupo}" nao encontrado!`);
      console.warn("Verifique o nome no .env. Grupos disponiveis:");
      await listarGrupos();
    }
  } catch (error) {
    console.error("Erro ao preparar grupo no evento ready:", error?.message || error);
  }
});

client.on("authenticated", () => {
  console.log("WhatsApp autenticado! Sessao salva.");
});

client.on("auth_failure", (msg) => {
  clientePronto = false;
  console.error("Falha na autenticacao do WhatsApp:", msg);
});

client.on("disconnected", (reason) => {
  clientePronto = false;
  grupoIdCache = null;
  console.warn("WhatsApp desconectado:", reason);
  console.log("Tentando reconectar...");
  reconectarClienteSafe("disconnected").catch((error) => {
    console.error("Falha ao solicitar reconexao do WhatsApp:", error?.message || error);
  });
});

async function iniciarFluxoMF(msg) {
  const datas = await listarDatasMF();

  if (!datas.length) {
    await msg.reply("Não foram encontradas análises de Maturação Forçada registradas.");
    return;
  }

  conversas.set(msg.from, {
    etapa: "mf_escolher_data",
    dados: {
      datas,
    },
  });

  await msg.reply(textoListaDatasMF(datas));
}

async function processarEtapaCadastro(msg, textoLower, estado, nomeExibicao) {
  const dados = estado.dados || {};

  if (ehCancelarComando(textoLower)) {
    conversas.delete(msg.from);
    await msg.reply("Cadastro cancelado. Caso precise, estamos à disposição.");
    return true;
  }

  if (estado.etapa === "cadastro_numero") {
    const numeroDigitado = extrairNumeroDoCadastro(msg);
    if (!numeroDigitado || numeroDigitado.length < 8) {
      await msg.reply(
        "Não foi possível identificar o número informado.\n" +
        "Por favor, envie um contato ou digite um número válido.\n" +
        `${textoCancelar()}`
      );
      return true;
    }

    dados.numero = numeroDigitado;
    conversas.set(msg.from, {
      etapa: "cadastro_nome",
      dados,
    });

    await msg.reply("Por favor, informe o nome completo.");
    return true;
  }

  if (estado.etapa === "cadastro_nome") {
    const nome = String(msg.body || "").trim().replace(/\s+/g, " ");
    if (!nome) {
      await msg.reply(
        "Por favor, informe um nome válido.\n" +
        `${textoCancelar()}`
      );
      return true;
    }

    dados.nome = nome;
    conversas.set(msg.from, {
      etapa: "cadastro_setor",
      dados,
    });

    await msg.reply(textoCadastroSetor());
    return true;
  }

  if (estado.etapa === "cadastro_setor") {
    const setor = setorDoTexto(textoLower);
    if (!setor) {
      await msg.reply(textoCadastroSetor());
      return true;
    }

    const numero = dados.numero;
    const nome = dados.nome || "Usuario";

    if (!numero) {
      conversas.delete(msg.from);
      await msg.reply(
        "Não foi possível concluir o cadastro pois o número não foi identificado.\n" +
        "Digite C e reinicie o processo enviando o contato novamente."
      );
      return true;
    }

    await repositoryWhatsappUsuario.SalvarOuAtualizar({
      numero,
      nome,
      setor,
    });

    conversas.delete(msg.from);

    if (dados.admin) {
      await msg.reply(
        `Cadastro realizado com sucesso para ${nome}.\n\n` +
        textoMenuAdmin(nomeExibicao)
      );
      return true;
    }

    await msg.reply(
      `Cadastro realizado com sucesso para ${nome}.\n\n` +
      (setor === "TI" ? textoMenuTI(nome) : textoMenuCQ(nome))
    );
    return true;
  }

  return false;
}

async function processarEtapaTI(msg, textoLower, estado, usuario) {
  const nomeUsuario = usuario?.nome || usuario?.NAME || usuario?.nome_usuario || "Usuario";

  if (ehCancelarComando(textoLower)) {
    conversas.delete(msg.from);
    await msg.reply("Atendimento de TI encerrado. Qualquer dúvida, estamos à disposição.");
    return true;
  }

  if (estado.etapa === "ti_atendente") {
    conversas.delete(msg.from);
    await msg.reply(getMensagem("ti_atendente_ok"));
    return true;
  }

  if (textoLower === "1" || textoLower.includes("falar com atendente")) {
    conversas.set(msg.from, {
      etapa: "ti_atendente",
      dados: {},
    });

    await msg.reply(getMensagem("ti_atendente_prompt"));
    return true;
  }

  if (textoLower === "2" || textoLower.includes("sia") || textoLower.includes("siagro")) {
    await msg.reply(getMensagem("ti_sia_siagro"));
    return true;
  }

  if (textoLower === "3" || textoLower.includes("mega") || textoLower.includes("megadados")) {
    await msg.reply(getMensagem("ti_mega"));
    return true;
  }

  if (textoLower === "4" || textoLower.includes("internet")) {
    await msg.reply(getMensagem("ti_internet"));
    return true;
  }

  if (
    textoLower === "5" ||
    textoLower.includes("notebook") ||
    textoLower.includes("celular")
  ) {
    await msg.reply(getMensagem("ti_equipamento"));
    return true;
  }

  if (ehSaudacao(textoLower)) {
    await msg.reply(textoMenuTI(nomeUsuario));
    return true;
  }

  await msg.reply("Escolha uma dessas opções acima.");
  return true;
}

async function processarEtapaCQ(msg, textoLower, estado, usuario) {
  const nomeUsuario = usuario?.nome || usuario?.NAME || usuario?.nome_usuario || "Usuario";

  if (ehCancelarComando(textoLower)) {
    conversas.delete(msg.from);
    await msg.reply("Atendimento de Controle de Qualidade encerrado. Qualquer dúvida, estamos à disposição.");
    return true;
  }

  if (estado.etapa === "cq_furtos") {
    conversas.delete(msg.from);
    await msg.reply(getMensagem("cq_furtos_ok"));
    return true;
  }

  if (estado.etapa === "cq_precolheita") {
    conversas.delete(msg.from);
    await msg.reply(getMensagem("cq_precolheita_ok"));
    return true;
  }

  if (textoLower === "1" || ehPalavraMF(textoLower)) {
    await iniciarFluxoMF(msg);
    return true;
  }

  if (textoLower === "2" || textoLower.includes("furto")) {
    conversas.set(msg.from, {
      etapa: "cq_furtos",
      dados: {},
    });

    await msg.reply(getMensagem("cq_furtos_prompt"));
    return true;
  }

  if (textoLower === "3" || textoLower.includes("pre-colheita")) {
    conversas.set(msg.from, {
      etapa: "cq_precolheita",
      dados: {},
    });

    await msg.reply(getMensagem("cq_precolheita_prompt"));
    return true;
  }

  if (ehSaudacao(textoLower)) {
    await msg.reply(textoMenuCQ(nomeUsuario));
    return true;
  }

  await msg.reply("Escolha uma dessas opções acima.");
  return true;
}

async function processarEtapaMF(msg, textoLower, estado) {
  const dados = estado.dados || {};

  if (ehCancelarComando(textoLower)) {
    conversas.delete(msg.from);
    await msg.reply("Consulta de Maturação Forçada encerrada. Sempre que precisar, estamos à disposição.");
    return true;
  }

  if (estado.etapa === "mf_escolher_data") {
    const escolha = parseInt(textoLower, 10);
    if (!Number.isFinite(escolha) || escolha < 1 || escolha > dados.datas.length) {
      await msg.reply(`Opção inválida. Por favor, responda com um número de 1 a ${dados.datas.length}.`);
      return true;
    }

    const dataSelecionada = dados.datas[escolha - 1].data;
    const registros = await listarRegistrosMFPorData(dataSelecionada);

    if (!registros.length) {
      conversas.delete(msg.from);
      await msg.reply("Não foram encontradas análises para a data selecionada.");
      return true;
    }

    conversas.set(msg.from, {
      etapa: "mf_escolher_registro",
      dados: {
        dataSelecionada,
        registros,
      },
    });

    await msg.reply(textoListaRegistrosMF(registros, dataSelecionada));
    return true;
  }

  if (estado.etapa === "mf_escolher_registro") {
    const escolha = parseInt(textoLower, 10);
    if (!Number.isFinite(escolha) || escolha < 1 || escolha > dados.registros.length) {
      await msg.reply(`Opção inválida. Por favor, responda com um número de 1 a ${dados.registros.length}.`);
      return true;
    }

    const registro = dados.registros[escolha - 1];
    conversas.delete(msg.from);

    await msg.reply(
      `Aguarde. Estamos gerando o relatório de ${formatarData(dados.dataSelecionada)}...`
    );

    try {
      const caminhoPDF = await gerarRelatorioMFPDFDetalhado(registro.id || registro.form_id);
      if (!fs.existsSync(caminhoPDF)) {
        throw new Error(`Arquivo PDF nao encontrado: ${caminhoPDF}`);
      }

      const estatisticas = fs.statSync(caminhoPDF);
      console.log(`PDF MF pronto para envio: ${caminhoPDF} (${estatisticas.size} bytes)`);

      const media = MessageMedia.fromFilePath(caminhoPDF);
      await client.sendMessage(msg.from, media, {
        sendMediaAsDocument: true,
        caption:
          `Relatório de Maturação Forçada\n` +
          `Data: ${formatarData(dados.dataSelecionada)}\n` +
          `${registro.comprador || "-"} / ${registro.produtor || "-"} / ${registro.parcela || "-"}\n` +
          `Variedade: ${registro.variedade || "-"}\n` +
          `Gerado pelo Sistema AgroSolo`,
      });

      await msg.reply("Relatório PDF enviado com sucesso.");
    } catch (error) {
      console.error("Erro ao gerar PDF MF:", error);
      await msg.reply("Não foi possível gerar o relatório. Por favor, tente novamente.");
    }

    return true;
  }

  return false;
}

async function enviarResumoSetoresAdmin(msg) {
  const usuarios = await repositoryWhatsappUsuario.Listar();
  await msg.reply(textoResumoSetores(usuarios));
}

async function processarEtapaAdminAtendentes(msg, textoLower, estado) {
  const dados = estado.dados || {};

  if (ehCancelarComando(textoLower)) {
    conversas.delete(msg.from);
    cancelarInactivityTimer(msg.from);
    await msg.reply("Operação cancelada.");
    return true;
  }

  // Sub-menu principal
  if (estado.etapa === "admin_atendentes_menu") {
    if (textoLower === "1") {
      const lista = listarAtendentes();
      if (!lista.length) {
        await msg.reply("Nenhum atendente cadastrado ainda.");
      } else {
        const texto = lista.map((a, i) => `${i + 1}. ${a.nome} — ${a.numero}`).join("\n");
        await msg.reply(`Atendentes cadastrados:\n\n${texto}`);
      }
      await delay(400);
      await msg.reply(textoMenuGerenciarAtendentes());
      return true;
    }

    if (textoLower === "2") {
      conversas.set(msg.from, { etapa: "admin_atendentes_add_nome", dados: {} });
      resetInactivityTimer(msg.from);
      await msg.reply(`Adicionar atendente.\n\nDigite o *nome* do atendente:\n${textoCancelar()}`);
      return true;
    }

    if (textoLower === "3") {
      const lista = listarAtendentes();
      if (!lista.length) {
        await msg.reply("Nenhum atendente cadastrado para remover.");
        await delay(400);
        await msg.reply(textoMenuGerenciarAtendentes());
        return true;
      }
      const texto = lista.map((a, i) => `${i + 1}. ${a.nome} — ${a.numero}`).join("\n");
      conversas.set(msg.from, { etapa: "admin_atendentes_remover", dados: { lista } });
      resetInactivityTimer(msg.from);
      await msg.reply(`Qual atendente deseja remover?\n\n${texto}\n\nDigite o número da opção.\n${textoCancelar()}`);
      return true;
    }

    await msg.reply("❌ Opção inválida.");
    await delay(300);
    await msg.reply(textoMenuGerenciarAtendentes());
    return true;
  }

  // Etapa: digitar nome do novo atendente
  if (estado.etapa === "admin_atendentes_add_nome") {
    const nome = String(msg.body || "").trim();
    if (!nome || nome.length < 2) {
      await msg.reply(`Nome inválido. Digite o nome do atendente:\n${textoCancelar()}`);
      return true;
    }
    conversas.set(msg.from, { etapa: "admin_atendentes_add_numero", dados: { nome } });
    resetInactivityTimer(msg.from);
    await msg.reply(`Nome: *${nome}*\n\nAgora envie o *contato* do WhatsApp ou digite o número com DDD (ex: 5585999887766):\n${textoCancelar()}`);
    return true;
  }

  // Etapa: enviar contato ou digitar número do novo atendente
  if (estado.etapa === "admin_atendentes_add_numero") {
    const numero = extrairNumeroDoCadastro(msg);
    if (!numero || numero.length < 10 || numero.length > 15) {
      await msg.reply(`Número inválido.\n\nEnvie o *contato* do WhatsApp ou digite o número com DDD (ex: 5585999887766):\n${textoCancelar()}`);
      return true;
    }
    try {
      await repositoryAtendentes.Salvar({ nome: dados.nome, numero });
      await carregarAtendentes();
      conversas.delete(msg.from);
      cancelarInactivityTimer(msg.from);
      await msg.reply(`✅ Atendente *${dados.nome}* cadastrado com sucesso!\n\nNúmero: ${numero}`);
    } catch (err) {
      await msg.reply(`❌ Erro ao salvar: ${err.message}`);
    }
    return true;
  }

  // Etapa: escolher atendente para remover
  if (estado.etapa === "admin_atendentes_remover") {
    const escolha = parseInt(textoLower, 10);
    if (!Number.isFinite(escolha) || escolha < 1 || escolha > dados.lista.length) {
      await msg.reply(`❌ Opção inválida. Escolha entre 1 e ${dados.lista.length}.\n${textoCancelar()}`);
      return true;
    }
    const atendente = dados.lista[escolha - 1];
    try {
      await repositoryAtendentes.Remover(atendente.numero);
      await carregarAtendentes();
      conversas.delete(msg.from);
      cancelarInactivityTimer(msg.from);
      await msg.reply(`✅ Atendente *${atendente.nome}* removido com sucesso.`);
    } catch (err) {
      await msg.reply(`❌ Erro ao remover: ${err.message}`);
    }
    return true;
  }

  return false;
}

async function processarEtapaGrupoAdmin(msg, textoLower, estado, nomeContato, usuario) {
  const nomeAdmin = usuario?.nome || buscarPerfilFixo(normalizarNumero(usuario?.numero || ""))?.nome || nomeContato;

  if (ehCancelarComando(textoLower)) {
    conversas.delete(msg.from);
    await msg.reply("Atendimento administrativo encerrado. Estamos à disposição.");
    return true;
  }

  if (textoLower === "1") {
    conversas.set(msg.from, {
      etapa: "cadastro_numero",
      dados: {
        admin: true,
        origem: "grupo",
      },
    });

    await msg.reply(
      `Cadastro de usuário.\n\n` +
      "Por favor, informe o número ou envie o contato.\n" +
      `${textoCancelar()}`
    );
    return true;
  }

  if (textoLower === "2") {
    await enviarResumoSetoresAdmin(msg);
    conversas.set(msg.from, {
      etapa: "grupo_admin_menu",
      dados: {},
    });
    return true;
  }

  if (textoLower === "3") {
    conversas.set(msg.from, {
      etapa: "ti_menu",
      dados: {},
    });

    await msg.reply(textoMenuTI(nomeAdmin));
    return true;
  }

  if (textoLower === "4") {
    conversas.set(msg.from, {
      etapa: "cq_menu",
      dados: {},
    });

    await msg.reply(textoMenuCQ(nomeAdmin));
    return true;
  }

  if (textoLower === "5" || ehPalavraMF(textoLower)) {
    await iniciarFluxoMF(msg);
    return true;
  }

  if (textoLower === "6" || ehPedidoAtendente(textoLower)) {
    await iniciarSelecaoAtendente(msg);
    return true;
  }

  if (textoLower === "7" || textoLower.includes("gerenciar atendente")) {
    conversas.set(msg.from, { etapa: "admin_atendentes_menu", dados: {} });
    resetInactivityTimer(msg.from);
    await msg.reply(textoMenuGerenciarAtendentes());
    return true;
  }

  if (ehApenasNumero(msg.body)) {
    const numeroDigitado = normalizarNumero(msg.body);
    if (numeroDigitado.length >= 8) {
      await enviarContatoSalvo(msg, numeroDigitado);
      return true;
    }
  }

  if (ehSaudacao(textoLower) || textoLower === "menu") {
    await msg.reply(textoMenuAdmin(nomeAdmin));
    return true;
  }

  await msg.reply("Escolha uma dessas opções acima.");
  return true;
}

async function enviarContatoSalvo(msg, numeroDigitado) {
  const numeroLimpo = normalizarNumero(numeroDigitado);
  if (!numeroLimpo) {
    await msg.reply("Número inválido. Por favor, verifique e tente novamente.");
    return true;
  }

  let usuario = await repositoryWhatsappUsuario.BuscarPorNumero(numeroLimpo);
  if (!usuario) {
    const perfilFixo = buscarPerfilFixo(numeroLimpo);
    if (perfilFixo) {
      usuario = {
        numero: numeroLimpo,
        nome: perfilFixo.nome,
        setor: perfilFixo.setor,
      };
    }
  }

  if (!usuario) {
    await msg.reply("Número não encontrado na base de cadastros.");
    return true;
  }

  const vcard = gerarVCardContato(usuario);
  await client.sendMessage(msg.from, vcard, { parseVCards: true });
  await msg.reply(`Contato de ${usuario.nome} (${usuario.setor}) enviado com sucesso.`);
  return true;
}

async function processarMensagemPrivada(msg, chat, contato, nomeContato, textoLower) {
  const numeroWhatsApp = normalizarNumero(contato.id?.user || contato.number || msg.from);
  const ehAdmin = ADMIN_NUMEROS.has(numeroWhatsApp);
  const nomeAdmin = buscarPerfilFixo(numeroWhatsApp)?.nome || nomeContato;

  // ── Bridge: usuário em atendimento com atendente ────────────────────────────
  const ponte = pontes.get(msg.from);
  if (ponte) {
    cancelarInactivityTimer(msg.from);
    const atendenteJid = numeroParaJid(ponte.atendenteNumero);
    if (normalizarTexto(msg.body) === "encerrar") {
      pontes.delete(msg.from);
      ponteReversa.delete(atendenteJid);
      await msg.reply("Atendimento encerrado. Obrigado por nos contatar! 👋");
      try { await client.sendMessage(atendenteJid, `🔕 ${ponte.nomeUsuario} encerrou o atendimento.`); } catch {}
      return;
    }
    try {
      await client.sendMessage(atendenteJid, `${ponte.nomeUsuario}:\n${msg.body}`);
    } catch {
      await msg.reply("❌ Não foi possível encaminhar. O atendente pode estar indisponível.");
    }
    resetInactivityTimer(msg.from);
    return;
  }

  // ── Bridge: atendente respondendo para o usuário ────────────────────────────
  const ponteRevInfo = buscarPonteReversaPorJid(msg.from, numeroWhatsApp);
  if (ponteRevInfo) {
    const ponteRev = ponteRevInfo.jidUsuario;
    const jidAtendente = ponteRevInfo.jidAtendente;
    const nomeAtendente = buscarPerfilFixo(numeroWhatsApp)?.nome || nomeContato;
    if (normalizarTexto(msg.body) === "encerrar") {
      pontes.delete(ponteRev);
      ponteReversa.delete(jidAtendente);
      cancelarInactivityTimer(ponteRev);
      try { await client.sendMessage(ponteRev, "Atendimento encerrado pelo atendente. Se precisar, é só chamar! 👋"); } catch {}
      await msg.reply("Atendimento encerrado.");
      return;
    }
    try { await client.sendMessage(ponteRev, `${nomeAtendente}:\n${msg.body}`); } catch {}
    return;
  }

  const estado = conversas.get(msg.from);
  const usuario = await repositoryWhatsappUsuario.BuscarPorNumero(numeroWhatsApp);
  const setorUsuario = usuario?.setor || buscarPerfilFixo(numeroWhatsApp)?.setor || "";
  const contextoVinculo = {
    numero: numeroWhatsApp,
    setor: setorUsuario,
    ehAdmin,
  };
  const fluxoVinculado = buscarFluxoVinculado(contextoVinculo);

  if (!usuario && !ehAdmin && !estado && !fluxoVinculado) {
    return;
  }

  // Cancelamento global: funciona em qualquer etapa ativa
  if (estado && ehCancelarComando(textoLower)) {
    conversas.delete(msg.from);
    cancelarInactivityTimer(msg.from);
    await msg.reply("Atendimento encerrado. Sempre que precisar, estamos à disposição. 😊");
    return;
  }

  if (estado) {
    if (estado.etapa && estado.etapa.startsWith("cadastro_")) {
      const tratouCadastro = await processarEtapaCadastro(
        msg,
        textoLower,
        estado,
        nomeAdmin
      );
      if (tratouCadastro) return;
    }

    if (estado.etapa && estado.etapa.startsWith("mf_")) {
      const tratouMF = await processarEtapaMF(msg, textoLower, estado);
      if (tratouMF) return;
    }

    if (estado.etapa && estado.etapa.startsWith("ti_")) {
      const usuarioTI = await repositoryWhatsappUsuario.BuscarPorNumero(numeroWhatsApp);
      const tratouTI = await processarEtapaTI(msg, textoLower, estado, usuarioTI);
      if (tratouTI) return;
    }

    if (estado.etapa && estado.etapa.startsWith("cq_")) {
      const usuarioCQ = await repositoryWhatsappUsuario.BuscarPorNumero(numeroWhatsApp);
      const tratouCQ = await processarEtapaCQ(msg, textoLower, estado, usuarioCQ);
      if (tratouCQ) return;
    }

    if (estado.etapa === "fluxo_dinamico") {
      if (await processarEtapaFluxoDinamico(msg, textoLower, estado)) return;
    }

    if (estado.etapa && estado.etapa.startsWith("admin_atendentes_")) {
      if (await processarEtapaAdminAtendentes(msg, textoLower, estado)) return;
    }

    if (estado.etapa === "aguardando_atendente") {
      if (ehCancelarComando(textoLower)) {
        conversas.delete(msg.from);
        cancelarInactivityTimer(msg.from);
        await msg.reply("Ok, cancelado. Se precisar, é só chamar! 😊");
        return;
      }
      const atendentes = listarAtendentesDisponiveis();
      if (!atendentes.length) {
        conversas.delete(msg.from);
        cancelarInactivityTimer(msg.from);
        await msg.reply(textoSemAtendenteDisponivel());
        return;
      }
      const escolha = parseInt(textoLower, 10);
      if (!Number.isFinite(escolha) || escolha < 1 || escolha > atendentes.length) {
        await msg.reply(`❌ Opção inválida. Escolha um número entre 1 e ${atendentes.length}.\n${textoCancelar()}`);
        return;
      }
      const atendente = atendentes[escolha - 1];
      const atendenteJid = numeroParaJid(atendente.numero);
      if (ponteReversa.has(atendenteJid)) {
        const atendentesAtualizados = listarAtendentesDisponiveis();
        if (!atendentesAtualizados.length) {
          conversas.delete(msg.from);
          cancelarInactivityTimer(msg.from);
          await msg.reply(textoSemAtendenteDisponivel());
          return;
        }
        await msg.reply(`⚠️ ${atendente.nome} acabou de entrar em atendimento. Escolha outro atendente.\n\n${textoListaAtendentes(atendentesAtualizados)}`);
        return;
      }
      conversas.delete(msg.from);
      const nomeParaPonte = usuario?.nome || nomeContato;
      pontes.set(msg.from, { atendenteNumero: normalizarNumero(atendente.numero), nomeAtendente: atendente.nome, nomeUsuario: nomeParaPonte });
      ponteReversa.set(atendenteJid, msg.from);
      resetInactivityTimer(msg.from);
      await msg.reply(`Conectando você com *${atendente.nome}*... ✅\n\nSuas mensagens serão encaminhadas automaticamente.\nPara encerrar o atendimento, envie *encerrar*.`);
      try {
        await client.sendMessage(
          atendenteJid,
          `📲 *Nova solicitação de atendimento!*\n\n` +
          `*${nomeParaPonte}* quer falar com você.\n\n` +
          `As mensagens serão encaminhadas automaticamente.\n` +
          `Para encerrar, envie *encerrar*.`
        );
      } catch {
        pontes.delete(msg.from);
        ponteReversa.delete(atendenteJid);
        cancelarInactivityTimer(msg.from);
        await msg.reply("❌ Não foi possível conectar com o atendente. Tente novamente mais tarde.");
      }
      return;
    }
  }

  if (ehAdmin && ehApenasNumero(msg.body) && !estado) {
    const numeroDigitado = normalizarNumero(msg.body);
    if (numeroDigitado.length >= 8) {
      await enviarContatoSalvo(msg, numeroDigitado);
      return;
    }
  }

  if (ehPalavraMF(textoLower)) {
    await iniciarFluxoMF(msg);
    return;
  }

  if (ehPedidoAtendente(textoLower) && !estado) {
    await iniciarSelecaoAtendente(msg);
    return;
  }

  if (textoLower === "status") {
    await msg.reply(
      `${saudacao()}, ${nomeContato}.\n\n` +
      `Status do sistema: ${clientePronto ? "✅ Conectado" : "❌ Desconectado"}`
    );
    return;
  }

  if (!estado && (ehSaudacao(textoLower) || textoLower === "menu")) {
    if (await verificarFluxoVinculado(msg, contextoVinculo)) {
      return;
    }
  }

  if (!estado && await verificarFluxoDinamico(msg, textoLower)) {
    return;
  }

  if (!usuario && !ehAdmin) {
    return;
  }

  if (ehAdmin && !usuario) {
    if (ehPedidoCadastro(textoLower) || textoLower === "1") {
      conversas.set(msg.from, {
        etapa: "cadastro_numero",
        dados: {
          admin: true,
        },
      });

      await msg.reply(
        `${saudacao()}, ${nomeAdmin}.\n\n` +
        "Cadastro de usuário.\n\n" +
        "Por favor, informe o número ou envie o contato.\n" +
        `${textoCancelar()}`
      );
      return;
    }

    if (textoLower === "2" || textoLower.includes("setor")) {
      await enviarResumoSetoresAdmin(msg);
      return;
    }

    if (textoLower === "3" || textoLower.includes("ti")) {
      await msg.reply(textoMenuTI(nomeAdmin));
      return;
    }

    if (textoLower === "4" || textoLower.includes("qualidade")) {
      await msg.reply(textoMenuCQ(nomeAdmin));
      return;
    }

    if (textoLower === "5" || ehPalavraMF(textoLower)) {
      await iniciarFluxoMF(msg);
      return;
    }

    if (textoLower === "6" || ehPedidoAtendente(textoLower)) {
      await iniciarSelecaoAtendente(msg);
      return;
    }

    if (textoLower === "7" || textoLower.includes("gerenciar atendente")) {
      conversas.set(msg.from, { etapa: "admin_atendentes_menu", dados: {} });
      resetInactivityTimer(msg.from);
      await msg.reply(textoMenuGerenciarAtendentes());
      return;
    }

    if (ehSaudacao(textoLower) || textoLower === "menu") {
      await msg.reply(textoMenuAdmin(nomeAdmin));
      return;
    }

    await msg.reply("Escolha uma dessas opções acima.");
    return;
  }

  const setor = (usuario.setor || "").toString().trim().toUpperCase();
  const nomeUsuario = usuario.nome || usuario.NAME || nomeContato;

  if (ehPedidoCadastro(textoLower)) {
    conversas.set(msg.from, {
      etapa: "cadastro_numero",
      dados: {
        numero: numeroWhatsApp,
        admin: false,
      },
    });

    await msg.reply(
      `${saudacao()}, ${nomeUsuario}.\n\n` +
      "O cadastro de usuários é restrito ao setor administrativo.\n" +
      "Por favor, entre em contato com o administrador do sistema."
    );
    return;
  }

  if (ehSaudacao(textoLower)) {
    if (setor === "TI") {
      await msg.reply(textoMenuTI(nomeUsuario));
      return;
    }

    if (setor === "CONTROLE DE QUALIDADE") {
      await msg.reply(textoMenuCQ(nomeUsuario));
      return;
    }
  }

  if (setor === "TI") {
    await processarEtapaTI(
      msg,
      textoLower,
      {
        etapa: "ti_menu",
        dados: {},
      },
      usuario
    );
    return;
  }

  if (setor === "CONTROLE DE QUALIDADE") {
    await processarEtapaCQ(
      msg,
      textoLower,
      {
        etapa: "cq_menu",
        dados: {},
      },
      usuario
    );
    return;
  }

  await msg.reply(textoMenuPrincipal(nomeContato));
}

async function processarMensagemGrupo(msg, chat, textoLower, numeroWhatsApp, ehAdmin) {
  if (textoLower === "!teste") {
    await msg.reply("Iniciando verificação do sistema...");
    await delay(800);
    await msg.reply("Verificando conexões...");
    await delay(800);
    await msg.reply("Sistema operacional.");
    await delay(500);
    await msg.reply("Bot AgroSolo ativo e pronto para atendimento. Como posso ajudar?");
    return;
  }

  if (textoLower === "!welder" || textoLower === "!admin") {
    conversas.set(msg.from, {
      etapa: "grupo_admin_menu",
      dados: {},
    });
    await msg.reply(textoMenuAdmin("Welder"));
    return;
  }

  if (textoLower === "!ti") {
    conversas.set(msg.from, {
      etapa: "ti_menu",
      dados: {},
    });
    await msg.reply(textoMenuTI("Welder"));
    return;
  }

  if (
    textoLower === "!controledequalidade" ||
    textoLower === "!controledequalide" ||
    textoLower === "!cq"
  ) {
    conversas.set(msg.from, {
      etapa: "cq_menu",
      dados: {},
    });
    await msg.reply(textoMenuCQ("Welder"));
    return;
  }

  const estado = conversas.get(msg.from);
  const usuario = ehAdmin ? await repositoryWhatsappUsuario.BuscarPorNumero(numeroWhatsApp) : null;

  if (estado) {
    if (estado.etapa === "grupo_admin_menu") {
      const tratouAdmin = await processarEtapaGrupoAdmin(msg, textoLower, estado, msg._data?.notifyName || chat.name || "Welder", usuario);
      if (tratouAdmin) return;
    }

    if (estado.etapa && estado.etapa.startsWith("cadastro_")) {
      const tratouCadastro = await processarEtapaCadastro(
        msg,
        textoLower,
        estado,
        msg._data?.notifyName || chat.name || "Welder"
      );
      if (tratouCadastro) return;
    }

    if (estado.etapa && estado.etapa.startsWith("mf_")) {
      const tratouMF = await processarEtapaMF(msg, textoLower, estado);
      if (tratouMF) return;
    }

    if (estado.etapa && (estado.etapa.startsWith("ti_") || estado.etapa === "ti_menu")) {
      const tratouTI = await processarEtapaTI(msg, textoLower, estado, usuario);
      if (tratouTI) return;
    }

    if (estado.etapa && (estado.etapa.startsWith("cq_") || estado.etapa === "cq_menu")) {
      const tratouCQ = await processarEtapaCQ(msg, textoLower, estado, usuario);
      if (tratouCQ) return;
    }

    if (estado.etapa === "fluxo_dinamico") {
      if (await processarEtapaFluxoDinamico(msg, textoLower, estado)) return;
    }
  }

  if (!conversas.get(msg.from) && await verificarFluxoDinamico(msg, textoLower)) return;

  const nomeGrupo = process.env.WHATSAPP_GRUPO || "";
  if (!nomeGrupo) return;
  if (!normalizarTexto(chat.name).includes(normalizarTexto(nomeGrupo))) return;

  if (textoLower === "relatorio") {
    await msg.reply("Aguarde. Estamos gerando o relatório PDF...");
    const caminhoPDF = await gerarRelatorioPDF();
    if (!fs.existsSync(caminhoPDF)) {
      await msg.reply(`Não foi possível localizar o arquivo PDF gerado. Por favor, tente novamente.`);
      return;
    }

    const estatisticas = fs.statSync(caminhoPDF);
    console.log(`PDF de controle de qualidade pronto para envio: ${caminhoPDF} (${estatisticas.size} bytes)`);

    const media = MessageMedia.fromFilePath(caminhoPDF);
    const legenda =
      `RELATÓRIO DE CONTROLE DE QUALIDADE\n` +
      `Data: ${new Date().toLocaleDateString("pt-BR")}\n` +
      `Hora: ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}\n` +
      `Gerado pelo Sistema AgroSolo`;
    await client.sendMessage(chat.id._serialized, media, {
      sendMediaAsDocument: true,
      caption: legenda,
    });
    await msg.reply("Relatorio PDF enviado.");
    return;
  }

  if (textoLower === "status") {
    await msg.reply(
      `${saudacao()}, ${msg._data?.notifyName || chat.name || "grupo"}.\n\n` +
      `WhatsApp conectado: ${clientePronto ? "sim" : "nao"}`
    );
  }
}

client.on("message_create", async (msg) => {
  if (msg.fromMe) return;

  const jid = String(msg.from || "");
  if (!jid.endsWith("@c.us") && !jid.endsWith("@g.us")) {
    return;
  }

  if (!clientePronto) {
    return;
  }

  try {
    const chat = await msg.getChat();
    const contato = await msg.getContact();
    const nomeContato = contato.pushname || contato.name || contato.number || "Usuario";
    const numeroWhatsApp = normalizarNumero(contato.id?.user || contato.number || msg.from);
    const ehAdmin = ADMIN_NUMEROS.has(numeroWhatsApp);
    const textoLower = normalizarTexto(msg.body);

    if (chat.isGroup) {
      await processarMensagemGrupo(msg, chat, textoLower, numeroWhatsApp, ehAdmin);
      return;
    }

    // Cooldown anti-spam: ignora mensagens rápidas quando não há fluxo ativo
    const semFluxoAtivo = !conversas.has(msg.from) && !pontes.has(msg.from) && !ponteReversa.has(msg.from);
    if (semFluxoAtivo) {
      const agora = Date.now();
      const ultimo = cooldownMap.get(msg.from) || 0;
      if (agora - ultimo < COOLDOWN_MS) {
        console.log(`[Bot] Msg ignorada (cooldown): ${msg.from} - "${String(msg.body || "").slice(0, 30)}"`);
        return;
      }
      cooldownMap.set(msg.from, agora);
    }

    await processarMensagemPrivada(msg, chat, contato, nomeContato, textoLower);

    // Timer de inatividade: se há conversa ou bridge ativa, avisa após 2 min sem resposta
    if (conversas.has(msg.from) || pontes.has(msg.from)) {
      resetInactivityTimer(msg.from);
    }
  } catch (error) {
    if (isSessaoInstavelError(error) || isProtocolTimeoutError(error)) {
      console.warn("Fluxo do WhatsApp pausado por instabilidade de sessao. Aguardando reconexao...");
      return;
    }
    console.error("Erro no fluxo do WhatsApp:", error);
  }
});

export function inicializarWhatsApp() {
  console.log("Inicializando WhatsApp...");
  initializeClientSafe("startup").catch((error) => {
    console.error("Falha ao inicializar WhatsApp:", error?.message || error);
  });
}

export async function enviarMensagem(texto) {
  if (!clientePronto) throw new Error("WhatsApp nao esta conectado");

  const nomeGrupo = process.env.WHATSAPP_GRUPO || "";
  if (!nomeGrupo) throw new Error("WHATSAPP_GRUPO nao configurado no .env");

  const grupoId = grupoIdCache || (await buscarIdGrupo(nomeGrupo));
  if (!grupoId) throw new Error(`Grupo "${nomeGrupo}" nao encontrado`);

  await client.sendMessage(grupoId, texto);
  console.log(`Mensagem enviada para o grupo "${nomeGrupo}"`);
  return [{ grupo: nomeGrupo, status: "enviado" }];
}

export async function enviarPDF(caminhoArquivo, legendaTexto) {
  if (!clientePronto) throw new Error("WhatsApp nao esta conectado");

  const nomeGrupo = process.env.WHATSAPP_GRUPO || "";
  if (!nomeGrupo) throw new Error("WHATSAPP_GRUPO nao configurado no .env");
  const grupoId = grupoIdCache || (await buscarIdGrupo(nomeGrupo));
  if (!grupoId) throw new Error(`Grupo "${nomeGrupo}" nao encontrado`);

  try {
    await enviarMediaComRetry({
      grupoIdInicial: grupoId,
      caminhoArquivo,
      sendOptions: { caption: legendaTexto },
      contexto: "PDF",
    });
  } catch (error) {
    const msg = String(error?.message || "").toLowerCase();
    const isDetachedFrame = msg.includes("detached frame") || msg.includes("execution context was destroyed");
    if (isDetachedFrame) {
      clientePronto = false;
      throw new Error("Sessao do WhatsApp instavel (detached frame). Reconecte o WhatsApp e tente novamente.");
    }
    throw error;
  }
  console.log(`PDF enviado para o grupo "${nomeGrupo}"`);
  return [{ grupo: nomeGrupo, status: "enviado" }];
}

export function isConectado() {
  return clientePronto;
}

// Tenta enviar pendentes a cada 2 minutos enquanto o cliente estiver pronto.
setInterval(() => {
  if (!clientePronto) return;
  enviarTodosPendentes().catch((err) => {
    console.error("[WA] Erro no flush periódico de pendentes:", err?.message);
  });
}, 2 * 60 * 1000);
