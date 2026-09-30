// Bharat Krishi Vaani — core app logic
// Flow: language + state (chips) -> photo/voice -> Gemini multimodal call ->
// advisory in-language -> TTS + map pin. The whole interface (not just the
// advisory) is translated on the fly via Gemini, so a farmer never has to
// read a word of English to use it.

const LANGUAGES = [
  { code: "en", native: "English",   enName: "English",  speech: "en-IN" },
  { code: "hi", native: "हिन्दी",      enName: "Hindi",    speech: "hi-IN" },
  { code: "bn", native: "বাংলা",       enName: "Bengali",  speech: "bn-IN" },
  { code: "te", native: "తెలుగు",      enName: "Telugu",   speech: "te-IN" },
  { code: "mr", native: "मराठी",       enName: "Marathi",  speech: "mr-IN" },
  { code: "ta", native: "தமிழ்",       enName: "Tamil",    speech: "ta-IN" },
  { code: "gu", native: "ગુજરાતી",     enName: "Gujarati", speech: "gu-IN" },
  { code: "kn", native: "ಕನ್ನಡ",       enName: "Kannada",  speech: "kn-IN" },
  { code: "ml", native: "മലയാളം",      enName: "Malayalam",speech: "ml-IN" },
  { code: "pa", native: "ਪੰਜਾਬੀ",      enName: "Punjabi",  speech: "pa-IN" },
  { code: "or", native: "ଓଡ଼ିଆ",       enName: "Odia",     speech: "or-IN" },
  { code: "as", native: "অসমীয়া",     enName: "Assamese", speech: "as-IN" },
  { code: "ur", native: "اردو",        enName: "Urdu",     speech: "ur-IN" },
  { code: "pt", native: "Português",   enName: "Portuguese", speech: "pt-BR" },
];
// Covers the languages of ~95% of India's population, plus Portuguese as a
// proof-of-concept that the same architecture works beyond India — see
// Mato Grosso, Brazil in data/agro_context.json. Adding another one of the
// Eighth Schedule's 22 (Bodo, Dogri, Kashmiri, Maithili, Manipuri, Santali,
// Sindhi, Konkani, Nepali, Sanskrit) or a language for another BRICS nation
// is one line here — same shape.

// Master English UI copy. Every other language is produced by asking Gemini
// to translate this whole object once, then caching the result — so adding a
// language never means writing new translation files by hand.
const UI_STRINGS = {
  tagline: "Speak your field's problem. Get an answer in your language.",
  heroTitle: "Your crop has a question. Ask it out loud.",
  heroSub: "Show us the problem — by photo or by voice — and get back simple steps to fix it, spoken in your own language.",
  langHeading: "Choose your language",
  stateHeading: "Your state",
  showHeading: "Show us the problem",
  photoLabel: "Take or choose a photo",
  orLabel: "or",
  voiceLabel: "Speak your problem",
  submitBtn: "Get help",
  diagnosingBtn: "Working on it…",
  resultHeading: "Advisory",
  mapHeading: "Reports near you",
  mapSub: "Every report plotted here helps show where a problem is spreading — useful for you, and for anyone deciding where to send help.",
  listenBtn: "Listen",
  voiceListening: "Listening…",
  voiceGotIt: "Got it.",
  voiceRetry: "Didn't catch that — try again.",
  voiceUnsupported: "Voice input isn't supported in this browser.",
  locationGetting: "Getting your location…",
  locationOk: "Location captured — your report will help map problem hotspots nearby.",
  locationFail: "Location not available — your report will still work, it just won't appear on the map.",
  locationUnsupported: "Location isn't supported here — your report will still work, it just won't appear on the map.",
  storageShared: "Shared map — reports from everyone using this app appear below.",
  storageLocal: "Local demo mode — reports are only saved on this device.",
  alertMissingInput: "Add a photo or describe the problem by voice first.",
  alertMissingKey: "Setup needed — ask whoever built this app to add an API key.",
  alertLocationPendingConfirm: "Still getting your location — continue without it? Your report won't show on the map.",
  alertError: "Couldn't get an answer right now. Check your connection and try again.",
  levelLow: "Low",
  levelMedium: "Medium",
  levelHigh: "High",
  confidenceWord: "confidence",
  helplineIndia: "This looks serious or uncertain — for expert help, call the free Kisan Call Centre: 1800-180-1551 (every language, 6 AM–10 PM, every day) or visit your nearest Krishi Vigyan Kendra.",
  helplineGeneric: "This looks serious or uncertain — please also contact your local agricultural extension office for expert help.",
};

