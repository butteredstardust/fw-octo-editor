function resolveTarget(target) {
  const resolved = typeof target === 'function' ? target() : target;
  return typeof resolved === 'string' ? document.getElementById(resolved) : resolved;
}

export function createDialogController(dialog, { initialFocus, closeOnBackdrop = false, fallbackFocus } = {}) {
  let trigger = null;
  let busy = false;
  let destroyed = false;
  let openCycle = 0;

  const restoreFocus = () => {
    const closingTrigger = trigger;
    const closingCycle = openCycle;
    trigger = null;
    setTimeout(() => {
      if (destroyed || dialog.open || closingCycle !== openCycle) return;
      const target = closingTrigger?.isConnected ? closingTrigger : resolveTarget(fallbackFocus);
      target?.isConnected && target.focus({ preventScroll: true });
    }, 0);
  };
  const onClose = () => { busy = false; dialog.removeAttribute('aria-busy'); restoreFocus(); };
  const onCancel = event => { if (busy) event.preventDefault(); };
  const handleClick = event => {
    if (closeOnBackdrop && !busy && event.target === dialog) dialog.close('cancel');
  };
  dialog.addEventListener('close', onClose);
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('click', handleClick);

  return {
    open({ trigger: nextTrigger } = {}) {
      if (destroyed || dialog.open) return false;
      openCycle += 1;
      trigger = nextTrigger || document.activeElement;
      dialog.returnValue = '';
      dialog.showModal();
      resolveTarget(initialFocus)?.focus({ preventScroll: true });
      return true;
    },
    close(value = '') {
      if (!dialog.open) return false;
      dialog.close(value);
      return true;
    },
    setBusy(nextBusy) {
      busy = !!nextBusy;
      if (busy) dialog.setAttribute('aria-busy', 'true');
      else dialog.removeAttribute('aria-busy');
      return busy;
    },
    isBusy: () => busy,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      dialog.removeEventListener('close', onClose);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('click', handleClick);
    }
  };
}
