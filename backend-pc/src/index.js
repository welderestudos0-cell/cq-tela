// backend\src\index.js
// ========================================
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import userRoutes from './routes/routes.js';
import { inicializarWhatsApp } from './services/service.whatsapp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MATURACAO_FOTOS_DIR = path.join(__dirname, '..', 'maturacaoforcada');
const MATURACAO_JSON_DIR = path.join(__dirname, '..', 'json', 'maturacaoforcada');
// Tudo (PDF, JSON, fotos) em analise_frutos/{tipo}/{fazenda}/{variedade}/{controle}/{data}/
const ANALISE_FRUTOS_DIR = path.join(__dirname, '..', 'analise_frutos');
const RELATORIO_EMBARQUE_PDF_DIR = path.join(__dirname, '..', 'relatorioembarque');
const RELATORIO_EMBARQUE_JSON_DIR = path.join(__dirname, '..', 'json', 'relatorioembarque');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const CQ_UPLOADS_DIR = path.join(UPLOADS_DIR, 'cq');
const RELATORIOS_DIR = path.join(UPLOADS_DIR, 'relatorios');
const TMP_PDF_DIR = path.join(__dirname, '..', 'tmp_pdf_test');

fs.mkdirSync(MATURACAO_FOTOS_DIR, { recursive: true });
fs.mkdirSync(MATURACAO_JSON_DIR, { recursive: true });
fs.mkdirSync(ANALISE_FRUTOS_DIR, { recursive: true });
fs.mkdirSync(RELATORIO_EMBARQUE_PDF_DIR, { recursive: true });
fs.mkdirSync(RELATORIO_EMBARQUE_JSON_DIR, { recursive: true });
fs.mkdirSync(CQ_UPLOADS_DIR, { recursive: true });
fs.mkdirSync(RELATORIOS_DIR, { recursive: true });
fs.mkdirSync(TMP_PDF_DIR, { recursive: true });

dotenv.config();

const app = express();

// Configuração robusta de CORS para EAS Build
app.use(cors({
  origin: [
    'http://localhost:8081',
    'http://192.168.3.37:8081',
    'exp://192.168.2.144:8081',
    'https://*.expo.dev',
    'https://*.exp.host',
    'https://0a19-2804-e94-9cb-b200-5cee-2857-4bb1-8c78.ngrok-free.app',
    '*'
  ],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/bot-admin', express.static(path.join(__dirname, 'public')));
app.get('/bot-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bot-admin.html'));
});
app.get('/pdf-editor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pdf-editor.html'));
});

// Middleware para logs detalhados
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', req.body);
  }
  next();
});

// Rota de health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: 'SQLite connected',
    timestamp: new Date().toISOString(),
    message: '🚀 AgroSolo API funcionando perfeitamente!',
    ngrok_url: 'https://0a19-2804-e94-9cb-b200-5cee-2857-4bb1-8c78.ngrok-free.app'
  });
});

// Arquivos da maturação forçada
app.use('/api/fotos-auditoria', express.static(path.join(__dirname, 'imagens_auditoria')));
app.use('/api/maturacao-forcada/fotos', express.static(MATURACAO_FOTOS_DIR));
app.use('/api/maturacao-forcada/json', express.static(MATURACAO_JSON_DIR));
app.use('/api/analise-frutos/pdf',   express.static(ANALISE_FRUTOS_DIR));
app.use('/api/analise-frutos/json',  express.static(ANALISE_FRUTOS_DIR));
app.use('/api/analise-frutos/fotos', express.static(ANALISE_FRUTOS_DIR));
app.use('/api/relatorio-embarque/pdf', express.static(RELATORIO_EMBARQUE_PDF_DIR));
app.use('/api/relatorio-embarque/json', express.static(RELATORIO_EMBARQUE_JSON_DIR));
app.use('/api/tmp-pdf', express.static(TMP_PDF_DIR));

app.use('/api', userRoutes);

// Handler de erros do multer e outros middlewares
app.use((err, req, res, next) => {
  console.error('❌ Erro no middleware:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Arquivo muito grande. Máximo 10MB.' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Campo de arquivo inesperado.' });
  }
  return res.status(500).json({ error: err.message || 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎉================================🎉`);
  console.log(`🚀 AGROSOLO BACKEND INICIADO!`);
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🌍 Rede: http://0.0.0.0:${PORT}`);
  console.log(`💾 Banco: SQLite (src/database/banco.db)`);
  console.log(`🎉================================🎉`);

  inicializarWhatsApp();
});
