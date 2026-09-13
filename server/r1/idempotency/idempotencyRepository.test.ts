import { describe, expect, it, vi } from "vitest";
import { completeIdempotencyRecord } from "./idempotencyRepository";

function executor(affectedRows: number) {
  const where = vi.fn().mockResolvedValue([{ affectedRows }]);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  return { executor: { update } as never, update, set, where };
}

describe("completeIdempotencyRecord", () => {
  it("completes only when exactly one pending record is affected", async () => {
    const mock = executor(1);
    await expect(
      completeIdempotencyRecord(mock.executor, "idempotency_record_01", {
        status: "access_granted",
        stateVersion: 2,
      }),
    ).resolves.toBeUndefined();
    expect(mock.update).toHaveBeenCalledOnce();
    expect(mock.set).toHaveBeenCalledWith({
      status: "completed",
      responseJson: { status: "access_granted", stateVersion: 2 },
    });
  });

  it.each([0, 2])("throws when completion affectedRows is %s", async affectedRows => {
    const mock = executor(affectedRows);
    await expect(
      completeIdempotencyRecord(mock.executor, "idempotency_record_01", {
        status: "access_granted",
        stateVersion: 2,
      }),
    ).rejects.toThrow("lost pending ownership");
  });
});
