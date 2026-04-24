// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// MATURAÃ‡ÃƒO FORÃ‡ADA â€" CONTROLE DE QUALIDADE
// Tela de formulÃ¡rio completo para registro de anÃ¡lise de maturaÃ§Ã£o forÃ§ada.
// Fluxo: identificaÃ§Ã£o da amostra â†' dados da anÃ¡lise â†' fotos â†' geraÃ§Ã£o de PDF.
// Gera o PDF usando maturacaoPdfReport.js e permite compartilhar/salvar.
// Salva rascunho localmente (AsyncStorage) e envia ao servidor via API.
// Rota: "MaturacaoForcada" em routes.js â†' AuthenticatedStack
// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../context/AuthContext';
import api from '../../../services/api';
import buildMaturacaoPdfReport from './maturacaoPdfReport';

// â"€â"€â"€ Paleta â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const GREEN  = '#2E7D32';
const LGREEN = '#E8F5E9';
const ORANGE = '#F39C12';

const VARIEDADES_MANGA_FALLBACK = ['KENT', 'KEITT', 'TOMMY ATKINS', 'PALMER', 'OSTEEN', 'OMER', 'NOA', 'SHELLY'];


// Formata um objeto Date para string no padrao dd/mm/aaaa.
function fmt(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

const DRAFTS_KEY = '@maturacao:rascunhos';

// Converte um valor de data ISO para milissegundos, retornando 0 se invalido.
const toDraftMillis = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Normaliza um valor de texto para ser usado como token de ID de rascunho (sem acentos, kebab-case).
const normalizeDraftToken = (value) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Monta o ID do rascunho usando fazenda/OS para evitar duplicidade.
const buildDraftIdByOs = (source = {}) => {
  const fazendaKey = normalizeDraftToken(source.fazenda);
  const osKey = normalizeDraftToken(
    source.os
      || source.ordemServico
      || source.ordem_servico
      || source.parcela
      || source.talhao
  );

  if (fazendaKey && osKey) return `mf:${fazendaKey}:${osKey}`;
  if (osKey) return `mf:os:${osKey}`;

  const dataRecKey = source.dataRec
    ? normalizeDraftToken(String(source.dataRec).slice(0, 10))
    : '';

  if (fazendaKey && dataRecKey) return `mf:${fazendaKey}:${dataRecKey}`;
  if (fazendaKey) return `mf:fazenda:${fazendaKey}`;
  if (dataRecKey) return `mf:data:${dataRecKey}`;
  return 'mf:tmp';
};

// Normaliza, remove duplicados e ordena a lista de rascunhos.
const normalizeDraftList = (input) => {
  const list = Array.isArray(input) ? input : [];
  const byId = new Map();

  list.forEach((draft) => {
    if (!draft || typeof draft !== 'object') return;
    const canonicalId = buildDraftIdByOs(draft);
    const id = canonicalId !== 'mf:tmp' ? canonicalId : (draft.id || canonicalId);
    const savedAt = draft.savedAt || new Date().toISOString();
    const normalized = { ...draft, id, savedAt };
    const current = byId.get(id);

    if (!current || toDraftMillis(savedAt) >= toDraftMillis(current.savedAt)) {
      byId.set(id, normalized);
    }
  });

  return Array.from(byId.values())
    .sort((a, b) => toDraftMillis(b.savedAt) - toDraftMillis(a.savedAt))
    .slice(0, 10);
};


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODAL: data
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â"€â"€ CalendÃ¡rio customizado â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];
const DAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

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
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selDay   = value instanceof Date ? value.getDate()     : null;
  const selMonth = value instanceof Date ? value.getMonth()    : null;
  const selYear  = value instanceof Date ? value.getFullYear() : null;

  // Navega para o mes anterior no calendario.
  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  // Navega para o proximo mes no calendario.
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

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
        {DAYS_PT.map(d => <Text key={d} style={calSt.dayName}>{d}</Text>)}
      </View>
      <View style={calSt.grid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={`e${idx}`} style={calSt.cell} />;
          const isSel = day === selDay && viewMonth === selMonth && viewYear === selYear;
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          return (
            <TouchableOpacity
              key={`d${day}`}
              style={[calSt.cell, isSel && calSt.cellSel, !isSel && isToday && calSt.cellToday]}
              onPress={() => onChange(new Date(viewYear, viewMonth, day))}
              activeOpacity={0.7}
            >
              <Text style={[calSt.cellTxt, isSel && calSt.cellTxtSel, !isSel && isToday && calSt.cellTxtToday]}>
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Modal de selecao de data usado nos campos do formulario.
function DateModal({ visible, current, onConfirm, onClose }) {
  const [temp, setTemp] = useState(current instanceof Date ? current : new Date());

  useEffect(() => {
    if (visible) setTemp(current instanceof Date ? current : new Date());
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose}>
        <Pressable style={[st.dateBox, { paddingHorizontal: 16 }]} onPress={e => e.stopPropagation()}>
          <Text style={st.modalTitle}>Selecionar Data</Text>
          <CustomCalendar value={temp} onChange={setTemp} />
          <View style={st.modalBtns}>
            <TouchableOpacity style={st.modalBtnCancel} onPress={onClose}>
              <Text style={st.modalBtnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.modalBtnOk} onPress={() => { onConfirm(temp); onClose(); }}>
              <Text style={st.modalBtnOkText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODAL: lista com busca (Fazenda / TalhÃ£o / Variedade)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ListModal({ visible, title, options, onSelect, onClose }) {
  const [busca, setBusca] = useState('');
  const filtrado = options.filter(opt =>
    opt.toLowerCase().includes(busca.toLowerCase())
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose}>
        <Pressable style={st.listBox} onPress={e => e.stopPropagation()}>
          <Text style={st.modalTitle}>{title}</Text>
          <TextInput
            style={st.searchInput}
            placeholder="Buscar..."
            placeholderTextColor="#BDBDBD"
            value={busca}
            onChangeText={setBusca}
          />
          <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
            {filtrado.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: '#888', fontSize: 13 }}>Nenhum resultado</Text>
              </View>
            ) : filtrado.map(opt => (
              <TouchableOpacity
                key={opt}
                style={st.listItem}
                onPress={() => { setBusca(''); onSelect(opt); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[st.listItemText, { flex: 1 }]}>{opt}</Text>
                <MaterialIcons name="chevron-right" size={20} color="#CCC" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODAL: campo de texto livre (Produtor / Variedade)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function TextModal({ visible, title, placeholder, value, onConfirm, onClose }) {
  const [temp, setTemp] = useState(value);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose}>
        <Pressable style={st.textBox} onPress={e => e.stopPropagation()}>
          <Text style={st.modalTitle}>{title}</Text>
          <TextInput
            style={st.modalInput}
            placeholder={placeholder}
            placeholderTextColor="#C0C0C0"
            value={temp}
            onChangeText={setTemp}
          />
          <View style={st.modalBtns}>
            <TouchableOpacity style={st.modalBtnCancel} onPress={onClose}>
              <Text style={st.modalBtnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.modalBtnOk} onPress={() => { onConfirm(temp); onClose(); }}>
              <Text style={st.modalBtnOkText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STEP INDICATOR â€" clicÃ¡vel
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const STEPS = ['Identificação', 'Avaliação', 'Fotos', 'Prévia PDF'];

// Indicador visual das etapas do fluxo com navegacao por toque.
function StepIndicator({ current, onPress }) {
  return (
    <View style={st.stepRow}>
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <TouchableOpacity
            key={i}
            style={st.stepItem}
            onPress={() => onPress(i)}
            activeOpacity={0.7}
          >
            {i > 0 && <View style={[st.lineLeft,  (done || active) && st.lineGreen]} />}
            <View style={[st.circle, done && st.circleDone, active && st.circleActive]}>
              {done
                ? <MaterialIcons name="check" size={15} color="#fff" />
                : <Text style={[st.circleNum, active && st.circleNumActive]}>{i + 1}</Text>}
            </View>
            {i < STEPS.length - 1 && <View style={[st.lineRight, done && st.lineGreen]} />}
            <Text style={[st.stepLabel, active && st.stepLabelActive, done && st.stepLabelDone]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Campo campo de data (abre modal)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function DateField({ label, required, value, onPress }) {
  return (
    <View style={st.field}>
      <Text style={st.fieldLabel}>{label}{required && <Text style={st.req}> *</Text>}</Text>
      <TouchableOpacity style={[st.inputBox, st.row]} onPress={onPress} activeOpacity={0.8}>
        <Text style={[st.inputText, !value && st.placeholder]}>
          {value ? fmt(value) : 'Selecione...'}
        </Text>
        <MaterialIcons name="calendar-today" size={18} color="#BDBDBD" />
      </TouchableOpacity>
    </View>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function NumberRow({ label, required, value, onChange }) {
  return (
    <View style={st.singleRow}>
      <Text style={st.singleLabel}>
        {label}
        {required && <Text style={st.req}> *</Text>}
      </Text>
      <TextInput
        style={st.singleInput}
        value={value}
        onChangeText={t => onChange(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        textAlign="center"
        placeholder="0"
        placeholderTextColor="#C0C0C0"
      />
    </View>
  );
}

// â"€â"€ Linha expansÃ­vel (Leve / Moderado / Severo) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function ExpandableGroup({ label, values, onChange }) {
  const [open, setOpen] = useState(false);
  const total = values.reduce((a, v) => a + (parseInt(v) || 0), 0);
  return (
    <View style={st.expWrap}>
      <TouchableOpacity style={st.expHeader} onPress={() => setOpen(o => !o)} activeOpacity={0.75}>
        <Text style={st.singleLabel}>{label}</Text>
        {total > 0 && <Text style={st.expTotal}>{total}</Text>}
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={22} color="#AAAAAA" />
      </TouchableOpacity>
      {open && (
        <View style={st.expBody}>
          {['Leve', 'Moderado', 'Severo'].map((sev, i) => (
            <View key={sev} style={st.expRow}>
              <Text style={st.expSevLabel}>{sev}</Text>
              <TextInput
                style={st.singleInput}
                value={values[i]}
                onChangeText={t => { const n = [...values]; n[i] = t.replace(/\D/g, ''); onChange(n); }}
                keyboardType="number-pad"
                textAlign="center"
                placeholder="0"
                placeholderTextColor="#C0C0C0"
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MODAL: lista de talhÃµes com busca
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function TalhaoListModal({ visible, items, onSelect, onClose }) {
  const [busca, setBusca] = useState('');
  const filtrado = items.filter(item =>
    (item.parcela || '').toLowerCase().includes(busca.toLowerCase())
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose}>
        <Pressable style={st.listBox} onPress={e => e.stopPropagation()}>
          <Text style={st.modalTitle}>Selecione o Talhão</Text>
          <TextInput
            style={st.searchInput}
            placeholder="Buscar talhão..."
            placeholderTextColor="#BDBDBD"
            value={busca}
            onChangeText={setBusca}
          />
          {items.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: '#888', fontSize: 13 }}>Nenhum talhão disponível</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {filtrado.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#888', fontSize: 13 }}>Nenhum resultado</Text>
                </View>
              ) : filtrado.map((item, i) => (
                <TouchableOpacity
                  key={i}
                  style={st.listItem}
                  onPress={() => { setBusca(''); onSelect(item); onClose(); }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={st.listItemText}>{item.parcela}</Text>
                    {item.variedade ? (
                      <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Variedade: {item.variedade}</Text>
                    ) : null}
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="#CCC" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// COMPONENTE PRINCIPAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function MaturacaoForcada({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // â"€â"€ Passo 1
  const [dataRec, setDataRec] = useState(null);
  const [dataAna, setDataAna] = useState(new Date());
  const [fazenda, setFazenda]   = useState('');
  const [talhao, setTalhao]     = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [comprador, setComprador] = useState('');
  const [parcela, setParcela] = useState('');
  const [variedade, setVariedade] = useState('');
  const [qtd, setQtd] = useState('');

  // â"€â"€ Passo 2
  const [te, setTe] = useState('');
  const [pc, setPc] = useState(['','','']);
  const [df, setDf] = useState(['','','']);
  const [peduncular, setPeduncular] = useState(['','','']);
  const [antracnose, setAntracnose] = useState('');
  const [colapso, setColapso]       = useState('');
  const [germinacao, setGerminacao] = useState('');
  const [alternaria, setAlternaria] = useState('');
  const [obs, setObs] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfBase64, setPdfBase64] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // â"€â"€ Passo 3
  const [fotos, setFotos] = useState([]);
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [editingPhotoIndex, setEditingPhotoIndex] = useState(-1);
  const [editingPhotoDraft, setEditingPhotoDraft] = useState(null);
  const [editingPhotoCropUri, setEditingPhotoCropUri] = useState('');
  const [editingPhotoZoom, setEditingPhotoZoom] = useState(1);
  const [editingPhotoOffset, setEditingPhotoOffset] = useState({ x: 0, y: 0 });
  const [editingCropBox, setEditingCropBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [editingPhotoSize, setEditingPhotoSize] = useState({ width: 0, height: 0 });
  const [editingPhotoViewport, setEditingPhotoViewport] = useState({ width: 0, height: 0 });
  const [photoEditorBusy, setPhotoEditorBusy] = useState(false);
  const [photoEditorPreparing, setPhotoEditorPreparing] = useState(false);
  const editingPhotoZoomRef = useRef(1);
  const editingPhotoOffsetRef = useRef({ x: 0, y: 0 });
  const editingCropBoxRef = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const editingPhotoSizeRef = useRef({ width: 0, height: 0 });
  const editingPhotoViewportRef = useRef({ width: 0, height: 0 });
  const photoDragStartRef = useRef({ x: 0, y: 0 });
  const cropMoveStartRef = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const cropResizeStartRef = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const photoEditorRequestRef = useRef(0);
  const previewLogoRef = useRef('');

  // â"€â"€ Modais
  const [showDateRec, setShowDateRec]   = useState(false);
  const [showDateAna, setShowDateAna]   = useState(false);
  const [showFazenda, setShowFazenda]   = useState(false);
  const [showTalhao, setShowTalhao]     = useState(false);
  const [fazendas, setFazendas] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [allTalhoes, setAllTalhoes] = useState([]);
  const [talhoesList, setTalhoesList] = useState([]);
  const [showVariedade, setShowVariedade] = useState(false);
  const [showVariedadePicker, setShowVariedadePicker] = useState(false);
  const [variedadeOptions, setVariedadeOptions] = useState([]);
  const scrollViewRef = useRef(null);
  const [showHistorico, setShowHistorico] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [showCadastroVariedade, setShowCadastroVariedade] = useState(false);
  const [novaVariedade, setNovaVariedade] = useState('');
  const [buscaVariedade, setBuscaVariedade] = useState('');
  const [variedadesApi, setVariedadesApi] = useState(VARIEDADES_MANGA_FALLBACK);

  const avaliadorNome = String(user?.nome || user?.name || user?.NAME || '').trim() || String(responsavel || '').trim();
  const avaliadorCargo = String(user?.cargo || user?.CARGO || '').trim();
  const avaliadorMatricula = String(user?.matricula || user?.MATRICULA || user?.id || user?.ID_USER || '').trim();
  const avaliadoNome = String(fazenda || fornecedor || '').trim();

  useEffect(() => {
    const VARIEDADES_API_KEY = '@maturacao:variedades_api';
    api.get('/variedades')
      .then(res => {
        const list = res?.data ?? res;
        if (Array.isArray(list) && list.length > 0) {
          const nomes = list.map(v => v.nome);
          setVariedadesApi(nomes);
          AsyncStorage.setItem(VARIEDADES_API_KEY, JSON.stringify(nomes)).catch(() => {});
        }
      })
      .catch(async () => {
        try {
          const cached = await AsyncStorage.getItem(VARIEDADES_API_KEY);
          if (cached) setVariedadesApi(JSON.parse(cached));
        } catch {}
      });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(DRAFTS_KEY)
      .then(async (raw) => {
        if (!raw) return;
        const normalized = normalizeDraftList(JSON.parse(raw));
        setDrafts(normalized);
        await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(normalized));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (route?.params?.openDateRecModal) {
      setShowDateRec(true);
      navigation.setParams({ openDateRecModal: false });
    }
  }, [navigation, route?.params?.openDateRecModal]);

  // Carrega fazendas e talhÃµes do banco (com cache offline)
  useEffect(() => {
    const TALHOES_KEY = '@maturacao:talhoes';
    const CATALOGO_KEY = '@maturacao:catalogo';

    // Aplica talhoes — exibe todos direto sem filtrar por fazenda.
    const applyTalhoes = (list) => {
      if (!Array.isArray(list) || list.length === 0) return;
      setAllTalhoes(list);
      setTalhoesList(list.map(t => ({ parcela: t.talhao, variedade: t.variedade, fazenda: t.fazenda })));
      const uniqueFazendas = [...new Set(list.map(t => t.fazenda).filter(Boolean))];
      setFazendas(uniqueFazendas);
    };

    // Carrega talhoes.
    const loadTalhoes = async () => {
      try {
        const response = await api.get('/talhoes');
        const list = response?.data ?? response;
        applyTalhoes(list);
        await AsyncStorage.setItem(TALHOES_KEY, JSON.stringify(list));
      } catch (e) {
        console.warn('Talhões offline, usando cache:', e?.message);
        try {
          const cached = await AsyncStorage.getItem(TALHOES_KEY);
          if (cached) applyTalhoes(JSON.parse(cached));
        } catch {}
      }
    };

    // Carrega catalogo.
    const loadCatalogo = async () => {
      try {
        const response = await api.get('/maturacao-forcada/catalogo/parcelas');
        const list = response?.data ?? response;
        if (Array.isArray(list)) {
          setCatalogo(list);
          await AsyncStorage.setItem(CATALOGO_KEY, JSON.stringify(list));
        }
      } catch {
        try {
          const cached = await AsyncStorage.getItem(CATALOGO_KEY);
          if (cached) {
            const list = JSON.parse(cached);
            if (Array.isArray(list)) setCatalogo(list);
          }
        } catch {}
      }
    };

    loadTalhoes();
    loadCatalogo();
  }, []);

  // Trata fazenda select.
  const handleFazendaSelect = (nomeFazenda) => {
    setFazenda(nomeFazenda);
    setFornecedor(nomeFazenda);
    setTalhao('');
    setParcela('');

    // Preenche comprador/responsÃ¡vel do catÃ¡logo (se existir correspondÃªncia)
    const found = catalogo.find(c => c.produtor === nomeFazenda);
    setComprador(found?.comprador || '');
    setResponsavel(found?.comprador || '');

    // Filtra talhÃµes da fazenda selecionada â†' campo "talhao" vira opÃ§Ã£o de parcela
    const talhoesDaFazenda = allTalhoes.filter(t => t.fazenda === nomeFazenda);
    setTalhoesList(talhoesDaFazenda.map(t => ({ parcela: t.talhao, variedade: t.variedade })));
  };

  // Trata talhao select.
  const handleTalhaoSelect = (item) => {
    setParcela(item.parcela || '');
    setTalhao(item.parcela || '');

    // Busca todas as variedades para este talhÃ£o na fazenda atual
    const variedadesDoTalhao = allTalhoes
      .filter(t => t.fazenda === fazenda && t.talhao === item.parcela)
      .map(t => t.variedade)
      .filter(Boolean);

    const unicas = [...new Set(variedadesDoTalhao)];

    if (unicas.length === 1) {
      // SÃ³ uma variedade â†' preenche automÃ¡tico
      setVariedade(unicas[0]);
    } else if (unicas.length > 1) {
      // Mais de uma â†' abre picker para escolher
      setVariedadeOptions(unicas);
      setShowVariedadePicker(true);
    } else {
      // Sem variedade â†' limpa o campo para digitar
      setVariedade('');
    }
  };

  // â"€â"€ derivados
  const totalFrutos  = parseInt(qtd) || 0;
  const totalDefeito = [
    te, ...pc, ...df, ...peduncular,
    antracnose, colapso, germinacao, alternaria,
  ].reduce((a, v) => a + (parseInt(v) || 0), 0);
  const incidencia = totalFrutos > 0
    ? ((totalDefeito / totalFrutos) * 100).toFixed(1)
    : '0.0';

  // Trata navegacao de retorno respeitando o estado atual do fluxo.
  async function voltar() {
    if (step === 0) {
      await salvarRascunho();
      navigation.goBack();
    } else {
      setStep(s => s - 1);
    }
  }

  // â"€â"€ fotos
  const validarIdentificacao = () => {
    if (!dataRec) {
      Alert.alert('Obrigatório', 'Preencha a Data de Recebimento.');
      return false;
    }
    if (!fazenda) {
      Alert.alert('Obrigatório', 'Selecione a Fazenda.');
      return false;
    }
    if (!parcela) {
      Alert.alert('Obrigatório', 'Selecione a Parcela.');
      return false;
    }
    return true;
  };

  // Valida os campos obrigatorios da etapa de avaliacao.
  const validarAvaliacao = () => {
    if (!qtd || parseInt(qtd, 10) < 1) {
      Alert.alert('Obrigatório', 'Informe a Quantidade de Frutos.');
      return false;
    }
    return true;
  };

  const normalizeFotoItem = (item) => {
    if (typeof item === 'string') {
      return { uri: item, originalUri: item, fitMode: 'contain' };
    }

    if (item && typeof item === 'object') {
      const uri = String(item.uri || '');
      const originalUri = String(item.originalUri || uri || '');
      return {
        uri,
        originalUri,
        fitMode: item.fitMode === 'cover' ? 'cover' : 'contain',
      };
    }

    return { uri: '', originalUri: '', fitMode: 'contain' };
  };

  const getFotoUri = (item) => normalizeFotoItem(item).uri;

  const setEditorZoom = (value) => {
    const safe = Math.max(1, Math.min(3, Number(value) || 1));
    editingPhotoZoomRef.current = safe;
    setEditingPhotoZoom(safe);
  };

  const setEditorOffset = (value) => {
    const next = {
      x: Number(value?.x) || 0,
      y: Number(value?.y) || 0,
    };
    editingPhotoOffsetRef.current = next;
    setEditingPhotoOffset(next);
  };

  const setEditorCropBox = (value) => {
    const next = {
      left: Number(value?.left) || 0,
      top: Number(value?.top) || 0,
      width: Math.max(0, Number(value?.width) || 0),
      height: Math.max(0, Number(value?.height) || 0),
    };
    editingCropBoxRef.current = next;
    setEditingCropBox(next);
  };

  const buildCropGuideLayout = (vpWidth, vpHeight) => {
    const vpW = Math.max(0, Number(vpWidth) || 0);
    const vpH = Math.max(0, Number(vpHeight) || 0);
    if (!vpW || !vpH) {
      return {
        cropWidth: 0,
        cropHeight: 0,
        left: 0,
        top: 0,
        right: vpW,
        bottom: vpH,
      };
    }

    const minWidth = Math.min(120, vpW);
    const minHeight = Math.min(100, vpH);
    const preferredWidth = Math.max(minWidth, vpW - 40);
    const preferredHeight = Math.max(minHeight, vpH * 0.58);
    const cropWidth = Math.min(vpW, preferredWidth);
    const cropHeight = Math.min(vpH, preferredHeight);
    const left = Math.max(0, (vpW - cropWidth) / 2);
    const top = Math.max(0, (vpH - cropHeight) / 2);

    return {
      cropWidth,
      cropHeight,
      left,
      top,
      right: Math.max(0, vpW - (left + cropWidth)),
      bottom: Math.max(0, vpH - (top + cropHeight)),
    };
  };

  const clampCropBox = (value, viewport = editingPhotoViewportRef.current) => {
    const vpW = Math.max(0, Number(viewport?.width) || 0);
    const vpH = Math.max(0, Number(viewport?.height) || 0);
    if (!vpW || !vpH) return { left: 0, top: 0, width: 0, height: 0 };

    const minWidth = Math.min(120, vpW);
    const minHeight = Math.min(100, vpH);
    const rawWidth = Number(value?.width) || 0;
    const rawHeight = Number(value?.height) || 0;
    const width = Math.max(minWidth, Math.min(vpW, rawWidth || minWidth));
    const height = Math.max(minHeight, Math.min(vpH, rawHeight || minHeight));
    const maxLeft = Math.max(0, vpW - width);
    const maxTop = Math.max(0, vpH - height);
    const left = Math.max(0, Math.min(maxLeft, Number(value?.left) || 0));
    const top = Math.max(0, Math.min(maxTop, Number(value?.top) || 0));

    return { left, top, width, height };
  };

  const getActiveCropGuide = (viewport = editingPhotoViewportRef.current) => {
    const vpW = Math.max(0, Number(viewport?.width) || 0);
    const vpH = Math.max(0, Number(viewport?.height) || 0);
    const fallback = buildCropGuideLayout(vpW, vpH);
    const current = editingCropBoxRef.current;
    const hasCurrent = Number(current?.width) > 0 && Number(current?.height) > 0;

    if (!hasCurrent) return fallback;

    const clamped = clampCropBox(current, viewport);
    return {
      cropWidth: clamped.width,
      cropHeight: clamped.height,
      left: clamped.left,
      top: clamped.top,
      right: Math.max(0, vpW - (clamped.left + clamped.width)),
      bottom: Math.max(0, vpH - (clamped.top + clamped.height)),
    };
  };

  const getCropMetrics = (zoom = editingPhotoZoomRef.current) => {
    const viewport = editingPhotoViewportRef.current;
    const natural = editingPhotoSizeRef.current;

    const vpW = Number(viewport?.width) || 0;
    const vpH = Number(viewport?.height) || 0;
    const imgW = Number(natural?.width) || 0;
    const imgH = Number(natural?.height) || 0;

    if (!vpW || !vpH || !imgW || !imgH) return null;

    const fitScale = Math.min(vpW / imgW, vpH / imgH);
    const baseW = imgW * fitScale;
    const baseH = imgH * fitScale;
    const scaledW = baseW * zoom;
    const scaledH = baseH * zoom;
    const centerLeft = (vpW - baseW) / 2;
    const centerTop = (vpH - baseH) / 2;
    const imageBaseLeft = centerLeft - ((scaledW - baseW) / 2);
    const imageBaseTop = centerTop - ((scaledH - baseH) / 2);
    const guide = getActiveCropGuide(viewport);

    if (!guide.cropWidth || !guide.cropHeight) return null;

    return {
      vpW,
      vpH,
      imgW,
      imgH,
      baseW,
      baseH,
      scaledW,
      scaledH,
      imageBaseLeft,
      imageBaseTop,
      cropLeft: guide.left,
      cropTop: guide.top,
      cropWidth: guide.cropWidth,
      cropHeight: guide.cropHeight,
    };
  };

  const clampOffset = (value, zoom = editingPhotoZoomRef.current) => {
    const raw = {
      x: Number(value?.x) || 0,
      y: Number(value?.y) || 0,
    };
    const metrics = getCropMetrics(zoom);
    if (!metrics) return raw;

    const cropRight = metrics.cropLeft + metrics.cropWidth;
    const cropBottom = metrics.cropTop + metrics.cropHeight;

    let minX = cropRight - metrics.imageBaseLeft - metrics.scaledW;
    let maxX = metrics.cropLeft - metrics.imageBaseLeft;
    let minY = cropBottom - metrics.imageBaseTop - metrics.scaledH;
    let maxY = metrics.cropTop - metrics.imageBaseTop;

    if (minX > maxX) {
      const center = (minX + maxX) / 2;
      minX = center;
      maxX = center;
    }
    if (minY > maxY) {
      const center = (minY + maxY) / 2;
      minY = center;
      maxY = center;
    }

    return {
      x: Math.max(minX, Math.min(maxX, raw.x)),
      y: Math.max(minY, Math.min(maxY, raw.y)),
    };
  };

  const getEditorBaseSize = () => {
    const viewport = editingPhotoViewportRef.current;
    const natural = editingPhotoSizeRef.current;
    const vpW = Number(viewport?.width) || 0;
    const vpH = Number(viewport?.height) || 0;
    const imgW = Number(natural?.width) || 0;
    const imgH = Number(natural?.height) || 0;

    if (!vpW || !vpH || !imgW || !imgH) {
      return { width: vpW, height: vpH };
    }

    const fitScale = Math.min(vpW / imgW, vpH / imgH);
    return {
      width: imgW * fitScale,
      height: imgH * fitScale,
    };
  };

  const updateEditorZoom = (nextZoom) => {
    const safe = Math.max(1, Math.min(3, Number(nextZoom) || 1));
    setEditorZoom(safe);
    setEditorOffset(clampOffset(editingPhotoOffsetRef.current, safe));
  };

  const ensureEditorUri = async (uri) => {
    const raw = String(uri || '').trim();
    if (!raw) return '';
    if (raw.startsWith('file://')) return raw;

    try {
      const prepared = await ImageManipulator.manipulateAsync(
        raw,
        [],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG },
      );
      return prepared?.uri || raw;
    } catch {
      return raw;
    }
  };

  const abrirEditorFoto = async (index) => {
    const atual = normalizeFotoItem(fotos[index]);
    if (!atual.uri) return;

    const requestId = Date.now();
    photoEditorRequestRef.current = requestId;
    setEditingPhotoIndex(index);
    setEditingPhotoDraft(atual);
    setEditingPhotoCropUri('');
    setEditorZoom(1);
    setEditorOffset({ x: 0, y: 0 });
    setEditorCropBox({ left: 0, top: 0, width: 0, height: 0 });
    setEditingPhotoSize({ width: 0, height: 0 });
    setEditingPhotoViewport({ width: 0, height: 0 });
    editingPhotoSizeRef.current = { width: 0, height: 0 };
    editingPhotoViewportRef.current = { width: 0, height: 0 };
    setShowPhotoEditor(true);
    setPhotoEditorPreparing(true);

    const safeUri = await ensureEditorUri(atual.uri);
    if (photoEditorRequestRef.current !== requestId) return;

    if (safeUri && safeUri !== atual.uri) {
      setEditingPhotoCropUri(safeUri);
    }
    setPhotoEditorPreparing(false);
  };

  const fecharEditorFoto = () => {
    photoEditorRequestRef.current += 1;
    setShowPhotoEditor(false);
    setEditingPhotoIndex(-1);
    setEditingPhotoDraft(null);
    setEditingPhotoCropUri('');
    setEditorZoom(1);
    setEditorOffset({ x: 0, y: 0 });
    setEditorCropBox({ left: 0, top: 0, width: 0, height: 0 });
    setEditingPhotoSize({ width: 0, height: 0 });
    setEditingPhotoViewport({ width: 0, height: 0 });
    editingPhotoSizeRef.current = { width: 0, height: 0 };
    editingPhotoViewportRef.current = { width: 0, height: 0 };
    setPhotoEditorBusy(false);
    setPhotoEditorPreparing(false);
  };

  const getImageDimensions = (uri) => new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err),
    );
  });

  const applyZoomCrop = async (
    uri,
    zoom = editingPhotoZoomRef.current,
    offset = editingPhotoOffsetRef.current,
  ) => {
    const safeZoom = Math.max(1, Math.min(3, Number(zoom) || 1));
    if (!editingPhotoSizeRef.current.width || !editingPhotoSizeRef.current.height) {
      try {
        const fallbackSize = await getImageDimensions(uri);
        const next = {
          width: Number(fallbackSize?.width) || 0,
          height: Number(fallbackSize?.height) || 0,
        };
        setEditingPhotoSize(next);
        editingPhotoSizeRef.current = next;
      } catch {}
    }
    const metrics = getCropMetrics(safeZoom);
    if (!metrics) throw new Error('Área de recorte indisponível');

    const imageLeft = metrics.imageBaseLeft + (Number(offset?.x) || 0);
    const imageTop = metrics.imageBaseTop + (Number(offset?.y) || 0);

    const originXRaw = ((metrics.cropLeft - imageLeft) / metrics.scaledW) * metrics.imgW;
    const originYRaw = ((metrics.cropTop - imageTop) / metrics.scaledH) * metrics.imgH;
    const cropWRaw = (metrics.cropWidth / metrics.scaledW) * metrics.imgW;
    const cropHRaw = (metrics.cropHeight / metrics.scaledH) * metrics.imgH;

    const cropWidth = Math.max(1, Math.min(metrics.imgW, Math.round(cropWRaw)));
    const cropHeight = Math.max(1, Math.min(metrics.imgH, Math.round(cropHRaw)));
    const originX = Math.max(0, Math.min(metrics.imgW - cropWidth, Math.round(originXRaw)));
    const originY = Math.max(0, Math.min(metrics.imgH - cropHeight, Math.round(originYRaw)));

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
    );

    return result?.uri || uri;
  };

  const handleEditorPreviewLayout = (event) => {
    const { width, height } = event?.nativeEvent?.layout || {};
    const next = {
      width: Number(width) || 0,
      height: Number(height) || 0,
    };
    setEditingPhotoViewport(next);
    editingPhotoViewportRef.current = next;
    const current = editingCropBoxRef.current;
    if (!current?.width || !current?.height) {
      const initialGuide = buildCropGuideLayout(next.width, next.height);
      setEditorCropBox({
        left: initialGuide.left,
        top: initialGuide.top,
        width: initialGuide.cropWidth,
        height: initialGuide.cropHeight,
      });
    } else {
      setEditorCropBox(clampCropBox(current, next));
    }
    setEditorOffset(clampOffset(editingPhotoOffsetRef.current, editingPhotoZoomRef.current));
  };

  const photoPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        photoDragStartRef.current = editingPhotoOffsetRef.current;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const next = {
          x: photoDragStartRef.current.x + gestureState.dx,
          y: photoDragStartRef.current.y + gestureState.dy,
        };
        setEditorOffset(clampOffset(next, editingPhotoZoomRef.current));
      },
    }),
  ).current;

  const cropMovePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        cropMoveStartRef.current = editingCropBoxRef.current;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const start = cropMoveStartRef.current;
        const next = clampCropBox({
          left: start.left + gestureState.dx,
          top: start.top + gestureState.dy,
          width: start.width,
          height: start.height,
        });
        setEditorCropBox(next);
        setEditorOffset(clampOffset(editingPhotoOffsetRef.current, editingPhotoZoomRef.current));
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const cropResizePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        cropResizeStartRef.current = editingCropBoxRef.current;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const start = cropResizeStartRef.current;
        const next = clampCropBox({
          left: start.left,
          top: start.top,
          width: start.width + gestureState.dx,
          height: start.height + gestureState.dy,
        });
        setEditorCropBox(next);
        setEditorOffset(clampOffset(editingPhotoOffsetRef.current, editingPhotoZoomRef.current));
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  useEffect(() => {
    let active = true;
    const uri = editingPhotoDraft?.uri;
    if (!showPhotoEditor || !uri) return () => {};

    getImageDimensions(uri)
      .then((size) => {
        if (!active) return;
        const next = {
          width: Number(size?.width) || 0,
          height: Number(size?.height) || 0,
        };
        setEditingPhotoSize(next);
        editingPhotoSizeRef.current = next;
        setEditorOffset(clampOffset(editingPhotoOffsetRef.current, editingPhotoZoomRef.current));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [showPhotoEditor, editingPhotoDraft?.uri]);

  const salvarEdicaoFoto = async () => {
    if (editingPhotoIndex < 0 || !editingPhotoDraft?.uri) {
      fecharEditorFoto();
      return;
    }

    const sourceUri = editingPhotoCropUri || editingPhotoDraft.uri;
    let nextUri = sourceUri;
    try {
      setPhotoEditorBusy(true);
      nextUri = await applyZoomCrop(sourceUri, editingPhotoZoom);
    } catch {
      Alert.alert('Erro', 'Não foi possível recortar a foto.');
    } finally {
      setPhotoEditorBusy(false);
    }

    setFotos((prev) => prev.map((item, idx) => (
      idx === editingPhotoIndex
        ? normalizeFotoItem({
          ...editingPhotoDraft,
          uri: nextUri,
          originalUri: editingPhotoDraft.originalUri || editingPhotoDraft.uri,
        })
        : normalizeFotoItem(item)
    )));
    setPdfBase64(null);
    fecharEditorFoto();
  };

  const restaurarFotoOriginal = () => {
    if (editingPhotoIndex < 0) return;
    const original = String(editingPhotoDraft?.originalUri || '').trim();
    if (!original) return;

    setFotos((prev) => prev.map((item, idx) => (
      idx === editingPhotoIndex
        ? normalizeFotoItem({ ...normalizeFotoItem(item), uri: original, originalUri: original })
        : normalizeFotoItem(item)
    )));

    setEditingPhotoDraft((prev) => (prev ? { ...prev, uri: original, originalUri: original } : prev));
    setEditingPhotoCropUri('');
    setEditorZoom(1);
    setEditorOffset({ x: 0, y: 0 });
    setPdfBase64(null);
  };

  const guessMimeByUri = (uri) => {
    const lower = String(uri || '').toLowerCase();
    if (lower.includes('.png')) return 'image/png';
    if (lower.includes('.webp')) return 'image/webp';
    return 'image/jpeg';
  };

  const resolveLogoPreviewSrc = async () => {
    if (previewLogoRef.current) return previewLogoRef.current;
    try {
      const asset = Asset.fromModule(require('../../../assets/logoagrodann.png'));
      if (!asset.localUri) {
        await asset.downloadAsync();
      }
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

  const resolvePhotoPreviewSrc = async (uri) => {
    if (!uri) return '';
    const raw = String(uri);
    if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://')) {
      return raw;
    }

    try {
      const base64 = await FileSystem.readAsStringAsync(raw, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:${guessMimeByUri(raw)};base64,${base64}`;
    } catch {}

    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        raw,
        [],
        {
          compress: 0.75,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );
      if (manipulated?.base64) {
        return `data:image/jpeg;base64,${manipulated.base64}`;
      }
    } catch {}

    return raw;
  };

  const buildPreviewHtml = ({ logoSrc = '', photoSources = [] } = {}) => {
    const escapeHtml = (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const toInt = (value) => parseInt(value, 10) || 0;
    const sumInt = (value) => (Array.isArray(value) ? value.reduce((acc, item) => acc + toInt(item), 0) : toInt(value));
    const formatPct = (value, digits = 1) => `${Number(value || 0).toFixed(digits).replace('.', ',')}%`;
    const pct = (count, total) => {
      const n = toInt(count);
      if (!total || !n) return '-';
      return formatPct((n / total) * 100, 2);
    };

    const total = toInt(qtd);
    const totalInc = formatPct(incidencia, 1);

    const evalItems = [
      { label: 'Tecido Esponjoso', count: sumInt(te) },
      { label: 'Podridão de Caroço - Leve', count: toInt(pc[0]) },
      { label: 'Podridão de Caroço - Moderado', count: toInt(pc[1]) },
      { label: 'Podridão de Caroço - Severo', count: toInt(pc[2]) },
      { label: 'Distúrbio Fisiológico - Leve', count: toInt(df[0]) },
      { label: 'Distúrbio Fisiológico - Moderado', count: toInt(df[1]) },
      { label: 'Distúrbio Fisiológico - Severo', count: toInt(df[2]) },
      { label: 'Podridão Peduncular - Leve', count: toInt(peduncular[0]) },
      { label: 'Podridão Peduncular - Moderado', count: toInt(peduncular[1]) },
      { label: 'Podridão Peduncular - Severo', count: toInt(peduncular[2]) },
      { label: 'Antracnose', count: toInt(antracnose) },
      { label: 'Colapso', count: toInt(colapso) },
      { label: 'Germinação', count: toInt(germinacao) },
      { label: 'Alternária', count: toInt(alternaria) },
    ];

    const activeRows = evalItems.filter((item) => item.count > 0);
    const diagnosticRows = activeRows.length ? activeRows : [{ label: 'Sem diagnóstico informado', count: 0 }];
    const totalRowNumber = diagnosticRows.length + 1;

    const EVAL_SECTION_HEADER_H = 32;
    const EVAL_TABLE_HEADER_H = 24;
    const EVAL_ROW_H = 24;
    const EVAL_GAP_BEFORE_TOTAL_PCT_H = 8;
    const EVAL_TOTAL_PCT_BOX_H = 32;
    const COVER_AVAILABLE = 842 - 34 - 413;
    const CONT_AVAILABLE = 842 - 34 - 24;

    const estimateChartRows = () => {
      const categories = [
        sumInt(te),
        toInt(antracnose),
        toInt(colapso),
        toInt(germinacao),
        toInt(alternaria),
        toInt(pc[0]),
        toInt(pc[1]),
        toInt(pc[2]),
        toInt(df[0]),
        toInt(df[1]),
        toInt(df[2]),
        toInt(peduncular[0]),
        toInt(peduncular[1]),
        toInt(peduncular[2]),
      ];
      return Math.max(1, categories.filter((value) => value > 0).length);
    };

    const estimateSummaryPanelHeight = () => (estimateChartRows() * 18) + 72 + EVAL_GAP_BEFORE_TOTAL_PCT_H + EVAL_TOTAL_PCT_BOX_H;

    const rowsCapacity = ({ available, includeTotalRow = false, includeSummaryPanel = false }) => {
      let usable = available - EVAL_SECTION_HEADER_H - EVAL_TABLE_HEADER_H;
      if (includeTotalRow) usable -= EVAL_ROW_H;
      if (includeSummaryPanel) usable -= estimateSummaryPanelHeight();
      return Math.max(0, Math.floor(usable / EVAL_ROW_H));
    };

    const buildPlan = () => {
      const coverWithSummary = rowsCapacity({ available: COVER_AVAILABLE, includeTotalRow: true, includeSummaryPanel: true });
      if (diagnosticRows.length <= coverWithSummary) {
        return {
          cover: { start: 0, count: diagnosticRows.length, includeTotalRow: true, includeSummaryPanel: true },
          continuation: [],
        };
      }

      const coverWithTotalOnly = rowsCapacity({ available: COVER_AVAILABLE, includeTotalRow: true, includeSummaryPanel: false });
      if (diagnosticRows.length <= coverWithTotalOnly) {
        return {
          cover: { start: 0, count: diagnosticRows.length, includeTotalRow: true, includeSummaryPanel: false },
          continuation: [{ start: diagnosticRows.length, count: 0, includeTotalRow: false, includeSummaryPanel: true }],
        };
      }

      const coverRows = Math.min(rowsCapacity({ available: COVER_AVAILABLE }), diagnosticRows.length);
      const contRowsOnly = rowsCapacity({ available: CONT_AVAILABLE });
      const contWithSummary = rowsCapacity({ available: CONT_AVAILABLE, includeTotalRow: true, includeSummaryPanel: true });

      const continuation = [];
      let start = coverRows;
      let remaining = diagnosticRows.length - coverRows;
      while (remaining > contWithSummary && contRowsOnly > 0) {
        const pageCount = Math.min(contRowsOnly, remaining - contWithSummary);
        if (pageCount <= 0) break;
        continuation.push({ start, count: pageCount, includeTotalRow: false, includeSummaryPanel: false });
        start += pageCount;
        remaining -= pageCount;
      }
      continuation.push({ start, count: Math.max(0, remaining), includeTotalRow: true, includeSummaryPanel: true });

      return {
        cover: coverRows > 0 ? { start: 0, count: coverRows, includeTotalRow: false, includeSummaryPanel: false } : null,
        continuation,
      };
    };

    const plan = buildPlan();
    const pages = [];

    const renderRows = (segment) => {
      if (!segment) return '';
      const rows = diagnosticRows.slice(segment.start, segment.start + segment.count)
        .map((row, idx) => {
          const globalIndex = segment.start + idx + 1;
          return `<tr class="row-${globalIndex % 2 === 0 ? 'alt' : 'base'}">
            <td>3.${globalIndex} - ${escapeHtml(row.label)}</td>
            <td class="center">${row.count}</td>
            <td class="center">${pct(row.count, total)}</td>
          </tr>`;
        })
        .join('');

      const totalRowHtml = segment.includeTotalRow
        ? `<tr class="row-total">
            <td>3.${totalRowNumber} - Frutos com Danos Internos</td>
            <td class="center">${toInt(totalDefeito)}</td>
            <td class="center">${pct(totalDefeito, total)}</td>
          </tr>`
        : '';

      if (!rows && !totalRowHtml) return '';

      return `<table class="eval-table">
        <thead><tr><th>DIAGNÓSTICO</th><th class="center">QTD</th><th class="center">%</th></tr></thead>
        <tbody>${rows}${totalRowHtml}</tbody>
      </table>`;
    };

    const chartCategories = [
      { label: 'Tecido Esponjoso', count: sumInt(te) },
      { label: 'Antracnose', count: toInt(antracnose) },
      { label: 'Colapso', count: toInt(colapso) },
      { label: 'Germinação', count: toInt(germinacao) },
      { label: 'Alternária', count: toInt(alternaria) },
      { label: 'Podridão Caroço Leve', count: toInt(pc[0]) },
      { label: 'Podridão Caroço Moderado', count: toInt(pc[1]) },
      { label: 'Podridão Caroço Severo', count: toInt(pc[2]) },
      { label: 'Distúrbio Fis. Leve', count: toInt(df[0]) },
      { label: 'Distúrbio Fis. Moderado', count: toInt(df[1]) },
      { label: 'Distúrbio Fis. Severo', count: toInt(df[2]) },
      { label: 'Podridão Ped. Leve', count: toInt(peduncular[0]) },
      { label: 'Podridão Ped. Moderado', count: toInt(peduncular[1]) },
      { label: 'Podridão Ped. Severo', count: toInt(peduncular[2]) },
    ];
    const chartData = (chartCategories.filter((item) => item.count > 0).length
      ? chartCategories.filter((item) => item.count > 0)
      : [{ label: 'Tecido Esponjoso', count: 0 }]).map((item) => ({
      ...item,
      pct: total > 0 ? ((item.count / total) * 100) : 0,
    }));
    const maxPct = Math.max(10, ...chartData.map((item) => item.pct));
    const axisStep = maxPct <= 10 ? 2 : (maxPct <= 25 ? 5 : 10);
    const axisMax = Math.ceil(maxPct / axisStep) * axisStep;
    const axisTicks = Array.from({ length: 6 }).map((_, idx) => (axisMax / 5) * idx);

    const renderChartPanel = () => {
      const bars = chartData.map((item) => {
        const ratio = axisMax > 0 ? Math.max(0, Math.min(1, item.pct / axisMax)) : 0;
        const fill = Math.round(85 - (45 * ratio));
        const barColor = `hsl(132, 45%, ${fill}%)`;
        const width = Math.max(0, Math.min(100, (item.pct / axisMax) * 100));
        return `<div class="chart-row">
          <div class="chart-label">${escapeHtml(item.label)}</div>
          <div class="chart-track"><div class="chart-bar" style="width:${width}%;background:${barColor}"></div></div>
          <div class="chart-val">${formatPct(item.pct, 1)}</div>
        </div>`;
      }).join('');

      const ticks = axisTicks.map((tick) => `<span>${formatPct(tick, 0)}</span>`).join('');

      const previewPhotos = photoSources.length
        ? photoSources
        : (fotos || []).map((item) => getFotoUri(item)).filter(Boolean);
      const photoCards = previewPhotos.slice(0, 8).map((uri, idx) => `
        <div class="photo-card">
          <div class="photo-inner"><img src="${escapeHtml(uri)}" alt="Foto ${idx + 1}" /></div>
        </div>`).join('');
      const photosBlock = previewPhotos.length
        ? `<div class="section-head"><span class="badge">3</span><span>FOTOS</span></div><div class="photos-grid">${photoCards}</div>`
        : '';

      return `<div class="total-box">
          <span>PERCENTUAL TOTAL DE DANOS INTERNOS</span>
          <strong>${totalInc}</strong>
        </div>
        <div class="chart-panel">
          <div class="chart-title">DISTRIBUIÇÃO DE DANOS INTERNOS (%)</div>
          ${bars}
          <div class="chart-axis">${ticks}</div>
          <div class="chart-axis-label">Percentual dos danos internos</div>
        </div>
        ${photosBlock}`;
    };

    const coverEvalHtml = plan.cover ? `${renderRows(plan.cover)}${plan.cover.includeSummaryPanel ? renderChartPanel() : ''}` : '';

    pages.push(`
      <div class="page-content">
        <div class="report-head">
          ${logoSrc
            ? `<div class="logo-wrap"><img class="logo-img" src="${escapeHtml(logoSrc)}" alt="AGRODAN" /></div>`
            : '<div class="logo-text">AGRODAN</div>'}
          <div>
            <div class="head-title">ANÁLISE DE MATURAÇÃO FORÇADA</div>
            <div class="head-sub">CONTROLE DE QUALIDADE</div>
          </div>
        </div>
        <div class="top-grid">
          <div><b>Avaliador:</b> ${escapeHtml(avaliadorNome || 'Não informado')}</div>
          <div><b>Inicial:</b> ${escapeHtml(fmt(dataRec) || fmt(dataAna) || '-')}</div>
          <div><b>Avaliado:</b> ${escapeHtml(avaliadoNome || 'Não informado')}</div>
          <div><b>Fim:</b> ${escapeHtml(fmt(dataAna) || '-')}</div>
        </div>
        <div class="results-title">RESULTADOS</div>
        <div class="section-head"><span class="badge">1</span><span>DADOS</span></div>
        <table class="data-table">
          <tr><td>1.1 - Data da Análise</td><td>${escapeHtml(fmt(dataAna))}</td></tr>
          <tr><td>1.2 - Fazenda/Produtor</td><td>${escapeHtml(fazenda || fornecedor || '-')}</td></tr>
          <tr><td>1.3 - Talhão</td><td>${escapeHtml(parcela || talhao || '-')}</td></tr>
          <tr><td>1.4 - Variedade</td><td>${escapeHtml(variedade || '-')}</td></tr>
          <tr><td>1.5 - Observações</td><td>${escapeHtml(obs || '-')}</td></tr>
        </table>
        <div class="section-head"><span class="badge">2</span><span>RESUMO</span></div>
        <div class="summary">
          <div class="sum-card"><div class="sum-k">FRUTOS ANALISADOS</div><div class="sum-v">${total}</div></div>
          <div class="sum-card"><div class="sum-k">FRUTOS COM DANOS</div><div class="sum-v">${toInt(totalDefeito)}</div></div>
          <div class="sum-card"><div class="sum-k">PERCENTUAL TOTAL</div><div class="sum-v sum-v-accent">${totalInc}</div></div>
        </div>
        ${coverEvalHtml}
      </div>`);

    plan.continuation.forEach((segment) => {
      pages.push(`<div class="page-content">${renderRows(segment)}${segment.includeSummaryPanel ? renderChartPanel() : ''}</div>`);
    });

    const totalPages = pages.length;
    const pagesHtml = pages.map((pageHtml, index) => `
      <div class="page">
        ${pageHtml}
        <div class="footer">${index + 1} / ${totalPages}</div>
      </div>`).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; background: #242424; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .page { width: 595px; min-height: 842px; margin: 0 auto 16px; background: #fff; position: relative; padding: 18px 36px 28px; }
    .page-content { padding-bottom: 18px; }
    .footer { position: absolute; right: 36px; bottom: 8px; color: #777; font-size: 7.5px; font-weight: 700; }
    .report-head { display: flex; align-items: center; gap: 10px; border-left: 2.2px solid #0b8a43; border-bottom: 1px solid #0b8a43; padding-left: 7px; padding-bottom: 8px; }
    .logo-wrap { width: 155px; height: 34px; display: flex; align-items: center; }
    .logo-img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .logo-text { font-weight: 900; font-size: 24px; letter-spacing: .4px; color: #0b8a43; line-height: 1; }
    .head-title { font-weight: 900; font-size: 15.8px; color: #111; line-height: 1.05; }
    .head-sub { margin-top: 4px; font-size: 9.4px; font-weight: 700; color: #111; }
    .top-grid { margin-top: 6px; border: 1px solid #d8ddd8; background: #fbfcfb; padding: 7px 8px; display: grid; grid-template-columns: 1.35fr 1fr; row-gap: 2px; column-gap: 10px; font-size: 9.3px; }
    .results-title { margin: 10px 0 8px; text-align: center; font-size: 17px; font-weight: 900; border-bottom: 1px solid #dde8dd; padding-bottom: 3px; }
    .section-head { margin-top: 8px; display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 900; color: #111; }
    .badge { width: 32px; height: 22px; display: inline-flex; align-items: center; justify-content: center; background: #0b8a43; color: #fff; font-size: 13px; font-weight: 900; }
    .data-table, .eval-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    .data-table td { border-bottom: 1px solid #d6dcd6; padding: 4px 6px; font-size: 10.2px; }
    .data-table td:first-child { width: 66%; font-weight: 700; }
    .summary { margin-top: 6px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .sum-card { border: 1px solid #d6dcd6; background: #fff; }
    .sum-k { border-top: 2px solid #d29a50; background: #eff6ef; color: #0f6c3d; font-size: 8.1px; padding: 3px 8px; font-weight: 700; }
    .sum-v { text-align: center; padding: 8px 6px; font-size: 16.5px; font-weight: 900; color: #111; }
    .sum-v-accent { color: #cc8f3b; }
    .eval-table th, .eval-table td { border: 1px solid #cfd6cf; padding: 6px 8px; font-size: 10px; }
    .eval-table th { background: #eef1ee; font-size: 10px; text-align: left; }
    .eval-table th.center, .eval-table td.center { width: 82px; text-align: center; }
    .row-alt td { background: #f9fbf9; }
    .row-total td { background: #0b8a43; color: #fff; font-weight: 900; }
    .total-box { margin-top: 8px; border: 1px solid #d1d7d1; background: #f4f7f4; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; font-weight: 900; font-size: 10px; }
    .total-box strong { color: #cc8f3b; font-size: 13px; }
    .chart-panel { margin-top: 8px; border: 1px solid #d1d7d1; background: #f4f7f4; padding: 10px 10px 12px; }
    .chart-title { font-size: 9.4px; font-weight: 900; color: #1f5e37; margin-bottom: 8px; }
    .chart-row { display: grid; grid-template-columns: 110px 1fr 34px; align-items: center; gap: 8px; margin: 4px 0; font-size: 8.4px; }
    .chart-label { text-align: right; color: #333; }
    .chart-track { height: 13px; background: repeating-linear-gradient(to right, transparent 0, transparent calc(20% - 1px), #d9dfd9 calc(20% - 1px), #d9dfd9 20%); }
    .chart-bar { height: 100%; background: #0b8a43; }
    .chart-val { font-weight: 700; color: #666; font-size: 7.8px; }
    .chart-axis { margin-left: 118px; margin-right: 38px; display: flex; justify-content: space-between; font-size: 6.6px; color: #777; margin-top: 4px; }
    .chart-axis-label { text-align: center; color: #777; font-size: 7.2px; margin-top: 4px; }
    .photos-title { margin-top: 10px; font-size: 9px; font-weight: 900; color: #0f6c3d; }
    .photos-grid { margin-top: 6px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .photo-card { border: 1px solid #cfd6cf; background: #fff; }
    .photo-title { font-size: 8px; font-weight: 700; padding: 4px 6px; border-bottom: 1px solid #e5e9e5; }
    .photo-inner { height: 94px; background: #f2f5f2; display: flex; align-items: center; justify-content: center; }
    .photo-inner img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;
  };

  // Gera a prévia em HTML para exibir no WebView.
  const gerarPdfParaVisualizacao = async () => {
    if (pdfLoading) return;
    try {
      setPdfLoading(true);
      const [logoSrc, photoSources] = await Promise.all([
        resolveLogoPreviewSrc(),
        Promise.all((fotos || []).map((item) => resolvePhotoPreviewSrc(getFotoUri(item)))),
      ]);
      setPdfBase64(buildPreviewHtml({ logoSrc, photoSources }));
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível gerar a prévia.');
    } finally {
      setPdfLoading(false);
    }
  };

  useEffect(() => {
    if (step === 3 && !pdfBase64 && !pdfLoading) {
      gerarPdfParaVisualizacao();
    }
  }, [step, pdfBase64, pdfLoading]);

  // Limpa todos os campos do formulario e reseta as etapas.
  const limparFormulario = () => {
    setStep(0);
    setDataRec(null);
    setDataAna(new Date());
    setFazenda('');
    setTalhao('');
    setFornecedor('');
    setResponsavel('');
    setComprador('');
    setParcela('');
    setVariedade('');
    setQtd('');
    setTe('');
    setPc(['','','']);
    setDf(['','','']);
    setPeduncular(['','','']);
    setAntracnose('');
    setColapso('');
    setGerminacao('');
    setAlternaria('');
    setObs('');
    setFotos([]);
    setShowPhotoEditor(false);
    setEditingPhotoIndex(-1);
    setEditingPhotoDraft(null);
    setEditorZoom(1);
    setEditorOffset({ x: 0, y: 0 });
    setEditingPhotoSize({ width: 0, height: 0 });
    setEditingPhotoViewport({ width: 0, height: 0 });
    editingPhotoSizeRef.current = { width: 0, height: 0 };
    editingPhotoViewportRef.current = { width: 0, height: 0 };
    setPhotoEditorBusy(false);
    setPdfBase64(null);
  };

  // Salva rascunho.
  const salvarRascunho = async () => {
    if (!fazenda && !talhao && !qtd) return;
    const draftId = buildDraftIdByOs({ fazenda, parcela, talhao, dataRec });
    const snap = {
      id: draftId,
      savedAt: new Date().toISOString(),
      fazenda, talhao, fornecedor, responsavel, comprador, parcela, variedade, qtd,
      dataRec: dataRec?.toISOString() ?? null,
      dataAna: dataAna?.toISOString() ?? null,
      te, pc, df, peduncular, antracnose, colapso, germinacao, alternaria, obs,
    };
    try {
      const raw = await AsyncStorage.getItem(DRAFTS_KEY);
      const list = normalizeDraftList(raw ? JSON.parse(raw) : []);
      const updated = normalizeDraftList([snap, ...list]);
      await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(updated));
      setDrafts(updated);
    } catch {}
  };

  // Carrega rascunhos salvos localmente no dispositivo.
  const carregarRascunhos = async () => {
    try {
      const raw = await AsyncStorage.getItem(DRAFTS_KEY);
      const normalized = normalizeDraftList(raw ? JSON.parse(raw) : []);
      setDrafts(normalized);
      await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(normalized));
    } catch {}
  };

  // Remove um rascunho especifico do armazenamento local.
  const deletarRascunho = async (id) => {
    try {
      const updated = drafts.filter(d => d.id !== id);
      await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(updated));
      setDrafts(updated);
    } catch {}
  };

  // Restaura os dados de um rascunho selecionado no formulario.
  const restaurarRascunho = (draft) => {
    setDataRec(draft.dataRec ? new Date(draft.dataRec) : null);
    setDataAna(draft.dataAna ? new Date(draft.dataAna) : new Date());
    setFazenda(draft.fazenda || '');
    setTalhao(draft.talhao || '');
    setFornecedor(draft.fornecedor || '');
    setResponsavel(draft.responsavel || '');
    setComprador(draft.comprador || '');
    setParcela(draft.parcela || '');
    setVariedade(draft.variedade || '');
    setQtd(draft.qtd || '');
    setTe(draft.te || '');
    setPc(draft.pc || ['','','']);
    setDf(draft.df || ['','','']);
    setPeduncular(draft.peduncular || ['','','']);
    setAntracnose(draft.antracnose || '');
    setColapso(draft.colapso || '');
    setGerminacao(draft.germinacao || '');
    setAlternaria(draft.alternaria || '');
    setObs(draft.obs || '');
    setStep(0);
    setShowHistorico(false);
  };

  // Monta o payload padrao usado para gerar o PDF.
  const buildPdfPayload = () => ({
    dataRec: fmt(dataRec),
    dataAna: fmt(dataAna),
    fazenda,
    talhao,
    fornecedor,
    responsavel: avaliadorNome,
    comprador,
    avaliado: avaliadoNome,
    usuario: avaliadorNome,
    cargo: avaliadorCargo,
    matricula: avaliadorMatricula,
    parcela,
    variedade,
    qtd,
    te,
    pc,
    df,
    peduncular,
    antracnose,
    colapso,
    germinacao,
    alternaria,
    totalDefeito,
    incidencia,
    fotos: (fotos || []).map((item) => getFotoUri(item)).filter(Boolean),
    obs,
  });

  // Gera o arquivo PDF e retorna o caminho para salvar/compartilhar.
  const gerarArquivoPdf = async (prefix = 'maturacao_forcada') => {
    const pdfContent = await buildMaturacaoPdfReport(buildPdfPayload());
    const fileName = `${prefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    const pdfBase64 = Buffer.from(pdfContent, 'binary').toString('base64');
    await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { fileName, fileUri };
  };

  // Gera e compartilha o PDF novo sem enviar dados ao servidor.
  const gerarPdfTeste = async () => {
    if (isGeneratingPdf) return;
    if (!validarIdentificacao() || !validarAvaliacao()) return;

    try {
      setIsGeneratingPdf(true);
      const { fileName, fileUri } = await gerarArquivoPdf('maturacao_forcada_teste');

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Teste do novo PDF - Maturação Forçada',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF de teste gerado', `Arquivo salvo: ${fileName}`);
      }
    } catch (error) {
      console.error('Erro ao gerar PDF de teste:', error);
      Alert.alert('Erro', 'Não foi possível gerar o PDF de teste.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Salva ecompartilhar.
  const salvarECompartilhar = async () => {
    if (isGeneratingPdf) return;
    if (!validarIdentificacao() || !validarAvaliacao()) return;

    try {
      setIsGeneratingPdf(true);

      // 1. Monta payload
      const formData = new FormData();
      formData.append('comprador',     comprador   || '');
      formData.append('produtor',      fazenda     || '');
      formData.append('parcela',       parcela     || '');
      formData.append('responsavel',   avaliadorNome || '');
      formData.append('usuario',       avaliadorNome || '');
      formData.append('cargo',         avaliadorCargo || '');
      formData.append('matricula',     avaliadorMatricula || '');
      formData.append('variedade',     variedade   || '');
      formData.append('dataRec',       dataRec ? fmt(dataRec) : '');
      formData.append('dataAna',       dataAna ? fmt(dataAna) : '');
      formData.append('obs',           obs         || '');
      formData.append('qtd',           qtd         || '0');
      formData.append('te',            String(te   || '0'));
      formData.append('pc',            JSON.stringify(pc));
      formData.append('df',            JSON.stringify(df));
      formData.append('peduncular',    JSON.stringify(peduncular));
      formData.append('antracnose',    antracnose  || '0');
      formData.append('colapso',       colapso     || '0');
      formData.append('germinacao',    germinacao  || '0');
      formData.append('alternaria',    alternaria  || '0');
      formData.append('totalDefeito',  String(totalDefeito));
      formData.append('incidencia',    String(incidencia));
      (fotos || []).forEach((item, i) => {
        const uri = getFotoUri(item);
        if (!uri) return;
        const ext  = uri.split('.').pop()?.toLowerCase() || 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        formData.append('fotos', { uri, type: mime, name: `foto_${i + 1}.${ext}` });
      });

      // 2. Envia para o backend
      let enviouServidor = false;
      try {
        await api.post('/maturacao-forcada', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        enviouServidor = true;
      } catch (saveError) {
        console.warn('Erro ao salvar no servidor:', saveError?.message);
        // Salva no sininho para sincronizar depois
        try {
          const offlineKey = 'maturacao_forcada_offline';
          const existing = await AsyncStorage.getItem(offlineKey);
          const lista = existing ? JSON.parse(existing) : [];
          const offlineIndex = lista.length;
          lista.push({
            id: `maturacao_forcada_offline_${offlineIndex}`,
            comprador, produtor: fazenda, parcela, responsavel, variedade,
            dataRec: dataRec ? fmt(dataRec) : '',
            dataAna: dataAna ? fmt(dataAna) : '',
            obs, qtd,
            te: String(te || '0'),
            pc: JSON.stringify(pc),
            df: JSON.stringify(df),
            peduncular: JSON.stringify(peduncular),
            antracnose, colapso, germinacao, alternaria,
            totalDefeito: String(totalDefeito),
            incidencia: String(incidencia),
            tipo: 'Maturação Forçada',
            momento: new Date().toISOString(),
            _syncStatus: 'pending',
          });
          await AsyncStorage.setItem(offlineKey, JSON.stringify(lista));
        } catch (offlineError) {
          console.warn('Erro ao salvar offline:', offlineError?.message);
        }
      }

      // 3. Gera PDF do fluxo oficial.
      await gerarArquivoPdf();


      // 4. Se enviou com sucesso â†' limpa formulÃ¡rio
      if (enviouServidor) {
        limparFormulario();
      } else {
        Alert.alert(
          'Salvo offline',
          'Sem conexão com o servidor. O registro foi salvo no sininho e será sincronizado quando houver conexão.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Erro ao salvar/compartilhar:', error);
      Alert.alert('Erro', 'Não foi possível concluir a operação.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Trata a acao principal do botao conforme a etapa atual.
  const handleMainAction = async () => {
    if (step === 0 && !validarIdentificacao()) return;
    if (step === 1 && !validarAvaliacao()) return;

    if (step < 3) {
      salvarRascunho();
      const next = step + 1;
      if (next === 3) setPdfBase64(null);
      setStep(next);
      return;
    }

    await salvarECompartilhar();
  };

  const handleStepPress = (nextStep) => {
    if (nextStep === 3) setPdfBase64(null);
    setStep(nextStep);
  };

  async function addFromGallery() {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) return Alert.alert('Permissão negada', 'Habilite o acesso à galeria.');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.8 });
    if (!r.canceled) {
      setFotos((prev) => [
        ...prev.map((item) => normalizeFotoItem(item)),
        ...r.assets.map((a) => ({ uri: a.uri, originalUri: a.uri, fitMode: 'contain' })),
      ]);
      setPdfBase64(null);
    }
  }
  async function addFromCamera() {
    const pCam = await ImagePicker.requestCameraPermissionsAsync();
    if (!pCam.granted) return Alert.alert('Permissão negada', 'Habilite o acesso à câmera.');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (r.canceled) return;
    const uri = r.assets[0].uri;
    setFotos((prev) => [...prev.map((item) => normalizeFotoItem(item)), { uri, originalUri: uri, fitMode: 'contain' }]);
    setPdfBase64(null);
    try {
      const pMed = await MediaLibrary.requestPermissionsAsync();
      if (pMed.granted) await MediaLibrary.saveToLibraryAsync(uri);
    } catch {}
  }

  const VARIEDADES_KEY = '@maturacao:variedades_custom';

  // Salva nova variedade.
  const salvarNovaVariedade = async (nome) => {
    const limpo = nome.trim().toUpperCase();
    if (!limpo) return;

    // Salva no banco via API
    try {
      await api.post('/variedades', { nome: limpo });
      // Atualiza lista da API em cache e no estado
      setVariedadesApi(prev => {
        const atualizada = [...new Set([...prev, limpo])];
        AsyncStorage.setItem('@maturacao:variedades_api', JSON.stringify(atualizada)).catch(() => {});
        return atualizada;
      });
    } catch (err) {
      // 409 = jÃ¡ existe no banco, tudo bem â€" continua
      if (!err?.response || err?.response?.status !== 409) {
        // Fallback: salva sÃ³ local se API falhou por outro motivo
        try {
          const raw = await AsyncStorage.getItem(VARIEDADES_KEY);
          const lista = raw ? JSON.parse(raw) : [];
          if (!lista.includes(limpo)) {
            lista.push(limpo);
            await AsyncStorage.setItem(VARIEDADES_KEY, JSON.stringify(lista));
          }
        } catch {}
      }
    }

    setVariedade(limpo);
    setVariedadeOptions(prev => [...new Set([...prev, limpo])]);
    setNovaVariedade('');
    setBuscaVariedade('');
    setShowCadastroVariedade(false);
    setShowVariedadePicker(false);
  };

  // Carrega variedades personalizadas salvas pelo usuario.
  const carregarVariedadesCustom = async () => {
    try {
      const raw = await AsyncStorage.getItem(VARIEDADES_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  };

  const variedadesFiltradas = variedadeOptions.filter((opt) =>
    opt.toLowerCase().includes(buscaVariedade.toLowerCase())
  );

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PASSOS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderIdentificacao() {
    return (
      <View style={st.card}>
        <View style={st.cardBar} />
        <Text style={st.cardTitle}>Identificação da Análise</Text>

        <DateField label="Data de Recebimento" required value={dataRec} onPress={() => setShowDateRec(true)} />
        <DateField label="Data da Análise"     required value={dataAna} onPress={() => setShowDateAna(true)} />

        {/* Parcela */}
        <View style={st.field}>
          <Text style={st.fieldLabel}>Talhão<Text style={st.req}> *</Text></Text>
          <TouchableOpacity
            style={[st.inputBox, st.row]}
            onPress={() => setShowTalhao(true)}
            activeOpacity={0.8}
          >
            <Text style={[st.inputText, !parcela && st.placeholder, { flex: 1 }]}>
              {parcela || 'Selecione o talhão...'}
            </Text>
            <MaterialIcons name="expand-more" size={22} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Variedade */}
        <View style={st.field}>
          <Text style={st.fieldLabel}>Variedade</Text>
          <TouchableOpacity
            style={[st.inputBox, st.row]}
            onPress={async () => {
              const custom = await carregarVariedadesCustom();
              const combined = [...new Set([...variedadeOptions, ...variedadesApi, ...custom])];
              setVariedadeOptions(combined);
              setBuscaVariedade('');
              setShowVariedadePicker(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={[st.inputText, !variedade && st.placeholder]}>{variedade || 'Variedade'}</Text>
            <MaterialIcons name="chevron-right" size={18} color="#BDBDBD" />
          </TouchableOpacity>
        </View>

        {/* ObservaÃ§Ãµes */}
        <View style={st.field}>
          <Text style={st.fieldLabel}>Observações</Text>
          <TextInput
            style={[st.inputBox, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
            placeholder="Digite observações..."
            placeholderTextColor="#C0C0C0"
            value={obs}
            onChangeText={setObs}
            multiline
          />
        </View>

      </View>
    );
  }

  // Renderiza a etapa de avaliacao com os campos de diagnostico.
  function renderAvaliacaoNovo() {
    // Sanitiza entrada numerica mantendo apenas digitos.
    const sanitize = (t = '') => t.replace(/\D/g, '');
    // Atualiza pc at.
    const updatePcAt = (idx, value) => setPc((prev) => prev.map((item, i) => (i === idx ? value : item)));
    // Atualiza df at.
    const updateDfAt = (idx, value) => setDf((prev) => prev.map((item, i) => (i === idx ? value : item)));
    // Atualiza ped at.
    const updatePedAt = (idx, value) => setPeduncular((prev) => prev.map((item, i) => (i === idx ? value : item)));

    const linhasDiagnostico = [
      { key: 'te', label: 'Tecido Esponjoso', value: te, onChange: setTe },
      { key: 'pc_l', label: 'Podridão de Caroço - Leve', value: pc[0], onChange: (v) => updatePcAt(0, v) },
      { key: 'pc_m', label: 'Podridão de Caroço - Moderado', value: pc[1], onChange: (v) => updatePcAt(1, v) },
      { key: 'pc_s', label: 'Podridão de Caroço - Severo', value: pc[2], onChange: (v) => updatePcAt(2, v) },
      { key: 'df_l', label: 'Distúrbio Fisiológico - Leve', value: df[0], onChange: (v) => updateDfAt(0, v) },
      { key: 'df_m', label: 'Distúrbio Fisiológico - Moderado', value: df[1], onChange: (v) => updateDfAt(1, v) },
      { key: 'df_s', label: 'Distúrbio Fisiológico - Severo', value: df[2], onChange: (v) => updateDfAt(2, v) },
      { key: 'pp_l', label: 'Podridão Peduncular - Leve', value: peduncular[0], onChange: (v) => updatePedAt(0, v) },
      { key: 'pp_m', label: 'Podridão Peduncular - Moderado', value: peduncular[1], onChange: (v) => updatePedAt(1, v) },
      { key: 'pp_s', label: 'Podridão Peduncular - Severo', value: peduncular[2], onChange: (v) => updatePedAt(2, v) },
      { key: 'antr', label: 'Antracnose', value: antracnose, onChange: setAntracnose },
      { key: 'cola', label: 'Colapso', value: colapso, onChange: setColapso },
      { key: 'germ', label: 'Germinação', value: germinacao, onChange: setGerminacao },
      { key: 'alte', label: 'Alternária', value: alternaria, onChange: setAlternaria },
    ];

    return (
      <>
        <View style={st.evalTableWrap}>
          <Text style={st.evalTableTitle}>Resumo da Avaliação</Text>
          <View style={st.evalHeaderRow}>
            <Text style={[st.evalHeaderCell, st.evalColDescricao]}>CAMPO</Text>
            <Text style={[st.evalHeaderCell, st.evalColValor]}>VALOR</Text>
          </View>

          <View style={[st.evalDataRow, st.evalRowOdd]}>
            <Text style={[st.evalCellText, st.evalColDescricao, st.evalCellBorderRight]}>
              Quantidade de Frutos *
            </Text>
            <View style={st.evalColValor}>
              <TextInput
                style={st.evalValueInput}
                value={qtd}
                onChangeText={(t) => setQtd(sanitize(t))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#B0B0B0"
              />
            </View>
          </View>
        </View>

        <View style={[st.evalTableWrap, st.evalTableGap]}>
          <Text style={st.evalTableTitle}>Avaliação - Danos Internos</Text>
          <View style={st.evalHeaderRow}>
            <Text style={[st.evalHeaderCell, st.evalColDescricao]}>DIAGNÓSTICO</Text>
            <Text style={[st.evalHeaderCell, st.evalColValor]}>QTD</Text>
          </View>

          {linhasDiagnostico.map((linha, idx) => (
            <View
              key={linha.key}
              style={[st.evalDataRow, idx % 2 === 0 ? st.evalRowOdd : st.evalRowEven]}
            >
              <Text style={[st.evalCellText, st.evalColDescricao, st.evalCellBorderRight]}>
                {linha.label}
              </Text>
              <View style={st.evalColValor}>
                <TextInput
                  style={st.evalValueInput}
                  value={linha.value}
                  onChangeText={(t) => linha.onChange(sanitize(t))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#B0B0B0"
                />
              </View>
            </View>
          ))}
        </View>

        <View style={st.evalBottomSpacer} />
      </>
    );
  }
  // Renderiza a etapa de fotos com captura e gerenciamento de imagens.
  function renderFotos() {
    return (
      <>
        <TouchableOpacity style={st.uploadZone} onPress={addFromGallery} activeOpacity={0.8}>
          <View style={st.uploadIcon}>
            <MaterialIcons name="add-a-photo" size={36} color={GREEN} />
          </View>
          <Text style={st.uploadTitle}>Adicionar Fotos</Text>
            <Text style={st.uploadSub}>
              {fotos.length > 0
                ? `${fotos.length} foto(s) - toque para recortar`
                : 'Toque para selecionar da galeria'}
            </Text>
        </TouchableOpacity>

        {fotos.length > 0 && (
          <View style={st.photoGrid}>
            {fotos.map((fotoItem, i) => {
              const foto = normalizeFotoItem(fotoItem);
              return (
              <View key={i} style={st.thumb}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  activeOpacity={0.85}
                  onPress={() => abrirEditorFoto(i)}
                >
                  <Image source={{ uri: foto.uri }} style={st.thumbImg} resizeMode="contain" />
                </TouchableOpacity>
                <View style={st.thumbBadge}>
                  <Text style={st.thumbBadgeText}>{i + 1}</Text>
                </View>
                <View style={st.thumbBar}>
                  <TouchableOpacity onPress={() => abrirEditorFoto(i)}>
                    <MaterialIcons name="content-cut" size={18} color="#2E7D32" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    setFotos((f) => f.filter((_, idx) => idx !== i));
                    setPdfBase64(null);
                  }}>
                    <MaterialIcons name="delete" size={18} color="#E74C3C" />
                  </TouchableOpacity>
                </View>
              </View>
            );
            })}
            <TouchableOpacity style={st.thumbAdd} onPress={addFromGallery}>
              <MaterialIcons name="add-photo-alternate" size={30} color={GREEN} />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={st.cameraBtn} onPress={addFromCamera} activeOpacity={0.85}>
          <MaterialIcons name="camera-alt" size={20} color={GREEN} />
          <Text style={st.cameraBtnText}>Tirar Foto com a Câmera</Text>
        </TouchableOpacity>
      </>
    );
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER PRINCIPAL
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderResumo() {
    if (pdfLoading) {
      return (
        <View style={st.pdfLoadingBox}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={st.pdfLoadingText}>Gerando PDF...</Text>
        </View>
      );
    }
    if (!pdfBase64) {
      return (
        <View style={st.pdfLoadingBox}>
          <MaterialIcons name="picture-as-pdf" size={48} color="#CCC" />
          <Text style={st.pdfLoadingText}>PDF não disponível</Text>
        </View>
      );
    }
    return (
      <WebView
        source={{ html: pdfBase64 }}
        style={st.pdfWebView}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled
        pinchGestureEnabled
        scalesPageToFit={false}
      />
    );
  }

  const cropGuide = getActiveCropGuide(editingPhotoViewport);
  const editorDisplayUri = editingPhotoDraft?.uri || editingPhotoCropUri || '';
  const canRestoreOriginal = Boolean(
    editingPhotoDraft?.originalUri
    && editingPhotoDraft?.uri
    && editingPhotoDraft.originalUri !== editingPhotoDraft.uri
  );

  return (
    <SafeAreaView style={st.safe}>

      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={voltar} style={st.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={GREEN} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={require('../../../assets/logoagrodann.png')} style={st.logo} resizeMode="contain" />
          <View style={{ width: 1, height: 18, backgroundColor: '#2E7D32' }} />
          <Image source={require('../../../../assets/CQLETRA.png')} style={st.logoCQ} resizeMode="contain" />
        </View>
        <TouchableOpacity
          style={st.histBtn}
          onPress={() => { carregarRascunhos(); setShowHistorico(true); }}
        >
          <MaterialIcons name="history" size={18} color={ORANGE} />
          <Text style={st.histBtnText}>Histórico</Text>
          {drafts.length > 0 && (
            <View style={st.histBadge}><Text style={st.histBadgeText}>{drafts.length}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      {/* Steps â€" clicÃ¡veis */}
      <View style={st.stepWrap}>
        <StepIndicator current={step} onPress={handleStepPress} />
      </View>

      {/* ConteÃºdo */}
      {step === 3 ? (
        renderResumo()
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={[st.scroll, { paddingBottom: 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 0 && renderIdentificacao()}
            {step === 1 && renderAvaliacaoNovo()}
            {step === 2 && renderFotos()}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* BotÃ£o flutuante fixo direita */}
      {step === 3 && (
        <TouchableOpacity
          style={[st.fabTest, isGeneratingPdf && { opacity: 0.6 }]}
          onPress={gerarPdfTeste}
          activeOpacity={0.85}
          disabled={isGeneratingPdf}
        >
          <MaterialIcons name="science" size={18} color={GREEN} />
          <Text style={st.fabTestText}>{isGeneratingPdf ? 'Gerando...' : 'Teste PDF'}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[st.fab, step === 3 && { backgroundColor: ORANGE }, isGeneratingPdf && { opacity: 0.6 }]}
        onPress={handleMainAction}
        activeOpacity={0.85}
        disabled={isGeneratingPdf}
      >
        <MaterialIcons name={step === 3 ? 'save' : 'arrow-forward'} size={20} color="#fff" />
        <Text style={st.fabText}>
          {isGeneratingPdf ? 'Processando...' : (step === 3 ? 'Salvar' : 'Avançar')}
        </Text>
      </TouchableOpacity>

      {/* â"€â"€ MODAIS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}

      <DateModal
        visible={showDateRec}
        current={dataRec || new Date()}
        onConfirm={setDataRec}
        onClose={() => setShowDateRec(false)}
      />
      <DateModal
        visible={showDateAna}
        current={dataAna}
        onConfirm={setDataAna}
        onClose={() => setShowDateAna(false)}
      />
      <Modal
        visible={showPhotoEditor}
        transparent={false}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={fecharEditorFoto}
      >
        <SafeAreaView style={st.photoEditorScreen}>
          <View style={[st.photoEditorHeader, { paddingTop: Math.max(6, insets.top + 2) }]}>
            <TouchableOpacity
              style={[st.photoHeaderBtn, photoEditorBusy && { opacity: 0.7 }]}
              onPress={fecharEditorFoto}
              disabled={photoEditorBusy}
              activeOpacity={0.8}
            >
              <MaterialIcons name="close" size={20} color="#2A2A2A" />
              <Text style={st.photoHeaderBtnText}>Cancelar</Text>
            </TouchableOpacity>

            <Text style={st.photoHeaderTitle}>Recortar Foto</Text>

            <TouchableOpacity
              style={[st.photoHeaderBtn, st.photoHeaderBtnPrimary, (photoEditorBusy || photoEditorPreparing || !editorDisplayUri) && { opacity: 0.7 }]}
              onPress={salvarEdicaoFoto}
              disabled={photoEditorBusy || photoEditorPreparing || !editorDisplayUri}
              activeOpacity={0.8}
            >
              <MaterialIcons name={photoEditorPreparing ? 'hourglass-empty' : 'check'} size={20} color="#fff" />
              <Text style={st.photoHeaderBtnPrimaryText}>
                {photoEditorPreparing ? 'Aguarde' : (photoEditorBusy ? 'Aplicando' : 'Aplicar')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={st.photoEditorCanvasWrap}>
            {editorDisplayUri ? (
              <View style={st.photoEditorPreview} onLayout={handleEditorPreviewLayout}>
                <View style={st.photoEditorPreviewStage} {...photoPanResponder.panHandlers}>
                  <Image
                    source={{ uri: editorDisplayUri }}
                    style={[
                      st.photoEditorPreviewImage,
                      (() => {
                        const base = getEditorBaseSize();
                        return {
                          width: base.width || (editingPhotoViewport.width || 1),
                          height: base.height || (editingPhotoViewport.height || 1),
                        };
                      })(),
                      {
                        transform: [
                          { scale: editingPhotoZoom },
                          { translateX: editingPhotoOffset.x },
                          { translateY: editingPhotoOffset.y },
                        ],
                      },
                    ]}
                    onError={(event) => {
                      const msg = event?.nativeEvent?.error || 'erro-desconhecido';
                      console.warn('[MaturacaoForcada] Falha ao renderizar foto no recorte:', msg);
                      if (editingPhotoCropUri && editorDisplayUri !== editingPhotoCropUri) {
                        setEditingPhotoDraft((prev) => (prev ? { ...prev, uri: editingPhotoCropUri } : prev));
                      }
                    }}
                    resizeMode="contain"
                  />
                </View>

                {cropGuide.cropWidth > 0 && cropGuide.cropHeight > 0 ? (
                  <>
                    <View pointerEvents="none" style={[st.photoCropShadeTop, { height: cropGuide.top }]} />
                    <View pointerEvents="none" style={[st.photoCropShadeBottom, { height: cropGuide.bottom }]} />
                    <View
                      pointerEvents="none"
                      style={[
                        st.photoCropShadeLeft,
                        { top: cropGuide.top, height: cropGuide.cropHeight, width: cropGuide.left },
                      ]}
                    />
                    <View
                      pointerEvents="none"
                      style={[
                        st.photoCropShadeRight,
                        { top: cropGuide.top, height: cropGuide.cropHeight, width: cropGuide.right },
                      ]}
                    />

                    <View
                      style={[
                        st.photoCropBox,
                        st.photoCropBoxShadow,
                        {
                          width: cropGuide.cropWidth,
                          height: cropGuide.cropHeight,
                          left: cropGuide.left,
                          top: cropGuide.top,
                        },
                      ]}
                      {...cropMovePanResponder.panHandlers}
                    >
                      <View style={[st.photoCropCorner, st.photoCropCornerTopLeft]} />
                      <View style={[st.photoCropCorner, st.photoCropCornerTopRight]} />
                      <View style={[st.photoCropCorner, st.photoCropCornerBottomLeft]} />
                      <View style={[st.photoCropCorner, st.photoCropCornerBottomRight]} />
                    </View>

                    <View
                      style={[
                        st.photoCropResizeHandle,
                        {
                          left: cropGuide.left + cropGuide.cropWidth - 18,
                          top: cropGuide.top + cropGuide.cropHeight - 18,
                        },
                      ]}
                      {...cropResizePanResponder.panHandlers}
                    >
                      <MaterialIcons name="open-with" size={14} color="#fff" />
                    </View>
                  </>
                ) : null}
              </View>
            ) : photoEditorPreparing ? (
              <View style={st.photoEditorLoading}>
                <ActivityIndicator size="large" color={GREEN} />
                <Text style={st.photoEditorNoImageText}>Preparando foto para recorte...</Text>
              </View>
            ) : (
              <View style={st.photoEditorNoImage}>
                <MaterialIcons name="image-not-supported" size={26} color="#9AA39D" />
                <Text style={st.photoEditorNoImageText}>Foto não disponível para recorte.</Text>
              </View>
            )}
          </View>

          <View style={st.photoEditorBottomPanel}>
            <Text style={st.photoEditorHint}>Arraste a imagem, mova o quadrado e use a alça para aumentar ou diminuir.</Text>

            <TouchableOpacity
              style={[st.photoEditorRestoreBtn, (!canRestoreOriginal || photoEditorPreparing || photoEditorBusy) && { opacity: 0.45 }]}
              onPress={restaurarFotoOriginal}
              disabled={!canRestoreOriginal || photoEditorPreparing || photoEditorBusy}
              activeOpacity={0.8}
            >
              <MaterialIcons name="restore" size={18} color="#FFFFFF" />
              <Text style={st.photoEditorRestoreText}>Restaurar original</Text>
            </TouchableOpacity>

            <View style={st.photoEditorActions}>
              <TouchableOpacity
                style={[st.photoEditorActionBtn, (!editorDisplayUri || photoEditorPreparing) && { opacity: 0.5 }]}
                onPress={() => updateEditorZoom(Number((editingPhotoZoom - 0.1).toFixed(1)))}
                disabled={!editorDisplayUri || photoEditorPreparing}
                activeOpacity={0.8}
              >
                <MaterialIcons name="zoom-out" size={18} color={GREEN} />
                <Text style={st.photoEditorActionText}>Diminuir</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[st.photoEditorActionBtn, st.photoEditorZoomValue, (!editorDisplayUri || photoEditorPreparing) && { opacity: 0.5 }]}
                onPress={() => {
                  updateEditorZoom(1);
                  setEditorOffset({ x: 0, y: 0 });
                }}
                disabled={!editorDisplayUri || photoEditorPreparing}
                activeOpacity={0.8}
              >
                <MaterialIcons name="center-focus-strong" size={18} color={GREEN} />
                <Text style={st.photoEditorActionText}>{editingPhotoZoom.toFixed(1)}x</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[st.photoEditorActionBtn, (!editorDisplayUri || photoEditorPreparing) && { opacity: 0.5 }]}
                onPress={() => updateEditorZoom(Number((editingPhotoZoom + 0.1).toFixed(1)))}
                disabled={!editorDisplayUri || photoEditorPreparing}
                activeOpacity={0.8}
              >
                <MaterialIcons name="zoom-in" size={18} color={GREEN} />
                <Text style={st.photoEditorActionText}>Aumentar</Text>
              </TouchableOpacity>
            </View>

            {photoEditorBusy ? (
              <Text style={st.photoEditorBusyText}>Aplicando recorte...</Text>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
      <ListModal
        visible={showFazenda}
        title="Selecione a Fazenda"
        options={fazendas}
        onSelect={handleFazendaSelect}
        onClose={() => setShowFazenda(false)}
      />
      <TalhaoListModal
        visible={showTalhao}
        items={talhoesList}
        onSelect={handleTalhaoSelect}
        onClose={() => setShowTalhao(false)}
      />
      <TextModal
        visible={showVariedade}
        title="Variedade"
        placeholder="Ex: Palmer"
        value={variedade}
        onConfirm={setVariedade}
        onClose={() => setShowVariedade(false)}
      />
      {/* Picker de variedade */}
      <Modal
        visible={showVariedadePicker}
        transparent
        animationType="fade"
        onRequestClose={() => { setBuscaVariedade(''); setShowVariedadePicker(false); }}
      >
        <Pressable style={st.overlay} onPress={() => { setBuscaVariedade(''); setShowVariedadePicker(false); }}>
          <Pressable style={st.listBox} onPress={e => e.stopPropagation()}>
            <Text style={st.modalTitle}>Variedades</Text>
            <TextInput
              style={st.searchInput}
              placeholder="Buscar variedade..."
              placeholderTextColor="#BDBDBD"
              value={buscaVariedade}
              onChangeText={setBuscaVariedade}
            />
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {variedadesFiltradas.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#888', fontSize: 13 }}>Nenhuma variedade encontrada.</Text>
                </View>
              ) : variedadesFiltradas.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={st.listItem}
                  onPress={() => { setVariedade(opt); setBuscaVariedade(''); setShowVariedadePicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[st.listItemText, { flex: 1 }]}>{opt}</Text>
                  <MaterialIcons name="chevron-right" size={20} color="#CCC" />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={st.cadastrarVarBtn}
              onPress={() => {
                setNovaVariedade('');
                // iOS nÃ£o abre segundo Modal com outro aberto â€" fecha o primeiro antes
                setShowVariedadePicker(false);
                setTimeout(() => setShowCadastroVariedade(true), 400);
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add-circle-outline" size={18} color={ORANGE} />
              <Text style={st.cadastrarVarText}>Cadastrar nova variedade</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal cadastro nova variedade */}
      <Modal
        visible={showCadastroVariedade}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCadastroVariedade(false)}
      >
        <Pressable style={st.overlay} onPress={() => setShowCadastroVariedade(false)}>
          <Pressable style={st.textBox} onPress={e => e.stopPropagation()}>
            <Text style={st.modalTitle}>Nova Variedade</Text>
            <TextInput
              style={st.modalInput}
              placeholder="Nome da variedade"
              placeholderTextColor="#C0C0C0"
              value={novaVariedade}
              onChangeText={setNovaVariedade}
              autoCapitalize="characters"
            />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.modalBtnCancel} onPress={() => setShowCadastroVariedade(false)}>
                <Text style={st.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.modalBtnOk} onPress={() => salvarNovaVariedade(novaVariedade)}>
                <Text style={st.modalBtnOkText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal de HistÃ³rico / Rascunhos */}
      <Modal
        visible={showHistorico}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHistorico(false)}
      >
        <Pressable style={st.histOverlay} onPress={() => setShowHistorico(false)}>
          <Pressable style={st.histSheet} onPress={e => e.stopPropagation()}>
            <View style={st.histTitleRow}>
              <MaterialIcons name="history" size={20} color={ORANGE} />
              <Text style={st.histTitleText}>Rascunhos não salvos</Text>
              <TouchableOpacity onPress={() => setShowHistorico(false)} style={{ marginLeft: 'auto' }}>
                <MaterialIcons name="close" size={22} color="#888" />
              </TouchableOpacity>
            </View>

            {drafts.length === 0 ? (
              <Text style={st.histEmpty}>Nenhum rascunho salvo ainda.</Text>
            ) : (
              <ScrollView>
                {drafts.map(d => (
                  <View key={d.id} style={st.histItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.histItemFazenda}>
                        {d.fazenda || 'Sem fazenda'}{d.talhao ? ` - ${d.talhao}` : ''}
                      </Text>
                      <Text style={st.histItemDate}>
                        {new Date(d.savedAt).toLocaleString('pt-BR')}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => restaurarRascunho(d)} style={st.histRestBtn}>
                      <Text style={st.histRestText}>Restaurar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deletarRascunho(d.id)} style={{ padding: 6 }}>
                      <MaterialIcons name="delete-outline" size={20} color="#E53935" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// â"€â"€â"€ Estilos â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F2' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#EBEBEB',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  logo:    { width: 120, height: 30 },
  logoCQ:  { width: 40, height: 19 },
  histBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, position: 'relative', paddingVertical: 4, paddingHorizontal: 6 },
  histBtnText: { fontSize: 11, color: ORANGE, fontWeight: '700' },
  histBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: ORANGE, borderRadius: 8, minWidth: 14, height: 14, justifyContent: 'center', alignItems: 'center' },
  histBadgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },
  cadastrarVarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 4,
  },
  cadastrarVarText: { fontSize: 14, color: ORANGE, fontWeight: '700' },
  histOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  histSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '70%' },
  histTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  histTitleText: { fontSize: 15, fontWeight: '700', color: '#333' },
  histEmpty: { textAlign: 'center', color: '#999', fontSize: 14, marginTop: 24 },
  histItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
  histItemFazenda: { fontSize: 13, fontWeight: '700', color: '#222' },
  histItemDate: { fontSize: 11, color: '#999', marginTop: 2 },
  histRestBtn: { backgroundColor: ORANGE, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  histRestText: { fontSize: 12, color: '#fff', fontWeight: '700' },

  // Steps
  stepWrap: {
    backgroundColor: '#fff', paddingTop: 18, paddingBottom: 14,
    paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#EBEBEB',
  },
  stepRow:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  stepItem: { alignItems: 'center', flex: 1, position: 'relative' },
  circle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#D0D0D0', justifyContent: 'center', alignItems: 'center', zIndex: 1,
  },
  circleDone:      { backgroundColor: GREEN },
  circleActive:    { backgroundColor: GREEN },
  circleNum:       { fontSize: 13, fontWeight: '700', color: '#888' },
  circleNumActive: { color: '#fff' },
  lineLeft: {
    position: 'absolute', top: 17, left: 0,
    width: '50%', height: 2, backgroundColor: '#D0D0D0', zIndex: 0,
  },
  lineRight: {
    position: 'absolute', top: 17, right: 0,
    width: '50%', height: 2, backgroundColor: '#D0D0D0', zIndex: 0,
  },
  lineGreen:       { backgroundColor: GREEN },
  stepLabel:       { fontSize: 10, color: '#AAAAAA', marginTop: 6, textAlign: 'center' },
  stepLabelActive: { color: GREEN, fontWeight: '700', fontSize: 11 },
  stepLabelDone:   { color: GREEN },

  // Scroll
  scroll: { padding: 16, paddingBottom: 120 },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 14,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4,
  },
  cardBar: {
    position: 'absolute', left: 18, top: 20,
    width: 4, height: 20, backgroundColor: GREEN, borderRadius: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 6, paddingLeft: 12 },
  cardSub:   { fontSize: 13, color: '#777', lineHeight: 19, paddingLeft: 12 },

  // Stats
  statsCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  statItem:  { flex: 1, alignItems: 'center' },
  statDiv:   { width: 1, height: 44, backgroundColor: '#E0E0E0' },
  statVal:   { fontSize: 32, fontWeight: '800', color: GREEN },
  statLbl:   { fontSize: 11, color: '#999', marginTop: 2 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 },

  // Eval group
  evalBox:      { borderLeftWidth: 4, borderRadius: 4, paddingLeft: 12, marginBottom: 8 },
  evalTitle:    { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  evalCols:     { flexDirection: 'row', gap: 8 },
  evalCol:      { flex: 1, alignItems: 'center' },
  evalColLabel: { fontSize: 12, color: '#999', marginBottom: 6 },
  evalInput: {
    width: '100%', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    paddingVertical: 12, fontSize: 16, color: '#333', backgroundColor: '#FAFAFA',
  },
  evalTableWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#C7C7C7',
    overflow: 'hidden',
  },
  evalTableGap: { marginTop: 14 },
  evalTableTitle: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: '#1E1E1E',
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  evalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#CFCFCF',
    borderBottomWidth: 1,
    borderBottomColor: '#CFCFCF',
  },
  evalHeaderCell: {
    fontSize: 13,
    fontWeight: '800',
    color: '#161616',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#CFCFCF',
  },
  evalDataRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#CFCFCF',
  },
  evalRowOdd: { backgroundColor: '#FFFFFF' },
  evalRowEven: { backgroundColor: '#FFFFFF' },
  evalColDescricao: { flex: 3.8 },
  evalColValor: { flex: 2.1, paddingHorizontal: 10, justifyContent: 'center' },
  evalCellBorderRight: { borderRightWidth: 1, borderRightColor: '#CFCFCF' },
  evalCellText: { fontSize: 14, color: '#101010', paddingHorizontal: 10 },
  evalValueInput: {
    height: 56,
    borderWidth: 1,
    borderColor: '#AFAFAF',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    fontSize: 16,
    color: '#2A2A2A',
    paddingHorizontal: 12,
    textAlign: 'center',
  },
  evalValueReadOnly: {
    height: 56,
    borderWidth: 1,
    borderColor: '#C5C5C5',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    fontSize: 18,
    color: '#2A2A2A',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 14,
    fontWeight: '700',
  },
  evalBottomSpacer: { height: 96 },

  // SingleNum
  singleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  singleLabel: { fontSize: 13, color: '#444', flex: 1 },
  singleInput: {
    width: 70, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    paddingVertical: 8, fontSize: 15, color: '#333', backgroundColor: '#FAFAFA',
  },

  // Campos
  field:      { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  req:        { color: '#E74C3C' },
  inputBox: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14, color: '#333', backgroundColor: '#FAFAFA',
  },
  inputText:   { fontSize: 14, color: '#333', flex: 1 },
  placeholder: { color: '#C0C0C0' },
  row:         { flexDirection: 'row', alignItems: 'center' },

  // Spinner
  spinRow: { flexDirection: 'row', alignItems: 'center' },
  spinBtn: {
    width: 44, height: 44, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, backgroundColor: '#F5F5F5',
  },
  spinBtnText: { fontSize: 22, color: '#333', lineHeight: 26 },
  spinInput: {
    flex: 1, marginHorizontal: 8, borderWidth: 1, borderColor: '#E0E0E0',
    borderRadius: 10, paddingVertical: 10, fontSize: 18, fontWeight: '600',
    color: '#333', backgroundColor: '#FAFAFA',
  },

  // Fotos
  uploadZone: {
    borderWidth: 2, borderColor: GREEN, borderStyle: 'dashed', borderRadius: 16,
    padding: 32, alignItems: 'center', backgroundColor: '#fff', marginBottom: 16,
  },
  uploadIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: LGREEN,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  uploadTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: 4 },
  uploadSub:   { fontSize: 13, color: '#999', textAlign: 'center' },
  photoGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  thumb: {
    width: '30%', aspectRatio: 1, borderRadius: 10,
    overflow: 'hidden', backgroundColor: '#EEE',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbBadge: {
    position: 'absolute', top: 5, left: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  thumbBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  thumbBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.88)', paddingHorizontal: 8, paddingVertical: 5,
  },
  thumbAdd: {
    width: '30%', aspectRatio: 1, borderRadius: 10,
    borderWidth: 2, borderColor: GREEN, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', backgroundColor: LGREEN,
  },
  cameraBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: GREEN, borderRadius: 12,
    paddingVertical: 13, gap: 8, backgroundColor: '#fff',
  },
  cameraBtnText: { fontSize: 14, fontWeight: '700', color: GREEN },
  photoEditorScreen: {
    flex: 1,
    backgroundColor: '#111714',
  },
  photoEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#111714',
  },
  photoHeaderBtn: {
    minWidth: 98,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F3F6F4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoHeaderBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2A2A2A',
  },
  photoHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  photoHeaderBtnPrimary: {
    backgroundColor: GREEN,
  },
  photoHeaderBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  photoEditorCanvasWrap: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  photoEditorPreview: {
    flex: 1,
    minHeight: 300,
    borderWidth: 1,
    borderColor: '#2D3A33',
    borderRadius: 16,
    backgroundColor: '#0D120F',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEditorPreviewStage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEditorPreviewImage: {
    position: 'absolute',
  },
  photoCropShadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  photoCropShadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  photoCropShadeLeft: {
    position: 'absolute',
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  photoCropShadeRight: {
    position: 'absolute',
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  photoCropBox: {
    position: 'absolute',
    borderWidth: 2.2,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    zIndex: 8,
  },
  photoCropResizeHandle: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9,
  },
  photoCropCorner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: '#FFFFFF',
  },
  photoCropCornerTopLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 4,
  },
  photoCropCornerTopRight: {
    top: -2,
    right: -2,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 4,
  },
  photoCropCornerBottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 4,
  },
  photoCropCornerBottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 4,
  },
  photoEditorNoImage: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2D3A33',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0D120F',
  },
  photoEditorLoading: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2D3A33',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0D120F',
  },
  photoEditorNoImageText: {
    color: '#CDD5CF',
    fontSize: 13,
  },
  photoEditorBottomPanel: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 14,
    backgroundColor: '#111714',
  },
  photoEditorHint: {
    fontSize: 12,
    color: '#CFD8D2',
    marginBottom: 10,
  },
  photoEditorRestoreBtn: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6A3D3D',
    backgroundColor: '#8C3B3B',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  photoEditorRestoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  photoEditorActions: {
    flexDirection: 'row',
    gap: 8,
  },
  photoEditorActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2F513B',
    backgroundColor: '#173825',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  photoEditorZoomValue: {
    backgroundColor: '#1E4A2F',
    borderColor: '#4B7A58',
  },
  photoEditorActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EAF4EC',
  },
  photoEditorBusyText: {
    marginTop: 8,
    fontSize: 12,
    color: '#D9E7DE',
    textAlign: 'center',
  },
  photoCropBoxShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },

  // Resumo
  resumoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  resumoKey: { fontSize: 13, color: '#999' },
  resumoVal: { fontSize: 13, fontWeight: '700', color: '#333' },
  resumoObs: { fontSize: 13, color: '#555', lineHeight: 20, marginTop: 4 },
  previewPage: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#E9E9E9',
  },
  previewDocTitle: { fontSize: 15, fontWeight: '900', color: '#111' },
  previewDocSub: { marginTop: 3, fontSize: 11, color: '#666' },
  previewDivider: { height: 1, backgroundColor: '#DCDCDC', marginTop: 10, marginBottom: 8 },
  previewSectionTitle: { fontSize: 12, fontWeight: '900', color: '#222', marginTop: 8, marginBottom: 5 },
  previewRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: '#F3F3F3', paddingVertical: 6, gap: 10,
  },
  previewRowKey: { fontSize: 11, color: '#666', flex: 1.25 },
  previewRowValue: { fontSize: 11, color: '#1A1A1A', fontWeight: '700', flex: 1, textAlign: 'right' },
  previewPhotosEmpty: {
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#D7D7D7',
    borderRadius: 8, paddingVertical: 12, alignItems: 'center', backgroundColor: '#FAFAFA',
  },
  previewPhotosEmptyText: { fontSize: 11, color: '#888' },
  previewPhotosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  previewPhotoCard: {
    width: '31%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden',
    backgroundColor: '#EEE', borderWidth: 1, borderColor: '#EFEFEF',
  },
  previewPhotoImage: { width: '100%', height: '100%' },
  previewMorePhotos: { marginTop: 6, fontSize: 11, color: '#666', fontWeight: '700' },
  previewObsText: {
    fontSize: 12, color: '#444', lineHeight: 18,
    backgroundColor: '#FAFAFA', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#F0F0F0',
  },

  // Auto-fill (Fornecedor / ResponsÃ¡vel carregados ao selecionar Fazenda)
  autoFillRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    paddingHorizontal: 4, gap: 8,
  },
  autoFillLoading: { fontSize: 13, color: '#888' },
  autoFillCard: {
    backgroundColor: '#F0FAF2', borderRadius: 12,
    borderWidth: 1, borderColor: '#C8E6C9',
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6,
    marginBottom: 8,
  },
  autoFillHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8,
  },
  autoFillTitle: { fontSize: 11, color: GREEN, fontWeight: '700' },
  autoFillItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 5,
    borderBottomWidth: 1, borderBottomColor: '#DFF0E0',
  },
  autoFillKey: { fontSize: 13, color: '#4A5950', fontWeight: '600' },
  autoFillVal: { fontSize: 13, color: '#1B5E20', fontWeight: '700', flexShrink: 1, textAlign: 'right' },

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
  fabText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  fabTest: {
    position: 'absolute',
    left: 14,
    bottom: 80,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: GREEN,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    zIndex: 50,
  },
  fabTestText: { color: GREEN, fontSize: 13, fontWeight: '800' },

  previewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#C0392B', borderRadius: 14, paddingVertical: 14,
    marginBottom: 12, gap: 8,
    elevation: 3, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 5,
  },
  previewBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  pdfWebView: { flex: 1 },
  pdfLoadingBox: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, backgroundColor: '#F2F2F2',
  },
  pdfLoadingText: { fontSize: 15, color: '#888', fontWeight: '600' },

  // ExpandableGroup
  expWrap: { marginBottom: 4 },
  expHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F3F3',
  },
  expTotal: {
    fontSize: 13, fontWeight: '800', color: ORANGE, marginRight: 6,
  },
  expBody: {
    backgroundColor: '#FAFAFA', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 4, marginBottom: 4,
  },
  expRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: '#EFEFEF',
  },
  expSevLabel: { fontSize: 13, color: '#666', flex: 1 },

  // Frutos com doenÃ§a summary
  defeitoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  defeitoLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  defeitoVal: { fontSize: 16, fontWeight: '800', color: ORANGE },

  // â"€â"€ MODAIS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Modal data
  dateBox: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    width: '88%', elevation: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 10,
  },

  // Modal lista
  listBox: {
    backgroundColor: '#fff', borderRadius: 20, padding: 0,
    width: '85%', maxHeight: '70%', elevation: 10,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 10,
  },

  // Modal texto
  textBox: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    width: '88%', elevation: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 10,
  },

  modalTitle: {
    fontSize: 17, fontWeight: '800', color: '#1A1A1A',
    textAlign: 'center', marginBottom: 16, paddingTop: 20, paddingHorizontal: 20,
  },
  modalInput: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#333', backgroundColor: '#FAFAFA', marginBottom: 16,
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalBtnCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: '#F0F0F0', alignItems: 'center',
  },
  modalBtnCancelText: { fontSize: 14, fontWeight: '700', color: '#555' },
  modalBtnOk: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: GREEN, alignItems: 'center',
  },
  modalBtnOkText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // busca nos modais
  searchInput: {
    marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#333', backgroundColor: '#FAFAFA',
  },

  // itens lista modal
  listItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  listItemText: { fontSize: 15, color: '#333' },

  // BotÃ£o salvar no servidor
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 15,
    marginTop: 20, gap: 8,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 5,
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});

const calSt = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  monthYear: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  dayRow: { flexDirection: 'row', marginBottom: 4 },
  dayName: { width: '14.28%', textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#AAAAAA', paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  cellSel: { backgroundColor: '#2E7D32', borderRadius: 999 },
  cellToday: { borderWidth: 1.5, borderColor: '#2E7D32', borderRadius: 999 },
  cellTxt: { fontSize: 14, color: '#222' },
  cellTxtSel: { color: '#fff', fontWeight: '700' },
  cellTxtToday: { color: '#2E7D32', fontWeight: '700' },
});

