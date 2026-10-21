import { escapeHtml } from "./shared.js";

const STORAGE_KEY = "wearagain:tour:v1";
const targets = ["wardrobe", "candidates", "ratings", "result", "stylist", "cart"] as const;
const sentences = [
  "Choose a demo scenario or upload three photos of tops you own, with no faces in the images.",
  "Choose three outerwear items from the shop to compare with your wardrobe.",
  "Rate each pair as Would wear, Would not wear, or Render error, and watch which pairs matter and how many units are used.",
  "Inspect the cheapest basket and its minimality certificate, then try to find a cheaper basket that meets the same needs.",
  "Ask AI Stylist about an occasion, such as dinner at the Ritz, London, 19:00, and follow the agent's steps.",
  "Add the missing items to one shop's basket and choose delivery or pickup.",
];
const titles = ["Start with your wardrobe", "Make a shortlist", "Your taste, your decision", "Check the smallest basket", "AI Stylist", "One-store basket"];
const mobileSteps = [
  { target: 0, title: "Start with what you own", sentence: "Choose a demo scenario or add three face-free garment photos, then choose your three candidate coats." },
  { target: 2, title: "Judge the pairings", sentence: "Rate the separate previews and watch the decisive pairs and unit counter; a render error stays unresolved." },
  { target: 3, title: "Challenge the result", sentence: "Check the cheapest basket, inspect every cheaper alternative, and try to beat the certificate." },
  { target: 4, title: "Coming next", sentence: "Explore the planned AI Stylist and one-store basket; these features arrive in PR4b." },
];
interface SavedProgress { version: 1; step: number; complete: boolean; mobile: boolean }
function readProgress(): SavedProgress | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const saved = value as SavedProgress;
    return saved.version === 1 && typeof saved.complete === "boolean" && typeof saved.mobile === "boolean" && Number.isInteger(saved.step) && saved.step >= 0 && saved.step < (saved.mobile ? 4 : 6) ? saved : null;
  } catch { return null; }
}
function saveProgress(value: SavedProgress): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* A tour never requires storage permission. */ }
}

