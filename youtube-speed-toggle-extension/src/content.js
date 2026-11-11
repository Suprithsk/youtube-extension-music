// Music videos are pinned here and the shortcut can't change them.
const MUSIC_RATE = 1;
// Everything else starts at the last value the shortcut cycled to.
const NON_MUSIC_CYCLE = [1, 1.25, 1.5];
let nonMusicRate = 1.5;

const settingsReady = new Promise((resolve) => {
    chrome.storage.local.get({ nonMusicRate: 1.5 }, (data) => {
        if (NON_MUSIC_CYCLE.includes(data.nonMusicRate)) nonMusicRate = data.nonMusicRate;
        resolve();
    });
});

// Category of the video currently on screen, once detection has finished.
let currentCategory = null;

// Each in-page navigation bumps this. Async work carries the token it started
// with and bails out if the user has moved on to another video since.
let navToken = 0;
// While enforcing, YouTube's own reset to 1x is undone. Once the window
// expires, manual speed changes from YouTube's menu are left alone.
let enforcedRate = null;
let enforceUntil = 0;

const categoryCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getVideo = () => document.querySelector('video');
const getVideoId = () => new URLSearchParams(location.search).get('v');
const isWatchPage = () => location.pathname === '/watch' && !!getVideoId();

// --- category detection -----------------------------------------------------

// YouTube renders schema.org microdata on the watch page holding the
// uploader-selected category. It carries the video id too, so a leftover block
// from the previous video can be told apart from current data.
const categoryFromMicrodata = (videoId) => {
    const scope = document.querySelector('[itemscope][itemtype*="VideoObject"]');
    if (!scope) return null;

    const id = scope.querySelector('meta[itemprop="identifier"]')?.content;
    if (id !== videoId) return null;

    return scope.querySelector('meta[itemprop="genre"]')?.content || null;
};

// Fallback for when the microdata is missing or stale: read the category out
// of the watch page itself. The category sits around 60% into the HTML, so the
// response is streamed and aborted at that point rather than read in full.
const categoryFromNetwork = async (videoId) => {
    const controller = new AbortController();
    try {
        const response = await fetch(`/watch?v=${encodeURIComponent(videoId)}`, {
            signal: controller.signal,
        });
        if (!response.ok || !response.body) return null;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let scanned = 0;

        for (;;) {
            const { done, value } = await reader.read();
            if (done) return null;

            buffer += decoder.decode(value, { stream: true });
            scanned += value.length;

            const match = buffer.match(/"category":"((?:[^"\\]|\\.)*)"/);
            if (match) {
                controller.abort();
                // Category arrives JSON-escaped, e.g. "Film & Animation"
                return JSON.parse(`"${match[1]}"`);
            }

            if (scanned > 4_000_000) return null;
            // Keep a tail so a match spanning two chunks is still found
            buffer = buffer.slice(-2000);
        }
    } catch {
        return null; // aborted, offline, or blocked — fall back to the default
    }
};

const resolveCategory = async (videoId, token) => {
    if (categoryCache.has(videoId)) return categoryCache.get(videoId);

    // The microdata is usually there on load but may lag behind an in-page
    // navigation, so give it a moment before paying for a network read.
    for (let attempt = 0; attempt < 6; attempt++) {
        const category = categoryFromMicrodata(videoId);
        if (category) {
            rememberCategory(videoId, category);
            return category;
        }
        await sleep(250);
        if (token !== navToken) return null;
    }

    const category = await categoryFromNetwork(videoId);
    if (token !== navToken) return null;
    if (category) rememberCategory(videoId, category);
    return category;
};

const rememberCategory = (videoId, category) => {
    if (categoryCache.size > 100) {
        categoryCache.delete(categoryCache.keys().next().value);
    }
    categoryCache.set(videoId, category);
};

// --- speed badge ------------------------------------------------------------

