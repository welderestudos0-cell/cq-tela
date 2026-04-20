// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISE DE FRUTOS — CONTROLE DE QUALIDADE
// Tela de formulário para análise individual de frutos em campo.
// Gera automaticamente a lista de frutos com base na quantidade informada,
// permitindo lançamento rápido por fruto (peso, danos, observações).
// Faz upload das fotos e envia os dados para o servidor via API.
// Rota: "AnaliseFrutos" em routes.js → AuthenticatedStack
// ─────────────────────────────────────────────────────────────────────────────

import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../context/AuthContext.js';
import api from '../../../services/api.js';

const GREEN = '#2E7D32';
const STEPS_TOTAL = 3;

const VARIEDADES = ['KENT', 'KEITT', 'TOMMY ATKINS', 'PALMER', 'OSTEEN', 'OMER', 'NOA', 'SHELLY'];
const LISTA_VALORES_SQL = 'SELECT * FROM AGDTI.DXDW_FORMS_TOT_VALOR';
const TIPOS_ANALISE_LISTA_DESCRICAO = 'lista_analises_frutos';
const LISTA_ENDPOINT_RELATIVO = '/backend/busca_generica/comandoGenerico';
const TIPOS_ANALISE_PADRAO = [
  'Análise de Shelf Life',
  'Análise de Pré - Colheita',
  'Análise de Acompanhamento',
  'Análise de Produção',
];
const CRITERIOS_BASE = ['Penetrometria', 'Brix', 'Matéria Seca'];
const CRITERIOS_PRE_COLHEITA = [...CRITERIOS_BASE, 'Maturação'];
const CRITERIOS_LOTE = [...CRITERIOS_BASE, 'Peso (g)', 'Maturação'];
const CACHE_TALHOES_KEY = '@analise_frutos:talhoes';
const CACHE_TIPOS_ANALISE_KEY = '@analise_frutos:tipos_analise';
const DANOS_LISTA_DESCRICAO = 'lista_danos_internos';
const CACHE_DANOS_KEY = '@analise_frutos:danos';
const ANALISE_FRUTOS_OFFLINE_KEY = 'analise_frutos_offline';
const STEPS = ['Cabeçalho', 'Fotos', 'Lotes'];
const HISTORY_LIMIT = 100;

const PRODUCAO_FOTO_CAMPOS = [
  { key: 'firmeza', label: 'Firmeza' },
  { key: 'maturacao', label: 'Maturação' },
  { key: 'danos_internos', label: 'Danos Internos' },
];
const INITIAL_FOTOS_PRODUCAO = { firmeza: [], maturacao: [], danos_internos: [] };

// Formata um objeto Date para string no padrão dd/mm/aaaa.
function formatDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Calcula o número da semana do ano a partir de uma string de data dd/mm/aaaa.
function getWeekNumber(dateStr) {
  try {
    const [day, month, year] = String(dateStr).split('/');
    if (!day || !month || !year) return '';
    const date = new Date(`${year}-${month}-${day}`);
    if (isNaN(date.getTime())) return '';
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    return String(Math.ceil(((date - startOfYear) / oneWeek) + 1));
  } catch {
    return '';
  }
}

// Remove todos os caracteres não numéricos de um valor de entrada inteiro.
function normalizeIntegerInput(value = '') {
  return value.replace(/\D/g, '');
}

// Sanitiza um valor de entrada decimal, permitindo apenas dígitos e um único ponto decimal.
function normalizeDecimalInput(value = '') {
  const cleaned = value.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

// Converte uma string de valor decimal (com vírgula ou ponto) para número, retornando null se inválido.
function toDecimalNumber(value = '') {
  if (!value) return null;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isNaN(parsed) ? null : parsed;
}

// Cria um array de objetos de fruto com numeração sequencial entre start e end.
function createFruitEntries(start, end) {
  const items = [];
  for (let number = start; number <= end; number += 1) {
    items.push({ numero_fruto: number, valor: '', valores_lotes: {} });
  }
  return items;
}

// Normaliza o nome da fazenda para maiusculo, unificando variacoes de "Frutos da Ilha".
function normalizeFarmName(value = '') {
  const name = String(value || '').trim().toUpperCase();
  if (name === 'FRUTOS DA ILHA 1' || name === 'FRUTOS DA ILHA 2') return 'FRUTOS DA ILHA';
  return name;
}

// Retorna o estado inicial do cabecalho do formulario com a data de hoje e a fazenda do usuario.
function createInitialHeader(userFarm = '') {
  const today = formatDate(new Date());
  return {
    tipo_analise: '',
    fazenda_talhao: '',
    talhao: '',
    semana: getWeekNumber(today),
    data: today,
    controle: '',
    variedade: '',
    qtd_frutos: '',
    criterio: '',
    observacoes: '',
    peso_final_caixa: '',
  };
}

// Normaliza o tipo de analise para comparacoes sem acentos e sem variacoes de caixa.
function normalizeTipoAnalise(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

// Verifica se o tipo selecionado corresponde a analise de pre-colheita.
function isPreColheitaTipo(value = '') {
  const norm = normalizeTipoAnalise(value);
  return /PRE/.test(norm) && /COLHEITA/.test(norm);
}

// Verifica se o tipo selecionado corresponde a analise de shelf life.
function isShelfLifeTipo(value = '') {
  const norm = normalizeTipoAnalise(value);
  return /SHELF/.test(norm) && /LIFE/.test(norm);
}

// Verifica se o tipo selecionado corresponde a analise de producao.
function isProducaoTipo(value = '') {
  const norm = normalizeTipoAnalise(value);
  return /PRODUC/.test(norm);
}

// Verifica se o tipo selecionado corresponde a analise de acompanhamento.
function isAcompanhamentoTipo(value = '') {
  const norm = normalizeTipoAnalise(value);
  return /ACOMPANHAMENTO/.test(norm);
}

// Retorna uma copia profunda simplificada da lista de frutos de teste.
function cloneTestFruits(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    valores_lotes: { ...(item?.valores_lotes || {}) },
  }));
}

// Monta a lista de frutos de pre-colheita a partir de arrays de criterios por numero de fruto.
function buildPreColheitaTestFruits() {
  const brix = ['5.0', '4.9', '4.9', '5.2', '5.0', '4.8', '4.7', '5.1', '4.8', '5.2', '4.8', '4.9', '4.6', '5.3', '5.0', '5.2', '4.9', '4.8', '6.0', '4.7'];
  const peso = ['585', '585', '585', '585', '530', '605', '515', '515', '555', '660', '520', '560', '485', '825', '515', '585', '585', '515', '720', '450'];
  const materiaSeca = ['17.2', '15.5', '17.4', '16.9', '16.3', '16.1', '15.7', '16.0', '16.4', '16.9', '16.0', '16.1', '15.4', '17.2', '16.4', '16.0', '16.5', '16.0', '16.9', '16.2'];
  const maturacao = ['1', '1', '1', '1.5', '1', '1', '1', '1.5', '1', '2', '1', '1.5', '1', '2', '1', '1', '1.5', '1.5', '1.5', '1'];
  const penetrometria = Array.from({ length: 20 }, () => '1');

  return Array.from({ length: 20 }, (_, index) => {
    const numeroFruto = index + 1;
    const valores_lotes = {
      Penetrometria: penetrometria[index],
      Brix: brix[index],
      'Matéria Seca': materiaSeca[index],
      'Peso (g)': peso[index],
      'Maturação': maturacao[index],
    };

    return {
      numero_fruto: numeroFruto,
      valor: valores_lotes.Brix,
      valores_lotes,
    };
  });
}

const SHELF_LIFE_TEST_HEADER = {
  tipo_analise: 'Análise de Shelf Life',
  fazenda_talhao: 'BOM JESUS',
  talhao: 'AGD BAHIA-029',
  semana: 14,
  data: formatDate(new Date()),
  controle: 312,
  variedade: 'TOMMY ATKINS',
  qtd_frutos: 8,
  criterio: 'Penetrometria',
  observacoes: '',
  peso_final_caixa: '',
};

const SHELF_LIFE_TEST_FRUITS = [
  { numero_fruto: 1, valor: '7', valores_lotes: { Penetrometria: '7', Brix: '13.8', 'Matéria Seca': '14.3' } },
  { numero_fruto: 2, valor: '5', valores_lotes: { Penetrometria: '5', Brix: '14.1', 'Matéria Seca': '14.2' } },
  { numero_fruto: 3, valor: '', valores_lotes: { Penetrometria: '', Brix: '15.4', 'Matéria Seca': '15.4' } },
  { numero_fruto: 4, valor: '4.9', valores_lotes: { Penetrometria: '4.9', Brix: '13.9', 'Matéria Seca': '14.9' } },
  { numero_fruto: 5, valor: '5.6', valores_lotes: { Penetrometria: '5.6', Brix: '15', 'Matéria Seca': '14' } },
  { numero_fruto: 6, valor: '4.9', valores_lotes: { Penetrometria: '4.9', Brix: '14', 'Matéria Seca': '14.3' } },
  { numero_fruto: 7, valor: '1.6', valores_lotes: { Penetrometria: '1.6', Brix: '15.1', 'Matéria Seca': '14.6' } },
  { numero_fruto: 8, valor: '6.5', valores_lotes: { Penetrometria: '6.5', Brix: '12.8', 'Matéria Seca': '14.4' } },
];

const PRE_COLHEITA_TEST_HEADER = {
  tipo_analise: 'Análise de Pré - Colheita',
  fazenda_talhao: 'BOM JESUS',
  talhao: 'AGD BAHIA-074',
  semana: 14,
  data: '31/03/2026',
  controle: 3001,
  variedade: 'KEITT',
  qtd_frutos: 20,
  criterio: 'Brix',
  observacoes: '',
  peso_final_caixa: '',
};

