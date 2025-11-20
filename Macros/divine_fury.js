// Macro for a Path of the Zealot Barbarian
// Assumes they want to use Divine Fury (i.e. it is the first attack)
// Assumes they have savage attacker
// Has a hard coded default weapon
// TODO: Build in 1h/2h weapons calculations
// TODO: Select the samage type for Divine Fury

main()

async function main(){
  // Get Selected
  let selected = canvas.tokens.controlled;
  if(selected.length > 1){
    return ui.notifications.error("Please select only one token")
  }
  let selected_actor = selected[0].actor;
  
  // Get Target
  let targets = Array.from(game.user.targets)
  if(targets.length == 0 || targets.length > 1 ){
    return ui.notifications.error("Please target one token");
  }
  let target_actor = targets[0].actor;

  // Check for Rage
  let isRaging = selected_actor.effects.some(e => 
    e.name.toLowerCase().includes("rage") && !e.disabled
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

  // TODO: 1h 2h toggle needed
  // TODO: need to use weapon.system.damage.versatile instead
  let dialogTemplate = `
  <h1> Pick a weapon </h1>
  <div style="display:flex">
    <div  style="flex:1"><select id="weapon">${weaponOptions}</select></div>
    <span style="flex:1">Mod <input  id="mod" type="number" style="width:50px;float:right" value=0 /></span>
    <span style="flex:1"><input id="ignoreArmor" type="checkbox" checked /></span>
    </div>
  `

  new Dialog({
    title: "Roll Attack",
    content: dialogTemplate,
    buttons: {
      rollAtk: {
        label: "Roll Attack",
        callback: async (html) => {

          // --- Get weapon + modifiers ---
          const wepID = html.find("#weapon")[0].value;
          const wep = selected_actor.items.get(wepID);
          const modifier = Number(html.find("#mod")[0].value || 0);
          const ignoreArmor = html.find("#ignoreArmor")[0].checked;

          const atkBonus = wep.system.attack?.value ?? 0;

          // --- Build attack roll ---
          const newRollString = `1d20 + ${atkBonus} + ${modifier}`;
          const roll = new Roll(newRollString);

          await roll.evaluate();
          const result = roll.total;

          // --- Determine Target Armor ---
          const armor = !ignoreArmor ? (target_actor.system.attributes.armor?.value ?? 0) : 0;

          // --- Build Chat Template ---
          let chatTemplate = `
            <p>Rolled: ${result} against ${armor} Target Armor</p>
            <p>${result > armor ? "It was a <strong>Hit</strong>!" : "It was a <strong>Miss</strong>!"}</p>
          `;

          if (result > armor) {
            chatTemplate += `<p><button id="rollDamage">Roll Damage</button></p>`;
          }

          // --- Create Chat Message ---
          const msg = await ChatMessage.create({
            speaker: { alias: selected_actor.name },
            content: chatTemplate,
            rolls: [roll]
          });

          // Roll Damage button handler
          const rollDamage = async () => {
            let dmgFormula = "";
          
            // Check damage.parts
            if (Array.isArray(wep.system.damage?.parts) && wep.system.damage.parts.length > 0) {
              const formulas = wep.system.damage.parts
                .map(p => p[0])
                .filter(f => f && f.trim() !== "");
              dmgFormula = formulas.join(" + ");
            }
          
            // Fallback to single formula
            if (!dmgFormula && wep.system.damage?.formula) {
              dmgFormula = wep.system.damage.formula;
            }
          
            // Unarmed strike fallback
            if (!dmgFormula && wep.name.toLowerCase().includes("unarmed")) {
              const strMod = actor.system.abilities.str.mod ?? 0;
              dmgFormula = `1 + ${strMod}`;
            }
          
            // Catch the error if we have not found a dmgFormula
            if (!dmgFormula) {
              return ui.notifications.error(`Weapon "${wep.name}" has no damage formula.`);
            }

            // Roll base damage twice and pick the highest for savage attacker
            const rollDmg1 = new Roll(dmgFormula);
            const rollDmg2 = new Roll(dmgFormula);
            await rollDmg1.evaluate({ async: true });
            await rollDmg2.evaluate({ async: true });
            const baseDmg = rollDmg1.total >= rollDmg2.total ? rollDmg1 : rollDmg2;
          
            // Roll damage from Divine Fury
            const barbarianClass = selected_actor.items.find(i => i.type === "class" && i.name.toLowerCase() === "barbarian");
            if (!barbarianClass) return ui.notifications.error("This character has no Barbarian levels.");
            const barbarianLevel = barbarianClass.system.levels ?? 0;
            const dfDmgMod = Math.floor(barbarianLevel / 2)
            const dfDmg = new Roll(`1d6 + ${dfDmgMod}`);
            await dfDmg.evaluate({ async: true });

            // Work out the total damage
            const totalDmg = baseDmg + dfDmg;

            // Send to chat
            totalDmg.toMessage({
              speaker: { alias: actor.name },
              flavor: `Inspired damage Roll for ${wep.name}`
            });
          };
          msg.rendered.then(html => {
            html.querySelector("#rollDamage")?.addEventListener("click", async () => {
              await rollDamage();
            });
          });
        }
      },
      close: {
        label: "Close"
      }
    }
  }).render(true);
}