import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  gerarRelatorioAnaliseFrutosPDF,
  gerarRelatorioEmbarqueSedePDF,
} from "../services/service.pdf.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.join(__dirname, "..", "..");
const TMP_EDITOR_ROOT = path.join(BACKEND_ROOT, "tmp_pdf_test", "editor");
const TMP_LAYOUT_ROOT = path.join(BACKEND_ROOT, "tmp_pdf_test", "layout");
const TMP_LAYOUT_MAPS_ROOT = path.join(BACKEND_ROOT, "tmp_pdf_test", "layout_maps");

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

ensureDir(TMP_EDITOR_ROOT);
ensureDir(TMP_LAYOUT_ROOT);
ensureDir(TMP_LAYOUT_MAPS_ROOT);

const TYPE_CONFIG = {
  "analise-frutos": {
    tipo: "analise-frutos",
    prefixo: "AF",
    tempFolder: "analise_frutos",
    jsonRoot: path.join(BACKEND_ROOT, "analise_frutos"),
    pdfRoot: path.join(BACKEND_ROOT, "analise_frutos"),
    jsonBaseUrl: "/api/analise-frutos/json",
    pdfBaseUrl: "/api/analise-frutos/pdf",
    gerar: gerarRelatorioAnaliseFrutosPDF,
  },
  "relatorio-embarque-sede": {
    tipo: "relatorio-embarque-sede",
    prefixo: "RE",
    tempFolder: "relatorioembarque",
    jsonRoot: path.join(BACKEND_ROOT, "json", "relatorioembarque"),
    pdfRoot: path.join(BACKEND_ROOT, "relatorioembarque"),
    jsonBaseUrl: "/api/relatorio-embarque/json",
    pdfBaseUrl: "/api/relatorio-embarque/pdf",
    gerar: gerarRelatorioEmbarqueSedePDF,
  },
};

const PDF_SOURCES = {
  "analise-frutos": {
    key: "analise-frutos",
    rootDir: path.join(BACKEND_ROOT, "analise_frutos"),
    baseUrl: "/api/analise-frutos/pdf",
    nome: "Analise Frutos",
  },
  "relatorio-embarque": {
    key: "relatorio-embarque",
    rootDir: path.join(BACKEND_ROOT, "relatorioembarque"),
    baseUrl: "/api/relatorio-embarque/pdf",
    nome: "Relatorio Embarque",
  },
  "tmp-pdf": {
    key: "tmp-pdf",
    rootDir: path.join(BACKEND_ROOT, "tmp_pdf_test"),
    baseUrl: "/api/tmp-pdf",
    nome: "TMP PDF",
  },
  "uploads-relatorios": {
    key: "uploads-relatorios",
    rootDir: path.join(BACKEND_ROOT, "uploads", "relatorios"),
    baseUrl: "/uploads/relatorios",
    nome: "Uploads Relatorios",
  },
};

const FONT_MAP = {
  helvetica: StandardFonts.Helvetica,
  "helvetica-bold": StandardFonts.HelveticaBold,
  "helvetica-oblique": StandardFonts.HelveticaOblique,
  times: StandardFonts.TimesRoman,
  "times-bold": StandardFonts.TimesBold,
  courier: StandardFonts.Courier,
  "courier-bold": StandardFonts.CourierBold,
};

const getConfig = (tipo) => TYPE_CONFIG[String(tipo || "").trim()] || null;

const toPosix = (value = "") => String(value).replaceAll("\\", "/");

const normalizeRelative = (value = "") => {
  const cleaned = toPosix(String(value || "").trim()).replace(/^\/+/, "");
  return path.posix.normalize(cleaned);
};

const isInside = (rootDir, targetPath) => {
  const rel = path.relative(rootDir, targetPath);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
};

