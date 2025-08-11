# Echo Adversary — Technical Design Spec v1.0

A single‑page, voice‑first debate game where players spar with an adaptive AI “Echo” that mirrors, mutates, and counters their own arguments. This spec is print‑ready and implementation‑oriented.

---

## 1) Product Overview

**Elevator:** Speak your case on a hot take. Echo mirrors your cadence, flips your stance, adapts to your habits, and turns up the heat as you win. Chase streaks, daily challenges, and global leaderboards. Export snackable captioned clips for virality.

**Platforms:** Web (SPA/PWA), mobile web; future native wrappers optional.

**Target session length:** 2–5 minutes. **Round length:** 30–45s.

**KPIs:** D1/D7 retention, average streak length, share rate (% clips exported), TTS round‑trip time.

---

## 2) Core Loop

1. Draw topic (or daily).
2. Player speaks (≤20s).
3. STT + features extraction.
4. Echo generates rebuttal (10–15s) via LLM + TTS.
5. Scoring + feedback; streak/tiers adjust.
6. Share clip or play next round.

---

## 3) Game Modes

* **Quick Play:** Random topic from selected packs.
* **Daily Challenge:** Global seed (topic + constraint); unique badge; daily leaderboard.
* **Party Pack:** Curated categories (Food Fights, Tech Ethics, Pop Culture Courts).
* **Practice (Text Mode):** Accessibility mode (typing instead of voice).

---

## 4) Difficulty & Adaptation

**Tiers:** Calm → Keen → Cunning → Combative → Mastermind.
**Knobs:** `mirror_level 0–3`, `provocation_level 0–3`, `evidence_density 0–3`, `brevity_seconds`, `tactics[]`, `constraint_cards[]`.

**Per‑round feature vector (examples):**

* Prosody: words/min, pause ratio, pitch variance (if available), loudness curve.
* Rhetoric: list/triad frequency, analogies, questions, hedging, factuality markers (%, cites).
* Sentiment: valence, arousal; stance polarity & confidence.
* Quality hints: redundancy, filler density, topical drift.

**Escalation rules (summary):**

* Win ≥3 rounds in last 4 → increase tier; add constraint cards (e.g., “no negations,” “open with a metaphor”).
* Overuse of anecdotes → Echo demands methods; heavy stats → Echo attacks methodology.
* Fast confident pace → Echo responds with rapid “jab” lines and time squeeze.
* Excess hedging → Echo calls it out (safe provocation).

---

## 5) Safety & Moderation

* **Realtime inbound filter:** block/blur slurs, disallow harassment, hate, self‑harm, sexual content, violent threats.
* **Outbound guardrails:** Echo prompt forbids identity attacks; focuses on ideas.
* **Age gate:** 13+; PG‑13 prompts by default; optional “Spicy Topics” toggle with stricter guardrails.
* **Share gate:** Clip is moderated server‑side before a public link is minted.

---

## 6) Scoring Model

Composite of **Substance (45%)**, **Style (35%)**, **Control (20%)** — normalized 0–100.

* *Substance:* claim specificity, evidence count, contradiction detection.
* *Style:* clarity (readability proxy), pacing sweet spot, rhetorical variety, filler penalty.
* *Control:* topical drift, answer‑the‑question heuristic, non‑sequitur penalty.
  **Streak bonus:** +5 per consecutive win; decay on loss.

---

## 7) UX & Wireframes (ASCII)

### Home

```
┌──────────────── Echo Adversary ────────────────┐
│ [Daily Challenge: “Should AI write laws?” ▶ ]  │
│ Quick Play  Party Pack  Leaderboards  Clips    │
│ Topic Packs:  Food • Tech • Pop • Wild        │
└────────────────────────────────────────────────┘
```

### Match

```
┌──────── Topic: Pineapple on Pizza? ────────────┐
│ ●●● Streak: 3        Tier: Cunning             │
│        ⭕ Live mic ring (hold to speak)        │
│       “Hold to argue • 0:20 max”               │
│ Transcript: You: …   Echo: …                   │
│ [Rebuttal Meter][Style Meter][Control Meter]   │
│  [Share Clip]                   [Next ▶]       │
└────────────────────────────────────────────────┘
```

