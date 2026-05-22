import { world, system, ItemStack, ItemLockMode, EnchantmentTypes, DisplaySlotId, ObjectiveSortOrder } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { EconomyConfig } from "./economy_config.js";
import { getPlayerRpgData, getXpRequired, generateXpBar, applyPassiveStats, addXp, breakBlockArea, canUseActiveSkill, savePlayerRpgData } from "./rpg_system.js";
import { formatRupiah, getUiHeader, sendToInbox, getInbox, clearInbox } from "./utils.js";
import { openGachaMenu, PASSIVE_POOL } from "./gacha_system.js";
import { openTrollMenu } from "./troll_system.js";
import { getPlayerRank } from "./rank_system.js";

// Initialize Objective
system.run(() => {
    try {
        let dompetObj = world.scoreboard.getObjective("dompet");
        if (!dompetObj) {
            dompetObj = world.scoreboard.addObjective("dompet", "§e§lPRO SURVIVAL");
        }
        if (!world.scoreboard.getObjective("core")) {
            world.scoreboard.addObjective("core", "§b§lCORE");
        }

        // Clear sidebar if it was previously set
        world.scoreboard.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);} catch (e) {
        // Ignore if it already exists or errors
    }
});

// Shop Rotation State
let currentShopItems = [];
let nextRefreshTime = Date.now() + 60000; // 1 minute from now

function refreshShop() {
    const normalKeys = Object.keys(EconomyConfig.buyPoolNormal);
    const opKeys = Object.keys(EconomyConfig.buyPoolOP);

    // Shuffle arrays
    normalKeys.sort(() => 0.5 - Math.random());
    opKeys.sort(() => 0.5 - Math.random());

    currentShopItems = [];

    // Pick 29 random normal items
    const selectedNormals = normalKeys.slice(0, 29);
    for (const key of selectedNormals) {
        currentShopItems.push({ id: key, price: EconomyConfig.buyPoolNormal[key], isOP: false });
    }

    // Pick 1 random OP item
    const selectedOP = opKeys[0];
    currentShopItems.push({ id: selectedOP, price: EconomyConfig.buyPoolOP[selectedOP], isOP: true });

    // Shuffle the final list so the OP item isn't always last
    currentShopItems.sort(() => 0.5 - Math.random());

    nextRefreshTime = Date.now() + 60000;
}

// Initial shop load
refreshShop();

// Shop Rotation Timer (Checks every 20 ticks)
system.runInterval(() => {
    if (Date.now() >= nextRefreshTime) {
        refreshShop();
        world.sendMessage("§e[Shop] §fBarang jualan di Menu Beli telah diperbarui! Cek sekarang!");
    }
}, 20);

function getScore(player, objectiveId) {
    const obj = world.scoreboard.getObjective(objectiveId);
    if (!obj) return 0;
    try {
        return obj.getScore(player.scoreboardIdentity) || 0;
    } catch {
        return 0;
    }
}

function setScore(player, objectiveId, score) {
    const obj = world.scoreboard.getObjective(objectiveId);
    if (obj) {
        obj.setScore(player, score);
    }
}

// Actionbar Loop & Visibility Tracker
const hiddenBoards = new Map();

system.runInterval(() => {

    const players = world.getAllPlayers();
    const online = players.length;
    for (const player of players) {
        // Passive Stats application (runs constantly regardless of actionbar visibility)
        const rpgData = getPlayerRpgData(player);
        applyPassiveStats(player, rpgData);

        if (hiddenBoards.get(player.name)) continue;

        let actionbarText = "";

        // Check if player earned XP recently (within last 3 seconds)
        try {
            const recentStr = player.getDynamicProperty("rpg_recent_xp");
            if (recentStr && typeof recentStr === 'string') {
                const recent = JSON.parse(recentStr);
                if (Date.now() - recent.time < 3000) {
                    const prof = recent.prof;
                    const lv = rpgData[prof].level;
                    const xp = rpgData[prof].xp;
                    const req = getXpRequired(lv);
                    const pct = req === Infinity ? "MAX" : Math.floor((xp / req) * 100) + "%";
                    const bar = req === Infinity ? "§b||||||||||||||||||||" : generateXpBar(xp, req);
                    actionbarText = `§e${prof.toUpperCase()} Lv.${lv} §f[${bar}§f] §a${pct}`;
                }
            }
        } catch(e) {}

        if (actionbarText !== "") {
            player.onScreenDisplay.setActionBar(actionbarText);
        } else {
            // Optional: clear action bar if it had something, but setting to empty string works
            player.onScreenDisplay.setActionBar("");
        }
    }
}, 20);

// Command handling via /scriptevent since chatSend is not in stable v1.13.0
// Players can type: /scriptevent ekonomi:hideboard or /scriptevent ekonomi:showboard

system.afterEvents.scriptEventReceive.subscribe((event) => {
    const id = event.id;
    const player = event.sourceEntity;
    const message = event.message;

    // We only process if it's from a player
    if (!player || player.typeId !== "minecraft:player") return;

    if (id === "ekonomi:hideboard") {
        hiddenBoards.set(player.name, true);
        player.onScreenDisplay.setActionBar(""); // Clear actionbar immediately
        player.sendMessage("§a[System] Actionbar disembunyikan. Ketik /scriptevent ekonomi:showboard untuk menampilkan kembali.");
    } else if (id === "ekonomi:showboard") {
        hiddenBoards.set(player.name, false);
        player.sendMessage("§a[System] Actionbar ditampilkan.");
    }
}, { namespaces: ["ekonomi"] });

// Give Shop Clock and Starter Pack on Spawn
world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;

    system.runTimeout(() => {
        // 1. Give Welcome Screen and Starter Pack if New Player
        if (!player.hasTag("has_received_guide")) {
            const form = new ActionFormData();
            form.title("§e§lWelcome to PRO SURVIVAL");
            form.body("§fSelamat datang di server! Server ini memiliki sistem Ekonomi, Gacha, dan RPG yang sangat seru.\n\nAmbil Starter Pack Anda di bawah ini untuk memulai petualangan!");
            form.button("§aAmbil Starter Pack\n§7Rp10.000 + 5 Roti", "textures/items/diamond");

            form.show(player).then(res => {
                player.addTag("has_received_guide"); // Prevent looping

                // Give Starter Pack items
                player.runCommandAsync("give @s minecraft:bread 5");
                const currentCoins = getScore(player, "dompet");
                setScore(player, "dompet", currentCoins + 10000);

                player.sendMessage("§a[System] Anda mendapatkan Starter Pack! Selamat bermain!");
                grantMenuClock(player);
            }).catch(e => {
                // If UI closed by accident, just give the items
                player.addTag("has_received_guide");
                player.runCommandAsync("give @s minecraft:bread 5");
                const currentCoins = getScore(player, "dompet");
                setScore(player, "dompet", currentCoins + 10000);
                grantMenuClock(player);
            });
        } else {
            // Returning player, just ensure they have the clock
            grantMenuClock(player);
        }
    }, 20);
});

