import { expect, test } from "bun:test";
import { cliName } from "../src/index";

test("exports cli name", () => {
  expect(cliName).toBe("@better-sol/cli");
});
