import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import repositoryCQ from "../repositories/repository.cq.js";
import repositoryMF from "../repositories/repository.maturacao.forcada.js";
import { query } from "../database/sqlite.js";
import buildMaturacaoPdfReport from "../maturacaoPdfReport.js";
import { FOTOS_ROOT, BACKEND_ROOT as STORAGE_BACKEND_ROOT } from "../config/storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, "../../");
const PASTA_PDFS = path.join(__dirname, "../../uploads/relatorios");

const MF_LOCAL_ROOT = path.join(STORAGE_BACKEND_ROOT, "maturacaoforcada");
const MF_EXTERNO_ROOT = path.join(FOTOS_ROOT, "maturacaoforcada");

const mfSanitizeFolder = (value) =>
  String(value || "sem_nome").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").trim().slice(0, 60) || "sem_nome";

const mfGetWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2, "0");
};

const mfGetModulePaths = (fazenda, variedade, dataAnalise) => {
  const dt = dataAnalise ? new Date(String(dataAnalise).split("/").reverse().join("-")) : new Date();
  const date = isNaN(dt.getTime()) ? new Date() : dt;
  const semana = `S${mfGetWeekNumber(date)}`;
  const dia = String(date.getDate()).padStart(2, "0");
  const faz = mfSanitizeFolder(fazenda);
  const vari = mfSanitizeFolder(variedade);
  return {
    local: path.join(MF_LOCAL_ROOT, faz, vari, semana, dia),
    externo: path.join(MF_EXTERNO_ROOT, faz, vari, semana, dia),
  };
};

fs.mkdirSync(PASTA_PDFS, { recursive: true });

export async function gerarRelatorioPDF(dataStr) {
  const dataRelatorio = dataStr || new Date().toISOString().split("T")[0];
  const registros = await repositoryCQ.Listar({
    hoje: !dataStr ? "true" : undefined,
    dataInicio: dataStr,
    dataFim: dataStr,
  });

  const nomeArquivo = `relatorio_cq_${dataRelatorio}.pdf`;
  const caminhoArquivo = path.join(PASTA_PDFS, nomeArquivo);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const stream = fs.createWriteStream(caminhoArquivo);

    doc.pipe(stream);

    doc.rect(0, 0, doc.page.width, 80).fill("#1565C0");
    doc.fillColor("#ffffff")
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("RELATORIO DE CONTROLE DE QUALIDADE", 40, 20);
    doc.fontSize(12)
      .font("Helvetica")
      .text(
        `Data: ${new Date(dataRelatorio + "T12:00:00").toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}`,
        40,
        50
      );

    doc.moveDown(3);

    const aprovados = registros.filter((r) => r.status === "Aprovado").length;
    const reprovados = registros.filter((r) => r.status === "Reprovado").length;
    const emAnalise = registros.filter((r) => r.status === "Em AnÃ¡lise").length;

    doc.fillColor("#263238").fontSize(14).font("Helvetica-Bold").text("RESUMO DO DIA", 40, 100);
    doc.moveDown(0.3);

    const y = doc.y;
    const larguraCard = 120;
    const alturaCard = 50;
    const xInicio = 40;
    const gap = 15;

    desenharCard(doc, xInicio, y, larguraCard, alturaCard, "TOTAL", registros.length, "#546E7A");
    desenharCard(doc, xInicio + larguraCard + gap, y, larguraCard, alturaCard, "APROVADOS", aprovados, "#2E7D32");
    desenharCard(doc, xInicio + (larguraCard + gap) * 2, y, larguraCard, alturaCard, "REPROVADOS", reprovados, "#C62828");
    desenharCard(doc, xInicio + (larguraCard + gap) * 3, y, larguraCard, alturaCard, "EM ANALISE", emAnalise, "#E65100");

    doc.y = y + alturaCard + 20;

    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#E0E0E0").lineWidth(1).stroke();
    doc.moveDown(1);

    doc.fillColor("#263238").fontSize(14).font("Helvetica-Bold").text("REGISTROS", 40, doc.y);
    doc.moveDown(0.5);

    if (registros.length === 0) {
      doc.fillColor("#90A4AE").fontSize(12).font("Helvetica")
        .text("Nenhum registro encontrado para esta data.", { align: "center" });
    } else {
      registros.forEach((registro, index) => {
        if (doc.y > doc.page.height - 180) {
          doc.addPage();
          doc.y = 40;
        }

        const corStatus = registro.status === "Aprovado"
          ? "#2E7D32"
          : registro.status === "Reprovado"
            ? "#C62828"
            : "#E65100";

        const yItem = doc.y;

        if (index % 2 === 0) {
          doc.rect(40, yItem - 4, doc.page.width - 80, 80).fillColor("#F5F7FA").fill();
        }

        doc.rect(doc.page.width - 130, yItem, 90, 18).fillColor(corStatus).fill();
        doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold")
          .text(registro.status.toUpperCase(), doc.page.width - 128, yItem + 4, { width: 86, align: "center" });

        doc.fillColor("#78909C").fontSize(9).font("Helvetica").text(`#${String(index + 1).padStart(2, "0")}`, 40, yItem);
        doc.fillColor("#1565C0").fontSize(13).font("Helvetica-Bold").text(registro.produto, 60, yItem);
        doc.fillColor("#546E7A").fontSize(10).font("Helvetica").text(`Lote: ${registro.lote}`, 60, yItem + 17);

        const hora = new Date(registro.data_criacao).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        doc.fillColor("#263238").fontSize(10).font("Helvetica").text(`Responsavel: ${registro.responsavel}`, 60, yItem + 32);
        doc.fillColor("#78909C").fontSize(9).text(`Horario: ${hora}`, 60, yItem + 47);

        if (registro.observacoes) {
          doc.fillColor("#546E7A").fontSize(9)
            .text(`Obs: ${registro.observacoes}`, 60, yItem + 60, { width: doc.page.width - 200 });
        }

        doc.y = yItem + 88;
        doc.moveTo(40, doc.y - 4).lineTo(doc.page.width - 40, doc.y - 4).strokeColor("#ECEFF1").lineWidth(0.5).stroke();
      });
    }

    const yRodape = doc.page.height - 40;
    doc.moveTo(40, yRodape - 10).lineTo(doc.page.width - 40, yRodape - 10).strokeColor("#E0E0E0").lineWidth(1).stroke();
    doc.fillColor("#90A4AE").fontSize(9).font("Helvetica")
      .text(`Gerado automaticamente em ${new Date().toLocaleString("pt-BR")} - Sistema CQ`, 40, yRodape, {
        align: "center",
        width: doc.page.width - 80,
      });

    doc.end();

    stream.on("finish", () => {
      console.log("PDF gerado:", caminhoArquivo);
      resolve(caminhoArquivo);
    });
    stream.on("error", reject);
  });
}

export async function listarDatasMF() {
  const rows = await query(
    `SELECT DATE(created_at) as data, COUNT(*) as total
     FROM maturacao_forcada
     GROUP BY DATE(created_at)
     ORDER BY data DESC
     LIMIT 10`,
    [],
    "all"
  );
  return rows || [];
}

export async function listarRegistrosMFPorData(dataStr) {
  if (!dataStr) return [];

  const registros = await repositoryMF.Listar({
    dataInicio: dataStr,
    dataFim: `${dataStr} 23:59:59`,
    limit: 200,
  });

  return registros || [];
}

export async function gerarRelatorioMFPDF(dataStr) {
  const registros = await repositoryMF.Listar({ dataInicio: dataStr, dataFim: dataStr + " 23:59:59", limit: 200 });

  const nomeArquivo = `relatorio_mf_${dataStr}.pdf`;
  const caminhoArquivo = path.join(PASTA_PDFS, nomeArquivo);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const stream = fs.createWriteStream(caminhoArquivo);
    doc.pipe(stream);

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill("#E65100");
    doc.fillColor("#ffffff")
      .fontSize(18).font("Helvetica-Bold")
      .text("ANÃLISE DE MATURAÃ‡ÃƒO FORÃ‡ADA", 40, 18);
    doc.fontSize(11).font("Helvetica")
      .text(
        `Data: ${new Date(dataStr + "T12:00:00").toLocaleDateString("pt-BR", {
          weekday: "long", day: "2-digit", month: "long", year: "numeric",
        })}`,
        40, 48
      );
    doc.fillColor("#ffffff").fontSize(10)
      .text(`Total de registros: ${registros.length}`, 40, 63);

    doc.y = 100;

    if (registros.length === 0) {
      doc.fillColor("#90A4AE").fontSize(12).font("Helvetica")
        .text("Nenhum registro encontrado para esta data.", { align: "center" });
    } else {
      registros.forEach((r, index) => {
        if (doc.y > doc.page.height - 200) {
          doc.addPage();
          doc.y = 40;
        }

        const yItem = doc.y;

        // Fundo alternado
        if (index % 2 === 0) {
          doc.rect(40, yItem - 4, doc.page.width - 80, 120).fillColor("#FFF3E0").fill();
        }

        // NÃºmero e cabeÃ§alho do registro
        doc.fillColor("#E65100").fontSize(10).font("Helvetica-Bold")
          .text(`#${String(index + 1).padStart(2, "0")} â€” ${r.comprador || "-"} / ${r.produtor || "-"} / ${r.parcela || "-"}`, 44, yItem);

        doc.fillColor("#37474F").fontSize(9).font("Helvetica")
          .text(`Variedade: ${r.variedade || "-"}   |   ResponsÃ¡vel: ${r.responsavel || "-"}   |   Qtd frutos: ${r.quantidade_frutos ?? 0}`, 44, yItem + 14);

        // Defeitos
        const linha2y = yItem + 28;
        doc.fillColor("#546E7A").fontSize(9)
          .text(`TE: L${r.te_leve} M${r.te_moderado} S${r.te_severo}`, 44, linha2y)
          .text(`PC: L${r.pc_leve} M${r.pc_moderado} S${r.pc_severo}`, 160, linha2y)
          .text(`DF: L${r.df_leve} M${r.df_moderado} S${r.df_severo}`, 276, linha2y);

        const linha3y = yItem + 42;
        doc.fillColor("#546E7A").fontSize(9)
          .text(`Pedunc.: ${r.peduncular ?? 0}  Antrac.: ${r.antracnose ?? 0}  Colapso: ${r.colapso ?? 0}  Germin.: ${r.germinacao ?? 0}  Altern.: ${r.alternaria ?? 0}`, 44, linha3y);

        // Total e incidÃªncia em destaque
        const incCorBg = (r.incidencia ?? 0) > 10 ? "#C62828" : "#2E7D32";
        doc.rect(doc.page.width - 140, yItem, 100, 40).fillColor(incCorBg).fill();
        doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold")
          .text("INCIDÃŠNCIA", doc.page.width - 138, yItem + 4, { width: 96, align: "center" });
        doc.fontSize(16)
          .text(`${Number(r.incidencia ?? 0).toFixed(1)}%`, doc.page.width - 138, yItem + 17, { width: 96, align: "center" });

        doc.fillColor("#263238").fontSize(9).font("Helvetica")
          .text(`Total defeitos: ${r.total_defeito ?? 0}`, doc.page.width - 138, yItem + 58, { width: 96, align: "center" });

        if (r.observacoes) {
          doc.fillColor("#78909C").fontSize(8)
            .text(`Obs: ${r.observacoes}`, 44, yItem + 60, { width: doc.page.width - 220 });
        }

        doc.y = yItem + 128;
        doc.moveTo(40, doc.y - 6).lineTo(doc.page.width - 40, doc.y - 6)
          .strokeColor("#ECEFF1").lineWidth(0.5).stroke();
      });
    }

    // RodapÃ©
    const yRodape = doc.page.height - 40;
    doc.moveTo(40, yRodape - 10).lineTo(doc.page.width - 40, yRodape - 10)
      .strokeColor("#E0E0E0").lineWidth(1).stroke();
    doc.fillColor("#90A4AE").fontSize(9).font("Helvetica")
      .text(`Gerado em ${new Date().toLocaleString("pt-BR")} â€” Sistema AGRODAN`, 40, yRodape, {
        align: "center", width: doc.page.width - 80,
      });

    doc.end();
    stream.on("finish", () => {
      console.log("PDF MF gerado:", caminhoArquivo);
      resolve(caminhoArquivo);
    });
    stream.on("error", reject);
  });
}

const montarDadosMaturacaoDetalhada = (registro) => {
  const payload = registro?.payload_json && typeof registro.payload_json === "object"
    ? registro.payload_json
    : {};

  const avaliador =
    registro.usuario
    || payload.usuario
    || payload.avaliador
    || registro.responsavel
    || payload.responsavel
    || "";
  const avaliado =
    registro.produtor
    || payload.produtor
    || payload.fazenda
    || payload.fornecedor
    || "";

  const fotosSalvas = Array.isArray(payload.fotos_salvas) ? payload.fotos_salvas : [];
  const fotos = fotosSalvas
    .map((foto) => {
      if (foto?.caminho_relativo) {
        return path.join(BACKEND_ROOT, foto.caminho_relativo);
      }

      if (foto?.url && foto.url.includes("/maturacaoforcada/")) {
        const partes = foto.url.split("/maturacaoforcada/")[1];
        if (partes) {
          return path.join(BACKEND_ROOT, "maturacaoforcada", partes);
        }
      }

      return null;
    })
    .filter(Boolean);

  return {
    dataRec: registro.data_recebimento || payload.data_recebimento || registro.data_analise || payload.data_analise || "",
    dataAna: registro.data_analise || payload.data_analise || registro.data_recebimento || payload.data_recebimento || registro.created_at || new Date().toISOString(),
    fornecedor: registro.produtor || payload.produtor || payload.fornecedor || payload.fazenda || "",
    fazenda: registro.produtor || payload.produtor || payload.fazenda || "",
    responsavel: avaliador,
    usuario: avaliador,
    avaliado,
    comprador: registro.comprador || payload.comprador || "",
    parcela: registro.parcela || payload.parcela || "",
    variedade: registro.variedade || payload.variedade || "",
    obs: registro.observacoes || payload.observacoes || "",
    qtd: registro.quantidade_frutos ?? payload.quantidade_frutos ?? 0,
    te: [
      registro.te_leve ?? payload.te_leve ?? 0,
      registro.te_moderado ?? payload.te_moderado ?? 0,
      registro.te_severo ?? payload.te_severo ?? 0,
    ],
    pc: [
      registro.pc_leve ?? payload.pc_leve ?? 0,
      registro.pc_moderado ?? payload.pc_moderado ?? 0,
      registro.pc_severo ?? payload.pc_severo ?? 0,
    ],
    df: [
      registro.df_leve ?? payload.df_leve ?? 0,
      registro.df_moderado ?? payload.df_moderado ?? 0,
      registro.df_severo ?? payload.df_severo ?? 0,
    ],
    peduncular: [
      registro.peduncular ?? payload.peduncular ?? 0,
      0,
      0,
    ],
    antracnose: registro.antracnose ?? payload.antracnose ?? 0,
    colapso: registro.colapso ?? payload.colapso ?? 0,
    germinacao: registro.germinacao ?? payload.germinacao ?? 0,
    alternaria: registro.alternaria ?? payload.alternaria ?? 0,
    totalDefeito: registro.total_defeito ?? payload.total_defeito ?? 0,
    incidencia: Number(registro.incidencia ?? payload.incidencia ?? 0).toFixed(1),
    fotosCount: fotos.length || Number(registro.fotos_count ?? payload.fotos_count ?? 0),
    fotos,
  };
};

