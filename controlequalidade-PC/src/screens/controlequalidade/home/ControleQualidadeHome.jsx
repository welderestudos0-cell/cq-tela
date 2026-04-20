// ─────────────────────────────────────────────────────────────────────────────
// HOME DO MÓDULO CONTROLE DE QUALIDADE
// Tela de entrada do módulo CQ. Lista os submódulos disponíveis (Maturação Forçada,
// Análise de Frutos, Relatório de Embarque, Pré-colheita) com cards de navegação.
// NÃO é a home principal do app — é a home interna do módulo CQ.
// Rota: "ControleQualidadeHome" em routes.js → AuthenticatedStack
// ─────────────────────────────────────────────────────────────────────────────

import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MODULE_ORDER, MODULES } from './moduleData';

const HERO_STATS = [
  { icon: 'grid-view', label: `${MODULE_ORDER.length} modulos` },
  { icon: 'photo-library', label: 'Fotos' },
  { icon: 'picture-as-pdf', label: 'PDF automatico' },
  { icon: 'cloud-upload', label: 'Servidor' },
];

// Tela home do módulo CQ, exibe os cards de navegação para cada submódulo disponível.
export default function ControleQualidadeHome({ navigation }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F7F2" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <LinearGradient colors={['#F4F7F2', '#FFFFFF']} style={styles.heroCard}>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                <MaterialIcons name="arrow-back" size={24} color="#174D26" />
              </TouchableOpacity>

              <View style={styles.brandWrap}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Image source={require('../../../assets/logoagrodann.png')} style={styles.logo} resizeMode="contain" />
                  <View style={{ width: 1, height: 18, backgroundColor: '#2E7D32' }} />
                  <Image source={require('../../../../assets/CQLETRA.png')} style={styles.logoCQ} resizeMode="contain" />
                </View>
                <Text style={styles.brandText}>Controle de Qualidade</Text>
              </View>

              <View style={{ width: 40 }} />
            </View>

            <Text style={styles.heroTitle}>Fluxo completo em campo</Text>
            <Text style={styles.heroText}>
              Formularios, fotos, revisao de imagens, geracao de PDF e envio ao servidor em um unico lugar.
            </Text>

            <View style={styles.statsRow}>
              {HERO_STATS.map((item) => (
                <View key={item.label} style={styles.statChip}>
                  <MaterialIcons name={item.icon} size={16} color="#2E7D32" />
                  <Text style={styles.statText}>{item.label}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Modulos do sistema</Text>
            <Text style={styles.sectionSubtitle}>
              Selecione um modulo para ver a estrutura, os campos e as regras principais.
            </Text>
          </View>

          {MODULE_ORDER.map((moduleKey) => {
            const item = MODULES[moduleKey];

            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.card, { borderLeftColor: item.color }]}
                onPress={() => {
                  if (item.key === 'maturacao_forcada') {
                    navigation.navigate('MaturacaoForcada', { openDateRecModal: true });
                    return;
                  }

                  if (item.key === 'analise_frutos') {
                    navigation.navigate('AnaliseFrutos');
                    return;
                  }

                  if (item.key === 'relatorio_embarque') {
                    navigation.navigate('RelatorioEmbarqueSede');
                    return;
                  }

                  navigation.navigate('ControleQualidadeModulo', { moduleKey: item.key });
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.cardIcon, { backgroundColor: item.softColor }]}>
                  {item.image ? (
                    <Image source={item.image} style={{ width: 42, height: 42 }} resizeMode="contain" />
                  ) : (
                    <MaterialIcons name={item.icon} size={30} color={item.color} />
                  )}
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.cardTitleRow}>
                    <Text style={[styles.cardTitle, { color: item.color }]}>{item.title}</Text>
                    <View style={[styles.badge, { backgroundColor: item.softColor }]}>
                      <Text style={[styles.badgeText, { color: item.color }]}>{item.badge}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                  <Text style={styles.cardDescription}>{item.description}</Text>
                </View>

                <MaterialIcons name="chevron-right" size={26} color="#B5B5B5" />
              </TouchableOpacity>
            );
          })}

          <View style={styles.footerNote}>
            <MaterialIcons name="verified" size={22} color="#2E7D32" />
            <Text style={styles.footerNoteText}>
              A estrutura foi organizada para substituir o bloco antigo do SGA e servir como base oficial do novo sistema.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F4F7F2',
  },
  scroll: {
    padding: 16,
    paddingBottom: 28,
  },
  heroCard: {
    borderRadius: 26,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E4ECE2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8E1',
  },
  brandWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  logo: {
    width: 130,
    height: 32,
    marginBottom: 4,
  },
  logoCQ: {
    width: 42,
    height: 20,
    marginBottom: 4,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#174D26',
    textAlign: 'center',
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: '#163822',
    marginBottom: 8,
  },
  heroText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4F5D52',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E8DF',
  },
  statText: {
    marginLeft: 6,
    fontSize: 13,
    color: '#2C3E50',
    fontWeight: '600',
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#203326',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6A756D',
    lineHeight: 18,
  },
  card: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 5,
    borderWidth: 1,
    borderColor: '#EEF2EE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  cardIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardBody: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    marginRight: 10,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#4A5950',
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 12,
    color: '#7A857C',
    lineHeight: 18,
  },
  footerNote: {
    marginTop: 4,
    backgroundColor: '#EDF5EE',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#DDE9DE',
  },
  footerNoteText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    lineHeight: 18,
    color: '#355044',
  },
});
