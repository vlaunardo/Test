import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, useState } from 'react';
export function Answer({ content, citations, pending }) {
    const [open, setOpen] = useState(null);
    if (!content && pending) {
        return _jsx("p", { className: "text-sm text-stone-400", children: "Searching your sources\u2026" });
    }
    const cited = new Set();
    for (const m of content.matchAll(/\[(\d+)\]/g))
        cited.add(Number(m[1]));
    // Only show sources the answer actually leaned on, not everything retrieved.
    const used = citations.filter((c) => cited.has(c.marker));
    return (_jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "space-y-2.5 text-[15px] leading-relaxed text-stone-800", children: renderBlocks(content, citations, setOpen) }), used.length > 0 && (_jsxs("div", { className: "space-y-1.5 border-t border-bone-200 pt-3", children: [_jsx("p", { className: "text-xs font-medium tracking-wide text-stone-500 uppercase", children: "Sources" }), used.map((c) => (_jsxs("div", { children: [_jsxs("button", { onClick: () => setOpen(open === c.marker ? null : c.marker), className: "flex w-full items-baseline gap-2 rounded px-1 py-1 text-left text-xs text-stone-600 hover:bg-bone-100", children: [_jsxs("span", { className: "font-mono text-clinical-700", children: ["[", c.marker, "]"] }), _jsxs("span", { className: "flex-1", children: [_jsx("span", { className: "font-medium text-stone-700", children: c.title }), c.headingPath.length > 0 && (_jsxs("span", { className: "text-stone-500", children: [" \u203A ", c.headingPath.join(' › ')] }))] }), _jsx("span", { className: "font-mono text-stone-400", children: c.score.toFixed(2) })] }), open === c.marker && (_jsx("p", { className: "mx-1 mt-1 rounded border-l-2 border-clinical-600 bg-white px-3 py-2 text-xs leading-relaxed text-stone-600", children: c.excerpt }))] }, c.marker)))] }))] }));
}
/**
 * Deliberately minimal markdown renderer. The model is constrained to headings,
 * bullets, bold and inline code, so a full parser would be dependency weight we
 * do not need — and this keeps citation markers easy to make interactive.
 */
function renderBlocks(text, citations, onCite) {
    const blocks = [];
    const lines = text.split('\n');
    let list = [];
    const flushList = (key) => {
        if (list.length === 0)
            return;
        blocks.push(_jsx("ul", { className: "ml-1 list-inside list-disc space-y-1", children: list.map((item, i) => (_jsx("li", { children: renderInline(item, citations, onCite) }, i))) }, `ul-${key}`));
        list = [];
    };
    lines.forEach((line, i) => {
        const trimmed = line.trim();
        const bullet = trimmed.match(/^[-*]\s+(.*)$/);
        const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
        const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
        if (bullet || numbered) {
            list.push((bullet?.[1] ?? numbered?.[1]));
            return;
        }
        flushList(i);
        if (!trimmed)
            return;
        if (heading) {
            blocks.push(_jsx("h3", { className: "pt-1 text-sm font-semibold text-stone-900", children: renderInline(heading[2], citations, onCite) }, i));
            return;
        }
        blocks.push(_jsx("p", { children: renderInline(trimmed, citations, onCite) }, i));
    });
    flushList(lines.length);
    return blocks;
}
/** Handles **bold**, `code`, and clickable [n] citation markers. */
function renderInline(text, citations, onCite) {
    const out = [];
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g;
    let last = 0;
    let key = 0;
    for (const match of text.matchAll(pattern)) {
        const idx = match.index;
        if (idx > last)
            out.push(_jsx(Fragment, { children: text.slice(last, idx) }, key++));
        const token = match[0];
        if (token.startsWith('**')) {
            out.push(_jsx("strong", { className: "font-semibold text-stone-900", children: token.slice(2, -2) }, key++));
        }
        else if (token.startsWith('`')) {
            out.push(_jsx("code", { className: "rounded bg-bone-100 px-1 py-0.5 font-mono text-[0.85em]", children: token.slice(1, -1) }, key++));
        }
        else {
            const n = Number(token.slice(1, -1));
            const known = citations.some((c) => c.marker === n);
            out.push(_jsxs("button", { onClick: () => known && onCite(n), title: known ? 'Show source' : 'Unknown citation', className: known
                    ? 'mx-0.5 align-super font-mono text-[0.7em] text-clinical-700 hover:underline'
                    : 'mx-0.5 align-super font-mono text-[0.7em] text-red-500', children: ["[", n, "]"] }, key++));
        }
        last = idx + token.length;
    }
    if (last < text.length)
        out.push(_jsx(Fragment, { children: text.slice(last) }, key++));
    return out;
}
