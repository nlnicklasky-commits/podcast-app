# PodBrain Legal Audit — Final Report

**Date:** 2026-05-24
**Run ID:** r-1748131200
**Subject:** PodBrain Podcast Knowledge Base Application
**Operator:** Nick Lasky (nl.nicklasky@gmail.com)
**Status:** All 6 audit tasks completed and approved (0 failures)

> **Disclaimer:** This audit is an internal assessment, not formal legal advice. All draft policies require review by a licensed attorney before publication.

---

## Executive Summary

PodBrain has **zero legal infrastructure** — no privacy policy, no terms of service, no authentication, no compliance mechanisms. The audit identified **3 CRITICAL**, **6 HIGH**, **5 MEDIUM**, and **3 LOW** findings across privacy, intellectual property, API compliance, and security.

**The three most urgent issues:**

1. **YouTube audio extraction via Cobalt is a direct TOS violation** — the only active legal violation in the codebase. Remove before any public deployment.
2. **No authentication + no Row-Level Security = completely open database** — anyone with the Supabase anon key (committed to git history) can read, write, or delete all data in every table.
3. **No privacy policy or consent mechanisms** — violates GDPR Articles 5, 6, 12-14, 25, 28, 30, 44-49 and CCPA Sections 1798.100-120. Google Fonts CDN transfers user IP addresses to Google without consent (proven EU damages precedent).

**The good news:** API keys are properly secured server-side, the Podcast Index integration is legally clean, OpenAI/Groq/Supabase usage is TOS-compliant, and the architecture is sound — the gaps are all addressable with known fixes before launch.

Draft Privacy Policy and Terms of Service are included below as starting points for attorney review.

---

## Part 1: Privacy & Data Protection Audit

### Data Inventory

| Data Category | Storage Location | Retention | Personal Data? |
|---|---|---|---|
| Knowledge base names/descriptions | `knowledge_bases` table | Indefinite | Potentially (reveals interests) |
| Podcast URLs, titles, channels | `podcasts` table | Indefinite | No (public metadata) |
| Full transcripts + segments | `transcripts` table | Indefinite | Yes — speakers identifiable |
| Text chunks + embeddings (1536-dim) | `chunks` table | Indefinite | Yes — derived from transcripts |
| AI insights (summary, topics, entities) | `insights` table | Indefinite | Yes — `entities` extracts people/companies |
| Chat conversations + citations | `conversations` + `messages` tables | Indefinite | Yes — reveals user interests and intent |
| Search queries | `search_history` table | Indefinite, no purge | Yes — behavioral data |
| Processing logs | `processing_logs` table | Indefinite | Indirectly |
| Visitor IP addresses | Google Fonts CDN | Controlled by Google | Yes — per Breyer v. Germany (C-582/14) |

### Third-Party Data Transfers

| Recipient | Data Sent | Jurisdiction |
|---|---|---|
| **Groq** | Raw audio (up to 25MB); transcript text | USA |
| **OpenAI** | Transcript chunks; chat questions | USA |
| **Cobalt/Railway** | YouTube URLs | USA |
| **Podcast Index** | Search query strings | USA |
| **Google Fonts CDN** | IP addresses, User-Agent, Referer | USA |

All US transfers require GDPR Art. 46 safeguards (SCCs + TIA) and CCPA service provider agreements. **None are in place.**

### GDPR Gap Analysis

| Article | Requirement | Status |
|---|---|---|
| Art. 5(1)(a) | Lawfulness, transparency | **VIOLATED** |
| Art. 5(1)(b) | Purpose limitation | **VIOLATED** |
| Art. 5(1)(e) | Storage limitation | **VIOLATED** |
| Art. 6 | Lawful basis | **VIOLATED** |
| Art. 12-14 | Transparency / information rights | **VIOLATED** |
| Art. 15-20 | Data subject rights | **VIOLATED** |
| Art. 25 | Data protection by design | **VIOLATED** |
| Art. 28 | Processor agreements | **VIOLATED** |
| Art. 30 | Records of processing activities | **VIOLATED** |
| Art. 44-49 | International transfer safeguards | **VIOLATED** |

### CCPA Gap Analysis

| Requirement | Status |
|---|---|
| Right to Know (1798.100) | Non-compliant |
| Right to Delete (1798.105) | Non-compliant |
| Right to Opt-Out (1798.120) | Non-compliant |
| Notice at Collection (1798.100(b)) | Non-compliant |
| Service Provider Contracts (1798.140(ag)) | Non-compliant |

### ePrivacy

Google Fonts CDN loads from `fonts.googleapis.com` transmit IP, User-Agent, and Referer to Google. Under ePrivacy Directive Art. 5(3) and *Planet49* (C-673/17), prior consent is required. German courts have awarded EUR 100 per visitor for this exact pattern (LG Munchen, 3 O 17493/20, Jan 2022). **Fix: self-host fonts (~15 minutes of work).**

