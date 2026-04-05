import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../../providers/settings-provider';
import {
  COURSE_COLOR_WHEEL,
  getSemesterYearOptions,
  type CourseDraft,
  type SemesterTerm,
} from '../../services/courses-repository';

type CourseFormModalProps = {
  draft: CourseDraft;
  errorMessage: string | null;
  mode: 'create' | 'edit';
  onChange: (field: keyof CourseDraft, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  visible: boolean;
};

const SEMESTER_TERMS: SemesterTerm[] = ['Winter', 'Spring', 'Summer', 'Fall'];

export function CourseFormModal({
  draft,
  errorMessage,
  mode,
  onChange,
  onClose,
  onSubmit,
  saving,
  visible,
}: CourseFormModalProps) {
  const theme = useAppTheme();
  const [openDropdown, setOpenDropdown] = useState<'term' | 'year' | null>(null);
  const yearOptions = getSemesterYearOptions();

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.modalBackdrop,
          justifyContent: 'center',
          paddingHorizontal: 18,
          paddingVertical: 28,
        }}
      >
        <View
          style={{
            maxHeight: '90%',
            borderRadius: 28,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 18,
            gap: 16,
            boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
          }}
        >
          <View style={{ gap: 4 }}>
            <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800' }}>
              {mode === 'create' ? 'Add course' : 'Edit course'}
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
              Changes save to the main database immediately, then refresh the local cache.
            </Text>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 14 }}
          >
            <Field label="Course name">
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={(value) => onChange('courseName', value)}
                placeholder="Artificial Intelligence"
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={getInputStyle(theme)}
                value={draft.courseName}
              />
            </Field>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="Course code" style={{ flex: 1 }}>
                <TextInput
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={(value) => onChange('courseCode', value)}
                  placeholder="CSC 430"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={getInputStyle(theme)}
                  value={draft.courseCode}
                />
              </Field>

              <Field label="Section" style={{ width: 110 }}>
                <TextInput
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={(value) => onChange('section', value)}
                  placeholder="B"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={getInputStyle(theme)}
                  value={draft.section}
                />
              </Field>
            </View>

            <Field label="Instructor">
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={(value) => onChange('instructorName', value)}
                placeholder="Prof. Nguyen"
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={getInputStyle(theme)}
                value={draft.instructorName}
              />
            </Field>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="Semester" style={{ flex: 1 }}>
                <DropdownField
                  isOpen={openDropdown === 'term'}
                  label={draft.semesterTerm}
                  theme={theme}
                  onPress={() => setOpenDropdown((current) => (current === 'term' ? null : 'term'))}
                />
                {openDropdown === 'term' ? (
                  <DropdownList
                    theme={theme}
                    options={SEMESTER_TERMS}
                    onSelect={(value) => {
                      onChange('semesterTerm', value);
                      setOpenDropdown(null);
                    }}
                    selectedValue={draft.semesterTerm}
                  />
                ) : null}
              </Field>

              <Field label="Year" style={{ width: 120 }}>
                <DropdownField
                  isOpen={openDropdown === 'year'}
                  label={draft.semesterYear}
                  theme={theme}
                  onPress={() => setOpenDropdown((current) => (current === 'year' ? null : 'year'))}
                />
                {openDropdown === 'year' ? (
                  <DropdownList
                    theme={theme}
                    options={yearOptions}
                    onSelect={(value) => {
                      onChange('semesterYear', value);
                      setOpenDropdown(null);
                    }}
                    selectedValue={draft.semesterYear}
                  />
                ) : null}
              </Field>
            </View>

            <Field label="Color">
              <ColorWheel
                onSelect={(value) => onChange('colorHex', value)}
                selectedColor={draft.colorHex}
                theme={theme}
              />
            </Field>

            <Field label="Description">
              <TextInput
                autoCapitalize="sentences"
                multiline
                numberOfLines={4}
                onChangeText={(value) => onChange('description', value)}
                placeholder="Short note about the course focus, format, or study goals."
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={[getInputStyle(theme), styles.multilineInput]}
                textAlignVertical="top"
                value={draft.description}
              />
            </Field>
          </ScrollView>

          {errorMessage ? (
            <View
              style={{
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: theme.colors.dangerSoft,
                borderWidth: 1,
                borderColor: theme.colors.dangerBorder,
              }}
            >
              <Text style={{ color: theme.colors.danger, fontSize: 13, fontWeight: '700' }}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                getSecondaryButtonStyle(theme),
                pressed && getSecondaryButtonPressedStyle(theme),
              ]}
            >
              <Text style={getSecondaryButtonTextStyle(theme)}>Cancel</Text>
            </Pressable>

            <Pressable
              disabled={saving}
              onPress={onSubmit}
              style={({ pressed }) => [
                getPrimaryButtonStyle(theme),
                saving
                  ? getPrimaryButtonDisabledStyle(theme)
                  : pressed && getPrimaryButtonPressedStyle(theme),
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  children,
  label,
  style,
}: {
  children: React.ReactNode;
  label: string;
  style?: object;
}) {
  const theme = useAppTheme();

  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' }}>{label}</Text>
      {children}
    </View>
  );
}

