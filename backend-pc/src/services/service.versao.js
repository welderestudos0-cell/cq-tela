// src/services/service.versao.js
import repositoryVersao from "../repositories/repository.versao.js";

// Inicializar tabela ao carregar o módulo
repositoryVersao.inicializarTabela().catch(err =>
    console.error("❌ Erro ao inicializar tabela VERSAO_APP:", err)
);

// ========== BUSCAR VERSÃO ATUAL ==========
const BuscarVersaoAtual = async () => {
    const versao = await repositoryVersao.BuscarVersaoAtiva();

    if (!versao) {
        return {
            success: true,
            versao: null,
            mensagem: null,
            obrigatorio: false,
            ativo: false
        };
    }

    return {
        success: true,
        versao: versao.versao,
        mensagem: versao.mensagem,
        obrigatorio: versao.obrigatorio === 1,
        ativo: versao.ativo === 1,
        id: versao.id
    };
};

// ========== INSERIR / ATUALIZAR VERSÃO ==========
const DefinirVersao = async ({ versao, mensagem, obrigatorio }) => {
    if (!versao) throw new Error("versao é obrigatório");

    const result = await repositoryVersao.Inserir({ versao, mensagem, obrigatorio });
    return { success: true, id: result.id };
};

// ========== ATUALIZAR VERSÃO POR ID ==========
const AtualizarVersao = async (id, dados) => {
    const result = await repositoryVersao.Atualizar(id, dados);
    if (result.changes === 0) throw new Error("Versão não encontrada");
    return { success: true };
};

export default { BuscarVersaoAtual, DefinirVersao, AtualizarVersao };
