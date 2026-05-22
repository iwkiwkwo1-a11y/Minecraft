// gacha_effects.js

export const WEAPON_EFFECTS = [
    { id: "serrated_edge", name: "Serrated Edge", type: "weapon", rarity: "Common", desc: "Peluang extra damage kecil (Wither 1dtk)." },
    { id: "poison_1", name: "Venom Strike", type: "weapon", rarity: "Rare", desc: "Peluang meracuni target." },
    { id: "frostbite", name: "Frostbite", type: "weapon", rarity: "Rare", desc: "Peluang slow dan weakness." },
    { id: "sonic_boom", name: "Sonic Boom", type: "weapon", rarity: "Rare", desc: "Knockback ekstrim ke target." },
    { id: "fire_aspect_x", name: "Hellfire", type: "weapon", rarity: "Epic", desc: "Membakar musuh parah." },
    { id: "abyssal_wither", name: "Abyssal Wither", type: "weapon", rarity: "Epic", desc: "Ledakan area wither." },
    { id: "blindness_strike", name: "Shadow Strike", type: "weapon", rarity: "Epic", desc: "Membutakan musuh sementara." },
    { id: "levitation_hit", name: "Gravity Smash", type: "weapon", rarity: "Epic", desc: "Menerbangkan musuh ke udara." },
    { id: "phantom_blade", name: "Phantom Blade", type: "weapon", rarity: "Epic", desc: "Peluang serangan area mematikan." },
    { id: "thunderous_smite", name: "Thunderous Smite", type: "weapon", rarity: "Legendary", desc: "Sambar petir mematikan." },
    { id: "vampiric", name: "Vampiric Touch", type: "weapon", rarity: "Legendary", desc: "Lifesteal deras." },
    { id: "explosive_blow", name: "Explosive Blow", type: "weapon", rarity: "Legendary", desc: "Ledakan area saat memukul." },
    { id: "void_strike", name: "Void Strike", type: "weapon", rarity: "Legendary", desc: "Mengikis Max HP musuh perlahan." }
];

export const HELMET_EFFECTS = [
    { id: "padded_helm", name: "Padded Armor", type: "helmet", rarity: "Common", desc: "Mengurangi sedikit noise (Stealth)." },
    { id: "clear_mind", name: "Clear Mind", type: "helmet", rarity: "Rare", desc: "Mencegah efek kebutaan." },
    { id: "aqua_lung", name: "Gills of Atlantis", type: "helmet", rarity: "Epic", desc: "Water Breathing Permanen." },
    { id: "third_eye", name: "Third Eye", type: "helmet", rarity: "Legendary", desc: "Night Vision & Glowing Mobs." }
];

export const CHEST_EFFECTS = [
    { id: "padded_chest", name: "Padded Armor", type: "chest", rarity: "Common", desc: "Extra pertahanan dasar." },
    { id: "iron_skin", name: "Iron Skin", type: "chest", rarity: "Rare", desc: "Resistance 1." },
    { id: "turtle_shell", name: "Turtle Shell", type: "chest", rarity: "Epic", desc: "Resistance 2 & Slowness." },
    { id: "troll_blood", name: "Troll Blood", type: "chest", rarity: "Legendary", desc: "Regenerasi HP 1 Permanen." },
    { id: "titans_aegis", name: "Titan's Aegis", type: "chest", rarity: "Legendary", desc: "Anti-Knockback, Resistance 3, Slowness 2." }
];

export const LEG_EFFECTS = [
    { id: "sturdy_legs", name: "Sturdy", type: "legs", rarity: "Rare", desc: "Sedikit extra HP." },
    { id: "tank_legs", name: "Behemoth", type: "legs", rarity: "Epic", desc: "Extra HP menengah (Boost 1)." },
    { id: "colossus", name: "Colossus", type: "legs", rarity: "Legendary", desc: "Max Health Boost (Boost 2)." }
];