### Share Clip

```
┌──────────── Your Debate Clip ──────────────────┐
│ Audiogram preview • captions • title           │
│ [Download] [Copy Link] [TikTok] [Reels] [X]    │
└────────────────────────────────────────────────┘
```

---

## 8) Architecture

**Front‑end:** React (Vite), TypeScript, Web Audio API, MediaRecorder, WebCodecs (if available) for clip render, IndexedDB for local clips, PWA (offline shell for clips/boards).
**Back‑end:** Node/Express + WebSocket orchestration; REST for match/leaderboard/clip; background workers for AI calls; S3‑compatible storage.
**Databases:** PostgreSQL (auth, matches, scores, leaderboards); Redis (ephemeral sessions/queues).
**AI Services (pluggable):** STT, LLM (Echo brain), TTS (Echo voice), Moderation.

**Sequence (single round):**

1. Client records (≤20s) → WS upload chunks.
2. Server: moderation check → STT → features → difficulty knobs.
3. LLM generates Echo JSON → TTS → client playback URL.
4. Scoring → streak/tier update → return meters → optional clip compose.

---

## 9) API Contracts (v1)

Base URL: `/api/v1`

**Auth**

* `POST /auth/anon` → `{ userId, token }`
* `POST /auth/link` (optional email/device link)

**Match**

* `POST /matches` → `{ matchId, topic, tier, streak }`
* `WS /ws/match/:matchId`

  * Client→Server: `AUDIO_CHUNK { bytes }`, `AUDIO_END`
  * Server→Client: `TRANSCRIPT { text, timings }`, `ECHO_TTS_READY { url }`, `ROUND_SCORES { playerScore, echoScore, meters }`

**Leaderboards**

* `GET /leaderboards?period=daily|weekly|all&metric=streak|wins` → rows.

**Clips**

* `POST /clips` `{ matchId, roundId, meta }` → `{ clipId, uploadUrl }`
* `PUT uploadUrl` (video)
* `POST /clips/:id/publish` → `{ shareUrl }`

**Content**

* `GET /topics?pack=food&limit=50` → topic objects
* `GET /daily` → `{ topic, constraint, seed, resetAt }`

---

## 10) Data Model (DDL sketch)

```sql
create table users (
  id uuid primary key,
  handle text unique,
  country text,
  elo int default 1200,
  badges jsonb default '[]',
  created_at timestamptz default now()
);

create table matches (
  id uuid primary key,
  user_id uuid references users(id),
  topic_id text,
  tier int default 0,
  streak int default 0,
  started_at timestamptz default now(),
  ended_at timestamptz
);

create table rounds (
  id uuid primary key,
  match_id uuid references matches(id),
  idx int,
  user_text text,
  echo_text text,
  features jsonb,
  scores jsonb,
  created_at timestamptz default now()
);

create table clips (
  id uuid primary key,
  match_id uuid references matches(id),
  round_id uuid references rounds(id),
  url text,
  duration_ms int,
  share_hash text unique,
  published bool default false
);

create table leaderboards (
  id bigserial primary key,
  period text,
  metric text,
  user_id uuid references users(id),
  value int,
  computed_at date
);
```

---

## 11) Echo Brain (Prompting & Knobs)

**System prompt (succinct):**

> You are **Echo**, a sharp but civil debate adversary. Mirror the player’s structure and cadence, flip their stance, and escalate difficulty based on provided knobs. Push on *ideas*, not *identities*. No hate, harassment, threats, or sexual content. Keep answers within `brevity_seconds`.

**Tooling / JSON output schema:**

```json
{
  "stance": "oppose|support|nuanced",
  "summary": "12-20 words",
  "rebuttal": "<= brevity_seconds worth of speech",
  "tactics_used": ["mirror","socratic","reframe","time_squeeze"],
  "provocation_hint": "safe nudge phrasing",
  "safety_flags": []
}
```

