document.addEventListener('keydown', function(event) {
    // Check if Ctrl + Shift + S is pressed
    console.log('Keydown event detected:', event);
    if (event.altKey && event.shiftKey && event.key === 'M') {
        console.log('Toggle speed shortcut detected');

        const video = document.querySelector('video');
        console.log('Video element found:', video);
        if (video) {
            // Toggle playback speed between 1x and 1.5x
            video.playbackRate = video.playbackRate === 1 ? 1.5 : 1;
        }
    }
});