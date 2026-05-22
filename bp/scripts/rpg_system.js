import { world, system } from "@minecraft/server";

export const MAX_LEVEL = 50;

export function getXpRequired(level) {
    if (level >= MAX_LEVEL) return Infinity;
    // Base XP: 100, scales by 1.2 each level
    return Math.floor(100 * Math.pow(1.2, level - 1));
}

export function getPlayerRpgData(player) {
    const defaultData = {
        mining: { level: 1, xp: 0 },
        woodcutting: { level: 1, xp: 0 },
        slayer: { level: 1, xp: 0 },
        sp: 0,
        unlockedSkills: [],
        equippedSkills: [],
        unlockedGachaPassives: [],
        equippedGachaPassives: []
    };
    try {
        const str = player.getDynamicProperty("rpg_data");
        if (str && typeof str === 'string') {
            return { ...defaultData, ...JSON.parse(str) };
        }
    } catch(e) {}
    return defaultData;
}

export function savePlayerRpgData(player, data) {
    player.setDynamicProperty("rpg_data", JSON.stringify(data));
}

export function addXp(player, profession, amount) {
    const data = getPlayerRpgData(player);
    if (!data[profession]) return false;
    if (data[profession].level >= MAX_LEVEL) return false;

    data[profession].xp += amount;
    let leveledUp = false;

    while (data[profession].level < MAX_LEVEL && data[profession].xp >= getXpRequired(data[profession].level)) {
        data[profession].xp -= getXpRequired(data[profession].level);
        data[profession].level += 1;
        data.sp += 1; // Gain 1 Skill Point per level
        leveledUp = true;
    }

    // Set temporary flag so Actionbar knows to show this profession's XP bar
    player.setDynamicProperty("rpg_recent_xp", JSON.stringify({
        prof: profession,
        time: Date.now()
    }));

    savePlayerRpgData(player, data);

    if (leveledUp) {
        player.runCommandAsync(`playsound random.levelup @s`);
        player.sendMessage(`§a[RPG] §fLevel §e${profession.toUpperCase()} §fnaik ke level §b${data[profession].level}§f! (+1 Skill Point)`);
        applyPassiveStats(player, data);
    }
    return true;
}

export function generateXpBar(xp, maxXp) {
    const barLength = 20;
    const filled = Math.min(barLength, Math.floor((xp / maxXp) * barLength));
    const empty = barLength - filled;
    return `§a${"|".repeat(filled)}§7${"|".repeat(empty)}`;
}

// Helper to execute block breaking recursively for active skills
export function breakBlockArea(player, originBlock, radius) {
    const dimension = player.dimension;
    let brokenCount = 0;

    // Hardcoded safety limits to prevent crashing the server
    if (radius > 2) radius = 2;

    for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
            for (let z = -radius; z <= radius; z++) {
                if (x === 0 && y === 0 && z === 0) continue; // Original block already broken
                try {
                    const bx = originBlock.x + x;
                    const by = originBlock.y + y;
                    const bz = originBlock.z + z;

                    const targetBlock = dimension.getBlock({ x: bx, y: by, z: bz });

                    if (targetBlock && !targetBlock.isAir) {
                        const id = targetBlock.typeId;
                        if (id !== "minecraft:bedrock" && id !== "minecraft:barrier" && id !== "minecraft:deny" && id !== "minecraft:allow" && id !== "minecraft:border_block") {
                            // destroy keyword causes block to drop its item and play breaking particles/sounds
                            dimension.runCommandAsync(`setblock ${bx} ${by} ${bz} air destroy`);
                            brokenCount++;
                        }
                    }
                } catch(e) {}
            }
        }
    }

    // Play an extra satisfying crunch sound at the center
    dimension.runCommandAsync(`playsound block.deepslate.break @a[x=${originBlock.x},y=${originBlock.y},z=${originBlock.z},r=10] 1.5 0.8`);
    dimension.runCommandAsync(`playsound random.explode @a[x=${originBlock.x},y=${originBlock.y},z=${originBlock.z},r=10] 0.5 1.5`);

    return brokenCount;
}

