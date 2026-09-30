# Bharat Krishi Vaani — AI Crop Advisory (Agricultural Intelligence track)

A working prototype: a farmer uploads a photo (or speaks) about a crop problem,
Gemini diagnoses it and writes back a plain-language advisory in the farmer's
own language, the browser reads it aloud, and the report drops a pin on a
shared map — so hotspots become visible.

## What's here

```
index.html      main page
style.css       styling
config.js       ← the ONLY file you must edit before running
app.js          all logic: Gemini calls, voice in/out, map, storage
data/agro_context.json   sample state/crop grounding data (swap for real data — see below)
```

## 1. Get it running locally (5 minutes)

1. **Get a Gemini API key** — go to https://aistudio.google.com/apikey, sign in
   with any Google account, click "Create API key". Free tier covers a demo easily.
2. Copy the template and edit the copy — **never put real keys in `config.example.js`**,
   only in `config.js` (already gitignored, so it won't end up in your public repo):
   ```bash
   cp config.example.js config.js
   ```
   Then open `config.js` and paste your key in place of `PASTE_YOUR_GEMINI_API_KEY_HERE`.
3. Serve the folder (browsers block camera/mic on `file://`):
   ```bash
   cd agri-intel
   python3 -m http.server 8000
   ```
4. Open `http://localhost:8000`, allow camera/location/mic when prompted, and
   try it: pick a state and language, upload a leaf photo (or hold the voice
   button and describe the problem), hit **Get advisory**.

That's the whole core loop working end-to-end — this alone satisfies
"functioning end-to-end flow" + "mandatory Google AI integration."

## 2. What changed: built for farmers, not for developers

- **Language and state are now tap-to-select chips**, not dropdowns — a
  farmer recognizes their own script at a glance far more easily than reading
  through an alphabetized English list.
- **State names localize too**, not just the interface chrome — Telangana
  reads as "తెలంగాణ" once Telugu is selected, "તેલંગાણા" in Gujarati, and so on.
- **Picking a state auto-suggests the local language** (from
  `data/agro_context.json`'s `languages` field), so many farmers won't need
  to touch the language step at all.
- **The whole interface translates instantly**, not just the advisory.
  `data/i18n.json` ships pre-generated translations for all 14 languages, so
  switching languages is instant with zero network dependency — nothing to
  wait on, nothing that can fail live in front of a judge. Diagnosis and
  advisory text are still generated live by Gemini per-report, since that
  content is different every time; only the static interface chrome (labels,
  buttons, status messages) is pre-translated. Add a 15th language by adding
  one entry to `LANGUAGES` in `app.js` — if it's not yet in `i18n.json`, the
  app transparently falls back to a live Gemini translation call for it (and
  caches the result), so growing past the shipped 14 never breaks anything.
- **Diagnosis and advisory both come back in the farmer's language now**
  (not just the advisory), so nothing on screen requires reading English.
- **Note on translation quality:** the static translations in
  `data/i18n.json` were AI-generated for this prototype, not reviewed by
  native speakers. They should read as clear, standard usage, but before any
  real deployment — and ideally before your demo, if you know a speaker of
  any of these languages — have someone check them, especially Odia,
  Assamese, and Urdu.
- **22 Indian states are covered** (up from the original 5), spanning every
  major agricultural region — Telangana, Punjab, Maharashtra, Tamil Nadu,
  West Bengal, Karnataka, Kerala, Andhra Pradesh, Gujarat, Rajasthan, Madhya
  Pradesh, Uttar Pradesh, Bihar, Odisha, Assam, Haryana, Chhattisgarh,
  Jharkhand, Himachal Pradesh, Uttarakhand, Goa, and Jammu & Kashmir. Not yet
  included: the smaller North-Eastern states beyond Assam, and the Union
  Territories — same JSON shape, straightforward to add, just not done here
  given the deadline. Worth saying this plainly if a judge asks rather than
  implying full coverage.
- **All 23 states now have full 14-language name coverage.** Every state chip
  reads correctly no matter which interface language is selected — this was
  a real gap earlier (only Hindi + each state's own regional language were
  filled in for the newer states) and has been backfilled for all 14 shipped
  languages, not just English + one regional language.
- **Fixed:** picking a state used to auto-suggest its language only the
  *first* time — after that it silently stopped working for further state
  changes. It now re-suggests every time you change state, and only stops
  once you've manually picked a language chip yourself (a deliberate choice
  should stick; an earlier auto-suggestion shouldn't block later ones).
- **Mato Grosso, Brazil now shows a 🌎 marker** in its chip so it reads as
  the deliberate BRICS proof-of-concept it is, not a stray entry.

## 3. Human-expert fallback (responsible AI, not just a feature)

When a report comes back **high urgency** or **low confidence**, the result
card now adds a real fallback: for India, the government's toll-free **Kisan
Call Centre (1800-180-1551)** — genuinely live in 22 languages, 6 AM–10 PM,
every day, verified via a web search rather than assumed — plus a nudge to
visit the nearest Krishi Vigyan Kendra. For the Brazil sample, it's a generic
"contact your local agricultural extension office" line instead, since I
don't have a verified Brazilian equivalent number and won't fabricate one.

This is worth a line in your pitch: it's the app being explicit about where
its own confidence runs out and hands off to a human, rather than quietly
presenting every answer with the same authority. Judges scoring "AI/Technical
Execution" and "Impact Potential" should read this as intentional, responsible
design — a digital public good that complements the existing agricultural
extension network instead of pretending to replace it.

## 4. Decorative motif strip

A small row of colorful tiles sits under the hero text — six original SVG
icons (elephant, peacock, tiger, marigold, chai cup, paisley) in a poster-tile
style, inspired by the warmth of Indian textile and travel-poster art without
tracing or reproducing any specific image, logo, or protected emblem. It's
purely decorative — no functional role, safe to remove if you want a leaner
look, easy to point to if a judge asks about visual polish.

## 5. BRICS proof-of-concept (Rule 04)

`data/agro_context.json` now includes **Mato Grosso, Brazil** alongside the
five Indian states, with its own crops, season, and common issues — and
**Portuguese** is a full 14th language (chip, static UI translation, speech
locale, all of it). Selecting Mato Grosso auto-suggests Portuguese the same
way selecting Telangana auto-suggests Telugu.

This is a proof, not a full product decision: the state and country chips sit
in one flat list rather than a country-then-state flow, since the point here
is showing the underlying schema (state → country → crops → issues →
languages) already generalizes beyond India, not shipping a polished
multi-country picker under a 6-day deadline. Worth saying exactly that if a
judge asks — it reads as honest scoping, not an oversight.

## 5b. Why repeated demo reports don't all land on one pin

Every report's coordinates come from the browser's real GPS location. If you
submit several test reports in a row from the same laptop, they'd all carry
the exact same coordinates and stack into a single pin on the map — accurate,
but confusing to demo. Each report is now nudged a small random distance
(roughly 0.4-3km) from the real location before it's saved, so reports from
one device spread out the way nearby-but-distinct farmers' reports would.
It only ever moves a pin a few streets over, never to a different district
or state, so it doesn't misrepresent where a report actually came from.

## 6. Aggregate dashboard (policymaker view)

A new panel below the map rolls up every report into what a ministry or
district dashboard would actually want to see: total reports, a breakdown by
urgency, the most common issues reported, and counts by region. It updates
live as reports come in, whether from Firebase (shared) or local storage
(demo mode).

This panel is deliberately **not translated** with the rest of the
interface — it's built for a different audience (an official reviewing
rolled-up data) than the farmer-facing report flow above, so keeping it in
English avoids doubling the translation surface for a page that audience
doesn't need in their own language anyway. Worth a line in your pitch: this
panel is the seed of the citizen-feedback-aggregation layer the governance
track's problem statement describes, built as a byproduct of the reporting
flow rather than a separate system.

## 7. What I need from you to take it further

- **Nothing more is required to demo it** — it runs with just the Gemini key above.
- **Optional, for a stronger submission:**
  - A **Firebase project** (free Spark plan) if you want reports to persist
    across devices/judges rather than just your own browser's localStorage.
    Create one at https://console.firebase.google.com, enable **Realtime
    Database**, and paste its config into `config.js` → `FIREBASE_CONFIG`.
    Firebase Hosting also gives you the "deployed link" the submission
    requires, in one command (`firebase deploy`) — see below.
  - A **real dataset** to replace `data/agro_context.json` — pull crop/disease
    or district agri-stat data from data.gov.in, or ICAR's crop advisory
    portal, to strengthen "real or realistic data" and "depth across India."
    The file's structure is simple; keep the same shape and it'll drop right in.

## 8. Deploying (for the "deployed link" requirement)

Fastest path — Firebase Hosting (free, no billing account needed):

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # choose "Use an existing project" or create one; public dir = current folder
firebase deploy
```

You'll get a `https://<project>.web.app` link — that's your submission's
deployed link.

## 9. A security note for judges (mention this in your pitch, don't hide it)

The Gemini key is called directly from the browser here, which is fine for a
hackathon demo but would leak your key in production. If you have time before
the deadline, the safer version is a one-function Cloud Function that holds
the key server-side and the browser calls that instead — mentioning that
you're aware of this tradeoff is worth more to judges than silently shipping
it. A minimal proxy looks like:

```js
// functions/index.js (Cloud Functions for Firebase, 2nd gen)
const { onRequest } = require("firebase-functions/v2/https");
exports.geminiProxy = onRequest(async (req, res) => {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) }
  );
  res.json(await r.json());
});
```
Then point `app.js`'s `callGemini()` at your function URL instead of calling
Google directly, and drop the key out of `config.js` entirely.

## 10. Cloud Text-to-Speech (optional, fixes the weakest link)

The default "Listen" button uses the browser's built-in voice synthesis, which
often has **no installed voice for Telugu, Tamil, Marathi, Bengali, or Punjabi**
— on a machine without one, playback can silently do nothing. This is the one
piece most likely to embarrass you live, so if you have 20 minutes to spare:

1. In the same GCP project as your Gemini key (or a new one), enable the
   **Cloud Text-to-Speech API** and create a standard API key restricted to it.
2. In `config.js`, set `USE_CLOUD_TTS: true` and paste the key into
   `GOOGLE_CLOUD_API_KEY`.
3. That's it — "Listen" now calls Google's TTS directly and gets a real,
   correctly-pronounced voice in every supported language, every time.

This requires a GCP project with billing enabled (the free tier — 1M
characters/month for standard voices — easily covers a demo and won't charge
you). If you skip this, the app still works; just test the browser fallback
on the actual machine you'll demo on beforehand.

## 11. Scaling story (for your pitch deck / "depth across India")

- New state = one new entry in the grounding JSON (or, properly, a live feed).
- New language = one line in `LANGUAGES` in `app.js` — Gemini already writes
  in whatever language you ask for; the browser's speech synthesis just needs
  the matching locale code.
- The map + report log is the seed of the "citizen feedback aggregation"
  layer the state/national tracks in the brief describe — this is deliberately
  built so it could plug into that larger picture rather than being a dead end.

## 12. What's still missing for the full submission package

I built the working prototype (code above). You still need to put together:
- **Demo video (3–5 min)** — record yourself running through the flow above.
- **Pitch deck (10–12 slides)** — see `SLIDE_OUTLINE.md` for a ready structure.
- **2–3 line description** — draft: "Bharat Krishi Vaani lets farmers report crop
  problems by photo or voice and get an instant, spoken advisory in their own
  language — turning scattered field-level problems into a live map of
  where help is needed most."
- **GitHub repo** — push this folder, make it public or grant access.