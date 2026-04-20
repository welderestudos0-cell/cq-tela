import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  ScrollView,
  Switch,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const ATENDENTE_WHATSAPP = '5599999999999'; // Altere para o numero do atendente
import AsyncStorage from '@react-native-async-storage/async-storage';

function Config({ navigation }) {
  const [isAdmin, setIsAdmin] = useState(true); // visível para todos por enquanto

  useEffect(() => {
    const checkCargo = async () => {
      try {
        // Tenta várias chaves onde o userData pode estar
        let raw = await AsyncStorage.getItem('userData')
          || await AsyncStorage.getItem('userProfile')
          || await AsyncStorage.getItem('lastValidUser');
        if (!raw) return;
        const u = JSON.parse(raw);
        const nivel = (u.nivel_acesso || u.NIVEL_ACESSO || '').toLowerCase();
        console.log('Config nivel_acesso:', nivel);
        setIsAdmin(nivel === 'admin' || nivel === 'gerente' || nivel === 'coordenador');
      } catch (e) {
        console.error('Erro ao ler cargo:', e);
      }
    };
    checkCargo();
  }, []);
  // Estados para configurações
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(true);
  
  // Animações
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      })
    ]).start();
  }, []);

  const handleSaveSettings = () => {
    Alert.alert(
      "✅ Configurações Salvas",
      "Suas preferências foram salvas com sucesso!",
      [{ text: "OK" }]
    );
  };

  const handleFalarAtendente = () => {
    const url = `https://wa.me/${ATENDENTE_WHATSAPP}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('WhatsApp nao encontrado', 'Instale o WhatsApp para usar esta funcao.');
        }
      })
      .catch(() => Alert.alert('Erro', 'Nao foi possivel abrir o WhatsApp.'));
  };

  const handleResetToDefault = () => {
    Alert.alert(
      "⚠️ Restaurar Padrões",
      "Deseja restaurar todas as configurações para os valores padrão?",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Restaurar", 
          onPress: () => {
            // Resetar todos os estados para valores padrão
            setNotificationsEnabled(true);
            setSoundAlerts(true);
            Alert.alert("✅ Sucesso", "Configurações restauradas para o padrão!");
          }
        }
      ]
    );
  };

  const SettingsSection = ({ title, children }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  const SettingsItem = ({ icon, title, subtitle, rightComponent, onPress }) => (
    <TouchableOpacity style={styles.settingsItem} onPress={onPress}>
      <View style={styles.itemLeft}>
        <MaterialIcons name={icon} size={20} color="#5E8B5C" />
        <View style={styles.itemText}>
          <Text style={styles.itemTitle}>{title}</Text>
          {subtitle && <Text style={styles.itemSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightComponent}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#2C3E2C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configurações</Text>
        <TouchableOpacity onPress={handleSaveSettings}>
          <MaterialIcons name="save" size={24} color="#2E7D32" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContainer}>
        <Animated.View style={[{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          
          {/* Seção: Notificações */}
          <SettingsSection title="📱 Notificações">
            <SettingsItem
              icon="notifications"
              title="Notificações Push"
              subtitle="Receber alertas do sistema"
              rightComponent={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={{ false: '#E0E6DD', true: '#A5D6A7' }}
                  thumbColor={notificationsEnabled ? '#2E7D32' : '#95A5A6'}
                />
              }
            />
            <SettingsItem
              icon="volume-up"
              title="Alertas Sonoros"
              subtitle="Sons para notificações importantes"
              rightComponent={
                <Switch
                  value={soundAlerts}
                  onValueChange={setSoundAlerts}
                  trackColor={{ false: '#E0E6DD', true: '#A5D6A7' }}
                  thumbColor={soundAlerts ? '#2E7D32' : '#95A5A6'}
                />
              }
            />
          </SettingsSection>

          {/* Seção: Administração (só Coordenador/Admin) */}
          {isAdmin && (
            <SettingsSection title="👥 Administração">
              <SettingsItem
                icon="manage-accounts"
                title="Permissões de Usuários"
                subtitle="Gerenciar módulos por usuário"
                rightComponent={<MaterialIcons name="chevron-right" size={20} color="#95A5A6" />}
                onPress={() => navigation.navigate('PermissoesUsuarios')}
              />
              <SettingsItem
                icon="support-agent"
                title="Falar com Atendente"
                subtitle="Suporte via WhatsApp"
                rightComponent={<MaterialIcons name="open-in-new" size={20} color="#25D366" />}
                onPress={handleFalarAtendente}
              />
            </SettingsSection>
          )}

          {/* Seção: Sistema */}
          <SettingsSection title="⚙️ Sistema">
            <SettingsItem
              icon="refresh"
              title="Restaurar Padrões"
              subtitle="Voltar às configurações originais"
              rightComponent={<MaterialIcons name="chevron-right" size={20} color="#95A5A6" />}
              onPress={handleResetToDefault}
            />
          </SettingsSection>

        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#F8F9F7',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E6DD',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C3E2C',
  },
  scrollContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E2C',
    marginBottom: 12,
    paddingLeft: 4,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E0E6DD',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemText: {
    marginLeft: 12,
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2C3E2C',
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 13,
    color: '#5E8B5C',
  },
});

export default Config;