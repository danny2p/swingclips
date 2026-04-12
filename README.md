# SwingClips ⛳️

**SwingClips** is a free, **open-source**, golf swing analysis tool built for the modern golfer. No apps to install, no internet required, **it works completely offline.** Once you visit swing.garage.golf on your phone's browser, (or install locally as a PWA), no internet connection is required. Everything runs locally on your device—your videos are never uploaded to the cloud, ensuring your data is fully self-contained and private.

It transforms your mobile device into a swing recording and review station, automatically detecting ball impacts by sound and generating perfectly sliced clips for immediate feedback.

---

## 💡 How to Use

1. **Set Up:** Place your phone on a tripod or stand facing your swing path.
2. **Record:** Tap the Record button.
3. **Swing:** Hit as many balls as you like. Wait ~3 seconds between shots.
4. **Review:** Stop recording and wait for processing. Each swing will appear in your gallery with full analysis tools (Slow-mo, Drawing) ready to go.

---

## 🚀 Key Features

### 🎙️ Smart Acoustic Impact Detection
- **Auto-Slicing:** Uses high-precision audio transient analysis to detect the distinct sound of a ball impact. 
- **Hands-Free:** Just hit record and swing. The app automatically isolates each 4-second swing clip (2 seconds before and 2 seconds after impact).
- **High Sensitivity:** Fine-tuned to catch even quiet shots while filtering out background noise.

### 🎥 Advanced Video Review
- **Silky-Smooth Scrubbing:** Custom-engineered video engine (FFmpeg) re-encodes clips with frequent keyframes for a native-feeling, frame-by-frame review experience.
- **Slow-Motion Playback:** Toggle between normal speed and **0.25x speed** to analyze every detail of your tempo and form.
- **Telestrator (Drawing):** Draw directly on the screen with your finger to analyze swing planes, head movement, and alignment.

### 📱 Built for the Range
- **PWA Support:** Install SwingClips as a standalone app on your iPhone or Android device.
- **Native Sharing:** Use the built-in Share button to save swings directly to your **Photos/Gallery** or share them via text/social media.
- **Session Reporting:** Add notes to individual swings or the entire session, and export everything as a convenient ZIP archive.

---

## 🛠️ Technical Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **Video Engine:** `@ffmpeg/ffmpeg` (WASM-based processing)
- **Acoustic Detection:** Web Audio API for high-precision transient analysis
- **Persistence:** PWA / Service Workers for offline-capable performance
- **Icons:** Lucide React

---

## 🏃‍♂️ Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/danny2p/swingclips.git
   cd swingclips
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Access the app:**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** For audio/video features to work correctly, the app must be served over **HTTPS** (or localhost) due to browser security policies regarding camera and microphone access.

---

## 📄 License

MIT License - feel free to use and improve!
