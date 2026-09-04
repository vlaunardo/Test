/**
 * Minimal YAML frontmatter parser. Supports flat `key: value` pairs only,
 * which is all our source metadata needs. Avoids a YAML dependency.
 */
export function parseFrontmatter(raw) {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match)
        return { meta: {}, body: raw };
    const meta = {};
    for (const line of match[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
        if (!kv)
            continue;
        // Strip matching surrounding quotes if present.
        meta[kv[1]] = kv[2].trim().replace(/^["'](.*)["']$/, '$1');
    }
    return { meta: meta, body: raw.slice(match[0].length) };
}
const MAX_CHARS = 1100;
const OVERLAP_CHARS = 150;
/**
 * Splits markdown into chunks that never cross a heading boundary, so each
 * chunk carries an accurate heading breadcrumb for citation. Sections longer
 * than MAX_CHARS are split on paragraph/sentence boundaries with overlap so a
 * fact spanning the split point stays retrievable from either side.
 */
export function chunkMarkdown(file, raw) {
    const { meta, body } = parseFrontmatter(raw);
    const title = meta.title?.trim() || file.replace(/\.md$/i, '');
    const sourceMeta = {
        title,
        ...(meta.author ? { author: meta.author } : {}),
        ...(meta.topic ? { topic: meta.topic } : {}),
        ...(meta.note ? { note: meta.note } : {}),
    };
    const chunks = [];
    let ordinal = 0;
    const push = (headingPath, text) => {
        const trimmed = text.trim();
        // Drop fragments too small to carry meaning on their own.
        if (trimmed.length < 40)
            return;
        chunks.push({
            id: `${file}#${ordinal}`,
            file,
            ordinal: ordinal++,
            headingPath: [...headingPath],
            text: trimmed,
            meta: sourceMeta,
        });
    };
    // Walk lines, tracking the active heading stack and accumulating body text.
    const headingStack = [];
    let buffer = [];
    let bufferPath = [];
    const flush = () => {
        if (buffer.length === 0)
            return;
        for (const part of splitLong(buffer.join('\n')))
            push(bufferPath, part);
        buffer = [];
    };
    for (const line of body.split(/\r?\n/)) {
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            flush();
            const depth = heading[1].length;
            headingStack.length = Math.min(headingStack.length, depth - 1);
            headingStack[depth - 1] = heading[2].trim();
            // Fill any gaps left by skipped heading levels.
            for (let i = 0; i < depth; i++)
                headingStack[i] ??= '';
            bufferPath = headingStack.filter(Boolean);
            continue;
        }
        if (buffer.length === 0)
            bufferPath = headingStack.filter(Boolean);
        buffer.push(line);
    }
    flush();
    return chunks;
}
/** Splits an oversized section into overlapping windows on natural boundaries. */
function splitLong(text) {
    if (text.length <= MAX_CHARS)
        return [text];
    // Prefer paragraph breaks; fall back to sentence ends for dense prose.
    const units = text.split(/\n{2,}/).flatMap((p) => (p.length <= MAX_CHARS ? [p] : p.split(/(?<=[.!?])\s+/)));
    const out = [];
    let current = '';
    for (const unit of units) {
        if (current && current.length + unit.length + 2 > MAX_CHARS) {
            out.push(current);
            const tail = current.slice(-OVERLAP_CHARS);
            // Resume from a word boundary so the overlap reads cleanly.
            current = tail.slice(tail.search(/\s/) + 1);
        }
        current = current ? `${current}\n\n${unit}` : unit;
    }
    if (current.trim())
        out.push(current);
    return out;
}
