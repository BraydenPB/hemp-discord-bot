# Hemp Flower Bot — Architecture

## Audience

Experienced hemp flower enthusiasts in a private Discord server. Think r/hempflowers veterans, small-batch vendor shoppers, and people who discuss cure quality, terpene profiles, COAs, and vendor reputation. **Not** generic CBD wellness consumers or industrial hemp investors.

## Module Overview

```
src/
  config.js      — Central config: sources, keywords, vendor/cultivar lists, schedule
  index.js       — Cloudflare Worker entry: fetch (slash commands) + scheduled (cron)
  research.js    — External source scraping (RSS, GovTrack, PubMed, ClinicalTrials)
  summarize.js   — Together AI summarization + Discord embed construction
  discussion.js  — Weekly discussion prompt generation
  pulse.js       — Community Pulse: ephemeral Discord message analysis
  verify.js      — Discord Ed25519 signature verification
```

## Data Flow

### 1. Daily Research Posts (Mon–Thu)

```
Cron (11:00 UTC) → research.js scrapes external sources
                  → config.js filters by flower relevance
                  → summarize.js generates AI brief via Together AI
                  → summarize.js builds Discord embed
                  → index.js posts to configured channel
```

**Sources (primary/flower-focused):**
- RSS feeds from flower/community-adjacent sites
- GovTrack + Federal Register (filtered to flower-impact legislation)
- PubMed (query tuned to CBD/CBG + consumer outcomes like sleep, anxiety, pain)
- ClinicalTrials.gov (CBD/CBG recruiting trials)

**Sources (secondary/industry — optional separate channel):**
- Generic hemp trade press (HempToday, Cannabis Industry Journal, etc.)

### 2. Community Pulse (configurable, e.g. twice daily)

```
Cron (14:00, 22:00 UTC) → pulse.js reads configured channels via Discord REST
                         → Only messages since last cursor (per-channel KV)
                         → Extracts: vendors, cultivars, quality terms, themes
                         → Discards raw messages from memory
                         → Together AI generates summary from aggregated data
                         → Builds "Community Pulse" embed
                         → Posts to configured output channel
                         → Updates per-channel cursors in KV
```

**Privacy guarantees:**
- Only reads channels explicitly listed in env config (`PULSE_CHANNEL_IDS`)
- Per-channel cursor (`COMMUNITY_PULSE_CURSOR:<channelId>`) ensures only new messages are read
- Raw message content is never persisted — only aggregated counts and derived labels
- No usernames or direct quotes in output — everything is paraphrased and anonymized
- Message data is discarded from memory after summarization completes

### 3. Weekly Discussion (Friday)

```
Cron (11:00 UTC on Friday) → discussion.js picks theme + prompt
                            → Optionally rewrites via Together AI
                            → Posts to channel + creates thread
```

## KV Schema

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `latest_research` | JSON (research object) | 24h | Cached research data |
| `last_research` | ISO string | — | Timestamp of last research post |
| `last_discussion` | ISO string | — | Timestamp of last discussion |
| `last_pulse` | ISO string | — | Timestamp of last pulse post |
| `COMMUNITY_PULSE_CURSOR:<channelId>` | Snowflake string | — | Last processed message ID per channel |
| `discussion_history` | JSON (string[]) | — | Recently used discussion prompt keys to avoid repeats |

## Community Pulse Aggregation Schema

The intermediate data structure (in-memory only, never persisted as raw content):

```js
{
  window: { start: "2026-03-31T14:00:00Z", end: "2026-03-31T22:00:00Z" },
  messageCount: 47,
  channelsRead: ["123456", "789012"],
  vendors: [                          // sorted by mention count
    { name: "flow gardens", count: 8 },
    { name: "wnc cbd", count: 5 },
  ],
  cultivars: [
    { name: "suver haze", count: 6 },
    { name: "banana mac", count: 3 },
  ],
  qualityTerms: [
    { term: "frosty", count: 4, sentiment: "positive" },
    { term: "hay", count: 2, sentiment: "negative" },
  ],
  themes: [                           // derived labels, not raw quotes
    "Cure complaints about Vendor X's latest batch",
    "Hype around a new indoor drop",
  ],
}
```

## Scheduling

| Time (UTC) | CDT | Post Type |
|------------|-----|-----------|
| 11:00 Mon | 6am | News digest |
| 11:00 Tue | 6am | Legislation update |
| 11:00 Wed | 6am | Science spotlight |
| 11:00 Thu | 6am | Trials watch |
| 11:00 Fri | 6am | Discussion prompt |
| 14:00 daily | 9am | Community Pulse |
| 22:00 daily | 5pm | Community Pulse |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot token |
| `DISCORD_PUBLIC_KEY` | Interaction verification key |
| `DISCORD_APPLICATION_ID` | Bot application ID |
| `TOGETHER_API_KEY` | Together AI API key |
| `RESEARCH_CHANNEL_ID` | Channel for daily research posts |
| `PULSE_CHANNEL_ID` | Channel to post pulse embeds |
| `PULSE_SOURCE_CHANNEL_IDS` | Comma-separated channel IDs to read for pulse |
| `DISCUSSION_CHANNEL_ID` | Channel for discussion prompts |
| `INDUSTRY_CHANNEL_ID` | (Optional) separate channel for industry/trade news |
