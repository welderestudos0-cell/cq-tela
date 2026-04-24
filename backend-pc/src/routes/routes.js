// src/routes/routes.js
import { Router } from "express";
import controllerConfiguracoesCelular from "../controllers/controller.configuracoes.celular.js";
import controllerMonitoramentoLimpeza from "../controllers/controller.monitoramento.limpeza.js";
import controllerManutencaoBomba from "../controllers/controller.manutencao.bomba.js";
import controllerMonitoramentoVazao from "../controllers/controller.monitoramento.vazao.js";
import controllerAcessos from "../controllers/controller.acessos.js";
import controllerUploadHidrometro, { upload } from "../controllers/controller.upload.hidrometro.js";
import controllerUploadAuditoria, { upload as uploadAuditoria } from "../controllers/controller.upload.auditoria.js";
import controllerMaturacaoForcada, { upload as uploadMaturacaoForcada } from "../controllers/controller.maturacao.forcada.js";
import controllerMaturacaoForcadaCatalogo from "../controllers/controller.maturacao.forcada.catalogo.js";
import controllerAnaliseFrutos, { uploadFields as uploadAnaliseFrutos } from "../controllers/controller.analise.frutos.js";
import controllerRelatorioEmbarqueSede, { uploadFotosRE } from "../controllers/controller.relatorio.embarque.sede.js";
import controllerCQ, { upload as uploadCQ } from "../controllers/controller.cq.js";
import controllerRelatorio from "../controllers/controller.relatorio.js";
import controllerPdfEditor from "../controllers/controller.pdf.editor.js";
import controllerBotMensagens from "../controllers/controller.bot.mensagens.js";
import controllerBotFluxos from "../controllers/controller.bot.fluxos.js";
import controllerBotVinculos from "../controllers/controller.bot.vinculos.js";
import controllerBotWausers from "../controllers/controller.bot.wausers.js";
import controllerConsumoAgua from "../controllers/controller.consumo.agua.js";
import controllerUser from "../controllers/controller.user.js";
import controllerVersao from "../controllers/controller.versao.js";
import controllerKC from "../controllers/controller.kc.js";
import controllerPermissoes from "../controllers/controller.permissoes.js";
import controllerAuditoriaLuciano from "../controllers/controller.auditoria.luciano.js";
import controllerClientesPaises from "../controllers/controller.clientes.paises.js";
import controllerVariedades from "../controllers/controller.variedades.js";
import controllerNavios from "../controllers/controller.navios.js";
import controllerCarregamentos from "../controllers/controller.carregamentos.js";
import controllerBuscaGenerica from "../controllers/controller.busca_generica.js";
import controllerMangaFotos, { uploadMangaFotos } from "../controllers/controller.manga.fotos.js";
import controllerMangaCadastros from "../controllers/controller.manga.cadastros.js";
import controllerPriorizacaoPallets, { uploadFotosPR } from "../controllers/controller.priorizacao.pallets.js";
import routesServidoresIp from "./routes.servidores.ip.js";
import jwt from "../token.js";

const router = Router();

// ========== ROTA DE TESTE ==========
router.get('/test', (req, res) => {
  res.json({
    message: 'AgroSolo API funcionando!',
    timestamp: new Date().toISOString(),
  });
});

// ========== ROTAS PÚBLICAS ==========
router.post("/users/login", controllerUser.Login);

// ========== ROTAS DE VERSÃO DO APP (SEM TOKEN) ==========
router.get("/versao-app", controllerVersao.BuscarVersaoAtual);
router.post("/versao-app", jwt.ValidateToken, controllerVersao.DefinirVersao);
router.put("/versao-app/:id", jwt.ValidateToken, controllerVersao.AtualizarVersao);

// ========== ROTAS PROTEGIDAS ==========
router.get("/users/profile", jwt.ValidateToken, controllerUser.Profile);