function grantMenuClock(player) {
    const inventoryComponent = player.getComponent("inventory");
    if (!inventoryComponent) return;
    const inventory = inventoryComponent.container;
    if (!inventory) return;

    let hasShop = false;
    for (let i = 0; i < inventory.size; i++) {
        const item = inventory.getItem(i);
        if (item && item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") {
            hasShop = true;
            break;
        }
    }

    if (!hasShop) {
        const clock = new ItemStack("minecraft:clock", 1);
        clock.nameTag = "§e§lMenu Utama";

        if (typeof ItemLockMode !== 'undefined' && ItemLockMode.inventory) {
            clock.lockMode = ItemLockMode.inventory;
        } else {
            clock.lockMode = "inventory";
        }

        try {
            const enchantable = clock.getComponent("enchantable") || clock.getComponent("minecraft:enchantable");
            if (enchantable) {
                const unbreakingType = EnchantmentTypes.get("unbreaking");
                if (unbreakingType) enchantable.addEnchantment({ type: unbreakingType, level: 1 });
            }
        } catch (e) {}

        const slot8Item = inventory.getItem(8);
        if (slot8Item) {
            let emptySlot = -1;
            for (let i = 0; i < 36; i++) {
                if (!inventory.getItem(i)) {
                    emptySlot = i;
                    break;
                }
            }

            if (emptySlot !== -1) {
                inventory.setItem(emptySlot, slot8Item);
                inventory.setItem(8, clock);
            } else {
                player.sendMessage("§c[System] Inventory Anda penuh. Gagal memberikan Jam Menu Utama.");
            }
        } else {
            inventory.setItem(8, clock);
        }
    }
}

// Open Menu / Guidebook on Item Use
world.beforeEvents.itemUse.subscribe((event) => {
    const { itemStack, source } = event;
    if (itemStack.typeId === "minecraft:clock" && itemStack.nameTag === "§e§lMenu Utama") {
        event.cancel = true;
        system.run(() => {
            openMainMenu(source);
        });
    } else if (itemStack.typeId === "minecraft:book" && itemStack.nameTag === "§a§lBuku Panduan") {
        event.cancel = true;
        system.run(() => {
            openGuideBook(source);
        });
    }
});

// UI Logic - Guidebook
function openGuideBook(player) {
    const form = new ActionFormData();
    form.title("§a§lBuku Panduan Server");
    form.body("Selamat datang di Server Survival PRO!\n\n§e[1] Toko Dinamis & Jual Barang§f\nJam Menu Utama memutar 30 barang acak (ada barang OP juga!) setiap 1 menit. Jual hasil panen dan tambangmu untuk mendapatkan Rupiah.\n\n§e[2] RPG & Leveling§f\nDapatkan XP dengan nambang (Mining), nebang pohon (Woodcutting), dan bunuh monster (Slayer). Kumpulkan Skill Point (SP) untuk beli skill aktif di Menu RPG!\n\n§e[3] Gacha & Core§f\nTukar Rupiah menjadi Core. Gunakan Core untuk gacha Pasif Dewa permanen, atau gacha sihir kekuatan pada senjata utamamu!\n\n§e[4] Kelola Skill§f\nKamu maksimal hanya bisa memakai 2 Skill Aktif RPG dan 3 Pasif Gacha secara bersamaan. Atur kombinasimu di menu 'Kelola Semua Skill'.\n\nSelamat bermain dan semoga sukses!");
    form.button("§cTutup");
    form.show(player);
}

// UI Logic - Main Menu
export function openMainMenu(player) {
    const rankBadge = getPlayerRank(player).badge;
    const score = getScore(player, "dompet");
    const coreScore = getScore(player, "core");
    const online = world.getAllPlayers().length;

    const form = new ActionFormData();
    form.title("§1[ Server Menu Utama ]");
    form.body(`${rankBadge}\n§e§lDOMPET: §f${formatRupiah(score)}\n§b§lCORE: §f${coreScore}\n§aOnline: ${online} Pemain`);
    form.button("§e§lMenu Beli Barang\n§7Klik untuk beli kebutuhan", "textures/items/emerald");
    form.button("§a§lMenu Jual Barang\n§7Pindah & Filter Rupiah", "textures/items/gold_ingot");
    form.button("§b§lTransfer Rupiah\n§7Kirim Rupiah ke pemain lain", "textures/items/paper");
    form.button("§c§lSistem Bounty\n§7Pasang buronan", "textures/items/iron_sword");
    form.button("§6§lTop Sultan\n§7Peringkat pemain terkaya", "textures/items/diamond");
    form.button("§d§lMenu RPG & Skill\n§7Level & Kemampuan Aktif", "textures/items/diamond_sword");
    form.button("§5§lGacha & Core\n§7Sihir Senjata & Pasif Dewa", "textures/blocks/enchanting_table_top");
    form.button("§4§lTroll Pemain\n§7Berikan kejutan ke pemain lain (Rp1 Juta)", "textures/blocks/tnt_side");
    form.button("§6§lSistem Pangkat\n§7Tingkatkan Rank & Diskon", "textures/items/nether_star");
    form.button("§3§lTeleportasi & Home\n§7Navigasi Cepat (RTP)", "textures/items/compass_item");

    const unreadCount = getInbox(player.name).length;
    if (unreadCount > 0) {
        form.button(`§e§lPesan Masuk (${unreadCount})\n§7Ambil kiriman Rupiah`, "textures/items/book_writable");
    } else {
        form.button(`§7Pesan Masuk (0)\n§7Tidak ada pesan`, "textures/items/book_normal");
    }

    form.show(player).then((response) => {
        if (response.canceled) return;
        switch (response.selection) {
            case 0:
                openBuyMenu(player);
                break;
            case 1:
                openSellChoiceMenu(player);
                break;
            case 2:
                openTransferMenu(player);
                break;
            case 3:
                openBountyMenu(player);
                break;
            case 4:
                openTopKoinMenu(player);
                break;
            case 5:
                openRpgMenu(player);
                break;
            case 6:
                openGachaMenu(player);
                break;
            case 7:
                openTrollMenu(player);
                break;
            case 8:
                import("./rank_system.js").then(mod => mod.openRankMenu(player)).catch(()=>{});
                break;
            case 9:
                import("./teleport_system.js").then(mod => mod.openTeleportMenu(player)).catch(()=>{});
                break;
            case 10:
                openInboxMenu(player);
                break;
        }
    });
}

