/*
  Summary: Macro for a Path of the Zealot Barbarian
  FoundryVTT: V13
  Assumptions:
   Actor is using Divine Fury (i.e. it is the first attack)
   Actor has the savage attacker feat
   Macro is hard coded to a homebrew weapon (Grok's Mojo)
  TODO:
    Select the damage type for Divine Fury
    Fix Grok's Mojo so it has versatile damage
    
*/

main()

async function main(){
  // Get Selected
  const selected = canvas.tokens.controlled;
  if(selected.length > 1){
    return ui.notifications.error("Please select only one token")
  }
  const selected_actor = selected[0].actor;
  
  // Get Target
  const targets = Array.from(game.user.targets);
  if(targets.length == 0 || targets.length > 1 ){
    return ui.notifications.error("Please target one token");
  }
  const target_actor = targets[0].actor;

  // Check for Rage
  const isRaging = selected_actor.effects.some(e =>
    !e.disabled &&
    /\brag(e|ing)\b/i.test(e.name)   // matches "rage" or "raging"
  );
  if (!isRaging) {
    return ui.notifications.error("You must be raging to use divine fury");
  }
 
  // Select Weapon
  const equippedWeapons = actor.items.filter(i =>
    i.type === "weapon" &&
    i.system.equipped === true
  );

  let weaponOptions = "";
  const defaultWeaponName = "Groks Mojo";  
  for (let item of equippedWeapons) {
    const selected = item.name === defaultWeaponName ? "selected" : "";

    weaponOptions += `
      <option value="${item.id}" ${selected}>
        ${item.name} | ATK: ${item.system.attack?.value ?? 0}
      </option>
    `;
  }

let dialogTemplate = `
  <h1>Pick a Weapon</h1>

  <div>
    <select id="weapon">${weaponOptions}</select>
  </div>

  <div style="margin-top: 8px;">
    Advantage:
    <input id="advantage" type="checkbox" />
    Disadvantage:
    <input id="disadvantage" type="checkbox" />
  </div>  

  <div style="margin-top: 8px;">
    Two-Handed:
    <input id="versatile" type="checkbox" checked/>
  </div>

  <div style="margin-top: 8px;">
    Ignore Armour:
    <input id="ignoreArmor" type="checkbox" />
  </div>
`

  new Dialog({
    title: "Roll Attack",
    content: dialogTemplate,
    buttons: {
      rollAtk: {
        label: "Roll Attack",
        callback: async (html) => {

          // Get weapon + modifiers
          const wepID = html.find("#weapon")[0].value;
          const wep = selected_actor.items.get(wepID);
          const ignoreArmor = html.find("#ignoreArmor")[0].checked;
          const versatile = html.find("#versatile")[0].checked;
          const advantage = html.find("#advantage")[0].checked;
          const disadvantage = html.find("#disadvantage")[0].checked;

          // Determine which ability the weapon uses
          // TODO: Grok's Mojo is a strength weapon?
          let ability = wep.system.ability ?? "dex";
          const abilityMod = selected_actor.system.abilities[ability].mod;

          // Determine proficiency
          const isProficient = selected_actor.items.find(i => i.id === wep.id)?.system.proficient ?? true;
          const profBonus = isProficient ? selected_actor.system.attributes.prof : 0;

          // Add any magic bonus from weapon
          const magicBonus = wep.system.properties?.magical ? 1 : 0;

          // Total attack bonus
          const atkBonus = abilityMod + profBonus + magicBonus;

          // Build attack roll
          let newRollString = ""
          if (advantage) {
            newRollString = `2d20kh1 + ${atkBonus}`;
          } else if (disadvantage) {
            newRollString = `2d20kl1 + ${atkBonus}`;
          } else {
            newRollString = `1d20 + ${atkBonus}`;
          }
          const roll = new Roll(newRollString);
          await roll.evaluate();
          const result = roll.total;

          // Determine Target Armor
          const armor = !ignoreArmor ? (target_actor.system.attributes.ac?.value ?? 0) : 0;

          // Build Chat Template
          let chatTemplate = `
            <p>Rolled: ${result} against ${armor} Target Armor</p>
            <p>${result > armor ? "It was a <strong>Hit</strong>!" : "It was a <strong>Miss</strong>!"}</p>
          `;

          if (result > armor) {
            chatTemplate += `<p><button id="rollDamage">Roll Damage</button></p>`;
          }

          // Create Chat Message
          const msg = await ChatMessage.create({
            speaker: { alias: selected_actor.name },
            content: chatTemplate,
            rolls: [roll]
          });

          // Roll Damage button handler
          const rollDamage = async () => {
            let dmgFormula = "";
          
            // TODO fix versatile damage on groks mojo
            // FIXME this hard codes a dex modifier
            if (versatile && !dmgFormula && wep.system.damage.versatile) {
              //dmgFormula = `${wep.system.damage.versatile.formula} + ${abilityMod}`;
              dmgFormula = `1d10 + ${abilityMod}`
            }
            else if (!dmgFormula && wep.system.damage.base) {
              dmgFormula = `${wep.system.damage.base.formula} + ${abilityMod}`;
            }
          
            // Unarmed strike fallback
            if (!dmgFormula && wep.name.toLowerCase().includes("unarmed")) {
              dmgFormula = `1 + ${strMod}`;
            }
          
            // Catch the error if we have not found a dmgFormula
            if (!dmgFormula) {
              return ui.notifications.error(`Weapon "${wep.name}" has no damage formula.`);
            }

            // Savage Attacker transform
            const saFormula = dmgFormula.replace(/^1d(\d+)/, "2d$1kh1");

            // Divine Fury formula
            const barbarianClass = selected_actor.items.find(i =>
              i.type === "class" && i.name.toLowerCase() === "barbarian"
            );
            if (!barbarianClass) return ui.notifications.error("No Barbarian levels found.");
            const barbarianLevel = barbarianClass.system.levels;
            const dfMod = Math.floor(barbarianLevel / 2);
            const dfFormula = `1d6 + ${dfMod}`;

            // Define final formula and roll
            const finalFormula = `${saFormula} + ${dfFormula}`;
            const finalRoll = await (new Roll(finalFormula)).evaluate();

            // Send to chat
            const dmgMsg = await finalRoll.toMessage({
              speaker: ChatMessage.getSpeaker({actor: selected_actor}),
              flavor: `Inspired damage Roll for ${wep.name}`
            });

            // Wait for the dice to roll
            if (game.dice3d) {
              await game.dice3d.waitFor3DAnimationByMessageID(dmgMsg.id);
            }

            // Apply Damage
            const damage = finalRoll.total;
            let hp = target_actor.system.attributes.hp.value;
            let temp = target_actor.system.attributes.hp.temp ?? 0;
            let appliedDamage = damage;

            // Apply to temp HP first
            if (temp > 0) {
              const consumed = Math.min(temp, appliedDamage);
              temp -= consumed;
              appliedDamage -= consumed;
            }

            // Apply remaining damage to real HP
            hp = Math.max(hp - appliedDamage, 0);

            // Update target actor
            await target_actor.update({
              "system.attributes.hp.temp": temp,
              "system.attributes.hp.value": hp
            });
          };

          // Wait for rollDamage
          Hooks.once("renderChatMessageHTML", (chatMessage, html) => {
            const btn = html.querySelector("#rollDamage");
            if (btn) btn.addEventListener("click", async () => await rollDamage());
          });
        }
      },
      close: {
        label: "Close"
      }
    }
  }).render(true);
}