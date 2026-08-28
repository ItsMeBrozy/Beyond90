#!/bin/sh
# Render background worker — runs the Discord bot. The bot talks to the API over
# HTTP (API_URL below) and never touches the SQLite database directly.
set -e
cd bot
node dist/index.js
