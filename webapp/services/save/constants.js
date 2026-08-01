// Shared helpers used by more than one save/* domain module.

// Decode a .NET DateTime tick value into a JS Date (UTC).
// Ticks epoch is 0001-01-01; 1970-01-01 == 621355968000000000 ticks.
// Used by getVendorEconomy() (vendors.js) and the repair bench (repair.js) --
// both surface TimedEvents rows stored as raw tick counts.
const DOTNET_EPOCH_TICKS = 621355968000000000;
function ticksToDate(ticks) {
  return new Date((ticks - DOTNET_EPOCH_TICKS) / 10000);
}
function dateToTicks(date) {
  return DOTNET_EPOCH_TICKS + Math.floor(date.getTime() * 10000);
}

module.exports = {
  DOTNET_EPOCH_TICKS,
  ticksToDate,
  dateToTicks
};
