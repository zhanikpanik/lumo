import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator, type StackScreenProps } from '@react-navigation/stack';
import { LogBox, View, Text, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import {
  Onest_400Regular,
  Onest_500Medium,
  Onest_700Bold,
} from '@expo-google-fonts/onest';
import { InstantOrdersScreen } from './src/screens/InstantOrdersScreen';
import { PosScreen } from './src/screens/PosScreen';
import { PaymentScreen } from './src/screens/PaymentScreen';
import { PaidCheckScreen } from './src/screens/PaidCheckScreen';
import { TablePickerScreen } from './src/screens/TablePickerScreen';
import { LockScreen } from './src/screens/LockScreen';
import { OpenShiftScreen } from './src/screens/OpenShiftScreen';
import { CashScreen } from './src/screens/CashScreen';
import { CloseShiftScreen } from './src/screens/CloseShiftScreen';
import { OrderCardShowcase } from './src/screens/OrderCardShowcase';
import { ActivationScreen } from './src/screens/ActivationScreen';
import { bootstrapInstantDevice, type BootstrapResult } from './src/data/instant';
import { flushPendingPosCommands } from './src/data/posCommands';
import { useUserStore } from './src/store/userStore';
import { useInstantShift } from './src/store/useInstantShift';
import { theme } from './src/theme/colors';
// Ignore specific warnings coming from react-native-web or navigation libraries
LogBox.ignoreLogs([
  'props.pointerEvents is deprecated',
  'Blocked aria-hidden on an element',
]);

type RootStackParamList = {
  Activation: undefined;
  Lock: { mode?: string } | undefined;
  OpenShift: undefined;
  Orders: undefined;
  Pos: undefined;
  Payment: undefined;
  PaidCheck: undefined;
  TablePicker: undefined;
  Cash: undefined;
  CloseShift: undefined;
  Showcase: undefined;
};

function LockRoute({ navigation, route }: StackScreenProps<RootStackParamList, 'Lock'>) {
  return <LockScreen navigation={navigation} route={route} />;
}

const Stack = createStackNavigator<RootStackParamList>();

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const SHIFT_REQUIRED_ROUTES = ['Orders', 'Pos', 'Payment', 'PaidCheck', 'TablePicker'];

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'Onest-Regular': Onest_400Regular,
    'Onest-Medium': Onest_500Medium,
    'Onest-Bold': Onest_700Bold,
  });

  // ── InstantDB bootstrap ──────────────────────────────────────
  const [bootstrap, setBootstrap] = useState<BootstrapResult | null>(null);
  useEffect(() => { bootstrapInstantDevice().then(setBootstrap); }, []);
  useEffect(() => {
    if (bootstrap?.status === 'authenticated') {
      void flushPendingPosCommands();
    }
  }, [bootstrap?.status]);

  // ── Shift guard ────────────────────────────────────────────────
  const currentUser = useUserStore((s) => s.currentUser);
  const { openShift } = useInstantShift(
    currentUser?.id,
    bootstrap?.status === 'authenticated',
  );
  const hasShift = openShift !== null;

  useEffect(() => {
    if (!navigationRef.isReady()) return;
    const route = navigationRef.getCurrentRoute()?.name;
    if (!hasShift && route && SHIFT_REQUIRED_ROUTES.includes(route)) {
      navigationRef.reset({ index: 0, routes: [{ name: 'OpenShift' }] });
    }
  }, [hasShift]);

  // ── Initial route ──────────────────────────────────────────────
  const getInitialRoute = (): keyof RootStackParamList => {
    if (!bootstrap) return 'Lock';
    if (bootstrap.status === 'activation-required') return 'Activation';
    if (!currentUser) return 'Lock';
    if (!hasShift) return 'OpenShift';
    return 'Orders';
  };

  // ── Render ─────────────────────────────────────────────────────
  if (!fontsLoaded && !fontError) return null;
  if (!bootstrap) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Загрузка...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={getInitialRoute()}
        screenOptions={{ headerShown: false, animation: 'none' }}
      >
        <Stack.Screen name="Lock" component={LockRoute} />
        <Stack.Screen name="Activation" component={ActivationScreen} />
        <Stack.Screen name="OpenShift" component={OpenShiftScreen} />
        <Stack.Screen name="Orders" component={InstantOrdersScreen} />
        <Stack.Screen name="Pos" component={PosScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="PaidCheck" component={PaidCheckScreen} />
        <Stack.Screen name="TablePicker" component={TablePickerScreen} />
        <Stack.Screen name="Cash" component={CashScreen} />
        <Stack.Screen name="CloseShift" component={CloseShiftScreen} />
        <Stack.Screen name="Showcase" component={OrderCardShowcase} />
      </Stack.Navigator>
    </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontFamily: 'Onest-Regular',
    fontSize: 16,
  },
});
