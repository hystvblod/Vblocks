# VBlocks

VBlocks is a browser-based block game. The project can be packaged as a mobile app using Capacitor.

## Capacitor usage

All initialization scripts listen for the `deviceready` event so they run correctly when the app is built with Capacitor. No additional plugins are required; the default Capacitor runtime handles the event.

### Basic steps

1. Install dependencies and initialize Capacitor:
   ```bash
   npm install @capacitor/core @capacitor/cli
   npx cap init vblocks com.example.vblocks
   ```
2. Add a platform (e.g. Android):
   ```bash
   npx cap add android
   ```
3. Build the web assets and copy them:
   ```bash
   npx cap copy
   ```
4. Open the native project:
   ```bash
   npx cap open android
   ```

Make sure all assets (images, sounds, fonts) are stored locally since external URLs are avoided.
