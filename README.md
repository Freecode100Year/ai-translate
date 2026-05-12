# AI Translate

Real-time bidirectional speech translation web app running on Cloudflare's edge network. Speak in one language, hear the translation in another.

## Architecture

```
Microphone → Deepgram STT → Cloudflare Workers AI (m2m100) → Edge-TTS → Speaker
```

```
┌─────────────┐      WebSocket       ┌──────────────────────────┐
│   Browser    │◄────────────────────►│  Cloudflare Worker       │
│   (React)    │  audio chunks + JSON │  (Durable Object)        │
│              │                      │                          │
│  MediaRecorder                      │  ┌──────────┐           │
│              │                      │  │ Deepgram  │ STT      │
│              │                      │  │ WebSocket │──────►   │
│              │                      │  └──────────┘     │     │
│              │                      │              m2m100-1.2b │
│              │    MP3 audio binary   │  ┌──────────┐  (Workers │
│              │◄─────────────────────│  │ Edge-TTS │◄── AI)    │
└─────────────┘                       │  └──────────┘           │
                                      └──────────────────────────┘
```

1. **STT** — Audio streams via WebSocket to Deepgram Nova-2 for real-time transcription
2. **Translation** — Cloudflare Workers AI runs `m2m100-1.2b` (dedicated translation model, zero-cost under free tier)
3. **TTS** — Microsoft Edge-TTS synthesizes translated text with neural voices (free)

## Features

- 12 languages — Chinese, English, Japanese, Korean, Spanish, French, German, Russian, Arabic, Portuguese, Italian, Thai
- Bidirectional conversation — two mic buttons for natural dialogue
- Real-time interim transcription displayed as you speak
- High-quality neural TTS voices via Edge-TTS
- Runs entirely on Cloudflare edge (Workers + Durable Objects + Workers AI)

## Cost

| Service | Cost |
|---------|------|
| Deepgram STT | ~$0.0059/min |
| Workers AI (m2m100) | **Free** (10k neurons/day) |
| Edge-TTS | **Free** |
| Cloudflare Workers | Free tier available |

## Setup

### 1. Clone & install

```bash
git clone https://github.com/Freecode100Year/ai-translate.git
cd ai-translate
cd worker && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Configure secrets

Create `worker/.dev.vars` for local dev:

```
DEEPGRAM_API_KEY=your_deepgram_api_key
```

For production:

```bash
cd worker
npx wrangler secret put DEEPGRAM_API_KEY
```

Workers AI uses the `[ai]` binding in `wrangler.toml` — no API key needed.

### 3. Local development

```bash
# Terminal 1
cd worker && npm run dev

# Terminal 2
cd frontend && npm run dev
```

### 4. Deploy

```bash
# Worker
cd worker && npm run deploy

# Frontend — deploy dist/ to Cloudflare Pages
cd frontend && npm run build
npx wrangler pages deploy dist --project-name your-project-name
```

Set `VITE_WS_URL` in `frontend/.env.production` if the frontend and worker are on different domains:

```
VITE_WS_URL=wss://your-worker.your-subdomain.workers.dev/ws
```

## Project Structure

```
├── worker/
│   ├── src/index.ts      # Durable Object, Deepgram STT, m2m100 translation, Edge-TTS
│   └── wrangler.toml     # Worker config + AI binding
├── frontend/
│   ├── src/App.tsx        # React UI
│   └── src/main.tsx       # Entry point
└── .gitignore
```

## License

MIT
