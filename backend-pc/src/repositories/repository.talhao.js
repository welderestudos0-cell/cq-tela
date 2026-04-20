// backend_agro_solo/src/repositories/repository.talhao.js
import { query } from "../database/sqlite.js";

const cleanText = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim().replace(/\s+/g, ' ');
    return text.length ? text : null;
};

const normalizeFilters = (filtros) => {
    if (typeof filtros === 'string') {
        return { fazenda: filtros };
    }

    if (!filtros || typeof filtros !== 'object') {
        return {};
    }

    return filtros;
};

// ========== LISTAR TALHÕES DA TABELA 'talhoes' ==========
const ListarTalhoesNovosPorFazenda = async (filtros = {}) => {
    try {
        const { fazenda, talhao } = normalizeFilters(filtros);
        console.log('Repository: buscando talhoes da tabela talhoes:', {
            fazenda: fazenda || 'todas',
            talhao: talhao || 'todos'
        });

        let sql = `
            SELECT
                ID as id,
                fazenda,
                ambientais
            FROM talhoes
            WHERE ambientais IS NOT NULL
              AND TRIM(ambientais) <> ''
        `;

        const params = [];

        if (fazenda) {
            sql += ` AND fazenda = ?`;
            params.push(cleanText(fazenda));
        }

        if (talhao) {
            sql += ` AND ambientais LIKE ?`;
            params.push(`%${cleanText(talhao)}%`);
        }

        sql += ` ORDER BY fazenda, ambientais`;

        const talhoes = await query(sql, params);

        console.log('Repository: talhoes encontrados na tabela talhoes:', talhoes.length);

        return talhoes;
    } catch (error) {
        console.error('Repository: erro ao listar talhoes da tabela talhoes:', error);
        throw error;
    }
};

// ========== LISTAR TODAS AS FAZENDAS DA NOVA TABELA ==========
const ListarTodasFazendas = async () => {
    try {
        console.log('🔍 Repository: Buscando todas as fazendas da tabela "talhoes"...');
        
        let sql = `
            SELECT DISTINCT fazenda as FAZENDA
            FROM talhoes 
            WHERE fazenda IS NOT NULL AND fazenda != ''
            ORDER BY fazenda
        `;
        
        const fazendas = await query(sql);
        
        console.log('📊 Repository: Fazendas encontradas:', fazendas.length);
        
        return fazendas.map(f => f.FAZENDA);
    } catch (error) {
        console.error('❌ Repository: Erro ao listar fazendas da tabela "talhoes":', error);
        throw error;
    }
};

// ========== ADICIONAR NOVO TALHÃO NA TABELA ==========
const AdicionarTalhao = async (fazenda, code, name, variedade) => {
    try {
        console.log('📝 Repository: Adicionando novo talhão na tabela "talhoes":', { fazenda, ambientais: name });
        
        let sql = `
            INSERT INTO talhoes (fazenda, ambientais)
            VALUES (?, ?)
        `;
        
        const result = await query(sql, [fazenda, name || code], 'run');
        
        console.log('✅ Repository: Talhão adicionado na tabela "talhoes" com ID:', result.lastID);
        
        return {
            id: result.lastID,
            fazenda,
            ambientais: name || code,
            success: true,
            message: 'Talhão adicionado com sucesso na tabela "talhoes"'
        };
    } catch (error) {
        console.error('❌ Repository: Erro ao adicionar talhão na tabela "talhoes":', error);
        throw error;
    }
};

export default { 
    ListarTalhoesNovosPorFazenda, 
    ListarTodasFazendas,
    AdicionarTalhao 
};
