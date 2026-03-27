import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

export default function HomeRoute() {
  const { width } = useWindowDimensions();
  const isCompact = width < 390;

  const courseStack = [
    { code: 'CSC 499', tint: '#dbeafe' },
    { code: 'AI 430', tint: '#ffedd5' },
    { code: 'MAT 345', tint: '#dcfce7' },
  ];

  const quizOptions = [
    'A system that stores every lecture as raw audio only',
    'A grounded answer pipeline built from transcript embeddings',
    'A reminder tool that replaces note-taking entirely',
    'A static chatbot with no lecture context',
  ];

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: 16,
        gap: 12,
        paddingBottom: 32,
        backgroundColor: '#f7f6f2',
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 24,
          right: -32,
          width: 220,
          height: 220,
          borderRadius: 999,
          backgroundColor: 'rgba(254, 215, 170, 0.16)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 160,
          left: -44,
          width: 200,
          height: 200,
          borderRadius: 999,
          backgroundColor: 'rgba(191, 219, 254, 0.14)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 220,
          right: 56,
          width: 160,
          height: 160,
          borderRadius: 999,
          backgroundColor: 'rgba(187, 247, 208, 0.12)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 40,
          left: 24,
          width: 180,
          height: 180,
          borderRadius: 999,
          backgroundColor: 'rgba(196, 181, 253, 0.08)',
        }}
      />

      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          alignItems: 'stretch',
        }}
      >
        <Pressable
          style={({ pressed }) => ({
            flex: 1.1,
            minHeight: 106,
            borderRadius: 30,
            borderCurve: 'continuous',
            paddingHorizontal: 14,
            paddingVertical: 12,
            justifyContent: 'space-between',
            backgroundColor: 'transparent',
            boxShadow: pressed ? '0 8px 18px rgba(15, 23, 42, 0.04)' : '0 12px 24px rgba(15, 23, 42, 0.04)',
          })}
        >
          <View
            style={{
              width: '50%',
              aspectRatio: 1,
              maxWidth: 96,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Image
              source={require('../../assets/images/record_logo.png')}
              style={{
                width: '100%',
                height: '100%',
                resizeMode: 'center',
              }}
            />
          </View>

          <View style={{ gap: 4 }}>
            <Text selectable style={{ fontSize: 9, letterSpacing: 1.2, color: '#ef4444', fontWeight: '800', textTransform: 'uppercase' }}>
              Recording
            </Text>
            <Text selectable style={{ fontSize: 18, lineHeight: 22, color: '#111827', fontWeight: '800' }}>
              Record lecture
            </Text>
          </View>
        </Pressable>

        <View style={{ flex: 0.82, gap: 12 }}>
          <View
            style={{
              flex: 1,
              minHeight: 58,
              borderRadius: 24,
              borderCurve: 'continuous',
              padding: 12,
              justifyContent: 'space-between',
              backgroundColor: 'rgba(255,255,255,0.68)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.66)',
              boxShadow: '0 14px 30px rgba(15, 23, 42, 0.10)',
            }}
          >
            <View style={{ marginTop: 2, paddingBottom: 2 }}>
              {courseStack.map((course, index) => (
                <View
                  key={course.code}
                  style={{
                    position: 'absolute',
                    top: index * 7,
                    left: index * 7,
                    right: 0,
                    height: 38,
                    borderRadius: 16,
                    borderCurve: 'continuous',
                    paddingHorizontal: 12,
                    justifyContent: 'center',
                    backgroundColor: course.tint,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.8)',
                    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <Text selectable style={{ fontSize: 12, fontWeight: '800', color: '#1f2937' }}>
                    {course.code}
                  </Text>
                </View>
              ))}
              <View style={{ height: 50 }} />
            </View>
          </View>

          <View
            style={{
              flex: 1,
              minHeight: 58,
              borderRadius: 24,
              borderCurve: 'continuous',
              padding: 12,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.68)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.66)',
              boxShadow: '0 14px 30px rgba(15, 23, 42, 0.10)',
            }}
          >
            <Text selectable style={{ fontSize: 32, textAlign: 'center' }}>🧠</Text>
            <Text selectable style={{ marginTop: 4, fontSize: 14, color: '#334155', fontWeight: '700' }}>
              Exam review
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{
          borderRadius: 30,
          borderCurve: 'continuous',
          padding: 16,
          gap: 12,
          backgroundColor: 'rgba(255,255,255,0.76)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.7)',
          boxShadow: '0 20px 44px rgba(15, 23, 42, 0.12)',
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text selectable style={{ color: '#111827', fontSize: 22, fontWeight: '800' }}>
            Quick quiz
          </Text>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: 7,
              backgroundColor: '#fff1e8',
            }}
          >
            <Text
              selectable
              style={{ color: '#c2410c', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] }}
            >
              04/10
            </Text>
          </View>
        </View>

        <View
          style={{
            height: 94,
            borderRadius: 22,
            borderCurve: 'continuous',
            padding: 14,
            justifyContent: 'center',
            backgroundColor: '#fff8f1',
            borderWidth: 1,
            borderColor: '#fde6d5',
          }}
        >
          <Text
            selectable
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={3}
            style={{
              color: '#7c2d12',
              fontSize: isCompact ? 20 : 22,
              lineHeight: isCompact ? 24 : 26,
              fontWeight: '800',
            }}
          >
            Which LectrAI component retrieves relevant lecture segments before generating a grounded answer?
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          {quizOptions.map((option, index) => (
            <View
              key={option}
              style={{
                minHeight: 58,
                borderRadius: 18,
                borderCurve: 'continuous',
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: 'row',
                gap: 10,
                alignItems: 'center',
                backgroundColor: index === 1 ? '#eefbf3' : '#f8fafc',
                borderWidth: 1,
                borderColor: index === 1 ? '#bbf7d0' : '#e5e7eb',
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: index === 1 ? '#16a34a' : '#e2e8f0',
                }}
              >
                <Text selectable style={{ color: index === 1 ? '#ffffff' : '#475569', fontSize: 13, fontWeight: '800' }}>
                  {String.fromCharCode(65 + index)}
                </Text>
              </View>
              <Text
                selectable
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                numberOfLines={2}
                style={{
                  flex: 1,
                  color: '#1f2937',
                  fontSize: 14,
                  lineHeight: 18,
                  fontWeight: index === 1 ? '700' : '600',
                }}
              >
                {option}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: 10,
        }}
      >
        {[
          { label: '🔥', value: '5', tint: '#fff1e8' },
          { label: '📈', value: '84%', tint: '#eefbf3' },
          { label: '📚', value: '4', tint: '#eff6ff' },
        ].map((stat) => (
          <View
            key={stat.label}
            style={{
              flex: 1,
              minHeight: 70,
              borderRadius: 20,
              borderCurve: 'continuous',
              paddingHorizontal: 14,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(255,255,255,0.72)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.68)',
              boxShadow: '0 14px 28px rgba(15, 23, 42, 0.10)',
            }}
          >
            <Text selectable style={{ fontSize: 22 }}>{stat.label}</Text>
            <Text
              selectable
              style={{ color: '#0f172a', fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}
            >
              {stat.value}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
