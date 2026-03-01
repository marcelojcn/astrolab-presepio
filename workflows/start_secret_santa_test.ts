import { assertEquals } from "@std/assert";
import { SetupSecretSantaFunction } from "../functions/setup_secret_santa.ts";
import { StartSecretSantaWorkflow } from "./start_secret_santa.ts";

Deno.test("StartSecretSantaWorkflow - has correct callback_id", () => {
  assertEquals(
    StartSecretSantaWorkflow.definition.callback_id,
    "start_secret_santa_workflow",
  );
});

Deno.test("StartSecretSantaWorkflow - has interactivity input parameter", () => {
  const props =
    StartSecretSantaWorkflow.definition.input_parameters?.properties ?? {};
  assertEquals("interactivity" in props, true);
});

Deno.test("StartSecretSantaWorkflow - has invoking_user input parameter", () => {
  const props =
    StartSecretSantaWorkflow.definition.input_parameters?.properties ?? {};
  assertEquals("invoking_user" in props, true);
});

Deno.test("StartSecretSantaWorkflow - requires interactivity", () => {
  const required =
    StartSecretSantaWorkflow.definition.input_parameters?.required ?? [];
  assertEquals(
    (required as string[]).includes("interactivity"),
    true,
  );
});

Deno.test("StartSecretSantaWorkflow - SetupSecretSantaFunction includes shuffle_date", () => {
  const props =
    SetupSecretSantaFunction.definition.input_parameters?.properties ?? {};
  assertEquals("shuffle_date" in props, true);
});
