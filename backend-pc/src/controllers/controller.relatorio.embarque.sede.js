import { gerarRelatorioEmbarqueSedePDF } from "../services/service.pdf.js";
import { isConectado, enviarREPendentes } from "../services/service.whatsapp.js";
import repositoryRelatorioEmbarqueSede from "../repositories/repository.relatorio.embarque.sede.js";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import multer from "multer";

import { FOTOS_ROOT, BACKEND_ROOT } from "../config/storage.js";

const RELATORIO_EMBARQUE_PDF_ROOT = path.join(BACKEND_ROOT, "relatorioembarque");
const RELATORIO_EMBARQUE_FOTOS_ROOT = path.join(FOTOS_ROOT, "relatorioembarque");
const RELATORIO_EMBARQUE_JSON_ROOT = path.join(BACKEND_ROOT, "json", "relatorioembarque");

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

// Multer para upload de fotos do relatório de embarque.
const sanitizeFolderRE = (value) =>
  String(value || "sem_nome")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim()
    .slice(0, 60) || "sem_nome";

// Salva em pasta temp — o controller move para fazenda/variedade depois.
const RELATORIO_EMBARQUE_FOTOS_TEMP = path.join(RELATORIO_EMBARQUE_FOTOS_ROOT, "_temp");

const storageRE = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureDir(RELATORIO_EMBARQUE_FOTOS_TEMP);
      cb(null, RELATORIO_EMBARQUE_FOTOS_TEMP);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = ext === ".jpeg" ? ".jpg" : ext;
    cb(null, `re_foto_${stamp}_${randomUUID().slice(0, 8)}${safeExt}`);
  },
});

export const uploadFotosRE = multer({
  storage: storageRE,
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 50 },
});

ensureDir(RELATORIO_EMBARQUE_PDF_ROOT);
ensureDir(RELATORIO_EMBARQUE_FOTOS_ROOT);
ensureDir(RELATORIO_EMBARQUE_JSON_ROOT);

const getDateParts = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return {
    month,
    day,
    pdfDir: path.join(RELATORIO_EMBARQUE_PDF_ROOT, month, day),
    jsonDir: path.join(RELATORIO_EMBARQUE_JSON_ROOT, month, day),
    pdfFolder: `relatorioembarque/${month}/${day}`,
    jsonFolder: `json/relatorioembarque/${month}/${day}`,
  };
};

ensureDir(RELATORIO_EMBARQUE_PDF_ROOT);
ensureDir(RELATORIO_EMBARQUE_JSON_ROOT);

const countItemsAndPhotos = (sections = []) => {
  let totalItems = 0;
  let totalPhotos = 0;
  (Array.isArray(sections) ? sections : []).forEach((section) => {
    const items = Array.isArray(section?.items) ? section.items : [];
    totalItems += items.length;
    items.forEach((item) => {
      const total = Number(item?.totalPhotos);
      if (Number.isFinite(total)) {
        totalPhotos += total;
      } else if (Array.isArray(item?.photos)) {
        totalPhotos += item.photos.length;
      }
    });
  });
  return { totalItems, totalPhotos };
};

const sanitizeSectionsForStorage = (sections = []) =>
  (Array.isArray(sections) ? sections : []).map((section) => {
    const items = Array.isArray(section?.items) ? section.items : [];
    const normalizedItems = items.map((item) => {
      const totalPhotos = Number(item?.totalPhotos);
      const photosCount = Number.isFinite(totalPhotos)
        ? Math.max(0, Math.round(totalPhotos))
        : (Array.isArray(item?.photos) ? item.photos.length : 0);

      return {
        key: item?.key || null,
        label: item?.label || null,
        totalPhotos: photosCount,
      };
    });

    return {
      key: section?.key || null,
      title: section?.title || null,
      totalPhotos: normalizedItems.reduce((sum, item) => sum + (item.totalPhotos || 0), 0),
      items: normalizedItems,
    };
  });

