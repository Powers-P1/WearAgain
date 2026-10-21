import fixture from "../../fixtures/base_models/avatars.json";
import { parseAvatarCatalog, selectAvatar } from "../../src/core/avatar.js";
import type { Avatar, AvatarBuild, AvatarSex } from "../../src/core/avatar.js";
import { escapeHtml } from "./shared.js";
import "./avatar-picker.css";

const catalog = parseAvatarCatalog(fixture);

export interface AvatarPickerState {
  sex: AvatarSex;
  adultConfirmed: boolean;
  heightCm: string;
  weightKg: string;
  build: "" | AvatarBuild;
  manualAvatarId: string;
}

export interface AvatarPickerOptions {
  mode: "demo" | "live";
  onChange: (avatarId: string | null) => void;
  initialAvatarId?: string;
  initialState?: AvatarPickerState;
}

function name(avatar: Avatar): string {
  const sex = avatar.sex === "female" ? "Woman" : "Man";
  const build = avatar.build === "belly" ? "fuller midsection" : avatar.build;
  return `${sex} · ${build}${avatar.role === "fallback" ? " · fallback" : ""}`;
}

/** Settings stay in the caller's in-memory session, never localStorage or the API. */
export function mountAvatarPicker(container: HTMLElement, options: AvatarPickerOptions): {
  dispose: () => void;
  getAvatarId: () => string | null;
  getState: () => AvatarPickerState;
} {
  const initial = catalog.find(avatar => avatar.id === options.initialAvatarId);
  const state: AvatarPickerState = options.initialState ? { ...options.initialState } : {
    sex: initial?.sex ?? "female", adultConfirmed: false,
    heightCm: "", weightKg: "", build: "", manualAvatarId: initial?.id ?? "",
  };
  let currentId: string | null = null;
  let disposed = false;
  let firstNotification = true;
  const suffix = `${Math.random().toString(36).slice(2, 9)}`;
  const id = (name: string): string => `avatar-${name}-${suffix}`;

  container.innerHTML = `<section class="avatar-picker" aria-labelledby="${id("heading")}">
    <div class="avatar-picker__heading"><h3 id="${id("heading")}">Choose a synthetic model</h3><span class="avatar-picker__label">Adult models only</span></div>
    <p class="avatar-picker__intro">A consistent starting point for separate garment previews; not a fit or size prediction.</p>
    ${options.mode === "demo" ? '<p class="avatar-picker__demo">This example uses a fictional adult model. Try another model below.</p>' : `<label class="avatar-picker__adult"><input type="checkbox" name="avatar-adult" ${state.adultConfirmed ? "checked" : ""}> <span>I am 18 or older.</span></label>`}
    <div class="avatar-picker__body">
      <figure class="avatar-picker__preview"><img data-avatar-preview alt="" width="144" height="200" hidden><span data-avatar-empty>Choose an adult model</span><figcaption>Synthetic model</figcaption></figure>
      <div class="avatar-picker__controls">
        <div class="avatar-picker__fields">
          <label for="${id("sex")}">Model sex<select id="${id("sex")}" name="avatar-sex"><option value="female" ${state.sex === "female" ? "selected" : ""}>Female</option><option value="male" ${state.sex === "male" ? "selected" : ""}>Male</option></select></label>
          <label for="${id("build")}">Build <span>(optional)</span><select id="${id("build")}" name="avatar-build"><option value="">Any build</option>${(["neutral", "slim", "average", "muscular", "belly"] as const).map(build => `<option value="${build}" ${state.build === build ? "selected" : ""}>${build === "belly" ? "Fuller midsection" : build.charAt(0).toUpperCase() + build.slice(1)}</option>`).join("")}</select></label>
          <label for="${id("height")}">Height, cm <span>(optional)</span><input id="${id("height")}" name="avatar-height" type="number" min="1" step="any" inputmode="decimal" placeholder="e.g. 170" value="${escapeHtml(state.heightCm)}"></label>
          <label for="${id("weight")}">Weight, kg <span>(optional)</span><input id="${id("weight")}" name="avatar-weight" type="number" min="1" step="any" inputmode="decimal" placeholder="e.g. 70" value="${escapeHtml(state.weightKg)}"></label>
        </div>
        <label class="avatar-picker__manual" for="${id("manual")}">Model choice<select id="${id("manual")}" name="avatar-manual"></select></label>
        <p class="avatar-picker__status" data-avatar-status aria-live="polite"></p>
      </div>
    </div>
    <p class="avatar-picker__note">Height and weight bands are nominal selection aids, not measured bodies or a size chart. Settings stay in this browser tab.</p>
  </section>`;

  const manual = container.querySelector<HTMLSelectElement>('[name="avatar-manual"]')!;
  const preview = container.querySelector<HTMLImageElement>("[data-avatar-preview]")!;
  const empty = container.querySelector<HTMLElement>("[data-avatar-empty]")!;
  const status = container.querySelector<HTMLElement>("[data-avatar-status]")!;

  function updateManualChoices(): void {
    const adults = catalog.filter(avatar => avatar.sex === state.sex && avatar.ageBand === "adult");
    const primaries = adults.filter(avatar => avatar.role !== "fallback");
    const available = (primaries.length ? primaries : adults).slice().sort((a, b) => a.id < b.id ? -1 : 1);
    if (!available.some(avatar => avatar.id === state.manualAvatarId)) state.manualAvatarId = "";
    manual.innerHTML = `<option value="">Automatic nearest model</option>${available.map(avatar => `<option value="${escapeHtml(avatar.id)}" ${state.manualAvatarId === avatar.id ? "selected" : ""}>${escapeHtml(name(avatar))}</option>`).join("")}`;
  }

  function update(): void {
    if (disposed) return;
    const previous = currentId;
    let selected: Avatar | null = null;
    try {
      if (Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]')).some(input => input.validity.badInput)) {
        throw new Error("Invalid numeric input.");
      }
      const result = selectAvatar(catalog, {
        sex: state.sex, adultConfirmed: options.mode === "demo" || state.adultConfirmed,
        ...(state.heightCm.trim() ? { heightCm: Number(state.heightCm) } : {}),
        ...(state.weightKg.trim() ? { weightKg: Number(state.weightKg) } : {}),
        ...(state.build ? { build: state.build } : {}),
        ...(state.manualAvatarId ? { manualAvatarId: state.manualAvatarId } : {}),
      });
      if (result.status === "selected") {
        selected = result.avatar;
        status.textContent = `${result.source === "manual" ? "Your choice" : "Nearest nominal match"}: ${name(result.avatar)}.`;
      } else {
        status.textContent = result.reason === "adult_confirmation_required"
          ? "Confirm that you are 18 or older to select a model for live previews."
          : "No eligible model is available for these settings.";
      }
    } catch {
      status.textContent = "Enter positive height and weight values, or leave them blank.";
    }
    currentId = selected?.id ?? null;
    preview.hidden = !selected;
    empty.hidden = !!selected;
    if (selected) {
      const path = `/assets/avatars/${encodeURIComponent(selected.file)}`;
      if (preview.getAttribute("src") !== path) preview.src = path;
      preview.alt = `Fictional adult synthetic model: ${name(selected)}`;
    } else {
      preview.removeAttribute("src");
      preview.alt = "";
    }
    if (firstNotification || previous !== currentId) {
      firstNotification = false;
      options.onChange(currentId);
    }
  }

  function change(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    switch (target.name) {
      case "avatar-adult": state.adultConfirmed = (target as HTMLInputElement).checked; break;
      case "avatar-sex": state.sex = target.value as AvatarSex; state.manualAvatarId = ""; updateManualChoices(); break;
      case "avatar-build": state.build = target.value as AvatarBuild | ""; break;
      case "avatar-height": state.heightCm = target.value; break;
      case "avatar-weight": state.weightKg = target.value; break;
      case "avatar-manual": state.manualAvatarId = target.value; break;
      default: return;
    }
    update();
  }
  function imageError(): void {
    preview.hidden = true;
    empty.hidden = false;
    empty.textContent = "Model image unavailable";
  }
  container.addEventListener("input", change);
  container.addEventListener("change", change);
  preview.addEventListener("error", imageError);
  updateManualChoices();
  update();
  return {
    dispose() { disposed = true; container.removeEventListener("input", change); container.removeEventListener("change", change); preview.removeEventListener("error", imageError); },
    getAvatarId() { return currentId; },
    getState() { return { ...state }; },
  };
}
