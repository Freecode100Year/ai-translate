# AI Translate

Real-time bidirectional speech translation PWA running entirely on Cloudflare's edge network. Speak in one language, hear the translation spoken back in another — like having a live interpreter in your pocket.

## How It Works

```
Microphone → Deepgram STT → GPT-4o-mini Translation → Edge-TTS → Speaker
```

1. **Speech-to-Text**: Audio streams via WebSocket to [Deepgram](https://deepgram.com/) Nova-2 for real-time transcription
2. **Translation**: Transcribed text is sent to OpenAI GPT-4o-mini for translation
3. **Text-to-Speech**: Translated text is synthesized using Microsoft Edge-TTS (free, high-quality neural voices)

All processing happens in a Cloudflare Durable Object that manages the full session lifecycle over a single WebSocket connection.

## Features

- **Bidirectional conversation mode** — two mic buttons, one per language, for natural back-and-forth dialogue
- **12 languages** — Chinese, English, Japanese, Korean, Spanish, French, German, Russian, Arabic, Portuguese, Italian, Thai
- **Real-time streaming** — interim transcription displayed as you speak
- **High-quality neural TTS** — Microsoft Edge neural voices, zero cost
- **PWA / iOS compatible** — installable, works with Safari audio restrictions
- **Adjustable volume** — 1x–5x amplification via Web Audio API GainNode
- **Edge-deployed** — low latency via Cloudflare Workers + Durable Objects

## Architecture

```
┌─────────────┐      WebSocket       ┌──────────────────────────┐
│   Browser    │◄────────────────────►│  Cloudflare Worker       │
│   (React)    │  audio chunks + JSON │  (Durable Object)        │
│              │                      │                          │
│  MediaRecorder                      │  ┌──────────┐           │
│  AudioContext                       │  │ Deepgram  │ STT      │
│  GainNode                           │  │ WebSocket │──────►   │
│              │                      │  └──────────┘     │     │
│              │                      │                    ▼     │
│              │                      │  ┌──────────┐  GPT-4o   │
│              │    MP3 audio binary   │  │ Edge-TTS │◄──mini    │
│              │◄─────────────────────│  │ WebSocket │           │
└─────────────┘                       │  └──────────┘           │
                                      └──────────────────────────┘
```

## Cost

| Service | Cost |
|---------|------|
| Deepgram STT | ~$0.0059/min |
| GPT-4o-mini | ~$0.15/1M input tokens |
| Edge-TTS | **Free** |
| Cloudflare Workers | Free tier available |

Estimated ~$9/month for 1 hour daily usage.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- A [Cloudflare](https://cloudflare.com/) account
- A [Deepgram](https://deepgram.com/) API key (free tier available)
- An [OpenAI](https://platform.openai.com/) API key

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/Freecode100Year/ai-translate.git
cd ai-translate
```

### 2. Install dependencies

```bash
cd worker && npm install && cd ..
cd frontend && npm install && cd ..
```

### 3. Configure API keys

For local development, create `worker/.dev.vars`:

```
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

For production, set secrets via Wrangler:

```bash
cd worker
npx wrangler secret put DEEPGRAM_API_KEY
npx wrangler secret put OPENAI_API_KEY
```

### 4. Local development

Start the worker and frontend dev servers:

```bash
# Terminal 1 — Worker
cd worker && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

The frontend dev server proxies `/ws` to the local worker at `localhost:8787`.

### 5. Deploy

**Worker:**

```bash
cd worker
npm run deploy
```

**Frontend:**

```bash
cd frontend
npm run build
```

Deploy `frontend/dist` to [Cloudflare Pages](https://pages.cloudflare.com/) or any static hosting.

Update `frontend/.env.production` with your Worker's WebSocket URL:

```
VITE_WS_URL=wss://your-worker-name.your-subdomain.workers.dev/ws
```

## Project Structure

```
├── worker/
│   ├── src/index.ts        # Worker entry, Durable Object, Edge-TTS, translation
│   ├── wrangler.toml       # Cloudflare Worker config
│   └── .dev.vars.example   # API key template
├── frontend/
│   ├── src/App.tsx          # Main React component
│   ├── src/main.tsx         # Entry point
│   ├── src/index.css        # Tailwind CSS
│   ├── index.html           # PWA meta tags
│   ├── public/manifest.json # PWA manifest
│   ├── public/sw.js         # Service worker
│   └── .env.production      # Production WebSocket URL
└── .gitignore
```

## Supported Languages & Voices

| Language | Code | Edge-TTS Voice |
|----------|------|----------------|
| Chinese | `zh` | zh-CN-XiaoxiaoNeural |
| English | `en` | en-US-JennyNeural |
| Japanese | `ja` | ja-JP-NanamiNeural |
| Korean | `ko` | ko-KR-SunHiNeural |
| Spanish | `es` | es-ES-ElviraNeural |
| French | `fr` | fr-FR-DeniseNeural |
| German | `de` | de-DE-KatjaNeural |
| Russian | `ru` | ru-RU-SvetlanaNeural |
| Arabic | `ar` | ar-SA-ZariyahNeural |
| Portuguese | `pt` | pt-BR-FranciscaNeural |
| Italian | `it` | it-IT-ElsaNeural |
| Thai | `th` | th-TH-PremwadeeNeural |

## License

MIT