let agroContext = null;
let staticI18n = {};
let selectedPhotoBase64 = null;
let selectedPhotoMime = null;
let voiceTranscript = "";
let userLatLng = null;
let locationPending = true;
let map = null;
let markerLayer = null;
let firebaseReady = false;

let selectedLangCode = "en";
let selectedStateName = null;
let currentStrings = { ...UI_STRINGS };
let translating = false;

const $ = (id) => document.getElementById(id);
const t = (key) => currentStrings[key] || UI_STRINGS[key] || key;

// ---------- Setup ----------

async function init() {
  await Promise.all([loadAgroContext(), loadStaticI18n()]);
  renderStateChips();
  renderLangChips();
  applyStrings(UI_STRINGS); // baseline before any translation resolves
  setupPhotoInput();
  setupVoiceInput();
  setupSubmit();
  await initFirebase();
  await locateUser();
  initMap();
  renderStoredReportsOnMap();
}

// ---------- Interface translation (Gemini) ----------

async function loadStaticI18n() {
  try {
    const res = await fetch("data/i18n.json?v=2");
    staticI18n = await res.json();
  } catch (e) {
    console.warn("Could not load data/i18n.json — non-English languages will fall back to live Gemini translation.", e);
    staticI18n = {};
  }
}

const UI_SCHEMA = {
  type: "OBJECT",
  properties: Object.fromEntries(Object.keys(UI_STRINGS).map((k) => [k, { type: "STRING" }])),
  required: Object.keys(UI_STRINGS),
};