function buildProducaoTestFruits() {
  // Controle 526 (01/04) + Controle 513 (30/03) = 40 frutos
  const penetrometria = [
    '9.3', '9.4', '9.4', '7.2', '8.0', '9.3', '7.0', '8.4', '8.2', '7.4', '8.7', '8.4', '8.4', '7.9', '9.6', '7.3', '7.9', '7.7', '8.7', '7.9',
    '8.2', '8.0', '9.1', '9.6', '9.3', '9.6', '9.1', '10.2', '9.3', '11.7', '8.8', '6.6', '8.1', '6.8', '7.7', '8.0', '10.3', '11.3', '9.8', '7.8',
  ];
  const brix = [
    '6.3', '7.1', '6.5', '6.9', '6.3', '6.3', '6.9', '6.7', '7.6', '6.0', '7.1', '7.3', '7.7', '6.8', '6.3', '6.5', '7.0', '7.7', '6.5', '6.9',
    '6.4', '6.7', '6.8', '6.3', '6.7', '7.2', '7.3', '6.9', '5.8', '7.3', '6.4', '6.3', '6.8', '7.0', '6.7', '6.4', '6.6', '7.0', '6.5', '6.1',
  ];
  const materiaSeca = [
    '15.8', '17.2', '18.1', '17.1', '18.1', '16.3', '16.0', '18.1', '17.6', '15.6', '18.9', '18.5', '20.8', '14.4', '13.8', '16.8', '16.8', '16.3', '17.7', '16.2',
    '14.5', '16.6', '17.0', '15.5', '17.3', '19.3', '20.2', '19.4', '15.3', '19.4', '13.7', '13.6', '16.3', '17.0', '17.3', '16.6', '14.8', '16.7', '15.4', '14.4',
  ];
  const maturacao = [
    '1.5', '1.5', '1.5', '2', '2', '1.5', '1.5', '1.5', '1.5', '1.5', '2', '2', '2', '1.5', '1.5', '1.5', '1.5', '1.5', '1.5', '2',
    '1.5', '1.5', '1.5', '1.5', '1.5', '2', '2', '2', '1.5', '2', '1.5', '1.5', '1.5', '1.5', '2', '2', '1.5', '2', '1.5', '1.5',
  ];
  const danos = [
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', '', '', '', '', 'Colapso Interno', '', '', '', '', '', '', '', '',
  ];

  return Array.from({ length: 40 }, (_, index) => {
    const numeroFruto = index + 1;
    const valores_lotes = {
      Penetrometria: penetrometria[index],
      Brix: brix[index],
      'Matéria Seca': materiaSeca[index],
      'Maturação': maturacao[index],
      'Maturação_danos': danos[index],
    };
    return {
      numero_fruto: numeroFruto,
      valor: valores_lotes['Maturação'],
      valores_lotes,
    };
  });
}

const PRODUCAO_TEST_HEADER = {
  tipo_analise: 'Análise de Produção',
  fazenda_talhao: 'BOM JESUS',
  talhao: 'AGD BAHIA-070',
  semana: 14,
  data: '01/04/2026',
  controle: 526,
  variedade: 'PALMER',
  qtd_frutos: 40,
  criterio: 'Maturação',
  observacoes: '',
  peso_final_caixa: '',
};

function buildAcompanhamentoTestFruits() {
  // Controle 3001 (31/03) - 20 frutos - AGD BAHIA-030 - TOMMY ATKINS
  const penetrometria = [
    '1', '1', '1', '1', '1', '1', '1', '1', '1', '1',
    '1', '1', '1', '1', '1', '1', '1', '1', '1', '1',
  ];
  const brix = [
    '4.8', '', '5.3', '5.4', '5.7', '4.9', '5.9', '5.3', '5.4', '5.1',
    '5.0', '5.1', '5.6', '5.0', '5.0', '4.8', '5.0', '5.1', '5.2', '5.1',
  ];
  const materiaSeca = [
    '15.2', '15.4', '16.5', '16.3', '17.1', '16.5', '15.8', '15.0', '16.2', '16.3',
    '15.8', '15.5', '16.2', '15.8', '16.0', '15.5', '15.1', '16.5', '15.5', '15.9',
  ];
  const maturacao = [
    '1', '1.5', '1.5', '1', '1', '1', '1.5', '1.5', '1', '1.5',
    '1', '1.5', '1.5', '2', '1', '1.5', '1', '1', '2', '1',
  ];
  const danos = [
    '', '', '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', '', 'Podridão Caroço Moderado', '',
  ];

  return Array.from({ length: 20 }, (_, index) => {
    const numeroFruto = index + 1;
    const valores_lotes = {
      Penetrometria: penetrometria[index],
      Brix: brix[index],
      'Matéria Seca': materiaSeca[index],
      'Maturação': maturacao[index],
      'Maturação_danos': danos[index],
    };
    return {
      numero_fruto: numeroFruto,
      valor: valores_lotes['Maturação'],
      valores_lotes,
    };
  });
}

const ACOMPANHAMENTO_TEST_HEADER = {
  tipo_analise: 'Análise de Acompanhamento',
  fazenda_talhao: 'BOM JESUS',
  talhao: 'AGD BAHIA-030',
  semana: 14,
  data: '31/03/2026',
  controle: 3001,
  variedade: 'TOMMY ATKINS',
  qtd_frutos: 20,
  criterio: 'Maturação',
  observacoes: '',
  peso_final_caixa: '',
};

// Extrai a lista de talhoes de diferentes formatos de resposta da API.
function extractTalhoesList(responseData) {
  if (Array.isArray(responseData)) return responseData;
  if (Array.isArray(responseData?.data)) return responseData.data;
  if (Array.isArray(responseData?.data?.data)) return responseData.data.data;
  return [];
}

// Mescla listas de talhoes sem perder dados locais, preservando uma entrada por fazenda/talhao.
function mergeTalhoesLists(...lists) {
  const mergedMap = new Map();

  lists
    .flat()
    .forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const fazenda = String(item?.fazenda || '').trim();
      if (!fazenda) return;
      const talhao = String(item?.talhao || '').trim();
      const key = `${normalizeFarmName(fazenda)}::${talhao.toUpperCase()}`;
      mergedMap.set(key, { ...item, fazenda, talhao });
    });

  return Array.from(mergedMap.values());
}

function upsertTalhaoEntry(list = [], { fazenda = '', talhao = '' } = {}) {
  const farmName = String(fazenda || '').trim();
  if (!farmName) return Array.isArray(list) ? list : [];

  return mergeTalhoesLists(
    Array.isArray(list) ? list : [],
    [{ fazenda: farmName, talhao: String(talhao || '').trim() }],
  );
}

// Extrai um array de linhas de uma resposta generica da API, tentando varios formatos possiveis.
function extractGenericRows(responseData) {
  if (Array.isArray(responseData)) return responseData;
  if (Array.isArray(responseData?.data)) return responseData.data;
  if (Array.isArray(responseData?.rows)) return responseData.rows;
  if (Array.isArray(responseData?.result)) return responseData.result;
  if (Array.isArray(responseData?.results)) return responseData.results;
  if (Array.isArray(responseData?.records)) return responseData.records;
  // Tenta pegar o primeiro valor que seja array dentro do objeto
  if (responseData && typeof responseData === 'object') {
    const firstArray = Object.values(responseData).find(v => Array.isArray(v));
    if (firstArray) return firstArray;
  }
  return [];
}

// Busca o valor de um campo em uma linha de resultado ignorando diferenca de maiusculas/minusculas.
function getFieldValue(row, fieldName) {
  const key = Object.keys(row || {}).find((candidate) => candidate.toLowerCase() === fieldName.toLowerCase());
  return key ? row[key] : '';
}

