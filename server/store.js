import { Database } from 'bun:sqlite';
import { dot } from './embed.ts';
const DB_PATH = new URL('../data/index.sqlite', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
export function openDb() {
    const db = new Database(DB_PATH, { create: true });
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(`
        CREATE TABLE IF NOT EXISTS chunks (
            id           TEXT PRIMARY KEY,
            file         TEXT NOT NULL,
            ordinal      INTEGER NOT NULL,
            heading_path TEXT NOT NULL,
            text         TEXT NOT NULL,
            meta         TEXT NOT NULL,
            embedding    BLOB NOT NULL
        )
    `);
    return db;
}
function toChunk(row) {
    return {
        id: row.id,
        file: row.file,
        ordinal: row.ordinal,
        headingPath: JSON.parse(row.heading_path),
        text: row.text,
        meta: JSON.parse(row.meta),
    };
}
export function replaceAll(db, chunks, embeddings) {
    const insert = db.prepare(`INSERT INTO chunks (id, file, ordinal, heading_path, text, meta, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?)`);
    // Wrap in a transaction: without it SQLite fsyncs per row and ingest crawls.
    const write = db.transaction(() => {
        db.exec('DELETE FROM chunks');
        for (let i = 0; i < chunks.length; i++) {
            const c = chunks[i];
            insert.run(c.id, c.file, c.ordinal, JSON.stringify(c.headingPath), c.text, JSON.stringify(c.meta), new Uint8Array(embeddings[i].buffer.slice(0)));
        }
    });
    write();
}
/** Cached corpus so we deserialize vectors once, not on every question. */
let cache = null;
export function loadCorpus(db) {
    if (cache)
        return cache;
    const rows = db.query('SELECT * FROM chunks ORDER BY file, ordinal').all();
    cache = {
        chunks: rows.map(toChunk),
        vectors: rows.map((r) => new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)),
    };
    return cache;
}
export function invalidateCache() {
    cache = null;
}
/**
 * Brute-force cosine search. At corpus sizes typical for a textbook chapter set
 * (single-digit thousands of chunks) this scans in ~5ms, so an ANN index would
 * add dependency weight for no measurable gain.
 */
export function search(db, queryVec, topK, minScore) {
    const { chunks, vectors } = loadCorpus(db);
    const scored = [];
    for (let i = 0; i < chunks.length; i++) {
        const score = dot(queryVec, vectors[i]);
        if (score >= minScore)
            scored.push({ ...chunks[i], score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}
export function countChunks(db) {
    return db.query('SELECT COUNT(*) AS n FROM chunks').get().n;
}
