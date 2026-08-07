import Foundation
import FamilyControls
import DeviceActivity

/// A single "block this on this schedule" rule. One `FocusSchedule` can expand
/// into several `DeviceActivityName` registrations (one per weekday) — see
/// `ScheduleScheduler.activityName(for:weekday:)`.
struct FocusSchedule: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var name: String
    var startHour: Int
    var startMinute: Int
    var endHour: Int
    var endMinute: Int
    /// Calendar weekday values: 1 = Sunday ... 7 = Saturday.
    var weekdays: Set<Int>
    var isEnabled: Bool = true
    private var selectionData: Data

    init(id: UUID = UUID(), name: String, startHour: Int, startMinute: Int, endHour: Int, endMinute: Int, weekdays: Set<Int>, isEnabled: Bool = true, selection: FamilyActivitySelection = FamilyActivitySelection()) {
        self.id = id
        self.name = name
        self.startHour = startHour
        self.startMinute = startMinute
        self.endHour = endHour
        self.endMinute = endMinute
        self.weekdays = weekdays
        self.isEnabled = isEnabled
        self.selectionData = (try? JSONEncoder().encode(selection)) ?? Data()
    }

    var selection: FamilyActivitySelection {
        get { (try? JSONDecoder().decode(FamilyActivitySelection.self, from: selectionData)) ?? FamilyActivitySelection() }
        set { selectionData = (try? JSONEncoder().encode(newValue)) ?? Data() }
    }

    static func blank() -> FocusSchedule {
        FocusSchedule(name: "", startHour: 9, startMinute: 0, endHour: 17, endMinute: 0, weekdays: [2, 3, 4, 5, 6])
    }

    var timeRangeDescription: String {
        String(format: "%02d:%02d\u{2013}%02d:%02d", startHour, startMinute, endHour, endMinute)
    }

    var weekdaysDescription: String {
        if weekdays.count == 7 { return "Every day" }
        let symbols = Calendar.current.shortWeekdaySymbols
        return weekdays.sorted().compactMap { $0 >= 1 && $0 <= 7 ? symbols[$0 - 1] : nil }.joined(separator: ", ")
    }
}

/// Shared App Group storage so both the main app and the DeviceActivityMonitor
/// extension (a separate process) can read/write the same schedule list.
final class ScheduleStore: ObservableObject {
    static let appGroupID = "group.com.focusblock.shared"
    static let storageKey = "schedules"

    @Published var schedules: [FocusSchedule] = []

    private var defaults: UserDefaults? { UserDefaults(suiteName: Self.appGroupID) }

    init() { load() }

    func load() {
        guard let data = defaults?.data(forKey: Self.storageKey),
              let decoded = try? JSONDecoder().decode([FocusSchedule].self, from: data) else {
            schedules = []
            return
        }
        schedules = decoded
    }

    func save() {
        guard let data = try? JSONEncoder().encode(schedules) else { return }
        defaults?.set(data, forKey: Self.storageKey)
    }

    func add(_ schedule: FocusSchedule) {
        schedules.append(schedule)
        save()
    }

    func update(_ schedule: FocusSchedule) {
        guard let idx = schedules.firstIndex(where: { $0.id == schedule.id }) else { return }
        schedules[idx] = schedule
        save()
    }

    func delete(at offsets: IndexSet) {
        schedules.remove(atOffsets: offsets)
        save()
    }

    /// Read-only lookup used by the extension process, which has its own
    /// ScheduleStore instance (separate process, same App Group container).
    static func loadStatic() -> [FocusSchedule] {
        guard let data = UserDefaults(suiteName: appGroupID)?.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([FocusSchedule].self, from: data) else {
            return []
        }
        return decoded
    }
}

/// Turns `FocusSchedule` objects into registered `DeviceActivityCenter` monitors.
/// One schedule expands into one activity per selected weekday because
/// `DeviceActivitySchedule` doesn't support multi-weekday filtering directly.
enum ScheduleScheduler {
    static let center = DeviceActivityCenter()
    private static let weekdaySeparator = "_wd"

    static func activityName(for schedule: FocusSchedule, weekday: Int) -> DeviceActivityName {
        DeviceActivityName("\(schedule.id.uuidString)\(weekdaySeparator)\(weekday)")
    }

    /// Extracts the schedule UUID from an activity name produced by `activityName(for:weekday:)`.
    static func scheduleID(from activity: DeviceActivityName) -> UUID? {
        let raw = activity.rawValue
        guard let range = raw.range(of: weekdaySeparator) else { return nil }
        return UUID(uuidString: String(raw[raw.startIndex..<range.lowerBound]))
    }

    /// Re-syncs every registered activity to match the current schedule list.
    /// Call this after any add/update/delete so stale monitors don't linger.
    static func apply(_ schedules: [FocusSchedule]) {
        center.stopMonitoring()

        for schedule in schedules where schedule.isEnabled {
            for weekday in schedule.weekdays {
                let start = DateComponents(hour: schedule.startHour, minute: schedule.startMinute, weekday: weekday)
                let end = DateComponents(hour: schedule.endHour, minute: schedule.endMinute, weekday: weekday)
                let activitySchedule = DeviceActivitySchedule(intervalStart: start, intervalEnd: end, repeats: true)
                do {
                    try center.startMonitoring(activityName(for: schedule, weekday: weekday), during: activitySchedule)
                } catch {
                    print("FocusBlock: failed to start monitoring \(schedule.name) (weekday \(weekday)): \(error)")
                }
            }
        }
    }
}