function openInboxMenu(player) {
    const inbox = getInbox(player.name);
    const form = new ActionFormData();
    form.title("§e[ Pesan Masuk ]");

    if (inbox.length === 0) {
        form.body(`${getUiHeader(player)}\n§7Kotak masuk Anda kosong.`);
        form.button("§cKembali");
        form.show(player).then(() => {
            system.runTimeout(() => { openMainMenu(player); }, 5);
        });
        return;
    }

    let totalClaimed = 0;
    let bodyText = `${getUiHeader(player)}\n§aPesan Baru:\n\n`;

    for (const msg of inbox) {
        const date = new Date(msg.timestamp);
        const timeStr = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        bodyText += `§f[${timeStr}] Dari §b${msg.sender}§f:\n§7"${msg.message}"\n§e+${formatRupiah(msg.amount)}\n\n`;
        totalClaimed += msg.amount;
    }

    bodyText += `§a--------------------\n§fTotal Diterima: §e${formatRupiah(totalClaimed)}`;
    form.body(bodyText);
    form.button(`§aKlaim Semua (${formatRupiah(totalClaimed)})`, "textures/items/emerald");
    form.button("§cTutup");

    form.show(player).then((res) => {
        if (res.canceled) return;
        if (res.selection === 0) {
            const currentCoins = getScore(player, "dompet");
            setScore(player, "dompet", currentCoins + totalClaimed);
            clearInbox(player.name);
            player.sendMessage(`§a[System] Berhasil mengklaim ${formatRupiah(totalClaimed)} dari Inbox!`);
        }
    });
}

function openRpgMenu(player) {
    const rpgData = getPlayerRpgData(player);
    const pRank = getPlayerRank(player);
    const form = new ActionFormData();
    form.title("§d[ Profil RPG & Skill ]");

    let statsStr = `Pangkat Anda: ${pRank.badge}\n\n`;
    statsStr += `§fSkill Points (SP): §e${rpgData.sp}\n`;
    statsStr += `\n§e⛏ Mining: §fLv.${rpgData.mining.level} §7(${rpgData.mining.xp}/${getXpRequired(rpgData.mining.level)} XP)\n`;
    statsStr += `§a🪓 Woodcutting: §fLv.${rpgData.woodcutting.level} §7(${rpgData.woodcutting.xp}/${getXpRequired(rpgData.woodcutting.level)} XP)\n`;
    statsStr += `§c⚔ Slayer: §fLv.${rpgData.slayer.level} §7(${rpgData.slayer.xp}/${getXpRequired(rpgData.slayer.level)} XP)\n`;

    statsStr += `\n§bAktif Skill RPG (Max 2): \n`;
    if (rpgData.equippedSkills.length === 0) {
        statsStr += "§7- Belum ada yang di-equip\n";
    } else {
        for (const skill of rpgData.equippedSkills) {
            statsStr += `§b- ${skill.toUpperCase()}\n`;
        }
    }

    statsStr += `\n§dPasif Gacha (Max 3): \n`;
    const eqPassives = rpgData.equippedGachaPassives || [];
    if (eqPassives.length === 0) {
        statsStr += "§7- Belum ada pasif dewa yang di-equip\n";
    } else {
        for (const passive of eqPassives) {
            statsStr += `§d- ${passive.toUpperCase()}\n`;
        }
    }

    const is3x3Enabled = rpgData.enable3x3 === true;
    statsStr += `\n§fStatus Mode 3x3: ${is3x3Enabled ? "§aNYALA" : "§cMATI"}`;

    form.body(statsStr);

    form.button("§eSkill Tree (Beli Skill)\n§7Tukar SP dengan Skill Baru");
    form.button("§aKelola Semua Skill\n§7Pasang Skill & Pasif Dewamu");
    form.button(`§bMode Hancur 3x3: ${is3x3Enabled ? "MATIKAN" : "NYALAKAN"}\n§7Mencegah hancurnya rumah`);
    form.button("§cKembali ke Menu Utama");

    form.show(player).then((res) => {
        if (res.canceled) return;
        if (res.selection === 0) openSkillTreeMenu(player);
        else if (res.selection === 1) openEquipUnifiedMenu(player);
        else if (res.selection === 2) {
            rpgData.enable3x3 = !is3x3Enabled;
            savePlayerRpgData(player, rpgData);
            player.sendMessage(`§a[RPG] Mode Hancur 3x3 sekarang ${rpgData.enable3x3 ? "NYALA" : "MATI"}.`);
            openRpgMenu(player);
        }
        else if (res.selection === 3) {
            system.runTimeout(() => { openMainMenu(player); }, 5);
        }
    });
}

const AVAILABLE_SKILLS = [
    { id: "ore_excavation", name: "⛏ Ore Excavation (Mining)", desc: "Hancurkan 3x3x3 blok batu/ore sekaligus saat fitur dinyalakan.", cost: 15 },
    { id: "lumberjacks_sweep", name: "🪓 Lumberjack's Sweep (Woodcutting)", desc: "Tebang 3x3x3 blok kayu sekaligus saat fitur dinyalakan.", cost: 15 },
    { id: "siphon_strike", name: "⚔ Siphon Strike (Slayer)", desc: "Menyembuhkan HP saat membunuh monster saat fitur dinyalakan.", cost: 20 }
];

function openSkillTreeMenu(player) {
    const rpgData = getPlayerRpgData(player);
    const form = new ActionFormData();
    form.title("§e[ Beli Skill ]");
    form.body(`Sisa Skill Point (SP): §e${rpgData.sp}\n\nPilih skill yang ingin kamu pelajari:`);

    for (const skill of AVAILABLE_SKILLS) {
        if (rpgData.unlockedSkills.includes(skill.id)) {
            form.button(`§a${skill.name}\n§7[Sudah Dimiliki]`);
        } else {
            form.button(`§c${skill.name}\n§7[Harga: ${skill.cost} SP]`);
        }
    }
    form.button("§cKembali");

    form.show(player).then((res) => {
        if (res.canceled) return;
        if (res.selection === AVAILABLE_SKILLS.length) {
            openRpgMenu(player);
            return;
        }

        const selected = AVAILABLE_SKILLS[res.selection];
        if (rpgData.unlockedSkills.includes(selected.id)) {
            player.sendMessage(`§c[RPG] Kamu sudah memiliki skill ${selected.name}!`);
            openSkillTreeMenu(player);
            return;
        }

        if (rpgData.sp < selected.cost) {
            player.sendMessage(`§c[RPG] Skill Point kamu tidak cukup untuk membeli ${selected.name}!`);
            openSkillTreeMenu(player);
            return;
        }

        // Purchase logic
        rpgData.sp -= selected.cost;
        rpgData.unlockedSkills.push(selected.id);
        savePlayerRpgData(player, rpgData);
        player.sendMessage(`§a[RPG] Berhasil mempelajari skill ${selected.name}!`);
        openSkillTreeMenu(player);
    });
}

