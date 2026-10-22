const CROPS: Record<string,string> = {"shoppersArt-296-674-100-112":"v1-crop-0","shoppersArt-404-674-99-112":"v1-crop-1","shoppersArt-42-675-216-126":"v1-crop-2","retailersArt-456-130-110-162":"v1-crop-3","shoppersArt-578-45-215-159":"v1-crop-4","shoppersArt-1-1105-393-181":"v1-crop-5","shoppersArt-590-1413-177-132":"v1-crop-6","retailersArt-580-1677-210-234":"v1-crop-7","retailersArt-29-713-153-131":"v1-crop-8","retailersArt-608-1339-184-162":"v1-crop-9","retailersArt-373-1661-417-252":"v1-crop-10"};
type LandingKind = "shoppers" | "retailers";

const shoppersArt = "/assets/reference-shoppers.png";
const retailersArt = "/assets/reference-retailers.webp";

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

/** Frame a photograph-only region of a supplied design reference; the UI stays HTML. */
function photograph(source: string, x: number, y: number, width: number, height: number, alt: string, className = ""): string {
 const key = [source === shoppersArt ? "shoppersArt" : "retailersArt", x, y, width, height].join("-");
 const classKey = CROPS[key] ?? "";
 return '<span class="landing-photo '+className+' '+classKey+'"><span class="landing-photo-frame"><img src="'+source+'" alt="'+escape(alt)+'" loading="eager" decoding="sync" width="793" height="1983"></span></span>';
}

function mark(name: "hanger" | "heart" | "calendar" | "person" | "image" | "document" | "bag" | "chart" | "database" | "brush" | "list" | "arrow" | "check"): string {
  const paths: Record<typeof name, string> = {
    hanger: '<path d="M10 7a3 3 0 0 1 6 0c0 2-3 2-3 4v1L3 18a1 1 0 0 0 .5 2h18a1 1 0 0 0 .5-2l-9-6"/>',
    heart: '<path d="M12 21 3.7 13.1C-2 7.5 5.5 1 12 7c6.5-6 14 0.5 8.3 6.1Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="17" rx="1.5"/><path d="M7 2v6m10-6v6M3 11h18M7 15h1m4 0h1m4 0h1M7 18h1m4 0h1"/>',
    person: '<circle cx="12" cy="7" r="4"/><path d="M3 22v-2a9 9 0 0 1 18 0v2Z"/>',
    image: '<rect x="2" y="3" width="20" height="18" rx="1.5"/><circle cx="8" cy="8" r="1.5"/><path d="m3 18 6-6 4 4 3-3 5 5"/>',
    document: '<path d="M6 2h10l3 3v17H5V2h1m10 0v5h3M8 10h8M8 14h8M8 18h5"/>',
    bag: '<path d="m4 8-1 14h18L20 8ZM8 9V6a4 4 0 0 1 8 0v3"/>',
    chart: '<path d="M3 14h4v8H3Zm7-7h4v15h-4Zm7-5h4v20h-4Z"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 4 16 4 16 0V5M4 11v6c0 4 16 4 16 0v-6"/>',
    brush: '<path d="m14 14 7-9a2 2 0 0 0-3-3l-9 7ZM9 10c-5 0-2 7-7 9 8 3 13-1 9-7"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
  };
  return `<svg class="landing-icon landing-icon-${name}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function header(kind: LandingKind): string {
  return `<header class="landing-header"><a class="landing-brand" href="/" aria-label="WearAgain home">WearAgain</a><nav class="landing-audiences" aria-label="Audience"><a href="/" ${kind === "shoppers" ? 'aria-current="page"' : ""}>For shoppers</a><a href="/retail/" ${kind === "retailers" ? 'aria-current="page"' : ""}>For retailers</a><a class="landing-quiet-judge" href="/judges/">For judges</a></nav><a class="button landing-header-cta" href="${kind === "shoppers" ? "/app" : "#pilot-contact"}">${kind === "shoppers" ? "Try the demo" : "Plan a retail pilot"}${kind === "retailers" ? mark("arrow") : ""}</a></header>`;
}

function footer(kind: LandingKind): string {
  return `<footer class="landing-footer"><a class="landing-brand" href="/">WearAgain</a><p>${kind === "shoppers" ? "Try-on: YouCam API. Purchase logic: deterministic.<br>AI proposes (planned)." : "Retail pilot concept. Illustrative previews.<br>Retailer integration and checkout handoff are planned."}</p><nav aria-label="Footer"><a href="/">For shoppers</a><a href="/retail/">For retailers</a><a href="/judges/">For judges ${mark("arrow")}</a></nav></footer>`;
}