const listFilesByExtension = (rootDir, extension) => {
  if (!fs.existsSync(rootDir)) return [];

  const ext = String(extension || "").toLowerCase();
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(ext)) continue;

      const stats = fs.statSync(absolute);
      files.push({
        absolute,
        mtimeMs: stats.mtimeMs,
        mtimeIso: stats.mtime.toISOString(),
      });
    }
  }

  return files;
};

const makeDocMeta = (config, absoluteJsonPath, mtimeIso = null) => {
  const relativeJson = normalizeRelative(path.relative(config.jsonRoot, absoluteJsonPath));
  const id = path.basename(relativeJson, ".json");
  const dirRel = path.posix.dirname(relativeJson);
  const relativePdf = dirRel === "." ? `${id}.pdf` : `${dirRel}/${id}.pdf`;
  const absolutePdfPath = path.join(config.pdfRoot, relativePdf.split("/").join(path.sep));

  return {
    id,
    arquivo: relativeJson,
    json_url: encodeURI(`${config.jsonBaseUrl}/${relativeJson}`),
    pdf_url: encodeURI(`${config.pdfBaseUrl}/${relativePdf}`),
    pdf_existe: fs.existsSync(absolutePdfPath),
    atualizado_em: mtimeIso,
  };
};

const resolveJsonByRelativePath = (config, arquivoRelativo) => {
  const normalized = normalizeRelative(arquivoRelativo);
  if (!normalized || normalized === "." || normalized.includes("..")) {
    throw new Error("Caminho de arquivo invalido.");
  }

  const absolute = path.resolve(config.jsonRoot, normalized.split("/").join(path.sep));
  if (!isInside(config.jsonRoot, absolute)) {
    throw new Error("Arquivo fora do diretorio permitido.");
  }
  if (path.extname(absolute).toLowerCase() !== ".json") {
    throw new Error("Somente arquivos .json sao permitidos.");
  }
  return { normalized, absolute };
};

const sanitizeBaseName = (value, fallback) => {
  const base = String(value || fallback || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_");
  return base || fallback || `arquivo_${randomUUID().slice(0, 8)}`;
};

const sanitizePdfName = (value, fallbackBase) => {
  const base = sanitizeBaseName(value, fallbackBase);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
};

const sanitizeJsonName = (value, fallbackBase) => {
  const base = sanitizeBaseName(value, fallbackBase);
  return base.toLowerCase().endsWith(".json") ? base : `${base}.json`;
};

const dateParts = (date = new Date()) => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return { year, month, day };
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const parseNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeHexColor = (value, fallback = "#000000") => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) {
    const [, a, b, c] = raw.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/) || [];
    return `#${a}${a}${b}${b}${c}${c}`;
  }
  return fallback;
};

const hexToRgb = (hexColor) => {
  const normalized = normalizeHexColor(hexColor);
  const intValue = parseInt(normalized.slice(1), 16);
  const r = ((intValue >> 16) & 255) / 255;
  const g = ((intValue >> 8) & 255) / 255;
  const b = (intValue & 255) / 255;
  return rgb(r, g, b);
};

const normalizePathTokens = (pathExpr = "") =>
  String(pathExpr || "")
    .trim()
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\./, "")
    .split(".")
    .map((token) => token.trim())
    .filter(Boolean);

const readByPath = (obj, pathExpr) => {
  const tokens = normalizePathTokens(pathExpr);
  if (!tokens.length) return undefined;
  let current = obj;
  for (const token of tokens) {
    if (current == null || typeof current !== "object") return undefined;
    if (!(token in current)) return undefined;
    current = current[token];
  }
  return current;
};

const valueToText = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const interpolateText = (template, payload = {}) =>
  String(template || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    const value = readByPath(payload, expr);
    return valueToText(value);
  });

