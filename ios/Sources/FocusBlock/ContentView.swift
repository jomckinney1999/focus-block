import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authManager: AuthorizationManager

    var body: some View {
        Group {
            if authManager.isAuthorized {
                ScheduleListView()
            } else {
                AuthorizationPromptView()
            }
        }
    }
}

struct AuthorizationPromptView: View {
    @EnvironmentObject var authManager: AuthorizationManager

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Text("Focus Block")
                .font(.largeTitle.bold())
            Text("Needs Screen Time permission to block apps on your schedule. This only affects this phone.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 32)
            Button {
                Task { await authManager.requestAuthorization() }
            } label: {
                Text("Grant Permission")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 40)
            Spacer()
        }
    }
}
