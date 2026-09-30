// ── COMMIT THIS FILE. Copy it to config.js and put real keys there instead. ──
// config.js is gitignored on purpose — never paste real keys into this file.

const CONFIG = {
  // Required. Google AI Studio -> "Get API key". Free tier is enough for a demo.
  GEMINI_API_KEY: "PASTE_YOUR_GEMINI_API_KEY_HERE",
  GEMINI_MODEL: "gemini-3.6-flash",

  // Optional. Firebase Realtime Database config - enables a map shared across
  // everyone's reports instead of just your own browser. See README.
  FIREBASE_CONFIG: null,
  /* Example:
  FIREBASE_CONFIG: {
    apiKey: "...",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.firebaseio.com",
    projectId: "your-project",
  },
  */

  // Optional. Set true + provide a standard Google Cloud API key (with the
  // Text-to-Speech API enabled) to get guaranteed, natural multilingual audio
  // instead of relying on whatever voices happen to be installed in the
  // browser. Requires a GCP project with billing enabled (free tier covers a
  // demo easily - see README "Cloud Text-to-Speech" section).
  USE_CLOUD_TTS: false,
  GOOGLE_CLOUD_API_KEY: "PASTE_A_GCP_API_KEY_HERE_IF_USE_CLOUD_TTS_IS_TRUE",
};