/** Nominal selection bands, never measured bodies or a garment-size chart. */
export type AvatarSex = "female" | "male";
export type AvatarBuild = "neutral" | "slim" | "average" | "muscular" | "belly";
export type AvatarBand = readonly [number, number];

export interface Avatar {
  readonly id: string;
  readonly file: string;
  readonly sex: AvatarSex;
  readonly ageBand: string;
  readonly build: AvatarBuild;
  readonly role?: "primary" | "fallback";
  readonly heightBandCm: AvatarBand;
  readonly weightBandKg: AvatarBand;
  readonly girthBandsCm?: Readonly<Record<string, AvatarBand>>;
}

export interface AvatarSelectionInput {
  readonly sex: AvatarSex;
  /** An explicit adult declaration can replace collecting an exact age. */
  readonly adultConfirmed?: boolean;
  readonly ageYears?: number;
  readonly heightCm?: number;
  readonly weightKg?: number;
  readonly girthsCm?: Readonly<Record<string, number>>;
  readonly build?: AvatarBuild;
  readonly manualAvatarId?: string;
}

export type AvatarSelection =
  | {
      readonly status: "selected";
      readonly avatar: Avatar;
      readonly distance: number;
      readonly source: "automatic" | "manual";
      /** Missing nominal bands do not acquire guessed values. */
      readonly ignoredMeasures: readonly string[];
    }
  | {
      readonly status: "unavailable";
      readonly reason: "adult_confirmation_required" | "no_eligible_avatar" | "manual_avatar_not_eligible";
    };

const BUILDS: readonly string[] = ["neutral", "slim", "average", "muscular", "belly"];