const Salvar = async (req, res) => {
  try {
    const payload = req.body || {};
    const sections = Array.isArray(payload.sections) ? payload.sections : [];

    if (!sections.length) {
      return res.status(400).json({
        success: false,
        error: "Nenhuma secao informada para gerar o relatorio de embarque.",
      });
    }

    const now = new Date();
    const dataReferencia = payload?.metaInfo?.analysisDate || now.toLocaleDateString("pt-BR");
    const formId = String(
      payload.form_id
      || payload.formId
      || payload.id
      || `RE-${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`
    );

    const { pdfDir, jsonDir, pdfFolder, jsonFolder } = getDateParts(now);
    ensureDir(pdfDir);
    ensureDir(jsonDir);

    const nomeArquivoPdf = `${formId}.pdf`;
    await gerarRelatorioEmbarqueSedePDF(payload, {
      outputDir: pdfDir,
      fileName: nomeArquivoPdf,
    });

    const jsonRelativePath = `${jsonFolder}/${formId}.json`;
    const pdfRelativePath = `${pdfFolder}/${nomeArquivoPdf}`;
    const { totalItems, totalPhotos } = countItemsAndPhotos(sections);

    const payloadParaSalvar = {
      ...payload,
      sections: sanitizeSectionsForStorage(sections),
      form_id: formId,
      data_referencia: dataReferencia,
      created_at: now.toISOString(),
      arquivos: {
        pdf_relative_path: pdfRelativePath,
        json_relative_path: jsonRelativePath,
      },
    };

    const payloadJson = JSON.stringify(payloadParaSalvar, null, 2);

    const resultado = await repositoryRelatorioEmbarqueSede.Inserir({
      form_id: formId,
      analysis_date: payload?.metaInfo?.analysisDate,
      farm: payload?.metaInfo?.farm,
      talhao: payload?.metaInfo?.talhao,
      variety: payload?.metaInfo?.variety,
      customer: payload?.generalInfo?.customer,
      container: payload?.generalInfo?.container,
      loading: payload?.generalInfo?.loading,
      etd: payload?.generalInfo?.etd,
      eta: payload?.generalInfo?.eta,
      vessel: payload?.generalInfo?.vessel,
      total_sections: sections.length,
      total_items: totalItems,
      total_photos: totalPhotos,
      pdf_path: pdfRelativePath,
      json_path: jsonRelativePath,
      payload_json: payloadJson,
    });

    fs.writeFileSync(path.join(jsonDir, `${formId}.json`), payloadJson, "utf8");

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
      .then(() => enviarREPendentes())
      .catch((backgroundError) => {
        console.error(`[RE] Erro no processamento em segundo plano para ${formId}:`, backgroundError);
      });

    return res.status(201).json({
      success: true,
      message: "Relatorio de embarque salvo com sucesso",
      id: resultado.id,
      form_id: formId,
      data: dataReferencia,
      arquivos: {
        pdf_relative_path: pdfRelativePath,
        json_relative_path: jsonRelativePath,
      },
      whatsapp: whatsappEnvio,
      data_payload: payloadParaSalvar,
    });
  } catch (error) {
    console.error("Erro ao gerar/enviar relatorio de embarque:", error);
    if (error.code === "SQLITE_CONSTRAINT") {
      return res.status(409).json({
        success: false,
        error: "Registro duplicado",
        details: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "Erro interno ao processar relatorio de embarque",
      details: error.message,
    });
  }
};

const Listar = async (req, res) => {
  try {
    const filtros = {
      id: req.query.id,
      form_id: req.query.form_id,
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      limit: req.query.limit || 50,
    };

    Object.keys(filtros).forEach((key) => {
      if (filtros[key] === undefined || filtros[key] === null || filtros[key] === "") {
        delete filtros[key];
      }
    });

    const dados = await repositoryRelatorioEmbarqueSede.Listar(filtros);
    return res.status(200).json({
      success: true,
      total: dados.length,
      data: dados,
    });
  } catch (error) {
    console.error("Erro ao listar relatorio de embarque:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao listar relatorio de embarque",
      details: error.message,
    });
  }
};

const BuscarPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const dado = await repositoryRelatorioEmbarqueSede.BuscarPorId(id);

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
    console.error("Erro ao buscar relatorio de embarque:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao buscar relatorio de embarque",
      details: error.message,
    });
  }
};

// Recebe fotos do relatório de embarque e salva em relatorioembarque/fotos/fazenda/variedade/talhao/mes/dia/
const UploadFotos = (req, res) => {
  try {
    const files = req.files || [];
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const fazenda = sanitizeFolderRE(req.body?.fazenda || "sem_fazenda");
    const variedade = sanitizeFolderRE(req.body?.variedade || "sem_variedade");
    const talhao = req.body?.talhao ? sanitizeFolderRE(req.body.talhao) : null;

    const destParts = [RELATORIO_EMBARQUE_FOTOS_ROOT, fazenda, variedade];
    if (talhao) destParts.push(talhao);
    destParts.push(month, day);
    const destDir = path.join(...destParts);
    ensureDir(destDir);

    const relParts = ["relatorioembarque", fazenda, variedade];
    if (talhao) relParts.push(talhao);
    relParts.push(month, day);

    const fotos = files.map((file) => {
      const dest = path.join(destDir, file.filename);
      fs.renameSync(file.path, dest);
      return {
        nome: file.filename,
        caminho: [...relParts, file.filename].join("/"),
        tamanho: file.size,
      };
    });

    console.log(`[RE] Upload ${files.length} foto(s) → ${fazenda}/${variedade}${talhao ? '/' + talhao : ''}/${month}/${day}`);
    return res.status(200).json({ success: true, total: fotos.length, fotos });
  } catch (error) {
    console.error("[RE] Erro ao salvar fotos:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Serve uma foto individual do relatório de embarque.
const ServirFoto = (req, res) => {
  try {
    const relPath = req.params[0];
    if (!relPath) return res.status(400).end();
    const absPath = path.join(RELATORIO_EMBARQUE_FOTOS_ROOT, relPath);
    if (!absPath.startsWith(RELATORIO_EMBARQUE_FOTOS_ROOT)) return res.status(403).end();
    if (!fs.existsSync(absPath)) return res.status(404).end();
    return res.sendFile(absPath);
  } catch (error) {
    return res.status(500).end();
  }
};

export default { Salvar, Listar, BuscarPorId, UploadFotos, ServirFoto };
