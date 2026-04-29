# TrentsDiscordBots

Discord bot projects used for Trent's servers.

## Bots

### Codie

Codie is a Node.js Discord bot focused on Magic: The Gathering and Scryfall integration.

Features:

- Rotates Codie's Discord presence every 60 seconds to `Casting <CARDNAME>` using a random card from Scryfall.
- Provides `/casting-what`, which replies with a Scryfall link to the card Codie is currently casting.
- Scans normal chat messages for standalone uppercase MTG set codes, then replies with Scryfall set links.

Code and detailed setup instructions live in [`Codie/`](Codie/).

## Local Development

Each bot keeps its own dependencies and configuration. For Codie:

```bash
cd Codie
npm install
npm start
```

Codie requires these environment variables:

```env
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_application_client_id_here
GUILD_ID=your_discord_server_guild_id_here
```
