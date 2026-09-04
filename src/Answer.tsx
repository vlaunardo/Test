import { Fragment, useState, type ReactNode } from 'react'
import type { Citation } from '../shared/types.ts'

interface Props {
    content: string
    citations: Citation[]
    pending: boolean
}

export function Answer({ content, citations, pending }: Props) {
    const [open, setOpen] = useState<number | null>(null)

    if (!content && pending) {
        return <p className="text-sm text-stone-400">Searching your sources…</p>
    }

    const cited = new Set<number>()
    for (const m of content.matchAll(/\[(\d+)\]/g)) cited.add(Number(m[1]))
    // Only show sources the answer actually leaned on, not everything retrieved.
    const used = citations.filter((c) => cited.has(c.marker))

    return (
        <div className="space-y-3">
            <div className="space-y-2.5 text-[15px] leading-relaxed text-stone-800">
                {renderBlocks(content, citations, setOpen)}
            </div>

            {used.length > 0 && (
                <div className="space-y-1.5 border-t border-bone-200 pt-3">
                    <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Sources</p>
                    {used.map((c) => (
                        <div key={c.marker}>
                            <button
                                onClick={() => setOpen(open === c.marker ? null : c.marker)}
                                className="flex w-full items-baseline gap-2 rounded px-1 py-1 text-left text-xs text-stone-600 hover:bg-bone-100"
                            >
                                <span className="font-mono text-clinical-700">[{c.marker}]</span>
                                <span className="flex-1">
                                    <span className="font-medium text-stone-700">{c.title}</span>
                                    {c.headingPath.length > 0 && (
                                        <span className="text-stone-500"> › {c.headingPath.join(' › ')}</span>
                                    )}
                                </span>
                                <span className="font-mono text-stone-400">{c.score.toFixed(2)}</span>
                            </button>
                            {open === c.marker && (
                                <p className="mx-1 mt-1 rounded border-l-2 border-clinical-600 bg-white px-3 py-2 text-xs leading-relaxed text-stone-600">
                                    {c.excerpt}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

/**
 * Deliberately minimal markdown renderer. The model is constrained to headings,
 * bullets, bold and inline code, so a full parser would be dependency weight we
 * do not need — and this keeps citation markers easy to make interactive.
 */
function renderBlocks(text: string, citations: Citation[], onCite: (n: number) => void): ReactNode[] {
    const blocks: ReactNode[] = []
    const lines = text.split('\n')
    let list: string[] = []

    const flushList = (key: number) => {
        if (list.length === 0) return
        blocks.push(
            <ul key={`ul-${key}`} className="ml-1 list-inside list-disc space-y-1">
                {list.map((item, i) => (
                    <li key={i}>{renderInline(item, citations, onCite)}</li>
                ))}
            </ul>,
        )
        list = []
    }

    lines.forEach((line, i) => {
        const trimmed = line.trim()
        const bullet = trimmed.match(/^[-*]\s+(.*)$/)
        const numbered = trimmed.match(/^\d+\.\s+(.*)$/)
        const heading = trimmed.match(/^(#{1,4})\s+(.*)$/)

        if (bullet || numbered) {
            list.push((bullet?.[1] ?? numbered?.[1])!)
            return
        }
        flushList(i)

        if (!trimmed) return
        if (heading) {
            blocks.push(
                <h3 key={i} className="pt-1 text-sm font-semibold text-stone-900">
                    {renderInline(heading[2]!, citations, onCite)}
                </h3>,
            )
            return
        }
        blocks.push(<p key={i}>{renderInline(trimmed, citations, onCite)}</p>)
    })

    flushList(lines.length)
    return blocks
}

/** Handles **bold**, `code`, and clickable [n] citation markers. */
function renderInline(text: string, citations: Citation[], onCite: (n: number) => void): ReactNode[] {
    const out: ReactNode[] = []
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g
    let last = 0
    let key = 0

    for (const match of text.matchAll(pattern)) {
        const idx = match.index
        if (idx > last) out.push(<Fragment key={key++}>{text.slice(last, idx)}</Fragment>)
        const token = match[0]

        if (token.startsWith('**')) {
            out.push(
                <strong key={key++} className="font-semibold text-stone-900">
                    {token.slice(2, -2)}
                </strong>,
            )
        } else if (token.startsWith('`')) {
            out.push(
                <code key={key++} className="rounded bg-bone-100 px-1 py-0.5 font-mono text-[0.85em]">
                    {token.slice(1, -1)}
                </code>,
            )
        } else {
            const n = Number(token.slice(1, -1))
            const known = citations.some((c) => c.marker === n)
            out.push(
                <button
                    key={key++}
                    onClick={() => known && onCite(n)}
                    title={known ? 'Show source' : 'Unknown citation'}
                    className={
                        known
                            ? 'mx-0.5 align-super font-mono text-[0.7em] text-clinical-700 hover:underline'
                            : 'mx-0.5 align-super font-mono text-[0.7em] text-red-500'
                    }
                >
                    [{n}]
                </button>,
            )
        }
        last = idx + token.length
    }

    if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
    return out
}
