import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createMock } };
  },
}));

beforeAll(() => {
  process.env.FEATHERLESS_API_KEY = "test-key";
});
afterAll(() => {
  delete process.env.FEATHERLESS_API_KEY;
});

const { callJson, extractJson } = await import("@/server/llm/callJson");

const schema = z.object({ ok: z.boolean() });
const repair = (bad: string) => ({ system: "fix it", user: bad });

function reply(content: string) {
  return { choices: [{ message: { content } }] };
}

describe("extractJson", () => {
  it("strips markdown code fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("finds a balanced object amid surrounding prose", () => {
    expect(extractJson('Sure, here you go: {"a": {"b": 1}} thanks!')).toBe(
      '{"a": {"b": 1}}',
    );
  });
  it("returns null when there is no object", () => {
    expect(extractJson("no json here")).toBeNull();
  });
});

describe("callJson", () => {
  beforeEach(() => createMock.mockReset());

  it("parses valid JSON on the first attempt", async () => {
    createMock.mockResolvedValueOnce(reply('{"ok":true}'));
    const res = await callJson(schema, "sys", "user", repair);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.ok).toBe(true);
      expect(res.repaired).toBe(false);
    }
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("strips code fences before parsing", async () => {
    createMock.mockResolvedValueOnce(reply('```json\n{"ok":true}\n```'));
    const res = await callJson(schema, "sys", "user", repair);
    expect(res.ok).toBe(true);
  });

  it("repairs malformed output with a second call", async () => {
    createMock
      .mockResolvedValueOnce(reply("not json at all"))
      .mockResolvedValueOnce(reply('{"ok":true}'));
    const res = await callJson(schema, "sys", "user", repair);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.repaired).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("degrades when nothing parses even after repair", async () => {
    createMock.mockResolvedValue(reply("still not json"));
    const res = await callJson(schema, "sys", "user", repair);
    expect(res.ok).toBe(false);
  });

  it("retries without json_object mode after an HTTP 400", async () => {
    const badRequest = Object.assign(new Error("unsupported param"), { status: 400 });
    createMock
      .mockRejectedValueOnce(badRequest)
      .mockResolvedValueOnce(reply('{"ok":true}'));
    const res = await callJson(schema, "sys", "user", repair);
    expect(res.ok).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(2);
    const secondCallArgs = createMock.mock.calls[1][0];
    expect(secondCallArgs.response_format).toBeUndefined();
  });
});

describe("circuit breaker", () => {
  it("stops calling the provider after repeated failures", async () => {
    // Fresh module instance so the breaker counters start at zero and this
    // test leaves the shared instance above untouched.
    vi.resetModules();
    const { callJson: fresh } = await import("@/server/llm/callJson");

    createMock.mockReset();
    createMock.mockResolvedValue(reply("not json"));

    for (let i = 0; i < 3; i++) await fresh(schema, "sys", "user", repair);
    const callsBeforeOpen = createMock.mock.calls.length;
    expect(callsBeforeOpen).toBeGreaterThan(0);

    const res = await fresh(schema, "sys", "user", repair);
    expect(res.ok).toBe(false);
    expect(createMock.mock.calls.length).toBe(callsBeforeOpen);
  });
});
