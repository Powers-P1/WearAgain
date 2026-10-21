import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizedBandDistance, parseAvatarCatalog, selectAvatar } from "../dist/core/avatar.js";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/base_models/avatars.json", import.meta.url), "utf8"));
const catalog = parseAvatarCatalog(fixture);
const base = { sex: "female", ageYears: 30 };
const avatar = (id, extra = {}) => ({ id, file: `${id}.png`, sex: "female", ageBand: "adult", build: "neutral", heightBandCm: [160, 180], weightBandKg: [60, 80], ...extra });

test("avatar fixture contains ten adult primaries and one fallback", () => {
  assert.equal(catalog.length, 11);
  assert.equal(catalog.filter(x => x.role === "fallback").length, 1);
  assert.equal(catalog.filter(x => x.ageBand === "adult").length, 11);
});

test("selection uses the actual nominal bands and keeps the declared sex", () => {
  const result = selectAvatar(catalog, { ...base, heightCm: 166, weightKg: 55 });
  assert.equal(result.status, "selected");
  assert.equal(result.avatar.id, "woman_neutral_01");
  assert.equal(result.distance, 0);
  assert.equal(selectAvatar(catalog, { sex: "male", adultConfirmed: true, build: "muscular", heightCm: 175, weightKg: 94 }).avatar.id, "man_L_muscular_01");
});

test("inclusive band edges are zero and one half-width beyond the edge is one", () => {
  for (const value of [160, 170, 180]) assert.equal(normalizedBandDistance(value, [160, 180]), 0);
  assert.equal(normalizedBandDistance(150, [160, 180]), 1);
  assert.equal(normalizedBandDistance(190, [160, 180]), 1);
});

test("normalized height/weight have weight two and build adds one after the root", () => {
  const result = selectAvatar([avatar("a")], { ...base, heightCm: 190, weightKg: 90, build: "slim" });
  assert.ok(Math.abs(result.distance - 3) < 1e-12); // sqrt(2 * 1² + 2 * 1²) + 1
});

test("every input permutation gives the same ID at ties", () => {
  const entries = [avatar("z"), avatar("a"), avatar("m")];
  for (const ordered of [entries, [...entries].reverse(), [entries[1], entries[2], entries[0]]]) {
    assert.equal(selectAvatar(ordered, base).avatar.id, "a");
  }
  for (let offset = 0; offset < catalog.length; offset++) {
    const rotated = [...catalog.slice(offset), ...catalog.slice(0, offset)];
    assert.deepEqual(selectAvatar(rotated, { ...base, heightCm: 175, weightKg: 80 }), selectAvatar(catalog, { ...base, heightCm: 175, weightKg: 80 }));
  }
});

test("children, missing adult declarations and an under-18 declaration cannot select", () => {
  assert.deepEqual(selectAvatar([avatar("child", { ageBand: "child" })], base), { status: "unavailable", reason: "no_eligible_avatar" });
  for (const input of [{ sex: "female" }, { sex: "female", ageYears: 17 }, { sex: "female", ageYears: 17, adultConfirmed: true }]) {
    assert.deepEqual(selectAvatar(catalog, input), { status: "unavailable", reason: "adult_confirmation_required" });
  }
  assert.equal(selectAvatar(catalog, { sex: "female", ageYears: 18 }).status, "selected");
  assert.equal(selectAvatar(catalog, { sex: "female", adultConfirmed: true }).status, "selected");
});

test("fallback is considered only without a same-sex adult primary", () => {
  const entries = [avatar("primary", { heightBandCm: [200, 210] }), avatar("fallback", { role: "fallback" })];
  assert.equal(selectAvatar(entries, { ...base, heightCm: 170 }).avatar.id, "primary");
  assert.equal(selectAvatar(entries.slice(1), base).avatar.id, "fallback");
  assert.equal(selectAvatar([avatar("male", { sex: "male" }), entries[1]], base).avatar.id, "fallback");
  assert.deepEqual(selectAvatar(entries.slice(1), { sex: "male", ageYears: 20 }), { status: "unavailable", reason: "no_eligible_avatar" });
});

test("manual selection overrides distance but not sex, adult status or primary policy", () => {
  const chosen = selectAvatar(catalog, { ...base, heightCm: 160, weightKg: 54, manualAvatarId: "woman_L_muscular_01" });
  assert.equal(chosen.source, "manual");
  assert.equal(chosen.avatar.id, "woman_L_muscular_01");
  for (const manualAvatarId of ["man_neutral_01", "missing", "synthetic_model_01_upper"]) {
    assert.deepEqual(selectAvatar(catalog, { ...base, manualAvatarId }), { status: "unavailable", reason: "manual_avatar_not_eligible" });
  }
});

test("girths use weight one; absent bands are explicitly ignored for all contenders", () => {
  const withBands = [avatar("a", { girthBandsCm: { waist: [60, 80] } })];
  const result = selectAvatar(withBands, { ...base, heightCm: 190, girthsCm: { waist: 90 } });
  assert.ok(Math.abs(result.distance - Math.sqrt(3)) < 1e-12);
  const mixed = [...withBands, avatar("b")];
  const ignored = selectAvatar(mixed, { ...base, girthsCm: { waist: 100 } });
  assert.equal(ignored.avatar.id, "a");
  assert.equal(ignored.distance, 0);
  assert.deepEqual(ignored.ignoredMeasures, ["waist"]);
  assert.deepEqual(selectAvatar(catalog, { ...base, girthsCm: { waist: 90 } }).ignoredMeasures, ["waist"]);
});

test("invalid numeric inputs and malformed catalogs fail closed", () => {
  for (const field of ["heightCm", "weightKg", "ageYears"]) {
    for (const value of [0, -1, NaN, Infinity, "170"]) assert.throws(() => selectAvatar(catalog, { ...base, [field]: value }), TypeError);
  }
  for (const input of [{ ...base, sex: "unknown" }, { ...base, build: "unknown" }, { ...base, adultConfirmed: "yes" }, { ...base, girthsCm: { waist: NaN } }]) {
    assert.throws(() => selectAvatar(catalog, input), TypeError);
  }
  for (const entries of [[avatar("a", { heightBandCm: [170, 170] })], [avatar("a", { file: "../private.png" })], [avatar("a"), avatar("a")]]) {
    assert.throws(() => parseAvatarCatalog({ version: 1, avatars: entries }), TypeError);
  }
});

test("catalogs and inputs are not mutated, and the selected avatar is a copy", () => {
  const before = structuredClone(catalog);
  const input = { ...base, heightCm: 166 };
  const result = selectAvatar(catalog, input);
  result.avatar.heightBandCm[0] = 1;
  assert.deepEqual(catalog, before);
  assert.deepEqual(input, { ...base, heightCm: 166 });
});
