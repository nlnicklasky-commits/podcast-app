# Third-Party API Terms of Service Compliance Audit

**App:** PodBrain (podcast knowledge base)
**Date:** 2026-05-24
**Scope:** All third-party services identified in codebase and deployment configuration

---

## 1. OpenAI API

| Aspect | Detail |
|---|---|
| **Services used** | text-embedding-3-small (embeddings: `process-podcast/index.ts` line 530, `chat/index.ts` line 128) |
| **Relevant TOS** | API output owned by user; no model weight redistribution; no training competing models; 30-day data retention (zero-retention opt-in available) |
| **Status** | **COMPLIANT** |
| **Analysis** | App sends transcript text for embedding only. Outputs stored in pgvector. No fine-tuning or weight extraction. All inputs are publicly available podcast content. |
| **Commercial risk** | None. OpenAI does not distinguish personal vs. commercial API use. |
| **Remediation** | Enable zero-data-retention if handling sensitive content. |

## 2. Groq API

| Aspect | Detail |
|---|---|
| **Services used** | whisper-large-v3 (transcription, `process-podcast/index.ts` line 455), llama-3.3-70b-versatile (insights line 594, chat `chat/index.ts` line 233) |
| **Relevant TOS** | API outputs belong to user; no training on API inputs (paid tiers); acceptable use prohibits illegal content and access control circumvention |
| **Status** | **COMPLIANT** |
| **Analysis** | Audio sent for transcription, transcripts for insight/chat generation. All inputs are public podcast content. Groq's terms permit this. |
| **Commercial risk** | Low. Free tier rate limits insufficient for multi-user use. Meta's Llama license requires separate license above 700M MAU (irrelevant at this scale). |
| **Remediation** | Upgrade to Groq paid tier before commercial launch. |

## 3. Podcast Index API

| Aspect | Detail |
|---|---|
| **Services used** | `/search/byterm`, `/episodes/byfeedid` (`podcast-search/index.ts` line 116; `podcast-episodes` function referenced in CLAUDE.md) |
| **Relevant TOS** | Podcast Index is free and open. Their ethos: "no tracking, no lock-in." They request attribution ("Powered by Podcast Index") and a reasonable User-Agent. API keys are free but required. |
| **Status** | **AT RISK** |
| **Analysis** | The app sets `User-Agent: "PodcastBrain/1.0"` (line 66, podcast-search) which satisfies identification requirements. However, the app does **not** display "Powered by Podcast Index" attribution anywhere in the UI or `index.html`. The Podcast Index community guidelines request visible attribution for apps using their API. |
| **Commercial risk** | Low. Podcast Index explicitly encourages commercial use of their open API. No rate-limit tiers or paid plans exist. Attribution is a social contract, not a legal obligation, but non-compliance risks API key revocation. |
| **Remediation** | Add "Powered by Podcast Index" attribution in the search UI and/or app footer. |

## 4. Cobalt (Self-Hosted on Railway)

| Aspect | Detail |
|---|---|
| **Services used** | YouTube audio extraction via `POST /` (`process-podcast/index.ts` lines 329-402) |
| **Relevant TOS** | Cobalt is AGPL-3.0. Self-hosting permitted. **Compliance question is with YouTube's TOS, not Cobalt's license.** |
| **Status** | **COMPLIANT** (Cobalt license only) |
| **Analysis** | Unmodified Cobalt instance used as internal network service. No code redistribution. Satisfies AGPL. |
| **Commercial risk** | If modified, source must be published. If offered as a service to third parties, AGPL obligations apply. |
| **Remediation** | None needed while unmodified and internal-only. |

## 5. YouTube (via Cobalt)

