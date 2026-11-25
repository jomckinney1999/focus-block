# Focus Block

> Also in this repo: **[Undercurrent](flow/)**, focus music for programmers that follows your typing. See `flow/README.md`.

A personal PWA dashboard for focus sessions — start/timer/streaks/history — sitting on top of iOS's own Screen Time and Focus Mode, which do the actual blocking. See the "How this actually works" section before you rely on it.

## How this actually works (read this first)

A web app cannot block or lock other apps on iOS — there's no API for that from a browser, by design. So this project is split into two independent layers:

1. **The lock — Screen Time Downtime.** This is the only thing on iOS that can actually stop you from opening an app. It's set up once in Settings and this PWA never touches it. See "Set up the real lock" below.
2. **The feel — this PWA.** A session timer, streak counter, and history, styled to feel like Opal. When you tap **Start Session**, it hands off to the Shortcuts app to flip on a custom Focus Mode (hides distracting Home Screen pages, silences notifications). That's a *soft* layer — one tap in Control Center can undo it. The hard stop is still Downtime.

Don't mistake the PWA's timer for a lock. It's a tracker that happens to also nudge Focus Mode on.

## One-time setup on your iPhone

### 1. Create a custom Focus Mode
`Settings → Focus → tap “+” → Custom`
- Name it (e.g. **Focus Block**), pick a color/icon.
- Under **Apps** / **People**: choose who/what can notify you (recommend: silence everything except calls).
- Under **Home Screen → Custom Screens**: choose which Home Screen pages stay *visible* during this Focus. Anything not visible is hidden.
  - This only works if your distracting apps live together on their own page(s) — worth spending 2 minutes dragging Instagram/TikTok/etc. onto one dedicated page now, so hiding that page hides all of them at once.

### 2. Build the two Shortcuts
Open the **Shortcuts** app → **+** (new shortcut).

**Shortcut 1 — name it exactly `Start Focus Session`**
- Add Action → search **Set Focus** → add it
- Configure: choose **Focus Block** (your Focus from step 1) → **Turn On**
- For the duration, either:
  - **Until Turned Off** (simplest — pairs with the "End Focus Mode" button the PWA shows you when your timer ends), or
  - **For [X] minutes** (the OS handles the countdown itself, even if you close everything — more reliable, but you have to manually keep this number in sync with what you pick in the PWA)

**Shortcut 2 — name it exactly `End Focus Session`**
- Add Action → **Set Focus** → **Focus Block** → **Turn Off**

The names must match **exactly** what's in the app's Settings screen (defaults to these two names — only change one if you rename the Shortcut).

### 3. Set up the real lock — Screen Time Downtime
`Settings → Screen Time → Downtime`
- Turn on, tap **Customize Days** to set your recurring focus hours per weekday.
- Add essentials (Phone, Maps) to **Always Allowed**.

`Settings → Screen Time → Use Screen Time Passcode`
- Set a passcode **different from your device passcode.**
- Don't memorize it — have someone else set it, or generate a random one you don't save anywhere handy. This is what makes it an actual lock instead of a suggestion.

(Optional) `Settings → Screen Time → Content & Privacy Restrictions → iTunes & App Store Purchases → Deleting Apps → Don't Allow` — closes the "just delete the app" loophole.

### 4. Install the PWA
1. Deploy this folder (see below), then open the URL in **Safari on your iPhone** (must be Safari, not Chrome — "Add to Home Screen" for full-screen PWA behavior only works from Safari).
2. Tap the Share icon → **Add to Home Screen**.
3. Open it from the Home Screen icon — it now runs full-screen, like a real app.
4. Tap the ⚙️ icon on Home and confirm the Start/End Shortcut names match what you built in step 2.

## Local preview (Windows, no Mac needed)

```
npx serve .
```

Then open the printed `http://localhost:...` URL in a desktop browser to check layout/logic. This won't let you test the `shortcuts://` deep link (that only resolves on-device), but everything else — timer, streaks, history, settings — works the same.

## Deploying (GitHub Pages)

Once pushed to GitHub with Pages enabled on this repo, your URL will be:
`https://<your-username>.github.io/<repo-name>/`

## Limitations, honestly

- The PWA **cannot** verify the Focus Mode actually turned on, or that Downtime is active — it just fires the deep link and trusts iOS.
- "End session early" in the app only stops the in-app timer. It does not, and cannot, turn off Downtime or Focus Mode — that's the point.
- Backgrounding Safari/the PWA pauses its JS timer; the countdown recalculates correctly from the stored start time next time you open it, so the numbers stay accurate even if the ring animation was frozen while you were away.
- No cross-device sync — history/streaks live in this phone's local browser storage only.

## Possible upgrades later

- Pass your chosen duration straight into the Shortcut via `shortcuts://run-shortcut?name=Start%20Focus%20Session&input=text&text=50`, and reference "Shortcut Input" inside the Set Focus action's duration field, so the two don't drift out of sync.
- Web Push notifications (iOS 16.4+ supports this for installed PWAs) for a "session complete" alert instead of relying on you reopening the app.
- A real native app (Family Controls framework) if you ever get a Mac + Apple Developer account — that's the only way to get a hard, app-level block instead of the Focus/Downtime combo this relies on.
