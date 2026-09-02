import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppScreen from './app/AppScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppScreen />
    </SafeAreaProvider>
  );
}
