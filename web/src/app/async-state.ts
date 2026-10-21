/** A slower previous file selection must never replace a newer one in the same slot. */
export function createUploadCoordinator(currentContext: () => number): {
  begin: (elementKey: string) => () => boolean;
} {
  const generations = new Map<string, number>();
  let sequence = 0;
  return {
    begin(elementKey) {
      const generation = ++sequence;
      const context = currentContext();
      generations.set(elementKey, generation);
      return () => currentContext() === context && generations.get(elementKey) === generation;
    },
  };
}

export interface DecodedPreview { readonly url: string; readonly assetId: string }

/** Check ownership after delivery and commit synchronously, without an intervening await. */
export async function loadCurrentPreview(
  load: () => Promise<DecodedPreview>,
  isCurrent: () => boolean,
  accept: (preview: DecodedPreview) => void,
  release: (url: string) => void,
): Promise<boolean> {
  const preview = await load();
  if (!isCurrent()) {
    release(preview.url);
    return false;
  }
  accept(preview);
  return true;
}
