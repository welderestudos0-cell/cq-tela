

// backend/src/controllers/controller.monitoramento.vazao.js--
import serviceMonitoramentoVazao from "../services/service.monitoramento.vazao.js";

// ========== SALVAR DADOS DE VAZÃO (ENDPOINT PRINCIPAL) ==========
const SalvarDadosVazao = async (req, res) => {
  try {
    console.log('📊 Controller: Recebendo dados de vazão:', req.body);

    // Verificar se são múltiplos registros ou um único
    const dados = req.body;
    
    // Se é um array, processar como batch
    if (Array.isArray(dados)) {
      console.log('📊 Processando batch de', dados.length, 'registros');
      
      if (dados.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: "Lista de registros está vazia" 
        });
      }

      if (dados.length > 100) {
        return res.status(400).json({ 
          success: false,
          error: "Máximo de 100 registros por batch" 
        });
      }

      // Processar registros e filtrar os que têm GPS válido
      const registrosProcessados = [];
      const registrosRejeitados = [];

      dados.forEach((registro, index) => {
        try {
          // Validar GPS antes de processar
          let hasValidGPS = false;
          
          if (registro.gps) {
            if (Array.isArray(registro.gps) && registro.gps.length >= 2) {
              const [longitude, latitude] = registro.gps;
              hasValidGPS = latitude !== 0 && longitude !== 0 && 
                           Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
            } else if (registro.gps.latitude && registro.gps.longitude) {
              hasValidGPS = registro.gps.latitude !== 0 && registro.gps.longitude !== 0 &&
                           Math.abs(registro.gps.latitude) <= 90 && Math.abs(registro.gps.longitude) <= 180;
            }
          }

          if (!hasValidGPS) {
            registrosRejeitados.push({
              index,
              motivo: 'GPS inválido ou não capturado',
              registro: {
                ramal: registro.ramal,
                linha: registro.linha,
                usuario: registro.usuario
              }
            });
            console.log(`🚫 Registro ${index} rejeitado - GPS inválido: Ramal ${registro.ramal}, Linha ${registro.linha}`);
            return; // Não processar este registro
          }

          // Se GPS é válido, processar registro
          // *** CORREÇÃO: PRESERVAR DADOS DE PRESSÃO ***
          const registroProcessado = {
            ...registro,
            ramal: parseInt(registro.ramal),
            linha: parseInt(registro.linha),
            vazao1: registro.vazao1 ? parseFloat(registro.vazao1) : null,
            vazao2: registro.vazao2 ? parseFloat(registro.vazao2) : null,
            vazao3: registro.vazao3 ? parseFloat(registro.vazao3) : null,
            mediaVazao: registro.mediaVazao ? parseFloat(registro.mediaVazao) : null,
            pressaoFinal: registro.pressaoFinal ? parseFloat(registro.pressaoFinal) : null,
            
            // *** PRESERVAR DADOS DE PRESSÃO DIRETOS ***
            paf: registro.paf ? parseFloat(registro.paf) : null,
            pdf: registro.pdf ? parseFloat(registro.pdf) : null,
            pav: registro.pav ? parseFloat(registro.pav) : null,
            pdv: registro.pdv ? parseFloat(registro.pdv) : null,
            
            // *** TAMBÉM MONTAR AS ESTRUTURAS ESPERADAS PELO REPOSITORY ***
            leituraFiltro: registro.leituraFiltro || {
              paf: registro.paf ? parseFloat(registro.paf) : null,
              pdf: registro.pdf ? parseFloat(registro.pdf) : null
            },
            leituraValvula: registro.leituraValvula || {
              pav: registro.pav ? parseFloat(registro.pav) : null,
              pdv: registro.pdv ? parseFloat(registro.pdv) : null
            }
          };

          registrosProcessados.push(registroProcessado);
          console.log(`✅ Registro ${index} processado - GPS válido com dados de pressão: Ramal ${registro.ramal}, Linha ${registro.linha}`, {
            paf: registroProcessado.paf,
            pdf: registroProcessado.pdf,
            pav: registroProcessado.pav,
            pdv: registroProcessado.pdv
          });

        } catch (error) {
          console.error(`❌ Erro ao processar registro ${index}:`, error);
          registrosRejeitados.push({
            index,
            motivo: error.message,
            registro: registro
          });
        }
      });

      // Verificar se há registros válidos para processar
      if (registrosProcessados.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Nenhum registro válido encontrado. Todos os registros foram rejeitados por GPS inválido.",
          detalhes: {
            totalEnviados: dados.length,
            rejeitados: registrosRejeitados.length,
            motivosRejeicao: registrosRejeitados
          }
        });
      }

      // Chamar serviço para batch
      const resultado = await serviceMonitoramentoVazao.InserirBatch(registrosProcessados, req);
      
      // Incluir informações sobre registros rejeitados na resposta
      return res.status(201).json({
        ...resultado,
        registrosRejeitados: registrosRejeitados.length,
        detalhesRejeicao: registrosRejeitados.length > 0 ? registrosRejeitados : undefined
      });
    } 
    // Caso contrário, processar como registro único
    else {
      // *** CORREÇÃO: EXTRAIR TAMBÉM OS DADOS DE PRESSÃO DIRETOS ***
      const {
        fazenda,
        talhao,
        usuario,
        ramal,
        linha,
        tempo,
        vazao1,
        vazao2,
        vazao3,
        mediaVazao,
        pressaoFinal,
        leituraFiltro,
        leituraValvula,
        // *** ADICIONAR EXTRAÇÃO DOS DADOS DE PRESSÃO DIRETOS ***
        paf,
        pdf,
        pav,
        pdv,
        gps,
        timestamp
      } = dados;

      console.log('🔍 Controller: Dados de pressão extraídos:', {
        paf_direto: paf,
        pdf_direto: pdf,
        pav_direto: pav,
        pdv_direto: pdv,
        leituraFiltro_obj: leituraFiltro,
        leituraValvula_obj: leituraValvula
      });

      // Validação básica dos campos obrigatórios
      if (!fazenda || !usuario || !ramal || !linha) {
        return res.status(400).json({ 
          success: false,
          error: "Fazenda, usuário, ramal e linha são obrigatórios" 
        });
      }

      // Validar GPS específico para registro único
      let hasValidGPS = false;
      if (gps) {
        if (Array.isArray(gps) && gps.length >= 2) {
          const [longitude, latitude] = gps;
          hasValidGPS = latitude !== 0 && longitude !== 0 && 
                       Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
        } else if (gps.latitude && gps.longitude) {
          hasValidGPS = gps.latitude !== 0 && gps.longitude !== 0 &&
                       Math.abs(gps.latitude) <= 90 && Math.abs(gps.longitude) <= 180;
        }
      }

      if (!hasValidGPS) {
        return res.status(400).json({
          success: false,
          error: "GPS inválido ou não capturado. Coordenadas válidas são obrigatórias."
        });
      }

      // *** CORREÇÃO: MONTAR OBJETO DE DADOS COM PRESSÃO ***
      const dadosTeste = {
        fazenda,
        talhao,
        usuario,
        ramal: parseInt(ramal),
        linha: parseInt(linha),
        tempo,
        vazao1: vazao1 ? parseFloat(vazao1) : null,
        vazao2: vazao2 ? parseFloat(vazao2) : null,
        vazao3: vazao3 ? parseFloat(vazao3) : null,
        mediaVazao: mediaVazao ? parseFloat(mediaVazao) : null,
        pressaoFinal: pressaoFinal ? parseFloat(pressaoFinal) : null,
        
        // *** PRESERVAR DADOS DE PRESSÃO DIRETOS ***
        paf: paf ? parseFloat(paf) : null,
        pdf: pdf ? parseFloat(pdf) : null,
        pav: pav ? parseFloat(pav) : null,
        pdv: pdv ? parseFloat(pdv) : null,
        
        // *** MONTAR ESTRUTURAS PARA COMPATIBILIDADE COM REPOSITORY ***
        leituraFiltro: leituraFiltro || {
          paf: paf ? parseFloat(paf) : null,
          pdf: pdf ? parseFloat(pdf) : null
        },
        leituraValvula: leituraValvula || {
          pav: pav ? parseFloat(pav) : null,
          pdv: pdv ? parseFloat(pdv) : null
        },
        
        gps,
        timestamp
      };

      console.log('📡 Controller: Enviando para service com dados de pressão:', {
        paf: dadosTeste.paf,
        pdf: dadosTeste.pdf,
        pav: dadosTeste.pav,
        pdv: dadosTeste.pdv,
        leituraFiltro: dadosTeste.leituraFiltro,
        leituraValvula: dadosTeste.leituraValvula
      });

      // Chamar serviço para inserir
      const resultado = await serviceMonitoramentoVazao.Inserir(dadosTeste, req);
      
      return res.status(201).json(resultado);
    }

  } catch (error) {
    console.error("❌ Controller: Erro ao salvar dados de vazão:", error);
    res.status(500).json({ 
      success: false,
      error: "Erro interno ao salvar dados de vazão",
      message: error.message 
    });
  }
};

export default { 
  SalvarDadosVazao
};