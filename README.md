# 🌿 Hemp Discord Bot

A Discord bot for **The Hemp Community** server — built on Cloudflare Workers with no server to maintain. Posts focused, educational hemp content on a rotating weekly schedule so the channel stays fresh without getting overwhelming.

## How It Works

Instead of dumping all research at once, each weekday gets its own focused post:

| Day | Post | Content |
|-----|------|---------|
| Monday | 📰 Hemp Headlines | Top news from industry RSS feeds |
| Tuesday | ⚖️ Legislative Update | Active bills and regulatory filings |
| Wednesday | 🔬 Science Spotlight | Peer-reviewed studies from PubMed |
| Thursday | 🧪 Trials Watch | Active clinical trials from ClinicalTrials.gov |
| Friday | 💬 Community Discussion | Weekly prompt with a public thread |
| Sat/Sun | — | Off |

Each research post includes an AI-generated intro (Llama 3.3 70B via Together AI) that picks the most interesting or surprising finding and explains it in plain language — written for curious beginners, not industry professionals.

## Features

- **One cron, five post types** — a single 6am CDT trigger routes to the right content based on day of week
- **AI intros** — category-specific briefs that lead with the most interesting finding
- **No paid APIs for research** — GovTrack.us, PubMed, ClinicalTrials.gov, and Federal Register are all free
- **Slash commands** — `/ping`, `/research`, `/status`, `/test-discussion`
- **Ed25519 signature verification** on all Discord interactions
- **KV caching** — research data cached 24h for the `/research` command

## Data Sources

| Category | Source | Method |
|----------|--------|--------|
| News | Cannabis Industry Journal, HempToday, Ganjapreneur, GoGreen Hemp | RSS |
| Legislation | GovTrack.us API + Federal Register | REST + RSS |
| Studies | PubMed E-utilities (last 60 days) | REST |
| Trials | ClinicalTrials.gov v2 (RECRUITING status) | REST |

## Tech Stack

- **Runtime**: Cloudflare Workers (edge, serverless)
- **Storage**: Cloudflare KV (research cache + timestamps)
- **AI**: Together AI — `meta-llama/Llama-3.3-70B-Instruct-Turbo` (~$0.40/year at daily use)
- **Testing**: Vitest with `@cloudflare/vitest-pool-workers`

---

## Setup

### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application → **Bot** tab → add a bot
3. Copy the **Token**, **Application ID**, and **Public Key**
4. Under **Privileged Gateway Intents**, enable **Message Content Intent**

### 2. Get a Together AI Key

Sign up at [together.ai](https://www.together.ai) — the free tier covers daily use easily.

### 3. Configure Cloudflare

```bash
npm install

# Login to Cloudflare
npx wrangler login

# Create KV namespace for caching
npx wrangler kv:namespace create "HEMP_KV"
# Copy the returned ID into wrangler.toml under [[kv_namespaces]]
```

### 4. Set Secrets

```bash
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_APPLICATION_ID
npx wrangler secret put DISCORD_TEST_GUILD_ID
npx wrangler secret put DISCORD_TEST_CHANNEL_ID
npx wrangler secret put TOGETHER_API_KEY
```

### 5. Local Development

```bash
cp .dev.vars.example .dev.vars
# Fill in your credentials

npm run dev    # local worker
npm run tail   # stream live production logs
```

### 6. Register Slash Commands

```bash
npm run register
```

### 7. Deploy

```bash
npm run deploy
```

### 8. Connect to Discord

1. Copy your Worker URL from the deploy output
2. In Discord Developer Portal → **General Information** → set **Interactions Endpoint URL**
3. Invite the bot (requires: Send Messages, Create Public Threads, Send Messages in Threads, Use Slash Commands)

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/ping` | Confirm the bot is alive |
| `/research` | On-demand view of all 4 research categories |
| `/status` | Last post timestamps and today's scheduled topic |
| `/test-discussion` | Manually trigger the Friday discussion prompt |

## Manual Triggers (Dev/Testing)

```bash
# Uses today's rotation by default
DISCORD_TOKEN=... TOGETHER_API_KEY=... node scripts/trigger-research.js

# Override to any category
node scripts/trigger-research.js --category news
node scripts/trigger-research.js --category legislation
node scripts/trigger-research.js --category studies
node scripts/trigger-research.js --category trials
node scripts/trigger-research.js --category discussion
```

## Running Tests

```bash
npm test
```

---

## Project Structure

```
hemp-discord-bot/
├── src/
│   ├── index.js        # Worker entry — cron routing, slash commands, Discord interactions
│   ├── research.js     # 4-source research pipeline (parallel fetches)
│   ├── summarize.js    # Together AI briefs + category embed builders
│   ├── discussion.js   # Weekly discussion prompt generator
│   └── verify.js       # Discord Ed25519 signature verification
├── scripts/
│   ├── register-commands.js   # One-time slash command registration
│   └── trigger-research.js   # Manual post trigger for testing
├── tests/
│   ├── research.test.js
│   ├── discussion.test.js
│   └── index.test.js
├── wrangler.toml       # Cloudflare Worker config (cron, KV binding)
├── .dev.vars.example   # Local environment template (copy to .dev.vars)
└── vitest.config.js
```

## License

MIT