const normalizeLayoutInput = (layoutInput) => {
  if (Array.isArray(layoutInput)) {
    return {
      campos: layoutInput,
      valores: {},
      opcoes: {},
    };
  }
  if (layoutInput && typeof layoutInput === "object") {
    return {
      campos: Array.isArray(layoutInput.campos) ? layoutInput.campos : [],
      valores:
        layoutInput.valores && typeof layoutInput.valores === "object" && !Array.isArray(layoutInput.valores)
          ? layoutInput.valores
          : {},
      opcoes:
        layoutInput.opcoes && typeof layoutInput.opcoes === "object" && !Array.isArray(layoutInput.opcoes)
          ? layoutInput.opcoes
          : {},
    };
  }
  return {
    campos: [],
    valores: {},
    opcoes: {},
  };
};

const resolveCampoTexto = (campo, layoutValues, payload) => {
  if (campo == null || typeof campo !== "object") return "";
  const context = {
    ...(payload && typeof payload === "object" ? payload : {}),
    valores: layoutValues,
  };
  if (campo.texto !== undefined && campo.texto !== null) {
    return interpolateText(campo.texto, context);
  }
  if (campo.valor !== undefined && campo.valor !== null) {
    return valueToText(campo.valor);
  }
  if (campo.nome) {
    if (Object.prototype.hasOwnProperty.call(layoutValues, campo.nome)) {
      return valueToText(layoutValues[campo.nome]);
    }
    const valueInPayload = readByPath(payload, campo.nome);
    return valueToText(valueInPayload);
  }
  return "";
};

const resolveFontName = (fontValue) => {
  const key = String(fontValue || "helvetica").trim().toLowerCase();
  return FONT_MAP[key] || StandardFonts.Helvetica;
};

const listPdfsBySource = (sourceConfig, limit = 200) =>
  listFilesByExtension(sourceConfig.rootDir, ".pdf")
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((item) => {
      const relative = normalizeRelative(path.relative(sourceConfig.rootDir, item.absolute));
      return {
        id: `${sourceConfig.key}/${relative}`,
        fonte: sourceConfig.key,
        fonte_nome: sourceConfig.nome,
        arquivo: relative,
        pdf_url: encodeURI(`${sourceConfig.baseUrl}/${relative}`),
        atualizado_em: item.mtimeIso,
      };
    });

const resolvePdfBySelectionId = (selectionId) => {
  const raw = String(selectionId || "").trim();
  if (!raw) {
    throw new Error("pdf_arquivo e obrigatorio.");
  }

  const firstSlash = raw.indexOf("/");
  if (firstSlash <= 0) {
    throw new Error("pdf_arquivo invalido. Use o formato fonte/caminho.pdf.");
  }

  const sourceKey = raw.slice(0, firstSlash);
  const source = PDF_SOURCES[sourceKey];
  if (!source) {
    throw new Error(`Fonte de PDF invalida: ${sourceKey}`);
  }

  const relative = normalizeRelative(raw.slice(firstSlash + 1));
  if (!relative || relative === "." || relative.includes("..")) {
    throw new Error("Caminho relativo do PDF invalido.");
  }
  if (!relative.toLowerCase().endsWith(".pdf")) {
    throw new Error("Somente arquivos PDF sao permitidos.");
  }

  const absolute = path.resolve(source.rootDir, relative.split("/").join(path.sep));
  if (!isInside(source.rootDir, absolute)) {
    throw new Error("PDF fora do diretorio permitido.");
  }
  if (!fs.existsSync(absolute)) {
    throw new Error(`PDF nao encontrado: ${absolute}`);
  }

  return {
    source,
    sourceKey,
    relative,
    absolute,
    url: encodeURI(`${source.baseUrl}/${relative}`),
  };
};

const ListarDocumentos = async (req, res) => {
  try {
    const config = getConfig(req.query.tipo);
    if (!config) {
      return res.status(400).json({
        success: false,
        error: "Tipo invalido. Use analise-frutos ou relatorio-embarque-sede.",
      });
    }

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.round(rawLimit))) : 50;

    const data = listFilesByExtension(config.jsonRoot, ".json")
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, limit)
      .map((item) => makeDocMeta(config, item.absolute, item.mtimeIso));

    return res.status(200).json({
      success: true,
      tipo: config.tipo,
      total: data.length,
      data,
    });
  } catch (error) {
    console.error("Erro ao listar documentos do painel PDF:", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao listar documentos",
      details: error.message,
    });
  }
};

