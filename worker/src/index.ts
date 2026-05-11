interface Env {
  TRANSLATOR: DurableObjectNamespace;
  DEEPGRAM_API_KEY: string;
  OPENAI_API_KEY: string;
  ACCESS_PASSWORD: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }
      const pwd = url.searchParams.get('pwd');
      if (pwd !== env.ACCESS_PASSWORD) {
        return new Response('Unauthorized', { status: 401, headers: CORS });
      }
      const id = env.TRANSLATOR.newUniqueId();
      return env.TRANSLATOR.get(id).fetch(request);
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', ts: Date.now() }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404, headers: CORS });
  },
};

// ── Edge-TTS ────────────────────────────────────────────────

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_VERSION = '143.0.3650.75';
const WSS_BASE = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const VOICES: Record<string, string> = {
  zh: 'zh-CN-XiaoxiaoNeural',
  en: 'en-US-JennyNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  ru: 'ru-RU-SvetlanaNeural',
  ar: 'ar-SA-ZariyahNeural',
  pt: 'pt-BR-FranciscaNeural',
  it: 'it-IT-ElsaNeural',
  th: 'th-TH-PremwadeeNeural',
};

function uuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex;
}

async function generateSecMsGec(): Promise<string> {
  const unixSec = Math.floor(Date.now() / 1000);
  const winTicks = BigInt(unixSec + 11644473600) * 10000000n;
  const rounded = (winTicks / 3000000000n) * 3000000000n;
  const input = `${rounded}${TRUSTED_TOKEN}`;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function isoNow(): string {
  return new Date().toISOString();
}

async function edgeTTS(text: string, lang: string, rate = '-5%'): Promise<ArrayBuffer | null> {
  const voice = VOICES[lang] || VOICES['en'];
  const connId = uuid();
  const reqId = uuid();
  const gec = await generateSecMsGec();

  const url = `${WSS_BASE}?TrustedClientToken=${TRUSTED_TOKEN}&ConnectionId=${connId}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-${CHROMIUM_VERSION}`;

  const resp = await fetch(url, {
    headers: {
      Upgrade: 'websocket',
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjmbkegmafilppg',
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_VERSION} Safari/537.36 Edg/${CHROMIUM_VERSION}`,
    },
  });

  const ws = resp.webSocket;
  if (!ws) return null;
  ws.accept();

  const configMsg =
    `X-Timestamp:${isoNow()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: 'false',
              wordBoundaryEnabled: 'false',
            },
            outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
          },
        },
      },
    });

  const ssmlMsg =
    `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${isoNow()}\r\nPath:ssml\r\n\r\n` +
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
    `<voice name='${voice}'><prosody rate='${rate}'>${escapeXml(text)}</prosody></voice></speak>`;

  ws.send(configMsg);
  ws.send(ssmlMsg);

  return new Promise<ArrayBuffer | null>((resolve) => {
    const chunks: ArrayBuffer[] = [];
    const timeout = setTimeout(() => { try { ws.close(); } catch {} resolve(null); }, 15000);

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          if (chunks.length === 0) { resolve(null); return; }
          const total = chunks.reduce((s, c) => s + c.byteLength, 0);
          const result = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            result.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
          }
          resolve(result.buffer);
        }
      } else {
        const buf = event.data as ArrayBuffer;
        const view = new DataView(buf);
        const headerLen = view.getUint16(0);
        if (buf.byteLength > headerLen + 2) {
          chunks.push(buf.slice(headerLen + 2));
        }
      }
    });

    ws.addEventListener('error', () => { clearTimeout(timeout); resolve(null); });
    ws.addEventListener('close', () => { clearTimeout(timeout); });
  });
}

// ── Translation Session ─────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  zh: 'Chinese', en: 'English', ja: 'Japanese', ko: 'Korean',
  es: 'Spanish', fr: 'French', de: 'German', ru: 'Russian',
  ar: 'Arabic', pt: 'Portuguese', it: 'Italian', th: 'Thai',
};