export async function gerarRelatorioMFPDFDetalhado(idOuFormId) {
  const registro = await repositoryMF.BuscarPorId(idOuFormId);
  if (!registro) {
    throw new Error("Registro de maturacao forcada nao encontrado");
  }

  const sanitize = (s) => String(s || "").replace(/[^\wÀ-ÿ\s-]/g, "").trim().replace(/\s+/g, "_");
  const sanitizeData = (s) => String(s || "").replace(/\//g, "-").replace(/[^\d\-]/g, "");
  const fazenda = sanitize(registro.produtor || registro.comprador || "sem_fazenda");
  const talhao = sanitize(registro.parcela || "sem_talhao");
  const dataAnalise = sanitizeData(registro.data_analise) || new Date().toISOString().slice(0, 10);
  const nomeArquivo = `Maturacao_Forcada-${fazenda}-${talhao}-${dataAnalise}.pdf`;
  const caminhoArquivo = path.join(PASTA_PDFS, nomeArquivo);
  const pdfConteudo = await buildMaturacaoPdfReport(montarDadosMaturacaoDetalhada(registro));

  fs.writeFileSync(caminhoArquivo, pdfConteudo, "binary");

  // Salva cópia do PDF na pasta do módulo (local e rede externa), junto com as fotos.
  const fazendaBruta = registro.produtor || registro.comprador || "sem_fazenda";
  const variedadeBruta = registro.variedade || "sem_variedade";
  const { local: localDir, externo: externoDir } = mfGetModulePaths(fazendaBruta, variedadeBruta, registro.data_analise);
  for (const dir of [localDir, externoDir]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(caminhoArquivo, path.join(dir, nomeArquivo));
    } catch (copyErr) {
      console.warn(`[MF PDF] Falha ao copiar PDF para ${dir}: ${copyErr.message}`);
    }
  }

  return caminhoArquivo;
}

const formatPtBrDate = (value) => {
  if (!value) return "-";
  if (typeof value === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
};

const asText = (value, fallback = "-") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text.length ? text : fallback;
};

const toNumberText = (value, fallback = "-") => {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(String(value).replace(",", "."));
  if (!Number.isFinite(num)) return asText(value, fallback);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

const ensureSpace = (doc, minHeight = 24, top = 44, bottom = 54) => {
  if (doc.y + minHeight > doc.page.height - bottom) {
    doc.addPage();
    doc.y = top;
    return true;
  }
  return false;
};

const wrapPdfLineByWidth = (doc, text, maxWidth, {
  font = "Helvetica",
  size = 10,
  maxLines = 2,
} = {}) => {
  const safe = asText(text, "-");
  const words = safe.split(/\s+/).filter(Boolean);
  if (!words.length) return ["-"];

  doc.font(font).fontSize(size);

  const lines = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (doc.widthOfString(candidate) <= maxWidth) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
      current = word;
      return;
    }

    // Palavra muito grande para a linha: mantÃ©m sem quebra feia
    lines.push(word);
    current = "";
  });

  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;

  const truncated = lines.slice(0, maxLines);
  let last = truncated[maxLines - 1];
  while (last.length > 0 && doc.widthOfString(`${last}...`) > maxWidth) {
    last = last.slice(0, -1);
  }
  truncated[maxLines - 1] = `${last || ""}...`;
  return truncated;
};

const drawHeaderArrowRow = (doc, {
  x,
  y,
  totalWidth,
  labelWidth,
  label,
  value,
  baseHeight = 30,
}) => {
  const tipWidth = 14;
  const labelBodyWidth = Math.max(60, labelWidth - tipWidth);
  const rightX = x + labelWidth;
  const rightWidth = totalWidth - labelWidth;
  const valuePaddingX = 12;
  const valuePaddingY = 8;
  const valueFontSize = 10;
  const valueLineHeight = 12;
  const valueMaxWidth = Math.max(10, rightWidth - (valuePaddingX * 2));
  const valueLines = wrapPdfLineByWidth(doc, value, valueMaxWidth, {
    font: "Helvetica-Bold",
    size: valueFontSize,
    maxLines: 2,
  });

  const contentHeight = valueLines.length * valueLineHeight;
  const rowHeight = Math.max(baseHeight, contentHeight + (valuePaddingY * 2));

  // Fundo do valor (direita)
  doc.rect(rightX, y, rightWidth, rowHeight).fill("#ECECEC");

  // Label em seta/trapÃ©zio (esquerda)
  doc.save();
  doc.moveTo(x, y)
    .lineTo(x + labelBodyWidth, y)
    .lineTo(x + labelWidth, y + (rowHeight / 2))
    .lineTo(x + labelBodyWidth, y + rowHeight)
    .lineTo(x, y + rowHeight)
    .closePath()
    .fill("#F28C00");
  doc.restore();

  // Texto da label
  const labelText = String(label || "").trim().toUpperCase();
  const labelFontSize = 9;
  const labelTextY = y + ((rowHeight - labelFontSize) / 2) - 1;
  doc.fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(labelFontSize)
    .text(labelText, x + 10, labelTextY, {
      width: Math.max(20, labelBodyWidth - 14),
      align: "left",
      lineBreak: false,
    });

  // Texto do valor (centralizado verticalmente)
  const valueTextY = y + ((rowHeight - contentHeight) / 2);
  doc.fillColor("#D86A00")
    .font("Helvetica-Bold")
    .fontSize(valueFontSize);
  valueLines.forEach((line, index) => {
    doc.text(line, rightX + valuePaddingX, valueTextY + (index * valueLineHeight), {
      width: valueMaxWidth,
      align: "left",
      lineBreak: false,
    });
  });

  return rowHeight;
};

const ANALISE_FRUTOS_QC_CHECKLIST_TEMPLATE = [
  { key: "interior_limpo", label: "1. Interior do container esta limpo (livre de odor, sem materiais estranhos, madeira, insetos, etc);" },
  { key: "sem_estragos_borrachas", label: "2. Container esta sem estragos (borrachas da porta estao em bom estado);" },
  { key: "drenagem_aberta", label: "3. Drenagem do container esta aberta;" },
  { key: "refrigeracao_operando", label: "4. Maquinario de refrigeracao esta operando corretamente;" },
  { key: "pre_resfriado", label: "5. Container esta pre-resfriado na temperatura correta;" },
  { key: "ventilacao_exposta", label: "6. Ventilacao do container exposta;", usaSimNao: true },
  { key: "ventilacao_40cbm", label: "7. Ventilacao a 40 CBM;" },
  { key: "identificacao_correta", label: "8. A identificacao/documentacao do container esta correta;" },
  { key: "sensores_funcionando", label: "9. Foi verificado se os sensores de temperatura estao funcionando corretamente;" },
  { key: "registradores_posicao", label: "10. Registradores portateis de temperatura foram colocados na posicao correta na carga;" },
  { key: "absorvedor_etileno", label: "11. Foi feito uso de absorvedor de etileno;", usaSimNao: true },
  { key: "saida_ventilacao_verificada", label: "12. A saida de ventilacao dos containers foi aberta e verificada (fazer registro fotografico);" },
  { key: "sanitizado_acido", label: "13. O container foi sanitizado com solucao a base de acido peracetico;" },
  { key: "qualidade_paletizacao", label: "14. Qualidade da paletizacao (fitas, estrado e alinhamento das caixas). Nao conformes;" },
  { key: "carga_temperatura_correta", label: "15. A carga esta na temperatura correta (temperatura media de polpa);" },
  { key: "lacre_colocado", label: "16. Lacre esta devidamente colocado na porta do container;" },
  { key: "temperatura_saida", label: "17. Temperatura de saida do container;" },
];

const ANALISE_FRUTOS_QC_FOTO_CAPTIONS = [
  "Caixa da variedade",
  "Pallet da variedade",
  "Peso da amostra",
  "Avaliacao interna da polpa",
  "Fruta inteira",
  "Fruta inteira",
  "Leitura de firmeza",
  "Coloracao da polpa",
];

