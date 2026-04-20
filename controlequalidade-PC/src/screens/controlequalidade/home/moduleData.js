// ─────────────────────────────────────────────────────────────────────────────
// DADOS DOS MÓDULOS — CONTROLE DE QUALIDADE
// Arquivo central de configuração do módulo CQ. Define:
//   - MODULE_FLOW: etapas do fluxo padrão (Identificação → PDF/Envio)
//   - MODULE_ORDER: ordem de exibição dos cards na home do CQ
//   - MODULES: configuração completa de cada submódulo (título, ícone, cor,
//              campos, regras de negócio, labels dos botões, etc.)
//   - getModuleByKey(): busca um módulo pelo seu key
// Usado por: ControleQualidadeHome.jsx e ControleQualidadeModulo.jsx
// ─────────────────────────────────────────────────────────────────────────────

// Define as etapas do fluxo padrão exibidas no stepper de cada módulo.
export const MODULE_FLOW = ['Identificação', 'Formulário', 'Fotos', 'Resumo', 'PDF / Envio'];

// Define a ordem de exibição dos cards de módulos na tela home do CQ.
export const MODULE_ORDER = [
  'maturacao_forcada',
  'relatorio_embarque',
  'analise_frutos',
];

// Configuração completa de cada submódulo do CQ: título, ícone, cor, campos, regras e labels dos botões.
export const MODULES = {
  maturacao_forcada: {
    key: 'maturacao_forcada',
    title: 'Maturação Forçada',
    subtitle: 'Registrar análise, fotos e PDF.',
    description: 'Fluxo para identificar a amostra, registrar ocorrências e montar o relatório final.',
    icon: 'science',
    image: require('../../../assets/maturacao.png'),
    color: '#2E7D32',
    softColor: '#E8F5E9',
    badge: 'PDF',
    objective: 'Registrar a avaliação de maturação forçada dos frutos diretamente no celular.',
    fields: [
      'Data de recebimento',
      'Fazenda',
      'Talhão',
      'Produtor',
      'Variedade',
      'Data da análise',
      'Quantidade de frutos',
      'Ocorrências e observações',
    ],
    rules: [
      'Campos obrigatórios devem ser validados antes de salvar.',
      'Campos quantitativos aceitam apenas números inteiros maiores ou iguais a zero.',
      'Fotos precisam ficar vinculadas ao registro correto e entrar no PDF final.',
    ],
    footer:
      'O PDF final deve incluir dados, fotos, responsável pelo preenchimento e data de geração.',
    primaryActionLabel: 'Nova análise',
    secondaryActionLabel: 'Voltar',
  },
  analise_frutos: {
    key: 'analise_frutos',
    title: 'Análise de Frutos',
    subtitle: 'Analise individual e lancamento em lotes.',
    description: 'Gera os frutos automaticamente a partir da quantidade informada para agilizar o trabalho do CQ.',
    icon: 'spa',
    color: '#F57C00',
    softColor: '#FFF3E0',
    badge: 'Lotes',
    objective: 'Substituir o papel no campo com lançamento rápido por fruto no celular.',
    fields: [
      'Tipo de analise',
      'Fazenda / Talhão',
      'Talhão',
      'Data',
      'Controle',
      'Variedade',
      'Qtd. de frutos',
      'Critério',
      'Observações',
      'Peso final da caixa',
    ],
    rules: [
      'Quando qtd_frutos for informada, os frutos devem ser gerados automaticamente.',
      'Cada fruto deve ter número sequencial e campo de valor decimal.',
      'Ao reduzir qtd_frutos, remover excedentes apenas com confirmação.',
    ],
    footer: 'O usuario pode voltar para editar os dados e manter todos os lancamentos no mesmo registro.',
    primaryActionLabel: 'Nova análise',
    secondaryActionLabel: 'Voltar',
  },
  relatorio_embarque: {
    key: 'relatorio_embarque',
    title: 'Relatorio de Embarque',
    image: require('../../../assets/embarquecard.png'),
    subtitle: 'Fotos por item, sem campos de texto.',
    description: 'Fluxo fotográfico com organização por MANG PALMER e CONTAINER, usando câmera ou galeria.',
    icon: 'local-shipping',
    color: '#2E7D32',
    softColor: '#E8F5E9',
    badge: 'Fotos',
    objective: 'Organizar fotos por item e gerar o PDF final automaticamente, sem digitação de dados do embarque.',
    fieldGroups: [
      {
        title: 'MANG PALMER',
        items: [
          'Appearance',
          'Pulp temperature',
          'Maturity',
          'Firmness',
        ],
      },
      {
        title: 'CONTAINER',
        items: [
          'Internal identification',
          'Setpoint and temperature',
          'External identification',
          'Termograph location',
          'Termograph identification',
          'Drain',
        ],
      },
    ],
    fields: [
      'Appearance',
      'Pulp temperature',
      'Maturity',
      'Firmness',
      'Internal identification',
      'Setpoint and temperature',
      'External identification',
      'Termograph location',
      'Termograph identification',
      'Drain',
    ],
    rules: [
      'Não existe campo de texto neste formulário.',
      'Cada item aceita uma ou mais fotos pela câmera ou galeria.',
      'As fotos ficam vinculadas ao item correto e entram no PDF automaticamente.',
    ],
    footer: 'O PDF final mostra as fotos organizadas por item, sem dados digitados de embarque.',
    primaryActionLabel: 'Abrir formulário',
    secondaryActionLabel: 'Voltar',
  },
  pre_colheita: {
    key: 'pre_colheita',
    title: 'Pré-colheita',
    subtitle: 'Checklist do talhão antes da colheita.',
    description: 'Fluxo para avaliar condição geral, incidências e necessidade de ação corretiva.',
    icon: 'agriculture',
    color: '#00897B',
    softColor: '#E0F2F1',
    badge: 'Checklist',
    objective: 'Criar do zero um formulário de pré-colheita para análise das condições do talhão.',
    fields: [
      'Data da avaliação',
      'Fazenda',
      'Talhão',
      'Produtor',
      'Variedade',
      'Responsável',
      'Idade da lavoura',
      'Estimativa de colheita',
      'Quantidade prevista',
      'Condição geral do talhão',
      'Uniformidade dos frutos',
      'Presença de doenças e pragas',
      'Incidências de antracnose, colapso, germinação e alternária',
      'Necessita ação corretiva e observações',
    ],
    rules: [
      'O formulário precisa validar os campos obrigatórios.',
      'As imagens devem poder ser revisadas antes do salvamento.',
      'O resultado precisa ser armazenado localmente com geração de PDF.',
    ],
    footer: 'A etapa de fotos deve aceitar captura pela câmera e seleção da galeria.',
    primaryActionLabel: 'Nova avaliação',
    secondaryActionLabel: 'Voltar',
  },
};

// Retorna a configuração de um módulo pelo seu key, com fallback para maturacao_forcada.
export const getModuleByKey = (moduleKey) => MODULES[moduleKey] || MODULES.maturacao_forcada;
