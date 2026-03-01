# astrolab-presepio

[![CI](https://github.com/marcelojcn/astrolab-presepio/actions/workflows/ci.yml/badge.svg)](https://github.com/marcelojcn/astrolab-presepio/actions/workflows/ci.yml)
[![Deno](https://img.shields.io/badge/deno-v2.x-000000?logo=deno&logoColor=white)](https://deno.com)
[![License: MIT](https://img.shields.io/github/license/marcelojcn/astrolab-presepio)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/marcelojcn/astrolab-presepio?style=social)](https://github.com/marcelojcn/astrolab-presepio/stargazers)

A Secret Santa Slack automation built with the [Slack Deno SDK](https://docs.slack.dev/tools/deno-slack-sdk/). Organizers set up a gift exchange in seconds — participants join with a single click, and assignments are sent automatically on a scheduled date via private DM.

---

## 🎄 The Nativity Scene in Portugal (13th–18th Century)

The **Presépio** (Nativity Scene) is the artistic representation of the birth of Jesus and is one of the deepest traditions in Portuguese culture, evolving from a monastic religious practice into a form of erudite art.

* **Origin:** Introduced in Portugal in the 13th century by **followers of Saint Francis of Assisi** (such as Friar Fabrício), who brought the Italian tradition of recreating the Nativity.
* **The Golden Century (18th):** Under the reign of King John V, the nativity scene became a piece of ostentation and art. The sculptor **Machado de Castro** was the greatest exponent of this era, creating detailed and expressive clay figures.
* **Unique Characteristics:**
    * **Regional Scenery:** Unlike other countries, the Portuguese nativity scene mixes biblical figures with typical folk characters (millers, shepherds, washerwomen) in landscapes reminiscent of Portuguese villages.
    * **The "Throne":** In certain regions (such as Alentejo or Algarve), the Infant Jesus is placed at the top of a stepped structure (altar), surrounded by flowers and sprouted wheat (*searinhas*).

> **Key Figure:** **Joaquim Machado de Castro**, author of the famous Nativity Scene of the Basílica da Estrela, elevated these compositions to the status of narrative monuments with hundreds of figures.

## What it does

1. **Admin setup** — An organizer clicks the trigger link, fills in a short form (channel, gift exchange date, shuffle date & time, rules), and the bot posts an invitation to the chosen channel.
2. **Participants join** — Anyone in the channel clicks **Join Secret Santa** to register. They receive an ephemeral confirmation immediately.
3. **Auto-shuffle** — On the configured shuffle date, Slack automatically sends every participant a private DM with their assignment.
4. **Cancel** — The organizer can click **Cancel Event** at any time before the shuffle fires to abort the event.

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
│   ├── setup_secret_santa.ts      # Setup, join, and cancel logic
│   └── auto_shuffle.ts            # Scheduled shuffle function
├── utils/
│   └── secret_santa.ts            # Pure helpers: shuffle + derangement algorithm
├── workflows/
│   ├── start_secret_santa.ts      # Wires the setup form → function
│   └── auto_shuffle.ts            # Wired to the scheduled trigger
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

The trigger link created in Part 2 is a special Slack URL. When pasted into Slack, it renders as a clickable button. A good place for it is a pinned bookmark in the channel where you run your events, so anyone can find and click it.

To open the setup form, click the trigger link. A modal appears — fill in:

- **Channel** — where the invitation will be posted.
- **Gift Exchange Date** — the day participants will trade presents.
- **Shuffle Date & Time** — when assignments will be sent automatically.
- **Rules / Description** — budget, theme, or any other guidelines.

Click **Launch Event**. The bot posts an invitation to the chosen channel and schedules the auto-shuffle.

### Join the event

Team members in the channel click **Join Secret Santa 🎁**. They receive an ephemeral confirmation visible only to them. The button stays active until the event is cancelled or the shuffle fires.

### Auto-shuffle

On the configured shuffle date, Slack automatically runs the shuffle:

- Each participant receives a **private DM** with the name of the person they are buying a gift for, the exchange date, and the event rules.
- The channel receives a **public summary** confirming how many assignments were sent.

> **Minimum:** at least 3 participants must have joined before the shuffle runs.

### Cancel the event

To abort the event before assignments go out, click **Cancel Event** on the invitation message. A confirmation dialog appears. Once confirmed, the channel receives a public notice and the scheduled shuffle becomes a no-op.

---

## How it works internally

- **Datastores** — Two Slack-hosted datastores persist event data and participant lists across users and sessions, with no external database required.
- **`completed: false`** — The setup function returns this to keep the button handlers alive after the first interaction, allowing multiple users to click Join without the function closing.
- **Scheduled trigger** — After posting the invitation, the setup function calls `triggers.create` to schedule a one-time trigger pointing at `auto_shuffle_workflow`. The trigger fires on the chosen shuffle date and invokes the shuffle automatically.
- **Derangement algorithm** — The shuffle uses a Fisher-Yates derangement (up to 20 attempts) to guarantee no one is assigned to buy a gift for themselves.
- **Composite participant key** — Participant IDs are stored as `event_id#user_id`, making double-joins idempotent and supporting multiple concurrent events in the same workspace.
- **Cancel safety** — If an event is cancelled before the scheduled trigger fires, the auto-shuffle function detects the `cancelled` status and exits without sending any DMs.

---

## License

MIT — see [LICENSE](LICENSE).
