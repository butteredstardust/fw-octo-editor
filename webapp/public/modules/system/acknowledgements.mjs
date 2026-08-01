import { createDialogController } from '../dialog-ui.mjs';

// ---- Acknowledgements modal ----------------------------------------------
const acknowledgementsDialog = document.getElementById('acknowledgementsDialog');
const acknowledgementsController = createDialogController(acknowledgementsDialog, {
  initialFocus: () => document.getElementById('ackCloseButton'),
  closeOnBackdrop: true,
  fallbackFocus: () => document.getElementById('infoButton')
});

export function openAcknowledgements() {
  acknowledgementsController.open({ trigger: document.activeElement });
}

document.getElementById('infoButton').addEventListener('click', openAcknowledgements);
document.getElementById('ackCloseButton').addEventListener('click', () => acknowledgementsController.close());
document.getElementById('ackAcceptButton').addEventListener('click', () => acknowledgementsController.close());
