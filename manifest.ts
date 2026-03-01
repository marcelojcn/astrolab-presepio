import { Manifest } from "deno-slack-sdk/mod.ts";
import { StartSecretSantaWorkflow } from "./workflows/start_secret_santa.ts";
import {
  EventsDatastore,
  ParticipantsDatastore,
} from "./datastores/participants.ts";

export default Manifest({
  name: "Presépio — Secret Santa",
  description: "Run Secret Santa gift exchange events directly in Slack",
  icon: "assets/icon.png",
  workflows: [StartSecretSantaWorkflow],
  datastores: [EventsDatastore, ParticipantsDatastore],
  outgoingDomains: [],
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "im:write",
    "channels:read",
    "datastore:read",
    "datastore:write",
  ],
});
