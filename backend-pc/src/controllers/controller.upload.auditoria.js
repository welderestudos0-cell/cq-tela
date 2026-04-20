import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import repositoryAuditoria from '../repositories/repository.auditoria.luciano.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.join(__dirname, '..', 'imagens_auditoria');

const MESES_PT = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const fazenda = (req.body.fazenda || 'sem_fazenda')
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

      const now = new Date();
      const ano = now.getFullYear().toString();
      const mes = MESES_PT[now.getMonth()];

      // Data formatada para subpasta: DD_MM_YYYY
      const dia = String(now.getDate()).padStart(2, '0');
      const mesNum = String(now.getMonth() + 1).padStart(2, '0');
      const data = `${dia}_${mesNum}_${ano}`;

      const destDir = path.join(BASE_DIR, fazenda, ano, mes, data);
      fs.mkdirSync(destDir, { recursive: true });
      cb(null, destDir);
    } catch (err) {
      console.error('❌ Erro ao criar diretório de upload:', err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const perguntaId = req.body.pergunta_id || '0';
    const now = new Date();
    const dia = String(now.getDate()).padStart(2, '0');
    const mes = String(now.getMonth() + 1).padStart(2, '0');
    const ano = now.getFullYear();
    const hora = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ext = path.extname(file.originalname).toLowerCase() || '.jpeg';
    const safeName = `${dia}_${mes}_${ano}_${hora}${min}_pergunta_${perguntaId}${ext}`;
    cb(null, safeName);
  },
});

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

const UploadFotos = async (req, res) => {
  try {
    // upload.single() → req.file; upload.array() → req.files
    const files = req.files?.length ? req.files : (req.file ? [req.file] : []);

    if (files.length === 0) {
      return res.status(400).json({ error: 'Nenhuma foto enviada' });
    }

    const fazenda = (req.body.fazenda || 'sem_fazenda').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const perguntaId = req.body.pergunta_id || '0';
    const formId = req.body.form_id || null;

    const now = new Date();
    const ano = now.getFullYear();
    const mes = MESES_PT[now.getMonth()];
    const dia = String(now.getDate()).padStart(2, '0');
    const mesNum = String(now.getMonth() + 1).padStart(2, '0');
    const data = `${dia}_${mesNum}_${ano}`;

    const arquivosSalvos = await Promise.all(files.map(async (f) => {
      // Construir URL pública relativa para acesso via HTTP
      const fotoUrl = `/api/fotos-auditoria/${fazenda}/${ano}/${mes}/${data}/${f.filename}`;

      // Salvar URL no banco se tiver form_id
      if (formId) {
        try {
          await repositoryAuditoria.AtualizarFotoUrl(formId, perguntaId, fotoUrl);
        } catch (dbErr) {
          console.warn('Aviso: não foi possível salvar FOTO_URL no banco:', dbErr.message);
        }
      }

      return { nome: f.filename, url: fotoUrl, tamanho: f.size };
    }));

    console.log('✅ Fotos de auditoria salvas:', arquivosSalvos);

    return res.status(200).json({
      success: true,
      message: `${files.length} foto(s) salva(s) com sucesso`,
      arquivos: arquivosSalvos,
    });
  } catch (error) {
    console.error('❌ Erro no upload de fotos de auditoria:', error);
    return res.status(500).json({ error: 'Erro ao salvar fotos', details: error.message });
  }
};

export { upload };
export default { UploadFotos };