export class TranslatorSession {
  private client: WebSocket | null = null;
  private deepgram: WebSocket | null = null;
  private langA = 'zh';
  private langB = 'en';
  private speakingLang = 'zh';
  private targetLang = 'en';

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [clientSide, serverSide] = [pair[0], pair[1]];

    serverSide.accept();
    this.client = serverSide;

    serverSide.addEventListener('message', (event) => {
      this.onClientMessage(event.data);
    });
    serverSide.addEventListener('close', () => this.cleanup());
    serverSide.addEventListener('error', () => this.cleanup());

    return new Response(null, { status: 101, webSocket: clientSide });
  }

  private async onClientMessage(data: string | ArrayBuffer) {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'start') {
          this.langA = msg.langA || this.langA;
          this.langB = msg.langB || this.langB;
          this.speakingLang = msg.speaking || this.langA;
          this.targetLang = this.speakingLang === this.langA ? this.langB : this.langA;
          await this.connectDeepgram(this.speakingLang);
          this.send({ type: 'ready' });
        } else if (msg.type === 'stop') {
          this.closeDeepgram();
        }
      } catch (e) {
        this.send({ type: 'error', message: String(e) });
      }
      return;
    }

    if (this.deepgram && this.deepgram.readyState === WebSocket.OPEN) {
      this.deepgram.send(data);
    }
  }

  private async connectDeepgram(language: string) {
    this.closeDeepgram();

    const apiKey = this.env.DEEPGRAM_API_KEY?.trim();
    const params = new URLSearchParams({
      model: 'nova-2',
      language,
      punctuate: 'true',
      interim_results: 'true',
      endpointing: '800',
    });

    const resp = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      headers: {
        Upgrade: 'websocket',
        Authorization: `Token ${apiKey}`,
      },
    });

    const ws = resp.webSocket;
    if (!ws) {
      const body = await resp.text().catch(() => '');
      this.send({ type: 'error', message: `STT failed: ${resp.status} ${body}` });
      return;
    }

    ws.accept();
    this.deepgram = ws;

    ws.addEventListener('message', (event) => {
      this.onDeepgramMessage(event.data as string);
    });
    ws.addEventListener('close', () => { this.deepgram = null; });
    ws.addEventListener('error', () => { this.deepgram = null; });
  }

  private async onDeepgramMessage(raw: string) {
    try {
      const data = JSON.parse(raw);
      const transcript: string = data?.channel?.alternatives?.[0]?.transcript;
      if (!transcript) return;

      const isFinal: boolean = data.is_final;
      this.send({ type: 'source', text: transcript, isFinal });

      if (isFinal && transcript.trim()) {
        await this.translateAndSpeak(transcript.trim());
      }
    } catch {}
  }

  private async translateAndSpeak(text: string) {
    try {
      const translated = await this.translate(text);
      this.send({
        type: 'translation',
        source: text,
        translated,
        sourceLang: this.speakingLang,
        targetLang: this.targetLang,
      });

      const audio = await edgeTTS(translated, this.targetLang);
      if (audio && this.client) {
        this.client.send(audio);
      }
    } catch (e) {
      this.send({ type: 'error', message: `Translation failed: ${e}` });
    }
  }

  private async translate(text: string): Promise<string> {
    const src = LANG_NAMES[this.speakingLang] || this.speakingLang;
    const tgt = LANG_NAMES[this.targetLang] || this.targetLang;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Translate ${src} to ${tgt}. Output ONLY the translation, nothing else.`,
          },
          { role: 'user', content: text },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API ${res.status}: ${err}`);
    }

    const json: any = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || text;
  }

  private send(data: object) {
    try { this.client?.send(JSON.stringify(data)); } catch {}
  }

  private closeDeepgram() {
    try { this.deepgram?.close(); } catch {}
    this.deepgram = null;
  }

  private cleanup() {
    this.closeDeepgram();
    this.client = null;
  }
}
