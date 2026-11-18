import test from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence } from "../src/recurrence.mjs";

test("daily retains local time in India and preserves seconds", () => {
  assert.equal(
    nextOccurrence("2026-11-18T18:12:13Z", "Asia/Kolkata", "daily"),
    "2026-11-19T18:12:13.000Z",
  );
});
test("weekdays skips a weekend", () => {
  assert.equal(
    nextOccurrence("2026-11-20T03:30:00Z", "Asia/Kolkata", "weekdays"),
    "2026-11-23T03:30:00.000Z",
  );
});
test("daily follows local clock across spring DST", () => {
  assert.equal(
    nextOccurrence("2026-03-07T14:00:00Z", "America/New_York", "daily"),
    "2026-03-08T13:00:00.000Z",
  );
});
test("nonexistent spring time is skipped", () => {
  assert.equal(
    nextOccurrence("2026-03-07T07:30:00Z", "America/New_York", "daily"),
    "2026-03-09T06:30:00.000Z",
  );
});
test("fall repeated hour runs once at its first occurrence", () => {
  const repeated = nextOccurrence(
    "2026-10-31T05:30:00Z",
    "America/New_York",
    "daily",
  );
  assert.equal(repeated, "2026-11-01T05:30:00.000Z");
  assert.equal(
    nextOccurrence(repeated, "America/New_York", "daily"),
    "2026-11-02T06:30:00.000Z",
  );
});
test("supports half-hour daylight-saving changes", () => {
  assert.equal(
    nextOccurrence("2026-10-03T01:30:00Z", "Australia/Lord_Howe", "daily"),
    "2026-10-04T01:00:00.000Z",
  );
});
test("none is one time and unsupported rules fail", () => {
  assert.equal(nextOccurrence("2026-11-18T01:00:00Z", "UTC", "none"), null);
  assert.throws(() => nextOccurrence("2026-11-18T01:00:00Z", "UTC", "weekly"));
});

test('recovery skips past occurrences rather than replaying them', () => {
  assert.equal(nextOccurrence('2026-03-07T14:00:00Z', 'America/New_York', 'daily', Date.parse('2026-11-18T17:00:00Z')), '2026-11-19T14:00:00.000Z');
});
