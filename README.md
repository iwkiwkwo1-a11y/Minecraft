# Ekonomic & RPG Behavior Pack untuk Bedrock Dedicated Server 1.26.1

Add-on eksklusif dan termodular ini dirancang khusus untuk memajukan server survival dengan fitur kelas *end-game*. Seluruh interaksi UI menggunakan `@minecraft/server-ui`, dengan sistem database aman menggunakan *Dynamic Properties*.

## 🌟 Fitur Utama

### 💰 Ekonomi & Toko Dinamis
- **Rupiah Currency**: Sistem mata uang dengan denominasi Juta/Miliar.
- **Toko Dinamis**: Shop berotasi otomatis setiap 60 detik. Menawarkan 30 barang acak (29 normal, 1 Super OP).
- **Auto/Manual Sell Scanner**: Inventory akan otomatis ter-scan dan memfilter barang langka untuk dijual ke server. Tidak ada lagi UI lempar barang yang kuno!
- **Transfer Offline**: Bisa transfer Rupiah ke pemain lain meskipun mereka sedang offline. Uang akan masuk ke **Inbox (Pesan Masuk)** mereka.

### ⚔️ RPG Leveling & Skill
Dapatkan XP murni dari interaksi survival:
- **Woodcutting**: +5 XP per Log.
- **Mining**: +3 XP per Ore/Stone.
- **Slayer**: +10 XP per Monster Kill (Anti-spawner abuse via cooldown 1.5 detik).
- **Skill Tree**: Tukarkan Skill Points (SP) dari level-up untuk meng-unlock kemampuan spesial:
    - *Ore Excavation*: Hancurkan batu 3x3x3 sekaligus.
    - *Lumberjack's Sweep*: Tebang pohon 3x3x3.
    - *Siphon Strike*: Heal HP saat membunuh monster.
    *(Catatan: Mode 3x3 bisa dimatikan via UI untuk mencegah griefing rumah).*

### 🎲 Gacha System (Core Currency)
Konversi Rupiah Anda ke mata uang premium **Core** (Rp100.000 = 1 Core).

**1. Gacha Senjata, Armor, dan Tool (Equipment Gacha)**
Panggil sihir pada gear di inventory Anda dengan Rarity: Common, Rare, Epic, atau Legendary (0.01% Drop).
*Daftar Seluruh Efek Equipment Gacha:*
* **Senjata (Weapon):**
  - Serrated Edge (Common): Peluang extra damage (Wither 1 detik).
  - Venom Strike (Rare): Peluang meracuni target.
  - Frostbite (Rare): Peluang memberikan Slow dan Weakness.
  - Sonic Boom (Rare): Knockback ekstrim ke target.
  - Hellfire (Epic): Membakar musuh dengan parah.
  - Abyssal Wither (Epic): Ledakan area Wither.
  - Shadow Strike (Epic): Membutakan musuh sementara.
  - Gravity Smash (Epic): Menerbangkan musuh ke udara (Levitation).
  - Phantom Blade (Epic): Peluang serangan area (Sweep) mematikan.
  - Thunderous Smite (Legendary): Menyambar petir mematikan.
  - Vampiric Touch (Legendary): Lifesteal deras.
  - Explosive Blow (Legendary): Ledakan area instan saat memukul.
  - Void Strike (Legendary): Mengikis Max HP musuh perlahan.
* **Helm (Helmet):**
  - Padded Armor (Common): Mengurangi sedikit noise (Stealth).
  - Clear Mind (Rare): Mencegah efek kebutaan.
  - Gills of Atlantis (Epic): Water Breathing permanen.
  - Third Eye (Legendary): Night Vision & Glowing mobs.
* **Baju (Chestplate):**
  - Padded Armor (Common): Extra pertahanan dasar.
  - Iron Skin (Rare): Resistance 1 permanen.
  - Turtle Shell (Epic): Resistance 2 & Slowness.
  - Troll Blood (Legendary): Regenerasi HP 1 permanen.
  - Titan's Aegis (Legendary): Anti-Knockback, Resistance 3, Slowness 2.
* **Celana (Leggings):**
  - Sturdy (Rare): Sedikit Extra HP.
  - Behemoth (Epic): Extra HP menengah (Health Boost 1).
  - Colossus (Legendary): Max Health Boost (Health Boost 2).
* **Sepatu (Boots):**
  - Lightweight (Common): Sedikit lebih gesit.
  - Swiftness (Rare): Speed 1 permanen.
  - Frog Leap (Epic): Jump Boost 2.
  - Featherlight (Epic): Slow Falling / Anti-Fall Damage.
  - Boots of Hermes (Legendary): Speed 3 & Jump 3 permanen.
* **Alat Tambang (Tools):**
  - Dwarven Touch (Rare): Haste 1 saat dipegang.
  - Geomancer (Epic): Haste 2 saat dipegang.
  - World Breaker (Legendary): Haste 4 saat dipegang.

**2. Gacha Pasif Dewa**
Pasang hingga 3 pasif permanen berikut di "Kelola Semua Skill":
* **Fortitude**: Resistance permanen.
* **Agility**: Speed & Jump Boost permanen.
* **Titan's Grip**: Strength permanen.
* **Vitality**: Health Boost permanen.
* **Vigor**: Regenerasi HP perlahan.
* **Phoenix Blood (Legendary)**: Regenerasi deras saat HP sekarat.
* **Adrenaline (Legendary)**: Speed gila saat HP sekarat.
* **Second Wind (Legendary)**: Revive otomatis (50% HP + Buff) jika menerima damage mematikan (Cooldown 10 Menit).

### 🏆 Sistem Pangkat (Rank)
Gunakan Rupiah untuk membeli pangkat dan dapatkan badge eksklusif di chat & scoreboard:
- Warga Biasa -> Pedagang -> Juragan -> Miliarder -> SULTAN -> KONGLOMERAT.
- Semakin tinggi pangkat, Anda akan mendapat diskon global hingga 25% di seluruh Toko Dinamis.

### 🌍 Navigasi & Troll
- **Manajemen Home & RTP**: Simpan lokasi base (jumlah base tergantung Rank Anda) atau lakukan Random Teleport berbayar.
- **Anti-Combat Log**: Sistem mendeteksi pukulan. Pemain tidak bisa Teleport jika baru saja diserang dalam 15 detik terakhir.
- **Troll Roulette**: Jahili pemain lain secara anonim seharga Rp1.000.000. Mulai dari nge-spawn Creeper, jumpscare Warden, hingga hujan kelelawar!

## ⚙️ Cara Instalasi
1. Pastikan versi Bedrock Server Anda adalah **1.26.1**.
2. Masukkan folder `bp/` ke dalam folder `behavior_packs` di dedicated server Anda.
3. Pastikan Script API Beta / `@minecraft/server` v1.13.0 ter-enable di `level.dat` Anda.

> Dikembangkan dengan gaya bahasa baku Indonesia khas MMORPG. Anti-grief, Anti-Cheat, dan sangat siap untuk public launch!
