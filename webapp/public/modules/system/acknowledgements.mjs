// ---- Acknowledgements modal ----------------------------------------------
const acknowledgementsDialog = document.getElementById('acknowledgementsDialog');
let acknowledgementsReturnFocus = null;

export function openAcknowledgements() {
  acknowledgementsReturnFocus = document.activeElement;
  acknowledgementsDialog.showModal();
  document.getElementById('ackCloseButton').focus();
}

acknowledgementsDialog.addEventListener('close', () => {
  if (acknowledgementsReturnFocus && acknowledgementsReturnFocus.isConnected) acknowledgementsReturnFocus.focus();
});

document.getElementById('infoButton').addEventListener('click', openAcknowledgements);
document.getElementById('ackCloseButton').addEventListener('click', () => acknowledgementsDialog.close());
document.getElementById('ackAcceptButton').addEventListener('click', () => acknowledgementsDialog.close());
// Allow clicking the backdrop (outside the dialog surface) to dismiss.
acknowledgementsDialog.addEventListener('click', event => {
  if (event.target === acknowledgementsDialog) acknowledgementsDialog.close();
});