function pairPreview(): string {
  return `<div class="landing-pair-previews"><figure>${photograph(shoppersArt, 296, 674, 100, 112, "Illustrative synthetic model wearing a navy top")}<figcaption>Your top</figcaption></figure><figure>${photograph(shoppersArt, 404, 674, 99, 112, "Illustrative synthetic model wearing a tan coat")}<figcaption>Coat candidate</figcaption></figure></div>`;
}

function wardrobePhoto(className = ""): string {
  return photograph(shoppersArt, 42, 675, 216, 126, "Illustration of a cream shirt, navy knit and striped top on hangers", className);
}

function coatPhoto(className = ""): string {
  return photograph(retailersArt, 456, 130, 110, 162, "Illustration of a tan coat from a fictional catalogue", className);
}

function benefit(icon: Parameters<typeof mark>[0], title: string, body = ""): string {
  return `<div class="landing-benefit">${mark(icon)}<p>${title}</p>${body ? `<span>${body}</span>` : ""}</div>`;
}

function shoppers(): string {
  return `${header("shoppers")}<main id="main-content" class="landing-main landing-shoppers">
    <section class="landing-hero landing-section">
      <div class="landing-hero-copy"><span class="landing-prototype">Hackathon prototype</span><p class="landing-overline">For a wardrobe you actually wear</p><h1>Buy what earns a place<br class="landing-wide-only"> in your wardrobe.</h1><p class="landing-lead">See how a new coat works with the tops you already own. Choose the smallest purchase that meets your needs - even if that means buying nothing.</p><div class="landing-actions"><a class="button" href="/app/">Try the demo</a><a class="landing-text-link" href="#how-it-works">See how it works ${mark("arrow")}</a></div><a class="landing-tour-link" href="/judges/demo/">Start the guided demo ${mark("arrow")}</a></div>
      <div class="landing-hero-media" aria-label="Illustrative wardrobe and separate garment previews">
        <div class="landing-hero-portrait">${photograph(shoppersArt, 578, 45, 215, 159, "Illustrative synthetic fashion model")}</div>
        <div class="landing-wardrobe-mini"><strong>Your tops</strong>${wardrobePhoto()}</div>
        <div class="landing-coat-mini"><strong>A coat candidate</strong>${coatPhoto()}</div>
        <div class="landing-hero-pair"><strong>Separate previews. Your decision.</strong>${pairPreview()}<span>Your wardrobe, considered.</span><small>Illustrative previews · synthetic model</small></div>
      </div>
    </section>
    <p class="landing-privacy-line">Garment photos only, no face photos. Try-on uses a synthetic model. YouCam retains uploads and results for 24 hours.</p>

    <section class="landing-problem landing-section"><div><h2>A lovely coat.<br>But will you wear it?</h2><p>A purchase makes sense when it works with your real wardrobe, your plans and your budget.</p></div><div class="landing-benefits">${benefit("hanger", "Start with<br>what you own.")}${benefit("heart", "Keep your taste<br>in the decision.")}${benefit("calendar", "Make every<br>addition count.")}</div></section>

    <section id="how-it-works" class="landing-how landing-section"><h2>From maybe to a reason to buy.</h2><div class="landing-step-grid">
      <article class="landing-step"><div class="landing-step-title"><span>01</span><h3>Add three tops you own</h3></div><p>Garment photos, on a hanger or laid flat.</p>${wardrobePhoto()}</article>
      <article class="landing-step"><div class="landing-step-title"><span>02</span><h3>Compare your coat shortlist</h3></div><p>Separate previews on a synthetic model.<br>You rate the pairings.</p>${pairPreview()}<small>Illustrative previews · synthetic model</small></article>
      <article class="landing-step"><div class="landing-step-title"><span>03</span><h3>Find your smallest basket</h3></div><p>A transparent calculation checks the outfits you need.</p><div class="landing-step-result"><ul><li>${mark("check")}Work</li><li>${mark("check")}Weekend</li><li>${mark("check")}Evening</li></ul><div>${coatPhoto()}<span>Find the lowest-cost basket that covers your needs.</span></div></div></article>
    </div></section>

    <section class="landing-certificate landing-section"><div class="landing-section-copy"><h2>The lowest-cost basket.<br>With a reason.</h2><p>Every cheaper basket is checked.<br>You can see which need it misses.</p><p class="landing-muted">Your ratings. Your requirements.<br>A checkable result.</p></div><div class="landing-certificate-panel"><div class="landing-panel-label">Synthetic example · PLN</div><div class="landing-certificate-body"><div class="landing-winner"><span>Selected by the solver</span><h3>One new piece</h3><strong>C · 90 PLN<small>Synthetic example</small></strong><div class="landing-winner-content">${coatPhoto()}<ul><li>${mark("check")}Work</li><li>${mark("check")}Weekend</li><li>${mark("check")}Evening</li></ul></div></div><div class="landing-cheaper"><h3>All cheaper baskets - and why they don't work</h3><div><strong>Empty · 0 PLN<small>Synthetic example</small></strong><span>Misses work, weekend and evening</span></div><div><strong>A · 40 PLN<small>Synthetic example</small></strong><span>Misses evening</span></div><div><strong>B · 60 PLN<small>Synthetic example</small></strong><span>Misses work and weekend</span></div></div></div><p class="landing-certificate-scope">Minimum within the chosen catalogue, declared needs and the shopper's own ratings. Unrated pairs and image errors remain unresolved; they are never a dislike.</p></div></section>

    <section class="landing-zero"><div>${photograph(shoppersArt, 1, 1105, 393, 181, "Illustration of cream and navy knits folded on a wooden table")}</div><div><h2>Sometimes, the best basket is empty.</h2><p class="landing-zero-highlight">No new pieces.</p><p>If the things you own already meet your needs, WearAgain can tell you to keep them.</p><a class="landing-text-link" href="/app/#check">Explore the buy-nothing example ${mark("arrow")}</a></div></section>

    <section class="landing-trust landing-section"><h2>Your taste leads. The calculation explains.</h2><div class="landing-trust-grid">${benefit("person", "You choose what you<br>would wear.")}${benefit("image", "An image error is<br>never a dislike.")}${benefit("document", "The certificate explains<br>cheaper alternatives.")}</div></section>

    <section class="landing-stylist landing-section"><div><p class="landing-overline">Planned · AI Stylist</p><h2>Dress me for the moment.</h2><p>Describe the occasion. The agent proposes outfits from your wardrobe; the solver certifies the purchase.</p><p class="landing-occasion">Dinner at the Ritz, London, 19:00 <span>Planned</span></p></div><div class="landing-stylist-photo">${photograph(shoppersArt, 590, 1413, 177, 132, "Illustrative synthetic fashion model in an evening setting")}</div></section>

    <section class="landing-retail-invitation landing-section"><div><p class="landing-overline">For retailers · Retail pilot concept</p><h2>Help customers see what belongs.</h2><p>Put your catalogue in the context of what a shopper already owns.</p><div class="landing-inline-benefits">${benefit("hanger", "Wardrobe-aware<br>discovery")}${benefit("chart", "Explainable<br>recommendations")}${benefit("bag", "One-store basket<br><small>Planned</small>")}</div><div class="landing-actions"><a class="button" href="/retail/">Explore a retail pilot ${mark("arrow")}</a><span class="landing-muted">Retailer integration planned.<br>No live checkout.</span></div></div><div class="landing-retail-photo">${photograph(retailersArt, 580, 1677, 210, 234, "Illustration of a rail of neutral coats and knits")}</div></section>

    <section class="landing-judging landing-section" id="for-judges"><div><h2>See the decision behind the outfit.</h2><p>For the jury: explore the solver, the zero-purchase case and the evidence for every cheaper alternative.</p><div class="landing-actions"><a class="button" href="/app/">Try the demo</a><a class="button button-secondary" href="/judges/">View on GitHub ${mark("arrow")}</a></div><a class="landing-tour-link" href="/judges/demo/">Start the guided demo ${mark("arrow")}</a></div><div class="landing-faq"><details><summary>Is it a fit guarantee?</summary><p>No. Previews help you judge combinations, not physical fit. Avatar bands are nominal selection aids, not a size chart.</p></details><details><summary>Who makes the decision?</summary><p>You rate the pairings. The deterministic solver checks the basket. AI Stylist is planned: the agent will propose; the core will verify.</p></details><details><summary>Can the answer be no purchase?</summary><p>Yes, when outfits you rated “would wear” from your existing wardrobe already cover your declared needs.</p></details><details><summary>Can I use it on my phone?</summary><p>The hackathon demo is a web app you can install as a PWA. The target product is native iOS and Android apps distributed through the app stores; those apps are planned.</p></details></div></section>

    <section class="landing-close"><h2>More outfits from what you own.</h2><a class="button" href="/app/">Try the demo ${mark("arrow")}</a><p>Web / PWA demo now. Native iOS and Android apps planned.</p></section>
  </main>${footer("shoppers")}`;
}

