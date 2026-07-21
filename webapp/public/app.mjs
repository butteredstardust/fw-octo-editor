import './modules/core.mjs';
import './modules/features/weapons.mjs';
import './modules/features/inventory.mjs';
import './modules/features/dashboard.mjs';
import './modules/features/characters.mjs';
import './modules/features/vendors-repair.mjs';
import './modules/features/settings-planners.mjs';
import './modules/features/hub.mjs';
import './modules/system.mjs';
import { FW } from './modules/runtime.mjs';

function pollStatus() {
  FW.refreshSafetyStatus();
}

setInterval(pollStatus, 10000);
FW.refreshSafetyStatus();
FW.loadDashboard();
FW.loadCharacters();
FW.loadHubUpgrades();
FW.loadWeaponXp();
FW.loadInventory();
FW.loadRepair();
