// ─────────────────────────────────────────────────────────────────────────────
// GERADOR DE PDF — MATURAÇÃO FORÇADA
// Responsável por montar o PDF do relatório de Maturação Forçada em memória,
// usando coordenadas absolutas no formato PDF (sem biblioteca externa de layout).
// Inclui: cabeçalho com logo, dados da análise, tabela de frutos e fotos.
// Exporta: buildMaturacaoPdfReport(dados, fotos) → retorna string base64 do PDF
// Usado por: MaturacaoForcada.jsx
// ─────────────────────────────────────────────────────────────────────────────

import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Asset } from 'expo-asset';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - (PAGE_MARGIN * 2);
const PAGE_FOOTER_SAFE_BOTTOM = PAGE_HEIGHT - 34;
const COVER_EVAL_START_Y = 413;
const INLINE_PHOTO_LIMIT = 2;
const INLINE_PHOTO_COLS = 2;
const INLINE_PHOTO_GAP = 8;
const INLINE_PHOTO_MIN_CARD_H = 180;
const INLINE_PHOTO_MAX_CARD_H = 260;

const PDF_TEXT = [0.11, 0.11, 0.11];
const PDF_TEXT_LIGHT = [0.50, 0.50, 0.50];
const PDF_BORDER = [0.86, 0.87, 0.86];
const PDF_LIGHT = [0.955, 0.965, 0.955];
const PDF_SOFT = [0.985, 0.99, 0.985];
const PDF_GREEN_RGB = [0.07, 0.50, 0.24];
const PDF_GREEN_DARK = [0.05, 0.39, 0.19];
const PDF_GREEN_LIGHT = [0.93, 0.97, 0.94];
const PDF_ROW_ALT = [0.992, 0.996, 0.992];
const PDF_ORANGE_ACCENT = [0.86, 0.62, 0.34];

// Remove acentos para evitar caracteres invalidos no PDF.
const removeAccents = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

// Converte o texto para ASCII seguro antes de escrever no PDF.
const toAsciiText = (value) =>
  removeAccents(value)
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Escapa caracteres especiais para gravacao de texto no PDF.
const escapePdfText = (text) =>
  toAsciiText(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

// Quebra textos longos em linhas menores para caber no layout do PDF.
const wrapPdfText = (text, maxLength = 80) => {
  const clean = toAsciiText(text);
  if (!clean) return [''];

  const words = clean.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach((word) => {
    if (!word) return;

    if (word.length > maxLength) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }

      for (let i = 0; i < word.length; i += maxLength) {
        lines.push(word.slice(i, i + maxLength));
      }
      return;
    }

    const candidateLine = currentLine ? `${currentLine} ${word}` : word;
    if (candidateLine.length > maxLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    currentLine = candidateLine;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length ? lines : [''];
};

// Converte numeros para o formato com 2 casas usado no PDF.
const pdfNumber = (value) => Number(value.toFixed(2));

// Monta o comando de cor RGB para preenchimento/borda no PDF.
const pdfColor = (color, stroke = false) => {
  const command = stroke ? 'RG' : 'rg';
  return `${pdfNumber(color[0])} ${pdfNumber(color[1])} ${pdfNumber(color[2])} ${command}`;
};

// Garante valor textual padrao quando o campo estiver vazio no PDF.
const asPdfValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
};

// Converte texto com acentos para escapes octais PDF (WinAnsiEncoding)
const escapePdfLatin1 = (text) => {
  const str = String(text ?? '').replace(/\s+/g, ' ').trim();
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 92) { result += '\\\\'; }
    else if (code === 40) { result += '\\('; }
    else if (code === 41) { result += '\\)'; }
    else if (code >= 32 && code <= 126) { result += str[i]; }
    else if (code >= 160 && code <= 255) {
      result += '\\' + code.toString(8).padStart(3, '0');
    }
  }
  return result;
};

// Estima a largura do texto para alinhamento no PDF.
const estimatePdfTextWidth = (text, size) => {
  const clean = toAsciiText(text);
  return clean.length * size * 0.52;
};

const drawPdfText = (ops, {
  x,
  topY,
  text,
  size = 12,
  font = 'F1',
  color = PDF_TEXT,
  align = 'left',
  width = null,
  latin1 = true,
}) => {
  const clean = latin1 ? String(text ?? '') : toAsciiText(text);
  const textWidth = estimatePdfTextWidth(clean, size);
  let actualX = x;

  if (width !== null) {
    if (align === 'center') {
      actualX = x + Math.max(0, (width - textWidth) / 2);
    } else if (align === 'right') {
      actualX = x + Math.max(0, width - textWidth);
    }
  }

  const baselineY = PAGE_HEIGHT - topY - size;

  ops.push('BT');
  ops.push(`/${font} ${pdfNumber(size)} Tf`);
  ops.push(pdfColor(color));
  ops.push(`1 0 0 1 ${pdfNumber(actualX)} ${pdfNumber(baselineY)} Tm`);
  const escaped = latin1 ? escapePdfLatin1(clean) : escapePdfText(clean);
  ops.push(`(${escaped}) Tj`);
  ops.push('ET');
};

const drawPdfWrappedText = (ops, {
  x,
  topY,
  text,
  size = 12,
  font = 'F1',
  color = PDF_TEXT,
  width = CONTENT_WIDTH,
  lineHeight = size + 2,
}) => {
  const maxChars = Math.max(12, Math.floor(width / (size * 0.52)));
  const lines = wrapPdfText(text, maxChars);

  lines.forEach((line, index) => {
    drawPdfText(ops, {
      x,
      topY: topY + (index * lineHeight),
      text: line,
      size,
      font,
      color,
      width,
    });
  });

  return topY + (lines.length * lineHeight);
};

const drawPdfRect = (ops, {
  x,
  topY,
  w,
  h,
  fill = null,
  stroke = null,
  lineWidth = 1,
}) => {
  const bottomY = PAGE_HEIGHT - topY - h;

  if (fill) {
    ops.push(`${pdfColor(fill)}\n${pdfNumber(x)} ${pdfNumber(bottomY)} ${pdfNumber(w)} ${pdfNumber(h)} re f`);
  }

  if (stroke) {
    ops.push(`${pdfColor(stroke, true)}\n${pdfNumber(lineWidth)} w\n${pdfNumber(x)} ${pdfNumber(bottomY)} ${pdfNumber(w)} ${pdfNumber(h)} re S`);
  }
};

const drawPdfLine = (ops, {
  x1,
  y1,
  x2,
  y2,
  color = PDF_BORDER,
  lineWidth = 1,
  dash = null,
}) => {
  const bottomY1 = PAGE_HEIGHT - y1;
  const bottomY2 = PAGE_HEIGHT - y2;
  ops.push(`${pdfColor(color, true)}\n${pdfNumber(lineWidth)} w`);
  if (dash) {
    ops.push(`[${dash.join(' ')}] 0 d`);
  }
  ops.push(`${pdfNumber(x1)} ${pdfNumber(bottomY1)} m\n${pdfNumber(x2)} ${pdfNumber(bottomY2)} l\nS`);
  if (dash) {
    ops.push('[] 0 d');
  }
};

const drawPdfImage = (ops, {
  x,
  topY,
  w,
  h,
  imageName,
}) => {
  const bottomY = PAGE_HEIGHT - topY - h;
  ops.push(`q ${pdfNumber(w)} 0 0 ${pdfNumber(h)} ${pdfNumber(x)} ${pdfNumber(bottomY)} cm /${imageName} Do Q`);
};

// Calcula ajuste de contain.
const fitContain = (width, height, maxWidth, maxHeight) => {
  const safeWidth = Math.max(1, width || 1);
  const safeHeight = Math.max(1, height || 1);
  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1);
  return {
    width: safeWidth * scale,
    height: safeHeight * scale,
  };
};