export function breakTreecapitator(player, originBlock) {
    const dimension = player.dimension;
    let brokenCount = 0;
    let blocksToProcess = [{ x: originBlock.x, y: originBlock.y, z: originBlock.z }];
    let processedBlocks = new Set();
    const maxLogs = 64; // Limit to prevent server lag

    // Add original block to processed to avoid checking it again
    processedBlocks.add(`${originBlock.x},${originBlock.y},${originBlock.z}`);

    while (blocksToProcess.length > 0 && brokenCount < maxLogs) {
        const current = blocksToProcess.shift();

        // Check 3x3x3 around the current block, but only upwards and same level to simulate a tree
        for (let x = -1; x <= 1; x++) {
            for (let y = 0; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    if (x === 0 && y === 0 && z === 0) continue;

                    const bx = current.x + x;
                    const by = current.y + y;
                    const bz = current.z + z;
                    const key = `${bx},${by},${bz}`;

                    if (!processedBlocks.has(key)) {
                        processedBlocks.add(key);
                        try {
                            const targetBlock = dimension.getBlock({ x: bx, y: by, z: bz });
                            if (targetBlock && (targetBlock.typeId.includes("log") || targetBlock.typeId.includes("wood") || targetBlock.typeId.includes("stem"))) {
                                dimension.runCommandAsync(`setblock ${bx} ${by} ${bz} air destroy`);
                                brokenCount++;
                                blocksToProcess.push({ x: bx, y: by, z: bz });
                            }
                        } catch(e) {}
                    }
                }
            }
        }
    }

    if (brokenCount > 0) {
        dimension.runCommandAsync(`playsound dig.wood @a[x=${originBlock.x},y=${originBlock.y},z=${originBlock.z},r=10] 1.5 0.8`);
    }

    return brokenCount;
}

// Global active skill cooldowns map
export const activeCooldowns = new Map();

export function canUseActiveSkill(playerName, skillId, cooldownMs) {
    const key = `${playerName}_${skillId}`;
    const lastUsed = activeCooldowns.get(key) || 0;
    if (Date.now() - lastUsed > cooldownMs) {
        activeCooldowns.set(key, Date.now());
        return true;
    }
    return false;
}