function DropdownField({
  isOpen,
  label,
  onPress,
}: {
  isOpen: boolean;
  label: string;
  theme: ReturnType<typeof useAppTheme>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        getDropdownFieldStyle(theme),
        pressed && { borderColor: theme.colors.textSubtle },
        isOpen && { borderColor: theme.colors.accent },
      ]}
    >
      <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: 16, fontWeight: '700' }}>{isOpen ? '−' : '+'}</Text>
    </Pressable>
  );
}

function DropdownList({
  onSelect,
  options,
  selectedValue,
}: {
  onSelect: (value: string) => void;
  options: readonly string[];
  selectedValue: string;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <View style={styles.dropdownList}>
      {options.map((option) => (
        <Pressable
          key={option}
          onPress={() => onSelect(option)}
          style={({ pressed }) => ({
            minHeight: 38,
            borderRadius: 14,
            paddingHorizontal: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              option === selectedValue
                ? theme.colors.successSoft
                : pressed
                  ? theme.colors.neutralBorder
                  : theme.colors.neutralSoft,
            borderWidth: 1,
            borderColor:
              option === selectedValue ? theme.colors.successBorder : theme.colors.neutralBorder,
          })}
        >
          <Text
            style={{
              color: option === selectedValue ? theme.colors.success : theme.colors.textMuted,
              fontSize: 14,
              fontWeight: '700',
            }}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ColorWheel({
  onSelect,
  selectedColor,
}: {
  onSelect: (value: string) => void;
  selectedColor: string;
  theme: ReturnType<typeof useAppTheme>;
}) {
  const size = 184;
  const radius = 64;
  const center = size / 2;

  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
      }}
    >
      <View style={{ width: size, height: size }}>
        {COURSE_COLOR_WHEEL.map((color, index) => {
          const angle = (Math.PI * 2 * index) / COURSE_COLOR_WHEEL.length - Math.PI / 2;
          const x = center + Math.cos(angle) * radius - 22;
          const y = center + Math.sin(angle) * radius - 22;
          const selected = color === selectedColor;

          return (
            <Pressable
              key={color}
              onPress={() => onSelect(color)}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 44,
                height: 44,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: color,
                borderWidth: selected ? 3 : 1.5,
                borderColor: selected ? theme.colors.emphasis : theme.colors.border,
                boxShadow: selected
                  ? '0 10px 18px rgba(15, 23, 42, 0.18)'
                  : '0 6px 12px rgba(15, 23, 42, 0.10)',
              }}
            >
              {selected ? <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '900' }}>✓</Text> : null}
            </Pressable>
          );
        })}

        <View
          style={{
            position: 'absolute',
            left: center - 34,
            top: center - 34,
            width: 68,
            height: 68,
            borderRadius: 999,
            backgroundColor: selectedColor,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 4,
            borderColor: theme.colors.card,
            boxShadow: '0 12px 22px rgba(15, 23, 42, 0.16)',
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
            {selectedColor.toUpperCase()}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = {
  input: {
    minHeight: 50,
    borderRadius: 18,
    borderCurve: 'continuous' as const,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 112,
    paddingVertical: 14,
  },
  dropdownField: {
    minHeight: 50,
    borderRadius: 18,
    borderCurve: 'continuous' as const,
    borderWidth: 1,
    borderColor: '#d9e0ea',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  dropdownList: {
    marginTop: 8,
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#f1f5f9',
  },
  secondaryButtonPressed: {
    backgroundColor: '#e2e8f0',
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '800' as const,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#115e59',
  },
  primaryButtonPressed: {
    backgroundColor: '#0f766e',
  },
  primaryButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800' as const,
  },
};

function getInputStyle(theme: ReturnType<typeof useAppTheme>) {
  return {
    ...styles.input,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.inputBackground,
    color: theme.colors.text,
  };
}

function getDropdownFieldStyle(theme: ReturnType<typeof useAppTheme>) {
  return {
    ...styles.dropdownField,
    borderColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.inputBackground,
  };
}

function getSecondaryButtonStyle(theme: ReturnType<typeof useAppTheme>) {
  return {
    ...styles.secondaryButton,
    backgroundColor: theme.colors.neutralSoft,
    borderWidth: 1,
    borderColor: theme.colors.neutralBorder,
  };
}

function getSecondaryButtonPressedStyle(theme: ReturnType<typeof useAppTheme>) {
  return {
    backgroundColor: theme.colors.neutralBorder,
  };
}

function getSecondaryButtonTextStyle(theme: ReturnType<typeof useAppTheme>) {
  return {
    ...styles.secondaryButtonText,
    color: theme.colors.textMuted,
  };
}

function getPrimaryButtonStyle(theme: ReturnType<typeof useAppTheme>) {
  return {
    ...styles.primaryButton,
    backgroundColor: theme.colors.accent,
  };
}

function getPrimaryButtonPressedStyle(theme: ReturnType<typeof useAppTheme>) {
  return {
    backgroundColor: theme.colors.accentMuted,
  };
}

function getPrimaryButtonDisabledStyle(theme: ReturnType<typeof useAppTheme>) {
  return {
    backgroundColor: theme.resolvedMode === 'dark' ? '#5b6472' : '#94a3b8',
  };
}
