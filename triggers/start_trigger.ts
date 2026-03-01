import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";
import { StartSecretSantaWorkflow } from "../workflows/start_secret_santa.ts";

/**
 * A link trigger that opens the Secret Santa setup modal.
 * Share this URL with whoever should be able to create a new event.
 *
 * Deploy with:
 *   slack trigger create --trigger-def triggers/start_trigger.ts
 */
const startTrigger: Trigger<typeof StartSecretSantaWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "Start Secret Santa",
  description: "Open the setup form to launch a Secret Santa event in a channel",
  workflow: `#/workflows/${StartSecretSantaWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: TriggerContextData.Shortcut.interactivity,
    },
    invoking_user: {
      value: TriggerContextData.Shortcut.user_id,
    },
  },
};

export default startTrigger;
