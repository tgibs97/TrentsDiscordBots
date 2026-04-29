require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
} = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const SCRYFALL_SETS_URL = 'https://api.scryfall.com/sets';
const SET_CODE_REGEX = /(?<![A-Za-z0-9])[A-Z0-9]{2,8}(?![A-Za-z0-9])/g;

let setCodeLookup = new Map();

function validateEnvironment() {
  const missing = [];

  if (!DISCORD_TOKEN) missing.push('DISCORD_TOKEN');
  if (!CLIENT_ID) missing.push('CLIENT_ID');
  if (!GUILD_ID) missing.push('GUILD_ID');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function clearCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  console.log('Clearing guild slash commands...');
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: [],
  });
  console.log('Guild slash commands cleared.');
}

function escapeMarkdownLinkText(text) {
  return text.replace(/[\\[\]]/g, '\\$&');
}

async function refreshSetList() {
  if (typeof fetch !== 'function') {
    throw new Error('This Node.js version does not include built-in fetch. Use Node.js 18 or newer.');
  }

  const response = await fetch(SCRYFALL_SETS_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'codie-discord-bot/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Scryfall request failed with ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();

  if (!Array.isArray(payload.data)) {
    throw new Error('Scryfall response did not include a set data array.');
  }

  setCodeLookup = new Map(
    payload.data
      .filter((set) => set.code && set.name && set.scryfall_uri)
      .map((set) => [
        set.code.toUpperCase(),
        {
          name: set.name,
          scryfallUri: set.scryfall_uri,
        },
      ])
  );

  console.log(`Loaded ${setCodeLookup.size} MTG sets from Scryfall.`);
}

function findSetMatches(content) {
  const codes = new Set(content.match(SET_CODE_REGEX) ?? []);

  return [...codes]
    .map((code) => setCodeLookup.get(code))
    .filter(Boolean);
}

async function startBot() {
  validateEnvironment();

  try {
    await refreshSetList();
  } catch (error) {
    console.error('Failed to load MTG set data from Scryfall:', error);
    console.error('MTG set-code detection will be unavailable until the set list is refreshed.');
  }

  try {
    await clearCommands();
  } catch (error) {
    console.error('Failed to clear slash commands:', error);
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const matches = findSetMatches(message.content);
    if (matches.length === 0) return;

    const reply = matches
      .map((set) => `[${escapeMarkdownLinkText(set.name)}](${set.scryfallUri})`)
      .join('\n');

    try {
      await message.reply({
        content: reply,
        flags: MessageFlags.SuppressEmbeds,
      });
    } catch (error) {
      console.error('Failed to reply with MTG set matches:', error);
    }
  });

  try {
    await client.login(DISCORD_TOKEN);
  } catch (error) {
    console.error('Failed to log in to Discord:', error);
    process.exit(1);
  }
}

startBot().catch((error) => {
  console.error('Unexpected startup error:', error);
  process.exit(1);
});
