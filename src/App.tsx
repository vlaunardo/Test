import { useEffect, useRef, useState } from 'react'
import { Answer } from './Answer.tsx'
import type { ChatEvent, Citation } from '../shared/types.ts'

interface Turn {
    role: 'user' | 'assistant'
    content: string
    citations?: Citation[]
}

const STARTERS = [
    'Explain the neutral zone and why it matters',
    'How do I manage a flabby (fibrous) maxillary ridge?',
    'What causes a denture to dislodge on wide opening?',
    'Compare balanced occlusion and lingualised occlusion',
]

export function App() {
    const [turns, setTurns] = useState<Turn[]>([])
    const [input, setInput] = useState('')
    const [busy, setBusy] = useState(false)
    const [health, setHealth] = useState<{ chunks: number; provider: string } | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetch('/api/health')
            .then((r) => r.json())
            .then(setHealth)
            .catch(() => setHealth(null))
    }, [])

    // Keep the newest content in view as tokens stream in.
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, [turns])

    async function ask(question: string) {
        if (!question.trim() || busy) return
        setInput('')
        setBusy(true)

        const history: Turn[] = [...turns, { role: 'user', content: question }]
        setTurns([...history, { role: 'assistant', content: '', citations: [] }])

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    messages: history.map(({ role, content }) => ({ role, content })),
                }),
            })

            if (!res.ok || !res.body) {
                const { error } = (await res.json().catch(() => ({ error: 'Request failed.' }))) as { error: string }
                throw new Error(error)
            }

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const frames = buffer.split('\n\n')
                buffer = frames.pop() ?? ''

                for (const frame of frames) {
                    if (!frame.startsWith('data:')) continue
                    const evt = JSON.parse(frame.slice(5).trim()) as ChatEvent

                    setTurns((prev) => {
                        const next = [...prev]
                        const last = next.at(-1)
                        if (!last || last.role !== 'assistant') return prev
                        if (evt.type === 'citations') next[next.length - 1] = { ...last, citations: evt.citations }
                        if (evt.type === 'token') next[next.length - 1] = { ...last, content: last.content + evt.text }
                        if (evt.type === 'error') {
                            next[next.length - 1] = { ...last, content: `**Error:** ${evt.message}` }
                        }
                        return next
                    })
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            setTurns((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: `**Error:** ${message}` }
                return next
            })
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="mx-auto flex h-full max-w-3xl flex-col">
            <header className="flex items-baseline justify-between border-b border-bone-200 px-6 py-4">
                <h1 className="text-lg font-semibold tracking-tight text-stone-800">Complete Denture Tutor</h1>
                <span className="text-xs text-stone-500">
                    {health ? `${health.chunks} chunks · ${health.provider}` : 'connecting…'}
                </span>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                {turns.length === 0 && (
                    <div className="pt-10">
                        <p className="text-sm text-stone-500">
                            Ask anything about complete dentures. Every answer is grounded in your own curated
                            sources, with citations you can expand and verify.
                        </p>
                        <div className="mt-5 grid gap-2">
                            {STARTERS.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => ask(s)}
                                    className="rounded-lg border border-bone-200 bg-white px-4 py-2.5 text-left text-sm text-stone-700 transition hover:border-clinical-600 hover:text-clinical-700"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {turns.map((turn, i) =>
                    turn.role === 'user' ? (
                        <div key={i} className="flex justify-end">
                            <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-clinical-600 px-4 py-2.5 text-sm text-white">
                                {turn.content}
                            </p>
                        </div>
                    ) : (
                        <Answer
                            key={i}
                            content={turn.content}
                            citations={turn.citations ?? []}
                            pending={busy && i === turns.length - 1}
                        />
                    ),
                )}
            </div>

            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    ask(input)
                }}
                className="border-t border-bone-200 px-6 py-4"
            >
                <div className="flex gap-2">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about impressions, occlusion, retention…"
                        className="flex-1 rounded-lg border border-bone-200 bg-white px-4 py-2.5 text-sm outline-none placeholder:text-stone-400 focus:border-clinical-600"
                    />
                    <button
                        type="submit"
                        disabled={busy || !input.trim()}
                        className="rounded-lg bg-clinical-600 px-5 text-sm font-medium text-white transition hover:bg-clinical-700 disabled:opacity-40"
                    >
                        {busy ? '…' : 'Ask'}
                    </button>
                </div>
            </form>
        </div>
    )
}
