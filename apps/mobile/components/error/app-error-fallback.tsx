import { Pressable, Text, View } from 'react-native';
import type { MobileErrorReport } from '../../services/error-monitor';

type AppErrorFallbackProps = {
  title?: string;
  message?: string;
  errorReport?: MobileErrorReport | null;
  onRetry?: () => void;
  retryLabel?: string;
};

export function AppErrorFallback({
  title = 'Something went wrong',
  message,
  errorReport,
  onRetry,
  retryLabel = 'Try again',
}: AppErrorFallbackProps) {
  const detail = message ?? errorReport?.error.message ?? 'The app hit an unexpected error and recovered safely.';

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
        backgroundColor: '#111827',
      }}
    >
      <View
        style={{
          borderRadius: 24,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          backgroundColor: '#1f2937',
          padding: 24,
          gap: 12,
        }}
      >
        <Text style={{ color: '#f9fafb', fontSize: 28, fontWeight: '900' }}>{title}</Text>
        <Text style={{ color: '#d1d5db', fontSize: 16, lineHeight: 24 }}>{detail}</Text>
        {errorReport ? (
          <Text style={{ color: '#9ca3af', fontSize: 13, lineHeight: 20 }}>
            Logged from {errorReport.source} at {errorReport.happenedAt}
          </Text>
        ) : null}
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => ({
              marginTop: 8,
              minHeight: 52,
              borderRadius: 16,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f97316',
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Text style={{ color: '#fff7ed', fontSize: 16, fontWeight: '900' }}>{retryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
