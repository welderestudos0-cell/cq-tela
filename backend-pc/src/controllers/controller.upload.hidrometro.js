
// backend/src/controllers/controller.upload.hidrometro.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pasta base para imagens
const BASE_DIR = path.join(__dirname, '..', 'imagens_hidrometros');

// Nomes dos meses em português
const MESES_PT = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

// Normaliza nome do mês (remove acentos e lowercase)
const normalizarMes = (mes) => {
  return mes.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
};

// Configuração do multer com destino dinâmico por fazenda/ano/mes
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fazenda = (req.body.fazenda || 'sem_fazenda')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    const now = new Date();
    const ano = now.getFullYear().toString();

    // Se tipo mensal, usa o mês selecionado como pasta; senão usa mês atual
    let mesNome;
    if (req.body.tipo_lancamento === 'mensal' && req.body.mes) {
      mesNome = normalizarMes(req.body.mes);
    } else {
      mesNome = MESES_PT[now.getMonth()];
    }

    const destDir = path.join(BASE_DIR, fazenda, ano, mesNome);

    // Cria a pasta se não existir
    fs.mkdirSync(destDir, { recursive: true });
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const now = new Date();
    const medidorNum = req.body.medidor_numero || '1';
    const tipo = req.body.tipo || 'foto'; // 'inicial' ou 'final'
    const leitura = req.body.leitura || '0';

    let prefix;
    if (req.body.tipo_lancamento === 'mensal' && req.body.mes) {
      // Mensal: janeiro_hidrometro_1_final_(200).jpeg
      prefix = normalizarMes(req.body.mes);
    } else {
      // Diário: DD_MM_YYYY_hidrometro_1_final_(200).jpeg
      const dia = String(now.getDate()).padStart(2, '0');
      const mes = String(now.getMonth() + 1).padStart(2, '0');
      const ano = now.getFullYear();
      prefix = `${dia}_${mes}_${ano}`;
    }

    const safeName = `${prefix}_hidrometro_${medidorNum}_${tipo}_(${leitura}).jpeg`;
    cb(null, safeName);
  },
});

// Filtro: só aceita imagens
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Controller para upload de fotos do hidrômetro
const UploadFotos = async (req, res) => {
  try {
    console.log('📸 Upload de fotos do hidrômetro recebido');
    console.log('Fazenda:', req.body.fazenda);
    console.log('Tipo:', req.body.tipo);
    console.log('Leitura:', req.body.leitura);
    console.log('Medidor:', req.body.medidor_numero);
    console.log('Tipo Lançamento:', req.body.tipo_lancamento);
    console.log('Mês:', req.body.mes);
    console.log('Arquivos:', req.files?.length || 0);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhuma foto enviada' });
    }

    const arquivosSalvos = req.files.map((f) => ({
      nome: f.filename,
      caminho: f.path,
      tamanho: f.size,
    }));

    console.log('✅ Fotos salvas:', arquivosSalvos);

    return res.status(200).json({
      success: true,
      message: `${req.files.length} foto(s) salva(s) com sucesso`,
      arquivos: arquivosSalvos,
    });
  } catch (error) {
    console.error('❌ Erro no upload de fotos:', error);
    return res.status(500).json({ error: 'Erro ao salvar fotos', details: error.message });
  }
};

export { upload };
export default { UploadFotos };
