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
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import {
  ActivityIndicator,
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
const ORANGE = '#F39C12';
const LGREEN = '#E8F5E9';
const STEPS_TOTAL = 4;

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
const FAZENDA_TALHAO_LISTA_DESCRICAO = 'lista_fazenda_talhao';
const CACHE_TIPOS_ANALISE_KEY = '@analise_frutos:tipos_analise';
const DANOS_LISTA_DESCRICAO = 'lista_danos_internos';
const CACHE_DANOS_KEY = '@analise_frutos:danos';
const ANALISE_FRUTOS_OFFLINE_KEY = 'analise_frutos_offline';
const STEPS = ['Cabeçalho', 'Fotos', 'Lotes', 'Prévia'];
const HISTORY_LIMIT = 100;
const FOTOS_CACHE_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}fotos_analise_cache/` : null;

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

// Calcula o número da semana ISO 8601 a partir de uma string de data dd/mm/aaaa.
function getWeekNumber(dateStr) {
  try {
    const [day, month, year] = String(dateStr).split('/');
    if (!day || !month || !year) return '';
    const d = new Date(`${year}-${month}-${day}`);
    if (isNaN(d.getTime())) return '';
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const yearStart = new Date(date.getFullYear(), 0, 4);
    const week = 1 + Math.round(((date - yearStart) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7);
    return String(week);
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
  const name = String(value || '')
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  if (name === 'FRUTOS DA ILHA 1' || name === 'FRUTOS DA ILHA 2') return 'FRUTOS DA ILHA';
  return name;
}

const MONTHS_PT_AF = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAYS_PT_AF   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const calStAF = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  monthYear:    { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  dayRow:       { flexDirection: 'row', marginBottom: 4 },
  dayName:      { width: '14.28%', textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#AAAAAA', paddingVertical: 4 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap' },
  cell:         { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  cellSel:      { backgroundColor: '#2E7D32', borderRadius: 999 },
  cellToday:    { borderWidth: 1.5, borderColor: '#2E7D32', borderRadius: 999 },
  cellTxt:      { fontSize: 14, color: '#222' },
  cellTxtSel:   { color: '#fff', fontWeight: '700' },
  cellTxtToday: { color: '#2E7D32', fontWeight: '700' },
});

function CustomCalendarAF({ value, onChange }) {
  const today = new Date();
  const initial = value instanceof Date ? value : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    if (value instanceof Date) { setViewYear(value.getFullYear()); setViewMonth(value.getMonth()); }
  }, [value]);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selDay   = value instanceof Date ? value.getDate()     : null;
  const selMonth = value instanceof Date ? value.getMonth()    : null;
  const selYear  = value instanceof Date ? value.getFullYear() : null;

  return (
    <View>
      <View style={calStAF.header}>
        <TouchableOpacity onPress={() => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="chevron-left" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={calStAF.monthYear}>{MONTHS_PT_AF[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={() => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="chevron-right" size={28} color="#333" />
        </TouchableOpacity>
      </View>
      <View style={calStAF.dayRow}>
        {DAYS_PT_AF.map(d => <Text key={d} style={calStAF.dayName}>{d}</Text>)}
      </View>
      <View style={calStAF.grid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={`e${idx}`} style={calStAF.cell} />;
          const isSel = day === selDay && viewMonth === selMonth && viewYear === selYear;
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          return (
            <TouchableOpacity key={`d${day}`} style={[calStAF.cell, isSel && calStAF.cellSel, !isSel && isToday && calStAF.cellToday]} onPress={() => onChange(new Date(viewYear, viewMonth, day))} activeOpacity={0.7}>
              <Text style={[calStAF.cellTxt, isSel && calStAF.cellTxtSel, !isSel && isToday && calStAF.cellTxtToday]}>{day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function DateModalAF({ visible, current, onConfirm, onClose }) {
  const [temp, setTemp] = useState(current instanceof Date ? current : new Date());
  useEffect(() => { if (visible) setTemp(current instanceof Date ? current : new Date()); }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: 320, maxWidth: '92%' }} onPress={e => e.stopPropagation()}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 16, textAlign: 'center' }}>Selecionar Data</Text>
          <CustomCalendarAF value={temp} onChange={setTemp} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <TouchableOpacity style={{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#CCC', alignItems: 'center' }} onPress={onClose}>
              <Text style={{ color: '#555', fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#2E7D32', alignItems: 'center' }} onPress={() => { onConfirm(temp); onClose(); }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Retorna o estado inicial do cabecalho do formulario com a data de hoje e a fazenda do usuario.
function createInitialHeader(userFarm = '') {
  const today = formatDate(new Date());
  return {
    tipo_analise: '',
    fazenda_talhao: '',
    talhao: '',
    safra: 'M26',
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

  const INVALIDOS = /^sem[_\s](fazenda|talhao|nome|variedade)$/i;

  lists
    .flat()
    .forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const fazenda = String(item?.fazenda || '').trim();
      if (!fazenda || INVALIDOS.test(fazenda)) return;
      const talhao = String(item?.talhao || '').trim();
      if (INVALIDOS.test(talhao)) return;
      const key = `${normalizeFarmName(fazenda)}::${normalizeFarmName(talhao)}`;
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
  const userFirstName = useMemo(() => {
    const rawName = String(user?.nome || user?.name || user?.userName || '').trim();
    return rawName ? rawName.split(/\s+/)[0] : '';
  }, [user?.name, user?.nome, user?.userName]);
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
  const [showTipoModal, setShowTipoModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [tiposAnaliseOptions, setTiposAnaliseOptions] = useState(() => [...TIPOS_ANALISE_PADRAO]);
  const [fotos, setFotos] = useState([]);
  const [fotosProducao, setFotosProducao] = useState({ ...INITIAL_FOTOS_PRODUCAO });
  const [saving, setSaving] = useState(false);
  const [testingPdf, setTestingPdf] = useState(false);
  const [pdfBase64, setPdfBase64] = useState(null);
  const [previewPdfUri, setPreviewPdfUri] = useState('');
  const [previewPdfUrl, setPreviewPdfUrl] = useState('');

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [danosOptions, setDanosOptions] = useState([]);
  const [showDanosModal, setShowDanosModal] = useState(false);
  const [danosModalFruitIndex, setDanosModalFruitIndex] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showOfflineSavedModal, setShowOfflineSavedModal] = useState(false);
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
  const criteriosLoteOptions = isShelfLife ? [...CRITERIOS_BASE, 'Peso (g)'] : (isPreColheita || isProducao || isAcompanhamento) ? CRITERIOS_PRE_COLHEITA : CRITERIOS_LOTE;
  const loteRows = criteriosLoteOptions.flatMap((criterio) => fruits.map((fruit, fruitIndex) => ({
    fruitIndex,
    numero_fruto: fruit.numero_fruto,
    criterio,
  })));

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef(null);
  const previewAutoRequestedRef = useRef(false);
  const previewLogoRef = useRef('');

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
      // Carrega apenas da Oracle (lista_fazenda_talhao) — sem misturar com /talhoes local
      let listaFazendaTalhao = [];

      try {
        const responseListaValores = await api.get(LISTA_ENDPOINT_RELATIVO, {
          params: { comando: LISTA_VALORES_SQL },
        });
        const rows = extractGenericRows(responseListaValores?.data ?? responseListaValores);
        listaFazendaTalhao = rows
          .filter((row) => String(getFieldValue(row, 'descricao_lista') || '').trim().toLowerCase() === FAZENDA_TALHAO_LISTA_DESCRICAO)
          .map((row) => {
            const valor = String(getFieldValue(row, 'valor') || '').trim();
            const sepIdx = valor.indexOf(' - ');
            if (sepIdx === -1) return { fazenda: valor, talhao: '' };
            return {
              fazenda: valor.substring(0, sepIdx).trim(),
              talhao: valor.substring(sepIdx + 3).trim(),
            };
          })
          .filter((item) => item.fazenda);

        console.log('[AnaliseFrutos] Oracle lista_fazenda_talhao:', listaFazendaTalhao.length, 'itens');
      } catch (e) {
        console.warn('[AnaliseFrutos] Falha ao carregar lista_fazenda_talhao:', e?.message);
      }

      try {
        if (listaFazendaTalhao.length > 0) {
          // Mescla Oracle com entradas locais do cache que não existem na Oracle
          const finalList = mergeTalhoesLists(listaFazendaTalhao, cachedList);
          applyTalhoes(finalList);
          await AsyncStorage.setItem(CACHE_TALHOES_KEY, JSON.stringify(finalList));
        } else if (cachedList.length > 0) {
          // Offline: usa cache local
          applyTalhoes(cachedList);
        }
      } catch (error) {
        console.warn('[AnaliseFrutos] Falha ao aplicar listas de talhoes:', error?.message);
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

  // Gera a prévia quando entra no passo 3
  useEffect(() => {
    if (step === 3 && !pdfBase64 && !isGeneratingPdf && !previewAutoRequestedRef.current) {
      previewAutoRequestedRef.current = true;
      gerarPdfParaVisualizacao();
    }
  }, [step, pdfBase64, isGeneratingPdf]);

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

  const clearPreviewState = () => {
    setPdfBase64(null);
    setPreviewPdfUri('');
    setPreviewPdfUrl('');
    setIsGeneratingPdf(false);
    previewAutoRequestedRef.current = false;
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
    clearPreviewState();
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

  // Ajusta a lista de frutos para a quantidade informada sem pedir confirmacao.
  const adjustFruitList = (nextQty) => {
    const safeQty = Math.max(0, nextQty || 0);
    const currentQty = fruits.length;
    if (safeQty === currentQty) return true;
    if (safeQty > currentQty) {
      setFruits((prev) => (safeQty <= prev.length ? prev : [...prev, ...createFruitEntries(prev.length + 1, safeQty)]));
    } else {
      setFruits((prev) => prev.slice(0, safeQty));
    }
    return true;
  };

  // Atualiza o campo de quantidade de frutos e ajusta a lista imediatamente.
  const handleQtdFrutosChange = (value) => {
    const sanitized = normalizeIntegerInput(value);
    updateHeader('qtd_frutos', sanitized);
    const nextQty = Number.parseInt(sanitized || '0', 10) || 0;
    adjustFruitList(nextQty);
  };

  // Confirma a quantidade de frutos ao sair do campo.
  const commitQtdFrutosChange = () => {
    const nextQty = Number.parseInt(header.qtd_frutos || '0', 10) || 0;
    adjustFruitList(nextQty);
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
      const pMed = await MediaLibrary.requestPermissionsAsync();
      if (pMed.granted) await MediaLibrary.saveToLibraryAsync(uri);
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
      const pMed = await MediaLibrary.requestPermissionsAsync();
      if (pMed.granted) await MediaLibrary.saveToLibraryAsync(uri);
      setFotos((current) => [...current, uri]);
    } catch (error) {
      console.warn('[AnaliseFrutos] Falha ao tirar foto:', error?.message);
      Alert.alert('Erro', 'Nao foi possivel abrir a camera.');
    }
  };

  // Botao voltar: recua um step quando em etapas internas; navega para a tela anterior no step 0.
  const handleBack = () => {
    if (step > 0) {
      if (step === 3) clearPreviewState();
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
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
      safra: payload.safra || 'M26',
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
          .map((item) => ({
            uri: buildAbsoluteApiUrl(item.url || ''),
            url: item.url || '',
            disk_path: item.disk_path || '',
            nome: item.nome || '',
          }))
          .filter((item) => item.uri);
      });
    }

    const formId = String(record?.form_id || payload?.form_id || record?.id || '');

    setHeader({ ...restoredHeader, qtd_frutos: String(restoredFruits.length) });
    setFruits(restoredFruits);
    setFotos([]);
    setFotosProducao({ ...INITIAL_FOTOS_PRODUCAO });
    setExistingFotosSalvas(fotosSalvas);
    setExistingFotosProducao(restoredProdFotos);
    setEditingFormId(formId);
    clearPreviewState();
    setStep(0);
    setShowHistoryModal(false);
    setSelectedHistory(null);
    // Em segundo plano: baixa fotos do servidor para cache local (celular).
    // Na próxima edição usa o cache local; funciona offline após primeiro carregamento.
    Promise.allSettled([
      ...fotosSalvas.map((item) =>
        getOrDownloadFotoCache(formId, item.nome, buildAbsoluteApiUrl(item.url || ''))
          .then((localUri) => ({ tipo: 'geral', url: item.url, localUri }))
      ),
      ...PRODUCAO_FOTO_CAMPOS.flatMap(({ key }) =>
        (restoredProdFotos[key] || []).map((item) =>
          getOrDownloadFotoCache(`${formId}_${key}`, item.nome, item.uri)
            .then((localUri) => ({ tipo: 'prod', key, nome: item.nome, localUri }))
        )
      ),
    ]).then((results) => {
      // Atualiza URIs das fotos gerais para cache local quando disponível
      const geralMap = {};
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value?.tipo === 'geral' && r.value.localUri) {
          geralMap[r.value.url] = r.value.localUri;
        }
      });
      if (Object.keys(geralMap).length > 0) {
        setExistingFotosSalvas((prev) =>
          prev.map((item) => geralMap[item.url] ? { ...item, local_uri: geralMap[item.url] } : item)
        );
      }

      // Atualiza URIs das fotos de produção para cache local quando disponível
      const prodMap = {};
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value?.tipo === 'prod' && r.value.localUri) {
          const k = `${r.value.key}__${r.value.nome}`;
          prodMap[k] = r.value.localUri;
        }
      });
      if (Object.keys(prodMap).length > 0) {
        setExistingFotosProducao((prev) => {
          const next = { ...prev };
          PRODUCAO_FOTO_CAMPOS.forEach(({ key }) => {
            next[key] = (prev[key] || []).map((item) => {
              const k = `${key}__${item.nome}`;
              return prodMap[k] ? { ...item, uri: prodMap[k] } : item;
            });
          });
          return next;
        });
      }
    }).catch(() => {});
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
    const criterioPrincipal = criteriosLoteOptions[0] || '';

    return {
      ...header,
      criterio: null,
      form_id: editingFormId || undefined,
      avaliador: String(user?.nome || user?.name || '').trim(),
      avaliado: 'Controle de qualidade - Packing Manga',
      qtd_frutos: fruits.length,
      semana: Number.parseInt(header.semana || '0', 10) || null,
      controle: Number.parseInt(header.controle || '0', 10) || null,
      peso_final_caixa: null,
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

  const guessImageMime = (uri = '') => {
    const lower = String(uri || '').toLowerCase();
    if (lower.includes('.png')) return 'image/png';
    if (lower.includes('.webp')) return 'image/webp';
    return 'image/jpeg';
  };

  const resolveLogoPreviewSrc = async () => {
    if (previewLogoRef.current) return previewLogoRef.current;
    try {
      const asset = Asset.fromModule(require('../../../assets/logoagrodann.png'));
      if (!asset.localUri) await asset.downloadAsync();
      const logoUri = asset.localUri || asset.uri;
      if (!logoUri) return '';
      const base64 = await FileSystem.readAsStringAsync(logoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const dataUri = `data:image/png;base64,${base64}`;
      previewLogoRef.current = dataUri;
      return dataUri;
    } catch {
      return '';
    }
  };

  const resolvePhotoPreviewSrc = async (uri = '') => {
    const raw = String(uri || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:') || /^https?:\/\//i.test(raw)) return raw;
    try {
      const base64 = await FileSystem.readAsStringAsync(raw, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:${guessImageMime(raw)};base64,${base64}`;
    } catch {
      return raw;
    }
  };

  const dedupeUris = (uris = []) => {
    const seen = new Set();
    const result = [];
    uris.forEach((value) => {
      const uri = String(value || '').trim();
      if (!uri || seen.has(uri)) return;
      seen.add(uri);
      result.push(uri);
    });
    return result;
  };

  const buildPreviewPhotoCards = () => {
    const cards = [];
    const pushCards = (baseLabel, uris = []) => {
      if (!baseLabel || !uris.length) return;
      uris.forEach((uri, index) => {
        const label = uris.length > 1 ? `${baseLabel} ${index + 1}` : baseLabel;
        cards.push({ label, uri });
      });
    };

    // Fotos por campo (produção)
    PRODUCAO_FOTO_CAMPOS.forEach(({ key, label }) => {
      const atuais = (fotosProducao?.[key] || [])
        .map((item) => (typeof item === 'string' ? item : item?.uri))
        .filter(Boolean);
      const salvas = (existingFotosProducao?.[key] || [])
        .map((item) => item?.local_uri || item?.uri || '')
        .filter(Boolean);
      const merged = dedupeUris([...atuais, ...salvas]);
      pushCards(label, merged);
    });

    // Fotos gerais
    const geraisAtuais = (fotos || []).map((item) => String(item || '').trim()).filter(Boolean);
    const geraisSalvas = (existingFotosSalvas || [])
      .map((item) => item?.local_uri || item?.uri || buildAbsoluteApiUrl(item?.url || item?.caminho_relativo || ''))
      .filter(Boolean);
    const gerais = dedupeUris([...geraisAtuais, ...geraisSalvas]);
    if (gerais.length) {
      const baseLabel = cards.length ? 'Foto Geral' : 'Foto';
      pushCards(baseLabel, gerais);
    }

    return cards;
  };

  const resolvePreviewAssets = async () => {
    const photoCards = buildPreviewPhotoCards();
    const [logoSrc, resolvedCards] = await Promise.all([
      resolveLogoPreviewSrc(),
      Promise.all(photoCards.map(async (card) => {
        const src = await resolvePhotoPreviewSrc(card.uri);
        if (!src) return null;
        return { ...card, src };
      })),
    ]);
    return { logoSrc, photoCards: resolvedCards.filter(Boolean) };
  };

  // Tenta obter foto do cache local (celular); se não existir, baixa do servidor e salva no cache.
  const getOrDownloadFotoCache = async (subDir, nome, serverUrl) => {
    if (!FOTOS_CACHE_DIR || !subDir || !nome || !serverUrl) return null;
    const cacheDir = `${FOTOS_CACHE_DIR}${subDir}/`;
    const localPath = `${cacheDir}${nome}`;
    try {
      const info = await FileSystem.getInfoAsync(localPath);
      if (info.exists) return localPath;
      await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
      const result = await FileSystem.downloadAsync(serverUrl, localPath);
      if (result.status === 200) return localPath;
    } catch {}
    return null;
  };

  // Abre/compartilha o PDF de teste retornado pelo backend.
  const openTestePdf = async (pdfUrl, localFileUri = '') => {
    const absoluteUrl = buildAbsoluteApiUrl(pdfUrl);
    let shareUri = String(localFileUri || '').trim();

    if (!shareUri) {
      if (!absoluteUrl) {
        throw new Error('URL do PDF de teste nao retornada pelo backend.');
      }
      const fileName = `analise_frutos_teste_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      const downloaded = await FileSystem.downloadAsync(absoluteUrl, fileUri);
      shareUri = downloaded.uri;
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(shareUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Teste do PDF - Analise de Frutos',
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    if (absoluteUrl) {
      const canOpen = await Linking.canOpenURL(absoluteUrl);
      if (canOpen) {
        await Linking.openURL(absoluteUrl);
        return;
      }
    }

    throw new Error('Nao foi possivel abrir o PDF de teste neste dispositivo.');
  };

  // Gera PDF de teste sem salvar registro definitivo.
  // Monta FormData a partir do payload para envio multipart.
  const buildFormData = (payload, { includePhotos = true } = {}) => {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (key === 'fotos' || key === 'fotos_producao') return;
      if (typeof value === 'object' && value !== null) {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, value == null ? '' : String(value));
      }
    });
    if (!includePhotos) return formData;
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

  const gerarPdfTesteNoBackend = async ({ includePhotos = true } = {}) => {
    const formData = buildFormData(buildPayload(), { includePhotos });
    const response = await api.post('/analise-frutos/teste-pdf', formData, {
      timeout: 120000,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const pdfUrl = response?.pdf_url || response?.data?.pdf_url;
    const absoluteUrl = buildAbsoluteApiUrl(pdfUrl);
    const cacheBustedUrl = absoluteUrl
      ? `${absoluteUrl}${absoluteUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
      : '';
    if (!absoluteUrl) {
      throw new Error('URL do PDF de teste nao retornada pelo backend.');
    }
    return { pdfUrl, absoluteUrl: cacheBustedUrl };
  };

  const gerarPdfTeste = async () => {
    if (saving || testingPdf) return;
    if (!fruits.length) {
      Alert.alert('Sem frutos', 'Informe a quantidade e gere os frutos antes de testar o PDF.');
      return;
    }

    try {
      setTestingPdf(true);
      const { pdfUrl } = await gerarPdfTesteNoBackend();
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

    const fotosSalvasResumidas = {};
    if (payload.fotos_producao_salvas) {
      Object.entries(payload.fotos_producao_salvas).forEach(([campo, fotos]) => {
        fotosSalvasResumidas[campo] = Array.isArray(fotos) ? fotos.map(f => f.nome || f.uri?.split('/').pop()) : 0;
      });
    }
    console.log('\n========== [AnaliseFrutos] PAYLOAD ENVIADO ==========');
    console.log(JSON.stringify({
      form_id: payload.form_id,
      fazenda: payload.fazenda_talhao || payload.fazenda,
      talhao: payload.talhao,
      variedade: payload.variedade,
      controle: payload.controle,
      semana: payload.semana,
      tipo_analise: payload.tipo_analise,
      data: payload.data,
      avaliador: payload.avaliador,
      qtd_frutos: payload.qtd_frutos,
      fotos_count: payload.fotos_count,
      fotos_producao_salvas: fotosSalvasResumidas,
      frutos: payload.frutos,
      lotes: payload.lotes,
    }, null, 2));
    console.log('======================================================\n');

    try {
      setSaving(true);
      const response = await api.post('/analise-frutos', formData, {
        timeout: 120000,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const backendMessage = String(response?.data?.message || '').trim();
      clearPreviewState();
      Alert.alert('Registro salvo', backendMessage || 'Registro enviado com sucesso.', [
        {
          text: 'Nova analise',
          onPress: resetFormState,
        },
        { text: 'Voltar', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.warn('[AnaliseFrutos] Falha ao enviar para backend:', error?.message);
      try {
        await saveOfflineAnaliseFrutos(payload);
        clearPreviewState();
        resetFormState();
        setShowOfflineSavedModal(true);
      } catch (offlineError) {
        console.error('[AnaliseFrutos] Falha ao salvar offline:', offlineError?.message);
        Alert.alert('Falha ao salvar', 'Nao foi possivel enviar e tambem nao foi possivel salvar no sininho.');
      }
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

  // Constrói o HTML de prévia espelhando a estrutura do PDF gerado no backend
  const buildPreviewHtml = ({ logoSrc = '', photoCards = [] } = {}) => {
    const G = '#0B8A43';
    const GD = '#0A6B36';
    const OR = '#D9963F';

    const esc = (text) => {
      if (text == null) return '';
      const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return String(text).replace(/[&<>"']/g, (c) => m[c]);
    };

    const fmt = (value) => {
      const cleaned = String(value ?? '').trim();
      return cleaned === '' ? '-' : cleaned;
    };

    const toNum = (value) => {
      const parsed = Number(String(value ?? '').replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const formatMetricDecimal = (value) => (
      Number.isFinite(value) ? value.toFixed(1).replace('.', ',') : '-'
    );

    const normalizeDiagKey = (label = '') => String(label || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();

    const getStageNumber = (label = '') => {
      const normalized = normalizeDiagKey(label).replace(',', '.');
      const match = normalized.match(/EST\s*([0-9]+(?:\.[0-9]+)?)/);
      if (!match) return null;
      const value = Number.parseFloat(match[1]);
      return Number.isFinite(value) ? value : null;
    };

    const getDiagRank = (label = '') => {
      const key = normalizeDiagKey(label);
      if (key.includes('BRIX')) return 10;
      if (key.includes('PENETROM')) return 20;
      if (key.includes('MATERIA SECA')) return 30;
      if (key.startsWith('EST') || key.includes(' EST')) return 40;
      return 90;
    };

    const sortDiagnosticoRows = (rows = []) => [...rows].sort((a, b) => {
      const rankA = getDiagRank(a?.label);
      const rankB = getDiagRank(b?.label);
      if (rankA !== rankB) return rankA - rankB;
      if (rankA === 40) {
        const stageA = getStageNumber(a?.label);
        const stageB = getStageNumber(b?.label);
        if (stageA !== null && stageB !== null && stageA !== stageB) return stageB - stageA;
      }
      return String(a?.label || '').localeCompare(String(b?.label || ''), 'pt-BR', { sensitivity: 'base', numeric: true });
    });

    const stats = { pen: { s: 0, c: 0 }, brix: { s: 0, c: 0 }, ms: { s: 0, c: 0 } };
    const maturacaoCount = {};
    let maturacaoTotal = 0;
    const danosMap = {};
    const ignoredDamageValues = new Set(['', '-', 'NA', 'N/A', 'NAO', 'NÃO', 'SEM DANO', 'SEM DANOS', 'OK']);

    // Busca valor do lote ignorando acentos e símbolos (ex: °Brix == Brix)
    const getLoteOffline = (valores, ...keys) => {
      for (const k of keys) {
        if (valores[k] !== undefined && valores[k] !== '') return valores[k];
      }
      // fallback: busca case-insensitive sem acentos
      const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ°]/g, '').toUpperCase().trim();
      for (const k of keys) {
        const kn = norm(k);
        const found = Object.keys(valores).find((key) => norm(key) === kn);
        if (found !== undefined && valores[found] !== '') return valores[found];
      }
      return '';
    };

    fruits.forEach((fruit) => {
      const values = fruit?.valores_lotes || {};
      const pen = toNum(getLoteOffline(values, 'Penetrometria'));
      const brix = toNum(getLoteOffline(values, '°Brix', 'Brix', '*Brix'));
      const materiaSeca = toNum(getLoteOffline(values, 'Matéria Seca', 'Materia Seca'));
      const maturacao = toNum(getLoteOffline(values, 'Maturação', 'Maturacao'));

      if (pen !== null) { stats.pen.s += pen; stats.pen.c += 1; }
      if (brix !== null) { stats.brix.s += brix; stats.brix.c += 1; }
      if (materiaSeca !== null) { stats.ms.s += materiaSeca; stats.ms.c += 1; }
      if (maturacao !== null) {
        const stageKey = String(maturacao).replace('.', ',');
        maturacaoCount[stageKey] = (maturacaoCount[stageKey] || 0) + 1;
        maturacaoTotal += 1;
      }

      const rawDamage = String(values.Maturação_danos || '').trim();
      if (!rawDamage || ignoredDamageValues.has(rawDamage.toUpperCase())) return;

      rawDamage.split(/[;,|/]/).forEach((part) => {
        const clean = part.trim();
        if (!clean || ignoredDamageValues.has(clean.toUpperCase())) return;
        danosMap[clean] = (danosMap[clean] || 0) + 1;
      });
    });

    const shelfMetrics = [
      { label: '°Brix', media: stats.brix.c > 0 ? (stats.brix.s / stats.brix.c) : null },
      { label: 'Penetrometria', media: stats.pen.c > 0 ? (stats.pen.s / stats.pen.c) : null },
      { label: 'Matéria Seca', media: stats.ms.c > 0 ? (stats.ms.s / stats.ms.c) : null },
    ].map((row) => ({ ...row, mediaText: formatMetricDecimal(row.media) }));

    const maturacaoRows = Object.entries(maturacaoCount)
      .sort((a, b) => Number(a[0].replace(',', '.')) - Number(b[0].replace(',', '.')))
      .map(([estagio, count]) => {
        const pct = maturacaoTotal > 0 ? ((count / maturacaoTotal) * 100) : 0;
        return { label: `Est ${estagio}`, media: pct, mediaText: formatMetricDecimal(pct) };
      });

    let diagnosticoRows = [];
    if (isShelfLife) {
      diagnosticoRows = shelfMetrics.filter((row) => row.media !== null);
    } else if (isPreColheita) {
      diagnosticoRows = sortDiagnosticoRows([
        ...shelfMetrics.filter((row) => row.media !== null),
        ...maturacaoRows.filter((row) => row.media !== null && row.media !== 0),
      ]);
    } else if (isProducao || isAcompanhamento) {
      diagnosticoRows = sortDiagnosticoRows(shelfMetrics.filter((row) => row.media !== null));
    } else {
      diagnosticoRows = shelfMetrics.filter((row) => row.media !== null);
    }

    if (!diagnosticoRows.length) {
      diagnosticoRows = [{ label: 'Sem dados', media: null, mediaText: '-' }];
    }

    const qtdTotal = fruits.length || (Number.parseInt(header.qtd_frutos || '0', 10) || 20);
    const danosRows = Object.entries(danosMap)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base', numeric: true }));
    const danosDisplay = danosRows.length ? danosRows : [{ label: 'Sem diagnóstico informado', count: 0, placeholder: true }];
    const totalComDano = danosRows.reduce((sum, row) => sum + row.count, 0);

    const formatIncidValue = (count) => {
      const qty = Number(count) || 0;
      if (qtdTotal <= 0 || qty <= 0) return '-';
      return ((qty / qtdTotal) * 100).toFixed(1);
    };

    const totalIncidValue = formatIncidValue(totalComDano);
    const totalIncidLabel = totalIncidValue === '-' ? '-' : `${totalIncidValue}%`;

    const secHead = (number, title) => `
      <div class="section-head">
        <div class="section-number">${number}</div>
        <div class="section-title">${esc(title)}</div>
      </div>`;

    const dataRow = (label, value) => `
      <div class="data-row">
        <div class="data-label">${esc(label)}</div>
        <div class="data-value">${esc(fmt(value))}</div>
      </div>`;

    const chartRows = diagnosticoRows.filter((row) => row.media !== null);
    const showPercentAxis = !isShelfLife;
    const maxChartValue = chartRows.length
      ? Math.max(...chartRows.map((row) => Number(row.media || 0)), 1)
      : 1;
    const axisMax = showPercentAxis
      ? 100
      : Math.max(5, Math.ceil(maxChartValue / 5) * 5);
    const axisStep = showPercentAxis
      ? 25
      : (axisMax <= 10 ? 2 : axisMax <= 20 ? 5 : axisMax <= 50 ? 10 : 20);
    const axisTicks = [];
    for (let tick = 0; tick <= axisMax; tick += axisStep) axisTicks.push(tick);
    if (axisTicks[axisTicks.length - 1] !== axisMax) axisTicks.push(axisMax);

    const sec2Title = isShelfLife ? 'AVALIAÇÃO - DANOS INTERNOS' : 'AVALIAÇÃO:';
    const sec2 = `
      ${secHead('2', sec2Title)}
      <div class="qtd-info">
        Quantidade de frutos analisados:
        <strong>${qtdTotal}</strong>
      </div>
      <div class="side-grid">
        <div class="panel">
          <div class="panel-title">Diagnóstico</div>
          <table class="metric-table">
            <thead>
              <tr>
                <th>Item</th>
                <th class="metric-right">%</th>
              </tr>
            </thead>
            <tbody>
              ${diagnosticoRows.map((row, index) => `
                <tr>
                  <td>2.${index + 1} - ${esc(row.label)}</td>
                  <td class="metric-right metric-value">${row.media === null ? '-' : esc(row.mediaText)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="panel">
          <div class="panel-title">Representação Gráfica</div>
          <table class="chart-table">
            <thead>
              <tr>
                <th class="chart-item-col">Item</th>
                <th>Grafico</th>
                <th class="chart-value-col">%</th>
              </tr>
            </thead>
            <tbody>
              ${chartRows.length ? chartRows.map((row) => {
                const rowValue = Number(row.media || 0);
                const barWidthPct = Math.max(0, Math.min(100, (rowValue / axisMax) * 100));
                const valueLabel = showPercentAxis
                  ? `${formatMetricDecimal(rowValue)}%`
                  : esc(row.mediaText);
                return `
                  <tr>
                    <td class="chart-item-col">${esc(row.label)}</td>
                    <td>
                      <div class="bar-track">
                        <div class="bar-fill" style="width:${barWidthPct.toFixed(2)}%;"></div>
                      </div>
                    </td>
                    <td class="chart-value-col chart-value">${valueLabel}</td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="3" class="chart-empty">Sem dados para gráfico.</td>
                </tr>
              `}
            </tbody>
          </table>
          ${chartRows.length ? `
            <div class="axis-scale">
              ${axisTicks.map((tick) => `<span>${tick}${showPercentAxis ? '%' : ''}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>`;

    const sec3Title = (isProducao || isAcompanhamento) ? 'DISTÚRBIOS ENCONTRADOS:' : 'AVALIAÇÃO - DANOS INTERNOS';
    const sec3 = `
      ${secHead('3', sec3Title)}
      <table class="damage-table">
        <thead>
          <tr>
            <th class="damage-label">DANO INTERNO</th>
            <th class="damage-qtd">QTD</th>
            <th class="damage-incid">INCID.%</th>
          </tr>
        </thead>
        <tbody>
          ${danosDisplay.map((row, index) => `
            <tr>
              <td class="damage-label">3.${index + 1} - ${esc(row.label)}</td>
              <td class="damage-qtd">${row.placeholder ? '-' : row.count}</td>
              <td class="damage-incid">${row.placeholder ? '-' : formatIncidValue(row.count)}</td>
            </tr>
          `).join('')}
          <tr class="damage-highlight">
            <td class="damage-label">3.${danosDisplay.length + 1} - Frutos com Danos Internos</td>
            <td class="damage-qtd">${totalComDano}</td>
            <td class="damage-incid">${totalIncidValue}</td>
          </tr>
        </tbody>
      </table>
      <div class="damage-total-box">
        <span>PERCENTUAL TOTAL DE DANOS INTERNOS</span>
        <strong>${totalIncidLabel}</strong>
      </div>`;

    const avaliador = esc(String(user?.nome || user?.name || '-').trim() || '-');
    const dataAnalise = esc(fmt(header.data));
    const avaliado = esc(fmt(header.fazenda_talhao || 'Controle de qualidade - Packing Manga'));
    const logoMarkup = String(logoSrc || '').trim()
      ? `<img class="brand-logo-img" src="${esc(logoSrc)}" alt="Logo" />`
      : `<div class="brand-word">AGRO<span class="dot">●</span>DAN</div>
         <div class="brand-sub">Agropecuária Roriz Dantas</div>`;
    const secFotos = Array.isArray(photoCards) && photoCards.length > 0
      ? `
      <div class="photos-block">
        <div class="photos-title">FOTOS</div>
        <div class="photos-grid">
          ${photoCards.map((card) => `
            <div class="photo-card">
              <div class="photo-media">
                <img src="${esc(card.src)}" alt="${esc(card.label)}" />
              </div>
              <div class="photo-caption">${esc(card.label)}</div>
            </div>
          `).join('')}
        </div>
      </div>`
      : '';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=700, initial-scale=1.0">
  <title>Prévia - Análise de Frutos</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 10mm 12mm 10mm;
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; }
    body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 100%;
      max-width: none;
      margin: 0;
      background: #fff;
      padding: 6px 2px 10px;
      box-shadow: none;
    }
    .header-top {
      display: flex;
      align-items: center;
      gap: 14px;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .header-main {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
      flex: 1;
    }
    .brand-line {
      width: 3px;
      height: 36px;
      background: ${G};
      flex-shrink: 0;
    }
    .brand-logo-wrap {
      min-width: 132px;
    }
    .brand-logo-img {
      width: 138px;
      height: 34px;
      object-fit: contain;
      display: block;
    }
    .brand-word {
      font-size: 21px;
      font-weight: 700;
      color: ${G};
      line-height: 1;
      letter-spacing: 0.2px;
      white-space: nowrap;
    }
    .brand-word .dot {
      color: #f08b2c;
      font-size: 24px;
      vertical-align: middle;
      margin: 0 1px;
    }
    .brand-sub {
      font-size: 9px;
      color: #6f806f;
      margin-top: 2px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
    .title-block {
      margin-left: 4px;
      min-width: 0;
      flex: 1;
    }
    .title-main {
      font-size: 34px;
      font-weight: 700;
      line-height: 1;
      color: #111;
    }
    .title-sub {
      margin-top: 2px;
      font-size: 11px;
      font-weight: 700;
      color: #111;
      letter-spacing: 0.4px;
    }
    .photos-block {
      margin-top: 12px;
    }
    .photos-title {
      background: ${G};
      color: #fff;
      font-size: 20px;
      font-weight: 700;
      padding: 8px 16px;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .photos-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .photo-card {
      border: 1px solid #c6ccc6;
      background: #f7f8f7;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .photo-media {
      height: 270px;
      background: #eef2ee;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-bottom: 1px solid #cfd6cf;
    }
    .photo-media img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .photo-caption {
      background: #edf2ee;
      color: ${GD};
      font-size: 22px;
      font-weight: 700;
      text-align: center;
      padding: 8px 6px;
      line-height: 1;
    }
    .header-divider {
      border-top: 1px solid #d8e7dc;
      margin: 10px 0 8px;
    }
    .info-box {
      border: 1px solid #e9eeea;
      background: #fbfcfb;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      font-size: 11px;
    }
    .info-row {
      display: flex;
      align-items: center;
      min-height: 28px;
      padding: 0 10px;
      border-top: 1px solid #edf1ee;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .info-row:nth-child(1), .info-row:nth-child(2) { border-top: 0; }
    .info-label {
      color: #268d5f;
      font-weight: 700;
      margin-right: 8px;
      min-width: 56px;
    }
    .results-title {
      font-size: 34px;
      font-weight: 700;
      text-align: center;
      margin: 8px 0 4px;
      color: #111;
    }
    .section-head {
      display: flex;
      align-items: center;
      border-top: 1px solid #e2eae4;
      margin-top: 12px;
      padding-top: 7px;
      margin-bottom: 4px;
    }
    .section-number {
      background: ${G};
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      width: 28px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .section-title {
      margin-left: 8px;
      font-size: 30px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      color: #111;
      line-height: 1;
    }
    .data-row {
      display: flex;
      min-height: 24px;
      align-items: center;
      border-top: 1px solid #e0e0e0;
      border-bottom: 1px solid #d8d8d8;
    }
    .data-label {
      width: 62%;
      flex-shrink: 0;
      padding: 0 6px;
      font-size: 11px;
      font-weight: 700;
      color: #111;
    }
    .data-value {
      width: 38%;
      padding: 0 6px 0 10px;
      font-size: 11px;
      color: #111;
    }
    .qtd-info {
      background: #f8f9f7;
      color: #4b4b4b;
      font-size: 11px;
      padding: 6px 8px;
      margin: 6px 0 10px;
      border: 1px solid #ececec;
    }
    .qtd-info strong { color: ${GD}; margin-left: 4px; }
    .side-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .panel {
      border: 1px solid #e0e0e0;
      background: #fff;
    }
    .panel-title {
      background: #f1f3f0;
      border-bottom: 1px solid #d9dfd8;
      color: ${GD};
      font-size: 11px;
      font-weight: 700;
      padding: 6px 8px;
      line-height: 1.15;
    }
    .metric-table, .chart-table, .damage-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    .metric-table th, .chart-table th, .damage-table th {
      background: #f7f8f6;
      border: 1px solid #e5e9e4;
      color: ${GD};
      font-size: 10px;
      font-weight: 700;
      padding: 6px 8px;
      text-align: left;
    }
    .metric-table td, .chart-table td, .damage-table td {
      border: 1px solid #ededed;
      padding: 5px 6px;
      color: #111;
      background: #fff;
    }
    .metric-right {
      width: 62px;
      text-align: right !important;
    }
    .metric-value {
      color: ${GD} !important;
      font-weight: 700;
    }
    .chart-item-col { width: 34%; }
    .chart-value-col {
      width: 62px;
      text-align: right !important;
    }
    .chart-value {
      font-weight: 700;
      color: #111;
    }
    .bar-track {
      width: 100%;
      height: 10px;
      background: #c9d0d7;
    }
    .bar-fill {
      height: 10px;
      background: ${GD};
    }
    .chart-empty {
      text-align: center;
      color: #777 !important;
      padding: 10px 8px !important;
    }
    .axis-scale {
      margin: 5px 6px 7px;
      margin-left: calc(34% + 6px);
      margin-right: 62px;
      font-size: 7px;
      color: #808080;
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #bbbbbb;
      padding-top: 3px;
      white-space: nowrap;
    }
    .axis-scale span {
      min-width: 20px;
      text-align: center;
    }
    .damage-table {
      margin-top: 4px;
      border-color: #d0d0d0;
    }
    .damage-table th {
      background: #ececea;
      border-color: #d0d0d0;
      color: #111;
      font-size: 11px;
    }
    .damage-label { width: 70%; text-align: left; }
    .damage-qtd { width: 14%; text-align: center !important; }
    .damage-incid { width: 16%; text-align: center !important; }
    .damage-table td.damage-qtd,
    .damage-table td.damage-incid { color: ${GD}; }
    .damage-highlight td {
      background: ${G};
      color: #fff !important;
      font-weight: 700;
      border-color: #d0d0d0;
    }
    .damage-total-box {
      border: 1px solid #d8d8d8;
      background: #f8f9f7;
      margin-top: 6px;
      padding: 8px 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-weight: 700;
    }
    .damage-total-box strong {
      color: ${OR};
      font-size: 13px;
    }
    .footer-time {
      margin-top: 18px;
      border-top: 1px solid #d0d0d0;
      padding-top: 6px;
      font-size: 9px;
      color: #8c8c8c;
      text-align: right;
    }
    @media screen and (max-width: 680px) {
      body { padding: 6px; background: #fff; }
      .page { padding: 10px 8px 14px; }
      .header-top { gap: 8px; align-items: flex-start; }
      .header-main { gap: 8px; }
      .brand-logo-img { width: 104px; height: 26px; }
      .title-main { font-size: 18px; }
      .title-sub { font-size: 10px; }
      .results-title { font-size: 26px; }
      .section-title { font-size: 21px; }
      .side-grid { grid-template-columns: 1fr 1fr; gap: 6px; }
      .axis-scale { margin-left: calc(34% + 8px); margin-right: 62px; }
      .photos-title { font-size: 16px; padding: 7px 10px; }
      .photos-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .photo-media { height: 155px; }
      .photo-caption { font-size: 16px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header-top">
      <div class="header-main">
        <div class="brand-line"></div>
        <div class="brand-logo-wrap">
          ${logoMarkup}
        </div>
        <div class="title-block">
          <div class="title-main">ANALISE DE FRUTOS</div>
          <div class="title-sub">CONTROLE DE QUALIDADE</div>
        </div>
      </div>
    </div>
    <div class="header-divider"></div>

    <div class="info-box">
      <div class="info-row"><span class="info-label">Avaliador:</span> ${avaliador}</div>
      <div class="info-row"><span class="info-label">Inicial:</span> ${dataAnalise}</div>
      <div class="info-row"><span class="info-label">Avaliado:</span> ${avaliado}</div>
      <div class="info-row"><span class="info-label">Fim:</span> ${dataAnalise}</div>
    </div>

    <div class="results-title">RESULTADOS</div>

    ${secHead('1', 'DADOS')}
    ${dataRow('1.1 - Data de Análise', header.data)}
    ${dataRow('1.2 - Tipo de Análise', header.tipo_analise)}
    ${dataRow('1.3 - Fazenda/Produtor', header.fazenda_talhao)}
    ${dataRow('1.4 - Talhão', header.talhao)}
    ${dataRow('1.5 - Variedade', header.variedade)}
    ${dataRow('1.6 - Controle', header.controle)}
    ${dataRow('1.7 - Observações', header.observacoes)}

    ${sec2}
    ${sec3}
    ${secFotos}

    <div class="footer-time">
      Gerado em ${new Date().toLocaleString('pt-BR')}
    </div>
  </div>
</body>
</html>`;
  };

  const baixarPdfPreviewNoCache = async (absoluteUrl = '') => {
    if (!absoluteUrl || !FileSystem.cacheDirectory) return '';
    try {
      const fileUri = `${FileSystem.cacheDirectory}analise_frutos_preview_${Date.now()}.pdf`;
      const downloaded = await FileSystem.downloadAsync(absoluteUrl, fileUri);
      if (downloaded?.status === 200 && downloaded?.uri) return downloaded.uri;
    } catch {}
    return '';
  };

  const gerarPdfPreviewOffline = async () => {
    const previewAssets = await resolvePreviewAssets();
    const html = buildPreviewHtml(previewAssets);
    const result = await Print.printToFileAsync({
      html,
      base64: false,
      width: 595,
      height: 842,
      margins: { left: 0, top: 0, right: 0, bottom: 0 },
    });
    if (!result?.uri) {
      throw new Error('Nao foi possivel gerar PDF offline.');
    }
    setPdfBase64(null);
    setPreviewPdfUrl('');
    setPreviewPdfUri(result.uri);
  };

  // Gera a prévia em HTML para exibir no WebView (igual a Maturação Forçada).
  const gerarPdfParaVisualizacao = async () => {
    if (isGeneratingPdf) return;
    try {
      setIsGeneratingPdf(true);
      const previewAssets = await resolvePreviewAssets();
      setPdfBase64(buildPreviewHtml(previewAssets));
    } catch {
      Alert.alert('Erro', 'Não foi possível gerar a prévia.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Renderiza a prévia dos dados no WebView
  function renderResumo() {
    if (isGeneratingPdf && !pdfBase64) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={{ marginTop: 12, color: '#666', fontSize: 14 }}>Gerando prévia do PDF...</Text>
        </View>
      );
    }

    if (!pdfBase64) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <MaterialIcons name="picture-as-pdf" size={48} color="#CCC" />
          <Text style={{ marginTop: 12, color: '#999', fontSize: 14 }}>Prévia não disponível</Text>
        </View>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: '#DDE4DD',
            backgroundColor: '#F4F7F2',
          }}
        >
          <TouchableOpacity onPress={gerarPdfParaVisualizacao} activeOpacity={0.85} disabled={isGeneratingPdf}>
            <MaterialIcons name={isGeneratingPdf ? 'hourglass-empty' : 'refresh'} size={20} color={GREEN} />
          </TouchableOpacity>
        </View>
        <WebView
          source={{ html: pdfBase64 }}
          style={{ flex: 1 }}
          originWhitelist={['*']}
          javaScriptEnabled
          scrollEnabled
          pinchGestureEnabled
          scalesPageToFit={false}
        />
      </View>
    );
  }

  // Controla a acao do botao principal em cada passo: avanca o formulario ou salva no ultimo passo.
  const handlePrimaryAction = () => {
    if (saving || testingPdf || isGeneratingPdf) return;
    if (step === 0) { commitQtdFrutosChange(); setStep(1); return; }
    if (step === 1) { setStep(2); return; }
    if (step === 2) { clearPreviewState(); setStep(3); return; }
    handleSave();
  };

  // Navega para um passo especifico ao clicar no indicador de progresso, validando o passo atual.
  const handleStepNavigation = (targetStep) => {
    if (targetStep === step) return;
    if (targetStep < step) {
      if (targetStep < 3) clearPreviewState();
      setStep(targetStep);
      return;
    }
    if (step === 0) {
      const canProceed = commitQtdFrutosChange();
      if (!canProceed) return;
    }
    if (targetStep === 3) clearPreviewState();
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
        {!!editingFormId && <View style={styles.rightSpace} />}
      </View>

      <View style={styles.stepWrap}><StepIndicator currentStep={step} onStepPress={handleStepNavigation} /></View>

      {step === 3 ? (
        renderResumo()
      ) : (
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
          <View style={styles.card}>
            <SelectField label="Tipo de Analise" required value={header.tipo_analise} onPress={() => setShowTipoModal(true)} placeholder="Selecione o tipo" />
            <SelectField
              label="Fazenda"
              required
              value={header.fazenda_talhao}
              onPress={() => !editingFormId && setShowFarmModal(true)}
              placeholder="Selecione a fazenda"
              disabled={!!editingFormId}
            />
            <SelectField
              label="Talhao"
              required
              value={header.talhao}
              onPress={() => !editingFormId && setShowTalhaoModal(true)}
              placeholder={!header.fazenda_talhao ? 'Selecione a fazenda primeiro' : 'Selecione o talhao'}
              disabled={!!editingFormId || !header.fazenda_talhao}
            />
            <SelectField
              label="Data"
              required
              value={header.data || ''}
              onPress={() => setShowDateModal(true)}
              placeholder="Selecione a data"
            />
            <FieldInput label="Semana" value={String(header.semana ?? '')} placeholder="Automatica" editable={false} />
            <FieldInput
              label="Controle"
              required
              value={header.controle}
              onChangeText={(value) => !editingFormId && updateHeader('controle', normalizeIntegerInput(value))}
              placeholder="Ex: 145"
              keyboardType="number-pad"
              onFocus={handleInputFocus}
              editable={!editingFormId}
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
            <FieldInput
              label="Observacoes"
              value={header.observacoes}
              onChangeText={(value) => updateHeader('observacoes', value)}
              placeholder="Observacoes gerais"
              multiline
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
                  const uri = item.local_uri || buildAbsoluteApiUrl(item.url || item.caminho_relativo || '');
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
      )}

      <TouchableOpacity
        style={[styles.fabIconOnly, { bottom: floatingButtonsBottom }, (saving || testingPdf || isGeneratingPdf) && { opacity: 0.65 }]}
        onPress={handlePrimaryAction}
        activeOpacity={0.85}
        disabled={saving || testingPdf || isGeneratingPdf}
      >
        <MaterialIcons
          name={saving || testingPdf || isGeneratingPdf ? 'hourglass-empty' : step === STEPS_TOTAL - 1 ? 'save' : 'arrow-forward'}
          size={30}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      <Modal
        visible={showOfflineSavedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOfflineSavedModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowOfflineSavedModal(false)}>
          <Pressable style={[styles.modalCard, styles.offlineSavedModalCard]} onPress={() => {}}>
            <View style={styles.offlineSavedIconWrap}>
              <MaterialIcons name="wifi-off" size={28} color="#C56A17" />
            </View>
            <Text style={styles.offlineSavedTitle}>Analise enviada para o sininho</Text>
            <Text style={styles.offlineSavedText}>
              {userFirstName ? `${userFirstName}, voce nao esta conectado ao Wi-Fi.` : 'Voce nao esta conectado ao Wi-Fi.'}
            </Text>
            <Text style={styles.offlineSavedText}>
              A analise foi enviada para o sininho. Conecte-se ao Wi-Fi corporativo e depois sincronize os dados.
            </Text>
            <View style={styles.offlineSavedActions}>
              <TouchableOpacity
                style={[styles.offlineSavedButton, styles.offlineSavedButtonGhost]}
                onPress={() => {
                  setShowOfflineSavedModal(false);
                  navigation.goBack();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.offlineSavedButtonGhostText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
        onSelect={(talhao) => {
          // Ex: "9_PETROLINA - Palmer" → talhao="9_PETROLINA", variedade="Palmer"
          const sepIdx = String(talhao || '').lastIndexOf(' - ');
          if (sepIdx !== -1) {
            const talhaoLimpo = talhao.substring(0, sepIdx).trim();
            const variedadeAuto = talhao.substring(sepIdx + 3).trim();
            setHeader((prev) => ({ ...prev, talhao: talhaoLimpo, variedade: variedadeAuto || prev.variedade }));
          } else {
            updateHeader('talhao', talhao);
          }
        }}
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
        visible={showTipoModal}
        title="Tipo de Analise"
        options={tiposAnaliseOptions}
        emptyText="Nenhum tipo encontrado."
        onSelect={(v) => updateHeader('tipo_analise', v)}
        onClose={() => setShowTipoModal(false)}
        searchPlaceholder="Buscar tipo..."
      />

      <DateModalAF
        visible={showDateModal}
        current={(() => { try { const [d,m,y] = (header.data || '').split('/'); const dt = new Date(y, m - 1, d); return isNaN(dt.getTime()) ? new Date() : dt; } catch { return new Date(); } })()}
        onConfirm={(date) => handleDateChange(formatDate(date))}
        onClose={() => setShowDateModal(false)}
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
  offlineSavedModalCard: { maxWidth: 420, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 18 },
  offlineSavedIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF4E8',
    marginBottom: 14,
  },
  offlineSavedTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#24352A',
    textAlign: 'center',
    marginBottom: 10,
  },
  offlineSavedText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5E6C63',
    textAlign: 'center',
    marginBottom: 8,
  },
  offlineSavedActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 4,
  },
  offlineSavedButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  offlineSavedButtonGhost: {
    borderWidth: 1,
    borderColor: '#D9E4DA',
    backgroundColor: '#F8FBF8',
  },
  offlineSavedButtonGhostText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#617066',
  },
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


