# Hemp Discord Bot

A Discord bot for hemp industry research and daily discussions, hosted on Cloudflare Workers.

## Features

- **Daily Research** (6am Central): Fetches hemp industry news from RSS feeds
- **Daily Discussion** (8am Central): Posts engaging discussion prompts with threads
- **Slash Commands**: `/ping`, `/research`, `/test-discussion`, `/status`

## Setup

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** tab and create a bot
4. Copy the **Token**, **Application ID**, and **Public Key**
5. Enable **Message Content Intent** under Privileged Gateway Intents

### 2. Configure Cloudflare Worker

```bash
# Install dependencies
npm install

# Login to Cloudflare
npx wrangler login

# Create KV namespace
npx wrangler kv:namespace create "HEMP_KV"

# Update wrangler.toml with the KV namespace ID returned above
```

### 3. Set Secrets

```bash
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_APPLICATION_ID
npx wrangler secret put DISCORD_TEST_GUILD_ID
npx wrangler secret put DISCORD_TEST_CHANNEL_ID
```

### 4. Register Commands

```bash
# Create .dev.vars with your credentials, then:
npm run register
```

### 5. Deploy

```bash
npm run deploy
```

### 6. Configure Discord Interactions Endpoint

1. Copy your Worker URL (e.g., `https://hemp-discord-bot.your-subdomain.workers.dev`)
2. In Discord Developer Portal, go to **General Information**
3. Set **Interactions Endpoint URL** to your Worker URL

### 7. Invite Bot to Server

Use this URL format:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=2147483648&scope=bot%20applications.commands
```

Required permissions:
- Send Messages
- Create Public Threads
- Send Messages in Threads
- Use Slash Commands

## Local Development

```bash
# Copy .dev.vars.example to .dev.vars and fill in values
cp .dev.vars.example .dev.vars

# Run locally
npm run dev

# View logs
npm run tail
```

## Cron Schedule

| Task | Central Time | UTC |
|------|-------------|-----|
| Research | 6:00 AM | 11:00 |
| Discussion | 8:00 AM | 13:00 |

## Project Structure

```
hemp-discord-bot/
├── src/
│   ├── index.js       # Main worker entry point
│   ├── verify.js      # Discord signature verification
│   ├── research.js    # Hemp news fetching
│   └── discussion.js  # Discussion prompt generation
├── scripts/
│   └── register-commands.js  # Slash command registration
├── wrangler.toml      # Cloudflare Worker config
├── package.json
└── .dev.vars.example  # Local environment template
```

## News Sources

- Hemp Industry Daily
- MJBizDaily Hemp
- Cannabis Industry Journal

## License

MIT
