// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DE EMBARQUE — CONTROLE DE QUALIDADE
// Tela de formulário fotográfico para relatório de embarque de manga.
// Organiza fotos por seções: MANGA PALMER e CONTAINER.
// Não tem campos de texto — o formulário é 100% fotográfico.
// Gera PDF com as fotos organizadas por item via relatorioEmbarqueSedePdfReport.js
// Salva rascunhos localmente e envia ao servidor via API.
// Rota: "RelatorioEmbarqueSede" em routes.js → AuthenticatedStack
// ─────────────────────────────────────────────────────────────────────────────

import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../../services/api';
import {
  RELATORIO_EMBARQUE_FLOW,
  RELATORIO_GENERAL_INFO,
  CHECKLIST_CONTAINER_ITEMS,
  PRIORIZACAO_FOTO_CAMPOS,
  MANGA_FOTO_ITEMS,
  createInitialRelatorioEmbarqueState,
  createInitialChecklistState,
  createInitialPalletState,
  mapSectionsToPdfLabels,
} from './relatorioEmbarqueSedeData';
import buildRelatorioEmbarqueSedePdfReport from './relatorioEmbarqueSedePdfReport';

const GREEN = '#2E7D32';
const LGREEN = '#E8F5E9';
const ORANGE = '#F39C12';
const VARIEDADES_MANGA_FALLBACK = ['KENT', 'KEITT', 'TOMMY ATKINS', 'PALMER', 'OSTEEN', 'OMER', 'NOA', 'SHELLY'];
const EMBARQUE_DRAFT_STORAGE_KEY = 'controle_qualidade_embarque_sede_draft_v1';
const EMBARQUE_DRAFTS_STORAGE_KEY = 'controle_qualidade_embarque_sede_drafts_v2';
const EMBARQUE_VARIEDADES_STORAGE_KEY = '@embarque:variedades';
const EMBARQUE_CLIENTES_STORAGE_KEY = '@embarque:clientes';
const EMBARQUE_NAVIOS_STORAGE_KEY = '@embarque:navios';
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
const GENERAL_INFO_KEYS = ['customer', 'container', 'oc', 'loading', 'etd', 'eta', 'vessel'];
const META_INFO_KEYS = ['analysisDate', 'farm', 'talhao', 'variety'];
const BACKEND_PHOTO_MAX_WIDTH = 1280;
const BACKEND_PHOTO_COMPRESS = 0.68;
const DATE_FIELD_LABELS = {
  loading: 'Carregamento',
  etd: 'ETD',
  eta: 'ETA',
};
const CONTAINER_SECTION_KEY = 'container';
const MANGA_SECTION_PREFIX = 'manga_';
const TOP_FLOW_STEPS = RELATORIO_EMBARQUE_FLOW.slice(0, 3);
const TOP_FLOW_LAST_INDEX = TOP_FLOW_STEPS.length - 1;
const GENERAL_INFO_TAB_FLOW = [
  { key: 'informacoes', label: 'Informações' },
  { key: 'mangas', label: 'Maturação' },
  { key: 'container', label: 'Container' },
  { key: 'rascunhos', label: 'Rascunho' },
];

const PRIORIZACAO_CAMPO_ALIASES = {
  maturacao_variedade: ['maturacao_variedade', 'maturity'],
  firmeza_variedade: ['firmeza_variedade', 'firmness'],
  temp_polpa_variedade: ['temp_polpa_variedade'],
  espelho_pallet_variedade: ['espelho_pallet_variedade'],
  set_point_container: ['set_point_container'],
  foto_4_drenos: ['foto_4_drenos'],
  foto_numeracao_interna: ['foto_numeracao_interna'],
  foto_numeracao_externa: ['foto_numeracao_externa'],
  foto_termografo: ['foto_termografo'],
  foto_container_lacrado: ['foto_container_lacrado'],
  foto_lacre: ['foto_lacre'],
};
const CONTAINER_FIELDS_OCULTAR_NO_IMPRIMIR = ['maturacao_variedade', 'firmeza_variedade', 'temp_polpa_variedade'];