function retailStorePreview(): string {
  return `<div class="landing-store-window"><div class="landing-store-header"><strong>Your store</strong><span>Coats &amp; jackets</span>${mark("bag")}</div><div class="landing-store-product">${coatPhoto()}<div><span class="landing-muted">Catalogue concept</span><h3>A coat, in context.</h3><div class="landing-store-cta">See it with your wardrobe ${mark("arrow")}</div><div class="landing-store-tops"><strong>Your tops</strong>${wardrobePhoto()}</div><strong class="landing-store-pair-title">Pairing previews · separate garments</strong>${pairPreview()}</div></div><p>Illustrative previews · synthetic model · proposed store experience</p></div>`;
}

function retailers(contactEmail?: string): string {
  const validEmail = typeof contactEmail === "string" && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(contactEmail) ? contactEmail : null;
  return `${header("retailers")}<main id="main-content" class="landing-main landing-retailers">
    <section class="landing-retailer-hero landing-section"><div><p class="landing-overline">For fashion eCommerce <span class="landing-prototype">Retail pilot concept</span></p><h1>Give shoppers a reason<br class="landing-wide-only"> to choose your store.</h1><p class="landing-lead">Show how your coats relate to what the shopper already owns. Turn browsing into a purchase they can explain.</p><div class="landing-actions"><a class="button" href="#pilot-contact">Plan a retail pilot ${mark("arrow")}</a><a class="landing-text-link" href="/app/">See the shopper journey ${mark("arrow")}</a></div></div>${retailStorePreview()}</section>

    <section class="landing-problem landing-section"><div><h2>The missing context is<br>already in their wardrobe.</h2><p>The shopper likes the coat. They still need to know where it fits in their life. Give them a useful answer while they are considering your catalogue.</p></div><div class="landing-benefits">${benefit("hanger", "Make your products<br>personally relevant.")}${benefit("heart", "Help hesitant shoppers<br>make a considered choice.")}${benefit("bag", "Give customers<br>a useful reason to return.")}</div></section>

    <section class="landing-how landing-section"><h2>Your catalogue. Their wardrobe. Your checkout.</h2><div class="landing-step-grid landing-step-grid-four"><article class="landing-step"><div class="landing-step-title"><span>01</span><h3>Start with your products</h3></div><p>A focused shortlist from your catalogue.</p>${photograph(retailersArt, 29, 713, 153, 131, "Illustration of coats in a proposed retail catalogue")}</article><article class="landing-step"><div class="landing-step-title"><span>02</span><h3>Add wardrobe context</h3></div><p>Three tops the shopper already owns.</p>${wardrobePhoto()}</article><article class="landing-step"><div class="landing-step-title"><span>03</span><h3>Let the shopper choose</h3></div><p>Separate previews. Their judgement. A reason for the recommendation.</p>${pairPreview()}</article><article class="landing-step"><div class="landing-step-title"><span>04</span><h3>Return to your checkout</h3></div><p>Send the selected products back to your basket.</p><div class="landing-handoff"><strong>Your store ${mark("bag")}</strong>${coatPhoto()}<span>Basket handoff · Planned</span></div></article></div><p class="landing-section-caption">Proposed pilot flow. Retailer integration and checkout handoff are planned. The demo has no real checkout.</p></section>

    <section class="landing-paid-pilot landing-section"><div><h2>A shopping service worth paying for.</h2><p>You pay for a useful decision journey built around your brand and catalogue.</p><div class="landing-services">${benefit("database", "Make the right<br>products relevant.", "Catalogue setup and selection rules.")}${benefit("brush", "Keep the<br>experience yours.", "A shopper journey shaped around your brand.")}${benefit("chart", "Keep pilot spend<br>predictable.", "Preview usage with an agreed budget.")}${benefit("document", "Know when<br>to scale.", "Results against agreed commercial goals.")}</div></div><aside><h3>A focused paid pilot</h3><p>One category. Clear scope.<br>Agreed success criteria.</p><p>Setup, usage allowance and support agreed before launch.</p><a class="button" href="#pilot-contact">Plan a retail pilot ${mark("arrow")}</a><small>Proposed pilot · terms to be agreed</small></aside></section>

    <section class="landing-retail-recommendation landing-section"><div><h2>A recommendation the shopper can understand.</h2><p>Their choices drive recommendations they can understand and act on.</p><div class="landing-inline-benefits">${benefit("list", "Give reasons<br>to choose")}${benefit("image", "Keep preferences<br>in control")}${benefit("hanger", "Build confidence<br>before checkout")}</div></div><div class="landing-decision-summary"><span>Illustrative decision summary</span><div>${pairPreview()}<div><h3>Why this coat?</h3><ul><li>${mark("check")}Pairings you rated “would wear”</li><li>${mark("check")}Covers your declared needs</li><li>${mark("check")}Checked against cheaper baskets</li></ul></div></div><small>Illustrative previews · synthetic model</small></div></section>

    <section class="landing-metrics landing-section"><div><h2>Know whether it earns its place in your store.</h2><p>Agree the baseline before the pilot. Decide on evidence before expanding.</p><ul class="landing-metric-list"><li>${mark("bag")}Purchase conversion</li><li>${mark("chart")}Returns after<br>the return window</li><li>${mark("database")}Contribution margin<br>after service costs</li></ul><p class="landing-muted">Success criteria to agree before launch. These are proposed measurements, not reported results.</p></div><div>${photograph(retailersArt, 608, 1339, 184, 162, "Illustration of a neutral coat collection")}</div></section>

    <section class="landing-retail-faq landing-section"><h2>Frequently asked questions.</h2><div><article><h3>Will you send shoppers to other stores?</h3><p>No. The proposed pilot uses your selected catalogue and your checkout.</p></article><article><h3>Can it recommend buying nothing?</h3><p>Yes. Recommendations should earn trust rather than force a purchase.</p></article><article><h3>Is this a fit guarantee?</h3><p>No. Previews help shoppers judge pairings; they do not certify physical fit.</p></article><article><h3>What does integration involve?</h3><p>We agree the catalogue, store entry point, basket handoff and usage budget during pilot scoping.</p></article></div></section>

    <section class="landing-retail-close landing-section"><div><h2>Make your catalogue<br>part of their wardrobe.</h2><p>Start with one category. Find out what a more considered shopping journey is worth to your store.</p><a class="button" href="#pilot-contact">Plan a retail pilot ${mark("arrow")}</a></div><div>${photograph(retailersArt, 373, 1661, 417, 252, "Illustration of coats, folded knits and a plant in a warm retail setting")}</div></section>

    <section class="landing-contact landing-section" id="pilot-contact" tabindex="-1"><div><p class="landing-overline">Retail pilot concept</p><h2>Let's scope a useful pilot.</h2><p>Your category, your catalogue, your success criteria. Contact the team to agree the scope.</p></div><div class="landing-contact-address"><span class="landing-muted">Pilot contact email</span><p class="landing-contact-email" data-contact-email>${validEmail ? escape(validEmail) : "UNKNOWN"}</p><button class="button button-secondary" type="button" data-copy-contact ${validEmail ? `data-email="${escape(validEmail)}"` : "disabled"}>Copy email address</button><p class="landing-copy-status" role="status" aria-live="polite">${validEmail ? "Copy the address to contact the team in your email app." : "The team has not published a pilot contact address yet."}</p></div></section>
    <p class="landing-privacy-line">Garment photos only, no face photos. Separate try-on previews use a synthetic model. YouCam retains uploads and results for 24 hours.</p>
  </main>${footer("retailers")}`;
}

