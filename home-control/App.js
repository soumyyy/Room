import { useFonts } from 'expo-font';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppScreen from './app/AppScreen';
import { MANROPE_FONTS } from './app/fontAssets';

export default function App() {
  const [fontsLoaded, fontError] = useFonts(MANROPE_FONTS);

  // Black, like the screen behind it, so the wait is invisible. If loading
  // fails, carry on: the system font is a fine fallback and beats a blank app.
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
  }

  return (
    <SafeAreaProvider>
      <AppScreen />
    </SafeAreaProvider>
  );
}