const toAbsoluteApiUrl = (baseUrl, path) => {
  const value = String(path || '');
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${baseUrl}${value}`;
};

const normalizePriorizacaoFotosByCampo = (rawCampos, baseUrl) => {
  const source = rawCampos || {};
  const normalized = {};
  PRIORIZACAO_FOTO_CAMPOS.forEach(({ key }) => {
    const aliases = PRIORIZACAO_CAMPO_ALIASES[key] || [key];
    const urls = aliases
      .flatMap((alias) => (Array.isArray(source[alias]) ? source[alias] : []))
      .map((url) => toAbsoluteApiUrl(baseUrl, url))
      .filter(Boolean);
    normalized[key] = [...new Set(urls)];
  });
  return normalized;
};

const normalizeMangaFotosByCampo = (rawCampos, baseUrl) => {
  const source = rawCampos || {};
  const normalized = {};
  MANGA_FOTO_ITEMS.forEach(({ key }) => {
    const urls = (Array.isArray(source[key]) ? source[key] : [])
      .map((foto) => toAbsoluteApiUrl(baseUrl, foto?.url || foto))
      .filter(Boolean);
    normalized[key] = [...new Set(urls)];
  });
  return normalized;
};

// Cria um ID unico para identificar cada foto registrada.
const createPhotoId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Converte o texto de variedades em lista unica padronizada.
const parseVariedadesFromText = (value = '') =>
  Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    ),
  );

// Normaliza a chave da variedade para uso seguro em identificadores.
const normalizeVariedadeKey = (value = '') =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// Monta a chave da secao de manga a partir da variedade selecionada.
const buildMangaSectionKey = (variedade) => `${MANGA_SECTION_PREFIX}${normalizeVariedadeKey(variedade)}`;

// Extrai as variedades a partir das secoes dinamicas do formulario.
const extractVariedadesFromSections = (sections = []) =>
  Array.from(
    new Set(
      (Array.isArray(sections) ? sections : [])
        .filter((section) => section?.key !== CONTAINER_SECTION_KEY)
        .map((section) => String(section?.title || '').replace(/^MANGA\s*/i, '').trim().toUpperCase())
        .filter(Boolean),
    ),
  );

// Formata a data no padrao brasileiro (dd/mm/aaaa).
const formatDateBr = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Converte texto no padrao brasileiro para objeto Date valido.
const parseDateBr = (value) => {
  const clean = String(value || '').trim();
  const match = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const normalizeCarregamentoDate = (value) => {
  const clean = String(value || '').trim();
  if (!clean) return '';

  // Ja vem no padrao esperado do formulario.
  if (parseDateBr(clean)) return clean;

  // Ex.: 2026-04-10 ou 2026-04-10T00:00:00
  const isoLike = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLike) {
    const year = Number(isoLike[1]);
    const month = Number(isoLike[2]);
    const day = Number(isoLike[3]);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) return formatDateBr(parsed);
  }

  // Fallback para outros formatos parseaveis pelo JS.
  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) return formatDateBr(parsed);
  return '';
};

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

// Componente de calendario customizado para selecao de datas.
function CustomCalendar({ value, onChange }) {
  const today = new Date();
  const initial = value instanceof Date ? value : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    if (value instanceof Date) {
      setViewYear(value.getFullYear());
      setViewMonth(value.getMonth());
    }
  }, [value]);

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);

  const selDay = value instanceof Date ? value.getDate() : null;
  const selMonth = value instanceof Date ? value.getMonth() : null;
  const selYear = value instanceof Date ? value.getFullYear() : null;

  // Navega para o mes anterior no calendario.
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((current) => current - 1);
      setViewMonth(11);
      return;
    }
    setViewMonth((current) => current - 1);
  };

  // Navega para o proximo mes no calendario.
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((current) => current + 1);
      setViewMonth(0);
      return;
    }
    setViewMonth((current) => current + 1);
  };

  return (
    <View>
      <View style={calSt.header}>
        <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="chevron-left" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={calSt.monthYear}>{MONTHS_PT[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="chevron-right" size={28} color="#333" />
        </TouchableOpacity>
      </View>

      <View style={calSt.dayRow}>
        {DAYS_PT.map((dayName) => (
          <Text key={dayName} style={calSt.dayName}>{dayName}</Text>
        ))}
      </View>

      <View style={calSt.grid}>
        {cells.map((day, index) => {
          if (!day) return <View key={`empty-${index}`} style={calSt.cell} />;

          const isSelected = day === selDay && viewMonth === selMonth && viewYear === selYear;
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

          return (
            <TouchableOpacity
              key={`day-${day}`}
              style={[calSt.cell, isSelected && calSt.cellSel, !isSelected && isToday && calSt.cellToday]}
              onPress={() => onChange(new Date(viewYear, viewMonth, day))}
              activeOpacity={0.7}
            >
              <Text style={[calSt.cellTxt, isSelected && calSt.cellTxtSel, !isSelected && isToday && calSt.cellTxtToday]}>
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Cria o objeto de foto com metadados padrao de cadastro.
const makePhoto = (uri) => ({
  id: createPhotoId(),
  uri,
  createdAt: new Date().toISOString(),
});

// Normaliza os campos de informacoes gerais para estrutura padrao.
const normalizeGeneralInfo = (data = {}) =>
  GENERAL_INFO_KEYS.reduce((result, key) => {
    const value = data?.[key];
    result[key] = typeof value === 'string' ? value : '';
    return result;
  }, {});

// Verifica se existe ao menos um campo preenchido em informacoes gerais.
const hasGeneralInfoValue = (data = {}) =>
  GENERAL_INFO_KEYS.some((key) => (data?.[key] || '').trim().length > 0);

// Normaliza meta info.
const normalizeMetaInfo = (data = {}) =>
  META_INFO_KEYS.reduce((result, key) => {
    const value = data?.[key];
    result[key] = typeof value === 'string' ? value : '';
    return result;
  }, {});

// Verifica se existe meta info value.
const hasMetaInfoValue = (data = {}) =>
  META_INFO_KEYS.some((key) => (data?.[key] || '').trim().length > 0);

// Monta um resumo curto com os principais dados gerais do registro.
const buildGeneralInfoSummary = (data = {}) => {
  const customer = (data.customer || '').trim();
  const container = (data.container || '').trim();

  if (customer && container) return `${customer} • ${container}`;
  if (customer) return customer;
  if (container) return container;
  return 'Registro sem identificacao';
};

// Formata data/hora do registro para exibicao amigavel.
const formatRecordDateTime = (dateIso) => {
  const timestamp = Date.parse(dateIso || '');
  if (!Number.isFinite(timestamp)) return '';

  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Remove entradas antigas de records to last15 days.
const pruneRecordsToLast15Days = (records = []) => {
  const now = Date.now();

  return (Array.isArray(records) ? records : [])
    .map((record) => ({
      id: typeof record?.id === 'string' ? record.id : createPhotoId(),
      createdAt: typeof record?.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
      generalInfo: normalizeGeneralInfo(record?.generalInfo),
    }))
    .filter((record) => {
      const createdAt = Date.parse(record.createdAt || '');
      if (!Number.isFinite(createdAt)) return false;
      return now - createdAt <= FIFTEEN_DAYS_MS;
    })
    .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));
};

// Conta o total de fotos somando todos os itens das secoes.
const countPhotosFromSections = (sections = []) =>
  (sections || []).reduce(
    (sum, section) =>
      sum +
      (section.items || []).reduce(
        (itemSum, item) => itemSum + ((item.photos || []).length),
        0,
      ),
    0,
  );

// Monta o titulo exibido para identificar rapidamente um rascunho.
const buildDraftTitle = (draft = {}) => {
  const meta = normalizeMetaInfo(draft?.metaInfo);
  const general = normalizeGeneralInfo(draft?.generalInfo);
  const customer = (general.customer || '').trim();
  const variety = (meta.variety || '').trim();
  const container = (general.container || '').trim();
  const vessel = (general.vessel || '').trim();

  return `Cliente: ${customer || '-'} | Variedade: ${variety || '-'} | Container: ${container || '-'} | Navio: ${vessel || '-'}`;
};

// Normaliza uma entrada de rascunho para o formato persistido.
const normalizeDraftEntry = (entry = {}) => {
  const createdAt = typeof entry?.createdAt === 'string' ? entry.createdAt : new Date().toISOString();
  const updatedAt = typeof entry?.updatedAt === 'string' ? entry.updatedAt : createdAt;

  const baseChecklist = createInitialChecklistState();
  const savedChecklist = Array.isArray(entry?.checklist) ? entry.checklist : [];
  const normalizedChecklist = baseChecklist.map((baseItem) => {
    const saved = savedChecklist.find((s) => s?.key === baseItem.key);
    if (!saved) return baseItem;
    return {
      ...baseItem,
      value: saved.value === 'C' || saved.value === 'NC' ? saved.value : null,
      ...(baseItem.temperatura !== undefined ? { temperatura: typeof saved.temperatura === 'string' ? saved.temperatura : '' } : {}),
    };
  });

  const normalizedPallet = Array.isArray(entry?.palletData) && entry.palletData.length > 0
    ? entry.palletData.map((row) => ({
        pallet: typeof row?.pallet === 'string' ? row.pallet : '',
        etiqueta: typeof row?.etiqueta === 'string' ? row.etiqueta : 'NC',
        temp1: typeof row?.temp1 === 'string' ? row.temp1 : '',
        temp2: typeof row?.temp2 === 'string' ? row.temp2 : '',
      }))
    : createInitialPalletState();

  return {
    id: typeof entry?.id === 'string' ? entry.id : createPhotoId(),
    createdAt,
    updatedAt,
    step: Number.isInteger(entry?.step) ? entry.step : 0,
    generalInfo: normalizeGeneralInfo(entry?.generalInfo),
    metaInfo: normalizeMetaInfo(entry?.metaInfo),
    checklist: normalizedChecklist,
    palletData: normalizedPallet,
    sections: normalizeSectionsFromDraft(entry?.sections),
  };
};

// Remove entradas antigas de drafts to last15 days.
const pruneDraftsToLast15Days = (drafts = []) => {
  const now = Date.now();

  return (Array.isArray(drafts) ? drafts : [])
    .map((draft) => normalizeDraftEntry(draft))
    .filter((draft) => {
      const updatedAt = Date.parse(draft.updatedAt || draft.createdAt || '');
      if (!Number.isFinite(updatedAt)) return false;
      return now - updatedAt <= FIFTEEN_DAYS_MS;
    })
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || '') - Date.parse(a.updatedAt || a.createdAt || ''));
};

// Normaliza fotos de um item garantindo ID, URI e data de criacao.
const normalizePhotosFromItem = (photos = []) =>
  (Array.isArray(photos) ? photos : [])
    .filter((photo) => typeof photo?.uri === 'string' && photo.uri.trim().length > 0)
    .map((photo) => ({
      id: typeof photo.id === 'string' ? photo.id : createPhotoId(),
      uri: photo.uri,
      createdAt: typeof photo.createdAt === 'string' ? photo.createdAt : new Date().toISOString(),
    }));

// Monta itens da secao mesclando template base com dados salvos.
const buildItemsFromTemplate = (templateItems = [], savedItems = []) =>
  templateItems.map((baseItem) => {
    const savedItem = (savedItems || []).find((item) => item?.key === baseItem.key);
    if (!savedItem) return { ...baseItem, photos: [] };
    return {
      ...baseItem,
      photos: normalizePhotosFromItem(savedItem.photos),
    };
  });

// Monta secoes dinamicas de manga conforme as variedades escolhidas.
const buildSectionsForVariedades = (variedades = [], currentSections = []) => {
  const baseSections = createInitialRelatorioEmbarqueState();
  const mangaTemplate = baseSections.find((section) => section.key === 'mang_palmer') || baseSections[0];
  const containerTemplate = baseSections.find((section) => section.key === CONTAINER_SECTION_KEY) || baseSections[1];
  const selected = Array.from(new Set((variedades || []).map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)));
  const current = Array.isArray(currentSections) ? currentSections : [];

  const byKey = new Map(current.map((section) => [section.key, section]));
  const legacySingleManga = byKey.get('mang_palmer');

  const mangaSections = selected.map((variedade, index) => {
    const sectionKey = buildMangaSectionKey(variedade);
    const savedSection = byKey.get(sectionKey) || (index === 0 ? legacySingleManga : null);

    return {
      key: sectionKey,
      title: `MANGA ${variedade}`,
      pdfTitle: `MANGO ${variedade}`,
      items: buildItemsFromTemplate(mangaTemplate?.items || [], savedSection?.items || []),
    };
  });

  const savedContainer = byKey.get(CONTAINER_SECTION_KEY);
  const containerSection = {
    ...(containerTemplate || {}),
    key: CONTAINER_SECTION_KEY,
    title: 'CONTAINER',
    pdfTitle: (containerTemplate?.pdfTitle || 'CONTAINER'),
    items: buildItemsFromTemplate(containerTemplate?.items || [], savedContainer?.items || []),
  };

  return [...mangaSections, containerSection];
};

// Normaliza as secoes carregadas de rascunho para o template atual.
const normalizeSectionsFromDraft = (rawSections = []) => {
  const baseSections = createInitialRelatorioEmbarqueState();
  const source = Array.isArray(rawSections) && rawSections.length ? rawSections : baseSections;

  return source.map((section) => {
    const sectionKey = section?.key || createPhotoId();
    const templateSection = sectionKey === CONTAINER_SECTION_KEY
      ? baseSections.find((item) => item.key === CONTAINER_SECTION_KEY)
      : baseSections.find((item) => item.key === 'mang_palmer');

    const templateItems = templateSection?.items || (section.items || []);
    const normalizedItems = templateItems.map((baseItem) => {
      const savedItem = (section.items || []).find((item) => item?.key === baseItem.key);
      return {
        ...baseItem,
        photos: normalizePhotosFromItem(savedItem?.photos || []),
      };
    });

    return {
      ...(templateSection || {}),
      ...section,
      key: sectionKey,
      items: normalizedItems,
    };
  });
};

// Prepara foto em data URI (base64) para envio ao backend.
const buildBackendPhotoDataUri = async (uri) => {
  if (!uri || typeof uri !== 'string') return null;

  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: BACKEND_PHOTO_MAX_WIDTH } }],
      {
        compress: BACKEND_PHOTO_COMPRESS,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );

    if (!manipulated?.base64) return null;
    return `data:image/jpeg;base64,${manipulated.base64}`;
  } catch (error) {
    console.warn('Falha ao preparar foto para backend:', error?.message || error);
    return null;
  }
};

// Barra fixa de telas no topo, no mesmo padrao do modal de priorizacao.
function StepTabs({ current, onPress, variety }) {
  const variedadesCount = parseVariedadesFromText(variety).length;
  const tabs = [
    { step: 2, label: 'Maturação' },
    { step: 1, label: 'Priorização' },
    { step: 0, label: 'Imprimir' },
  ];

  return (
    <View style={st.tabRow}>
      {tabs.map((tab) => {
        const active = tab.step === current;
        const displayLabel =
          tab.step === 2 && variedadesCount > 0 ? `${tab.label} (${variedadesCount})` : tab.label;

        return (
          <TouchableOpacity
            key={tab.label}
            style={[st.tabBtn, active && st.tabBtnActive]}
            onPress={() => onPress(tab.step)}
            activeOpacity={0.8}
          >
            <Text style={[st.tabText, active && st.tabTextActive]} numberOfLines={1}>
              {displayLabel}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Navegacao interna de "Imprimir" com bolinhas 1-2-3-4.
function GeneralInfoStepDots({ currentTab, onPress }) {
  const currentIndex = Math.max(
    0,
    GENERAL_INFO_TAB_FLOW.findIndex((item) => item.key === currentTab),
  );

  return (
    <View style={st.stepRow}>
      {GENERAL_INFO_TAB_FLOW.map((item, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;

        return (
          <TouchableOpacity
            key={item.key}
            style={st.stepItem}
            onPress={() => onPress(item.key)}
            activeOpacity={0.8}
          >
            {i > 0 && <View style={[st.lineLeft, (done || active) && st.lineGreen]} />}

            <View style={[st.circle, done && st.circleDone, active && st.circleActive]}>
              {done ? (
                <MaterialIcons name="check" size={15} color="#FFFFFF" />
              ) : (
                <Text style={[st.circleNum, active && st.circleNumActive]}>{i + 1}</Text>
              )}
            </View>

            {i < GENERAL_INFO_TAB_FLOW.length - 1 && (
              <View style={[st.lineRight, done && st.lineGreen]} />
            )}

            <Text style={[st.stepLabel, active && st.stepLabelActive, done && st.stepLabelDone]} numberOfLines={2}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Modal para revisar, confirmar ou remover a foto selecionada.
function PhotoReviewModal({
  visible,
  imageUri,
  title,
  subtitle,
  counterLabel,
  confirmLabel,
  secondaryLabel,
  confirmDanger = false,
  onConfirm,
  onSecondary,
  onClose,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose}>
        <Pressable style={st.reviewBox} onPress={(event) => event.stopPropagation()}>
          <View style={st.reviewHeader}>
            <View style={{ flex: 1 }}>
              <Text style={st.reviewTitle}>{title}</Text>
              {subtitle ? <Text style={st.reviewSub}>{subtitle}</Text> : null}
              {counterLabel ? <Text style={st.reviewCounter}>{counterLabel}</Text> : null}
            </View>
            <TouchableOpacity style={st.closeCircle} onPress={onClose}>
              <MaterialIcons name="close" size={20} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={st.reviewImageWrap}>
            {imageUri ? <Image source={{ uri: imageUri }} style={st.reviewImage} resizeMode="contain" /> : null}
          </View>

          <View style={st.reviewActions}>
            <TouchableOpacity style={st.reviewSecondaryBtn} onPress={onSecondary} activeOpacity={0.85}>
              <Text style={st.reviewSecondaryText}>{secondaryLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[st.reviewPrimaryBtn, confirmDanger && st.reviewPrimaryBtnDanger]}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <MaterialIcons
                name={confirmDanger ? 'delete-outline' : 'check-circle'}
                size={18}
                color="#FFFFFF"
              />
              <Text style={st.reviewPrimaryText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Card de item com botoes de captura/galeria e grade de fotos.
function ItemCard({
  item,
  onPickGallery,
  onPickCamera,
  onPreviewPhoto,
  onDeletePhoto,
  serverPhotos = [],
  hideEmptyState = false,
}) {
  const localPhotos = Array.isArray(item?.photos) ? item.photos : [];
  const hasLocalPhotos = localPhotos.length > 0;
  const hasServerPhotos = Array.isArray(serverPhotos) && serverPhotos.length > 0;
  const showEmptyState = !hideEmptyState && !hasLocalPhotos && !hasServerPhotos;

  return (
    <View style={st.itemCard}>
      <Text style={st.itemTitle}>{item.label}</Text>

      <View style={st.itemButtonsRow}>
        <TouchableOpacity
          style={[st.galleryBtn, !onPickGallery && { opacity: 0.45 }]}
          onPress={onPickGallery}
          activeOpacity={0.85}
          disabled={!onPickGallery}
        >
          <MaterialIcons name="photo-library" size={18} color={GREEN} />
          <Text style={st.galleryBtnText}>Galeria</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[st.cameraBtn, !onPickCamera && { opacity: 0.45 }]}
          onPress={onPickCamera}
          activeOpacity={0.85}
          disabled={!onPickCamera}
        >
          <MaterialIcons name="camera-alt" size={18} color={GREEN} />
          <Text style={st.cameraBtnText}>Camera</Text>
        </TouchableOpacity>
      </View>

      {showEmptyState ? (
        <View style={st.emptyPhotoBox}>
          <MaterialIcons name="image-not-supported" size={20} color="#999" />
          <Text style={st.emptyPhotoText}>Nenhuma foto adicionada</Text>
        </View>
      ) : null}

      {hasLocalPhotos && (
        <View style={st.photoGrid}>
          {localPhotos.map((photo, index) => (
            <Pressable key={photo.id} style={st.thumb} onPress={() => onPreviewPhoto(photo)}>
              <Image source={{ uri: photo.uri }} style={st.thumbImg} resizeMode="cover" />
              <View style={st.thumbBadge}>
                <Text style={st.thumbBadgeText}>{index + 1}</Text>
              </View>
              <TouchableOpacity
                style={st.thumbDelete}
                onPress={(event) => {
                  event?.stopPropagation?.();
                  onDeletePhoto?.(photo);
                }}
              >
                <MaterialIcons name="delete" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </Pressable>
          ))}
        </View>
      )}

      {hasServerPhotos && (
        <>
          <View style={[pgSt.servidorFotosBadge, { marginTop: hasLocalPhotos ? 2 : 10, marginBottom: 8 }]}>
            <MaterialIcons name="cloud-done" size={16} color="#0277BD" />
            <Text style={pgSt.servidorFotosBadgeText}>
              {`${serverPhotos.length} foto(s) do servidor`}
            </Text>
          </View>
          <View style={st.photoGrid}>
            {serverPhotos.map((url, index) => (
              <Pressable
                key={`srv-item-${item.key}-${index}`}
                style={st.thumb}
                onPress={() => onPreviewPhoto?.({ id: `srv-${item.key}-${index}`, uri: url })}
              >
                <Image source={{ uri: url }} style={st.thumbImg} resizeMode="cover" />
                <View style={st.thumbBadge}>
                  <Text style={st.thumbBadgeText}>{index + 1}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// Componente principal da tela de Relatorio de Embarque (Sede).
export default function RelatorioEmbarqueSede({ navigation }) {
  const [sections, setSections] = useState(() => createInitialRelatorioEmbarqueState());
  const [generalInfo, setGeneralInfo] = useState(() => normalizeGeneralInfo(RELATORIO_GENERAL_INFO));
  const [checklist, setChecklist] = useState(() => createInitialChecklistState());
  const [palletData, setPalletData] = useState(() => createInitialPalletState());
  const [draftMeta, setDraftMeta] = useState(() => normalizeMetaInfo());
  const [step, setStep] = useState(0);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isTestingPdf, setIsTestingPdf] = useState(false);
  const [photoViewer, setPhotoViewer] = useState(null);
  const [draftList, setDraftList] = useState([]);
  const [resumeDraftPrompt, setResumeDraftPrompt] = useState(null);
  const [currentDraftId, setCurrentDraftId] = useState(() => createPhotoId());
  const [isCacheReady, setIsCacheReady] = useState(false);
  const [showVarModal, setShowVarModal] = useState(false);
  const [showCreateVariedadeModal, setShowCreateVariedadeModal] = useState(false);
  const [datePickerField, setDatePickerField] = useState(null);
  const [datePickerTemp, setDatePickerTemp] = useState(() => new Date());
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [showContainerModal, setShowContainerModal] = useState(false);
  const [containerSelecionadoKey, setContainerSelecionadoKey] = useState('');
  const [showCreateClienteModal, setShowCreateClienteModal] = useState(false);
  const [showNavioModal, setShowNavioModal] = useState(false);
  const [showCreateNavioModal, setShowCreateNavioModal] = useState(false);
  const [naviosList, setNaviosList] = useState([]);
  const [navioSearch, setNavioSearch] = useState('');
  const [newNavioName, setNewNavioName] = useState('');
  const [isSavingNavio, setIsSavingNavio] = useState(false);
  const [clientesList, setClientesList] = useState([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [newClienteName, setNewClienteName] = useState('');
  const [newClientePais, setNewClientePais] = useState('');
  const [isSavingCliente, setIsSavingCliente] = useState(false);
  const [variedadeSearch, setVariedadeSearch] = useState('');
  const [isSavingVariedade, setIsSavingVariedade] = useState(false);
  const [variedadesList, setVariedadesList] = useState(VARIEDADES_MANGA_FALLBACK);
  const [selectedVariedades, setSelectedVariedades] = useState(() => parseVariedadesFromText(''));
  const [tempVariedades, setTempVariedades] = useState([]);
  const [newVariedadeName, setNewVariedadeName] = useState('');
  const [activeMangaSectionKey, setActiveMangaSectionKey] = useState(null);
  const [showGaleriaModal, setShowGaleriaModal] = useState(false);
  const [galeriaFazenda, setGaleriaFazenda] = useState(null);
  const [galeriaFotoViewer, setGaleriaFotoViewer] = useState(null);
  const [showCadastrarFotosModal, setShowCadastrarFotosModal] = useState(false);
  const [cadastrarFotosForm, setCadastrarFotosForm] = useState({ fazenda: '', variedade: '', talhao: '' });
  const [cadastrarFotosLoading, setCadastrarFotosLoading] = useState(false);
  const [cadastrarFotosList, setCadastrarFotosList] = useState([]);
  const [cfAllTalhoes, setCfAllTalhoes] = useState([]);
  const [cfFazendas, setCfFazendas] = useState([]);
  const [cfVariedades, setCfVariedades] = useState([]);
  const [cfTalhoesFiltrados, setCfTalhoesFiltrados] = useState([]);
  const [cfShowFazendaPicker, setCfShowFazendaPicker] = useState(false);
  const [cfShowVariedadePicker, setCfShowVariedadePicker] = useState(false);
  const [cfShowTalhaoPicker, setCfShowTalhaoPicker] = useState(false);

  // ── Mangas — Cadastro por Fazenda/Variedade/Controle ──
  const [mangaCadastros, setMangaCadastros] = useState([]);
  const [mangaFormFazenda, setMangaFormFazenda] = useState('');
  const [mangaFormVariedade, setMangaFormVariedade] = useState('');
  const [mangaFormControle, setMangaFormControle] = useState('');
  const [mangaFotoModalIdx, setMangaFotoModalIdx] = useState(null); // index do cadastro aberto
  const [mangaCadastroTab, setMangaCadastroTab] = useState('adicionar'); // 'adicionar' | 'fotos'
  const [showMangaCadastroModal, setShowMangaCadastroModal] = useState(false);
  const [mangaFormFazendaList, setMangaFormFazendaList] = useState([]);
  const [mangaFormVariedadeList, setMangaFormVariedadeList] = useState([]);
  const [mangaFormAllTalhoes, setMangaFormAllTalhoes] = useState([]);
  const [mangaFormShowFazendaPicker, setMangaFormShowFazendaPicker] = useState(false);
  const [mangaFormShowVariedadePicker, setMangaFormShowVariedadePicker] = useState(false);
  const [mangaCadastroSending, setMangaCadastroSending] = useState(false);
  const [mangaHistorico, setMangaHistorico] = useState([]);
  const [showMangaHistoricoModal, setShowMangaHistoricoModal] = useState(false);
  const [mangaHistoricoAcaoIdx, setMangaHistoricoAcaoIdx] = useState(null);
  // Fotos inline do servidor por campo da priorizacao: { maturacao_variedade: { loading, urls: [] }, ... }
  const [servidorFotosInline, setServidorFotosInline] = useState({});

  // Fotos do servidor para o Container tab de Imprimir: { loading, data: { campo: [url,...] } }
  const [imprimirContainerFotos, setImprimirContainerFotos] = useState({ loading: false, data: {} });
  // Fotos do servidor para o Maturacao tab de Imprimir: { loading, data: { appearance|pulp_temperature|maturity|firmness: [url,...] } }
  const [imprimirMangaFotos, setImprimirMangaFotos] = useState({ loading: false, data: {} });
  // Índice da variedade selecionada na aba Maturação do Imprimir (quando há mais de 1)
  const [imprimirVariedadeIdx, setImprimirVariedadeIdx] = useState(0);

  // ── Subtelas dentro de Informações Gerais ──
  const [generalInfoTab, setGeneralInfoTab] = useState('informacoes'); // 'informacoes' | 'mangas' | 'container' | 'rascunhos'

  // ── Carregamentos (Pallets API) ──
  const [carregamentos, setCarregamentos] = useState([]);
  const [carregamentosLoading, setCarregamentosLoading] = useState(false);
  const [selectedCarregamento, setSelectedCarregamento] = useState(null);
  const [modalTab, setModalTab] = useState('pallets'); // 'pallets' | 'container' | 'fotos'
  const [loadingOC, setLoadingOC] = useState(null); // OC que está carregando dados salvos antes de abrir modal
  const [modalChecklist, setModalChecklist] = useState([]);
  const [modalFotos, setModalFotos] = useState({});
  const [modalFotosUploading, setModalFotosUploading] = useState(false);
  const [palletInfoMap, setPalletInfoMap] = useState({}); // { palletId: { loading, data } }
  const [palletDadosModal, setPalletDadosModal] = useState({
    visible: false,
    palletId: null,
    loading: false,
    data: [],
    raw: null,
    error: null,
  });

  const scrollViewRef = useRef(null);
  const inputRefs = useRef({});
  const allowNextBeforeRemoveRef = useRef(false);

  const totalPhotos = countPhotosFromSections(sections);

  // Agrupa todas as fotos dos rascunhos por fazenda para exibir na galeria.
  const buildGaleriaFazendas = () => {
    const map = new Map();
    const allDrafts = [
      ...draftList,
      {
        id: currentDraftId,
        metaInfo: normalizeMetaInfo(draftMeta),
        sections,
      },
    ];
    allDrafts.forEach((draft) => {
      const fazenda = (draft?.metaInfo?.farm || '').trim() || 'Sem fazenda';
      const variedade = (draft?.metaInfo?.variety || '').trim() || '';
      if (!map.has(fazenda)) {
        map.set(fazenda, { fazenda, variedade, fotos: [] });
      }
      (draft.sections || []).forEach((section) => {
        (section.items || []).forEach((item) => {
          (item.photos || []).forEach((photo) => {
            if (photo?.uri) {
              map.get(fazenda).fotos.push({
                uri: photo.uri,
                sectionTitle: section.title || section.key,
                itemLabel: item.label || item.key,
              });
            }
          });
        });
      });
    });
    return Array.from(map.values()).filter((f) => f.fotos.length > 0);
  };

  const mangaSections = sections.filter((section) => section.key !== CONTAINER_SECTION_KEY);
  const containerSection = sections.find((section) => section.key === CONTAINER_SECTION_KEY) || null;
  const activeMangaSection = sections.find((section) => section.key === activeMangaSectionKey) || null;

  const buildDraftListFrom = useCallback((sourceDrafts = [], stepToSave = step) => {
    const hasDraftContent = hasGeneralInfoValue(generalInfo) || hasMetaInfoValue(draftMeta) || totalPhotos > 0;
    const nowIso = new Date().toISOString();
    const currentList = Array.isArray(sourceDrafts) ? sourceDrafts : [];
    const base = currentList.filter((item) => item.id !== currentDraftId);

    if (!hasDraftContent) {
      return pruneDraftsToLast15Days(base);
    }

    return pruneDraftsToLast15Days([
      {
        id: currentDraftId,
        createdAt: currentList.find((item) => item.id === currentDraftId)?.createdAt || nowIso,
        updatedAt: nowIso,
        step: stepToSave,
        generalInfo: normalizeGeneralInfo(generalInfo),
        metaInfo: normalizeMetaInfo(draftMeta),
        checklist,
        palletData,
        sections,
      },
      ...base,
    ]);
  }, [currentDraftId, draftMeta, generalInfo, checklist, palletData, sections, step, totalPhotos]);

  const persistCurrentDraft = useCallback(async (options = {}) => {
    if (!isCacheReady) return draftList;

    const stepToSave = Number.isInteger(options.stepOverride) ? options.stepOverride : step;
    const next = buildDraftListFrom(draftList, stepToSave);
    setDraftList(next);

    try {
      await AsyncStorage.setItem(EMBARQUE_DRAFTS_STORAGE_KEY, JSON.stringify(next));
    } catch (saveError) {
      console.error('Erro ao salvar lista de rascunhos:', saveError);
    }

    return next;
  }, [buildDraftListFrom, draftList, isCacheReady, step]);

  // Atualiza um campo especifico de informacoes gerais no estado.
  const setGeneralInfoField = (field, value) => {
    setGeneralInfo((current) => ({ ...current, [field]: value }));
  };

  // Define meta info field.
  const setMetaInfoField = (field, value) => {
    setDraftMeta((current) => ({ ...current, [field]: value }));
  };

  // Fecha o seletor de data e limpa o campo ativo.
  const closeDatePicker = () => {
    setDatePickerField(null);
  };

  // Abre o seletor de data para o campo informado.
  const openDatePicker = (field) => {
    const currentValue = generalInfo?.[field];
    const parsedDate = parseDateBr(currentValue);
    setDatePickerTemp(parsedDate || new Date());
    setDatePickerField(field);
  };

  // Confirma a data selecionada e atualiza o campo ativo.
  const confirmDatePicker = () => {
    if (!datePickerField) return;
    setGeneralInfoField(datePickerField, formatDateBr(datePickerTemp));
    closeDatePicker();
  };

  // Abre um rascunho salvo e restaura os dados na tela.
  const openDraft = (draft, options = {}) => {
    if (!draft) return;

    const normalized = normalizeDraftEntry(draft);
    const parsedVariedades = parseVariedadesFromText(normalized.metaInfo?.variety);
    const draftVariedades = parsedVariedades.length > 0
      ? parsedVariedades
      : extractVariedadesFromSections(normalized.sections);
    setCurrentDraftId(normalized.id);
    setVariedadesList((current) => Array.from(new Set([...current, ...draftVariedades])));
    setSelectedVariedades(draftVariedades);
    setSections(buildSectionsForVariedades(draftVariedades, normalized.sections));
    setGeneralInfo(normalized.generalInfo);
    setChecklist(normalized.checklist || createInitialChecklistState());
    setPalletData(normalized.palletData || createInitialPalletState());
    setDraftMeta({ ...normalized.metaInfo, variety: draftVariedades.join(', ') });
    setActiveMangaSectionKey(null);
    setGeneralInfoTab('informacoes');

    if (options?.goToStepZero) {
      setStep(0);
      return;
    }

    const savedStep = Number.isInteger(normalized.step) ? normalized.step : 0;
    setStep(Math.max(0, Math.min(TOP_FLOW_LAST_INDEX, savedStep)));
  };

  // Inicia um novo rascunho limpando o estado atual do formulario.
  const startNewDraft = () => {
    setCurrentDraftId(createPhotoId());
    setSelectedVariedades([]);
    setSections(buildSectionsForVariedades([], createInitialRelatorioEmbarqueState()));
    setGeneralInfo(normalizeGeneralInfo());
    setChecklist(createInitialChecklistState());
    setPalletData(createInitialPalletState());
    setDraftMeta({ ...normalizeMetaInfo(), variety: '' });
    setTempVariedades([]);
    setActiveMangaSectionKey(null);
    setGeneralInfoTab('informacoes');
    setStep(0);
  };

  // Exibe prompt para retomar o rascunho mais recente encontrado.
  const askResumePreviousDraft = (latestDraft) => {
    if (!latestDraft) {
      startNewDraft();
      return;
    }
    setResumeDraftPrompt(latestDraft);
  };

  // Fecha o modal de confirmacao para retomar rascunho.
  const closeResumeDraftPrompt = () => {
    setResumeDraftPrompt(null);
  };

  useEffect(() => {
    if (!resumeDraftPrompt) return undefined;

    const timeoutId = setTimeout(() => {
      setResumeDraftPrompt(null);
    }, 4000);

    return () => clearTimeout(timeoutId);
  }, [resumeDraftPrompt]);

  // Retoma o ultimo rascunho quando o usuario confirma a acao.
  const handleResumePreviousDraft = () => {
    const latestDraft = resumeDraftPrompt;
    if (!latestDraft) return;
    closeResumeDraftPrompt();
    openDraft(latestDraft, { goToStepZero: false });
  };

  // Inicia um novo rascunho descartando o prompt atual.
  const handleOpenNewDraft = () => {
    closeResumeDraftPrompt();
    startNewDraft();
  };

  // Solicita confirmacao antes de excluir um rascunho salvo.
  const askDeleteDraft = (draft) => {
    if (!draft?.id) return;

    Alert.alert(
      'Excluir rascunho',
      'Deseja excluir este rascunho salvo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            setDraftList((current) => {
              const next = current.filter((item) => item.id !== draft.id);
              AsyncStorage.setItem(EMBARQUE_DRAFTS_STORAGE_KEY, JSON.stringify(next)).catch((saveError) => {
                console.error('Erro ao excluir rascunho:', saveError);
              });
              return next;
            });

            if (draft.id === currentDraftId) {
              startNewDraft();
            }
          },
        },
      ],
    );
  };

  // Carrega drafts.
  const loadDrafts = async () => {
    try {
      const draftsRaw = await AsyncStorage.getItem(EMBARQUE_DRAFTS_STORAGE_KEY);
      const legacyDraftRaw = await AsyncStorage.getItem(EMBARQUE_DRAFT_STORAGE_KEY);

      let loadedDrafts = [];
      if (draftsRaw) {
        try {
          loadedDrafts = pruneDraftsToLast15Days(JSON.parse(draftsRaw));
        } catch (error) {
          console.error('Erro ao ler lista de rascunhos:', error);
        }
      }

      if (!loadedDrafts.length && legacyDraftRaw) {
        try {
          const legacyDraft = JSON.parse(legacyDraftRaw);
          if (legacyDraft && typeof legacyDraft === 'object') {
            loadedDrafts = pruneDraftsToLast15Days([
              {
                ...legacyDraft,
                id: createPhotoId(),
                createdAt: legacyDraft.createdAt || new Date().toISOString(),
                updatedAt: legacyDraft.updatedAt || new Date().toISOString(),
              },
            ]);
          }
        } catch (error) {
          console.error('Erro ao migrar rascunho legado:', error);
        }
      }

      if (legacyDraftRaw) {
        await AsyncStorage.removeItem(EMBARQUE_DRAFT_STORAGE_KEY);
      }

      setDraftList(loadedDrafts);

      if (loadedDrafts.length) {
        askResumePreviousDraft(loadedDrafts[0]);
      } else {
        startNewDraft();
      }

      await AsyncStorage.setItem(EMBARQUE_DRAFTS_STORAGE_KEY, JSON.stringify(loadedDrafts));
    } catch (error) {
      console.error('Erro ao carregar cache do embarque sede:', error);
    } finally {
      setIsCacheReady(true);
    }
  };

  useEffect(() => {
    loadDrafts();
  }, []);

  useEffect(() => {
    api.get('/variedades')
      .then(async (res) => {
        const list = res?.data ?? res;
        if (Array.isArray(list)) {
          const nomesApi = list.map((v) => String(v.nome || '').trim().toUpperCase()).filter(Boolean);
          let nomesCache = [];
          try {
            const cachedRaw = await AsyncStorage.getItem(EMBARQUE_VARIEDADES_STORAGE_KEY);
            if (cachedRaw) {
              nomesCache = (JSON.parse(cachedRaw) || [])
                .map((item) => String(item || '').trim().toUpperCase())
                .filter(Boolean);
            }
          } catch {}

          const nomes = Array.from(new Set([...nomesApi, ...nomesCache]));
          if (nomes.length > 0) {
            setVariedadesList(nomes);
            AsyncStorage.setItem(EMBARQUE_VARIEDADES_STORAGE_KEY, JSON.stringify(nomes)).catch(() => {});
          }
        }
      })
      .catch(async () => {
        try {
          const cached = await AsyncStorage.getItem(EMBARQUE_VARIEDADES_STORAGE_KEY);
          if (cached) setVariedadesList(JSON.parse(cached));
        } catch {}
      });
  }, []);

  useEffect(() => {
    // Carrega cache primeiro para uso offline imediato
    AsyncStorage.getItem(EMBARQUE_NAVIOS_STORAGE_KEY)
      .then((cached) => { if (cached) setNaviosList(JSON.parse(cached)); })
      .catch(() => {});
    // Busca da API externa (navios da frota) + backend local (cadastrados pelo usuário)
    Promise.allSettled([
      fetch('http://10.107.114.11:3002/navios').then((r) => r.json()),
      api.get('/navios'),
    ]).then(([extResult, localResult]) => {
      const fromExt = extResult.status === 'fulfilled' && Array.isArray(extResult.value)
        ? extResult.value.map((item) => String(item?.AGN_ST_FANTASIA || '').trim()).filter(Boolean)
        : [];
      const fromLocal = localResult.status === 'fulfilled'
        ? (Array.isArray(localResult.value) ? localResult.value : localResult.value?.data ?? [])
            .map((item) => String(item?.nome || '').trim()).filter(Boolean)
        : [];
      const merged = [...new Set([...fromExt, ...fromLocal])].sort((a, b) => a.localeCompare(b));
      if (merged.length > 0) {
        setNaviosList(merged);
        AsyncStorage.setItem(EMBARQUE_NAVIOS_STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    api.get('/clientes-paises')
      .then(res => {
        const list = res?.data ?? res;
        if (Array.isArray(list)) {
          const normalized = list
            .map((item) => ({
              id: item?.id ?? createPhotoId(),
              cliente: String(item?.cliente || '').trim(),
              pais: String(item?.pais || '').trim(),
            }))
            .filter((item) => item.cliente.length > 0)
            .sort((a, b) => a.cliente.localeCompare(b.cliente));

          setClientesList(normalized);
          AsyncStorage.setItem(EMBARQUE_CLIENTES_STORAGE_KEY, JSON.stringify(normalized)).catch(() => {});
        }
      })
      .catch(async () => {
        try {
          const cached = await AsyncStorage.getItem(EMBARQUE_CLIENTES_STORAGE_KEY);
          if (cached) setClientesList(JSON.parse(cached));
        } catch {}
      });
  }, []);

  // Carrega manga cadastros do banco ao entrar no step 2 (Mangas)
  useEffect(() => {
    if (step === 2) {
      carregarMangaCadastros();
    }
  }, [step]);

  // Auto-carrega fotos do servidor quando container é definido em Informações Gerais
  useEffect(() => {
    if (containerSelecionadoKey && carregamentos.length > 0) {
      carregarFotosContainerImprimir(containerSelecionadoKey);
      carregarFotosMangaImprimir(containerSelecionadoKey);
      return;
    }
    setImprimirContainerFotos({ loading: false, data: {} });
    setImprimirMangaFotos({ loading: false, data: {} });
    setImprimirVariedadeIdx(0);
  }, [containerSelecionadoKey, carregamentos]);

  useEffect(() => {
    if (containerSelecionadoKey || !generalInfo.container || carregamentos.length === 0) return;
    const carreg = buscarCarregamentoPorChave(generalInfo.container);
    if (carreg) setContainerSelecionadoKey(obterChaveCarregamento(carreg));
  }, [containerSelecionadoKey, generalInfo.container, carregamentos]);

  // Auto-carrega fotos do servidor ao abrir a aba Fotos do carregamento
  useEffect(() => {
    if (modalTab !== 'fotos' || !selectedCarregamento?.apelido) return;
    carregarServidorFotosInline();
  }, [modalTab, selectedCarregamento]);

  useEffect(() => {
    if (!isCacheReady) return;

    const timer = setTimeout(async () => {
      try {
        setDraftList((current) => {
          const next = buildDraftListFrom(current, step);

          AsyncStorage.setItem(EMBARQUE_DRAFTS_STORAGE_KEY, JSON.stringify(next)).catch((saveError) => {
            console.error('Erro ao salvar lista de rascunhos:', saveError);
          });

          return next;
        });
      } catch (error) {
        console.error('Erro ao salvar rascunho do embarque sede:', error);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [buildDraftListFrom, isCacheReady, step]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!isCacheReady || isGeneratingPdf) return;

      if (allowNextBeforeRemoveRef.current) {
        allowNextBeforeRemoveRef.current = false;
        return;
      }

      event.preventDefault();
      persistCurrentDraft()
        .catch((error) => {
          console.error('Erro ao salvar rascunho antes de sair:', error);
        })
        .finally(() => {
          allowNextBeforeRemoveRef.current = true;
          navigation.dispatch(event.data.action);
        });
    });

    return unsubscribe;
  }, [isCacheReady, isGeneratingPdf, navigation, persistCurrentDraft]);

  // Atualiza item photos.
  const updateItemPhotos = (sectionKey, itemKey, updater) => {
    setSections((current) =>
      current.map((section) => {
        if (section.key !== sectionKey) return section;

        return {
          ...section,
          items: section.items.map((item) => {
            if (item.key !== itemKey) return item;
            return {
              ...item,
              photos: updater(item.photos || []),
            };
          }),
        };
      }),
    );
  };

  // Adiciona uma nova foto ao item selecionado.
  const addPhotoToItem = (sectionKey, itemKey, uri) => {
    updateItemPhotos(sectionKey, itemKey, (photos) => [...photos, makePhoto(uri)]);
  };

  // Remove a foto informada do item selecionado.
  const removePhotoFromItem = (sectionKey, itemKey, photoId) => {
    updateItemPhotos(sectionKey, itemKey, (photos) => photos.filter((photo) => photo.id !== photoId));
  };

  // Abre a galeria para selecionar foto do item.
  const pickFromGallery = async (section, item) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissao negada', 'Habilite o acesso a galeria.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.85,
      });

      if (!result.canceled && result.assets?.length) {
        const uris = result.assets.map((asset) => asset.uri).filter(Boolean);
        uris.forEach((uri) => addPhotoToItem(section.key, item.key, uri));
      }
    } catch (error) {
      console.error('Erro ao selecionar fotos da galeria:', error);
      Alert.alert('Erro', 'Nao foi possivel selecionar as fotos da galeria.');
    }
  };

  // Abre a camera para capturar foto do item.
  const pickFromCamera = async (section, item) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissao negada', 'Habilite o acesso a camera.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });

      if (!result.canceled && result.assets?.length) {
        const uri = result.assets[0]?.uri;
        if (uri) addPhotoToItem(section.key, item.key, uri);
      }
    } catch (error) {
      console.error('Erro ao tirar foto:', error);
      Alert.alert('Erro', 'Nao foi possivel abrir a camera.');
    }
  };

  // Solicita confirmacao antes de remover a foto do item.
  const askDeletePhoto = (sectionKey, itemKey, photoId) => {
    Alert.alert('Excluir foto', 'Deseja excluir esta foto deste item?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          removePhotoFromItem(sectionKey, itemKey, photoId);
          setPhotoViewer((current) => {
            if (!current || current.photo?.id !== photoId) return current;
            return null;
          });
        },
      },
    ]);
  };

  // Valida dados minimos obrigatorios antes de gerar o PDF.
  const validateBeforePdf = () => {
    if (totalPhotos === 0) {
      Alert.alert('Obrigatorio', 'Adicione ao menos uma foto em algum item.');
      return false;
    }
    return true;
  };

  // Gera um PDF de teste local para conferencia visual do layout.
  const gerarPdfTeste = async () => {
    if (isGeneratingPdf || isTestingPdf) return;
    if (!validateBeforePdf()) return;

    try {
      await persistCurrentDraft({ stepOverride: step });
      setIsTestingPdf(true);

      const pdfSections = mapSectionsToPdfLabels(sections);
      const pdfContent = await buildRelatorioEmbarqueSedePdfReport({
        sections: pdfSections,
        generalInfo,
      });

      const fileName = `relatorio_embarque_teste_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, pdfContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Teste do PDF - Relatorio de Embarque',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF de teste gerado', `Arquivo salvo: ${fileName}`);
      }
    } catch (error) {
      console.error('Erro ao gerar PDF de teste do embarque:', error);
      Alert.alert('Erro', 'Nao foi possivel gerar o PDF de teste.');
    } finally {
      setIsTestingPdf(false);
    }
  };

  // Envia o relatorio completo (dados e fotos) para o servidor.
  const enviarRelatorio = async () => {
    if (isGeneratingPdf || isTestingPdf) return;
    if (!validateBeforePdf()) return;

    try {
      await persistCurrentDraft({ stepOverride: step });
      setIsGeneratingPdf(true);
      const pdfSections = mapSectionsToPdfLabels(sections);
      const pdfContent = await buildRelatorioEmbarqueSedePdfReport({
        sections: pdfSections,
        generalInfo,
      });
      const fileName = `formulario_fotos_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, pdfContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Compartilhar PDF de Fotos',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF gerado', `Arquivo salvo: ${fileName}`);
      }

      let backendMessage = '';
      let backendSent = false;
      try {
        const backendSections = await Promise.all(
          pdfSections.map(async (section) => {
            const backendItems = await Promise.all(
              (section.items || []).map(async (item) => {
                const itemPhotos = item.photos || [];
                const photosToSend = itemPhotos.slice(0, 4);
                const photoDataUris = (await Promise.all(
                  photosToSend.map(async (photo) => buildBackendPhotoDataUri(photo?.uri)),
                )).filter(Boolean);

                return {
                  key: item.key,
                  label: item.label,
                  totalPhotos: itemPhotos.length,
                  // Envia ate 4 fotos (comprimidas) para renderizar em grade no PDF do backend.
                  photos: photoDataUris.map((uri) => ({ uri })),
                };
              }),
            );

            return {
              key: section.key,
              title: section.title,
              totalPhotos: backendItems.reduce((sum, item) => sum + (item.totalPhotos || 0), 0),
              items: backendItems,
            };
          }),
        );

        const backendPayload = {
          metaInfo: draftMeta,
          generalInfo,
          checklist,
          palletData,
          sections: backendSections,
        };

        const response = await api.post('/relatorio-embarque-sede', backendPayload);
        backendMessage = String(response?.data?.message || '').trim();
        backendSent = true;
      } catch (backendError) {
        console.warn('Erro ao enviar relatorio de embarque para backend:', backendError?.message);
        backendMessage = 'PDF local gerado, mas nao foi possivel enviar no backend agora.';
      }

      if (backendMessage) {
        Alert.alert('Relatorio de embarque', backendMessage);
      }

      if (backendSent) {
        const storedRaw = await AsyncStorage.getItem(EMBARQUE_DRAFTS_STORAGE_KEY);
        let storedList = draftList;
        if (storedRaw) {
          try {
            storedList = pruneDraftsToLast15Days(JSON.parse(storedRaw));
          } catch {
            storedList = draftList;
          }
        }
        const next = storedList.filter((draft) => draft.id !== currentDraftId);
        setDraftList(next);
        await AsyncStorage.setItem(EMBARQUE_DRAFTS_STORAGE_KEY, JSON.stringify(next));
        startNewDraft();
      } else {
        await persistCurrentDraft({ stepOverride: step });
      }
    } catch (error) {
      console.error('Erro ao enviar relatorio:', error);
      Alert.alert('Erro', 'Nao foi possivel enviar o relatorio.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Trata a acao principal do botao conforme a etapa atual.
  // Faz upload silencioso das fotos das seções manga para o backend ao avançar.
  const uploadFotosMangaParaBackend = async () => {
    try {
      const fotosParaEnviar = [];
      mangaSections.forEach((section) => {
        section.items.forEach((item) => {
          (item.photos || []).forEach((photo) => {
            if (photo?.uri) fotosParaEnviar.push(photo.uri);
          });
        });
      });
      if (!fotosParaEnviar.length) return;

      const formData = new FormData();
      formData.append('fazenda', (draftMeta.farm || 'sem_fazenda').trim());
      formData.append('variedade', (draftMeta.variety || 'sem_variedade').trim());
      fotosParaEnviar.forEach((uri, i) => {
        const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        formData.append('fotos', { uri, type: mime, name: `re_manga_${i + 1}.${ext}` });
      });

      await api.post('/relatorio-embarque-sede/upload-fotos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      console.log(`[RE] ${fotosParaEnviar.length} foto(s) manga enviada(s) ao backend.`);
    } catch (error) {
      console.warn('[RE] Upload fotos manga (silencioso):', error?.message);
    }
  };

  // Carrega talhões da API quando o modal de cadastro abre.
  const carregarTalhoesCF = async () => {
    try {
      const response = await api.get('/talhoes');
      const list = Array.isArray(response?.data) ? response.data : (Array.isArray(response) ? response : []);
      setCfAllTalhoes(list);
      const uniqueFazendas = [...new Set(list.map((t) => t.fazenda).filter(Boolean))].sort();
      setCfFazendas(uniqueFazendas);
    } catch (e) {
      console.warn('[RE] Falha ao carregar talhões:', e?.message);
    }
  };

  const cfSelecionarFazenda = (fazenda) => {
    setCadastrarFotosForm({ fazenda, variedade: '', talhao: '' });
    setCfShowFazendaPicker(false);
    const talhoesDaFazenda = cfAllTalhoes.filter((t) => t.fazenda === fazenda);
    const uniqueVariedades = [...new Set(talhoesDaFazenda.map((t) => t.variedade).filter(Boolean))].sort();
    setCfVariedades(uniqueVariedades);
    setCfTalhoesFiltrados([]);
  };

  const cfSelecionarVariedade = (variedade) => {
    setCadastrarFotosForm((prev) => ({ ...prev, variedade, talhao: '' }));
    setCfShowVariedadePicker(false);
    const talhoesFiltrados = cfAllTalhoes
      .filter((t) => t.fazenda === cadastrarFotosForm.fazenda && t.variedade === variedade && t.talhao)
      .map((t) => t.talhao)
      .filter(Boolean);
    setCfTalhoesFiltrados([...new Set(talhoesFiltrados)].sort());
  };

  const cfSelecionarTalhao = (talhao) => {
    setCadastrarFotosForm((prev) => ({ ...prev, talhao }));
    setCfShowTalhaoPicker(false);
  };

  // Abre galeria, seleciona fotos e envia ao servidor com fazenda/variedade/talhão.
  const handleCadastrarFotosServidor = async () => {
    const { fazenda, variedade, talhao } = cadastrarFotosForm;
    if (!fazenda.trim()) {
      Alert.alert('Campo obrigatório', 'Informe a fazenda.');
      return;
    }
    if (!variedade.trim()) {
      Alert.alert('Campo obrigatório', 'Informe a variedade.');
      return;
    }
    if (!cadastrarFotosList.length) {
      Alert.alert('Sem fotos', 'Tire ou selecione ao menos uma foto antes de enviar.');
      return;
    }

    try {
      setCadastrarFotosLoading(true);

      const formData = new FormData();
      formData.append('fazenda', fazenda.trim());
      formData.append('variedade', variedade.trim());
      if (talhao.trim()) formData.append('talhao', talhao.trim());

      cadastrarFotosList.forEach((uri, i) => {
        const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        formData.append('fotos', { uri, type: mime, name: `servidor_foto_${i + 1}.${ext}` });
      });

      const response = await api.post('/relatorio-embarque-sede/upload-fotos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });

      setCadastrarFotosLoading(false);
      const total = response.data?.total || cadastrarFotosList.length;
      Alert.alert('Sucesso', `${total} foto(s) cadastrada(s) ao servidor.`);
      setShowCadastrarFotosModal(false);
      setCadastrarFotosForm({ fazenda: '', variedade: '', talhao: '' });
      setCadastrarFotosList([]);
    } catch (error) {
      setCadastrarFotosLoading(false);
      console.error('[RE] Erro ao cadastrar fotos ao servidor:', error?.message);
      Alert.alert('Erro', 'Não foi possível enviar as fotos ao servidor.');
    }
  };

  // Adiciona fotos da galeria à lista de cadastro.
  const pickFotosServidorGaleria = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão negada', 'Habilite o acesso à galeria.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.length) {
        const uris = result.assets.map((a) => a.uri).filter(Boolean);
        setCadastrarFotosList((prev) => [...prev, ...uris]);
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível abrir a galeria.');
    }
  };

  // Tira foto com a câmera e adiciona à lista de cadastro.
  const pickFotoServidorCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão negada', 'Habilite o acesso à câmera.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!result.canceled && result.assets?.length) {
        const uri = result.assets[0]?.uri;
        if (uri) setCadastrarFotosList((prev) => [...prev, uri]);
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível abrir a câmera.');
    }
  };

  // Remove uma foto da lista de cadastro.
  const removeFotoServidor = (index) => {
    setCadastrarFotosList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMainAction = async () => {
    if (step === 2 && mangaSections.length === 0) {
      Alert.alert('Obrigatorio', 'Selecione ao menos uma variedade para continuar.');
      return;
    }

    if (step < TOP_FLOW_LAST_INDEX) {
      const nextStep = Math.min(TOP_FLOW_LAST_INDEX, step + 1);
      await persistCurrentDraft({ stepOverride: nextStep });
      setStep(nextStep);
      return;
    }

    await enviarRelatorio();
  };

  // Renderiza uma secao do checklist com seus respectivos itens.
  const renderSection = (section, titleOverride, options = {}) => {
    const {
      serverFotosData = {},
      serverFotosLoading = false,
      onRefreshServerFotos = null,
    } = options;

    const items = section?.items || [];
    const showServerFotosInline = section?.key === CONTAINER_SECTION_KEY && typeof onRefreshServerFotos === 'function';
    const hasAnyServerFoto = showServerFotosInline
      && items.some((item) => (serverFotosData[item.key] || []).length > 0);

    return (
      <View style={st.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={[st.cardTitle, { marginBottom: 0 }]}>{titleOverride || section.title}</Text>
          {showServerFotosInline && (
            <TouchableOpacity
              onPress={onRefreshServerFotos}
              activeOpacity={0.7}
              disabled={serverFotosLoading}
            >
              <MaterialIcons name="refresh" size={20} color={serverFotosLoading ? '#CCC' : GREEN} />
            </TouchableOpacity>
          )}
        </View>

        {showServerFotosInline && serverFotosLoading && (
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <ActivityIndicator size="small" color={GREEN} />
            <Text style={{ fontSize: 12, color: '#888', marginTop: 6 }}>Carregando fotos do servidor...</Text>
          </View>
        )}

        {items.map((item) => {
          const serverUrls = showServerFotosInline ? (serverFotosData[item.key] || []) : [];
          return (
            <View key={item.key}>
              <ItemCard
                item={item}
                onPickGallery={() => pickFromGallery(section, item)}
                onPickCamera={() => pickFromCamera(section, item)}
                onPreviewPhoto={(photo) =>
                  setPhotoViewer({
                    sectionKey: section.key,
                    sectionTitle: section.title,
                    itemKey: item.key,
                    itemLabel: item.label,
                    photo,
                  })
                }
                onDeletePhoto={(photo) => askDeletePhoto(section.key, item.key, photo.id)}
                serverPhotos={!serverFotosLoading ? serverUrls : []}
                hideEmptyState
              />
            </View>
          );
        })}

        {showServerFotosInline && !serverFotosLoading && !hasAnyServerFoto && (
          <View style={st.emptyDraftBox}>
            <MaterialIcons name="photo-library" size={20} color="#CCC" />
            <Text style={st.emptyDraftText}>Nenhuma foto encontrada no servidor para este container.</Text>
          </View>
        )}
      </View>
    );
  };

  // Faz scroll ate o campo informado para facilitar a edicao.
  const scrollToInput = (key) => {
    const ref = inputRefs.current[key];
    if (!ref || !scrollViewRef.current) return;
    setTimeout(() => {
      ref.measureLayout(
        findNodeHandle(scrollViewRef.current),
        (_x, y) => { scrollViewRef.current.scrollTo({ y: y - 80, animated: true }); },
        () => {}
      );
    }, 150);
  };

  // Alterna temp variedade.
  const toggleTempVariedade = (variedade) => {
    setTempVariedades((current) => {
      if (current.includes(variedade)) {
        return current.filter((item) => item !== variedade);
      }
      return [...current, variedade];
    });
  };

  // Aplica variedades selection.
  const applyVariedadesSelection = () => {
    const ordered = variedadesList.filter((item) => tempVariedades.includes(item));
    setSelectedVariedades(ordered);
    setMetaInfoField('variety', ordered.join(', '));
    setSections((current) => buildSectionsForVariedades(ordered, current));
    setActiveMangaSectionKey(null);
    setNewVariedadeName('');
    setVariedadeSearch('');
    setShowCreateVariedadeModal(false);
    setShowVarModal(false);
  };

  // Abre variedades selection.
  const openVariedadesSelection = () => {
    setTempVariedades(selectedVariedades);
    setNewVariedadeName('');
    setVariedadeSearch('');
    setShowCreateVariedadeModal(false);
    setShowVarModal(true);
  };

  // Fecha variedades selection.
  const closeVariedadesSelection = () => {
    setShowVarModal(false);
    setShowCreateVariedadeModal(false);
    setTempVariedades(selectedVariedades);
    setNewVariedadeName('');
    setVariedadeSearch('');
  };

  // Abre create variedade modal.
  const openCreateVariedadeModal = () => {
    setNewVariedadeName('');
    setShowCreateVariedadeModal(true);
  };

  // Fecha create variedade modal.
  const closeCreateVariedadeModal = () => {
    if (isSavingVariedade) return;
    setShowCreateVariedadeModal(false);
    setNewVariedadeName('');
  };

  // Adiciona variedade option.
  const addVariedadeOption = async () => {
    if (isSavingVariedade) return;

    const normalized = String(newVariedadeName || '').trim().toUpperCase();
    if (!normalized) {
      Alert.alert('Variedades', 'Digite o nome da variedade para cadastrar.');
      return;
    }

    const exists = variedadesList.some((item) => String(item || '').trim().toUpperCase() === normalized);
    if (exists) {
      Alert.alert('Variedades', 'Essa variedade ja esta cadastrada.');
      return;
    }

    setIsSavingVariedade(true);
    try {
      let savedName = normalized;

      try {
        const created = await api.post('/variedades', { nome: normalized });
        savedName = String(created?.nome || normalized).trim().toUpperCase();
      } catch (backendError) {
        const backendMessage = String(backendError?.response?.data?.error || '').trim();
        if (backendMessage && !backendMessage.toLowerCase().includes('existe')) {
          throw backendError;
        }
      }

      const nextVariedades = [...variedadesList, savedName].sort((a, b) => a.localeCompare(b));
      setVariedadesList(nextVariedades);
      setTempVariedades((current) => (current.includes(savedName) ? current : [...current, savedName]));
      setNewVariedadeName('');
      setShowCreateVariedadeModal(false);

      await AsyncStorage.setItem(EMBARQUE_VARIEDADES_STORAGE_KEY, JSON.stringify(nextVariedades));
      Alert.alert('Variedades', 'Variedade cadastrada com sucesso.');
    } catch (saveError) {
      console.error('Erro ao salvar nova variedade:', saveError);
      const backendMessage = String(saveError?.response?.data?.error || '').trim();
      Alert.alert('Erro', backendMessage || 'Nao foi possivel cadastrar a variedade agora.');
    } finally {
      setIsSavingVariedade(false);
    }
  };

  // Abre cliente selection.
  const openClienteSelection = () => {
    setClienteSearch('');
    setNewClienteName('');
    setNewClientePais('');
    setShowCreateClienteModal(false);
    setShowClienteModal(true);
  };

  // Navio: fecha modal lista.
  const closeNavioModal = () => {
    setShowNavioModal(false);
    setNavioSearch('');
  };

  // Navio: abre cadastro.
  const openCreateNavioModal = () => {
    setNewNavioName('');
    setShowCreateNavioModal(true);
  };

  // Navio: fecha cadastro.
  const closeCreateNavioModal = () => {
    if (isSavingNavio) return;
    setShowCreateNavioModal(false);
    setNewNavioName('');
  };

  // Navio: cadastra novo.
  const addNavioOption = async () => {
    if (isSavingNavio) return;
    const nome = String(newNavioName || '').trim().toUpperCase();
    if (!nome) { Alert.alert('Atenção', 'Informe o nome do navio.'); return; }
    setIsSavingNavio(true);
    try {
      await api.post('/navios', { nome });
      const next = [...new Set([...naviosList, nome])].sort((a, b) => a.localeCompare(b));
      setNaviosList(next);
      await AsyncStorage.setItem(EMBARQUE_NAVIOS_STORAGE_KEY, JSON.stringify(next));
      setGeneralInfoField('vessel', nome);
      setShowCreateNavioModal(false);
      closeNavioModal();
      Alert.alert('Navios', 'Navio cadastrado com sucesso.');
    } catch (error) {
      const msg = String(error?.response?.data?.error || '').trim();
      Alert.alert('Erro', msg || 'Não foi possível cadastrar o navio agora.');
    } finally {
      setIsSavingNavio(false);
    }
  };

  // Fecha cliente selection.
  const closeClienteSelection = () => {
    setShowClienteModal(false);
    setShowCreateClienteModal(false);
    setClienteSearch('');
    setNewClienteName('');
    setNewClientePais('');
  };

  // Abre create cliente modal.
  const openCreateClienteModal = () => {
    setNewClienteName('');
    setNewClientePais('');
    setShowCreateClienteModal(true);
  };

  // Fecha create cliente modal.
  const closeCreateClienteModal = () => {
    if (isSavingCliente) return;
    setShowCreateClienteModal(false);
    setNewClienteName('');
    setNewClientePais('');
  };

  // Adiciona cliente option.
  const addClienteOption = async () => {
    if (isSavingCliente) return;

    const cliente = String(newClienteName || '').trim();
    const pais = String(newClientePais || '').trim();

    if (!cliente) {
      Alert.alert('Clientes', 'Digite o nome do cliente para cadastrar.');
      return;
    }

    if (!pais) {
      Alert.alert('Clientes', 'Digite o pais do cliente para cadastrar.');
      return;
    }

    const alreadyExists = clientesList.some(
      (item) => String(item?.cliente || '').trim().toUpperCase() === cliente.toUpperCase(),
    );
    if (alreadyExists) {
      Alert.alert('Clientes', 'Esse cliente ja esta cadastrado.');
      return;
    }

    setIsSavingCliente(true);
    try {
      const created = await api.post('/clientes-paises', { cliente, pais });
      const createdItem = {
        id: created?.id ?? createPhotoId(),
        cliente: String(created?.cliente || cliente).trim(),
        pais: String(created?.pais || pais).trim(),
      };

      const next = [...clientesList, createdItem].sort((a, b) => String(a.cliente || '').localeCompare(String(b.cliente || '')));
      setClientesList(next);
      await AsyncStorage.setItem(EMBARQUE_CLIENTES_STORAGE_KEY, JSON.stringify(next));

      setGeneralInfoField('customer', createdItem.cliente);
      setShowCreateClienteModal(false);
      closeClienteSelection();
      Alert.alert('Clientes', 'Cliente cadastrado com sucesso.');
    } catch (error) {
      console.error('Erro ao cadastrar cliente:', error);
      const backendMessage = String(error?.response?.data?.error || '').trim();
      Alert.alert('Erro', backendMessage || 'Nao foi possivel cadastrar o cliente agora.');
    } finally {
      setIsSavingCliente(false);
    }
  };

  // Conta o total de fotos de uma secao especifica.
  const countPhotosFromSection = (section) =>
    (section?.items || []).reduce((sum, item) => sum + ((item.photos || []).length), 0);

  const filteredClientes = clientesList
    .filter((c) => String(c?.cliente || '').toLowerCase().includes(clienteSearch.toLowerCase()));
  const filteredVariedades = variedadesList
    .filter((item) => String(item || '').toLowerCase().includes(variedadeSearch.toLowerCase()));

  // ── Manga cadastros: carregar do banco ──
  const carregarMangaCadastros = async () => {
    try {
      const res = await api.get('/manga-cadastros');
      // interceptor retorna response.data direto → res = { success, data: [] }
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const fotosVazias = {};
      MANGA_FOTO_ITEMS.forEach((item) => { fotosVazias[item.key] = []; });
      setMangaCadastros(list.map((r) => ({ ...r, fotos: { ...fotosVazias } })));
    } catch (e) {
      console.warn('[RE] Falha ao carregar manga cadastros:', e?.message);
    }
  };

  // ── Manga cadastros: adicionar ──
  const addMangaCadastro = async () => {
    const fazenda = mangaFormFazenda.trim();
    const variedade = mangaFormVariedade.trim().toUpperCase();
    const controle = mangaFormControle.trim();
    if (!fazenda || !variedade || !controle) {
      Alert.alert('Obrigatório', 'Preencha Fazenda, Variedade e Controle.');
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const fotos = {};
    const novoIdx = mangaCadastros.length;
    MANGA_FOTO_ITEMS.forEach((item) => { fotos[item.key] = []; });
    // Salva no banco primeiro
    try {
      await api.post('/manga-cadastros', { id, fazenda, variedade, controle });
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar no banco. Tente novamente.');
      console.error('[RE] Erro ao salvar manga cadastro:', e?.message);
      return;
    }
    setMangaCadastros((prev) => [...prev, { id, fazenda, variedade, controle, fotos }]);
    setMangaFormFazenda('');
    setMangaFormVariedade('');
    setMangaFormControle('');
    setMangaFotoModalIdx(novoIdx);
    setMangaCadastroTab('fotos');
  };

  // Carrega fazendas da API para o form de cadastro de manga
  const carregarFazendasMangaForm = async () => {
    try {
      const response = await api.get('/talhoes');
      const list = Array.isArray(response?.data) ? response.data : (Array.isArray(response) ? response : []);
      setMangaFormAllTalhoes(list);
      const uniqueFazendas = [...new Set(list.map((t) => t.fazenda).filter(Boolean))].sort();
      setMangaFormFazendaList(uniqueFazendas);
    } catch (e) {
      console.warn('[RE] Falha ao carregar fazendas para manga form:', e?.message);
    }
  };

  // Ao selecionar fazenda, filtra as variedades disponíveis
  const mangaFormSelecionarFazenda = (fazenda) => {
    setMangaFormFazenda(fazenda);
    setMangaFormVariedade('');
    const talhoesDaFazenda = mangaFormAllTalhoes.filter((t) => t.fazenda === fazenda);
    const uniqueVariedades = [...new Set(talhoesDaFazenda.map((t) => t.variedade).filter(Boolean))].sort();
    setMangaFormVariedadeList(uniqueVariedades.length > 0 ? uniqueVariedades : variedadesList);
  };

  const removeMangaCadastro = (idx) => {
    const cad = mangaCadastros[idx];
    Alert.alert('Remover', 'Deseja remover este cadastro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          if (cad?.id) {
            try {
              await api.delete(`/manga-cadastros/${cad.id}`);
            } catch (e) {
              console.warn('[RE] Erro ao deletar manga cadastro:', e?.message);
            }
          }
          setMangaCadastros((prev) => prev.filter((_, i) => i !== idx));
        },
      },
    ]);
  };

  const pickMangaCadFotoCamera = async (cadastroIdx, itemKey) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { Alert.alert('Permissão negada', 'Habilite o acesso à câmera.'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!result.canceled && result.assets?.length) {
        const uri = result.assets[0]?.uri;
        if (uri) setMangaCadastros((prev) => prev.map((c, i) => i === cadastroIdx ? { ...c, fotos: { ...c.fotos, [itemKey]: [...(c.fotos[itemKey] || []), uri] } } : c));
      }
    } catch (error) { Alert.alert('Erro', 'Não foi possível abrir a câmera.'); }
  };

  const pickMangaCadFotoGaleria = async (cadastroIdx, itemKey) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('Permissão negada', 'Habilite o acesso à galeria.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.85 });
      if (!result.canceled && result.assets?.length) {
        const uris = result.assets.map((a) => a.uri).filter(Boolean);
        setMangaCadastros((prev) => prev.map((c, i) => i === cadastroIdx ? { ...c, fotos: { ...c.fotos, [itemKey]: [...(c.fotos[itemKey] || []), ...uris] } } : c));
      }
    } catch (error) { Alert.alert('Erro', 'Não foi possível abrir a galeria.'); }
  };

  const removeMangaCadFoto = (cadastroIdx, itemKey, fotoIdx) => {
    setMangaCadastros((prev) => prev.map((c, i) => i === cadastroIdx ? { ...c, fotos: { ...c.fotos, [itemKey]: (c.fotos[itemKey] || []).filter((_, fi) => fi !== fotoIdx) } } : c));
  };

  const getTotalMangaCadFotos = (cadastro) => Object.values(cadastro.fotos || {}).reduce((sum, arr) => sum + (arr?.length || 0), 0);

  const enviarMangaCadastroFotosServidor = async () => {
    const cad = mangaCadastros[mangaFotoModalIdx];
    if (!cad) {
      Alert.alert('Selecione uma manga', 'Abra a aba Fotos de uma manga para enviar.');
      return;
    }

    const totalFotos = getTotalMangaCadFotos(cad);
    if (!totalFotos) {
      Alert.alert('Sem fotos', 'Adicione fotos antes de enviar ao servidor.');
      return;
    }

    setMangaCadastroSending(true);
    try {
      let totalEnviado = 0;
      for (const item of MANGA_FOTO_ITEMS) {
        const fotos = cad.fotos[item.key] || [];
        if (!fotos.length) continue;
        const formData = new FormData();
        formData.append('fazenda', cad.fazenda);
        formData.append('variedade', cad.variedade);
        formData.append('controle', cad.controle);
        formData.append('campo', item.key);
        fotos.forEach((uri, i) => {
          const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          formData.append('fotos', { uri, type: mime, name: `${item.key}_${i + 1}.${ext}` });
        });
        await api.post('/manga-fotos/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        });
        totalEnviado += fotos.length;
      }
      const entrada = {
        ...cad,
        totalEnviado,
        enviadoEm: new Date().toISOString(),
      };
      setMangaHistorico((prev) => [entrada, ...prev]);
      setMangaCadastros((prev) => prev.filter((_, i) => i !== mangaFotoModalIdx));
      setMangaFotoModalIdx(null);
      setShowMangaCadastroModal(false);
      Alert.alert('Enviado!', `${totalEnviado} foto(s) enviada(s) ao servidor (controle ${cad.controle}).`);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível enviar as fotos ao servidor.');
      console.error('[MangaFotos] Upload geral erro:', err?.message);
    } finally {
      setMangaCadastroSending(false);
    }
  };

  const handleMangaCadastroAction = async () => {
    if (mangaCadastroSending) return;
    if (mangaCadastroTab === 'adicionar') {
      if (!mangaFormFazenda.trim() || !mangaFormVariedade.trim() || !mangaFormControle.trim()) {
        Alert.alert('Obrigatório', 'Preencha Fazenda, Variedade e Controle.');
        return;
      }
      // Modo edição: item já existe em mangaCadastros → apenas atualiza e vai para fotos
      if (mangaFotoModalIdx !== null && mangaCadastros[mangaFotoModalIdx]) {
        setMangaCadastros((prev) =>
          prev.map((c, i) =>
            i === mangaFotoModalIdx
              ? { ...c, fazenda: mangaFormFazenda.trim(), variedade: mangaFormVariedade.trim().toUpperCase(), controle: mangaFormControle.trim() }
              : c
          )
        );
        setMangaCadastroTab('fotos');
        return;
      }
      setMangaCadastroSending(true);
      try {
        await addMangaCadastro();
      } finally {
        setMangaCadastroSending(false);
      }
      return;
    }
    await enviarMangaCadastroFotosServidor();
  };

  const sanitizeMangaSegment = (value, fallback = '') => {
    const base = String(value || fallback).trim();
    return base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  };

  const extrairMetaFotoManga = (url) => {
    const decoded = decodeURIComponent(String(url || ''));
    const marker = '/manga-fotos/serve/';
    const idx = decoded.indexOf(marker);
    if (idx === -1) return null;
    const after = decoded.slice(idx + marker.length);
    const parts = after.split('/').filter(Boolean);
    if (parts.length < 4) return null;
    return {
      controle: String(parts[2] || '').trim(),
    };
  };

  const obterControlesDoCarregamento = async (carreg) => {
    const pallets = Array.isArray(carreg?.pallets) ? carreg.pallets : [];
    const controles = new Set();

    const addControle = (controle) => {
      const ctrl = String(controle || '').trim();
      if (!ctrl) return;
      controles.add(ctrl);
    };

    // Tenta usar CONTROLE já disponível no pallet.
    pallets.forEach((p) => addControle(p?.controle));

    // Completa com API unificada para garantir CONTROLE quando vier do pallet-dados.
    if (pallets.length > 0) {
      const resultados = await Promise.allSettled(
        pallets.map((p) => api.get('/pallet-dados', { params: { pallet: p?.palletId } })),
      );

      resultados.forEach((resultado) => {
        if (resultado.status !== 'fulfilled') return;
        const res = resultado.value;
        const rows = Array.isArray(res?.data)
          ? res.data
          : (Array.isArray(res) ? res : (Array.isArray(res?.rows) ? res.rows : []));

        rows.forEach((row) => {
          addControle(row?.CONTROLE || row?.controle || row?.CONTROLE_TALHAO || row?.controle_talhao);
        });
      });
    }

    return Array.from(controles);
  };

  const filtrarFotosMangaPorControle = (urls, controlesPermitidos) => {
    const lista = Array.isArray(urls) ? urls : [];
    if (!lista.length) return [];

    const controles = new Set(Array.isArray(controlesPermitidos) ? controlesPermitidos : []);

    return lista.filter((url) => {
      const meta = extrairMetaFotoManga(url);
      if (!meta) return false;
      return controles.size > 0 ? controles.has(meta.controle) : true;
    });
  };

  const isContainerPlaceholder = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return true;
    const upper = raw.toUpperCase();
    return /^SEM\s*N[\u00BA\u00B0º°*O]?\s*CONTAINER$/i.test(upper)
      || upper === 'SEM CONTAINER';
  };

  const obterLabelCarregamento = (carreg) => {
    const container = String(carreg?.container || '').trim();
    if (container && !isContainerPlaceholder(container)) return container;
    const apelido = String(carreg?.apelido || '').trim();
    if (apelido) return apelido;
    const id = String(carreg?.id || '').trim();
    if (id) return `Carreg. ${id}`;
    return 'SEM N° CONTAINER';
  };

  const obterChaveCarregamento = (carreg) => {
    const container = String(carreg?.container || '').trim();
    if (container && !isContainerPlaceholder(container)) return container;
    const id = String(carreg?.id || '').trim();
    if (id) return `sem-container:${id}`;
    const apelido = String(carreg?.apelido || '').trim();
    if (apelido) return apelido;
    return '';
  };

  const buscarCarregamentoPorChave = (chave) => {
    const alvo = String(chave || '').trim();
    if (!alvo) return null;
    return carregamentos.find((c) => {
      if (obterChaveCarregamento(c) === alvo) return true;
      // Compatibilidade com valores antigos salvos antes da chave única.
      if (String(c?.container || '').trim() === alvo) return true;
      if (String(c?.apelido || '').trim() === alvo) return true;
      if (String(c?.id || '').trim() === alvo) return true;
      return false;
    }) || null;
  };

  const carregarFotosContainerImprimir = async (container) => {
    const carreg = buscarCarregamentoPorChave(container);
    if (!carreg || !carreg.apelido) return;
    setImprimirContainerFotos({ loading: true, data: {} });
    try {
      const baseUrl = (api.getCurrentURL() || '').replace(/\/api$/, '');
      const res = await api.get('/priorizacao-pallets/listar-fotos-container', { params: { apelido: carreg.apelido } });
      const campos = res?.campos || res?.data?.campos || {};
      const dataNormalizada = normalizePriorizacaoFotosByCampo(campos, baseUrl);
      setImprimirContainerFotos({ loading: false, data: dataNormalizada });
    } catch {
      setImprimirContainerFotos({ loading: false, data: {} });
    }
  };

  const carregarFotosMangaImprimir = async (container) => {
    const carreg = buscarCarregamentoPorChave(container);
    if (!carreg) return;
    setImprimirMangaFotos({ loading: true, data: {} });
    try {
      const baseUrl = (api.getCurrentURL() || '').replace(/\/api$/, '');
      const controles = await obterControlesDoCarregamento(carreg);
      if (!controles.length) {
        setImprimirMangaFotos({ loading: false, data: {} });
        return;
      }

      const resultados = await Promise.allSettled(
        controles.map((controle) => api.get('/manga-fotos', { params: { controle } })),
      );

      const acumulado = {};
      MANGA_FOTO_ITEMS.forEach(({ key }) => { acumulado[key] = []; });

      resultados.forEach((resultado) => {
        if (resultado.status !== 'fulfilled') return;
        const fotosPorCampo = normalizeMangaFotosByCampo(
          resultado.value?.fotos || resultado.value?.data?.fotos || {},
          baseUrl,
        );
        MANGA_FOTO_ITEMS.forEach(({ key }) => {
          const filtradas = filtrarFotosMangaPorControle(fotosPorCampo[key] || [], controles);
          acumulado[key].push(...filtradas);
        });
      });

      MANGA_FOTO_ITEMS.forEach(({ key }) => {
        acumulado[key] = [...new Set(acumulado[key])];
      });

      setImprimirMangaFotos({ loading: false, data: acumulado });
    } catch {
      setImprimirMangaFotos({ loading: false, data: {} });
    }
  };

  // Filtra URLs de fotos do servidor pela variedade. A URL tem o formato:
  // /api/manga-fotos/serve/{fazenda}/{variedade}/{controle}/{campo}/{arquivo}
  // sectionKey = 'manga_KENT' → extrai 'kent' e compara com o segmento de variedade na URL.
  const filtrarUrlsMangaPorVariedade = (urls, sectionKey) => {
    if (!Array.isArray(urls) || !sectionKey) return urls || [];
    const variedade = sectionKey.replace(/^manga_/i, '').toLowerCase();
    return urls.filter((url) => {
      const str = String(url || '');
      const serveIdx = str.indexOf('/serve/');
      if (serveIdx < 0) return true; // URL desconhecida: inclui por segurança
      const afterServe = str.slice(serveIdx + 7); // remove '/serve/'
      const parts = afterServe.split('/');
      // [fazenda, variedade, controle, campo, arquivo]
      return (parts[1] || '').toLowerCase() === variedade;
    });
  };

  const carregarServidorFotosInline = async () => {
    const controles = await obterControlesDoCarregamento(selectedCarregamento);
    if (!selectedCarregamento?.apelido && !controles.length) return;
    // Marca todos os campos como loading
    const loadingState = {};
    PRIORIZACAO_FOTO_CAMPOS.forEach((c) => { loadingState[c.key] = { loading: true, urls: [] }; });
    setServidorFotosInline(loadingState);
    try {
      const baseUrl = (api.getCurrentURL() || '').replace(/\/api$/, '');

      let dataNormalizada = normalizePriorizacaoFotosByCampo({}, baseUrl);
      if (selectedCarregamento?.apelido) {
        const res = await api.get('/priorizacao-pallets/listar-fotos-container', { params: { apelido: selectedCarregamento.apelido } });
        const campos = res?.campos || res?.data?.campos || {};
        dataNormalizada = normalizePriorizacaoFotosByCampo(campos, baseUrl);
      }

      // Complementa maturação/firmeza a partir de manga_fotos por controle dos pallets
      if (controles.length > 0) {
        const resultados = await Promise.allSettled(
          controles.map((controle) => api.get('/manga-fotos', { params: { controle } })),
        );

        const maturityUrls = [];
        const firmnessUrls = [];

        resultados.forEach((resultado) => {
          if (resultado.status !== 'fulfilled') return;
          const fotosPorCampo = normalizeMangaFotosByCampo(
            resultado.value?.fotos || resultado.value?.data?.fotos || {},
            baseUrl,
          );
          maturityUrls.push(...filtrarFotosMangaPorControle(fotosPorCampo.maturity || [], controles));
          firmnessUrls.push(...filtrarFotosMangaPorControle(fotosPorCampo.firmness || [], controles));
        });

        dataNormalizada.maturacao_variedade = [
          ...(dataNormalizada.maturacao_variedade || []),
          ...maturityUrls,
        ].filter((url, idx, arr) => arr.indexOf(url) === idx);

        dataNormalizada.firmeza_variedade = [
          ...(dataNormalizada.firmeza_variedade || []),
          ...firmnessUrls,
        ].filter((url, idx, arr) => arr.indexOf(url) === idx);
      }

      const newState = {};
      PRIORIZACAO_FOTO_CAMPOS.forEach((c) => {
        const urls = dataNormalizada[c.key] || [];
        newState[c.key] = { loading: false, urls };
      });
      setServidorFotosInline(newState);
    } catch {
      const errorState = {};
      PRIORIZACAO_FOTO_CAMPOS.forEach((c) => { errorState[c.key] = { loading: false, urls: [] }; });
      setServidorFotosInline(errorState);
    }
  };

  // Renderiza a visao de selecao/navegacao entre secoes de mangas.
  const renderMangasStep = () => {
    const firstMangaSection = mangaSections[0] || null;

    return (
    <>
      <View style={st.card}>
        <View style={pgSt.headerRow}>
          <Text style={st.cardTitle}>Mangas por maturacao</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {mangaHistorico.length > 0 && (
              <TouchableOpacity
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' }}
                onPress={() => setShowMangaHistoricoModal(true)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="history" size={22} color="#0277BD" />
              </TouchableOpacity>
            )}
          <TouchableOpacity
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center' }}
            onPress={() => {
              setMangaCadastroTab('adicionar');
              setMangaFotoModalIdx(null);
              setMangaFormFazenda('');
              setMangaFormVariedade('');
              setMangaFormControle('');
              setMangaFormVariedadeList([]);
              carregarFazendasMangaForm();
              setShowMangaCadastroModal(true);
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="add" size={26} color="#FFF" />
          </TouchableOpacity>
          </View>
        </View>

        {mangaCadastros.length === 0 ? (
          <View style={st.emptyDraftBox}>
            <MaterialIcons name="info-outline" size={20} color="#999" />
            <Text style={st.emptyDraftText}>Nenhuma manga cadastrada ainda.{'\n'}Toque no + para adicionar.</Text>
          </View>
        ) : (
          mangaCadastros.map((cad, idx) => {
            const totalFotos = getTotalMangaCadFotos(cad);
            return (
              <TouchableOpacity
                key={cad.id}
                style={pgSt.carregCard}
                activeOpacity={0.7}
                onPress={() => {
                  setMangaFotoModalIdx(idx);
                  setMangaCadastroTab('fotos');
                  setShowMangaCadastroModal(true);
                }}
              >
                <View style={pgSt.carregHeaderRow}>
                  <MaterialIcons name="eco" size={20} color={GREEN} />
                  <Text style={pgSt.carregApelido}>{cad.fazenda}</Text>
                </View>
                <View style={pgSt.carregInfoRow}>
                  <MaterialIcons name="local-florist" size={14} color="#888" />
                  <Text style={pgSt.carregInfoText}>Variedade: {cad.variedade}</Text>
                </View>
                <View style={pgSt.carregInfoRow}>
                  <MaterialIcons name="tag" size={14} color="#888" />
                  <Text style={pgSt.carregInfoText}>Controle: {cad.controle}</Text>
                </View>
                <View style={pgSt.carregBadgeRow}>
                  <View style={[pgSt.badge, { backgroundColor: '#E8F5E9' }]}>
                    <Text style={[pgSt.badgeText, { color: GREEN }]}>{totalFotos} foto(s)</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <TouchableOpacity
                      onPress={() => {
                        setMangaFotoModalIdx(idx);
                        setMangaFormFazenda(cad.fazenda || '');
                        setMangaFormVariedade(cad.variedade || '');
                        setMangaFormControle(String(cad.controle || ''));
                        carregarFazendasMangaForm();
                        setMangaCadastroTab('adicionar');
                        setShowMangaCadastroModal(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="edit" size={20} color="#0277BD" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeMangaCadastro(idx)} activeOpacity={0.7}>
                      <MaterialIcons name="delete-outline" size={20} color="#C62828" />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>


    </>
  );
  };

  // Renderiza os itens fotograficos de uma secao especifica de manga.
  const renderMangaSectionPage = (section) => (
    <View style={st.card}>
      <View style={st.mangaPageHeader}>
        <TouchableOpacity
          style={st.mangaPageBackBtn}
          onPress={() => setActiveMangaSectionKey(null)}
          activeOpacity={0.85}
        >
          <MaterialIcons name="arrow-back" size={18} color={GREEN} />
          <Text style={st.mangaPageBackText}>Voltar para variedades</Text>
        </TouchableOpacity>
        <Text style={st.mangaPageSub}>{`${countPhotosFromSection(section)} foto(s)`}</Text>
      </View>

      <Text style={st.cardTitle}>{section.title}</Text>
      {(section.items || []).map((item) => (
        <ItemCard
          key={item.key}
          item={item}
          onPickGallery={() => pickFromGallery(section, item)}
          onPickCamera={() => pickFromCamera(section, item)}
          onPreviewPhoto={(photo) =>
            setPhotoViewer({
              sectionKey: section.key,
              sectionTitle: section.title,
              itemKey: item.key,
              itemLabel: item.label,
              photo,
            })
          }
          onDeletePhoto={(photo) => askDeletePhoto(section.key, item.key, photo.id)}
        />
      ))}
    </View>
  );

  // ── Buscar carregamentos da API externa (Oracle/ERP) via backend ──
  const fetchCarregamentos = async () => {
    setCarregamentosLoading(true);
    try {
      const res = await api.get('/carregamentos');
      const raw = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      // Agrupar por PLANCARREG_IN_CODIGO (cada carregamento = 1 container)
      const grouped = {};
      raw.forEach((item) => {
        const id = item.PLANCARREG_IN_CODIGO;
        if (!id) return;
        if (!grouped[id]) {
          grouped[id] = {
            id,
            container: item.PLANCARREG_ST_NROCONTAINER || '',
            apelido: item.PLANCARREG_ST_APELIDO || '',
            motorista: item.PLANCARREG_ST_MOTORISTA || '',
            dataSaida: item.PLANCARREG_DT_SAIDA || '',
            safra: item.SAFRA_ST_CODIGO || '',
            pallets: [],
          };
        }
        grouped[id].pallets.push({
          palletId: item.PLANPAL_IN_CODIGO,
          oc: id,
          controle: item.CONTROLE || item.COMPA_IN_NROCONTROLE || null,
          variedade: item.VARIEDADE || item.CLSPROD_ST_DESCRICAO || '',
          caixaDescricao: item.CAIXA_ST_DESCRICAO || '',
          classProd: item.CLSPROD_IN_CODIGO,
          calibre: item.CALIB_IN_CODIGO,
          etiqueta: item.ETIQUETA || '',
          temp1: item.TEMPERATURA_1 != null ? String(item.TEMPERATURA_1) : '',
          temp2: item.TEMPERATURA_2 != null ? String(item.TEMPERATURA_2) : '',
          qtdCaixas: item.QTD_CAIXAS || 0,
        });
      });
      const sorted = Object.values(grouped).sort((a, b) => {
        const dateA = a.dataSaida || '';
        const dateB = b.dataSaida || '';
        return dateB.localeCompare(dateA);
      });
      setCarregamentos(sorted);
    } catch (err) {
      console.error('[Carregamentos] Erro:', err.message);
      Alert.alert('Erro', 'Não foi possível buscar carregamentos.');
      setCarregamentos([]);
    } finally {
      setCarregamentosLoading(false);
    }
  };

  useEffect(() => {
    fetchCarregamentos();
  }, []);

  // Busca dados detalhados de um pallet na API interna (oc + palletId).
  const fetchPalletInfo = async (oc, palletId) => {
    const key = `${oc}_${palletId}`;
    console.log('[PalletInfo][Click] Buscar detalhes', { oc, pallet: palletId, key });
    setPalletInfoMap((prev) => ({ ...prev, [key]: { loading: true, data: null } }));
    try {
      const res = await api.get('/pallet-info', { params: { oc, pallet: palletId } });
      try {
        console.log('[PalletInfo][RespostaBruta]', JSON.stringify(res, null, 2));
      } catch {
        console.log('[PalletInfo][RespostaBruta]', res);
      }
      const data = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      try {
        console.log('[PalletInfo][DadosNormalizados]', JSON.stringify(data, null, 2));
      } catch {
        console.log('[PalletInfo][DadosNormalizados]', data);
      }
      if (!Array.isArray(data) || data.length === 0) {
        console.log('[PalletInfo][Vazio] Nenhum dado retornado para este pallet', { oc, pallet: palletId });
      }
      setPalletInfoMap((prev) => ({ ...prev, [key]: { loading: false, data } }));
    } catch (error) {
      console.error('[PalletInfo][Erro]', {
        oc,
        pallet: palletId,
        status: error?.response?.status,
        message: error?.message,
        data: error?.response?.data,
      });
      setPalletInfoMap((prev) => ({ ...prev, [key]: { loading: false, data: [] } }));
    }
  };

  const fetchPalletInfoLote = async (carreg) => {
    const oc = carreg?.id;
    const pallets = Array.isArray(carreg?.pallets) ? carreg.pallets : [];
    if (!oc || pallets.length === 0) return;

    const loadingMap = {};
    pallets.forEach((p) => {
      const key = `${p.oc}_${p.palletId}`;
      loadingMap[key] = { loading: true, data: null };
    });
    setPalletInfoMap((prev) => ({ ...prev, ...loadingMap }));

    try {
      console.log('[PalletInfo][Lote] Buscando por OC', { oc, totalPallets: pallets.length });
      const res = await api.get('/pallet-info-lote', { params: { oc } });
      const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      console.log('[PalletInfo][Lote][Resposta]', { oc, totalRows: rows.length });

      const rowsByPallet = rows.reduce((acc, row) => {
        const palletKey = String(row?.pallet || '').trim();
        if (!palletKey) return acc;
        if (!acc[palletKey]) acc[palletKey] = [];
        acc[palletKey].push(row);
        return acc;
      }, {});

      const doneMap = {};
      pallets.forEach((p) => {
        const key = `${p.oc}_${p.palletId}`;
        const palletKey = String(p.palletId || '').trim();
        doneMap[key] = { loading: false, data: rowsByPallet[palletKey] || [] };
      });
      setPalletInfoMap((prev) => ({ ...prev, ...doneMap }));
    } catch (error) {
      console.error('[PalletInfo][Lote][Erro]', {
        oc,
        status: error?.response?.status,
        message: error?.message,
        data: error?.response?.data,
      });

      const errorMap = {};
      pallets.forEach((p) => {
        const key = `${p.oc}_${p.palletId}`;
        errorMap[key] = { loading: false, data: [] };
      });
      setPalletInfoMap((prev) => ({ ...prev, ...errorMap }));
    }
  };

  // Abre o modal de dados detalhados de um pallet (API unificada 3002).
  const abrirPalletDados = async (palletId) => {
    setPalletDadosModal({ visible: true, palletId, loading: true, data: [], raw: null, error: null });
    try {
      // O interceptor do axios já retorna response.data, então res = { success, data: [...] }
      const res = await api.get('/pallet-dados', { params: { pallet: palletId } });
      const rows = Array.isArray(res?.data)
        ? res.data
        : (Array.isArray(res) ? res : (Array.isArray(res?.rows) ? res.rows : []));

      console.log('[PalletDados][Request]', { pallet: palletId });
      try {
        console.log('[PalletDados][RespostaBruta]', JSON.stringify(res, null, 2));
      } catch {
        console.log('[PalletDados][RespostaBruta]', res);
      }
      console.log('[PalletDados][Rows]', { pallet: palletId, total: rows.length });

      setPalletDadosModal({ visible: true, palletId, loading: false, data: rows, raw: res, error: null });
    } catch (err) {
      console.warn('[PalletDados] Erro:', err?.message);
      setPalletDadosModal({
        visible: true,
        palletId,
        loading: false,
        data: [],
        raw: err?.response?.data || null,
        error: err?.message || 'Falha ao buscar dados do pallet.',
      });
    }
  };

  // Abre o modal de priorização. Busca dados salvos ANTES de abrir para evitar race condition.
  const openCarregamentoModal = async (carreg) => {
    setLoadingOC(carreg.id);

    // 1. Busca dados salvos do banco (etiqueta, temperatura, checklist)
    let savedPalletMap = {};
    let savedChecklist = null;
    try {
      const res = await api.get('/priorizacao/buscar', { params: { oc: carreg.id } });
      const saved = res?.data ?? null;
      if (saved?.pallets?.length > 0) {
        saved.pallets.forEach((sp) => { savedPalletMap[String(sp.planpal)] = sp; });
      }
      if (saved?.checklist) savedChecklist = saved.checklist;
    } catch (e) {
      // sem dados salvos — abre em branco
    }

    setLoadingOC(null);

    // 2. Mescla dados salvos nos pallets do ERP na hora de criar o estado inicial
    const carregNovo = {
      ...carreg,
      pallets: carreg.pallets.map((p) => {
        const sp = savedPalletMap[String(p.palletId)];
        if (!sp) return { ...p };
        return {
          ...p,
          etiqueta: sp.etiqueta ?? p.etiqueta,
          temp1: sp.temperatura_1 ?? p.temp1,
          temp2: sp.temperatura_2 ?? p.temp2,
        };
      }),
    };

    // 3. Abre o modal com tudo já preenchido de uma vez
    setSelectedCarregamento(carregNovo);
    setModalTab('pallets');
    setModalFotos({});
    setServidorFotosInline({});
    setPalletInfoMap({});
    setModalChecklist(
      CHECKLIST_CONTAINER_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        value: savedChecklist?.[item.key] ?? null,
        ...(item.hasTemperatura ? { temperatura: savedChecklist?.[`${item.key}_temp`] ?? '' } : {}),
        ...(item.usaSimNao ? { usaSimNao: true } : {}),
      })),
    );

    fetchPalletInfoLote(carregNovo);
  };

  // Altera temp de um pallet do carregamento selecionado
  const setCarregPalletTemp = (palletIdx, field, text) => {
    setSelectedCarregamento((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, pallets: prev.pallets.map((p, i) => (i === palletIdx ? { ...p, [field]: text } : p)) };
      return updated;
    });
  };

  // Toggle etiqueta de um pallet do carregamento selecionado
  const toggleCarregPalletEtiqueta = (palletIdx) => {
    setSelectedCarregamento((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        pallets: prev.pallets.map((p, i) =>
          i === palletIdx ? { ...p, etiqueta: p.etiqueta === 'C' ? 'NC' : 'C' } : p,
        ),
      };
      return updated;
    });
  };

  // Altera valor (C/NC) de um item do checklist do modal
  const setModalChecklistValue = (key, value) => {
    setModalChecklist((current) =>
      current.map((item) => (item.key === key ? { ...item, value: item.value === value ? null : value } : item)),
    );
  };

  // Altera temperatura de um item do checklist do modal
  const setModalChecklistTemp = (key, temperatura) => {
    setModalChecklist((current) =>
      current.map((item) => (item.key === key ? { ...item, temperatura } : item)),
    );
  };

  // ── Fotos do modal de priorização (por campo) ──
  const getTotalModalFotos = () => Object.values(modalFotos).reduce((sum, arr) => sum + (arr?.length || 0), 0);

  const pickModalFotosGaleria = async (campoKey) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('Permissão negada', 'Habilite o acesso à galeria.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.85 });
      if (!result.canceled && result.assets?.length) {
        const uris = result.assets.map((a) => a.uri).filter(Boolean);
        setModalFotos((prev) => ({ ...prev, [campoKey]: [...(prev[campoKey] || []), ...uris] }));
      }
    } catch (error) { Alert.alert('Erro', 'Não foi possível abrir a galeria.'); }
  };

  const pickModalFotoCamera = async (campoKey) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { Alert.alert('Permissão negada', 'Habilite o acesso à câmera.'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!result.canceled && result.assets?.length) {
        const uri = result.assets[0]?.uri;
        if (uri) setModalFotos((prev) => ({ ...prev, [campoKey]: [...(prev[campoKey] || []), uri] }));
      }
    } catch (error) { Alert.alert('Erro', 'Não foi possível abrir a câmera.'); }
  };

  const removeModalFoto = (campoKey, index) => {
    setModalFotos((prev) => ({ ...prev, [campoKey]: (prev[campoKey] || []).filter((_, i) => i !== index) }));
  };

  const extrairPalletsEControlesCarregamento = async (carreg) => {
    const pallets = Array.isArray(carreg?.pallets) ? carreg.pallets : [];
    const vistosPallet = new Set();
    const vistosControle = new Set();
    const palletNums = [];
    const controles = [];

    const pushPallet = (value) => {
      if (value === undefined || value === null || value === '') return;
      const numeros = String(value).match(/\d+/g);
      if (!numeros?.length) return;
      const pallet = numeros.join('');
      if (!pallet || vistosPallet.has(pallet)) return;
      vistosPallet.add(pallet);
      palletNums.push(pallet);
    };

    const pushControle = (value) => {
      if (value === undefined || value === null || value === '') return;
      const numeros = String(value).match(/\d+/g);
      if (!numeros?.length) return;
      const controle = numeros.join('');
      if (!controle || vistosControle.has(controle)) return;
      vistosControle.add(controle);
      controles.push(controle);
    };

    pallets.forEach((p) => {
      pushPallet(p?.palletId);
      const key = `${p.oc}_${p.palletId}`;
      const rows = Array.isArray(palletInfoMap?.[key]?.data) ? palletInfoMap[key].data : [];
      rows.forEach((row) => {
        pushPallet(row?.PALLET);
        pushPallet(row?.pallet);
        pushControle(row?.compa_in_nrocontrole);
        pushControle(row?.COMPA_IN_NROCONTROLE);
        pushControle(row?.controle);
        pushControle(row?.CONTROLE);
      });
    });

    // Fallback: consulta API unificada por pallet para garantir PALLET/CONTROLE
    const pendentes = pallets.filter((p) => {
      const palletId = String(p?.palletId || '').trim();
      return !!palletId;
    });

    await Promise.all(
      pendentes.map(async (p) => {
        try {
          const res = await api.get('/pallet-dados', { params: { pallet: p.palletId } });
          const rows = Array.isArray(res?.data)
            ? res.data
            : (Array.isArray(res) ? res : (Array.isArray(res?.rows) ? res.rows : []));
          rows.forEach((row) => {
            pushPallet(row?.PALLET);
            pushPallet(row?.pallet);
            pushControle(row?.CONTROLE);
            pushControle(row?.controle);
            pushControle(row?.CONTROLE_TALHAO);
            pushControle(row?.controle_talhao);
          });
        } catch (_) {
          // Sem bloquear envio; mantém os valores já obtidos localmente.
        }
      }),
    );

    return { pallets: palletNums, controles };
  };

  const enviarPriorizacao = async () => {
    if (!selectedCarregamento) return;
    setModalFotosUploading(true);
    try {
      let fotosJson = [];
      // 1. Upload fotos se houver (todas as categorias juntas)
      const allFotoUris = [];
      const allFotoCampos = [];
      for (const campo of PRIORIZACAO_FOTO_CAMPOS) {
        const uris = modalFotos[campo.key] || [];
        for (const uri of uris) {
          allFotoUris.push(uri);
          allFotoCampos.push(campo.key);
        }
      }
      if (allFotoUris.length > 0) {
        const { pallets: palletNums, controles } = await extrairPalletsEControlesCarregamento(selectedCarregamento);
        const palletsFolder = palletNums.length ? palletNums.join('_') : 'sem_pallet';
        const controlesFolder = controles.length ? controles.join('_') : 'sem_controle';
        const formData = new FormData();
        formData.append('apelido', selectedCarregamento.apelido || 'sem_apelido');
        formData.append('plancarreg_codigo', String(selectedCarregamento.id || ''));
        formData.append('oc', String(selectedCarregamento.id || 'OC'));
        formData.append('pallets_json', JSON.stringify(palletNums));
        formData.append('pallets_folder', palletsFolder);
        formData.append('controles_json', JSON.stringify(controles));
        formData.append('controles_folder', controlesFolder);
        formData.append('campos_json', JSON.stringify(allFotoCampos));
        for (const uri of allFotoUris) {
          const name = uri.split('/').pop() || `foto_${Date.now()}.jpg`;
          formData.append('fotos', { uri, name, type: 'image/jpeg' });
        }
        const uploadRes = await api.post('/priorizacao-pallets/upload-fotos', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const uploadedFotos = uploadRes.data?.fotos || [];
        fotosJson = uploadedFotos.map((f, idx) => ({ ...f, campo: allFotoCampos[idx] || '' }));
      }
      // 2. Montar payload enriquecido e salvar tudo em uma única chamada
      const palletsPayload = (selectedCarregamento.pallets || []).map((p) => {
        const key = `${p.oc}_${p.palletId}`;
        const infoData = palletInfoMap[key]?.data || [];
        const info = infoData[0] || {};
        return {
          planpal: p.palletId,
          safra: selectedCarregamento.safra || '',
          qtd_caixas: p.qtdCaixas || 0,
          caixa_descricao: p.caixaDescricao || '',
          calibre: p.calibre ?? null,
          classe_prod: p.classProd ?? null,
          etiqueta: p.etiqueta || '',
          temperatura_1: p.temp1 || '',
          temperatura_2: p.temp2 || '',
          controle: p.controle || info.compa_in_nrocontrole || null,
          variedade: p.variedade || info.VARIEDADE || info.variedade || '',
          fazenda: info.FAZENDA || info.fazenda || '',
        };
      });
      await api.post('/priorizacao/salvar', {
        oc: selectedCarregamento.id,
        safra: selectedCarregamento.safra || '',
        apelido: selectedCarregamento.apelido || '',
        container: selectedCarregamento.container || '',
        data_saida: selectedCarregamento.dataSaida || '',
        motorista: selectedCarregamento.motorista || '',
        pallets: palletsPayload,
        checklist: modalChecklist,
        fotos_json: fotosJson,
      });
      Alert.alert('Sucesso', 'Dados e fotos enviados com sucesso!');
      setSelectedCarregamento(null);
    } catch (error) {
      console.error('[Priorização] Erro:', error?.message);
      Alert.alert('Erro', 'Não foi possível enviar os dados.');
    } finally {
      setModalFotosUploading(false);
    }
  };

  // Atualiza o valor (C/NC) de um item do checklist.
  const setChecklistValue = (key, value) => {
    setChecklist((current) =>
      current.map((item) => (item.key === key ? { ...item, value: item.value === value ? null : value } : item)),
    );
  };

  // Atualiza a temperatura de um item do checklist.
  const setChecklistTemperatura = (key, temperatura) => {
    setChecklist((current) =>
      current.map((item) => (item.key === key ? { ...item, temperatura } : item)),
    );
  };

  const normalizarTextoUpper = (value) => String(value || '').trim().toUpperCase();

  const extrairClienteDoApelido = (apelido) => {
    const raw = String(apelido || '').trim();
    if (!raw) return '';
    const semPrefixo = raw.replace(/^\d{4}[-_]\d{1,2}[\s-_]*/i, '').trim();
    const base = semPrefixo || raw;
    return normalizarTextoUpper(base);
  };

  const obterVariedadesDoCarregamento = async (carreg) => {
    const variedades = new Set();
    const pallets = Array.isArray(carreg?.pallets) ? carreg.pallets : [];

    pallets.forEach((p) => {
      const v = normalizarTextoUpper(p?.variedade);
      if (v) variedades.add(v);
    });

    if (variedades.size === 0 && pallets.length > 0) {
      const resultados = await Promise.allSettled(
        pallets.map((p) => api.get('/pallet-dados', { params: { pallet: p?.palletId } })),
      );

      resultados.forEach((resultado) => {
        if (resultado.status !== 'fulfilled') return;
        const res = resultado.value;
        const rows = Array.isArray(res?.data)
          ? res.data
          : (Array.isArray(res) ? res : (Array.isArray(res?.rows) ? res.rows : []));

        rows.forEach((row) => {
          const v = normalizarTextoUpper(row?.VARIEDADE || row?.variedade);
          if (v) variedades.add(v);
        });
      });
    }

    return Array.from(variedades);
  };

  const aplicarContainerInformacoes = async (carreg) => {
    if (!carreg) return;

    setContainerSelecionadoKey(obterChaveCarregamento(carreg));
    setGeneralInfoField('container', obterLabelCarregamento(carreg));
    setGeneralInfoField('oc', String(carreg.id || '').trim());

    const dataCarregamento = normalizeCarregamentoDate(carreg.dataSaida);
    if (dataCarregamento) {
      setGeneralInfoField('loading', dataCarregamento);
    }

    const cliente = extrairClienteDoApelido(carreg.apelido);
    if (cliente) {
      setGeneralInfoField('customer', cliente);
    }

    try {
      const vars = await obterVariedadesDoCarregamento(carreg);
      if (vars.length > 0) setSelectedVariedades(vars);
    } catch (error) {
      console.warn('[RE] Falha ao obter variedades da OC selecionada:', error?.message);
    }
  };

  // Atualiza um campo do pallet.
  const setPalletField = (index, field, value) => {
    setPalletData((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  // Adiciona uma linha vazia ao pallet.
  const addPalletRow = () => {
    setPalletData((current) => [...current, { pallet: '', etiqueta: 'NC', temp1: '', temp2: '' }]);
  };

  // Remove uma linha do pallet.
  const removePalletRow = (index) => {
    setPalletData((current) => current.filter((_, i) => i !== index));
  };

  // Renderiza o checklist do container.
  const renderChecklist = () => {
    return (
      <View style={st.card}>
        <View style={pgSt.headerRow}>
          <Text style={st.cardTitle}>PRIORIZAÇÃO</Text>
          <TouchableOpacity
            style={pgSt.refreshBtn}
            onPress={fetchCarregamentos}
            activeOpacity={0.7}
            disabled={carregamentosLoading}
          >
            <MaterialIcons name="refresh" size={20} color={carregamentosLoading ? '#CCC' : GREEN} />
          </TouchableOpacity>
        </View>

        {carregamentosLoading && (
          <View style={pgSt.loadingBox}>
            <ActivityIndicator size="small" color={GREEN} />
            <Text style={pgSt.loadingText}>Buscando carregamentos...</Text>
          </View>
        )}

        {!carregamentosLoading && carregamentos.length === 0 && (
          <Text style={pgSt.emptyText}>Nenhum carregamento encontrado.</Text>
        )}

        {carregamentos.map((carreg) => {
          const totalPallets = carreg.pallets.length;
          const totalCaixas = carreg.pallets.reduce((s, p) => s + (p.qtdCaixas || 0), 0);
          const dtParts = carreg.dataSaida ? carreg.dataSaida.split('T')[0] : '';

          const isLoadingThisOC = loadingOC === carreg.id;
          return (
            <TouchableOpacity
              key={carreg.id}
              style={pgSt.carregCard}
              activeOpacity={0.7}
              onPress={() => !isLoadingThisOC && openCarregamentoModal(carreg)}
              disabled={isLoadingThisOC}
            >
              <View style={pgSt.carregHeaderRow}>
                {isLoadingThisOC
                  ? <ActivityIndicator size="small" color={ORANGE} style={{ marginRight: 6 }} />
                  : <MaterialIcons name="local-shipping" size={22} color={ORANGE} />}
                <Text style={pgSt.carregApelido}>{carreg.apelido || `Carreg. ${carreg.id}`}</Text>
              </View>

              {!!carreg.container && (
                <View style={pgSt.carregInfoRow}>
                  <MaterialIcons name="inventory-2" size={14} color="#888" />
                  <Text style={pgSt.carregInfoText}>Container: {carreg.container}</Text>
                </View>
              )}

              {!!dtParts && (
                <View style={pgSt.carregInfoRow}>
                  <MaterialIcons name="calendar-today" size={14} color="#888" />
                  <Text style={pgSt.carregInfoText}>Saída: {dtParts}</Text>
                </View>
              )}

              {!!carreg.motorista && (
                <View style={pgSt.carregInfoRow}>
                  <MaterialIcons name="person" size={14} color="#888" />
                  <Text style={pgSt.carregInfoText}>Motorista: {carreg.motorista}</Text>
                </View>
              )}

              <View style={pgSt.carregBadgeRow}>
                <View style={[pgSt.badge, { backgroundColor: '#E3F2FD' }]}>
                  <Text style={[pgSt.badgeText, { color: '#1565C0' }]}>{totalPallets} pallets</Text>
                </View>
                <View style={[pgSt.badge, { backgroundColor: '#FFF3E0' }]}>
                  <Text style={[pgSt.badgeText, { color: '#E65100' }]}>{totalCaixas} caixas</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // Conteudo da subtela "Informacoes" dentro da etapa Informacoes Gerais.
  const renderGeneralInfoFields = () => (
    <View style={st.card}>
      <Text style={st.cardTitle}>Informacoes gerais</Text>

      <View style={st.field}>
        <Text style={st.fieldLabel}>Variedades</Text>
        <TouchableOpacity
          style={[st.inputBox, st.selectBox]}
          onPress={openVariedadesSelection}
          activeOpacity={0.8}
        >
          <Text style={[st.selectText, selectedVariedades.length === 0 && st.placeholderText]}>
            {selectedVariedades.length > 0 ? selectedVariedades.join(', ') : 'Selecione uma ou mais variedades'}
          </Text>
          <MaterialIcons name="expand-more" size={20} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={st.field}>
        <Text style={st.fieldLabel}>Cliente</Text>
        <TouchableOpacity
          style={[st.inputBox, st.selectBox]}
          onPress={openClienteSelection}
          activeOpacity={0.8}
        >
          <Text style={[st.selectText, !generalInfo.customer && st.placeholderText]}>
            {generalInfo.customer || 'Selecione o cliente'}
          </Text>
          <MaterialIcons name="expand-more" size={20} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={st.field}>
        <Text style={[st.fieldLabel, !generalInfo.container && { color: '#E67E22', fontWeight: '800' }]}>
          Container{!generalInfo.container ? ' *' : ''}
        </Text>
        <TouchableOpacity
          style={[
            st.inputBox,
            st.selectBox,
            !generalInfo.container && { borderColor: '#E67E22', borderWidth: 1.5, backgroundColor: '#FFF7ED' },
          ]}
          onPress={() => { if (carregamentos.length === 0 && !carregamentosLoading) fetchCarregamentos(); setShowContainerModal(true); }}
          activeOpacity={0.8}
        >
          <Text style={[st.selectText, !generalInfo.container && { color: '#D97706' }]}>
            {generalInfo.container || 'Selecione o container'}
          </Text>
          <MaterialIcons name="expand-more" size={20} color={!generalInfo.container ? '#D97706' : '#999'} />
        </TouchableOpacity>
      </View>

      <View style={st.field}>
        <Text style={st.fieldLabel}>OC</Text>
        <TextInput
          style={st.inputBox}
          placeholder="Digite a OC"
          value={generalInfo.oc}
          onChangeText={(text) => setGeneralInfoField('oc', text)}
          placeholderTextColor="#C0C0C0"
          ref={r => { inputRefs.current.oc = r; }}
          onFocus={() => scrollToInput('oc')}
        />
      </View>

      <View style={st.field}>
        <Text style={st.fieldLabel}>Carregamento</Text>
        <TouchableOpacity
          style={[st.inputBox, st.selectBox]}
          onPress={() => openDatePicker('loading')}
          activeOpacity={0.8}
        >
          <Text style={[st.selectText, !generalInfo.loading && st.placeholderText]}>
            {generalInfo.loading || 'Selecione a data'}
          </Text>
          <MaterialIcons name="calendar-today" size={18} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={st.field}>
        <Text style={st.fieldLabel}>ETD</Text>
        <TouchableOpacity
          style={[st.inputBox, st.selectBox]}
          onPress={() => openDatePicker('etd')}
          activeOpacity={0.8}
        >
          <Text style={[st.selectText, !generalInfo.etd && st.placeholderText]}>
            {generalInfo.etd || 'Selecione a data'}
          </Text>
          <MaterialIcons name="calendar-today" size={18} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={st.field}>
        <Text style={st.fieldLabel}>ETA</Text>
        <TouchableOpacity
          style={[st.inputBox, st.selectBox]}
          onPress={() => openDatePicker('eta')}
          activeOpacity={0.8}
        >
          <Text style={[st.selectText, !generalInfo.eta && st.placeholderText]}>
            {generalInfo.eta || 'Selecione a data'}
          </Text>
          <MaterialIcons name="calendar-today" size={18} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={st.field}>
        <Text style={st.fieldLabel}>Navio</Text>
        <TouchableOpacity
          style={[st.inputBox, { justifyContent: 'center', flexDirection: 'row', alignItems: 'center' }]}
          onPress={() => setShowNavioModal(true)}
          activeOpacity={0.7}
        >
          <Text style={{ flex: 1, color: generalInfo.vessel ? '#111' : '#C0C0C0', fontSize: 14 }}>
            {generalInfo.vessel || 'Selecione o navio'}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={22} color="#999" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Renderiza as subtelas internas de Informacoes Gerais:
  // Informacoes | Mangas | Container | Rascunhos
  const handleGeneralInfoTabPress = (tabKey) => {
    if (tabKey !== 'mangas') {
      setActiveMangaSectionKey(null);
    } else if (generalInfoTab === 'mangas' && activeMangaSection) {
      setActiveMangaSectionKey(null);
    }

    setGeneralInfoTab(tabKey);

    // Ao entrar nas abas de Imprimir, recarrega as fotos do servidor.
    if (containerSelecionadoKey && tabKey === 'mangas') {
      carregarFotosMangaImprimir(containerSelecionadoKey);
    }
    if (containerSelecionadoKey && tabKey === 'container') {
      carregarFotosContainerImprimir(containerSelecionadoKey);
    }
  };

  const renderGeneralInfo = () => {
    const safeIdx = Math.min(imprimirVariedadeIdx, Math.max(0, mangaSections.length - 1));
    const imprimirMangaSection = mangaSections[safeIdx] || {
      key: 'manga_imprimir',
      title: 'Maturacao',
      items: MANGA_FOTO_ITEMS.map((cfg) => ({
        key: cfg.key,
        label: cfg.label,
        photos: [],
      })),
    };
    const temVariedades = mangaSections.length > 1;
    return (
    <>
      {/* Bolinhas numeradas de navegação com fundo branco */}
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12, paddingVertical: 14, paddingHorizontal: 8, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 }}>
        <GeneralInfoStepDots currentTab={generalInfoTab} onPress={handleGeneralInfoTabPress} />
      </View>

      {generalInfoTab === 'informacoes' && renderGeneralInfoFields()}

      {generalInfoTab === 'mangas' && (
        <View style={st.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: temVariedades ? 8 : 10 }}>
            <Text style={[st.cardTitle, { marginBottom: 0 }]}>Maturacao (4 fotos)</Text>
            <TouchableOpacity
              onPress={() => containerSelecionadoKey && carregarFotosMangaImprimir(containerSelecionadoKey)}
              activeOpacity={0.7}
              disabled={!containerSelecionadoKey || imprimirMangaFotos.loading}
            >
              <MaterialIcons name="refresh" size={20} color={(!containerSelecionadoKey || imprimirMangaFotos.loading) ? '#CCC' : GREEN} />
            </TouchableOpacity>
          </View>

          {/* Seletor de variedade — aparece só quando há 2 ou mais */}
          {temVariedades && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {mangaSections.map((sec, idx) => {
                const varName = sec.title.replace(/^MANGA\s+/i, '');
                const active = idx === safeIdx;
                return (
                  <Pressable
                    key={sec.key}
                    onPress={() => setImprimirVariedadeIdx(idx)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      borderRadius: 20,
                      backgroundColor: active ? GREEN : LGREEN,
                      borderWidth: 1,
                      borderColor: active ? GREEN : '#A5D6A7',
                    }}
                  >
                    <Text style={{ color: active ? '#fff' : GREEN, fontWeight: '600', fontSize: 13 }}>
                      {varName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {imprimirMangaFotos.loading && (
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <ActivityIndicator size="small" color={GREEN} />
              <Text style={{ fontSize: 12, color: '#888', marginTop: 6 }}>Carregando fotos do servidor...</Text>
            </View>
          )}

          {(imprimirMangaSection.items || []).slice(0, 4).map((item) => {
            const allUrls = imprimirMangaFotos.data[item.key] || [];
            const serverUrls = temVariedades
              ? filtrarUrlsMangaPorVariedade(allUrls, imprimirMangaSection.key)
              : allUrls;
            return (
              <View key={`maturacao-pdf-${item.key}`}>
                <ItemCard
                  item={item}
                  onPickGallery={mangaSections[safeIdx] ? () => pickFromGallery(imprimirMangaSection, item) : null}
                  onPickCamera={mangaSections[safeIdx] ? () => pickFromCamera(imprimirMangaSection, item) : null}
                  onPreviewPhoto={(photo) =>
                    setPhotoViewer({
                      sectionKey: imprimirMangaSection.key,
                      sectionTitle: imprimirMangaSection.title,
                      itemKey: item.key,
                      itemLabel: item.label,
                      photo,
                    })
                  }
                  onDeletePhoto={mangaSections[safeIdx] ? (photo) => askDeletePhoto(imprimirMangaSection.key, item.key, photo.id) : null}
                  serverPhotos={!imprimirMangaFotos.loading ? serverUrls : []}
                  hideEmptyState
                />
              </View>
            );
          })}
        </View>
      )}

      {generalInfoTab === 'container' && (containerSection
        ? renderSection(
          {
            ...containerSection,
            items: (containerSection.items || []).filter(
              (item) => !CONTAINER_FIELDS_OCULTAR_NO_IMPRIMIR.includes(item.key),
            ),
          },
          null,
          {
          serverFotosData: imprimirContainerFotos.data,
          serverFotosLoading: imprimirContainerFotos.loading,
          onRefreshServerFotos: containerSelecionadoKey
            ? () => carregarFotosContainerImprimir(containerSelecionadoKey)
            : null,
          },
        )
        : null)}
      {generalInfoTab === 'rascunhos' && renderDraftIdentification()}
    </>
    );
  };

  // Renderiza a etapa de identificacao e selecao de rascunhos.
  const renderDraftIdentification = () => (
    <>
      <View style={st.card}>
        <Text style={st.cardTitle}>Rascunhos salvos (15 dias)</Text>

        {draftList.length === 0 ? (
          <View style={st.emptyDraftBox}>
            <MaterialIcons name="drafts" size={20} color="#999" />
            <Text style={st.emptyDraftText}>Nenhum rascunho salvo ainda.</Text>
          </View>
        ) : (
          draftList.map((draft) => {
            const infoCount = GENERAL_INFO_KEYS.filter((key) => (draft.generalInfo?.[key] || '').trim().length > 0).length;
            const photoCount = countPhotosFromSections(draft.sections);
            const isActive = draft.id === currentDraftId;

            return (
              <View
                key={draft.id}
                style={[st.draftItem, isActive && st.draftItemActive]}
              >
                <TouchableOpacity
                  style={st.draftInfoBtn}
                  onPress={() => openDraft(draft, { goToStepZero: true })}
                  activeOpacity={0.85}
                >
                  <Text style={st.draftTitle}>{buildDraftTitle(draft)}</Text>
                  <Text style={st.draftMetaLine}>
                    {`Atualizado ${formatRecordDateTime(draft.updatedAt)} | Infos ${infoCount}/${GENERAL_INFO_KEYS.length} | Fotos ${photoCount}`}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={st.draftDeleteBtn}
                  onPress={() => askDeleteDraft(draft)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="delete-outline" size={20} color="#E53935" />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>
    </>
  );

  const renderMangaCadastroFotosContent = () => {
    if (mangaFotoModalIdx === null || !mangaCadastros[mangaFotoModalIdx]) {
      return (
        <View style={[st.emptyDraftBox, { margin: 16 }]}>
          <MaterialIcons name="photo-library" size={20} color="#999" />
          <Text style={st.emptyDraftText}>Selecione uma manga para abrir a aba Fotos.</Text>
        </View>
      );
    }

    const cad = mangaCadastros[mangaFotoModalIdx];
    const cadIdx = mangaFotoModalIdx;

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <View style={pgSt.modalInfoBar}>
          <Text style={pgSt.modalTitle}>{cad.fazenda} | Fotos</Text>
          <Text style={pgSt.modalSubtitle}>Variedade: {cad.variedade} | Controle: {cad.controle}</Text>
        </View>

        {MANGA_FOTO_ITEMS.map((item) => {
          const fotos = cad.fotos[item.key] || [];
          return (
            <View key={item.key} style={pgSt.campoFotoSection}>
              <View style={pgSt.campoFotoHeader}>
                <Text style={pgSt.campoFotoLabel}>{item.label}</Text>
                {fotos.length > 0 && (
                  <View style={pgSt.campoFotoBadge}>
                    <Text style={pgSt.campoFotoBadgeText}>{fotos.length}</Text>
                  </View>
                )}
              </View>

              <View style={pgSt.fotoActionRow}>
                <TouchableOpacity style={pgSt.fotoActionBtnSmall} onPress={() => pickMangaCadFotoCamera(cadIdx, item.key)} activeOpacity={0.7}>
                  <MaterialIcons name="camera-alt" size={18} color="#FFF" />
                  <Text style={pgSt.fotoActionTextSmall}>Câmera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={pgSt.fotoActionBtnSmall} onPress={() => pickMangaCadFotoGaleria(cadIdx, item.key)} activeOpacity={0.7}>
                  <MaterialIcons name="photo-library" size={18} color="#FFF" />
                  <Text style={pgSt.fotoActionTextSmall}>Galeria</Text>
                </TouchableOpacity>
              </View>

              {fotos.length > 0 && (
                <View style={pgSt.fotoGrid}>
                  {fotos.map((uri, fIdx) => (
                    <View key={`mcf-${item.key}-${fIdx}`} style={pgSt.fotoThumbWrap}>
                      <Image source={{ uri }} style={pgSt.fotoThumb} />
                      <TouchableOpacity style={pgSt.fotoRemoveBtn} onPress={() => removeMangaCadFoto(cadIdx, item.key, fIdx)} activeOpacity={0.7}>
                        <MaterialIcons name="close" size={16} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  // Trata o botao voltar no cabecalho respeitando validacoes pendentes.
  const handleHeaderBack = () => {
    if (step === 2 && activeMangaSection) {
      setActiveMangaSectionKey(null);
      return;
    }
    navigation.goBack();
  };

  // Navegacao por telas no topo.
  const handleStepTabPress = (targetStep) => {
    const nextStep = Math.max(0, Math.min(TOP_FLOW_LAST_INDEX, targetStep));

    if (nextStep !== 2) {
      setActiveMangaSectionKey(null);
    }

    if (nextStep === 2 && step === 2 && activeMangaSection) {
      setActiveMangaSectionKey(null);
      return;
    }

    setStep(nextStep);
  };

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={st.header}>
        <TouchableOpacity onPress={handleHeaderBack} style={st.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={GREEN} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={require('../../../assets/logoagrodann.png')} style={st.logo} resizeMode="contain" />
          <View style={{ width: 1, height: 18, backgroundColor: '#2E7D32' }} />
          <Image source={require('../../../../assets/CQLETRA.png')} style={st.logoCQ} resizeMode="contain" />
        </View>
        <View style={{ width: 40 }} />
      </View>

      {resumeDraftPrompt ? (
        <View style={st.resumeTopBannerWrap}>
          <View style={st.resumeTopBanner}>
            <Text style={st.resumeTopTitle}>Formulario anterior encontrado</Text>
            <Text style={st.resumeTopMessage}>
              Toque para retornar o anterior ou abrir um novo formulario.
            </Text>
            <View style={st.resumeTopActions}>
              <TouchableOpacity style={st.resumeTopPrimaryBtn} onPress={handleResumePreviousDraft} activeOpacity={0.85}>
                <Text style={st.resumeTopPrimaryText}>Retornar anterior</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.resumeTopSecondaryBtn} onPress={handleOpenNewDraft} activeOpacity={0.85}>
                <Text style={st.resumeTopSecondaryText}>Abrir novo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      <View style={st.stepWrap}>
        <StepTabs current={step} onPress={handleStepTabPress} variety={draftMeta.variety} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={[st.scroll, { paddingBottom: 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 && renderGeneralInfo()}
          {step === 1 && renderChecklist()}
          {step === 2 && (activeMangaSection ? renderMangaSectionPage(activeMangaSection) : renderMangasStep())}
        </ScrollView>
      </KeyboardAvoidingView>


      <TouchableOpacity
        style={[st.fabTest, (isGeneratingPdf || isTestingPdf) && { opacity: 0.6 }]}
        onPress={gerarPdfTeste}
        activeOpacity={0.85}
        disabled={isGeneratingPdf || isTestingPdf}
      >
        <MaterialIcons name="picture-as-pdf" size={20} color="#FFFFFF" />
        <Text style={st.fabTestText}>{isTestingPdf ? 'Gerando...' : 'Teste PDF'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[st.fab, step === TOP_FLOW_LAST_INDEX && { backgroundColor: ORANGE }, (isGeneratingPdf || isTestingPdf) && { opacity: 0.6 }]}
        onPress={handleMainAction}
        activeOpacity={0.85}
        disabled={isGeneratingPdf || isTestingPdf}
      >
        {isGeneratingPdf ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <MaterialIcons
            name={step === TOP_FLOW_LAST_INDEX ? 'send' : 'arrow-forward'}
            size={20}
            color="#FFFFFF"
          />
        )}
        <Text style={st.fabText}>
          {isGeneratingPdf
            ? 'Enviando...'
            : isTestingPdf
              ? 'Gerando...'
            : step === TOP_FLOW_LAST_INDEX
              ? 'Enviar'
              : 'Avançar'}
        </Text>
      </TouchableOpacity>

      {/* Modal Galeria de Fotos por Fazenda */}
      <Modal
        visible={showGaleriaModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowGaleriaModal(false); setGaleriaFazenda(null); setGaleriaFotoViewer(null); }}
      >
        <View style={st.overlay}>
          <View style={[st.recordsModalBox, { maxHeight: '88%' }]}>
            <View style={st.recordsModalHeader}>
              {galeriaFazenda ? (
                <TouchableOpacity onPress={() => { setGaleriaFazenda(null); setGaleriaFotoViewer(null); }} style={{ marginRight: 6 }}>
                  <MaterialIcons name="arrow-back" size={22} color={GREEN} />
                </TouchableOpacity>
              ) : null}
              <Text style={[st.recordsModalTitle, { flex: 1 }]}>
                {galeriaFazenda ? galeriaFazenda.fazenda : 'Galeria de Fotos'}
              </Text>
              <TouchableOpacity onPress={() => { setShowGaleriaModal(false); setGaleriaFazenda(null); setGaleriaFotoViewer(null); }}>
                <MaterialIcons name="close" size={22} color="#555" />
              </TouchableOpacity>
            </View>

            {!galeriaFazenda ? (
              // Lista de fazendas
              (() => {
                const fazendas = buildGaleriaFazendas();
                if (!fazendas.length) {
                  return (
                    <View style={st.recordEmptyBox}>
                      <MaterialIcons name="photo-library" size={32} color="#CCC" />
                      <Text style={[st.recordEmptyText, { marginTop: 8 }]}>Nenhuma foto encontrada nos rascunhos.</Text>
                    </View>
                  );
                }
                return (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {fazendas.map((f) => (
                      <TouchableOpacity
                        key={f.fazenda}
                        style={st.galeriaFazendaItem}
                        onPress={() => setGaleriaFazenda(f)}
                        activeOpacity={0.8}
                      >
                        <View style={st.galeriaFazendaIcon}>
                          <MaterialIcons name="folder" size={28} color={GREEN} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.galeriaFazendaName}>{f.fazenda}</Text>
                          {f.variedade ? <Text style={st.galeriaFazendaMeta}>{f.variedade}</Text> : null}
                          <Text style={st.galeriaFazendaMeta}>{f.fotos.length} foto(s)</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={22} color="#AAA" />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                );
              })()
            ) : (
              // Grade de fotos da fazenda selecionada
              <ScrollView showsVerticalScrollIndicator={false}>
                {galeriaFotoViewer ? (
                  <View>
                    <TouchableOpacity onPress={() => setGaleriaFotoViewer(null)} style={{ marginBottom: 10 }}>
                      <MaterialIcons name="arrow-back" size={20} color={GREEN} />
                    </TouchableOpacity>
                    <Image
                      source={{ uri: galeriaFotoViewer.uri }}
                      style={{ width: '100%', height: 320, borderRadius: 10 }}
                      resizeMode="contain"
                    />
                    <Text style={[st.galeriaFazendaMeta, { marginTop: 6, textAlign: 'center' }]}>
                      {galeriaFotoViewer.sectionTitle} — {galeriaFotoViewer.itemLabel}
                    </Text>
                  </View>
                ) : (
                  <View style={st.galeriaGrid}>
                    {galeriaFazenda.fotos.map((foto, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={st.galeriaThumb}
                        onPress={() => setGaleriaFotoViewer(foto)}
                        activeOpacity={0.8}
                      >
                        <Image source={{ uri: foto.uri }} style={{ width: '100%', height: '100%', borderRadius: 8 }} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <PhotoReviewModal
        visible={Boolean(photoViewer)}
        imageUri={photoViewer?.photo?.uri || null}
        title={photoViewer?.itemLabel || 'Foto'}
        subtitle={photoViewer?.sectionTitle || ''}
        counterLabel="Foto salva neste item"
        confirmLabel="Excluir foto"
        secondaryLabel="Fechar"
        confirmDanger
        onConfirm={() => {
          if (!photoViewer) return;
          askDeletePhoto(photoViewer.sectionKey, photoViewer.itemKey, photoViewer.photo.id);
        }}
        onSecondary={() => setPhotoViewer(null)}
        onClose={() => setPhotoViewer(null)}
      />

      <Modal
        visible={showCadastrarFotosModal}
        animationType="slide"
        onRequestClose={() => { if (!cadastrarFotosLoading) { setShowCadastrarFotosModal(false); setCadastrarFotosList([]); } }}
      >
        <View style={cfSt.fullScreen}>
          <View style={st.header}>
            <TouchableOpacity
              onPress={() => { if (!cadastrarFotosLoading) { setShowCadastrarFotosModal(false); setCadastrarFotosList([]); } }}
              style={st.backBtn}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={24} color={GREEN} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={require('../../../assets/logoagrodann.png')} style={st.logo} resizeMode="contain" />
          <View style={{ width: 1, height: 18, backgroundColor: '#2E7D32' }} />
          <Image source={require('../../../../assets/CQLETRA.png')} style={st.logoCQ} resizeMode="contain" />
        </View>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={cfSt.scrollBody} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
            <View style={st.card}>
              <Text style={st.cardTitle}>Cadastrar fotos ao servidor</Text>
              {/* FAZENDA */}
              <View style={st.field}>
                <Text style={st.fieldLabel}>Fazenda</Text>
                <TouchableOpacity
                  style={[st.inputBox, st.selectBox]}
                  onPress={() => { if (!cadastrarFotosLoading) setCfShowFazendaPicker(true); }}
                  activeOpacity={0.8}
                >
                  <Text style={[st.selectText, !cadastrarFotosForm.fazenda && st.placeholderText]}>
                    {cadastrarFotosForm.fazenda || 'Selecione a fazenda'}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={22} color="#999" />
                </TouchableOpacity>
              </View>

              {/* VARIEDADE */}
              <View style={st.field}>
                <Text style={st.fieldLabel}>Variedade</Text>
                <TouchableOpacity
                  style={[st.inputBox, st.selectBox, !cadastrarFotosForm.fazenda && { opacity: 0.45 }]}
                  onPress={() => { if (!cadastrarFotosLoading && cadastrarFotosForm.fazenda) setCfShowVariedadePicker(true); }}
                  activeOpacity={0.8}
                >
                  <Text style={[st.selectText, !cadastrarFotosForm.variedade && st.placeholderText]}>
                    {cadastrarFotosForm.variedade || 'Selecione a variedade'}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={22} color="#999" />
                </TouchableOpacity>
              </View>

              {/* TALHÃO */}
              <View style={st.field}>
                <Text style={st.fieldLabel}>Talhão</Text>
                <TouchableOpacity
                  style={[st.inputBox, st.selectBox, !cadastrarFotosForm.fazenda && { opacity: 0.45 }]}
                  onPress={() => { if (!cadastrarFotosLoading && cadastrarFotosForm.fazenda) setCfShowTalhaoPicker(true); }}
                  activeOpacity={0.8}
                >
                  <Text style={[st.selectText, !cadastrarFotosForm.talhao && st.placeholderText]}>
                    {cadastrarFotosForm.talhao || 'Talhão (opcional)'}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={22} color="#999" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={cfSt.actionRow}>
              <TouchableOpacity style={cfSt.actionBtn} onPress={pickFotoServidorCamera} disabled={cadastrarFotosLoading} activeOpacity={0.7}>
                <MaterialIcons name="camera-alt" size={28} color={GREEN} />
                <Text style={cfSt.actionBtnText}>Tirar foto</Text>
              </TouchableOpacity>
              <TouchableOpacity style={cfSt.actionBtn} onPress={pickFotosServidorGaleria} disabled={cadastrarFotosLoading} activeOpacity={0.7}>
                <MaterialIcons name="photo-library" size={28} color={GREEN} />
                <Text style={cfSt.actionBtnText}>Galeria</Text>
              </TouchableOpacity>
            </View>

            {cadastrarFotosList.length > 0 && (
              <View style={st.card}>
                <Text style={st.cardTitle}>{cadastrarFotosList.length} foto(s) selecionada(s)</Text>
                <ScrollView horizontal={false} style={{ maxHeight: 340 }} nestedScrollEnabled showsVerticalScrollIndicator>
                  <View style={cfSt.photoGrid}>
                    {cadastrarFotosList.map((uri, idx) => (
                      <View key={`cf-${idx}`} style={cfSt.photoThumbWrap}>
                        <Image source={{ uri }} style={cfSt.photoThumb} />
                        <TouchableOpacity style={cfSt.photoRemoveBtn} onPress={() => removeFotoServidor(idx)} activeOpacity={0.7}>
                          <MaterialIcons name="close" size={14} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </ScrollView>

          <View style={cfSt.bottomBar}>
            <TouchableOpacity
              style={[cfSt.uploadBtn, (cadastrarFotosLoading || !cadastrarFotosList.length) && { opacity: 0.5 }]}
              onPress={handleCadastrarFotosServidor}
              disabled={cadastrarFotosLoading || !cadastrarFotosList.length}
              activeOpacity={0.7}
            >
              {cadastrarFotosLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MaterialIcons name="cloud-upload" size={22} color="#FFFFFF" />
              )}
              <Text style={cfSt.uploadBtnText}>
                {cadastrarFotosLoading ? 'Enviando...' : `Enviar ${cadastrarFotosList.length} foto(s)`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Fazenda */}
      <Modal visible={cfShowFazendaPicker} transparent animationType="fade" onRequestClose={() => setCfShowFazendaPicker(false)}>
        <Pressable style={st.overlay} onPress={() => setCfShowFazendaPicker(false)}>
          <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>Selecionar fazenda</Text>
              <TouchableOpacity style={st.closeCircle} onPress={() => setCfShowFazendaPicker(false)}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {cfFazendas.length === 0
                ? <View style={st.emptyDraftBox}><Text style={st.emptyDraftText}>Nenhuma fazenda encontrada</Text></View>
                : cfFazendas.map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[st.varOption, cadastrarFotosForm.fazenda === f && st.varOptionActive]}
                      onPress={() => cfSelecionarFazenda(f)}
                      activeOpacity={0.85}
                    >
                      <Text style={[st.varOptionText, cadastrarFotosForm.fazenda === f && st.varOptionTextActive]}>{f}</Text>
                      {cadastrarFotosForm.fazenda === f && <MaterialIcons name="check" size={18} color={GREEN} />}
                    </TouchableOpacity>
                  ))
              }
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal Variedade */}
      <Modal visible={cfShowVariedadePicker} transparent animationType="fade" onRequestClose={() => setCfShowVariedadePicker(false)}>
        <Pressable style={st.overlay} onPress={() => setCfShowVariedadePicker(false)}>
          <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>Selecionar variedade</Text>
              <TouchableOpacity style={st.closeCircle} onPress={() => setCfShowVariedadePicker(false)}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {cfVariedades.length === 0
                ? <View style={st.emptyDraftBox}><Text style={st.emptyDraftText}>Nenhuma variedade encontrada</Text></View>
                : cfVariedades.map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[st.varOption, cadastrarFotosForm.variedade === v && st.varOptionActive]}
                      onPress={() => cfSelecionarVariedade(v)}
                      activeOpacity={0.85}
                    >
                      <Text style={[st.varOptionText, cadastrarFotosForm.variedade === v && st.varOptionTextActive]}>{v}</Text>
                      {cadastrarFotosForm.variedade === v && <MaterialIcons name="check" size={18} color={GREEN} />}
                    </TouchableOpacity>
                  ))
              }
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal Talhão */}
      <Modal visible={cfShowTalhaoPicker} transparent animationType="fade" onRequestClose={() => setCfShowTalhaoPicker(false)}>
        <Pressable style={st.overlay} onPress={() => setCfShowTalhaoPicker(false)}>
          <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>Selecionar talhão</Text>
              <TouchableOpacity style={st.closeCircle} onPress={() => setCfShowTalhaoPicker(false)}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {cfTalhoesFiltrados.length === 0
                ? <View style={st.emptyDraftBox}><Text style={st.emptyDraftText}>Nenhum talhão encontrado</Text></View>
                : cfTalhoesFiltrados.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[st.varOption, cadastrarFotosForm.talhao === t && st.varOptionActive]}
                      onPress={() => cfSelecionarTalhao(t)}
                      activeOpacity={0.85}
                    >
                      <Text style={[st.varOptionText, cadastrarFotosForm.talhao === t && st.varOptionTextActive]}>{t}</Text>
                      {cadastrarFotosForm.talhao === t && <MaterialIcons name="check" size={18} color={GREEN} />}
                    </TouchableOpacity>
                  ))
              }
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(datePickerField)}
        transparent
        animationType="fade"
        onRequestClose={closeDatePicker}
      >
        <Pressable style={st.overlay} onPress={closeDatePicker}>
          <Pressable style={st.dateModalBox} onPress={(event) => event.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>
                {`Selecionar ${DATE_FIELD_LABELS[datePickerField] || 'data'}`}
              </Text>
              <TouchableOpacity style={st.closeCircle} onPress={closeDatePicker}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={st.datePickerWrap}>
              <CustomCalendar value={datePickerTemp} onChange={setDatePickerTemp} />
            </View>

            <View style={st.dateModalActions}>
              <TouchableOpacity style={st.dateActionCancel} onPress={closeDatePicker} activeOpacity={0.85}>
                <Text style={st.dateActionCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.dateActionConfirm} onPress={confirmDatePicker} activeOpacity={0.85}>
                <Text style={st.dateActionConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showVarModal} transparent animationType="fade" onRequestClose={closeVariedadesSelection}>
        <Pressable style={st.overlay} onPress={closeVariedadesSelection}>
          <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>Variedades</Text>
              <TouchableOpacity style={st.closeCircle} onPress={closeVariedadesSelection}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={st.clienteSearchInput}
              placeholder="Buscar variedade..."
              placeholderTextColor="#C0C0C0"
              value={variedadeSearch}
              onChangeText={setVariedadeSearch}
            />
            <ScrollView showsVerticalScrollIndicator={false}>
              {filteredVariedades.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[st.varOption, tempVariedades.includes(v) && st.varOptionActive]}
                  onPress={() => toggleTempVariedade(v)}
                  activeOpacity={0.85}
                >
                  <Text style={[st.varOptionText, tempVariedades.includes(v) && st.varOptionTextActive]}>{v}</Text>
                  {tempVariedades.includes(v) && <MaterialIcons name="check" size={18} color={GREEN} />}
                </TouchableOpacity>
              ))}
              {filteredVariedades.length === 0 && (
                <View style={st.emptyDraftBox}>
                  <Text style={st.emptyDraftText}>Nenhuma variedade encontrada</Text>
                </View>
              )}
            </ScrollView>
            <View style={st.clienteRegisterWrap}>
              <TouchableOpacity style={st.clienteRegisterBtn} onPress={openCreateVariedadeModal} activeOpacity={0.85}>
                <MaterialIcons name="add-circle-outline" size={18} color={ORANGE} />
                <Text style={st.clienteRegisterText}>Cadastrar nova variedade</Text>
              </TouchableOpacity>
            </View>
            <View style={st.varModalActions}>
              <TouchableOpacity style={st.varModalCancelBtn} onPress={closeVariedadesSelection} activeOpacity={0.85}>
                <Text style={st.varModalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.varModalOkBtn} onPress={applyVariedadesSelection} activeOpacity={0.85}>
                <Text style={st.varModalOkText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showCreateVariedadeModal}
        transparent
        animationType="fade"
        onRequestClose={closeCreateVariedadeModal}
      >
        <Pressable style={st.overlay} onPress={closeCreateVariedadeModal}>
          <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>Cadastrar nova variedade</Text>
              <TouchableOpacity style={st.closeCircle} onPress={closeCreateVariedadeModal}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={st.clienteFormInput}
              placeholder="Nome da variedade"
              placeholderTextColor="#B0B0B0"
              value={newVariedadeName}
              onChangeText={setNewVariedadeName}
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={addVariedadeOption}
              returnKeyType="done"
            />

            <View style={st.varModalActions}>
              <TouchableOpacity
                style={[st.varModalCancelBtn, isSavingVariedade && { opacity: 0.6 }]}
                onPress={closeCreateVariedadeModal}
                activeOpacity={0.85}
                disabled={isSavingVariedade}
              >
                <Text style={st.varModalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.varModalOkBtn, isSavingVariedade && { opacity: 0.6 }]}
                onPress={addVariedadeOption}
                activeOpacity={0.85}
                disabled={isSavingVariedade}
              >
                <Text style={st.varModalOkText}>{isSavingVariedade ? 'Salvando...' : 'Cadastrar'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showNavioModal}
        transparent
        animationType="fade"
        onRequestClose={closeNavioModal}
      >
        <Pressable style={st.overlay} onPress={closeNavioModal}>
          <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>Navios</Text>
              <TouchableOpacity style={st.closeCircle} onPress={closeNavioModal}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={st.clienteSearchInput}
              placeholder="Pesquisar navio..."
              placeholderTextColor="#C0C0C0"
              value={navioSearch}
              onChangeText={setNavioSearch}
            />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {naviosList
                .filter((n) => n.toLowerCase().includes(navioSearch.toLowerCase()))
                .map((navio) => (
                  <TouchableOpacity
                    key={navio}
                    style={[st.varOption, generalInfo.vessel === navio && st.varOptionActive]}
                    onPress={() => { setGeneralInfoField('vessel', navio); closeNavioModal(); }}
                    activeOpacity={0.85}
                  >
                    <Text style={[st.varOptionText, generalInfo.vessel === navio && st.varOptionTextActive]}>{navio}</Text>
                    {generalInfo.vessel === navio && <MaterialIcons name="check" size={18} color={GREEN} />}
                  </TouchableOpacity>
                ))}
              {naviosList.filter((n) => n.toLowerCase().includes(navioSearch.toLowerCase())).length === 0 && (
                <View style={st.emptyDraftBox}>
                  <Text style={st.emptyDraftText}>Nenhum navio encontrado</Text>
                </View>
              )}
            </ScrollView>
            <View style={st.clienteRegisterWrap}>
              <TouchableOpacity style={st.clienteRegisterBtn} onPress={openCreateNavioModal} activeOpacity={0.85}>
                <MaterialIcons name="add-circle-outline" size={18} color={ORANGE} />
                <Text style={st.clienteRegisterText}>Cadastrar navio</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showCreateNavioModal}
        transparent
        animationType="fade"
        onRequestClose={closeCreateNavioModal}
      >
        <Pressable style={st.overlay} onPress={closeCreateNavioModal}>
          <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>Cadastrar navio</Text>
              <TouchableOpacity style={st.closeCircle} onPress={closeCreateNavioModal}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={st.clienteFormInput}
              placeholder="Nome do navio"
              placeholderTextColor="#B0B0B0"
              value={newNavioName}
              onChangeText={setNewNavioName}
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={addNavioOption}
              returnKeyType="done"
            />
            <View style={st.varModalActions}>
              <TouchableOpacity
                style={[st.varModalCancelBtn, isSavingNavio && { opacity: 0.6 }]}
                onPress={closeCreateNavioModal}
                activeOpacity={0.85}
                disabled={isSavingNavio}
              >
                <Text style={st.varModalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.varModalOkBtn, isSavingNavio && { opacity: 0.6 }]}
                onPress={addNavioOption}
                activeOpacity={0.85}
                disabled={isSavingNavio}
              >
                <Text style={st.varModalOkText}>{isSavingNavio ? 'Salvando...' : 'Cadastrar'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showClienteModal}
        transparent
        animationType="fade"
        onRequestClose={closeClienteSelection}
      >
        <Pressable style={st.overlay} onPress={closeClienteSelection}>
          <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>Clientes</Text>
              <TouchableOpacity style={st.closeCircle} onPress={closeClienteSelection}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={st.clienteSearchInput}
              placeholder="Pesquisar cliente..."
              placeholderTextColor="#C0C0C0"
              value={clienteSearch}
              onChangeText={setClienteSearch}
            />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {filteredClientes.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[st.varOption, generalInfo.customer === c.cliente && st.varOptionActive]}
                    onPress={() => {
                      setGeneralInfoField('customer', c.cliente);
                      closeClienteSelection();
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[st.varOptionText, generalInfo.customer === c.cliente && st.varOptionTextActive]}>{c.cliente}</Text>
                      {c.pais ? <Text style={st.clientePaisText}>{c.pais}</Text> : null}
                    </View>
                    {generalInfo.customer === c.cliente && <MaterialIcons name="check" size={18} color={GREEN} />}
                  </TouchableOpacity>
                ))}
              {filteredClientes.length === 0 && (
                <View style={st.emptyDraftBox}>
                  <Text style={st.emptyDraftText}>Nenhum cliente encontrado</Text>
                </View>
              )}
            </ScrollView>
            <View style={st.clienteRegisterWrap}>
              <TouchableOpacity style={st.clienteRegisterBtn} onPress={openCreateClienteModal} activeOpacity={0.85}>
                <MaterialIcons name="add-circle-outline" size={18} color={ORANGE} />
                <Text style={st.clienteRegisterText}>Cadastrar cliente</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showCreateClienteModal}
        transparent
        animationType="fade"
        onRequestClose={closeCreateClienteModal}
      >
        <Pressable style={st.overlay} onPress={closeCreateClienteModal}>
          <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>Cadastrar cliente</Text>
              <TouchableOpacity style={st.closeCircle} onPress={closeCreateClienteModal}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={st.clienteFormInput}
              placeholder="Nome do cliente"
              placeholderTextColor="#B0B0B0"
              value={newClienteName}
              onChangeText={setNewClienteName}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TextInput
              style={[st.clienteFormInput, { marginTop: 10 }]}
              placeholder="Pais"
              placeholderTextColor="#B0B0B0"
              value={newClientePais}
              onChangeText={setNewClientePais}
              autoCapitalize="words"
              autoCorrect={false}
              onSubmitEditing={addClienteOption}
              returnKeyType="done"
            />

            <View style={st.varModalActions}>
              <TouchableOpacity
                style={[st.varModalCancelBtn, isSavingCliente && { opacity: 0.6 }]}
                onPress={closeCreateClienteModal}
                activeOpacity={0.85}
                disabled={isSavingCliente}
              >
                <Text style={st.varModalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.varModalOkBtn, isSavingCliente && { opacity: 0.6 }]}
                onPress={addClienteOption}
                activeOpacity={0.85}
                disabled={isSavingCliente}
              >
                <Text style={st.varModalOkText}>{isSavingCliente ? 'Salvando...' : 'Cadastrar'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── MODAL SELECIONAR CONTAINER ── */}
      <Modal
        visible={showContainerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowContainerModal(false)}
      >
        <Pressable style={st.overlay} onPress={() => setShowContainerModal(false)}>
          <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>Selecionar Container</Text>
              <TouchableOpacity style={st.closeCircle} onPress={() => setShowContainerModal(false)}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {carregamentosLoading && (
                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <ActivityIndicator size="small" color={GREEN} />
                </View>
              )}
              {!carregamentosLoading && carregamentos.map((carreg) => {
                const vars = [...new Set((carreg.pallets || []).map((p) => p.variedade).filter(Boolean))];
                const chaveCarreg = obterChaveCarregamento(carreg);
                const isSelected = containerSelecionadoKey === chaveCarreg;
                return (
                  <TouchableOpacity
                    key={carreg.id}
                    style={[st.varOption, isSelected && st.varOptionActive]}
                    onPress={() => {
                      setShowContainerModal(false);
                      // Fecha o modal imediatamente e processa os dados em seguida.
                      setTimeout(() => { void aplicarContainerInformacoes(carreg); }, 0);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[st.varOptionText, isSelected && st.varOptionTextActive]}>
                        {obterLabelCarregamento(carreg)}
                      </Text>
                      {!!carreg.container && !isContainerPlaceholder(carreg.container) && !!carreg.apelido && (
                        <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{carreg.apelido}</Text>
                      )}
                      {vars.length > 0 && (
                        <Text style={{ fontSize: 12, color: GREEN, marginTop: 2 }}>{vars.join(', ')}</Text>
                      )}
                    </View>
                    {isSelected && <MaterialIcons name="check" size={18} color={GREEN} />}
                  </TouchableOpacity>
                );
              })}
              {!carregamentosLoading && carregamentos.length === 0 && (
                <View style={st.emptyDraftBox}>
                  <Text style={st.emptyDraftText}>Nenhum container encontrado</Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── TELA CADASTRAR MANGA (full-screen) ── */}
      <Modal
        visible={showMangaCadastroModal}
        transparent={false}
        animationType="slide"
        onRequestClose={() => {
          setShowMangaCadastroModal(false);
          setMangaCadastroTab('adicionar');
          setMangaFotoModalIdx(null);
        }}
      >
        <View style={{ flex: 1, backgroundColor: '#F2F2F2' }}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
          {/* Safe area spacer — igual ao modal de carregamento */}
          <View style={{ height: Platform.OS === 'android' ? (StatusBar.currentHeight || 30) : 44, backgroundColor: '#FFFFFF' }} />
          {/* Header */}
          <View style={st.header}>
            <TouchableOpacity
              onPress={() => {
                setShowMangaCadastroModal(false);
                setMangaCadastroTab('adicionar');
                setMangaFotoModalIdx(null);
              }}
              style={st.backBtn}
            >
              <MaterialIcons name="arrow-back" size={24} color={GREEN} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={require('../../../assets/logoagrodann.png')} style={st.logo} resizeMode="contain" />
          <View style={{ width: 1, height: 18, backgroundColor: '#2E7D32' }} />
          <Image source={require('../../../../assets/CQLETRA.png')} style={st.logoCQ} resizeMode="contain" />
        </View>
            <View style={{ width: 40 }} />
          </View>

          <View style={pgSt.mTabRow}>
            <TouchableOpacity
              style={[pgSt.mTabBtn, mangaCadastroTab === 'adicionar' && pgSt.mTabBtnActive]}
              onPress={() => setMangaCadastroTab('adicionar')}
              activeOpacity={0.7}
            >
              <Text style={[pgSt.mTabText, mangaCadastroTab === 'adicionar' && pgSt.mTabTextActive]}>Adicionar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pgSt.mTabBtn, mangaCadastroTab === 'fotos' && pgSt.mTabBtnActive]}
              onPress={() => setMangaCadastroTab('fotos')}
              activeOpacity={0.7}
            >
              <Text style={[pgSt.mTabText, mangaCadastroTab === 'fotos' && pgSt.mTabTextActive]}>Fotos</Text>
            </TouchableOpacity>
          </View>

          {mangaCadastroTab === 'adicionar' ? (
          <ScrollView style={cfSt.scrollBody} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
            <View style={st.card}>
              <Text style={st.cardTitle}>Adicionar Manga</Text>

              {/* FAZENDA */}
              <View style={st.field}>
                <Text style={st.fieldLabel}>Fazenda</Text>
                <TouchableOpacity
                  style={[st.inputBox, st.selectBox]}
                  onPress={() => setMangaFormShowFazendaPicker(true)}
                  activeOpacity={0.8}
                >
                  <Text style={[st.selectText, !mangaFormFazenda && st.placeholderText]}>
                    {mangaFormFazenda || 'Selecione a fazenda'}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={22} color="#999" />
                </TouchableOpacity>
              </View>

              {/* VARIEDADE */}
              <View style={st.field}>
                <Text style={st.fieldLabel}>Variedade</Text>
                <TouchableOpacity
                  style={[st.inputBox, st.selectBox, !mangaFormFazenda && { opacity: 0.45 }]}
                  onPress={() => { if (mangaFormFazenda) setMangaFormShowVariedadePicker(true); }}
                  activeOpacity={0.8}
                >
                  <Text style={[st.selectText, !mangaFormVariedade && st.placeholderText]}>
                    {mangaFormVariedade || 'Selecione a variedade'}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={22} color="#999" />
                </TouchableOpacity>
              </View>

              {/* CONTROLE */}
              <View style={st.field}>
                <Text style={st.fieldLabel}>Controle</Text>
                <TextInput
                  style={st.inputBox}
                  placeholder="Ex: 526"
                  value={mangaFormControle}
                  onChangeText={setMangaFormControle}
                  placeholderTextColor="#C0C0C0"
                  keyboardType="default"
                />
              </View>
            </View>
          </ScrollView>
          ) : renderMangaCadastroFotosContent()}

          {/* FAB — confirmar/enviar */}
          <TouchableOpacity
            style={[pgSt.mFab, mangaCadastroSending && { opacity: 0.6 }]}
            onPress={handleMangaCadastroAction}
            activeOpacity={0.85}
            disabled={mangaCadastroSending}
          >
            {mangaCadastroSending
              ? <ActivityIndicator size="small" color="#FFF" />
              : <MaterialIcons name="check" size={30} color="#FFF" />
            }
          </TouchableOpacity>
        </View>

        {/* Picker Fazenda */}
        <Modal visible={mangaFormShowFazendaPicker} transparent animationType="fade" onRequestClose={() => setMangaFormShowFazendaPicker(false)}>
          <Pressable style={st.overlay} onPress={() => setMangaFormShowFazendaPicker(false)}>
            <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
              <View style={st.varModalHeader}>
                <Text style={st.varModalTitle}>Selecionar fazenda</Text>
                <TouchableOpacity style={st.closeCircle} onPress={() => setMangaFormShowFazendaPicker(false)}>
                  <MaterialIcons name="close" size={20} color="#333" />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {mangaFormFazendaList.length === 0
                  ? <View style={st.emptyDraftBox}><Text style={st.emptyDraftText}>Nenhuma fazenda encontrada</Text></View>
                  : mangaFormFazendaList.map((f) => (
                      <TouchableOpacity
                        key={f}
                        style={[st.varOption, mangaFormFazenda === f && st.varOptionActive]}
                        onPress={() => { mangaFormSelecionarFazenda(f); setMangaFormShowFazendaPicker(false); }}
                        activeOpacity={0.85}
                      >
                        <Text style={[st.varOptionText, mangaFormFazenda === f && st.varOptionTextActive]}>{f}</Text>
                        {mangaFormFazenda === f && <MaterialIcons name="check" size={18} color={GREEN} />}
                      </TouchableOpacity>
                    ))
                }
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Picker Variedade */}
        <Modal visible={mangaFormShowVariedadePicker} transparent animationType="fade" onRequestClose={() => setMangaFormShowVariedadePicker(false)}>
          <Pressable style={st.overlay} onPress={() => setMangaFormShowVariedadePicker(false)}>
            <Pressable style={st.varModalBox} onPress={(e) => e.stopPropagation()}>
              <View style={st.varModalHeader}>
                <Text style={st.varModalTitle}>Selecionar variedade</Text>
                <TouchableOpacity style={st.closeCircle} onPress={() => setMangaFormShowVariedadePicker(false)}>
                  <MaterialIcons name="close" size={20} color="#333" />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {(mangaFormVariedadeList.length > 0 ? mangaFormVariedadeList : variedadesList).map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[st.varOption, mangaFormVariedade === v && st.varOptionActive]}
                    onPress={() => { setMangaFormVariedade(v); setMangaFormShowVariedadePicker(false); }}
                    activeOpacity={0.85}
                  >
                    <Text style={[st.varOptionText, mangaFormVariedade === v && st.varOptionTextActive]}>{v}</Text>
                    {mangaFormVariedade === v && <MaterialIcons name="check" size={18} color={GREEN} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </Modal>

      {/* ── MODAL FOTOS DA MANGA CADASTRADA ── */}
      <Modal
        visible={mangaFotoModalIdx !== null && !showMangaCadastroModal}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setMangaFotoModalIdx(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#F2F2F2' }}>
          <View style={{ height: Platform.OS === 'android' ? (StatusBar.currentHeight || 30) : 44, backgroundColor: '#FFFFFF' }} />
          <View style={st.header}>
            <TouchableOpacity onPress={() => setMangaFotoModalIdx(null)} style={st.backBtn}>
              <MaterialIcons name="arrow-back" size={24} color={GREEN} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={require('../../../assets/logoagrodann.png')} style={st.logo} resizeMode="contain" />
          <View style={{ width: 1, height: 18, backgroundColor: '#2E7D32' }} />
          <Image source={require('../../../../assets/CQLETRA.png')} style={st.logoCQ} resizeMode="contain" />
        </View>
            <View style={{ width: 40 }} />
          </View>

          {mangaFotoModalIdx !== null && mangaCadastros[mangaFotoModalIdx] && (() => {
            const cad = mangaCadastros[mangaFotoModalIdx];
            const cadIdx = mangaFotoModalIdx;
            return (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
                <View style={pgSt.modalInfoBar}>
                  <Text style={pgSt.modalTitle}>{cad.fazenda} | Fotos</Text>
                  <Text style={pgSt.modalSubtitle}>Variedade: {cad.variedade} | Controle: {cad.controle}</Text>
                </View>

                {MANGA_FOTO_ITEMS.map((item) => {
                  const fotos = cad.fotos[item.key] || [];
                  return (
                    <View key={item.key} style={pgSt.campoFotoSection}>
                      <View style={pgSt.campoFotoHeader}>
                        <Text style={pgSt.campoFotoLabel}>{item.label}</Text>
                        {fotos.length > 0 && (
                          <View style={pgSt.campoFotoBadge}>
                            <Text style={pgSt.campoFotoBadgeText}>{fotos.length}</Text>
                          </View>
                        )}
                      </View>

                      <View style={pgSt.fotoActionRow}>
                        <TouchableOpacity style={pgSt.fotoActionBtnSmall} onPress={() => pickMangaCadFotoCamera(cadIdx, item.key)} activeOpacity={0.7}>
                          <MaterialIcons name="camera-alt" size={18} color="#FFF" />
                          <Text style={pgSt.fotoActionTextSmall}>Câmera</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={pgSt.fotoActionBtnSmall} onPress={() => pickMangaCadFotoGaleria(cadIdx, item.key)} activeOpacity={0.7}>
                          <MaterialIcons name="photo-library" size={18} color="#FFF" />
                          <Text style={pgSt.fotoActionTextSmall}>Galeria</Text>
                        </TouchableOpacity>
                      </View>

                      {fotos.length > 0 && (
                        <View style={pgSt.fotoGrid}>
                          {fotos.map((uri, fIdx) => (
                            <View key={`mcf-${item.key}-${fIdx}`} style={pgSt.fotoThumbWrap}>
                              <Image source={{ uri }} style={pgSt.fotoThumb} />
                              <TouchableOpacity style={pgSt.fotoRemoveBtn} onPress={() => removeMangaCadFoto(cadIdx, item.key, fIdx)} activeOpacity={0.7}>
                                <MaterialIcons name="close" size={16} color="#FFF" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            );
          })()}
        </View>
      </Modal>

      {/* ── MODAL HISTÓRICO MANGAS ── */}
      <Modal
        visible={showMangaHistoricoModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowMangaHistoricoModal(false); setMangaHistoricoAcaoIdx(null); }}
      >
        <Pressable style={st.overlay} onPress={() => { setShowMangaHistoricoModal(false); setMangaHistoricoAcaoIdx(null); }}>
          <Pressable style={[st.varModalBox, { maxHeight: '80%' }]} onPress={(e) => e.stopPropagation()}>
            <View style={st.varModalHeader}>
              <Text style={st.varModalTitle}>Histórico</Text>
              <TouchableOpacity style={st.closeCircle} onPress={() => { setShowMangaHistoricoModal(false); setMangaHistoricoAcaoIdx(null); }}>
                <MaterialIcons name="close" size={20} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {mangaHistorico.map((item, idx) => (
                <View key={`hm-${idx}`}>
                  <TouchableOpacity
                    style={[pgSt.carregCard, { marginHorizontal: 0, marginBottom: 4 }]}
                    onPress={() => setMangaHistoricoAcaoIdx(mangaHistoricoAcaoIdx === idx ? null : idx)}
                    activeOpacity={0.75}
                  >
                    <View style={pgSt.carregHeaderRow}>
                      <MaterialIcons name="cloud-done" size={18} color="#0277BD" />
                      <Text style={[pgSt.carregApelido, { color: '#333', flex: 1 }]}>{item.fazenda}</Text>
                      <Text style={{ fontSize: 11, color: '#AAA' }}>
                        {new Date(item.enviadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={pgSt.carregInfoRow}>
                      <Text style={pgSt.carregInfoText}>{item.variedade} · Controle {item.controle} · {item.totalEnviado} foto(s)</Text>
                    </View>
                  </TouchableOpacity>

                  {mangaHistoricoAcaoIdx === idx && (
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, paddingHorizontal: 4 }}>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 10 }}
                        onPress={() => {
                          const novoIdx = mangaCadastros.length;
                          setMangaCadastros((prev) => [...prev, { ...item }]);
                          setMangaHistorico((prev) => prev.filter((_, i) => i !== idx));
                          setMangaHistoricoAcaoIdx(null);
                          setShowMangaHistoricoModal(false);
                          setMangaFotoModalIdx(novoIdx);
                          setMangaFormFazenda(item.fazenda || '');
                          setMangaFormVariedade(item.variedade || '');
                          setMangaFormControle(String(item.controle || ''));
                          carregarFazendasMangaForm();
                          setMangaCadastroTab('adicionar');
                          setShowMangaCadastroModal(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="edit" size={18} color="#FFF" />
                        <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 14 }}>Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#E53935', borderRadius: 10, paddingVertical: 10 }}
                        onPress={() => {
                          Alert.alert('Apagar', `Remover ${item.fazenda} do histórico?`, [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Apagar', style: 'destructive', onPress: () => {
                              setMangaHistorico((prev) => prev.filter((_, i) => i !== idx));
                              setMangaHistoricoAcaoIdx(null);
                            }},
                          ]);
                        }}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="delete-outline" size={18} color="#FFF" />
                        <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 14 }}>Apagar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── MODAL DETALHE DO CARREGAMENTO ── */}
      <Modal
        visible={Boolean(selectedCarregamento)}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setSelectedCarregamento(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#F2F2F2' }}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
          {/* Safe area spacer */}
          <View style={{ height: Platform.OS === 'android' ? (StatusBar.currentHeight || 30) : 44, backgroundColor: '#FFFFFF' }} />
          {/* Header com logo */}
          <View style={st.header}>
            <TouchableOpacity onPress={() => setSelectedCarregamento(null)} style={st.backBtn}>
              <MaterialIcons name="arrow-back" size={24} color={GREEN} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={require('../../../assets/logoagrodann.png')} style={st.logo} resizeMode="contain" />
          <View style={{ width: 1, height: 18, backgroundColor: '#2E7D32' }} />
          <Image source={require('../../../../assets/CQLETRA.png')} style={st.logoCQ} resizeMode="contain" />
        </View>
            <View style={{ width: 40 }} />
          </View>

          {/* Tabs: Pallets | Container | Fotos */}
          <View style={pgSt.mTabRow}>
            <TouchableOpacity
              style={[pgSt.mTabBtn, modalTab === 'pallets' && pgSt.mTabBtnActive]}
              onPress={() => setModalTab('pallets')}
              activeOpacity={0.7}
            >
              <Text style={[pgSt.mTabText, modalTab === 'pallets' && pgSt.mTabTextActive]}>Pallets</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pgSt.mTabBtn, modalTab === 'container' && pgSt.mTabBtnActive]}
              onPress={() => setModalTab('container')}
              activeOpacity={0.7}
            >
              <Text style={[pgSt.mTabText, modalTab === 'container' && pgSt.mTabTextActive]}>Container</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pgSt.mTabBtn, modalTab === 'fotos' && pgSt.mTabBtnActive]}
              onPress={() => setModalTab('fotos')}
              activeOpacity={0.7}
            >
              <Text style={[pgSt.mTabText, modalTab === 'fotos' && pgSt.mTabTextActive]}>Fotos{getTotalModalFotos() > 0 ? ` (${getTotalModalFotos()})` : ''}</Text>
            </TouchableOpacity>
          </View>

          {/* ── ABA PALLETS ── */}
          {modalTab === 'pallets' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            {/* Info resumo */}
            <View style={pgSt.modalInfoBar}>
              <Text style={pgSt.modalTitle}>
                {selectedCarregamento?.apelido || `Carregamento ${selectedCarregamento?.id}`}
              </Text>
              {!!selectedCarregamento?.container && (
                <Text style={pgSt.modalSubtitle}>Container: {selectedCarregamento.container}</Text>
              )}
            </View>

            {(selectedCarregamento?.pallets || []).map((p, idx) => {
              const isConf = p.etiqueta === 'C';
              const piKey = `${p.oc}_${p.palletId}`;
              const pi = palletInfoMap[piKey];
              const piLoading = pi?.loading === true;
              const piRows = Array.isArray(pi?.data) ? pi.data : [];
              return (
                <View key={`cmodal-${p.palletId}-${idx}`} style={pgSt.pCard}>
                  <View style={pgSt.pTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={pgSt.pLabel}>Pallet</Text>
                      <Text style={pgSt.pNumber}>{p.palletId}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={pgSt.pLabel}>Etiqueta</Text>
                      <TouchableOpacity
                        style={[pgSt.pEtiqueta, isConf ? pgSt.pEtiquetaC : pgSt.pEtiquetaNC]}
                        onPress={() => toggleCarregPalletEtiqueta(idx)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name={isConf ? 'check-circle' : 'cancel'} size={18} color="#FFF" />
                        <Text style={pgSt.pEtiquetaText}>{isConf ? 'C' : 'NC'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {!!p.variedade && (
                    <View style={pgSt.pInfoRow}>
                      <MaterialIcons name="local-florist" size={14} color={GREEN} />
                      <Text style={[pgSt.pInfoText, { color: GREEN, fontWeight: '700' }]}>{p.variedade}</Text>
                    </View>
                  )}
                  {!!p.controle && (
                    <View style={pgSt.pInfoRow}>
                      <MaterialIcons name="tag" size={14} color="#888" />
                      <Text style={pgSt.pInfoText}>Controle: {p.controle}</Text>
                    </View>
                  )}
                  {!!p.caixaDescricao && (
                    <View style={pgSt.pInfoRow}>
                      <MaterialIcons name="inbox" size={14} color="#888" />
                      <Text style={pgSt.pInfoText}>{p.caixaDescricao} — {p.qtdCaixas} cx</Text>
                    </View>
                  )}

                  <View style={pgSt.pTempRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={pgSt.pTempLabel}>Temp 1</Text>
                      <TextInput
                        style={pgSt.pTempInput}
                        value={p.temp1}
                        onChangeText={(text) => setCarregPalletTemp(idx, 'temp1', text)}
                        placeholder="0,0"
                        placeholderTextColor="#C0C0C0"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={pgSt.pTempLabel}>Temp 2</Text>
                      <TextInput
                        style={pgSt.pTempInput}
                        value={p.temp2}
                        onChangeText={(text) => setCarregPalletTemp(idx, 'temp2', text)}
                        placeholder="0,0"
                        placeholderTextColor="#C0C0C0"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          )}

          {/* ── ABA FOTOS (por campo) ── */}
          {modalTab === 'fotos' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            <View style={pgSt.modalInfoBar}>
              <Text style={pgSt.modalTitle}>
                {selectedCarregamento?.apelido || `Carregamento ${selectedCarregamento?.id}`}
              </Text>
              <Text style={pgSt.modalSubtitle}>Fotos necessárias para priorização</Text>
            </View>

            {PRIORIZACAO_FOTO_CAMPOS.map((campo) => {
              const fotos = modalFotos[campo.key] || [];
              const inline = servidorFotosInline[campo.key];
              const jaCarregou = inline !== undefined;
              const totalServidorFotos = inline?.urls?.length || 0;

              return (
                <View key={campo.key} style={pgSt.campoFotoSection}>
                  <View style={pgSt.campoFotoHeader}>
                    <Text style={pgSt.campoFotoLabel}>{campo.label}</Text>
                    {fotos.length > 0 && (
                      <View style={pgSt.campoFotoBadge}>
                        <Text style={pgSt.campoFotoBadgeText}>{fotos.length}</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[pgSt.servidorFotosBadge, totalServidorFotos > 0 && pgSt.servidorFotosBadgeComFoto]}
                    onPress={carregarServidorFotosInline}
                    activeOpacity={0.8}
                    disabled={inline?.loading}
                  >
                    {inline?.loading ? (
                      <ActivityIndicator size={14} color="#0277BD" />
                    ) : (
                      <MaterialIcons
                        name={totalServidorFotos > 0 ? 'cloud-done' : 'cloud-queue'}
                        size={16}
                        color={totalServidorFotos > 0 ? '#0277BD' : '#888'}
                      />
                    )}
                    <Text style={[pgSt.servidorFotosBadgeText, totalServidorFotos === 0 && { color: '#888' }]}>
                      {inline?.loading
                        ? 'Carregando...'
                        : totalServidorFotos > 0
                          ? `${totalServidorFotos} foto(s) no servidor — Ver`
                          : jaCarregou
                            ? 'Nenhuma foto no servidor'
                            : 'Ver fotos no servidor'}
                    </Text>
                    {!inline?.loading && (
                      <MaterialIcons name={jaCarregou ? 'refresh' : 'chevron-right'} size={16} color={totalServidorFotos > 0 ? '#0277BD' : '#888'} />
                    )}
                  </TouchableOpacity>

                  {/* Fotos do servidor inline (aparecem abaixo do botão) */}
                  {jaCarregou && !inline.loading && (
                    inline.urls.length > 0 ? (
                      <View style={pgSt.fotoGrid}>
                        {inline.urls.map((url, idx) => (
                          <View key={`srv-${campo.key}-${idx}`} style={pgSt.fotoThumbWrap}>
                            <Image
                              source={{ uri: url, cache: 'reload' }}
                              style={pgSt.fotoThumb}
                              resizeMode="cover"
                            />
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={{ color: '#999', fontSize: 12, marginTop: 6, marginBottom: 4 }}>
                        Nenhuma foto encontrada no servidor para este campo.
                      </Text>
                    )
                  )}

                  <View style={pgSt.fotoActionRow}>
                    <TouchableOpacity style={pgSt.fotoActionBtnSmall} onPress={() => pickModalFotoCamera(campo.key)} activeOpacity={0.7}>
                      <MaterialIcons name="camera-alt" size={18} color="#FFF" />
                      <Text style={pgSt.fotoActionTextSmall}>Câmera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={pgSt.fotoActionBtnSmall} onPress={() => pickModalFotosGaleria(campo.key)} activeOpacity={0.7}>
                      <MaterialIcons name="photo-library" size={18} color="#FFF" />
                      <Text style={pgSt.fotoActionTextSmall}>Galeria</Text>
                    </TouchableOpacity>
                  </View>

                  {fotos.length > 0 && (
                    <View style={pgSt.fotoGrid}>
                      {fotos.map((uri, idx) => (
                        <View key={`mfoto-${campo.key}-${idx}`} style={pgSt.fotoThumbWrap}>
                          <Image source={{ uri }} style={pgSt.fotoThumb} />
                          <TouchableOpacity style={pgSt.fotoRemoveBtn} onPress={() => removeModalFoto(campo.key, idx)} activeOpacity={0.7}>
                            <MaterialIcons name="close" size={16} color="#FFF" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

          </ScrollView>
          )}

          {/* ── ABA CONTAINER (checklist) ── */}
          {modalTab === 'container' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            <View style={st.card}>
              <Text style={st.cardTitle}>Checklist do Container</Text>

              <View style={clSt.summaryRow}>
                <View style={[clSt.summaryBadge, { backgroundColor: '#E8F5E9' }]}>
                  <Text style={[clSt.summaryBadgeText, { color: GREEN }]}>
                    C: {modalChecklist.filter((i) => i.value === 'C').length}
                  </Text>
                </View>
                <View style={[clSt.summaryBadge, { backgroundColor: '#FFEBEE' }]}>
                  <Text style={[clSt.summaryBadgeText, { color: '#C62828' }]}>
                    NC: {modalChecklist.filter((i) => i.value === 'NC').length}
                  </Text>
                </View>
                <View style={[clSt.summaryBadge, { backgroundColor: '#FFF8E1' }]}>
                  <Text style={[clSt.summaryBadgeText, { color: '#F57F17' }]}>
                    Pendente: {modalChecklist.filter((i) => i.value === null).length}
                  </Text>
                </View>
              </View>

              {modalChecklist.map((item) => {
                const labelPos = item.usaSimNao ? 'S' : 'C';
                const labelNeg = item.usaSimNao ? 'N' : 'NC';

                return (
                  <View key={item.key} style={clSt.itemRow}>
                    <Text style={clSt.itemLabel}>{item.label}</Text>
                    <View style={clSt.buttonsRow}>
                      <TouchableOpacity
                        style={[clSt.optionBtn, item.value === 'C' && clSt.optionBtnConforme]}
                        onPress={() => setModalChecklistValue(item.key, 'C')}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name={item.value === 'C' ? 'check-circle' : 'radio-button-unchecked'}
                          size={18}
                          color={item.value === 'C' ? '#FFFFFF' : GREEN}
                        />
                        <Text style={[clSt.optionText, item.value === 'C' && clSt.optionTextActive]}>{labelPos}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[clSt.optionBtn, item.value === 'NC' && clSt.optionBtnNc]}
                        onPress={() => setModalChecklistValue(item.key, 'NC')}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name={item.value === 'NC' ? 'cancel' : 'radio-button-unchecked'}
                          size={18}
                          color={item.value === 'NC' ? '#FFFFFF' : '#C62828'}
                        />
                        <Text style={[clSt.optionText, item.value === 'NC' && clSt.optionTextActive]}>{labelNeg}</Text>
                      </TouchableOpacity>
                    </View>
                    {item.temperatura !== undefined && (
                      <View style={clSt.tempRow}>
                        <Text style={clSt.tempLabel}>Temperatura (°C):</Text>
                        <TextInput
                          style={clSt.tempInput}
                          value={item.temperatura}
                          onChangeText={(text) => setModalChecklistTemp(item.key, text)}
                          placeholder="Ex: 8.0"
                          placeholderTextColor="#C0C0C0"
                          keyboardType="numeric"
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
          )}

          {/* ── BOTÃO ENVIAR FIXO ── */}
          <View style={pgSt.enviarBarFixa}>
            <TouchableOpacity
              style={[pgSt.enviarBtn, modalFotosUploading && { opacity: 0.6 }]}
              onPress={enviarPriorizacao}
              disabled={modalFotosUploading}
              activeOpacity={0.7}
            >
              {modalFotosUploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MaterialIcons name="cloud-upload" size={20} color="#FFFFFF" />
              )}
              <Text style={pgSt.enviarBtnText}>
                {modalFotosUploading ? 'Enviando...' : 'Salvar e enviar'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── PAINEL DADOS DO PALLET — renderizado POR ÚLTIMO para ficar na frente no iOS ── */}
          {palletDadosModal.visible && (
            <Pressable
              style={pgSt.pdmOverlay}
              onPress={() => setPalletDadosModal((prev) => ({ ...prev, visible: false }))}
            >
              <Pressable style={pgSt.pdmContainer} onPress={(e) => e.stopPropagation()}>
                {/* Header */}
                <View style={pgSt.pdmHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={pgSt.pdmHeaderTitle}>Dados do Pallet</Text>
                    <Text style={pgSt.pdmHeaderSub}>Pallet {palletDadosModal.palletId}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPalletDadosModal((prev) => ({ ...prev, visible: false }))}
                    style={pgSt.pdmCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialIcons name="close" size={24} color="#444" />
                  </TouchableOpacity>
                </View>

                {palletDadosModal.loading ? (
                  <View style={pgSt.pdmLoading}>
                    <ActivityIndicator size="large" color={GREEN} />
                    <Text style={pgSt.pdmLoadingText}>Buscando dados...</Text>
                  </View>
                ) : palletDadosModal.data.length === 0 ? (
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                    <View style={pgSt.pdmLoading}>
                      <MaterialIcons name="inbox" size={40} color="#CCC" />
                      <Text style={pgSt.pdmEmptyText}>Nenhum dado encontrado para este pallet.</Text>
                    </View>
                    {!!palletDadosModal.error && (
                      <View style={pgSt.pdmJsonBox}>
                        <Text style={pgSt.pdmJsonTitle}>Erro</Text>
                        <Text style={pgSt.pdmJsonText}>{String(palletDadosModal.error)}</Text>
                      </View>
                    )}
                    {!!palletDadosModal.raw && (
                      <View style={pgSt.pdmJsonBox}>
                        <Text style={pgSt.pdmJsonTitle}>JSON bruto da resposta</Text>
                        <Text style={pgSt.pdmJsonText}>{JSON.stringify(palletDadosModal.raw, null, 2)}</Text>
                      </View>
                    )}
                  </ScrollView>
                ) : (
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                    <View style={pgSt.pdmJsonBox}>
                      <Text style={pgSt.pdmJsonTitle}>Resumo da busca</Text>
                      <Text style={pgSt.pdmJsonText}>Total de registros: {palletDadosModal.data.length}</Text>
                    </View>
                    <View style={pgSt.pdmJsonBox}>
                      <Text style={pgSt.pdmJsonTitle}>JSON (primeiro registro)</Text>
                      <Text style={pgSt.pdmJsonText}>{JSON.stringify(palletDadosModal.data[0], null, 2)}</Text>
                    </View>
                    {palletDadosModal.data.map((row, ri) => (
                      <View key={ri} style={pgSt.pdmCard}>
                        <View style={pgSt.pdmCardHeader}>
                          <View style={pgSt.pdmBadge}>
                            <Text style={pgSt.pdmBadgeText}>{row.VARIEDADE || row.variedade || '-'}</Text>
                          </View>
                          {!!(row.NOME_FAZENDA || row.nome_fazenda) && (
                            <Text style={pgSt.pdmFazenda}>{row.NOME_FAZENDA || row.nome_fazenda}</Text>
                          )}
                        </View>
                        <View style={pgSt.pdmGrid}>
                          <View style={pgSt.pdmGridItem}>
                            <Text style={pgSt.pdmGridLabel}>Controle</Text>
                            <Text style={pgSt.pdmGridValue}>{row.CONTROLE ?? row.controle ?? '-'}</Text>
                          </View>
                          <View style={pgSt.pdmGridItem}>
                            <Text style={pgSt.pdmGridLabel}>Quantidade</Text>
                            <Text style={pgSt.pdmGridValue}>{row.QUANTIDADE ?? row.quantidade ?? '-'}</Text>
                          </View>
                          <View style={pgSt.pdmGridItem}>
                            <Text style={pgSt.pdmGridLabel}>Talhão</Text>
                            <Text style={pgSt.pdmGridValue}>{row.TALHAO ?? row.talhao ?? '-'}</Text>
                          </View>
                          <View style={pgSt.pdmGridItem}>
                            <Text style={pgSt.pdmGridLabel}>Fazenda</Text>
                            <Text style={pgSt.pdmGridValue}>{row.CODIGO_FAZENDA ?? row.codigo_fazenda ?? '-'}</Text>
                          </View>
                          <View style={pgSt.pdmGridItem}>
                            <Text style={pgSt.pdmGridLabel}>Calibre</Text>
                            <Text style={pgSt.pdmGridValue}>{row.CALIB_IN_CODIGO ?? row.calibre ?? '-'}</Text>
                          </View>
                          <View style={pgSt.pdmGridItem}>
                            <Text style={pgSt.pdmGridLabel}>Qtd Caixas</Text>
                            <Text style={pgSt.pdmGridValue}>{row.QTD_CAIXAS ?? row.qtd_caixas ?? '-'}</Text>
                          </View>
                          <View style={pgSt.pdmGridItem}>
                            <Text style={pgSt.pdmGridLabel}>Safra</Text>
                            <Text style={pgSt.pdmGridValue}>{row.SAFRA_ST_CODIGO ?? row.safra_st_codigo ?? '-'}</Text>
                          </View>
                          <View style={pgSt.pdmGridItem}>
                            <Text style={pgSt.pdmGridLabel}>OC</Text>
                            <Text style={pgSt.pdmGridValue}>{row.OC ?? row.oc ?? '-'}</Text>
                          </View>
                        </View>
                        {!!(row.CAIXA_ST_DESCRICAO || row.caixa_st_descricao) && (
                          <View style={pgSt.pdmFullRow}>
                            <Text style={pgSt.pdmGridLabel}>Caixa</Text>
                            <Text style={pgSt.pdmGridValue}>{row.CAIXA_ST_DESCRICAO || row.caixa_st_descricao}</Text>
                          </View>
                        )}
                        {!!(row.PLANCARREG_ST_NROCONTAINER || row.plancarreg_st_nrocontainer) && (
                          <View style={pgSt.pdmFullRow}>
                            <Text style={pgSt.pdmGridLabel}>Container</Text>
                            <Text style={pgSt.pdmGridValue}>{row.PLANCARREG_ST_NROCONTAINER || row.plancarreg_st_nrocontainer}</Text>
                          </View>
                        )}
                        {!!(row.PLANCARREG_ST_MOTORISTA || row.plancarreg_st_motorista) && (
                          <View style={pgSt.pdmFullRow}>
                            <Text style={pgSt.pdmGridLabel}>Motorista</Text>
                            <Text style={pgSt.pdmGridValue}>{row.PLANCARREG_ST_MOTORISTA || row.plancarreg_st_motorista}</Text>
                          </View>
                        )}
                        {!!(row.PLANCARREG_DT_SAIDA || row.plancarreg_dt_saida) && (
                          <View style={pgSt.pdmFullRow}>
                            <Text style={pgSt.pdmGridLabel}>Data Saída</Text>
                            <Text style={pgSt.pdmGridValue}>{row.PLANCARREG_DT_SAIDA || row.plancarreg_dt_saida}</Text>
                          </View>
                        )}
                        {ri < palletDadosModal.data.length - 1 && <View style={pgSt.pdmDivider} />}
                      </View>
                    ))}
                  </ScrollView>
                )}
              </Pressable>
            </Pressable>
          )}
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F2F2F2',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  logo: {
    width: 120,
    height: 30,
  },
  logoCQ: {
    width: 40,
    height: 19,
  },
  stepWrap: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  generalInfoStepWrap: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
    marginBottom: 12,
  },
  quickTabRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 12,
    overflow: 'hidden',
  },
  quickTabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  quickTabBtnActive: {
    borderBottomColor: GREEN,
    backgroundColor: '#F1F8F1',
  },
  quickTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
  },
  quickTabTextActive: {
    color: GREEN,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: GREEN,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: GREEN,
    fontWeight: '700',
  },
  resumeTopBannerWrap: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  resumeTopBanner: {
    borderWidth: 1,
    borderColor: '#CDE6CF',
    borderRadius: 12,
    backgroundColor: '#F4FAF4',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resumeTopTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E5F31',
  },
  resumeTopMessage: {
    marginTop: 3,
    fontSize: 12,
    color: '#356043',
    lineHeight: 17,
  },
  resumeTopActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  resumeTopPrimaryBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeTopPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resumeTopSecondaryBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#A8C8AC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeTopSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E5F31',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  circle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#D0D0D0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  circleDone: {
    backgroundColor: GREEN,
  },
  circleActive: {
    backgroundColor: GREEN,
  },
  circleNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
  },
  circleNumActive: {
    color: '#FFFFFF',
  },
  lineLeft: {
    position: 'absolute',
    top: 17,
    left: 0,
    width: '50%',
    height: 2,
    backgroundColor: '#D0D0D0',
    zIndex: 0,
  },
  lineRight: {
    position: 'absolute',
    top: 17,
    right: 0,
    width: '50%',
    height: 2,
    backgroundColor: '#D0D0D0',
    zIndex: 0,
  },
  lineGreen: {
    backgroundColor: GREEN,
  },
  stepLabel: {
    fontSize: 10,
    color: '#AAAAAA',
    marginTop: 6,
    textAlign: 'center',
  },
  stepLabelActive: {
    color: GREEN,
    fontWeight: '700',
    fontSize: 11,
  },
  stepLabelDone: {
    color: GREEN,
  },
  scroll: {
    padding: 16,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 10,
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    marginBottom: 6,
  },
  inputBox: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  newDraftBtn: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  newDraftBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyDraftBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D7D7D7',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FAFAFA',
  },
  emptyDraftText: {
    fontSize: 12,
    color: '#888',
  },
  draftItem: {
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: '#FAFAFA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  draftItemActive: {
    borderColor: GREEN,
    backgroundColor: '#EEF8EE',
  },
  draftInfoBtn: {
    flex: 1,
  },
  draftTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2F2F2F',
  },
  draftMetaLine: {
    marginTop: 4,
    fontSize: 12,
    color: '#666',
  },
  draftDeleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#F1D7D7',
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mangaSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    marginBottom: 8,
  },
  mangaSelectTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2F2F2F',
  },
  mangaSelectMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#6E6E6E',
  },
  mangaPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  mangaPageBackBtn: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDEBDD',
    backgroundColor: '#F5FBF5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mangaPageBackText: {
    fontSize: 12,
    fontWeight: '700',
    color: GREEN,
  },
  mangaPageSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6E6E6E',
  },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectBoxDisabled: {
    backgroundColor: '#F4F4F4',
    borderColor: '#EBEBEB',
  },
  selectText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    paddingRight: 10,
  },
  placeholderText: {
    color: '#A6A6A6',
  },
  selectTextDisabled: {
    color: '#B6B6B6',
  },
  itemCard: {
    borderWidth: 1,
    borderColor: '#E8ECE8',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2A2A2A',
    marginBottom: 10,
  },
  itemButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  galleryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: GREEN,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  galleryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: GREEN,
  },
  cameraBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: GREEN,
    backgroundColor: LGREEN,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  cameraBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: GREEN,
  },
  emptyPhotoBox: {
    marginTop: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D7D7D7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FAFAFA',
  },
  emptyPhotoText: {
    fontSize: 12,
    color: '#888',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  thumb: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#EEE',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  thumbBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  thumbDelete: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(220,53,69,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F1',
  },
  resumoKey: {
    fontSize: 13,
    color: '#777',
    flex: 1,
    paddingRight: 10,
  },
  resumoVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
  },
  summaryBlock: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  summaryBlockTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A1A1A',
    marginTop: 10,
  },
  fab: {
    position: 'absolute',
    right: 14,
    bottom: 80,
    backgroundColor: GREEN,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    zIndex: 50,
  },
  fabTest: {
    position: 'absolute',
    left: 14,
    bottom: 80,
    backgroundColor: GREEN,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    zIndex: 50,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  fabTestText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  recordsModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    width: '92%',
    maxHeight: '78%',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  recordsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  recordsModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
    flex: 1,
  },
  recordsList: {
    marginTop: 6,
  },
  recordItem: {
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: '#FAFAFA',
  },
  recordTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2F2F2F',
  },
  recordMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#666',
  },
  recordEmptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D7D7D7',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 10,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
  },
  recordEmptyText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  varModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    width: '90%',
    maxHeight: '70%',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  varModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  varModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  resumePromptMessage: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  resumePromptHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#7A7A7A',
    lineHeight: 18,
  },
  varModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  varModalCancelBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  varModalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  varModalOkBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  varModalOkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resumePromptNewBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#FBEAEA',
    borderWidth: 1,
    borderColor: '#EAB0B0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumePromptNewText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C62828',
  },
  dateModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    width: '90%',
    maxWidth: 360,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  datePickerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  dateModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  dateActionCancel: {
    minHeight: 38,
    minWidth: 94,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateActionCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  dateActionConfirm: {
    minHeight: 38,
    minWidth: 94,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateActionConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  varOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  varOptionActive: {
    backgroundColor: LGREEN,
    borderColor: GREEN,
  },
  varOptionText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  varOptionTextActive: {
    color: GREEN,
    fontWeight: '800',
  },
  clienteSearchInput: {
    borderWidth: 1,
    borderColor: '#EBEBEB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
    marginBottom: 10,
  },
  clienteFormInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#E3E3E3',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
  },
  clienteRegisterWrap: {
    marginTop: 10,
    alignItems: 'center',
  },
  clienteRegisterBtn: {
    minHeight: 36,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  clienteRegisterText: {
    fontSize: 16,
    fontWeight: '700',
    color: ORANGE,
  },
  clientePaisText: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  reviewBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    width: '92%',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  reviewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  reviewSub: {
    marginTop: 3,
    fontSize: 12,
    color: '#666',
  },
  reviewCounter: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: GREEN,
  },
  closeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewImageWrap: {
    width: '100%',
    height: 300,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
  },
  reviewImage: {
    width: '100%',
    height: '100%',
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  reviewSecondaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  reviewPrimaryBtn: {
    flex: 1.2,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  reviewPrimaryBtnDanger: {
    backgroundColor: '#C62828',
  },
  reviewPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

const clSt = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  summaryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  itemRow: {
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    lineHeight: 18,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
    backgroundColor: '#FFFFFF',
  },
  optionBtnConforme: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  optionBtnNc: {
    backgroundColor: '#C62828',
    borderColor: '#C62828',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  optionTextActive: {
    color: '#FFFFFF',
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  tempLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  tempInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#111',
    backgroundColor: '#FFFFFF',
  },
  palletSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 8,
  },
  palletCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 14,
    marginBottom: 12,
    position: 'relative',
  },
  palletCardDeleteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  palletTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingRight: 28,
    gap: 16,
  },
  palletFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: GREEN,
    marginBottom: 4,
  },
  palletNumberInput: {
    height: 52,
    minWidth: 80,
    borderBottomWidth: 2,
    borderBottomColor: GREEN,
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  palletEtiquetaBox: {
    alignItems: 'center',
    minWidth: 80,
  },
  palletEtiquetaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  palletEtiquetaBtnC: {
    backgroundColor: GREEN,
  },
  palletEtiquetaBtnNC: {
    backgroundColor: '#C62828',
  },
  palletEtiquetaBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  palletTempRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  palletTempLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 2,
  },
  palletTempInput: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    backgroundColor: '#FAFAFA',
    textAlign: 'center',
  },
  addPalletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  addPalletText: {
    fontSize: 13,
    fontWeight: '600',
    color: GREEN,
  },
});

const cfSt = StyleSheet.create({
  serverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  serverBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fullScreen: {
    flex: 1,
    backgroundColor: '#F2F2F2',
  },
  scrollBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  photoThumbWrap: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 12,
  },
  uploadBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

const pgSt = StyleSheet.create({
  // ── Sub-abas ──
  tabRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
  },
  tabBtnActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    backgroundColor: ORANGE,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // ── PALLETS card ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#888',
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  carregCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 14,
    marginBottom: 10,
  },
  carregHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  carregApelido: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  carregInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  carregInfoText: {
    fontSize: 12,
    color: '#666',
  },
  carregBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  // ── Modal detalhe ──
  modalFull: {
    flex: 1,
    backgroundColor: '#F2F2F2',
  },
  mTabRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  mTabRowWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  mTabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  mTabBtnActive: {
    borderBottomColor: ORANGE,
  },
  mTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  mTabTextActive: {
    color: '#333',
    fontWeight: '700',
  },
  mTabActionCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  mFab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  modalInfoBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  pCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 14,
    marginBottom: 10,
  },
  pTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 10,
  },
  pLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: GREEN,
    marginBottom: 2,
  },
  pNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111',
  },
  pEtiqueta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  pEtiquetaC: {
    backgroundColor: GREEN,
  },
  pEtiquetaNC: {
    backgroundColor: '#C62828',
  },
  pEtiquetaText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  pInfoText: {
    fontSize: 12,
    color: '#666',
  },
  pTempRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  pTempLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 2,
  },
  pTempValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'center',
    overflow: 'hidden',
  },
  pTempInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    backgroundColor: '#FAFAFA',
    textAlign: 'center',
  },
  pVerDadosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: GREEN,
  },
  pVerDadosBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // ── Modal dados pallet ──
  pdmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    elevation: 20,
  },
  pdmContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '92%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  pdmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  pdmHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111',
  },
  pdmHeaderSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 1,
  },
  pdmCloseBtn: {
    padding: 4,
    borderRadius: 20,
    backgroundColor: '#F2F2F2',
  },
  pdmLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  pdmLoadingText: {
    fontSize: 14,
    color: '#888',
  },
  pdmEmptyText: {
    fontSize: 14,
    color: '#AAA',
    textAlign: 'center',
  },
  pdmCard: {
    marginBottom: 4,
  },
  pdmCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  pdmBadge: {
    backgroundColor: GREEN,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pdmBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pdmFazenda: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    flex: 1,
  },
  pdmGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  pdmGridItem: {
    width: '47%',
    backgroundColor: '#F7F7F7',
    borderRadius: 8,
    padding: 10,
  },
  pdmGridLabel: {
    fontSize: 10,
    color: '#999',
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  pdmGridValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  pdmFullRow: {
    backgroundColor: '#F7F7F7',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  pdmDivider: {
    height: 1,
    backgroundColor: '#EFEFEF',
    marginVertical: 14,
  },
  pdmJsonBox: {
    backgroundColor: '#F3F5F7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E4E8',
    padding: 10,
    marginBottom: 10,
  },
  pdmJsonTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#333',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  pdmJsonText: {
    fontSize: 11,
    color: '#263238',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pInfoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0277BD',
    alignSelf: 'flex-start',
  },
  pInfoBtnText: {
    fontSize: 12,
    color: '#0277BD',
    fontWeight: '600',
  },
  pInfoLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  pInfoLoadingText: {
    fontSize: 12,
    color: '#0277BD',
  },
  pInfoPanel: {
    marginTop: 10,
    backgroundColor: '#F0F7FF',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  pInfoPanelTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0277BD',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pInfoPanelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  pInfoPanelItem: {
    flex: 1,
    minWidth: 80,
  },
  pInfoPanelLabel: {
    fontSize: 10,
    color: '#5E8EAA',
    fontWeight: '600',
    marginBottom: 1,
  },
  pInfoPanelValue: {
    fontSize: 13,
    color: '#1A2F3A',
    fontWeight: '700',
  },
  // ── Fotos tab ──
  fotoActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  fotoActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: GREEN,
  },
  fotoActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fotoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  fotoThumbWrap: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#E0E0E0',
  },
  fotoThumb: {
    width: '100%',
    height: '100%',
  },
  fotoRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fotoEnviarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: ORANGE,
    marginTop: 4,
  },
  fotoEnviarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // ── Badge fotos no servidor ──
  servidorFotosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  servidorFotosBadgeComFoto: {
    backgroundColor: '#E3F2FD',
    borderColor: '#90CAF9',
  },
  servidorFotosBadgeText: {
    flex: 1,
    fontSize: 13,
    color: '#0277BD',
    fontWeight: '600',
  },
  // ── Campos de foto por categoria ──
  campoFotoSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 14,
    marginBottom: 12,
  },
  campoFotoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  campoFotoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
  },
  campoFotoBadge: {
    backgroundColor: GREEN,
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  campoFotoBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  fotoActionBtnSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: GREEN,
  },
  fotoActionTextSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // ── Botão Salvar e Enviar (rodapé fixo do modal) ──
  enviarBarFixa: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  enviarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: GREEN,
  },
  enviarBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

const calSt = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthYear: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  dayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayName: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#AAAAAA',
    paddingVertical: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellSel: {
    backgroundColor: GREEN,
    borderRadius: 999,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 999,
  },
  cellTxt: {
    fontSize: 14,
    color: '#222',
  },
  cellTxtSel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  cellTxtToday: {
    color: GREEN,
    fontWeight: '700',
  },
  galeriaHeaderBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galeriaFazendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    marginBottom: 8,
  },
  galeriaFazendaIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galeriaFazendaName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  galeriaFazendaMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  galeriaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  galeriaThumb: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#EEE',
  },
});
