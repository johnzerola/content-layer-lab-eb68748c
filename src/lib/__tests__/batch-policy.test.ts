import { describe, expect, it } from "vitest";
import { batchPolicy } from "../batch-policy";

describe("batchPolicy", () => {
  it("limits large local batches and recommends cloud rendering", () => {
    expect(batchPolicy(100, 4, 16)).toMatchObject({ concurrency: 1, serverRecommended: true, chunkSize: 10 });
  });
  it("keeps medium batches bounded", () => {
    expect(batchPolicy(40, 4, 16).concurrency).toBe(2);
  });
  it("does not exceed hardware capacity for small batches", () => {
    expect(batchPolicy(4, 4, 4).concurrency).toBe(1);
  });
});
