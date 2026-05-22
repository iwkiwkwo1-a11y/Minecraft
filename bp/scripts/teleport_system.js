import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { formatRupiah, getUiHeader } from "./utils.js";
import { getPlayerRank } from "./rank_system.js";

const RTP_COST = 5000;
const RTP_RANGE = 5000;

export function getPlayerHomes(player) {
    try {
        const homesStr = player.getDynamicProperty("player_homes");
        if (homesStr && typeof homesStr === "string") {
            return JSON.parse(homesStr);
        }
    } catch(e) {}
    return [];
}

export function savePlayerHomes(player, homesArray) {
    try {
        player.setDynamicProperty("player_homes", JSON.stringify(homesArray));
    } catch(e) {}
}

export function getMaxHomes(player) {
    const rank = getPlayerRank(player);
    // Warga Biasa = 1, Pedagang = 2, Juragan = 3, Miliarder = 4, Sultan/Konglomerat = 5
    if (rank.id === 0) return 1;
    if (rank.id === 1) return 2;
    if (rank.id === 2) return 3;
    if (rank.id === 3) return 4;
    return 5;
}

import { combatLogMap } from "./main.js";

export function openTeleportMenu(player) {
    // Prevent teleporting during combat (15 second cooldown)
    const lastHit = combatLogMap.get(player.name) || 0;
    if (Date.now() - lastHit < 15000) {
        const timeLeft = Math.ceil((15000 - (Date.now() - lastHit)) / 1000);
        player.sendMessage(`§c[Teleport] Anda sedang dalam pertarungan! Tunggu ${timeLeft} detik untuk teleportasi.`);
        return;
    }

    const form = new ActionFormData();
    form.title("§3[ Teleport & Home ]");
    form.body(`${getUiHeader(player)}\n§7Pilih destinasi teleportasi Anda.`);

    form.button(`§dRandom Teleport (RTP)\n§7Perjalanan acak (Rp${RTP_COST.toLocaleString("id-ID")})`, "textures/items/ender_pearl");
    form.button("§aManajemen Home\n§7Simpan & Kunjungi markas", "textures/items/bed_red");
    form.button("§cKembali ke Menu Utama", "textures/ui/cancel");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) executeRTP(player);
        else if (res.selection === 1) openHomeMenu(player);
        else if (res.selection === 2) {
            import("./main.js").then(mod => {
                system.runTimeout(() => { mod.openMainMenu(player); }, 5);
            }).catch(()=>{});
        }
    });
}

function executeRTP(player) {
    const objDompet = world.scoreboard.getObjective("dompet");
    let currentRupiah = 0;
    try { if (objDompet) currentRupiah = objDompet.getScore(player) || 0; } catch(e) {}

    if (currentRupiah < RTP_COST) {
        player.sendMessage(`§c[Teleport] Saldo Rupiah Anda tidak mencukupi untuk RTP. Diperlukan ${formatRupiah(RTP_COST)}.`);
        return;
    }

    objDompet.setScore(player, currentRupiah - RTP_COST);

    // Calculate random X and Z
    const rx = Math.floor(Math.random() * (RTP_RANGE * 2)) - RTP_RANGE;
    const rz = Math.floor(Math.random() * (RTP_RANGE * 2)) - RTP_RANGE;

    player.sendMessage("§e[Teleport] Mencari lokasi yang aman...");

    // We run a sequence of commands to find the topmost block safely
    // Due to script API limitations finding highest block asynchronously, we use spreadplay/tp tricks
    player.dimension.runCommandAsync(`execute as "${player.name}" at @s run spreadplayers ${rx} ${rz} 0 1 @s`);
    player.sendMessage(`§a[Teleport] Anda telah diteleportasi secara acak! Saldo dipotong ${formatRupiah(RTP_COST)}.`);
    player.dimension.runCommandAsync(`playsound portal.travel @a[x=${Math.floor(player.location.x)},y=${Math.floor(player.location.y)},z=${Math.floor(player.location.z)},r=10]`);
}

function openHomeMenu(player) {
    const homes = getPlayerHomes(player);
    const maxHomes = getMaxHomes(player);

    const form = new ActionFormData();
    form.title("§a[ Manajemen Home ]");
    form.body(`${getUiHeader(player)}\n§fHome Tersimpan: §e${homes.length} / ${maxHomes}\n§7Catatan: Semakin tinggi Pangkat Anda, semakin banyak Home yang bisa disimpan.`);

    form.button("§eSimpan Lokasi Saat Ini\n§7Buat Home baru", "textures/items/map_empty");

    for (const h of homes) {
        form.button(`§bPergi ke: ${h.name}\n§7X:${Math.floor(h.x)} Y:${Math.floor(h.y)} Z:${Math.floor(h.z)}`, "textures/items/compass_item");
    }

    form.button("§cKembali");

    form.show(player).then(res => {
        if (res.canceled) return;

        if (res.selection === 0) {
            openSetHomeMenu(player, homes, maxHomes);
        } else if (res.selection === homes.length + 1) {
            openTeleportMenu(player);
        } else {
            const targetHome = homes[res.selection - 1];
            executeTeleportToHome(player, targetHome);
        }
    });
}

function openSetHomeMenu(player, homes, maxHomes) {
    if (homes.length >= maxHomes) {
        player.sendMessage(`§c[Teleport] Kapasitas Home Anda sudah penuh (${maxHomes}/${maxHomes})! Tingkatkan Pangkat untuk menambah slot.`);
        return;
    }

    const form = new ModalFormData();
    form.title("§e[ Simpan Home ]");
    form.textField("Nama Home Baru:", "Contoh: Base Utama, Tambang Emas");

    form.show(player).then(res => {
        if (res.canceled) return;

        const homeName = res.formValues[0].trim();
        if (!homeName) {
            player.sendMessage("§c[Teleport] Nama Home tidak boleh kosong!");
            return;
        }

        // Prevent duplicate names
        if (homes.find(h => h.name.toLowerCase() === homeName.toLowerCase())) {
            player.sendMessage("§c[Teleport] Anda sudah memiliki Home dengan nama tersebut!");
            return;
        }

        homes.push({
            name: homeName,
            x: player.location.x,
            y: player.location.y,
            z: player.location.z,
            dimensionId: player.dimension.id
        });

        savePlayerHomes(player, homes);
        player.sendMessage(`§a[Teleport] Berhasil menyimpan lokasi ini sebagai Home: §e${homeName}§a.`);
    });
}

function executeTeleportToHome(player, homeObj) {
    if (player.dimension.id !== homeObj.dimensionId) {
        player.sendMessage("§c[Teleport] Gagal teleportasi. Home ini berada di dimensi lain!");
        return;
    }

    // Teleport API execution
    player.teleport({ x: homeObj.x, y: homeObj.y, z: homeObj.z }, { dimension: player.dimension });
    player.sendMessage(`§a[Teleport] Anda telah kembali ke Home: §e${homeObj.name}§a.`);
    player.dimension.runCommandAsync(`playsound portal.travel @a[x=${Math.floor(homeObj.x)},y=${Math.floor(homeObj.y)},z=${Math.floor(homeObj.z)},r=10]`);
}
