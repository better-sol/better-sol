import { describe, expect, test } from "bun:test";
import { parseCluster } from "../src/config";
import { toSnake, toPascal, toCamel } from "../src/naming";
import { CodeWriter } from "../src/generator/code-writer";

describe("config", () => {
  test("parseCluster resolves valid cluster values", () => {
    expect(parseCluster("devnet", "localnet")).toBe("devnet");
    expect(parseCluster("testnet", "devnet")).toBe("testnet");
    expect(parseCluster("mainnet", "devnet")).toBe("mainnet");
    expect(parseCluster("localnet", "devnet")).toBe("localnet");
  });

  test("parseCluster returns fallback for undefined", () => {
    expect(parseCluster(undefined, "devnet")).toBe("devnet");
  });

  test("parseCluster throws on invalid cluster", () => {
    expect(() => parseCluster("ethereum", "devnet")).toThrow("Unsupported cluster");
  });
});

describe("naming", () => {
  test("toSnake converts camelCase", () => {
    expect(toSnake("myProgram")).toBe("my_program");
    expect(toSnake("getATA")).toBe("get_ata");
    expect(toSnake("createATA")).toBe("create_ata");
    expect(toSnake("Simple")).toBe("simple");
    expect(toSnake("parseHTMLString")).toBe("parse_html_string");
    expect(toSnake("XMLHttpRequest")).toBe("xml_http_request");
  });

  test("toSnake preserves already snake_case", () => {
    expect(toSnake("my_program")).toBe("my_program");
    expect(toSnake("simple")).toBe("simple");
  });

  test("toPascal converts snake_case and kebab-case", () => {
    expect(toPascal("my_program")).toBe("MyProgram");
    expect(toPascal("lending-market")).toBe("LendingMarket");
    expect(toPascal("Simple")).toBe("Simple");
  });

  test("toCamel converts snake_case", () => {
    expect(toCamel("my_program")).toBe("myProgram");
    expect(toCamel("simple")).toBe("simple");
  });

  test("toCamel converts kebab-case", () => {
    expect(toCamel("lending-market")).toBe("lendingMarket");
  });
});

describe("CodeWriter", () => {
  test("writes lines at current indent", () => {
    const cw = new CodeWriter();
    cw.line("first");
    cw.block("mod test", () => {
      cw.line("inner");
    });
    cw.line("outer");
    expect(cw.toString()).toBe("first\nmod test {\n    inner\n}\nouter\n");
  });

  test("blank inserts empty line", () => {
    const cw = new CodeWriter();
    cw.line("a");
    cw.blank();
    cw.line("b");
    expect(cw.toString()).toBe("a\n\nb\n");
  });

  test("nested blocks increase indent", () => {
    const cw = new CodeWriter();
    cw.block("struct Foo", () => {
      cw.line("field_a: u64,");
      cw.block("impl Foo", () => {
        cw.line("fn new() -> Self {");
      });
    });
    const out = cw.toString();
    expect(out).toContain("struct Foo {");
    expect(out).toContain("    field_a: u64,");
    expect(out).toContain("    impl Foo {");
    expect(out).toContain("        fn new() -> Self {");
    expect(out).toContain("    }");
    expect(out).toContain("    }");
    expect(out).toContain("}");
  });
});
