// ─────────────────────────────────────────────────────────────────────────────
// DETALHE DE MÓDULO — CONTROLE DE QUALIDADE
// Exibe os detalhes de um submódulo específico do CQ (fluxo, campos, regras).
// Recebe "moduleKey" via route.params para saber qual módulo exibir.
// É acessada a partir de ControleQualidadeHome quando o usuário toca em um card.
// Rota: "ControleQualidadeModulo" em routes.js → AuthenticatedStack
// ─────────────────────────────────────────────────────────────────────────────

import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MODULE_FLOW, getModuleByKey } from './moduleData';

// Tela de detalhe de um submódulo do CQ, exibe fluxo, campos, regras e botão de ação.
export default function ControleQualidadeModulo({ navigation, route }) {
  const module = getModuleByKey(route?.params?.moduleKey);

  // Navega para a tela correspondente ao módulo selecionado ao pressionar o botão principal.
  const handlePrimaryAction = () => {
    if (module.key === 'maturacao_forcada') {
      navigation.navigate('MaturacaoForcada', { openDateRecModal: true });
      return;
    }

    if (module.key === 'analise_frutos') {
      navigation.navigate('AnaliseFrutos');
      return;
    }

    if (module.key === 'relatorio_embarque') {
      navigation.navigate('RelatorioEmbarqueSede');
      return;
    }

    Alert.alert(
      'Estrutura base pronta',
      `O fluxo completo de ${module.title} pode ser conectado agora com formulário, fotos e PDF.`
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={module.color} />

      <LinearGradient colors={[module.color, '#12361E']} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.logoWrap}>
            <Image
              source={require('../../../assets/logoagrodann.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandText}>Controle de Qualidade</Text>
          </View>

          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <View style={styles.stepper}>
        {MODULE_FLOW.map((step, index) => {
          const active = index === 0;

          return (
            <View key={step} style={styles.stepGroup}>
              <View style={styles.stepColumn}>
                <View
                  style={[
                    styles.stepCircle,
                    active && {
                      backgroundColor: module.color,
                      shadowColor: module.color,
                    },
                  ]}
                >
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                </View>
                <Text style={[styles.stepLabel, active && { color: module.color }]} numberOfLines={1}>
                  {step}
                </Text>
              </View>

              {index < MODULE_FLOW.length - 1 && <View style={styles.stepLine} />}
            </View>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={[styles.heroIcon, { backgroundColor: module.softColor }]}>
            <MaterialIcons name={module.icon} size={32} color={module.color} />
          </View>
          <View style={styles.heroContent}>
            <View style={styles.heroTitleRow}>
              <Text style={[styles.heroTitle, { color: module.color }]}>{module.title}</Text>
              <View style={[styles.badge, { backgroundColor: module.softColor }]}>
                <Text style={[styles.badgeText, { color: module.color }]}>{module.badge}</Text>
              </View>
            </View>
            <Text style={styles.heroSubtitle}>{module.subtitle}</Text>
            <Text style={styles.heroObjective}>{module.objective}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Fluxo padrão</Text>
          <Text style={styles.sectionText}>
            {MODULE_FLOW.map((step, index) => `${index + 1}. ${step}`).join('   ')}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Itens principais</Text>
          {module.fieldGroups ? (
            module.fieldGroups.map((group) => (
              <View key={group.title} style={styles.groupBlock}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                {group.items.map((field) => (
                  <View key={field} style={styles.bulletRow}>
                    <View style={[styles.bullet, { backgroundColor: module.color }]} />
                    <Text style={styles.bulletText}>{field}</Text>
                  </View>
                ))}
              </View>
            ))
          ) : (
            module.fields.map((field) => (
              <View key={field} style={styles.bulletRow}>
                <View style={[styles.bullet, { backgroundColor: module.color }]} />
                <Text style={styles.bulletText}>{field}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Regras de negócio</Text>
          {module.rules.map((rule) => (
            <View key={rule} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: module.color }]} />
              <Text style={styles.bulletText}>{rule}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Resultado esperado</Text>
          <Text style={styles.sectionText}>{module.footer}</Text>
          <View style={styles.statusPill}>
            <MaterialIcons name="check-circle" size={16} color={module.color} />
            <Text style={[styles.statusText, { color: module.color }]}>Base visual pronta para integrar formulários reais</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: module.color }]}
            onPress={handlePrimaryAction}
            activeOpacity={0.9}
          >
            <MaterialIcons name="post-add" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>{module.primaryActionLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryButtonText}>{module.secondaryActionLabel}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F4F7F2',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  logo: {
    width: 170,
    height: 42,
    marginBottom: 4,
  },
  brandText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  stepper: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFE9',
  },
  stepGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepColumn: {
    alignItems: 'center',
    width: 68,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#BDBDBD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stepNumber: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  stepLabel: {
    fontSize: 11,
    color: '#93989B',
    fontWeight: '700',
    textAlign: 'center',
  },
  stepLine: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D6D9D3',
    marginHorizontal: 8,
    marginTop: 12,
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E9EFE7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroContent: {
    flex: 1,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heroTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
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
  heroSubtitle: {
    fontSize: 13,
    color: '#4A5950',
    marginBottom: 6,
    fontWeight: '600',
  },
  heroObjective: {
    fontSize: 13,
    lineHeight: 20,
    color: '#66746C',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E9EFE7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 1,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#203326',
    marginBottom: 8,
  },
  sectionText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#55625A',
  },
  groupBlock: {
    marginBottom: 10,
    paddingTop: 2,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#203326',
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: '#55625A',
  },
  statusPill: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F8F3',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  statusText: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  actions: {
    marginTop: 6,
    gap: 10,
  },
  primaryButton: {
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 2,
  },
  primaryButtonText: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryButton: {
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3EE',
    borderWidth: 1,
    borderColor: '#D7E1D6',
  },
  secondaryButtonText: {
    color: '#355044',
    fontWeight: '800',
    fontSize: 15,
  },
});