// Agrupa array.
const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

// Prepara um recurso de foto para embutir no PDF.
const preparePdfPhotoAsset = async (uri) => {
  try {
    let resolvedUri = uri;
    if (uri && uri.includes('/cache/')) {
      const filename = uri.split('/').pop();
      const dest = `${FileSystem.documentDirectory}pdf_photo_${filename}`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      resolvedUri = dest;
    }

    const manipulated = await ImageManipulator.manipulateAsync(
      resolvedUri,
      [{ resize: { width: 1200 } }],
      {
        compress: 0.78,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    if (!manipulated?.base64) {
      return { supported: false, reason: 'Imagem sem base64' };
    }

    const buffer = Buffer.from(manipulated.base64, 'base64');
    return {
      supported: true,
      width: manipulated.width || 1,
      height: manipulated.height || 1,
      hex: buffer.toString('hex').toUpperCase(),
    };
  } catch (error) {
    console.warn('Falha ao preparar foto para PDF:', error?.message || error);
    return { supported: false, reason: error?.message || 'Falha ao preparar foto' };
  }
};

// Prepara todos os recursos de fotos para embutir no PDF.
const preparePdfPhotoAssets = async (photos = []) => {
  const entries = await Promise.all(
    photos.map(async (uri, index) => [index, await preparePdfPhotoAsset(uri)])
  );
  return new Map(entries);
};

// Desenha titulo principal da secao de resultados.
const drawCenteredTitle = (ops, topY, text) => {
  drawPdfText(ops, {
    x: PAGE_MARGIN,
    topY,
    text,
    size: 17,
    font: 'F2',
    color: PDF_TEXT,
    width: CONTENT_WIDTH,
    align: 'center',
    latin1: true,
  });

  drawPdfLine(ops, {
    x1: PAGE_MARGIN,
    y1: topY + 20,
    x2: PAGE_WIDTH - PAGE_MARGIN,
    y2: topY + 20,
    color: PDF_GREEN_LIGHT,
    lineWidth: 1,
  });
};

const LOGO_IMAGE_NAME = 'ImLogo';

// Prepara a logo para uso como recurso de imagem no PDF.
const preparePdfLogoAsset = async () => {
  try {
    const logoAsset = Asset.fromModule(require('../../../assets/logoagrodann.png'));
    if (!logoAsset.localUri) {
      await logoAsset.downloadAsync();
    }
    const manipulated = await ImageManipulator.manipulateAsync(
      logoAsset.localUri,
      [{ resize: { width: 400 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!manipulated?.base64) return { supported: false };
    const buffer = Buffer.from(manipulated.base64, 'base64');
    return {
      supported: true,
      kind: 'jpeg',
      width: manipulated.width || 1,
      height: manipulated.height || 1,
      hex: buffer.toString('hex').toUpperCase(),
    };
  } catch {
    return { supported: false };
  }
};

const drawSectionHeader = (ops, {
  topY,
  number,
  title,
  fullBar = false,
}) => {
  if (fullBar) {
    drawPdfRect(ops, {
      x: PAGE_MARGIN,
      topY,
      w: CONTENT_WIDTH,
      h: 24,
      fill: PDF_GREEN_RGB,
    });

    drawPdfText(ops, {
      x: PAGE_MARGIN,
      topY: topY + 5,
      text: title,
      size: 12.5,
      font: 'F2',
      color: [1, 1, 1],
      align: 'center',
      width: CONTENT_WIDTH,
      latin1: true,
    });

    return 30;
  }

  drawPdfRect(ops, {
    x: PAGE_MARGIN,
    topY: topY + 1,
    w: 32,
    h: 22,
    fill: PDF_GREEN_RGB,
  });

  drawPdfText(ops, {
    x: PAGE_MARGIN,
    topY: topY + 5,
    text: String(number),
    size: 13,
    font: 'F2',
    color: [1, 1, 1],
    align: 'center',
    width: 32,
  });

  drawPdfText(ops, {
    x: PAGE_MARGIN + 38,
    topY: topY + 3,
    text: title.toUpperCase(),
    size: 14,
    font: 'F2',
    color: PDF_TEXT,
    latin1: true,
  });

  drawPdfLine(ops, {
    x1: PAGE_MARGIN,
    y1: topY + 26,
    x2: PAGE_WIDTH - PAGE_MARGIN,
    y2: topY + 26,
    color: PDF_GREEN_LIGHT,
    lineWidth: 1,
  });

  return 32;
};

const drawRowItem = (ops, {
  topY,
  number,
  label,
  value,
  labelWidth = 350,
  valueWidth = 150,
  lineHeight = 13,
  minHeight = 19,
}) => {
  const labelText = `${number} - ${toAsciiText(label)}`;
  const safeValue = asPdfValue(value);
  const labelLines = wrapPdfText(labelText, Math.max(12, Math.floor(labelWidth / (11 * 0.52))));
  const valueLines = wrapPdfText(safeValue, Math.max(8, Math.floor(valueWidth / (11 * 0.52))));
  const rowHeight = Math.max(minHeight, labelLines.length * lineHeight, valueLines.length * lineHeight);

  drawPdfWrappedText(ops, {
    x: PAGE_MARGIN,
    topY,
    text: labelText,
    size: 11,
    font: 'F2',
    color: PDF_TEXT,
    width: labelWidth,
    lineHeight,
  });

  drawPdfWrappedText(ops, {
    x: PAGE_MARGIN + labelWidth + 12,
    topY,
    text: safeValue,
    size: 11,
    font: 'F1',
    color: [0.14, 0.14, 0.14],
    width: valueWidth,
    lineHeight,
  });

  drawPdfLine(ops, {
    x1: PAGE_MARGIN,
    y1: topY + rowHeight,
    x2: PAGE_WIDTH - PAGE_MARGIN,
    y2: topY + rowHeight,
    color: PDF_BORDER,
    lineWidth: 0.8,
  });

  return rowHeight + 3;
};

const drawPhotoCard = (ops, {
  x,
  topY,
  w,
  h,
  label,
  asset,
  imageName,
}) => {
  drawPdfRect(ops, {
    x,
    topY,
    w,
    h,
    fill: [1, 1, 1],
    stroke: PDF_BORDER,
    lineWidth: 1,
  });

  const innerTop = topY + 7;
  const innerWidth = w - 14;
  const innerHeight = h - 14;

  if (asset?.supported && imageName) {
    const fitted = fitContain(asset.width, asset.height, innerWidth, innerHeight);
    const imageX = x + ((w - fitted.width) / 2);
    const imageY = innerTop + ((innerHeight - fitted.height) / 2);

    drawPdfImage(ops, {
      x: imageX,
      topY: imageY,
      w: fitted.width,
      h: fitted.height,
      imageName,
    });
  } else {
    drawPdfRect(ops, {
      x: x + 7,
      topY: innerTop,
      w: w - 14,
      h: innerHeight,
      fill: PDF_SOFT,
      stroke: PDF_BORDER,
      lineWidth: 0.8,
    });

    drawPdfText(ops, {
      x: x + 7,
      topY: innerTop + (innerHeight / 2) - 8,
      text: 'Foto indisponível',
      size: 10.5,
      font: 'F2',
      color: PDF_TEXT_LIGHT,
      align: 'center',
      width: w - 14,
      latin1: true,
    });
  }
};

const drawInlinePhotosAfterChart = (ops, {
  topY,
  photoIndices,
  imageNameMap,
  imageAssetMap,
}) => {
  if (!Array.isArray(photoIndices) || !photoIndices.length) return 0;

  let cursorY = topY + 8;
  cursorY += drawSectionHeader(ops, { topY: cursorY, number: 3, title: 'FOTOS' });

  const gap = INLINE_PHOTO_GAP;
  const cols = INLINE_PHOTO_COLS;
  const cardW = (CONTENT_WIDTH - gap) / cols;
  const minCardH = INLINE_PHOTO_MIN_CARD_H;
  const maxCardH = INLINE_PHOTO_MAX_CARD_H;
  const availableH = Math.max(0, (PAGE_FOOTER_SAFE_BOTTOM - 6) - cursorY);
  const rowsThatFit = Math.floor((availableH + gap) / (minCardH + gap));
  if (rowsThatFit <= 0) return cursorY - topY;

  const maxPhotos = Math.min(INLINE_PHOTO_LIMIT, rowsThatFit * cols);
  const renderIndices = photoIndices.slice(0, maxPhotos);
  const rows = Math.max(1, Math.ceil(renderIndices.length / cols));
  const cardH = Math.min(maxCardH, Math.max(minCardH, (availableH - ((rows - 1) * gap)) / rows));

  renderIndices.forEach((photoIndex, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    drawPhotoCard(ops, {
      x: PAGE_MARGIN + col * (cardW + gap),
      topY: cursorY + row * (cardH + gap),
      w: cardW,
      h: cardH,
      label: `Foto ${photoIndex + 1}`,
      asset: imageAssetMap.get(photoIndex),
      imageName: imageNameMap.get(photoIndex),
    });
  });

  cursorY += rows * cardH + Math.max(0, rows - 1) * gap;

  return cursorY - topY;
};

// Calcula o percentual considerando quantidade e total informados.
const pct = (count, total) => {
  const n = parseInt(count) || 0;
  const t = parseInt(total) || 0;
  if (t === 0 || n === 0) return '-';
  return `${((n / t) * 100).toFixed(2).replace('.', ',')}%`;
};

const toPdfInt = (value) => parseInt(value, 10) || 0;
const sumPdfInt = (value) => (Array.isArray(value) ? value.reduce((sum, item) => sum + toPdfInt(item), 0) : toPdfInt(value));

const drawReportHeader = (ops, { data, logoAsset }) => {
  const headerTop = 18;
  const logoX = PAGE_MARGIN;
  const logoY = headerTop + 4;
  const logoMaxW = 155;
  const logoMaxH = 34;
  let logoDrawW = logoMaxW;

  drawPdfLine(ops, {
    x1: PAGE_MARGIN - 7,
    y1: headerTop + 1,
    x2: PAGE_MARGIN - 7,
    y2: headerTop + 39,
    color: PDF_GREEN_RGB,
    lineWidth: 2.2,
  });

  if (logoAsset?.supported) {
    const fitted = fitContain(logoAsset.width, logoAsset.height, logoMaxW, logoMaxH);
    logoDrawW = fitted.width;
    drawPdfImage(ops, {
      x: logoX,
      topY: logoY + ((logoMaxH - fitted.height) / 2),
      w: fitted.width,
      h: fitted.height,
      imageName: LOGO_IMAGE_NAME,
    });
  } else {
    logoDrawW = 125;
    drawPdfText(ops, {
      x: logoX,
      topY: logoY + 4,
      text: 'AGRODAN',
      size: 24,
      font: 'F2',
      color: PDF_GREEN_RGB,
    });
  }

  const titleX = logoX + logoDrawW + 10;
  drawPdfText(ops, {
    x: titleX,
    topY: headerTop + 10,
    text: 'ANÁLISE DE MATURAÇÃO FORÇADA',
    size: 15.8,
    font: 'F2',
    color: [0, 0, 0],
    latin1: true,
  });
  drawPdfText(ops, {
    x: titleX,
    topY: headerTop + 29,
    text: 'CONTROLE DE QUALIDADE',
    size: 9.4,
    font: 'F2',
    color: [0, 0, 0],
  });

  const lineY = headerTop + 50;
  drawPdfLine(ops, {
    x1: PAGE_MARGIN,
    y1: lineY,
    x2: PAGE_WIDTH - PAGE_MARGIN,
    y2: lineY,
    color: PDF_GREEN_RGB,
    lineWidth: 0.9,
  });

  return lineY + 6;
};

const drawTopInfoPairRow = (ops, {
  x,
  topY,
  w,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}) => {
  const rowH = 20;
  const pairGap = 8;
  const halfW = (w - pairGap) / 2;
  const labelColor = PDF_GREEN_DARK;
  const valueColor = [0.15, 0.15, 0.15];
  const leftLabelW = 62;
  const rightLabelW = 46;

  drawPdfText(ops, {
    x: x + 8,
    topY: topY + 5,
    text: `${leftLabel}:`,
    size: 9.3,
    font: 'F2',
    color: labelColor,
    latin1: true,
  });
  drawPdfText(ops, {
    x: x + 8 + leftLabelW,
    topY: topY + 5,
    text: asPdfValue(leftValue),
    size: 9.3,
    font: 'F1',
    color: valueColor,
    width: halfW - leftLabelW - 12,
    latin1: true,
  });

  const rightX = x + halfW + pairGap;
  drawPdfText(ops, {
    x: rightX + 2,
    topY: topY + 5,
    text: `${rightLabel}:`,
    size: 9.3,
    font: 'F2',
    color: labelColor,
    latin1: true,
  });
  drawPdfText(ops, {
    x: rightX + 2 + rightLabelW,
    topY: topY + 5,
    text: asPdfValue(rightValue),
    size: 9.3,
    font: 'F1',
    color: valueColor,
    width: halfW - rightLabelW - 12,
    latin1: true,
  });

  drawPdfLine(ops, {
    x1: x + 8,
    y1: topY + rowH,
    x2: x + w - 8,
    y2: topY + rowH,
    color: [0.88, 0.90, 0.88],
    lineWidth: 0.45,
  });

  return rowH;
};

const drawTopHeaderGrid = (ops, { topY, data }) => {
  const boxX = PAGE_MARGIN;
  const boxW = CONTENT_WIDTH;
  const boxH = 58;
  const topInset = 7;

  drawPdfRect(ops, {
    x: boxX,
    topY,
    w: boxW,
    h: boxH,
    fill: [0.985, 0.988, 0.985],
    stroke: PDF_BORDER,
    lineWidth: 0.8,
  });

  drawTopInfoPairRow(ops, {
    x: boxX,
    topY: topY + topInset,
    w: boxW,
    leftLabel: 'Avaliador',
    leftValue: data.responsavel || 'Priscilla Araújo Dantas',
    rightLabel: 'Inicial',
    rightValue: data.dataRec || data.dataAna || '-',
  });

  drawTopInfoPairRow(ops, {
    x: boxX,
    topY: topY + topInset + 22,
    w: boxW,
    leftLabel: 'Avaliado',
    leftValue: 'Controle de qualidade - Packing Manga',
    rightLabel: 'Fim',
    rightValue: data.dataAna || '-',
  });

  return boxH + 8;
};

const formatPctValue = (value) => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;

const drawClassicDataRows = (ops, { topY, rows }) => {
  const rowH = 19;
  const labelW = 332;
  const valueW = CONTENT_WIDTH - labelW - 12;
  let y = topY;

  drawPdfLine(ops, {
    x1: PAGE_MARGIN,
    y1: y,
    x2: PAGE_WIDTH - PAGE_MARGIN,
    y2: y,
    color: PDF_BORDER,
    lineWidth: 0.7,
  });

  rows.forEach(([number, label, value]) => {
    drawPdfText(ops, {
      x: PAGE_MARGIN + 2,
      topY: y + 5,
      text: `${number} - ${label}`,
      size: 10.2,
      font: 'F2',
      color: PDF_TEXT,
      width: labelW,
      latin1: true,
    });

    drawPdfText(ops, {
      x: PAGE_MARGIN + labelW + 10,
      topY: y + 5,
      text: asPdfValue(value),
      size: 10.2,
      font: 'F1',
      color: PDF_TEXT,
      width: valueW,
      align: 'left',
      latin1: true,
    });

    y += rowH;
    drawPdfLine(ops, {
      x1: PAGE_MARGIN,
      y1: y,
      x2: PAGE_WIDTH - PAGE_MARGIN,
      y2: y,
      color: PDF_BORDER,
      lineWidth: 0.7,
    });
  });

  return (rows.length * rowH) + 6;
};

const drawSummaryCards = (ops, {
  topY,
  analyzed,
  damaged,
  incidence,
}) => {
  const gap = 10;
  const cardW = (CONTENT_WIDTH - (gap * 2)) / 3;
  const cardH = 52;
  const cards = [
    { label: 'Frutos analisados', value: String(analyzed) },
    { label: 'Frutos com danos', value: String(damaged) },
    { label: 'Percentual total', value: incidence },
  ];

  cards.forEach((card, index) => {
    const x = PAGE_MARGIN + index * (cardW + gap);
    drawPdfRect(ops, {
      x,
      topY,
      w: cardW,
      h: cardH,
      fill: [1, 1, 1],
      stroke: PDF_BORDER,
      lineWidth: 0.8,
    });
    drawPdfRect(ops, {
      x,
      topY,
      w: cardW,
      h: 1.8,
      fill: PDF_ORANGE_ACCENT,
    });
    drawPdfRect(ops, {
      x,
      topY: topY + 1.8,
      w: cardW,
      h: 12.2,
      fill: PDF_GREEN_LIGHT,
    });
    drawPdfText(ops, {
      x: x + 8,
      topY: topY + 3.2,
      text: card.label.toUpperCase(),
      size: 8.1,
      font: 'F1',
      color: PDF_GREEN_DARK,
    });
    drawPdfText(ops, {
      x,
      topY: topY + 24,
      text: card.value,
      size: 16.5,
      font: 'F2',
      color: index === 2 ? PDF_ORANGE_ACCENT : PDF_TEXT,
      width: cardW,
      align: 'center',
    });
  });

  return cardH + 10;
};

const drawDamageDistributionChart = (ops, { topY, data, total }) => {
  const safeTotal = Math.max(1, toPdfInt(total));
  const categoriasBase = [
    { label: 'Tecido Esponjoso', count: toPdfInt(data.te) },
    { label: 'Antracnose', count: toPdfInt(data.antracnose) },
    { label: 'Colapso', count: toPdfInt(data.colapso) },
    { label: 'Germinação', count: toPdfInt(data.germinacao) },
    { label: 'Alternária', count: toPdfInt(data.alternaria) },
    { label: 'Podridão Caroço Leve', count: Array.isArray(data.pc) ? toPdfInt(data.pc[0]) : 0 },
    { label: 'Podridão Caroço Moderado', count: Array.isArray(data.pc) ? toPdfInt(data.pc[1]) : 0 },
    { label: 'Podridão Caroço Severo', count: Array.isArray(data.pc) ? toPdfInt(data.pc[2]) : 0 },
    { label: 'Distúrbio Fis. Leve', count: Array.isArray(data.df) ? toPdfInt(data.df[0]) : 0 },
    { label: 'Distúrbio Fis. Moderado', count: Array.isArray(data.df) ? toPdfInt(data.df[1]) : 0 },
    { label: 'Distúrbio Fis. Severo', count: Array.isArray(data.df) ? toPdfInt(data.df[2]) : 0 },
    { label: 'Podridão Ped. Leve', count: Array.isArray(data.peduncular) ? toPdfInt(data.peduncular[0]) : 0 },
    { label: 'Podridão Ped. Moderado', count: Array.isArray(data.peduncular) ? toPdfInt(data.peduncular[1]) : 0 },
    { label: 'Podridão Ped. Severo', count: Array.isArray(data.peduncular) ? toPdfInt(data.peduncular[2]) : 0 },
  ];

  const diagnosticosAtivos = categoriasBase
    .filter((item) => item.count > 0)
    .sort((a, b) => (a.count - b.count) || a.label.localeCompare(b.label));
  let chartData = (diagnosticosAtivos.length ? diagnosticosAtivos : categoriasBase.filter((item) => item.label === 'Tecido Esponjoso'))
    .map((item) => ({
      ...item,
      pct: (item.count / safeTotal) * 100,
    }));

  const rowH = 18;
  const chartRows = Math.max(chartData.length, 1);
  const chartH = rowH * chartRows;
  const panelH = chartH + 66;
  const panelX = PAGE_MARGIN;
  const panelW = CONTENT_WIDTH;
  const labelW = 110;
  const chartX = panelX + labelW + 14;
  const chartTop = topY + 24;
  const chartW = panelW - labelW - 24;

  if (!chartData.length) {
    chartData = [{ label: 'Sem diagnóstico com quantidade', count: 0, pct: 0 }];
  }

  const maxPct = Math.max(10, ...chartData.map((item) => item.pct));
  const axisStep = maxPct <= 10 ? 2 : (maxPct <= 25 ? 5 : 10);
  const axisMax = Math.ceil(maxPct / axisStep) * axisStep;
  const ticks = 5;

  drawPdfRect(ops, {
    x: panelX,
    topY,
    w: panelW,
    h: panelH,
    fill: [0.97, 0.98, 0.98],
    stroke: PDF_BORDER,
    lineWidth: 0.9,
  });
  drawPdfText(ops, {
    x: panelX + 12,
    topY: topY + 10,
    text: 'DISTRIBUIÇÃO DE DANOS INTERNOS (%)',
    size: 9.4,
    font: 'F2',
    color: [0.12, 0.27, 0.20],
    latin1: true,
  });

  for (let i = 0; i <= ticks; i += 1) {
    const tickPct = (axisMax / ticks) * i;
    const x = chartX + (chartW * (tickPct / axisMax));

    drawPdfLine(ops, {
      x1: x,
      y1: chartTop - 4,
      x2: x,
      y2: chartTop + chartH + 2,
      color: [0.90, 0.92, 0.90],
      lineWidth: 0.5,
    });

    drawPdfText(ops, {
      x: x - 10,
      topY: chartTop + chartH + 6,
      text: `${tickPct.toFixed(0)}%`,
      size: 6.6,
      font: 'F1',
      color: PDF_TEXT_LIGHT,
      width: 20,
      align: 'center',
    });
  }

  chartData.forEach((item, index) => {
    const y = chartTop + index * rowH;
    const barH = 13;
    const rawBarW = item.pct <= 0 ? 0 : (item.pct / axisMax) * chartW;
    const barW = rawBarW <= 0 ? 0 : Math.min(chartW, Math.max(2, rawBarW));
    const shadeRatio = axisMax > 0 ? Math.max(0, Math.min(1, item.pct / axisMax)) : 0;
    const lightGreen = [0.66, 0.86, 0.69];
    const darkGreen = [0.05, 0.39, 0.19];
    const barColor = [
      lightGreen[0] + ((darkGreen[0] - lightGreen[0]) * shadeRatio),
      lightGreen[1] + ((darkGreen[1] - lightGreen[1]) * shadeRatio),
      lightGreen[2] + ((darkGreen[2] - lightGreen[2]) * shadeRatio),
    ];

    drawPdfRect(ops, {
      x: chartX,
      topY: y + 3.5,
      w: barW,
      h: barH,
      fill: barColor,
      stroke: null,
    });

    drawPdfText(ops, {
      x: panelX + 8,
      topY: y + 4,
      text: item.label,
      size: 8.4,
      font: 'F1',
      color: [0.25, 0.25, 0.25],
      width: labelW - 8,
      align: 'right',
      latin1: true,
    });

    drawPdfText(ops, {
      x: chartX + barW + 4,
      topY: y + 4,
      text: `${item.pct.toFixed(1).replace('.', ',')}%`,
      size: 7.8,
      font: 'F2',
      color: PDF_TEXT_LIGHT,
      width: 34,
    });
  });

  drawPdfText(ops, {
    x: chartX,
    topY: chartTop + chartH + 18,
    text: 'Percentual dos danos internos',
    size: 7.2,
    font: 'F1',
    color: PDF_TEXT_LIGHT,
    width: chartW,
    align: 'center',
    latin1: true,
  });

  return panelH + 6;
};

const drawObservationsBlock = (ops, { topY, text }) => {
  const content = asPdfValue(text);
  const maxChars = Math.max(16, Math.floor((CONTENT_WIDTH - 20) / (10.3 * 0.52)));
  const lines = wrapPdfText(content, maxChars);
  const lineHeight = 12;
  const minH = 52;
  const boxH = Math.max(minH, 26 + (lines.length * lineHeight));

  drawPdfRect(ops, {
    x: PAGE_MARGIN,
    topY,
    w: CONTENT_WIDTH,
    h: boxH,
    fill: [1, 1, 1],
    stroke: PDF_BORDER,
    lineWidth: 0.8,
  });
  drawPdfRect(ops, {
    x: PAGE_MARGIN,
    topY,
    w: CONTENT_WIDTH,
    h: 16,
    fill: PDF_GREEN_LIGHT,
  });
  drawPdfText(ops, {
    x: PAGE_MARGIN + 8,
    topY: topY + 4,
    text: 'OBSERVAÇÕES FINAIS',
    size: 8.4,
    font: 'F1',
    color: PDF_GREEN_DARK,
    latin1: true,
  });

  lines.forEach((line, index) => {
    drawPdfText(ops, {
      x: PAGE_MARGIN + 8,
      topY: topY + 22 + (index * lineHeight),
      text: line,
      size: 10.3,
      font: 'F1',
      color: PDF_TEXT,
      width: CONTENT_WIDTH - 16,
      latin1: true,
    });
  });

  return boxH + 8;
};

// ── Rodapé padrão ────────────────────────────────────────────
const drawPageFooter = (ops, pageNumber, pageTotal) => {
  const fy = PAGE_HEIGHT - 22;
  drawPdfLine(ops, { x1: PAGE_MARGIN, y1: fy - 6, x2: PAGE_WIDTH - PAGE_MARGIN, y2: fy - 6, color: PDF_BORDER, lineWidth: 0.5 });
  drawPdfText(ops, { x: PAGE_MARGIN, topY: fy, text: `${pageNumber} / ${pageTotal}`, size: 7.5, font: 'F2', color: PDF_TEXT_LIGHT, align: 'right', width: CONTENT_WIDTH });
};

// Desenha eval table header.
const drawEvalTableHeader = (ops, topY) => {
  const tableX = PAGE_MARGIN;
  const tableW = CONTENT_WIDTH;
  const qtyW = 76;
  const pctW = 82;
  const labelW = tableW - qtyW - pctW;

  drawPdfRect(ops, {
    x: tableX,
    topY,
    w: tableW,
    h: 24,
    fill: [0.95, 0.96, 0.95],
    stroke: PDF_BORDER,
    lineWidth: 0.8,
  });
  drawPdfLine(ops, { x1: tableX + labelW, y1: topY, x2: tableX + labelW, y2: topY + 24, color: PDF_BORDER, lineWidth: 0.7 });
  drawPdfLine(ops, { x1: tableX + labelW + qtyW, y1: topY, x2: tableX + labelW + qtyW, y2: topY + 24, color: PDF_BORDER, lineWidth: 0.7 });

  drawPdfText(ops, {
    x: tableX + 8,
    topY: topY + 7,
    text: 'DIAGNÓSTICO',
    size: 10,
    font: 'F2',
    color: PDF_TEXT,
    latin1: true,
  });
  drawPdfText(ops, {
    x: tableX + labelW,
    topY: topY + 7,
    text: 'QTD',
    size: 10.2,
    font: 'F2',
    color: PDF_TEXT,
    align: 'center',
    width: qtyW,
  });
  drawPdfText(ops, {
    x: tableX + labelW + qtyW,
    topY: topY + 7,
    text: '%',
    size: 10.2,
    font: 'F2',
    color: PDF_TEXT,
    align: 'center',
    width: pctW,
    latin1: true,
  });

  return 24;
};

// Desenha eval row.
const drawEvalRow = (ops, { topY, number, label, count, total, highlight = false, rowIndex = 0 }) => {
  const tableX = PAGE_MARGIN;
  const tableW = CONTENT_WIDTH;
  const qtyW = 76;
  const pctW = 82;
  const labelW = tableW - qtyW - pctW;
  const h = 24;
  const rowFill = highlight ? PDF_GREEN_RGB : (rowIndex % 2 === 0 ? [1, 1, 1] : PDF_ROW_ALT);

  drawPdfRect(ops, {
    x: tableX,
    topY,
    w: tableW,
    h,
    fill: rowFill,
    stroke: PDF_BORDER,
    lineWidth: 0.55,
  });
  drawPdfLine(ops, { x1: tableX + labelW, y1: topY, x2: tableX + labelW, y2: topY + h, color: PDF_BORDER, lineWidth: 0.55 });
  drawPdfLine(ops, { x1: tableX + labelW + qtyW, y1: topY, x2: tableX + labelW + qtyW, y2: topY + h, color: PDF_BORDER, lineWidth: 0.55 });

  const textColor = highlight ? [1, 1, 1] : PDF_TEXT;
  const countVal = toPdfInt(count);
  const pctVal = pct(count, total);
  const showPct = toPdfInt(total) > 0 && countVal > 0;

  drawPdfText(ops, {
    x: tableX + 8,
    topY: topY + 7,
    text: `${number} - ${label}`,
    size: 10,
    font: highlight ? 'F2' : 'F1',
    color: textColor,
    latin1: true,
  });

  drawPdfText(ops, {
    x: tableX + labelW,
    topY: topY + 7,
    text: String(countVal),
    size: 10,
    font: highlight ? 'F2' : 'F1',
    color: highlight ? [1, 1, 1] : (countVal > 0 ? PDF_GREEN_RGB : PDF_TEXT_LIGHT),
    align: 'center',
    width: qtyW,
  });

  drawPdfText(ops, {
    x: tableX + labelW + qtyW,
    topY: topY + 7,
    text: showPct ? pctVal : '-',
    size: 10,
    font: highlight ? 'F2' : 'F1',
    color: highlight ? [1, 1, 1] : (showPct ? PDF_GREEN_RGB : PDF_TEXT_LIGHT),
    align: 'center',
    width: pctW,
  });

  return h;
};

const getEvaluationDataset = (data) => {
  const evalItems = [
    ['Tecido Esponjoso', data.te || '0'],
    ['Podridão de Caroço - Leve', Array.isArray(data.pc) ? (data.pc[0] || '0') : '0'],
    ['Podridão de Caroço - Moderado', Array.isArray(data.pc) ? (data.pc[1] || '0') : '0'],
    ['Podridão de Caroço - Severo', Array.isArray(data.pc) ? (data.pc[2] || '0') : '0'],
    ['Distúrbio Fisiológico - Leve', Array.isArray(data.df) ? (data.df[0] || '0') : '0'],
    ['Distúrbio Fisiológico - Moderado', Array.isArray(data.df) ? (data.df[1] || '0') : '0'],
    ['Distúrbio Fisiológico - Severo', Array.isArray(data.df) ? (data.df[2] || '0') : '0'],
    ['Podridão Peduncular - Leve', Array.isArray(data.peduncular) ? (data.peduncular[0] || '0') : '0'],
    ['Podridão Peduncular - Moderado', Array.isArray(data.peduncular) ? (data.peduncular[1] || '0') : '0'],
    ['Podridão Peduncular - Severo', Array.isArray(data.peduncular) ? (data.peduncular[2] || '0') : '0'],
    ['Antracnose', data.antracnose || '0'],
    ['Colapso', data.colapso || '0'],
    ['Germinação', data.germinacao || '0'],
    ['Alternária', data.alternaria || '0'],
  ];

  const activeEvalItems = evalItems
    .filter(([, count]) => toPdfInt(count) > 0)
    .sort((a, b) => {
      const diff = toPdfInt(a[1]) - toPdfInt(b[1]);
      return diff !== 0 ? diff : String(a[0]).localeCompare(String(b[0]));
    });
  const rowsToRender = activeEvalItems.length
    ? activeEvalItems
    : [['Sem diagnóstico informado', '0']];

  return { activeEvalItems, rowsToRender };
};

const EVAL_SECTION_HEADER_H = 32;
const EVAL_TABLE_HEADER_H = 24;
const EVAL_ROW_H = 24;
const EVAL_GAP_BEFORE_TOTAL_PCT_H = 8;
const EVAL_TOTAL_PCT_BOX_H = 32;
const EVALUATION_PAGE_SECTION_TOP = 24;

const estimateEvaluationChartRows = (data) => {
  const categories = [
    sumPdfInt(data.te),
    toPdfInt(data.antracnose),
    toPdfInt(data.colapso),
    toPdfInt(data.germinacao),
    toPdfInt(data.alternaria),
    Array.isArray(data.pc) ? toPdfInt(data.pc[0]) : 0,
    Array.isArray(data.pc) ? toPdfInt(data.pc[1]) : 0,
    Array.isArray(data.pc) ? toPdfInt(data.pc[2]) : 0,
    Array.isArray(data.df) ? toPdfInt(data.df[0]) : 0,
    Array.isArray(data.df) ? toPdfInt(data.df[1]) : 0,
    Array.isArray(data.df) ? toPdfInt(data.df[2]) : 0,
    Array.isArray(data.peduncular) ? toPdfInt(data.peduncular[0]) : 0,
    Array.isArray(data.peduncular) ? toPdfInt(data.peduncular[1]) : 0,
    Array.isArray(data.peduncular) ? toPdfInt(data.peduncular[2]) : 0,
  ];

  const activeCount = categories.filter((value) => value > 0).length;
  return Math.max(activeCount, 1);
};

const estimateEvaluationSummaryBlockHeight = (data) => {
  const chartRows = estimateEvaluationChartRows(data);
  const chartHeight = (chartRows * 18) + 72;
  return EVAL_GAP_BEFORE_TOTAL_PCT_H + EVAL_TOTAL_PCT_BOX_H + chartHeight;
};

const estimateEvaluationRowsCapacity = ({
  availableHeight,
  includeTotalRow = false,
  includeSummaryPanel = false,
  data,
}) => {
  let usable = availableHeight - EVAL_SECTION_HEADER_H - EVAL_TABLE_HEADER_H;
  if (includeTotalRow) {
    usable -= EVAL_ROW_H;
  }
  if (includeSummaryPanel) {
    usable -= estimateEvaluationSummaryBlockHeight(data);
  }
  return Math.max(0, Math.floor(usable / EVAL_ROW_H));
};

const estimateInlinePhotoCapacity = ({ data, evaluationPlan }) => {
  const summaryOnCover = evaluationPlan?.coverSegment?.includeSummaryPanel;
  const summarySegment = summaryOnCover
    ? evaluationPlan.coverSegment
    : (evaluationPlan?.continuationSegments || []).find((segment) => segment.includeSummaryPanel);

  if (!summarySegment) return 0;

  const startTopY = summaryOnCover ? COVER_EVAL_START_Y : EVALUATION_PAGE_SECTION_TOP;
  let cursorY = startTopY;

  if (summaryOnCover) {
    cursorY += EVAL_SECTION_HEADER_H;
  }

  const rowsCount = Math.max(0, summarySegment.count || 0);
  const shouldRenderTable = rowsCount > 0 || summarySegment.includeTotalRow;
  if (shouldRenderTable) {
    cursorY += EVAL_TABLE_HEADER_H;
    cursorY += rowsCount * EVAL_ROW_H;
  }
  if (summarySegment.includeTotalRow) {
    cursorY += EVAL_ROW_H;
  }

  if (!summarySegment.includeSummaryPanel) {
    return 0;
  }

  const chartRows = estimateEvaluationChartRows(data);
  cursorY += EVAL_GAP_BEFORE_TOTAL_PCT_H + EVAL_TOTAL_PCT_BOX_H;
  cursorY += (chartRows * 18) + 72;

  const availableH = Math.max(0, (PAGE_FOOTER_SAFE_BOTTOM - 6) - cursorY);
  const rowsThatFit = Math.floor((availableH + INLINE_PHOTO_GAP) / (INLINE_PHOTO_MIN_CARD_H + INLINE_PHOTO_GAP));
  if (rowsThatFit <= 0) return 0;

  return Math.min(INLINE_PHOTO_LIMIT, rowsThatFit * INLINE_PHOTO_COLS);
};

const buildEvaluationPaginationPlan = ({ data, coverAvailable, continuationAvailable }) => {
  const { rowsToRender } = getEvaluationDataset(data);
  const diagnosticRows = rowsToRender.map(([label, count], index) => ({ label, count, index }));
  const totalRowNumber = `3.${diagnosticRows.length + 1}`;

  const coverCapacityWithSummary = estimateEvaluationRowsCapacity({
    availableHeight: coverAvailable,
    includeTotalRow: true,
    includeSummaryPanel: true,
    data,
  });
  if (diagnosticRows.length <= coverCapacityWithSummary) {
    return {
      diagnosticRows,
      totalRowNumber,
      coverSegment: {
        startIndex: 0,
        count: diagnosticRows.length,
        includeTotalRow: true,
        includeSummaryPanel: true,
      },
      continuationSegments: [],
    };
  }

  const coverCapacityWithTotalOnly = estimateEvaluationRowsCapacity({
    availableHeight: coverAvailable,
    includeTotalRow: true,
    includeSummaryPanel: false,
    data,
  });
  const coverCapacityNoSummary = estimateEvaluationRowsCapacity({
    availableHeight: coverAvailable,
    includeTotalRow: false,
    includeSummaryPanel: false,
    data,
  });
  const continuationCapacityNoSummary = estimateEvaluationRowsCapacity({
    availableHeight: continuationAvailable,
    includeTotalRow: false,
    includeSummaryPanel: false,
    data,
  });
  const continuationCapacityWithSummary = estimateEvaluationRowsCapacity({
    availableHeight: continuationAvailable,
    includeTotalRow: true,
    includeSummaryPanel: true,
    data,
  });

  if (diagnosticRows.length <= coverCapacityWithTotalOnly) {
    return {
      diagnosticRows,
      totalRowNumber,
      coverSegment: {
        startIndex: 0,
        count: diagnosticRows.length,
        includeTotalRow: true,
        includeSummaryPanel: false,
      },
      continuationSegments: [
        {
          startIndex: diagnosticRows.length,
          count: 0,
          includeTotalRow: false,
          includeSummaryPanel: true,
        },
      ],
    };
  }

  let coverCount = Math.min(coverCapacityNoSummary, diagnosticRows.length);

  const coverSegment = coverCount > 0
    ? { startIndex: 0, count: coverCount, includeTotalRow: false, includeSummaryPanel: false }
    : null;

  const continuationSegments = [];
  let startIndex = coverCount;
  let remaining = diagnosticRows.length - coverCount;

  while (
    remaining > continuationCapacityWithSummary
    && continuationCapacityNoSummary > 0
  ) {
    const maxForPage = remaining - continuationCapacityWithSummary;
    const pageCount = Math.min(continuationCapacityNoSummary, maxForPage);
    if (pageCount <= 0) break;
    continuationSegments.push({
      startIndex,
      count: pageCount,
      includeTotalRow: false,
      includeSummaryPanel: false,
    });
    startIndex += pageCount;
    remaining -= pageCount;
  }

  continuationSegments.push({
    startIndex,
    count: Math.max(0, remaining),
    includeTotalRow: true,
    includeSummaryPanel: true,
  });

  return {
    diagnosticRows,
    totalRowNumber,
    coverSegment,
    continuationSegments,
  };
};

const drawEvaluationSectionSegment = (ops, {
  topY,
  data,
  analyzed,
  incidence,
  diagnosticRows,
  totalRowNumber,
  segment,
  showSectionHeader = true,
  photoIndices = [],
  imageNameMap = new Map(),
  imageAssetMap = new Map(),
}) => {
  let cursorY = topY;

  if (showSectionHeader) {
    cursorY += drawSectionHeader(ops, { topY: cursorY, number: 3, title: 'AVALIAÇÃO - DANOS INTERNOS' });
  }

  const rows = diagnosticRows.slice(segment.startIndex, segment.startIndex + segment.count);
  const shouldRenderTable = rows.length > 0 || segment.includeTotalRow;
  if (shouldRenderTable) {
    cursorY += drawEvalTableHeader(ops, cursorY);

    rows.forEach(({ label, count, index }) => {
      cursorY += drawEvalRow(ops, {
        topY: cursorY,
        number: `3.${index + 1}`,
        label,
        count,
        total: String(analyzed),
        rowIndex: index,
      });
    });
  }

  if (segment.includeTotalRow) {
    cursorY += drawEvalRow(ops, {
      topY: cursorY,
      number: totalRowNumber,
      label: 'Frutos com Danos Internos',
      count: data.totalDefeito || '0',
      total: String(analyzed),
      highlight: true,
    });
  }

  if (segment.includeSummaryPanel) {
    cursorY += EVAL_GAP_BEFORE_TOTAL_PCT_H;

    drawPdfRect(ops, {
      x: PAGE_MARGIN,
      topY: cursorY,
      w: CONTENT_WIDTH,
      h: 26,
      fill: PDF_LIGHT,
      stroke: PDF_BORDER,
      lineWidth: 0.8,
    });
    drawPdfText(ops, {
      x: PAGE_MARGIN + 10,
      topY: cursorY + 7,
      text: 'PERCENTUAL TOTAL DE DANOS INTERNOS',
      size: 10,
      font: 'F2',
      color: PDF_TEXT,
    });
    drawPdfText(ops, {
      x: PAGE_MARGIN,
      topY: cursorY + 6,
      text: incidence,
      size: 13,
      font: 'F2',
      color: PDF_ORANGE_ACCENT,
      width: CONTENT_WIDTH - 10,
      align: 'right',
    });
    cursorY += EVAL_TOTAL_PCT_BOX_H;

    cursorY += drawDamageDistributionChart(ops, { topY: cursorY, data, total: String(analyzed) });
    cursorY += drawInlinePhotosAfterChart(ops, {
      topY: cursorY,
      photoIndices,
      imageNameMap,
      imageAssetMap,
    });
  }

  return cursorY - topY;
};

// Renderiza a pagina inicial/resumo do relatorio no PDF.
const renderCoverPage = (ops, pageModel, pageNumber, pageTotal, logoAsset, imageNameMap, imageAssetMap) => {
  const data = pageModel.data || {};
  const analyzed = toPdfInt(data.qtd);
  const damaged = toPdfInt(data.totalDefeito);
  const incidence = analyzed > 0
    ? formatPctValue((damaged / analyzed) * 100)
    : formatPctValue(Number(data.incidencia || 0));

  const headerBottomY = drawReportHeader(ops, { data, logoAsset });
  const gridTopY = headerBottomY;
  const gridH = drawTopHeaderGrid(ops, { topY: gridTopY, data });

  let cursorY = gridTopY + gridH + 4;
  drawCenteredTitle(ops, cursorY, 'RESULTADOS');
  cursorY += 26;

  cursorY += drawSectionHeader(ops, { topY: cursorY, number: 1, title: 'DADOS' });
  const obsRaw = asPdfValue(data.obs);
  const obsShort = String(obsRaw).length > 54
    ? `${String(obsRaw).slice(0, 51)}...`
    : String(obsRaw);
  cursorY += drawClassicDataRows(ops, {
    topY: cursorY,
    rows: [
      ['1.1', 'Data da Análise', data.dataAna || '-'],
      ['1.2', 'Fazenda/Produtor', data.fornecedor || data.fazenda || '-'],
      ['1.3', 'Talhão', data.parcela || '-'],
      ['1.4', 'Variedade', data.variedade || '-'],
      ['1.5', 'Observações', obsShort],
    ],
  });
  cursorY += 8;

  cursorY += drawSectionHeader(ops, { topY: cursorY, number: 2, title: 'RESUMO' });
  cursorY += drawSummaryCards(ops, {
    topY: cursorY,
    analyzed,
    damaged,
    incidence,
  });
  cursorY += 8;

  if (pageModel.evaluation?.segment) {
    cursorY += drawEvaluationSectionSegment(ops, {
      topY: cursorY,
      data,
      analyzed,
      incidence,
      diagnosticRows: pageModel.evaluation.diagnosticRows,
      totalRowNumber: pageModel.evaluation.totalRowNumber,
      segment: pageModel.evaluation.segment,
      photoIndices: pageModel.photoIndices || [],
      imageNameMap,
      imageAssetMap,
    });
  }

  drawPageFooter(ops, pageNumber, pageTotal);
};

const renderEvaluationPage = (ops, pageModel, pageNumber, pageTotal, imageNameMap, imageAssetMap) => {
  const data = pageModel.data || {};
  const analyzed = toPdfInt(data.qtd);
  const damaged = toPdfInt(data.totalDefeito);
  const incidence = analyzed > 0
    ? formatPctValue((damaged / analyzed) * 100)
    : formatPctValue(Number(data.incidencia || 0));

  drawEvaluationSectionSegment(ops, {
    topY: EVALUATION_PAGE_SECTION_TOP,
    data,
    analyzed,
    incidence,
    diagnosticRows: pageModel.evaluation?.diagnosticRows || [],
    totalRowNumber: pageModel.evaluation?.totalRowNumber || '3.1',
    segment: pageModel.evaluation?.segment || {
      startIndex: 0,
      count: 0,
      includeTotalRow: true,
      includeSummaryPanel: true,
    },
    showSectionHeader: false,
    photoIndices: pageModel.photoIndices || [],
    imageNameMap,
    imageAssetMap,
  });
  drawPageFooter(ops, pageNumber, pageTotal);
};

// Renderiza a pagina de fotos no PDF com cards por imagem.
const renderPhotosPage = (ops, pageModel, pageNumber, pageTotal, imageNameMap, imageAssetMap) => {
  // Faixa título fotos
  drawSectionHeader(ops, { topY: 16, number: null, title: 'Fotos - Maturação forçada', fullBar: true });

  const cardW = (CONTENT_WIDTH - 14) / 2;
  const cardH = 210;
  const startY = 50;
  const gap = 14;

  if (!pageModel.photoIndices || !pageModel.photoIndices.length) {
    drawPdfRect(ops, { x: PAGE_MARGIN, topY: startY, w: CONTENT_WIDTH, h: 180, fill: PDF_SOFT, stroke: PDF_BORDER, lineWidth: 1 });
    drawPdfText(ops, { x: PAGE_MARGIN, topY: startY + 80, text: 'Sem fotos para este registro', size: 13, font: 'F2', color: PDF_TEXT_LIGHT, align: 'center', width: CONTENT_WIDTH });
  } else {
    pageModel.photoIndices.forEach((photoIndex, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      drawPhotoCard(ops, {
        x: PAGE_MARGIN + col * (cardW + gap),
        topY: startY + row * (cardH + gap),
        w: cardW, h: cardH,
        label: `Foto ${photoIndex + 1}`,
        asset: imageAssetMap.get(photoIndex),
        imageName: imageNameMap.get(photoIndex),
      });
    });
  }

  drawPageFooter(ops, pageNumber, pageTotal);
};

// Monta a estrutura final do arquivo PDF (objetos, paginas e recursos).
const buildPdfDocument = (pageModels, photoAssetMap, logoAsset) => {
  const loadedImageEntries = Array.from(photoAssetMap.entries())
    .filter(([, asset]) => asset?.supported);

  const imageNameMap = new Map();
  loadedImageEntries.forEach(([index], imgIndex) => {
    imageNameMap.set(index, `Im${imgIndex + 1}`);
  });

  const objects = [];
  // Aloca um novo objeto no documento PDF e retorna seu indice.
  const allocateObject = () => {
    objects.push(null);
    return objects.length;
  };

  const catalogObj = allocateObject();
  const pagesObj = allocateObject();
  const fontRegularObj = allocateObject();
  const fontBoldObj = allocateObject();
  const fontLabelObj = allocateObject();

  const logoObjNumber = logoAsset?.supported ? allocateObject() : null;

  const imageObjectNumbers = new Map();
  loadedImageEntries.forEach(([index]) => {
    imageObjectNumbers.set(index, allocateObject());
  });

  const pageRefs = pageModels.map(() => {
    const pageObj = allocateObject();
    const contentObj = allocateObject();
    return { pageObj, contentObj };
  });

  objects[catalogObj - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref.pageObj} 0 R`).join(' ')}] /Count ${pageModels.length} >>`;
  // Usa fontes base 14 do PDF para compatibilidade total no iOS e Android.
  objects[fontRegularObj - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[fontBoldObj - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[fontLabelObj - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  if (logoObjNumber && logoAsset?.supported) {
    objects[logoObjNumber - 1] =
      `<< /Type /XObject /Subtype /Image /Width ${logoAsset.width} /Height ${logoAsset.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${logoAsset.hex.length + 1} >>\n` +
      `stream\n${logoAsset.hex}>\nendstream`;
  }

  loadedImageEntries.forEach(([index, asset]) => {
    const objectNumber = imageObjectNumbers.get(index);
    objects[objectNumber - 1] =
      `<< /Type /XObject /Subtype /Image /Width ${asset.width} /Height ${asset.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${asset.hex.length + 1} >>\n` +
      `stream\n${asset.hex}>\nendstream`;
  });

  pageModels.forEach((pageModel, index) => {
    const { pageObj, contentObj } = pageRefs[index];
    const ops = [];
    const pageNumber = index + 1;
    const pageTotal = pageModels.length;

    if (pageModel.type === 'photos') {
      renderPhotosPage(ops, pageModel, pageNumber, pageTotal, imageNameMap, photoAssetMap);
    } else if (pageModel.type === 'evaluation') {
      renderEvaluationPage(ops, pageModel, pageNumber, pageTotal, imageNameMap, photoAssetMap);
    } else {
      renderCoverPage(ops, pageModel, pageNumber, pageTotal, logoAsset, imageNameMap, photoAssetMap);
    }

    const contentStream = ops.join('\n');
    const xObjects = loadedImageEntries.map(([imageIndex]) => `/${imageNameMap.get(imageIndex)} ${imageObjectNumbers.get(imageIndex)} 0 R`);
    const logoXObject = logoObjNumber ? ` /${LOGO_IMAGE_NAME} ${logoObjNumber} 0 R` : '';
    const imageResources = (xObjects.length || logoObjNumber)
      ? ` /XObject << ${xObjects.join(' ')}${logoXObject} >>`
      : '';

    objects[pageObj - 1] =
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontRegularObj} 0 R /F2 ${fontBoldObj} 0 R /F3 ${fontLabelObj} 0 R >>${imageResources} >> ` +
      `/Contents ${contentObj} 0 R >>`;

    objects[contentObj - 1] = `<< /Length ${contentStream.length + 1} >>\nstream\n${contentStream}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (let i = 0; i < objects.length; i += 1) {
    const objectNumber = i + 1;
    offsets[objectNumber] = pdf.length;
    pdf += `${objectNumber} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefPosition = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let objectNumber = 1; objectNumber <= objects.length; objectNumber += 1) {
    const offset = String(offsets[objectNumber] || 0).padStart(10, '0');
    pdf += `${offset} 00000 n \n`;
  }

  pdf += 'trailer\n';
  pdf += `<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${xrefPosition}\n`;
  pdf += '%%EOF';

  return pdf;
};

export const buildMaturacaoPdfReport = async (data) => {
  const [photoAssetMap, logoAsset] = await Promise.all([
    preparePdfPhotoAssets(data.fotos || []),
    preparePdfLogoAsset(),
  ]);
  const photoIndices = Array.from(photoAssetMap.keys()).sort((a, b) => a - b);
  const coverEvalAvailable = PAGE_FOOTER_SAFE_BOTTOM - COVER_EVAL_START_Y;
  const continuationEvalAvailable = PAGE_FOOTER_SAFE_BOTTOM - EVALUATION_PAGE_SECTION_TOP;
  const evaluationPlan = buildEvaluationPaginationPlan({
    data,
    coverAvailable: coverEvalAvailable,
    continuationAvailable: continuationEvalAvailable,
  });

  const inlinePhotoCapacity = estimateInlinePhotoCapacity({ data, evaluationPlan });
  const inlinePhotoIndices = photoIndices.slice(0, inlinePhotoCapacity);
  const overflowPhotoIndices = photoIndices.slice(inlinePhotoIndices.length);

  const pageModels = [
    {
      type: 'cover',
      data: {
        ...data,
        fotosCount: photoIndices.length,
      },
      evaluation: {
        diagnosticRows: evaluationPlan.diagnosticRows,
        totalRowNumber: evaluationPlan.totalRowNumber,
        segment: evaluationPlan.coverSegment,
      },
      photoIndices: inlinePhotoIndices,
    },
  ];

  evaluationPlan.continuationSegments.forEach((segment) => {
    pageModels.push({
      type: 'evaluation',
      data: {
        ...data,
      },
      evaluation: {
        diagnosticRows: evaluationPlan.diagnosticRows,
        totalRowNumber: evaluationPlan.totalRowNumber,
        segment,
      },
      photoIndices: inlinePhotoIndices,
    });
  });

  chunkArray(overflowPhotoIndices, 6).forEach((chunk) => {
    pageModels.push({
      type: 'photos',
      data: {
        ...data,
      },
      photoIndices: chunk,
    });
  });

  return buildPdfDocument(pageModels, photoAssetMap, logoAsset);
};

export default buildMaturacaoPdfReport;

