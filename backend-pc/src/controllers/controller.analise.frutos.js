import { gerarRelatorioAnaliseFrutosPDF } from "../services/service.pdf.js";
import { isConectado, enviarAFPendentes } from "../services/service.whatsapp.js";
import repositoryAnaliseFrutos from "../repositories/repository.analise.frutos.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import axios from "axios";

import { FOTOS_ROOT, BACKEND_ROOT } from "../config/storage.js";

const ANALISE_FRUTOS_EXTERNAL_API = "http://10.107.114.11:3002/analise_de_frutos";
const SAFRA_TALHAO_API = "http://10.107.114.11:3000/backend/busca_generica/comandoGenerico";
const SAFRA_TALHAO_SQL = "SELECT * FROM AGDTI.DXDW_VW_SAFRA_TALHAO";

// Calcula a semana ISO 8601 no formato YYYYWW (ex: 202617)
const getSemanaAtual = () => {
  const now = new Date();
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const yearStart = new Date(date.getFullYear(), 0, 4);
  const week = 1 + Math.round(((date - yearStart) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}${String(week).padStart(2, "0")}`;
};

// Busca a safra correspondente ao talhão e semana atual na view Oracle.
const buscarSafraPorTalhao = async (talhao) => {
  try {
    const talhaoNorm = String(talhao || "").trim().toLowerCase();
    if (!talhaoNorm) return null;

    const { data } = await axios.get(SAFRA_TALHAO_API, {
      params: { comando: SAFRA_TALHAO_SQL },
      timeout: 10000,
    });

    const rows = Array.isArray(data) ? data : (Array.isArray(data?.rows) ? data.rows : []);
    const semanaAtual = getSemanaAtual();

    const match = rows.find((row) => {
      const descricao = String(row?.TALH_ST_DESCRICAO || "").trim().toLowerCase();
      if (descricao !== talhaoNorm) return false;

      const inicio = String(row?.DATA_INICIO_CICLO || "").trim();
      const fim    = String(row?.DATA_FIM_CICLO    || "").trim();

      if (!inicio) return false;
      if (semanaAtual < inicio) return false;
      if (fim && semanaAtual > fim) return false;
      return true;
    });

    const safra = match?.SAFRA_ST_CODIGO || null;
    console.log(`[SafraTalhao] talhao="${talhao}" semana=${semanaAtual} → safra=${safra ?? "não encontrada"}`);
    return safra;
  } catch (err) {
    console.warn("[SafraTalhao] Falha ao buscar safra:", err.message);
    return null;
  }
};

// Remove registros antigos da API externa por data + fazenda + talhao + controle + safra
const deletarRegistrosApiExterna = async ({ data, fazenda, talhao, controle, safra }) => {
  const normalizeDateOnly = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return raw;
  };

  const dataNorm = normalizeDateOnly(data);
  const fazendaNorm = String(fazenda || "").trim().toUpperCase();
  const controleNorm = String(controle || "");
  const talhaoNorm = String(talhao || "");
  const safraNorm = String(safra || "").trim().toUpperCase();

  let existentes = [];
  try {
    const { data } = await axios.get(ANALISE_FRUTOS_EXTERNAL_API, {
      params: {
        data: dataNorm,
        fazenda: String(fazenda || ""),
        fundo_agricola: String(fazenda || ""),
        controle: controleNorm,
        talhao: talhaoNorm,
        safra: safraNorm,
        limit: 1000,
      },
      timeout: 10000,
    });
    existentes = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
  } catch (error) {
    console.warn("[AnaliseFrutos][API Externa] Falha ao listar registros antigos para limpeza:", error?.response?.data || error?.message);
    throw error;
  }

  const numerosDosFrutos = Array.from(new Set(
    existentes
      .filter((row) => {
        const rowData = normalizeDateOnly(row?.DATA ?? row?.data ?? "");
        const rowFazenda = String(row?.FUNDO_AGRICOLA ?? row?.fundo_agricola ?? row?.FAZENDA ?? row?.fazenda ?? "").trim().toUpperCase();
        const rowSafra = String(row?.SAFRA ?? row?.safra ?? "").trim().toUpperCase();
        const okData = !dataNorm || rowData === dataNorm;
        const okFazenda = !fazendaNorm || rowFazenda === fazendaNorm;
        const okSafra = !safraNorm || rowSafra === safraNorm;
        return okData && okFazenda && okSafra;
      })
      .map((row) => String(row?.NUMERO_FRUTO ?? row?.numero_fruto ?? "").trim())
      .filter(Boolean)
  ));

  if (!numerosDosFrutos.length) {
    console.log(`[AnaliseFrutos][API Externa] DELETE (edição): nenhum registro antigo encontrado para data=${dataNorm || "-"} fazenda=${fazendaNorm || "-"} controle=${controleNorm} talhao=${talhaoNorm} safra=${safraNorm || "-"}`);
    return { deleted: 0, notFound: 0, errors: [] };
  }

  const resultados = await Promise.allSettled(
    numerosDosFrutos.map(async (numero_fruto) => {
      try {
        await axios.delete(ANALISE_FRUTOS_EXTERNAL_API, {
          params: {
            data: dataNorm,
            fazenda: String(fazenda || ""),
            fundo_agricola: String(fazenda || ""),
            safra: safraNorm,
            controle: controleNorm,
            talhao: talhaoNorm,
            numero_fruto: numero_fruto,
          },
          timeout: 10000,
        });
        return { numero_fruto, status: "deleted" };
      } catch (error) {
        const status = error?.response?.status;
        if (status === 404) {
          return { numero_fruto, status: "not_found" };
        }
        throw error;
      }
    })
  );

  const deleted = resultados.filter((r) => r.status === "fulfilled" && r.value?.status === "deleted").length;
  const notFound = resultados.filter((r) => r.status === "fulfilled" && r.value?.status === "not_found").length;
  const errors = resultados.filter((r) => r.status === "rejected");

  console.log(`[AnaliseFrutos][API Externa] DELETE (edição): removidos=${deleted} não_encontrados=${notFound} erros=${errors.length} (data=${dataNorm || "-"} fazenda=${fazendaNorm || "-"} controle=${controleNorm} talhao=${talhaoNorm} safra=${safraNorm || "-"})`);

  return { deleted, notFound, errors };
};

// Envia cada lote como uma linha separada para a API externa (em background, sem bloquear resposta).
const enviarParaApiExterna = async (payload, frutos, lotes) => {
  try {
    // DD/MM/YYYY → YYYY-MM-DD
    const converterData = (dataStr) => {
      const s = String(dataStr || "").trim();
      const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) return `${match[3]}-${match[2]}-${match[1]}`;
      return s;
    };

    // Número com vírgula como separador decimal (padrão Oracle/Brasil)
    const formatarValor = (v) => {
      if (v === null || v === undefined || v === "") return "";
      return String(Number(v).toFixed(1)).replace(".", ",");
    };

    const agora = new Date();
    const momento = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

    const fazenda   = String(payload.fazenda_talhao || payload.fazenda || "");
    const talhao    = String(payload.talhao || "");
    const variedade = String(payload.variedade || "");

    // Busca safra pela semana atual + talhão na Oracle; fallback para payload.safra
    const safraOracle = await buscarSafraPorTalhao(talhao);
    const safra = safraOracle || String(payload.safra || "M26");

    const base = {
      tipo_analise:  String(payload.tipo_analise || ""),
      fundo_agricola: fazenda,
      fazenda_talhao: [fazenda, talhao, variedade].filter(Boolean).join(" - "),
      talhao,
      safra,
      semana:        String(payload.semana || ""),
      data:          converterData(payload.data),
      controle:      String(payload.controle || ""),
      variedade,
      qtd_frutos:    String(frutos.length || ""),
      momento,
    };

    // Uma linha por lote (numero_fruto + criterio + valor)
    const rows = (lotes || []).map((lote) => {
      const fruto = frutos.find((f) => f.numero_fruto === lote.numero_fruto) || {};
      return {
        ...base,
        criterio:      String(lote.criterio || ""),
        numero_fruto:  String(lote.numero_fruto || ""),
        valor:         formatarValor(lote.valor),
        danos_internos: String(fruto.danos_internos || ""),
      };
    });

    if (!base.controle) {
      console.warn("[AnaliseFrutos][API Externa] Campo 'controle' vazio. Envio externo cancelado.");
      return;
    }

    const isEdicao = Boolean(payload?._is_edicao_api_externa);
    console.log(`[AnaliseFrutos][API Externa] Iniciando envio — controle=${base.controle} isEdicao=${isEdicao}`);

    console.log(`[AnaliseFrutos][API Externa] ${isEdicao ? "EDIÇÃO (DELETE + POST)" : "NOVO (POST)"} — ${rows.length} linha(s)`);
    console.log("[AnaliseFrutos][API Externa] Exemplo linha:", JSON.stringify(rows[0], null, 2));

    if (isEdicao) {
      const deleteResult = await deletarRegistrosApiExterna({
        data: base.data,
        fazenda: base.fundo_agricola,
        talhao: base.talhao,
        controle: base.controle,
        safra: base.safra,
      });
      if (deleteResult.errors.length > 0) {
        const firstError = deleteResult.errors[0]?.reason;
        throw new Error(`Falha ao limpar registros antigos para edição: ${firstError?.response?.data?.detail || firstError?.message || "erro desconhecido"}`);
      }
    }

    const resultados = await Promise.allSettled(
      rows.map(async (row) => {
        return axios.post(ANALISE_FRUTOS_EXTERNAL_API, row, { timeout: 10000 });
      })
    );

    const ok    = resultados.filter((r) => r.status === "fulfilled").length;
    const erros = resultados.filter((r) => r.status === "rejected");
    console.log(`[AnaliseFrutos][API Externa] OK: ${ok} | Erro: ${erros.length}`);
    erros.forEach((r, i) => {
      console.error(`[AnaliseFrutos][API Externa] Erro linha ${i}:`, r.reason?.response?.data || r.reason?.message);
    });

    if (ok > 0 && payload.form_id) {
      await repositoryAnaliseFrutos.MarcarEnviadoApiExterna(payload.form_id, ok);
      console.log(`[AnaliseFrutos][API Externa] Marcado no banco: form_id=${payload.form_id} linhas=${ok}`);
    }
  } catch (err) {
    console.error("[AnaliseFrutos][API Externa] Falha geral:", err.message, err.response?.data);
  }
};

// LOCAL: tudo (pdf, json, fotos) em analise_frutos/{tipo}/{fazenda}/{variedade}/{controle}/{data}/
const ANALISE_FRUTOS_ROOT = path.join(BACKEND_ROOT, "analise_frutos");
// REDE: mesma estrutura, mas no servidor 0.201
const ANALISE_FRUTOS_NETWORK_ROOT = path.join(FOTOS_ROOT, "analise_frutos");

// Fazendas que incluem talhao na estrutura de pastas
const FAZENDAS_COM_TALHAO = [
  "bom_jesus", "brandoes", "ilha_grande", "ilha_da_varzea", "cachoeira", "frutos_da_ilha",
];

// Campos de fotos enviados pelo app para analise de producao
const PRODUCAO_CAMPOS_FOTOS = ["firmeza", "maturacao", "danos_internos"];

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

// Copia recursivamente um diretório para a rede (fotos).
// skipFilter(name) → true para pular o arquivo.
const copyDirToNetwork = (srcDir, destDir, logPrefix = "[Upload]", skipFilter = null) => {
  try {
    if (!fs.existsSync(srcDir)) return;
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    ensureDir(destDir);
    entries.forEach((e) => {
      if (skipFilter && skipFilter(e.name)) return;
      const s = path.join(srcDir, e.name);
      const d = path.join(destDir, e.name);
      if (e.isDirectory()) copyDirToNetwork(s, d, logPrefix, skipFilter);
      else fs.copyFileSync(s, d);
    });
    console.log(`${logPrefix} Copiado para rede: ${destDir}`);
  } catch (err) {
    console.warn(`${logPrefix} Falha ao copiar para rede: [${err.code || "ERR"}] ${err.message}`);
  }
};

const normalizeTipo = (tipo = "") => {
  return String(tipo || "shelf_life")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^analise\s+de\s+/i, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "")
    || "shelf_life";
};

const sanitizeFolder = (value, fallback = "sem_nome") =>
  String(value || fallback)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim()
    .slice(0, 60) || fallback;

// Normaliza o nome da fazenda para comparacao com a lista FAZENDAS_COM_TALHAO
const normalizeFazendaKey = (value = "") =>
  String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+(1|2)$/i, "")   // remove sufixo " 1" ou " 2" (ex: Frutos da Ilha 1)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "";

const fazendaTemTalhao = (fazenda = "") =>
  FAZENDAS_COM_TALHAO.includes(normalizeFazendaKey(fazenda));

const shouldSkipJsonFilesForRequest = (req) => {
  const host = String(req?.headers?.host || "");
  const forwardedHost = String(req?.headers?.["x-forwarded-host"] || "");
  const origin = String(req?.headers?.origin || "");
  const referer = String(req?.headers?.referer || "");
  const requestContext = `${host} ${forwardedHost} ${origin} ${referer}`;
  return /192\.168\.0\.201/.test(requestContext);
};

const buildServerFormId = (rawFormId, now = new Date()) => {
  const candidate = String(rawFormId || "").trim();
  if (!candidate || /offline/i.test(candidate)) {
    return `AF-${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  }
  return candidate;
};

// Formata Date para YYYY-MM-DD
const formatDateFolder = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const sanitizeWeekFolder = (semana) => {
  const week = String(semana ?? "").trim();
  const normalized = sanitizeFolder(week, "sem_semana");
  return /^semana_/i.test(normalized) ? normalized : `semana_${normalized}`;
};

const parsePayloadDate = (value, fallback = new Date()) => {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso;
  return fallback;
};

const buildFotoProdBaseName = (fazenda, talhao, variedade, controle) => {
  const partes = [
    sanitizeFolder(fazenda, "sem_fazenda"),
    sanitizeFolder(talhao, "sem_talhao"),
    sanitizeFolder(variedade, "sem_variedade"),
    sanitizeFolder(controle, "sem_controle"),
  ].filter(Boolean);

  return partes.join("_") || "foto_producao";
};

// Monta caminho local e URL para fotos de producao.
// Estrutura: analise_frutos/analiseproducao/semana_<semana>/foto
const getFotosProdDir = (fazenda, talhao, variedade, controle, semana) => {
  const semanaDir = sanitizeWeekFolder(semana);
  return {
    dir: path.join(ANALISE_FRUTOS_ROOT, "analiseproducao", semanaDir, "foto"),
    urlPath: `analiseproducao/${semanaDir}/foto`,
    fileBaseName: buildFotoProdBaseName(fazenda, talhao, variedade, controle),
  };
};

// Monta caminho de REDE para fotos de producao - mesma estrutura do local
const getFotosProdDirNetwork = (semana) => {
  const semanaDir = sanitizeWeekFolder(semana);
  return path.join(ANALISE_FRUTOS_NETWORK_ROOT, "analiseproducao", semanaDir, "foto");
};

// Calcula o diretório LOCAL: {tipo}/{fazenda}/{variedade}/{controle}/{YYYY-MM-DD}
// Mesma estrutura do servidor 0.201 — sem separar por mes/dia em pastas distintas
const getDateParts = (date = new Date(), tipo = "shelf_life", { fazenda = "sem_fazenda", talhao = null, variedade = "sem_variedade", controle = "sem_controle" } = {}) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day   = String(date.getDate()).padStart(2, "0");
  const dt    = formatDateFolder(date);
  const faz   = sanitizeFolder(fazenda,   "sem_fazenda");
  const vari  = sanitizeFolder(variedade, "sem_variedade");
  const ctrl  = sanitizeFolder(controle,  "sem_controle");
  const tipoDir = normalizeTipo(tipo);

  let localDir, urlBase;
  if (fazendaTemTalhao(fazenda) && talhao) {
    const tal = sanitizeFolder(talhao, "sem_talhao");
    localDir = path.join(ANALISE_FRUTOS_ROOT, tipoDir, faz, tal, vari, ctrl, dt);
    urlBase  = `${tipoDir}/${faz}/${tal}/${vari}/${ctrl}/${dt}`;
  } else {
    localDir = path.join(ANALISE_FRUTOS_ROOT, tipoDir, faz, vari, ctrl, dt);
    urlBase  = `${tipoDir}/${faz}/${vari}/${ctrl}/${dt}`;
  }

  return {
    month, day,
    fazenda: faz, variedade: vari, controle: ctrl,
    pdfDir:    localDir,
    jsonDir:   localDir,
    fotosDir:  localDir,
    // pdfFolder/jsonFolder incluem "analise_frutos/" para que resolveStoragePath(pdf_path)
    // resolva corretamente como BACKEND_ROOT/analise_frutos/...
    pdfFolder:  `analise_frutos/${urlBase}`,
    jsonFolder: `analise_frutos/${urlBase}`,
    // fotosFolder é usado nas URLs /api/analise-frutos/fotos/* onde o static já
    // aponta para ANALISE_FRUTOS_DIR — não precisa do prefixo
    fotosFolder: urlBase,
  };
};

