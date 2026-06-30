import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SessionProvider, useSession } from '../lib/auth';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DialogHost } from '../lib/dialog';
import { ThemeProvider } from '../lib/theme';
import { ProdColorsProvider } from '../lib/prodColors';
import { NotesProvider } from '../lib/notes';
import { PostesProvider } from '../lib/postes';

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
                </PostesProvider>
              </NotesProvider>
            </ProdColorsProvider>
          </SessionProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}