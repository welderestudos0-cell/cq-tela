import axios from 'axios';

const EXTERNAL_API = 'http://10.107.114.11:3000/backend';

const asRows = (data) => (Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []));

const mapRowsToGroupedCarregamentos = (rows = []) => {
  const grouped = {};

  rows.forEach((item) => {
    const id = item.PLANCARREG_IN_CODIGO;
    if (!id) return;

    if (!grouped[id]) {
      grouped[id] = {
        oc: id,
        container: item.PLANCARREG_ST_NROCONTAINER || '',
        apelido: item.PLANCARREG_ST_APELIDO || '',
        motorista: item.PLANCARREG_ST_MOTORISTA || '',
        data_saida: item.PLANCARREG_DT_SAIDA || '',
        safra: item.SAFRA_ST_CODIGO || '',
        pallets: [],
      };
    }

    grouped[id].pallets.push({
      palletId: item.PLANPAL_IN_CODIGO,
      controle: item.CONTROLE || item.COMPA_IN_NROCONTROLE || null,
      variedade: item.VARIEDADE || item.CLSPROD_ST_DESCRICAO || '',
      caixa_descricao: item.CAIXA_ST_DESCRICAO || '',
      calibre: item.CALIB_IN_CODIGO,
      classe_prod: item.CLSPROD_IN_CODIGO,
      etiqueta: item.ETIQUETA || '',
      temperatura_1: item.TEMPERATURA_1 ?? '',
      temperatura_2: item.TEMPERATURA_2 ?? '',
      qtd_caixas: item.QTD_CAIXAS || 0,
    });
  });

  return Object.values(grouped);
};

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const controllerCarregamentos = {
  async BuscarCarregamentos(req, res) {
    try {
      const { data } = await axios.get(
        `${EXTERNAL_API}/busca_generica/buscaGenerica`,
        {
          params: { view: 'AGDTI.AGR_VW_DX_CARREGAMENTOS_NLIB' },
          timeout: 15000,
        },
      );

      const rows = asRows(data);
      const grouped = mapRowsToGroupedCarregamentos(rows);

      console.log("\n========== [Carregamentos] DADOS RECEBIDOS DO ORACLE ==========");
      console.log(JSON.stringify(grouped, null, 2));
      console.log("================================================================\n");

      res.json(data);
    } catch (err) {
      console.error('[Carregamentos] Erro ao buscar:', err.message);
      res.status(502).json({ error: 'Falha ao buscar carregamentos do servidor externo' });
    }
  },

  async BuscarPorContainer(req, res) {
    try {
      const containerRaw = String(req.query?.container || '').trim();
      if (!containerRaw) {
        return res.status(400).json({
          success: false,
          error: 'Parametro "container" e obrigatorio.',
        });
      }

      const { data } = await axios.get(
        `${EXTERNAL_API}/busca_generica/buscaGenerica`,
        {
          params: { view: 'AGDTI.AGR_VW_DX_CARREGAMENTOS_NLIB' },
          timeout: 15000,
        },
      );

      const rows = asRows(data);
      const grouped = mapRowsToGroupedCarregamentos(rows);
      const containerFilter = normalizeText(containerRaw);

      const encontrados = grouped.filter((item) => {
        const containerValue = normalizeText(item.container);
        return containerValue === containerFilter || containerValue.includes(containerFilter);
      });

      const onlyControls = String(req.query?.onlyControls || '').toLowerCase() === 'true';

      const dataResponse = encontrados.map((item) => {
        const controles = Array.from(
          new Set(
            (Array.isArray(item.pallets) ? item.pallets : [])
              .map((pallet) => String(pallet?.controle || '').trim())
              .filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

        if (onlyControls) {
          return {
            oc: item.oc,
            container: item.container,
            controles,
          };
        }

        return {
          ...item,
          controles,
        };
      });

      return res.status(200).json({
        success: true,
        filtro: {
          container: containerRaw,
          onlyControls,
        },
        total: dataResponse.length,
        data: dataResponse,
      });
    } catch (err) {
      console.error('[Carregamentos] Erro ao buscar por container:', err.message);
      return res.status(502).json({
        success: false,
        error: 'Falha ao buscar carregamento por container',
      });
    }
  },

  async InserirAvaliacaoContainer(req, res) {
    try {
      const { data } = await axios.post(
        `${EXTERNAL_API}/pallets/inserirAvaliacaoContainer`,
        req.body,
        { timeout: 15000 },
      );
      res.json(data);
    } catch (err) {
      console.error('[Carregamentos] Erro ao inserir avaliação:', err.message);
      res.status(502).json({ error: 'Falha ao enviar avaliação ao servidor externo' });
    }
  },
};

export default controllerCarregamentos;
