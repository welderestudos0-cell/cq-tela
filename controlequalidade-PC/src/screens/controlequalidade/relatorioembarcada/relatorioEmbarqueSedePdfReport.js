import { Buffer } from 'buffer';
import { Asset } from 'expo-asset';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  RELATORIO_GENERAL_INFO,
  createInitialRelatorioEmbarqueState,
} from './relatorioEmbarqueSedeData';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - (PAGE_MARGIN * 2);

const PDF_TEXT = [0.18, 0.24, 0.28];
const PDF_TEXT_LIGHT = [0.55, 0.55, 0.55];
const PDF_BORDER = [0.84, 0.84, 0.84];
const PDF_SOFT = [0.97, 0.99, 0.97];
const PDF_PRIMARY = [0.18, 0.49, 0.2];
const PDF_PRIMARY_DARK = [0.11, 0.37, 0.13];
const PDF_PRIMARY_LIGHT = [0.91, 0.96, 0.91];
const PDF_SECTION_TEXT = [0.12, 0.30, 0.18];
const PDF_ACCENT_ORANGE = [0.93, 0.51, 0.15];
const PDF_TABLE_BG = [0.975, 0.980, 0.975];
const PDF_TABLE_LABEL = [0.36, 0.40, 0.36];
const PDF_CARD_BG = [0.992, 0.995, 0.992];
const PDF_CARD_INNER_BG = [0.948, 0.964, 0.948];
const HEADER_BANNER_TOP = 16;
const HEADER_BANNER_MAX_HEIGHT = 140;
const HEADER_BANNER_GAP = 16;
const HEADER_BANNER_IMAGE_NAME = 'ImHeaderBanner';

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

// Estima a largura do texto para alinhamento no PDF.
const estimatePdfTextWidth = (text, size) => {
  const clean = toAsciiText(text);
  return clean.length * size * 0.52;
};

const drawPdfText = (
  ops,
  {
    x,
    topY,
    text,
    size = 12,
    font = 'F1',
    color = PDF_TEXT,
    align = 'left',
    width = null,
  },
) => {
  const clean = toAsciiText(text);
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
  ops.push(`(${escapePdfText(clean)}) Tj`);
  ops.push('ET');
};

