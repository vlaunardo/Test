/** Metadata parsed from a source file's YAML frontmatter. */
export interface SourceMeta {
    /** Human-readable citation title, e.g. "Zarb-Bolender, Ch. 12". */
    title: string
    /** Optional author/edition line shown under the citation. */
    author?: string
    /** Optional topic tag used for filtered retrieval, e.g. "impressions". */
    topic?: string
    /** Free-form provenance note, e.g. "lecture 2024-03-11". */
    note?: string
}

/** A retrievable unit of text with everything needed to cite it. */
export interface Chunk {
    id: string
    /** Relative path of the file this came from. */
    file: string
    /** Ordinal position within the file, used for stable ordering. */
    ordinal: number
    /** Heading breadcrumb, e.g. ["Impression Procedures", "Border Moulding"]. */
    headingPath: string[]
    text: string
    meta: SourceMeta
}

/** A chunk plus its similarity score for a given query. */
export interface ScoredChunk extends Chunk {
    score: number
}

/** Citation surfaced to the UI alongside a streamed answer. */
export interface Citation {
    /** 1-based marker matching [1], [2] in the answer text. */
    marker: number
    title: string
    headingPath: string[]
    file: string
    score: number
    /** Short preview of the cited passage. */
    excerpt: string
}

export interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

/** Server-sent event payloads streamed from /api/chat. */
export type ChatEvent =
    | { type: 'citations'; citations: Citation[] }
    | { type: 'token'; text: string }
    | { type: 'done' }
    | { type: 'error'; message: string }
