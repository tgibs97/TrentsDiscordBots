require('dotenv').config();

const {
  ActivityType,
  Client,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const SCRYFALL_RANDOM_CARD_URL = 'https://api.scryfall.com/cards/random';
const SCRYFALL_SETS_URL = 'https://api.scryfall.com/sets';

// Match standalone uppercase MTG set codes like LCI, DFT, or TDM in normal chat messages.
const SET_CODE_REGEX = /(?<![A-Za-z0-9])[A-Z0-9]{2,8}(?![A-Za-z0-9])/g;
const PRESENCE_REFRESH_INTERVAL_MS = 60_000;
const DISCORD_ACTIVITY_TEXT_MAX_LENGTH = 128;
const CASTING_WHAT_COMMAND_NAME = 'casting-what';

// The current random card is shared by the Discord presence and /casting-what command.
let currentCastingCard = null;

// Scryfall set data is fetched once at startup and stored by uppercase set code.
let setCodeLookup = new Map();

// Guild command registration replaces the previous command list, removing stale commands.
const commands = [
  new SlashCommandBuilder()
    .setName(CASTING_WHAT_COMMAND_NAME)
    .setDescription('Casting What? See what card Codie is currently casting.'),
].map((command) => command.toJSON());

function validateEnvironment() {
  const missing = [];

  if (!DISCORD_TOKEN) missing.push('DISCORD_TOKEN');
  if (!CLIENT_ID) missing.push('CLIENT_ID');
  if (!GUILD_ID) missing.push('GUILD_ID');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  console.log('Registering guild slash commands...');
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands,
  });
  console.log('Guild slash commands registered.');
}

function escapeMarkdownLinkText(text) {
  return text.replace(/[\\[\]]/g, '\\$&');
}

function ensureFetchAvailable() {
  if (typeof fetch !== 'function') {
    throw new Error('This Node.js version does not include built-in fetch. Use Node.js 18 or newer.');
  }
}

function formatCastingActivity(cardName) {
  const activity = `Casting ${cardName}`;

  // Discord activity text has length limits; trim unusual long names defensively.
  if (activity.length <= DISCORD_ACTIVITY_TEXT_MAX_LENGTH) {
    return activity;
  }

  return `${activity.slice(0, DISCORD_ACTIVITY_TEXT_MAX_LENGTH - 3)}...`;
}

async function fetchRandomCard() {
  ensureFetchAvailable();

  // Scryfall asks API clients to identify themselves with a User-Agent.
  const response = await fetch(SCRYFALL_RANDOM_CARD_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'codie-discord-bot/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Scryfall random card request failed with ${response.status} ${response.statusText}`);
  }

  const card = await response.json();

  if (!card.name || !card.scryfall_uri) {
    throw new Error('Scryfall random card response did not include a card name and Scryfall URI.');
  }

  return {
    name: card.name,
    scryfallUri: card.scryfall_uri,
  };
}

async function updatePresence(client) {
  const card = await fetchRandomCard();
  const activity = formatCastingActivity(card.name);

  // Store the full card so /casting-what can reply with the same card and link.
  currentCastingCard = card;

  client.user.setPresence({
    activities: [
      {
        name: activity,
        type: ActivityType.Custom,
      },
    ],
    status: 'online',
  });

  console.log(`Updated presence: ${activity}`);
}

function startPresenceUpdates(client) {
  let isUpdating = false;

  const refreshPresence = async () => {
    // Avoid overlapping updates if Scryfall or Discord is slow.
    if (isUpdating) return;

    isUpdating = true;

    try {
      await updatePresence(client);
    } catch (error) {
      console.error('Failed to update Discord presence:', error);
    } finally {
      isUpdating = false;
    }
  };

  refreshPresence();
  setInterval(refreshPresence, PRESENCE_REFRESH_INTERVAL_MS);
}

async function refreshSetList() {
  ensureFetchAvailable();

  // Load all MTG sets once so message matching does not need an API call per message.
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
  // Use a Set so repeated codes in one message only produce one link.
  const codes = new Set(content.match(SET_CODE_REGEX) ?? []);

  return [...codes]
    .map((code) => setCodeLookup.get(code))
    .filter(Boolean);
}

async function handleCastingWhatCommand(interaction) {
  if (!currentCastingCard) {
    await interaction.reply("I'm still choosing a spell.");
    return;
  }

  await interaction.reply(
    `I'm currently casting [${escapeMarkdownLinkText(currentCastingCard.name)}](${currentCastingCard.scryfallUri}).`
  );
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
    await registerCommands();
  } catch (error) {
    console.error('Failed to register slash commands:', error);
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
    startPresenceUpdates(readyClient);
  });

  client.on('interactionCreate', async (interaction) => {
    // Ignore autocomplete, buttons, and other non-slash-command interactions.
    if (!interaction.isChatInputCommand()) return;

    try {
      if (interaction.commandName === CASTING_WHAT_COMMAND_NAME) {
        await handleCastingWhatCommand(interaction);
      }
    } catch (error) {
      console.error(`Failed to handle /${interaction.commandName}:`, error);

      const response = {
        content: 'Something went wrong while handling that command.',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    }
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Normal chat messages are scanned for set codes and answered with Scryfall set links.
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
