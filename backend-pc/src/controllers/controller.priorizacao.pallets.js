import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import multer from "multer";
import axios from "axios";
import repositoryPriorizacao from "../repositories/repository.priorizacao.pallets.js";
import repoPriorizacao from "../repositories/repository.priorizacao.js";
import repoPalletsPriorizacao from "../repositories/repository.pallets.priorizacao.js";
import repoChecklistContainer from "../repositories/repository.checklist.container.js";
import { FOTOS_ROOT } from "../config/storage.js";

const PALLET_API_URL = "http://localhost:7777/pallet/";
const CONTROLE_TALHAO_API_URL = "http://localhost:7777/controletalhao/";
const PALLET_DADOS_API_URL = "http://10.107.114.11:3002/carregamentos/dados";

const FOTOS_CONTAINER_ROOT = path.join(FOTOS_ROOT, "relatorioembarque", "container");

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const sanitize = (value) =>
  String(value || "sem_nome")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .trim()
    .slice(0, 80) || "sem_nome";

const normalizarControle = (value) => {
  if (value === undefined || value === null || value === "") return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const digits = raw.match(/\d+/g);
  return digits ? digits.join("") : "";
};

const montarPastaControles = (rawValue) => {
  let parsed = [];
  if (Array.isArray(rawValue)) {
    parsed = rawValue;
  } else if (typeof rawValue === "string" && rawValue.trim()) {
    try {
      const asJson = JSON.parse(rawValue);
      parsed = Array.isArray(asJson) ? asJson : [];
    } catch (_) {
      parsed = rawValue.split(/[_,;\s]+/g);
    }
  }

  const vistos = new Set();
  const controles = parsed
    .map((item) => normalizarControle(item))
    .filter((item) => {
      if (!item || vistos.has(item)) return false;
      vistos.add(item);
      return true;
    });

  return controles.length ? controles.join("_") : "sem_controle";
};

const montarPastaPallets = (rawValue) => {
  let parsed = [];
  if (Array.isArray(rawValue)) {
    parsed = rawValue;
  } else if (typeof rawValue === "string" && rawValue.trim()) {
    try {
      const asJson = JSON.parse(rawValue);
      parsed = Array.isArray(asJson) ? asJson : [];
    } catch (_) {
      parsed = rawValue.split(/[_,;\s]+/g);
    }
  }

  const vistos = new Set();
  const pallets = parsed
    .map((item) => normalizarControle(item))
    .filter((item) => {
      if (!item || vistos.has(item)) return false;
      vistos.add(item);
      return true;
    });

  return pallets.length ? pallets.join("_") : "sem_pallet";
};

// Retorna a semana ISO do ano (1-53)
const getWeekNumber = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
};

// Multer — salva temporário, depois move em UploadFotos
const TEMP_DIR = path.join(FOTOS_CONTAINER_ROOT, "_temp");
const storagePR = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDir(TEMP_DIR);
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `prio_${stamp}_${randomUUID().slice(0, 8)}${ext}`);
  },
});

export const uploadFotosPR = multer({
  storage: storagePR,
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 50 },
});