// Pre-generated translations (data/i18n.json) switch instantly and never
// depend on network/API availability — exactly what matters most when
// someone is switching languages live in front of you. Gemini is only asked
// to translate on the fly for a language you add later that isn't in that
// file yet, so growing past the shipped 13 never means writing a translation
// file by hand; it just means the very first person to pick that language
// waits a moment while it's generated, and everyone after them doesn't.
async function translateUI(langCode) {
  document.documentElement.dir = langCode === "ur" ? "rtl" : "ltr";

  if (langCode === "en") {
    currentStrings = { ...UI_STRINGS };
    applyStrings(currentStrings);
    return;
  }

  if (staticI18n[langCode]) {
    currentStrings = { ...UI_STRINGS, ...staticI18n[langCode] };
    applyStrings(currentStrings);
    return;
  }

  const cacheKey = `kv_i18n_v1_${langCode}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      currentStrings = JSON.parse(cached);
      applyStrings(currentStrings);
      return;
    } catch { /* fall through and re-fetch */ }
  }

  if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY.startsWith("PASTE_")) {
    console.warn("No Gemini key configured yet — interface will stay in English until one is added.");
    currentStrings = { ...UI_STRINGS };
    applyStrings(currentStrings);
    return;
  }

  const langObj = LANGUAGES.find((l) => l.code === langCode);
  translating = true;
  const statusEl = $("i18n-status");
  if (statusEl) { statusEl.hidden = false; statusEl.textContent = "…"; }

  try {
    const prompt = `Translate every value in this JSON object into ${langObj.enName}, ` +
      `written the way a small farmer in rural India would speak it — simple, warm, ` +
      `plain words, no jargon, similar length to the original. Keep the same keys. ` +
      `Source JSON:\n${JSON.stringify(UI_STRINGS)}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: UI_SCHEMA },
      }),
    });
    if (!res.ok) throw new Error(`UI translation error: ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const translated = JSON.parse(text);

    currentStrings = { ...UI_STRINGS, ...translated }; // fill any gaps with English
    localStorage.setItem(cacheKey, JSON.stringify(currentStrings));
    applyStrings(currentStrings);
  } catch (e) {
    console.error("UI translation failed, staying in English:", e);
    currentStrings = { ...UI_STRINGS };
    applyStrings(currentStrings);
  } finally {
    translating = false;
    if (statusEl) statusEl.hidden = true;
  }
}

let locationStatusKey = null;
let storageIsShared = false;

function applyStrings(strings) {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (strings[key]) el.textContent = strings[key];
  });
  renderStateChips(); // state names are localized too, not just static UI text
  refreshLiveStatusText();
}

// A few status lines update outside the normal render cycle (location, voice,
// storage mode) — re-apply the current language to whichever of them are
// already showing something, so switching languages mid-use doesn't leave
// stale English text sitting next to a freshly translated page.
function refreshLiveStatusText() {
  const submitBtn = $("submit-btn");
  if (submitBtn && !submitBtn.disabled) submitBtn.textContent = t("submitBtn");

  const locEl = $("location-note");
  if (locEl && locationStatusKey) locEl.textContent = t(locationStatusKey);

  const storeEl = $("storage-mode-note");
  if (storeEl) storeEl.textContent = t(storageIsShared ? "storageShared" : "storageLocal");
}

// ---------- Chips ----------

function renderLangChips() {
  const box = $("lang-chips");
  box.innerHTML = "";
  for (const lang of LANGUAGES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (lang.code === selectedLangCode ? " selected" : "");
    chip.textContent = lang.native;
    chip.addEventListener("click", () => selectLanguage(lang.code));
    box.appendChild(chip);
  }
}

let languageManuallySet = false;

function selectLanguage(code, opts = {}) {
  if (code === selectedLangCode || translating) return;
  if (!opts.auto) languageManuallySet = true;
  selectedLangCode = code;
  document.querySelectorAll("#lang-chips .chip").forEach((c, i) => {
    c.classList.toggle("selected", LANGUAGES[i].code === code);
  });
  translateUI(code);
}

function renderStateChips() {
  const box = $("state-chips");
  box.innerHTML = "";
  const states = agroContext.states.length ? agroContext.states : [{ state: "Not listed / Other", names: {} }];
  if (!selectedStateName) selectedStateName = states[0].state;
  for (const s of states) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (s.state === selectedStateName ? " selected" : "");
    const label = s.names?.[selectedLangCode] || s.names?.en || s.state;
    chip.textContent = s.country && s.country !== "India" ? `🌎 ${label}` : label;
    chip.dataset.stateId = s.state;
    chip.addEventListener("click", () => selectState(s.state));
    box.appendChild(chip);
  }
}

function selectState(name) {
  selectedStateName = name;
  document.querySelectorAll("#state-chips .chip").forEach((c) => {
    c.classList.toggle("selected", c.dataset.stateId === name);
  });
  // Reduce the number of taps needed: default the language to whatever this
  // state's grounding data lists first. This re-suggests on EVERY state
  // change, not just the first one — it only stops once the farmer has
  // manually picked a language chip themselves, since a deliberate choice
  // should stick, but an earlier auto-suggestion shouldn't block later ones.
  const stateData = agroContext.states.find((s) => s.state === name);
  const suggested = stateData?.languages?.find((code) => LANGUAGES.some((l) => l.code === code));
  if (suggested && !languageManuallySet) selectLanguage(suggested, { auto: true });
}

async function loadAgroContext() {
  try {
    const res = await fetch("data/agro_context.json?v=2");
    agroContext = await res.json();
  } catch (e) {
    console.warn("Could not load agro_context.json, continuing without grounding data.", e);
    agroContext = { states: [] };
  }
}

// ---------- Firebase (optional shared storage) ----------

function initFirebase() {
  if (!CONFIG.FIREBASE_CONFIG) {
    setStorageModeLabel(false);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const appScript = document.createElement("script");
    appScript.src = "https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js";
    appScript.onload = () => {
      const dbScript = document.createElement("script");
      dbScript.src = "https://www.gstatic.com/firebasejs/10.13.0/firebase-database-compat.js";
      dbScript.onload = () => {
        try {
          window.firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
          firebaseReady = true;
          setStorageModeLabel(true);
          subscribeToFirebaseReports();
        } catch (e) {
          console.error("Firebase init failed, falling back to local-only mode:", e);
          setStorageModeLabel(false);
        }
        resolve();
      };
      dbScript.onerror = () => { console.error("Failed to load Firebase database SDK."); setStorageModeLabel(false); resolve(); };
      document.head.appendChild(dbScript);
    };
    appScript.onerror = () => { console.error("Failed to load Firebase app SDK."); setStorageModeLabel(false); resolve(); };
    document.head.appendChild(appScript);
  });
}

function setStorageModeLabel(shared) {
  storageIsShared = shared;
  const el = $("storage-mode-note");
  if (!el) return;
  el.textContent = t(shared ? "storageShared" : "storageLocal");
}

function subscribeToFirebaseReports() {
  if (!window.firebase) return;
  window.firebase.database().ref("reports").on("child_added", (snap) => {
    const r = snap.val();
    addToDashboard(r); // every report counts toward the aggregate, map pin or not
    if (r.lat != null && r.lng != null) plotReport(r);
  });
}

// ---------- Photo ----------

function setupPhotoInput() {
  $("photo-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const { base64, mime } = await compressImage(file);
    selectedPhotoMime = mime;
    selectedPhotoBase64 = base64;
    $("photo-preview-img").src = `data:${mime};base64,${base64}`;
    $("photo-preview").hidden = false;
  });
}

// Phone camera photos can be 5-8MB — resize to a max dimension and re-encode
// as JPEG before sending, so uploads stay fast on rural connections and well
// under the API's request-size limits.
function compressImage(file, maxDim = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve({ base64: dataUrl.split(",")[1], mime: "image/jpeg" });
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Voice input (Web Speech API — browser-native, no key needed) ----------

function setupVoiceInput() {
  const btn = $("voice-btn");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btn.disabled = true;
    $("voice-status").textContent = t("voiceUnsupported");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;

  btn.addEventListener("click", () => {
    const langObj = LANGUAGES.find((l) => l.code === selectedLangCode);
    recognition.lang = langObj ? langObj.speech : "en-IN";
    btn.classList.add("recording");
    $("voice-status").textContent = t("voiceListening");
    recognition.start();
  });

  recognition.onresult = (event) => {
    voiceTranscript = event.results[0][0].transcript;
    $("voice-transcript").textContent = voiceTranscript;
    $("voice-status").textContent = t("voiceGotIt");
    btn.classList.remove("recording");
  };
  recognition.onerror = () => {
    $("voice-status").textContent = t("voiceRetry");
    btn.classList.remove("recording");
  };
  recognition.onend = () => btn.classList.remove("recording");
}

// ---------- Location ----------

async function locateUser() {
  locationStatusKey = "locationGetting";
  $("location-note").textContent = t(locationStatusKey);
  if (!navigator.geolocation) {
    locationPending = false;
    locationStatusKey = "locationUnsupported";
    $("location-note").textContent = t(locationStatusKey);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      locationPending = false;
      locationStatusKey = "locationOk";
      $("location-note").textContent = t(locationStatusKey);
    },
    () => {
      locationPending = false;
      locationStatusKey = "locationFail";
      $("location-note").textContent = t(locationStatusKey);
    },
    { timeout: 6000 }
  );
}

// ---------- Submit -> Gemini ----------

function setupSubmit() {
  $("submit-btn").addEventListener("click", handleSubmit);
}

async function handleSubmit() {
  const btn = $("submit-btn");
  if (!selectedPhotoBase64 && !voiceTranscript) {
    alert(t("alertMissingInput"));
    return;
  }
  if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY.startsWith("PASTE_")) {
    alert(t("alertMissingKey"));
    return;
  }
  if (locationPending) {
    const proceed = confirm(t("alertLocationPendingConfirm"));
    if (!proceed) return;
  }

  btn.disabled = true;
  btn.textContent = t("diagnosingBtn");

  try {
    const result = await callGemini();
    renderResult(result);
    saveReport(result); // also plots the marker (locally, or via the Firebase listener when shared)
  } catch (err) {
    console.error(err);
    alert(t("alertError"));
  } finally {
    btn.disabled = false;
    btn.textContent = t("submitBtn");
  }
}

function buildPrompt() {
  const langObj = LANGUAGES.find((l) => l.code === selectedLangCode);
  const stateData = agroContext.states.find((s) => s.state === selectedStateName);
  const country = stateData?.country || "India";

  const groundingBlock = stateData
    ? `Known common issues for ${selectedStateName}, ${country} this season (${stateData.season}): ${JSON.stringify(stateData.common_issues)}`
    : "No local grounding data available for this region — reason from general agronomy knowledge.";

  return `You are an agricultural extension officer AI helping a small or marginal farmer in ${country}.

Region: ${selectedStateName}, ${country}
${voiceTranscript ? `Farmer's spoken description: "${voiceTranscript}"` : "No spoken description given — diagnose from the photo alone."}

${groundingBlock}

Write the crop name, diagnosis, and advisory fields in ${langObj.enName} (${langObj.native}) —
the farmer should not need to read any English. If the photo/description
genuinely isn't enough to tell, say so plainly in the diagnosis field rather
than guessing.`;
}

// Ask Gemini for a fixed JSON shape directly (responseSchema) instead of just
// asking nicely in the prompt — this can't be broken by a stray sentence or a
// markdown fence, unlike parsing free-form text.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    crop: { type: "STRING" },
    diagnosis: { type: "STRING" },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    urgency: { type: "STRING", enum: ["low", "medium", "high"] },
    advisory: { type: "STRING" },
  },
  required: ["crop", "diagnosis", "confidence", "urgency", "advisory"],
};

const VALID_LEVELS = ["low", "medium", "high"];

function normalizeResult(raw) {
  const norm = (val, fallback) => {
    const v = String(val || "").toLowerCase().trim();
    return VALID_LEVELS.includes(v) ? v : fallback;
  };
  return {
    crop: raw.crop || "—",
    diagnosis: raw.diagnosis || "—",
    confidence: norm(raw.confidence, "low"),
    urgency: norm(raw.urgency, "medium"),
    advisory: raw.advisory || t("alertError"),
  };
}

async function callGemini() {
  const prompt = buildPrompt();
  const parts = [{ text: prompt }];
  if (selectedPhotoBase64) {
    parts.push({ inline_data: { mime_type: selectedPhotoMime, data: selectedPhotoBase64 } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned non-JSON output: ${text.slice(0, 200)}`);
  }
  return normalizeResult(parsed);
}