| Aspect | Detail |
|---|---|
| **Services used** | Automated audio extraction from YouTube videos via Cobalt (`process-podcast/index.ts` lines 324-403) |
| **Relevant TOS** | YouTube TOS Section 5: "You are not allowed to... access, reproduce, download... any part of the Service... through any automated means." YouTube API TOS further prohibits downloading content. |
| **Status** | **VIOLATION** |
| **Analysis** | Cobalt extracts audio from YouTube without using the official YouTube Data API. This constitutes automated downloading of YouTube content, which violates YouTube TOS Section 5. The extracted audio is then sent to Groq Whisper for transcription, stored as text, and used to generate derivative works (embeddings, insights). YouTube's TOS does not grant rights to create persistent copies or derivative works from their hosted content. |
| **Commercial risk** | **High.** Personal use provides no legal safe harbor. Commercial deployment significantly increases exposure to DMCA claims and YouTube enforcement (API key bans, legal action). Google has actively litigated against YouTube downloaders (e.g., YouTube-DL takedown notices). |
| **Remediation** | (1) Deprecate YouTube extraction as a content source. (2) If YouTube support is required, use the official YouTube Data API with proper OAuth and respect `contentDetails` restrictions. (3) Add prominent UI language that YouTube extraction is "at user's own risk" as an interim measure -- though this does not absolve the app operator. |

## 6. Supabase

| Aspect | Detail |
|---|---|
| **Services used** | Postgres + pgvector, Storage (temporary audio), Edge Functions, service_role key |
| **Relevant TOS** | Standard SaaS terms. Free tier: 500MB DB, 1GB storage, 500K Edge Function invocations/month. |
| **Status** | **COMPLIANT** |
| **Analysis** | App uses Supabase within documented capabilities. Audio uploaded temporarily, deleted after processing (line 668). Service role key server-side only. |
| **Commercial risk** | Free tier limits will be exceeded with multi-user usage. Transcripts + embeddings will hit 500MB DB cap. |
| **Remediation** | Upgrade to Supabase Pro before multi-user launch. Implement RLS policies (currently absent). |

## 7. Vercel

| Aspect | Detail |
|---|---|
| **Services used** | Frontend static hosting, auto-deploy from GitHub |
| **Relevant TOS** | Vercel's Fair Use Policy: Hobby plan is for non-commercial, personal projects. Commercial use requires Pro plan ($20/mo). |
| **Status** | **COMPLIANT** (personal use) |
| **Commercial risk** | **Hobby plan prohibits commercial use.** Multi-user or monetized deployment requires upgrading to Vercel Pro. |
| **Remediation** | Upgrade to Vercel Pro before any commercial launch. |

## 8. Google Fonts CDN

| Aspect | Detail |
|---|---|
| **Services used** | Geist, Geist Mono, Newsreader, JetBrains Mono loaded via `fonts.googleapis.com` (`index.html` line 10) |
| **Relevant TOS** | Google Fonts API TOS: fonts are free, open-source (SIL OFL / Apache 2.0). Google logs IP addresses of font requestors per their Privacy Policy. EU GDPR implications for user IP transfer to Google servers. |
| **Status** | **AT RISK** (GDPR only) |
| **Analysis** | Fonts are loaded client-side, causing each user's browser to send their IP address to Google. A German court (LG Munich, Jan 2022, Case 3 O 17493/20) ruled this violates GDPR without explicit consent. For a US-only personal tool, this is a non-issue. |
| **Commercial risk** | If the app serves EU users, self-hosting fonts becomes necessary to avoid GDPR liability. |
| **Remediation** | Self-host the four font families (download from Google Fonts, serve from Vercel/Supabase Storage). Takes ~15 minutes and eliminates the concern entirely. |

---

## Summary Matrix

| Service | Personal Use | Commercial Use |
|---|---|---|
| OpenAI API | COMPLIANT | COMPLIANT |
| Groq API | COMPLIANT | COMPLIANT (upgrade plan) |
| Podcast Index | AT RISK (missing attribution) | AT RISK (missing attribution) |
| Cobalt (license) | COMPLIANT | COMPLIANT |
| YouTube (via Cobalt) | **VIOLATION** | **VIOLATION** (high risk) |
| Supabase | COMPLIANT | COMPLIANT (upgrade plan) |
| Vercel | COMPLIANT | AT RISK (upgrade required) |
| Google Fonts CDN | COMPLIANT (US) | AT RISK (EU/GDPR) |

**Critical action items:** (1) Deprecate or gate YouTube audio extraction. (2) Add Podcast Index attribution. (3) Self-host Google Fonts before any EU-facing deployment.
