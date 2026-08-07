import SwiftUI
import FamilyControls

struct ScheduleEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var schedule: FocusSchedule
    let onSave: (FocusSchedule) -> Void

    @State private var pickerSelection: FamilyActivitySelection
    @State private var showingPicker = false

    init(schedule: FocusSchedule, onSave: @escaping (FocusSchedule) -> Void) {
        _schedule = State(initialValue: schedule)
        _pickerSelection = State(initialValue: schedule.selection)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("e.g. Deep Work", text: $schedule.name)
                }

                Section("Apps to block") {
                    Button {
                        showingPicker = true
                    } label: {
                        HStack {
                            Text("Choose apps & categories")
                            Spacer()
                            Text("\(pickerSelection.applicationTokens.count + pickerSelection.categoryTokens.count) selected")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Time") {
                    DatePicker("Start", selection: startTimeBinding, displayedComponents: .hourAndMinute)
                    DatePicker("End", selection: endTimeBinding, displayedComponents: .hourAndMinute)
                }

                Section("Repeat on") {
                    WeekdayPicker(selected: $schedule.weekdays)
                        .padding(.vertical, 4)
                }

                Section {
                    Toggle("Enabled", isOn: $schedule.isEnabled)
                }
            }
            .navigationTitle(schedule.name.isEmpty ? "New Schedule" : schedule.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        schedule.selection = pickerSelection
                        onSave(schedule)
                        dismiss()
                    }
                    .disabled(schedule.name.trimmingCharacters(in: .whitespaces).isEmpty || schedule.weekdays.isEmpty)
                }
            }
            .familyActivityPicker(isPresented: $showingPicker, selection: $pickerSelection)
        }
    }

    private var startTimeBinding: Binding<Date> {
        Binding(
            get: {
                Calendar.current.date(bySettingHour: schedule.startHour, minute: schedule.startMinute, second: 0, of: Date()) ?? Date()
            },
            set: { newValue in
                let comps = Calendar.current.dateComponents([.hour, .minute], from: newValue)
                schedule.startHour = comps.hour ?? 0
                schedule.startMinute = comps.minute ?? 0
            }
        )
    }

    private var endTimeBinding: Binding<Date> {
        Binding(
            get: {
                Calendar.current.date(bySettingHour: schedule.endHour, minute: schedule.endMinute, second: 0, of: Date()) ?? Date()
            },
            set: { newValue in
                let comps = Calendar.current.dateComponents([.hour, .minute], from: newValue)
                schedule.endHour = comps.hour ?? 0
                schedule.endMinute = comps.minute ?? 0
            }
        )
    }
}

private struct WeekdayPicker: View {
    @Binding var selected: Set<Int>
    private let symbols = Calendar.current.shortWeekdaySymbols // index 0 = weekday 1 (Sunday)

    var body: some View {
        HStack(spacing: 8) {
            ForEach(1...7, id: \.self) { weekday in
                let isOn = selected.contains(weekday)
                Button {
                    if isOn { selected.remove(weekday) } else { selected.insert(weekday) }
                } label: {
                    Text(symbols[weekday - 1].prefix(1))
                        .font(.subheadline.bold())
                        .frame(width: 34, height: 34)
                        .background(isOn ? Color.accentColor : Color.gray.opacity(0.2))
                        .foregroundStyle(isOn ? .white : .primary)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
    }
}
