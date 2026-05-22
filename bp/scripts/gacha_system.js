import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { getPlayerRpgData, savePlayerRpgData } from "./rpg_system.js";
import { formatRupiah, getUiHeader } from "./utils.js";
import { getItemCategory, getEffectPool } from "./gacha_effects.js";

// Constants
export const CORE_PRICE = 100000;

export function getCoreScore(player) {
    const obj = world.scoreboard.getObjective("core");
    if (!obj) return 0;
    try {
        return obj.getScore(player) || 0;
    } catch {
        return 0;
    }
}

export function setCoreScore(player, score) {
    const obj = world.scoreboard.getObjective("core");
    if (obj) {
        obj.setScore(player, score);
    }
}


export function openGachaMenu(player) {
    const form = new ActionFormData();
    form.title("§5[ Gacha & Core ]");

    form.body(getUiHeader(player) + `\n§7Gunakan Core untuk menggacha kekuatan senjata legendaris atau mendapatkan skill pasif tingkat dewa!`);

    form.button("§bTukar Rupiah -> Core\n§7Rp100.000 = 1 Core");
    form.button("§dGacha Senjata/Armor (Main Hand)\n§7Harga: 5 Core");
    form.button("§eGacha Pasif Dewa\n§7Harga: 10 Core");
    form.button("§cKembali ke Menu Utama");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) openConvertMenu(player);
        else if (res.selection === 1) openEquipmentGacha(player);
        else if (res.selection === 2) openPassiveGacha(player);
        else if (res.selection === 3) {
            import("./main.js").then(mod => {
                system.runTimeout(() => { mod.openMainMenu(player); }, 5);
            }).catch(()=>{});
        }
    });
}

const GACHA_COST_PASSIVE = 10; // Costs 10 Cores

export const PASSIVE_POOL = [
    { id: "fortitude", name: "🛡 Fortitude", desc: "Resistance Permanen" },
    { id: "agility", name: "💨 Agility", desc: "Speed & Jump Boost Permanen" },
    { id: "titans_grip", name: "⚔ Titan's Grip", desc: "Strength Permanen" },
    { id: "vitality", name: "❤ Vitality", desc: "Health Boost Permanen" },
    { id: "regeneration", name: "✨ Vigor", desc: "Regen HP Perlahan" },
    { id: "phoenix_blood", name: "🔥 Phoenix Blood (Legendary)", desc: "Regen deras saat HP sekarat" },
    { id: "adrenaline", name: "⚡ Adrenaline (Legendary)", desc: "Speed gila saat HP sekarat" },
    { id: "second_wind", name: "🌟 Second Wind (Legendary)", desc: "Revive setengah HP dari kematian" }
];

export function openPassiveGacha(player) {
    const objCore = world.scoreboard.getObjective("core");
    let currentCore = 0;
    try { if (objCore) currentCore = objCore.getScore(player) || 0; } catch (e) {}

    if (currentCore < GACHA_COST_PASSIVE) {
        player.sendMessage(`§c[Gacha] Core tidak mencukupi! Diperlukan §b${GACHA_COST_PASSIVE} Core§c.`);
        return;
    }

    const rpgData = getPlayerRpgData(player);
    // Initialize if missing (for existing players before update)
    if (!rpgData.unlockedGachaPassives) rpgData.unlockedGachaPassives = [];

    if (rpgData.unlockedGachaPassives.length >= PASSIVE_POOL.length) {
        player.sendMessage("§c[Gacha] Kamu sudah memiliki semua Pasif Dewa yang tersedia saat ini!");
        return;
    }

    // Deduct Core
    objCore.setScore(player, currentCore - GACHA_COST_PASSIVE);

    // Filter pool to only give un-owned passives
    const availablePool = PASSIVE_POOL.filter(p => !rpgData.unlockedGachaPassives.includes(p.id));
    const rollIndex = Math.floor(Math.random() * availablePool.length);
    const wonPassive = availablePool[rollIndex];

    rpgData.unlockedGachaPassives.push(wonPassive.id);
    savePlayerRpgData(player, rpgData);

    // Server-side execution to bypass player permissions
    const px = Math.floor(player.location.x);
    const py = Math.floor(player.location.y);
    const pz = Math.floor(player.location.z);

    player.dimension.runCommandAsync(`summon fireworks_rocket ${px} ${py + 1} ${pz}`);
    player.dimension.runCommandAsync(`playsound random.levelup @a[x=${px},y=${py},z=${pz},r=10]`);
    player.dimension.runCommandAsync(`camerashake add @a[x=${px},y=${py},z=${pz},r=10] 0.5 1 positional`);

    world.sendMessage(`§5§l[GACHA DEWA] §r§fPemain §b${player.name} §fberhasil mendapatkan Pasif Dewa: §e${wonPassive.name}§f!`);
}