function openEquipUnifiedMenu(player) {
    const rpgData = getPlayerRpgData(player);
    const unlockedActives = rpgData.unlockedSkills || [];
    const unlockedPassives = rpgData.unlockedGachaPassives || [];

    if (unlockedActives.length === 0 && unlockedPassives.length === 0) {
        player.sendMessage("§c[RPG] Kamu belum memiliki Skill Aktif (dari Level) maupun Pasif Dewa (dari Gacha)!");
        return;
    }

    const form = new ModalFormData();
    form.title("§a[ Kelola Skill & Pasif ]");

    // 1. Add toggles for Active Skills
    for (const skillId of unlockedActives) {
        const skillInfo = AVAILABLE_SKILLS.find(s => s.id === skillId);
        const isEquipped = rpgData.equippedSkills.includes(skillId);
        form.toggle(`§b(Aktif) §r${skillInfo ? skillInfo.name : skillId}`, isEquipped);
    }

    // 2. Add toggles for Gacha Passives
    for (const passiveId of unlockedPassives) {
        const passiveInfo = PASSIVE_POOL.find(p => p.id === passiveId);
        const isEquipped = (rpgData.equippedGachaPassives || []).includes(passiveId);
        form.toggle(`§d(Pasif) §r${passiveInfo ? passiveInfo.name : passiveId}`, isEquipped);
    }

    form.show(player).then((res) => {
        if (res.canceled) return;

        let newActiveEquipped = [];
        let newPassiveEquipped = [];

        let currentIndex = 0;

        // Parse Active Skills responses
        for (let i = 0; i < unlockedActives.length; i++) {
            if (res.formValues[currentIndex] === true) {
                newActiveEquipped.push(unlockedActives[i]);
            }
            currentIndex++;
        }

        // Parse Passive Skills responses
        for (let i = 0; i < unlockedPassives.length; i++) {
            if (res.formValues[currentIndex] === true) {
                newPassiveEquipped.push(unlockedPassives[i]);
            }
            currentIndex++;
        }

        let hasError = false;

        if (newActiveEquipped.length > 2) {
            player.sendMessage("§c[RPG] Kamu melebihi batas! Maksimal 2 Skill Aktif.");
            hasError = true;
        }

        if (newPassiveEquipped.length > 3) {
            player.sendMessage("§c[RPG] Kamu melebihi batas! Maksimal 3 Pasif Dewa.");
            hasError = true;
        }

        if (!hasError) {
            rpgData.equippedSkills = newActiveEquipped;
            rpgData.equippedGachaPassives = newPassiveEquipped;
            savePlayerRpgData(player, rpgData);
            player.sendMessage("§a[RPG] Susunan Skill & Pasif Dewa berhasil diperbarui!");
        }
    });
}


function openTransferMenu(player) {
    const form = new ActionFormData();
    form.title("§b[ Transfer Rupiah ]");
    form.body(`${getUiHeader(player)}\n§7Pilih metode pengiriman Rupiah Anda.`);
    form.button("§aPemain Online\n§7Pilih dari daftar pemain", "textures/ui/FriendsIcon");
    form.button("§cPemain Offline\n§7Ketik nama secara manual", "textures/ui/icon_multiplayer");
    form.button("§cKembali", "textures/ui/cancel");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) openOnlineTransferMenu(player);
        else if (res.selection === 1) openOfflineTransferMenu(player);
        else if (res.selection === 2) system.runTimeout(() => { openMainMenu(player); }, 5);
    });
}

function openOnlineTransferMenu(player) {
    const onlinePlayers = world.getAllPlayers().filter(p => p.name !== player.name);
    if (onlinePlayers.length === 0) {
        player.sendMessage("§c[System] Tidak ada pemain lain yang online saat ini.");
        return;
    }

    const playerNames = onlinePlayers.map(p => p.name);
    const form = new ModalFormData();
    form.title("§a[ Transfer Online ]");
    form.dropdown("Pilih Pemain:", playerNames);
    form.textField("Jumlah Rupiah:", "Contoh: 100000");
    form.textField("Pesan Tambahan (Opsional):", "Contoh: Bayar utang kemarin");

    form.show(player).then((response) => {
        if (response.canceled) return;

        const targetPlayerName = playerNames[response.formValues[0]];
        const amountStr = response.formValues[1];
        const amount = parseInt(amountStr);
        const customMessage = response.formValues[2].trim() || "Transfer dari teman";

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[System] Jumlah Rupiah tidak valid!");
            return;
        }

        const currentCoins = getScore(player, "dompet");
        if (currentCoins < amount) {
            player.sendMessage("§c[System] Saldo Rupiah Anda tidak mencukupi untuk transfer!");
            return;
        }

        setScore(player, "dompet", currentCoins - amount);

        const targetPlayer = world.getAllPlayers().find(p => p.name === targetPlayerName);
        if (targetPlayer) {
            const targetCoins = getScore(targetPlayer, "dompet");
            setScore(targetPlayer, "dompet", targetCoins + amount);
            player.sendMessage(`§a[System] Berhasil mentransfer §e${formatRupiah(amount)} §ake §b${targetPlayer.name}§a (Online).`);
            targetPlayer.sendMessage(`§a[System] Anda menerima §e${formatRupiah(amount)} §adari §b${player.name}§a.\nPesan: §7"${customMessage}"`);
        }
    });
}

function openOfflineTransferMenu(player) {
    const form = new ModalFormData();
    form.title("§c[ Transfer Offline ]");
    form.textField("Nama Pemain Target (Harus Akurat):", "Ketik nama lengkap pemain");
    form.textField("Jumlah Rupiah:", "Contoh: 100000");
    form.textField("Pesan Tambahan (Opsional):", "Contoh: Bayar utang kemarin");

    form.show(player).then((response) => {
        if (response.canceled) return;

        const targetPlayerName = response.formValues[0].trim();
        const amountStr = response.formValues[1];
        const amount = parseInt(amountStr);
        const customMessage = response.formValues[2].trim() || "Transfer dari teman";

        if (!targetPlayerName) {
            player.sendMessage("§c[System] Nama target tidak boleh kosong!");
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[System] Jumlah Rupiah tidak valid!");
            return;
        }

        const currentCoins = getScore(player, "dompet");
        if (currentCoins < amount) {
            player.sendMessage("§c[System] Saldo Rupiah Anda tidak mencukupi untuk transfer!");
            return;
        }

        setScore(player, "dompet", currentCoins - amount);

        const targetPlayer = world.getAllPlayers().find(p => p.name === targetPlayerName);

        if (targetPlayer) {
            const targetCoins = getScore(targetPlayer, "dompet");
            setScore(targetPlayer, "dompet", targetCoins + amount);
            player.sendMessage(`§a[System] Berhasil mentransfer §e${formatRupiah(amount)} §ake §b${targetPlayer.name}§a (Online).`);
            targetPlayer.sendMessage(`§a[System] Anda menerima §e${formatRupiah(amount)} §adari §b${player.name}§a.\nPesan: §7"${customMessage}"`);
        } else {
            sendToInbox(targetPlayerName, player.name, amount, customMessage);
            player.sendMessage(`§a[System] Berhasil mengirim §e${formatRupiah(amount)} §ake §b${targetPlayerName}§a (Offline).\nMereka akan menerimanya saat membuka Inbox.`);
        }
    });
}