// ---------- Result rendering + TTS ----------

function levelLabel(level) {
  return { low: t("levelLow"), medium: t("levelMedium"), high: t("levelHigh") }[level] || level;
}

function renderResult(result) {
  const panel = $("result-panel");
  const card = $("result-card");
  panel.hidden = false;

  const needsHumanExpert = result.urgency === "high" || result.confidence === "low";
  let helplineHtml = "";
  if (needsHumanExpert) {
    const stateData = agroContext.states.find((s) => s.state === selectedStateName);
    const isIndia = !stateData || stateData.country === "India";
    helplineHtml = `<p class="helpline-note">📞 ${escapeHtml(t(isIndia ? "helplineIndia" : "helplineGeneric"))}</p>`;
  }

  card.innerHTML = `
    <div class="crop-line">${escapeHtml(result.crop)} — ${escapeHtml(result.diagnosis)}</div>
    <span class="urgency ${result.urgency}">${escapeHtml(levelLabel(result.urgency))} · ${escapeHtml(levelLabel(result.confidence))} ${escapeHtml(t("confidenceWord"))}</span>
    <p class="advisory-text">${escapeHtml(result.advisory)}</p>
    ${helplineHtml}
    <button type="button" class="btn listen-btn" id="listen-btn">🔊 ${escapeHtml(t("listenBtn"))}</button>
  `;

  $("listen-btn").addEventListener("click", () => speakAdvisory(result.advisory));
  panel.scrollIntoView({ behavior: "smooth" });
}