const ObterConteudo = async (req, res) => {
  try {
    const config = getConfig(req.query.tipo);
    if (!config) {
      return res.status(400).json({
        success: false,
        error: "Tipo invalido. Use analise-frutos ou relatorio-embarque-sede.",
      });
    }

    const { absolute, normalized } = resolveJsonByRelativePath(config, req.query.arquivo);
    if (!fs.existsSync(absolute)) {
      return res.status(404).json({
        success: false,
        error: "Arquivo JSON nao encontrado.",
      });
    }

    const raw = fs.readFileSync(absolute, "utf8");
    const payload = JSON.parse(raw);
    const stats = fs.statSync(absolute);
    const meta = makeDocMeta(config, absolute, stats.mtime.toISOString());

    return res.status(200).json({
      success: true,
      tipo: config.tipo,
      arquivo: normalized,
      ...meta,
      payload,
    });
  } catch (error) {
    console.error("Erro ao abrir documento do painel PDF:", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao abrir documento",
      details: error.message,
    });
  }
};

const RegenerarPdf = async (req, res) => {
  try {
    const body = req.body || {};
    const config = getConfig(body.tipo);
    if (!config) {
      return res.status(400).json({
        success: false,
        error: "Tipo invalido. Use analise-frutos ou relatorio-embarque-sede.",
      });
    }

    const payload = body.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({
        success: false,
        error: "Payload invalido. Envie um objeto JSON em body.payload.",
      });
    }

    const salvarJson = Boolean(body.salvar_json);
    const arquivoOrigem = body.arquivo_origem ? String(body.arquivo_origem) : null;

    let outputDir;
    let pdfFileName;
    let pdfUrl;
    let jsonPathAtualizado = null;

    if (salvarJson) {
      if (!arquivoOrigem) {
        return res.status(400).json({
          success: false,
          error: "Para salvar o JSON, informe body.arquivo_origem.",
        });
      }

      const { absolute, normalized } = resolveJsonByRelativePath(config, arquivoOrigem);
      const id = path.basename(normalized, ".json");
      const dirRel = path.posix.dirname(normalized);
      const relativePdf = dirRel === "." ? `${id}.pdf` : `${dirRel}/${id}.pdf`;

      outputDir = path.join(config.pdfRoot, path.dirname(relativePdf));
      pdfFileName = path.basename(relativePdf);
      ensureDir(outputDir);
      ensureDir(path.dirname(absolute));

      await config.gerar(payload, {
        outputDir,
        fileName: pdfFileName,
      });

      fs.writeFileSync(absolute, JSON.stringify(payload, null, 2), "utf8");
      jsonPathAtualizado = normalized;
      pdfUrl = encodeURI(`${config.pdfBaseUrl}/${toPosix(relativePdf)}`);
    } else {
      const now = new Date();
      const { month, day } = dateParts(now);
      outputDir = path.join(TMP_EDITOR_ROOT, config.tempFolder, month, day);
      ensureDir(outputDir);

      const baseId = sanitizeBaseName(
        payload.form_id || payload.formId || payload.id,
        `${config.prefixo}-${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`
      );

      pdfFileName = sanitizePdfName(body.file_name, baseId);

      await config.gerar(payload, {
        outputDir,
        fileName: pdfFileName,
      });

      const tmpRelPath = `editor/${config.tempFolder}/${month}/${day}/${pdfFileName}`;
      pdfUrl = encodeURI(`/api/tmp-pdf/${tmpRelPath}`);
    }

    const absolutePdf = path.join(outputDir, pdfFileName);
    return res.status(200).json({
      success: true,
      tipo: config.tipo,
      modo: salvarJson ? "atualizado" : "temporario",
      pdf_file_name: pdfFileName,
      pdf_path_local: absolutePdf,
      pdf_url: pdfUrl,
      json_path_atualizado: jsonPathAtualizado,
    });
  } catch (error) {
    console.error("Erro ao regenerar PDF no painel:", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao regenerar PDF",
      details: error.message,
    });
  }
};