const parseMaybeJsonObject = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const resolveAnaliseFrutosFotoPath = (foto) => {
  if (!foto) return null;

  const tryPath = (candidate) => {
    if (!candidate) return null;
    const cleaned = decodeURIComponent(String(candidate).replace(/^file:\/\//, "").trim());
    if (!cleaned) return null;

    if (path.isAbsolute(cleaned) && fs.existsSync(cleaned)) return cleaned;

    const absFromRoot = path.resolve(BACKEND_ROOT, cleaned);
    if (fs.existsSync(absFromRoot)) return absFromRoot;

    const absFromAnaliseDir = path.resolve(BACKEND_ROOT, "analise_frutos", cleaned);
    if (fs.existsSync(absFromAnaliseDir)) return absFromAnaliseDir;

    return null;
  };

  if (typeof foto === "string") {
    return tryPath(foto);
  }

  const byDisk = tryPath(foto.disk_path || foto.local_uri || foto.path || foto.uri || "");
  if (byDisk) return byDisk;

  const byRel = tryPath(foto.caminho_relativo || foto.relative_path || "");
  if (byRel) return byRel;

  const rawUrl = String(foto.url || "").trim();
  if (rawUrl) {
    const marker = "/api/analise-frutos/fotos/";
    const markerIndex = rawUrl.indexOf(marker);
    if (markerIndex >= 0) {
      const relFromUrl = rawUrl.slice(markerIndex + marker.length);
      const byUrl = tryPath(relFromUrl);
      if (byUrl) return byUrl;
    }
  }

  return null;
};

const collectAnaliseFrutosFotosForQc = (payload = {}) => {
  const ordered = [];
  const seen = new Set();
  const pushFoto = (foto) => {
    const resolved = resolveAnaliseFrutosFotoPath(foto);
    if (!resolved || seen.has(resolved)) return;
    seen.add(resolved);
    ordered.push(resolved);
  };

  const fotosSalvas = Array.isArray(payload.fotos_salvas) ? payload.fotos_salvas : [];
  fotosSalvas.forEach(pushFoto);

  const fotosProd = parseMaybeJsonObject(payload.fotos_producao, payload.fotos_producao) || {};
  ["firmeza", "maturacao", "danos_internos"].forEach((campo) => {
    const lista = Array.isArray(fotosProd?.[campo]) ? fotosProd[campo] : [];
    lista.forEach(pushFoto);
  });

  return ordered;
};

const buildAnaliseFrutosQcReportPayload = (payload = {}) => {
  const checklist = ANALISE_FRUTOS_QC_CHECKLIST_TEMPLATE.map((item) => ({
    key: item.key,
    label: item.label,
    value: "",
    usaSimNao: Boolean(item.usaSimNao),
  }));

  const fotoPaths = collectAnaliseFrutosFotosForQc(payload);

  const minimumSlots = 4;
  const totalSlots = Math.max(minimumSlots, fotoPaths.length || 0);
  const sections = [];
  const sectionSize = 4;

  for (let offset = 0; offset < totalSlots; offset += sectionSize) {
    const chunkItems = [];
    for (let i = 0; i < sectionSize; i += 1) {
      const slot = offset + i;
      if (slot >= totalSlots) break;

      const fotoIndex = slot + 1;
      const photoPath = fotoPaths[slot] || null;
      const caption = ANALISE_FRUTOS_QC_FOTO_CAPTIONS[slot] || `Foto ${fotoIndex}`;
      const label = `Foto ${fotoIndex} - ${caption}`;

      chunkItems.push({
        key: `foto_${fotoIndex}`,
        label,
        photos: photoPath ? [{ uri: photoPath }] : [],
        totalPhotos: photoPath ? 1 : 0,
      });
    }

    sections.push({
      key: `variedade_${Math.floor(offset / sectionSize) + 1}`,
      title: "VARIEDADES DE MANGA",
      items: chunkItems,
    });
  }

  return {
    generalInfo: {
      customer: asText(payload?.fazenda_talhao || payload?.fazenda, "-"),
      container: asText(payload?.controle, "-"),
      vessel: asText(payload?.variedade, "-"),
      loading: formatPtBrDate(payload?.data),
      etd: formatPtBrDate(payload?.data),
      eta: formatPtBrDate(payload?.data),
    },
    checklist,
    hidePalletData: true,
    sections,
  };
};

async function gerarRelatorioAnaliseFrutosPDFNovo(payload = {}, options = {}) {
  const now = new Date();
  const outputDir = options.outputDir || PASTA_PDFS;
  fs.mkdirSync(outputDir, { recursive: true });
  const nomeArquivo = options.fileName || `analise_frutos_${now.toISOString().replace(/[:.]/g, "-")}.pdf`;
  const caminhoArquivo = path.join(outputDir, nomeArquivo);

  const frutos = Array.isArray(payload.frutos) ? payload.frutos : [];
  const lotes = Array.isArray(payload.lotes) ? payload.lotes : [];
  const BASE_FRUTOS_ANALISE = 20;

  const normTipoAnalise = String(payload.tipo_analise || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const isShelfLife = /SHELF/.test(normTipoAnalise);
  const isPreColheita = /PRE/.test(normTipoAnalise) && /COLHEITA/.test(normTipoAnalise);
  const isProducao = /PRODUC/.test(normTipoAnalise);
  const isAcompanhamento = /ACOMPANHAMENTO/.test(normTipoAnalise);

  const qtdTotal = (isProducao || isAcompanhamento) ? (frutos.length || BASE_FRUTOS_ANALISE) : BASE_FRUTOS_ANALISE;

  const logoCandidates = [
    path.resolve(BACKEND_ROOT, "src/assets/logoagrodann.png"),
    path.resolve(BACKEND_ROOT, "src/assets/logoagrodan.png"),
    path.resolve(BACKEND_ROOT, "../CONTROLEQUALIDADE/src/assets/logoagrodann.png"),
    path.resolve(BACKEND_ROOT, "../CONTROLEQUALIDADE/src/assets/logoagrodan.png"),
    path.resolve(BACKEND_ROOT, "../CONTROLEQUALIDADE/assets/logoagrodan.png"),
  ];
  const logoPath = logoCandidates.find((c) => fs.existsSync(c)) || null;

  const fotosSalvasRaw = parseMaybeJsonObject(payload.fotos_salvas, payload.fotos_salvas);
  const fotosSalvas = Array.isArray(fotosSalvasRaw) ? fotosSalvasRaw : [];
  const fotoPaths = fotosSalvas
    .map((foto) => resolveAnaliseFrutosFotoPath(foto))
    .filter(Boolean);

  const normalizeCriterio = (value = "") => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  const metricConfigs = [
    { key: "penetrometria", label: "PENETROMETRIA", match: /PENETROM/ },
    { key: "brix", label: "BRIX", match: /BRIX/ },
    { key: "materiaSeca", label: "MATÉRIA SECA", match: /MATERIA\s*SECA|SECA/ },
  ];
  const metricStats = metricConfigs.reduce((acc, config) => {
    acc[config.key] = { sum: 0, count: 0 };
    return acc;
  }, {});
  const fruitMetricsMap = new Map();
  const ensureFruitMetrics = (numeroFruto) => {
    const number = Number.parseInt(numeroFruto, 10);
    if (!Number.isFinite(number) || number <= 0) return null;
    const existing = fruitMetricsMap.get(number);
    if (existing) return existing;
    const created = { numero_fruto: number, penetrometria: "-", brix: "-", materiaSeca: "-" };
    fruitMetricsMap.set(number, created);
    return created;
  };

  frutos.forEach((fruit) => {
    ensureFruitMetrics(fruit?.numero_fruto);
  });

  const maturacaoCountMap = new Map();
  let maturacaoTotal = 0;

  lotes.forEach((lote) => {
    const fruit = ensureFruitMetrics(lote?.numero_fruto);
    if (!fruit) return;
    const criterio = normalizeCriterio(lote?.criterio);

    if (/MATURA/.test(criterio) || /^EST$/.test(criterio)) {
      const rawValor = lote?.valor;
      const numVal = (rawValor === null || rawValor === undefined || rawValor === "")
        ? NaN
        : Number(String(rawValor).replace(",", "."));
      if (Number.isFinite(numVal)) {
        const key = numVal.toString().replace(".", ",");
        maturacaoCountMap.set(key, (maturacaoCountMap.get(key) || 0) + 1);
        maturacaoTotal += 1;
      }
      return;
    }

    const metric = metricConfigs.find((config) => config.match.test(criterio));
    if (!metric) return;
    const value = toNumberText(lote?.valor);
    fruit[metric.key] = value === "-" ? "-" : value;

    const rawValor = lote?.valor;
    const numericValue = (rawValor === null || rawValor === undefined || rawValor === "")
      ? NaN
      : Number(String(rawValor).replace(",", "."));
    if (Number.isFinite(numericValue)) {
      metricStats[metric.key].sum += numericValue;
      metricStats[metric.key].count += 1;
    }
  });

  const maturacaoDistRows = Array.from(maturacaoCountMap.entries())
    .sort((a, b) => {
      const na = Number(a[0].replace(",", "."));
      const nb = Number(b[0].replace(",", "."));
      return na - nb;
    })
    .map(([estagio, count]) => ({
      estagio,
      count,
      pct: maturacaoTotal > 0 ? ((count / maturacaoTotal) * 100).toFixed(1) : "0",
    }));

  if (!fruitMetricsMap.size) {
    for (let i = 1; i <= qtdTotal; i += 1) {
      ensureFruitMetrics(i);
    }
  }

  const avaliacaoRows = Array.from(fruitMetricsMap.values())
    .sort((a, b) => a.numero_fruto - b.numero_fruto);

  const toPositiveInt = (value) => {
    if (value === null || value === undefined || value === "") return 0;
    const normalized = typeof value === "string" ? value.replace(",", ".").trim() : value;
    const num = Number(normalized);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.max(0, Math.round(num));
  };

  const toTriple = (source, fallback = []) => {
    if (Array.isArray(source)) {
      return [
        toPositiveInt(source[0]),
        toPositiveInt(source[1]),
        toPositiveInt(source[2]),
      ];
    }

    if (source && typeof source === "object") {
      return [
        toPositiveInt(source.leve ?? source.level1 ?? source[0]),
        toPositiveInt(source.moderado ?? source.moderate ?? source[1]),
        toPositiveInt(source.severo ?? source.severe ?? source[2]),
      ];
    }

    return [
      toPositiveInt(fallback[0]),
      toPositiveInt(fallback[1]),
      toPositiveInt(fallback[2]),
    ];
  };

  const normalizeDamageText = (value = "") => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const toDamageLabel = (value = "") => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const normalized = normalizeDamageText(raw).toUpperCase();
    if (!normalized) return "";

    const aliases = [
      { label: "Tecido Esponjoso", match: /TECIDO|ESPONJOSO|\bTE\b/ },
      { label: "Podridao de Caroco - Leve", match: /CAROCO.*LEVE|PC.*LEVE/ },
      { label: "Podridao de Caroco - Moderado", match: /CAROCO.*MODER|PC.*MODER/ },
      { label: "Podridao de Caroco - Severo", match: /CAROCO.*SEVER|PC.*SEVER/ },
      { label: "Disturbio Fisiologico - Leve", match: /DISTURBIO|DF.*LEVE|FISIOLOG.*LEVE/ },
      { label: "Disturbio Fisiologico - Moderado", match: /DF.*MODER|FISIOLOG.*MODER/ },
      { label: "Disturbio Fisiologico - Severo", match: /DF.*SEVER|FISIOLOG.*SEVER/ },
      { label: "Podridao Peduncular - Leve", match: /PEDUNC.*LEVE/ },
      { label: "Podridao Peduncular - Moderado", match: /PEDUNC.*MODER/ },
      { label: "Podridao Peduncular - Severo", match: /PEDUNC.*SEVER/ },
      { label: "Antracnose", match: /ANTRACN/ },
      { label: "Colapso", match: /COLAP/ },
      { label: "Germinacao", match: /GERMIN/ },
      { label: "Alternaria", match: /ALTERN/ },
    ];
    const alias = aliases.find((item) => item.match.test(normalized));
    if (alias) return alias.label;

    return raw
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map((chunk) => chunk ? `${chunk[0].toUpperCase()}${chunk.slice(1).toLowerCase()}` : chunk)
      .join(" ");
  };

  const damageRowsMap = new Map();
  const frutosComDano = new Set();
  const ignoredDamageValues = new Set([
    "",
    "-",
    "NA",
    "N/A",
    "NAO",
    "SEM DANO",
    "SEM DANOS",
    "SEM DANO INTERNO",
    "SEM DANOS INTERNOS",
    "OK",
  ]);

  const addDamageCount = (label, count = 1, numeroFruto = null) => {
    const cleanLabel = toDamageLabel(label);
    const qty = toPositiveInt(count);
    if (!cleanLabel || qty <= 0) return;

    const current = damageRowsMap.get(cleanLabel) || { label: cleanLabel, count: 0 };
    current.count += qty;
    damageRowsMap.set(cleanLabel, current);

    const fruitNumber = Number.parseInt(numeroFruto, 10);
    if (Number.isFinite(fruitNumber) && fruitNumber > 0) {
      frutosComDano.add(fruitNumber);
    }
  };

  const registerDamageToken = (token, numeroFruto = null) => {
    if (token === null || token === undefined) return;
    if (typeof token === "number") {
      addDamageCount("Dano Interno", token, numeroFruto);
      return;
    }

    const raw = String(token || "").trim();
    if (!raw) return;

    const normalized = normalizeDamageText(raw).toUpperCase();
    if (!normalized || ignoredDamageValues.has(normalized) || /SEM\s+DANOS?/.test(normalized)) {
      return;
    }

    const pairMatch = raw.match(/^(.+?)\s*[:=]\s*(\d+(?:[.,]\d+)?)$/);
    if (pairMatch) {
      addDamageCount(pairMatch[1], pairMatch[2], numeroFruto);
      return;
    }

    addDamageCount(raw, 1, numeroFruto);
  };

  const collectDamageFromValue = (value, numeroFruto = null) => {
    if (value === null || value === undefined || value === "") return;

    if (Array.isArray(value)) {
      value.forEach((item) => collectDamageFromValue(item, numeroFruto));
      return;
    }

    if (typeof value === "object") {
      const textCandidate = value?.label
        ?? value?.nome
        ?? value?.descricao
        ?? value?.descricao_dano
        ?? value?.tipo
        ?? value?.dano;

      if (textCandidate) {
        collectDamageFromValue(textCandidate, numeroFruto);
        return;
      }

      Object.values(value).forEach((item) => collectDamageFromValue(item, numeroFruto));
      return;
    }

    if (typeof value === "string") {
      value.split(/[;,|/]/).forEach((part) => registerDamageToken(part, numeroFruto));
      return;
    }

    registerDamageToken(value, numeroFruto);
  };

  const teValues = toTriple(payload.te, [payload.te_leve, payload.te_moderado, payload.te_severo]);
  const pcValues = toTriple(payload.pc, [payload.pc_leve, payload.pc_moderado, payload.pc_severo]);
  const dfValues = toTriple(payload.df, [payload.df_leve, payload.df_moderado, payload.df_severo]);
  const peduncularValues = toTriple(payload.peduncular, [payload.peduncular_leve ?? payload.peduncular, payload.peduncular_moderado, payload.peduncular_severo]);

  if (!isProducao && !isAcompanhamento) {
    addDamageCount("Tecido Esponjoso", teValues[0] + teValues[1] + teValues[2]);
    addDamageCount("Podridao de Caroco - Leve", pcValues[0]);
    addDamageCount("Podridao de Caroco - Moderado", pcValues[1]);
    addDamageCount("Podridao de Caroco - Severo", pcValues[2]);
    addDamageCount("Disturbio Fisiologico - Leve", dfValues[0]);
    addDamageCount("Disturbio Fisiologico - Moderado", dfValues[1]);
    addDamageCount("Disturbio Fisiologico - Severo", dfValues[2]);
    addDamageCount("Podridao Peduncular - Leve", peduncularValues[0]);
    addDamageCount("Podridao Peduncular - Moderado", peduncularValues[1]);
    addDamageCount("Podridao Peduncular - Severo", peduncularValues[2]);
    addDamageCount("Antracnose", payload.antracnose);
    addDamageCount("Colapso", payload.colapso);
    addDamageCount("Germinacao", payload.germinacao);
    addDamageCount("Alternaria", payload.alternaria);
  }

  const dynamicDamageFields = [
    "danos_internos",
    "danosInternos",
    "danos",
    "defeito",
    "defeitos",
    "avaliacao_danos_internos",
    "avaliacaoDanosInternos",
  ];

  if (!isProducao && !isAcompanhamento) {
    dynamicDamageFields.forEach((field) => {
      collectDamageFromValue(payload?.[field], null);
    });

    frutos.forEach((fruit) => {
      const numeroFruto = fruit?.numero_fruto;
      dynamicDamageFields.forEach((field) => {
        collectDamageFromValue(fruit?.[field], numeroFruto);
      });
    });
  }

  lotes.forEach((lote) => {
    const numeroFruto = lote?.numero_fruto;
    dynamicDamageFields.forEach((field) => {
      collectDamageFromValue(lote?.[field], numeroFruto);
    });
  });

  const danosInternosRows = Array.from(damageRowsMap.values())
    .filter((item) => item.count > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));

  if (!danosInternosRows.length) {
    danosInternosRows.push({ label: "Sem diagnóstico informado", count: 0, placeholder: true });
  }

  const totalDefeitoPayload = toPositiveInt(payload.total_defeito ?? payload.totalDefeito);
  const totalDefeitoCalculado = danosInternosRows.reduce((sum, row) => sum + (row.placeholder ? 0 : row.count), 0);
  const totalFrutosComDano = totalDefeitoPayload > 0
    ? totalDefeitoPayload
    : (frutosComDano.size > 0 ? frutosComDano.size : totalDefeitoCalculado);
  const incidenciaDanosInternos = qtdTotal > 0
    ? `${((totalFrutosComDano / qtdTotal) * 100).toFixed(1)}%`
    : "-";

  const formatMetricDecimal = (value) => Number(value || 0).toFixed(1).replace(".", ",");
  const shelfLifeMetricRowsBase = metricConfigs.map((config) => {
    const stat = metricStats[config.key] || { sum: 0, count: 0 };
    if (!stat.count) {
      return {
        label: config.label,
        media: null,
      };
    }
    return {
      label: config.label,
      media: stat.sum / stat.count,
    };
  });
  const totalMedias = shelfLifeMetricRowsBase.reduce((sum, row) => sum + (row.media ?? 0), 0);
  const shelfLifeMetricRows = shelfLifeMetricRowsBase.map((row) => {
    const percentual = row.media !== null && totalMedias > 0
      ? ((row.media / totalMedias) * 100)
      : 0;
    return {
      ...row,
      mediaText: row.media !== null ? formatMetricDecimal(row.media) : "-",
      percentual,
      percentualText: row.media !== null ? `${percentual.toFixed(1)}%` : "-",
    };
  });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: "A4", bufferPages: true });
    const stream = fs.createWriteStream(caminhoArquivo);
    doc.pipe(stream);

    const PM = 36;
    const CW = doc.page.width - (PM * 2);
    const BOT = doc.page.height - 44;

    const GREEN = "#0B8A43";
    const GREEN_DARK = "#0A6B36";
    const ORANGE = "#D9963F";
    const BG = "#FFFFFF";
    const SOFT_BG = "#EFEFED";
    const BORDER = "#D0D0D0";
    const TEXT = "#111111";
    const TEXT_SOFT = "#4B4B4B";

    const dataAnalise = formatPtBrDate(payload.data);
    const dataInicial = formatPtBrDate(payload.inicial || payload.data_inicial || payload.data_inicio || payload.data);
    const dataFim = formatPtBrDate(payload.fim || payload.data_final || payload.data_fim || payload.data);
    const avaliador = asText(payload.avaliador, "-");
    const avaliado = asText(
      payload.fazenda_talhao || payload.fazenda || payload.produtor || payload.avaliado,
      "-",
    );

    const drawBackground = () => {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(BG);
    };

    const drawSectionHead = (y, number, title) => {
      const boxW = 28;
      const boxH = 20;
      y += 4;
      doc.moveTo(PM, y - 2).lineTo(PM + CW, y - 2).strokeColor("#E2EAE4").lineWidth(0.6).stroke();
      doc.rect(PM, y, boxW, boxH).fill(GREEN);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(12)
        .text(String(number), PM, y + 4, { width: boxW, align: "center", lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(14)
        .text(String(title || "").toUpperCase(), PM + boxW + 8, y + 3, { width: CW - boxW - 10, lineBreak: false });
      return y + boxH + 8;
    };

    const drawHeader = ({ showInfoBox = true } = {}) => {
      drawBackground();

      if (!showInfoBox) {
        return 44;
      }

      const headerY = 30;
      const logoW = 130;
      const logoH = 36;
      const titleX = PM + logoW + 12;
      const titleW = CW - logoW - 12;

      doc.rect(PM - 8, headerY + 2, 2.2, 38).fill(GREEN);

      if (logoPath) {
        try {
          doc.image(logoPath, PM, headerY, { fit: [logoW, logoH], align: "left", valign: "center" });
        } catch {
          doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(30)
            .text("AGRODAN", PM, headerY + 4, { width: logoW, lineBreak: false });
        }
      } else {
        doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(30)
          .text("AGRODAN", PM, headerY + 4, { width: logoW, lineBreak: false });
      }

      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(16)
        .text("ANALISE DE FRUTOS", titleX, headerY + 6, { width: titleW, lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(11)
        .text("CONTROLE DE QUALIDADE", titleX, headerY + 25, { width: titleW, lineBreak: false });

      doc.moveTo(PM, headerY + 58).lineTo(PM + CW, headerY + 58).strokeColor("#D8E7DC").lineWidth(0.8).stroke();

      let y = headerY + 54;
      if (!showInfoBox) return y;

      const infoY = y;
      const boxH = 58;
      const labelColor = "#268D5F";
      const leftLabelX = PM + 10;
      const leftValueX = PM + 78;
      const rightLabelX = PM + (CW * 0.51);
      const rightValueX = rightLabelX + 50;
      const row1Y = infoY + 10;
      const row2Y = infoY + 34;

      doc.moveTo(PM, infoY - 10).lineTo(PM + CW, infoY - 10).strokeColor("#A8D4BA").lineWidth(0.8).stroke();
      doc.rect(PM, infoY, CW, boxH).fillAndStroke("#FBFCFB", "#E9EEEA");

      doc.fillColor(labelColor).font("Helvetica-Bold").fontSize(10.8)
        .text("Avaliador:", leftLabelX, row1Y, { width: 64, lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica").fontSize(10.8)
        .text(avaliador, leftValueX, row1Y, { width: rightLabelX - leftValueX - 10, lineBreak: false });

      doc.fillColor(labelColor).font("Helvetica-Bold").fontSize(10.8)
        .text("Inicial:", rightLabelX, row1Y, { width: 48, lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica").fontSize(10.8)
        .text(dataInicial, rightValueX, row1Y, { width: CW - (rightValueX - PM) - 12, lineBreak: false });

      doc.fillColor(labelColor).font("Helvetica-Bold").fontSize(10.8)
        .text("Avaliado:", leftLabelX, row2Y, { width: 64, lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica").fontSize(10.8)
        .text(avaliado, leftValueX, row2Y, { width: rightLabelX - leftValueX - 10, lineBreak: false });

      doc.fillColor(labelColor).font("Helvetica-Bold").fontSize(10.8)
        .text("Fim:", rightLabelX, row2Y, { width: 48, lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica").fontSize(10.8)
        .text(dataFim, rightValueX, row2Y, { width: CW - (rightValueX - PM) - 12, lineBreak: false });

      doc.moveTo(PM + 8, infoY + 24).lineTo(PM + CW - 8, infoY + 24).strokeColor("#EDF1EE").lineWidth(0.8).stroke();

      y = infoY + boxH + 10;
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(18)
        .text("RESULTADOS", PM, y, { width: CW, align: "center", lineBreak: false });
      return y + 28;
    };

    const drawDataRow = (y, label, value, rowIndex) => {
      const rowH = 20;
      doc.rect(PM, y, CW, rowH).fill("#FFFFFF");
      doc.moveTo(PM, y).lineTo(PM + CW, y).strokeColor("#E0E0E0").lineWidth(0.5).stroke();
      doc.moveTo(PM, y + rowH).lineTo(PM + CW, y + rowH).strokeColor("#D8D8D8").lineWidth(0.7).stroke();
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(10)
        .text(label, PM + 6, y + 4, { width: CW * 0.62, lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica").fontSize(10)
        .text(asText(value, "-"), PM + (CW * 0.64), y + 4, { width: CW * 0.34, align: "left", lineBreak: false });
      return y + rowH;
    };

    const drawCalculationLogicBox = (y) => {
      const boxH = 38;
      doc.rect(PM, y, CW, boxH).fillAndStroke("#FFFFFF", "#D8D8D8");
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(9.7)
        .text("LOGICA DO CALCULO", PM + 10, y + 7, { width: CW - 20, lineBreak: false });
      doc.fillColor(TEXT_SOFT).font("Helvetica").fontSize(8.8)
        .text("Base fixa: 20 frutos. Percentual = (QTD / 20) x 100. Cada fruto vale 5,0%.", PM + 10, y + 20, { width: CW - 20, lineBreak: false });
      return y + boxH + 10;
    };

    const drawAvaliacaoHeader = (y) => {
      const h = 26;
      const colFruto = 70;
      const colMetric = (CW - colFruto) / 3;

      doc.rect(PM, y, CW, h).fillAndStroke("#ECECEA", BORDER);
      doc.moveTo(PM + colFruto, y).lineTo(PM + colFruto, y + h).strokeColor(BORDER).lineWidth(0.7).stroke();
      doc.moveTo(PM + colFruto + colMetric, y).lineTo(PM + colFruto + colMetric, y + h).strokeColor(BORDER).lineWidth(0.7).stroke();
      doc.moveTo(PM + colFruto + (colMetric * 2), y).lineTo(PM + colFruto + (colMetric * 2), y + h).strokeColor(BORDER).lineWidth(0.7).stroke();

      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(10.5)
        .text("FRUTO", PM + 8, y + 8, { width: colFruto - 16, align: "center", lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(10.5)
        .text("PENETROMETRIA", PM + colFruto + 8, y + 8, { width: colMetric - 16, align: "center", lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(10.5)
        .text("BRIX", PM + colFruto + colMetric + 8, y + 8, { width: colMetric - 16, align: "center", lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(10.5)
        .text("MATÉRIA SECA", PM + colFruto + (colMetric * 2) + 8, y + 8, { width: colMetric - 16, align: "center", lineBreak: false });

      return y + h;
    };

    const drawAvaliacaoRow = (y, row, rowIndex = 0) => {
      const h = 24;
      const colFruto = 70;
      const colMetric = (CW - colFruto) / 3;

      doc.rect(PM, y, CW, h).fillAndStroke("#FFFFFF", BORDER);
      doc.moveTo(PM + colFruto, y).lineTo(PM + colFruto, y + h).strokeColor(BORDER).lineWidth(0.7).stroke();
      doc.moveTo(PM + colFruto + colMetric, y).lineTo(PM + colFruto + colMetric, y + h).strokeColor(BORDER).lineWidth(0.7).stroke();
      doc.moveTo(PM + colFruto + (colMetric * 2), y).lineTo(PM + colFruto + (colMetric * 2), y + h).strokeColor(BORDER).lineWidth(0.7).stroke();

      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(10.2)
        .text(String(row.numero_fruto), PM + 6, y + 7, { width: colFruto - 12, align: "center", lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica").fontSize(10)
        .text(asText(row.penetrometria, "-"), PM + colFruto + 8, y + 7, { width: colMetric - 16, align: "center", lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica").fontSize(10)
        .text(asText(row.brix, "-"), PM + colFruto + colMetric + 8, y + 7, { width: colMetric - 16, align: "center", lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica").fontSize(10)
        .text(asText(row.materiaSeca, "-"), PM + colFruto + (colMetric * 2) + 8, y + 7, { width: colMetric - 16, align: "center", lineBreak: false });

      return y + h;
    };

    const danosLabelW = Math.floor(CW * 0.70);
    const danosQtdW = Math.floor(CW * 0.14);
    const danosPctW = CW - danosLabelW - danosQtdW;
    const formatIncidencia = (count) => {
      const qty = toPositiveInt(count);
      if (qtdTotal <= 0 || qty <= 0) return "-";
      return `${((qty / qtdTotal) * 100).toFixed(1)}%`;
    };

    const drawDanosHeader = (y, { x = PM, w = CW } = {}) => {
      const h = 24;
      const dlw = Math.floor(w * 0.70);
      const dqw = Math.floor(w * 0.14);
      const dpw = w - dlw - dqw;
      doc.rect(x, y, w, h).fillAndStroke("#ECECEA", BORDER);
      doc.moveTo(x + dlw, y).lineTo(x + dlw, y + h).strokeColor(BORDER).lineWidth(0.7).stroke();
      doc.moveTo(x + dlw + dqw, y).lineTo(x + dlw + dqw, y + h).strokeColor(BORDER).lineWidth(0.7).stroke();

      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(10.3)
        .text("DANO INTERNO", x + 8, y + 7, { width: dlw - 16, lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(10.3)
        .text("QTD", x + dlw, y + 7, { width: dqw, align: "center", lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(10.3)
        .text("INCID.%", x + dlw + dqw, y + 7, { width: dpw, align: "center", lineBreak: false });

      return y + h;
    };

    const getDanosTableHeight = (rowsCount = 0, includeTotalRow = true) => {
      const headerH = 24;
      const rowH = 24;
      return headerH + (Math.max(0, rowsCount) * rowH) + (includeTotalRow ? rowH : 0);
    };

    const shelfLabelW = Math.floor(CW * 0.75);
    const shelfMediaW = CW - shelfLabelW;

    const normalizeChartLabel = (s) => {
      if (!s) return s;
      const known = {
        'MATERIA SECA': 'Matéria Seca', 'MATÉRIA SECA': 'Matéria Seca',
        'PENETROMETRIA': 'Penetrometria', 'BRIX': 'Brix',
        'DIAGNOSTICO': 'Diagnóstico', 'DANO INTERNO': 'Dano Interno',
        'FRUTOS COM DANOS INTERNOS': 'Frutos com Danos',
      };
      const upper = String(s).toUpperCase();
      if (known[upper]) return known[upper];
      if (s === s.toUpperCase() && /^[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ\s]+$/.test(s)) {
        return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      }
      return s;
    };

    const SHELF_METRIC_TITLE_H = 28;
    const SHELF_METRIC_HEADER_H = 22;
    const SHELF_METRIC_ROW_H = 24;

    const getShelfMetricTableHeight = (rowsCount = 0) => {
      return SHELF_METRIC_TITLE_H + SHELF_METRIC_HEADER_H + (Math.max(0, rowsCount) * SHELF_METRIC_ROW_H);
    };

    const drawShelfMetricTitleRow = (y, title, { x = PM, w = CW } = {}) => {
      const h = SHELF_METRIC_TITLE_H;
      doc.rect(x, y, w, h).fillAndStroke("#F1F3F0", "#D9DFD8");
      doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(12)
        .text(title, x + 10, y + 8, { width: w - 20, lineBreak: false });
      return y + h;
    };

    const getShelfLifeChartHeight = (rows = [], chartTitle = "DISTRIBUIÇÃO DE DANOS INTERNOS (%)", chartFooter = "Percentual dos danos internos") => {
      const hasTitleRow = chartTitle && chartTitle.trim().length > 0;
      const titleH = hasTitleRow ? 28 : 0;
      const headerH = 22;
      const barRowH = SHELF_METRIC_ROW_H;
      const barGap = 0;
      const axisSpace = 34;
      const footerSpace = chartFooter && chartFooter.trim().length > 0 ? 14 : 6;
      const validRows = rows.filter((row) => row.media !== null);
      const rowsCount = Math.max(1, validRows.length);
      return titleH + headerH + (rowsCount * barRowH) + ((rowsCount - 1) * barGap) + axisSpace + footerSpace;
    };

    const drawShelfMetricBackdrop = (y, h, { x = PM, w = CW } = {}) => {
      doc.rect(x, y, w, h).fillAndStroke("#FFFFFF", "#E0E0E0");
    };

    const drawShelfMetricHeader = (y, { x = PM, w = CW, showPercent = true } = {}) => {
      const h = SHELF_METRIC_HEADER_H;
      const smw = Math.max(46, Math.floor(w * 0.14));
      const slw = w - smw;

      doc.rect(x, y, w, h).fillAndStroke("#F7F8F6", "#E5E9E4");
      doc.moveTo(x + slw, y).lineTo(x + slw, y + h).strokeColor("#E5E9E4").lineWidth(0.55).stroke();

      doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(9.4)
        .text("Item", x + 8, y + 6, { width: slw - 16, lineBreak: false });
      if (showPercent) {
        doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(9.4)
          .text("%", x + slw, y + 6, { width: smw - 8, align: "right", lineBreak: false });
      }
      return y + h;
    };

    const drawShelfMetricRow = (y, row, rowIndex = 0, rowNumber = null, { x = PM, w = CW } = {}) => {
      const h = SHELF_METRIC_ROW_H;
      const smw = Math.max(46, Math.floor(w * 0.14));
      const slw = w - smw;
      const fill = rowIndex % 2 === 0 ? "#FFFFFF" : "#FAFAFA";
      const labelPrefix = rowNumber ? `${rowNumber} - ` : "";

      doc.rect(x, y, w, h).fillAndStroke(fill, "#EDEDED");
      doc.moveTo(x + slw, y).lineTo(x + slw, y + h).strokeColor("#EDEDED").lineWidth(0.45).stroke();
      doc.fillColor(TEXT).font("Helvetica").fontSize(9.8)
        .text(`${labelPrefix}${normalizeChartLabel(asText(row?.label, "-"))}`, x + 10, y + 7, { width: slw - 18, lineBreak: false });
      doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(10)
        .text(asText(row?.mediaText, "-"), x + slw, y + 7, { width: smw - 8, align: "right", lineBreak: false });
      return y + h;
    };

    const drawShelfLifeChart = (y, rows = [], chartTitle = "DISTRIBUICAO DE DANOS INTERNOS (%)", chartFooter = "Percentual dos danos internos", { forceAxisMax = 0, x = PM, w = CW, minHeight = 0, fixedHeight = 0, showPctAxis = false } = {}) => {
      const hasTitleRow = chartTitle && chartTitle.trim().length > 0;
      const titleH = hasTitleRow ? 28 : 0;
      const headerH = 22;
      const barH = 12;
      const barRowH = SHELF_METRIC_ROW_H;
      const barGap = 0;
      const axisSpace = 34;
      const footerSpace = chartFooter && chartFooter.trim().length > 0 ? 14 : 6;
      const validRows = rows
        .filter((row) => row.media !== null)
        .slice();
      const rowsCountForHeight = Math.max(1, validRows.length);
      const baseChartH = titleH + headerH + (rowsCountForHeight * barRowH) + ((rowsCountForHeight - 1) * barGap) + axisSpace + footerSpace;
      const chartH = fixedHeight > 0 ? fixedHeight : Math.max(baseChartH, minHeight);

      doc.rect(x, y, w, chartH).fillAndStroke("#FFFFFF", "#E0E0E0");
      if (hasTitleRow) {
        doc.rect(x, y, w, titleH).fillAndStroke("#F1F3F0", "#D9DFD8");
        doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(12)
          .text(chartTitle, x + 10, y + 8, { width: w - 20, lineBreak: false });
      }

      const labelFontSize = showPctAxis ? 8.4 : 9;
      let labelW = showPctAxis
        ? Math.max(98, Math.floor(w * 0.34))
        : Math.max(120, Math.floor(w * 0.38));
      const pctW = showPctAxis
        ? Math.max(44, Math.floor(w * 0.15))
        : Math.max(40, Math.floor(w * 0.12));
      const barPad = showPctAxis ? 6 : 8;
      let barX = x + labelW + barPad;
      let barW = w - labelW - pctW - barPad * 2;
      let cursorY = y + titleH;

      if (showPctAxis) {
        const maxLabelTextWidth = validRows.reduce((maxWidth, row) => {
          const labelText = normalizeChartLabel(row?.label);
          const width = doc.widthOfString(labelText, { font: "Helvetica", size: labelFontSize });
          return Math.max(maxWidth, width);
        }, 0);
        const requiredLabelW = Math.ceil(maxLabelTextWidth + 14);
        const minBarW = 116;
        const maxAllowedLabelW = Math.max(92, w - pctW - (barPad * 2) - minBarW);
        labelW = Math.min(maxAllowedLabelW, Math.max(labelW, requiredLabelW));
        barX = x + labelW + barPad;
        barW = w - labelW - pctW - barPad * 2;
      }

      doc.rect(x, cursorY, w, headerH).fillAndStroke("#F7F8F6", "#E5E9E4");
      doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(9.4)
        .text("Item", x + 8, cursorY + 6, { width: labelW - 12, lineBreak: false });
      doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(9.4)
        .text("Grafico", barX + 4, cursorY + 6, { width: barW - 8, align: "left", lineBreak: false });
      doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(9.4)
        .text("%", barX + barW + 4, cursorY + 6, { width: pctW - 4, align: "right", lineBreak: false });
      cursorY += headerH;

      if (!validRows.length) {
        doc.fillColor("#7F7F7F").font("Helvetica").fontSize(10)
          .text("Sem dados para grafico.", x + 12, cursorY + 4, { width: w - 24, lineBreak: false });
        return y + chartH;
      }

      const maxMedia = Math.max(...validRows.map((r) => Number(r.media || 0)), 1);
      const axisMax = forceAxisMax > 0 ? forceAxisMax : Math.ceil(maxMedia / 5) * 5;
      const axisStep = showPctAxis ? 20 : (axisMax <= 10 ? 2 : axisMax <= 20 ? 5 : axisMax <= 50 ? 10 : 20);

      validRows.forEach((row) => {
        const val = Number(row.media || 0);
        const fillW = Math.max(0, Math.min(barW, (barW * val) / axisMax));
        const rowMidY = cursorY + Math.floor(barRowH / 2);

        doc.rect(x, cursorY, w, barRowH).fillAndStroke("#FFFFFF", "#EDEDED");
        doc.fillColor(TEXT).font("Helvetica").fontSize(labelFontSize)
          .text(normalizeChartLabel(row.label), x + 8, rowMidY - 4, { width: labelW - 12, lineBreak: false });

        doc.rect(barX, rowMidY - Math.floor(barH / 2), barW, barH).fill("#C9D0D7");
        if (fillW > 0) {
          doc.rect(barX, rowMidY - Math.floor(barH / 2), fillW, barH).fill(GREEN_DARK);
        }

        const pctTextX = barX + barW + 4;
        const valSuffix = showPctAxis && !String(row.mediaText || "").includes("%") ? "%" : "";
        doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(showPctAxis ? 8.8 : 9.4)
          .text((row.mediaText || "-") + valSuffix, pctTextX, rowMidY - 4, { width: pctW - 4, align: "right", lineBreak: false });

        cursorY += barRowH + barGap;
      });

      const axisY = cursorY + 4;
      doc.moveTo(barX, axisY).lineTo(barX + barW, axisY).strokeColor("#BBBBBB").lineWidth(0.6).stroke();
      for (let tick = 0; tick <= axisMax; tick += axisStep) {
        const tickX = barX + (barW * tick / axisMax);
        doc.moveTo(tickX, axisY).lineTo(tickX, axisY + 4).strokeColor("#BBBBBB").lineWidth(0.6).stroke();
        const tickLabelW = showPctAxis ? 16 : 24;
        doc.fillColor("#808080").font("Helvetica").fontSize(showPctAxis ? 6.2 : 8.2)
          .text(showPctAxis ? `${tick}%` : String(tick), tickX - (tickLabelW / 2), axisY + 6, { width: tickLabelW, align: "center", lineBreak: false });
      }
      if (chartFooter) {
        doc.fillColor("#888888").font("Helvetica").fontSize(7.5)
          .text(chartFooter, barX, axisY + 18, { width: barW, align: "center", lineBreak: false });
      }

      return y + chartH;
    };

    const drawDanosRow = (
      y,
      row,
      rowIndex = 0,
      {
        rowNumber = null,
        highlight = false,
        forceCount = null,
        forceIncidencia = null,
        x = PM,
        w = CW,
      } = {},
    ) => {
      const h = 24;
      const dlw = Math.floor(w * 0.70);
      const dqw = Math.floor(w * 0.14);
      const dpw = w - dlw - dqw;
      const fill = highlight ? GREEN : "#FFFFFF";
      const textColor = highlight ? "#FFFFFF" : TEXT;
      const countValue = forceCount ?? (row?.placeholder ? 0 : toPositiveInt(row?.count));
      const incidencia = forceIncidencia ?? (row?.placeholder ? "-" : formatIncidencia(countValue));
      const countDisplay = row?.placeholder && forceCount === null ? "-" : String(countValue);

      doc.rect(x, y, w, h).fillAndStroke(fill, BORDER);
      doc.moveTo(x + dlw, y).lineTo(x + dlw, y + h).strokeColor(BORDER).lineWidth(0.7).stroke();
      doc.moveTo(x + dlw + dqw, y).lineTo(x + dlw + dqw, y + h).strokeColor(BORDER).lineWidth(0.7).stroke();

      const labelPrefix = rowNumber ? `${rowNumber} - ` : "";
      doc.fillColor(textColor).font(highlight ? "Helvetica-Bold" : "Helvetica").fontSize(10)
        .text(`${labelPrefix}${asText(row?.label, "-")}`, x + 8, y + 7, { width: dlw - 16, lineBreak: false });

      const qtyColor = highlight
        ? "#FFFFFF"
        : (countValue > 0 ? GREEN_DARK : "#6A6A6A");
      doc.fillColor(qtyColor).font(highlight ? "Helvetica-Bold" : "Helvetica").fontSize(10.2)
        .text(countDisplay, x + dlw, y + 7, { width: dqw, align: "center", lineBreak: false });

      const pctColor = highlight
        ? "#FFFFFF"
        : (incidencia !== "-" ? GREEN_DARK : "#7E7E7E");
      doc.fillColor(pctColor).font(highlight ? "Helvetica-Bold" : "Helvetica").fontSize(10.2)
        .text(incidencia, x + dlw + dqw, y + 7, { width: dpw, align: "center", lineBreak: false });

      return y + h;
    };

    const drawDanosTotalBox = (y) => {
      const h = 28;
      doc.rect(PM, y, CW, h).fillAndStroke("#F8F9F7", BORDER);
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(9.8)
        .text("PERCENTUAL TOTAL DE DANOS INTERNOS", PM + 10, y + 8, { width: CW * 0.72, lineBreak: false });
      doc.fillColor(ORANGE).font("Helvetica-Bold").fontSize(12)
        .text(incidenciaDanosInternos, PM, y + 7, { width: CW - 10, align: "right", lineBreak: false });
      return y + h;
    };

    const normalizeDiagKey = (label = "") =>
      String(label || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();

    const getStageNumber = (label = "") => {
      const normalized = normalizeDiagKey(label).replace(",", ".");
      const match = normalized.match(/EST\s*([0-9]+(?:\.[0-9]+)?)/);
      if (!match) return null;
      const value = Number.parseFloat(match[1]);
      return Number.isFinite(value) ? value : null;
    };

    const getDiagRank = (label = "") => {
      const key = normalizeDiagKey(label);
      if (key.includes("BRIX")) return 10;
      if (key.includes("PENETROM")) return 20;
      if (key.includes("MATERIA SECA")) return 30;
      if (/^EST\b/.test(key) || key.includes(" EST")) return 40;
      return 90;
    };

    const sortDiagnosticoRows = (rows = []) =>
      [...rows].sort((a, b) => {
        const rankA = getDiagRank(a?.label);
        const rankB = getDiagRank(b?.label);
        if (rankA !== rankB) return rankA - rankB;

        // Para estágios, manter ordem decrescente (Est 2, Est 1,5, Est 1).
        if (rankA === 40) {
          const stageA = getStageNumber(a?.label);
          const stageB = getStageNumber(b?.label);
          if (stageA !== null && stageB !== null && stageA !== stageB) {
            return stageB - stageA;
          }
        }

        return String(a?.label || "").localeCompare(String(b?.label || ""), "pt-BR", {
          sensitivity: "base",
          numeric: true,
        });
      });

    let y = drawHeader({ showInfoBox: true });

    y = drawSectionHead(y, "1", "DADOS");
    const dadosRows = [
      { label: "1.1 - Data de Análise", value: dataAnalise },
      { label: "1.2 - Tipo de Análise", value: asText(payload.tipo_analise, "-") },
      { label: "1.3 - Fazenda/Produtor", value: asText(payload.fazenda_talhao, "-") },
      { label: "1.4 - Talhão", value: asText(payload.talhao, "-") },
      { label: "1.5 - Variedade", value: asText(payload.variedade, "-") },
      { label: "1.6 - Controle", value: asText(payload.controle, "-") },
      { label: "1.7 - Observações", value: asText(payload.observacoes, "-") },
    ];
    dadosRows.forEach((row, index) => {
      y = drawDataRow(y, row.label, row.value, index);
    });

    if (isShelfLife) {
      y += 10;
      if (y + 90 > BOT) {
        doc.addPage();
        y = drawHeader({ showInfoBox: false });
      }

      y = drawSectionHead(y, "2", "AVALIAÇÃO - DANOS INTERNOS");

      const qtdInfoH = 22;
      const qtdLabelW = 172;
      doc.rect(PM, y, CW, qtdInfoH).fill("#F8F9F7");
      doc.fillColor(TEXT_SOFT).font("Helvetica").fontSize(9)
        .text("Quantidade de frutos analisados:", PM + 8, y + 7, { width: qtdLabelW, lineBreak: false });
      doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(9)
        .text(String(qtdTotal), PM + 8 + qtdLabelW + 4, y + 7, { width: 60, lineBreak: false });
      y += qtdInfoH + 12;

      const shelfRows = shelfLifeMetricRows.some((row) => row.media !== null)
        ? shelfLifeMetricRows
        : [{ label: "Sem diagnóstico informado", mediaText: "-", percentualText: "-", media: null }];

      // Side-by-side: table left 52%, chart right 48%
      const SIDE_GAP = 8;
      const tableW = Math.floor(CW * 0.52);
      const chartSideW = CW - tableW - SIDE_GAP;
      const chartSideX = PM + tableW + SIDE_GAP;
      const sideSectionTopY = y;
      const chartRows = shelfRows.filter((row) => row.media !== null);
      const tableBlockH = getShelfMetricTableHeight(shelfRows.length);
      const chartBlockH = getShelfLifeChartHeight(chartRows, "REPRESENTAÇÃO GRÁFICA", "Percentual dos danos internos");
      const sharedBlockH = Math.max(tableBlockH, chartBlockH);

      drawShelfMetricBackdrop(sideSectionTopY, sharedBlockH, { x: PM, w: tableW });

      let tableY = drawShelfMetricTitleRow(sideSectionTopY, "Diagnóstico", { x: PM, w: tableW, showPercent: true });
      tableY = drawShelfMetricHeader(tableY, { x: PM, w: tableW });
      shelfRows.forEach((row, rowIndex) => {
        tableY = drawShelfMetricRow(tableY, row, rowIndex, `2.${rowIndex + 1}`, { x: PM, w: tableW });
      });
      y = tableY;
      const tableEndY = y;

      const chartEndY = drawShelfLifeChart(sideSectionTopY, chartRows, "Representação Gráfica", "Percentual dos danos internos", { x: chartSideX, w: chartSideW, fixedHeight: sharedBlockH });

      y = Math.max(tableEndY, chartEndY);
    } else if (isPreColheita) {
      // ==================== PRE-COLHEITA LAYOUT ====================
      const preColheitaMetricRows = shelfLifeMetricRows.some((row) => row.media !== null)
        ? shelfLifeMetricRows
        : [{ label: "Sem dados", mediaText: "-", media: null }];

      const maturacaoStagesPadrao = ["1", "1,5", "2"];
      const maturacaoMap = new Map(
        maturacaoDistRows.map((row) => [String(row.estagio), row]),
      );
      const maturacaoRowsOrdenadas = [
        ...maturacaoStagesPadrao.map((estagio) => maturacaoMap.get(estagio) || { estagio, count: 0, pct: "0.0" }),
        ...maturacaoDistRows.filter((row) => !maturacaoStagesPadrao.includes(String(row.estagio))),
      ];

      const diagnosticoRowsBase = [
        ...maturacaoRowsOrdenadas.map((row) => {
          const pct = Number(String(row?.pct ?? "0").replace(",", "."));
          const pctValue = Number.isFinite(pct) ? pct : 0;
          return {
            label: `Est ${row.estagio}`,
            mediaText: formatMetricDecimal(pctValue),
            media: pctValue,
          };
        }),
        ...preColheitaMetricRows,
      ];

      const estChartRows = maturacaoRowsOrdenadas.map((row) => {
        const pct = Number(String(row?.pct ?? "0").replace(",", "."));
        const pctValue = Number.isFinite(pct) ? pct : 0;
        return { label: `Est ${row.estagio}`, mediaText: `${pctValue.toFixed(1)}`, media: pctValue };
      });
      const diagnosticoRows = sortDiagnosticoRows(
        diagnosticoRowsBase.filter((row) => row.media !== 0 && row.media !== null),
      );
      const chartRows = diagnosticoRows.map((row) => ({ ...row, label: row.label }));

      // Render table + chart together right after DADOS (same page)
      y += 10;

      y = drawSectionHead(y, "2", "AVALIAÇÃO:");

      const qtdInfoH = 22;
      const qtdLabelW2 = 172;
      doc.rect(PM, y, CW, qtdInfoH).fill("#F8F9F7");
      doc.fillColor(TEXT_SOFT).font("Helvetica").fontSize(9)
        .text("Quantidade de frutos analisados:", PM + 8, y + 7, { width: qtdLabelW2, lineBreak: false });
      doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(9)
        .text(String(qtdTotal), PM + 8 + qtdLabelW2 + 4, y + 7, { width: 60, lineBreak: false });
      y += qtdInfoH + 12;

      // Side-by-side: table left, chart right
      {
        const SIDE_GAP2 = 8;
        const tableW2 = Math.floor(CW * 0.48);
        const chartSideW2 = CW - tableW2 - SIDE_GAP2;
        const chartSideX2 = PM + tableW2 + SIDE_GAP2;
        const sideSectionTopY2 = y;
        const tableBlockH2 = getShelfMetricTableHeight(diagnosticoRows.length);
        const chartBlockH2 = getShelfLifeChartHeight(chartRows, "Representacao Grafica", "");
        const sharedBlockH2 = Math.max(tableBlockH2, chartBlockH2);

        drawShelfMetricBackdrop(sideSectionTopY2, sharedBlockH2, { x: PM, w: tableW2 });

        let tableY2 = drawShelfMetricTitleRow(sideSectionTopY2, "Diagnóstico", { x: PM, w: tableW2, showPercent: true });
        tableY2 = drawShelfMetricHeader(tableY2, { x: PM, w: tableW2 });
        diagnosticoRows.forEach((row, rowIndex) => {
          tableY2 = drawShelfMetricRow(tableY2, row, rowIndex, `2.${rowIndex + 1}`, { x: PM, w: tableW2 });
        });
        y = tableY2;
        const tableEndY2 = y;

        const chartEndY2 = drawShelfLifeChart(sideSectionTopY2, chartRows, "Representação Gráfica", "", { forceAxisMax: 100, showPctAxis: true, x: chartSideX2, w: chartSideW2, fixedHeight: sharedBlockH2 });
        y = Math.max(tableEndY2, chartEndY2);
      }
    } else if (isProducao || isAcompanhamento) {
      // ==================== PRODUCAO / ACOMPANHAMENTO LAYOUT ====================
      const preColheitaMetricRowsProd = shelfLifeMetricRows.some((row) => row.media !== null)
        ? shelfLifeMetricRows
        : [{ label: "Sem dados", mediaText: "-", media: null }];

      const maturacaoStagesPadrao = ["1", "1,5", "2"];
      const maturacaoMap = new Map(
        maturacaoDistRows.map((row) => [String(row.estagio), row]),
      );
      const maturacaoRowsOrdenadas = [
        ...maturacaoStagesPadrao.map((estagio) => maturacaoMap.get(estagio) || { estagio, count: 0, pct: "0.0" }),
        ...maturacaoDistRows.filter((row) => !maturacaoStagesPadrao.includes(String(row.estagio))),
      ];

      const diagnosticoRowsBase = [
        ...maturacaoRowsOrdenadas.map((row) => {
          const pct = Number(String(row?.pct ?? "0").replace(",", "."));
          const pctValue = Number.isFinite(pct) ? pct : 0;
          return {
            label: `Est ${row.estagio}`,
            mediaText: formatMetricDecimal(pctValue),
            media: pctValue,
          };
        }),
        ...preColheitaMetricRowsProd,
      ];

      const diagnosticoRows = sortDiagnosticoRows(
        [...diagnosticoRowsBase].filter((row) => row.media !== 0 && row.media !== null),
      );

      // Section 2: Avaliacao
      y += 10;
      y = drawSectionHead(y, "2", "AVALIAÇÃO:");

      const qtdInfoH = 22;
      const qtdLabelW3 = 172;
      doc.rect(PM, y, CW, qtdInfoH).fill("#F8F9F7");
      doc.fillColor(TEXT_SOFT).font("Helvetica").fontSize(9)
        .text("Quantidade de frutos analisados:", PM + 8, y + 7, { width: qtdLabelW3, lineBreak: false });
      doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(9)
        .text(String(qtdTotal), PM + 8 + qtdLabelW3 + 4, y + 7, { width: 60, lineBreak: false });
      y += qtdInfoH + 12;

      // Side-by-side: table left, chart right
      {
        const SIDE_GAP3 = 8;
        const tableW3 = Math.floor(CW * 0.48);
        const chartSideW3 = CW - tableW3 - SIDE_GAP3;
        const chartSideX3 = PM + tableW3 + SIDE_GAP3;
        const sideSectionTopY3 = y;
        const prodChartRows = diagnosticoRows.map((r) => ({ ...r, label: r.label }));
        const tableBlockH3 = getShelfMetricTableHeight(diagnosticoRows.length);
        const chartBlockH3 = getShelfLifeChartHeight(prodChartRows, "Representacao Grafica", "");
        const sharedBlockH3 = Math.max(tableBlockH3, chartBlockH3);

        drawShelfMetricBackdrop(sideSectionTopY3, sharedBlockH3, { x: PM, w: tableW3 });

        let tableY3 = drawShelfMetricTitleRow(sideSectionTopY3, "Diagnóstico", { x: PM, w: tableW3, showPercent: true });
        tableY3 = drawShelfMetricHeader(tableY3, { x: PM, w: tableW3 });
        diagnosticoRows.forEach((row, rowIndex) => {
          tableY3 = drawShelfMetricRow(tableY3, row, rowIndex, `2.${rowIndex + 1}`, { x: PM, w: tableW3 });
        });
        y = tableY3;
        const tableEndY3 = y;

        const chartEndY3 = drawShelfLifeChart(sideSectionTopY3, prodChartRows, "Representação Gráfica", "", { forceAxisMax: 100, showPctAxis: true, x: chartSideX3, w: chartSideW3, fixedHeight: sharedBlockH3 });
        y = Math.max(tableEndY3, chartEndY3);
      }

      // Section 3: Disturbios encontrados (only if there are real danos)
      const hasRealDanos = danosInternosRows.some((row) => !row.placeholder && row.count > 0);
      if (hasRealDanos) {
        y += 10;

        // Format incidence without % symbol
        const formatIncidProd = (count) => {
          const qty = toPositiveInt(count);
          if (qtdTotal <= 0 || qty <= 0) return "-";
          return ((qty / qtdTotal) * 100).toFixed(1);
        };

        const danosSectionNeededH = 38 + getDanosTableHeight(danosInternosRows.length, true) + 40;
        if (y + danosSectionNeededH > BOT) {
          doc.addPage();
          y = drawHeader({ showInfoBox: false });
        }
        y = drawSectionHead(y, "3", "Dist\u00farbios encontrados:");

        y = drawDanosHeader(y);
        danosInternosRows.forEach((row, rowIndex) => {
          y = drawDanosRow(y, row, rowIndex, { rowNumber: `3.${rowIndex + 1}`, forceIncidencia: formatIncidProd(row.count) });
        });
        const totalIncidProd = qtdTotal > 0 ? ((totalFrutosComDano / qtdTotal) * 100).toFixed(1) : "-";
        y = drawDanosRow(
          y,
          { label: "Frutos com Danos Internos", count: totalFrutosComDano },
          danosInternosRows.length,
          { rowNumber: `3.${danosInternosRows.length + 1}`, highlight: true, forceCount: totalFrutosComDano, forceIncidencia: totalIncidProd },
        );

        if (y + 34 <= BOT) {
          y += 6;
          y = drawDanosTotalBox(y);
        }
      }
    } else {
      y += 10;
      y = drawCalculationLogicBox(y);
      y = drawSectionHead(y, "2", "AVALIAÇÃO");
      y = drawAvaliacaoHeader(y);
      avaliacaoRows.forEach((row, rowIndex) => {
        if (y + 26 > BOT) {
          doc.addPage();
          y = drawHeader({ showInfoBox: false });
          y = drawSectionHead(y, "2", "AVALIAÇÃO");
          y = drawAvaliacaoHeader(y);
        }
        y = drawAvaliacaoRow(y, row, rowIndex);
      });

      y += 10;
      const elseSectionNeededH = 38 + getDanosTableHeight(danosInternosRows.length, true) + 40;
      if (y + elseSectionNeededH > BOT) {
        doc.addPage();
        y = drawHeader({ showInfoBox: false });
      }
      y = drawSectionHead(y, "3", "AVALIAÇÃO - DANOS INTERNOS");

      y = drawDanosHeader(y);
      danosInternosRows.forEach((row, rowIndex) => {
        y = drawDanosRow(y, row, rowIndex, { rowNumber: `3.${rowIndex + 1}` });
      });
      y = drawDanosRow(
        y,
        { label: "Frutos com Danos Internos", count: totalFrutosComDano },
        danosInternosRows.length,
        { rowNumber: `3.${danosInternosRows.length + 1}`, highlight: true, forceCount: totalFrutosComDano, forceIncidencia: incidenciaDanosInternos },
      );

      if (y + 34 <= BOT) {
        y += 6;
        y = drawDanosTotalBox(y);
      }
    }

    // ── Helper: renderiza grid de fotos com legenda abaixo de cada imagem ──
    const renderPhotoGrid = (items = [], sectionTitle, startY = y) => {
      const validItems = items.filter((item) => item?.path);
      if (!validItems.length) return startY;

      const PHOTO_COLS = 2;
      const PHOTO_GAP = 14;
      const CAPTION_H = 22;
      const PHOTO_IMG_H = 190;
      const PHOTO_CARD_H = PHOTO_IMG_H + CAPTION_H;
      const photoCardW = (CW - PHOTO_GAP) / PHOTO_COLS;
      const photoTitleH = 30;
      const minSectionH = photoTitleH + 14 + PHOTO_CARD_H;

      let sectionTitleY = startY + 12;
      if (sectionTitleY + minSectionH > BOT) {
        doc.addPage();
        drawBackground();
        sectionTitleY = 20;
      }

      doc.rect(PM, sectionTitleY, CW, photoTitleH).fill(GREEN);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(13)
        .text(sectionTitle, PM + 12, sectionTitleY + 8, { width: CW - 24, lineBreak: false });

      let photoY = sectionTitleY + photoTitleH + 14;

      validItems.forEach(({ path: fotoPath, label }, index) => {
        const col = index % PHOTO_COLS;
        const photoX = PM + col * (photoCardW + PHOTO_GAP);

        if (col === 0 && index > 0) {
          photoY += PHOTO_CARD_H + PHOTO_GAP;
        }

        if (photoY + PHOTO_CARD_H > BOT) {
          doc.addPage();
          drawBackground();
          doc.rect(PM, 20, CW, photoTitleH).fill(GREEN);
          doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(13)
            .text(`${sectionTitle} (cont.)`, PM + 12, 28, { width: CW - 24, lineBreak: false });
          photoY = 20 + photoTitleH + 14;
        }

        doc.rect(photoX, photoY, photoCardW, PHOTO_CARD_H).fillAndStroke("#FFFFFF", BORDER);

        const innerTop = photoY + 7;
        const innerW = photoCardW - 14;

        try {
          doc.image(fotoPath, photoX + 7, innerTop, {
            fit: [innerW, PHOTO_IMG_H - 14],
            align: "center",
            valign: "center",
          });
        } catch {
          doc.rect(photoX + 7, innerTop, innerW, PHOTO_IMG_H - 14).fillAndStroke("#F5F5F5", BORDER);
          doc.fillColor("#999999").font("Helvetica").fontSize(10)
            .text("Foto indisponivel", photoX + 7, innerTop + ((PHOTO_IMG_H - 14) / 2) - 6, { width: innerW, align: "center", lineBreak: false });
        }

        // Legenda abaixo da foto
        const captionY = photoY + PHOTO_IMG_H;
        doc.rect(photoX, captionY, photoCardW, CAPTION_H).fillAndStroke("#F2F7F3", BORDER);
        doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(10)
          .text(label, photoX + 8, captionY + 6, { width: photoCardW - 16, align: "center", lineBreak: false });
      });

      const rowsUsed = Math.ceil(validItems.length / PHOTO_COLS);
      return photoY + (rowsUsed > 0 ? PHOTO_CARD_H : 0);
    };

    if (fotoPaths.length > 0) {
      y = renderPhotoGrid(fotoPaths.map((fotoPath) => ({ path: fotoPath, label: "Foto" })), "FOTOS - ANALISE DE FRUTOS", y);
    }

    // Fotos de producao (Firmeza / Maturacao / Danos Internos) — tudo junto numa grade continua
    const fotosProd = payload.fotos_producao;
    if (fotosProd && typeof fotosProd === "object") {
      const camposMeta = [
        { key: "firmeza",        label: "Firmeza" },
        { key: "maturacao",      label: "Maturação" },
        { key: "danos_internos", label: "Danos Internos" },
      ];
      // Collect all photos with individual labels
      const allProdItems = [];
      for (const { key, label } of camposMeta) {
        const campoFotos = Array.isArray(fotosProd[key]) ? fotosProd[key] : [];
        for (const foto of campoFotos) {
          if (foto?.disk_path && fs.existsSync(foto.disk_path)) {
            allProdItems.push({ path: foto.disk_path, label });
          }
        }
      }

      if (allProdItems.length > 0) {
        y = renderPhotoGrid(allProdItems, "FOTOS", y);
      }
    }

    const pageRange = doc.bufferedPageRange();
    for (let pi = pageRange.start; pi < pageRange.start + pageRange.count; pi += 1) {
      doc.switchToPage(pi);
      const fy = doc.page.height - 26;
      doc.moveTo(PM, fy - 6).lineTo(PM + CW, fy - 6).strokeColor("#D0D0D0").lineWidth(0.6).stroke();
      doc.fillColor("#8C8C8C").font("Helvetica").fontSize(7)
        .text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, PM, fy, { width: CW * 0.74, lineBreak: false });
      doc.fillColor("#8C8C8C").font("Helvetica-Bold").fontSize(7.2)
        .text(`${(pi - pageRange.start) + 1} / ${pageRange.count}`, PM, fy, { width: CW, align: "right", lineBreak: false });
    }

    doc.flushPages();
    doc.end();
    stream.on("finish", () => resolve(caminhoArquivo));
    stream.on("error", reject);
  });
}
export async function gerarRelatorioAnaliseFrutosPDF(payload = {}, options = {}) {
  const useNovoLayout = options?.layout === "novo" || payload?.layout === "novo";
  if (useNovoLayout) {
    return gerarRelatorioAnaliseFrutosPDFNovo(payload, options);
  }

  const now = new Date();
  const outputDir = options.outputDir || PASTA_PDFS;
  fs.mkdirSync(outputDir, { recursive: true });
  const nomeArquivo = options.fileName || `analise_frutos_${now.toISOString().replace(/[:.]/g, "-")}.pdf`;
  const caminhoArquivo = path.join(outputDir, nomeArquivo);

  const frutos = Array.isArray(payload.frutos) ? payload.frutos : [];
  const lotes = Array.isArray(payload.lotes) ? payload.lotes : [];
  const qtdTotal = Math.max(1, parseInt(payload.qtd_frutos) || frutos.length);

  const logoCandidates = [
    path.resolve(BACKEND_ROOT, "../CONTROLEQUALIDADE/src/assets/logoagrodann.png"),
    path.resolve(BACKEND_ROOT, "../CONTROLEQUALIDADE/assets/logoagrodann.png"),
    path.resolve(BACKEND_ROOT, "assets/logoagrodann.png"),
  ];
  const logoPath = logoCandidates.find((c) => fs.existsSync(c)) || null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4", bufferPages: true });
    const stream = fs.createWriteStream(caminhoArquivo);
    doc.pipe(stream);

    const PM = 36;
    const CW = doc.page.width - PM * 2;
    const BOT = doc.page.height - 60;
    const GREEN = "#2E7D32";
    const GREEN_LIGHT = "#E8F5E9";
    const GREEN_DARK = "#1B5E20";
    const GREEN_VALUE = "#1A6B20";
    const TEXT = "#1C2B20";
    const BORDER = "#C8D4C8";
    const BG_ROW = "#F8FAF8";

    const ORANGE = "#F87C00";
    const ORANGE_VALUE = "#C45A00";

    // Arrow cell â€” laranja igual ao MF
    const drawArrowCell = (x, y, w, h, label, value) => {
      const tipW = 14;
      const labelBodyW = 110;
      const labelW = labelBodyW + tipW;
      const rightX = x + labelW;
      const rightW = w - labelW;
      doc.rect(rightX, y, rightW, h).fill("#ECECEC");
      doc.save()
        .moveTo(x, y)
        .lineTo(x + labelBodyW, y)
        .lineTo(x + labelW, y + h / 2)
        .lineTo(x + labelBodyW, y + h)
        .lineTo(x, y + h)
        .closePath()
        .fill(ORANGE);
      doc.restore();
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8)
        .text(String(label).toUpperCase(), x + 8, y + (h - 8) / 2 - 1, {
          width: labelBodyW - 12, lineBreak: false,
        });
      doc.fillColor(ORANGE_VALUE).font("Helvetica-Bold").fontSize(10)
        .text(asText(value, "-"), rightX + 10, y + (h - 10) / 2 - 1, {
          width: rightW - 14, lineBreak: false,
        });
    };

    // Numbered section header (like MF)
    const drawSectionHeader = (number, title, y) => {
      const h = 26;
      doc.rect(PM, y, 26, h).fill(GREEN);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(12)
        .text(String(number), PM, y + (h - 12) / 2 - 1, { width: 26, align: "center", lineBreak: false });
      doc.rect(PM + 26, y, CW - 26, h).fill(GREEN_LIGHT);
      doc.fillColor(GREEN_DARK).font("Helvetica-Bold").fontSize(11)
        .text(String(title).toUpperCase(), PM + 36, y + (h - 11) / 2 - 1, { width: CW - 46, lineBreak: false });
      return y + h + 4;
    };

    // "RESULTADOS" centered title
    const drawResultadosTitle = (y) => {
      doc.rect(PM, y, CW, 1).fill(BORDER);
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(17)
        .text("RESULTADOS", PM, y + 10, { width: CW, align: "center", lineBreak: false });
      doc.rect(PM, y + 28, CW, 1).fill(BORDER);
      return y + 38;
    };

    // Numbered data row
    const drawDataRow = (number, label, value, y) => {
      const rowH = 22;
      const even = parseFloat(number) % 2 === 0;
      doc.rect(PM, y, CW, rowH).fill(even ? "#F4F7F4" : "#FFFFFF");
      doc.moveTo(PM, y + rowH).lineTo(PM + CW, y + rowH).strokeColor(BORDER).lineWidth(0.4).stroke();
      doc.fillColor("#555").font("Helvetica").fontSize(9)
        .text(`${number} - ${label}`, PM + 8, y + (rowH - 9) / 2 - 1, { width: CW * 0.52, lineBreak: false });
      doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(9.5)
        .text(asText(value, "-"), PM + CW * 0.54, y + (rowH - 9) / 2 - 1, {
          width: CW * 0.44, align: "right", lineBreak: false,
        });
      return y + rowH;
    };

    // Table columns
    const COL_CRITERIO = 160;
    const COL_FRUTO = 55;
    const COL_VALOR = 70;
    const COL_PCT = 72;
    const COL_DANOS = CW - COL_CRITERIO - COL_FRUTO - COL_VALOR - COL_PCT;
    const tableCols = [
      { key: "criterio", label: "CRITERIO", width: COL_CRITERIO, align: "left" },
      { key: "fruto", label: "FRUTO", width: COL_FRUTO, align: "center" },
      { key: "valor", label: "VALOR", width: COL_VALOR, align: "center" },
      { key: "danos", label: "DANOS", width: COL_DANOS, align: "left" },
      { key: "pct", label: "INCID.%", width: COL_PCT, align: "center", green: true },
    ];

    const drawTableHeader = (y) => {
      const rowH = 24;
      doc.rect(PM, y, CW, rowH).fill(GREEN);
      let x = PM;
      tableCols.forEach(({ label, width, align }) => {
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9)
          .text(label, x + 4, y + (rowH - 9) / 2 - 1, { width: width - 8, align, lineBreak: false });
        x += width;
      });
      return y + rowH;
    };

    const drawTableRow = (y, rowData, rowIndex) => {
      const rowH = 22;
      doc.rect(PM, y, CW, rowH).fill(rowIndex % 2 === 0 ? "#FFFFFF" : BG_ROW);
      doc.moveTo(PM, y + rowH).lineTo(PM + CW, y + rowH).strokeColor(BORDER).lineWidth(0.4).stroke();
      let x = PM;
      tableCols.forEach(({ key, width, align, green }) => {
        const val = asText(rowData[key], "-");
        if (green && val !== "-") {
          doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(9);
        } else {
          doc.fillColor(TEXT).font("Helvetica").fontSize(9);
        }
        doc.text(val, x + 4, y + (rowH - 9) / 2 - 1, { width: width - 8, align, lineBreak: false });
        x += width;
      });
      return y + rowH;
    };

    const drawIncidenciaTotalRow = (y, label, pct) => {
      const rowH = 26;
      doc.rect(PM, y, CW, rowH).fill(GREEN);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10)
        .text(label, PM + 10, y + (rowH - 10) / 2 - 1, { width: CW * 0.6, lineBreak: false });
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(11)
        .text(pct, PM, y + (rowH - 11) / 2 - 1, { width: CW - 10, align: "right", lineBreak: false });
      return y + rowH + 10;
    };

    const addPage = () => {
      doc.addPage();
      curY = drawPageTop(false);
      doc.y = curY;
    };

    // Desenha logo + barra no topo de qualquer pÃ¡gina
    const drawPageTop = (isFirst = false) => {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFFFFF");
      doc.rect(0, 0, doc.page.width, 10).fill(ORANGE);

      const logoH = 32;
      const logoAreaTop = 14;
      let afterLogo = logoAreaTop + logoH + 6;

      if (logoPath) {
        try {
          const img = doc.openImage(logoPath);
          const scale = Math.min(CW / img.width, logoH / img.height, 1);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = PM + (CW - drawW) / 2;
          doc.image(logoPath, drawX, logoAreaTop, { width: drawW, height: drawH });
          afterLogo = logoAreaTop + drawH + 8;
        } catch (e) {
          // logo nao carregou, continua sem ela
        }
      }

      if (isFirst) {
        doc.moveTo(PM, afterLogo).lineTo(PM + CW, afterLogo).strokeColor(BORDER).lineWidth(0.6).stroke();
        doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(17)
          .text("ANALISE DE FRUTOS", PM, afterLogo + 6, { width: CW, lineBreak: false });
        doc.moveTo(PM, afterLogo + 26).lineTo(PM + CW, afterLogo + 26).strokeColor(BORDER).lineWidth(0.8).stroke();
        return afterLogo + 34;
      }
      return afterLogo + 4;
    };

    // â”€â”€ PAGE 1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let curY = drawPageTop(true);

    // Arrow cells header â€” igual ao MF
    const cellH = 22;
    const cellGap = 4;
    const halfW = (CW - cellGap) / 2;

    // Linha 1: DATA | INICIO
    drawArrowCell(PM, curY, halfW, cellH, "Data", formatPtBrDate(payload.data));
    drawArrowCell(PM + halfW + cellGap, curY, halfW, cellH, "Inicio", formatPtBrDate(payload.data));
    curY += cellH + 3;

    // Linha 2: AVALIADOR | FIM
    drawArrowCell(PM, curY, halfW, cellH, "Avaliador", "Priscilla Araujo Dantas");
    drawArrowCell(PM + halfW + cellGap, curY, halfW, cellH, "Fim", formatPtBrDate(payload.data));
    curY += cellH + 3;

    // Linha 3: AVALIADO (largura total)
    const avaliado = asText(payload.fazenda_talhao || payload.fazenda || payload.produtor, "-");
    drawArrowCell(PM, curY, CW, cellH + 4, "Avaliado", avaliado);
    curY += cellH + 4 + 12;

    // RESULTADOS
    curY = drawResultadosTitle(curY);

    // Section 1 DADOS
    curY = drawSectionHeader(1, "DADOS", curY);
    const dataRows = [
      ["1.1", "Tipo de Analise", payload.tipo_analise],
      ["1.2", "Fazenda", payload.fazenda_talhao],
      ["1.3", "Talhao", payload.talhao],
      ["1.4", "Variedade", payload.variedade],
      ["1.5", "Observacoes", payload.observacoes],
    ];
    dataRows.forEach(([num, label, value]) => {
      if (curY + 22 > BOT) { addPage(); curY = doc.y; }
      curY = drawDataRow(num, label, value, curY);
    });
    curY += 10;

    // Section 2 ANALISE DO FRUTO
    const criterioTopo = asText(payload.criterio, "-");
    const frutosRows = frutos.map((fruit) => {
      const val = parseFloat(fruit?.valor) || 0;
      return {
        criterio: criterioTopo,
        fruto: asText(fruit?.numero_fruto),
        valor: toNumberText(fruit?.valor),
        danos: asText(fruit?.danos_internos),
        pct: qtdTotal > 0 ? ((val / qtdTotal) * 100).toFixed(1) + "%" : "-",
      };
    });

    if (curY + 50 > BOT) { addPage(); curY = doc.y; }
    curY = drawSectionHeader(2, "ANALISE DO FRUTO", curY);
    curY = drawTableHeader(curY);
    if (!frutosRows.length) {
      doc.rect(PM, curY, CW, 28).fill("#FFFFFF");
      doc.moveTo(PM, curY + 28).lineTo(PM + CW, curY + 28).strokeColor(BORDER).lineWidth(0.4).stroke();
      doc.fillColor("#888").font("Helvetica").fontSize(9)
        .text("Nenhum fruto informado.", PM, curY + 9, { width: CW, align: "center", lineBreak: false });
      curY += 28;
    } else {
      frutosRows.forEach((row, i) => {
        if (curY + 24 > BOT) { addPage(); curY = doc.y; curY = drawTableHeader(curY); }
        curY = drawTableRow(curY, row, i);
      });
    }
    curY += 10;

    // Section 3 LANCAMENTO EM LOTES
    const lotesRows = lotes.map((lote) => {
      const val = parseFloat(lote?.valor) || 0;
      return {
        criterio: asText(lote?.criterio),
        fruto: asText(lote?.numero_fruto),
        valor: toNumberText(lote?.valor),
        danos: asText(lote?.danos_internos),
        pct: qtdTotal > 0 ? ((val / qtdTotal) * 100).toFixed(1) + "%" : "-",
      };
    });

    const frutosComValor = new Set(lotes.filter((l) => parseFloat(l?.valor) > 0).map((l) => String(l?.numero_fruto)));
    const incidenciaTotal = qtdTotal > 0 ? ((frutosComValor.size / qtdTotal) * 100).toFixed(1) + "%" : "-";

    if (curY + 50 > BOT) { addPage(); curY = doc.y; }
    curY = drawSectionHeader(3, "LANCAMENTO EM LOTES", curY);
    curY = drawTableHeader(curY);
    if (!lotesRows.length) {
      doc.rect(PM, curY, CW, 28).fill("#FFFFFF");
      doc.moveTo(PM, curY + 28).lineTo(PM + CW, curY + 28).strokeColor(BORDER).lineWidth(0.4).stroke();
      doc.fillColor("#888").font("Helvetica").fontSize(9)
        .text("Nenhum lancamento informado.", PM, curY + 9, { width: CW, align: "center", lineBreak: false });
      curY += 28;
    } else {
      lotesRows.forEach((row, i) => {
        if (curY + 24 > BOT) { addPage(); curY = doc.y; curY = drawTableHeader(curY); }
        curY = drawTableRow(curY, row, i);
      });
    }
    curY += 4;
    if (curY + 36 > BOT) { addPage(); curY = doc.y; }
    drawIncidenciaTotalRow(curY, "INCIDENCIA TOTAL:", incidenciaTotal);

    // Footer on all pages
    const pageRange = doc.bufferedPageRange();
    for (let pi = pageRange.start; pi < pageRange.start + pageRange.count; pi++) {
      doc.switchToPage(pi);
      const fy = doc.page.height - 42;
      doc.moveTo(PM, fy - 6).lineTo(PM + CW, fy - 6).strokeColor("#D0D0D0").lineWidth(0.6).stroke();
      doc.fillColor("#AAA").font("Helvetica").fontSize(7)
        .text("Sistema CQ - Analise de Frutos", PM, fy, { width: CW * 0.7, lineBreak: false });
      doc.fillColor("#888").font("Helvetica-Bold").fontSize(7.5)
        .text(`${(pi - pageRange.start) + 1} / ${pageRange.count}`, PM, fy, { width: CW, align: "right", lineBreak: false });
    }

    doc.flushPages();
    doc.end();
    stream.on("finish", () => resolve(caminhoArquivo));
    stream.on("error", reject);
  });
}

export async function gerarRelatorioEmbarqueSedePDF(payload = {}, options = {}) {
  const now = new Date();
  const outputDir = options.outputDir || PASTA_PDFS;
  fs.mkdirSync(outputDir, { recursive: true });
  const nomeArquivo = options.fileName || `relatorio_embarque_sede_${now.toISOString().replace(/[:.]/g, "-")}.pdf`;
  const caminhoArquivo = path.join(outputDir, nomeArquivo);

  const generalInfo = payload.generalInfo && typeof payload.generalInfo === "object" ? payload.generalInfo : {};
  const checklistData = Array.isArray(payload.checklist) ? payload.checklist : [];
  const checklistTemplate = [
    { key: "interior_limpo", label: "1. Interior do container esta limpo (livre de odor, sem materiais estranhos, madeira, insetos, etc);" },
    { key: "sem_estragos_borrachas", label: "2. Container esta sem estragos (borrachas da porta estao em bom estado);" },
    { key: "drenagem_aberta", label: "3. Drenagem do container esta aberta;" },
    { key: "refrigeracao_operando", label: "4. Maquinario de refrigeracao esta operando corretamente;" },
    { key: "pre_resfriado", label: "5. Container esta pre-resfriado na temperatura correta;" },
    { key: "ventilacao_exposta", label: "6. Ventilacao do container exposta;", usaSimNao: true },
    { key: "ventilacao_40cbm", label: "7. Ventilacao a 40 CBM;" },
    { key: "identificacao_correta", label: "8. A identificacao/documentacao do container esta correta;" },
    { key: "sensores_funcionando", label: "9. Foi verificado se os sensores de temperatura estao funcionando corretamente;" },
    { key: "registradores_posicao", label: "10. Registradores portateis de temperatura foram colocados na posicao correta na carga;" },
    { key: "absorvedor_etileno", label: "11. Foi feito uso de absorvedor de etileno;", usaSimNao: true },
    { key: "saida_ventilacao_verificada", label: "12. A saida de ventilacao dos containers foi aberta e verificada (fazer registro fotografico);" },
    { key: "sanitizado_acido", label: "13. O container foi sanitizado com solucao a base de acido peracetico;" },
    { key: "qualidade_paletizacao", label: "14. Qualidade da paletizacao (fitas, estrado e alinhamento das caixas). Nao conformes;" },
    { key: "carga_temperatura_correta", label: "15. A carga esta na temperatura correta (temperatura media de polpa);" },
    { key: "lacre_colocado", label: "16. Lacre esta devidamente colocado na porta do container;" },
    { key: "temperatura_saida", label: "17. Temperatura de saida do container;" },
  ];
  const checklistByKey = new Map();
  checklistData.forEach((item) => {
    const key = String(item?.key || "").trim().toLowerCase();
    if (key) checklistByKey.set(key, item);
  });
  const checklistNoKey = checklistData.filter((item) => !String(item?.key || "").trim());
  const normalizedChecklist = checklistTemplate.map((templateItem, index) => {
    const source = checklistByKey.get(templateItem.key) || checklistNoKey[index] || null;
    return {
      label: asText(templateItem.label, `${index + 1}. Item`),
      value: String(source?.value || "").toUpperCase(),
      usaSimNao: Boolean(templateItem.usaSimNao),
    };
  });
  const sections = Array.isArray(payload.sections) ? payload.sections : [];

  const defaultSections = [
    {
      key: "mang_palmer",
      title: "MANGO PALMER",
      items: [
        { key: "appearance", label: "Appearance" },
        { key: "pulp_temperature", label: "Pulp temperature" },
        { key: "maturity", label: "Maturity" },
        { key: "firmness", label: "Firmness" },
      ],
    },
    {
      key: "container",
      title: "CONTAINER",
      items: [
        { key: "internal_identification", label: "Internal identification" },
        { key: "setpoint_temperature", label: "Setpoint and temperature" },
        { key: "external_identification", label: "External identification" },
        { key: "termograph_location", label: "Termograph location" },
        { key: "termograph_identification", label: "Termograph identification" },
        { key: "drain", label: "Drain" },
      ],
    },
  ];

  const normalizePhoto = (photo) => {
    if (!photo) return null;
    if (typeof photo === "string" && photo.trim()) return { uri: photo.trim() };
    if (typeof photo?.uri === "string" && photo.uri.trim()) return { uri: photo.uri.trim() };
    return null;
  };

  const resolveImageSource = (photo) => {
    const uri = String(photo?.uri || "").trim();
    if (!uri) return null;

    const dataUriMatch = uri.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (dataUriMatch?.[1]) {
      try {
        return Buffer.from(dataUriMatch[1], "base64");
      } catch {
        return null;
      }
    }

    const withoutPrefix = uri.startsWith("file://") ? decodeURIComponent(uri.replace(/^file:\/\//, "")) : uri;
    if (fs.existsSync(withoutPrefix)) return withoutPrefix;
    return null;
  };

  const toPhotoCount = (item = {}) => {
    const fromTotal = Number(item?.totalPhotos);
    if (Number.isFinite(fromTotal)) return Math.max(0, Math.round(fromTotal));
    return Array.isArray(item?.photos) ? item.photos.length : 0;
  };

  const sourceSections = sections.length ? sections : defaultSections;
  const normalizedSections = sourceSections.map((section, sectionIndex) => {
    const items = Array.isArray(section?.items) ? section.items : [];
    const itemsWithContent = items
      .map((item, itemIndex) => {
        const photos = (Array.isArray(item?.photos) ? item.photos : []).map(normalizePhoto).filter(Boolean);
        const imageSources = photos.map(resolveImageSource).filter(Boolean).slice(0, 4);
        if (!imageSources.length) return null;

        const totalPhotos = Math.max(toPhotoCount(item), imageSources.length);
        return {
          key: asText(item?.key, `item_${itemIndex + 1}`),
          label: asText(item?.label, `Item ${itemIndex + 1}`),
          photos,
          imageSources,
          totalPhotos,
        };
      })
      .filter(Boolean);

    return {
      key: asText(section?.key, `section_${sectionIndex + 1}`),
      title: asText(section?.title, `SECTION ${sectionIndex + 1}`),
      items: itemsWithContent,
    };
  }).filter((section) => section.items.length > 0);

  const chunkItems = (items, size) => {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];
    const chunks = [];
    for (let i = 0; i < list.length; i += size) {
      chunks.push(list.slice(i, i + size));
    }
    return chunks;
  };

  const pageModels = [{ type: "summary", sectionTitle: "SUMMARY", items: [] }];
  normalizedSections.forEach((section) => {
    const chunks = chunkItems(section.items, 6);
    chunks.forEach((itemsChunk) => {
      pageModels.push({
        type: "section",
        sectionTitle: section.title,
        items: itemsChunk,
        showGeneralInfo: false,
      });
    });
  });

  const bannerCandidates = [
    path.resolve(BACKEND_ROOT, "src/assets/logoagrodan.png"),
    path.resolve(BACKEND_ROOT, "../CONTROLEQUALIDADE_new/src/assets/logoagrodann.png"),
    path.resolve(BACKEND_ROOT, "../CONTROLEQUALIDADE_new/src/assets/logoagrodan.png"),
    path.resolve(BACKEND_ROOT, "../CONTROLEQUALIDADE_new/assets/logoagrodan.png"),
    path.resolve(BACKEND_ROOT, "../CONTROLEQUALIDADE_new/assets/logoagrodannn.png"),
    path.resolve(BACKEND_ROOT, "../CONTROLEQUALIDADE/assets/embarque.png"),
    path.resolve(BACKEND_ROOT, "assets/embarque.png"),
  ];
  const bannerPath = bannerCandidates.find((candidate) => fs.existsSync(candidate)) || null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    const stream = fs.createWriteStream(caminhoArquivo);
    doc.pipe(stream);

    const PAGE_MARGIN = 36;
    const CONTENT_WIDTH = doc.page.width - (PAGE_MARGIN * 2);
    const PAGE_BOTTOM_LIMIT = doc.page.height - 60;

    const drawPageBackground = () => {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFFFFF");
    };

    const drawHeaderBanner = () => {
      const topY = 24;
      const logoBoxW = 126;
      const logoBoxH = 42;
      const titleX = PAGE_MARGIN + logoBoxW + 22;

      if (bannerPath) {
        try {
          doc.image(bannerPath, PAGE_MARGIN, topY, {
            fit: [logoBoxW, logoBoxH],
            align: "left",
            valign: "center",
          });
        } catch (error) {
          console.warn("[RE] Falha ao desenhar logo do cabecalho:", error?.message || error);
          doc.fillColor("#16813A")
            .font("Helvetica-Bold")
            .fontSize(24)
            .text("AGRODAN", PAGE_MARGIN, topY + 14, {
              width: logoBoxW,
              align: "left",
              lineBreak: false,
            });
        }
      } else {
        doc.fillColor("#16813A")
          .font("Helvetica-Bold")
          .fontSize(24)
          .text("AGRODAN", PAGE_MARGIN, topY + 14, {
            width: logoBoxW,
            align: "left",
            lineBreak: false,
          });
      }

      doc.fillColor("#141414")
        .font("Helvetica-Bold")
        .fontSize(15.8)
        .text("QUALITY CONTROL REPORT", titleX, topY + 8, {
          width: CONTENT_WIDTH - (logoBoxW + 12),
          align: "left",
          lineBreak: false,
        });

      doc.fillColor("#4C534C")
        .font("Helvetica")
        .fontSize(9.2)
        .text("Controle de Qualidade", titleX, topY + 28, {
          width: CONTENT_WIDTH - (logoBoxW + 12),
          align: "left",
          lineBreak: false,
        });

      doc.moveTo(titleX, topY + 42)
        .lineTo(titleX + 26, topY + 42)
        .strokeColor("#EC8228")
        .lineWidth(1.2)
        .stroke();

      doc.moveTo(PAGE_MARGIN, topY + 56)
        .lineTo(PAGE_MARGIN + CONTENT_WIDTH, topY + 56)
        .strokeColor("#CBDBCB")
        .lineWidth(0.8)
        .stroke();

      const cqX = PAGE_MARGIN + CONTENT_WIDTH - 44;
      doc.fillColor("#EC8228")
        .font("Helvetica-Bold")
        .fontSize(26)
        .text("|", cqX, topY + 4, { lineBreak: false });
      doc.fillColor("#16813A")
        .font("Helvetica-Bold")
        .fontSize(27)
        .text("C", cqX + 14, topY + 5, { lineBreak: false });
      doc.fillColor("#EC8228")
        .font("Helvetica-Bold")
        .fontSize(27)
        .text("Q", cqX + 31, topY + 5, { lineBreak: false });

      return topY + 64;
    };

    const drawSectionHeader = (title, y, rightLabel = "") => {
      const text = asText(title).toUpperCase();
      const titleX = PAGE_MARGIN + 2;
      const titleY = y + 3;

      doc.fillColor("#1D4A2B")
        .font("Helvetica-Bold")
        .fontSize(12.8)
        .text(text, titleX, titleY, {
          width: CONTENT_WIDTH - 12,
          align: "left",
          lineBreak: false,
        });

      const textWidth = doc.widthOfString(text, { font: "Helvetica-Bold", size: 12.8 });
      const lineStartX = Math.max(PAGE_MARGIN + 160, titleX + textWidth + 16);
      const lineEndX = PAGE_MARGIN + CONTENT_WIDTH;
      if (lineStartX < lineEndX - 8) {
        doc.moveTo(lineStartX, y + 13)
          .lineTo(lineEndX, y + 13)
          .strokeColor("#CBDBCB")
          .lineWidth(0.8)
          .stroke();
      }

      if (rightLabel) {
        doc.fillColor("#8D998D")
          .font("Helvetica")
          .fontSize(8.2)
          .text(rightLabel, PAGE_MARGIN, y + 7, {
            width: CONTENT_WIDTH - 2,
            align: "right",
            lineBreak: false,
          });
      }

      return y + 21;
    };

    const drawGeneralInfo = (startY) => {
      let y = drawSectionHeader("GENERAL INFORMATION", startY);
      const tableTop = y + 4;
      const rowH = 30;
      const colW = CONTENT_WIDTH / 3;
      const rows = [
        [
          ["Customer", asText(generalInfo.customer, "-")],
          ["Container", asText(generalInfo.container, "-")],
          ["Vessel", asText(generalInfo.vessel, "-")],
        ],
        [
          ["Loading", asText(generalInfo.loading, "-")],
          ["ETD", asText(generalInfo.etd, "-")],
          ["ETA", asText(generalInfo.eta, "-")],
        ],
      ];

      rows.forEach((row, rowIndex) => {
        row.forEach(([label, value], colIndex) => {
          const x = PAGE_MARGIN + (colIndex * colW);
          const cy = tableTop + (rowIndex * rowH);
          doc.rect(x, cy, colW, rowH).fillAndStroke("#F9FBF9", "#CFDACF");

          doc.fillColor("#5F665F")
            .font("Helvetica")
            .fontSize(7.2)
            .text(label, x + 8, cy + 4, {
              width: colW - 16,
              align: "left",
              lineBreak: false,
            });

          doc.fillColor("#171717")
            .font("Helvetica-Bold")
            .fontSize(10.8)
            .text(value, x + 8, cy + 16, {
              width: colW - 16,
              align: "left",
              lineBreak: false,
            });
        });
      });

      return tableTop + (rows.length * rowH) + 16;
    };

    const drawChecklist = (startY) => {
      if (!checklistData.length) return startY;

      let y = drawSectionHeader("CHECKLIST", startY);
      y += 4;

      const rowH = 18;
      const labelColW = CONTENT_WIDTH - 80;
      const statusColW = 80;

      // Header row
      doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, rowH).fill("#1D4A2B");
      doc.fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .text("Pergunta", PAGE_MARGIN + 6, y + 5, { width: labelColW - 12, align: "left", lineBreak: false });
      doc.fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .text("Conforme", PAGE_MARGIN + labelColW + 4, y + 5, { width: statusColW - 8, align: "center", lineBreak: false });
      y += rowH;

      checklistData.forEach((item, idx) => {
        const label = asText(item?.label, `Item ${idx + 1}`);
        const value = item?.value || "";
        const temperatura = item?.temperatura || "";
        const isC = value === "C";
        const isNC = value === "NC";

        const textHeight = doc.heightOfString(label, {
          font: "Helvetica",
          size: 7,
          width: labelColW - 12,
        });
        const currentRowH = Math.max(rowH, textHeight + 10);

        if (y + currentRowH > PAGE_BOTTOM_LIMIT) {
          drawFooter(pageModels.indexOf(pageModels.find(p => p.showGeneralInfo)) + 1, totalPages);
          doc.addPage();
          drawPageBackground();
          y = drawHeaderBanner();
          y = drawSectionHeader("CHECKLIST (cont.)", y);
          y += 4;
        }

        const bgColor = idx % 2 === 0 ? "#F9FBF9" : "#FFFFFF";
        doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, currentRowH).fillAndStroke(bgColor, "#CFDACF");

        doc.fillColor("#222222")
          .font("Helvetica")
          .fontSize(7)
          .text(label, PAGE_MARGIN + 6, y + 4, { width: labelColW - 12, align: "left" });

        const statusText = isC ? (item?.usaSimNao ? "S" : "C") : isNC ? (item?.usaSimNao ? "N" : "NC") : "-";
        const statusColor = isC ? "#2E7D32" : isNC ? "#C62828" : "#999999";
        doc.fillColor(statusColor)
          .font("Helvetica-Bold")
          .fontSize(8.5)
          .text(statusText, PAGE_MARGIN + labelColW + 4, y + ((currentRowH - 10) / 2), { width: statusColW - 8, align: "center", lineBreak: false });

        if (temperatura) {
          doc.fillColor("#555555")
            .font("Helvetica")
            .fontSize(6.5)
            .text(`Temp: ${temperatura}°C`, PAGE_MARGIN + labelColW + 4, y + ((currentRowH - 10) / 2) + 10, { width: statusColW - 8, align: "center", lineBreak: false });
        }

        y += currentRowH;
      });

      return y + 12;
    };

    const drawChecklistStyled = (startY) => {
      let y = drawSectionHeader("CHECKLIST DO CONTAINER", startY);
      y += 4;

      const boxX = PAGE_MARGIN;
      const boxY = y;
      const boxW = CONTENT_WIDTH;
      const boxPadding = 9;
      const marksW = 112;
      const textW = boxW - (boxPadding * 2) - marksW - 8;

      doc.font("Helvetica").fontSize(8.4);
      const rows = normalizedChecklist.map((item, index) => {
        const fullLabel = asText(item?.label, `${index + 1}. Item`);
        const match = fullLabel.match(/^(\d+\.)\s*(.*)$/);
        const numberPart = match ? match[1] : "";
        const textPart = match ? match[2] : fullLabel;
        const numberW = numberPart ? doc.widthOfString(`${numberPart} `) : 0;
        const rowTextH = 12;
        const pos = item?.usaSimNao ? "S" : "C";
        const neg = item?.usaSimNao ? "N" : "NC";
        const value = String(item?.value || "").toUpperCase();
        const isPos = value === "C" || value === "S";
        const isNeg = value === "NC" || value === "N";
        const markText = `(${isPos ? "X" : " "}) ${pos}   (${isNeg ? "X" : " "}) ${neg}`;
        return { numberPart, numberW, textPart, rowTextH, markText };
      });

      const boxH = rows.reduce((sum, row) => sum + row.rowTextH + 2, 0) + (boxPadding * 2);
      doc.rect(boxX, boxY, boxW, boxH).lineWidth(1).strokeColor("#C6CEC6").stroke();

      let rowY = boxY + boxPadding;
      rows.forEach((row) => {
        const textX = boxX + boxPadding;
        const markX = boxX + boxW - boxPadding - marksW;

        if (row.numberPart) {
          doc.fillColor("#185D35")
            .font("Helvetica-Bold")
            .fontSize(8.4)
            .text(row.numberPart, textX, rowY, { lineBreak: false });
        }

        doc.fillColor("#222222")
          .font("Helvetica")
          .fontSize(8.4)
          .text(row.textPart, textX + row.numberW, rowY, {
            width: Math.max(100, textW - row.numberW),
            lineBreak: false,
          });

        doc.fillColor("#222222")
          .font("Helvetica")
          .fontSize(8.4)
          .text(row.markText, markX, rowY, { width: marksW, align: "left", lineBreak: false });

        rowY += row.rowTextH + 2;
      });

      return boxY + boxH + 12;
    };

    const drawImageCover = (source, x, y, w, h) => {
      try {
        const image = doc.openImage(source);
        const sourceW = Math.max(1, image?.width || 1);
        const sourceH = Math.max(1, image?.height || 1);
        const scale = Math.max(w / sourceW, h / sourceH);
        const drawW = sourceW * scale;
        const drawH = sourceH * scale;
        const drawX = x - ((drawW - w) / 2);
        const drawY = y - ((drawH - h) / 2);

        doc.save();
        doc.rect(x, y, w, h).clip();
        doc.image(source, drawX, drawY, {
          width: drawW,
          height: drawH,
        });
        doc.restore();
        return true;
      } catch (error) {
        console.warn("[RE] Falha ao desenhar imagem em cover:", error?.message || error);
        return false;
      }
    };

    const drawItemCard = (item, x, y, w, h) => {
      const imageSources = Array.isArray(item?.imageSources)
        ? item.imageSources.slice(0, 4)
        : (Array.isArray(item?.photos) ? item.photos : []).map(resolveImageSource).filter(Boolean).slice(0, 4);
      if (!imageSources.length) return false;

      const titleHeight = 18;
      const labelGap = 3;
      const boxY = y + titleHeight;
      const boxH = Math.max(72, h - titleHeight);

      doc.fillColor("#22313B")
        .font("Helvetica-Bold")
        .fontSize(10.9)
        .text(asText(item?.label, "Item"), x, y + 2, {
          width: w,
          align: "left",
          lineBreak: false,
        });

      doc.rect(x, boxY + labelGap, w, boxH - labelGap).fillAndStroke("#FDFEFD", "#CCDACB");

      const innerPad = 8;
      const innerX = x + innerPad;
      const innerY = boxY + labelGap + innerPad;
      const innerW = w - (innerPad * 2);
      const innerH = (boxH - labelGap) - (innerPad * 2);

      const totalPhotos = Number.isFinite(Number(item?.totalPhotos))
        ? Math.max(0, Math.round(Number(item.totalPhotos)))
        : imageSources.length;

      if (imageSources.length === 1) {
        drawImageCover(imageSources[0], innerX, innerY, innerW, innerH);
        return true;
      }

      const gap = 4;
      const cols = 2;
      const rows = Math.ceil(imageSources.length / cols);
      const cellW = (innerW - gap) / cols;
      const cellH = (innerH - (gap * (rows - 1))) / rows;

      imageSources.forEach((source, photoIndex) => {
        const col = photoIndex % cols;
        const row = Math.floor(photoIndex / cols);
        const cellX = innerX + (col * (cellW + gap));
        const cellY = innerY + (row * (cellH + gap));

        doc.rect(cellX, cellY, cellW, cellH).fillAndStroke("#F2F6F2", "#D5E0D5");
        drawImageCover(source, cellX, cellY, cellW, cellH);
      });

      if (totalPhotos > 4) {
        const moreCount = totalPhotos - 4;
        const badgeW = 30;
        const badgeH = 16;
        const badgeX = x + w - badgeW - 6;
        const badgeY = boxY + boxH - badgeH - 6;

        doc.rect(badgeX, badgeY, badgeW, badgeH).fill("#2E6D34");
        doc.fillColor("#FFFFFF")
          .font("Helvetica-Bold")
          .fontSize(8.2)
          .text(`+${moreCount}`, badgeX, badgeY + 4, {
            width: badgeW,
            align: "center",
            lineBreak: false,
          });
      }

      return true;
    };

    const drawFooter = (pageNumber, pageTotal) => {
      // Mantem o rodape dentro da area util para evitar pagina extra em branco.
      const footerY = doc.page.height - 66;
      doc.moveTo(PAGE_MARGIN, footerY - 8)
        .lineTo(PAGE_MARGIN + CONTENT_WIDTH, footerY - 8)
        .strokeColor("#D0D0D0")
        .lineWidth(0.7)
        .stroke();

      doc.fillColor("#7C837E")
        .font("Helvetica")
        .fontSize(7.4)
        .text("AGRODAN - QUALITY CONTROL REPORT", PAGE_MARGIN, footerY, {
          width: CONTENT_WIDTH,
          align: "center",
          lineBreak: false,
        });

      doc.fillColor("#8E9690")
        .font("Helvetica-Bold")
        .fontSize(7.7)
        .text(`${pageNumber} / ${pageTotal}`, PAGE_MARGIN, footerY + 9, {
          width: CONTENT_WIDTH,
          align: "right",
          lineBreak: false,
        });
    };

    const totalPages = pageModels.length;

    pageModels.forEach((pageModel, index) => {
      if (index > 0) doc.addPage();

      drawPageBackground();
      let cursorY = drawHeaderBanner();

      if (pageModel.type === "summary") {
        cursorY = drawGeneralInfo(cursorY);
        cursorY = drawChecklistStyled(cursorY);
      } else {
        cursorY = drawSectionHeader(pageModel.sectionTitle || "SECTION", cursorY);

        const gridTop = cursorY + 4;
        const gridBottom = PAGE_BOTTOM_LIMIT;
        const items = Array.isArray(pageModel.items) ? pageModel.items : [];

        if (items.length) {
          const cols = 2;
          const rows = Math.max(1, Math.ceil(items.length / cols));
          const gapX = 14;
          const gapY = 14;
          const cardW = (CONTENT_WIDTH - gapX) / cols;
          const gridHeight = Math.max(160, gridBottom - gridTop);
          const maxCardH = 206;
          const cardH = Math.min(maxCardH, (gridHeight - (gapY * (rows - 1))) / rows);
          const gridOffsetY = 0;

          items.forEach((item, itemIndex) => {
            const col = itemIndex % cols;
            const row = Math.floor(itemIndex / cols);
            const cardX = PAGE_MARGIN + (col * (cardW + gapX));
            const cardY = gridTop + gridOffsetY + (row * (cardH + gapY));
            drawItemCard(item, cardX, cardY, cardW, cardH);
          });
        }
      }

      drawFooter(index + 1, totalPages);
    });

    doc.end();
    stream.on("finish", () => resolve(caminhoArquivo));
    stream.on("error", reject);
  });
}

function desenharCard(doc, x, y, w, h, titulo, valor, cor) {
  doc.rect(x, y, w, h).fillColor(cor).fill();
  doc.fillColor("#ffffff")
    .fontSize(9).font("Helvetica")
    .text(titulo, x, y + 8, { width: w, align: "center" });
  doc.fontSize(22).font("Helvetica-Bold")
    .text(String(valor), x, y + 20, { width: w, align: "center" });
}

