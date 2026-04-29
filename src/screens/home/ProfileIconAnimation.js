import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

const ProfileIconAnimation = ({ onConfigPress }) => {
  const [showManga, setShowManga] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const clickTimerRef = useRef(null);

  // Animações
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Espera 3 segundos após carregar a tela
    const startTimer = setTimeout(() => {
      startAnimation();
    }, 3000);

    return () => clearTimeout(startTimer);
  }, []);

  const startAnimation = () => {
    // 1. Animação de saída do ícone perfil
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // 2. Troca para manga
      setShowManga(true);
      
      // 3. Animação de entrada da manga
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1.1,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // 4. Após 5 segundos, volta ao normal
        setTimeout(() => {
          // Volta para o ícone perfil
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(rotateAnim, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
          ]).start(() => {
            // Volta para ícone perfil
            setShowManga(false);
            
            // Animação de entrada do ícone perfil
            Animated.parallel([
              Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 6,
                useNativeDriver: true,
              }),
              Animated.timing(rotateAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
              }),
            ]).start();
          });
        }, 5000);
      });
    });
  };

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Função para lidar com cliques
  const handlePress = () => {
    // Incrementar contador
    setClickCount(prev => {
      const newCount = prev + 1;

      // Se atingiu 5 cliques, chamar callback de configuração
      if (newCount === 5) {
        if (onConfigPress) {
          onConfigPress();
        }
        return 0; // Resetar contador
      }

      return newCount;
    });

    // Resetar contador após 2 segundos de inatividade
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    clickTimerRef.current = setTimeout(() => {
      setClickCount(0);
    }, 2000);
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Ícone animado */}
      <Animated.View
        style={[
          styles.iconContainer,
          {
            transform: [
              { scale: scaleAnim },
              { rotate: rotateInterpolate },
            ],
          },
        ]}
      >
        {showManga ? (
          <Image
            source={require('../../assets/logomanga.png')}
            style={styles.mangaImage}
            resizeMode="contain"
          />
        ) : (
          <MaterialIcons name="account-circle" size={60} color="#5E8B5C" />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  iconContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mangaImage: {
    width: 65,
    height: 65,
  },
});

export default ProfileIconAnimation;