// POST /api/priorizacao-pallets/upload-fotos
// body: apelido, plancarreg_codigo, campos_json (JSON array alinhado com files)
// files: fotos[]
const UploadFotos = (req, res) => {
  try {
    const files = req.files || [];
    const now = new Date();
    const ano = String(now.getFullYear());
    const week = String(getWeekNumber(now)).padStart(2, "0");
    const empresa = sanitize(req.body?.apelido || "sem_empresa");
    const ocFolder = sanitize(req.body?.oc || req.body?.plancarreg_codigo || "OC");

    // Mapeia qual campo pertence a cada arquivo (por índice)
    let camposOrdem = [];
    try {
      camposOrdem = JSON.parse(req.body?.campos_json || "[]");
    } catch (_) {
      camposOrdem = [];
    }

    const fotos = files.map((file, idx) => {
      const campo = sanitize(camposOrdem[idx] || "sem_campo");
      // APLICATIVO/relatorioembarque/container/{ano}/S{semana}/{empresa}/{oc}/{campo}/
      const destDir = path.join(
        FOTOS_CONTAINER_ROOT,
        ano,
        `S${week}`,
        empresa,
        ocFolder,
        campo,
      );
      ensureDir(destDir);
      const dest = path.join(destDir, file.filename);
      fs.renameSync(file.path, dest);
      return {
        nome: file.filename,
        campo,
        caminho: [
          "relatorioembarque",
          "container",
          ano,
          `S${week}`,
          empresa,
          ocFolder,
          campo,
          file.filename,
        ].join("/"),
        tamanho: file.size,
      };
    });

    console.log(
      `[Priorização] Upload ${files.length} foto(s) → container/${ano}/S${week}/${empresa}/${ocFolder}`,
    );
    return res.status(200).json({ success: true, total: fotos.length, fotos });
  } catch (error) {
    console.error("[Priorização] Erro ao salvar fotos:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/priorizacao-pallets/listar-fotos-container?apelido=Container_Kent_EUA
// Retorna { success, campos: { maturacao_variedade: ["/api/...url"], ... } }
const ListarFotosContainer = (req, res) => {
  try {
    const empresa = sanitize(req.query.apelido || "");
    if (!empresa || empresa === "sem_nome") return res.json({ success: true, campos: {} });

    const campos = {};

    const registrarCampoFoto = (campo, pathParts, fileName) => {
      if (!campos[campo]) campos[campo] = [];
      campos[campo].push(`/api/priorizacao-pallets/fotos/${pathParts.map((p) => encodeURIComponent(p)).join("/")}/${encodeURIComponent(fileName)}`);
    };

    const walkCampoDirs = (absDir, relParts = []) => {
      const itens = fs.readdirSync(absDir, { withFileTypes: true });
      for (const item of itens) {
        if (item.isDirectory()) {
          walkCampoDirs(path.join(absDir, item.name), [...relParts, item.name]);
          continue;
        }
        if (!/\.(jpg|jpeg|png|webp)$/i.test(item.name)) continue;
        const campo = relParts[relParts.length - 1] || "sem_campo";
        registrarCampoFoto(campo, relParts, item.name);
      }
    };

    if (!fs.existsSync(FOTOS_CONTAINER_ROOT)) return res.json({ success: true, campos: {} });

    const anos = fs.readdirSync(FOTOS_CONTAINER_ROOT).filter((a) => /^\d{4}$/.test(a));
    for (const ano of anos) {
      const anoDir = path.join(FOTOS_CONTAINER_ROOT, ano);
      const semanas = fs.readdirSync(anoDir).filter((s) => /^S\d+$/.test(s));
      for (const semana of semanas) {
        const empresaDir = path.join(anoDir, semana, empresa);
        if (!fs.existsSync(empresaDir)) continue;
        walkCampoDirs(empresaDir, [ano, semana, empresa]);
      }
    }

    return res.json({ success: true, campos });
  } catch (error) {
    console.error("[Priorização] Erro ao listar fotos container:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/priorizacao-pallets/fotos/*
const ServirFoto = (req, res) => {
  try {
    const relPath = req.params[0];
    if (!relPath) return res.status(400).end();
    const absPath = path.join(FOTOS_CONTAINER_ROOT, relPath);
    if (!absPath.startsWith(FOTOS_CONTAINER_ROOT)) return res.status(403).end();
    if (!fs.existsSync(absPath)) return res.status(404).end();
    return res.sendFile(absPath);
  } catch (error) {
    return res.status(500).end();
  }
};

// POST /api/priorizacao-pallets/salvar
const Salvar = async (req, res) => {
  try {
    const body = req.body;
    const result = await repositoryPriorizacao.Inserir({
      plancarreg_codigo: body.plancarreg_codigo,
      nro_container: body.nro_container,
      apelido: body.apelido,
      data_saida: body.data_saida,
      motorista: body.motorista,
      planpal_codigo: body.planpal_codigo,
      qtd_caixas: body.qtd_caixas,
      caixa_descricao: body.caixa_descricao,
      calibre: body.calibre,
      classe_prod: body.classe_prod,
      safra: body.safra,
      etiqueta: body.etiqueta,
      temperatura_1: body.temperatura_1,
      temperatura_2: body.temperatura_2,
      checklist_json: body.checklist_json ? JSON.stringify(body.checklist_json) : null,
      fotos_json: body.fotos_json ? JSON.stringify(body.fotos_json) : null,
    });
    return res.status(201).json({ success: true, id: result.lastID });
  } catch (error) {
    console.error("[Priorização] Erro ao salvar:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/priorizacao-pallets
const Listar = async (req, res) => {
  try {
    const rows = await repositoryPriorizacao.Listar();
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// GET /api/pallet-info?oc=102980&pallet=8847
// Busca informações detalhadas de um pallet na API interna (localhost:7777).
const pickFirstDefined = (source, keys) => {
  if (!source || typeof source !== "object") return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }
  return undefined;
};

const normalizarNumero = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const normalizarTexto = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const extrairCamposTalhao = (row) => {
  const fagr = normalizarNumero(pickFirstDefined(row, ["FAGR_IN_CODIGO", "fagr_in_codigo", "fagr_codigo"]));
  const compa = normalizarNumero(pickFirstDefined(row, ["COMPA_IN_NROCONTROLE", "compa_in_nrocontrole", "controle", "CONTROLE"]));
  return {
    fagr_in_codigo: fagr,
    compa_in_nrocontrole: compa,
  };
};

const montarPayloadControleTalhao = (row) => ({
  safra_st_codigo: pickFirstDefined(row, ["SAFRA_ST_CODIGO", "safra_st_codigo", "safra"]),
  fil_in_codigo: normalizarNumero(pickFirstDefined(row, ["FIL_IN_CODIGO", "fil_in_codigo"])),
  fagr_in_codigo: normalizarNumero(pickFirstDefined(row, ["FAGR_IN_CODIGO", "fagr_in_codigo", "fagr_codigo"])),
  talh_in_codigo: normalizarNumero(pickFirstDefined(row, ["TALH_IN_CODIGO", "talh_in_codigo", "talhao"])),
  compa_in_nrocontrole: normalizarNumero(pickFirstDefined(row, ["COMPA_IN_NROCONTROLE", "compa_in_nrocontrole", "controle", "CONTROLE"])),
});

const normalizarTalhaoRows = (raw) => {
  const list = Array.isArray(raw)
    ? raw
    : (Array.isArray(raw?.data) ? raw.data : (raw?.data ? [raw.data] : (raw ? [raw] : [])));

  return list.map((row) => ({
    fagr_in_codigo: normalizarNumero(pickFirstDefined(row, ["FAGR_IN_CODIGO", "fagr_in_codigo", "fagr_codigo"])),
    compa_in_nrocontrole: normalizarNumero(pickFirstDefined(row, ["COMPA_IN_NROCONTROLE", "compa_in_nrocontrole", "controle", "CONTROLE"])),
  }));
};

const buscarTalhaoPorControle = async ({ payloadTalhao, controleAlvo }) => {
  const controleNumero = normalizarNumero(controleAlvo);
  const tentativas = [
    payloadTalhao,
    { compa_in_nrocontrole: controleNumero ?? controleAlvo },
    {
      safra_st_codigo: payloadTalhao?.safra_st_codigo,
      compa_in_nrocontrole: controleNumero ?? controleAlvo,
    },
  ].filter((params) => params && Object.values(params).some((v) => v !== undefined && v !== null && v !== ""));

  for (const params of tentativas) {
    try {
      const talhaoRes = await axios.get(CONTROLE_TALHAO_API_URL, {
        params,
        timeout: 10000,
      });
      const talhaoRows = normalizarTalhaoRows(talhaoRes?.data);
      const matched = talhaoRows.find((item) => normalizarTexto(item.compa_in_nrocontrole) === normalizarTexto(controleAlvo))
        || talhaoRows[0]
        || null;

      if (matched) {
        return {
          matched,
          tentativa: params,
          total: talhaoRows.length,
        };
      }
    } catch (errorTalhao) {
      console.warn("[PalletInfo] Falha na consulta controletalhao", {
        params,
        message: errorTalhao?.message,
      });
    }
  }

  return {
    matched: null,
    tentativa: null,
    total: 0,
  };
};

const montarPalletInfo = async ({ oc, pallet }) => {
  let palletRows = [];

  try {
    const params = pallet ? { oc, pallet } : { oc };
    const { data } = await axios.get(PALLET_API_URL, {
      params,
      timeout: 10000,
    });
    palletRows = Array.isArray(data) ? data : [];
  } catch (errorPallet) {
    console.warn("[PalletInfo] API /pallet indisponível:", errorPallet.message);
    return [];
  }

  if (pallet) {
    const palletFiltro = normalizarTexto(pallet);
    palletRows = palletRows.filter((row) => normalizarTexto(row?.pallet) === palletFiltro);
  }

  try {

    const enrichedRows = await Promise.all(
      palletRows.map(async (row) => {
        const payloadTalhao = montarPayloadControleTalhao(row);
        const camposBase = extrairCamposTalhao(row);
        const controleAlvo = normalizarTexto(payloadTalhao.compa_in_nrocontrole);

        if (!controleAlvo) {
          return {
            ...row,
            ...camposBase,
          };
        }

        try {
          const talhaoLookup = await buscarTalhaoPorControle({ payloadTalhao, controleAlvo });
          const matched = talhaoLookup.matched;

          console.log("[PalletInfo] Match controletalhao", {
            controleAlvo,
            tentativa: talhaoLookup.tentativa,
            encontrou: !!matched,
            totalRegistros: talhaoLookup.total,
            fagr_in_codigo: matched?.fagr_in_codigo,
            compa_in_nrocontrole: matched?.compa_in_nrocontrole,
          });

          const fagr = matched?.fagr_in_codigo ?? camposBase.fagr_in_codigo;
          const compa = matched?.compa_in_nrocontrole ?? camposBase.compa_in_nrocontrole;

          return {
            ...row,
            fagr_in_codigo: fagr ?? null,
            compa_in_nrocontrole: compa ?? null,
          };
        } catch (errorTalhao) {
          console.warn("[PalletInfo] controletalhao indisponível para pallet:", row?.PLANPAL_IN_CODIGO || row?.pallet);
          return {
            ...row,
            fagr_in_codigo: camposBase.fagr_in_codigo ?? null,
            compa_in_nrocontrole: camposBase.compa_in_nrocontrole ?? null,
          };
        }
      }),
    );

    return enrichedRows;
  } catch (error) {
    console.error("[PalletInfo] Erro ao buscar pallet:", error.message);
    return [];
  }
};

const BuscarPalletInfo = async (req, res) => {
  const { oc, pallet } = req.query;
  if (!oc || !pallet) {
    return res.status(400).json({ success: false, error: "Parâmetros 'oc' e 'pallet' são obrigatórios." });
  }
  const data = await montarPalletInfo({ oc, pallet });
  return res.json({ success: true, data });
};

const BuscarPalletInfoLote = async (req, res) => {
  const { oc } = req.query;
  if (!oc) {
    return res.status(400).json({ success: false, error: "Parâmetro 'oc' é obrigatório." });
  }
  const data = await montarPalletInfo({ oc });
  return res.json({ success: true, data });
};

// GET /api/pallet-dados?pallet=8908
// Busca dados completos do pallet (carregamento + variedade + talhão + fazenda) na API unificada.
const BuscarPalletDados = async (req, res) => {
  const { pallet } = req.query;
  if (!pallet) {
    return res.status(400).json({ success: false, error: "Parâmetro 'pallet' é obrigatório." });
  }
  try {
    const { data } = await axios.get(PALLET_DADOS_API_URL, {
      params: { pallet },
      timeout: 15000,
    });
    return res.json({ success: true, data: Array.isArray(data) ? data : [] });
  } catch (error) {
    console.error("[PalletDados] Erro:", error.message);
    return res.status(502).json({ success: false, error: "Falha ao buscar dados do pallet." });
  }
};

// GET /api/priorizacao/buscar?oc=X
// Retorna a priorizacao salva (pallets + checklist) para pré-preencher o modal no app.
const BuscarPorOC = async (req, res) => {
  try {
    const { oc } = req.query;
    if (!oc) return res.status(400).json({ success: false, error: "Parâmetro 'oc' é obrigatório." });

    const priorizacao = await repoPriorizacao.BuscarPorOC(oc);
    if (!priorizacao) return res.json({ success: true, data: null });

    const pallets = await repoPalletsPriorizacao.ListarPorPriorizacao(priorizacao.id);
    const checklist = await repoChecklistContainer.BuscarPorPriorizacao(priorizacao.id);

    return res.json({ success: true, data: { priorizacao, pallets, checklist } });
  } catch (error) {
    console.error("[BuscarPorOC] Erro:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/priorizacao/salvar
// Salva (ou atualiza) o carregamento completo: priorizacao + checklist_container + pallets_priorizacao.
// Se já existir um registro com a mesma OC, apaga pallets e checklist antigos e regrava.
const SalvarCompleto = async (req, res) => {
  try {
    const body = req.body;
    const pallets = Array.isArray(body.pallets) ? body.pallets : [];
    const checklistArr = Array.isArray(body.checklist) ? body.checklist : [];

    // 1. Verificar se já existe priorizacao para esta OC
    const existente = await repoPriorizacao.BuscarPorOC(body.oc);
    let id_priorizacao;
    let modo;

    // 2. Converter checklist array → colunas
    const checklistObj = {};
    for (const item of checklistArr) {
      checklistObj[item.key] = item.value ?? null;
      if (item.temperatura !== undefined) {
        checklistObj[`${item.key}_temp`] = item.temperatura ?? null;
      }
    }

    let id_checklist;

    if (existente) {
      // ATUALIZAR: mantém o mesmo id_priorizacao, faz UPDATE no checklist e UPSERT por pallet
      modo = "update";
      id_priorizacao = existente.id;

      // Atualiza dados gerais da priorizacao
      await repoPriorizacao.Atualizar(id_priorizacao, {
        safra: body.safra ?? null,
        apelido: body.apelido ?? null,
        container: body.container ?? null,
        data_saida: body.data_saida ?? null,
        motorista: body.motorista ?? null,
      });

      // UPDATE no checklist existente (ou INSERT se não existir)
      const checklistExistente = await repoChecklistContainer.BuscarPorPriorizacao(id_priorizacao);
      if (checklistExistente) {
        await repoChecklistContainer.Atualizar(checklistExistente.id, checklistObj);
        id_checklist = checklistExistente.id;
      } else {
        const rCL = await repoChecklistContainer.Inserir({ id_priorizacao, oc: body.oc, ...checklistObj });
        id_checklist = rCL.lastID;
      }

      // UPSERT por pallet: atualiza se já existe (planpal + id_priorizacao), insere se novo
      for (const p of pallets) {
        const palletExistente = await repoPalletsPriorizacao.BuscarPorPlanpal(id_priorizacao, p.planpal);
        if (palletExistente) {
          await repoPalletsPriorizacao.AtualizarCampos(palletExistente.id, {
            etiqueta: p.etiqueta ?? null,
            temperatura_1: p.temperatura_1 ?? null,
            temperatura_2: p.temperatura_2 ?? null,
            controle: p.controle ?? null,
            variedade: p.variedade ?? null,
            fazenda: p.fazenda ?? null,
            qtd_caixas: p.qtd_caixas ?? 0,
            caixa_descricao: p.caixa_descricao ?? null,
            calibre: p.calibre ?? null,
            classe_prod: p.classe_prod ?? null,
            id_checklist,
          });
        } else {
          await repoPalletsPriorizacao.Inserir({
            id_priorizacao,
            safra: p.safra ?? body.safra ?? null,
            oc: body.oc,
            nro_container: body.container ?? null,
            apelido: body.apelido ?? null,
            data_saida: body.data_saida ?? null,
            motorista: body.motorista ?? null,
            planpal: p.planpal ?? null,
            qtd_caixas: p.qtd_caixas ?? 0,
            caixa_descricao: p.caixa_descricao ?? null,
            controle: p.controle ?? null,
            calibre: p.calibre ?? null,
            variedade: p.variedade ?? null,
            fazenda: p.fazenda ?? null,
            id_checklist,
            classe_prod: p.classe_prod ?? null,
            etiqueta: p.etiqueta ?? null,
            temperatura_1: p.temperatura_1 ?? null,
            temperatura_2: p.temperatura_2 ?? null,
            fotos_json: body.fotos_json ? JSON.stringify(body.fotos_json) : null,
          });
        }
      }
    } else {
      // INSERIR: tudo novo
      modo = "insert";
      const rPriorizacao = await repoPriorizacao.Inserir({
        oc: body.oc,
        safra: body.safra ?? null,
        apelido: body.apelido ?? null,
        container: body.container ?? null,
        data_saida: body.data_saida ?? null,
        motorista: body.motorista ?? null,
      });
      id_priorizacao = rPriorizacao.lastID;

      const rChecklist = await repoChecklistContainer.Inserir({ id_priorizacao, oc: body.oc, ...checklistObj });
      id_checklist = rChecklist.lastID;

      for (const p of pallets) {
        await repoPalletsPriorizacao.Inserir({
          id_priorizacao,
          safra: p.safra ?? body.safra ?? null,
          oc: body.oc,
          nro_container: body.container ?? null,
          apelido: body.apelido ?? null,
          data_saida: body.data_saida ?? null,
          motorista: body.motorista ?? null,
          planpal: p.planpal ?? null,
          qtd_caixas: p.qtd_caixas ?? 0,
          caixa_descricao: p.caixa_descricao ?? null,
          controle: p.controle ?? null,
          calibre: p.calibre ?? null,
          variedade: p.variedade ?? null,
          fazenda: p.fazenda ?? null,
          id_checklist,
          classe_prod: p.classe_prod ?? null,
          etiqueta: p.etiqueta ?? null,
          temperatura_1: p.temperatura_1 ?? null,
          temperatura_2: p.temperatura_2 ?? null,
          fotos_json: body.fotos_json ? JSON.stringify(body.fotos_json) : null,
        });
      }
    }

    console.log(`[SalvarCompleto] OC=${body.oc} modo=${modo} → priorizacao#${id_priorizacao}, checklist#${id_checklist}, ${pallets.length} pallets`);
    return res.status(201).json({ success: true, modo, id_priorizacao, id_checklist, total_pallets: pallets.length });
  } catch (error) {
    console.error("[SalvarCompleto] Erro:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export default { UploadFotos, ListarFotosContainer, ServirFoto, Salvar, Listar, BuscarPalletInfo, BuscarPalletInfoLote, BuscarPalletDados, SalvarCompleto, BuscarPorOC };
