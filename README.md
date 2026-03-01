# astrolab-presepio

[![CI](https://github.com/marcelojcn/astrolab-presepio/actions/workflows/ci.yml/badge.svg)](https://github.com/marcelojcn/astrolab-presepio/actions/workflows/ci.yml)
[![Deno](https://img.shields.io/badge/deno-v2.x-000000?logo=deno&logoColor=white)](https://deno.com)
[![License: MIT](https://img.shields.io/github/license/marcelojcn/astrolab-presepio)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/marcelojcn/astrolab-presepio?style=social)](https://github.com/marcelojcn/astrolab-presepio/stargazers)
[![Known Vulnerabilities](https://snyk.io/test/github/marcelojcn/astrolab-presepio/badge.svg)](https://snyk.io/test/github/marcelojcn/astrolab-presepio)

A Secret Santa Slack automation built with the [Slack Deno SDK](https://docs.slack.dev/tools/deno-slack-sdk/). Organizers set up a gift exchange in seconds — participants join with a single click, and anyone can trigger the shuffle to send private DM assignments.

---

## What it does

1. **Admin setup** — An organizer clicks the trigger link, fills in a short form (channel, gift exchange date, rules), and the bot posts an invitation to the chosen channel.
2. **Participants join** — Anyone in the channel clicks **Join Secret Santa** to register. They receive an ephemeral confirmation immediately.
3. **Shuffle** — When registration is ready, anyone clicks **Shuffle & Send Assignments**. Every participant receives a private DM telling them who they are buying a gift for, along with the rules and exchange date.

---

## Requirements

- A Slack workspace on a **paid plan** (Pro, Business+, or Enterprise Grid) — the Slack Next-gen platform / Automations feature is required.
- [Slack CLI](https://api.slack.com/automation/cli/install) installed and authenticated.
- [Deno](https://deno.com/) v2.x installed.

---

## Project structure

```
astrolab-presepio/
├── deno.jsonc                      # Deno config, tasks & SDK imports
├── manifest.ts                     # App manifest (workflows, datastores, scopes)
├── datastores/
│   └── participants.ts             # EventsDatastore + ParticipantsDatastore
├── functions/
│   └── setup_secret_santa.ts      # Core function: setup, join, and shuffle logic
├── utils/
│   └── secret_santa.ts            # Pure helpers: shuffle + derangement algorithm
├── workflows/
│   └── start_secret_santa.ts      # Workflow wiring the setup form → function
└── triggers/
    └── start_trigger.ts            # Link trigger definition for admin setup
```

---

## Part 1 — Test it locally

Use local mode to iterate quickly without a permanent deployment. The app runs on your machine and connects to Slack via a tunnel.

### 1. Clone the repository

```bash
git clone https://github.com/marcelojcn/astrolab-presepio.git
cd astrolab-presepio
```

### 2. Log in to the Slack CLI

```bash
slack login
```

Follow the prompts to authenticate with your Slack workspace.

### 3. Start the local dev server

```bash
slack run
```

Keep this terminal open. The app is now live in your workspace and any source changes are picked up automatically.

### 4. Create a local trigger

In a **separate terminal**, run:

```bash
slack trigger create --trigger-def triggers/start_trigger.ts
```

Select the workspace when prompted. The CLI outputs a link like:

```
https://slack.com/shortcuts/Ft0000000000/xxxxxxxxxxxxxxxxxxxx
```

This link is tied to your local dev instance — it only works while `slack run` is active. Use it to test the full flow before deploying.

---

## Part 2 — Deploy to Slack

Deploy the app to Slack's infrastructure so it runs 24/7 without your machine.

### 1. Deploy the app

```bash
slack deploy
```

The CLI bundles and uploads everything. Once complete, the app is hosted by Slack.

### 2. Create a production trigger

```bash
slack trigger create --trigger-def triggers/start_trigger.ts
```

> **Note:** this creates a new trigger pointing at the deployed app — it is separate from any trigger created during local testing. Copy the new URL; this is the permanent one to share.

---

## Part 3 — How to use it

### Set up a Secret Santa event

1. Paste the trigger link anywhere in Slack (a message, a channel bookmark, a canvas) and click it.
2. A modal appears — fill in:
   - **Channel** — where the invitation will be posted.
   - **Gift Exchange Date** — the day participants will trade presents.
   - **Rules / Description** — budget, theme, or any other guidelines.
3. Click **Launch Event**.

The bot posts an invitation to the chosen channel with two buttons.

### Join the event

Team members in the channel click **Join Secret Santa 🎁**. They receive an ephemeral confirmation visible only to them. The button stays active indefinitely, so latecomers can join at any time.

### Send assignments

When registration is closed, anyone clicks **Shuffle & Send Assignments 🎲**. A confirmation dialog appears — click **Yes, send assignments** to proceed.

- Each participant receives a **private DM** with the name of the person they are buying a gift for, the exchange date, and the event rules.
- The channel receives a **public summary** confirming how many assignments were sent.
- The shuffle can only be run **once per event**.

> **Minimum:** at least 3 participants must have joined before the shuffle can run.

---

## How it works internally

- **Datastores** — Two Slack-hosted datastores persist event data and participant lists across users and sessions, with no external database required.
- **`completed: false`** — The setup function returns this to keep the button handlers alive after the first interaction, allowing multiple users to click Join without the function closing.
- **Derangement algorithm** — The shuffle uses a Fisher-Yates derangement (up to 20 attempts) to guarantee no one is assigned to buy a gift for themselves.
- **Composite participant key** — Participant IDs are stored as `event_id#user_id`, making double-joins idempotent and supporting multiple concurrent events in the same workspace.

---

## License

MIT — see [LICENSE](LICENSE).
