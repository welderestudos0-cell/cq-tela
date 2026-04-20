

// src/routes/routes.js
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext.js';
import AuthLoadingScreen from '../screens/AuthLoadingScreen';

// Importar componentes existentes
import Home from '../screens/home/home';
import LoadingScreen from '../screens/login/LoadingScreen';
import Login from '../screens/login/login';


import AnaliseFrutos from '../screens/controlequalidade/analisefrutos/AnaliseFrutos';
import ControleQualidadeHome from '../screens/controlequalidade/home/ControleQualidadeHome';
import ControleQualidadeModulo from '../screens/controlequalidade/home/ControleQualidadeModulo';
import MaturacaoForcada from '../screens/controlequalidade/maturacaoforcada/MaturacaoForcada';
import RelatorioEmbarqueSede from '../screens/controlequalidade/relatorioembarcada/RelatorioEmbarqueSede';



// CORREÇÃO: Import correto do componente de limpeza

const Stack = createStackNavigator();

// Stack para usuários autenticados
function AuthenticatedStack() {
  return (
    <Stack.Navigator 
      initialRouteName="LoadingScreen"
      screenOptions={{ 
        headerShown: false,
        cardStyleInterpolator: ({ current }) => ({
          cardStyle: {
            opacity: current.progress,
          },
        }),
      }}
    >
      <Stack.Screen name="LoadingScreen" component={LoadingScreen} />
      <Stack.Screen name="Home" component={Home} />



      {/* Controle de Qualidade (antigo SGA) */}
      <Stack.Screen name="MaturacaoForcada" component={MaturacaoForcada} />
      <Stack.Screen name="AnaliseFrutos" component={AnaliseFrutos} />
      <Stack.Screen name="RelatorioEmbarqueSede" component={RelatorioEmbarqueSede} />
      <Stack.Screen name="ControleQualidadeHome" component={ControleQualidadeHome} />
      <Stack.Screen name="ControleQualidadeModulo" component={ControleQualidadeModulo} />
      <Stack.Screen name="SGAHome" component={ControleQualidadeHome} />
    </Stack.Navigator>
  );
}

// Stack para usuários não autenticados
function UnauthenticatedStack() {
  return (
    <Stack.Navigator 
      initialRouteName="Login"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Login" component={Login} />
    </Stack.Navigator>
  );
}

// Componente principal de rotas
export default function Routes() {
  const { isAuthenticated, isLoading, user } = useAuth();

  console.log('🛣️ Routes renderizado:', {
    isLoading,
    isAuthenticated,
    hasUser: !!user
  });

  // Mostrar loading enquanto verifica autenticação
  if (isLoading) {
    console.log('⏳ Mostrando AuthLoadingScreen...');
    return <AuthLoadingScreen />;
  }

  // Retornar stack apropriado baseado na autenticação
  if (isAuthenticated) {
    console.log('🔐 Usuário autenticado - Mostrando AuthenticatedStack');
    return <AuthenticatedStack />;
  } else {
    console.log('🚪 Usuário não autenticado - Mostrando UnauthenticatedStack');
    return <UnauthenticatedStack />;
  }
}