---

## Part 2: Intellectual Property & Content Rights

### Copyright Ownership

- **Podcast audio** is copyrighted by the creator. RSS publication does not transfer reproduction rights beyond personal listening/downloading.
- **Transcripts** are derivative works with minimal transformation. Copyright in the spoken content belongs to the podcast creator.
- **AI-generated insights** (summaries, key points, entities) are more transformative but still derived from copyrighted source material.
- **Embeddings** (numerical vectors) are sufficiently transformed that they likely do not constitute copyrightable expression.

### Fair Use Assessment

| Factor | Personal Use | Productized |
|---|---|---|
| Purpose & character | Private research — favors fair use | Commercial service — weakens substantially |
| Nature of work | Factual/informational — mildly favors | Same |
| Amount used | Entire works transcribed — weighs against | Same, at scale |
| Market effect | Minimal — neutral | Could substitute for listening — strongly against |

**Personal use:** Likely defensible (Sony v. Universal, 1984). **Productized:** Significantly weaker — storing full transcripts for multiple users enabling value extraction without listening directly impacts creators' market (cf. Authors Guild v. Google, 2015 — defensible only because of snippet display, not full text).

### YouTube/Cobalt: HIGH Risk

Extracting audio from YouTube via Cobalt directly violates YouTube TOS Section 5(B). Exposure includes DMCA Section 1201 (circumvention, up to $2,500 per act), CFAA (unauthorized access), and active Google enforcement (RIAA v. youtube-dl, 2020). **This is the only clear legal violation in the codebase. Remove before any public deployment.**

### Recommendations

- Remove YouTube/Cobalt extraction path before productization
- Store chunks/summaries rather than full verbatim transcripts (dramatically improves fair use position)
- Add prominent attribution: podcast name, episode title, creator, link to original
- Register a DMCA designated agent before multi-user launch
- Implement takedown request workflow
- Show snippets in search results rather than full text (Google Books model)
- Respect `<podcast:locked>` RSS tag for creator opt-out

### IP Risk Matrix

| Issue | Current | Productized |
|---|---|---|
| YouTube audio extraction | **HIGH** | **HIGH** |
| Full transcript storage | MEDIUM | **HIGH** |
| AI-generated insights | LOW | MEDIUM |
| Embeddings in pgvector | LOW | LOW |
| No DMCA agent/takedown | LOW | **HIGH** |
| No attribution to creators | MEDIUM | **HIGH** |
| No ToS or copyright notice | LOW | **HIGH** |

---

## Part 3: Third-Party API TOS Compliance

| Service | Personal Use | Commercial Use | Key Issue |
|---|---|---|---|
| OpenAI API | COMPLIANT | COMPLIANT | None |
| Groq API | COMPLIANT | COMPLIANT | Upgrade plan for commercial |
| Podcast Index | AT RISK | AT RISK | Missing "Powered by Podcast Index" attribution |
| Cobalt (license) | COMPLIANT | COMPLIANT | AGPL-3.0 satisfied (unmodified, internal) |
| YouTube (via Cobalt) | **VIOLATION** | **VIOLATION** | TOS Section 5(B) — automated downloading prohibited |
| Supabase | COMPLIANT | COMPLIANT | Upgrade to Pro for scale |
| Vercel | COMPLIANT | AT RISK | Hobby plan prohibits commercial use |
| Google Fonts CDN | COMPLIANT (US) | AT RISK (EU) | Self-host to eliminate GDPR exposure |

**Critical actions:** (1) Remove YouTube extraction. (2) Add Podcast Index attribution. (3) Self-host Google Fonts. (4) Upgrade Vercel and Supabase plans before commercial launch.

---

## Part 4: Security & Access Control

### Risk Matrix

| # | Finding | Rating |
|---|---|---|
| 1 | No authentication system | **CRITICAL** |
| 2 | No RLS policies on any table | **CRITICAL** |
| 3 | Open storage bucket (anon CRUD) | **HIGH** |
| 4 | `.env` committed to git history (commit 975cbd3) | **HIGH** |
| 5 | No rate limiting on Edge Functions | **HIGH** |
| 6 | CORS wildcard (`*`) on all endpoints | MEDIUM |
| 7 | No input sanitization before DB writes | MEDIUM |
| 8 | No security event logging | MEDIUM |
| 9 | No vulnerability disclosure policy | LOW |

### Key Findings

