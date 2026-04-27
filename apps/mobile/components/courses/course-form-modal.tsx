import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useAppTheme } from '../../providers/settings-provider';
import {
  COURSE_COLOR_WHEEL,
  COURSE_MEETING_DAY_OPTIONS,
  COURSE_TYPE_OPTIONS,
  createMeetingDate,
  formatCourseTypeLabel,
  formatMeetingTimeLabel,
  formatMeetingTimeValue,
  getSemesterYearOptions,
  type CourseDraft,
  type CourseMeetingDay,
  type CourseType,
  type SemesterTerm,
} from '../../services/courses-repository';

type CourseFormModalProps = {
  draft: CourseDraft;
  errorMessage: string | null;
  mode: 'create' | 'edit';
  onChangeField: (field: keyof CourseDraft, value: string) => void;
  onChangeCourseType: (value: CourseType) => void;
  onToggleMeetingDay: (dayOfWeek: CourseMeetingDay) => void;
  onChangeMeetingStartTime: (dayOfWeek: CourseMeetingDay, time: string) => void;
  onChangeMeetingEndTime: (dayOfWeek: CourseMeetingDay, time: string) => void;
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
  onChangeField,
  onChangeCourseType,
  onToggleMeetingDay,
  onChangeMeetingStartTime,
  onChangeMeetingEndTime,
  onClose,
  onSubmit,
  saving,
  visible,
}: CourseFormModalProps) {
  const theme = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [openDropdown, setOpenDropdown] = useState<'term' | 'year' | null>(null);
  const [activeMeetingEditor, setActiveMeetingEditor] = useState<
    Partial<Record<CourseMeetingDay, 'start' | 'end'>>
  >({});
  const yearOptions = getSemesterYearOptions();
  const selectedMeetingDays = COURSE_MEETING_DAY_OPTIONS.filter((option) =>
    draft.meetingSchedule.some((meeting) => meeting.dayOfWeek === option.value)
  );
  const pickerWidth = Math.min(Math.max(windowWidth - 110, 220), 320);
  const pickerHeight = windowWidth < 380 ? 132 : 144;

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
            maxHeight: '92%',
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
            <Text selectable style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800' }}>
              {mode === 'create' ? 'Add course' : 'Edit course'}
            </Text>
            <Text selectable style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
              Save course info, delivery type, and any in-person meeting schedule in one place.
            </Text>
          </View>

          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentInsetAdjustmentBehavior="automatic"
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 14, paddingBottom: 6 }}
          >
            <Field label="Course name">
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={(value) => onChangeField('courseName', value)}
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
                  onChangeText={(value) => onChangeField('courseCode', value)}
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
                  onChangeText={(value) => onChangeField('section', value)}
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
                onChangeText={(value) => onChangeField('instructorName', value)}
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
                      onChangeField('semesterTerm', value);
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
                      onChangeField('semesterYear', value);
                      setOpenDropdown(null);
                    }}
                    selectedValue={draft.semesterYear}
                  />
                ) : null}
              </Field>
            </View>

            <Field label="Course type">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {COURSE_TYPE_OPTIONS.map((option) => {
                  const selected = draft.courseType === option.value;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => onChangeCourseType(option.value)}
                      style={({ pressed }) => ({
                        flex: 1,
                        minHeight: 46,
                        borderRadius: 16,
                        borderCurve: 'continuous',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected
                          ? theme.colors.accent
                          : pressed
                            ? theme.colors.neutralBorder
                            : theme.colors.neutralSoft,
                        borderWidth: 1,
                        borderColor: selected ? theme.colors.accent : theme.colors.neutralBorder,
                      })}
                    >
                      <Text
                        selectable
                        style={{
                          color: selected ? theme.colors.accentContrast : theme.colors.textMuted,
                          fontSize: 14,
                          fontWeight: '800',
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            {draft.courseType === 'in_person' ? (
              <Field label="Meeting schedule">
                <View
                  style={{
                    borderRadius: 20,
                    borderCurve: 'continuous',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.overlay,
                    padding: 14,
                    gap: 14,
                  }}
                >
                  <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                    Choose each day your class meets, then set its start and end time with the iOS spinner below.
                  </Text>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {COURSE_MEETING_DAY_OPTIONS.map((option) => {
                      const selected = selectedMeetingDays.some((day) => day.value === option.value);

                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => onToggleMeetingDay(option.value)}
                          style={({ pressed }) => ({
                            minWidth: 68,
                            minHeight: 38,
                            paddingHorizontal: 12,
                            borderRadius: 999,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: selected
                              ? `${theme.colors.accent}18`
                              : pressed
                                ? theme.colors.neutralBorder
                                : theme.colors.card,
                            borderWidth: 1,
                            borderColor: selected ? theme.colors.accent : theme.colors.border,
                          })}
                        >
                          <Text
                            selectable
                            style={{
                              color: selected ? theme.colors.accent : theme.colors.textMuted,
                              fontSize: 13,
                              fontWeight: '800',
                            }}
                          >
                            {option.shortLabel}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {selectedMeetingDays.length === 0 ? (
                    <View
                      style={{
                        borderRadius: 16,
                        borderCurve: 'continuous',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        backgroundColor: theme.colors.card,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                        Select at least one meeting day to define the in-person schedule.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 12 }}>
                      {selectedMeetingDays.map((option) => {
                        const meeting = draft.meetingSchedule.find(
                          (entry) => entry.dayOfWeek === option.value
                        );
                        const activeEditor = activeMeetingEditor[option.value] ?? 'start';

                        if (!meeting) {
                          return null;
                        }

                        return (
                          <View
                            key={option.value}
                            style={{
                              borderRadius: 18,
                              borderCurve: 'continuous',
                              padding: 12,
                              backgroundColor: theme.colors.card,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              gap: 10,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <Text selectable style={{ color: theme.colors.text, fontSize: 15, fontWeight: '800' }}>
                                {option.label}
                              </Text>
                              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' }}>
                                {formatMeetingTimeLabel(meeting.startTime)} - {formatMeetingTimeLabel(meeting.endTime)}
                              </Text>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 10 }}>
                              <Pressable
                                onPress={() =>
                                  setActiveMeetingEditor((current) => ({ ...current, [option.value]: 'start' }))
                                }
                                style={({ pressed }) => ({
                                  flex: 1,
                                  borderRadius: 14,
                                  borderCurve: 'continuous',
                                  paddingHorizontal: 12,
                                  paddingVertical: 10,
                                  borderWidth: 1,
                                  borderColor:
                                    activeEditor === 'start' ? theme.colors.accent : theme.colors.border,
                                  backgroundColor:
                                    activeEditor === 'start'
                                      ? `${theme.colors.accent}14`
                                      : pressed
                                        ? theme.colors.overlay
                                        : theme.colors.card,
                                  gap: 2,
                                })}
                              >
                                <Text selectable style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                                  Start
                                </Text>
                                <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>
                                  {formatMeetingTimeLabel(meeting.startTime)}
                                </Text>
                              </Pressable>

                              <Pressable
                                onPress={() =>
                                  setActiveMeetingEditor((current) => ({ ...current, [option.value]: 'end' }))
                                }
                                style={({ pressed }) => ({
                                  flex: 1,
                                  borderRadius: 14,
                                  borderCurve: 'continuous',
                                  paddingHorizontal: 12,
                                  paddingVertical: 10,
                                  borderWidth: 1,
                                  borderColor:
                                    activeEditor === 'end' ? theme.colors.accent : theme.colors.border,
                                  backgroundColor:
                                    activeEditor === 'end'
                                      ? `${theme.colors.accent}14`
                                      : pressed
                                        ? theme.colors.overlay
                                        : theme.colors.card,
                                  gap: 2,
                                })}
                              >
                                <Text selectable style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                                  End
                                </Text>
                                <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>
                                  {formatMeetingTimeLabel(meeting.endTime)}
                                </Text>
                              </Pressable>
                            </View>

                            <View
                              style={{
                                alignItems: 'center',
                                borderRadius: 16,
                                borderCurve: 'continuous',
                                backgroundColor: theme.colors.overlay,
                                paddingTop: 6,
                                paddingBottom: 2,
                                overflow: 'hidden',
                              }}
                            >
                              <Text selectable style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                                {activeEditor === 'start' ? 'Adjust start time' : 'Adjust end time'}
                              </Text>
                              <DateTimePicker
                                display="spinner"
                                minuteInterval={5}
                                mode="time"
                                themeVariant={theme.resolvedMode}
                                value={createMeetingDate(
                                  activeEditor === 'start' ? meeting.startTime : meeting.endTime
                                )}
                                onChange={(_, selectedDate) => {
                                  if (!selectedDate) {
                                    return;
                                  }

                                  const formatted = formatMeetingTimeValue(selectedDate);

                                  if (activeEditor === 'start') {
                                    onChangeMeetingStartTime(option.value, formatted);
                                    return;
                                  }

                                  onChangeMeetingEndTime(option.value, formatted);
                                }}
                                style={{ width: pickerWidth, height: pickerHeight }}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </Field>
            ) : (
              <Field label="Meeting schedule">
                <View
                  style={{
                    borderRadius: 18,
                    borderCurve: 'continuous',
                    padding: 14,
                    backgroundColor: theme.colors.overlay,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    gap: 6,
                  }}
                >
                  <Text selectable style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
                    {formatCourseTypeLabel(draft.courseType)} courses do not require an in-person class time.
                  </Text>
                  <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                    This schedule will be stored as empty until you switch the course back to In-person.
                  </Text>
                </View>
              </Field>
            )}

            <Field label="Color">
              <ColorWheel
                onSelect={(value) => onChangeField('colorHex', value)}
                selectedColor={draft.colorHex}
                theme={theme}
              />
            </Field>

            <Field label="Description">
              <TextInput
                autoCapitalize="sentences"
                multiline
                numberOfLines={4}
                onChangeText={(value) => onChangeField('description', value)}
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
              <Text selectable style={{ color: theme.colors.danger, fontSize: 13, fontWeight: '700' }}>
                {errorMessage}
              </Text>
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
              <Text selectable style={getSecondaryButtonTextStyle(theme)}>Cancel</Text>
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
              <Text selectable style={styles.primaryButtonText}>
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
      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function DropdownField({
  isOpen,
  label,
  theme,
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
      <Text selectable style={{ color: theme.colors.text, fontSize: 15, fontWeight: '600' }}>
        {label}
      </Text>
      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 16, fontWeight: '700' }}>
        {isOpen ? '−' : '+'}
      </Text>
    </Pressable>
  );
}

function DropdownList({
  onSelect,
  options,
  selectedValue,
  theme,
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
            selectable
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
  theme,
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
              {selected ? <Text selectable style={{ color: '#ffffff', fontSize: 16, fontWeight: '900' }}>✓</Text> : null}
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
          <Text selectable style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
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
    ...styles.primaryButtonDisabled,
    backgroundColor: theme.colors.neutralBorder,
  };
}
