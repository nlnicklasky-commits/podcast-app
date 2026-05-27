# PodBrain Security Audit -- Legal Liability Assessment

**Date:** 2026-05-24 | **Auditor role:** Security & Access Control Auditor

---

## 1. Authentication & Authorization Gaps

**Rating: CRITICAL**

PodBrain has zero authentication. The Supabase client (`src/lib/supabase.js`, line 29) calls `createClient(supabaseUrl, supabaseAnonKey)` with no auth session. Every visitor operates as the `anon` role. No login, no session tokens, no user identity.

Legal exposure: Without authentication, there is no ability to attribute actions to users, no audit trail for who accessed or modified data, and no mechanism to enforce access control. If the app stores any user-generated content (conversations, search history), that data is accessible and writable by anyone. Under frameworks like GDPR Article 32 and CCPA Section 1798.150, failure to implement "reasonable security" when handling personal data creates direct statutory liability.

---

## 2. Data Exposure Assessment

**Rating: CRITICAL**

The migration schema (`001_initial_schema.sql`) defines no RLS policies on any table. With the anon key exposed in the frontend `.env` (line 2), any party can use the Supabase REST API to:

- **READ** all knowledge bases, podcasts, transcripts, chunks, insights, conversations, messages, and search history
- **WRITE/UPDATE/DELETE** any row in any table
- **Call RPC functions** like `match_chunks_global` and `match_chunks` (migration `004_semantic_search.sql`) to run arbitrary vector searches

Concrete risk: An attacker can read all conversation history (the `messages` table stores every user question and AI response), delete all podcast data, or insert malicious content into knowledge bases. The `search_history` table (migration `004_semantic_search.sql`, line 91) records every search query with timestamps -- this is behavioral data exposed to the public.

---

## 3. API Key Security Review

**Rating: MIXED -- LOW (server-side keys) / HIGH (.env in git)**

Server-side keys are properly protected. All Edge Functions (e.g., `chat/index.ts`, line 117; `process-podcast/index.ts`, line 129) access `OPENAI_API_KEY`, `GROQ_API_KEY`, and Podcast Index credentials via `Deno.env.get()`, meaning they are stored as Supabase secrets and never sent to the client.

However, the `.env` file containing the Supabase URL and anon key is committed to git history (commit `975cbd3`), despite `.gitignore` listing `.env` on line 34. The anon key (`eyJhbGciOiJIUzI1NiIs...`) is permanently in the repository history. While Supabase anon keys are designed to be public, this combined with zero RLS means the key grants unrestricted database access. Additionally, committing `.env` files to git establishes a dangerous precedent -- if server-side keys were ever accidentally placed in this file, they would be committed too.

---

## 4. Storage Bucket Security

**Rating: HIGH**

Per the CLAUDE.md documentation, the `podcast-audio` Supabase Storage bucket has RLS policies allowing anon `INSERT`, `SELECT`, `UPDATE`, and `DELETE`. This means any visitor can:

- Upload arbitrary files to the storage bucket (potential for malware hosting, illegal content)
- Download any stored audio files
- Delete audio files mid-processing, causing pipeline failures

The bucket is described as "private" in documentation but the RLS policies contradict that designation. An open-write storage bucket can be abused for hosting arbitrary content, creating legal liability for the bucket owner as the hosting party.

---

## 5. Input Validation Gaps

**Rating: MEDIUM**

Edge Functions perform basic type checking (e.g., `semantic-search/index.ts`, line 71: `query.trim().length < 3`). However:

- **No sanitization of user inputs before database insertion.** The chat function (`chat/index.ts`, line 304) inserts the raw `question` string directly into the `messages` table. If the frontend renders this content without escaping, stored XSS is possible.
- **No rate limiting on any endpoint.** All Edge Functions use `Access-Control-Allow-Origin: *` (e.g., `chat/index.ts`, line 9). An attacker can call `process-podcast` repeatedly to burn through OpenAI/Groq API credits, or flood `semantic-search` to generate costs.
- **CORS is fully open.** Every Edge Function sets `Access-Control-Allow-Origin: "*"`, meaning any website can make requests to these endpoints on behalf of the user.