export function createTour(options: { showTarget: (step: number) => void; restoreFocus: () => HTMLElement | null }): { start: (restart?: boolean) => void; dispose: () => void } {
  let popover: HTMLElement | null = null;
  let veil: HTMLElement | null = null;
  let target: HTMLElement | null = null;
  let originalFocus: HTMLElement | null = null;
  let step = 0;
  let mobile = false;
  let active = false;
  let frame = 0;
  let observer: MutationObserver | null = null;
  const count = () => mobile ? mobileSteps.length : targets.length;
  const save = (complete = false) => saveProgress({ version: 1, step, mobile, complete });
  function clear() {
    observer?.disconnect(); observer = null;
    cancelAnimationFrame(frame);
    target?.classList.remove("tour-highlight");
    target = null;
    popover?.remove(); popover = null;
    veil?.remove(); veil = null;
    document.removeEventListener("keydown", keydown, true);
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
  }
  function close(complete = false) {
    save(complete); active = false; clear();
    const focus = originalFocus?.isConnected ? originalFocus : options.restoreFocus();
    focus?.focus({ preventScroll: true });
  }
  function position() {
    if (!popover || !target || mobile) return;
    const rect = target.getBoundingClientRect();
    const width = Math.min(390, window.innerWidth - 32);
    const height = popover.getBoundingClientRect().height;
    const topBelow = Math.max(16, Math.min(rect.bottom + 14, window.innerHeight - height - 16));
    const top = rect.bottom + height + 30 <= window.innerHeight ? topBelow : Math.max(16, window.innerHeight - height - 22);
    const fitsBeside = rect.right + width + 30 < window.innerWidth;
    const left = fitsBeside ? rect.right + 18 : Math.max(16, Math.min(rect.left + 20, window.innerWidth - width - 16));
    const alignedTop = fitsBeside ? Math.max(16, Math.min(rect.top + 30, window.innerHeight - height - 16)) : top;
    popover.style.cssText = `left:${left}px;top:${alignedTop}px;width:${width}px`;
  }
  function findTarget(index: number): HTMLElement | null {
    const section = document.querySelector<HTMLElement>(`[data-tour="${targets[index]}"]`);
    if (mobile) return section;
    const detail = [".wa-surface", ".wa-candidate-list", ".wa-matrix-scroll", ".wa-certificate"][index];
    return (detail ? section?.querySelector<HTMLElement>(detail) : null) ?? section;
  }
  function render() {
    clear();
    const targetIndex = mobile ? mobileSteps[step]!.target : step;
    options.showTarget(targetIndex);
    target = findTarget(targetIndex);
    if (!target) { active = false; options.restoreFocus()?.focus(); return; }
    target.classList.add("tour-highlight");
    target.scrollIntoView({ behavior: "instant", block: "center" });
    const title = mobile ? mobileSteps[step]!.title : titles[step]!;
    const sentence = mobile ? mobileSteps[step]!.sentence : sentences[step]!;
    popover = document.createElement("section");
    popover.className = `tour-popover${mobile ? " tour-inline" : ""}`;
    popover.setAttribute("role", mobile ? "region" : "dialog");
    if (!mobile) popover.setAttribute("aria-modal", "true");
    popover.setAttribute("aria-labelledby", "tour-title");
    popover.setAttribute("aria-describedby", "tour-sentence");
    popover.innerHTML = `<div class="tour-top"><span>GUIDED TOUR · ${step + 1} OF ${count()}</span><button type="button" data-tour-action="skip">Skip</button></div>${targetIndex >= 4 ? '<span class="tag">Planned · PR4b</span>' : ""}<h2 id="tour-title">${escapeHtml(title)}</h2><p id="tour-sentence">${escapeHtml(sentence)}</p><div class="tour-actions"><button type="button" class="button-ghost" data-tour-action="restart">Restart</button><div><button type="button" class="button-secondary" data-tour-action="previous" ${step === 0 ? "disabled" : ""}>Back</button><button type="button" class="button" data-tour-action="next">${step === count() - 1 ? "Finish" : "Next"}</button></div></div>`;
    popover.addEventListener("click", event => {
      const action = (event.target as Element).closest<HTMLButtonElement>("[data-tour-action]")?.dataset.tourAction;
      if (action === "skip") close();
      if (action === "restart") { step = 0; save(); render(); }
      if (action === "previous" && step > 0) { step--; save(); render(); }
      if (action === "next") next();
    });
    if (mobile) target.prepend(popover);
    else {
      veil = document.createElement("div"); veil.className = "tour-veil"; veil.setAttribute("aria-hidden", "true");
      veil.addEventListener("click", () => close());
      document.body.append(veil, popover);
    }
    document.addEventListener("keydown", keydown, true);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    position();
    // Manifest loading and status refreshes can replace the app's DOM. Keep
    // the coach mark attached to the current control without advancing it.
    observer = new MutationObserver(() => {
      if (!active || (target?.isConnected && popover?.isConnected)) return;
      target?.classList.remove("tour-highlight");
      target = findTarget(targetIndex);
      if (!target || !popover) return;
      target.classList.add("tour-highlight");
      if (mobile && !popover.isConnected) target.prepend(popover);
      position();
    });
    observer.observe(document.querySelector("#app") ?? document.body, { childList: true, subtree: true });
    frame = requestAnimationFrame(() => {
      popover?.querySelector<HTMLButtonElement>('[data-tour-action="next"]')?.focus({ preventScroll: true });
      if (mobile) popover?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }
  function next() { if (step === count() - 1) close(true); else { step++; save(); render(); } }
  function keydown(event: KeyboardEvent) {
    if (!active) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === "Tab" && !mobile && popover) {
      const buttons = [...popover.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && (document.activeElement === first || !popover.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !popover.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
  }
  return {
    start(restart = false) {
      if (active) clear();
      active = true; mobile = matchMedia("(max-width: 680px)").matches;
      originalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const saved = readProgress();
      step = !restart && saved && !saved.complete && saved.mobile === mobile ? saved.step : 0;
      save(); render();
    },
    dispose() { active = false; clear(); },
  };
}
