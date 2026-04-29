# codie-discord-bot

A minimal Discord bot for one server, built with Node.js, discord.js, and dotenv.

## MTG Set Detection

On startup, the bot fetches Magic: The Gathering set data from Scryfall:

```text
https://api.scryfall.com/sets
```

It caches the set list in memory and scans normal server messages for standalone uppercase set codes. Valid matches are replied to with the full set name as a clickable Scryfall link.
The bot suppresses link embeds on these replies, so only the linked set name is shown.

Example message:

```text
I opened a pack of LCI
```

Example bot reply:

```markdown
[The Lost Caverns of Ixalan](https://scryfall.com/sets/lci)
```

Lowercase and mixed-case set codes are ignored, so `lci` and `Lci` do not trigger.

## Setup

1. Install Node.js 18 or newer.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Fill in `.env`:

   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_application_client_id_here
   GUILD_ID=your_discord_server_guild_id_here
   ```

5. In the Discord Developer Portal, enable the bot and invite it to your server with this scope:

   - `bot`

6. In the Discord Developer Portal, open your application, go to **Bot**, and enable **Message Content Intent** under **Privileged Gateway Intents**.

## Running Locally

Start the bot:

```bash
npm start
```

On startup, the bot clears any previously registered guild slash commands from `GUILD_ID`, then logs in.

## Notes

- The Discord token is loaded from `process.env.DISCORD_TOKEN`.
- Previously registered guild slash commands are cleared with `process.env.CLIENT_ID` and `process.env.GUILD_ID`.
- Normal message scanning uses `GatewayIntentBits.Guilds`, `GatewayIntentBits.GuildMessages`, and `GatewayIntentBits.MessageContent`.
- MTG set data is fetched once at startup and cached in memory.
- No database or persistent storage is included.
