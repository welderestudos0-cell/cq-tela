// backend/src/routes/routes.servidores.ip.js
import { Router } from "express";
import controllerServidoresIp from "../controllers/controller.servidores.ip.js";

const router = Router();

// ========== ROTA PUBLICA - CELULAR CHAMA PRA PEGAR OS IPS DO USUARIO ==========
router.get("/servidores-ip/usuario/:id_user", controllerServidoresIp.ListarPorUsuario);

// ========== LISTAR TODOS (VER TODOS USUARIOS E SEUS IPS) ==========
router.get("/servidores-ip", controllerServidoresIp.Listar);

// ========== GERENCIAMENTO ==========
router.post("/servidores-ip", controllerServidoresIp.Inserir);
router.put("/servidores-ip/:id", controllerServidoresIp.Atualizar);
router.delete("/servidores-ip/:id", controllerServidoresIp.Deletar);

export default router;