function positive(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a finite positive number.`);
  }
}

function band(value: unknown, name: string): asserts value is AvatarBand {
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`${name} must be a band.`);
  positive(value[0], name);
  positive(value[1], name);
  if (value[1] <= value[0]) throw new TypeError(`${name} must have a positive width.`);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the fixture boundary and copy only the selection fields. */
export function parseAvatarCatalog(value: unknown): readonly Avatar[] {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.avatars)) {
    throw new TypeError("Expected an avatar catalog with version 1.");
  }
  const ids = new Set<string>();
  return value.avatars.map((item: unknown): Avatar => {
    if (!record(item) || typeof item.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(item.id)
      || typeof item.file !== "string" || !/^[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/.test(item.file)
      || (item.sex !== "female" && item.sex !== "male")
      || typeof item.ageBand !== "string" || typeof item.build !== "string" || !BUILDS.includes(item.build)
      || (item.role !== undefined && item.role !== "primary" && item.role !== "fallback")) {
      throw new TypeError("Invalid avatar catalog entry.");
    }
    if (ids.has(item.id)) throw new TypeError("Avatar IDs must be unique.");
    ids.add(item.id);
    band(item.heightBandCm, "heightBandCm");
    band(item.weightBandKg, "weightBandKg");
    let girthBandsCm: Record<string, AvatarBand> | undefined;
    if (item.girthBandsCm !== undefined) {
      if (!record(item.girthBandsCm)) throw new TypeError("girthBandsCm must be a record.");
      girthBandsCm = Object.create(null) as Record<string, AvatarBand>;
      for (const [name, value] of Object.entries(item.girthBandsCm)) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new TypeError("Invalid girth name.");
        band(value, name);
        Object.defineProperty(girthBandsCm, name, { value: [value[0], value[1]], enumerable: true });
      }
    }
    return {
      id: item.id, file: item.file, sex: item.sex, ageBand: item.ageBand,
      build: item.build as AvatarBuild,
      heightBandCm: [item.heightBandCm[0], item.heightBandCm[1]],
      weightBandKg: [item.weightBandKg[0], item.weightBandKg[1]],
      ...(item.role !== undefined ? { role: item.role } : {}),
      ...(girthBandsCm !== undefined ? { girthBandsCm } : {}),
    };
  });
}

/** Zero inside the inclusive nominal band, then distance in half-band widths. */
export function normalizedBandDistance(value: number, limits: AvatarBand): number {
  positive(value, "measurement");
  band(limits, "measurement band");
  return Math.max(0, limits[0] - value, value - limits[1]) / ((limits[1] - limits[0]) / 2);
}

function validateInput(input: AvatarSelectionInput): boolean {
  if (input.sex !== "female" && input.sex !== "male") throw new TypeError("Choose a declared model sex.");
  if (input.adultConfirmed !== undefined && typeof input.adultConfirmed !== "boolean") {
    throw new TypeError("adultConfirmed must be a boolean.");
  }
  if (input.ageYears !== undefined) {
    positive(input.ageYears, "ageYears");
    // An under-18 declaration cannot be overridden by a checkbox.
    if (input.ageYears < 18) return false;
  }
  if (input.heightCm !== undefined) positive(input.heightCm, "heightCm");
  if (input.weightKg !== undefined) positive(input.weightKg, "weightKg");
  if (input.build !== undefined && !BUILDS.includes(input.build)) throw new TypeError("Unknown build.");
  if (input.girthsCm !== undefined) {
    if (!record(input.girthsCm)) throw new TypeError("girthsCm must be a record.");
    for (const [name, value] of Object.entries(input.girthsCm)) positive(value, name);
  }
  if (input.manualAvatarId !== undefined && (typeof input.manualAvatarId !== "string" || !input.manualAvatarId)) {
    throw new TypeError("manualAvatarId must be a nonempty ID.");
  }
  return input.adultConfirmed === true || (input.ageYears !== undefined && input.ageYears >= 18);
}

function eligible(catalog: readonly Avatar[], sex: AvatarSex): readonly Avatar[] {
  const matches = catalog.filter(avatar => avatar.sex === sex && avatar.ageBand === "adult");
  const primary = matches.filter(avatar => avatar.role !== "fallback");
  return (primary.length ? primary : matches).slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Pure, input-order-independent selection. Height/weight squared-distance weights
 * are 2, girths 1; a requested build mismatch adds 1 after the square root.
 * Missing girth bands are ignored for every contender, so incomplete metadata
 * cannot earn a better distance. The fallback never crosses the declared sex.
 */
export function selectAvatar(catalog: readonly Avatar[], input: AvatarSelectionInput): AvatarSelection {
  if (!validateInput(input)) return { status: "unavailable", reason: "adult_confirmation_required" };
  // Also protect direct callers who do not enter via parseAvatarCatalog().
  const validated = parseAvatarCatalog({ version: 1, avatars: catalog });
  const candidates = eligible(validated, input.sex);
  if (!candidates.length) return { status: "unavailable", reason: "no_eligible_avatar" };
  const ignoredMeasures = Object.keys(input.girthsCm ?? {}).filter(name =>
    candidates.some(avatar => !avatar.girthBandsCm || !Object.hasOwn(avatar.girthBandsCm, name))).sort();
  const score = (avatar: Avatar): number => {
    const terms: number[] = [];
    if (input.heightCm !== undefined) terms.push(Math.SQRT2 * normalizedBandDistance(input.heightCm, avatar.heightBandCm));
    if (input.weightKg !== undefined) terms.push(Math.SQRT2 * normalizedBandDistance(input.weightKg, avatar.weightBandKg));
    for (const [name, value] of Object.entries(input.girthsCm ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      const limits = avatar.girthBandsCm?.[name];
      if (!ignoredMeasures.includes(name) && limits !== undefined) terms.push(normalizedBandDistance(value, limits));
    }
    const distance = Math.hypot(...terms) + (input.build !== undefined && input.build !== avatar.build ? 1 : 0);
    if (!Number.isFinite(distance)) throw new TypeError("Measurements exceed the supported numeric range.");
    return distance;
  };
  if (input.manualAvatarId !== undefined) {
    const avatar = candidates.find(item => item.id === input.manualAvatarId);
    if (!avatar) return { status: "unavailable", reason: "manual_avatar_not_eligible" };
    return { status: "selected", avatar, distance: score(avatar), source: "manual", ignoredMeasures };
  }
  let winner = candidates[0]!;
  let distance = score(winner);
  for (const candidate of candidates.slice(1)) {
    const candidateDistance = score(candidate);
    if (candidateDistance < distance) { winner = candidate; distance = candidateDistance; }
  }
  return { status: "selected", avatar: winner, distance, source: "automatic", ignoredMeasures };
}
