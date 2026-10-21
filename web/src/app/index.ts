import {
  elementKey, evaluateBaskets, parseScenario, planPairRender, solveBasket,
  type ElementRef, type ItemRender, type OutfitRating, type RenderIdentity, type RenderState, type Scenario,
} from '../../../src/core/index.js';
import { mountAvatarPicker, type AvatarPickerState } from '../avatar-picker.js';
import { createLiveClient, type LedgerSummary, type LiveRenderResponse } from '../live.js';
import { escapeHtml as h, icon, money } from '../shared.js';
import {
  activeScenario, basketLabel, demoScenario, elementsForOutfit, elementsForScenario,
  parseRecordings, projectedForSelection, rateCurrentImages, simulationSelection,
  withRating, type DemoScenarioId, type Recording,
} from './data.js';
import { candidatesView, matrixView, resultView, shell, startView, summaryView, type ViewModel } from './views.js';
import { createUploadCoordinator, loadCurrentPreview } from './async-state.js';
import './style.css';

export interface AppOptions { mode: 'demo' | 'live'; onTour: () => void }
export interface AppHandle { dispose: () => void; showTourTarget: (step: number) => void }
interface Upload { file: File; name: string; url: string; revision: string }

export function mountApp(container: HTMLElement, options: AppOptions): AppHandle {
  const mode = options.mode;
  const requestedScenario = new URLSearchParams(location.search).get('scenario');
  let scenarioId: DemoScenarioId = mode === 'demo' && (requestedScenario === 'zero' || requestedScenario === 'error') ? requestedScenario : 'minimum';
  let full = demoScenario(scenarioId);
  let selectedNeeds = new Set(full.requirements.map(need => need.id));
  let selectedCandidates = new Set(full.outerwear.filter(item => item.kind === 'candidate').map(item => item.id));
  let stage = 0;
  let budgetMinor = 12000;
  let notice = '';
  let busy = false;
  let disposed = false;
  let revision = 0;
  let consent = false;
  let liveEnabled = false;
  let ledger: LedgerSummary | null = null;
  let avatarId: string | null = mode === 'demo' ? 'woman_neutral_01' : null;
  let avatarState: AvatarPickerState | undefined;
  let picker: ReturnType<typeof mountAvatarPicker> | null = null;
  let simulated = mode === 'demo';
  let recordings: Recording[] = [];
  let recordingProblem: string | null = null;
  let renders: ItemRender[] = [];
  let pairRatings: RenderState['pairRatings'] = [];
  const urls = new Map<string, string>();
  const uploads = new Map<string, Upload>();
  const uploadCoordinator = createUploadCoordinator(() => revision);
  const records = new Map<string, { response: LiveRenderResponse; identity: RenderIdentity }>();
  const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const challengeIds = new Set<string>();
  let challengeResult = '';
  let decisiveOnly = true;
  const live = mode === 'live' ? createLiveClient() : null;
  const localAbort = new AbortController();

  function selected(): Scenario { return activeScenario(full, selectedNeeds, selectedCandidates); }
  function renderState(): RenderState { return { schemaVersion: 1, renders, pairRatings }; }
  function snapshot(): ViewModel {
    const scenario = selected();
    const current = simulated ? { scenario, selection: simulationSelection(scenario) } : projectedForSelection(scenario, renderState());
    return {
      mode, stage, scenarioId, scenario: current.scenario, fullScenario: full, selectedNeeds, selectedCandidates,
      budgetMinor, simulated, hasRecordings: recordings.some(entry => entry.avatarId === avatarId && full.tops.some(top => entry.element.kind === 'top' && top.id === entry.element.id)),
      loadedRecordings: urls.size, recordingProblem, renders, urls, uploads, selection: current.selection,
      result: solveBasket(current.scenario), notice, busy, liveEnabled, consent, ledger, challengeIds, challengeResult, decisiveOnly,
      unknownSubmissionCount: mode === 'live' ? renders.filter(render => render.status === 'pending' && !records.has(elementKey(render.element))).length : 0,
    };
  }

  function clearTimers(): void {
    for (const timer of pollTimers.values()) clearTimeout(timer);
    pollTimers.clear();
  }
  function clearRenderedImages(): void {
    clearTimers();
    for (const url of urls.values()) if (url.startsWith('blob:')) live?.releaseImage(url);
    urls.clear(); records.clear(); pairRatings = [];
    renders = elementsForScenario(full).map(element => ({
      element, garmentRevision: uploads.get(elementKey(element))?.revision ?? `unprovided:${elementKey(element)}`,
      baseRevision: `avatar:${avatarId ?? 'unselected'}`, pipelineRevision: 'youcam-cloth-v4-upper-body-v1', attempt: 0, status: 'missing',
    }));
  }
  function clearUploads(): void {
    for (const upload of uploads.values()) URL.revokeObjectURL(upload.url);
    uploads.clear();
  }

  function render(focusHeading = false): void {
    if (disposed) return;
    if (picker) { avatarState = picker.getState(); picker.dispose(); picker = null; }
    const active = document.activeElement as HTMLElement | null;
    const activeId = active?.id;
    const focusSelector = ['data-action', 'data-outfit', 'data-rating', 'data-need', 'data-candidate', 'data-challenge-id', 'data-upload-kind', 'data-upload-id']
      .filter(attribute => active?.hasAttribute(attribute))
      .map(attribute => `[${attribute}="${CSS.escape(active!.getAttribute(attribute)!)}"]`).join('');
    const vm = snapshot();
    const views = [startView, candidatesView, matrixView, resultView, summaryView];
    container.innerHTML = shell(vm, views[stage]!(vm));
    const target = container.querySelector<HTMLElement>('#avatar-picker');
    if (target) {
      picker = mountAvatarPicker(target, {
        mode, initialAvatarId: avatarId ?? 'woman_neutral_01', ...(avatarState ? { initialState: avatarState } : {}),
        onChange(id) {
          if (id === avatarId || disposed) return;
          avatarId = id; revision += 1; busy = false; clearRenderedImages();
          if (!simulated && mode === 'demo') void loadRecordedPreviews();
          // The picker owns its own controls; do not recursively remount it.
          if (stage !== 0) render();
        },
      });
    }
    if (focusHeading) {
      const heading = container.querySelector<HTMLElement>('h1');
      heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
      container.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    } else if (activeId) container.querySelector<HTMLElement>(`#${CSS.escape(activeId)}`)?.focus({ preventScroll: true });
    else if (focusSelector) container.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
  }

  async function loadManifest(): Promise<void> {
    if (mode !== 'demo') return;
    try {
      const response = await fetch('/demo/manifest.json', { signal: localAbort.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Demo manifest unavailable.');
      recordings = parseRecordings(await response.json());
      recordingProblem = recordings.length ? null : 'Saved YouCam previews have not been supplied. The solver walkthrough remains available with explicit synthetic decisions.';
    } catch (error) {
      if (disposed) return;
      recordingProblem = error instanceof Error ? error.message : 'Demo recordings are unavailable.';
    }
    if (!disposed) render();
  }

  async function loadRecordedPreviews(): Promise<void> {
    if (mode !== 'demo' || simulated || !avatarId || disposed) return;
    const currentRevision = revision;
    busy = true; notice = 'Loading the saved previews for this synthetic model.'; render();
    const elements = elementsForScenario(full);
    await Promise.all(elements.map(async element => {
      const entry = recordings.filter(recording => elementKey(recording.element) === elementKey(element) && recording.avatarId === avatarId)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || a.id.localeCompare(b.id))[0];
      if (!entry) return;
      const identity: RenderIdentity = { element, garmentRevision: `recorded:${entry.id}`, baseRevision: `recorded:${entry.avatarId}`, pipelineRevision: 'recorded-cloth-v4', attempt: 0 };
      try {
        const image = new Image(); image.src = entry.imagePath;
        await image.decode();
        if (disposed || revision !== currentRevision) return;
        setRender({ ...identity, status: 'ready', assetId: `demo:${entry.id}` }); urls.set(elementKey(element), entry.imagePath);
      } catch {
        if (disposed || revision !== currentRevision) return;
        setRender({ ...identity, status: 'error', reason: 'The recorded preview could not be displayed.' });
      }
    }));
    if (disposed || revision !== currentRevision) return;
    busy = false; notice = `${urls.size} saved previews loaded. Rate only the exact images you can see.`; render();
  }

  function setRender(value: ItemRender): void {
    renders = [...renders.filter(item => elementKey(item.element) !== elementKey(value.element)), value];
  }
  function setNotice(text: string): void { notice = text; render(); }

  async function upload(file: File, element: ElementRef): Promise<void> {
    if (mode !== 'live') return;
    const itemKey = elementKey(element);
    // Claim before validation: even an invalid new selection supersedes an
    // older in-flight decode, while preserving the previously accepted file.
    const ownsSelection = uploadCoordinator.begin(itemKey);
    const isCurrent = () => !disposed && ownsSelection();
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size === 0 || file.size >= 10_000_000) { setNotice('Choose a JPEG or PNG smaller than 10 MB.'); return; }
    const temporary = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = temporary; await image.decode();
      if (!isCurrent()) { URL.revokeObjectURL(temporary); return; }
      const sides = [image.naturalWidth, image.naturalHeight].sort((a, b) => a - b);
      if (sides[0]! < 384 || sides[1]! < 512 || sides[1]! > 4096) throw new Error('Use an image at least 384 × 512 px, with no side larger than 4096 px.');
      const bytes = await file.arrayBuffer();
      if (!isCurrent()) { URL.revokeObjectURL(temporary); return; }
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      if (!isCurrent()) { URL.revokeObjectURL(temporary); return; }
      const inputRevision = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
      const previous = uploads.get(itemKey); if (previous) URL.revokeObjectURL(previous.url);
      uploads.set(itemKey, { file, name: file.name, url: temporary, revision: inputRevision });
      const oldUrl = urls.get(itemKey); if (oldUrl?.startsWith('blob:')) live?.releaseImage(oldUrl); urls.delete(itemKey);
      const old = renders.find(render => elementKey(render.element) === itemKey);
      setRender({ element, garmentRevision: inputRevision, baseRevision: old?.baseRevision ?? `avatar:${avatarId}`, pipelineRevision: 'youcam-cloth-v4-upper-body-v1', attempt: 0, status: 'missing' });
      const entry = records.get(itemKey); if (entry) { const timer = pollTimers.get(entry.response.renderKey); if (timer) clearTimeout(timer); pollTimers.delete(entry.response.renderKey); records.delete(itemKey); }
      notice = 'Photo added to this browser session. It has not been uploaded.'; render();
    } catch (error) { URL.revokeObjectURL(temporary); if (isCurrent()) setNotice(error instanceof Error ? error.message : 'The photo could not be read.'); }
  }

  async function enableLive(): Promise<void> {
    if (!live || busy) return;
    if (!consent || !avatarId) { setNotice('First confirm the garment-only upload consent and choose an adult synthetic model on the Wardrobe screen.'); return; }
    const currentRevision = revision; busy = true; notice = 'Checking the live allowance. No render is being requested.'; render();
    try {
      const balance = await live.startSession();
      if (disposed || currentRevision !== revision) return;
      ledger = balance; liveEnabled = true; notice = 'Live is enabled. A new render will reserve 2 units only when you request it.';
    } catch (error) { if (!disposed && currentRevision === revision) notice = error instanceof Error ? error.message : 'Live rendering is unavailable.'; }
    finally { if (!disposed && currentRevision === revision) { busy = false; render(); } }
  }

  async function updateResponse(response: LiveRenderResponse, identity: RenderIdentity, currentRevision: number): Promise<void> {
    if (!live || disposed || revision !== currentRevision) return;
    const itemKey = elementKey(identity.element);
    if (uploads.get(itemKey)?.revision !== identity.garmentRevision) return;
    records.set(itemKey, { response, identity }); ledger = response.budget;
    // Once the Worker supplies the pinned base revision, align unsubmitted plans.
    renders = renders.map(render => render.status === 'missing' && render.baseRevision.startsWith('avatar:') ? { ...render, baseRevision: identity.baseRevision, pipelineRevision: identity.pipelineRevision } : render);
    if (response.status === 'error') setRender({ ...identity, status: 'error', reason: 'The provider confirmed a free render error. Retry explicitly to request a new image.' });
    else if (response.status === 'pending') {
      setRender({ ...identity, status: 'pending' });
      if (!response.requiresReconciliation) schedulePoll(itemKey, currentRevision);
      else notice = 'This render remains pending for reconciliation. Its 2 units stay held; no replacement task was submitted.';
    } else {
      // Provider success is billed before image delivery. Download/decode is mandatory.
      setRender({ ...identity, status: 'pending' });
      const ownsResult = () => !disposed && revision === currentRevision
        && uploads.get(itemKey)?.revision === identity.garmentRevision
        && records.get(itemKey)?.response.renderKey === response.renderKey;
      try {
        await loadCurrentPreview(
          () => live.loadImage(response), ownsResult,
          image => {
            const previous = urls.get(itemKey); if (previous?.startsWith('blob:')) live.releaseImage(previous);
            urls.set(itemKey, image.url); setRender({ ...identity, status: 'ready', assetId: image.assetId });
          },
          url => live.releaseImage(url),
        );
      } catch (error) {
        if (!ownsResult()) return;
        setRender({ ...identity, status: 'error', reason: error instanceof Error ? error.message : 'Image download failed; its charge is unchanged.' });
      }
    }
  }

  function schedulePoll(itemKey: string, currentRevision: number): void {
    const entry = records.get(itemKey);
    if (!entry || !live || disposed || revision !== currentRevision || pollTimers.has(entry.response.renderKey)) return;
    const renderKey = entry.response.renderKey;
    const timer = setTimeout(() => {
      pollTimers.delete(renderKey);
      void (async () => {
        if (!live || disposed || revision !== currentRevision || records.get(itemKey)?.response.renderKey !== renderKey) return;
        try {
          const response = await live.poll(renderKey);
          if (records.get(itemKey)?.response.renderKey !== renderKey) return;
          await updateResponse(response, entry.identity, currentRevision);
        } catch (error) {
          if (disposed || revision !== currentRevision) return;
          notice = error instanceof Error ? error.message : 'The render is still pending. Its units remain held.';
          // A failed poll is not a signal to submit a replacement. Manual refresh remains available.
        }
        if (!disposed) render();
      })();
    }, 3000);
    pollTimers.set(renderKey, timer);
  }

  async function renderElements(elements: readonly ElementRef[], retry = false): Promise<void> {
    if (!live || !liveEnabled || busy || disposed) return;
    if (!consent || !avatarId) { setNotice('Confirm the garment-only consent and choose an adult synthetic model before rendering.'); return; }
    const missing = elements.filter(element => !uploads.has(elementKey(element)));
    if (missing.length) { setNotice('Add the actual garment photos for both elements first. The illustrative catalogue images are not live inputs.'); return; }
    const currentRevision = revision;
    const selectedAvatar = avatarId;
    busy = true; notice = 'Sending only the requested garment items. Each new image reserves 2 units.'; render();
    try {
      for (const element of elements) {
        if (disposed || revision !== currentRevision) break;
        const itemKey = elementKey(element);
        const current = renders.find(render => elementKey(render.element) === itemKey)!;
        const existing = records.get(itemKey);
        if (current.status === 'ready' && !retry) continue;
        if (existing?.response.status === 'pending') { await updateResponse(await live.poll(existing.response.renderKey), existing.identity, currentRevision); continue; }
        if (existing?.response.status === 'succeeded' && current.status === 'error') { await updateResponse(existing.response, existing.identity, currentRevision); continue; }
        const attempt = retry ? current.attempt + 1 : current.attempt;
        if (retry && current.status === 'pending') { notice = 'A pending outcome must be reconciled before requesting a replacement.'; continue; }
        const input = uploads.get(itemKey)!;
        // Keep the attempted identity even if the POST response is lost. An
        // explicit recovery repeats this attempt, never increments it again.
        records.delete(itemKey);
        setRender({ ...current, attempt, status: 'pending' }); render();
        const response = await live.submit({ element, avatarId: selectedAvatar, attempt, garment: input.file, garmentContainsNoFace: true });
        if (!response.identity) throw new Error('The service did not return a canonical render identity; the outcome remains unresolved.');
        await updateResponse(response, response.identity, currentRevision);
      }
    } catch (error) {
      if (!disposed && currentRevision === revision) notice = error instanceof Error ? error.message : 'The submission outcome is UNKNOWN. No automatic replacement was requested.';
    } finally { if (!disposed && currentRevision === revision) { busy = false; render(); } }
  }

  async function refreshAllowance(): Promise<void> {
    if (!live || !liveEnabled || busy) return;
    busy = true; const currentRevision = revision; render();
    try {
      const balance = await live.getLedger();
      if (disposed || currentRevision !== revision) return;
      ledger = balance;
      notice = 'Allowance refreshed from the ledger only. No render or provider poll was requested; an UNKNOWN render outcome still needs reconciliation.';
    } catch (error) { if (!disposed && currentRevision === revision) notice = error instanceof Error ? error.message : 'The ledger could not be refreshed.'; }
    finally { if (!disposed && currentRevision === revision) { busy = false; render(); } }
  }

  function rate(outfitId: string, status: OutfitRating['status']): void {
    if (busy || status === 'unrated') return;
    const reason = 'The shopper reported a distorted or misleading preview.';
    try {
      if (simulated) full = withRating(full, outfitId, status, 'Synthetic example: this preview needs another look.');
      else pairRatings = rateCurrentImages(full, renderState(), outfitId, status, reason).pairRatings;
      notice = simulated ? 'Example decision updated. The basket and certificate have been recalculated.' : 'Your decision is bound to these exact previews.';
      challengeResult = ''; render();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'This pair cannot be rated yet.'); }
  }

  function retryPair(outfitId: string): void {
    if (simulated) { full = withRating(full, outfitId, 'unrated'); setNotice('The example error is cleared. Choose a new simulated decision.'); return; }
    if (mode === 'demo') { pairRatings = pairRatings.filter(rating => rating.outfitId !== outfitId); revision += 1; void loadRecordedPreviews(); return; }
    const elements = elementsForOutfit(full, outfitId);
    const dialog = document.createElement('dialog'); dialog.className = 'wa-retry-dialog';
    dialog.innerHTML = `<form method="dialog"><button class="wa-dialog-close" aria-label="Close">${icon('close')}</button></form><h2>Review this pair</h2><p>Choose the affected item. A new generation needs a new 2-unit reservation; a failed download retries the same charged result.</p>${elements.map(element => {
      const record = records.get(elementKey(element));
      const item = (element.kind === 'top' ? full.tops : full.outerwear).find(value => value.id === element.id)!;
      const pending = record?.response.status === 'pending';
      const failedDownload = record?.response.status === 'succeeded' && renders.find(render => elementKey(render.element) === elementKey(element))?.status === 'error';
      return `<button class="button-secondary" data-retry-kind="${element.kind}" data-retry-id="${h(element.id)}" ${pending ? 'disabled' : ''}>${h(item.label)}: ${pending ? 'pending reconciliation' : failedDownload ? 'retry the download' : 'generate a new image (2 units)'}</button>`;
    }).join('')}<button class="button-ghost" data-review-clear>Keep the images and clear my error</button>`;
    const origin = document.activeElement as HTMLElement | null;
    dialog.addEventListener('close', () => { dialog.remove(); origin?.isConnected && origin.focus(); });
    dialog.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-retry-id], [data-review-clear]');
      if (!target) return;
      if (target.hasAttribute('data-review-clear')) { pairRatings = pairRatings.filter(rating => rating.outfitId !== outfitId); dialog.close(); render(); return; }
      const element: ElementRef = { kind: target.dataset.retryKind as ElementRef['kind'], id: target.dataset.retryId! };
      dialog.close(); void renderElements([element], true);
    });
    container.append(dialog); dialog.showModal();
  }

  function checkChallenge(): void {
    const vm = snapshot();
    const chosen = [...challengeIds].filter(id => selectedCandidates.has(id)).sort();
    const evaluation = evaluateBaskets(vm.scenario).find(entry => entry.basket.candidateIds.join('|') === chosen.join('|'));
    if (!evaluation) return;
    const label = basketLabel(vm.scenario, chosen);
    const failures = evaluation.requirements.filter(requirement => !requirement.satisfied).map(requirement => `${vm.scenario.requirements.find(need => need.id === requirement.requirementId)!.label}: ${requirement.acceptedOutfitIds.length}/${requirement.minCount} accepted`);
    challengeResult = `${label} · ${money(evaluation.basket.costMinor, vm.scenario.currency)} (synthetic example). ${evaluation.feasible ? vm.result.status === 'solved' && evaluation.basket.costMinor === vm.result.basket.costMinor ? 'This meets every need and matches the minimum price.' : 'This meets every need, but does not beat the current minimum.' : `Does not meet every need. ${failures.join('; ')}.${evaluation.possiblyFeasible ? ' Unresolved pairs could still change that.' : ''}`}`;
    render();
  }

  function exportSummary(): void {
    const vm = snapshot();
    const content = JSON.stringify({ schemaVersion: 1, mode, evidence: simulated ? 'synthetic_example_decisions' : mode === 'demo' ? 'recorded_image_decisions' : 'live_image_bound_decisions', scenario: vm.scenario, result: vm.result, scope: 'Chosen catalogue and item prices, declared needs, and current ratings; excludes shipping and physical fit.' }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'wearagain-decision.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Your photo-free decision summary is ready.');
  }

  function reset(id = scenarioId): void {
    revision += 1; scenarioId = id; full = demoScenario(id); selectedNeeds = new Set(full.requirements.map(need => need.id));
    selectedCandidates = new Set(full.outerwear.filter(item => item.kind === 'candidate').map(item => item.id));
    clearRenderedImages(); clearUploads(); challengeIds.clear(); challengeResult = ''; simulated = mode === 'demo';
    busy = false; stage = 0; notice = 'A fresh decision. Previous live reservations remain recorded in the server ledger.';
    if (mode === 'demo') notice = 'A fresh synthetic example. No API units used.';
    render(true);
  }

  function click(event: MouseEvent): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!button || !container.contains(button) || button instanceof HTMLButtonElement && button.disabled) return;
    switch (button.dataset.action) {
      case 'tour': options.onTour(); break;
      case 'stage': stage = Math.max(0, Math.min(4, Number(button.dataset.stage))); notice = ''; render(true); break;
      case 'need': { const id = button.dataset.need!; selectedNeeds.has(id) ? selectedNeeds.delete(id) : selectedNeeds.add(id); challengeResult = ''; render(); break; }
      case 'candidate': { const id = button.dataset.candidate!; selectedCandidates.has(id) ? selectedCandidates.delete(id) : selectedCandidates.add(id); challengeResult = ''; render(); break; }
      case 'restore-example': full = demoScenario(scenarioId); notice = 'Hand-authored example decisions restored.'; render(); break;
      case 'clear-ratings': full = parseScenario({ ...full, ratings: [] }); pairRatings = []; notice = 'All decisions are now unresolved.'; render(); break;
      case 'use-recordings': simulated = false; revision += 1; clearRenderedImages(); void loadRecordedPreviews(); break;
      case 'enable-live': void enableLive(); break;
      case 'refresh-allowance': void refreshAllowance(); break;
      case 'render-pair': {
        const vm = snapshot();
        if (decisiveOnly && !vm.selection.relevantOutfitIds.includes(button.dataset.outfit!)) { setNotice('This pair cannot change the current cheapest basket. Turn off the decision-relevant filter if you still want to render it.'); break; }
        const plan = planPairRender(vm.scenario, projectedForSelection(vm.scenario, renderState()).state, button.dataset.outfit!, 2);
        if (plan.status === 'blocked') { setNotice(`This pair needs review before rendering: ${plan.blockers.join(', ')}.`); break; }
        void renderElements(plan.requests.map(request => request.element)); break;
      }
      case 'render-next': {
        const plan = snapshot().selection.next;
        if (plan && plan.requests.length) void renderElements(plan.requests.map(request => request.element));
        else setNotice('No new image is needed for the next useful decision. Rate the available pair, or review an unresolved error.');
        break;
      }
      case 'resume-pair': void renderElements(elementsForOutfit(full, button.dataset.outfit!)); break;
      case 'rate': rate(button.dataset.outfit!, button.dataset.rating as OutfitRating['status']); break;
      case 'retry-pair': retryPair(button.dataset.outfit!); break;
      case 'challenge': checkChallenge(); break;
      case 'export': exportSummary(); break;
      case 'restart': reset(); break;
    }
  }

  function change(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.id === 'scenario-select') { reset(target.value as DemoScenarioId); return; }
    if (target.id === 'budget-input') {
      const parsed = Number(target.value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) { setNotice('Enter a nonnegative spending ceiling below 1,000,000.'); return; }
      budgetMinor = Math.round(parsed * 100); return;
    }
    if (target instanceof HTMLInputElement && target.dataset.uploadId && target.files?.[0]) { void upload(target.files[0], { kind: target.dataset.uploadKind as ElementRef['kind'], id: target.dataset.uploadId }); return; }
    if (target instanceof HTMLInputElement && target.id === 'garment-consent') { consent = target.checked; return; }
    if (target instanceof HTMLInputElement && target.id === 'decisive-only') { decisiveOnly = target.checked; render(); return; }
    if (target instanceof HTMLInputElement && target.dataset.challengeId) { const id = target.dataset.challengeId; target.checked ? challengeIds.add(id) : challengeIds.delete(id); }
  }

  if (mode === 'live') full = parseScenario({ ...full, ratings: [] });
  clearRenderedImages();
  container.addEventListener('click', click);
  container.addEventListener('change', change);
  render(); void loadManifest();
  return {
    showTourTarget(step) {
      stage = step <= 3 ? Math.max(0, step) : 4;
      notice = ''; render();
    },
    dispose() {
      disposed = true; revision += 1; localAbort.abort(); clearTimers(); picker?.dispose(); live?.dispose(); clearUploads(); urls.clear(); records.clear();
      container.removeEventListener('click', click); container.removeEventListener('change', change);
    },
  };
}
