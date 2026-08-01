// Opt-in number-editor behavior for value fields paired with exactly one
// explicitly marked primary submit button. Delegation keeps dynamic rerenders
// listener-free while the WeakMap prevents duplicate bootstrap bindings.
const bindings = new WeakMap();

export function bindValueEditors(root = document) {
  if (!root || typeof root.addEventListener !== 'function') return () => {};
  const existing = bindings.get(root);
  if (existing) return existing;

  const isEditor = target => target?.tagName === 'INPUT' && target.type === 'number' && target.classList.contains('value-editor');
  const onFocus = event => { if (isEditor(event.target)) event.target.select(); };
  const onKeydown = event => {
    if (event.key !== 'Enter' || !isEditor(event.target)) return;
    const submit = event.target.closest('.value-editor-pair')?.querySelector('[data-value-submit]:not(:disabled)');
    if (!submit) return;
    event.preventDefault();
    submit.click();
  };

  root.addEventListener('focus', onFocus, true);
  root.addEventListener('keydown', onKeydown);
  const unbind = () => {
    if (bindings.get(root) !== unbind) return;
    root.removeEventListener('focus', onFocus, true);
    root.removeEventListener('keydown', onKeydown);
    bindings.delete(root);
  };
  bindings.set(root, unbind);
  return unbind;
}
