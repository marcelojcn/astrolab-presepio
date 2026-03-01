import { assertEquals, assertStringIncludes } from "@std/assert";
import startTrigger from "./start_trigger.ts";

Deno.test("startTrigger - has shortcut type", () => {
  assertEquals(startTrigger.type, "shortcut");
});

Deno.test("startTrigger - workflow references the start workflow", () => {
  assertStringIncludes(
    startTrigger.workflow as string,
    "start_secret_santa_workflow",
  );
});

Deno.test("startTrigger - has interactivity input", () => {
  const inputs = startTrigger.inputs ?? {};
  assertEquals("interactivity" in inputs, true);
});

Deno.test("startTrigger - has invoking_user input", () => {
  const inputs = startTrigger.inputs ?? {};
  assertEquals("invoking_user" in inputs, true);
});
