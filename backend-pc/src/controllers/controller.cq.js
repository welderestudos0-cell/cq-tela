import serviceCQ from "../services/service.cq.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { BACKEND_ROOT } from "../config/storage.js";

const CQ_UPLOAD_ROOT = path.join(BACKEND_ROOT, "uploads", "cq");

fs.mkdirSync(CQ_UPLOAD_ROOT, { recursive: true });

const sanitizeFolderCQ = (value, fallback = "sem_nome") =>
  String(value || fallback)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim()
    .slice(0, 60) || fallback;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const produto = sanitizeFolderCQ(req.body?.produto, "sem_produto");
    const lote = sanitizeFolderCQ(req.body?.lote, "sem_lote");
    const dir = path.join(CQ_UPLOAD_ROOT, produto, lote);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `cq_${Date.now()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const permitidos = /jpeg|jpg|png|webp/;
    const valido = permitidos.test(path.extname(file.originalname).toLowerCase());
    valido ? cb(null, true) : cb(new Error("Apenas imagens sao permitidas (jpg, png, webp)"));
  },
});

const Inserir = async (req, res) => {
  try {
    const produto = sanitizeFolderCQ(req.body?.produto, "sem_produto");
    const lote = sanitizeFolderCQ(req.body?.lote, "sem_lote");
    const fotoPath = req.file ? `/uploads/cq/${produto}/${lote}/${req.file.filename}` : null;
    const resultado = await serviceCQ.Inserir(req.body, fotoPath);

    return res.status(201).json({
      success: true,
      message: "Registro de CQ salvo com sucesso",
      id: resultado.id,
      data: resultado,
    });
  } catch (error) {
    console.error("Controller CQ: erro ao inserir:", error);

    if (error.message.includes("obrigatorios") || error.message.includes("invalido")) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({
      error: "Erro interno ao salvar registro de CQ",
      details: error.message,
    });
  }
};

const Listar = async (req, res) => {
  try {
    const filtros = {
      status: req.query.status,
      responsavel: req.query.responsavel,
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      hoje: req.query.hoje,
      limit: req.query.limit,
    };

    Object.keys(filtros).forEach((key) => {
      if (!filtros[key]) delete filtros[key];
    });

    const resultado = await serviceCQ.Listar(filtros);

    return res.status(200).json({
      success: true,
      total: resultado.total,
      filtros: resultado.filtros,
      data: resultado.data,
    });
  } catch (error) {
    console.error("Controller CQ: erro ao listar:", error);
    return res.status(500).json({
      error: "Erro interno ao listar registros de CQ",
      details: error.message,
    });
  }
};

const BuscarPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await serviceCQ.BuscarPorId(id);

    if (!resultado) {
      return res.status(404).json({ error: "Registro de CQ nao encontrado", id });
    }

    return res.status(200).json({ success: true, data: resultado });
  } catch (error) {
    console.error("Controller CQ: erro ao buscar:", error);
    return res.status(500).json({
      error: "Erro interno ao buscar registro de CQ",
      details: error.message,
    });
  }
};

const Deletar = async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await serviceCQ.Deletar(id);

    if (!resultado.success) {
      return res.status(404).json({ error: "Registro nao encontrado para deletar", id });
    }

    return res.status(200).json({ success: true, message: "Registro de CQ deletado com sucesso" });
  } catch (error) {
    console.error("Controller CQ: erro ao deletar:", error);
    return res.status(500).json({
      error: "Erro interno ao deletar registro de CQ",
      details: error.message,
    });
  }
};

const ResumoDia = async (req, res) => {
  try {
    const resultado = await serviceCQ.ResumoDia();
    return res.status(200).json({ success: true, data: resultado });
  } catch (error) {
    console.error("Controller CQ: erro ao buscar resumo:", error);
    return res.status(500).json({
      error: "Erro interno ao buscar resumo do dia",
      details: error.message,
    });
  }
};

export default { Inserir, Listar, BuscarPorId, Deletar, ResumoDia };
