import { embedOne } from './embed.ts'
import { getProvider } from './providers.ts'
import { openDb, search, countChunks } from './store.ts'
import { SYSTEM_PROMPT, buildRetrievalQuery, buildUserMessage, toCitations } from './rag.ts'
import type { ChatEvent, ChatMessage } from '../shared/types.ts'

const PORT = Number(process.env.PORT || 3001)
const TOP_K = Number(process.env.RETRIEVAL_TOP_K || 6)
const MIN_SCORE = Number(process.env.MIN_SCORE || 0.35)

const db = openDb()

function sse(event: ChatEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`
}

async function handleChat(req: Request): Promise<Response> {
    const body = (await req.json()) as { messages?: ChatMessage[] }
    const messages = body.messages ?? []
    const question = messages.at(-1)?.content?.trim()

    if (!question) {
        return Response.json({ error: 'No question provided.' }, { status: 400 })
    }
    if (countChunks(db) === 0) {
        return Response.json(
            { error: 'The knowledge base is empty. Add markdown to content/ and run "bun run ingest".' },
            { status: 409 },
        )
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (e: ChatEvent) => controller.enqueue(encoder.encode(sse(e)))
            try {
                const retrievalQuery = buildRetrievalQuery(question, messages.slice(0, -1))
                const queryVec = await embedOne(retrievalQuery)
                const hits = search(db, queryVec, TOP_K, MIN_SCORE)

                // Citations go first so the UI can render sources while text streams.
                send({ type: 'citations', citations: toCitations(hits) })

                const provider = getProvider()
                const grounded: ChatMessage[] = [
                    ...messages.slice(0, -1),
                    { role: 'user', content: buildUserMessage(question, hits) },
                ]

                for await (const token of provider.stream({ system: SYSTEM_PROMPT, messages: grounded })) {
                    send({ type: 'token', text: token })
                }
                send({ type: 'done' })
            } catch (err) {
                send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
            } finally {
                controller.close()
            }
        },
    })

    return new Response(stream, {
        headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
        },
    })
}

Bun.serve({
    port: PORT,
    idleTimeout: 240, // Local models can be slow to emit a first token.
    routes: {
        '/api/health': () =>
            Response.json({
                ok: true,
                chunks: countChunks(db),
                provider: process.env.CHAT_PROVIDER || 'gemini',
                embedModel: process.env.EMBED_MODEL || 'nomic-embed-text',
            }),
        '/api/chat': { POST: handleChat },
    },
    fetch: () => new Response('Not found', { status: 404 }),
})

console.log(`tutor api  →  http://localhost:${PORT}`)
console.log(`corpus     →  ${countChunks(db)} chunks indexed`)
console.log(`provider   →  ${process.env.CHAT_PROVIDER || 'gemini'}`)
