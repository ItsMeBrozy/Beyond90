# Beyond90

A lightweight web portal for a Roblox football game, inspired by **FotMob**. It consists of three parts:

1. **Client** – React + Vite UI that displays upcoming matches.
2. **Server** – Node/Express API with a SQLite database (Prisma ORM).
3. **Discord Bot** – `discord.js` bot that can add or remove matches via slash commands.

All three packages live in a Yarn/NPM **workspace** (`client`, `server`, `bot`).

---

## 📦 Prerequisites

- **Node.js** ≥ 20 (download from https://nodejs.org)
- **npm** (comes with Node) – used for installing dependencies and running scripts.
- **Git** (optional, for version control)

---

## 🛠️ Setup

```bash
# 1️⃣ Clone the repo (if you haven't already)
git clone <repo‑url>
cd Beyond90

# 2️⃣ Install all workspace dependencies
npm install   # installs client, server and bot packages
```

### Server (API)

```bash
# Move to the server workspace
cd server

# Initialise the SQLite database and generate Prisma client
npx prisma migrate dev --name init   # creates dev.db and runs migration
npx prisma generate                  # generates @prisma/client

# Start the API (default port 4000)
npm run dev
```

The API exposes:
- `GET /matches` – list all matches
- `POST /matches` – create a match (JSON body)
- `DELETE /matches/:id` – delete a match

### Client (Web UI)

```bash
# From the project root
npm run dev:client   # Vite dev server on http://localhost:3000
```

The client calls the API with relative paths that the Vite proxy forwards to `http://localhost:4000`. To point it elsewhere (e.g. production), set the environment variable `VITE_API_URL` before starting the dev server.

### Discord Bot

Create a `.env` file inside the `bot` folder (a template is already present):

```text
DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
API_URL=http://localhost:4000   # URL of the API server
```

Then run:

```bash
npm run dev:bot   # logs the bot in and registers slash commands
```

The bot registers its global slash commands, including:
- `/fixture home:<team> away:<team> league:<league> time:<date>` — fixture between existing clubs
- `/friendlymatch home:<name> away:<name> time:<date>` — exhibition game under 🤝 Friendly Matches
- `/halftime id:<match-id> homescore:<int> awayscore:<int>`
- `/fulltime id:<match-id> homescore:<int> awayscore:<int>`
- `/removematch id:<match-id>`

See `commands.txt` for the full list.

> **Note:** Global commands can take up to an hour to appear in a server. For faster testing you can change the registration to a guild‑specific command by replacing `Routes.applicationCommands` with `Routes.applicationGuildCommands(guildId)` in `bot/src/index.ts`.

---

## 🚀 Production (Docker)

A multi‑stage Dockerfile is provided (see `Dockerfile`). To build and run the whole stack:

```bash
# Build the image
docker build -t beyond90 .

# Run the container (exposes ports 3000 for the client and 4000 for the API)
docker run -d -p 3000:3000 -p 4000:4000 --name beyond90 beyond90
```

The container starts the API, the built Vite client (served with `serve`), and the Discord bot.

---

## 📚 Scripts Overview (root `package.json`)

| Script | Description |
|--------|-------------|
| `dev:client` | Starts Vite dev server (client) |
| `dev:server` | Starts Express API with `ts-node-dev` |
| `dev:bot`    | Starts Discord bot (`ts-node`) |
| `dev`        | Runs client **and** server concurrently (useful for local development) |
| `dev:all`    | 🚀 One command for everything: prints a banner, then runs **web + API + bot** together |
| `build`      | Builds the client for production |
| `prod`       | Runs the compiled server **and** bot together (used by Docker) |

---

## 📝 License

MIT – feel free to fork, modify, and host the project on **wispbyte** or any other platform.

---

**Happy coding!** If you run into any issues, check the console output of each component or open an issue in the repository.
