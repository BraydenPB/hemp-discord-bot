/**
 * Discord Slash Command Registration Script
 * Run once to register commands with Discord
 *
 * Usage: node scripts/register-commands.js
 */

const commands = [
  {
    name: 'ping',
    description: 'Check if the bot is responsive'
  },
  {
    name: 'research',
    description: 'Fetch the latest hemp industry research'
  },
  {
    name: 'test-discussion',
    description: 'Test posting a discussion message (admin only)'
  },
  {
    name: 'status',
    description: 'Check the bot status and last activity'
  }
];

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const guildId = process.env.DISCORD_TEST_GUILD_ID;

  if (!token || !applicationId) {
    console.error('Missing required environment variables:');
    console.error('- DISCORD_TOKEN');
    console.error('- DISCORD_APPLICATION_ID');
    process.exit(1);
  }

  // Register commands globally (or to specific guild for testing)
  const url = guildId
    ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${applicationId}/commands`;

  console.log(`Registering ${commands.length} commands...`);
  console.log(`Target: ${guildId ? `Guild ${guildId}` : 'Global'}`);

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commands)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error: ${error}`);
    }

    const result = await response.json();
    console.log('Successfully registered commands:');
    result.forEach(cmd => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
    });
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
}

registerCommands();
