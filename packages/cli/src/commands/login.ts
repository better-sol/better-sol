import { intro, log, outro, text, isCancel, cancel } from "@clack/prompts";
import { storeApiKey } from "#lib/auth";
import { CLI_COMMAND } from "./shared";

export async function login(): Promise<void> {
  intro("better-sol login");

  const apiKey = await text({
    message: "Enter your API key",
    placeholder: "bs_live_...",
    validate: (value: string | undefined) => {
      if (value === undefined || value.length === 0) return "API key is required.";
      return undefined;
    },
  });
  if (isCancel(apiKey)) return cancel("Login cancelled");

  await storeApiKey(String(apiKey));

  log.step("Saved to ~/.better-sol/auth.json");
  outro(`API key configured.\n  Next: ${CLI_COMMAND} deploy`);
}