// Diretório de REDE equivalente ao localDir — mesma estrutura, raiz diferente
const getNetworkDir = (tipo, fazenda, talhao, variedade, controle, date = new Date()) => {
  const faz  = sanitizeFolder(fazenda,   "sem_fazenda");
  const vari = sanitizeFolder(variedade, "sem_variedade");
  const ctrl = sanitizeFolder(controle,  "sem_controle");
  const dt   = formatDateFolder(date);
  const tipoDir = normalizeTipo(tipo);
  if (fazendaTemTalhao(fazenda) && talhao) {
    const tal = sanitizeFolder(talhao, "sem_talhao");
    return path.join(ANALISE_FRUTOS_NETWORK_ROOT, tipoDir, faz, tal, vari, ctrl, dt);
  }
  return path.join(ANALISE_FRUTOS_NETWORK_ROOT, tipoDir, faz, vari, ctrl, dt);
};

ensureDir(ANALISE_FRUTOS_ROOT);

const fileFilter = (req, file, cb) => {
  if (/^image\/(jpeg|png|webp)$/i.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Tipo de arquivo nao permitido. Use JPEG, PNG ou WebP."), false);
  }
};

const resolveDestDir = (req, file) => {
  const isProdCampo = PRODUCAO_CAMPOS_FOTOS.some((c) => file.fieldname === `fotos_${c}`);
  
  // Se for campo de produção E tiver semana, é análise de produção
  if (isProdCampo && req.body?.semana) {
    const { dir } = getFotosProdDir(
      req.body?.fazenda_talhao || req.body?.fazenda,
      req.body?.talhao,
      req.body?.variedade,
      req.body?.controle,
      req.body?.semana,
    );
    return dir;
  }
  
  const tipo = normalizeTipo(req.body?.tipo_analise);
  const { fotosDir } = getDateParts(new Date(), tipo, {
    fazenda: req.body?.fazenda_talhao || req.body?.fazenda,
    variedade: req.body?.variedade,
    controle: req.body?.controle,
  });
  
  // Se for fotos de campo geral (firmeza, maturacao, danos_internos), salvar em subpasta
  if (isProdCampo) {
    const campo = file.fieldname.replace("fotos_", "");
    return path.join(fotosDir, campo);
  }
  
  return fotosDir;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const dir = resolveDestDir(req, file);
      ensureDir(dir);
      cb(null, dir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const dir = resolveDestDir(req, file);
    if (!req._fotoCount) req._fotoCount = {};
    if (req._fotoCount[dir] === undefined) {
      let existing = 0;
      try { existing = fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).length; } catch {}
      req._fotoCount[dir] = existing;
    }
    req._fotoCount[dir]++;
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = ext === ".jpeg" ? ".jpg" : ext;
    const isProdCampo = PRODUCAO_CAMPOS_FOTOS.some((c) => file.fieldname === `fotos_${c}`);
    
    // Campos por tipo (firmeza/maturacao/danos_internos):
    // usa o mesmo padrão da análise de produção também no Shelf Life.
    if (isProdCampo && req.body?.semana) {
      const campo = file.fieldname.replace("fotos_", "");
      const { fileBaseName } = getFotosProdDir(
        req.body?.fazenda_talhao || req.body?.fazenda,
        req.body?.talhao,
        req.body?.variedade,
        req.body?.controle,
        req.body?.semana,
      );
      cb(null, `${fileBaseName}_${req._fotoCount[dir]}_${campo}${safeExt}`);
      return;
    }
    
    // Shelf Life/Pré-Colheita com fotos por campo (sem semana): mantém padrão completo.
    if (isProdCampo) {
      const campo = file.fieldname.replace("fotos_", "");
      const fileBaseName = buildFotoProdBaseName(
        req.body?.fazenda_talhao || req.body?.fazenda,
        req.body?.talhao,
        req.body?.variedade,
        req.body?.controle,
      );
      cb(null, `${fileBaseName}_${req._fotoCount[dir]}_${campo}${safeExt}`);
      return;
    }
    
    cb(null, `foto_${req._fotoCount[dir]}${safeExt}`);
  },
});

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 60,
  },
});

