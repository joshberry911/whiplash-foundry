/*
  Summary: Macro for a Path of the Zealot Barbarian
  FoundryVTT: V13
  Assumptions:
   Actor is using Divine Fury (i.e. it is the first attack)
   Actor has the savage attacker feat
   Macro has a hard coded default weapon that must be equiped
  TODO:
    Build in 1h/2h weapons calculations
    Select the damage type for Divine Fury
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
    e.name.toLowerCase().includes("raging") && !e.disabled
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
  <h1>Pick a Weapon</h1>

  <div>
    <select id="weapon">${weaponOptions}</select>
  </div>

  <div style="margin-top: 8px;">
    Modifier:
    <input id="modInput" type="text" style="width:80px;" value="" />
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
          const modInput = html.find("#modInput")[0].value;
          const ignoreArmor = html.find("#ignoreArmor")[0].checked;
          const versatile = html.find("#versatile")[0].checked;
          const advantage = html.find("#advantage")[0].checked;
          const disadvantage = html.find("#disadvantage")[0].checked;


          // Determine which ability the weapon uses
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
            const dexMod = actor.system.abilities.dex.mod ?? 0;
            if (versatile && !dmgFormula && wep.system.damage.versatile) {
              //dmgFormula = `${wep.system.damage.versatile.formula} + ${dexMod}`;
              dmgFormula = `1d10 + ${dexMod}`
            }
            else if (!dmgFormula && wep.system.damage.base) {
              dmgFormula = `${wep.system.damage.base.formula} + ${dexMod}`;
            }
          
            // Unarmed strike fallback
            if (!dmgFormula && wep.name.toLowerCase().includes("unarmed")) {
              dmgFormula = `1 + ${strMod}`;
            }
          
            // Catch the error if we have not found a dmgFormula
            if (!dmgFormula) {
              return ui.notifications.error(`Weapon "${wep.name}" has no damage formula.`);
            }

            // Roll base damage twice and pick the highest for savage attacker
            //const rollDmg1 = await (new Roll(dmgFormula)).evaluate();
            //console.log(rollDmg1._total)
            //game.dice3d?.showForRoll(rollDmg1, game.user, true);
            //const rollDmg2 = await (new Roll(dmgFormula)).evaluate();
            //console.log(rollDmg2._total)
            //game.dice3d?.showForRoll(rollDmg2, game.user, true);
            //const baseDmg = rollDmg1.total >= rollDmg2.total ? rollDmg1 : rollDmg2;
/*
            // Savage attacker
            const saFormula = dmgFormula.replace(/(^|\s)1d(\d+)/, "$1 2d$2kh1").replace(/\s+/g, " ").trim();
            console.log("SA formula (string):", saFormula);
            const saDmg = await (new Roll(saFormula)).evaluate();
            if (game.dice3d) game.dice3d.showForRoll(saDmg, game.user, true);

            // Roll damage from Divine Fury
            const barbarianClass = selected_actor.items.find(i => i.type === "class" && i.name.toLowerCase() === "barbarian");
            if (!barbarianClass) return ui.notifications.error("This character has no Barbarian levels.");
            const barbarianLevel = barbarianClass.system.levels ?? 0;
            const dfDmgMod = Math.floor(barbarianLevel / 2)
            const dfDmg = await (new Roll(`1d6 + ${dfDmgMod}`)).evaluate();

            // Work out the total damage
            const finalFormula = `${saDmg.formula} + ${dfDmg.formula}`;
            const finalRoll = await (new Roll(finalFormula)).evaluate();
            
*/
            // --- Savage Attacker transform ---
            // Turn "1d10+4" into "2d10kh1+4"
            const saFormula = dmgFormula.replace(/^1d(\d+)/, "2d$1kh1");
            const saRoll = await (new Roll(saFormula)).evaluate();
            if (game.dice3d) game.dice3d.showForRoll(saRoll, game.user, true);

            // --- Divine Fury formula ---
            const barbarianClass = selected_actor.items.find(i =>
              i.type === "class" && i.name.toLowerCase() === "barbarian"
            );
            if (!barbarianClass) return ui.notifications.error("No Barbarian levels found.");
            const barbarianLevel = barbarianClass.system.levels ?? 0;
            const dfMod = Math.floor(barbarianLevel / 2);
            const dfFormula = `1d6 + ${dfMod}`;
            const dfRoll = await (new Roll(dfFormula)).evaluate();
            if (game.dice3d) game.dice3d.showForRoll(dfRoll, game.user, true);

            // --- FINAL ROLL ---
            // ❗ Use saFormula and dfFormula — NOT saRoll.formula or dfRoll.formula
            const finalFormula = `${saFormula} + ${dfFormula}`;
            console.log("Final formula:", finalFormula);

            //const finalRoll = await (new Roll(finalFormula)).evaluate();
            //if (game.dice3d) game.dice3d.showForRoll(finalRoll, game.user, true);
            const totalDamage = saRoll.total + dfRoll.total;

            // Send to chat
            //finalRoll.toMessage({
            //  speaker: ChatMessage.getSpeaker({actor: selected_actor}),
            //  flavor: `Inspired damage Roll for ${wep.name}`
            //});
            ChatMessage.create({
              speaker: ChatMessage.getSpeaker(),
              flavor: "Total Damage (Savage Attacker + Divine Fury)",
              content: `
                <div><b>Savage Attacker:</b> ${saRoll.total}</div>
                <div><b>Divine Fury:</b> ${dfRoll.total}</div>
                <hr>
                <div><b>Total Damage:</b> ${totalDamage}</div>
              `
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