export function renderLanding(kind: LandingKind, contactEmail?: string): string {
  return kind === "retailers" ? retailers(contactEmail) : shoppers();
}

export function wireLanding(container: HTMLElement, options: { onTour: () => void }): () => void {
  const controller = new AbortController();
  // These are two reused reference files. Decode them eagerly so clipped photo
  // regions do not remain blank while a browser postpones a large PNG's decode.
  container.querySelectorAll<HTMLImageElement>(".landing-photo img").forEach((image) => {
    void image.decode().catch(() => { /* A network failure still exposes the image's descriptive alt text. */ });
  });
  container.querySelectorAll<HTMLButtonElement>("[data-start-tour]").forEach((button) => {
    button.addEventListener("click", options.onTour, { signal: controller.signal });
  });
  const copy = container.querySelector<HTMLButtonElement>("[data-copy-contact]");
  copy?.addEventListener("click", async () => {
    const email = copy.dataset.email;
    const status = container.querySelector<HTMLElement>(".landing-copy-status");
    if (!email || !status) return;
    try {
      await navigator.clipboard.writeText(email);
      status.textContent = "Email address copied.";
    } catch {
      status.textContent = "Copy is unavailable in this browser. Select the email address above and copy it manually.";
      const address = container.querySelector<HTMLElement>("[data-contact-email]");
      if (address) {
        const range = document.createRange();
        range.selectNodeContents(address);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }, { signal: controller.signal });
  return () => controller.abort();
}
