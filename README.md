# Complete Denture Tutor

A local-first study companion for complete denture prosthodontics. You curate the knowledge; the tutor grounds every answer in your sources with inline citations.

## What it does

- **Cited Q&A chat** — ask anything; answers are built strictly from your notes with `[1]`, `[2]` markers you can click to verify.
- **Strict grounding** — if the answer isn't in your corpus, it says so. No fabricated temperatures, dosages, or techniques.
- **Local embeddings** — your knowledge never leaves the machine. `nomic-embed-text` runs on CPU in milliseconds.
- **Swappable generation** — fully local (Ollama, ~35s/answer on CPU) or cloud (Gemini free tier, ~2s/answer). Flip one env var.

## Quick start

```bash
cd denture-tutor
bun install
bun run ingest          # builds the index from content/
bun run dev             # starts API + web UI at http://localhost:5173
```

## Adding your knowledge

Drop Markdown files into `content/`. Each file needs a small YAML frontmatter:

```markdown
---
title: "Zarb-Bolender, Ch. 12: Impression Procedures"
author: "Zarb, Bolender, et al. (13th ed.)"
topic: "impressions"
note: "lecture 2024-03-11"
---

# Border Moulding

The purpose of border moulding is to…
```

**Why this format?**

- `title` becomes the citation label in answers.
- `headingPath` (from `#`, `##`, `###`) is preserved per chunk, so you see exactly which section a fact came from.
- `topic` lets you filter later if you want per-topic study modes.
- The chunker never splits across headings, so a citation always points to a coherent clinical concept.

After adding files:

```bash
bun run ingest
```

## Generation provider

Controlled by `CHAT_PROVIDER` in `.env`:

| Value    | Speed (this machine) | Requirements          |
|----------|---------------------|-----------------------|
| `ollama` | ~35–70 s            | Ollama running locally |
| `gemini` | ~2–4 s              | Free key from [aistudio.google.com](https://aistudio.google.com/apikey) |
| `openai` | ~3–5 s              | Paid API key          |
| `anthropic` | ~3–5 s           | Paid API key          |

The default `.env` ships with `CHAT_PROVIDER=ollama` so it works immediately. Change to `gemini` for speed; no code changes.

## Commands

| Command            | Purpose                              |
|--------------------|--------------------------------------|
| `bun run dev`      | Start API + web UI (hot reload)      |
| `bun run ingest`   | Rebuild index from `content/`        |
| `bun run doctor`   | Preflight: Ollama, models, index     |
| `bun run build`    | Production build                     |

## Safety note

This is a **study aid**, not a clinical decision tool. It only knows what you put in `content/`. Verify every citation before relying on it for patient care.

## File map (if you want to extend)

```
content/           ← your markdown sources (you edit this)
data/index.sqlite  ← vector index (auto-built)
scripts/ingest.ts  ← chunk → embed → index pipeline
scripts/doctor.ts  ← health checks
server/
  embed.ts         ← Ollama embeddings (local, CPU)
  store.ts         ← SQLite + brute-force cosine search
  providers.ts     ← LLM provider abstraction (gemini/ollama/openai/anthropic)
  rag.ts           ← grounding prompt + citation formatting
  index.ts         ← Bun server + /api/chat (SSE streaming)
shared/
  chunk.ts         ← Markdown chunker with heading breadcrumbs
  types.ts         ← shared TS types
src/
  App.tsx          ← chat UI
  Answer.tsx       ← markdown rendering + clickable citations
```

## Extending

- **Quiz/MCQ generation** — add a `/api/quiz` endpoint that samples chunks and asks the LLM to write exam-style stems.
- **Spaced repetition** — persist `(chunkId, easeFactor, interval)` per user; surface due cards at session start.
- **Clinical cases** — author a JSON schema for cases (patient vignette, correct plan) and add a case mode that evaluates your plan against the rubric.

All of these reuse the same retrieval + grounding layer.