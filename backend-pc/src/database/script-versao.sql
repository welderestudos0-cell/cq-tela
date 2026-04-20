-- =====================================================
-- VERSAO_APP - Controle de versão do aplicativo
-- Execute este script no banco banco.db (SQLite)
-- =====================================================

-- Criar tabela
CREATE TABLE IF NOT EXISTS VERSAO_APP (
    ID          INTEGER PRIMARY KEY AUTOINCREMENT,
    versao      VARCHAR(20) NOT NULL,
    mensagem    TEXT,
    obrigatorio INTEGER DEFAULT 0,   -- 0 = não obrigatório | 1 = obrigatório
    ativo       INTEGER DEFAULT 1,   -- 0 = inativo | 1 = ativo
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Inserir versão atual (mude para a versão mais nova quando quiser avisar)
-- Enquanto versao = versao do app (1.0.5) → NÃO aparece aviso
-- Quando versao > versao do app → aparece o banner de atualização
INSERT INTO VERSAO_APP (versao, mensagem, obrigatorio, ativo)
VALUES ('1.0.5', 'Versão atual do aplicativo.', 0, 1);

-- =====================================================
-- COMO USAR:
--
-- Para avisar que tem versão nova (ex: 1.0.6):
--   INSERT INTO VERSAO_APP (versao, mensagem, obrigatorio, ativo)
--   VALUES ('1.0.6', 'Nova versão disponível! Conecte ao Wi-Fi Visitante e atualize o app.', 0, 1);
--
-- Ou via API (POST /api/versao-app) com token de admin:
--   { "versao": "1.0.6", "mensagem": "Nova versão disponível!", "obrigatorio": false }
--
-- O app compara a versão do banco com a versão em ajuda.jsx (1.0.5)
-- Se banco > app → mostra banner amarelo acima do avatar do usuário
-- Se banco = app → não aparece nada
-- =====================================================
