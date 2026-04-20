import axios from 'axios';

const EXTERNAL_API = 'http://10.107.114.11:3000/backend';

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
      res.json(data);
    } catch (err) {
      console.error('[Carregamentos] Erro ao buscar:', err.message);
      res.status(502).json({ error: 'Falha ao buscar carregamentos do servidor externo' });
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
