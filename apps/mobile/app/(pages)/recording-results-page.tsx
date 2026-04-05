import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '../../providers/settings-provider';

const MOCK_SUMMARY = [
  'The lecture introduced the core idea of entropy as a way to describe disorder and energy distribution in thermodynamic systems.',
  'It connected the concept to everyday physical examples so students could distinguish intuition from the formal definition used in class.',
  'The professor also highlighted why entropy becomes important when predicting whether a process will happen naturally or require outside work.',
];

const MOCK_TRANSCRIPT = [
  'Today we are going to focus on entropy, not just as a definition to memorize, but as a pattern that helps explain why some physical changes happen on their own.',
  'When we say a system becomes more disordered, we are really talking about the number of possible arrangements available to the particles and the energy inside that system.',
  'That is why entropy is so useful in thermodynamics. It gives us a language for predicting direction, not just describing state.',
  'As we move forward, keep asking whether a process spreads energy out more broadly, because that question will come back again and again in this course.',
];

export default function RecordingResultsRoute() {
  const theme = useAppTheme();
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [transcriptExpanded, setTranscriptExpanded] = useState(true);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.screen }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          padding: 16,
          paddingBottom: 120,
          gap: 14,
          backgroundColor: theme.colors.screen,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: 8,
            paddingBottom: 4,
            justifyContent: 'center',
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              position: 'absolute',
              left: 0,
              width: 38,
              height: 38,
              borderRadius: 999,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.overlay,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>←</Text>
          </Pressable>

          <Text style={{ color: theme.colors.text, fontSize: 30, lineHeight: 36, fontWeight: '900' }}>
            Lecture Review
          </Text>
        </View>

        <NotionSection
          theme={theme}
          title="Summary"
          expanded={summaryExpanded}
          onToggle={() => setSummaryExpanded((current) => !current)}
        >
          {MOCK_SUMMARY.map((paragraph) => (
            <Text
              key={paragraph}
              style={{ color: theme.colors.text, fontSize: 15, lineHeight: 25, fontWeight: '500' }}
            >
              {paragraph}
            </Text>
          ))}
        </NotionSection>

        <NotionSection
          theme={theme}
          title="Transcript"
          expanded={transcriptExpanded}
          onToggle={() => setTranscriptExpanded((current) => !current)}
        >
          {MOCK_TRANSCRIPT.map((paragraph, index) => (
            <View key={`${index}-${paragraph}`} style={{ gap: 6 }}>
              <Text style={{ color: theme.colors.textSubtle, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 }}>
                {`00:0${index + 2}`}
              </Text>
              <Text
                style={{ color: theme.colors.text, fontSize: 15, lineHeight: 25, fontWeight: '500' }}
              >
                {paragraph}
              </Text>
            </View>
          ))}
        </NotionSection>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 22,
          borderRadius: 24,
          borderCurve: 'continuous',
          padding: 12,
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
          boxShadow: '0 18px 36px rgba(15, 23, 42, 0.12)',
        }}
      >
        <Pressable
          onPress={() => {
            Alert.alert('Coming soon', 'Quiz generation is coming soon.');
          }}
          style={({ pressed }) => ({
            minHeight: 56,
            borderRadius: 18,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent,
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ color: theme.colors.accentContrast, fontSize: 16, fontWeight: '900' }}>
            Generate Quiz
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function NotionSection({
  title,
  expanded,
  onToggle,
  children,
  theme,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <View
      style={{
        borderRadius: 28,
        borderCurve: 'continuous',
        padding: 18,
        gap: 14,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        boxShadow: '0 16px 28px rgba(15, 23, 42, 0.08)',
      }}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '900' }}>
            {title}
          </Text>
        </View>

        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: expanded ? theme.colors.accentSoft : theme.colors.neutralSoft,
            borderWidth: 1,
            borderColor: expanded ? theme.colors.accentBorder : theme.colors.neutralBorder,
          }}
        >
          <Text
            style={{
              color: expanded ? theme.colors.accent : theme.colors.textMuted,
              fontSize: 18,
              fontWeight: '900',
            }}
          >
            {expanded ? '⌃' : '⌄'}
          </Text>
        </View>
      </Pressable>

      {expanded ? <View style={{ gap: 14 }}>{children}</View> : null}
    </View>
  );
}