const ListarPdfs = async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(400, Math.round(rawLimit))) : 200;
    const sourceFilter = String(req.query.fonte || "").trim();

    const sources = Object.values(PDF_SOURCES).filter((source) =>
      sourceFilter ? source.key === sourceFilter : true
    );

    const grouped = sources.map((source) => ({
      fonte: source.key,
      fonte_nome: source.nome,
      total: 0,
      data: [],
    }));

    for (const group of grouped) {
      const source = PDF_SOURCES[group.fonte];
      const docs = listPdfsBySource(source, limit);
      group.total = docs.length;
      group.data = docs;
    }

    const data = grouped
      .flatMap((group) => group.data)
      .sort((a, b) => new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime())
      .slice(0, limit);

    return res.status(200).json({
      success: true,
      total: data.length,
      fontes: grouped.map((group) => ({
        fonte: group.fonte,
        fonte_nome: group.fonte_nome,
        total: group.total,
      })),
      data,
    });
  } catch (error) {
    console.error("Erro ao listar PDFs do painel:", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao listar PDFs",
      details: error.message,
    });
  }
};

const AplicarCampos = async (req, res) => {
  try {
    const body = req.body || {};
    const source = resolvePdfBySelectionId(body.pdf_arquivo);

    const layoutNormalized = normalizeLayoutInput(body.layout);
    const campos = layoutNormalized.campos;
    const layoutValues = layoutNormalized.valores;
    const options = layoutNormalized.opcoes;
    const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? body.payload
      : {};

    if (!campos.length) {
      return res.status(400).json({
        success: false,
        error: "Layout sem campos. Informe layout.campos com pelo menos um item.",
      });
    }

    const bytes = fs.readFileSync(source.absolute);
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    const fontCache = new Map();
    const getFont = async (fontKey) => {
      if (fontCache.has(fontKey)) return fontCache.get(fontKey);
      const embedded = await pdfDoc.embedFont(fontKey);
      fontCache.set(fontKey, embedded);
      return embedded;
    };

    const globalShowBox = Boolean(options.mostrarCaixa || options.mostrar_caixa);
    const globalDefaultRef = String(options.ref || "top-left").trim().toLowerCase();
    const globalDefaultColor = normalizeHexColor(options.cor || "#000000");

    const applied = [];
    const skipped = [];

    for (let i = 0; i < campos.length; i += 1) {
      const campo = campos[i];
      if (!campo || typeof campo !== "object") {
        skipped.push({ indice: i, motivo: "Campo invalido (nao eh objeto)." });
        continue;
      }

      const pagina = Math.round(parseNumber(campo.pagina, 1));
      if (pagina < 1 || pagina > pages.length) {
        skipped.push({
          indice: i,
          nome: campo.nome || null,
          motivo: `Pagina ${pagina} invalida. O PDF tem ${pages.length} pagina(s).`,
        });
        continue;
      }

      const page = pages[pagina - 1];
      const pageHeight = page.getHeight();
      const x = parseNumber(campo.x, NaN);
      const yValue = parseNumber(campo.y, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(yValue)) {
        skipped.push({
          indice: i,
          nome: campo.nome || null,
          motivo: "x/y invalidos.",
        });
        continue;
      }

      const fontSize = clamp(parseNumber(campo.tamanho, 11), 4, 120);
      const lineHeight = clamp(parseNumber(campo.altura_linha, fontSize + 2), 4, 180);
      const opacity = clamp(parseNumber(campo.opacidade, 1), 0, 1);
      const align = ["left", "center", "right"].includes(String(campo.align || "").toLowerCase())
        ? String(campo.align).toLowerCase()
        : "left";
      const maxWidthValue = parseNumber(campo.largura, NaN);
      const maxWidth = Number.isFinite(maxWidthValue) && maxWidthValue > 0 ? maxWidthValue : undefined;

      const ref = String(campo.ref || globalDefaultRef || "top-left").trim().toLowerCase();
      const y =
        ref === "top-left" || ref === "top" || ref === "tl" || campo.y_from_top === true
          ? pageHeight - yValue - fontSize
          : yValue;

      const colorHex = normalizeHexColor(campo.cor || globalDefaultColor);
      const color = hexToRgb(colorHex);

      const fontKey = resolveFontName(campo.fonte);
      const font = await getFont(fontKey);

      const text = resolveCampoTexto(campo, layoutValues, payload);

      const drawOptions = {
        x,
        y,
        size: fontSize,
        font,
        color,
        opacity,
        lineHeight,
      };
      if (maxWidth) drawOptions.maxWidth = maxWidth;
      if (align) drawOptions.align = align;

      page.drawText(text, drawOptions);

      const showBox = Boolean(campo.mostrar_caixa || campo.mostrarCaixa || globalShowBox);
      if (showBox) {
        const widthEstimate =
          maxWidth || Math.min(Math.max(20, text.length * (fontSize * 0.55) + 8), page.getWidth() - x - 2);
        const boxHeight = fontSize + 6;
        page.drawRectangle({
          x,
          y: y - 2,
          width: widthEstimate,
          height: boxHeight,
          borderColor: rgb(1, 0, 0),
          borderWidth: 0.8,
          opacity: 0.85,
        });
      }

      applied.push({
        indice: i,
        nome: campo.nome || null,
        pagina,
        x,
        y,
        texto: text,
      });
    }

    const now = new Date();
    const { year, month, day } = dateParts(now);
    const outDir = path.join(TMP_LAYOUT_ROOT, year, month, day);
    ensureDir(outDir);

    const sourceBaseName = path.basename(source.relative, ".pdf");
    const outFileName = sanitizePdfName(
      body.file_name,
      `${sourceBaseName}_campos_${now.toISOString().replace(/[:.]/g, "-")}`
    );

    const outAbsolute = path.join(outDir, outFileName);
    const outBytes = await pdfDoc.save();
    fs.writeFileSync(outAbsolute, outBytes);

    let mapaPath = null;
    if (Boolean(body.salvar_mapa)) {
      const mapFileName = sanitizeJsonName(
        body.mapa_nome,
        `${sourceBaseName}_mapa_campos`
      );
      mapaPath = path.join(TMP_LAYOUT_MAPS_ROOT, mapFileName);
      const mapPayload = {
        gerado_em: now.toISOString(),
        pdf_arquivo: body.pdf_arquivo,
        pdf_url_origem: source.url,
        layout: {
          campos,
          valores: layoutValues,
          opcoes: options,
        },
      };
      fs.writeFileSync(mapaPath, JSON.stringify(mapPayload, null, 2), "utf8");
    }

    const outRel = `layout/${year}/${month}/${day}/${outFileName}`;
    return res.status(200).json({
      success: true,
      pdf_origem: {
        id: body.pdf_arquivo,
        url: source.url,
        path_local: source.absolute,
      },
      resultado: {
        pdf_file_name: outFileName,
        pdf_path_local: outAbsolute,
        pdf_url: encodeURI(`/api/tmp-pdf/${outRel}`),
        mapa_path_local: mapaPath,
      },
      resumo: {
        total_campos: campos.length,
        aplicados: applied.length,
        ignorados: skipped.length,
      },
      aplicados: applied,
      ignorados: skipped,
    });
  } catch (error) {
    console.error("Erro ao aplicar campos no PDF:", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao aplicar campos no PDF",
      details: error.message,
    });
  }
};

export default {
  ListarDocumentos,
  ObterConteudo,
  RegenerarPdf,
  ListarPdfs,
  AplicarCampos,
};
