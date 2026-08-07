# Focus Block (native iOS)

A real native app using Apple's Family Controls / DeviceActivity / ManagedSettings frameworks — the same APIs Opal itself is built on. This gives you an actual hard block (not the soft Focus-Mode layer the PWA version used), with multiple named schedules, each with its own app/category selection, days, and time range.

Everything below is written assuming **you have no Mac.** Every step either runs in a browser, on Windows, or on a GitHub Actions cloud runner.

---

## 0. What you're building

- **FocusBlock** (main app) — SwiftUI. Request Screen Time permission, create/edit schedules (name, apps/categories via the system `FamilyActivityPicker`, time range, days of week), stored in an App Group so the extension can read them.
- **FocusBlockMonitor** (DeviceActivityMonitor extension) — a separate mini-process iOS launches automatically at each schedule's start/end time. It applies or clears the `ManagedSettingsStore` shield — this is the actual block.

There's no server, no App Store submission, no review. You build it, sign it with your own developer certificate, and install it directly on your own phone.

---

## 1. Apple accounts & approvals (do these first — they're the long pole)

1. **Enroll in the Apple Developer Program** — [developer.apple.com/programs](https://developer.apple.com/programs) — $99/year. Needed for the entitlement below and for a provisioning profile that doesn't expire every 7 days.
2. **Request the Family Controls entitlement** — [developer.apple.com/contact/request/family-controls-distribution](https://developer.apple.com/contact/request/family-controls-distribution). Do this as soon as your account is active. Turnaround is unpredictable (anywhere from days to a few weeks) — nothing below requires it to be approved yet *except* the final "enable Family Controls capability" step, so keep working through the rest while you wait.

---

## 2. Generate a signing certificate (Windows, via OpenSSL — no Keychain Access needed)

```bash
openssl genrsa -out ios_dev.key 2048
openssl req -new -key ios_dev.key -out CertificateSigningRequest.certSigningRequest \
  -subj "/emailAddress=you@example.com, CN=Your Name, C=US"
```

1. Go to **developer.apple.com → Certificates, Identifiers & Profiles → Certificates → +**.
2. Choose **Apple Development**, upload `CertificateSigningRequest.certSigningRequest`, download the resulting `.cer`.
3. Convert it into a `.p12` (still on Windows):
   ```bash
   openssl x509 -in development.cer -inform DER -out development.pem -outform PEM
   openssl pkcs12 -export -legacy -inkey ios_dev.key -in development.pem \
     -out development.p12 -password pass:SOME_PASSWORD
   ```
   (`-legacy` avoids a PKCS12 compatibility issue between newer OpenSSL and Apple's tooling.)
4. Base64-encode it for GitHub Secrets:
   ```bash
   openssl base64 -in development.p12 -out development.p12.base64 -A
   ```

Keep `ios_dev.key`, `development.p12`, and the password somewhere safe (a password manager) — you'll need them again if you ever have to re-sign.

---

## 3. Register the app in the Developer Portal

Under **Certificates, Identifiers & Profiles**:

1. **Identifiers → App Groups → +** — create `group.com.focusblock.shared`.
2. **Identifiers → App IDs → +** — create two App IDs:
   - `com.focusblock.app` — enable **App Groups** (select the group above) and **Family Controls** (only selectable once your entitlement request from step 1 is approved)
   - `com.focusblock.app.monitor` — same two capabilities
3. **Profiles → +** — create two **iOS App Development** profiles, one per App ID above, both using the certificate from step 2 and your test device (add your iPhone under **Devices** first — its UDID is visible via Finder-equivalent tools on Windows like iTunes, or via Settings → General → About → tap the serial number a few times won't show UDID on-device, so use iTunes for Windows or a UDID-reading site with the phone plugged in over USB).
4. Name the profiles something memorable (e.g. `FocusBlock App Dev`, `FocusBlock Monitor Dev`) — you'll reference these exact names as GitHub Secrets. Download both `.mobileprovision` files and base64-encode them the same way as step 2.4.

---

## 4. Wire up GitHub Actions

In the `focus-block` repo → **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `APPLE_TEAM_ID` | Your 10-character Team ID (top-right of the Developer Portal) |
| `IOS_DIST_CERT_P12_BASE64` | Contents of `development.p12.base64` |
| `IOS_DIST_CERT_PASSWORD` | The password you set in step 2.3 |
| `IOS_APP_PROVISION_BASE64` | Base64 of the app's `.mobileprovision` |
| `IOS_MONITOR_PROVISION_BASE64` | Base64 of the monitor's `.mobileprovision` |
| `APP_PROFILE_NAME` | Exact name you gave the app's profile in step 3.4 |
| `MONITOR_PROFILE_NAME` | Exact name you gave the monitor's profile in step 3.4 |
| `KEYCHAIN_PASSWORD` | Any random string — only used transiently on the CI runner |

Then trigger a build: **Actions tab → Build iOS IPA → Run workflow.** It runs on a GitHub-hosted macOS runner — you never touch it directly, it's just a cloud build server, and it's free because this repo is public.

**Be ready to iterate.** I wrote this project without being able to compile it myself (no Mac, no Xcode, anywhere in this pipeline). The first build is the first real correctness check — bring back any error from the Actions log and I'll fix it forward. Common first-run issues are usually one of: a typo'd bundle ID/profile name mismatch, an Info.plist key XcodeGen didn't generate quite right, or a Swift API signature that shifted between iOS versions.

Once it succeeds, download the `.ipa` from the workflow run's **Artifacts** section.

---

## 5. Install it on your phone (Windows, no Mac)

Use **[Sideloadly](https://sideloadly.io/)** (Windows/Mac app, free):

1. Plug your iPhone in via USB (or connect over the same WiFi network).
2. Open Sideloadly, drag in the `.ipa`, sign in with your Apple ID, hit Start.
3. On your iPhone: **Settings → General → VPN & Device Management** → trust your developer certificate.

With a paid developer account and a manually-managed profile (what we set up above), the install is valid up to a year rather than the free-account 7-day limit — you shouldn't need to redo this often. When the profile does approach expiry, re-run the GitHub Actions build and reinstall via Sideloadly.

---

## 6. Using the app

1. Open Focus Block, tap **Grant Permission** — this is the system Screen Time authorization dialog, not anything this app controls.
2. Tap **+**, name a schedule (e.g. "Deep Work"), tap **Choose apps & categories** to pick what gets blocked, set a time range and days, save.
3. That's it — `DeviceActivityCenter` schedules the block natively; you don't need the app open for it to fire.

## Known risk areas (flagging honestly, not guaranteed correct on first try)

- **Multi-weekday scheduling**: `DeviceActivitySchedule` doesn't natively support "Mon/Wed/Fri only" — this project works around it by registering one `DeviceActivityName` per selected weekday (see `ScheduleScheduler` in `Sources/Shared/FocusSchedule.swift`). iOS caps the total number of monitored activities system-wide (historically around 20) — a handful of multi-day schedules will approach that ceiling.
- **`FamilyActivitySelection: Codable`**: assumed available (needed to persist app/category picks across the app↔extension App Group boundary). Verify this survives first compile.
- No custom shield screen (the block screen is iOS's stock one) and no usage-stats dashboard — both are realistic v2 additions once the core block is working.
