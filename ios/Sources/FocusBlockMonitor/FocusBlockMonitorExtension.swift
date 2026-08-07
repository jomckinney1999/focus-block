import DeviceActivity
import ManagedSettings
import Foundation

/// Runs in a separate, system-launched process — it can't share in-memory
/// state with the main app. Schedule data comes from the shared App Group
/// UserDefaults written by `ScheduleStore` in the main app.
final class FocusBlockMonitorExtension: DeviceActivityMonitor {
    private let store = ManagedSettingsStore()

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        guard let schedule = lookupSchedule(for: activity) else { return }
        applyShield(for: schedule)
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        clearShield()
    }

    private func applyShield(for schedule: FocusSchedule) {
        let selection = schedule.selection
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty
            ? nil
            : .specific(selection.categoryTokens)
    }

    private func clearShield() {
        store.shield.applications = nil
        store.shield.applicationCategories = nil
    }

    private func lookupSchedule(for activity: DeviceActivityName) -> FocusSchedule? {
        guard let id = ScheduleScheduler.scheduleID(from: activity) else { return nil }
        return ScheduleStore.loadStatic().first(where: { $0.id == id })
    }
}
