interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface MobileNavigator extends Navigator {
  readonly standalone?: boolean;
  readonly userAgentData?: { readonly mobile?: boolean };
}

/** Installation is optional. Only the explicit demo route registers the static-cache worker. */
export function setupPwa({ demo }: { demo: boolean }): () => void {
  if (!demo) return () => {};
  const controller = new AbortController();
  const mobileNavigator = navigator as MobileNavigator;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const mobile = mobileNavigator.userAgentData?.mobile === true
    || /Android|iPad|iPhone|iPod/.test(navigator.userAgent) || ios;
  const standalone = matchMedia("(display-mode: standalone)").matches || mobileNavigator.standalone === true;
  let dismissed = false;
  let hint: HTMLElement | null = null;
  let pendingPrompt: InstallPrompt | null = null;

  function closeHint(): void {
    hint?.remove();
    hint = null;
  }

  function showHint(): void {
    if (!mobile || standalone || dismissed || controller.signal.aborted || (!pendingPrompt && !ios)) return;
    closeHint();
    hint = document.createElement("aside");
    hint.className = "pwa-install";
    hint.setAttribute("aria-label", "Install the WearAgain demo");
    // Inline styles keep this optional, self-contained prompt independent of screen layout.
    Object.assign(hint.style, {
      position: "fixed", zIndex: "45", bottom: "max(1rem, env(safe-area-inset-bottom))",
      left: "1rem", right: "1rem", margin: "0 auto", maxWidth: "27rem",
      padding: "1rem 2.5rem 1rem 1rem", border: "1px solid #c8cfbd", borderRadius: "12px",
      background: "#fffdf8", color: "#263e29", boxShadow: "0 8px 30px #1b2e2426",
      font: "14px/1.5 Arial, sans-serif",
    });
    const title = document.createElement("strong");
    title.textContent = "Keep the demo on your phone";
    hint.append(title);
    const explanation = document.createElement("p");
    explanation.style.margin = "0.35rem 0 0.6rem";
    explanation.textContent = ios
      ? "On iOS, open this page in Safari, tap Share, then Add to Home Screen. This installs the web demo. Native apps are planned."
      : "Install the web demo for quick access. Live rendering still needs an internet connection. Native apps are planned.";
    hint.append(explanation);
    if (pendingPrompt) {
      const install = document.createElement("button");
      install.type = "button";
      install.className = "button";
      install.textContent = "Install on your phone";
      Object.assign(install.style, { minHeight: "44px", border: "1px solid #304d33", borderRadius: "6px", background: "#304d33", color: "white", padding: "0.6rem 0.9rem", font: "600 13px Arial, sans-serif" });
      install.addEventListener("click", async () => {
        const prompt = pendingPrompt;
        if (!prompt) return;
        pendingPrompt = null;
        install.disabled = true;
        try {
          await prompt.prompt();
          await prompt.userChoice;
          closeHint();
        } catch {
          explanation.textContent = "The install prompt is unavailable. You can still use the demo in your browser.";
          install.remove();
        }
      }, { signal: controller.signal });
      hint.append(install);
    }
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "×";
    dismiss.setAttribute("aria-label", "Dismiss install hint");
    Object.assign(dismiss.style, { position: "absolute", right: "0.25rem", top: "0.25rem", width: "40px", height: "40px", border: "0", background: "transparent", color: "#304d33", fontSize: "24px", cursor: "pointer" });
    dismiss.addEventListener("click", () => { dismissed = true; closeHint(); }, { signal: controller.signal });
    hint.append(dismiss);
    document.body.append(hint);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    if (!mobile || standalone || dismissed) return;
    event.preventDefault();
    pendingPrompt = event as InstallPrompt;
    showHint();
  }, { signal: controller.signal });
  window.addEventListener("appinstalled", () => {
    pendingPrompt = null;
    dismissed = true;
    closeHint();
  }, { signal: controller.signal });
  showHint();

  function offlineStatus(status: "preparing" | "ready" | "unavailable"): void {
    if (controller.signal.aborted) return;
    document.body.dataset.offlineDemo = status;
    window.dispatchEvent(new CustomEvent("wearagain:offline-status", { detail: { status } }));
  }
  if ("serviceWorker" in navigator && isSecureContext) {
    offlineStatus("preparing");
    void Promise.resolve().then(() => navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }))
      .then(async (registration) => {
        const watchInstallation = (): void => {
          const installing = registration.installing;
          if (!installing) return;
          const checkState = (): void => {
            // register() can resolve before a failed precache makes the new worker redundant.
            if (installing.state === "redundant" && !registration.active) offlineStatus("unavailable");
          };
          installing.addEventListener("statechange", checkState, { signal: controller.signal });
          checkState();
        };
        registration.addEventListener("updatefound", watchInstallation, { signal: controller.signal });
        watchInstallation();
        await navigator.serviceWorker.ready;
        offlineStatus("ready");
      })
      .catch(() => offlineStatus("unavailable"));
  } else {
    offlineStatus("unavailable");
  }

  return () => {
    controller.abort();
    pendingPrompt = null;
    closeHint();
    delete document.body.dataset.offlineDemo;
  };
}
