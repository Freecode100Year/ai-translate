import { useState, useRef, useCallback, useEffect } from 'react'

const LANGUAGES = [
  { code: 'zh', name: '中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ru', name: 'Русский' },
]

const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code

type Status = 'idle' | 'connecting' | 'connected' | 'error'

interface Entry {
  id: number
  source: string
  translated: string
  sourceLang: string
  targetLang: string
}

export default function App() {
  const [langA, setLangA] = useState('zh')
  const [langB, setLangB] = useState('en')
  const [activeLang, setActiveLang] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [interim, setInterim] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState('')
  const [volume, setVolume] = useState(3)

  const wsRef = useRef<WebSocket | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioQueue = useRef<string[]>([])
  const isPlaying = useRef(false)
  const pendingLang = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  const WS_URL =
    import.meta.env.VITE_WS_URL ||
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [entries, interim])

  const playNext = useCallback(() => {
    if (!audioQueue.current.length) {
      isPlaying.current = false
      return
    }
    isPlaying.current = true
    const url = audioQueue.current.shift()!
    const el = audioElRef.current!
    el.src = url
    el.onended = () => { URL.revokeObjectURL(url); playNext() }
    el.onerror = () => { URL.revokeObjectURL(url); playNext() }
    el.play().catch(() => { URL.revokeObjectURL(url); playNext() })
  }, [])

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      const mimeType =
        ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
          MediaRecorder.isTypeSupported(t),
        ) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(e.data)
        }
      }
      recorder.start(100)
      recorderRef.current = recorder
    } catch {
      setError('Microphone access denied')
      setStatus('error')
    }
  }, [])

  const stopMic = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.stop()
      recorderRef.current.stream.getTracks().forEach((t) => t.stop())
      recorderRef.current = null
    }
  }, [])

  const onWsMessage = useCallback(
    (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data)
        switch (msg.type) {
          case 'ready':
            setStatus('connected')
            if (pendingLang.current) {
              const lang = pendingLang.current
              pendingLang.current = null
              setActiveLang(lang)
              startMic()
            }
            break
          case 'source':
            if (msg.text) setInterim(msg.text)
            break
          case 'translation':
            setInterim('')
            setEntries((prev) => [
              ...prev,
              {
                id: Date.now(),
                source: msg.source,
                translated: msg.translated,
                sourceLang: msg.sourceLang,
                targetLang: msg.targetLang,
              },
            ])
            break
          case 'error':
            setError(msg.message)
            break
        }
      } else {
        const blob = new Blob([event.data], { type: 'audio/mpeg' })
        audioQueue.current.push(URL.createObjectURL(blob))
        if (!isPlaying.current) playNext()
      }
    },
    [startMic, playNext],
  )

  const handleLangTap = useCallback(
    (lang: string) => {
      if (activeLang === lang) {
        stopMic()
        try {
          wsRef.current?.send(JSON.stringify({ type: 'stop' }))
        } catch {}
        setActiveLang(null)
        return
      }

      if (activeLang) {
        stopMic()
        try {
          wsRef.current?.send(JSON.stringify({ type: 'stop' }))
        } catch {}
      }

      if (!audioElRef.current) {
        audioElRef.current = new Audio()
      }
      audioElRef.current.volume = volume / 5

      setError('')
      setInterim('')
      pendingLang.current = lang

      const startMsg = JSON.stringify({ type: 'start', langA, langB, speaking: lang })

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        setStatus('connecting')
        wsRef.current.send(startMsg)
        return
      }

      setStatus('connecting')
      const ws = new WebSocket(WS_URL)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => ws.send(startMsg)
      ws.onmessage = onWsMessage
      ws.onerror = () => {
        setStatus('error')
        setError('Connection failed')
        pendingLang.current = null
      }
      ws.onclose = () => {
        setStatus('idle')
        setActiveLang(null)
      }
    },
    [activeLang, langA, langB, WS_URL, stopMic, onWsMessage],
  )

  const swap = () => {
    setLangA(langB)
    setLangB(langA)
  }

  useEffect(() => {
    if (audioElRef.current) audioElRef.current.volume = volume / 5
  }, [volume])

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      recorderRef.current?.stop()
      audioQueue.current.forEach(URL.revokeObjectURL)
    }
  }, [])

  return (
    <div className="h-dvh bg-gray-950 text-white flex flex-col select-none">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 bg-gray-900/80 backdrop-blur border-b border-gray-800">
        <h1 className="text-lg font-semibold tracking-tight">AI Translate</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Vol</span>
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-16 h-1 accent-blue-500"
            />
          </div>
          <span
            className={`w-2 h-2 rounded-full ${
              status === 'connected'
                ? 'bg-green-400'
                : status === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : status === 'error'
                    ? 'bg-red-400'
                    : 'bg-gray-600'
            }`}
          />
        </div>
      </header>

      {/* Language selector */}
      <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-2.5 bg-gray-900/40 border-b border-gray-800/50">
        <select
          value={langA}
          onChange={(e) => setLangA(e.target.value)}
          disabled={!!activeLang}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm outline-none disabled:opacity-50"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>

        <button
          onClick={swap}
          disabled={!!activeLang}
          className="text-xl text-gray-400 hover:text-white transition disabled:opacity-30"
        >
          ⇄
        </button>

        <select
          value={langB}
          onChange={(e) => setLangB(e.target.value)}
          disabled={!!activeLang}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm outline-none disabled:opacity-50"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="shrink-0 mx-4 mt-2 px-3 py-2 bg-red-900/30 border border-red-800/60 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Translation feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {entries.length === 0 && !interim && (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-600 text-sm text-center leading-relaxed">
              Choose a language below
              <br />
              and start speaking
            </p>
          </div>
        )}

        {entries.map((e) => (
          <div key={e.id} className="space-y-1.5">
            <div className="bg-gray-800/80 rounded-2xl px-4 py-3">
              <p className="text-[11px] text-gray-500 mb-0.5">
                {langName(e.sourceLang)} → {langName(e.targetLang)}
              </p>
              <p className="text-[15px] leading-relaxed">{e.source}</p>
            </div>
            <div className="bg-blue-950/40 border border-blue-900/30 rounded-2xl px-4 py-3">
              <p className="text-[11px] text-blue-400 mb-0.5">{langName(e.targetLang)}</p>
              <p className="text-[15px] leading-relaxed text-blue-100">{e.translated}</p>
            </div>
          </div>
        ))}

        {interim && (
          <div className="bg-gray-800/40 border border-dashed border-gray-700/50 rounded-2xl px-4 py-3">
            <p className="text-[11px] text-gray-500 mb-0.5">Listening...</p>
            <p className="text-[15px] text-gray-400 italic">{interim}</p>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div
        className="shrink-0 px-4 pt-3 pb-6 bg-gray-900/80 backdrop-blur border-t border-gray-800"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-center mb-3">
          <button
            onClick={() => {
              setEntries([])
              setInterim('')
            }}
            className="text-sm text-gray-500 hover:text-gray-300 transition"
          >
            Clear
          </button>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => handleLangTap(langA)}
            className={`flex-1 max-w-[10rem] py-3.5 rounded-2xl flex flex-col items-center gap-1 transition-all shadow-lg active:scale-95 ${
              activeLang === langA
                ? 'bg-red-500 shadow-red-500/25 animate-pulse'
                : 'bg-blue-500 shadow-blue-500/25 hover:bg-blue-400 active:bg-blue-600'
            }`}
          >
            <span className="text-xl">{activeLang === langA ? '⏹' : '🎤'}</span>
            <span className="text-sm font-medium">{langName(langA)}</span>
          </button>

          <button
            onClick={() => handleLangTap(langB)}
            className={`flex-1 max-w-[10rem] py-3.5 rounded-2xl flex flex-col items-center gap-1 transition-all shadow-lg active:scale-95 ${
              activeLang === langB
                ? 'bg-red-500 shadow-red-500/25 animate-pulse'
                : 'bg-blue-500 shadow-blue-500/25 hover:bg-blue-400 active:bg-blue-600'
            }`}
          >
            <span className="text-xl">{activeLang === langB ? '⏹' : '🎤'}</span>
            <span className="text-sm font-medium">{langName(langB)}</span>
          </button>
        </div>

        <p className="text-center text-[11px] text-gray-600 mt-2">
          {activeLang
            ? `Speaking ${langName(activeLang)} — tap to stop`
            : 'Tap a language to speak'}
        </p>
      </div>
    </div>
  )
}
