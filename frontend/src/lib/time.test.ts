import { describe, expect, it } from "vitest";
import { timeAgo } from "@/lib/time";

const now = new Date("2026-10-08T12:00:00Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();

describe("timeAgo", () => {
  it.each([
    [5, "just now"],
    [59, "just now"],
    [60, "1 minute ago"],
    [5 * 60, "5 minutes ago"],
    [3 * 3600, "3 hours ago"],
    [86_400, "yesterday"],
    [3 * 86_400, "3 days ago"],
  ])("says %i seconds ago is %j", (seconds, expected) => {
    expect(timeAgo(ago(seconds), now)).toBe(expected);
  });

  it("gives the date after a week", () => {
    expect(timeAgo("2026-09-01T12:00:00Z", now)).toBe("Sep 1, 2026");
  });
});