async function speakAdvisory(text) {
  const langObj = LANGUAGES.find((l) => l.code === selectedLangCode);
  const speechLang = langObj ? langObj.speech : "en-IN";

  if (CONFIG.USE_CLOUD_TTS && CONFIG.GOOGLE_CLOUD_API_KEY && !CONFIG.GOOGLE_CLOUD_API_KEY.startsWith("PASTE_")) {
    try {
      await speakWithCloudTTS(text, speechLang);
      return;
    } catch (e) {
      console.warn("Cloud TTS failed, falling back to browser voice:", e);
    }
  }

  if (!("speechSynthesis" in window)) {
    alert("Voice playback isn't supported in this browser.");
    return;
  }
  const voices = window.speechSynthesis.getVoices();
  const hasMatch = voices.some((v) => v.lang && v.lang.toLowerCase().startsWith(speechLang.split("-")[0]));
  if (!hasMatch && voices.length > 0) {
    // Most desktop browsers don't ship Indian-language voices out of the box —
    // this is exactly the gap CONFIG.USE_CLOUD_TTS closes. See README.
    console.warn(`No installed voice found for ${speechLang} — playback may fall back to a default voice or stay silent.`);
  }
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = speechLang;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

// Optional: real Google Cloud Text-to-Speech for guaranteed multilingual audio.
// Requires CONFIG.USE_CLOUD_TTS = true and a GCP API key with the
// Text-to-Speech API enabled (see README).
async function speakWithCloudTTS(text, speechLang) {
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${CONFIG.GOOGLE_CLOUD_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: speechLang, ssmlGender: "NEUTRAL" },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });
  if (!res.ok) throw new Error(`Cloud TTS error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
  await audio.play();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Storage (Firebase if configured, else localStorage) ----------

// Multiple reports submitted from the same device/browser tab all carry the
// exact same real GPS coordinates, which stacks their pins on top of each
// other on the map — accurate, but looks like nothing happened when demoing
// several reports in a row. We nudge each report a small random distance
// (roughly within ~3km) from the real location so reports from one device
// spread out visibly, the way reports from several nearby farmers would.
// This only ever moves a pin a few streets away — never to a different
// district or state — so it doesn't misrepresent where a report came from.
function jitterLatLng(lat, lng) {
  if (lat == null || lng == null) return { lat, lng };
  const metersToDegLat = 1 / 111320;
  const metersToDegLng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
  const radiusMeters = 400 + Math.random() * 2600; // ~0.4km - 3km
  const angle = Math.random() * 2 * Math.PI;
  return {
    lat: lat + Math.cos(angle) * radiusMeters * metersToDegLat,
    lng: lng + Math.sin(angle) * radiusMeters * metersToDegLng,
  };
}

function saveReport(result) {
  const jittered = jitterLatLng(userLatLng?.lat ?? null, userLatLng?.lng ?? null);
  const report = {
    ...result,
    state: selectedStateName,
    lang: selectedLangCode,
    lat: jittered.lat,
    lng: jittered.lng,
    timestamp: Date.now(),
  };

  if (firebaseReady) {
    window.firebase.database().ref("reports").push(report);
    // Not added to the map or dashboard here — the child_added listener in
    // subscribeToFirebaseReports() handles both once Firebase confirms the
    // write, which also means it naturally shows up for every other user.
  } else {
    const reports = JSON.parse(localStorage.getItem("kv_reports") || "[]");
    reports.push(report);
    localStorage.setItem("kv_reports", JSON.stringify(reports));
    plotReport(report);
    addToDashboard(report);
  }
}

function loadStoredReports() {
  return JSON.parse(localStorage.getItem("kv_reports") || "[]");
}

// ---------- Map ----------

function initMap() {
  const center = userLatLng || { lat: 20.5937, lng: 78.9629 }; // India centroid fallback
  map = L.map("map").setView([center.lat, center.lng], userLatLng ? 10 : 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

function urgencyColor(urgency) {
  return { low: "#3F6B32", medium: "#D98E2B", high: "#A8402E" }[urgency] || "#6B4A2E";
}

// ---------- Aggregate dashboard (policymaker view) ----------
// Deliberately not translated with the rest of the interface: this is a
// distinct audience (a ministry or district official reviewing rolled-up
// data), not the farmer using the report flow above, so it stays in English
// rather than doubling the translation surface for a page that audience
// wouldn't need in their own language anyway.

let dashboardReports = [];

function addToDashboard(report) {
  dashboardReports.push(report);
  renderDashboard();
}

function renderDashboard() {
  const empty = $("dashboard-empty");
  const content = $("dashboard-content");
  if (!empty || !content) return;

  if (dashboardReports.length === 0) {
    empty.hidden = false;
    content.hidden = true;
    return;
  }
  empty.hidden = true;
  content.hidden = false;

  $("dash-total").textContent = dashboardReports.length;
  $("dash-low").textContent = dashboardReports.filter((r) => r.urgency === "low").length;
  $("dash-medium").textContent = dashboardReports.filter((r) => r.urgency === "medium").length;
  $("dash-high").textContent = dashboardReports.filter((r) => r.urgency === "high").length;

  const rank = (counts) =>
    Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const rowsHtml = (pairs) =>
    pairs.length
      ? pairs.map(([label, count]) => `<li><span>${escapeHtml(label)}</span><span class="dash-count">${count}</span></li>`).join("")
      : "<li>—</li>";

  const issueCounts = {};
  for (const r of dashboardReports) {
    const key = `${r.crop || "Unknown crop"} — ${r.diagnosis || "Unclear"}`;
    issueCounts[key] = (issueCounts[key] || 0) + 1;
  }
  $("dash-top-issues").innerHTML = rowsHtml(rank(issueCounts).slice(0, 5));

  const regionCounts = {};
  for (const r of dashboardReports) {
    const key = r.state || "Unknown region";
    regionCounts[key] = (regionCounts[key] || 0) + 1;
  }
  $("dash-by-region").innerHTML = rowsHtml(rank(regionCounts));
}

function plotReport(report) {
  if (report.lat == null || report.lng == null) return;
  L.circleMarker([report.lat, report.lng], {
    radius: 7,
    color: urgencyColor(report.urgency),
    fillColor: urgencyColor(report.urgency),
    fillOpacity: 0.75,
  })
    .bindPopup(`<strong>${escapeHtml(report.crop)}</strong><br>${escapeHtml(report.diagnosis)}`)
    .addTo(markerLayer);
}

function renderStoredReportsOnMap() {
  if (firebaseReady) return; // shared reports arrive via the child_added listener instead
  loadStoredReports().forEach((r) => {
    plotReport(r);
    addToDashboard(r);
  });
}

init();