function openConvertMenu(player) {
    const form = new ModalFormData();
    form.title("§b[ Tukar Core ]");
    form.slider(`Berapa Core yang ingin dibeli?\n§7Harga: ${formatRupiah(CORE_PRICE)} / Core`, 1, 64, 1, 1);

    form.show(player).then(res => {
        if (res.canceled) return;

        const amount = Math.floor(res.formValues[0]);
        const cost = amount * CORE_PRICE;

        // Dynamic import workaround since getScore is inside main.js and causes circular dependency if heavily nested.
        // We will refactor score logic if needed, but for now we use world.scoreboard directly.
        const objDompet = world.scoreboard.getObjective("dompet");
        const objCore = world.scoreboard.getObjective("core");
        if (!objDompet || !objCore) return;

        let currentRupiah = 0;
        try { currentRupiah = objDompet.getScore(player) || 0; } catch (e) {}

        if (currentRupiah >= cost) {
            objDompet.setScore(player, currentRupiah - cost);
            let currentCore = 0;
            try { currentCore = objCore.getScore(player) || 0; } catch (e) {}
            objCore.setScore(player, currentCore + amount);

            player.sendMessage(`§a[System] Berhasil membeli §b${amount} Core §aseharga §e${formatRupiah(cost)}!`);
        } else {
            player.sendMessage(`§c[System] Saldo Rupiah Anda tidak mencukupi. Diperlukan ${formatRupiah(cost)}.`);
        }
    });
}

const GACHA_COST_EQUIPMENT = 5; // Costs 5 Cores

const RARITIES = [
    { name: "§f[Common]", weight: 74.99, effect: "none" },
    { name: "§a[Rare]", weight: 20, effect: "frostbite" },
    { name: "§d[Epic]", weight: 5, effect: "abyssal_wither" },
    { name: "§6§l[Legendary]", weight: 0.01, effect: "thunderous_smite" }
];

function getRandomRarity() {
    const totalWeight = RARITIES.reduce((acc, r) => acc + r.weight, 0);
    let randomNum = Math.random() * totalWeight;
    for (const rarity of RARITIES) {
        if (randomNum < rarity.weight) return rarity;
        randomNum -= rarity.weight;
    }
    return RARITIES[0];
}

export function openEquipmentGacha(player) {
    const invComponent = player.getComponent("inventory");
    if (!invComponent) return;
    const inv = invComponent.container;

    const objCore = world.scoreboard.getObjective("core");
    let currentCore = 0;
    try { if (objCore) currentCore = objCore.getScore(player) || 0; } catch (e) {}

    if (currentCore < GACHA_COST_EQUIPMENT) {
        player.sendMessage(`§c[Gacha] Core tidak mencukupi! Diperlukan §b${GACHA_COST_EQUIPMENT} Core§c.`);
        return;
    }

    // Scan inventory for valid gear
    const validItems = [];
    for (let i = 0; i < inv.size; i++) {
        const item = inv.getItem(i);
        if (!item) continue;

        const category = getItemCategory(item.typeId);
        if (category !== "invalid") {
            const eff = item.getDynamicProperty("gacha_effect");
            let effName = "";
            if (eff && typeof eff === 'string' && eff !== "none") {
                effName = " §d(Memiliki Efek)";
            }

            // Format name nicely
            let cleanName = item.typeId.replace("minecraft:", "").replace(/_/g, " ");
            cleanName = cleanName.replace(/\b\w/g, l => l.toUpperCase());

            validItems.push({
                slotIndex: i,
                item: item,
                category: category,
                displayName: `[Slot ${i}] ${cleanName}${effName}`
            });
        }
    }

    if (validItems.length === 0) {
        player.sendMessage("§c[Gacha] Tidak ada Senjata atau Armor yang valid di dalam Inventory.");
        return;
    }

    const form = new ModalFormData();
    form.title("§d[ Pilih Equipment ]");

    const options = validItems.map(v => v.displayName);
    form.dropdown("Pilih barang yang ingin disihir:\n§7Harga: 5 Core", options);

    form.show(player).then(res => {
        if (res.canceled) return;

        const selected = validItems[res.formValues[0]];
        const slot = selected.slotIndex;
        const item = selected.item;
        const category = selected.category;

        // Handle Reroll Confirmation Flow
        const existingEffect = item.getDynamicProperty("gacha_effect");
        if (existingEffect && typeof existingEffect === "string" && existingEffect !== "none") {
            executeRerollFlow(player, item, slot, inv, currentCore, objCore, category);
            return;
        }

        // Direct Gacha Flow for items without an effect
        objCore.setScore(player, currentCore - GACHA_COST_EQUIPMENT);
        applyGachaResult(player, item, slot, inv, category);
    });
}

