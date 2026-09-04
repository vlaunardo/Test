const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text'

export class EmbeddingError extends Error {
    override name = 'EmbeddingError'
}

/**
 * Embeds text locally via Ollama. Runs on CPU in a few ms per chunk, which is
 * why embeddings stay local even when generation is remote.
 */
export async function embed(inputs: string[]): Promise<Float32Array[]> {
    if (inputs.length === 0) return []

    let res: Response
    try {
        res = await fetch(`${OLLAMA_HOST}/api/embed`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
        })
    } catch (cause) {
        throw new EmbeddingError(
            `Cannot reach Ollama at ${OLLAMA_HOST}. Is it running? Start it with "ollama serve".`,
            { cause },
        )
    }

    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        if (res.status === 404 && detail.includes('not found')) {
            throw new EmbeddingError(`Embedding model "${EMBED_MODEL}" is not installed. Run: ollama pull ${EMBED_MODEL}`)
        }
        throw new EmbeddingError(`Ollama embed failed (${res.status}): ${detail.slice(0, 200)}`)
    }

    const json = (await res.json()) as { embeddings?: number[][] }
    if (!json.embeddings || json.embeddings.length !== inputs.length) {
        throw new EmbeddingError('Ollama returned an unexpected embedding payload.')
    }
    return json.embeddings.map((v) => normalize(Float32Array.from(v)))
}

export async function embedOne(input: string): Promise<Float32Array> {
    const [vec] = await embed([input])
    if (!vec) throw new EmbeddingError('Embedding returned no vector.')
    return vec
}

/**
 * Scales a vector to unit length so cosine similarity reduces to a plain dot
 * product at query time. We store only normalized vectors.
 */
export function normalize(v: Float32Array): Float32Array {
    let sum = 0
    for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!
    const mag = Math.sqrt(sum)
    if (mag === 0) return v
    for (let i = 0; i < v.length; i++) v[i] = v[i]! / mag
    return v
}

/** Dot product of two unit vectors == cosine similarity. */
export function dot(a: Float32Array, b: Float32Array): number {
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!
    return sum
}