// Returns null before <body> exists, since this runs at document_start.
const ensureBadge = () => {
    let badge = document.getElementById('yt-speed-toggle-indicator');
    if (!badge) {
        if (!document.body) return null;
        badge = document.createElement('div');
        badge.id = 'yt-speed-toggle-indicator';
        document.body.appendChild(badge);
    }
    if (!badge._label) {
        // Separate spans so the category text can collapse on its own, and so
        // the detected name is set as text rather than parsed as markup.
        badge._label = document.createElement('span');
        badge._label.className = 'yt-speed-label';
        badge._rate = document.createElement('span');
        badge._rate.className = 'yt-speed-rate';
        badge.append(badge._label, badge._rate);
    }
    return badge;
};

const describeCategory = (category) => {
    if (!category || category === 'unknown') return 'Category unknown';
    if (category === 'Music') return 'Music video detected';
    return `${category} detected`;
};

const updateBadge = ({ category = null, pulse = false } = {}) => {
    const badge = ensureBadge();
    if (!badge) return;

    // Remember the label even if the video element isn't ready yet
    if (category) badge._labelText = describeCategory(category);

    const video = getVideo();
    if (!video || !isWatchPage()) {
        badge.classList.remove('visible');
        return;
    }

    badge._label.textContent = badge._labelText || '';
    badge._rate.textContent = `${video.playbackRate}x`;
    badge.classList.add('visible');

    if (pulse) {
        badge.classList.add('pulse');
        clearTimeout(badge._pulseTimer);
        badge._pulseTimer = setTimeout(() => badge.classList.remove('pulse'), 600);
    }
};

// --- applying the speed -----------------------------------------------------

// The video element may not exist yet after a navigation, and YouTube resets
// the rate to 1x once it loads, so keep re-asserting for a few seconds.
const enforceRate = async (rate, token) => {
    enforcedRate = rate;
    enforceUntil = Date.now() + 4000;

    for (let attempt = 0; attempt < 20; attempt++) {
        if (token !== navToken) return;

        const video = getVideo();
        if (video) {
            if (video.playbackRate !== rate) video.playbackRate = rate;
            updateBadge();
        }
        await sleep(200);
    }
};

const applyForCurrentVideo = async () => {
    const token = ++navToken;
    enforcedRate = null;
    currentCategory = null;

    if (!isWatchPage()) {
        updateBadge();
        return;
    }

    await settingsReady;
    const videoId = getVideoId();
    const category = await resolveCategory(videoId, token);
    if (token !== navToken) return;

    currentCategory = category;
    const rate = category === 'Music' ? MUSIC_RATE : nonMusicRate;
    updateBadge({ category: category || 'unknown' });
    await enforceRate(rate, token);
};

// Ctrl+Shift+S: step to the next speed for non-music videos and remember it
// for the ones that follow. Music videos stay at 1x.
const cycleSpeed = () => {
    const video = getVideo();
    if (!video || !isWatchPage()) return;

    if (currentCategory === 'Music') {
        updateBadge({ pulse: true }); // acknowledge the press, but stay at 1x
        return;
    }

    const next = (NON_MUSIC_CYCLE.indexOf(nonMusicRate) + 1) % NON_MUSIC_CYCLE.length;
    nonMusicRate = NON_MUSIC_CYCLE[next];
    chrome.storage.local.set({ nonMusicRate });

    // Keep the enforce window in step, so it doesn't undo this change
    if (enforcedRate !== null) enforcedRate = nonMusicRate;
    video.playbackRate = nonMusicRate;
    updateBadge({ pulse: true });
};

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'cycleSpeed') cycleSpeed();
});

// Media events don't bubble, so listen in the capture phase at document level.
document.addEventListener('ratechange', () => {
    const video = getVideo();
    if (!video) return;

    if (enforcedRate !== null && Date.now() < enforceUntil && video.playbackRate !== enforcedRate) {
        video.playbackRate = enforcedRate; // YouTube's post-navigation reset
        return;
    }

    updateBadge({ pulse: true }); // a manual change from YouTube's menu
}, true);

// YouTube is a single-page app: yt-navigate-finish fires on in-page
// navigation, and the URL poll is a fallback in case it doesn't.
window.addEventListener('yt-navigate-finish', () => applyForCurrentVideo());