// ========== ROTAS DE MONITORAMENTO ==========
router.post("/monitoramento", jwt.ValidateToken, controllerUser.InserirMonitoramento);
router.get("/monitoramentos", jwt.ValidateToken, controllerUser.ListarMonitoramentos);

// ========== ROTAS DE MONITORAMENTO DE VAZÃO ==========
router.post("/salvar-dados-vazao", jwt.ValidateToken, controllerMonitoramentoVazao.SalvarDadosVazao);

// ========== ROTAS DE MONITORAMENTO DE LIMPEZA ==========
router.post("/limpeza", jwt.ValidateToken, controllerMonitoramentoLimpeza.Inserir);
router.post("/limpeza/batch", jwt.ValidateToken, controllerMonitoramentoLimpeza.InserirBatch);
router.get("/limpezas", jwt.ValidateToken, controllerMonitoramentoLimpeza.Listar);

// ========== ROTAS DE CONFIGURAÇÕES DO CELULAR ==========
router.post("/configuracoes-celular", jwt.ValidateToken, controllerConfiguracoesCelular.Inserir);
router.get("/configuracoes-celular", jwt.ValidateToken, controllerConfiguracoesCelular.Listar);

// ========== ROTAS DE ACESSOS (SEM TOKEN) ==========
router.post("/acessos", controllerAcessos.Inserir);
router.get("/acessos", controllerAcessos.Listar);
router.get("/acessos/:id", controllerAcessos.BuscarPorId);
router.put("/acessos/:id", controllerAcessos.Atualizar);
router.put("/acessos/:id/confirmar", controllerAcessos.Confirmar);
router.delete("/acessos/:id", controllerAcessos.Deletar);

// ========== ROTAS DE CONSUMO DE ÁGUA (SEM TOKEN) ==========
router.post("/consumo-agua", controllerConsumoAgua.Inserir);
router.put("/consumo-agua/:consumo_id", controllerConsumoAgua.Atualizar);
router.get("/consumo-agua", controllerConsumoAgua.Listar);
router.get("/consumo-agua/:id", controllerConsumoAgua.BuscarPorId);

// ========== ROTAS DE MANUTENÇÃO DE BOMBA ==========
router.post("/manutencao-bomba", jwt.ValidateToken, controllerManutencaoBomba.Inserir);
router.post("/manutencao-bomba/batch", jwt.ValidateToken, controllerManutencaoBomba.InserirBatch);
router.get("/manutencoes-bomba", jwt.ValidateToken, controllerManutencaoBomba.Listar);
router.get("/manutencao-bomba/:id", jwt.ValidateToken, controllerManutencaoBomba.BuscarPorId);
router.get("/manutencoes-bomba-debug", controllerManutencaoBomba.Listar);

router.get("/configuracoes-celular/:id", jwt.ValidateToken, controllerConfiguracoesCelular.BuscarPorId);
router.put("/configuracoes-celular/:id", jwt.ValidateToken, controllerConfiguracoesCelular.Atualizar);
router.delete("/configuracoes-celular/:id", jwt.ValidateToken, controllerConfiguracoesCelular.Deletar);
router.get("/configuracoes-celular/usuario/:nomeUsuario", jwt.ValidateToken, controllerConfiguracoesCelular.BuscarUltimaPorUsuario);
router.post("/configuracoes-celular/acesso", jwt.ValidateToken, controllerConfiguracoesCelular.RegistrarAcesso);

// ========== ROTAS DOS TALHÕES (SEM TOKEN) ==========
router.get("/talhoes", controllerUser.ListarTalhoes);
router.get("/talhoes/:fazenda", controllerUser.ListarTalhoes);

// ========== ROTAS DE UPLOAD DE FOTOS HIDRÔMETRO ==========
router.post("/upload-fotos-hidrometro", upload.array('fotos', 10), controllerUploadHidrometro.UploadFotos);

// ========== ROTAS DE UPLOAD DE FOTOS AUDITORIA ==========
router.post("/upload-fotos-auditoria", uploadAuditoria.single('foto'), controllerUploadAuditoria.UploadFotos);

