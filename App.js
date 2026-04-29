// // App.js
// import { NavigationContainer } from '@react-navigation/native';
// import 'react-native-gesture-handler';
// import Routes from './src/routes/routes';
// // import Cadastro from './src/Cadastro/Cadastro';


// export default function App() {
//   return (
//     <NavigationContainer>
//       <Routes/>
//     </NavigationContainer>
//   );
// }


// App.js
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext.js';
import Routes from './src/routes/routes';
import * as Updates from 'expo-updates';

// Banner de notificação no topo
function UpdateBanner({ message, visible }) {
  const [slideAnim] = useState(new Animated.Value(-100));

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -100,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible && slideAnim._value === -100) return null;

  return (
    <Animated.View style={[styles.updateBanner, { transform: [{ translateY: slideAnim }] }]}>
      <ActivityIndicator size="small" color="#FFFFFF" style={styles.bannerSpinner} />
      <Text style={styles.bannerText}>{message}</Text>
    </Animated.View>
  );
}

export default function App() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    async function checkForUpdates() {
      try {
        // Não verificar updates em desenvolvimento
        if (__DEV__) {
          console.log('Modo desenvolvimento - pulando verificação de updates');
          return;
        }

        // Verifica silenciosamente se há update
        const update = await Updates.checkForUpdateAsync();
        
        if (update.isAvailable) {
          // Só mostra o banner se tiver atualização pra baixar
          setUpdateMessage('Baixando atualização...');
          setShowBanner(true);
          
          await Updates.fetchUpdateAsync();
          
          setUpdateMessage('Reiniciando...');
          await Updates.reloadAsync();
        } else {
          console.log('App está atualizado');
          setShowBanner(false);
        }
      } catch (error) {
        console.log('Erro ao verificar updates:', error.message);
        setShowBanner(false);
      }
    }

    checkForUpdates();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="dark" backgroundColor="#FFFFFF" translucent={false} />
          <UpdateBanner message={updateMessage} visible={showBanner} />
          <Routes />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  updateBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#5E8B5C',
    paddingTop: 40,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  bannerSpinner: {
    marginRight: 10,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});