function executeRerollFlow(player, item, slotIndex, inv, currentCore, objCore, category) {
    const rarity = getRandomRarity();
    const newEffectData = getEffectPool(category, rarity.name);

    // Get old effect data for comparison
    const oldEffectId = item.getDynamicProperty("gacha_effect");
    const oldLore = item.getLore();
    const oldDesc = oldLore.length > 1 ? oldLore[1].replace("§r§7Kekuatan: ", "") : "Unknown";

    const form = new MessageFormData();
    form.title("§5[ Reroll Konfirmasi ]");
    form.body(`§fBarang ini sudah memiliki kekuatan sihir!\n\n§cEfek Lama:\n§7${oldDesc}\n\n§aEfek Baru Didapat:\n§r${rarity.name} §f- §e${newEffectData.name}\n§7${newEffectData.desc}\n\n§fApakah kamu ingin mengganti kekuatan lama dengan kekuatan baru ini? (Core tetap akan terpotong).`);
    form.button1("§aYa, Ganti!");
    form.button2("§cTidak, Simpan Lama");

    form.show(player).then(res => {
        if (res.canceled) return;

        // Deduct core regardless of choice
        objCore.setScore(player, currentCore - GACHA_COST_EQUIPMENT);

        if (res.selection === 0) { // Ya, Ganti (button1 = 0)
            item.setDynamicProperty("gacha_effect", newEffectData.id);
            const newLore = [
                `§r${rarity.name}`,
                `§r§7Kekuatan: §e${newEffectData.name} §f(§7${newEffectData.desc}§f)`
            ];
            item.setLore(newLore);
            inv.setItem(slotIndex, item);

            triggerGachaAnimations(player, rarity, newEffectData);
        } else {
            player.sendMessage("§e[Gacha] Kekuatan lama berhasil dipertahankan.");
        }
    });
}

function applyGachaResult(player, item, slotIndex, inv, category) {
    const rarity = getRandomRarity();
    const effectData = getEffectPool(category, rarity.name);

    item.setDynamicProperty("gacha_effect", effectData.id);
    const newLore = [
        `§r${rarity.name}`,
        `§r§7Kekuatan: §e${effectData.name} §f(§7${effectData.desc}§f)`
    ];
    item.setLore(newLore);
    inv.setItem(slotIndex, item);

    triggerGachaAnimations(player, rarity, effectData);
}

function triggerGachaAnimations(player, rarity, effectData) {
    if (rarity.name.includes("Epic") || rarity.name.includes("Legendary")) {
        const px = Math.floor(player.location.x);
        const py = Math.floor(player.location.y);
        const pz = Math.floor(player.location.z);

        player.dimension.runCommandAsync(`summon fireworks_rocket ${px} ${py + 1} ${pz}`);
        player.dimension.runCommandAsync(`playsound random.levelup @a[x=${px},y=${py},z=${pz},r=10]`);
        player.dimension.runCommandAsync(`camerashake add @a[x=${px},y=${py},z=${pz},r=10] 0.5 1 positional`);

        world.sendMessage(`§6§l[GACHA] §r§fPemain §b${player.name} §fbaru saja mendapatkan sihir §l${rarity.name} §e${effectData.name}§f!`);
    } else {
        player.sendMessage(`§a[Gacha] Berhasil menyihir barang! Anda mendapatkan grade ${rarity.name}.`);
        player.dimension.runCommandAsync(`playsound random.orb @a[x=${Math.floor(player.location.x)},y=${Math.floor(player.location.y)},z=${Math.floor(player.location.z)},r=5]`);
    }
}
