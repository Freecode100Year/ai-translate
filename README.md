# AI Translate

Real-time bidirectional speech translation running on Cloudflare's edge network. Speak in one language, hear the translation in another — supports **33 languages**.

## How It Works

```
Microphone → Deepgram Nova-2 (STT) → m2m100-1.2b (Translation) → Edge-TTS (Speech) → Speaker
```

```
┌─────────────┐      WebSocket       ┌───────────────────────────────┐
│   Browser    │◄────────────────────►│     Cloudflare Worker         │
│   (React)    │  audio chunks + JSON │     (Durable Object)          │
│              │                      │                               │
│ MediaRecorder│                      │  Deepgram Nova-2 ──► STT     │
│              │                      │         │                     │
│              │                      │    Workers AI m2m100-1.2b     │
│              │    MP3 audio binary  │         │                     │
│    Speaker ◄─┼──────────────────────┤  Edge-TTS ◄── Translation    │
└─────────────┘                       └───────────────────────────────┘
```

1. **STT** — Audio streams via WebSocket to [Deepgram Nova-2](https://deepgram.com/) for real-time transcription
2. **Translation** — [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) runs Meta's `m2m100-1.2b` multilingual translation model
3. **TTS** — Microsoft Edge-TTS synthesizes translated text with neural voices

## Supported Languages (33)

| | | | | |
|---|---|---|---|---|
| 中文 Chinese | English | 日本語 Japanese | 한국어 Korean | Español Spanish |
| Français French | Deutsch German | Русский Russian | Português Portuguese | Italiano Italian |
| ไทย Thai | Tiếng Việt Vietnamese | Polski Polish | Nederlands Dutch | Türkçe Turkish |
| Svenska Swedish | Dansk Danish | Suomi Finnish | Norsk Norwegian | Čeština Czech |
| Ελληνικά Greek | हिन्दी Hindi | Magyar Hungarian | Indonesia | Melayu Malay |
| Română Romanian | Slovenčina Slovak | Български Bulgarian | Català Catalan | Eesti Estonian |
| Latviešu Latvian | Lietuvių Lithuanian | Українська Ukrainian | | |

All 33 languages are verified to work across Deepgram STT + m2m100 translation + Edge-TTS speech synthesis.

## Features

- **33 languages** with full STT → Translation → TTS pipeline
- **Bidirectional conversation** — two mic buttons for natural dialogue
- **Real-time** interim transcription displayed as you speak
- **High-quality neural TTS** voices via Edge-TTS
- **Edge-native** — runs entirely on Cloudflare (Workers + Durable Objects + Workers AI)
- **Mobile-friendly** PWA with safe-area support

## Cost

| Service | Cost |
|---------|------|
| Deepgram Nova-2 STT | ~$0.0059/min |
| Workers AI m2m100-1.2b | **Free** (included in Workers AI free tier) |
| Edge-TTS | **Free** |
| Cloudflare Workers | Free tier available |

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/Freecode100Year/ai-translate.git
cd ai-translate
cd worker && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Configure Deepgram API Key

Get a free API key at [deepgram.com](https://console.deepgram.com/).

Local development — create `worker/.dev.vars`:

```
DEEPGRAM_API_KEY=your_deepgram_api_key
```

Production:

```bash
cd worker
npx wrangler secret put DEEPGRAM_API_KEY
```

Workers AI uses the `[ai]` binding in `wrangler.toml` — no API key needed.

### 3. Local Development

```bash
# Terminal 1 — Worker
cd worker && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

### 4. Deploy

```bash
# Deploy Worker
cd worker && npm run deploy

# Build & deploy Frontend to Cloudflare Pages
cd frontend && npm run build
npx wrangler pages deploy dist --project-name your-project-name
```

If the frontend and worker are on different domains, create `frontend/.env.production`:

```
VITE_WS_URL=wss://your-worker.your-subdomain.workers.dev/ws
```

## Project Structure

```
├── worker/
│   ├── src/index.ts      # Durable Object, Deepgram STT, m2m100 translation, Edge-TTS
│   └── wrangler.toml     # Worker config with AI binding
├── frontend/
│   ├── src/App.tsx        # React UI
│   ├── src/main.tsx       # Entry point
│   └── public/            # PWA manifest & service worker
└── .gitignore
```

## License

MIT
