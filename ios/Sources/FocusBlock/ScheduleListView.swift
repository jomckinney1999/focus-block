import SwiftUI

struct ScheduleListView: View {
    @EnvironmentObject var scheduleStore: ScheduleStore
    @State private var editingSchedule: FocusSchedule?
    @State private var showingNewSchedule = false

    var body: some View {
        NavigationStack {
            Group {
                if scheduleStore.schedules.isEmpty {
                    ContentUnavailableFallback()
                } else {
                    List {
                        ForEach(scheduleStore.schedules) { schedule in
                            Button {
                                editingSchedule = schedule
                            } label: {
                                ScheduleRow(schedule: schedule)
                            }
                            .buttonStyle(.plain)
                        }
                        .onDelete { offsets in
                            scheduleStore.delete(at: offsets)
                            ScheduleScheduler.apply(scheduleStore.schedules)
                        }
                    }
                }
            }
            .navigationTitle("Focus Block")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingNewSchedule = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingNewSchedule) {
                ScheduleEditorView(schedule: FocusSchedule.blank()) { saved in
                    scheduleStore.add(saved)
                    ScheduleScheduler.apply(scheduleStore.schedules)
                }
            }
            .sheet(item: $editingSchedule) { schedule in
                ScheduleEditorView(schedule: schedule) { saved in
                    scheduleStore.update(saved)
                    ScheduleScheduler.apply(scheduleStore.schedules)
                }
            }
        }
    }
}

private struct ContentUnavailableFallback: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "clock.badge.checkmark")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            Text("No schedules yet")
                .font(.headline)
            Text("Tap + to block your first set of apps on a schedule.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct ScheduleRow: View {
    let schedule: FocusSchedule

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(schedule.name.isEmpty ? "Untitled" : schedule.name)
                    .font(.headline)
                Spacer()
                if !schedule.isEnabled {
                    Text("Off")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Text(schedule.timeRangeDescription)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(schedule.weekdaysDescription)
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}
