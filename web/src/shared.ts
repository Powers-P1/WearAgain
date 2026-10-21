export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function money(minor: number, currency = "PLN"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}

const paths: Record<string, string> = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  "arrow-right": '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  "arrow-left": '<path d="M20 12H5m6-6-6 6 6 6"/>',
  "arrow-up-right": '<path d="M6 18 18 6M6 6h12v12"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  shirt: '<path d="m8 3-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0Z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2 7M20 4v7h-7"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  truck: '<path d="M2 5h12v12H2V5Zm12 5h4l4 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  hanger: '<path d="M9 5a3 3 0 0 1 6 0c0 2-3 2-3 4l9 7a2 2 0 0 1-1 3H4a2 2 0 0 1-1-3l9-7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  bag: '<path d="M6 7h12l2 14H4L6 7Z"/><path d="M9 8V5a3 3 0 0 1 6 0v3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  shield: '<path d="m12 2 8 3v6c0 5-4 8-8 11-4-3-8-6-8-11V5l8-3Z"/><path d="m8 12 3 3 5-6"/>',
};

export function icon(name: string, className = ""): string {
  return `<svg class="icon ${escapeHtml(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.info}</svg>`;
}

/** Display-only framing of garment artwork from the supplied design reference. */
export function garmentIllustration(name: string, label: string): string {
  const regions: Record<string, [number, number, number]> = {
    "cream-shirt": [34, 357, 145], "navy-knit": [22, 556, 155], "striped-tee": [24, 775, 150],
    "aster-trench": [307, 184, 145], "mila-coat": [585, 184, 145], "nova-jacket": [849, 186, 150],
  };
  const [x, y, side] = regions[name] ?? regions["aster-trench"]!;
  const style = `background-image:url('/assets/reference-matrix.png');background-size:${1536 / side * 100}% ${1024 / side * 100}%;background-position:${x / (1536 - side) * 100}% ${y / (1024 - side) * 100}%`;
  return `<div class="garment-illustration" role="img" aria-label="${escapeHtml(label)} - illustrative garment" style="${style}"></div>`;
}
