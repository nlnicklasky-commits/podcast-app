# PodBrain Privacy & Data Protection Audit

**Date:** 2026-05-24 | **Scope:** Full application (frontend, Edge Functions, Supabase, third-party integrations)

---

## 1. Data Inventory

| Data Category | Storage Location | Retention | Personal Data? |
|---|---|---|---|
| Knowledge base names/descriptions | `knowledge_bases` table | Indefinite | Potentially (names may reveal interests) |
| Podcast URLs, titles, channels | `podcasts` table | Indefinite | No (public metadata) |
| Full transcripts + segments | `transcripts` table | Indefinite | Yes -- speakers identifiable; may name individuals |
| Text chunks + embeddings (1536-dim) | `chunks` table | Indefinite | Yes -- derived from transcripts |
| AI insights (summary, topics, entities) | `insights` table | Indefinite | Yes -- `entities` extracts people/company names |
| Chat conversations + citations | `conversations` + `messages` tables | Indefinite | Yes -- user questions reveal interests and intent |
| Search queries, scope, result count | `search_history` table (`004_semantic_search.sql`, lines 91-101) | Indefinite, no purge | Yes -- behavioral data attributable to a session |
| Processing logs | `processing_logs` table | Indefinite | Indirectly (may contain URLs or content fragments) |
| Visitor IP addresses | Google Fonts CDN -- `index.html` lines 8-10 | Controlled by Google | Yes -- per Breyer v. Germany (C-582/14) |

---

## 2. Third-Party Data Transfers

| Recipient | Data Sent | Source Code Reference | Jurisdiction |
|---|---|---|---|
| **Groq** | Raw audio (up to 25MB); transcript text (up to 80K chars) | `process-podcast/index.ts` lines 455-459, 593-618 | USA |
| **OpenAI** | Transcript chunks (batches of 20); user chat questions | `process-podcast/index.ts` lines 537-541; `chat/index.ts` lines 128-138 | USA |
| **Cobalt/Railway** | YouTube URLs (user-selected video IDs) | `process-podcast/index.ts` lines 329-338 | USA |
| **Podcast Index** | Search query strings | `podcast-search` Edge Function | USA |
| **Google Fonts CDN** | IP addresses, User-Agent, Referer | `index.html` lines 8-10 (automatic browser request) | USA |

All US transfers require Art. 46 GDPR safeguards (SCCs + TIA) and CCPA service provider agreements. None are in place.

---

## 3. GDPR Gap Analysis

| Article | Requirement | Status |
|---|---|---|
| **Art. 5(1)(a)** | Lawfulness, transparency | **VIOLATED** -- no privacy policy, no lawful basis identified |
| **Art. 5(1)(b)** | Purpose limitation | **VIOLATED** -- no purpose specification documented |
| **Art. 5(1)(e)** | Storage limitation | **VIOLATED** -- all tables lack retention policies; `search_history` grows unbounded |
| **Art. 6** | Lawful basis | **VIOLATED** -- no consent mechanism, no LIA, no contract basis |
| **Art. 12-14** | Transparency / information rights | **VIOLATED** -- no privacy notice at any collection point |
| **Art. 15-20** | Data subject rights (access, erasure, portability) | **VIOLATED** -- no export, deletion, or SAR workflow |
| **Art. 25** | Data protection by design | **VIOLATED** -- no RLS; CORS set to `*` (line 9, both Edge Functions); no data minimization |
| **Art. 28** | Processor agreements | **VIOLATED** -- no DPA with OpenAI, Groq, or Google |
| **Art. 30** | Records of processing activities | **VIOLATED** -- no ROPA exists |
| **Art. 44-49** | International transfer safeguards | **VIOLATED** -- no SCCs or adequacy decisions for any US processor |

---

## 4. CCPA Gap Analysis

| Requirement | Status |
|---|---|
| **Right to Know** (1798.100) | Non-compliant -- no data disclosure mechanism |
| **Right to Delete** (1798.105) | Non-compliant -- no user-facing deletion; `ON DELETE CASCADE` only operates from parent tables |
| **Right to Opt-Out** (1798.120) | Uncertain -- sending queries to OpenAI/Groq may constitute "sharing" under CPRA; no opt-out exists |
| **Notice at Collection** (1798.100(b)) | Non-compliant -- no notice at any point |
| **Service Provider Contracts** (1798.140(ag)) | Non-compliant -- no CCPA addenda with any processor |

---

## 5. ePrivacy / Cookie Compliance

- **Google Fonts CDN**: Browser requests to `fonts.googleapis.com` transmit IP, User-Agent, and Referer to Google. Under ePrivacy Directive Art. 5(3) and *Planet49* (C-673/17), prior consent is required. No consent banner exists. German courts have awarded EUR 100 per visitor for this exact issue (LG Munchen, 3 O 17493/20, Jan 2022).
- **No cookies detected** in the current codebase. If Supabase Auth or analytics are added, a consent mechanism will be required.

---

## 6. Risk Matrix

| Gap | Severity | Rationale |
|---|---|---|
| No privacy policy or notices | **HIGH** | Mandatory under GDPR Art. 13-14 and CCPA 1798.100(b); immediate regulatory exposure |
| No lawful basis for processing | **HIGH** | Foundational requirement; all processing currently unlawful |
| No DPAs with OpenAI, Groq, Google | **HIGH** | Art. 28 violation; audio containing speaker PII sent without contractual safeguards |
| No data subject rights | **HIGH** | No access, deletion, or portability; blocks compliance with both GDPR and CCPA |
| Indefinite retention, no deletion | **MEDIUM** | Art. 5(1)(e); `search_history` behavioral data with no purge is highest-risk subset |
| Google Fonts without consent | **MEDIUM** | IP transfer to Google; proven damages precedent in EU courts |
| CORS wildcard on Edge Functions | **MEDIUM** | `Access-Control-Allow-Origin: *` plus no auth = any origin can trigger processing or chat |
| No international transfer safeguards | **MEDIUM** | Post-Schrems II, SCCs + TIA required for all US processors |
| No ROPA | **LOW** | Administrative Art. 30 obligation; low enforcement priority for small controllers |
| No data minimization (entities) | **LOW** | Extracting/storing named individuals exceeds necessity for summarization |

---

## 7. Prioritized Remediation Checklist

**P0 -- Before going public:**

1. **Publish a privacy policy** -- controller identity, purposes, lawful bases, recipients, retention, data subject rights, transfer safeguards.
2. **Self-host Google Fonts** -- serve font files from own domain; eliminates IP transfer and consent requirement.
3. **Execute DPAs** with OpenAI ([DPA](https://openai.com/policies/data-processing-addendum/)) and Groq ([Terms](https://groq.com/terms-of-use/)).
4. **Implement Supabase Auth** -- user identity is prerequisite for all data subject rights.
5. **Enable RLS** on all tables -- currently anon key grants unrestricted read/write.
6. **Restrict CORS** to production domain(s) in all Edge Functions.

**P1 -- Before scaling:**

7. **Build user-facing data deletion** cascading through all tables including `search_history` and `processing_logs`.
8. **Set retention policies** -- `search_history` (90-day TTL), `processing_logs` (30-day TTL). Audio already cleaned up post-processing (`process-podcast/index.ts` line 668).
9. **Implement data export** (JSON/CSV) for Art. 20 portability.
10. **Add consent mechanism** for any future analytics or non-essential tracking.
11. **Prepare ROPA** documenting all processing activities.
12. **Conduct Transfer Impact Assessment** for US processors per EDPB Recommendations 01/2020.
