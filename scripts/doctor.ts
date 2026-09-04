/** Preflight check: verifies every moving part before you debug the app itself. */
export {}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text'
const PROVIDER = (process.env.CHAT_PROVIDER || 'gemini').toLowerCase()

const ok = (m: string) => console.log(`  ok    ${m}`)
const bad = (m: string, fix: string) => {
    console.log(`  FAIL  ${m}\n        fix: ${fix}`)
    failures++
}
let failures = 0

console.log('\nOllama (embeddings)')
let tags: { models?: { name: string }[] } | null = null
try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`)
    tags = (await res.json()) as { models?: { name: string }[] }
    ok(`reachable at ${OLLAMA_HOST}`)
} catch {
    bad(`cannot reach ${OLLAMA_HOST}`, 'install from https://ollama.com/download then run "ollama serve"')
}

if (tags) {
    const names = (tags.models ?? []).map((m) => m.name)
    if (names.some((n) => n.startsWith(EMBED_MODEL))) ok(`embedding model "${EMBED_MODEL}" installed`)
    else bad(`embedding model "${EMBED_MODEL}" missing`, `ollama pull ${EMBED_MODEL}`)

    if (PROVIDER === 'ollama') {
        const chatModel = process.env.OLLAMA_CHAT_MODEL || 'qwen3:4b'
        if (names.some((n) => n.startsWith(chatModel))) ok(`chat model "${chatModel}" installed`)
        else bad(`chat model "${chatModel}" missing`, `ollama pull ${chatModel}`)
    }
}

console.log(`\nGeneration provider: ${PROVIDER}`)
const keyFor: Record<string, string> = {
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
}
const needed = keyFor[PROVIDER]
if (!needed) ok('no API key required (fully local)')
else if (process.env[needed]) ok(`${needed} is set`)
else {
    const where =
        PROVIDER === 'gemini' ? 'get a free key at https://aistudio.google.com/apikey' : `set ${needed} in .env`
    bad(`${needed} is not set`, where)
}

console.log('\nIndex')
try {
    const { openDb, countChunks } = await import('../server/store.ts')
    const n = countChunks(openDb())
    if (n > 0) ok(`${n} chunks indexed`)
    else bad('index is empty', 'add markdown to content/ then run "bun run ingest"')
} catch (err) {
    bad(`cannot open index (${err instanceof Error ? err.message : String(err)})`, 'run "bun run ingest"')
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