// Helper functions to persist bounties across server restarts
function loadBounties() {
    try {
        const data = world.getDynamicProperty("active_bounties");
        if (data && typeof data === 'string') {
            return JSON.parse(data);
        }
    } catch(e) {}
    return {};
}

function saveBounties(bountiesObj) {
    world.setDynamicProperty("active_bounties", JSON.stringify(bountiesObj));
}

// Global variable to store active bounties loaded from persistent storage
// Structure: { "TargetPlayerName": { amount: number, setter: "SetterName" } }
let activeBounties = loadBounties();

function openBountyMenu(player) {
    const form = new ActionFormData();
    form.title("§c[ Sistem Bounty ]");
    form.button("§ePasang Bounty Baru\n§7Taruh harga buronan");
    form.button("§aLihat Daftar Bounty\n§7Cek siapa saja yang diincar");

    form.show(player).then((response) => {
        if (response.canceled) return;
        if (response.selection === 0) {
            openSetBountyMenu(player);
        } else if (response.selection === 1) {
            openListBountyMenu(player);
        }
    });
}

function openSetBountyMenu(player) {
    const onlinePlayers = world.getAllPlayers().filter(p => p.name !== player.name);
    if (onlinePlayers.length === 0) {
        player.sendMessage("§c[System] Tidak ada pemain lain yang online untuk dijadikan buronan.");
        return;
    }

    const playerNames = onlinePlayers.map(p => p.name);
    const form = new ModalFormData();
    form.title("§c[ Pasang Bounty ]");
    form.dropdown("Pilih Target Buronan:", playerNames);
    form.textField("Harga Bounty (Rupiah):", "Contoh: 500");

    form.show(player).then((response) => {
        if (response.canceled) return;

        const targetIndex = response.formValues[0];
        const amountStr = response.formValues[1];
        const amount = parseInt(amountStr);

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[System] Jumlah Rupiah tidak valid!");
            return;
        }

        const currentCoins = getScore(player, "dompet");
        if (currentCoins < amount) {
            player.sendMessage("§c[System] Saldo Rupiah Anda tidak mencukupi untuk memasang Bounty!");
            return;
        }

        const targetPlayerName = playerNames[targetIndex];

        // Deduct coins
        setScore(player, "dompet", currentCoins - amount);

        // Add to active bounties and save to world properties
        if (activeBounties[targetPlayerName]) {
            activeBounties[targetPlayerName].amount += amount;
        } else {
            activeBounties[targetPlayerName] = { amount: amount, setter: player.name };
        }
        saveBounties(activeBounties);

        world.sendMessage(`§c§l[BOUNTY] §r§e${player.name} §ftelah memasang harga buronan sebesar §a${formatRupiah(amount)} §funtuk kepala §c${targetPlayerName}§f!`);
    });
}

function openListBountyMenu(player) {
    const form = new ActionFormData();
    form.title("§c[ Daftar Buronan ]");

    const targets = Object.keys(activeBounties);
    if (targets.length === 0) {
        form.body("§7Saat ini tidak ada pemain yang menjadi buronan.");
    } else {
        let bodyText = "Daftar pemain yang sedang diincar:\n\n";
        for (const target of targets) {
            bodyText += `§c- ${target} §f(Harga: §e${formatRupiah(activeBounties[target].amount)}§f)\n`;
        }
        form.body(bodyText);
    }

    form.button("§aKembali");
    form.show(player).then(res => {
        if (!res.canceled) {
            openBountyMenu(player);
        }
    });
}

// RPG Triggers: Block Breaking (Mining & Woodcutting)
world.afterEvents.playerBreakBlock.subscribe((event) => {
    const { player, brokenBlockPermutation, block } = event;
    const typeId = brokenBlockPermutation.type.id;

    // Categorize block types
    const isWood = typeId.includes("log") || typeId.includes("stem") || typeId.includes("wood");
    const isOre = typeId.includes("ore") || typeId.includes("stone") || typeId.includes("basalt") || typeId.includes("granite") || typeId.includes("diorite") || typeId.includes("andesite") || typeId.includes("netherrack");

    const rpgData = getPlayerRpgData(player);

    if (isWood) {
        // Base XP: 5 per log
        addXp(player, "woodcutting", 5);

        // Active Skill: Lumberjack's Sweep
        if (rpgData.enable3x3 && rpgData.equippedSkills.includes("lumberjacks_sweep")) {
            if (canUseActiveSkill(player.name, "lumberjacks_sweep", 5000)) { // 5 second cooldown
                const broken = breakBlockArea(player, block, 1, typeId);
                if (broken > 0) {
                    player.sendMessage(`§a[Skill] §fLumberjack's Sweep aktif! Menghancurkan §e${broken} balok kayu§f.`);
                    addXp(player, "woodcutting", broken * 5);
                }
            } else {
                player.onScreenDisplay.setActionBar("§cSkill 'Lumberjack's Sweep' masih cooldown!");
            }
        }
    } else if (isOre) {
        // Base XP: 3 per stone/ore
        addXp(player, "mining", 3);

        // Active Skill: Ore Excavation
        if (rpgData.enable3x3 && rpgData.equippedSkills.includes("ore_excavation")) {
            if (canUseActiveSkill(player.name, "ore_excavation", 10000)) { // 10 second cooldown
                const broken = breakBlockArea(player, block, 1, typeId);
                if (broken > 0) {
                    player.sendMessage(`§a[Skill] §fOre Excavation aktif! Menghancurkan §e${broken} blok mineral§f.`);
                    addXp(player, "mining", broken * 3);
                }
            } else {
                player.onScreenDisplay.setActionBar("§cSkill 'Ore Excavation' masih cooldown!");
            }
        }
    }
});

// Cooldown Tracker for Slayer XP to prevent auto-spawner farming
const slayerXpCooldowns = new Map();

