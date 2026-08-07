import SwiftUI

@main
struct FocusBlockApp: App {
    @StateObject private var scheduleStore = ScheduleStore()
    @StateObject private var authManager = AuthorizationManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(scheduleStore)
                .environmentObject(authManager)
                .onAppear { authManager.refreshStatus() }
        }
    }
}
