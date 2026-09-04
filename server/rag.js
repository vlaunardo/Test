/**
 * Strict grounding contract. This is a study aid for a clinical subject, so
 * silence is preferable to a confident invention: a fabricated impression
 * technique or occlusal principle would be actively harmful to revise from.
 */
export const SYSTEM_PROMPT = `You are a focused study tutor for COMPLETE DENTURE prosthodontics.

You answer strictly from the numbered SOURCES supplied in the user message.

Hard rules:
1. Use ONLY facts present in the SOURCES. Never add clinical detail from your own
   general knowledge, even if you believe it is correct.
2. Cite every factual claim with a marker matching the source number, like [1] or [2][3].
   Place the marker at the end of the sentence it supports.
3. If the SOURCES do not answer the question, say exactly what is missing and
   suggest what the student should add to their notes. Do NOT guess or fill gaps.
4. If the SOURCES conflict, surface the disagreement rather than silently picking one.
5. Never invent a citation marker that does not correspond to a supplied source.

Teaching style:
- Lead with a direct answer, then explain the reasoning behind it.
- Prefer short paragraphs and tight bullet lists over dense prose.
- Bold the key terms a student would be examined on.
- Where a source gives a clinical rationale ("why"), always include it — understanding
  beats memorisation.
- End with one short "Check yourself" question ONLY when the answer covered enough
  ground to make it worthwhile.`;
/** Formats retrieved chunks into the numbered SOURCES block the prompt expects. */
export function buildContext(chunks) {
    return chunks
        .map((c, i) => {
        const where = c.headingPath.length ? ` > ${c.headingPath.join(' > ')}` : '';
        return `[${i + 1}] ${c.meta.title}${where}\n${c.text}`;
    })
        .join('\n\n---\n\n');
}
export function buildUserMessage(question, chunks) {
    if (chunks.length === 0) {
        return `SOURCES:\n(none matched this question)\n\nQUESTION: ${question}`;
    }
    return `SOURCES:\n\n${buildContext(chunks)}\n\n---\n\nQUESTION: ${question}`;
}
export function toCitations(chunks) {
    return chunks.map((c, i) => ({
        marker: i + 1,
        title: c.meta.title,
        headingPath: c.headingPath,
        file: c.file,
        score: Number(c.score.toFixed(3)),
        excerpt: c.text.length > 320 ? `${c.text.slice(0, 320).trimEnd()}…` : c.text,
    }));
}
/**
 * Rewrites a follow-up into a standalone query. Retrieval embeds the query in
 * isolation, so "what about the lower one?" would otherwise match nothing
 * useful. Prepending recent context is a cheap, dependency-free stand-in for a
 * dedicated query-rewriting model call.
 */
export function buildRetrievalQuery(question, history) {
    const recentUser = history
        .filter((m) => m.role === 'user')
        .slice(-2)
        .map((m) => m.content);
    if (recentUser.length === 0 || question.length > 80)
        return question;
    return [...recentUser, question].join('\n');
}
