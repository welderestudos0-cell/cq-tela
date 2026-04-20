import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import repositoryMaturacaoForcada from "../repositories/repository.maturacao.forcada.js";
import { gerarRelatorioMFPDFDetalhado } from "../services/service.pdf.js";
import { enviarPDF, isConectado, enviarMFPendentes } from "../services/service.whatsapp.js";

import { FOTOS_ROOT as EXTERNAL_FOTOS_ROOT, BACKEND_ROOT } from "../config/storage.js";

const MF_FOTOS_ROOT = path.join(EXTERNAL_FOTOS_ROOT, "maturacaoforcada");
const MF_GALERIA_ROOT = MF_FOTOS_ROOT;
const MF_JSON_ROOT = path.join(BACKEND_ROOT, "json", "maturacaoforcada");
const MF_FOTOS_LOCAL_ROOT = path.join(BACKEND_ROOT, "maturacaoforcada");

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const copyUploadedFilesToLocalRoot = (files = [], externalRoot, localRoot, logPrefix = "[MF]") => {
  try {
    const list = Array.isArray(files) ? files : [];
    if (!list.length) return;

    list.forEach((file) => {
      const src = file?.path;
      if (!src || !fs.existsSync(src)) return;
      const rel = path.relative(externalRoot, src);
      if (!rel || rel.startsWith("..")) return;

      const dest = path.join(localRoot, rel);
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
    });

    console.log(`${logPrefix} ${list.length} foto(s) copiada(s) para backend local.`);
  } catch (copyErr) {
    console.warn(`${logPrefix} Falha ao copiar fotos para backend local: ${copyErr.message}`);
  }
};

ensureDir(MF_FOTOS_ROOT);
ensureDir(MF_JSON_ROOT);
ensureDir(MF_FOTOS_LOCAL_ROOT);

// Sanitiza texto para uso como nome de pasta (sem caracteres especiais).
const sanitizeFolder = (value) =>
  String(value || "sem_nome")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim()
    .slice(0, 60) || "sem_nome";

// Retorna o numero da semana do ano (ISO).
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2, "0");
};

// Monta o caminho da galeria organizado por fazenda/variedade/semana/dia.
const getGaleriaPath = (fazenda, variedade, date = new Date()) => {
  const semana = `S${getWeekNumber(date)}`;
  const dia = String(date.getDate()).padStart(2, "0");
  const fazendaDir = sanitizeFolder(fazenda);
  const variedadeDir = sanitizeFolder(variedade);
  const dir = path.join(MF_GALERIA_ROOT, fazendaDir, variedadeDir, semana, dia);
  return { dir, fazendaDir, variedadeDir, semana, dia };
};

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  return text.length ? text : null;
};

const parseInteger = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseArray = (value, fallback = []) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return fallback;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }

    return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return fallback;
};

