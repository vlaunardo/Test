import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { chunkMarkdown } from '../shared/chunk.ts';
import { embed } from '../server/embed.ts';
import { openDb, replaceAll } from '../server/store.ts';
const CONTENT_DIR = new URL('../content/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BATCH = 16;
async function markdownFiles(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory())
            out.push(...(await markdownFiles(full)));
        else if (/\.md$/i.test(entry.name))
            out.push(full);
    }
    return out;
}
const files = await markdownFiles(CONTENT_DIR);
if (files.length === 0) {
    console.error('No markdown found in content/. Add source notes first.');
    process.exit(1);
}
const chunks = [];
for (const file of files) {
    const rel = relative(CONTENT_DIR, file).replace(/\\/g, '/');
    const found = chunkMarkdown(rel, await Bun.file(file).text());
    chunks.push(...found);
    console.log(`  ${rel} → ${found.length} chunks`);
}
console.log(`\nEmbedding ${chunks.length} chunks…`);
const vectors = [];
const started = Date.now();
for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    // Prepending the heading breadcrumb gives the vector topical context that
    // the chunk body alone may lack (e.g. a bare list of steps).
    vectors.push(...(await embed(batch.map((c) => (c.headingPath.length ? `${c.headingPath.join(' > ')}\n\n${c.text}` : c.text)))));
    process.stdout.write(`\r  ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
}
const db = openDb();
replaceAll(db, chunks, vectors);
console.log(`\n\nIndexed ${chunks.length} chunks from ${files.length} file(s) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log('Run "bun run dev" to start studying.');
