// ─────────────────────────────────────────────────────────────────────────────
// DADOS — RELATÓRIO DE EMBARQUE
// Arquivo de configuração e utilitários de dados do Relatório de Embarque.
// Define as seções (MANGA PALMER, CONTAINER), seus itens e labels em PT/EN.
// Exporta funções para:
//   - createInitialRelatorioEmbarqueState(): estado inicial zerado do formulário
//   - mapSectionsToPdfLabels(): mapeia labels para o PDF (versão em inglês)
//   - flattenRelatorioEmbarquePhotos(): lista flat de todas as fotos
//   - buildRelatorioEmbarqueFieldCounts(): contagem de fotos por seção/item
// Usado por: RelatorioEmbarqueSede.jsx e relatorioEmbarqueSedePdfReport.js
// ─────────────────────────────────────────────────────────────────────────────

export const RELATORIO_EMBARQUE_TITLE = 'Relatorio de Controle de Qualidade';

export const RELATORIO_EMBARQUE_FLOW = ['Informações Gerais', 'Priorização', 'Mangas', 'Container', 'Rascunhos'];

export const CHECKLIST_CONTAINER_ITEMS = [
  { key: 'interior_limpo', label: '1. Interior do container está limpo (livre de odor, sem materiais estranhos, madeira, insetos, etc.)' },
  { key: 'sem_estragos_borrachas', label: '2. Container sem estragos (borrachas da porta estão em bom estado)' },
  { key: 'drenagem_aberta', label: '3. Drenagem do container está aberta' },
  { key: 'refrigeracao_operando', label: '4. Maquinário de refrigeração está operando corretamente' },
  { key: 'pre_resfriado', label: '5. Container está pré-resfriado na temperatura correta', hasTemperatura: true },
  { key: 'ventilacao_exposta', label: '6. Ventilação do container exposta', usaSimNao: true },
  { key: 'ventilacao_40cbm', label: '7. Ventilação a 40 CBM' },
  { key: 'identificacao_correta', label: '8. A identificação/documentação do container está correta' },
  { key: 'sensores_funcionando', label: '9. Foi verificado se os sensores de temperatura estão funcionando corretamente' },
  { key: 'registradores_posicao', label: '10. Registradores portáteis de temperatura foram colocados na posição correta na carga' },
  { key: 'absorvedor_etileno', label: '11. Foi feito uso de absorvedor de etileno', usaSimNao: true },
  { key: 'sanitizado_acido', label: '12. O container foi sanitizado com solução a base de ácido peracético' },
  { key: 'qualidade_paletizacao', label: '13. Qualidade da paletização (fitas, estrado e alinhamento das caixas). Não conformes' },
  { key: 'carga_temperatura_correta', label: '14. A carga está na temperatura correta (temperatura média de polpa)' },
  { key: 'lacre_colocado', label: '15. Lacre está devidamente colocado na porta do container' },
  { key: 'temperatura_saida', label: '16. Temperatura de saída do container', hasTemperatura: true },
];

export const PRIORIZACAO_FOTO_CAMPOS = [
  { key: 'maturacao_variedade', label: '1. Maturação por variedade do container' },
  { key: 'firmeza_variedade', label: '2. Firmeza por variedade do container' },
  { key: 'temp_polpa_variedade', label: '3. Temperaturas de polpa por variedade (2 fotos)' },
  { key: 'espelho_pallet_variedade', label: '4. Espelho de pallet por variedade (1 foto)' },
  { key: 'set_point_container', label: '5. Set point do container' },
  { key: 'foto_4_drenos', label: '6. Foto dos 4 drenos' },
  { key: 'foto_numeracao_interna', label: '7. Foto da numeração interna' },
  { key: 'foto_numeracao_externa', label: '8. Foto da numeração externa' },
  { key: 'foto_termografo', label: '9. Foto do termógrafo' },
  { key: 'foto_container_lacrado', label: '10. Foto do container lacrado' },
  { key: 'foto_lacre', label: '11. Foto do nº do lacre' },
];

export const MANGA_FOTO_ITEMS = [
  { key: 'appearance', label: 'Aparência' },
  { key: 'pulp_temperature', label: 'Temperatura da polpa' },
  { key: 'maturity', label: 'Maturação' },
  { key: 'firmness', label: 'Firmeza' },
];

