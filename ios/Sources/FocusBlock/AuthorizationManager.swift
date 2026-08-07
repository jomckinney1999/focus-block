import FamilyControls
import Combine

@MainActor
final class AuthorizationManager: ObservableObject {
    @Published var isAuthorized = false

    private let center = AuthorizationCenter.shared

    func requestAuthorization() async {
        do {
            try await center.requestAuthorization(for: .individual)
        } catch {
            print("FocusBlock: authorization request failed: \(error)")
        }
        refreshStatus()
    }

    func refreshStatus() {
        isAuthorized = center.authorizationStatus == .approved
    }
}
