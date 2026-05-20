# Sunscreen Coverage Coach

A Progressive Web App that estimates sunscreen coverage gaps on your face using on-device AI — no data ever leaves your device.

## What it does

1. Take a selfie (or upload a photo)
2. MediaPipe Face Mesh maps ~468 landmarks across your face
3. An on-device vision model (Gemma 3N or SmolVLM) analyzes each zone for coverage uniformity
4. A heatmap overlays the gaps — forehead, nose, cheeks, chin, temples, etc.
5. The app fetches your local UV index (Open-Meteo) and tailors reapplication reminders via the scheduler

All processing runs in the browser. The optional Claude backend is the only mode that sends image data to an external API.

## Tech stack

| Layer | Technology |
|---|---|
| Face detection | MediaPipe Face Mesh (WASM) |
| On-device inference | Transformers.js — Gemma 3N · SmolVLM |
| Cloud fallback | Claude API (Anthropic) |
| UV data | Open-Meteo (free, no key needed) |
| Storage | IndexedDB (via `js/storage.js`) |
| Offline | Service Worker — cache-first app shell |
| Install | PWA — `manifest.json`, installable on iOS & Android |

## File structure

```
├── index.html                  # App shell, single HTML entry point
├── manifest.json               # PWA manifest
├── sw.js                       # Service worker (cache-first)
├── css/
│   └── style.css
├── data/
│   └── zones.json              # Face zone definitions + landmark pairs
├── assets/
│   └── icons/                  # icon-192.png, icon-512.png
└── js/
    ├── app.js                  # Entry point — router + SW registration
    ├── camera.js               # Camera/MediaDevices wrapper
    ├── face-mesh.js            # MediaPipe landmark extraction
    ├── mediapipe-loader.js     # CDN loader with WASM fallback
    ├── coverage-analyzer.js    # Per-zone coverage scoring
    ├── heatmap-renderer.js     # Canvas heatmap overlay
    ├── uv-api.js               # Open-Meteo UV index fetch
    ├── scheduler.js            # Reapplication reminder logic
    ├── storage.js              # IndexedDB session persistence
    ├── model-downloader.js     # Model fetch + progress UI
    ├── zones.js                # zones.json loader
    ├── analyzers/
    │   ├── features.js         # Texture / reflectance feature extraction
    │   ├── symmetry.js         # Left/right zone symmetry comparison
    │   ├── uniformity.js       # Within-zone uniformity scoring
    │   └── differential.js     # Before/after session diff
    ├── llm/
    │   ├── runtime.js          # Backend selection + inference orchestration
    │   ├── prompts.js          # Prompt templates for each backend
    │   └── backends/
    │       ├── gemma3n.js      # Gemma 3N via Transformers.js
    │       ├── smolvlm.js      # SmolVLM via Transformers.js
    │       └── claude.js       # Claude API (requires user API key)
    └── ui/
        ├── onboarding.js       # First-run setup screen
        ├── capture.js          # Camera + analysis flow
        ├── results.js          # Heatmap + zone breakdown
        ├── history.js          # Past sessions
        └── settings.js         # Backend selection, API key, preferences
```

## Running locally

No build step. Serve the repo root over HTTPS (required for camera + service worker):

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080`.

> Camera access and service worker registration both require a secure context. Use `localhost` or HTTPS.

## GitHub Pages deployment

1. Go to **Settings → Pages** in this repo
2. Set source to **Deploy from branch → main → / (root)**
3. Save — the app will be live at `https://harshasatya.github.io/sunscreen-coverage-coach/`

## LLM backends

| Backend | Where it runs | API key needed? |
|---|---|---|
| Gemma 3N | In-browser (WebGPU/WASM) | No |
| SmolVLM | In-browser (WebGPU/WASM) | No |
| Claude | Anthropic servers | Yes (user supplies in Settings) |

On first launch the app downloads the selected model (~300 MB–1.5 GB depending on backend). Subsequent loads are served from browser cache.

## Privacy

- Selfies are never uploaded unless you explicitly choose the Claude backend
- All session history is stored locally in IndexedDB
- UV index is fetched by GPS coordinates only — no account required
