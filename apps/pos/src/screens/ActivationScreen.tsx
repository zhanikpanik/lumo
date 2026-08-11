import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ActivityIndicator, Platform,
} from 'react-native';
import { theme } from '../theme/colors';
import { activateInstantDevice } from '../data/instant';

interface Props {
  navigation: any;
}

export const ActivationScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleActivate = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim().toUpperCase();

    if (!trimmedEmail.includes('@')) {
      setError('Введите email владельца или управляющего');
      return;
    }
    if (trimmedCode.length < 4) {
      setError('Введите код активации');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const platform = Platform.OS === 'ios' ? 'ios' as const
        : Platform.OS === 'android' ? 'android' as const
        : 'web' as const;

      await activateInstantDevice({
        email: trimmedEmail,
        magicCode: trimmedCode,
        label: 'Планшет',
        platform,
      });
      setSuccess(true);
      setTimeout(() => navigation.replace('Lock'), 1200);
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('another venue')) {
        setError('Этот планшет уже привязан к другому заведению');
      } else if (msg.includes('membership')) {
        setError('У этой учётной записи нет прав на данное заведение');
      } else if (msg.includes('magic') || msg.includes('code') || msg.includes('token')) {
        setError('Неверный или истёкший код активации');
      } else if (e instanceof TypeError && msg.includes('fetch')) {
        setError('Не удалось подключиться к серверу активации. Проверьте соединение.');
      } else {
        setError(msg || 'Не удалось активировать устройство');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar hidden />
        <View style={styles.container}>
          <Text style={styles.title}>Готово!</Text>
          <Text style={styles.subtitle}>
            Планшет активирован. Переходим ко входу...
          </Text>
          <ActivityIndicator color={theme.colors.accent} size="large" style={{ marginTop: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar hidden />
      <View style={styles.container}>
        <Text style={styles.title}>Активация планшета</Text>
        <Text style={styles.subtitle}>
          Введите email владельца и код, полученный на почту
        </Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={(text) => { setEmail(text); setError(null); }}
          placeholder="Email владельца"
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          maxLength={128}
          editable={!loading}
        />

        <TextInput
          style={[styles.input, { marginTop: 12 }]}
          value={code}
          onChangeText={(text) => { setCode(text); setError(null); }}
          placeholder="Код активации"
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={16}
          editable={!loading}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, (loading || success) && styles.buttonDisabled]}
          onPress={handleActivate}
          disabled={loading || success}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Активировать</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  title: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: 28, marginBottom: 12, textAlign: 'center' },
  subtitle: { color: theme.colors.textSecondary, fontFamily: theme.fonts.regular, fontSize: 16, marginBottom: 32, textAlign: 'center' },
  input: {
    width: '100%', maxWidth: 320,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 16,
    fontSize: 18,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  error: { color: theme.colors.destructive, fontFamily: theme.fonts.regular, fontSize: 14, marginTop: 16, marginBottom: 8, textAlign: 'center', maxWidth: 320 },
  button: {
    width: '100%', maxWidth: 320,
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontFamily: theme.fonts.bold, fontSize: 18 },
});
