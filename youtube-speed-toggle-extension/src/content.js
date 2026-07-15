let desiredSpeed = 1;
// After a navigation, YouTube resets the video to 1x. Any rate change that
// happens before this timestamp is treated as that reset and corrected back
// to desiredSpeed instead of being saved as a user choice.
let restoreUntil = 0;

const getVideo = () => document.querySelector('video');

const ensureIndicator = () => {
    let indicator = document.getElementById('yt-speed-toggle-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'yt-speed-toggle-indicator';
        document.body.appendChild(indicator);
    }
    return indicator;
};

const updateIndicator = ({ pulse = false } = {}) => {
    const indicator = ensureIndicator();
    const video = getVideo();

    // Only show the badge on watch pages with an actual video
    if (!video || !location.pathname.startsWith('/watch')) {
        indicator.classList.remove('visible');
        return;
    }

    indicator.textContent = `${video.playbackRate}x`;
    indicator.classList.add('visible');

    if (pulse) {
        indicator.classList.add('pulse');
        clearTimeout(indicator._pulseTimer);
        indicator._pulseTimer = setTimeout(() => indicator.classList.remove('pulse'), 600);
    }
};

const saveSpeed = (rate) => {
    desiredSpeed = rate;
    chrome.storage.local.set({ desiredSpeed: rate });
};

// The video element may not exist yet right after navigation, so retry
// for a few seconds until the speed sticks.
const applySpeedWithRetry = (attempt = 0) => {
    const video = getVideo();
    if (video && location.pathname.startsWith('/watch')) {
        if (video.playbackRate !== desiredSpeed) {
            video.playbackRate = desiredSpeed;
        }
        updateIndicator();
    }
    if (attempt < 10) {
        setTimeout(() => applySpeedWithRetry(attempt + 1), 300);
    }
};

const toggleSpeed = () => {
    const video = getVideo();
    if (!video) return;

    // Any non-1x speed goes back to 1x; from 1x, jump to 1.5x
    const newRate = video.playbackRate === 1 ? 1.5 : 1;
    saveSpeed(newRate);
    video.playbackRate = newRate;
};

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "toggleSpeed") {
        toggleSpeed();
    }
});

// Fires for any speed change: our toggle, YouTube's menu, or its reset on
// navigation. Media events don't bubble, so listen in the capture phase.
document.addEventListener('ratechange', () => {
    const video = getVideo();
    if (!video) return;

    if (Date.now() < restoreUntil && video.playbackRate !== desiredSpeed) {
        // YouTube's post-navigation reset: put the speed back
        video.playbackRate = desiredSpeed;
        return;
    }

    // A real change (shortcut or YouTube's speed menu): remember it
    if (video.playbackRate !== desiredSpeed) {
        saveSpeed(video.playbackRate);
    }
    updateIndicator({ pulse: true });
}, true);

const onNavigation = () => {
    restoreUntil = Date.now() + 3000;
    applySpeedWithRetry();
};

// YouTube is a single-page app: yt-navigate-finish fires on in-page
// navigation, and the URL poll below is a fallback in case it doesn't.
window.addEventListener('yt-navigate-finish', onNavigation);

let lastUrl = location.href;
setInterval(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        onNavigation();
    }
}, 500);

chrome.storage.local.get({ desiredSpeed: 1 }, (data) => {
    desiredSpeed = data.desiredSpeed;
    onNavigation();
});
