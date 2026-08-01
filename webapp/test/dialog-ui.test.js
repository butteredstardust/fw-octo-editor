const test = require('node:test');
const assert = require('node:assert/strict');

let createDialogController;

class FakeDialog extends EventTarget {
  constructor() {
    super();
    this.open = false;
    this.returnValue = '';
    this.attrs = new Set();
  }
  showModal() { this.open = true; }
  close(value = '') {
    this.returnValue = value;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
  toggleAttribute(name, on) { if (on) this.attrs.add(name); else this.attrs.delete(name); }
  setAttribute(name, value) { this.attrs.add(name); this[name] = value; }
  removeAttribute(name) { this.attrs.delete(name); }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test.before(async () => {
  ({ createDialogController } = await import('../public/modules/dialog-ui.mjs'));
});

test('dialog controller guards open state, busy cancellation, backdrop close, and focus restoration', async () => {
  const original = global.document;
  const dialog = new FakeDialog();
  const initial = { isConnected: true, focusOptions: null, focus(options) { this.focusOptions = options; } };
  const fallback = { isConnected: true, focusOptions: null, focus(options) { this.focusOptions = options; } };
  const trigger = { isConnected: true, focusOptions: null, focus(options) { this.focusOptions = options; } };
  global.document = { activeElement: trigger, getElementById: id => ({ initial, fallback }[id] || null) };
  try {
    const controller = createDialogController(dialog, { initialFocus: 'initial', fallbackFocus: 'fallback', closeOnBackdrop: true });
    assert.equal(controller.open({ trigger }), true);
    assert.equal(controller.open({ trigger }), false);
    assert.deepEqual(initial.focusOptions, { preventScroll: true });

    controller.setBusy(true);
    assert.equal(dialog.attrs.has('aria-busy'), true);
    assert.equal(dialog['aria-busy'], 'true');
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    assert.equal(cancel.defaultPrevented, true);
    dialog.dispatchEvent(new Event('click'));
    assert.equal(dialog.open, true);

    controller.setBusy(false);
    dialog.dispatchEvent(new Event('click'));
    assert.equal(dialog.open, false);
    await tick();
    assert.deepEqual(trigger.focusOptions, { preventScroll: true });

    trigger.isConnected = false;
    assert.equal(controller.open({ trigger }), true);
    controller.close();
    await tick();
    assert.deepEqual(fallback.focusOptions, { preventScroll: true });
    controller.destroy();
    controller.destroy();
  } finally {
    global.document = original;
  }
});

test('stale asynchronous focus restoration cannot steal focus after a reopen', async () => {
  const original = global.document;
  const dialog = new FakeDialog();
  const first = { isConnected: true, focused: 0, focus() { this.focused += 1; } };
  const second = { isConnected: true, focused: 0, focus() { this.focused += 1; } };
  global.document = { activeElement: first, getElementById: () => null };
  try {
    const controller = createDialogController(dialog);
    controller.open({ trigger: first });
    controller.close();
    controller.open({ trigger: second });
    await tick();
    assert.equal(first.focused, 0);
    controller.close();
    await tick();
    assert.equal(second.focused, 1);
  } finally {
    global.document = original;
  }
});
