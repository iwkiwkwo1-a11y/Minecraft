import { world, system, ItemStack, GameMode, ItemLockMode } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { formatRupiah, getScore, setScore, sendToInbox } from "./utils.js";
import { EconomyConfig } from "./economy_config.js";

const CHEST_PRICE = 1000000;
const DB_KEY = "autosell_chests";

// Load database
function getDb() {
    try {
        const raw = world.getDynamicProperty(DB_KEY);
        if (raw && typeof raw === 'string') {
            return JSON.parse(raw);
        }
    } catch(e) {}
    return [];
}

function saveDb(data) {
    world.setDynamicProperty(DB_KEY, JSON.stringify(data));
}

// UI Menu
export function openAutoSellMenu(player) {
    const form = new ActionFormData();
    form.title("§1[ Mesin Auto-Sell ]");
    form.body(`Mesin ini akan otomatis menjual barang yang masuk ke dalamnya (misal dari Hopper) dan mengirimkan Rupiah ke dompet Anda, bahkan saat Anda Offline!\n\n§eHarga: ${formatRupiah(CHEST_PRICE)}`);
    form.button("§aBeli Chest Auto-Sell\n§7Rp 1 Juta", "textures/blocks/chest_front");
    form.button("§cKembali", "textures/ui/cancel");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) {
            buyAutoSellChest(player);
        } else {
            import("./main.js").then(mod => mod.openMainMenu(player)).catch(()=>{});
        }
    });
}

function buyAutoSellChest(player) {
    const currentCoins = getScore(player, "dompet");
    if (currentCoins < CHEST_PRICE) {
        player.sendMessage(`§c[Shop] Rupiah tidak cukup! Butuh ${formatRupiah(CHEST_PRICE)}`);
        return;
    }

    const inventory = player.getComponent("inventory").container;
    if (inventory.emptySlotsCount === 0) {
        player.sendMessage("§c[Shop] Inventory Anda penuh! Kosongkan slot terlebih dahulu.");
        return;
    }

    setScore(player, "dompet", currentCoins - CHEST_PRICE);

    const chestItem = new ItemStack("minecraft:chest", 1);
    chestItem.nameTag = "§a§lChest Auto-Sell";

    inventory.addItem(chestItem);
    player.sendMessage("§a[Shop] Berhasil membeli Chest Auto-Sell! Silakan taruh di lantai dan sambungkan dengan Hopper.");
}

// Detect placing the custom chest
world.afterEvents.playerPlaceBlock.subscribe((event) => {
    const player = event.player;
    const block = event.block;

    // We need to check if the player held the custom item right after placing.
    // Minecraft API doesn't easily expose the exact item used to place in afterEvents directly unless we check inventory or assume from hand.
    // However, beforeEvents.itemUseOn is more reliable for custom block items.
});

// Since playerPlaceBlock doesn't easily give the nameTag of the item used, we'll use itemUseOn to intercept.
world.beforeEvents.itemUseOn.subscribe((event) => {
    const item = event.itemStack;
    if (item && item.typeId === "minecraft:chest" && item.nameTag === "§a§lChest Auto-Sell") {
        const player = event.source;
        const block = event.block;
        const face = event.blockFace;

        // Calculate placement position
        let x = block.x;
        let y = block.y;
        let z = block.z;

        if (face === "Up") y++;
        else if (face === "Down") y--;
        else if (face === "North") z--;
        else if (face === "South") z++;
        else if (face === "West") x--;
        else if (face === "East") x++;

        const dim = player.dimension;
        const targetBlock = dim.getBlock({x,y,z});

        if (!targetBlock || (!targetBlock.isAir && !targetBlock.isLiquid)) {
           return;
        }

        // Cancel default placement to handle it manually
        event.cancel = true;

        system.run(() => {
            // Remove item from inventory (1 count)
            if (player.getGameMode() !== GameMode.creative) {
                const eq = player.getComponent("equippable");
                if (eq) {
                   const mainhand = eq.getEquipment("Mainhand");
                   if (mainhand && mainhand.typeId === "minecraft:chest" && mainhand.nameTag === "§a§lChest Auto-Sell") {
                       if (mainhand.amount > 1) {
                           mainhand.amount--;
                           eq.setEquipment("Mainhand", mainhand);
                       } else {
                           eq.setEquipment("Mainhand", undefined);
                       }
                   }
                }
            }

            // Set block to chest
            targetBlock.setType("minecraft:chest");

            // Create a ticking area to keep the farm running 24/7
            const taName = `autosell_${x}_${y}_${z}`;
            dim.runCommandAsync(`tickingarea add circle ${x} ${y} ${z} 1 "${taName}"`).catch(() => {});

            // Save to DB
            const db = getDb();
            db.push({
                x, y, z,
                dim: dim.id,
                owner: player.name,
                taName: taName
            });
            saveDb(db);

            player.sendMessage("§a[System] Mesin Auto-Sell dipasang! Area farm ini sekarang aktif 24 jam penuh tanpa perlu dijaga!");
        });
    }
});