export function applyPassiveStats(player, rpgData) {
    try {
        // Mining Level -> Haste
        // Nerfed: Lvl 20 = Haste 1, Lvl 45 = Haste 2
        if (rpgData.mining.level >= 20) {
            let hasteLvl = rpgData.mining.level >= 45 ? 1 : 0;
            player.addEffect("haste", 30, { amplifier: hasteLvl, showParticles: false });
        }

        // Slayer Level -> Health Boost & Speed
        // Nerfed: Lvl 30 = Health Boost 1, Lvl 50 = Health Boost 2
        if (rpgData.slayer.level >= 30) {
            let hbLvl = rpgData.slayer.level >= 50 ? 1 : 0;
            player.addEffect("health_boost", 30, { amplifier: hbLvl, showParticles: false });
        }

        // Speed
        if (rpgData.slayer.level >= 35) {
            player.addEffect("speed", 30, { amplifier: 0, showParticles: false }); // Speed 1
        }

        // --- Gacha Passives ---
        const passives = rpgData.equippedGachaPassives || [];

        if (passives.includes("fortitude")) {
            player.addEffect("resistance", 30, { amplifier: 1, showParticles: false }); // Resistance 2
        }

        if (passives.includes("agility")) {
            player.addEffect("speed", 30, { amplifier: 1, showParticles: false }); // Speed 2
            player.addEffect("jump_boost", 30, { amplifier: 1, showParticles: false });
        }

        if (passives.includes("titans_grip")) {
            player.addEffect("strength", 30, { amplifier: 0, showParticles: false }); // Strength 1
        }

        if (passives.includes("vitality")) {
            player.addEffect("health_boost", 30, { amplifier: 1, showParticles: false }); // Nerfed: Boost 2
        }

        if (passives.includes("regeneration")) {
            player.addEffect("regeneration", 60, { amplifier: 0, showParticles: false }); // Regen 1
        }

        // Dynamic Health Triggers
        const hpComponent = player.getComponent("health");
        if (hpComponent) {
            const isLowHp = hpComponent.currentValue <= (hpComponent.effectiveMax / 3); // Under 33% HP

            if (isLowHp && passives.includes("phoenix_blood")) {
                player.addEffect("regeneration", 60, { amplifier: 2, showParticles: true }); // Regen 3
            }
            if (isLowHp && passives.includes("adrenaline")) {
                player.addEffect("speed", 60, { amplifier: 2, showParticles: true }); // Speed 3
            }
        }

        // --- Equipment Gacha Passives (Armor & Tools in hand) ---
        // Dynamically import to avoid top-level circular dependency breaking
        import("./gacha_effects.js").then(mod => {
            const safeGet = mod.safeGetGachaEffect;

            const invComponent = player.getComponent("inventory");
            const eqComponent = player.getComponent("equippable");

            if (eqComponent) {
                const head = eqComponent.getEquipment("Head");
                const chest = eqComponent.getEquipment("Chest");
                const legs = eqComponent.getEquipment("Legs");
                const feet = eqComponent.getEquipment("Feet");

                const checkEq = (item, slotName) => {
                    if (!item) return;
                    const eff = safeGet(item);
                    if (eff === "clear_mind") player.removeEffect("blindness");
                    if (eff === "aqua_lung") player.addEffect("water_breathing", 60, { amplifier: 0, showParticles: false });
                    if (eff === "third_eye") player.addEffect("night_vision", 300, { amplifier: 0, showParticles: false });

                    if (eff === "iron_skin") player.addEffect("resistance", 30, { amplifier: 0, showParticles: false });
                    if (eff === "turtle_shell") {
                        player.addEffect("resistance", 30, { amplifier: 1, showParticles: false });
                        player.addEffect("slowness", 30, { amplifier: 0, showParticles: false });
                    }
                    if (eff === "troll_blood") {
                        player.addEffect("regeneration", 60, { amplifier: 0, showParticles: false });
                    }

                    if (eff === "sturdy_legs") player.addEffect("health_boost", 30, { amplifier: 0, showParticles: false });
                    if (eff === "tank_legs") player.addEffect("health_boost", 30, { amplifier: 1, showParticles: false });
                    if (eff === "colossus") player.addEffect("health_boost", 30, { amplifier: 2, showParticles: false });

                    if (eff === "swift_step") player.addEffect("speed", 30, { amplifier: 0, showParticles: false });
                    if (eff === "frog_jump") player.addEffect("jump_boost", 30, { amplifier: 1, showParticles: false });
                    if (eff === "hermes_boots") {
                        player.addEffect("speed", 30, { amplifier: 2, showParticles: false });
                        player.addEffect("jump_boost", 30, { amplifier: 2, showParticles: false });
                    }

                    // Commit recovered properties if needed
                    eqComponent.setEquipment(slotName, item);
                };

                checkEq(head, "Head");
                checkEq(chest, "Chest");
                checkEq(legs, "Legs");
                checkEq(feet, "Feet");
            }

            if (invComponent && invComponent.container) {
                const mainHand = invComponent.container.getItem(player.selectedSlotIndex);
                if (mainHand) {
                    const eff = safeGet(mainHand);
                    if (eff === "miner_touch") player.addEffect("haste", 30, { amplifier: 0, showParticles: false });
                    if (eff === "geo_master") player.addEffect("haste", 30, { amplifier: 1, showParticles: false });
                    if (eff === "god_breaker") player.addEffect("haste", 30, { amplifier: 3, showParticles: false });

                    invComponent.container.setItem(player.selectedSlotIndex, mainHand);
                }
            }
        }).catch(() => {});

    } catch(e) {}
}