let lastUrl = location.href;
setInterval(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        applyForCurrentVideo();
    }
}, 500);

applyForCurrentVideo();

// --- privacy blur -----------------------------------------------------------

// Blur whenever this window isn't the one you're using (another app, another
// tab, or Chrome's address bar). Set to false to blur only during a Teams share.
const BLUR_ON_FOCUS_LOSS = true;
// Mute while a Teams share is running, so "Include sound" doesn't broadcast it.
const MUTE_WHILE_SHARING = true;

let teamsSharing = false;
let windowUnfocused = false;
// Set by the shortcut or a click on the overlay; overrides the automatic state
// until that state next changes.
let manualBlur = null;
let mutedForShare = false;

const autoBlur = () => teamsSharing || windowUnfocused;

// documentElement exists at document_start, so the overlay can go up before <body>.
const ensureOverlay = () => {
    let overlay = document.getElementById('yt-privacy-blur');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'yt-privacy-blur';
        overlay._hint = document.createElement('div');
        overlay._hint.className = 'yt-privacy-hint';
        overlay.append(overlay._hint);
        overlay.addEventListener('click', () => {
            manualBlur = false;
            renderBlur();
        });
    }
    return overlay;
};

const renderBlur = () => {
    const overlay = ensureOverlay();
    // A fullscreen player sits above everything else on the page, so the
    // overlay has to live inside it to cover it.
    const host = document.fullscreenElement || document.documentElement;
    if (overlay.parentNode !== host) host.appendChild(overlay);

    overlay._hint.textContent = teamsSharing
        ? 'Hidden while you share your screen. Click or press Ctrl+Shift+H to show.'
        : 'Hidden. Click to show.';
    overlay.classList.toggle('visible', manualBlur ?? autoBlur());
};

// Change an automatic input; a manual override only lasts until the automatic
// answer changes.
const setAuto = (change) => {
    const before = autoBlur();
    change();
    if (autoBlur() !== before) manualBlur = null;
    renderBlur();
};

const applyShareMute = () => {
    if (!MUTE_WHILE_SHARING) return;
    const video = getVideo();
    if (teamsSharing) {
        if (video && !video.muted) {
            video.muted = true;
            mutedForShare = true;
        }
    } else if (mutedForShare) {
        if (video) video.muted = false;
        mutedForShare = false;
    }
};

const setTeamsSharing = (sharing) => {
    if (sharing === teamsSharing) return;
    setAuto(() => { teamsSharing = sharing; });
    applyShareMute();
};

// document.hasFocus() stays true while focus is inside an embedded frame (like
// live chat), so that doesn't count as leaving. The poll catches focus leaving
// from inside such a frame, which fires no event on this window.
const checkFocus = () => {
    if (!BLUR_ON_FOCUS_LOSS) return;
    const unfocused = !document.hasFocus();
    if (unfocused !== windowUnfocused) setAuto(() => { windowUnfocused = unfocused; });
};
window.addEventListener('blur', () => setTimeout(checkFocus, 0));
window.addEventListener('focus', checkFocus);
document.addEventListener('visibilitychange', checkFocus);
setInterval(checkFocus, 500);

document.addEventListener('fullscreenchange', renderBlur);

// A new video during a share may come in unmuted
document.addEventListener('loadeddata', () => {
    if (teamsSharing) applyShareMute();
}, true);

// The background worker publishes share state and shortcut presses here.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session') return;
    if (changes.teamsSharing) setTeamsSharing(changes.teamsSharing.newValue === true);
    if (changes.blurToggleAt) {
        manualBlur = !(manualBlur ?? autoBlur());
        renderBlur();
    }
});

// Fails if the worker hasn't granted access yet this session; onChanged picks
// the state up once it does.
chrome.storage.session.get({ teamsSharing: false })
    .then((data) => setTeamsSharing(data.teamsSharing === true))
    .catch(() => {});

checkFocus();
renderBlur();