**Difficulty mapping example:**

```json
{
  "mirror_level": 2,
  "provocation_level": 1,
  "evidence_density": 2,
  "brevity_seconds": 12,
  "tactics": ["mirror","socratic"],
  "constraint_cards": []
}
```

---

## 12) Scoring Heuristics (detail)

* **Evidence score:** count of concrete nouns + numerals + citation markers ÷ length; cap to 40.
* **Variety score:** presence of analogy, triad/list, rhetorical question (max +20).
* **Clarity:** readability proxy + redundancy penalty (max 40).
* **Rhythm:** WPM within 120–170 = +15; too fast/slow − up to 10.
* **Drift:** cosine similarity to topic keywords; low similarity → penalty up to 30.

---

## 13) Latency Budget (targets)

* **STT:** <900 ms
* **LLM:** <1200 ms
* **TTS:** <700 ms
* **Total Echo start:** <2.5 s from player stop.
  Fallback: stream partial transcript + partial TTS.

---

## 14) Client Engineering Notes

* **Recording:** `MediaRecorder` (Opus) 200 ms chunks; client VAD to trim leading/trailing silence.
* **Playback:** HTMLAudioElement for TTS; captions from Echo transcript; visualize with Canvas wave.
* **Clip Render:** WebCodecs if available; otherwise server render worker (FFmpeg).
* **PWA:** cache shell; offline viewing of saved clips and boards.

---

## 15) Server Engineering Notes

* **WS protocol:** binary for audio chunks; JSON control messages; backpressure handling.
* **Queues:** Redis streams for STT→LLM→TTS pipeline; retry on transient failures.
* **Moderation:** dual pass (live + pre‑publish).
* **Storage:** S3‑compatible with signed URLs; lifecycle policy to cold storage after 30 days.

---

## 16) Telemetry & Analytics

Events: `round_start`, `round_end`, `echo_latency`, `clip_export`, `share_click`, `daily_join`, `tier_up`, `streak_break`.
Dashboards: retention, funnel (record→echo→score), latency heatmap, clip CTR.

---

## 17) QA Plan

* Voice device matrix (iOS/Android/desktop; Bluetooth/wired).
* Network throttling (3G/LTE).
* Guardrail tests: red‑team prompts; toxicity regression.
* Load test WS (1k concurrent).

---

## 18) Roadmap (90 days)

**MVP (Weeks 1–4):** Quick Play, two topic packs, single Echo voice, local clips, basic leaderboards.
**Beta (Weeks 5–8):** Daily Challenge, constraint cards, server clip render, share links.
**Launch (Weeks 9–12):** Seasons, creator mode (custom topics), cosmetics, A/B clip styles.

---

## 19) Risks & Mitigations

* **AI latency** → stream partials; cache TTS voice; prewarm LLM.
* **Safety leaks** → layered moderation; test suites; conservative prompts.
* **Virality fatigue** → rotate clip templates; seasonal themes; creator packs.
* **Browser quirks** → feature detect; fallbacks for WebCodecs.

---

## 20) Acceptance Criteria (MVP)

* End‑to‑end round completes <3s echo start 95th percentile.
* Streaks persist across matches; tier adjusts per rules.
* Exportable clip (≤20s) with captions & title card.
* Daily seed stable across users; resets at 00:00 UTC.
* Safety: zero blocked categories in outbound QA suite.

---

## 21) Appendix — Sample Prompts & Tactics

**Tactic library (snippets):**

* *Mirror & Flip:* “Match their numbered structure; counter each point crisply in one sentence.”
* *Socratic:* “Ask one pointed question that exposes a hidden assumption.”
* *Reframe:* “Shift the axis (cost → externalities, taste → liberty).”
* *Time‑squeeze:* “Deliver 3 fast jabs; no sentence > 8 words.”
* *Safe Provocation:* “Call out hedging or cherry‑picking without personal attack.”

**Content policy footnote:** Always attack *ideas*, never *identities*. Enforce no‑go lists.

---

*End of Spec v1.0*

