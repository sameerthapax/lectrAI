import { BlurView } from 'expo-blur';
import { Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

const LokiNativeVoiceVisualizer = require('../../components/ai/loki-native-voice-visualizer').default;

const prompts = [
  'Break down Lecture 6 before my quiz.',
  'Ask me five questions from today.',
  'Turn my notes into a study guide.',
];

export default function AiAssistanceRoute() {
  const { width } = useWindowDimensions();
  const isCompact = width < 390;

  return (
    <>
      <Stack.Screen options={{ title: 'AI Assist' }} />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: 18,
          backgroundColor: '#f7f6f2',
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 24,
            right: -34,
            width: 210,
            height: 210,
            borderRadius: 999,
            backgroundColor: 'rgba(251, 146, 60, 0.10)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 144,
            left: -44,
            width: 170,
            height: 170,
            borderRadius: 999,
            backgroundColor: 'rgba(30, 41, 59, 0.06)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 96,
            right: 26,
            width: 160,
            height: 160,
            borderRadius: 999,
            backgroundColor: 'rgba(251, 191, 36, 0.06)',
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <View style={{ gap: 2 }}>
            <Text selectable style={{ color: '#475569', fontSize: 13, fontWeight: '700' }}>
              AI assistant
            </Text>
            <Text selectable style={{ color: '#0f172a', fontSize: 30, fontWeight: '800' }}>
              Meet <Text style={{ color: '#ea580c' }}>Loki</Text>
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => ({
              borderRadius: 999,
              borderCurve: 'continuous',
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: pressed ? 'rgba(255,255,255,0.56)' : 'rgba(255,255,255,0.68)',
              boxShadow: '0 10px 20px rgba(15, 23, 42, 0.06)',
            })}
          >
            <Text selectable style={{ color: '#64748b', fontSize: 12, fontWeight: '700' }}>
              History
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            minHeight: isCompact ? 232 : 256,
            borderRadius: 34,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: '#110f0f',
            boxShadow: '0 20px 44px rgba(15, 23, 42, 0.14)',
          }}
        >
          <LokiNativeVoiceVisualizer />
        </View>

        <BlurView
          intensity={24}
          tint="light"
          style={{
            borderRadius: 24,
            overflow: 'hidden',
            borderCurve: 'continuous',
            backgroundColor: 'rgba(255,255,255,0.48)',
            boxShadow: '0 12px 26px rgba(15, 23, 42, 0.08)',
          }}
        >
          <View style={{ padding: 14, gap: 8 }}>
            <Text selectable style={{ color: '#0f172a', fontSize: 17, fontWeight: '700' }}>
              Suggested prompts
            </Text>

            {prompts.map((prompt, index) => (
              <View
                key={prompt}
                style={{
                  minHeight: 42,
                  borderRadius: 15,
                  borderCurve: 'continuous',
                  paddingHorizontal: 11,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  gap: 8,
                  alignItems: 'center',
                  backgroundColor: index === 0 ? 'rgba(255,243,230,0.92)' : 'rgba(248,250,252,0.88)',
                }}
              >
                <Text selectable style={{ fontSize: 19 }}>
                  {index === 0 ? '🧪' : index === 1 ? '📘' : '📝'}
                </Text>
                <Text
                  selectable
                  numberOfLines={2}
                  style={{ flex: 1, color: '#334155', fontSize: 12.5, lineHeight: 16, fontWeight: '600' }}
                >
                  {prompt}
                </Text>
              </View>
            ))}
          </View>
        </BlurView>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 58,
              borderRadius: 20,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              backgroundColor: pressed ? '#f97316' : '#ea580c',
              boxShadow: '0 16px 28px rgba(234, 88, 12, 0.18)',
            })}
          >
            <Text selectable style={{ fontSize: 22 }}>🎤</Text>
            <Text selectable style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>
              Speak
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 58,
              borderRadius: 20,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              backgroundColor: pressed ? 'rgba(15,23,42,0.90)' : 'rgba(15,23,42,0.84)',
              boxShadow: '0 16px 28px rgba(15, 23, 42, 0.16)',
            })}
          >
            <Text selectable style={{ fontSize: 22 }}>💬</Text>
            <Text selectable style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>
              Chat
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}
