// Runs inside the Teams page itself (MAIN world), since screen capture is only
// visible there. Wraps getDisplayMedia to learn when a share starts, and
// watches the captured tracks to learn when it stops. The result is posted to
// teams-relay.js, which runs in the extension's world and can talk to it.
(() => {
    const proto = window.MediaDevices && MediaDevices.prototype;
    if (!proto || typeof proto.getDisplayMedia !== 'function' || proto.getDisplayMedia.__ytBlur) return;

    // Video tracks of every share this page has started and not yet ended.
    const live = new Set();
    let reported = false;
    let poll = null;

    const report = () => {
        for (const track of live) {
            if (track.readyState === 'ended') live.delete(track);
        }
        const sharing = live.size > 0;
        if (!sharing && poll) {
            clearInterval(poll);
            poll = null;
        }
        if (sharing !== reported) {
            reported = sharing;
            // Only a boolean is sent; the relay checks the message came from this window.
            window.postMessage({ __ytBlurShare: true, sharing }, '*');
        }
    };

    const track = (t) => {
        live.add(t);
        // 'ended' covers Chrome's own "Stop sharing" bar
        t.addEventListener('ended', report);
        // The poll covers anything the hooks below miss
        if (!poll) poll = setInterval(report, 1000);
    };

    const originalGetDisplayMedia = proto.getDisplayMedia;
    const getDisplayMedia = function (...args) {
        return originalGetDisplayMedia.apply(this, args).then((stream) => {
            stream.getVideoTracks().forEach(track);
            report();
            return stream;
        });
    };
    getDisplayMedia.__ytBlur = true;
    proto.getDisplayMedia = getDisplayMedia;

    // Teams stopping the share itself calls stop(), which doesn't fire 'ended'.
    const originalStop = MediaStreamTrack.prototype.stop;
    MediaStreamTrack.prototype.stop = function (...args) {
        const result = originalStop.apply(this, args);
        if (live.has(this)) report();
        return result;
    };

    // A clone keeps the share going after the original is stopped, so follow clones too.
    const originalTrackClone = MediaStreamTrack.prototype.clone;
    MediaStreamTrack.prototype.clone = function (...args) {
        const copy = originalTrackClone.apply(this, args);
        if (live.has(this)) track(copy);
        return copy;
    };

    const originalStreamClone = MediaStream.prototype.clone;
    MediaStream.prototype.clone = function (...args) {
        const copy = originalStreamClone.apply(this, args);
        if (this.getVideoTracks().some((t) => live.has(t))) copy.getVideoTracks().forEach(track);
        return copy;
    };
})();