const drawPdfWrappedText = (
  ops,
  {
    x,
    topY,
    text,
    size = 12,
    font = 'F1',
    color = PDF_TEXT,
    width = CONTENT_WIDTH,
    lineHeight = size + 2,
  },
) => {
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

const drawPdfRect = (
  ops,
  {
    x,
    topY,
    w,
    h,
    fill = null,
    stroke = null,
    lineWidth = 1,
  },
) => {
  const bottomY = PAGE_HEIGHT - topY - h;

  if (fill) {
    ops.push(`${pdfColor(fill)}\n${pdfNumber(x)} ${pdfNumber(bottomY)} ${pdfNumber(w)} ${pdfNumber(h)} re f`);
  }

  if (stroke) {
    ops.push(`${pdfColor(stroke, true)}\n${pdfNumber(lineWidth)} w\n${pdfNumber(x)} ${pdfNumber(bottomY)} ${pdfNumber(w)} ${pdfNumber(h)} re S`);
  }
};

const drawPdfLine = (
  ops,
  {
    x1,
    y1,
    x2,
    y2,
    color = PDF_BORDER,
    lineWidth = 1,
    dash = null,
  },
) => {
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

const drawPdfImage = (
  ops,
  {
    x,
    topY,
    w,
    h,
    imageName,
  },
) => {
  const bottomY = PAGE_HEIGHT - topY - h;
  ops.push(`q ${pdfNumber(w)} 0 0 ${pdfNumber(h)} ${pdfNumber(x)} ${pdfNumber(bottomY)} cm /${imageName} Do Q`);
};

const drawPdfImageCover = (
  ops,
  {
    x,
    topY,
    w,
    h,
    imageName,
    imageWidth,
    imageHeight,
  },
) => {
  const safeW = Math.max(1, imageWidth || 1);
  const safeH = Math.max(1, imageHeight || 1);
  const scale = Math.max(w / safeW, h / safeH);
  const drawW = safeW * scale;
  const drawH = safeH * scale;
  const drawX = x - ((drawW - w) / 2);
  const drawTopY = topY - ((drawH - h) / 2);
  const clipBottomY = PAGE_HEIGHT - topY - h;
  const drawBottomY = PAGE_HEIGHT - drawTopY - drawH;

  ops.push('q');
  ops.push(`${pdfNumber(x)} ${pdfNumber(clipBottomY)} ${pdfNumber(w)} ${pdfNumber(h)} re W n`);
  ops.push(`${pdfNumber(drawW)} 0 0 ${pdfNumber(drawH)} ${pdfNumber(drawX)} ${pdfNumber(drawBottomY)} cm /${imageName} Do`);
  ops.push('Q');
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

const drawNoPhotoPlaceholder = (ops, { x, topY, w, h, text = 'No photo added' }) => {
  drawPdfRect(ops, {
    x,
    topY,
    w,
    h,
    fill: PDF_CARD_INNER_BG,
    stroke: [0.84, 0.88, 0.84],
    lineWidth: 0.6,
  });

  const iconW = 26;
  const iconH = 16;
  const iconX = x + ((w - iconW) / 2);
  const iconY = topY + (h * 0.42) - 14;

  drawPdfRect(ops, {
    x: iconX,
    topY: iconY,
    w: iconW,
    h: iconH,
    stroke: [0.68, 0.72, 0.68],
    lineWidth: 1,
  });
  drawPdfRect(ops, {
    x: iconX + 6,
    topY: iconY - 4,
    w: 8,
    h: 4,
    fill: [0.68, 0.72, 0.68],
  });
  drawPdfRect(ops, {
    x: iconX + iconW - 6,
    topY: iconY + 3,
    w: 3,
    h: 3,
    fill: PDF_ACCENT_ORANGE,
  });
  drawPdfRect(ops, {
    x: iconX + 10,
    topY: iconY + 5,
    w: 6,
    h: 6,
    stroke: [0.68, 0.72, 0.68],
    lineWidth: 0.9,
  });

  drawPdfText(ops, {
    x,
    topY: iconY + 24,
    text,
    size: 8.6,
    font: 'F1',
    color: [0.52, 0.57, 0.52],
    align: 'center',
    width: w,
  });
};

// Agrupa array.
const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

// Normaliza a lista de fotos para um formato padrao de processamento.
const normalizePhotos = (photos = []) =>
  photos
    .map((photo) => {
      if (typeof photo === 'string') {
        return { uri: photo, descricao: '' };
      }

      if (photo?.uri) {
        return {
          uri: photo.uri,
          descricao: String(photo.descricao ?? photo.label ?? '').trim(),
        };
      }

      return null;
    })
    .filter(Boolean);

// Prepara um recurso de foto para embutir no PDF.
const preparePdfPhotoAsset = async (uri, options = {}) => {
  const {
    resizeWidth = 1200,
    compress = 0.78,
  } = options;

  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: resizeWidth } }],
      {
        compress,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
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
  const normalizedPhotos = normalizePhotos(photos);
  const entries = await Promise.all(
    normalizedPhotos.map(async (photo, index) => [index, await preparePdfPhotoAsset(photo.uri)]),
  );
  return new Map(entries);
};

// Prepara a logo para uso no cabecalho do PDF.
const preparePdfHeaderBannerAsset = async () => {
  try {
    const logoAsset = Asset.fromModule(require('../../../assets/logoagrodann.png'));
    if (!logoAsset.localUri) {
      await logoAsset.downloadAsync();
    }

    const logoUri = logoAsset.localUri || logoAsset.uri;
    if (!logoUri) {
      return { supported: false, reason: 'Logo sem URI' };
    }

    return await preparePdfPhotoAsset(logoUri, {
      resizeWidth: 1000,
      compress: 0.9,
    });
  } catch (error) {
    console.warn('Falha ao preparar logo do embarque para PDF:', error?.message || error);
    return { supported: false, reason: error?.message || 'Falha ao preparar logo' };
  }
};

// Desenha header banner.
const drawHeaderBanner = (ops, _headerBannerAsset) => {
  const topY = 24;
  const logoBoxW = 126;
  const logoBoxH = 42;
  const titleX = PAGE_MARGIN + logoBoxW + 22;

  if (_headerBannerAsset?.supported) {
    const fitted = fitContain(
      _headerBannerAsset.width,
      _headerBannerAsset.height,
      logoBoxW,
      logoBoxH,
    );
    drawPdfImage(ops, {
      x: PAGE_MARGIN,
      topY: topY + ((logoBoxH - fitted.height) / 2),
      w: fitted.width,
      h: fitted.height,
      imageName: HEADER_BANNER_IMAGE_NAME,
    });
  } else {
    drawPdfText(ops, {
      x: PAGE_MARGIN,
      topY: topY + 16,
      text: 'AGRODAN',
      size: 26,
      font: 'F2',
      color: PDF_PRIMARY,
    });
  }

  drawPdfText(ops, {
    x: titleX,
    topY: topY + 8,
    text: 'QUALITY CONTROL REPORT',
    size: 14.8,
    font: 'F2',
    color: [0.11, 0.11, 0.11],
  });

  drawPdfText(ops, {
    x: titleX,
    topY: topY + 28,
    text: 'Controle de Qualidade',
    size: 9.2,
    font: 'F1',
    color: [0.30, 0.32, 0.30],
  });

  drawPdfLine(ops, {
    x1: titleX,
    y1: topY + 42,
    x2: titleX + 26,
    y2: topY + 42,
    color: PDF_ACCENT_ORANGE,
    lineWidth: 1.2,
  });

  drawPdfLine(ops, {
    x1: PAGE_MARGIN,
    y1: topY + 56,
    x2: PAGE_WIDTH - PAGE_MARGIN,
    y2: topY + 56,
    color: [0.80, 0.86, 0.80],
    lineWidth: 0.8,
  });

  return topY + 64;
};

// Desenha o cabecalho de secao no layout do PDF.
const drawSectionHeader = (ops, { topY, title, fullBar = false, rightLabel = '' }) => {
  if (fullBar) {
    drawPdfRect(ops, {
      x: PAGE_MARGIN,
      topY,
      w: CONTENT_WIDTH,
      h: 24,
      fill: PDF_PRIMARY,
    });

    drawPdfText(ops, {
      x: PAGE_MARGIN,
      topY: topY + 5,
      text: toAsciiText(title).toUpperCase(),
      size: 12.5,
      font: 'F2',
      color: [1, 1, 1],
      align: 'center',
      width: CONTENT_WIDTH,
    });

    return 30;
  }

  const titleText = toAsciiText(title).toUpperCase();
  const titleX = PAGE_MARGIN + 2;
  drawPdfText(ops, {
    x: titleX,
    topY: topY + 3,
    text: titleText,
    size: 12.8,
    font: 'F2',
    color: PDF_SECTION_TEXT,
  });

  if (rightLabel) {
    drawPdfText(ops, {
      x: PAGE_MARGIN,
      topY: topY + 7,
      text: rightLabel,
      size: 8.2,
      font: 'F1',
      color: [0.56, 0.61, 0.56],
      align: 'right',
      width: CONTENT_WIDTH - 8,
    });
  }

  const titleWidth = estimatePdfTextWidth(titleText, 12.8);
  const lineStartX = Math.max(PAGE_MARGIN + 160, titleX + titleWidth + 16);
  const lineEndX = PAGE_WIDTH - PAGE_MARGIN;
  if (lineStartX < lineEndX - 8) {
    drawPdfLine(ops, {
      x1: lineStartX,
      y1: topY + 13,
      x2: lineEndX,
      y2: topY + 13,
      color: [0.80, 0.86, 0.80],
      lineWidth: 0.8,
    });
  }

  return 21;
};

const drawRowItem = (
  ops,
  {
    topY,
    label,
    value,
    labelWidth = 235,
    valueWidth = CONTENT_WIDTH - 247,
    lineHeight = 12,
    minHeight = 18,
  },
) => {
  const labelText = toAsciiText(label).toUpperCase();
  const safeValue = asPdfValue(value);
  const labelLines = wrapPdfText(labelText, Math.max(12, Math.floor(labelWidth / (11 * 0.52))));
  const valueLines = wrapPdfText(safeValue, Math.max(8, Math.floor(valueWidth / (11 * 0.52))));
  const rowHeight = Math.max(minHeight, labelLines.length * lineHeight, valueLines.length * lineHeight);

  drawPdfWrappedText(ops, {
    x: PAGE_MARGIN + 2,
    topY,
    text: labelText,
    size: 10.8,
    font: 'F1',
    color: PDF_TEXT,
    width: labelWidth - 4,
    lineHeight,
  });

  drawPdfWrappedText(ops, {
    x: PAGE_MARGIN + labelWidth + 12,
    topY,
    text: safeValue,
    size: 10.8,
    font: 'F1',
    color: PDF_TEXT,
    width: valueWidth,
    lineHeight,
  });

  drawPdfLine(ops, {
    x1: PAGE_MARGIN,
    y1: topY + rowHeight - 2,
    x2: PAGE_WIDTH - PAGE_MARGIN,
    y2: topY + rowHeight - 2,
    color: PDF_BORDER,
    lineWidth: 0.7,
    dash: [3, 3],
  });

  return rowHeight + 4;
};

// Normaliza os campos de informacoes gerais para estrutura padrao.
const normalizeGeneralInfo = (generalInfo = {}) => ({
  customer: asPdfValue(generalInfo.customer ?? RELATORIO_GENERAL_INFO.customer),
  container: asPdfValue(generalInfo.container ?? RELATORIO_GENERAL_INFO.container),
  loading: asPdfValue(generalInfo.loading ?? RELATORIO_GENERAL_INFO.loading),
  etd: asPdfValue(generalInfo.etd ?? RELATORIO_GENERAL_INFO.etd),
  eta: asPdfValue(generalInfo.eta ?? RELATORIO_GENERAL_INFO.eta),
  vessel: asPdfValue(generalInfo.vessel ?? RELATORIO_GENERAL_INFO.vessel),
});

// Desenha general information block with data.
const drawGeneralInformationBlockWithData = (ops, topY, generalInfo) => {
  let cursorY = topY;
  cursorY += drawSectionHeader(ops, { topY: cursorY, title: 'General Information' });

  const tableTop = cursorY + 4;
  const rowH = 30;
  const colW = CONTENT_WIDTH / 3;
  const rows = [
    [
      ['Customer', generalInfo.customer],
      ['Container', generalInfo.container],
      ['Vessel', generalInfo.vessel],
    ],
    [
      ['Loading', generalInfo.loading],
      ['ETD', generalInfo.etd],
      ['ETA', generalInfo.eta],
    ],
  ];

  rows.forEach((row, rowIndex) => {
    row.forEach(([label, value], colIndex) => {
      const x = PAGE_MARGIN + (colIndex * colW);
      const y = tableTop + (rowIndex * rowH);
      drawPdfRect(ops, {
        x,
        topY: y,
        w: colW,
        h: rowH,
        fill: PDF_TABLE_BG,
        stroke: [0.81, 0.86, 0.81],
        lineWidth: 0.55,
      });
      drawPdfText(ops, {
        x: x + 8,
        topY: y + 4,
        text: label,
        size: 7.2,
        font: 'F1',
        color: PDF_TABLE_LABEL,
      });
      const cellText = toAsciiText(asPdfValue(value));
      const maxCellW = colW - 16;
      const boldFactor = 0.65;
      const estimateBold = (t, s) => t.length * s * boldFactor;
      let cellSize = 10.8;
      while (cellSize > 6.5 && estimateBold(cellText, cellSize) > maxCellW) {
        cellSize -= 0.5;
      }
      const truncated = estimateBold(cellText, cellSize) > maxCellW
        ? (() => {
            let t = cellText;
            while (t.length > 1 && estimateBold(t + '...', cellSize) > maxCellW) t = t.slice(0, -1);
            return t + '...';
          })()
        : cellText;
      drawPdfText(ops, {
        x: x + 8,
        topY: y + (cellSize < 9 ? 14 : 16),
        text: truncated,
        size: cellSize,
        font: 'F2',
        color: [0.10, 0.10, 0.10],
        width: maxCellW,
      });
    });
  });

  return tableTop + (rows.length * rowH) + 16;
};

const drawPhotoCard = (
  ops,
  {
    x,
    topY,
    w,
    h,
    label,
    asset,
    imageName,
    hideCaption = false,
  },
) => {
  drawPdfRect(ops, {
    x,
    topY,
    w,
    h,
    fill: [1, 1, 1],
    stroke: PDF_BORDER,
    lineWidth: 1,
  });

  drawPdfRect(ops, {
    x,
    topY,
    w,
    h: 24,
    fill: PDF_PRIMARY_LIGHT,
  });

  drawPdfText(ops, {
    x: x + 10,
    topY: topY + 6,
    text: label,
    size: 11.2,
    font: 'F2',
    color: PDF_PRIMARY_DARK,
  });

  const imageTop = topY + 30;
  const imageWidth = w - 20;
  const imageHeight = h - (hideCaption ? 42 : 74);

  if (asset?.supported && imageName) {
    const fitted = fitContain(asset.width, asset.height, imageWidth, imageHeight);
    const imageX = x + 10 + ((imageWidth - fitted.width) / 2);
    const imageY = imageTop + ((imageHeight - fitted.height) / 2);

    drawPdfImage(ops, {
      x: imageX,
      topY: imageY,
      w: fitted.width,
      h: fitted.height,
      imageName,
    });
  } else {
    drawPdfRect(ops, {
      x: x + 10,
      topY: imageTop,
      w: imageWidth,
      h: imageHeight,
      fill: PDF_SOFT,
      stroke: PDF_BORDER,
      lineWidth: 0.8,
    });

    drawPdfText(ops, {
      x: x + 10,
      topY: imageTop + (imageHeight / 2) - 8,
      text: 'Foto indisponivel',
      size: 11,
      font: 'F2',
      color: PDF_TEXT_LIGHT,
      align: 'center',
      width: imageWidth,
    });
  }

  if (!hideCaption) {
    const descriptionText = 'Sem descricao';
    drawPdfWrappedText(ops, {
      x: x + 10,
      topY: topY + h - 38,
      text: descriptionText,
      size: 8.8,
      font: 'F1',
      color: PDF_TEXT,
      width: w - 20,
      lineHeight: 9.5,
    });
  }
};

const drawItemFieldCard = (
  ops,
  {
    x,
    topY,
    w,
    h,
    item,
    imageNameMap,
    photoAssetMap,
  },
) => {
  const labelHeight = 18;
  const labelGap = 3;
  const boxTop = topY + labelHeight;
  const boxHeight = Math.max(72, h - labelHeight);
  const photoIndexes = item.photoIndexes || [];

  drawPdfText(ops, {
    x,
    topY: topY + 2,
    text: item.label,
    size: 10.9,
    font: 'F2',
    color: PDF_TEXT,
  });

  drawPdfRect(ops, {
    x,
    topY: boxTop + labelGap,
    w,
    h: boxHeight - labelGap,
    fill: PDF_CARD_BG,
    stroke: [0.80, 0.85, 0.80],
    lineWidth: 0.75,
  });

  const innerPad = 8;
  const innerX = x + innerPad;
  const innerY = boxTop + labelGap + innerPad;
  const innerW = Math.max(8, w - (innerPad * 2));
  const innerH = Math.max(8, (boxHeight - labelGap) - (innerPad * 2));

  if (!photoIndexes.length) {
    drawNoPhotoPlaceholder(ops, { x: innerX, topY: innerY, w: innerW, h: innerH, text: 'No photo added' });
    return;
  }

  if (photoIndexes.length === 1) {
    const onlyIndex = photoIndexes[0];
    const asset = photoAssetMap.get(onlyIndex);
    const imageName = imageNameMap.get(onlyIndex);

    if (asset?.supported && imageName) {
      drawPdfImageCover(ops, {
        x: innerX,
        topY: innerY,
        w: innerW,
        h: innerH,
        imageName,
        imageWidth: asset.width,
        imageHeight: asset.height,
      });
    } else {
      drawNoPhotoPlaceholder(ops, { x: innerX, topY: innerY, w: innerW, h: innerH, text: 'Photo unavailable' });
    }
    return;
  }

  const visibleIndexes = photoIndexes.slice(0, 4);
  const collageGap = 4;
  const cols = 2;
  const rows = Math.ceil(visibleIndexes.length / 2);
  const cellW = (innerW - collageGap) / cols;
  const cellH = (innerH - (collageGap * (rows - 1))) / rows;

  visibleIndexes.forEach((photoIndex, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = innerX + (col * (cellW + collageGap));
    const cellY = innerY + (row * (cellH + collageGap));
    const asset = photoAssetMap.get(photoIndex);
    const imageName = imageNameMap.get(photoIndex);

    drawPdfRect(ops, {
      x: cellX,
      topY: cellY,
      w: cellW,
      h: cellH,
      fill: PDF_CARD_INNER_BG,
      stroke: [0.83, 0.88, 0.83],
      lineWidth: 0.5,
    });

    if (asset?.supported && imageName) {
      drawPdfImageCover(ops, {
        x: cellX,
        topY: cellY,
        w: cellW,
        h: cellH,
        imageName,
        imageWidth: asset.width,
        imageHeight: asset.height,
      });
    } else {
      drawNoPhotoPlaceholder(ops, { x: cellX, topY: cellY, w: cellW, h: cellH, text: 'No photo' });
    }
  });

  if (photoIndexes.length > 4) {
    const moreCount = photoIndexes.length - 4;
    const badgeW = 28;
    const badgeH = 16;
    const badgeX = x + w - badgeW - 6;
    const badgeY = boxTop + boxHeight - badgeH - 6;

    drawPdfRect(ops, {
      x: badgeX,
      topY: badgeY,
      w: badgeW,
      h: badgeH,
      fill: [0.20, 0.43, 0.22],
    });

    drawPdfText(ops, {
      x: badgeX,
      topY: badgeY + 4,
      text: `+${moreCount}`,
      size: 8.2,
      font: 'F2',
      color: [1, 1, 1],
      align: 'center',
      width: badgeW,
    });
  }
};

// Desenha page footer.
const drawPageFooter = (ops, pageNumber, pageTotal) => {
  const fy = PAGE_HEIGHT - 22;
  drawPdfLine(ops, {
    x1: PAGE_MARGIN,
    y1: fy - 6,
    x2: PAGE_WIDTH - PAGE_MARGIN,
    y2: fy - 6,
    color: PDF_BORDER,
    lineWidth: 0.5,
  });

  drawPdfText(ops, {
    x: PAGE_MARGIN,
    topY: fy,
    text: `${pageNumber} / ${pageTotal}`,
    size: 7.5,
    font: 'F2',
    color: PDF_TEXT_LIGHT,
    align: 'right',
    width: CONTENT_WIDTH,
  });
};

// Normaliza as secoes do relatorio para o formato base esperado.
const normalizeRelatorioSections = (sections = []) => {
  const sourceSections = Array.isArray(sections) && sections.length
    ? sections
    : createInitialRelatorioEmbarqueState();

  return sourceSections.map((section) => ({
    key: section.key,
    title: section.title,
    items: (section.items || []).map((item) => ({
      key: item.key,
      label: item.label,
      photos: normalizePhotos(item.photos || []),
    })),
  }));
};

// Monta os modelos de paginas do relatorio de embarque para o PDF.
const buildRelatorioEmbarquePages = (sections = [], generalInfo = {}) => {
  const normalizedSections = normalizeRelatorioSections(sections);
  const normalizedGeneralInfo = normalizeGeneralInfo(generalInfo);
  const flatPhotos = [];
  const sectionPages = [];

  normalizedSections.forEach((section) => {
    const itemsWithPhotoIndexes = (section.items || []).map((item) => {
      const photoIndexes = [];

      (item.photos || []).forEach((photo) => {
        const photoIndex = flatPhotos.length;
        flatPhotos.push({
          ...photo,
          sectionKey: section.key,
          sectionTitle: section.title,
          itemKey: item.key,
          itemLabel: item.label,
        });
        photoIndexes.push(photoIndex);
      });

      return {
        key: item.key,
        label: item.label,
        photoIndexes,
      };
    });

    const sectionChunks = chunkArray(itemsWithPhotoIndexes, 6);
    sectionChunks.forEach((itemsChunk, chunkIndex) => {
      sectionPages.push({
        type: 'sectionItems',
        sectionTitle: section.title,
        items: itemsChunk,
        pageIndex: chunkIndex + 1,
        pageTotal: sectionChunks.length,
      });
    });
  });
  const safeSectionPages = sectionPages.length
    ? sectionPages
    : [
      {
        type: 'sectionItems',
        sectionTitle: 'MANGO PALMER',
        items: [],
        pageIndex: 1,
        pageTotal: 1,
      },
    ];

  const pageModels = safeSectionPages.map((pageModel, index) => ({
    ...pageModel,
    showGeneralInfo: index === 0,
    generalInfo: normalizedGeneralInfo,
  }));

  return {
    pageModels,
    flatPhotos,
  };
};

// Renderiza a pagina inicial/resumo do relatorio no PDF.
const renderCoverPage = (ops, pageModel, pageNumber, pageTotal, headerBannerAsset) => {
  const data = pageModel.data || {};
  const sectionCounts = data.sectionCounts || [];
  const contentStartY = drawHeaderBanner(ops, headerBannerAsset);

  drawPdfLine(ops, {
    x1: PAGE_MARGIN,
    y1: contentStartY - 6,
    x2: PAGE_WIDTH - PAGE_MARGIN,
    y2: contentStartY - 6,
    color: PDF_BORDER,
    lineWidth: 0.8,
  });

  let cursorY = contentStartY + 8;
  cursorY += drawSectionHeader(ops, { topY: cursorY, title: 'Resumo' });

  [
    ['Seções', String(data.totalSections || 0)],
    ['Itens', String(data.totalItems || 0)],
    ['Fotos', String(data.totalPhotos || 0)],
    ['Itens com fotos', String(data.itemsWithPhotos || 0)],
  ].forEach(([label, value]) => {
    cursorY += drawRowItem(ops, {
      topY: cursorY,
      label,
      value,
      labelWidth: 235,
      valueWidth: CONTENT_WIDTH - 247,
    });
  });

  sectionCounts.forEach((section) => {
    cursorY += 8;
    cursorY += drawSectionHeader(ops, { topY: cursorY, title: section.title });

    (section.items || []).forEach((item) => {
      cursorY += drawRowItem(ops, {
        topY: cursorY,
        label: item.label,
        value: `${item.totalPhotos} foto(s)`,
        labelWidth: 240,
        valueWidth: CONTENT_WIDTH - 252,
      });
    });
  });

  cursorY += 8;
  drawPdfRect(ops, {
    x: PAGE_MARGIN,
    topY: cursorY,
    w: CONTENT_WIDTH,
    h: 42,
    fill: PDF_PRIMARY_LIGHT,
    stroke: PDF_BORDER,
    lineWidth: 0.8,
  });

  drawPdfText(ops, {
    x: PAGE_MARGIN + 10,
    topY: cursorY + 12,
    text: 'As páginas seguintes mostram as fotos agrupadas por seção e por item.',
    size: 10,
    font: 'F2',
    color: PDF_PRIMARY_DARK,
  });

  drawPageFooter(ops, pageNumber, pageTotal);
};

const renderSectionItemsPage = (
  ops,
  pageModel,
  pageNumber,
  pageTotal,
  imageNameMap,
  photoAssetMap,
  headerBannerAsset,
) => {
  const contentStartY = drawHeaderBanner(ops, headerBannerAsset);

  drawSectionHeader(ops, {
    topY: contentStartY,
    title: pageModel.sectionTitle,
  });

  drawPdfText(ops, {
    x: PAGE_MARGIN + 2,
    topY: contentStartY + 38,
    text: `${pageModel.items.length} campo(s)  •  pagina ${pageModel.pageIndex}/${pageModel.pageTotal}`,
    size: 10,
    font: 'F2',
    color: PDF_PRIMARY_DARK,
    align: 'right',
    width: CONTENT_WIDTH - 4,
  });



  drawPdfText(ops, {
    x: PAGE_MARGIN + 12,
    topY: contentStartY + 70,
    text: `${pageModel.photoCount} foto(s) • página ${pageModel.pageIndex}/${pageModel.pageTotal}`,
    size: 10,
    font: 'F2',
    color: PDF_PRIMARY_DARK,
    align: 'right',
    width: CONTENT_WIDTH - 24,
  });

  const cardW = (CONTENT_WIDTH - 14) / 2;
  const cardH = 208;
  const startY = contentStartY + 116;
  const gap = 14;

  if (!pageModel.photoCards || !pageModel.photoCards.length) {
    drawPdfRect(ops, {
      x: PAGE_MARGIN,
      topY: startY,
      w: CONTENT_WIDTH,
      h: 180,
      fill: PDF_SOFT,
      stroke: PDF_BORDER,
      lineWidth: 1,
    });

    drawPdfText(ops, {
      x: PAGE_MARGIN,
      topY: startY + 80,
      text: 'Nenhuma foto adicionada para este item.',
      size: 13,
      font: 'F2',
      color: PDF_TEXT_LIGHT,
      align: 'center',
      width: CONTENT_WIDTH,
    });
  } else {
    pageModel.photoCards.forEach((card, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      drawPhotoCard(ops, {
        x: PAGE_MARGIN + col * (cardW + gap),
        topY: startY + row * (cardH + gap),
        w: cardW,
        h: cardH,
        label: card.label,
        asset: photoAssetMap.get(card.photoIndex),
        imageName: imageNameMap.get(card.photoIndex),
        hideCaption: true,
      });
    });
  }

  drawPageFooter(ops, pageNumber, pageTotal);
};

const renderSectionGridPage = (
  ops,
  pageModel,
  pageNumber,
  pageTotal,
  imageNameMap,
  photoAssetMap,
  headerBannerAsset,
) => {
  const contentStartY = drawHeaderBanner(ops, headerBannerAsset);
  let cursorY = contentStartY + 12;

  if (pageModel.showGeneralInfo) {
    cursorY = drawGeneralInformationBlockWithData(
      ops,
      cursorY,
      pageModel.generalInfo || normalizeGeneralInfo(),
    );
  }

  const sectionHeaderTop = cursorY;
  cursorY += drawSectionHeader(ops, {
    topY: sectionHeaderTop,
    title: pageModel.sectionTitle,
  });

  const gridTop = cursorY + 4;
  const gridBottom = PAGE_HEIGHT - 60;
  const gridHeight = Math.max(120, gridBottom - gridTop);
  const cardGapX = 14;
  const cardGapY = 14;
  const cols = 2;
  const rows = Math.max(1, Math.ceil((pageModel.items || []).length / cols));
  const cardW = (CONTENT_WIDTH - cardGapX) / cols;
  const maxCardH = 206;
  const cardH = Math.min(maxCardH, (gridHeight - (cardGapY * (rows - 1))) / rows);
  const gridOffsetY = 0;

  (pageModel.items || []).forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = PAGE_MARGIN + (col * (cardW + cardGapX));
    const y = gridTop + gridOffsetY + (row * (cardH + cardGapY));

    drawItemFieldCard(ops, {
      x,
      topY: y,
      w: cardW,
      h: cardH,
      item,
      imageNameMap,
      photoAssetMap,
    });
  });

  drawPageFooter(ops, pageNumber, pageTotal);
};

