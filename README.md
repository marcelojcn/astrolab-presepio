# astrolab-presepio

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
- [Deno](https://deno.com/) v1.37 or later installed.

---

## Project structure

```
astrolab-presepio/
├── deno.jsonc                      # Deno config & SDK imports
├── manifest.ts                     # App manifest (workflows, datastores, scopes)
├── datastores/
│   └── participants.ts             # EventsDatastore + ParticipantsDatastore
├── functions/
│   └── setup_secret_santa.ts      # Core function: setup, join, and shuffle logic
├── workflows/
│   └── start_secret_santa.ts      # Workflow wiring the setup form → function
└── triggers/
    └── start_trigger.ts            # Link trigger definition for admin setup
```

---

## Step-by-step tutorial

### 1. Clone the repository

```bash
git clone https://github.com/your-org/astrolab-presepio.git
cd astrolab-presepio
```

### 2. Log in to the Slack CLI

```bash
slack login
```

Follow the prompts to authenticate with your Slack workspace.

### 3. Run the app locally (for development)

```bash
slack run
```

This starts the app in local development mode. Keep this terminal open — changes to source files are picked up automatically.

### 4. Create the trigger

In a **separate terminal**, run:

```bash
slack trigger create --trigger-def triggers/start_trigger.ts
```

Select the workspace when prompted. The CLI will output a shareable link that looks like:

```
https://slack.com/shortcuts/Ft0000000000/xxxxxxxxxxxxxxxxxxxx
```

Copy this URL — this is what admins use to open the setup form.

### 5. Share the trigger link

Paste the trigger link anywhere in Slack (a message, a channel bookmark, a canvas). Anyone who clicks it can create a new Secret Santa event.

### 6. Create a Secret Santa event

1. Click the trigger link.
2. A modal appears — fill in:
   - **Channel** — where the invitation will be posted.
   - **Gift Exchange Date** — the day participants will trade presents.
   - **Rules / Description** — budget, theme, or any other guidelines.
3. Click **Launch Event**.

The bot posts an invitation message to the chosen channel with two buttons.

### 7. Participants join

Team members in the channel click **Join Secret Santa 🎁**. They receive a private (ephemeral) confirmation. The button stays active indefinitely, so latecomers can join at any time.

### 8. Run the shuffle

When you're ready to send assignments, anyone clicks **Shuffle & Send Assignments 🎲**. A confirmation dialog appears — click **Yes, send assignments** to proceed.

- Each participant receives a private DM with the name of the person they are buying a gift for, the exchange date, and the event rules.
- The channel receives a summary message confirming all assignments were sent.
- The shuffle can only be run once per event.

> **Minimum requirement:** at least 3 participants must have joined before the shuffle can run.

### 9. Deploy to production

When you're ready to go live (no longer running `slack run`), deploy the app:

```bash
slack deploy
```

Then recreate the trigger pointing at the deployed app:

```bash
slack trigger create --trigger-def triggers/start_trigger.ts
```

---

## How it works internally

- **Datastores** — Two Slack-hosted datastores persist event data and participant lists across users and sessions, with no external database required.
- **`completed: false`** — The setup function returns this to keep the button handlers alive after the first interaction, allowing multiple users to click Join without the function closing.
- **Derangement algorithm** — The shuffle uses a Fisher-Yates derangement (up to 20 attempts) to guarantee no one is assigned to buy a gift for themselves.
- **Composite participant key** — Participant IDs are stored as `event_id#user_id`, making double-joins idempotent and supporting multiple concurrent events in the same workspace.

---

## License

MIT — see [LICENSE](LICENSE).