// ========== ROTAS DE MATURAÇÃO FORÇADA ==========
router.post("/maturacao-forcada", uploadMaturacaoForcada.array("fotos", 20), controllerMaturacaoForcada.Salvar);
router.post("/maturacaoforcada", uploadMaturacaoForcada.array("fotos", 20), controllerMaturacaoForcada.Salvar);
router.get("/maturacao-forcada", controllerMaturacaoForcada.Listar);
router.get("/maturacaoforcada", controllerMaturacaoForcada.Listar);
router.get("/maturacao-forcada/catalogo", controllerMaturacaoForcadaCatalogo.Listar);
router.get("/maturacao-forcada/catalogo/compradores", controllerMaturacaoForcadaCatalogo.ListarCompradores);
router.get("/maturacao-forcada/catalogo/produtores", controllerMaturacaoForcadaCatalogo.ListarProdutores);
router.get("/maturacao-forcada/catalogo/parcelas", controllerMaturacaoForcadaCatalogo.ListarParcelas);
router.get("/maturacao-forcada/galeria/fazendas", controllerMaturacaoForcada.GaleriaListarFazendas);
router.get("/maturacao-forcada/galeria/fotos", controllerMaturacaoForcada.GaleriaListarFotos);
router.get("/maturacao-forcada/galeria/foto/*", controllerMaturacaoForcada.GaleriaServirFoto);
router.get("/maturacao-forcada/:id", controllerMaturacaoForcada.BuscarPorId);
router.get("/maturacaoforcada/:id", controllerMaturacaoForcada.BuscarPorId);

// ========== ROTAS DE ANALISE DE FRUTOS ==========
router.post("/analise-frutos", uploadAnaliseFrutos, controllerAnaliseFrutos.Salvar);
router.post("/analise-frutos/teste-pdf", uploadAnaliseFrutos, controllerAnaliseFrutos.GerarTestePdf);
router.get("/analise-frutos/diagnostico-rede", controllerAnaliseFrutos.DiagnosticoRede);
router.get("/analise-frutos/fotos-por-controle", controllerAnaliseFrutos.FotosPorControle);
router.get("/analise-frutos/fotos/*", controllerAnaliseFrutos.ServirFoto);
router.get("/analise-frutos", controllerAnaliseFrutos.Listar);
router.get("/analise-frutos/:id", controllerAnaliseFrutos.BuscarPorId);
router.delete("/analise-frutos/:id", controllerAnaliseFrutos.Remover);

// ========== ROTAS DE PERMISSÕES DE USUÁRIOS (SEM TOKEN) ==========
router.get("/usuarios", controllerPermissoes.ListarUsuarios);
router.post("/usuarios", controllerPermissoes.CriarUsuario);
router.put("/usuarios/:id/modulos", controllerPermissoes.AtualizarModulos);
router.put("/usuarios/:id/senha", controllerPermissoes.AlterarSenha);
router.put("/usuarios/:id/ativo", controllerPermissoes.ToggleAtivo);
router.put("/usuarios/:id/nivel-acesso", controllerPermissoes.AtualizarNivelAcesso);
router.delete("/usuarios/:id", controllerPermissoes.DeletarUsuario);
router.get("/usuarios/meus-modulos/:id", controllerPermissoes.BuscarMeusModulos);

// ========== ROTAS DE KC ==========
router.post("/kc-talhao", controllerKC.Inserir);
router.post("/kc-talhao/batch", controllerKC.InserirBatch);
router.get("/kc-talhao", controllerKC.Listar);

// ========== ROTAS DE AUDITORIA LUCIANO (SEM TOKEN) ==========
router.post("/auditoria-luciano", controllerAuditoriaLuciano.Inserir);
router.get("/auditoria-luciano", controllerAuditoriaLuciano.Listar);
router.get("/auditoria-luciano/:id", controllerAuditoriaLuciano.BuscarPorId);
router.put("/auditoria-luciano/pergunta/:form_id/:pergunta_id", controllerAuditoriaLuciano.AtualizarPergunta);
router.delete("/auditoria-luciano/form/:form_id", controllerAuditoriaLuciano.DeletarPorFormId);
router.delete("/auditoria-luciano/foto/:form_id/:pergunta_id", controllerAuditoriaLuciano.RemoverFotoUrl);

