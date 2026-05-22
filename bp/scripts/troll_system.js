import { world, system } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { formatRupiah } from "./utils.js";

const TROLL_COST = 1000000;
const TROLL_COOLDOWN_MS = 300000; // 5 Minutes
const targetCooldowns = new Map();

const TROLL_LIST = [
    "§aCreeper Surprise",
    "§cFake Nuke",
    "§8Jumpscare Warden",
    "§bTerbang Bebas",
    "§eHujan Kelelawar"
];

// Re-implement getScore for self-containment
function getScore(player, objectiveId) {
    const obj = world.scoreboard.getObjective(objectiveId);
    if (!obj) return 0;
    try {
        return obj.getScore(player) || 0;
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

export function openTrollMenu(player) {
    const onlinePlayers = world.getAllPlayers().filter(p => p.name !== player.name);
    if (onlinePlayers.length === 0) {
        player.sendMessage("§c[Troll] Tidak ada pemain lain yang online untuk dijaili.");
        return;
    }

    const playerNames = onlinePlayers.map(p => p.name);
    const form = new ModalFormData();
    form.title("§c[ Troll Pemain (Anonim) ]");
    form.dropdown(`Pilih Target (Biaya: ${formatRupiah(TROLL_COST)}):\n§7Mereka tidak akan tahu siapa pelakunya!`, playerNames);

    form.show(player).then(res => {
        if (res.canceled) return;

        const targetIndex = res.formValues[0];
        const targetPlayerName = playerNames[targetIndex];

        const currentRupiah = getScore(player, "dompet");
        if (currentRupiah < TROLL_COST) {
            player.sendMessage(`§c[Troll] Saldo Rupiah Anda tidak mencukupi! Butuh ${formatRupiah(TROLL_COST)}.`);
            return;
        }

        const lastTrolled = targetCooldowns.get(targetPlayerName) || 0;
        if (Date.now() - lastTrolled < TROLL_COOLDOWN_MS) {
            const timeLeft = Math.ceil((TROLL_COOLDOWN_MS - (Date.now() - lastTrolled)) / 1000 / 60);
            player.sendMessage(`§c[Troll] Pemain ini baru saja kena jail! Tunggu ${timeLeft} menit lagi.`);
            return;
        }

        const targetPlayer = world.getAllPlayers().find(p => p.name === targetPlayerName);
        if (!targetPlayer) {
            player.sendMessage("§c[Troll] Pemain target tidak ditemukan atau sudah offline.");
            return;
        }

        // Deduct money & Apply Cooldown
        setScore(player, "dompet", currentRupiah - TROLL_COST);
        targetCooldowns.set(targetPlayerName, Date.now());

        player.sendMessage(`§a[Troll] Pembayaran berhasil! Menyiapkan kejahilan untuk §c${targetPlayerName}§a...`);
        startTrollRoulette(targetPlayer);
    });
}

function startTrollRoulette(targetPlayer) {
    let ticks = 0;
    const maxTicks = 60; // 3 seconds total (20 ticks/sec)

    const rouletteId = system.runInterval(() => {
        // Stop if player leaves mid-roulette
        if (!targetPlayer.isValid()) {
            system.clearRun(rouletteId);
            return;
        }

        // Display random troll name rapidly
        const randomTroll = TROLL_LIST[Math.floor(Math.random() * TROLL_LIST.length)];
        targetPlayer.dimension.runCommandAsync(`title "${targetPlayer.name}" subtitle ${randomTroll}`);
        targetPlayer.dimension.runCommandAsync(`title "${targetPlayer.name}" title §e§kMengacak Jail...`);
        targetPlayer.dimension.runCommandAsync(`playsound note.harp @a[x=${Math.floor(targetPlayer.location.x)},y=${Math.floor(targetPlayer.location.y)},z=${Math.floor(targetPlayer.location.z)},r=5]`);

        ticks += 2; // Run every 2 ticks (approx 0.1s)

        if (ticks >= maxTicks) {
            system.clearRun(rouletteId);
            const finalTroll = Math.floor(Math.random() * TROLL_LIST.length);
            executeTroll(targetPlayer, finalTroll);
        }
    }, 2);
}

function executeTroll(targetPlayer, trollIndex) {
    if (!targetPlayer.isValid()) return;

    const trollName = TROLL_LIST[trollIndex];
    const px = Math.floor(targetPlayer.location.x);
    const py = Math.floor(targetPlayer.location.y);
    const pz = Math.floor(targetPlayer.location.z);
    const dim = targetPlayer.dimension;

    // Announce the final result
    dim.runCommandAsync(`title "${targetPlayer.name}" subtitle ${trollName}`);
    dim.runCommandAsync(`title "${targetPlayer.name}" title §c§lKENA JAIL!`);
    dim.runCommandAsync(`playsound random.anvil_land @a[x=${px},y=${py},z=${pz},r=5]`);

    // Delay 1 second before applying effect
    system.runTimeout(() => {
        if (!targetPlayer.isValid()) return;

        if (trollIndex === 0) { // Creeper Surprise
            dim.runCommandAsync(`execute as "${targetPlayer.name}" at @s run summon creeper ^ ^ ^-2`);
            dim.runCommandAsync(`playsound creeper.primed @a[x=${px},y=${py},z=${pz},r=5]`);

        } else if (trollIndex === 1) { // Fake Nuke
            dim.runCommandAsync(`playsound random.explode @a[x=${px},y=${py},z=${pz},r=10] 1.0 0.5`);
            dim.runCommandAsync(`particle minecraft:huge_explosion_emitter ${px} ${py} ${pz}`);
            targetPlayer.addEffect("blindness", 60, { amplifier: 0, showParticles: false });

        } else if (trollIndex === 2) { // Jumpscare Warden
            targetPlayer.addEffect("blindness", 100, { amplifier: 0, showParticles: false });
            targetPlayer.addEffect("slowness", 100, { amplifier: 3, showParticles: false });
            dim.runCommandAsync(`playsound mob.warden.roar @a[x=${px},y=${py},z=${pz},r=5]`);

        } else if (trollIndex === 3) { // Terbang Bebas
            targetPlayer.addEffect("levitation", 60, { amplifier: 4, showParticles: false });
            // Add slow falling right after levitation ends (60 ticks) to prevent unfair deaths
            system.runTimeout(() => {
                if (targetPlayer.isValid()) {
                    targetPlayer.addEffect("slow_falling", 100, { amplifier: 0, showParticles: true });
                }
            }, 60);

        } else if (trollIndex === 4) { // Hujan Kelelawar
            for (let i = 0; i < 15; i++) {
                dim.runCommandAsync(`summon bat ${px} ${py + 2} ${pz}`);
            }
        }
    }, 20);
}
