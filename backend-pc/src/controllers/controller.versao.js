// src/controllers/controller.versao.js
import serviceVersao from "../services/service.versao.js";

// ========== GET /api/versao-app (PÚBLICO) ==========
const BuscarVersaoAtual = async (req, res) => {
    try {
        console.log("📱 Controller: Verificando versão do app");

        const resultado = await serviceVersao.BuscarVersaoAtual();

        return res.status(200).json(resultado);

    } catch (error) {
        console.error("❌ Controller: Erro ao buscar versão:", error);
        return res.status(500).json({
            success: false,
            error: "Erro interno ao buscar versão",
            details: error.message
        });
    }
};

// ========== POST /api/versao-app (PROTEGIDO - só admin usa) ==========
const DefinirVersao = async (req, res) => {
    try {
        const { versao, mensagem, obrigatorio } = req.body;

        console.log("📱 Controller: Definindo nova versão:", versao);

        if (!versao) {
            return res.status(400).json({ error: "Campo 'versao' é obrigatório" });
        }

        const resultado = await serviceVersao.DefinirVersao({ versao, mensagem, obrigatorio });

        return res.status(201).json({
            message: `Versão ${versao} definida com sucesso`,
            id: resultado.id
        });

    } catch (error) {
        console.error("❌ Controller: Erro ao definir versão:", error);
        return res.status(500).json({
            success: false,
            error: "Erro interno ao definir versão",
            details: error.message
        });
    }
};

// ========== PUT /api/versao-app/:id (PROTEGIDO) ==========
const AtualizarVersao = async (req, res) => {
    try {
        const { id } = req.params;
        const dados = req.body;

        console.log("📱 Controller: Atualizando versão ID:", id);

        await serviceVersao.AtualizarVersao(parseInt(id), dados);

        return res.status(200).json({ message: "Versão atualizada com sucesso" });

    } catch (error) {
        console.error("❌ Controller: Erro ao atualizar versão:", error);
        if (error.message === "Versão não encontrada") {
            return res.status(404).json({ error: error.message });
        }
        return res.status(500).json({
            success: false,
            error: "Erro interno ao atualizar versão",
            details: error.message
        });
    }
};

export default { BuscarVersaoAtual, DefinirVersao, AtualizarVersao };