// ========== ROTAS DE VARIEDADES ==========
router.get("/variedades", controllerVariedades.Listar);
router.get("/variedades/:id", controllerVariedades.BuscarPorId);
router.post("/variedades", controllerVariedades.Criar);
router.put("/variedades/:id", controllerVariedades.Atualizar);
router.delete("/variedades/:id", controllerVariedades.Deletar);

// ========== ROTAS DE CLIENTES E PAÍSES ==========
router.get("/clientes-paises", controllerClientesPaises.Listar);
router.get("/clientes-paises/:id", controllerClientesPaises.BuscarPorId);
router.post("/clientes-paises", controllerClientesPaises.Criar);
router.put("/clientes-paises/:id", controllerClientesPaises.Atualizar);
router.delete("/clientes-paises/:id", controllerClientesPaises.Deletar);

// ========== ROTAS DE NAVIOS ==========
router.get("/navios", controllerNavios.Listar);
router.post("/navios", controllerNavios.Criar);
router.delete("/navios/:id", controllerNavios.Deletar);

// ========== ROTAS DE SERVIDORES IP ==========
router.use(routesServidoresIp);

// ========== ROTAS DE CONTROLE DE QUALIDADE (CQ) ==========
router.post("/cq", uploadCQ.single("foto"), controllerCQ.Inserir);
router.get("/cq", controllerCQ.Listar);
router.get("/cq/resumo-dia", controllerCQ.ResumoDia);
router.get("/cq/:id", controllerCQ.BuscarPorId);
router.delete("/cq/:id", controllerCQ.Deletar);

// ========== ROTAS DE RELATORIO / WHATSAPP ==========
router.post("/relatorio/disparar", controllerRelatorio.Disparar);
router.get("/relatorio/status", controllerRelatorio.Status);
router.post("/relatorio-embarque-sede", controllerRelatorioEmbarqueSede.Salvar);
router.post("/relatorio-embarque-sede/upload-fotos", uploadFotosRE.array("fotos", 50), controllerRelatorioEmbarqueSede.UploadFotos);
router.get("/relatorio-embarque-sede/fotos/*", controllerRelatorioEmbarqueSede.ServirFoto);
router.get("/relatorio-embarque-sede", controllerRelatorioEmbarqueSede.Listar);
router.get("/relatorio-embarque-sede/:id", controllerRelatorioEmbarqueSede.BuscarPorId);

// ========== ROTAS BUSCA GENÉRICA LOCAL (substitui 10.107.114.11:3000/backend) ==========
router.get("/backend/busca_generica/comandoGenerico", controllerBuscaGenerica.ComandoGenerico);
router.post("/backend/sincronizar-fazenda-talhao", controllerBuscaGenerica.SincronizarFazendaTalhao);

// ========== ROTAS DE CARREGAMENTOS (LOCAL SQLite) ==========
router.get("/carregamentos", controllerCarregamentos.BuscarCarregamentos);
router.get("/carregamentos/por-container", controllerCarregamentos.BuscarPorContainer);
router.post("/carregamentos/avaliacao-container", controllerCarregamentos.InserirAvaliacaoContainer);

// ========== ROTAS DE CADASTRO DE MANGA (Fazenda/Variedade/Controle) ==========
router.get("/manga-cadastros", controllerMangaCadastros.Listar);
router.post("/manga-cadastros", controllerMangaCadastros.Criar);
router.delete("/manga-cadastros/:id", controllerMangaCadastros.Deletar);

