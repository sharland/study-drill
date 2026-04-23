# Product Commercialisation Design
**Date:** 2026-04-23
**Status:** Design confirmed, pending Phase 1 implementation plan

---

## Context

study-drill.html is a single-file, zero-build study app that has proven its core concept through personal use (user passed their target exam). The goal now is to shift it into a marketable, maintainable web product. Key constraints: solo operator, minimum overhead costs, turnkey infrastructure wherever possible, Claude as primary development co-pilot.

---

## North Star

A **web-first** study tool built on managed services, sold as a **one-time purchase**, with **no AI inference costs** for the developer (Phase 2 BYOAI model). Cloud sync and cross-device history are included from day one in the architecture, even if not prominently advertised at v1 launch. Mobile (iOS/Android via React Native) is a future path, not a v1 concern.

---

## Stack

| Concern | Service | Why |
|---|---|---|
| Framework | Next.js (React) | SSR, API routes, SEO, React Native path later |
| Auth | Supabase Auth | Google + Apple OAuth built-in, managed |
| Database | Supabase PostgreSQL | JSONB for deck content, relational for history |
| Real-time sync | Supabase real-time | Cross-device sync nearly free given auth is already there |
| Payment | Stripe Checkout | One-time purchase, turnkey UI, no card handling needed |
| Hosting | Vercel | Zero-config Next.js deploys, generous free tier |

---

## Architecture

```
Browser (Next.js React app)
    │
    ├── Vercel (hosting + edge functions)
    │       │
    │       ├── Supabase (auth + database + real-time)
    │       │       ├── Auth: Google OAuth, Apple OAuth
    │       │       ├── PostgreSQL: users, decks, sessions, srs_state
    │       │       └── Real-time: cross-device sync
    │       │
    │       └── Stripe (one-time payment)
    │               └── Checkout: purchase gate
    │
    └── localStorage (not used in v1 — Supabase is the store)
```

**Purchase flow:** Landing page → Stripe Checkout → payment confirmed → Supabase account created + `has_paid = true` → user enters app.

**Return login flow:** Google or Apple OAuth → Supabase checks `has_paid` → full app (paid) or locked page with support contact (unpaid/refunded).

**Study flow:** Select deck → study session → on completion write `sessions` row + update `srs_state` → history panel reflects immediately across all devices.

---

## Data Model

Five tables. Deck content stays as JSONB — imported whole, never queried card-by-card. History and SRS state are always separate from deck content (decks must remain clean and shareable).

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID | Supabase Auth managed |
| email | text | |
| has_paid | boolean | Set true on purchase confirmation |
| created_at | timestamptz | |

### `purchases`
| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| user_id | UUID FK | |
| stripe_payment_intent_id | text | |
| purchased_at | timestamptz | |

### `decks`
| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| user_id | UUID FK | |
| name | text | |
| type | text | `'flashcard'` or `'mcq'` |
| content | JSONB | Cards/questions array — same shape as current JSON files |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `sessions`
| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| user_id | UUID FK | |
| deck_id | UUID FK | |
| type | text | `'flashcard'` or `'mcq'` |
| started_at | timestamptz | |
| completed_at | timestamptz | |
| cards_total | integer | |
| cards_correct | integer | |

### `srs_state`
| Column | Type | Notes |
|---|---|---|
| user_id | UUID FK | Composite PK: user_id + deck_id + card_id |
| deck_id | UUID FK | |
| card_id | text | Matches `id` field in deck content JSONB |
| box | integer | 1–3 (Leitner boxes) |
| last_seen_at | timestamptz | |

> **Note:** Schema adjustments are expected during smoke testing. Supabase migrations make this low-cost.

---

## User Flows

1. **Purchase + account creation** — Landing page → Buy → Stripe Checkout → account created → app access granted
2. **Return login** — OAuth login → `has_paid` check → full app or locked page
3. **Deck management** — Import JSON (validated, saved to `decks`) or create via guided wizard (no raw JSON visible to user)
4. **Study session** — Select deck → study → completion writes `sessions` + updates `srs_state` → history panel updates

---

## Migration Strategy + Phase Sequencing

### Phase 1 — Foundation
Set up Next.js, Supabase, Stripe, Vercel. Wire Google + Apple OAuth. Implement purchase gate. **Deliverable:** Working login + paywall with no study features yet. Validates infrastructure before touching study logic.

### Phase 2 — App Migration
Decompose `study-drill.html` into Next.js components. Replace localStorage with Supabase reads/writes. All existing features (flashcard drill, MCQ quiz, history panel, Leitner SRS) work as today but database-backed. **Deliverable:** Current product, properly hosted, behind paywall.

### Phase 3 — New Features
- Deck creation wizard (guided form, no raw JSON visible to user)
- Cloud sync made visible to user (cross-device history callout)
- Polish: onboarding flow, empty states, error handling, landing/marketing page

### Phase 4 — AI Integration (BYOAI)
Slot AI layer behind deck creation wizard when provider OAuth permits. No schema or structural changes required — designed to receive this from day one.

---

## What Is Preserved Exactly

The Leitner SRS algorithm, MCQ quiz flow, scoring logic, and history panel are **rehoused, not rewritten**. These are the product's core value and must not change behaviour.

---

## Decisions Deferred

- **BYOAI OAuth mechanism** — blocked by Anthropic's closed ecosystem and OpenAI's limited third-party OAuth. Do not rely on API key pasting (too much friction for consumers). Revisit when providers open up. The app must stand on its own merits without this.
- **Mobile (iOS/Android)** — web first; React Native is the future path given the Next.js/React foundation.
- **Monetisation edge cases** — refund policy, gifting, team/edu licences. Out of scope for v1.
- **Target audience** — general-purpose (deck content determines the use case, not the app).

---

## Verification Approach

Each phase ends with an end-to-end smoke test:
- **Phase 1:** Complete a real purchase with Stripe test mode, log out, log back in, verify access granted
- **Phase 2:** Import a real deck, complete a study session, check Supabase dashboard for written rows
- **Phase 3:** Create a deck via wizard, study it on two different browsers simultaneously, verify history syncs
- **Phase 4 (future):** Generate a deck via AI integration, verify it arrives in the app without user seeing JSON