---

## 6. Breach Notification Obligations

**Rating: MEDIUM**

Current data at risk includes: search queries (behavioral data), conversation content, and podcast metadata. If PodBrain is single-user and stores no third-party personal data, breach notification obligations are minimal. However:

- If the app later adds users or stores data about podcast guests (the `entities` JSONB field in `insights` extracts people and companies), it may hold personal data triggering notification requirements under GDPR (72-hour notification to supervisory authority), CCPA (notification to affected California residents), or state breach notification laws (all 50 US states have them).
- The `search_history` table constitutes behavioral profiling data. Under GDPR, search queries tied to an identifiable person are personal data.

---

## 7. Duty of Care Analysis

**Rating: HIGH**

The standard of "reasonable security measures" is evaluated relative to the sensitivity of data and the cost of protection. For PodBrain:

- RLS policies are a built-in, zero-cost Supabase feature. Failing to enable them when the anon key is publicly accessible falls below the "reasonable measures" standard that courts and regulators apply.
- The absence of authentication on a publicly deployed application (Vercel) means the app is indistinguishable from an open API. Any data modification or deletion cannot be attributed or prevented.
- If this application were to be productized (as noted in CLAUDE.md: "with potential to productize later"), launching without auth and RLS would constitute negligence per industry standards (OWASP Top 10 lists "Broken Access Control" as the number-one web application security risk).

---

## 8. Risk Matrix

| # | Finding | Rating | Impact | Likelihood |
|---|---------|--------|--------|------------|
| 1 | No authentication system | **CRITICAL** | Total loss of access control | Certain (app is public) |
| 2 | No RLS policies on any table | **CRITICAL** | Full database read/write by anyone | Certain |
| 3 | Open storage bucket (anon CRUD) | **HIGH** | Malware hosting, data deletion | High |
| 4 | `.env` committed to git history | **HIGH** | Key exposure precedent | Already occurred |
| 5 | No rate limiting on Edge Functions | **HIGH** | API credit exhaustion, DoS | High |
| 6 | CORS wildcard on all endpoints | **MEDIUM** | Cross-origin abuse | Moderate |
| 7 | No input sanitization before DB writes | **MEDIUM** | Stored XSS, data corruption | Moderate |
| 8 | No security event logging | **MEDIUM** | Cannot detect or investigate incidents | Certain gap |
| 9 | No vulnerability disclosure policy | **LOW** | Missed responsible disclosures | Low |

---

## 9. Prioritized Remediation Checklist

Pre-launch, in order of priority:

1. **Enable RLS on all tables immediately.** Add `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;` for every table. As a stopgap before auth, create policies scoping access to `service_role` only, then relax as auth is added.
2. **Implement Supabase Auth.** Add email/password or OAuth login. Gate all frontend Supabase queries behind authenticated sessions. Update RLS policies to use `auth.uid()`.
3. **Lock down the storage bucket.** Remove anon INSERT/UPDATE/DELETE policies from `podcast-audio`. Only the `service_role` (used by Edge Functions) should write to storage.
4. **Remove `.env` from git history.** Run `git filter-branch` or `git filter-repo` to purge `.env` from all commits. Rotate the Supabase anon key if the repo has ever been public.
5. **Add rate limiting.** Use Supabase Edge Function middleware or an upstream proxy (Vercel Edge Middleware) to cap requests per IP per minute.
6. **Restrict CORS origins.** Replace `Access-Control-Allow-Origin: "*"` with the specific Vercel deployment domain in all Edge Functions.
7. **Sanitize inputs.** Escape or validate all user-provided strings before database insertion and before rendering in the frontend.
8. **Add access logging.** Log authentication events, failed requests, and anomalous query patterns to a dedicated table or external service.
9. **Publish a `security.txt`.** Add `/.well-known/security.txt` with a contact email for vulnerability reports.