// ========== ROTAS DE FOTOS DE MANGA POR CONTROLE ==========
router.post("/manga-fotos/upload", uploadMangaFotos.array("fotos", 20), controllerMangaFotos.Upload);
router.get("/manga-fotos", controllerMangaFotos.BuscarPorControle);
router.get("/manga-fotos/resumo", controllerMangaFotos.Resumo);
router.get("/manga-fotos/serve/*", controllerMangaFotos.ServirFoto);

// ========== ROTAS DE PRIORIZAÇÃO DE PALLETS ==========
router.post("/priorizacao-pallets/upload-fotos", uploadFotosPR.array("fotos", 50), controllerPriorizacaoPallets.UploadFotos);
router.get("/priorizacao-pallets/listar-fotos-container", controllerPriorizacaoPallets.ListarFotosContainer);
router.get("/priorizacao-pallets/fotos/*", controllerPriorizacaoPallets.ServirFoto);
router.post("/priorizacao-pallets/salvar", controllerPriorizacaoPallets.Salvar);
router.get("/priorizacao-pallets", controllerPriorizacaoPallets.Listar);
router.post("/priorizacao/salvar", controllerPriorizacaoPallets.SalvarCompleto);
router.get("/priorizacao/buscar", controllerPriorizacaoPallets.BuscarPorOC);
router.get("/pallet-info", controllerPriorizacaoPallets.BuscarPalletInfo);
router.get("/pallet-info-lote", controllerPriorizacaoPallets.BuscarPalletInfoLote);
router.get("/pallet-dados", controllerPriorizacaoPallets.BuscarPalletDados);

// ========== PAINEL DE EDICAO DE PDF ==========
router.get("/pdf-editor/documentos", controllerPdfEditor.ListarDocumentos);
router.get("/pdf-editor/conteudo", controllerPdfEditor.ObterConteudo);
router.post("/pdf-editor/regenerar", controllerPdfEditor.RegenerarPdf);
router.get("/pdf-editor/pdfs", controllerPdfEditor.ListarPdfs);
router.post("/pdf-editor/aplicar-campos", controllerPdfEditor.AplicarCampos);

// ========== ROTAS DE MENSAGENS DO BOT ==========
router.get("/bot-mensagens", controllerBotMensagens.Listar);
router.post("/bot-mensagens", controllerBotMensagens.Criar);
router.put("/bot-mensagens/:chave", controllerBotMensagens.Atualizar);
router.post("/bot-mensagens/:chave/resetar", controllerBotMensagens.Resetar);
router.delete("/bot-mensagens/:chave", controllerBotMensagens.Deletar);

// ========== ROTAS DE FLUXOS DO BOT ==========
router.get("/bot-fluxos", controllerBotFluxos.ListarFluxos);
router.post("/bot-fluxos", controllerBotFluxos.CriarFluxo);
router.get("/bot-fluxos/:id", controllerBotFluxos.BuscarFluxo);
router.put("/bot-fluxos/:id", controllerBotFluxos.AtualizarFluxo);
router.delete("/bot-fluxos/:id", controllerBotFluxos.DeletarFluxo);
router.post("/bot-fluxos/:id/etapas", controllerBotFluxos.CriarEtapa);
router.put("/bot-fluxos/:id/etapas/:etapa_id", controllerBotFluxos.AtualizarEtapa);
router.delete("/bot-fluxos/:id/etapas/:etapa_id", controllerBotFluxos.DeletarEtapa);

// ========== ROTAS DE VINCULOS DE FLUXOS ==========
router.get("/bot-vinculos", controllerBotVinculos.Listar);
router.post("/bot-vinculos", controllerBotVinculos.Criar);
router.put("/bot-vinculos/:id", controllerBotVinculos.Atualizar);
router.delete("/bot-vinculos/:id", controllerBotVinculos.Deletar);

// ========== ROTAS DE USUARIOS DO BOT (WhatsApp) ==========
router.get("/bot-wausers", controllerBotWausers.Listar);
router.post("/bot-wausers", controllerBotWausers.SalvarOuAtualizar);
router.delete("/bot-wausers/:numero", controllerBotWausers.Deletar);

export default router;