// Handle RPG Slayer XP and Bounty claims on Entity death
world.afterEvents.entityDie.subscribe((event) => {
    const deadEntity = event.deadEntity;
    const damageSource = event.damageSource;
    const killer = damageSource.damagingEntity;

    // Check if there is a killer and the killer is a player
    if (killer && killer.typeId === "minecraft:player") {
        const killerPlayer = killer;

        // RPG Slayer XP logic (For non-player entity kills)
        const isMonster = !deadEntity.typeId.includes("player") && !deadEntity.typeId.includes("item");
        if (isMonster) {
            // Check Slayer Cooldown (max 1 kill registered for XP per 1.5 seconds)
            const lastSlayerXp = slayerXpCooldowns.get(killerPlayer.name) || 0;
            if (Date.now() - lastSlayerXp > 1500) {
                // Base XP: 10 per mob kill
                addXp(killerPlayer, "slayer", 10);
                slayerXpCooldowns.set(killerPlayer.name, Date.now());

                const rpgData = getPlayerRpgData(killerPlayer);
                // Active Skill: Siphon Strike
                if (killerPlayer.isSneaking && rpgData.equippedSkills.includes("siphon_strike")) {
                    if (canUseActiveSkill(killerPlayer.name, "siphon_strike", 15000)) { // 15s cooldown
                        killerPlayer.addEffect("instant_health", 1, { amplifier: 0, showParticles: true });
                        killerPlayer.sendMessage("§a[Skill] §fSiphon Strike aktif! HP dipulihkan.");
                    }
                }
            }
        }

        // Check if the dead entity is a player for Bounty claims
        if (deadEntity.typeId === "minecraft:player") {
            const deadPlayerName = deadEntity.name;

            if (activeBounties[deadPlayerName] && killerPlayer.name !== deadPlayerName) {
                const bountyData = activeBounties[deadPlayerName];
                const bountyAmount = bountyData.amount;

                // Give reward to killer
                const killerCoins = getScore(killerPlayer, "dompet");
                setScore(killerPlayer, "dompet", killerCoins + bountyAmount);

                // Announce to world
                world.sendMessage(`§c§l[BOUNTY CLAIMED] §r§b${killerPlayer.name} §ftelah membunuh buronan §c${deadPlayerName} §fdan mendapatkan hadiah §e${formatRupiah(bountyAmount)}§f!`);

                // Remove bounty and save state
                delete activeBounties[deadPlayerName];
                saveBounties(activeBounties);
            }
        }
    }
});

function openTopKoinMenu(player) {
    const obj = world.scoreboard.getObjective("dompet");
    if (!obj) {
        player.sendMessage("§c[System] Scoreboard belum siap.");
        return;
    }

    try {
        const scores = obj.getScores();
        // Sort descending
        scores.sort((a, b) => b.score - a.score);

        const form = new ActionFormData();
        form.title("§6[ Peringkat Top Sultan ]");

        let bodyText = "§eTop 10 Pemain Terkaya Server:\n\n";

        const maxDisplay = Math.min(10, scores.length);
        for (let i = 0; i < maxDisplay; i++) {
            const scoreInfo = scores[i];
            const identity = scoreInfo.participant;
            // Only show Player identities (optional, but good for filtering fake players if any)
            if (identity.type === "Player") {
                bodyText += `§f${i + 1}. §b${identity.displayName} §7- §e${formatRupiah(scoreInfo.score)}\n`;
            } else {
                bodyText += `§f${i + 1}. §b${identity.displayName} §7- §e${formatRupiah(scoreInfo.score)}\n`;
            }
        }

        form.body(bodyText);
        form.button("§cTutup");
        form.show(player);
    } catch (e) {
        player.sendMessage("§c[System] Gagal mengambil data scoreboard.");
    }
}

function formatItemName(id) {
    const name = id.replace("minecraft:", "").replace(/_/g, " ");
    return name.replace(/\b\w/g, l => l.toUpperCase());
}

function getIconPath(id) {
    const cleanName = id.replace("minecraft:", "");
    // Simplistic heuristic for standard Bedrock vanilla paths
    if (cleanName.includes("log") || cleanName.includes("dirt") || cleanName.includes("sand") || cleanName.includes("stone") || cleanName.includes("block") || cleanName.includes("obsidian") || cleanName.includes("glass") || cleanName.includes("basalt") || cleanName.includes("ice") || cleanName.includes("ore")) {
        return `textures/blocks/${cleanName}`;
    }
    return `textures/items/${cleanName}`;
}

function openBuyMenu(player, page = 0) {
    const secondsLeft = Math.ceil((nextRefreshTime - Date.now()) / 1000);
    const snapshot = [...currentShopItems]; // Ensure stable array length

    const itemsPerPage = 10;
    const totalPages = Math.ceil(snapshot.length / itemsPerPage);
    const startIdx = page * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, snapshot.length);

    const pageItems = snapshot.slice(startIdx, endIdx);

    const form = new ActionFormData();
    form.title(`§1[ Toko Dinamis | Halaman ${page + 1}/${totalPages} ]`);
    form.body(`${getUiHeader(player)}\n§eSisa Waktu Refresh: §f${secondsLeft} detik\n§7Barang-barang ini akan berubah secara acak!`);

    for (const item of pageItems) {
        const displayName = formatItemName(item.id);
        const priceStr = formatRupiah(item.price);
        const iconPath = getIconPath(item.id);

        if (item.isOP) {
            form.button(`§d§l[OP] ${displayName}§r\n§e${priceStr}`, iconPath);
        } else {
            form.button(`§f${displayName}\n§e${priceStr}`, iconPath);
        }
    }

    // Pagination Controls
    if (page > 0) form.button("§e<- Halaman Sebelumnya");
    if (page < totalPages - 1) form.button("§eHalaman Selanjutnya ->");

    form.button("§cKembali");

    form.show(player).then((response) => {
        if (response.canceled) return;

        let selection = response.selection;

        // Item clicked
        if (selection < pageItems.length) {
            openBuyAmountMenu(player, pageItems[selection]);
            return;
        }

        // Handle control buttons
        selection -= pageItems.length;

        if (page > 0 && selection === 0) {
            openBuyMenu(player, page - 1);
            return;
        }

        if (page > 0) selection -= 1; // offset if previous button existed

        if (page < totalPages - 1 && selection === 0) {
            openBuyMenu(player, page + 1);
            return;
        }

        // Must be the "Kembali" button
        system.runTimeout(() => { openMainMenu(player); }, 5);
    });
}

