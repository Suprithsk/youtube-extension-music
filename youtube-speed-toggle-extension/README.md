# YouTube Auto Speed

A Chrome extension that sets YouTube playback speed automatically: **music videos play at 1x, everything else at 1.5x**. It applies the right speed to every video you open, and **Ctrl+Shift+S** cycles the speed for non-music videos.

## Features

- Detects the video's category and picks the speed for you.
- **Ctrl+Shift+S** cycles non-music videos through **1x → 1.25x → 1.5x**. Your choice is remembered and used for the non-music videos that follow.
- Music videos are pinned at 1x and ignore the shortcut.
- Re-applies the speed when you move to the next video (YouTube resets it otherwise).
- A small badge at the top of the page shows what was detected and the speed in use — `Music video detected 1x`, `Education detected 1.5x` — and stays visible while you watch.
- Manual speed changes from YouTube's own menu are respected — the extension stops interfering a few seconds after the video loads.
- **Privacy blur:** YouTube is blurred and muted while you share your screen in Teams on the web, and blurred whenever you switch to another app or tab. See [Privacy blur](#privacy-blur).

## Installation

1. Download or clone the repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" by toggling the switch in the top right corner.
4. Click "Load unpacked" and select the `youtube-speed-toggle-extension` directory.
5. Open (or refresh) a YouTube tab.

To remap the shortcut, go to `chrome://extensions/shortcuts`.

## How detection works

The speed is chosen from the video's **category** — the one the uploader picked, the same value the YouTube Data API reports. Category `Music` gets 1x; every other category gets whatever the shortcut last cycled to (1.5x by default).

The category is read in two ways, in order:

1. **Page microdata** — YouTube renders a `schema.org/VideoObject` block containing `<meta itemprop="genre">`. It also contains the video ID, which is checked against the current URL so a leftover block from the previous video is never trusted.
2. **Network fallback** — if the microdata is missing or stale, the watch page is re-read and the category extracted from it. The response is streamed and cut off once the category is found, so the whole page isn't downloaded.

If both fail, the video gets the default 1.5x.

### Known limitations

- It uses the **uploader's** category, not an analysis of the content. A song uploaded under "Entertainment" will get 1.5x, and a music interview or documentary tagged "Music" will get 1x.
- Only `/watch` pages are touched. Shorts and embeds are left alone.
- To change the speeds, edit `MUSIC_RATE` and `NON_MUSIC_CYCLE` at the top of `src/content.js`.

## Privacy blur

The whole YouTube page fades behind a heavy blur when:

- **You share your screen in Teams** (in Chrome: `teams.cloud.microsoft`, `teams.microsoft.com`, `teams.live.com`). Every open YouTube tab blurs as soon as the share starts and clears when it stops, whether you stop it from Teams or from Chrome's "Stop sharing" bar. YouTube is also **muted** during the share, so "Include sound" doesn't broadcast your music, and unmuted afterwards.
- **The YouTube window loses focus**: you switch to another app or tab, or click Chrome's address bar.

To show the page anyway, click the blur or press **Ctrl+Shift+H**. The same shortcut blurs the page on demand. A manual choice lasts until the automatic state next changes (for example, the share ends).

Options at the top of the privacy section in `src/content.js`:

- `BLUR_ON_FOCUS_LOSS = false` to blur only during Teams shares (useful if YouTube sits on a second monitor).
- `MUTE_WHILE_SHARING = false` to keep the sound on.

**How the share is detected:** a small script on the Teams page wraps the browser's screen-capture call (`getDisplayMedia`) and watches the captured tracks to see when the share ends. It only reports "sharing" or "not sharing" to the extension. Shares from the Teams desktop app, or other meeting tools, aren't detected, though focus-loss blur usually covers those.

## Development

- `src/content.js` — category detection, speed logic, and the shortcut cycle.
- `src/background.js` — service worker that relays the keyboard shortcuts and tracks Teams share state.
- `src/teams-hook.js` / `src/teams-relay.js` — detect screen sharing on Teams pages and report it.
- `src/styles.css` — the speed badge and the privacy blur.
- `manifest.json` — extension configuration.
- `icons/` — extension icons.

## License

This project is licensed under the MIT License.
