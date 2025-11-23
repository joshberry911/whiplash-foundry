/*
  Summary: Macro to enable and disable rage
  FoundryVTT: V13
  Notes: This is a workaround for ECH incompatibilities 
*/

const token = canvas.tokens.controlled[0];
if (!token) return ui.notifications.error("Select a token first.");
const actor = token.actor;

// Find Rage item
const rageItem = actor.items.find(i =>
  i.type === "feat" && i.name.toLowerCase() === "rage"
);
if (!rageItem) return ui.notifications.error("This actor has no Rage feature.");

// Check if Rage is already active
const existing = actor.effects.find(e => 
  e.statuses?.has("rage") || e.name.toLowerCase() === "rage"
);

if (existing) {
  await existing.delete();
  ui.notifications.info(`${actor.name} ends their Rage.`);
  return;
}

// Check uses
const uses = rageItem.system.uses?.value ?? 0;
if (uses < 1) return ui.notifications.warn(`${actor.name} has no Rage uses left.`);

// Spend one use
await rageItem.update({
  "system.uses.value": uses - 1
});

// Apply Rage Condition in VTT13
await actor.createEmbeddedDocuments("ActiveEffect", [{
  name: "Rage",
  icon: rageItem.img,
  origin: rageItem.uuid,
  statuses: ["rage"],
  duration: { rounds: 10 }
}]);

ui.notifications.info(`${actor.name} enters a Rage!`);