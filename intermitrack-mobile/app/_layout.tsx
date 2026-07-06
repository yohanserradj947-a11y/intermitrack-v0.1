import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import * as Updates from 'expo-updates';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SessionProvider, useSession } from '../lib/auth';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DialogHost } from '../lib/dialog';
import { ThemeProvider } from '../lib/theme';
import { ProdColorsProvider } from '../lib/prodColors';
import { NotesProvider } from '../lib/notes';
import { PostesProvider } from '../lib/postes';

// Applique les mises à jour à distance (OTA) AUTOMATIQUEMENT au lancement :
// l'app vérifie → télécharge → se recharge seule. Fini la manip "fermer/rouvrir 2 fois".
function useAutoUpdate() {
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (cancelled || !res.isAvailable) return;
        setUpdating(true);
        await Updates.fetchUpdateAsync();
        if (cancelled) return;
        await Updates.reloadAsync(); // redémarre l'app sur la nouvelle version
      } catch {
        if (!cancelled) setUpdating(false); // hors ligne / erreur : on démarre normalement
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return updating;
}

function UpdateScreen() {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0E2E38', zIndex: 9999 }}>
      <ActivityIndicator size="large" color="#C79A3B" />
      <Text style={{ color: '#E7EEF1', fontSize: 15, fontWeight: '700', marginTop: 16 }}>Mise à jour…</Text>
      <Text style={{ color: '#9db6bf', fontSize: 13, marginTop: 4 }}>Quelques secondes, on installe les nouveautés.</Text>
    </View>
  );
}

function RootNavigator() {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7F6' }}>
        <ActivityIndicator size="large" color="#1F4E5F" />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const updating = useAutoUpdate();
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <ThemeProvider>
          <SessionProvider>
            <ProdColorsProvider>
              <NotesProvider>
                <PostesProvider>
                  <RootNavigator />
                  <DialogHost />
                  {updating && <UpdateScreen />}
                </PostesProvider>
              </NotesProvider>
            </ProdColorsProvider>
          </SessionProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