function openBuyAmountMenu(player, itemData) {
    const form = new ModalFormData();
    const displayName = formatItemName(itemData.id);

    const pRank = getPlayerRank(player);
    const rawPrice = itemData.price;
    const discountedPrice = Math.floor(rawPrice * (1 - pRank.discount));

    let priceText = `§7Harga Normal: §c${formatRupiah(rawPrice)}§r\n`;
    if (pRank.discount > 0) {
        priceText += `§7Diskon Pangkat (${pRank.badge}§7): §a${formatRupiah(discountedPrice)}§r\n`;
    }

    form.title("§a[ Beli Barang ]");
    form.slider(`Tentukan jumlah §e${displayName} §fyang ingin dibeli:\n\n${priceText}`, 1, 64, 1, 1);

    form.show(player).then((response) => {
        if (response.canceled) return;

        const amount = Math.floor(response.formValues[0]);
        const finalCost = discountedPrice * amount;
        const currentCoins = getScore(player, "dompet");

        if (currentCoins >= finalCost) {
            const invComponent = player.getComponent("inventory");
            if (!invComponent || !invComponent.container) {
                player.sendMessage("§c[Shop] Gagal mengakses Inventory Anda!");
                return;
            }

            const maxStackSize = new ItemStack(itemData.id, 1).maxAmount;
            const slotsNeeded = Math.ceil(amount / maxStackSize);

            // Hard check to prevent dropping items as entities and lagging the server
            if (invComponent.container.emptySlotsCount < slotsNeeded) {
                player.sendMessage(`§c[Shop] Inventory Anda tidak memiliki cukup ruang! Diperlukan ${slotsNeeded} slot kosong.`);
                return;
            }

            setScore(player, "dompet", currentCoins - finalCost);

            let remaining = amount;
            while (remaining > 0) {
                let toGive = Math.min(remaining, maxStackSize);
                let stackToGive = new ItemStack(itemData.id, toGive);

                try {
                    invComponent.container.addItem(stackToGive);
                } catch(e) {}
                remaining -= toGive;
            }

            player.sendMessage(`§a[Shop] Berhasil membeli §e${amount}x ${displayName} §aseharga §e${formatRupiah(finalCost)}!`);
        } else {
            player.sendMessage(`§c[Shop] Saldo Rupiah Anda tidak mencukupi. Diperlukan ${formatRupiah(finalCost)}.`);
        }
    });
}

function processSellAll(player) {
    const inventoryComponent = player.getComponent("inventory");
    if (!inventoryComponent) return;
    const inventory = inventoryComponent.container;
    if (!inventory) return;

    let totalEarned = 0;
    let hasRejectedItems = false;
    let itemsSold = false;

    // Scan only main inventory (slots 0-35)
    for (let i = 0; i < 36; i++) {
        const item = inventory.getItem(i);
        if (!item) continue;

        // Ignore the Menu Utama clock and Guide Book
        if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") continue;
        if (item.typeId === "minecraft:book" && item.nameTag === "§a§lBuku Panduan") continue;

        const typeId = item.typeId;
        const basePrice = EconomyConfig.sellPrices[typeId];
        const sellPrice = basePrice !== undefined ? basePrice : 5; // 5 Rupiah fallback for all other items

        if (true) { // We now sell everything except clock/book
            // It's a valid rare item to sell
            const amount = item.amount;
            const itemValue = sellPrice * amount;
            totalEarned += itemValue;

            // Remove the item completely
            inventory.setItem(i, undefined);
            itemsSold = true;
        }
    }

    if (itemsSold) {
        const currentCoins = getScore(player, "dompet");
        setScore(player, "dompet", currentCoins + totalEarned);
        player.sendMessage(`§a[Shop] Berhasil menjual barang! Total didapat: §e${formatRupiah(totalEarned)}`);
    }

    if (hasRejectedItems) {
        player.dimension.runCommandAsync(`title "${player.name}" subtitle §fTerdapat barang biasa di dalam Inventory.`);
        player.dimension.runCommandAsync(`title "${player.name}" title §c§lDITOLAK`);
    } else if (!itemsSold) {
        player.sendMessage("§c[Shop] Tidak ada barang yang dapat dijual di dalam Inventory.");
    }
}

// Handle Custom Gacha Combat Effects on Entity Hit
world.afterEvents.entityHitEntity.subscribe((event) => {
    const attacker = event.damagingEntity;
    const target = event.hitEntity;

    if (!attacker || attacker.typeId !== "minecraft:player") return;
    if (!target) return;

    // Check main hand item for Gacha effects
    const invComponent = attacker.getComponent("inventory");
    if (!invComponent) return;
    const inv = invComponent.container;
    const selectedSlot = attacker.selectedSlotIndex;
    const item = inv.getItem(selectedSlot);

    if (!item) return;

    // Dynamic import to break circular logic locally
    import("./gacha_effects.js").then(mod => {
        const effect = mod.safeGetGachaEffect(item);
        if (!effect || typeof effect !== 'string' || effect === "none") return;

        executeWeaponEffect(effect, attacker, target);

        // Note: The safeGetGachaEffect sets the property back onto the item instance in memory,
        // but to permanently save it to the container if it was missing, we must rewrite it to the slot.
        // We do this silently here to ensure the player's weapon fully recovers its properties.
        inv.setItem(selectedSlot, item);
    }).catch(() => {});
});

function executeWeaponEffect(effect, attacker, target) {

    // Execute Custom Effect Logic
    if (effect === "poison_1") {
        if (Math.random() < 0.20) {
            target.addEffect("poison", 60, { amplifier: 0, showParticles: true });
        }
    } else if (effect === "frostbite") {
        if (Math.random() < 0.20) {
            target.addEffect("slowness", 60, { amplifier: 1, showParticles: true });
            target.addEffect("weakness", 60, { amplifier: 0, showParticles: true });
        }
    } else if (effect === "fire_aspect_x") {
        if (Math.random() < 0.15) {
            target.setOnFire(10, true);
        }
    } else if (effect === "abyssal_wither") {
        if (Math.random() < 0.10) {
            target.addEffect("wither", 60, { amplifier: 1, showParticles: true });
            target.dimension.spawnParticle("minecraft:crop_growth_area_emitter", target.location);
        }
    } else if (effect === "thunderous_smite") {
        if (Math.random() < 0.05) {
            target.dimension.spawnEntity("minecraft:lightning_bolt", target.location);
            target.addEffect("slowness", 40, { amplifier: 4, showParticles: false });
            attacker.sendMessage("§e§l[THUNDEROUS SMITE] §r§fKekuatan senjata Legendary menebas musuh!");
        }
    } else if (effect === "vampiric") {
        if (Math.random() < 0.10) {
            attacker.addEffect("instant_health", 1, { amplifier: 1, showParticles: true });
            attacker.dimension.spawnParticle("minecraft:heart_particle", attacker.location);
        }
    } else if (effect === "sonic_boom") {
        if (Math.random() < 0.15) {
            target.applyKnockback(target.location.x - attacker.location.x, target.location.z - attacker.location.z, 3.0, 0.5);
            target.dimension.spawnParticle("minecraft:knockback_roar_particle", target.location);
        }
    } else if (effect === "blindness_strike") {
        if (Math.random() < 0.15) {
            target.addEffect("blindness", 60, { amplifier: 0, showParticles: true });
        }
    } else if (effect === "levitation_hit") {
        if (Math.random() < 0.10) {
            target.addEffect("levitation", 40, { amplifier: 9, showParticles: true });
        }
    } else if (effect === "explosive_blow") {
        if (Math.random() < 0.05) {
            target.dimension.runCommandAsync(`particle minecraft:huge_explosion_emitter ${target.location.x} ${target.location.y} ${target.location.z}`);
            target.dimension.runCommandAsync(`playsound random.explode @a[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=10] 1.0 1.0`);
            // Custom damage bypass trick
            target.addEffect("instant_damage", 1, { amplifier: 1, showParticles: false });
        }
    } else if (effect === "phantom_blade") {
        if (Math.random() < 0.10) {
            // Sweep attack approximation
            target.dimension.runCommandAsync(`damage @e[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=3,rm=0.1] 5 entity_attack entity "${attacker.id}"`);
            target.dimension.spawnParticle("minecraft:sweep_attack_emitter", target.location);
        }
    } else if (effect === "void_strike") {
        if (Math.random() < 0.05) {
            target.addEffect("fatal_poison", 100, { amplifier: 1, showParticles: true }); // Fatal poison eats to 0 HP
            attacker.sendMessage("§5§l[VOID STRIKE] §r§fEnergi kehidupan target terserap!");
        }
    }
}

