import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
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
            backgroundColor: '#fffdf8',
            padding: 18,
            gap: 16,
            boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
          }}
        >
          <View style={{ gap: 4 }}>
            <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '800' }}>
              {mode === 'create' ? 'Add course' : 'Edit course'}
            </Text>
            <Text style={{ color: '#475569', fontSize: 14, lineHeight: 20 }}>
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
                placeholderTextColor="#94a3b8"
                style={styles.input}
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
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={draft.courseCode}
                />
              </Field>

              <Field label="Section" style={{ width: 110 }}>
                <TextInput
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={(value) => onChange('section', value)}
                  placeholder="B"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
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
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={draft.instructorName}
              />
            </Field>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="Semester" style={{ flex: 1 }}>
                <DropdownField
                  isOpen={openDropdown === 'term'}
                  label={draft.semesterTerm}
                  onPress={() => setOpenDropdown((current) => (current === 'term' ? null : 'term'))}
                />
                {openDropdown === 'term' ? (
                  <DropdownList
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
                  onPress={() => setOpenDropdown((current) => (current === 'year' ? null : 'year'))}
                />
                {openDropdown === 'year' ? (
                  <DropdownList
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
              />
            </Field>

            <Field label="Description">
              <TextInput
                autoCapitalize="sentences"
                multiline
                numberOfLines={4}
                onChangeText={(value) => onChange('description', value)}
                placeholder="Short note about the course focus, format, or study goals."
                placeholderTextColor="#94a3b8"
                style={[styles.input, styles.multilineInput]}
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
                backgroundColor: '#fff1f2',
              }}
            >
              <Text style={{ color: '#be123c', fontSize: 13, fontWeight: '700' }}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              disabled={saving}
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.primaryButton,
                saving ? styles.primaryButtonDisabled : pressed && styles.primaryButtonPressed,
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
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={{ color: '#334155', fontSize: 13, fontWeight: '700' }}>{label}</Text>
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
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dropdownField,
        pressed && { borderColor: '#94a3b8' },
        isOpen && { borderColor: '#115e59' },
      ]}
    >
      <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: '#64748b', fontSize: 16, fontWeight: '700' }}>{isOpen ? '−' : '+'}</Text>
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
              option === selectedValue ? '#d1fae5' : pressed ? '#e2e8f0' : '#f8fafc',
          })}
        >
          <Text
            style={{
              color: option === selectedValue ? '#065f46' : '#334155',
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
                borderColor: selected ? '#0f172a' : 'rgba(255,255,255,0.9)',
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
            borderColor: '#ffffff',
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
    borderWidth: 1,
    borderColor: '#d9e0ea',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    color: '#0f172a',
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
