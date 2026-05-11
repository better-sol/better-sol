import { intro, log, outro, text, isCancel, cancel } from "@clack/prompts";
import { storeApiKey } from "#lib/auth";
import { API_KEYS_URL, CLI_COMMAND, writeJson } from "./shared";

export async function login(apiKeyArg: string | undefined, options: { readonly json?: boolean; readonly interactive?: boolean } = {}): Promise<void> {
  if (options.json !== true) intro("better-sol login");

  if (apiKeyArg === undefined && options.interactive !== true) {
    throw new Error("API key is required in non-interactive mode.");
  }

  const apiKey = apiKeyArg ?? await text({
    message: "Enter your API key",
    placeholder: "bs_live_...",
    validate: (value: string | undefined) => {
      if (value === undefined || value.length === 0) return "API key is required.";
      return undefined;
    },
  });
  if (isCancel(apiKey)) return cancel("Login cancelled");

  await storeApiKey(String(apiKey));

  if (options.json === true) {
    writeJson({ ok: true, command: "login", authPath: "~/.better-sol/auth.json", next: `${CLI_COMMAND} deploy` });
    return;
  }

  log.step("Saved to ~/.better-sol/auth.json");
  outro(`API key configured.\n  Get API keys: ${API_KEYS_URL}\n  Next: ${CLI_COMMAND} deploy`);
}