// Middleware que aceita fotos gerais + campos de producao
export const uploadFields = upload.fields([
  { name: "fotos",              maxCount: 20 },
  { name: "fotos_firmeza",      maxCount: 20 },
  { name: "fotos_maturacao",    maxCount: 20 },
  { name: "fotos_danos_internos", maxCount: 20 },
]);

const Salvar = async (req, res) => {
  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (typeof payload.frutos === "string") {
      try { payload.frutos = JSON.parse(payload.frutos); } catch {}
    }
    if (typeof payload.lotes === "string") {
      try { payload.lotes = JSON.parse(payload.lotes); } catch {}
    }
    if (typeof payload.maturacao_dist === "string") {
      try { payload.maturacao_dist = JSON.parse(payload.maturacao_dist); } catch {}
    }
    const frutos = Array.isArray(payload.frutos) ? payload.frutos : [];
    const lotes = Array.isArray(payload.lotes) ? payload.lotes : [];

    console.log("\n========== [AnaliseFrutos] PAYLOAD RECEBIDO ==========");
    console.log(JSON.stringify({
      fazenda: payload.fazenda_talhao || payload.fazenda,
      talhao: payload.talhao,
      variedade: payload.variedade,
      controle: payload.controle,
      semana: payload.semana,
      tipo_analise: payload.tipo_analise,
      data: payload.data,
      frutos,
      lotes,
      maturacao_dist: payload.maturacao_dist,
      fotos_producao_salvas: payload.fotos_producao_salvas,
    }, null, 2));
    console.log("=======================================================\n");

    if (!frutos.length) {
      return res.status(400).json({
        success: false,
        error: "Nenhum fruto informado para gerar o relatorio.",
      });
    }

    const filesMap = req.files || {};
    const files = Array.isArray(filesMap) ? filesMap : (filesMap.fotos || []);
    const now = new Date();
    const dataReferencia = payload?.data || now.toLocaleDateString("pt-BR");

    // Se vier form_id existente, sobrescreve o registro anterior (fluxo de edicao no app).
    if (payload?.form_id) {
      try {
        // Remove registro do SQLite
        await repositoryAnaliseFrutos.Remover(payload.form_id);

        // Remove pasta de fotos antiga na rede (por_controle) para substituir pelas novas
        const tipo_ = normalizeTipo(payload.tipo_analise);
        const faz_  = sanitizeFolder(payload.fazenda_talhao || payload.fazenda, "sem_fazenda");
        const vari_ = sanitizeFolder(payload.variedade, "sem_variedade");
        const ctrl_ = sanitizeFolder(payload.controle, "sem_controle");
        const dataEdicao = parsePayloadDate(payload.data || payload.data_ref, new Date());
        const oldNetworkDir = getNetworkDir(
          tipo_,
          payload.fazenda_talhao || payload.fazenda,
          payload.talhao,
          payload.variedade,
          payload.controle,
          dataEdicao,
        );
        [oldNetworkDir, path.join(ANALISE_FRUTOS_NETWORK_ROOT, "analiseproducao", "por_controle", faz_, vari_, ctrl_)].forEach((dir) => {
          try {
            if (fs.existsSync(dir)) {
              fs.rmSync(dir, { recursive: true, force: true });
              console.log(`[AnaliseFrutos] Pasta antiga removida: ${dir}`);
            }
          } catch (e) {
            console.warn(`[AnaliseFrutos] Falha ao remover pasta antiga: ${e.message}`);
          }
        });
      } catch (removeError) {
        console.warn("[AnaliseFrutos] Falha ao remover registro anterior para edicao:", removeError?.message);
      }
    }

    const rawIncomingFormId = payload.form_id || payload.formId || payload.id;
    const hadIncomingPersistentId = Boolean(String(rawIncomingFormId || "").trim())
      && !/offline/i.test(String(rawIncomingFormId));
    const isEditRequest = Boolean(payload?.edicao || payload?.is_edicao || payload?.isEdit || hadIncomingPersistentId);

    const formId = buildServerFormId(rawIncomingFormId, now);
    const skipJsonFiles = shouldSkipJsonFilesForRequest(req);

    const tipo = normalizeTipo(payload.tipo_analise);
    const { pdfDir, jsonDir, pdfFolder, jsonFolder, fotosFolder, month, day } = getDateParts(now, tipo, {
      fazenda: payload.fazenda_talhao || payload.fazenda,
      talhao: payload.talhao,
      variedade: payload.variedade,
      controle: payload.controle,
    });
    ensureDir(pdfDir);
    if (!skipJsonFiles) ensureDir(jsonDir);

    const totalFiles = files.length + PRODUCAO_CAMPOS_FOTOS.reduce((s, c) => s + (filesMap[`fotos_${c}`]?.length || 0), 0);
    console.log(`[AnaliseFrutos] Recebidas ${totalFiles} foto(s). Tipo: ${tipo}, Pasta: ${fotosFolder}`);

    files.forEach((f, i) => console.log(`  foto[${i}]: ${f.filename} (${f.size} bytes) -> ${f.destination}`));

    const fotosSalvas = files.map((file) => ({
      form_id: formId,
      nome: file.filename,
      original_nome: file.originalname,
      mimetype: file.mimetype,
      tamanho: file.size,
      caminho_relativo: `${fotosFolder}/${file.filename}`,
      url: `/api/analise-frutos/fotos/${fotosFolder}/${encodeURIComponent(file.filename)}`,
    }));

    // Fotos gerais de campo (sem semana/produção) - adicionadas às fotos gerais
    const fotosGeraisByCampo = {};
    if (!payload.semana) {
      for (const campo of PRODUCAO_CAMPOS_FOTOS) {
        const campoFiles = filesMap[`fotos_${campo}`] || [];
        if (campoFiles.length) {
          const campoFotos = campoFiles.map((file) => ({
            form_id: formId,
            nome: file.filename,
            original_nome: file.originalname,
            mimetype: file.mimetype,
            tamanho: file.size,
            caminho_relativo: `${fotosFolder}/${campo}/${file.filename}`,
            url: `/api/analise-frutos/fotos/${fotosFolder}/${campo}/${encodeURIComponent(file.filename)}`,
          }));
          fotosGeraisByCampo[campo] = campoFotos;
          console.log(`  [geral/${campo}]: ${campoFiles.length} foto(s) novas`);
        }
      }
    }
    // Mesclar fotos gerais de campo com fotos genéricas
    const todasFotosGerais = [
      ...fotosSalvas,
      ...Object.values(fotosGeraisByCampo).flat(),
    ];

    // Fotos por campo de producao (firmeza, maturacao, danos_internos)
    const fotosProdByCampo = {};
    for (const campo of PRODUCAO_CAMPOS_FOTOS) {
      const campoFiles = filesMap[`fotos_${campo}`] || [];
      
      // Só processa como produção se tiver semana
      if (!payload.semana) continue;
      
      const { urlPath } = getFotosProdDir(
        payload.fazenda_talhao || payload.fazenda,
        payload.talhao,
        payload.variedade,
        payload.controle,
        payload.semana,
      );
      const novasFotos = campoFiles.map((file) => ({
        form_id: formId,
        campo,
        nome: file.filename,
        original_nome: file.originalname,
        mimetype: file.mimetype,
        tamanho: file.size,
        disk_path: file.path,
        url: `/api/analise-frutos/fotos/${urlPath}/${encodeURIComponent(file.filename)}`,
      }));
      if (campoFiles.length) console.log(`  [producao/${campo}]: ${campoFiles.length} foto(s) novas`);

      // Mesclar com fotos ja salvas enviadas pelo app (fluxo de edicao)
      let savedProdFotos_raw = payload[`fotos_producao_salvas`];
      if (typeof savedProdFotos_raw === "string") {
        try { savedProdFotos_raw = JSON.parse(savedProdFotos_raw); } catch {}
      }
      const savedCampoFotos = Array.isArray(savedProdFotos_raw?.[campo]) ? savedProdFotos_raw[campo] : [];

      // Busca o arquivo pelo disk_path direto ou pelo nome em locais conhecidos
      const resolverDiskPath = (item) => {
        if (item?.disk_path && fs.existsSync(item.disk_path)) return item.disk_path;
        if (item?.url && typeof item.url === "string") {
          const marker = "/api/analise-frutos/fotos/";
          const idx = item.url.indexOf(marker);
          if (idx >= 0) {
            const rel = decodeURIComponent(item.url.slice(idx + marker.length));
            const fromRoot = path.join(ANALISE_FRUTOS_ROOT, ...rel.split("/").filter(Boolean));
            if (fs.existsSync(fromRoot)) return fromRoot;
          }
        }
        if (item?.nome) {
          const { dir: semanaDir } = getFotosProdDir(
            payload.fazenda_talhao || payload.fazenda, payload.talhao,
            payload.variedade, payload.controle, payload.semana,
          );
          const candidates = [
            path.join(semanaDir, item.nome),
            path.join(pdfDir, campo, item.nome),
            path.join(ANALISE_FRUTOS_ROOT, "analiseproducao", sanitizeWeekFolder(payload.semana), "foto", item.nome),
          ];
          for (const c of candidates) {
            if (fs.existsSync(c)) return c;
          }
        }
        return null;
      };

      const fotosSalvasCampo = savedCampoFotos
        .map((item) => {
          const resolved = resolverDiskPath(item);
          return resolved
            ? { ...item, disk_path: resolved, form_id: formId }
            : { ...item, form_id: formId };
        })
        .filter((item) => item && (item.url || item.nome || item.disk_path));
      if (fotosSalvasCampo.length) console.log(`  [producao/${campo}]: ${fotosSalvasCampo.length} foto(s) existentes`);

      // Se vieram fotos novas → substitui as antigas; senão mantém as existentes
      const todasFotosCampo = novasFotos.length > 0 ? novasFotos : fotosSalvasCampo;
      if (todasFotosCampo.length) fotosProdByCampo[campo] = todasFotosCampo;
    }

    let _fotosSalvasRaw = payload.fotos_salvas;
    if (typeof _fotosSalvasRaw === 'string') { try { _fotosSalvasRaw = JSON.parse(_fotosSalvasRaw); } catch {} }
    const existingFotos = Array.isArray(_fotosSalvasRaw) ? _fotosSalvasRaw : [];

    // No Shelf Life/Pré-Colheita, quando editar e enviar nova foto de um campo,
    // substitui as antigas do mesmo campo (igual comportamento da produção).
    const camposComFotoNovaSemSemana = !payload.semana
      ? PRODUCAO_CAMPOS_FOTOS.filter((c) => (filesMap[`fotos_${c}`] || []).length > 0)
      : [];

    const fotoPertenceAoCampo = (foto, campo) => {
      const hints = [
        String(foto?.caminho_relativo || ""),
        String(foto?.url || ""),
        String(foto?.nome || ""),
        String(foto?.disk_path || ""),
      ].join(" ").toLowerCase();

      if (hints.includes(`/${campo}/`)) return true;
      if (hints.includes(`\\${campo}\\`)) return true;
      if (hints.includes(`_${campo}.`)) return true;
      if (hints.includes(`_${campo}_`)) return true;
      return false;
    };

    const existingFotosFiltradas = camposComFotoNovaSemSemana.length
      ? existingFotos.filter((foto) => !camposComFotoNovaSemSemana.some((campo) => fotoPertenceAoCampo(foto, campo)))
      : existingFotos;

    if (camposComFotoNovaSemSemana.length) {
      console.log(`[AnaliseFrutos] Edição sem semana: substituindo fotos antigas dos campos ${camposComFotoNovaSemSemana.join(", ")}`);
    }

    const allFotos = [...existingFotosFiltradas, ...todasFotosGerais];

    const nomeArquivoPdf = `${formId}.pdf`;

    // Log para debug das fotos antes do PDF
    console.log("[AnaliseFrutos] fotosProdByCampo para PDF:");
    for (const [campo, fotos] of Object.entries(fotosProdByCampo)) {
      fotos.forEach((f) => {
        const existe = f.disk_path ? fs.existsSync(f.disk_path) : false;
        console.log(`  ${campo}: ${f.nome} | disk_path existe: ${existe} | path: ${f.disk_path}`);
      });
    }
    if (!Object.keys(fotosProdByCampo).length) console.log("  (vazio — sem fotos de produção)");

    await gerarRelatorioAnaliseFrutosPDF({ ...payload, fotos_salvas: allFotos, fotos_producao: fotosProdByCampo, layout: "novo" }, {
      outputDir: pdfDir,
      fileName: nomeArquivoPdf,
      layout: "novo",
    });

    // Após PDF gerado: apaga arquivos ANTIGOS dos campos que tiveram nova foto (semana_17/foto)
    // Faz isso depois do PDF para não afetar a geração
    if (isEditRequest && payload.semana) {
      const camposComFotoNova = PRODUCAO_CAMPOS_FOTOS.filter((c) => (filesMap[`fotos_${c}`] || []).length > 0);
      if (camposComFotoNova.length) {
        const { dir: semanaFotoDir } = getFotosProdDir(
          payload.fazenda_talhao || payload.fazenda, payload.talhao,
          payload.variedade, payload.controle, payload.semana,
        );
        // Pega os nomes das novas fotos para não deletá-las
        const novosNomes = new Set(
          camposComFotoNova.flatMap((c) => (filesMap[`fotos_${c}`] || []).map((f) => f.filename))
        );
        try {
          if (fs.existsSync(semanaFotoDir)) {
            const ctrlNorm = sanitizeFolder(payload.controle, "").toLowerCase();
            fs.readdirSync(semanaFotoDir).forEach((arq) => {
              if (novosNomes.has(arq)) return; // não apaga o novo
              const arqLow = arq.toLowerCase();
              const ehCampoComFotoNova = camposComFotoNova.some((c) => arqLow.includes(`_${c}`));
              if (arqLow.includes(`_${ctrlNorm}_`) && ehCampoComFotoNova) {
                try { fs.unlinkSync(path.join(semanaFotoDir, arq)); } catch {}
              }
            });
            console.log(`[AnaliseFrutos] Fotos antigas substituídas para campos: ${camposComFotoNova.join(', ')}`);
          }
        } catch (e) {
          console.warn(`[AnaliseFrutos] Falha ao limpar fotos antigas: ${e.message}`);
        }
      }
    }

    // Salva fotos de producao localmente em producao/FAZ/VAR/CTRL/DATE/campo/
    if (Object.keys(fotosProdByCampo).length) {
      for (const [campo, fotos] of Object.entries(fotosProdByCampo)) {
        const campoLocalDir = path.join(pdfDir, campo);
        ensureDir(campoLocalDir);
        for (const foto of fotos) {
          if (foto.disk_path && fs.existsSync(foto.disk_path)) {
            try {
              fs.copyFileSync(foto.disk_path, path.join(campoLocalDir, foto.nome));
            } catch (e) {
              console.warn(`[AnaliseFrutos] Falha ao copiar ${foto.nome} localmente/${campo}: ${e.message}`);
            }
          }
        }
      }
      console.log(`[AnaliseFrutos] Fotos por campo salvas localmente: ${pdfDir}`);
    }

    // Copia PDF + JSON + fotos para a pasta de rede (mesma estrutura do local)
    let networkWarning = null;
    try {
      const networkDir = getNetworkDir(tipo, payload.fazenda_talhao || payload.fazenda, payload.talhao, payload.variedade, payload.controle, now);
      console.log(`[AnaliseFrutos] Tentando salvar na rede: ${networkDir}`);
      ensureDir(networkDir);
      fs.copyFileSync(path.join(pdfDir, nomeArquivoPdf), path.join(networkDir, nomeArquivoPdf));
      console.log(`[AnaliseFrutos] PDF salvo na rede OK`);
      // Copia fotos (subpastas campo) para a rede, pulando PDFs (o real já foi copiado acima)
      copyDirToNetwork(pdfDir, networkDir, "[AnaliseFrutos Fotos]", (name) => name.endsWith('.pdf'));
      
      // Copia fotos de producao por campo para pasta estruturada na rede:
      // producao/FAZ/VAR/CTRL/DATE/firmeza/, /maturacao/, /danos_internos/
      if (Object.keys(fotosProdByCampo).length) {
        for (const [campo, fotos] of Object.entries(fotosProdByCampo)) {
          const campoNetworkDir = path.join(networkDir, campo);
          ensureDir(campoNetworkDir);
          for (const foto of fotos) {
            if (foto.disk_path && fs.existsSync(foto.disk_path)) {
              try {
                fs.copyFileSync(foto.disk_path, path.join(campoNetworkDir, foto.nome));
              } catch (e) {
                console.warn(`[AnaliseFrutos] Falha ao copiar ${foto.nome} para rede/${campo}: ${e.message}`);
              }
            }
          }
        }
        console.log(`[AnaliseFrutos] Fotos por campo copiadas para rede: ${networkDir}`);
      }

      // Mantém cópia flat em analiseproducao/semana_XX/foto/ (estrutura agregada por semana)
      const fotoProdLocalDir = getFotosProdDir(
        payload.fazenda_talhao || payload.fazenda,
        payload.talhao,
        payload.variedade,
        payload.controle,
        payload.semana,
      ).dir;
      const fotoProdNetworkDir = getFotosProdDirNetwork(payload.semana);
      if (fs.existsSync(fotoProdLocalDir)) {
        copyDirToNetwork(fotoProdLocalDir, fotoProdNetworkDir, "[AnaliseFrutos Producao]");
      }

      // Cópia para pasta de carregamentos 2026 — independe de fotoProdLocalDir existir
      const CARREGAMENTOS_BASE = "\\\\192.168.0.201\\agrodan\\PACKING HOUSE\\PACKING HOUSE - SEDE\\Packing\\CONTROLE DE QUALIDADE 2\\MATERIAL PARA CARREGAMENTOS 2026\\MATURAÇÃO SEDE 2026\\APLICATIVO CQ";
      try {
        const tipoDir = String(payload.tipo_analise || "")
          .normalize("NFD").replace(/[̀-ͯ]/g, "")
          .replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().toUpperCase()
          || "ANALISE";
        const semanaDir = sanitizeWeekFolder(payload.semana).replace(/^semana_/i, '');
        const carregamentosDir = path.join(CARREGAMENTOS_BASE, tipoDir, semanaDir);
        ensureDir(carregamentosDir);

        const faz  = sanitizeFolder(payload.fazenda_talhao || payload.fazenda, "sem_fazenda");
        const vari = sanitizeFolder(payload.variedade, "sem_variedade");
        const ctrl = sanitizeFolder(payload.controle, "sem_controle");
        const dia  = String(now.getDate()).padStart(2, "0");
        const nomePdfCustom = `AF-${faz}-${vari}-${ctrl}-${dia}.pdf`;

        // Em edição: apaga arquivos antigos do controle
        if (payload.form_id && fs.existsSync(carregamentosDir)) {
          const ctrlLow = ctrl.toLowerCase();
          const baseFotoName = buildFotoProdBaseName(
            payload.fazenda_talhao || payload.fazenda,
            payload.talhao,
            payload.variedade,
            payload.controle,
          ).toLowerCase();
          let removidos = 0;
          fs.readdirSync(carregamentosDir).forEach((arq) => {
            const arqLow = arq.toLowerCase();
            const matchControle =
              arqLow.includes(`_${ctrlLow}_`)
              || arqLow.includes(`-${ctrlLow}-`)
              || arqLow.startsWith(`${baseFotoName}_`)
              || arqLow === nomePdfCustom.toLowerCase();
            if (matchControle) {
              try { fs.unlinkSync(path.join(carregamentosDir, arq)); removidos++; } catch {}
            }
          });
          if (removidos) console.log(`[AnaliseFrutos Carregamentos] ${removidos} arquivo(s) antigos removidos`);
        }

        // Copia fotos do controle atual — produção (fotosProdByCampo) + gerais (allFotos)
        let fotosCopiadasCarreg = 0;

        // Fotos de produção (firmeza, maturacao, danos_internos)
        for (const [, fotos] of Object.entries(fotosProdByCampo)) {
          for (const foto of fotos) {
            if (foto.disk_path && fs.existsSync(foto.disk_path)) {
              try {
                fs.copyFileSync(foto.disk_path, path.join(carregamentosDir, foto.nome));
                fotosCopiadasCarreg++;
              } catch (e) {
                console.warn(`[AnaliseFrutos Carregamentos] Falha ao copiar ${foto.nome}: ${e.message}`);
              }
            }
          }
        }

        // Fotos gerais (Shelf Life, Pré-Colheita, etc.)
        // Usa allFotos para incluir também fotos antigas preservadas na edição.
        if (!Object.keys(fotosProdByCampo).length) {
          const resolveFotoGeralPath = (foto) => {
            if (!foto) return null;

            const candidates = [];
            if (foto.disk_path) candidates.push(String(foto.disk_path));
            if (foto.caminho_relativo) {
              const rel = String(foto.caminho_relativo);
              candidates.push(path.join(ANALISE_FRUTOS_ROOT, rel));
              candidates.push(path.join(BACKEND_ROOT, rel));
            }
            if (foto.url && typeof foto.url === "string") {
              const marker = "/api/analise-frutos/fotos/";
              const idx = foto.url.indexOf(marker);
              if (idx >= 0) {
                const rel = decodeURIComponent(foto.url.slice(idx + marker.length));
                candidates.push(path.join(ANALISE_FRUTOS_ROOT, ...rel.split("/").filter(Boolean)));
              }
            }
            if (foto.nome) {
              candidates.push(path.join(pdfDir, String(foto.nome)));
            }

            return candidates.find((c) => c && fs.existsSync(c)) || null;
          };

          const baseFotoName = buildFotoProdBaseName(
            payload.fazenda_talhao || payload.fazenda,
            payload.talhao,
            payload.variedade,
            payload.controle,
          );

          const inferCampoFoto = (foto, srcPath = "") => {
            const hints = [
              String(foto?.caminho_relativo || ""),
              String(foto?.url || ""),
              String(foto?.nome || ""),
              String(srcPath || ""),
            ].join(" ").toLowerCase();

            if (hints.includes("firmeza")) return "firmeza";
            if (hints.includes("maturacao")) return "maturacao";
            if (hints.includes("danos_internos") || hints.includes("danos-internos")) return "danos_internos";
            return "geral";
          };

          let fotoSeq = 0;
          const nextFotoName = (foto, srcPath = "") => {
            fotoSeq += 1;
            const campo = inferCampoFoto(foto, srcPath);
            const ext = (path.extname(String(srcPath || foto?.nome || "")) || ".jpg").toLowerCase();
            return `${baseFotoName}_${fotoSeq}_${campo}${ext}`;
          };

          const copiedNames = new Set();
          const copiedSources = new Set();
          try {
            const gerais = Array.isArray(allFotos) ? allFotos : [];
            gerais.forEach((foto) => {
              const src = resolveFotoGeralPath(foto);
              if (!src) return;

              const originalName = String(foto?.nome || "").trim() || path.basename(src);
              if (!/\.(jpg|jpeg|png|webp)$/i.test(originalName)) return;
              const fileName = nextFotoName(foto, originalName);
              if (copiedNames.has(fileName.toLowerCase())) return;

              try {
                fs.copyFileSync(src, path.join(carregamentosDir, fileName));
                copiedNames.add(fileName.toLowerCase());
                copiedSources.add(path.resolve(src).toLowerCase());
                fotosCopiadasCarreg++;
              } catch (e) {
                console.warn(`[AnaliseFrutos Carregamentos] Falha ao copiar ${fileName}: ${e.message}`);
              }
            });

            // Fallback: varre diretório atual para garantir fotos novas sem metadata
            if (fs.existsSync(pdfDir)) {
              fs.readdirSync(pdfDir).forEach((arq) => {
                if (!/\.(jpg|jpeg|png|webp)$/i.test(arq)) return;
                const src = path.join(pdfDir, arq);
                const srcKey = path.resolve(src).toLowerCase();
                if (copiedSources.has(srcKey)) return;
                const fileName = nextFotoName(null, arq);
                if (copiedNames.has(fileName.toLowerCase())) return;
                try {
                  fs.copyFileSync(src, path.join(carregamentosDir, fileName));
                  copiedNames.add(fileName.toLowerCase());
                  copiedSources.add(srcKey);
                  fotosCopiadasCarreg++;
                } catch (e) {
                  console.warn(`[AnaliseFrutos Carregamentos] Falha ao copiar ${fileName}: ${e.message}`);
                }
              });
            }
          } catch (e) {
            console.warn(`[AnaliseFrutos Carregamentos] Falha ao copiar fotos gerais: ${e.message}`);
          }
        }

        if (fotosCopiadasCarreg) console.log(`[AnaliseFrutos Carregamentos] ${fotosCopiadasCarreg} foto(s) copiadas`);

        // Copia PDF
        const srcPdf = path.join(pdfDir, nomeArquivoPdf);
        if (fs.existsSync(srcPdf)) {
          fs.copyFileSync(srcPdf, path.join(carregamentosDir, nomePdfCustom));
          console.log(`[AnaliseFrutos Carregamentos] PDF copiado: ${nomePdfCustom}`);
        }
      } catch (e) {
        console.warn(`[AnaliseFrutos] Falha ao copiar para Carregamentos 2026: ${e.message}`);
      }

      // Cópia organizada por controle: analiseproducao/por_controle/{fazenda}/{variedade}/{controle}/{campo}/
      if (Object.keys(fotosProdByCampo).length) {
        const faz  = sanitizeFolder(payload.fazenda_talhao || payload.fazenda, "sem_fazenda");
        const vari = sanitizeFolder(payload.variedade, "sem_variedade");
        const ctrl = sanitizeFolder(payload.controle, "sem_controle");
        for (const [campo, fotos] of Object.entries(fotosProdByCampo)) {
          const porControleDir = path.join(
            ANALISE_FRUTOS_NETWORK_ROOT, "analiseproducao", "por_controle", faz, vari, ctrl, campo
          );
          ensureDir(porControleDir);
          for (const foto of fotos) {
            if (foto.disk_path && fs.existsSync(foto.disk_path)) {
              try {
                fs.copyFileSync(foto.disk_path, path.join(porControleDir, foto.nome));
              } catch (e) {
                console.warn(`[AnaliseFrutos] Falha ao copiar ${foto.nome} para por_controle/${campo}: ${e.message}`);
              }
            }
          }
        }
        console.log(`[AnaliseFrutos] Fotos copiadas para por_controle/${faz}/${vari}/${ctrl}`);
      }
    } catch (copyErr) {
      networkWarning = `Falha ao salvar na rede: [${copyErr.code || 'ERR'}] ${copyErr.message}`;
      console.warn(`[AnaliseFrutos] ${networkWarning}`);
      console.warn(`[AnaliseFrutos] Stack: ${copyErr.stack}`);
    }

    const jsonRelativePath = skipJsonFiles ? null : `${jsonFolder}/${formId}.json`;
    const pdfRelativePath = `${pdfFolder}/${nomeArquivoPdf}`;

    const payloadParaSalvar = {
      ...payload,
      form_id: formId,
      data_referencia: dataReferencia,
      created_at: now.toISOString(),
      fotos_salvas: allFotos,
      fotos_count: allFotos.length,
      fotos_producao: Object.keys(fotosProdByCampo).length ? fotosProdByCampo : undefined,
      arquivos: {
        pdf_relative_path: pdfRelativePath,
        json_relative_path: jsonRelativePath || undefined,
      },
    };

    const payloadJson = JSON.stringify(payloadParaSalvar, null, 2);

    const resultado = await repositoryAnaliseFrutos.Inserir({
      form_id: formId,
      tipo_analise: payload.tipo_analise,
      fazenda_talhao: payload.fazenda_talhao,
      talhao: payload.talhao,
      safra: payload.safra,
      semana: payload.semana,
      data_ref: payload.data,
      controle: payload.controle,
      variedade: payload.variedade,
      qtd_frutos: payload.qtd_frutos ?? frutos.length,
      criterio: payload.criterio,
      observacoes: payload.observacoes,
      peso_final_caixa: payload.peso_final_caixa,
      frutos_count: frutos.length,
      lotes_count: lotes.length,
      pdf_path: pdfRelativePath,
      json_path: jsonRelativePath,
      payload_json: payloadJson,
    });

    if (!skipJsonFiles) {
      fs.writeFileSync(path.join(jsonDir, `${formId}.json`), payloadJson, "utf8");
    }

    // JSON fica apenas local — não vai para a rede 0.201

    await repositoryAnaliseFrutos.InserirLotes({
      form_id: formId,
      tipo_analise: payload.tipo_analise,
      fazenda_talhao: payload.fazenda_talhao,
      talhao: payload.talhao,
      semana: payload.semana,
      data_ref: payload.data,
      controle: payload.controle,
      variedade: payload.variedade,
      qtd_frutos: payload.qtd_frutos ?? frutos.length,
      lotes: lotes,
      momento: now.toISOString(),
      pdf_path: pdfRelativePath,
      json_path: jsonRelativePath,
      payload_json: payloadJson,
    });

    const whatsappEnvio = isConectado()
      ? {
          status: "agendado",
          enviado: false,
          motivo: "Registro salvo. PDF sera gerado e enviado ao grupo em segundo plano.",
        }
      : {
          status: "pendente",
          enviado: false,
          motivo: "Registro salvo, mas o WhatsApp esta desconectado.",
        };

    Promise.resolve()
      .then(() => enviarAFPendentes())
      .catch((backgroundError) => {
        console.error(`[AF] Erro no processamento em segundo plano para ${formId}:`, backgroundError);
      });

    // Envia cópia para API externa em background (não bloqueia a resposta)
    enviarParaApiExterna({ ...payload, form_id: formId, _is_edicao_api_externa: isEditRequest }, frutos, lotes);

    return res.status(201).json({
      success: true,
      message: "Analise de frutos salva com sucesso",
      id: resultado.id,
      form_id: formId,
      data: dataReferencia,
      arquivos: {
        pdf_relative_path: pdfRelativePath,
        json_relative_path: jsonRelativePath,
      },
      whatsapp: whatsappEnvio,
      network_warning: networkWarning || undefined,
      data_payload: payloadParaSalvar,
    });
  } catch (error) {
    console.error("Erro ao salvar/enviar analise de frutos:", error);
    if (error.code === "SQLITE_CONSTRAINT") {
      return res.status(409).json({
        success: false,
        error: "Registro duplicado",
        details: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "Erro interno ao processar analise de frutos",
      details: error.message,
    });
  }
};