export const BOOT_EFFECTS = [
    { id: "light_boots", name: "Lightweight", type: "boots", rarity: "Common", desc: "Sedikit lebih gesit." },
    { id: "swift_step", name: "Swiftness", type: "boots", rarity: "Rare", desc: "Speed 1." },
    { id: "frog_jump", name: "Frog Leap", type: "boots", rarity: "Epic", desc: "Jump Boost 2." },
    { id: "featherlight", name: "Featherlight", type: "boots", rarity: "Epic", desc: "Slow Falling / Anti Fall Damage." },
    { id: "hermes_boots", name: "Boots of Hermes", type: "boots", rarity: "Legendary", desc: "Speed 3 & Jump 3." }
];

export const TOOL_EFFECTS = [
    { id: "miner_touch", name: "Dwarven Touch", type: "tool", rarity: "Rare", desc: "Haste 1 saat dipegang." },
    { id: "geo_master", name: "Geomancer", type: "tool", rarity: "Epic", desc: "Haste 2." },
    { id: "god_breaker", name: "World Breaker", type: "tool", rarity: "Legendary", desc: "Haste 4." }
];

export function getItemCategory(typeId) {
    if (typeId.includes("helmet")) return "helmet";
    if (typeId.includes("chestplate")) return "chest";
    if (typeId.includes("leggings")) return "legs";
    if (typeId.includes("boots")) return "boots";
    if (typeId.includes("sword") || typeId.includes("trident") || typeId.includes("mace")) return "weapon";
    if (typeId.includes("pickaxe") || typeId.includes("axe") || typeId.includes("shovel") || typeId.includes("hoe")) return "tool";
    return "invalid";
}

export function getEffectPool(category, rarityName) {
    let pool = [];
    if (category === "helmet") pool = HELMET_EFFECTS;
    else if (category === "chest") pool = CHEST_EFFECTS;
    else if (category === "legs") pool = LEG_EFFECTS;
    else if (category === "boots") pool = BOOT_EFFECTS;
    else if (category === "weapon") pool = WEAPON_EFFECTS;
    else if (category === "tool") pool = TOOL_EFFECTS;

    const filtered = pool.filter(e => `§${getFormatCode(e.rarity)}[${e.rarity}]` === rarityName || e.rarity === rarityName.replace(/§./g, '').replace(/\[|\]/g, ''));

    if (filtered.length === 0) return { id: "none", name: "Kosong", desc: "Tidak Ada Efek" };

    return filtered[Math.floor(Math.random() * filtered.length)];
}

function getFormatCode(rarityStr) {
    if (rarityStr === "Common") return "f";
    if (rarityStr === "Rare") return "a";
    if (rarityStr === "Epic") return "d";
    if (rarityStr === "Legendary") return "6§l";
    return "f";
}

// New Helper to recover lost dynamic properties via Lore reading
export function getEffectFromLore(item) {
    const lore = item.getLore();
    if (!lore || lore.length < 2) return "none";

    const descLine = lore[1]; // "§r§7Kekuatan: §eNama Efek §f(§7Desc§f)"
    if (!descLine.includes("Kekuatan: ")) return "none";

    // Extract Effect Name from between "§e" and " §f("
    const nameMatch = descLine.match(/§e(.*?) §f\(/);
    if (!nameMatch || nameMatch.length < 2) return "none";

    const effectName = nameMatch[1];

    // Search all pools for matching name
    const allEffects = [...WEAPON_EFFECTS, ...HELMET_EFFECTS, ...CHEST_EFFECTS, ...LEG_EFFECTS, ...BOOT_EFFECTS, ...TOOL_EFFECTS];
    const found = allEffects.find(e => e.name === effectName);

    return found ? found.id : "none";
}

export function safeGetGachaEffect(item) {
    let eff = item.getDynamicProperty("gacha_effect");
    if (!eff || eff === "none") {
        eff = getEffectFromLore(item);
        // If recovered from lore, restore the dynamic property to fix the item
        if (eff !== "none") {
            try { item.setDynamicProperty("gacha_effect", eff); } catch(e) {}
        }
    }
    return eff;
}
