import { useNavigation, useRoute } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  ImageBackground,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { width, height } = Dimensions.get('window');

const LoadingScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const dotScale1 = useRef(new Animated.Value(1)).current;
  const dotScale2 = useRef(new Animated.Value(1)).current;
  const dotScale3 = useRef(new Animated.Value(1)).current;

  const [isExiting, setIsExiting] = useState(false);
  
  // Determinar configuração imediatamente
  const destination = route.params?.destination || 'Home';
  const targetScreen = route.params?.targetScreen || 'Home';

  // Configuração das telas - Home com imagens aleatórias, outros fundo branco
  const loadingConfig = {
    Home: {
      text: 'Carregando',
      subText: 'Preparando tudo pra você',
      hasBackground: false
    },
    Solo: {
      text: 'Carregando',
      subText: 'Preparando tudo pra você',
      hasBackground: false
    },
    Pressao: {
      text: 'Carregando',
      subText: 'Preparando tudo pra você',
      hasBackground: false
    },
    limpeza: {
      text: 'Carregando',
      subText: 'Preparando tudo pra você',
      hasBackground: false
    },
    Bomba: {
      text: 'Carregando',
      subText: 'Preparando tudo pra voce',
      hasBackground: false
    },
    AuditoriaLuciano: {
      text: 'Carregando',
      subText: 'Preparando tudo pra voce',
      hasBackground: false
    },
    AuditoriaLucianoPDF: {
      text: 'Carregando',
      subText: 'Preparando tudo pra voce',
      hasBackground: false
    }
  };

  const currentConfig = loadingConfig[destination] || loadingConfig.Home;

  console.log('🎯 Destination:', destination);
  console.log('🎯 Target Screen:', targetScreen);
  console.log('📋 Configuração atual:', currentConfig);
  console.log('🖼️ Imagem de fundo:', currentConfig.backgroundImage ? 'Disponível' : 'Não');

  const getPaddingTop = () => {
    return height * 0.4; // Centraliza no meio da tela
  };

  useEffect(() => {
    if (isExiting) return;

    // Animação de rotação contínua
    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    );
    rotateAnimation.start();

    // Barra de progresso - tempo diferente para Home
    const progressDuration = destination === 'Home' ? 2500 : 400; // Home: 2.5s, outros: 0.4s
    
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: progressDuration,
      useNativeDriver: false,
    }).start(() => {
      // Transição imediata
      handleExit();
    });

    // Animação dos pontos
    const animateDots = () => {
      const dotAnimations = [
        { dot: dotScale1, delay: 0 },
        { dot: dotScale2, delay: 200 },
        { dot: dotScale3, delay: 400 }
      ];

      dotAnimations.forEach(({ dot, delay }) => {
        setTimeout(() => {
          if (!isExiting) {
            Animated.sequence([
              Animated.timing(dot, {
                toValue: 1.3,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.timing(dot, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
            ]).start();
          }
        }, delay);
      });
    };

    const dotInterval = setInterval(() => {
      if (!isExiting) {
        animateDots();
      }
    }, 1500);
    
    animateDots();

    return () => {
      clearInterval(dotInterval);
      rotateAnimation.stop();
    };
  }, []);

  const handleExit = () => {
    if (isExiting) return;
    
    setIsExiting(true);
    console.log('🚀 Iniciando processo de saída...');
    console.log('🎯 Navegando para:', targetScreen);
    
    // Navegação imediata sem animação de saída para evitar tela branca
    try {
      if (targetScreen === 'Home' && destination === 'Home') {
        // Login inicial - vai direto para Home (ModuleSelection removido)
        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        });
      } else if (targetScreen === 'Home') {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        });
      } else {
        // Navegação direta para evitar tela branca
        navigation.replace(targetScreen, route.params?.screenParams || {});
      }
    } catch (error) {
      console.error('❌ Erro na navegação:', error);
      // Fallback
      navigation.navigate(targetScreen);
    }
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Renderiza com ou sem imagem de fundo
  const renderContent = () => {
    const content = (
      <>
        <StatusBar 
          barStyle={currentConfig.hasBackground ? "light-content" : "dark-content"} 
          backgroundColor="transparent" 
          translucent 
        />
        
        {currentConfig.hasBackground && <View style={styles.overlay} />}
        
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
              paddingTop: getPaddingTop(),
            },
          ]}
        >
          {/* Logo CQ */}
          <Image
            source={require('../../../assets/CQLETRA.png')}
            style={styles.cqLogo}
            resizeMode="contain"
          />

          {/* Círculo de loading animado */}
          <View style={styles.loadingContainer}>
            <Animated.View
              style={[
                styles.loadingRing,
                currentConfig.hasBackground ? styles.loadingRingLight : styles.loadingRingDark,
                {
                  transform: [{ rotate: spin }],
                },
              ]}
            />
          </View>

          {/* Texto de carregamento */}
          <Text style={[
            styles.loadingText, 
            (destination === 'Home' && currentConfig.backgroundImage) ? styles.textLight : styles.textDark
          ]}>
            {currentConfig.text}
          </Text>
          <Text style={[
            styles.subText, 
            (destination === 'Home' && currentConfig.backgroundImage) ? styles.textLight : styles.textDark
          ]}>
            {currentConfig.subText}
          </Text>

          {/* Barra de progresso */}
          <View style={[
            styles.progressContainer,
            (destination === 'Home' && currentConfig.backgroundImage) ? styles.progressContainerLight : styles.progressContainerDark
          ]}>
            <Animated.View
              style={[
                styles.progressBar,
                (destination === 'Home' && currentConfig.backgroundImage) ? styles.progressBarLight : styles.progressBarDark,
                {
                  width: progressWidth,
                },
              ]}
            />
          </View>

          {/* Pontos animados */}
          <View style={styles.dotsContainer}>
            <Animated.View
              style={[
                styles.dot,
                (destination === 'Home' && currentConfig.backgroundImage) ? styles.dotLight : styles.dotDark,
                {
                  opacity: fadeAnim,
                  transform: [{ scale: dotScale1 }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.dot,
                (destination === 'Home' && currentConfig.backgroundImage) ? styles.dotLight : styles.dotDark,
                {
                  opacity: fadeAnim,
                  transform: [{ scale: dotScale2 }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.dot,
                (destination === 'Home' && currentConfig.backgroundImage) ? styles.dotLight : styles.dotDark,
                {
                  opacity: fadeAnim,
                  transform: [{ scale: dotScale3 }],
                },
              ]}
            />
          </View>
        </Animated.View>
      </>
    );

    // Home com imagem de fundo, outros com fundo branco
    if (destination === 'Home' && currentConfig.backgroundImage) {
      return (
        <ImageBackground 
          source={currentConfig.backgroundImage}
          style={styles.backgroundImage}
          resizeMode="cover"
          imageStyle={styles.backgroundImageStyle}
          fadeDuration={0}
        >
          <View style={styles.overlay} />
          {content}
        </ImageBackground>
      );
    } else {
      // Formulários com fundo branco - remover overlay do content para evitar cinza
      const contentWithoutOverlay = (
        <>
          <StatusBar 
            barStyle="dark-content" 
            backgroundColor="transparent" 
            translucent 
          />
          
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
                paddingTop: getPaddingTop(),
              },
            ]}
          >
            {/* Círculo de loading animado */}
            <View style={styles.loadingContainer}>
              <Animated.View
                style={[
                  styles.loadingRing,
                  styles.loadingRingDark,
                  {
                    transform: [{ rotate: spin }],
                  },
                ]}
              />
            </View>

            {/* Texto de carregamento */}
            <Text style={[styles.loadingText, styles.textDark]}>
              {currentConfig.text}
            </Text>
            <Text style={[styles.subText, styles.textDark]}>
              {currentConfig.subText}
            </Text>

            {/* Barra de progresso */}
            <View style={[styles.progressContainer, styles.progressContainerDark]}>
              <Animated.View
                style={[
                  styles.progressBar,
                  styles.progressBarDark,
                  {
                    width: progressWidth,
                  },
                ]}
              />
            </View>

            {/* Pontos animados */}
            <View style={styles.dotsContainer}>
              <Animated.View
                style={[
                  styles.dot,
                  styles.dotDark,
                  {
                    opacity: fadeAnim,
                    transform: [{ scale: dotScale1 }],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.dot,
                  styles.dotDark,
                  {
                    opacity: fadeAnim,
                    transform: [{ scale: dotScale2 }],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.dot,
                  styles.dotDark,
                  {
                    opacity: fadeAnim,
                    transform: [{ scale: dotScale3 }],
                  },
                ]}
              />
            </View>
          </Animated.View>
        </>
      );
      
      return (
        <View style={styles.whiteBackground}>
          {contentWithoutOverlay}
        </View>
      );
    }
  };

  return renderContent();
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  backgroundImageStyle: {
    backgroundColor: '#1a1a1a',
    opacity: 1,
  },
  whiteBackground: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 2,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  cqLogo: {
    width: 180,
    height: 180,
    marginBottom: 24,
  },
  loadingContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  loadingRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'transparent',
  },
  loadingRingLight: {
    borderTopColor: '#FFFFFF',
    borderRightColor: '#FFFFFF',
  },
  loadingRingDark: {
    borderTopColor: '#5E8B5C',
    borderRightColor: '#5E8B5C',
  },
  loadingText: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  textLight: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  textDark: {
    color: '#000000',
    fontWeight: '700',
  },
  subText: {
    fontSize: 14,
    marginBottom: 40,
    textAlign: 'center',
    opacity: 0.7,
    fontWeight: '400',
  },
  progressContainer: {
    width: width * 0.7,
    height: 6,
    borderRadius: 3,
    marginBottom: 30,
    overflow: 'hidden',
  },
  progressContainerLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressContainerDark: {
    backgroundColor: 'rgba(94, 139, 92, 0.2)',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  progressBarLight: {
    backgroundColor: '#FFFFFF',
  },
  progressBarDark: {
    backgroundColor: '#5E8B5C',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  dotLight: {
    backgroundColor: '#FFFFFF',
  },
  dotDark: {
    backgroundColor: '#5E8B5C',
  },
});

export default LoadingScreen;
