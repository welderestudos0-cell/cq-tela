import { gerarRelatorioAnaliseFrutosPDF } from "../services/service.pdf.js";
import { isConectado, enviarAFPendentes } from "../services/service.whatsapp.js";
import repositoryAnaliseFrutos from "../repositories/repository.analise.frutos.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

import { FOTOS_ROOT, BACKEND_ROOT } from "../config/storage.js";

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

// Copia recursivamente um diretório para a rede (fotos)
const copyDirToNetwork = (srcDir, destDir, logPrefix = "[Upload]") => {
  try {
    if (!fs.existsSync(srcDir)) return;
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    ensureDir(destDir);
    entries.forEach((e) => {
      const s = path.join(srcDir, e.name);
      const d = path.join(destDir, e.name);
      if (e.isDirectory()) copyDirToNetwork(s, d, logPrefix);
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

// Monta caminho local e URL para fotos de producao (firmeza/maturacao/danos_internos)
// LOCAL e REDE usam a mesma estrutura: producao/{fazenda}/{variedade}/{controle}/{YYYY-MM-DD}/{campo}
const getFotosProdDir = (fazenda, talhao, variedade, controle, campo, date = new Date()) => {
  const faz  = sanitizeFolder(fazenda,   "sem_fazenda");
  const vari = sanitizeFolder(variedade, "sem_variedade");
  const ctrl = sanitizeFolder(controle,  "sem_controle");
  const cam  = sanitizeFolder(campo,     "geral");
  const dt   = formatDateFolder(date);
  if (fazendaTemTalhao(fazenda)) {
    const tal = sanitizeFolder(talhao, "sem_talhao");
    return { dir: path.join(ANALISE_FRUTOS_ROOT, "producao", faz, tal, vari, ctrl, dt, cam),
             urlPath: `producao/${faz}/${tal}/${vari}/${ctrl}/${dt}/${cam}` };
  }
  return { dir: path.join(ANALISE_FRUTOS_ROOT, "producao", faz, vari, ctrl, dt, cam),
           urlPath: `producao/${faz}/${vari}/${ctrl}/${dt}/${cam}` };
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
  if (isProdCampo) {
    const campo = file.fieldname.replace("fotos_", "");
    const { dir } = getFotosProdDir(
      req.body?.fazenda_talhao || req.body?.fazenda,
      req.body?.talhao,
      req.body?.variedade,
      req.body?.controle,
      campo,
      new Date(),
    );
    return dir;
  }
  const tipo = normalizeTipo(req.body?.tipo_analise);
  const { fotosDir } = getDateParts(new Date(), tipo, {
    fazenda: req.body?.fazenda_talhao || req.body?.fazenda,
    variedade: req.body?.variedade,
    controle: req.body?.controle,
  });
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
    const frutos = Array.isArray(payload.frutos) ? payload.frutos : [];
    const lotes = Array.isArray(payload.lotes) ? payload.lotes : [];

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
        await repositoryAnaliseFrutos.Remover(payload.form_id);
      } catch (removeError) {
        console.warn("[AnaliseFrutos] Falha ao remover registro anterior para edicao:", removeError?.message);
      }
    }

    const formId = buildServerFormId(payload.form_id || payload.formId || payload.id, now);
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

    // Fotos por campo de producao (firmeza, maturacao, danos_internos)
    const fotosProdByCampo = {};
    for (const campo of PRODUCAO_CAMPOS_FOTOS) {
      const campoFiles = filesMap[`fotos_${campo}`] || [];
      const { urlPath } = getFotosProdDir(
        payload.fazenda_talhao || payload.fazenda,
        payload.talhao,
        payload.variedade,
        payload.controle,
        campo,
        now,
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
      const fotosSalvasCampo = savedCampoFotos
        .filter((item) => item?.disk_path && fs.existsSync(item.disk_path))
        .map((item) => ({ ...item, form_id: formId }));
      if (fotosSalvasCampo.length) console.log(`  [producao/${campo}]: ${fotosSalvasCampo.length} foto(s) existentes`);

      const todasFotosCampo = [...fotosSalvasCampo, ...novasFotos];
      if (todasFotosCampo.length) fotosProdByCampo[campo] = todasFotosCampo;
    }

    const existingFotos = Array.isArray(payload.fotos_salvas) ? payload.fotos_salvas : [];
    const allFotos = [...existingFotos, ...fotosSalvas];

    const nomeArquivoPdf = `${formId}.pdf`;
    await gerarRelatorioAnaliseFrutosPDF({ ...payload, fotos_salvas: allFotos, fotos_producao: fotosProdByCampo, layout: "novo" }, {
      outputDir: pdfDir,
      fileName: nomeArquivoPdf,
      layout: "novo",
    });

    // Copia PDF + JSON + fotos para a pasta de rede (mesma estrutura do local)
    let networkWarning = null;
    try {
      const networkDir = getNetworkDir(tipo, payload.fazenda_talhao || payload.fazenda, payload.talhao, payload.variedade, payload.controle, now);
      console.log(`[AnaliseFrutos] Tentando salvar na rede: ${networkDir}`);
      ensureDir(networkDir);
      fs.copyFileSync(path.join(pdfDir, nomeArquivoPdf), path.join(networkDir, nomeArquivoPdf));
      console.log(`[AnaliseFrutos] PDF salvo na rede OK`);
      // Copia fotos (subpastas campo) para a rede também
      copyDirToNetwork(pdfDir, networkDir, "[AnaliseFrutos Fotos]");
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
    const { month, day, pdfDir, fotosFolder } = getDateParts(now, tipo, {
      fazenda: payload.fazenda_talhao || payload.fazenda,
      talhao: payload.talhao,
      variedade: payload.variedade,
      controle: payload.controle,
    });
    ensureDir(pdfDir);

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

    const fotosProdByCampo = {};
    for (const campo of PRODUCAO_CAMPOS_FOTOS) {
      const campoFiles = filesMap[`fotos_${campo}`] || [];
      const { urlPath } = getFotosProdDir(
        payload.fazenda_talhao || payload.fazenda,
        payload.talhao,
        payload.variedade,
        payload.controle,
        campo,
        now,
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

      const todasFotosCampo = [...fotosSalvasCampo, ...novasFotos];
      if (todasFotosCampo.length) fotosProdByCampo[campo] = todasFotosCampo;
    }

    const existingFotos = Array.isArray(payload.fotos_salvas) ? payload.fotos_salvas : [];
    const allFotos = [...existingFotos, ...fotosSalvas];

    const nomeArquivoPdf = `${baseId}.pdf`;
    await gerarRelatorioAnaliseFrutosPDF({ ...payload, fotos_salvas: allFotos, fotos_producao: fotosProdByCampo, layout: "novo" }, {
      outputDir: pdfDir,
      fileName: nomeArquivoPdf,
      layout: "novo",
    });

    // Copia o PDF de teste para a rede
    try {
      const networkDir = getNetworkDir(tipo, payload.fazenda_talhao || payload.fazenda, payload.talhao, payload.variedade, payload.controle, now);
      ensureDir(networkDir);
      fs.copyFileSync(path.join(pdfDir, nomeArquivoPdf), path.join(networkDir, nomeArquivoPdf));
      console.log(`[AnaliseFrutos TESTE] PDF copiado para rede: ${networkDir}`);
    } catch (copyErr) {
      console.warn(`[AnaliseFrutos TESTE] Falha ao copiar PDF para rede: ${copyErr.message}`);
    }

    const pdfRelativePath = `${month}/${day}/${nomeArquivoPdf}`;
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
    const absPath = path.join(ANALISE_FRUTOS_ROOT, ...segments);
    if (!absPath.startsWith(ANALISE_FRUTOS_ROOT)) return res.status(403).end();
    if (!fs.existsSync(absPath)) return res.status(404).end();
    return res.sendFile(absPath);
  } catch {
    return res.status(500).end();
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
export default { Salvar, GerarTestePdf, Listar, BuscarPorId, Remover, ServirFoto, DiagnosticoRede, ANALISE_FRUTOS_ROOT };