const GerarTestePdf = async (req, res) => {
  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (typeof payload.frutos === "string") {
      try { payload.frutos = JSON.parse(payload.frutos); } catch {}
    }
    if (typeof payload.lotes === "string") {
      try { payload.lotes = JSON.parse(payload.lotes); } catch {}
    }
    if (typeof payload.maturacao_dist === "string") {
      try { payload.maturacao_dist = JSON.parse(payload.maturacao_dist); } catch {}
    }
    const frutos = Array.isArray(payload.frutos) ? payload.frutos : [];

    console.log(`[TestePdf] tipo=${payload.tipo_analise} frutos=${frutos.length} lotes=${Array.isArray(payload.lotes) ? payload.lotes.length : '?'} maturacao_dist=${Array.isArray(payload.maturacao_dist) ? payload.maturacao_dist.length : '?'}`);

    if (!frutos.length) {
      return res.status(400).json({
        success: false,
        error: "Nenhum fruto informado para gerar o PDF de teste.",
      });
    }

    const filesMap = req.files || {};
    const files = Array.isArray(filesMap) ? filesMap : (filesMap.fotos || []);
    const now = new Date();
    const tipo = normalizeTipo(payload.tipo_analise);
    const { pdfDir, fotosFolder } = getDateParts(now, tipo, {
      fazenda: payload.fazenda_talhao || payload.fazenda,
      talhao: payload.talhao,
      variedade: payload.variedade,
      controle: payload.controle,
    });
    ensureDir(pdfDir);

    // Apaga AF-TESTE-*.pdf antigos desta pasta antes de gerar o novo
    try {
      fs.readdirSync(pdfDir)
        .filter((f) => f.startsWith('AF-TESTE-') && f.endsWith('.pdf'))
        .forEach((f) => { try { fs.unlinkSync(path.join(pdfDir, f)); } catch {} });
    } catch {}

    const totalFiles = files.length + PRODUCAO_CAMPOS_FOTOS.reduce((s, c) => s + (filesMap[`fotos_${c}`]?.length || 0), 0);
    console.log(`[AnaliseFrutos TESTE] Recebidas ${totalFiles} foto(s). Tipo: ${tipo}`);

    const baseId = String(
      payload.form_id
      || payload.formId
      || payload.id
      || `AF-TESTE-${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 6)}`
    ).replace(/[^\w-]/g, "_");

    const fotosSalvas = files.map((file) => ({
      form_id: baseId,
      nome: file.filename,
      caminho_relativo: `${fotosFolder}/${file.filename}`,
      url: `/api/analise-frutos/fotos/${fotosFolder}/${encodeURIComponent(file.filename)}`,
    }));

    // Fotos gerais de campo (sem semana/produção) - adicionadas às fotos gerais
    const fotosGeraisByCampo = {};
    if (!payload.semana) {
      for (const campo of PRODUCAO_CAMPOS_FOTOS) {
        const campoFiles = filesMap[`fotos_${campo}`] || [];
        if (campoFiles.length) {
          const campoFotos = campoFiles.map((file) => ({
            form_id: baseId,
            nome: file.filename,
            caminho_relativo: `${fotosFolder}/${campo}/${file.filename}`,
            url: `/api/analise-frutos/fotos/${fotosFolder}/${campo}/${encodeURIComponent(file.filename)}`,
          }));
          fotosGeraisByCampo[campo] = campoFotos;
          console.log(`  [geral/${campo}] TESTE: ${campoFiles.length} foto(s) novas`);
        }
      }
    }
    // Mesclar fotos gerais de campo com fotos genéricas
    const todasFotosGeraisTeste = [
      ...fotosSalvas,
      ...Object.values(fotosGeraisByCampo).flat(),
    ];

    const fotosProdByCampo = {};
    for (const campo of PRODUCAO_CAMPOS_FOTOS) {
      const campoFiles = filesMap[`fotos_${campo}`] || [];
      
      // Só processa como produção se tiver semana
      if (!payload.semana) continue;
      
      const { urlPath } = getFotosProdDir(
        payload.fazenda_talhao || payload.fazenda,
        payload.talhao,
        payload.variedade,
        payload.controle,
        payload.semana,
      );
      const novasFotos = campoFiles.map((file) => ({
        form_id: baseId,
        campo,
        nome: file.filename,
        disk_path: file.path,
        url: `/api/analise-frutos/fotos/${urlPath}/${encodeURIComponent(file.filename)}`,
      }));

      let savedProdFotos_raw = payload[`fotos_producao_salvas`];
      if (typeof savedProdFotos_raw === "string") {
        try { savedProdFotos_raw = JSON.parse(savedProdFotos_raw); } catch {}
      }
      const savedCampoFotos = Array.isArray(savedProdFotos_raw?.[campo]) ? savedProdFotos_raw[campo] : [];
      const fotosSalvasCampo = savedCampoFotos
        .filter((item) => item?.disk_path && fs.existsSync(item.disk_path))
        .map((item) => ({ ...item, form_id: baseId }));

      // Se vieram fotos novas → substitui as antigas; senão mantém as existentes
      const todasFotosCampo = novasFotos.length > 0 ? novasFotos : fotosSalvasCampo;
      if (todasFotosCampo.length) fotosProdByCampo[campo] = todasFotosCampo;
    }

    let _fotosSalvasRaw2 = payload.fotos_salvas;
    if (typeof _fotosSalvasRaw2 === 'string') { try { _fotosSalvasRaw2 = JSON.parse(_fotosSalvasRaw2); } catch {} }
    const existingFotos = Array.isArray(_fotosSalvasRaw2) ? _fotosSalvasRaw2 : [];
    const allFotos = [...existingFotos, ...todasFotosGeraisTeste];

    const nomeArquivoPdf = `${baseId}.pdf`;
    await gerarRelatorioAnaliseFrutosPDF({ ...payload, fotos_salvas: allFotos, fotos_producao: fotosProdByCampo, layout: "novo" }, {
      outputDir: pdfDir,
      fileName: nomeArquivoPdf,
      layout: "novo",
    });

    // PDFs de teste NÃO são copiados para rede (evita poluição com AF-TESTE-*)
    try {
      const networkDir = getNetworkDir(tipo, payload.fazenda_talhao || payload.fazenda, payload.talhao, payload.variedade, payload.controle, now);

      // Copia fotos por campo para estrutura producao/FAZ/VAR/CTRL/DATE/campo/ na rede
      if (Object.keys(fotosProdByCampo).length) {
        for (const [campo, fotos] of Object.entries(fotosProdByCampo)) {
          const campoNetworkDir = path.join(networkDir, campo);
          ensureDir(campoNetworkDir);
          for (const foto of fotos) {
            if (foto.disk_path && fs.existsSync(foto.disk_path)) {
              try {
                fs.copyFileSync(foto.disk_path, path.join(campoNetworkDir, foto.nome));
              } catch (e) {
                console.warn(`[AnaliseFrutos TESTE] Falha ao copiar ${foto.nome} para rede/${campo}: ${e.message}`);
              }
            }
          }
        }
      }

      // Mantém cópia flat em analiseproducao/semana_XX/foto/ (estrutura agregada por semana)
      const fotoProdLocalDir = getFotosProdDir(
        payload.fazenda_talhao || payload.fazenda,
        payload.talhao,
        payload.variedade,
        payload.controle,
        payload.semana,
      ).dir;
      const fotoProdNetworkDir = getFotosProdDirNetwork(payload.semana);
      if (fs.existsSync(fotoProdLocalDir)) {
        copyDirToNetwork(fotoProdLocalDir, fotoProdNetworkDir, "[AnaliseFrutos TESTE Producao]");
      }
    } catch (copyErr) {
      console.warn(`[AnaliseFrutos TESTE] Falha ao copiar fotos de produção: ${copyErr.message}`);
    }

    const pdfRelativePath = `${fotosFolder}/${nomeArquivoPdf}`;
    const pdfUrl = encodeURI(`/api/analise-frutos/pdf/${pdfRelativePath}`);

    return res.status(200).json({
      success: true,
      message: "PDF de teste gerado com sucesso.",
      pdf_relative_path: pdfRelativePath,
      pdf_url: pdfUrl,
    });
  } catch (error) {
    console.error("Erro ao gerar PDF de teste da analise de frutos:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao gerar PDF de teste",
      details: error.message,
      stack: error.stack,
    });
  }
};