const getDateParts = (date = new Date(), { fazenda = "sem_fazenda", variedade = "sem_variedade" } = {}) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const faz = sanitizeFolder(fazenda);
  const vari = sanitizeFolder(variedade);

  return {
    month,
    day,
    fazenda: faz,
    variedade: vari,
    fotosDir: path.join(MF_FOTOS_ROOT, faz, vari, month, day),
    jsonDir: path.join(MF_JSON_ROOT, month, day),
    fotosFolder: `maturacaoforcada/${faz}/${vari}/${month}/${day}`,
    jsonFolder: `json/maturacaoforcada/${month}/${day}`,
  };
};

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Tipo de arquivo nao permitido. Use JPEG, PNG ou WebP."), false);
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const fazenda = req.body?.produtor || req.body?.comprador || req.body?.fazenda;
      const { fotosDir } = getDateParts(new Date(), { fazenda, variedade: req.body?.variedade });
      ensureDir(fotosDir);
      cb(null, fotosDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = ext === ".jpeg" ? ".jpg" : ext;
    cb(null, `foto_${stamp}_${randomUUID().slice(0, 8)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 20,
  },
});

const buildRowsFromRequest = (req) => {
  const body = req.body || {};
  const files = req.files || [];
  const now = new Date();
  const fazendaBody = body.produtor || body.comprador || body.fazenda;
  const { month, day, fotosFolder, jsonFolder, jsonDir } = getDateParts(now, { fazenda: fazendaBody, variedade: body.variedade });

  const formId = normalizeText(body.form_id)
    || normalizeText(body.formId)
    || normalizeText(body.id)
    || `MF-${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;

  const comprador = normalizeText(body.comprador);
  const produtor = normalizeText(body.produtor);
  const parcela = normalizeText(body.parcela);

  const te = parseArray(body.te, [
    body.te_leve ?? body.teLeve,
    body.te_moderado ?? body.teModerado,
    body.te_severo ?? body.teSevero,
  ]);

  const pc = parseArray(body.pc, [
    body.pc_leve ?? body.pcLeve,
    body.pc_moderado ?? body.pcModerado,
    body.pc_severo ?? body.pcSevero,
  ]);

  const df = parseArray(body.df, [
    body.df_leve ?? body.dfLeve,
    body.df_moderado ?? body.dfModerado,
    body.df_severo ?? body.dfSevero,
  ]);

  const quantidadeFrutos = parseInteger(body.qtd ?? body.quantidade_frutos ?? body.quantidadeFrutos, 0);

  const teValores = [parseInteger(te[0], 0), parseInteger(te[1], 0), parseInteger(te[2], 0)];
  const pcValores = [parseInteger(pc[0], 0), parseInteger(pc[1], 0), parseInteger(pc[2], 0)];
  const dfValores = [parseInteger(df[0], 0), parseInteger(df[1], 0), parseInteger(df[2], 0)];

  const peduncular = parseInteger(body.peduncular, 0);
  const antracnose = parseInteger(body.antracnose, 0);
  const colapso = parseInteger(body.colapso, 0);
  const germinacao = parseInteger(body.germinacao, 0);
  const alternaria = parseInteger(body.alternaria, 0);

  const totalDefeitoCalculado = (
    teValores.reduce((acc, item) => acc + item, 0)
    + pcValores.reduce((acc, item) => acc + item, 0)
    + dfValores.reduce((acc, item) => acc + item, 0)
    + peduncular
    + antracnose
    + colapso
    + germinacao
    + alternaria
  );

  const totalDefeito = parseInteger(body.totalDefeito ?? body.total_defeito, totalDefeitoCalculado);
  const incidenciaCalculada = quantidadeFrutos > 0
    ? Number(((totalDefeito / quantidadeFrutos) * 100).toFixed(1))
    : 0;
  const incidencia = parseNumber(body.incidencia, incidenciaCalculada) ?? incidenciaCalculada;

  const fotosRecebidas = parseArray(body.fotos, []);
  const fotosSalvas = files.map((file) => ({
    form_id: formId,
    nome: file.filename,
    original_nome: file.originalname,
    mimetype: file.mimetype,
    tamanho: file.size,
    caminho_relativo: `${fotosFolder}/${file.filename}`,
    url: `/api/maturacao-forcada/fotos/${month}/${day}/${encodeURIComponent(file.filename)}`,
  }));

  const dataRecebimento = normalizeText(body.dataRec ?? body.data_recebimento ?? body.dataRecebimento);
  const dataAnalise = normalizeText(body.dataAna ?? body.data_analise ?? body.dataAnalise);

  const payload = {
    form_id: formId,
    data_recebimento: dataRecebimento || dataAnalise,
    data_analise: dataAnalise || dataRecebimento,
    comprador,
    produtor,
    parcela,
    responsavel: normalizeText(body.responsavel),
    variedade: normalizeText(body.variedade),
    quantidade_frutos: quantidadeFrutos,
    te_leve: teValores[0],
    te_moderado: teValores[1],
    te_severo: teValores[2],
    pc_leve: pcValores[0],
    pc_moderado: pcValores[1],
    pc_severo: pcValores[2],
    df_leve: dfValores[0],
    df_moderado: dfValores[1],
    df_severo: dfValores[2],
    peduncular,
    antracnose,
    colapso,
    germinacao,
    alternaria,
    total_defeito: totalDefeito,
    incidencia,
    observacoes: normalizeText(body.obs ?? body.observacoes),
    usuario: normalizeText(body.usuario),
    cargo: normalizeText(body.cargo),
    matricula: normalizeText(body.matricula),
    momento: normalizeText(body.momento) || now.toISOString(),
    fotos_count: fotosSalvas.length,
    fotos_recebidas: fotosRecebidas,
    fotos_salvas: fotosSalvas,
  };

  return {
    formId,
    payload,
    payloadJson: JSON.stringify(payload, null, 2),
    jsonPath: path.join(jsonDir, `${formId}.json`),
    jsonRelativePath: `${jsonFolder}/${formId}.json`,
    fotosRelativePath: fotosFolder,
    fotosCount: fotosSalvas.length,
  };
};

const montarLegendaPDF = (payload, formId) => {
  const dataAnalise = payload.data_analise
    ? new Date(`${payload.data_analise}T12:00:00`).toLocaleDateString("pt-BR")
    : new Date().toLocaleDateString("pt-BR");

  return [
    "MATURACAO FORCADA",
    `Formulario: ${formId}`,
    `Data: ${dataAnalise}`,
    `Comprador: ${payload.comprador || "-"}`,
    `Produtor: ${payload.produtor || "-"}`,
    `Parcela: ${payload.parcela || "-"}`,
    `Variedade: ${payload.variedade || "-"}`,
  ].join("\n");
};

const dispararPdfAutomatico = async (payload, formId) => {
  if (!isConectado()) {
    console.warn(`[MF] WhatsApp desconectado. PDF automatico nao enviado para ${formId}.`);
    await repositoryMaturacaoForcada.MarcarEnviado(formId, false);
    return;
  }

  try {
    const caminhoPDF = await gerarRelatorioMFPDFDetalhado(formId);
    const legenda = montarLegendaPDF(payload, formId);
    await enviarPDF(caminhoPDF, legenda);
    await repositoryMaturacaoForcada.MarcarEnviado(formId, true);
    console.log(`[MF] PDF automatico enviado para o grupo. Formulario: ${formId}`);
  } catch (error) {
    await repositoryMaturacaoForcada.MarcarEnviado(formId, false);
    console.error(`[MF] Falha ao enviar PDF automatico para ${formId}:`, error);
  }
};

const Salvar = async (req, res) => {
  try {
    copyUploadedFilesToLocalRoot(req.files || [], MF_FOTOS_ROOT, MF_FOTOS_LOCAL_ROOT, "[MF]");

    const {
      formId,
      payload,
      payloadJson,
      jsonPath,
      jsonRelativePath,
      fotosRelativePath,
      fotosCount,
    } = buildRowsFromRequest(req);

    const resultado = await repositoryMaturacaoForcada.Inserir({
      form_id: formId,
      data_recebimento: payload.data_recebimento,
      data_analise: payload.data_analise,
      comprador: payload.comprador,
      produtor: payload.produtor,
      parcela: payload.parcela,
      responsavel: payload.responsavel,
      variedade: payload.variedade,
      quantidade_frutos: payload.quantidade_frutos,
      te_leve: payload.te_leve,
      te_moderado: payload.te_moderado,
      te_severo: payload.te_severo,
      pc_leve: payload.pc_leve,
      pc_moderado: payload.pc_moderado,
      pc_severo: payload.pc_severo,
      df_leve: payload.df_leve,
      df_moderado: payload.df_moderado,
      df_severo: payload.df_severo,
      peduncular: payload.peduncular,
      antracnose: payload.antracnose,
      colapso: payload.colapso,
      germinacao: payload.germinacao,
      alternaria: payload.alternaria,
      total_defeito: payload.total_defeito,
      incidencia: payload.incidencia,
      observacoes: payload.observacoes,
      usuario: payload.usuario,
      cargo: payload.cargo,
      matricula: payload.matricula,
      momento: payload.momento,
      fotos_count: payload.fotos_count,
      fotos_folder: fotosRelativePath,
      json_path: jsonRelativePath,
      payload_json: payloadJson,
    });

    ensureDir(path.dirname(jsonPath));
    fs.writeFileSync(jsonPath, payloadJson, "utf8");

    // Copia fotos para pasta galeria/fazenda/variedade/semana/dia
    try {
      const fazenda = payload.produtor || payload.comprador || "sem_fazenda";
      const variedade = payload.variedade || "sem_variedade";
      const { dir: galeriaDir } = getGaleriaPath(fazenda, variedade, new Date());
      ensureDir(galeriaDir);
      const files = req.files || [];
      files.forEach((file) => {
        const dest = path.join(galeriaDir, file.filename);
        fs.copyFileSync(file.path, dest);
      });
      console.log(`[MF] ${files.length} foto(s) copiada(s) para galeria: ${galeriaDir}`);
    } catch (galeriaError) {
      console.warn("[MF] Erro ao copiar fotos para galeria:", galeriaError?.message);
    }

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
      .then(() => enviarMFPendentes())
      .catch((backgroundError) => {
        console.error(`[MF] Erro no processamento em segundo plano para ${formId}:`, backgroundError);
      });

    return res.status(201).json({
      success: true,
      message: "Maturacao forcada salva com sucesso",
      id: resultado.id,
      form_id: formId,
      fotos_count: fotosCount,
      fotos_folder: fotosRelativePath,
      json_path: jsonRelativePath,
      whatsapp: whatsappEnvio,
      data: payload,
    });
  } catch (error) {
    console.error("Erro ao salvar maturacao forcada:", error);

    if (error.code === "SQLITE_CONSTRAINT") {
      return res.status(409).json({
        success: false,
        error: "Registro duplicado",
        details: error.message,
      });
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        error: "Arquivo muito grande. Maximo 10MB por foto.",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Erro interno ao salvar maturacao forcada",
      details: error.message,
    });
  }
};

const Listar = async (req, res) => {
  try {
    const filtros = {
      id: req.query.id,
      form_id: req.query.form_id,
      comprador: req.query.comprador,
      produtor: req.query.produtor,
      parcela: req.query.parcela,
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      limit: req.query.limit || 50,
    };

    Object.keys(filtros).forEach((key) => {
      if (filtros[key] === undefined || filtros[key] === null || filtros[key] === "") {
        delete filtros[key];
      }
    });

    const dados = await repositoryMaturacaoForcada.Listar(filtros);

    return res.status(200).json({
      success: true,
      total: dados.length,
      data: dados,
    });
  } catch (error) {
    console.error("Erro ao listar maturacao forcada:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao listar maturacao forcada",
      details: error.message,
    });
  }
};

const BuscarPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const dado = await repositoryMaturacaoForcada.BuscarPorId(id);

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
    console.error("Erro ao buscar maturacao forcada:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao buscar maturacao forcada",
      details: error.message,
    });
  }
};

// Lista as fazendas disponíveis na galeria com filtro opcional.
const GaleriaListarFazendas = (req, res) => {
  try {
    if (!fs.existsSync(MF_GALERIA_ROOT)) return res.json({ success: true, fazendas: [] });
    const fazendas = fs.readdirSync(MF_GALERIA_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const fazendaPath = path.join(MF_GALERIA_ROOT, d.name);
        const variedades = fs.existsSync(fazendaPath)
          ? fs.readdirSync(fazendaPath, { withFileTypes: true })
              .filter((v) => v.isDirectory())
              .map((v) => v.name)
          : [];
        return { fazenda: d.name, variedades };
      });
    return res.json({ success: true, fazendas });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Lista as fotos de uma pasta específica fazenda/variedade/semana/dia.
const GaleriaListarFotos = (req, res) => {
  try {
    const { fazenda, variedade, semana, dia } = req.query;
    if (!fazenda) return res.status(400).json({ success: false, error: "Informe a fazenda." });

    let dir = path.join(MF_GALERIA_ROOT, fazenda);
    if (variedade) dir = path.join(dir, variedade);
    if (semana) dir = path.join(dir, semana);
    if (dia) dir = path.join(dir, dia);

    if (!fs.existsSync(dir)) return res.json({ success: true, fotos: [] });

    const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
    const fotos = [];

    const walk = (current) => {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      entries.forEach((entry) => {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
          const relative = path.relative(MF_GALERIA_ROOT, fullPath).replace(/\\/g, "/");
          const parts = relative.split("/");
          fotos.push({
            url: `/api/maturacao-forcada/galeria/foto/${relative}`,
            nome: entry.name,
            fazenda: parts[0] || fazenda,
            variedade: parts[1] || variedade || "",
            semana: parts[2] || semana || "",
            dia: parts[3] || dia || "",
          });
        }
      });
    };

    walk(dir);
    return res.json({ success: true, total: fotos.length, fotos });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Serve uma foto individual da galeria.
const GaleriaServirFoto = (req, res) => {
  try {
    const relPath = req.params[0];
    if (!relPath) return res.status(400).end();
    const absPath = path.join(MF_GALERIA_ROOT, relPath);
    // Segurança: impede path traversal
    if (!absPath.startsWith(MF_GALERIA_ROOT)) return res.status(403).end();
    if (!fs.existsSync(absPath)) return res.status(404).end();
    return res.sendFile(absPath);
  } catch (error) {
    return res.status(500).end();
  }
};

export { upload };
export default {
  Salvar,
  Listar,
  BuscarPorId,
  GaleriaListarFazendas,
  GaleriaListarFotos,
  GaleriaServirFoto,
};
