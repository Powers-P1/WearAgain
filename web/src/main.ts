import { mountApp } from "./app/index.js";
import { renderLanding, wireLanding } from "./landings.js";
import { CONTACT_EMAIL } from "./config.js";
import { createTour } from "./tour.js";
import { setupPwa } from "./pwa.js";
import "./base.css";
import "./landings.css";
import "./app/style.css";
import "./avatar-picker.css";
import "./tour.css";

const root = document.querySelector<HTMLElement>("#app")!;
let disposeView = () => {};
let disposePwa = () => {};
let tour: ReturnType<typeof createTour> | null = null;

function startTour() {
  if (location.pathname.replace(/\/$/, "") !== "/app") {
    history.pushState(null, "", "/app");
    render();
  }
  tour?.start();
}

function render() {
  tour?.dispose(); tour = null; disposeView(); disposePwa();
  const path = location.pathname.replace(/\/$/, "") || "/";
  if (path === "/app") {
    const mode = new URLSearchParams(location.search).get("mode") === "live" ? "live" : "demo";
    document.title = `${mode === "demo" ? "Demo" : "Live"} - WearAgain`;
    const app = mountApp(root, { mode, onTour: startTour });
    disposeView = app.dispose;
    tour = createTour({ showTarget: app.showTourTarget, restoreFocus: () => root.querySelector<HTMLButtonElement>('[data-action="tour"]') ?? root.querySelector<HTMLElement>("h1") });
    disposePwa = setupPwa({ demo: mode === "demo" });
  } else if (path === "/" || path === "/retailers") {
    const kind = path === "/retailers" ? "retailers" : "shoppers";
    document.title = kind === "retailers" ? "Plan a retail pilot - WearAgain" : "Buy what earns a place in your wardrobe - WearAgain";
    root.innerHTML = renderLanding(kind, CONTACT_EMAIL);
    disposeView = wireLanding(root, { onTour: startTour });
    disposePwa = setupPwa({ demo: false });
  } else {
    document.title = "Page not found - WearAgain";
    root.innerHTML = '<main id="main-content" tabindex="-1" class="site-error"><h1>Let’s find your wardrobe.</h1><p>This page does not exist.</p><a class="button" href="/">For shoppers</a></main>';
  }
}
window.addEventListener("popstate", render);
render();