const Listar = async (req, res) => {
  try {
    const filtros = {
      id: req.query.id,
      form_id: req.query.form_id,
      tipo_analise: req.query.tipo_analise,
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      limit: req.query.limit || 50,
    };

    Object.keys(filtros).forEach((key) => {
      if (filtros[key] === undefined || filtros[key] === null || filtros[key] === "") {
        delete filtros[key];
      }
    });

    const dados = await repositoryAnaliseFrutos.Listar(filtros);
    return res.status(200).json({
      success: true,
      total: dados.length,
      data: dados,
    });
  } catch (error) {
    console.error("Erro ao listar analise de frutos:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao listar analise de frutos",
      details: error.message,
    });
  }
};

const BuscarPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const dado = await repositoryAnaliseFrutos.BuscarPorId(id);

    if (!dado) {
      return res.status(404).json({
        success: false,
        error: "Registro nao encontrado",
      });
    }

    return res.status(200).json({
      success: true,
      data: dado,
    });
  } catch (error) {
    console.error("Erro ao buscar analise de frutos:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao buscar analise de frutos",
      details: error.message,
    });
  }
};

const Remover = async (req, res) => {
  try {
    const { id } = req.params;

    const registro = await repositoryAnaliseFrutos.BuscarPorId(id);
    if (!registro) {
      return res.status(404).json({
        success: false,
        error: "Registro nao encontrado",
      });
    }

    const payloadRegistro =
      registro?.payload_json && typeof registro.payload_json === "object"
        ? registro.payload_json
        : {};

    const dataExterna = String(payloadRegistro?.data || registro?.data_ref || "");
    const fazendaExterna = String(
      payloadRegistro?.fundo_agricola
      || payloadRegistro?.fazenda
      || payloadRegistro?.fazenda_talhao
      || registro?.fazenda_talhao
      || ""
    );
    const talhaoExterno = String(payloadRegistro?.talhao || registro?.talhao || "");
    const controleExterno = String(payloadRegistro?.controle ?? registro?.controle ?? "");
    const safraExterna = String(payloadRegistro?.safra || registro?.safra || "");

    try {
      if (controleExterno) {
        const deleteResult = await deletarRegistrosApiExterna({
          data: dataExterna,
          fazenda: fazendaExterna,
          talhao: talhaoExterno,
          controle: controleExterno,
          safra: safraExterna,
        });

        if (deleteResult.errors.length > 0) {
          const firstError = deleteResult.errors[0]?.reason;
          throw new Error(firstError?.response?.data?.detail || firstError?.message || "erro desconhecido");
        }
      }
    } catch (extErr) {
      return res.status(502).json({
        success: false,
        error: "Falha ao remover registro na API externa",
        details: extErr.message,
      });
    }

    const result = await repositoryAnaliseFrutos.Remover(id);

    if (!result?.changes) {
      return res.status(404).json({
        success: false,
        error: "Registro nao encontrado",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Registro removido com sucesso",
      form_id: result.form_id,
    });
  } catch (error) {
    console.error("Erro ao remover analise de frutos:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao remover analise de frutos",
      details: error.message,
    });
  }
};

