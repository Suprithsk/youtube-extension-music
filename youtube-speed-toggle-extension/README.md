# YouTube Speed Toggle Extension

This Chrome extension allows users to toggle the playback speed of YouTube videos between 1x and 1.5x using a keyboard shortcut.

## Features

- Toggle playback speed with a simple keyboard shortcut.
- Lightweight and easy to use.

## Installation

1. Download or clone the repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" by toggling the switch in the top right corner.
4. Click on "Load unpacked" and select the `youtube-speed-toggle-extension` directory.
5. The extension should now be installed and ready to use.

## Usage

- While watching a YouTube video, press **Ctrl+Shift+S** to toggle the playback speed:
  - At any speed other than 1x, it snaps back to 1x.
  - At 1x, it jumps to 1.5x.
- A small overlay in the top-right corner briefly shows the new speed.
- To change the shortcut, go to `chrome://extensions/shortcuts` and remap "Toggle playback speed between 1x and 1.5x".

## Development

- The extension consists of the following files:
  - `src/content.js`: Contains the logic for interacting with the YouTube player.
  - `src/background.js`: Manages background processes and keyboard shortcuts.
  - `src/styles.css`: Contains styles for the extension.
  - `manifest.json`: Configuration file for the Chrome extension.
  - Icons for the extension are located in the `icons` directory.

## License

This project is licensed under the MIT License.