export const PALLET_DEFAULT_DATA = [
  { pallet: '8565', etiqueta: 'NC', temp1: '', temp2: '' },
  { pallet: '8566', etiqueta: 'NC', temp1: '', temp2: '' },
  { pallet: '8568', etiqueta: 'NC', temp1: '', temp2: '' },
];

export const createInitialChecklistState = () =>
  CHECKLIST_CONTAINER_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    value: null, // null = não marcado, 'C' = conforme, 'NC' = não conforme
    ...(item.hasTemperatura ? { temperatura: '' } : {}),
    ...(item.usaSimNao ? { usaSimNao: true } : {}),
  }));

export const createInitialPalletState = () =>
  PALLET_DEFAULT_DATA.map((row) => ({ ...row }));

export const RELATORIO_GENERAL_INFO = {
  customer: '',
  container: '',
  oc: '',
  loading: '',
  etd: '',
  eta: '',
  vessel: '',
};

export const RELATORIO_EMBARQUE_SECTIONS = [
  {
    key: 'mang_palmer',
    title: 'MANGA PALMER',
    pdfTitle: 'MANGO PALMER',
    items: [
      { key: 'appearance', label: 'Aparencia', pdfLabel: 'Appearance' },
      { key: 'pulp_temperature', label: 'Temperatura da polpa', pdfLabel: 'Pulp temperature' },
      { key: 'maturity', label: 'Maturacao', pdfLabel: 'Maturity' },
      { key: 'firmness', label: 'Firmeza', pdfLabel: 'Firmness' },
    ],
  },
  {
    key: 'container',
    title: 'CONTAINER',
    pdfTitle: 'CONTAINER',
    items: [
      { key: 'maturacao_variedade', label: 'Maturacao por variedade', pdfLabel: 'Maturity by variety' },
      { key: 'firmeza_variedade', label: 'Firmeza por variedade', pdfLabel: 'Firmness by variety' },
      { key: 'temp_polpa_variedade', label: 'Temperaturas de polpa por variedade', pdfLabel: 'Pulp temperatures by variety' },
      { key: 'espelho_pallet_variedade', label: 'Espelho de pallet por variedade', pdfLabel: 'Pallet mirror by variety' },
      { key: 'set_point_container', label: 'Set point do container', pdfLabel: 'Container set point' },
      { key: 'foto_4_drenos', label: 'Quatro drenos', pdfLabel: 'Four drains' },
      { key: 'foto_numeracao_interna', label: 'Numeracao interna', pdfLabel: 'Internal numbering' },
      { key: 'foto_numeracao_externa', label: 'Numeracao externa', pdfLabel: 'External numbering' },
      { key: 'foto_termografo', label: 'Termografo', pdfLabel: 'Thermograph' },
      { key: 'foto_container_lacrado', label: 'Container lacrado', pdfLabel: 'Sealed container' },
      { key: 'foto_lacre', label: 'Numero do lacre', pdfLabel: 'Seal number' },
    ],
  },
];

export const createInitialRelatorioEmbarqueState = () =>
  RELATORIO_EMBARQUE_SECTIONS.map((section) => ({
    key: section.key,
    title: section.title,
    pdfTitle: section.pdfTitle || section.title,
    items: section.items.map((item) => ({
      key: item.key,
      label: item.label,
      pdfLabel: item.pdfLabel || item.label,
      photos: [],
    })),
  }));

export const mapSectionsToPdfLabels = (sections = []) =>
  sections.map((section) => ({
    key: section.key,
    title: section.pdfTitle || section.title,
    items: (section.items || []).map((item) => ({
      key: item.key,
      label: item.pdfLabel || item.label,
      photos: item.photos || [],
    })),
  }));

export const flattenRelatorioEmbarquePhotos = (sections = []) => {
  const flatPhotos = [];

  sections.forEach((section) => {
    (section.items || []).forEach((item) => {
      (item.photos || []).forEach((photo) => {
        flatPhotos.push({
          ...photo,
          sectionKey: section.key,
          sectionTitle: section.title,
          itemKey: item.key,
          itemLabel: item.label,
        });
      });
    });
  });

  return flatPhotos;
};

export const buildRelatorioEmbarqueFieldCounts = (sections = []) =>
  sections.map((section) => ({
    key: section.key,
    title: section.title,
    totalPhotos: (section.items || []).reduce((sum, item) => sum + ((item.photos || []).length), 0),
    items: (section.items || []).map((item) => ({
      key: item.key,
      label: item.label,
      totalPhotos: (item.photos || []).length,
    })),
  }));
