// backend_agro_solo/src/controllers/controller.user.js--
import serviceUser from "../services/service.user.js";
import repositoryTalhao from "../repositories/repository.talhao.js";
import repositoryMaturacaoForcadaCatalogo from "../repositories/repository.maturacao.forcada.catalogo.js";

const parseAmbientais = (ambientais) => {
    if (!ambientais) {
        return { fazenda: null, talhao: null, variedade: null };
    }

    const parts = String(ambientais)
        .split(/\s+-\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length === 0) {
        return { fazenda: null, talhao: null, variedade: null };
    }

    if (parts.length === 1) {
        return { fazenda: null, talhao: parts[0], variedade: null };
    }

    if (parts.length === 2) {
        return { fazenda: parts[0], talhao: parts[1], variedade: null };
    }

    return {
        fazenda: parts[0],
        talhao: parts.slice(1, -1).join(" - "),
        variedade: parts[parts.length - 1],
    };
};

const normalizeTalhaoRow = (row) => {
    const parsed = parseAmbientais(row.ambientais ?? row.AMBIENTAIS);

    return {
        id: row.id ?? row.ID ?? null,
        fazenda: row.fazenda ?? row.FAZENDA ?? parsed.fazenda,
        talhao: parsed.talhao,
        variedade: parsed.variedade,
        source: "talhoes",
    };
};

const normalizeCatalogoRow = (row) => ({
    id: row.id ?? row.ID ?? null,
    fazenda: row.produtor ?? row.PRODUTOR ?? null,
    talhao: row.parcela ?? row.PARCELA ?? null,
    variedade: "",
    source: "maturacao_forcada_catalogo",
});

// ========== LOGIN ==========
const Login = async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('🔐 Controller: Tentativa de login:', { email, password: '**' });

        if (!email || !password) {
            return res.status(400).json({
                error: "Email e senha são obrigatórios",
                success: false
            });
        }

        const user = await serviceUser.Login(email, password);

        if (!user) {
            console.log('❌ Login falhou para:', email);
            return res.status(401).json({
                error: "E-mail ou senha inválida",
                success: false
            });
        } else {
            console.log('✅ Login bem-sucedido:', {
                id: user.ID_USER,
                name: user.NAME,
                email: user.EMAIL,
                cargo: user.CARGO
            });
            return res.status(200).json(user);
        }
    } catch (error) {
        console.error("❌ Erro no login:", error);
        return res.status(500).json({
            error: "Erro interno no servidor",
            success: false
        });
    }
};

// ========== PROFILE ==========
const Profile = async (req, res) => {
    try {
        const id_user = req.id_user;

        console.log('📋 Controller: Buscando profile para ID:', id_user);

        if (!id_user) {
            return res.status(400).json({
                error: "ID do usuário não fornecido",
                success: false
            });
        }

        const user = await serviceUser.Profile(id_user);

        console.log('📋 Profile retornado:', user);
        return res.status(200).json(user);
    } catch (error) {
        console.error("❌ Erro ao buscar profile:", error);
        return res.status(500).json({
            error: "Erro interno ao buscar perfil",
            success: false
        });
    }
};

// ========== CADASTRO DE MONITORAMENTO DO SOLO ==========
const InserirMonitoramento = async (req, res) => {
    try {
        console.log('📊 Controller: Dados recebidos:', req.body);

        // Validar dados obrigatórios
        const { fazenda, talhao, usuario, momento } = req.body;

        if (!fazenda || !talhao || !usuario || !momento) {
            console.log('❌ Dados obrigatórios não fornecidos');
            return res.status(400).json({
                error: "Fazenda, talhão, usuário e momento são obrigatórios",
                success: false
            });
        }

        const monitoramento = await serviceUser.InserirMonitoramento(req.body);

        console.log("✅ Monitoramento registrado:", monitoramento);
        return res.status(201).json(monitoramento);
    } catch (error) {
        console.error("❌ Erro ao cadastrar monitoramento:", error);
        return res.status(500).json({
            error: error.message || "Erro interno ao cadastrar monitoramento",
            success: false,
            details: error.toString()
        });
    }
};

// ========== LISTAR MONITORAMENTOS ==========
const ListarMonitoramentos = async (req, res) => {
    try {
        const usuario = req.query.usuario || req.id_user;

        console.log('📊 Controller: Listando monitoramentos para:', usuario);

        const result = await serviceUser.ListarMonitoramentos(usuario);

        console.log("✅ Monitoramentos listados:", result.total);
        return res.status(200).json(result);
    } catch (error) {
        console.error("❌ Erro ao listar monitoramentos:", error);
        return res.status(500).json({
            error: "Erro interno ao listar monitoramentos",
            success: false
        });
    }
};

// ========== LISTAR TALHÕES ==========
const ListarTalhoes = async (req, res) => {
    try {
        const source = String(req.query.source || "both").toLowerCase();
        const fazenda = req.query.fazenda || req.params.fazenda || req.body?.fazenda || null;
        const talhao = req.query.talhao || req.params.talhao || req.body?.talhao || null;
        const produtor = req.query.produtor || req.body?.produtor || null;
        const parcela = req.query.parcela || req.body?.parcela || talhao || null;
        const comprador = req.query.comprador || req.body?.comprador || null;

        console.log('Controller: listando talhoes com filtros:', {
            source,
            fazenda: fazenda || 'todas',
            talhao: talhao || 'todos',
            produtor: produtor || 'todos',
            parcela: parcela || 'todas',
        });

        const includeTalhoes = source === "both" || source === "talhoes";
        const includeCatalogo = source === "both" || source === "catalogo";

        const talhoesRaw = includeTalhoes
            ? await repositoryTalhao.ListarTalhoesNovosPorFazenda({ fazenda, talhao })
            : [];

        const catalogoRaw = includeCatalogo
            ? await repositoryMaturacaoForcadaCatalogo.Listar({
                comprador,
                produtor,
                parcela,
            })
            : [];

        const result = [
            ...talhoesRaw.map(normalizeTalhaoRow),
            ...catalogoRaw.map(normalizeCatalogoRow),
        ];

        console.log('Controller: retornando', result.length, 'registros normalizados');
        
        return res.status(200).json({
            success: true,
            data: result,
            total: result.length,
            source: includeTalhoes && includeCatalogo ? 'talhoes+catalogo' : source
        });
        
    } catch (error) {
        console.error("Controller: erro ao listar talhoes:", error);
        return res.status(500).json({
            error: "Erro interno ao listar talhoes",
            success: false,
            details: error.message
        });
    }
};

// ========== EXPORTAÇÃO ==========
export default { 
    Login, 
    Profile, 
    InserirMonitoramento, 
    ListarMonitoramentos,
    ListarTalhoes
};
