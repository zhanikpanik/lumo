import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ActivityIndicator, Platform,
} from 'react-native';
import type { DeviceActivationVenueSelection } from '@lumo/data';
import { theme } from '../theme/colors';
import {
  activateInstantDevice,
  completeInstantDeviceActivation,
  requestDeviceActivationMagicCode,
} from '../data/instant';

interface Props {
  navigation: any;
}

type Step = 'email' | 'code' | 'venue';

const platform = Platform.OS === 'ios' ? 'ios' as const
  : Platform.OS === 'android' ? 'android' as const
  : 'web' as const;
const deviceLabel = platform === 'web' ? 'Web POS' : platform === 'ios' ? 'iPad POS' : 'Android POS';

function activationError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : '';
  if (message.includes('another venue')) return 'Это устройство уже привязано к другому заведению';
  if (message.includes('membership')) return 'У этой учётной записи нет прав на активацию POS';
  if (message.includes('magic') || message.includes('code') || message.includes('token')) {
    return 'Неверный или истёкший код активации';
  }
  if (message.includes('challenge')) return 'Время выбора заведения истекло. Запросите новый код.';
  if (cause instanceof TypeError && message.includes('fetch')) {
    return 'Не удалось подключиться к серверу активации. Проверьте соединение.';
  }
  return message || 'Не удалось активировать устройство';
}

export const ActivationScreen: React.FC<Props> = ({ navigation }) => {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [selection, setSelection] = useState<DeviceActivationVenueSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  const sendCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      setError('Введите email владельца или управляющего');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await requestDeviceActivationMagicCode(normalizedEmail);
      setEmail(normalizedEmail);
      setResendSeconds(result.resendAfterSeconds);
      setStep('code');
    } catch (cause) {
      setError(activationError(cause));
    } finally {
      setLoading(false);
    }
  };

  const finishActivation = () => {
    setSuccess(true);
    setTimeout(() => navigation.replace('Lock'), 900);
  };

  const verifyCode = async () => {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length < 4) {
      setError('Введите код из письма');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await activateInstantDevice({
        email,
        magicCode: normalizedCode,
        label: deviceLabel,
        platform,
      });
      if (response.status === 'activated') {
        finishActivation();
        return;
      }
      setSelection(response.selection);
      setStep('venue');
    } catch (cause) {
      setError(activationError(cause));
    } finally {
      setLoading(false);
    }
  };

  const chooseVenue = async (venueId: string) => {
    if (!selection) return;
    setLoading(true);
    setError(null);
    try {
      await completeInstantDeviceActivation({
        activationChallenge: selection.activationChallenge,
        venueId,
      });
      finishActivation();
    } catch (cause) {
      setError(activationError(cause));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar hidden />
        <View style={styles.container}>
          <Text style={styles.title}>POS активирован</Text>
          <Text style={styles.subtitle}>Переходим ко входу сотрудников…</Text>
          <ActivityIndicator color={theme.colors.accent} size="large" style={styles.successSpinner} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.container}>
        <Text style={styles.eyebrow}>LUMO POS</Text>
        <Text style={styles.title}>
          {step === 'venue' ? 'Выберите заведение' : 'Активация устройства'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 'email' && 'Владелец или управляющий подтвердит подключение этого POS.'}
          {step === 'code' && `Код отправлен на ${email}`}
          {step === 'venue' && 'Доступно несколько заведений. Выберите, где будет работать этот POS.'}
        </Text>

        {step === 'email' && (
          <>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(text) => { setEmail(text); setError(null); }}
              placeholder="Email владельца или управляющего"
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              maxLength={128}
              editable={!loading}
              accessibilityLabel="Email владельца или управляющего"
            />
            <PrimaryButton label="Получить код" loading={loading} onPress={sendCode} />
          </>
        )}

        {step === 'code' && (
          <>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(text) => { setCode(text); setError(null); }}
              placeholder="Код из письма"
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="one-time-code"
              maxLength={16}
              editable={!loading}
              accessibilityLabel="Код активации"
            />
            <PrimaryButton label="Продолжить" loading={loading} onPress={verifyCode} />
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={sendCode}
              disabled={loading || resendSeconds > 0}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryText, resendSeconds > 0 && styles.secondaryTextDisabled]}>
                {resendSeconds > 0 ? `Отправить повторно через ${resendSeconds} сек` : 'Отправить код повторно'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.changeEmailButton}
              onPress={() => { setStep('email'); setCode(''); setError(null); }}
              disabled={loading}
            >
              <Text style={styles.changeEmailText}>Изменить email</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'venue' && selection && (
          <View style={styles.venueList}>
            {selection.venues.map((venue) => (
              <TouchableOpacity
                key={venue.id}
                style={styles.venueButton}
                onPress={() => chooseVenue(venue.id)}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={`Активировать POS для ${venue.name}`}
              >
                <View style={styles.venueMark} />
                <Text style={styles.venueName}>{venue.name}</Text>
                {loading && <ActivityIndicator color={theme.colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.footnote}>Активация выполняется один раз. Сотрудники входят по PIN.</Text>
      </View>
    </SafeAreaView>
  );
};

function PrimaryButton({ label, loading, onPress }: { label: string; loading: boolean; onPress(): void }) {
  return (
    <TouchableOpacity
      style={[styles.button, loading && styles.buttonDisabled]}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
    >
      {loading ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.buttonText}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  eyebrow: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 14,
  },
  title: {
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.bold,
    fontSize: 30,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 30,
    textAlign: 'center',
    maxWidth: 420,
  },
  input: {
    width: '100%',
    maxWidth: 380,
    minHeight: 56,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    paddingHorizontal: 18,
    fontSize: 17,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  error: {
    color: theme.colors.destructive,
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    marginTop: 18,
    textAlign: 'center',
    maxWidth: 380,
  },
  button: {
    width: '100%',
    maxWidth: 380,
    minHeight: 56,
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: theme.colors.white, fontFamily: theme.fonts.bold, fontSize: 17 },
  secondaryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  secondaryText: { color: theme.colors.accent, fontFamily: theme.fonts.medium, fontSize: 14 },
  secondaryTextDisabled: { color: theme.colors.textSecondary },
  changeEmailButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  changeEmailText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: 14 },
  venueList: { width: '100%', maxWidth: 420, gap: 10 },
  venueButton: {
    minHeight: 64,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  venueMark: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accent },
  venueName: { flex: 1, color: theme.colors.textPrimary, fontFamily: theme.fonts.medium, fontSize: 17 },
  footnote: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    marginTop: 28,
    textAlign: 'center',
  },
  successSpinner: { marginTop: 24 },
});
