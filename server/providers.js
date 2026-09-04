export class ProviderError extends Error {
    name = 'ProviderError';
}
/** Reads an SSE body and yields each `data:` payload as parsed JSON. */
async function* sseJson(res) {
    const reader = res.body?.getReader();
    if (!reader)
        throw new ProviderError('Response had no body to stream.');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        // SSE events are separated by a blank line; keep the trailing partial.
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';
        for (const event of events) {
            const data = event
                .split(/\r?\n/)
                .filter((l) => l.startsWith('data:'))
                .map((l) => l.slice(5).trim())
                .join('');
            if (!data || data === '[DONE]')
                continue;
            try {
                yield JSON.parse(data);
            }
            catch {
                // Ignore keep-alive comments and malformed partial frames.
            }
        }
    }
}
/** Reads newline-delimited JSON (Ollama's streaming format). */
async function* ndjson(res) {
    const reader = res.body?.getReader();
    if (!reader)
        throw new ProviderError('Response had no body to stream.');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                yield JSON.parse(line);
            }
            catch {
                // Skip partial frames.
            }
        }
    }
}
const gemini = () => ({
    name: 'gemini',
    async *stream({ system, messages }) {
        const key = process.env.GEMINI_API_KEY;
        if (!key) {
            throw new ProviderError('GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey');
        }
        const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents: messages.map((m) => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }],
                })),
                // Low temperature: this is factual recall, not creative writing.
                generationConfig: { temperature: 0.2, maxOutputTokens: 1600 },
            }),
        });
        if (!res.ok) {
            throw new ProviderError(`Gemini request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
        }
        for await (const evt of sseJson(res)) {
            const parts = evt.candidates?.[0]?.content?.parts;
            for (const p of parts ?? [])
                if (p.text)
                    yield p.text;
        }
    },
});
const ollama = () => ({
    name: 'ollama',
    async *stream({ system, messages }) {
        const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
        const model = process.env.OLLAMA_CHAT_MODEL || 'llama3.2:3b';
        // Reasoning models burn minutes of CPU on hidden thinking tokens before
        // the first visible word. Disable it — retrieval already did the work.
        // The flag is rejected by models without the capability, so send it
        // only to families known to support thinking.
        const thinkingCapable = /qwen3|deepseek-r1|glm|gpt-oss|magistral/i.test(model);
        const res = await fetch(`${host}/api/chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                model,
                stream: true,
                options: { temperature: 0.2 },
                ...(thinkingCapable ? { think: false } : {}),
                messages: [{ role: 'system', content: system }, ...messages],
            }),
        });
        if (!res.ok) {
            throw new ProviderError(`Ollama chat failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
        }
        for await (const evt of ndjson(res)) {
            const text = evt.message?.content;
            if (text)
                yield text;
        }
    },
});
const openai = () => ({
    name: 'openai',
    async *stream({ system, messages }) {
        const key = process.env.OPENAI_API_KEY;
        if (!key)
            throw new ProviderError('OPENAI_API_KEY is not set.');
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                stream: true,
                temperature: 0.2,
                messages: [{ role: 'system', content: system }, ...messages],
            }),
        });
        if (!res.ok) {
            throw new ProviderError(`OpenAI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
        }
        for await (const evt of sseJson(res)) {
            const text = evt.choices?.[0]?.delta?.content;
            if (text)
                yield text;
        }
    },
});
const anthropic = () => ({
    name: 'anthropic',
    async *stream({ system, messages }) {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key)
            throw new ProviderError('ANTHROPIC_API_KEY is not set.');
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
                max_tokens: 1600,
                temperature: 0.2,
                system,
                stream: true,
                messages,
            }),
        });
        if (!res.ok) {
            throw new ProviderError(`Anthropic request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
        }
        for await (const evt of sseJson(res)) {
            const e = evt;
            if (e.type === 'content_block_delta' && e.delta?.text)
                yield e.delta.text;
        }
    },
});
const REGISTRY = { gemini, ollama, openai, anthropic };
export function getProvider() {
    const name = (process.env.CHAT_PROVIDER || 'gemini').toLowerCase();
    const factory = REGISTRY[name];
    if (!factory) {
        throw new ProviderError(`Unknown CHAT_PROVIDER "${name}". Valid: ${Object.keys(REGISTRY).join(', ')}`);
    }
    return factory();
}