// Detect breaking the chest
world.beforeEvents.playerBreakBlock.subscribe((event) => {
    const block = event.block;
    if (block.typeId === "minecraft:chest") {
        const dimId = event.dimension.id;
        let db = getDb();
        const index = db.findIndex(c => c.x === block.x && c.y === block.y && c.z === block.z && c.dim === dimId);

        if (index !== -1) {
            // It is an Auto-Sell chest
            event.cancel = true;
            const player = event.player;

            system.run(() => {
                // Reload DB inside run to prevent race conditions
                let currentDb = getDb();
                const currentIndex = currentDb.findIndex(c => c.x === block.x && c.y === block.y && c.z === block.z && c.dim === dimId);
                if (currentIndex !== -1) {
                    const chestData = currentDb[currentIndex];
                    if (chestData.taName) {
                        event.dimension.runCommandAsync(`tickingarea remove "${chestData.taName}"`).catch(() => {});
                    }
                    currentDb.splice(currentIndex, 1);
                    saveDb(currentDb);
                }
                const inv = block.getComponent("inventory");
                if (inv && inv.container) {
                    for (let i = 0; i < inv.container.size; i++) {
                        const item = inv.container.getItem(i);
                        if (item) {
                            event.dimension.spawnItem(item, block.center());
                            inv.container.setItem(i, undefined);
                        }
                    }
                }
                block.setType("minecraft:air");

                // Drop custom item
                const drop = new ItemStack("minecraft:chest", 1);
                drop.nameTag = "§a§lChest Auto-Sell";
                event.dimension.spawnItem(drop, block.center());

                player.sendMessage("§c[System] Mesin Auto-Sell dihancurkan.");
            });
        }
    }
});

// Processing Loop
system.runInterval(() => {
    const db = getDb();
    if (db.length === 0) return;

    const allPlayers = world.getAllPlayers();

    for (const chest of db) {
        try {
            const dim = world.getDimension(chest.dim);
            const block = dim.getBlock({x: chest.x, y: chest.y, z: chest.z});

            // If block is unloaded, getBlock might return undefined or error, we just catch and continue
            if (!block) continue;

            // Verify it's still a chest (maybe destroyed by creeper)
            if (block.typeId !== "minecraft:chest") {
                // Chest was destroyed by something other than a player. Remove from DB to prevent memory leak.
                if (chest.taName) {
                    dim.runCommandAsync(`tickingarea remove "${chest.taName}"`).catch(() => {});
                }
                db.splice(db.indexOf(chest), 1);
                saveDb(db);
                continue;
            }

            const inv = block.getComponent("inventory");
            if (!inv || !inv.container) continue;

            let totalEarned = 0;
            const container = inv.container;

            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                if (!item) continue;

                // Do not sell the config items themselves by accident, though highly unlikely inside a farm chest
                if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") continue;

                const typeId = item.typeId;
                const basePrice = EconomyConfig.sellPrices[typeId];
                const sellPrice = basePrice !== undefined ? basePrice : 5;

                const amount = item.amount;
                totalEarned += (sellPrice * amount);

                // Remove item
                container.setItem(i, undefined);
            }

            if (totalEarned > 0) {
                // To avoid duplicate scoreboard entries in Top Sultan for offline players,
                // we first check if the player is currently online.
                const ownerPlayer = allPlayers.find(p => p.name === chest.owner);

                if (ownerPlayer) {
                    // Player is online, safely add to their dompet score directly
                    const currentCoins = getScore(ownerPlayer, "dompet");
                    setScore(ownerPlayer, "dompet", currentCoins + totalEarned);
                } else {
                    // Player is offline, send the earnings to their Inbox.
                    // This prevents dummy string entries in the scoreboard that break the Top Sultan logic.
                    sendToInbox(chest.owner, "Auto-Sell", totalEarned, "Penjualan dari mesin otomatis Anda.");
                }
            }
        } catch(e) {
            // Chunk probably unloaded, ignore
        }
    }
}, 100); // 5 seconds (20 ticks/sec)
