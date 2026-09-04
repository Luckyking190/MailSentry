import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteEmails = vi.fn();
const deleteJobs = vi.fn();
const transaction = vi.fn(async (ops: unknown[]) => ops);

vi.mock("@/server/db", () => ({
  prisma: {
    emailRecord: { deleteMany: (...a: unknown[]) => deleteEmails(...a) },
    scanJob: { deleteMany: (...a: unknown[]) => deleteJobs(...a) },
    $transaction: (ops: unknown[]) => transaction(ops),
  },
}));

const { wipeUserMail } = await import("@/server/account/wipe");

beforeEach(() => {
  deleteEmails.mockReset().mockReturnValue({ count: 3 });
  deleteJobs.mockReset().mockReturnValue({ count: 1 });
  transaction.mockClear();
});

describe("wipeUserMail", () => {
  it("scopes both deletes to the signed-out user", async () => {
    const count = await wipeUserMail("user-123");

    expect(count).toBe(3);
    expect(deleteEmails).toHaveBeenCalledWith({ where: { userId: "user-123" } });
    expect(deleteJobs).toHaveBeenCalledWith({ where: { userId: "user-123" } });
  });

  it("refuses a blank userId instead of matching every row", async () => {
    // deleteMany({ where: { userId: undefined } }) would wipe the whole table,
    // so the guard has to short-circuit before Prisma is touched at all.
    expect(await wipeUserMail("")).toBe(0);
    expect(deleteEmails).not.toHaveBeenCalled();
    expect(deleteJobs).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
