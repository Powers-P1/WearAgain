import type { WardrobeItem, WardrobeState } from './state.js';
import { recordedPreviewForItem } from './stylist.js';
import { readPhoto } from './photo-store.js';
import { t } from './i18n.js';

export const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export function icon(name: 'arrow' | 'left' | 'check' | 'camera' | 'bookmark' | 'plus' | 'close' | 'hanger'): string {
  const paths = {
    arrow: '<path d="M4 12h16m-7-7 7 7-7 7"/>', left: '<path d="M20 12H4m7-7-7 7 7 7"/>',
    check: '<path d="m4 12 5 5L20 6"/>', camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>', plus: '<path d="M12 4v16M4 12h16"/>',
    close: '<path d="m5 5 14 14M19 5 5 19"/>',
    hanger: '<path d="M9 5a3 3 0 0 1 6 0c0 2-3 2-3 4l9 7a2 2 0 0 1-1 3H4a2 2 0 0 1-1-3l9-7"/>',
  };
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
}

const photoUrls = new Map<string, string>();
let refresh: (() => void) | undefined;
let scheduled = false;
export function configurePhotoMedia(): void {
  // Hydration must not rerender unrelated forms or interrupt camera typing.
  refresh=()=>document.querySelectorAll<HTMLElement>('[data-device-photo]').forEach(element=>{
    const url=photoUrls.get(element.dataset.devicePhoto??'');if(!url)return;
    const img=document.createElement('img');img.src=url;img.alt=element.dataset.photoAlt??'';
    img.className=element.dataset.photoClass??'';element.replaceWith(img);
  });
}
/** Device images are never copied to the service-worker cache or remote HTML. */
export function devicePhotoUrl(id: string): string | null {
  if (!photoUrls.has(id)) {
    photoUrls.set(id, '');
    void readPhoto(id).then(blob => {
      if (blob) photoUrls.set(id, URL.createObjectURL(blob));
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(() => { scheduled = false; refresh?.(); });
      }
    }).catch(() => {});
  }
  return photoUrls.get(id) || null;
}
export function releaseDevicePhoto(id: string): void {
  const url = photoUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  photoUrls.delete(id);
}
export function itemPicture(item: WardrobeItem): string {
  const source = item.photoId ? devicePhotoUrl(item.photoId) :
    item.photo ? '/assets/items/' + item.photo + '.webp' : recordedPreviewForItem(item.id);
  return source ? '<img src="' + esc(source) + '" alt="' + esc(item.name) + '" loading="lazy" />' :
    '<span class="no-photo" '+(item.photoId?'data-device-photo="'+esc(item.photoId)+'" data-photo-alt="'+esc(item.name)+'"':'')+'>' + icon('hanger') + '<span>' + esc(t('noPhoto')) + '</span></span>';
}
/** A composition of the actual pieces, never a fabricated full-outfit try-on. */
export function outfitBoard(ids: readonly string[], wardrobe: WardrobeState, compact = false): string {
  const pieces = ids.flatMap(id => wardrobe.items.filter(item => item.id === id));
  return '<div class="outfit-board' + (compact ? ' outfit-board-compact' : '') + '" aria-label="' + esc(t('outfitBoardLabel')) + '">' +
    pieces.map(item => '<figure class="outfit-board-piece outfit-piece-' + esc(item.category) + '">' + itemPicture(item) +
      '<figcaption>' + esc(item.name) + '</figcaption></figure>').join('') + '</div>';
}
