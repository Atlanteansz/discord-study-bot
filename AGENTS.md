# Project: Discord Study Bot
A serverless slash-command Discord bot built on Cloudflare Workers with D1/KV on a $0 budget.
Features: /remind, /deadline, /quiz, and /help.
Uses Discord HTTP interactions endpoint (no gateway WebSocket). Never commit secrets.

## Project Rules
- Follow ponytail rules: reuse what exists, write the minimum code that works, never skip validation, security or error handling, one small test for any logic with branches or parsing.
- Use the ECC planning workflow. If a command name is not found, list installed skills and use the closest match.
- Explain each file in 2-3 lines (what it does, why this choice). Do not quiz the user.
- Never overwrite existing files such as AGENTS.md. Append to them.
- Never write comments in code.
- Put the bottom line or working code first, followed only by short bullet points if needed.
- Prefer standard library and existing tools; never install packages or add dependencies without asking first.
- Always ask before running git push, deleting existing files, or creating git commits.
- Check existing project files before answering or editing; never guess project contents.
- Do not use filler or corporate words like "delve", "tapestry", "streamline", or "comprehensive".
- Format commit messages as a single short line starting with an imperative verb (e.g., Add, Fix, Remove).
- Implement the simplest solution without extra files or unnecessary abstractions.


## Architecture & Implementation Specifications
- Interaction transport: Discord HTTP interactions endpoint (no gateway WebSocket).
- Cryptographic verification: Ed25519 verification via native Web Crypto API (`crypto.subtle`).
- Secrets management: DISCORD_PUBLIC_KEY and DISCORD_TOKEN configured via Worker secrets and local .dev.vars.
- Reminders: Dispatched via Discord REST API using bot token to origin channel (channel_id stored in D1).
- Timezone handling: Asia/Manila (UTC+8) input assumed in /deadline and /remind; stored as UTC unix timestamps in D1.
- Quiz system: Button message components with interaction handlers; seeded from questions file.
- Code constraints: Plain JavaScript ES modules only; standard libraries only; zero runtime dependencies; no comments in code.

## 14-Day Roadmap
- Day 1: Scaffold, .gitignore, .dev.vars.example, Ed25519 verification, PING interaction.
- Day 2: /help command with embed response and registration script.
- Day 3: D1 database setup (schema.sql), UTC date helpers (Asia/Manila).
- Day 4: Manual worker deploy & verification; GitHub Actions CI/CD setup with repository secrets.
- Day 5: /deadline add and /deadline list commands.
- Day 6: /remind command storing user, channel, and UTC timestamp.
- Day 7: Cloudflare Scheduled Worker cron job executing Discord REST API reminder posts.
- Day 8: Quiz question seed dataset and /quiz command.
- Day 9: Discord button component interaction handling for quiz answers.
- Day 10: Rate limiting and input validation defenses.
- Day 11: Structured logging and /health endpoint.
- Day 12: Dev and prod Cloudflare environments with gitleaks secret scanning.
- Day 13: Minimal landing page for bot information and invite link.
- Day 14: README with Mermaid architecture diagram and recruiter walkthrough.
