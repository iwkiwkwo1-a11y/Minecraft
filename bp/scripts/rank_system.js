import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { formatRupiah, getUiHeader } from "./utils.js";

// Rank definitions from lowest (index 0) to highest
export const RANKS = [
    { id: 0, badge: "§7[Warga Biasa]", shortBadge: "§7[W]", name: "Warga Biasa", cost: 0, discount: 0 },
    { id: 1, badge: "§a[Pedagang]", shortBadge: "§a[P]", name: "Pedagang", cost: 5000000, discount: 0.05 }, // 5M cost, 5% discount
    { id: 2, badge: "§b[Juragan]", shortBadge: "§b[J]", name: "Juragan", cost: 25000000, discount: 0.10 }, // 25M cost, 10% discount
    { id: 3, badge: "§d[Miliarder]", shortBadge: "§d[M]", name: "Miliarder", cost: 100000000, discount: 0.15 }, // 100M cost, 15% discount
    { id: 4, badge: "§e§l[SULTAN]", shortBadge: "§e§l[S]", name: "Sultan", cost: 500000000, discount: 0.20 }, // 500M cost, 20% discount
    { id: 5, badge: "§6§l[KONGLOMERAT]", shortBadge: "§6§l[K]", name: "Konglomerat", cost: 2000000000, discount: 0.25 } // 2B cost, 25% discount
];

export function getPlayerRank(player) {
    try {
        const rankId = player.getDynamicProperty("player_rank");
        if (typeof rankId === 'number' && rankId < RANKS.length) {
            return RANKS[rankId];
        }
    } catch(e) {}
    return RANKS[0]; // Default
}

export function setPlayerRank(player, rankId) {
    try {
        player.setDynamicProperty("player_rank", rankId);
    } catch(e) {}
}

export function openRankMenu(player) {
    const currentRank = getPlayerRank(player);
    const form = new ActionFormData();

    form.title("§6[ Sistem Pangkat ]");

    let bodyText = getUiHeader(player);
    bodyText += `Diskon Toko Dinamis: §a${currentRank.discount * 100}%§r\n\n`;

    const nextRank = RANKS[currentRank.id + 1];

    if (nextRank) {
        bodyText += `Pangkat Selanjutnya: ${nextRank.badge}\n`;
        bodyText += `Harga Naik Pangkat: §e${formatRupiah(nextRank.cost)}§r\n`;
        bodyText += `Diskon Toko Selanjutnya: §a${nextRank.discount * 100}%§r\n`;

        form.body(bodyText);
        form.button(`§aNaik Pangkat\n§7Harga: ${formatRupiah(nextRank.cost)}`);
    } else {
        bodyText += `§e§lAnda telah mencapai pangkat tertinggi di server ini!§r\nNikmati diskon maksimum dan pamerkan badge Anda.`;
        form.body(bodyText);
    }

    form.button("§cKembali ke Menu Utama");

    form.show(player).then(res => {
        if (res.canceled) return;

        if (nextRank && res.selection === 0) {
            processRankUpgrade(player, currentRank, nextRank);
        } else {
            // "Kembali ke Menu Utama" button was clicked (either index 1 if nextRank exists, or index 0 if maxed)
            import("./main.js").then(mod => {
                system.runTimeout(() => { mod.openMainMenu(player); }, 5);
            }).catch(()=>{});
        }
    });
}

function processRankUpgrade(player, currentRank, nextRank) {
    // Dynamic import scoreboard helper to avoid direct coupling
    const objDompet = world.scoreboard.getObjective("dompet");
    if (!objDompet) return;

    let currentRupiah = 0;
    try { currentRupiah = objDompet.getScore(player) || 0; } catch(e) {}

    if (currentRupiah >= nextRank.cost) {
        objDompet.setScore(player, currentRupiah - nextRank.cost);
        setPlayerRank(player, nextRank.id);

        player.dimension.runCommandAsync(`playsound random.levelup @a[x=${Math.floor(player.location.x)},y=${Math.floor(player.location.y)},z=${Math.floor(player.location.z)},r=10]`);
        player.dimension.runCommandAsync(`summon fireworks_rocket ${Math.floor(player.location.x)} ${Math.floor(player.location.y + 1)} ${Math.floor(player.location.z)}`);

        world.sendMessage(`§6§l[RANK UP] §r§fSelamat! §b${player.name} §ftelah naik pangkat menjadi ${nextRank.badge}§f!`);
    } else {
        player.sendMessage(`§c[System] Saldo Rupiah Anda tidak mencukupi untuk naik pangkat. Diperlukan ${formatRupiah(nextRank.cost)}.`);
    }
}