// Global cooldown map for Second Wind
const secondWindCooldowns = new Map();
export const combatLogMap = new Map();

// Hook into entityHurt (which triggers after damage is calculated but before death)
world.afterEvents.entityHurt.subscribe((event) => {
    const target = event.hurtEntity;
    if (!target || target.typeId !== "minecraft:player") return;

    // Tag player in combat to prevent teleport logging
    combatLogMap.set(target.name, Date.now());

    const hpComp = target.getComponent("health");
    if (!hpComp) return;

    // Check if the hit was lethal
    if (hpComp.currentValue <= 0) {
        const rpgData = getPlayerRpgData(target);
        const passives = rpgData.equippedGachaPassives || [];

        if (passives.includes("second_wind")) {
            const lastProc = secondWindCooldowns.get(target.name) || 0;
            // 10 Minute Cooldown (600000 ms)
            if (Date.now() - lastProc > 600000) {
                secondWindCooldowns.set(target.name, Date.now());

                // Revive player to 50% HP
                hpComp.setCurrentValue(Math.max(1, Math.floor(hpComp.effectiveMax / 2)));

                // Give clutch buffs
                target.addEffect("resistance", 100, { amplifier: 2, showParticles: true }); // Res 3 for 5s
                target.addEffect("regeneration", 100, { amplifier: 2, showParticles: true }); // Regen 3 for 5s
                target.addEffect("absorption", 100, { amplifier: 1, showParticles: true }); // Absorption 2 for 5s

                // VFX
                target.dimension.spawnParticle("minecraft:totem_particle", target.location);
                target.dimension.runCommandAsync(`playsound random.totem @a[x=${target.location.x},y=${target.location.y},z=${target.location.z},r=15]`);

                target.sendMessage("§e§l[SECOND WIND] §r§fKekuatan Gacha menyelamatkan nyawa Anda dari kematian fatal!");
            }
        }
    }
});

function openSellChoiceMenu(player) {
    const form = new ActionFormData();
    form.title("§1[ Menu Jual Barang ]");
    form.body(`${getUiHeader(player)}\n§7Pilih metode penjualan barang Anda.`);
    form.button("§aJual Semua (Auto-Scan)\n§7Otomatis jual semua barang", "textures/ui/refresh_light");
    form.button("§ePilih Manual (Manual-Scan)\n§7Pilih barang yang ingin dijual", "textures/ui/inventory_icon");
    form.button("§cKembali ke Menu Utama", "textures/ui/cancel");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) {
            processSellAll(player);
        } else if (res.selection === 1) {
            openManualSellMenu(player);
        } else if (res.selection === 2) {
            system.runTimeout(() => { openMainMenu(player); }, 5);
        }
    });
}

function openManualSellMenu(player) {
    const inventoryComponent = player.getComponent("inventory");
    if (!inventoryComponent) return;
    const inventory = inventoryComponent.container;
    if (!inventory) return;

    // Aggregate sellable items from main inventory (0-35)
    // We group them by typeId to make the UI cleaner
    const sellableMap = new Map();

    for (let i = 0; i < 36; i++) {
        const item = inventory.getItem(i);
        if (!item) continue;

        if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") continue;
        if (item.typeId === "minecraft:book" && item.nameTag === "§a§lBuku Panduan") continue;

        const basePrice = EconomyConfig.sellPrices[item.typeId];
        const sellPrice = basePrice !== undefined ? basePrice : 5;
        const currentAmount = sellableMap.get(item.typeId) || 0;
        sellableMap.set(item.typeId, currentAmount + item.amount);
    }

    if (sellableMap.size === 0) {
        player.sendMessage("§c[Shop] Tidak ada barang yang dapat dijual di dalam Inventory.");
        return;
    }

    const form = new ModalFormData();
    form.title("§1[ Jual Manual ]");

    // Convert map to array for predictable iteration
    const sellableList = Array.from(sellableMap.entries()).map(([typeId, amount]) => {
        const base = EconomyConfig.sellPrices[typeId];
        return { typeId, totalAmount: amount, price: base !== undefined ? base : 5 };
    });

    for (const data of sellableList) {
        const displayName = formatItemName(data.typeId);
        form.slider(`Jual §e${displayName} §f(Maks: ${data.totalAmount})\n§7Harga Satuan: ${formatRupiah(data.price)}`, 0, data.totalAmount, 1, 0);
    }

    form.show(player).then(res => {
        if (res.canceled) return;

        let totalEarned = 0;
        let itemsSold = false;

        // Process deduction
        for (let i = 0; i < sellableList.length; i++) {
            const amountToSell = Math.floor(res.formValues[i]);
            if (amountToSell > 0) {
                const data = sellableList[i];
                totalEarned += (amountToSell * data.price);
                itemsSold = true;

                // Deduct exactly 'amountToSell' from the inventory
                let remainingToRemove = amountToSell;
                for (let slot = 0; slot < 36; slot++) {
                    if (remainingToRemove <= 0) break;

                    const item = inventory.getItem(slot);
                    if (item && item.typeId === data.typeId) {
                        // Ensure we don't accidentally remove the Menu Utama if it shares an ID (unlikely, but safe)
                        if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") continue;
                        if (item.typeId === "minecraft:book" && item.nameTag === "§a§lBuku Panduan") continue;

                        if (item.amount <= remainingToRemove) {
                            remainingToRemove -= item.amount;
                            inventory.setItem(slot, undefined); // clear slot
                        } else {
                            item.amount -= remainingToRemove;
                            inventory.setItem(slot, item);
                            remainingToRemove = 0;
                        }
                    }
                }
            }
        }

        if (itemsSold) {
            const currentCoins = getScore(player, "dompet");
            setScore(player, "dompet", currentCoins + totalEarned);
            player.sendMessage(`§a[Shop] Berhasil menjual barang pilihan! Total didapat: §e${formatRupiah(totalEarned)}`);
        } else {
            player.sendMessage("§e[Shop] Anda membatalkan penjualan (0 item dipilih).");
        }
    });
}
