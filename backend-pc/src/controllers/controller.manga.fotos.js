import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import repositoryMangaFotos from "../repositories/repository.manga.fotos.js";
import { FOTOS_ROOT } from "../config/storage.js";

const MANGA_FOTOS_ROOT = path.join(FOTOS_ROOT, "relatorioembarque", "maturacao_e_firmeza");

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
ensureDir(MANGA_FOTOS_ROOT);

const sanitize = (s, fallback) =>
  String(s || fallback).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fazenda  = sanitize(req.body?.fazenda,  "sem_fazenda");
    const variedade = sanitize(req.body?.variedade, "sem_variedade");
    const controle = sanitize(req.body?.controle,  "sem_controle");
    const campo    = sanitize(req.body?.campo,     "sem_campo");
    const dir = path.join(MANGA_FOTOS_ROOT, fazenda, variedade, controle, campo);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const campo = sanitize(req.body?.campo, "foto");
    const now   = new Date();
    const date  = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;
    const ext   = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${campo}_${date}${ext}`);
  },
});

export const uploadMangaFotos = multer({
  storage,
  fileFilter: (req, file, cb) => {
    cb(null, /^image\/(jpeg|png|jpg|webp)$/i.test(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
});

// POST /api/manga-fotos/upload
// body: fazenda, variedade, controle, campo
// files: fotos[]
const Upload = async (req, res) => {
  try {
    const files = req.files || [];
    const { fazenda, variedade, controle, campo } = req.body;

    if (!controle || !campo) {
      return res.status(400).json({ success: false, error: "controle e campo são obrigatórios" });
    }

    const faz = sanitize(fazenda, "sem_fazenda");
    const vari = sanitize(variedade, "sem_variedade");
    const ctrl = sanitize(controle, "sem_controle");
    const cmp  = sanitize(campo, "sem_campo");

    const inseridas = [];
    for (const file of files) {
      const url = `/api/manga-fotos/serve/${faz}/${vari}/${ctrl}/${cmp}/${encodeURIComponent(file.filename)}`;
      await repositoryMangaFotos.Inserir({ controle, campo, url, nome_arquivo: file.filename });
      inseridas.push({ url, nome_arquivo: file.filename });
    }

    return res.status(201).json({ success: true, total: inseridas.length, fotos: inseridas });
  } catch (error) {
    console.error("[MangaFotos] Erro ao fazer upload:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/manga-fotos?controle=526
// Retorna fotos agrupadas por campo para um controle
const BuscarPorControle = async (req, res) => {
  try {
    const { controle } = req.query;
    if (!controle) return res.status(400).json({ success: false, error: "controle é obrigatório" });

    const grouped = await repositoryMangaFotos.BuscarPorControle(controle);
    return res.json({ success: true, controle, fotos: grouped });
  } catch (error) {
    console.error("[MangaFotos] Erro ao buscar:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/manga-fotos/resumo?controles=526,527,701
// Retorna quantas fotos por campo para cada controle informado
const Resumo = async (req, res) => {
  try {
    const controlesStr = req.query.controles || "";
    const controles = controlesStr.split(",").map((c) => c.trim()).filter(Boolean);
    if (!controles.length) return res.json({ success: true, resumo: {} });

    const resumo = {};
    for (const controle of controles) {
      resumo[controle] = await repositoryMangaFotos.ResumoPorControle(controle);
    }
    return res.json({ success: true, resumo });
  } catch (error) {
    console.error("[MangaFotos] Erro ao buscar resumo:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/manga-fotos/serve/* (aceita qualquer profundidade de pasta)
const ServirFoto = (req, res) => {
  try {
    const filePath = req.params[0] || "";
    // Impede path traversal
    const segments = filePath.split("/").map(decodeURIComponent).filter((s) => s && s !== ".." && s !== ".");
    const absPath = path.join(MANGA_FOTOS_ROOT, ...segments);
    if (!absPath.startsWith(MANGA_FOTOS_ROOT)) return res.status(403).end();
    if (!fs.existsSync(absPath)) return res.status(404).end();
    return res.sendFile(absPath);
  } catch (error) {
    return res.status(500).end();
  }
};

export default { Upload, BuscarPorControle, Resumo, ServirFoto };
