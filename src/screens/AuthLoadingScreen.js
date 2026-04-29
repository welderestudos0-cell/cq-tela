// src/screens/AuthLoadingScreen.js
import { StatusBar, StyleSheet, View } from 'react-native';

export default function AuthLoadingScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