// Componente de indicador de progresso entre os passos do formulario, clicavel para navegar.
function StepIndicator({ currentStep, onStepPress }) {
  return (
    <View style={styles.stepRow}>
      {STEPS.map((label, index) => {
        const done = index < currentStep;
        const active = index === currentStep;
        const canPress = index !== currentStep;
        return (
          <TouchableOpacity
            key={`step-${index}`}
            style={styles.stepItem}
            onPress={() => canPress && onStepPress(index)}
            activeOpacity={canPress ? 0.7 : 1}
          >
            {index > 0 && <View style={[styles.lineLeft, (done || active) && styles.lineGreen]} />}
            <View style={[styles.stepCircle, done && styles.stepCircleDone, active && styles.stepCircleActive]}>
              {done ? (
                <MaterialIcons name="check" size={15} color="#FFFFFF" />
              ) : (
                <Text style={[styles.stepNumber, active && styles.stepNumberActive]}>{index + 1}</Text>
              )}
            </View>
            {index < STEPS.length - 1 && <View style={[styles.lineRight, done && styles.lineGreen]} />}
            <Text style={[styles.stepLabel, active && styles.stepLabelActive, done && styles.stepLabelDone]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Componente de campo de texto generico com suporte a label, placeholder e modo multiline.
function FieldInput({
  label,
  required,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  onBlur,
  onFocus,
  editable = true,
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor="#A2A2A2"
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.fieldInput, multiline && styles.fieldInputMultiline, !editable && styles.fieldInputDisabled]}
      />
    </View>
  );
}

// Componente de campo de selecao que abre um modal ao ser pressionado.
function SelectField({ label, required, value, onPress, placeholder, disabled }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={[styles.selectInput, disabled && styles.selectInputDisabled]}
        onPress={onPress}
        activeOpacity={0.8}
        disabled={disabled}
      >
        <Text style={[styles.selectText, !value && styles.selectPlaceholder]}>{value || placeholder}</Text>
        <MaterialIcons name="keyboard-arrow-down" size={22} color={disabled ? '#BAC3BC' : '#7E8A81'} />
      </TouchableOpacity>
    </View>
  );
}

// Modal de lista com busca para selecao de opcoes como fazenda, variedade ou criterio.
function SearchListModal({
  visible,
  title,
  options,
  emptyText,
  onSelect,
  onClose,
  searchPlaceholder,
  selectedValue,
  allowCreate = false,
  createLabel,
  onCreate,
}) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) setSearch('');
  }, [visible]);

  const filtered = useMemo(
    () => options.filter((item) => item.toLowerCase().includes(search.trim().toLowerCase())),
    [options, search]
  );
  const trimmedSearch = String(search || '').trim();
  const canCreate = allowCreate
    && !!trimmedSearch
    && !options.some((item) => String(item || '').trim().toLowerCase() === trimmedSearch.toLowerCase());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>{title}</Text>
          <View style={styles.searchWrap}>
            <MaterialIcons name="search" size={18} color="#8E9991" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={searchPlaceholder}
              placeholderTextColor="#9CA7A0"
            />
          </View>
          <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
            {canCreate ? (
              <TouchableOpacity
                style={styles.modalCreateItem}
                onPress={() => {
                  onCreate?.(trimmedSearch);
                  onClose();
                }}
                activeOpacity={0.75}
              >
                <MaterialIcons name="add-circle-outline" size={20} color={GREEN} />
                <Text style={styles.modalCreateItemText}>{createLabel?.(trimmedSearch) || `Cadastrar "${trimmedSearch}"`}</Text>
              </TouchableOpacity>
            ) : null}
            {!filtered.length ? (
              <View style={styles.modalEmpty}><Text style={styles.modalEmptyText}>{emptyText}</Text></View>
            ) : (
              filtered.map((item) => {
                const isSelected = selectedValue === item;
                return (
                  <TouchableOpacity
                    key={item}
                    style={[styles.modalItem, isSelected && { backgroundColor: '#E8F5E9' }]}
                    onPress={() => { onSelect(isSelected ? '' : item); onClose(); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.modalItemText, isSelected && { color: '#0B8A43', fontWeight: '600' }]}>{item}</Text>
                    {isSelected
                      ? <MaterialIcons name="close" size={20} color="#D32F2F" />
                      : <MaterialIcons name="chevron-right" size={20} color="#C2C8C4" />
                    }
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Componente principal da tela de Analise de Frutos: gerencia cabecalho, fotos, lotes e envio ao servidor.
export default function AnaliseFrutos({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const userFarm = useMemo(() => String(user?.fazenda || user?.farm || '').trim(), [user?.fazenda, user?.farm]);
  const floatingButtonsBottom = useMemo(
    () => Math.max(Platform.OS === 'android' ? 52 : 20, (insets?.bottom || 0) + 12),
    [insets?.bottom],
  );

  const [step, setStep] = useState(0);
  const [header, setHeader] = useState(() => createInitialHeader(userFarm));
  const [fruits, setFruits] = useState([]);
  const [allTalhoes, setAllTalhoes] = useState([]);
  const [fazendas, setFazendas] = useState([]);
  const [talhoesDaFazenda, setTalhoesDaFazenda] = useState([]);
  const [loadingTalhoes, setLoadingTalhoes] = useState(false);
  const [showFarmModal, setShowFarmModal] = useState(false);
  const [showTalhaoModal, setShowTalhaoModal] = useState(false);
  const [showVarModal, setShowVarModal] = useState(false);
  const [showCriterioModal, setShowCriterioModal] = useState(false);
  const [showTipoModal, setShowTipoModal] = useState(false);
  const [tiposAnaliseOptions, setTiposAnaliseOptions] = useState(() => [...TIPOS_ANALISE_PADRAO]);
  const [fotos, setFotos] = useState([]);
  const [fotosProducao, setFotosProducao] = useState({ ...INITIAL_FOTOS_PRODUCAO });
  const [saving, setSaving] = useState(false);
  const [testingPdf, setTestingPdf] = useState(false);
  const [danosOptions, setDanosOptions] = useState([]);
  const [showDanosModal, setShowDanosModal] = useState(false);
  const [danosModalFruitIndex, setDanosModalFruitIndex] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [editingFormId, setEditingFormId] = useState('');
  const [existingFotosSalvas, setExistingFotosSalvas] = useState([]);
  const [existingFotosProducao, setExistingFotosProducao] = useState({ ...INITIAL_FOTOS_PRODUCAO });
  const isPreColheita = isPreColheitaTipo(header.tipo_analise);
  const isShelfLife = isShelfLifeTipo(header.tipo_analise);
  const isProducao = isProducaoTipo(header.tipo_analise);
  const isAcompanhamento = isAcompanhamentoTipo(header.tipo_analise);
  const criteriosLoteOptions = isShelfLife ? CRITERIOS_BASE : (isPreColheita || isProducao || isAcompanhamento) ? CRITERIOS_PRE_COLHEITA : CRITERIOS_LOTE;
  const criterioModalOptions = useMemo(
    () => ['Selecione...', ...criteriosLoteOptions],
    [criteriosLoteOptions],
  );
  const loteRows = criteriosLoteOptions.flatMap((criterio) => fruits.map((fruit, fruitIndex) => ({
    fruitIndex,
    numero_fruto: fruit.numero_fruto,
    criterio,
  })));

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // (auto-fill de fazenda removido — usuário seleciona manualmente)

  useEffect(() => {
    let mounted = true;
    const applyTalhoes = (list) => {
      if (!mounted) return;
      setAllTalhoes(list);
      const farmsFromList = list.map((item) => String(item?.fazenda || '').trim()).filter(Boolean);
      const uniqueFarms = [...new Set(farmsFromList)]
        .sort((a, b) => a.localeCompare(b));
      if (userFarm && !uniqueFarms.some((farm) => normalizeFarmName(farm) === normalizeFarmName(userFarm))) {
        uniqueFarms.unshift(userFarm);
      }
      setFazendas(uniqueFarms);
      // fazenda não é auto-preenchida — usuário seleciona manualmente
    };
    const loadTalhoes = async () => {
      setLoadingTalhoes(true);
      let cachedList = [];
      // Carrega cache primeiro para uso offline imediato
      try {
        const cached = await AsyncStorage.getItem(CACHE_TALHOES_KEY);
        if (cached) {
          cachedList = extractTalhoesList(JSON.parse(cached));
          applyTalhoes(cachedList);
        }
      } catch {}
      // Tenta atualizar da API
      try {
        const response = await api.get('/talhoes');
        const list = extractTalhoesList(response);
        const mergedList = mergeTalhoesLists(cachedList, list);
        applyTalhoes(mergedList);
        await AsyncStorage.setItem(CACHE_TALHOES_KEY, JSON.stringify(mergedList));
      } catch (error) {
        console.warn('[AnaliseFrutos] Falha ao carregar talhoes da API, usando cache:', error?.message);
      } finally {
        if (mounted) setLoadingTalhoes(false);
      }
    };
    loadTalhoes();
    return () => { mounted = false; };
  }, [userFarm]);

  useEffect(() => {
    const farm = normalizeFarmName(header.fazenda_talhao);
    if (!farm) {
      setTalhoesDaFazenda([]);
      return;
    }
    const nextTalhoes = [...new Set(
      allTalhoes
        .filter((item) => normalizeFarmName(item?.fazenda || '') === farm)
        .map((item) => String(item?.talhao || '').trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
    setTalhoesDaFazenda(nextTalhoes);
    setHeader((prev) => (prev.talhao && !nextTalhoes.includes(prev.talhao) ? { ...prev, talhao: '' } : prev));
  }, [allTalhoes, header.fazenda_talhao]);

  useEffect(() => {
    let mounted = true;
    const mergeTipoOptions = (values = []) => {
      const canonicalByKey = new Map(
        TIPOS_ANALISE_PADRAO.map((tipo) => [normalizeTipoAnalise(tipo), tipo])
      );
      const allowedKeys = new Set(canonicalByKey.keys());
      const seen = new Set();

      [...TIPOS_ANALISE_PADRAO, ...(Array.isArray(values) ? values : [])].forEach((item) => {
        const key = normalizeTipoAnalise(item);
        if (!allowedKeys.has(key) || seen.has(key)) return;
        seen.add(key);
      });

      return TIPOS_ANALISE_PADRAO.filter((tipo) => seen.has(normalizeTipoAnalise(tipo)));
    };

    const loadTiposAnalise = async () => {
      // Carrega cache primeiro para uso offline imediato
      try {
        const cached = await AsyncStorage.getItem(CACHE_TIPOS_ANALISE_KEY);
        if (cached && mounted) {
          const parsed = JSON.parse(cached);
          const cachedOptions = mergeTipoOptions(parsed);
          if (cachedOptions.length > 0) setTiposAnaliseOptions(cachedOptions);
        }
      } catch {}
      // Tenta atualizar da API local
      try {
        const response = await api.get(LISTA_ENDPOINT_RELATIVO, {
          params: { comando: LISTA_VALORES_SQL },
        });
        const rows = extractGenericRows(response?.data ?? response);
        const values = rows
          .filter((row) => String(getFieldValue(row, 'descricao_lista') || '').trim().toLowerCase().includes(TIPOS_ANALISE_LISTA_DESCRICAO))
          .map((row) => String(getFieldValue(row, 'valor') || '').trim())
          .filter(Boolean);
        const unique = mergeTipoOptions(values);
        if (mounted && unique.length > 0) {
          setTiposAnaliseOptions(unique);
          await AsyncStorage.setItem(CACHE_TIPOS_ANALISE_KEY, JSON.stringify(unique));
        }
      } catch (error) {
        console.warn('[AnaliseFrutos] Falha ao carregar tipos de analise da API, usando cache:', error?.message);
      }
    };
    loadTiposAnalise();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadDanosOptions = async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_DANOS_KEY);
        if (cached && mounted) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) setDanosOptions(parsed);
        }
      } catch {}
      try {
        const response = await api.get(LISTA_ENDPOINT_RELATIVO, {
          params: { comando: LISTA_VALORES_SQL },
        });
        const rows = extractGenericRows(response?.data ?? response);
        const values = rows
          .filter((row) => String(getFieldValue(row, 'descricao_lista') || '').trim().toLowerCase().includes(DANOS_LISTA_DESCRICAO))
          .map((row) => String(getFieldValue(row, 'valor') || '').trim())
          .filter(Boolean);
        const unique = [...new Set(values)];
        if (mounted && unique.length > 0) {
          setDanosOptions(unique);
          await AsyncStorage.setItem(CACHE_DANOS_KEY, JSON.stringify(unique));
        }
      } catch (error) {
        console.warn('[AnaliseFrutos] Falha ao carregar danos da API, usando cache:', error?.message);
      }
    };
    loadDanosOptions();
    return () => { mounted = false; };
  }, []);

  // Atualiza um campo especifico do cabecalho do formulario.
  const updateHeader = (key, value) => {
    setHeader((previous) => ({ ...previous, [key]: value }));
  };

  const persistTalhoesList = async (nextList) => {
    setAllTalhoes(nextList);
    try {
      await AsyncStorage.setItem(CACHE_TALHOES_KEY, JSON.stringify(nextList));
    } catch {}
  };

  const resetFormState = () => {
    setStep(0);
    setHeader(createInitialHeader(userFarm));
    setFruits([]);
    setFotos([]);
    setFotosProducao({ ...INITIAL_FOTOS_PRODUCAO });
    setEditingFormId('');
    setExistingFotosSalvas([]);
    setExistingFotosProducao({ ...INITIAL_FOTOS_PRODUCAO });
  };

  const saveOfflineAnaliseFrutos = async (payload) => {
    const nowIso = new Date().toISOString();
    const offlineId = String(payload?.form_id || payload?.id || `AF-OFFLINE-${Date.now()}`);
    const offlineItem = {
      ...payload,
      id: offlineId,
      form_id: offlineId,
      tipo: 'Análise de Frutos',
      origem: 'analise_frutos_offline',
      fazenda: payload?.fazenda_talhao || payload?.fazenda || '',
      talhao: payload?.talhao || '',
      usuario: payload?.avaliador || String(user?.nome || user?.name || '').trim(),
      matricula: String(user?.matricula || '').trim() || 'Não Informada',
      timestamp: nowIso,
      dataColeta: payload?.data || nowIso,
      sincronizado: false,
      _syncStatus: 'pending',
      _createdOfflineAt: nowIso,
    };

    const storedRaw = await AsyncStorage.getItem(ANALISE_FRUTOS_OFFLINE_KEY);
    const stored = storedRaw ? JSON.parse(storedRaw) : [];
    const next = Array.isArray(stored)
      ? [...stored.filter((item) => String(item?.id || item?.form_id || '') !== offlineId), offlineItem]
      : [offlineItem];
    await AsyncStorage.setItem(ANALISE_FRUTOS_OFFLINE_KEY, JSON.stringify(next));
    return offlineItem;
  };

  const handleCreateFarm = async (farmName) => {
    const nextFarm = String(farmName || '').trim();
    if (!nextFarm) return;

    const nextList = upsertTalhaoEntry(allTalhoes, { fazenda: nextFarm, talhao: '' });
    await persistTalhoesList(nextList);
    setFazendas((prev) => {
      const merged = [...new Set([...prev, nextFarm])].sort((a, b) => a.localeCompare(b));
      return merged;
    });
    setHeader((prev) => ({ ...prev, fazenda_talhao: nextFarm, talhao: '' }));
    Alert.alert('Fazenda cadastrada', 'Nova fazenda adicionada com sucesso.');
  };

  const handleCreateTalhao = async (talhaoName) => {
    const nextTalhao = String(talhaoName || '').trim();
    const currentFarm = String(header.fazenda_talhao || '').trim();
    if (!currentFarm || !nextTalhao) return;

    const nextList = upsertTalhaoEntry(allTalhoes, { fazenda: currentFarm, talhao: nextTalhao });
    await persistTalhoesList(nextList);
    setTalhoesDaFazenda((prev) => [...new Set([...prev, nextTalhao])].sort((a, b) => a.localeCompare(b)));
    setHeader((prev) => ({ ...prev, talhao: nextTalhao }));
    Alert.alert('Talhao cadastrado', 'Novo talhao adicionado com sucesso.');
  };

  // Atualiza a data no cabecalho e recalcula automaticamente o numero da semana.
  const handleDateChange = (value) => {
    updateHeader('data', value);
    const week = getWeekNumber(value);
    if (week) updateHeader('semana', week);
  };

  // Ajusta a lista de frutos para a quantidade informada, pedindo confirmacao ao reduzir.
  const adjustFruitList = (nextQty, { askConfirmation = true } = {}) => {
    const safeQty = Math.max(0, nextQty || 0);
    const currentQty = fruits.length;
    if (safeQty === currentQty) return true;
    if (safeQty > currentQty) {
      setFruits((prev) => (safeQty <= prev.length ? prev : [...prev, ...createFruitEntries(prev.length + 1, safeQty)]));
      return true;
    }
    if (!askConfirmation) {
      setFruits((prev) => prev.slice(0, safeQty));
      return true;
    }
    const startRemoved = safeQty + 1;
    Alert.alert(
      'Confirmar reducao',
      `Voce alterou de ${currentQty} para ${safeQty} frutos. Remover frutos ${startRemoved} ate ${currentQty}?`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => updateHeader('qtd_frutos', String(currentQty)) },
        { text: 'Remover', style: 'destructive', onPress: () => setFruits((prev) => prev.slice(0, safeQty)) },
      ]
    );
    return false;
  };

  // Atualiza o campo de quantidade de frutos e expande a lista imediatamente se aumentar.
  const handleQtdFrutosChange = (value) => {
    const sanitized = normalizeIntegerInput(value);
    updateHeader('qtd_frutos', sanitized);
    const nextQty = Number.parseInt(sanitized || '0', 10) || 0;
    if (nextQty > fruits.length) adjustFruitList(nextQty, { askConfirmation: false });
  };

  // Confirma a quantidade de frutos ao sair do campo, aplicando reducao com confirmacao se necessario.
  const commitQtdFrutosChange = () => {
    const nextQty = Number.parseInt(header.qtd_frutos || '0', 10) || 0;
    if (nextQty < fruits.length) return adjustFruitList(nextQty, { askConfirmation: true });
    if (nextQty > fruits.length) adjustFruitList(nextQty, { askConfirmation: false });
    return true;
  };

  // Retorna o valor lancado para um criterio de lote de um fruto especifico.
  const getLoteValue = (fruit, criterio) => String(fruit?.valores_lotes?.[criterio] || '');

  // Atualiza o valor de um criterio de lote para um fruto especifico.
  const updateLoteValue = (fruitIndex, criterio, value) => {
    setFruits((previous) => previous.map((fruit, i) => (i === fruitIndex ? {
      ...fruit,
      valores_lotes: { ...(fruit.valores_lotes || {}), [criterio]: value },
    } : fruit)));
  };

  // Remove uma foto da lista pelo seu indice.
  const removeFotoAt = (index) => {
    setFotos((current) => current.filter((_, i) => i !== index));
  };

  // Remove uma foto de uma secao de producao pelo campo e indice.
  const removeFotoProducaoAt = (campo, index) => {
    setFotosProducao((prev) => ({ ...prev, [campo]: (prev[campo] || []).filter((_, i) => i !== index) }));
  };

  const removeExistingFotoSalvaAt = (index) => {
    setExistingFotosSalvas((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingFotoProducaoAt = (campo, index) => {
    setExistingFotosProducao((prev) => ({ ...prev, [campo]: (prev[campo] || []).filter((_, i) => i !== index) }));
  };

  // Abre a galeria para um campo especifico de producao.
  const addFromGalleryProducao = async (campo) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('Permissao negada', 'Habilite o acesso a galeria.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.8 });
      if (result.canceled) return;
      const novas = (result.assets || []).map((a) => a?.uri).filter(Boolean);
      if (!novas.length) return;
      setFotosProducao((prev) => ({ ...prev, [campo]: [...(prev[campo] || []), ...novas] }));
    } catch (error) {
      console.warn('[AnaliseFrutos] Galeria producao:', error?.message);
      Alert.alert('Erro', 'Nao foi possivel selecionar as fotos da galeria.');
    }
  };

  // Abre a camera para um campo especifico de producao.
  const addFromCameraProducao = async (campo) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { Alert.alert('Permissao negada', 'Habilite o acesso a camera.'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      setFotosProducao((prev) => ({ ...prev, [campo]: [...(prev[campo] || []), uri] }));
    } catch (error) {
      console.warn('[AnaliseFrutos] Camera producao:', error?.message);
      Alert.alert('Erro', 'Nao foi possivel abrir a camera.');
    }
  };

  // Abre a galeria para selecionar uma ou mais fotos e adiciona na lista.
  const addFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissao negada', 'Habilite o acesso a galeria.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (result.canceled) return;
      const novasFotos = (result.assets || []).map((asset) => asset?.uri).filter(Boolean);
      if (!novasFotos.length) return;
      setFotos((current) => [...current, ...novasFotos]);
    } catch (error) {
      console.warn('[AnaliseFrutos] Falha ao selecionar fotos da galeria:', error?.message);
      Alert.alert('Erro', 'Nao foi possivel selecionar as fotos da galeria.');
    }
  };

  // Abre a camera para capturar uma foto e adiciona na lista.
  const addFromCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissao negada', 'Habilite o acesso a camera.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (result.canceled) return;

      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      setFotos((current) => [...current, uri]);
    } catch (error) {
      console.warn('[AnaliseFrutos] Falha ao tirar foto:', error?.message);
      Alert.alert('Erro', 'Nao foi possivel abrir a camera.');
    }
  };

  // O botao voltar do topo sempre retorna para Home, sem voltar entre etapas internas.
  const handleBack = () => {
    navigation.navigate('Home');
  };

  const getRecordPayload = (record) => {
    if (!record) return null;
    if (record.payload_json && typeof record.payload_json === 'object') return record.payload_json;
    if (typeof record.payload_json === 'string') {
      try { return JSON.parse(record.payload_json); } catch { return null; }
    }
    return null;
  };

  const buildHistoryListLabel = (item) => {
    const tipo = String(item?.tipo_analise || '').trim() || 'Sem tipo';
    const fazenda = String(item?.fazenda_talhao || '').trim() || 'Sem fazenda';
    const data = String(item?.data_ref || '').trim() || '-';
    const controle = item?.controle != null ? `Controle ${item.controle}` : 'Sem controle';
    return `${tipo}\n${fazenda} | ${data} | ${controle}`;
  };

  const fetchHistoryList = async () => {
    try {
      setHistoryLoading(true);
      const response = await api.get('/analise-frutos', {
        params: { limit: HISTORY_LIMIT },
      });
      const list = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.rows)
          ? response.rows
          : Array.isArray(response?.result)
            ? response.result
            : [];
      setHistoryItems(list);
    } catch (error) {
      console.warn('[AnaliseFrutos] Falha ao carregar historico:', error?.message);
      Alert.alert('Erro', 'Nao foi possivel carregar o historico agora.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = async () => {
    setShowHistoryModal(true);
    setSelectedHistory(null);
    await fetchHistoryList();
  };

  const openHistoryDetails = async (item) => {
    try {
      setHistoryDetailLoading(true);
      const key = item?.form_id || item?.id;
      const response = await api.get(`/analise-frutos/${encodeURIComponent(String(key))}`);
      const data = response?.data || response;
      setSelectedHistory(data || item);
    } catch (error) {
      console.warn('[AnaliseFrutos] Falha ao abrir detalhe do historico:', error?.message);
      Alert.alert('Erro', 'Nao foi possivel abrir os detalhes deste registro.');
    } finally {
      setHistoryDetailLoading(false);
    }
  };

  const loadHistoryToForm = (record) => {
    const payload = getRecordPayload(record);
    if (!payload) {
      Alert.alert('Erro', 'Nao foi possivel carregar os dados deste historico.');
      return;
    }

    const restoredHeader = {
      ...createInitialHeader(userFarm),
      tipo_analise: payload.tipo_analise || '',
      fazenda_talhao: payload.fazenda_talhao || payload.fazenda || '',
      talhao: payload.talhao || '',
      semana: payload.semana != null ? String(payload.semana) : '',
      data: payload.data || payload.data_ref || formatDate(new Date()),
      controle: payload.controle != null ? String(payload.controle) : '',
      variedade: payload.variedade || '',
      qtd_frutos: payload.qtd_frutos != null ? String(payload.qtd_frutos) : '',
      criterio: payload.criterio || '',
      observacoes: payload.observacoes || '',
      peso_final_caixa: payload.peso_final_caixa != null ? String(payload.peso_final_caixa) : '',
    };

    const lotes = Array.isArray(payload.lotes) ? payload.lotes : [];
    const frutosBase = Array.isArray(payload.frutos) ? payload.frutos : [];
    const fruitMap = new Map();

    frutosBase.forEach((fruit) => {
      const numero = Number.parseInt(fruit?.numero_fruto, 10);
      if (!Number.isFinite(numero)) return;
      fruitMap.set(numero, {
        numero_fruto: numero,
        valor: fruit?.valor != null ? String(fruit.valor) : '',
        valores_lotes: {},
      });
    });

    lotes.forEach((lote) => {
      const numero = Number.parseInt(lote?.numero_fruto, 10);
      const criterio = String(lote?.criterio || '').trim();
      if (!Number.isFinite(numero) || !criterio) return;
      if (!fruitMap.has(numero)) {
        fruitMap.set(numero, { numero_fruto: numero, valor: '', valores_lotes: {} });
      }
      const current = fruitMap.get(numero);
      current.valores_lotes[criterio] = lote?.valor != null ? String(lote.valor) : '';
      if (criterio === 'Maturação') {
        current.valores_lotes['Maturação_danos'] = String(lote?.danos_internos || '').trim();
      }
      fruitMap.set(numero, current);
    });

    const restoredFruits = Array.from(fruitMap.values()).sort((a, b) => a.numero_fruto - b.numero_fruto);
    const fotosSalvas = Array.isArray(payload.fotos_salvas) ? payload.fotos_salvas : [];

    // Restaurar fotos de producao salvas (firmeza, maturacao, danos_internos)
    const restoredProdFotos = { ...INITIAL_FOTOS_PRODUCAO };
    const savedProdFotos = payload.fotos_producao;
    if (savedProdFotos && typeof savedProdFotos === 'object') {
      PRODUCAO_FOTO_CAMPOS.forEach(({ key }) => {
        const items = Array.isArray(savedProdFotos[key]) ? savedProdFotos[key] : [];
        restoredProdFotos[key] = items
          .map((item) => ({ uri: buildAbsoluteApiUrl(item.url || ''), disk_path: item.disk_path || '', nome: item.nome || '' }))
          .filter((item) => item.uri);
      });
    }

    setHeader({ ...restoredHeader, qtd_frutos: String(restoredFruits.length) });
    setFruits(restoredFruits);
    setFotos([]);
    setFotosProducao({ ...INITIAL_FOTOS_PRODUCAO });
    setExistingFotosSalvas(fotosSalvas);
    setExistingFotosProducao(restoredProdFotos);
    setEditingFormId(String(record?.form_id || payload?.form_id || record?.id || ''));
    setStep(0);
    setShowHistoryModal(false);
    setSelectedHistory(null);
    Alert.alert('Modo edicao', 'Registro carregado. Altere os campos e salve para atualizar.');
  };

  const handleDeleteHistory = async (record) => {
    const id = record?.form_id || record?.id;
    if (!id) return;
    try {
      await api.delete(`/analise-frutos/${encodeURIComponent(String(id))}`);
      if (editingFormId && String(editingFormId) === String(record?.form_id || '')) {
        setEditingFormId('');
        setExistingFotosSalvas([]);
      }
      setSelectedHistory(null);
      await fetchHistoryList();
      Alert.alert('Sucesso', 'Registro removido do historico.');
    } catch (error) {
      console.warn('[AnaliseFrutos] Falha ao remover historico:', error?.message);
      Alert.alert('Erro', 'Nao foi possivel remover este registro.');
    }
  };

  // Monta o payload completo do formulario para envio/geracao de PDF.
  const buildPayload = () => {
    const criterioPrincipal = criteriosLoteOptions.includes(header.criterio)
      ? header.criterio
      : (criteriosLoteOptions[0] || '');

    return {
      ...header,
      form_id: editingFormId || undefined,
      avaliador: String(user?.nome || user?.name || '').trim(),
      avaliado: 'Controle de qualidade - Packing Manga',
      qtd_frutos: fruits.length,
      semana: Number.parseInt(header.semana || '0', 10) || null,
      controle: Number.parseInt(header.controle || '0', 10) || null,
      peso_final_caixa: toDecimalNumber(header.peso_final_caixa) ?? 0,
      fotos,
      fotos_count: fotos.length,
      fotos_salvas: existingFotosSalvas,
      fotos_producao: isProducao ? fotosProducao : null,
      fotos_producao_salvas: isProducao ? existingFotosProducao : null,
      frutos: fruits.map((fruit) => ({
        numero_fruto: fruit.numero_fruto,
        valor: toDecimalNumber(getLoteValue(fruit, criterioPrincipal)) ?? toDecimalNumber(fruit.valor),
        danos_internos: String(fruit?.valores_lotes?.['Maturação_danos'] || '').trim(),
      })),
      lotes: fruits.flatMap((fruit) => criteriosLoteOptions.map((criterio) => ({
        numero_fruto: fruit.numero_fruto,
        criterio,
        valor: toDecimalNumber(getLoteValue(fruit, criterio)),
        danos_internos: criterio === 'Maturação'
          ? String(fruit?.valores_lotes?.['Maturação_danos'] || '').trim()
          : '',
      }))),
    };
  };

  // Monta uma URL absoluta a partir de uma URL relativa retornada pelo backend.
  const buildAbsoluteApiUrl = (relativeUrl = '') => {
    const raw = String(relativeUrl || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;

    const baseApi = String(api?.defaults?.baseURL || '').trim();
    const baseOrigin = baseApi.replace(/\/api\/?$/i, '');
    if (!baseOrigin) return raw;

    const prefix = raw.startsWith('/') ? '' : '/';
    return `${baseOrigin}${prefix}${raw}`;
  };

  // Abre/compartilha o PDF de teste retornado pelo backend.
  const openTestePdf = async (pdfUrl) => {
    const absoluteUrl = buildAbsoluteApiUrl(pdfUrl);
    if (!absoluteUrl) {
      throw new Error('URL do PDF de teste nao retornada pelo backend.');
    }

    if (await Sharing.isAvailableAsync()) {
      const fileName = `analise_frutos_teste_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      const downloaded = await FileSystem.downloadAsync(absoluteUrl, fileUri);
      await Sharing.shareAsync(downloaded.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Teste do PDF - Analise de Frutos',
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    const canOpen = await Linking.canOpenURL(absoluteUrl);
    if (canOpen) {
      await Linking.openURL(absoluteUrl);
      return;
    }

    throw new Error('Nao foi possivel abrir o PDF de teste neste dispositivo.');
  };

  // Gera PDF de teste sem salvar registro definitivo.
  // Monta FormData a partir do payload para envio multipart (com fotos).
  const buildFormData = (payload) => {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (key === 'fotos' || key === 'fotos_producao') return;
      if (typeof value === 'object' && value !== null) {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, value == null ? '' : String(value));
      }
    });
    (payload.fotos || []).forEach((uri, idx) => {
      if (!uri) return;
      const ext = String(uri).split('.').pop()?.toLowerCase() || 'jpg';
      formData.append('fotos', {
        uri,
        name: `foto_analise_${idx + 1}.${ext}`,
        type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
      });
    });
    // Fotos por campo para analise de producao
    if (payload.fotos_producao) {
      PRODUCAO_FOTO_CAMPOS.forEach(({ key }) => {
        (payload.fotos_producao[key] || []).forEach((uri, idx) => {
          if (!uri) return;
          const ext = String(uri).split('.').pop()?.toLowerCase() || 'jpg';
          formData.append(`fotos_${key}`, {
            uri,
            name: `foto_${key}_${idx + 1}.${ext}`,
            type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
          });
        });
      });
    }
    return formData;
  };

  const gerarPdfTeste = async () => {
    if (saving || testingPdf) return;
    if (!fruits.length) {
      Alert.alert('Sem frutos', 'Informe a quantidade e gere os frutos antes de testar o PDF.');
      return;
    }

    try {
      setTestingPdf(true);
      const formData = buildFormData(buildPayload());
      const response = await api.post('/analise-frutos/teste-pdf', formData, {
        timeout: 120000,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const pdfUrl = response?.pdf_url || response?.data?.pdf_url;
      await openTestePdf(pdfUrl);
    } catch (error) {
      console.warn('[AnaliseFrutos] Falha ao gerar PDF de teste:', error?.message);
      const backendMessage = String(error?.response?.data?.error || '').trim();
      Alert.alert('Erro', backendMessage || 'Nao foi possivel gerar o PDF de teste agora.');
    } finally {
      setTestingPdf(false);
    }
  };

  // Monta o payload com os dados do formulario e frutos e envia ao servidor via API.
  const handleSave = async () => {
    if (saving || testingPdf) return;
    if (!fruits.length) { Alert.alert('Sem frutos', 'Informe a quantidade e gere os frutos antes de salvar.'); return; }
    const payload = buildPayload();
    const formData = buildFormData(payload);
    try {
      setSaving(true);
      const response = await api.post('/analise-frutos', formData, {
        timeout: 120000,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const backendMessage = String(response?.data?.message || '').trim();
      Alert.alert('Registro salvo', backendMessage || 'Registro enviado com sucesso.', [
        {
          text: 'Nova analise',
          onPress: resetFormState,
        },
        { text: 'Voltar', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.warn('[AnaliseFrutos] Falha ao enviar para backend:', error?.message);
      const isNetworkError = !error?.response;
      if (isNetworkError) {
        try {
          await saveOfflineAnaliseFrutos(payload);
          resetFormState();
          Alert.alert(
            'Salvo offline',
            'Sem conexao com o backend. A analise foi enviada para o sininho e a tela voltou para o cabecalho para evitar duplicidade.',
            [{ text: 'OK' }],
          );
          return;
        } catch (offlineError) {
          console.error('[AnaliseFrutos] Falha ao salvar offline:', offlineError?.message);
        }
      }
      Alert.alert(
        'Falha ao salvar',
        isNetworkError
          ? 'Falha de conexao com o backend e nao foi possivel enviar para o sininho.'
          : 'Nao foi possivel enviar o relatorio para o backend agora.'
      );
    } finally {
      setSaving(false);
    }
  };

  // Carrega dados de teste conforme o tipo selecionado.
  const aplicarDadosTestePorTipo = (tipoAnalise = header.tipo_analise, { avancarParaLotes = true } = {}) => {
    const tipoSelecionado = String(tipoAnalise || '').trim();
    const isPre = isPreColheitaTipo(tipoSelecionado);
    const isProd = isProducaoTipo(tipoSelecionado);
    const isAcomp = isAcompanhamentoTipo(tipoSelecionado);

    if (isAcomp) {
      const tipoFinal = tipoSelecionado || ACOMPANHAMENTO_TEST_HEADER.tipo_analise;
      setHeader({ ...ACOMPANHAMENTO_TEST_HEADER, tipo_analise: tipoFinal });
      setFruits(buildAcompanhamentoTestFruits());
      if (avancarParaLotes) setStep(2);
      return;
    }

    if (isProd) {
      const tipoFinal = tipoSelecionado || PRODUCAO_TEST_HEADER.tipo_analise;
      setHeader({ ...PRODUCAO_TEST_HEADER, tipo_analise: tipoFinal });
      setFruits(buildProducaoTestFruits());
      if (avancarParaLotes) setStep(2);
      return;
    }

    if (isPre) {
      const tipoFinal = tipoSelecionado || PRE_COLHEITA_TEST_HEADER.tipo_analise;
      setHeader({ ...PRE_COLHEITA_TEST_HEADER, tipo_analise: tipoFinal });
      setFruits(buildPreColheitaTestFruits());
      if (avancarParaLotes) setStep(2);
      return;
    }

    const tipoFinal = tipoSelecionado || SHELF_LIFE_TEST_HEADER.tipo_analise;
    setHeader({ ...SHELF_LIFE_TEST_HEADER, tipo_analise: tipoFinal, data: formatDate(new Date()) });
    setFruits(cloneTestFruits(SHELF_LIFE_TEST_FRUITS));
    if (avancarParaLotes) setStep(2);
  };

  // Preenche o formulario com dados de teste conforme o tipo de analise.
  const preencherDadosTeste = () => {
    aplicarDadosTestePorTipo(header.tipo_analise, { avancarParaLotes: true });
  };

  // Controla a acao do botao principal em cada passo: avanca o formulario ou salva no ultimo passo.
  const handlePrimaryAction = () => {
    if (saving || testingPdf) return;
    if (step === 0) { commitQtdFrutosChange(); setStep(1); return; }
    if (step === 1) { setStep(2); return; }
    handleSave();
  };

  // Navega para um passo especifico ao clicar no indicador de progresso, validando o passo atual.
  const handleStepNavigation = (targetStep) => {
    if (targetStep === step) return;
    if (targetStep < step) {
      setStep(targetStep);
      return;
    }
    if (step === 0) {
      const canProceed = commitQtdFrutosChange();
      if (!canProceed) return;
    }
    setStep(targetStep);
  };

  // Rola o ScrollView para manter o campo de texto focado acima do teclado.
  const handleInputFocus = (event) => {
    const target = event?.target ?? event?.nativeEvent?.target;
    if (!target || !scrollViewRef.current?.scrollResponderScrollNativeHandleToKeyboard) return;
    setTimeout(() => {
      scrollViewRef.current.scrollResponderScrollNativeHandleToKeyboard(target, 90, true);
    }, 60);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F7F2" />

      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={GREEN} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={require('../../../assets/logoagrodann.png')} style={styles.logo} resizeMode="contain" />
          <View style={{ width: 1, height: 18, backgroundColor: '#2E7D32' }} />
          <Image source={require('../../../../assets/CQLETRA.png')} style={styles.logoCQ} resizeMode="contain" />
        </View>
        {!editingFormId && (
          <TouchableOpacity onPress={openHistory} style={styles.historyBtn} activeOpacity={0.85}>
            <MaterialIcons name="history" size={22} color={GREEN} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.stepWrap}><StepIndicator currentStep={step} onStepPress={handleStepNavigation} /></View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === 'ios' ? 130 : keyboardHeight + 130 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <TouchableOpacity onPress={preencherDadosTeste} style={styles.btnTeste}>
            <Text style={styles.btnTesteText}>Preencher dados de teste (tipo selecionado)</Text>
          </TouchableOpacity>
        )}

        {step === 0 && (
          <View style={styles.card}>
            <SelectField label="Tipo de Analise" required value={header.tipo_analise} onPress={() => setShowTipoModal(true)} placeholder="Selecione o tipo" />
            <SelectField
              label="Fazenda"
              required
              value={header.fazenda_talhao}
              onPress={() => setShowFarmModal(true)}
              placeholder="Selecione a fazenda"
            />
            <SelectField
              label="Talhao"
              required
              value={header.talhao}
              onPress={() => setShowTalhaoModal(true)}
              placeholder={!header.fazenda_talhao ? 'Selecione a fazenda primeiro' : 'Selecione o talhao'}
              disabled={!header.fazenda_talhao}
            />
            <FieldInput
              label="Data"
              required
              value={header.data}
              onChangeText={handleDateChange}
              placeholder="dd/mm/aaaa"
              onFocus={handleInputFocus}
            />
            <FieldInput label="Semana" value={String(header.semana ?? '')} placeholder="Automatica" editable={false} />
            <FieldInput
              label="Controle"
              required
              value={header.controle}
              onChangeText={(value) => updateHeader('controle', normalizeIntegerInput(value))}
              placeholder="Ex: 145"
              keyboardType="number-pad"
              onFocus={handleInputFocus}
            />
            <SelectField label="Variedade" required value={header.variedade} onPress={() => setShowVarModal(true)} placeholder="Selecione a variedade" />
            <FieldInput
              label="Qtd. de frutos"
              required
              value={header.qtd_frutos}
              onChangeText={handleQtdFrutosChange}
              onBlur={commitQtdFrutosChange}
              placeholder="Ex: 10"
              keyboardType="number-pad"
              onFocus={handleInputFocus}
            />
            <SelectField label="Criterio" value={header.criterio} onPress={() => setShowCriterioModal(true)} placeholder="Selecione..." />
            <FieldInput
              label="Observacoes"
              value={header.observacoes}
              onChangeText={(value) => updateHeader('observacoes', value)}
              placeholder="Observacoes gerais"
              multiline
              onFocus={() => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 120)}
            />
            <FieldInput
              label="Peso final da caixa"
              value={header.peso_final_caixa}
              onChangeText={(value) => updateHeader('peso_final_caixa', normalizeDecimalInput(value))}
              placeholder="Ex: 22.50"
              keyboardType="decimal-pad"
              onFocus={() => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 120)}
            />
          </View>
        )}

        {step === 1 && isProducao && (
          <View style={styles.fotoProdWrap}>
            {PRODUCAO_FOTO_CAMPOS.map(({ key, label }) => {
              const lista = fotosProducao[key] || [];
              const salvas = existingFotosProducao[key] || [];
              const totalFotos = salvas.length + lista.length;
              return (
                <View key={key} style={styles.fotoProdCard}>
                  <Text style={styles.fotoProdTitle}>{label}</Text>
                  <View style={styles.fotoProdBtnRow}>
                    <TouchableOpacity style={styles.fotoProdBtn} onPress={() => addFromGalleryProducao(key)} activeOpacity={0.85}>
                      <MaterialIcons name="photo-library" size={18} color={GREEN} />
                      <Text style={styles.fotoProdBtnText}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.fotoProdBtn} onPress={() => addFromCameraProducao(key)} activeOpacity={0.85}>
                      <MaterialIcons name="camera-alt" size={18} color={GREEN} />
                      <Text style={styles.fotoProdBtnText}>Câmera</Text>
                    </TouchableOpacity>
                  </View>
                  {totalFotos === 0 ? (
                    <View style={styles.fotoProdEmpty}>
                      <MaterialIcons name="image-not-supported" size={20} color="#BDBDBD" />
                      <Text style={styles.fotoProdEmptyText}>Nenhuma foto adicionada</Text>
                    </View>
                  ) : (
                    <View style={styles.photoGrid}>
                      {salvas.map((item, index) => (
                        <View key={`${key}-saved-${index}`} style={styles.thumb}>
                          <Image source={{ uri: item.uri }} style={styles.thumbImg} resizeMode="cover" />
                          <View style={[styles.thumbBadge, { backgroundColor: '#2E7D32' }]}>
                            <Text style={styles.thumbBadgeText}>✓</Text>
                          </View>
                          <View style={styles.thumbBar}>
                            <TouchableOpacity onPress={() => removeExistingFotoProducaoAt(key, index)}>
                              <MaterialIcons name="delete" size={18} color="#E74C3C" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                      {lista.map((uri, index) => (
                        <View key={`${key}-new-${index}`} style={styles.thumb}>
                          <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
                          <View style={styles.thumbBadge}>
                            <Text style={styles.thumbBadgeText}>{salvas.length + index + 1}</Text>
                          </View>
                          <View style={styles.thumbBar}>
                            <TouchableOpacity onPress={() => removeFotoProducaoAt(key, index)}>
                              <MaterialIcons name="delete" size={18} color="#E74C3C" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                      <TouchableOpacity style={styles.thumbAdd} onPress={() => addFromGalleryProducao(key)} activeOpacity={0.85}>
                        <MaterialIcons name="add-photo-alternate" size={30} color={GREEN} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {step === 1 && !isProducao && (
          <View style={styles.card}>
            <TouchableOpacity style={styles.uploadZone} onPress={addFromGallery} activeOpacity={0.85}>
              <View style={styles.uploadIcon}>
                <MaterialIcons name="add-a-photo" size={36} color={GREEN} />
              </View>
              <Text style={styles.uploadTitle}>Adicionar fotos</Text>
              <Text style={styles.uploadSub}>
                {(existingFotosSalvas.length + fotos.length) > 0
                  ? `${existingFotosSalvas.length + fotos.length} foto(s) adicionada(s)`
                  : 'Toque para selecionar da galeria'}
              </Text>
            </TouchableOpacity>

            {(existingFotosSalvas.length > 0 || fotos.length > 0) && (
              <View style={styles.photoGrid}>
                {existingFotosSalvas.map((item, index) => {
                  const uri = buildAbsoluteApiUrl(item.url || item.caminho_relativo || '');
                  if (!uri) return null;
                  return (
                    <View key={`saved-${index}`} style={styles.thumb}>
                      <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
                      <View style={[styles.thumbBadge, { backgroundColor: '#2E7D32' }]}>
                        <Text style={styles.thumbBadgeText}>✓</Text>
                      </View>
                      <View style={styles.thumbBar}>
                        <TouchableOpacity onPress={() => removeExistingFotoSalvaAt(index)}>
                          <MaterialIcons name="delete" size={18} color="#E74C3C" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                {fotos.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.thumb}>
                    <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
                    <View style={styles.thumbBadge}>
                      <Text style={styles.thumbBadgeText}>{existingFotosSalvas.length + index + 1}</Text>
                    </View>
                    <View style={styles.thumbBar}>
                      <TouchableOpacity onPress={() => removeFotoAt(index)}>
                        <MaterialIcons name="delete" size={18} color="#E74C3C" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                <TouchableOpacity style={styles.thumbAdd} onPress={addFromGallery} activeOpacity={0.85}>
                  <MaterialIcons name="add-photo-alternate" size={30} color={GREEN} />
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.cameraBtn} onPress={addFromCamera} activeOpacity={0.85}>
              <MaterialIcons name="camera-alt" size={20} color={GREEN} />
              <Text style={styles.cameraBtnText}>Tirar foto com a camera</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          !fruits.length ? (
            <View style={styles.emptyBox}>
              <MaterialIcons name="inbox" size={30} color="#9E9E9E" />
              <Text style={styles.emptyText}>Nenhum fruto gerado para lancamento em lote.</Text>
            </View>
          ) : (
            <View>
              <View style={styles.batchTableWrap}>
                <Text style={styles.batchSectionTitle}>Lancamento em lotes</Text>
                {loteRows.map((row, rowIndex) => {
                  const fruit = fruits[row.fruitIndex];
                  const isMat = row.criterio === 'Maturação';
                  const prevIsMat = rowIndex > 0 && loteRows[rowIndex - 1].criterio === 'Maturação';
                  const colsChanged = isMat !== prevIsMat;
                  const showHeader = rowIndex === 0 || (colsChanged && loteRows[rowIndex - 1].criterio !== row.criterio);
                  return (
                    <View key={`batch-row-${row.numero_fruto}-${row.criterio}`}>
                      {showHeader && (
                        <View style={styles.batchHeaderRow}>
                          <Text style={[styles.batchHeaderCell, isMat ? styles.batchColCriterio : styles.batchColCriterioNoDanos]}>CRITERIO</Text>
                          <Text style={[styles.batchHeaderCell, isMat ? styles.batchColFruto : styles.batchColFrutoNoDanos]}>FRUTO</Text>
                          <Text style={[styles.batchHeaderCell, isMat ? styles.batchColValor : styles.batchColValorNoDanos]}>VALOR</Text>
                          {isMat && <Text style={[styles.batchHeaderCell, styles.batchColDanos, { borderRightWidth: 0 }]}>DANOS</Text>}
                        </View>
                      )}
                      <View style={[styles.batchDataRow, rowIndex % 2 === 0 ? styles.batchRowOdd : styles.batchRowEven]}>
                        <Text style={[styles.batchTextCell, isMat ? styles.batchColCriterio : styles.batchColCriterioNoDanos, styles.batchCellBorderRight, styles.batchCriterionText]}>
                          {row.criterio}
                        </Text>
                        <Text style={[styles.batchTextCell, isMat ? styles.batchColFruto : styles.batchColFrutoNoDanos, styles.batchCellBorderRight]}>{row.numero_fruto}</Text>
                        <View style={isMat ? styles.batchColValor : styles.batchColValorNoDanos}>
                          <TextInput
                            style={styles.batchValueInput}
                            value={getLoteValue(fruit, row.criterio)}
                            onChangeText={(value) => updateLoteValue(row.fruitIndex, row.criterio, normalizeDecimalInput(value))}
                            onFocus={handleInputFocus}
                            keyboardType="decimal-pad"
                            placeholder="insira o valor"
                            placeholderTextColor="#9D9D9D"
                          />
                        </View>
                        {isMat && (
                          <View style={styles.batchColDanos}>
                            <TouchableOpacity
                              style={styles.batchDanosSelect}
                              onPress={() => {
                                setDanosModalFruitIndex(row.fruitIndex);
                                setShowDanosModal(true);
                              }}
                              activeOpacity={0.8}
                            >
                              <Text
                                style={[
                                  styles.batchDanosSelectText,
                                  !getLoteValue(fruit, 'Maturação_danos') && styles.batchDanosSelectPlaceholder,
                                  !!getLoteValue(fruit, 'Maturação_danos') && { color: '#0B8A43', fontWeight: '600' },
                                ]}
                                numberOfLines={2}
                              >
                                {getLoteValue(fruit, 'Maturação_danos') || 'Selecione...'}
                              </Text>
                              <MaterialIcons name="keyboard-arrow-down" size={18} color="#7E8A81" />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <TouchableOpacity
        style={[styles.fabIconOnly, { bottom: floatingButtonsBottom }, (saving || testingPdf) && { opacity: 0.65 }]}
        onPress={handlePrimaryAction}
        activeOpacity={0.85}
        disabled={saving || testingPdf}
      >
        <MaterialIcons
          name={saving || testingPdf ? 'hourglass-empty' : step === STEPS_TOTAL - 1 ? 'save' : 'arrow-forward'}
          size={30}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      <Modal
        visible={showHistoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowHistoryModal(false);
          setSelectedHistory(null);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowHistoryModal(false);
            setSelectedHistory(null);
          }}
        >
          <Pressable style={[styles.modalCard, styles.historyCard, selectedHistory ? { height: '80%' } : {}]} onPress={() => {}}>
            <View style={styles.historyHeaderRow}>
              <Text style={styles.modalTitle}>{selectedHistory ? 'Detalhes do Historico' : 'Historico de Analises'}</Text>
              <TouchableOpacity
                style={styles.historyCloseBtn}
                onPress={() => {
                  if (selectedHistory) setSelectedHistory(null);
                  else setShowHistoryModal(false);
                }}
              >
                <MaterialIcons name={selectedHistory ? 'arrow-back' : 'close'} size={20} color={GREEN} />
              </TouchableOpacity>
            </View>

            {!selectedHistory ? (
              historyLoading ? (
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>Carregando historico...</Text>
                </View>
              ) : historyItems.length === 0 ? (
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>Nenhum registro salvo ainda.</Text>
                </View>
              ) : (
                <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                  {historyItems.map((item, idx) => {
                    const itemKey = String(item?.form_id || item?.id || `hist-${idx}`);
                    return (
                      <TouchableOpacity
                        key={itemKey}
                        style={styles.historyItem}
                        onPress={() => openHistoryDetails(item)}
                        activeOpacity={0.85}
                      >
                        <View style={{ flex: 1, marginRight: 10 }}>
                          <Text style={styles.historyItemTitle} numberOfLines={3}>{buildHistoryListLabel(item)}</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={20} color="#7E8A81" />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )
            ) : historyDetailLoading ? (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>Carregando detalhes...</Text>
              </View>
            ) : (() => {
              const payload = getRecordPayload(selectedHistory) || {};
              const lotes = Array.isArray(payload?.lotes) ? payload.lotes : [];
              const fotosSalvas = Array.isArray(payload?.fotos_salvas) ? payload.fotos_salvas : [];
              const fotosProd = payload?.fotos_producao && typeof payload.fotos_producao === 'object'
                ? payload.fotos_producao
                : {};
              return (
                <View style={{ flex: 1 }}>
                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 8 }}>
                    <View style={styles.historySection}>
                      <Text style={styles.historySectionTitle}>Cabecalho</Text>
                      <Text style={styles.historyLine}>Tipo: {payload?.tipo_analise || '-'}</Text>
                      <Text style={styles.historyLine}>Fazenda: {payload?.fazenda_talhao || payload?.fazenda || '-'}</Text>
                      <Text style={styles.historyLine}>Talhao: {payload?.talhao || '-'}</Text>
                      <Text style={styles.historyLine}>Data: {payload?.data || payload?.data_ref || '-'}</Text>
                      <Text style={styles.historyLine}>Semana: {payload?.semana ?? '-'}</Text>
                      <Text style={styles.historyLine}>Controle: {payload?.controle ?? '-'}</Text>
                      <Text style={styles.historyLine}>Variedade: {payload?.variedade || '-'}</Text>
                      <Text style={styles.historyLine}>Qtd frutos: {payload?.qtd_frutos ?? '-'}</Text>
                    </View>

                    <View style={styles.historySection}>
                      <Text style={styles.historySectionTitle}>Fotos</Text>
                      <Text style={styles.historyLine}>Fotos gerais: {fotosSalvas.length}</Text>
                      {PRODUCAO_FOTO_CAMPOS.map(({ key, label }) => (
                        <Text key={key} style={styles.historyLine}>{label}: {(fotosProd?.[key] || []).length}</Text>
                      ))}
                    </View>

                    <View style={styles.historySection}>
                      <Text style={styles.historySectionTitle}>Lotes</Text>
                      <Text style={styles.historyLine}>Total de lotes: {lotes.length}</Text>
                      {lotes.slice(0, 30).map((lote, idx) => (
                        <Text key={`lote-${idx}`} style={styles.historyLineSmall}>
                          Fruto {lote?.numero_fruto ?? '-'} | {lote?.criterio || '-'}: {lote?.valor ?? '-'} {lote?.danos_internos ? `| Danos: ${lote.danos_internos}` : ''}
                        </Text>
                      ))}
                      {lotes.length > 30 && <Text style={styles.historyLineSmall}>... e mais {lotes.length - 30} lote(s)</Text>}
                    </View>
                  </ScrollView>

                  <View style={[styles.historyActionsRow, { marginTop: 8 }]}>
                    <TouchableOpacity
                      style={[styles.historyActionBtn, styles.historyActionEdit]}
                      onPress={() => loadHistoryToForm(selectedHistory)}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name="edit" size={17} color="#FFFFFF" />
                      <Text style={styles.historyActionText}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.historyActionBtn, styles.historyActionDelete]}
                      onPress={() => {
                        Alert.alert(
                          'Apagar registro',
                          'Deseja apagar este registro do historico?',
                          [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Apagar', style: 'destructive', onPress: () => handleDeleteHistory(selectedHistory) },
                          ],
                        );
                      }}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name="delete" size={17} color="#FFFFFF" />
                      <Text style={styles.historyActionText}>Apagar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      <SearchListModal
        visible={showFarmModal}
        title="Selecionar Fazenda"
        options={fazendas}
        emptyText="Nenhuma fazenda encontrada."
        onSelect={(farm) => setHeader((prev) => ({ ...prev, fazenda_talhao: farm, talhao: '' }))}
        onClose={() => setShowFarmModal(false)}
        searchPlaceholder="Buscar fazenda..."
        allowCreate
        createLabel={(value) => `Cadastrar fazenda "${value}"`}
        onCreate={handleCreateFarm}
      />

      <SearchListModal
        visible={showTalhaoModal}
        title="Selecionar Talhao"
        options={talhoesDaFazenda}
        emptyText="Nenhum talhao encontrado para esta fazenda."
        onSelect={(talhao) => updateHeader('talhao', talhao)}
        onClose={() => setShowTalhaoModal(false)}
        searchPlaceholder="Buscar talhao..."
        allowCreate={!!header.fazenda_talhao}
        createLabel={(value) => `Cadastrar talhao "${value}"`}
        onCreate={handleCreateTalhao}
      />

      <SearchListModal
        visible={showVarModal}
        title="Selecionar Variedade"
        options={VARIEDADES}
        emptyText="Nenhuma variedade encontrada."
        onSelect={(v) => updateHeader('variedade', v)}
        onClose={() => setShowVarModal(false)}
        searchPlaceholder="Buscar variedade..."
      />

      <SearchListModal
        visible={showCriterioModal}
        title="Criterio"
        options={criterioModalOptions}
        emptyText="Nenhum criterio encontrado."
        onSelect={(v) => updateHeader('criterio', v === 'Selecione...' ? '' : v)}
        onClose={() => setShowCriterioModal(false)}
        searchPlaceholder="Buscar criterio..."
      />

      <SearchListModal
        visible={showTipoModal}
        title="Tipo de Analise"
        options={tiposAnaliseOptions}
        emptyText="Nenhum tipo encontrado."
        onSelect={(v) => updateHeader('tipo_analise', v)}
        onClose={() => setShowTipoModal(false)}
        searchPlaceholder="Buscar tipo..."
      />

      <SearchListModal
        visible={showDanosModal}
        title="Danos Internos"
        options={danosOptions}
        emptyText="Nenhum dano encontrado."
        selectedValue={danosModalFruitIndex !== null ? getLoteValue(fruits[danosModalFruitIndex], 'Maturação_danos') : ''}
        onSelect={(v) => {
          if (danosModalFruitIndex !== null) {
            updateLoteValue(danosModalFruitIndex, 'Maturação_danos', v);
          }
        }}
        onClose={() => { setShowDanosModal(false); setDanosModalFruitIndex(null); }}
        searchPlaceholder="Buscar dano..."
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  btnTeste: { marginHorizontal: 16, marginTop: 10, marginBottom: 4, backgroundColor: '#FFF3CD', borderWidth: 1, borderColor: '#FFC107', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  btnTesteText: { color: '#856404', fontWeight: 'bold', fontSize: 13 },
  safe: { flex: 1, backgroundColor: '#F4F7F2' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8ECE7' },
  backBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EDF4EE' },
  logo: { width: 110, height: 28 },
  logoCQ: { width: 38, height: 18 },
  historyBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EDF4EE' },
  rightSpace: { width: 42 },
  stepWrap: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8ECE7', paddingVertical: 12, paddingHorizontal: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  stepItem: { flex: 1, alignItems: 'center', position: 'relative' },
  lineLeft: { position: 'absolute', top: 14, right: '50%', left: 0, height: 2, backgroundColor: '#CFD8CE' },
  lineRight: { position: 'absolute', top: 14, left: '50%', right: 0, height: 2, backgroundColor: '#CFD8CE' },
  lineGreen: { backgroundColor: GREEN },
  stepCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#CFD8CE', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  stepCircleActive: { backgroundColor: GREEN },
  stepCircleDone: { backgroundColor: GREEN },
  stepNumber: { color: '#6D7770', fontWeight: '800', fontSize: 12 },
  stepNumberActive: { color: '#FFFFFF' },
  stepLabel: { fontSize: 10, color: '#AAAAAA', marginTop: 6, textAlign: 'center' },
  stepLabelActive: { color: GREEN, fontWeight: '700', fontSize: 11 },
  stepLabelDone: { color: GREEN },
  scroll: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 130 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E6ECE6' },
  fieldWrap: { marginTop: 12 },
  fieldLabel: { fontSize: 13, color: '#3F4F45', fontWeight: '600', marginBottom: 6 },
  required: { color: '#D84315' },
  fieldInput: { borderWidth: 1, borderColor: '#DCE4DB', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#FAFCFA', fontSize: 14, color: '#223329' },
  fieldInputMultiline: { minHeight: 88, paddingTop: 10 },
  fieldInputDisabled: { backgroundColor: '#F0F3F0', color: '#8A9A8E' },
  selectInput: { minHeight: 47, borderWidth: 1, borderColor: '#DCE4DB', borderRadius: 12, backgroundColor: '#FAFCFA', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectInputDisabled: { backgroundColor: '#F0F3F0', borderColor: '#E1E7E2' },
  selectText: { flex: 1, fontSize: 14, color: '#223329', marginRight: 10 },
  selectPlaceholder: { color: '#8E9A91' },
  uploadZone: {
    borderWidth: 2,
    borderColor: GREEN,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  uploadIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EDF6EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: 4 },
  uploadSub: { fontSize: 13, color: '#7C8A80', textAlign: 'center' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  thumb: { width: '30%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: '#EEEEEE' },
  thumbImg: { width: '100%', height: '100%' },
  thumbBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  thumbBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  thumbBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.88)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  thumbAdd: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: GREEN,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EDF6EE',
  },
  cameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 12,
    paddingVertical: 13,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  cameraBtnText: { fontSize: 14, fontWeight: '700', color: GREEN },
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E6ECE6', padding: 18, alignItems: 'center' },
  emptyText: { marginTop: 8, textAlign: 'center', color: '#6A746D', fontSize: 13, lineHeight: 19 },
  batchTableWrap: { backgroundColor: '#FFFFFF', borderRadius: 4, borderWidth: 1, borderColor: '#C7C7C7', overflow: 'hidden' },
  batchSectionTitle: { textAlign: 'center', fontSize: 20, fontWeight: '800', color: '#1E1E1E', paddingVertical: 12, backgroundColor: '#FFFFFF' },
  batchHeaderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#CFCFCF', borderBottomWidth: 1, borderBottomColor: '#CFCFCF' },
  batchHeaderCell: { fontSize: 13, fontWeight: '800', color: '#161616', paddingVertical: 10, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: '#CFCFCF' },
  batchDataRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#CFCFCF' },
  batchRowOdd: { backgroundColor: '#FFFFFF' },
  batchRowEven: { backgroundColor: '#FFFFFF' },
  fruitColCriterio: { flex: 3.6 },
  fruitColFruto: { flex: 1.2 },
  fruitColValor: { flex: 2.8, paddingHorizontal: 10, justifyContent: 'center' },
  batchColCriterio: { flex: 2.7 },
  batchColFruto: { flex: 1.1 },
  batchColValor: { flex: 2.2, paddingHorizontal: 10, justifyContent: 'center' },
  batchColDanos: { flex: 2.4, paddingHorizontal: 10, justifyContent: 'center' },
  batchColCriterioNoDanos: { flex: 3.8 },
  batchColFrutoNoDanos: { flex: 1.2 },
  batchColValorNoDanos: { flex: 3.1, paddingHorizontal: 10, justifyContent: 'center' },
  batchCellBorderRight: { borderRightWidth: 1, borderRightColor: '#CFCFCF' },
  batchTextCell: { fontSize: 15, color: '#101010', paddingHorizontal: 10 },
  batchCriterionText: { fontSize: 14, paddingVertical: 8 },
  batchValueInput: { height: 62, borderWidth: 1, borderColor: '#AFAFAF', borderRadius: 6, backgroundColor: '#FFFFFF', fontSize: 16, color: '#2A2A2A', paddingHorizontal: 12 },
  batchDanosSelect: { height: 62, borderWidth: 1, borderColor: '#AFAFAF', borderRadius: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' },
  batchDanosSelectText: { flex: 1, fontSize: 15, color: '#2A2A2A', marginRight: 6 },
  batchDanosSelectPlaceholder: { color: '#9A9A9A' },
  batchTableGap: { marginTop: 14 },
  fabIconOnly: { position: 'absolute', right: 20, bottom: 24, width: 68, height: 68, borderRadius: 34, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 7 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalCard: { width: '100%', maxHeight: '75%', backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E4EBE5', padding: 16 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#25352B', marginBottom: 10, textAlign: 'center' },
  searchWrap: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#DBE4DC', backgroundColor: '#F8FBF8', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, marginLeft: 8, color: '#24332A', fontSize: 14 },
  modalList: { maxHeight: 360 },
  modalCreateItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#DDE8DE' },
  modalCreateItemText: { flex: 1, fontSize: 14, color: GREEN, fontWeight: '700' },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEF3EE' },
  modalItemText: { flex: 1, fontSize: 14, color: '#2E3D33', marginRight: 12 },
  modalEmpty: { paddingVertical: 24, alignItems: 'center' },
  modalEmptyText: { fontSize: 13, color: '#7B877F', textAlign: 'center' },
  historyCard: { maxHeight: '82%', flexDirection: 'column' },
  historyHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  historyCloseBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF4EE' },
  historyItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEF3EE' },
  historyItemTitle: { fontSize: 13, color: '#2E3D33', lineHeight: 19 },
  historySection: { backgroundColor: '#F7FAF7', borderRadius: 12, borderWidth: 1, borderColor: '#E2EAE3', padding: 10, marginBottom: 10 },
  historySectionTitle: { fontSize: 13, fontWeight: '800', color: '#1F3527', marginBottom: 8 },
  historyLine: { fontSize: 12, color: '#2E3D33', marginBottom: 3 },
  historyLineSmall: { fontSize: 11, color: '#4D5E53', marginBottom: 3 },
  historyActionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  historyActionBtn: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  historyActionEdit: { backgroundColor: '#2E7D32' },
  historyActionDelete: { backgroundColor: '#C62828' },
  historyActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  fotoProdWrap: { gap: 12 },
  fotoProdCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E6ECE6' },
  fotoProdTitle: { fontSize: 15, fontWeight: '800', color: '#1A3D22', marginBottom: 12 },
  fotoProdBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  fotoProdBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: GREEN, borderRadius: 10, paddingVertical: 10, backgroundColor: '#F4FAF4' },
  fotoProdBtnText: { fontSize: 13, fontWeight: '700', color: GREEN },
  fotoProdEmpty: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  fotoProdEmptyText: { fontSize: 13, color: '#BDBDBD' },
});


