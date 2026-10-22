import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Regression guard: delegated clicks in the v2 root must cover all hooks read
 * by the five feature-specific click handlers. This caught the PR-D
 * `data-mall-context-toggle` regression that made Change inert at every width.
 */
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const main = source('web2/src/main.ts');
const handlers = [
  ['web2/src/gallery-ui.ts', 'handleGalleryClick'],
  ['web2/src/morning-ui.ts', 'handleMorningClick'],
  ['web2/src/overview-ui.ts', 'handleOverviewClick'],
  ['web2/src/stylist-ui.ts', 'handleStylistClick'],
  ['web2/src/purchase-ui.ts', 'handlePurchaseClick'],
];
const kebab = name => name.replace(/[A-Z]/g, char => '-' + char.toLowerCase());
function hooksInHandler(text, name) {
  const start = text.indexOf('export function ' + name + '(');
  assert.ok(start >= 0, 'Missing click handler ' + name);
  const end = text.indexOf('\nexport function', start + 1);
  const body = text.slice(start, end < 0 ? undefined : end);
  return [...new Set([
    ...[...body.matchAll(/\b(?:target|button|control)\.dataset\.([A-Za-z]\w*)/g)].map(m => kebab(m[1])),
    ...[...body.matchAll(/\bd\.(mall[A-Z]\w*|overview[A-Z]\w*)\b/g)].map(m => kebab(m[1])),
    ...[...body.matchAll(/\.hasAttribute\(['"]data-([\w-]+)['"]\)/g)].map(m => m[1]),
  ])];
}
test('every click hook read by gallery/morning/overview/stylist/purchase is delegated in main', () => {
  const match = main.match(/const control = target\.closest<HTMLElement>\('([^']+)'\);/);
  assert.ok(match, 'The root must use a delegated click selector.');
  const registered = new Set([...match[1].matchAll(/\[data-([\w-]+)\]/g)].map(m => m[1]));
  assert.ok(registered.has('mall-context-toggle'), 'The Change context action must not be dead.');
  for (const [path, handler] of handlers) {
    const actual = hooksInHandler(source(path), handler);
    assert.ok(actual.length > 0, 'The test must discover live hooks for ' + handler);
    for (const hook of actual) {
      assert.ok(registered.has(hook), handler + ' uses [data-' + hook + '] but main does not delegate it.');
    }
  }
});
test('focus restoration filters hidden mobile headings and keeps a focusable main fallback', () => {
  assert.match(main, /focusCandidates\.find\(el=>el\.getClientRects\(\)\.length>0/);
  assert.match(main, /window\.getComputedStyle\(el\)\.visibility!==['"]hidden['"]/);
  assert.match(main, /\.\.\.\(mainElement\?\[mainElement\]:\[\]\)/);
  assert.match(main, /mainElement\.setAttribute\(['"]tabindex['"],['"]-1['"]\)/);
  assert.match(main, /mainElement\.focus\(\{preventScroll:true\}\)/);
});
test('capture clears only the item-name draft and recognizer error is not hidden by onend', () => {
  const gallery = source('web2/src/gallery-ui.ts');
  const morning = source('web2/src/morning-ui.ts');
  assert.match(gallery, /draft=\{\.\.\.\(draft\?\?initialCaptureDraft\(model\(\)\)\),itemName:''\}/);
  assert.match(morning, /speech\.onerror=\(\)=>\{/);
  assert.match(morning, /speech\.onend=\(\)=>\{/);
  assert.match(morning, /if\(!failed\)actions\.rerender\(\)/);
});
