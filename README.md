# The Fort Builder Chronicle

A Clash of Clans-inspired infinite stopwatch. It shows only **days, hours, minutes and seconds** elapsed since one fixed moment:

- **Start:** 30 October 2026, 04:29:10 AM, Bangladesh Standard Time (Asia/Dhaka, UTC+06:00)
- **Same instant in UTC:** 29 October 2026, 22:29:10 UTC (Unix epoch `1793312950`)
- **Message:** "I have my fort builder unlock in Clash of Clan."
- **Player tag:** `#GV20G9GJJ` (with a working copy button)

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, stopwatch, message plaque, player tag |
| `style.css` | Fortress scene, gold-and-stone frame, responsive layout, reduced-motion and low-power modes |
| `script.js` | Stopwatch engine, copy button, embers, service-worker registration |
| `sw.js`, `manifest.json`, `icon.svg`, `icon-192.png`, `icon-512.png` | Optional installable app and offline support |

No frameworks, no build step, no external requests.

## Run it locally

Open `index.html` in a browser. The stopwatch works straight from the file.

For the installable/offline version, serve the folder over HTTP (service workers do not run from `file://`):

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Host it on GitHub Pages

1. Create a new GitHub repository and upload every file in this folder to the repository root.
2. Open **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose the `main` branch and the `/ (root)` folder, then save.
4. After a minute or two the site is live at `https://<your-username>.github.io/<repository-name>/`.

All paths are relative, so it works from a repository sub-path without changes.

## How the time works

- The start instant is a constant in `script.js` (`START_EPOCH_MS`). It is never replaced by the current time, never stored in the browser, and never depends on the visitor's time zone.
- Every update calculates `now - start` from scratch and splits it into days, hours, minutes and seconds. Nothing is counted up one tick at a time.
- One timer wakes just after each whole second and is rescheduled every time. When the tab is hidden the timer stops; when the tab returns (visibility change, back/forward restore, window focus, reconnecting) the display is recalculated immediately.
- Days use BigInt arithmetic, so there is no 32-bit or 53-bit ceiling, no scientific notation and no digit limit. Six digits is only the minimum zero padding; longer numbers shrink to fit the frame instead of being cut off.
- If a device clock is set earlier than the start moment, the display rests at zero with a short note until the start moment arrives.

## Honest limits

- The time comes from the device clock. If someone changes that clock, the display follows it. No trusted network time source is used, so the stopwatch never depends on internet access.
- No software can promise literal infinity. The stopwatch has no programmed stopping point and keeps working for as long as a browser can run it.

## Accessibility and performance

- Reduced-motion preference turns off all animation and embers.
- Devices with 4 or fewer CPU cores, 2 GB or less memory, or Data Saver switched on get a lighter mode with fewer embers and no shimmer or glow animations.
- All decorative animation pauses while the tab is hidden.

## Offline support

The service worker uses a network-first strategy with a cache fallback, so updates arrive on the next load and the page still opens without a connection. A new worker takes over on the next full visit. The start timestamp lives in `script.js` and is never cached as separate data. To force an update after editing files, change `CACHE` in `sw.js` (for example `fort-chronicle-v2`).

## Tests that were run

- Unit tests of the time maths in Node: the start instant equals both `2026-10-29T22:29:10Z` and `2026-10-30T04:29:10+06:00`; boundaries at 0 s, 59 s, 1 min, 1 h, 23:59:59, 1 day; 366 days, 100 years, 999,999 days, 1,000,000 days and 123,456,789 days; results identical under four different system time zones; a 100,000-case random sweep checking hour, minute and second ranges and exact reconstruction.
- Headless Chromium 141: live ticking, reload without reset, instant catch-up after a simulated 3 day 5 hour clock jump, a 123,456,789-day count fitting inside the frame, no horizontal scroll at 320, 360, 390, 820 and 1440 px widths and in landscape, working copy button (clipboard contents verified), no console errors, no embers under reduced motion, service worker registered and the page reloading offline.

Not tested: real Android or iOS devices, real Safari or Firefox, and long-duration runs.