- **Anyone with the Supabase anon key can read/write/delete ALL data** — knowledge bases, transcripts, conversations, search history. The anon key is in git history.
- **Storage bucket allows anon INSERT** — potential for malware hosting, creating legal liability for the bucket owner.
- **CORS wildcard + no auth = any website can trigger processing or chat endpoints**, burning API credits.
- **Duty of care:** RLS is a built-in, zero-cost Supabase feature. Not enabling it falls below the "reasonable measures" standard courts apply (OWASP Top 10 ranks "Broken Access Control" as #1).

### Remediation Priority

1. Enable RLS on all tables immediately (stopgap: `service_role` only)
2. Implement Supabase Auth (email/password or OAuth)
3. Lock down storage bucket (remove anon write policies)
4. Purge `.env` from git history; rotate anon key if repo was ever public
5. Add rate limiting (Vercel Edge Middleware or Edge Function middleware)
6. Restrict CORS to production domain(s)
7. Sanitize all user inputs before DB insertion
8. Add access logging
9. Publish `/.well-known/security.txt`

---

## Part 5: Draft Privacy Policy

*See full document at [`out/r-1748131200/t5-privacy-policy.md`](t5-privacy-policy.md)*

Key features of the draft:
- Covers all 6 third-party processors with exact data flows
- GDPR lawful basis table (Art. 6(1)(b) and 6(1)(f))
- CCPA rights enumerated (Right to Know, Delete, Opt-Out, Non-Discrimination)
- Concrete retention periods: search history 90 days, processing logs 30 days, audio deleted immediately after transcription
- Data subject rights with response timeframes (30 days GDPR, 45 days CCPA)
- International transfer safeguards (SCCs)
- Children's privacy (under-16 EU, under-13 US)

**Note:** The draft describes RLS and CORS restrictions as implemented security measures. These must actually be implemented before the policy is published — otherwise the policy makes false claims about your security posture.

---

## Part 6: Draft Terms of Service

*See full document at [`out/r-1748131200/t6-terms-of-service.md`](t6-terms-of-service.md)*

Key features of the draft:
- Clear IP ownership separation: user data (user owns), podcast content (creator owns), AI outputs (no ownership claimed)
- Acceptable use policy prevents transcript redistribution
- YouTube/Cobalt risk disclaimed to user ("you assume all risk")
- AI-generated content triple-disclaimer: no accuracy guarantee, not professional advice, verify at source
- Podcast creator takedown contact included
- Limitation of liability capped at $50 or 12-month payment total
- Governing law placeholder for attorney to fill

---

## Master Remediation Roadmap

### Before Going Public (P0)

| # | Action | Addresses | Effort |
|---|---|---|---|
| 1 | Remove YouTube/Cobalt extraction path | IP violation, TOS violation | Medium |
| 2 | Enable RLS on all Supabase tables | CRITICAL security gap | Low |
| 3 | Implement Supabase Auth | CRITICAL security, GDPR rights | Medium |
| 4 | Self-host Google Fonts | ePrivacy/GDPR, TOS compliance | ~15 min |
| 5 | Publish Privacy Policy (after attorney review) | GDPR Art. 12-14, CCPA 1798.100(b) | Low |
| 6 | Publish Terms of Service (after attorney review) | General liability protection | Low |
| 7 | Lock down storage bucket | Security, abuse prevention | Low |
| 8 | Restrict CORS to production domain(s) | Security, API credit protection | Low |
| 9 | Purge `.env` from git history | Secret hygiene | Low |
| 10 | Add Podcast Index attribution | API TOS compliance | ~5 min |

### Before Productization (P1)

| # | Action | Addresses |
|---|---|---|
| 11 | Execute DPAs with OpenAI and Groq | GDPR Art. 28 |
| 12 | Build user data deletion cascade (all tables including search_history) | GDPR Art. 17, CCPA 1798.105 |
| 13 | Set retention policies (search_history 90d, processing_logs 30d) | GDPR Art. 5(1)(e) |
| 14 | Implement data export (JSON/CSV) | GDPR Art. 20 |
| 15 | Register DMCA designated agent | Copyright safe harbor |
| 16 | Build takedown request workflow | DMCA compliance |
| 17 | Store chunks/summaries only (not full transcripts) | Fair use improvement |
| 18 | Upgrade Vercel to Pro plan | Commercial TOS compliance |
| 19 | Upgrade Supabase to Pro plan | Scale + commercial compliance |
| 20 | Add rate limiting to Edge Functions | Security, cost protection |
| 21 | Show transcript snippets only in search results | Fair use (Google Books model) |
| 22 | Respect `<podcast:locked>` RSS tag | Creator rights |

---

## Appendix: Audit Artifacts

| File | Description |
|---|---|
| [`t1-privacy-audit.md`](t1-privacy-audit.md) | Full privacy & data protection audit |
| [`t2-ip-rights.md`](t2-ip-rights.md) | Intellectual property & content rights assessment |
| [`t3-api-tos.md`](t3-api-tos.md) | Third-party API TOS compliance audit |
| [`t4-security.md`](t4-security.md) | Security & access control liability audit |
| [`t5-privacy-policy.md`](t5-privacy-policy.md) | Draft Privacy Policy |
| [`t6-terms-of-service.md`](t6-terms-of-service.md) | Draft Terms of Service |