// GET /api/analise-frutos/fotos/*
const ServirFoto = (req, res) => {
  try {
    const relPath = req.params[0];
    if (!relPath) return res.status(400).end();
    const segments = relPath.split("/").map(decodeURIComponent).filter((s) => s && s !== ".." && s !== ".");

    const localPath = path.join(ANALISE_FRUTOS_ROOT, ...segments);
    if (localPath.startsWith(ANALISE_FRUTOS_ROOT) && fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }

    const networkPath = path.join(ANALISE_FRUTOS_NETWORK_ROOT, ...segments);
    if (networkPath.startsWith(ANALISE_FRUTOS_NETWORK_ROOT) && fs.existsSync(networkPath)) {
      return res.sendFile(networkPath);
    }

    return res.status(404).end();
  } catch {
    return res.status(500).end();
  }
};

// GET /api/analise-frutos/fotos-por-controle?controle=5067&variedade=PALMER
// Varre analise_frutos/analiseproducao/por_controle/{fazenda}/{variedade}/{controle}/{campo}/
// e retorna URLs de firmeza e maturacao do controle informado.
const FotosPorControle = (req, res) => {
  try {
    const controle = String(req.query.controle || '').trim();
    const variedade = String(req.query.variedade || '').trim();

    if (!controle) {
      return res.status(400).json({ success: false, error: "Parâmetro 'controle' é obrigatório." });
    }

    const porControleDir = path.join(ANALISE_FRUTOS_NETWORK_ROOT, "analiseproducao", "por_controle");
    if (!fs.existsSync(porControleDir)) {
      return res.json({ success: true, controle, variedade, firmeza: [], maturacao: [] });
    }

    const campos = ["firmeza", "maturacao"];
    const resultado = { firmeza: [], maturacao: [] };

    const varNorm = sanitizeFolder(variedade, "").toLowerCase();
    const ctrlNorm = sanitizeFolder(controle, "").toLowerCase();

    // Varre: por_controle/{fazenda}/{variedade}/{controle}/{campo}/
    for (const fazenda of fs.readdirSync(porControleDir)) {
      const fazDir = path.join(porControleDir, fazenda);
      if (!fs.statSync(fazDir).isDirectory()) continue;

      for (const vari of fs.readdirSync(fazDir)) {
        if (variedade && vari.toLowerCase() !== varNorm) continue;
        const variDir = path.join(fazDir, vari);
        if (!fs.statSync(variDir).isDirectory()) continue;

        for (const ctrl of fs.readdirSync(variDir)) {
          if (ctrl.toLowerCase() !== ctrlNorm) continue;
          const ctrlDir = path.join(variDir, ctrl);
          if (!fs.statSync(ctrlDir).isDirectory()) continue;

          for (const campo of campos) {
            const campoDir = path.join(ctrlDir, campo);
            if (!fs.existsSync(campoDir)) continue;
            for (const foto of fs.readdirSync(campoDir)) {
              if (!/\.(jpg|jpeg|png|webp)$/i.test(foto)) continue;
              resultado[campo].push(
                `/api/analise-frutos/fotos/analiseproducao/por_controle/${encodeURIComponent(fazenda)}/${encodeURIComponent(vari)}/${encodeURIComponent(ctrl)}/${campo}/${encodeURIComponent(foto)}`
              );
            }
          }
        }
      }
    }

    console.log(`[FotosPorControle] controle=${controle} variedade=${variedade} → firmeza:${resultado.firmeza.length} maturacao:${resultado.maturacao.length}`);
    return res.json({ success: true, controle, variedade, ...resultado });
  } catch (error) {
    console.error("[FotosPorControle] Erro:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const DiagnosticoRede = (req, res) => {
  const networkRoot = ANALISE_FRUTOS_NETWORK_ROOT;
  const testFile = path.join(networkRoot, ".network_test_" + Date.now() + ".tmp");
  const result = { networkRoot, steps: [] };
  try {
    const exists = fs.existsSync(networkRoot);
    result.steps.push({ step: "existsSync", ok: exists, path: networkRoot });
    if (!exists) {
      fs.mkdirSync(networkRoot, { recursive: true });
      result.steps.push({ step: "mkdirSync", ok: true });
    }
    fs.writeFileSync(testFile, "ok", "utf8");
    result.steps.push({ step: "writeFileSync", ok: true, file: testFile });
    fs.unlinkSync(testFile);
    result.steps.push({ step: "unlinkSync", ok: true });
    result.ok = true;
    result.message = "Rede acessível e gravável";
  } catch (err) {
    result.ok = false;
    result.error = { code: err.code, message: err.message, syscall: err.syscall, path: err.path };
  }
  return res.json(result);
};

export { upload };
export default { Salvar, GerarTestePdf, Listar, BuscarPorId, Remover, ServirFoto, DiagnosticoRede, FotosPorControle, ANALISE_FRUTOS_ROOT };