// Monta a estrutura final do arquivo PDF (objetos, paginas e recursos).
const buildPdfDocument = (pageModels, photoAssetMap, headerBannerAsset) => {
  const loadedImageEntries = Array.from(photoAssetMap.entries())
    .filter(([, asset]) => asset?.supported);
  const hasHeaderBanner = Boolean(headerBannerAsset?.supported);

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

  const imageObjectNumbers = new Map();
  loadedImageEntries.forEach(([index]) => {
    imageObjectNumbers.set(index, allocateObject());
  });
  const headerBannerObj = hasHeaderBanner ? allocateObject() : null;

  const pageRefs = pageModels.map(() => {
    const pageObj = allocateObject();
    const contentObj = allocateObject();
    return { pageObj, contentObj };
  });

  objects[catalogObj - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref.pageObj} 0 R`).join(' ')}] /Count ${pageModels.length} >>`;
  objects[fontRegularObj - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[fontBoldObj - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  loadedImageEntries.forEach(([index, asset]) => {
    const objectNumber = imageObjectNumbers.get(index);
    objects[objectNumber - 1] =
      `<< /Type /XObject /Subtype /Image /Width ${asset.width} /Height ${asset.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${asset.hex.length + 1} >>\n` +
      `stream\n${asset.hex}>\nendstream`;
  });

  if (hasHeaderBanner && headerBannerObj) {
    objects[headerBannerObj - 1] =
      `<< /Type /XObject /Subtype /Image /Width ${headerBannerAsset.width} /Height ${headerBannerAsset.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${headerBannerAsset.hex.length + 1} >>\n` +
      `stream\n${headerBannerAsset.hex}>\nendstream`;
  }

  pageModels.forEach((pageModel, index) => {
    const { pageObj, contentObj } = pageRefs[index];
    const ops = [];
    const pageNumber = index + 1;
    const pageTotal = pageModels.length;

    renderSectionGridPage(
      ops,
      pageModel,
      pageNumber,
      pageTotal,
      imageNameMap,
      photoAssetMap,
      headerBannerAsset,
    );

    const contentStream = ops.join('\n');
    const xObjects = loadedImageEntries.map(
      ([imageIndex]) => `/${imageNameMap.get(imageIndex)} ${imageObjectNumbers.get(imageIndex)} 0 R`,
    );
    if (hasHeaderBanner && headerBannerObj) {
      xObjects.push(`/${HEADER_BANNER_IMAGE_NAME} ${headerBannerObj} 0 R`);
    }
    const imageResources = xObjects.length
      ? ` /XObject << ${xObjects.join(' ')} >>`
      : '';

    objects[pageObj - 1] =
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontRegularObj} 0 R /F2 ${fontBoldObj} 0 R >>${imageResources} >> ` +
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

export const buildRelatorioEmbarqueSedePdfReport = async (data = {}) => {
  const { pageModels, flatPhotos } = buildRelatorioEmbarquePages(
    data.sections || [],
    data.generalInfo || {},
  );
  const [photoAssetMap, headerBannerAsset] = await Promise.all([
    preparePdfPhotoAssets(flatPhotos),
    preparePdfHeaderBannerAsset(),
  ]);
  return buildPdfDocument(pageModels, photoAssetMap, headerBannerAsset);
};

export default buildRelatorioEmbarqueSedePdfReport;
