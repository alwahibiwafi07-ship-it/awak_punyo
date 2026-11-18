// prisma/seed.ts
// Seed = mengisi database dengan data awal (akun demo, kategori, menu)
// supaya aplikasi bisa langsung dicoba tanpa input manual satu per satu.
// Cara menjalankan: npx prisma db seed

// bcrypt = library untuk mengacak (hash) password. Password asli TIDAK pernah disimpan.
import bcrypt from "bcrypt";

// Pakai koneksi Prisma yang sama dengan backend (file server/db.ts).
import { prisma } from "../server/db.ts";

async function main() {
  // ───────── 1. HAPUS DATA LAMA ─────────
  // Supaya seed bisa dijalankan berulang kali tanpa data dobel.
  // Urutan PENTING: hapus "anak" dulu, baru "induk".
  // Contoh: Menu tidak bisa dihapus selama masih ada StockLog yang menunjuk ke menu itu.
  await prisma.stockLog.deleteMany();
  await prisma.transactionItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  // ───────── 2. AKUN ─────────
  // bcrypt.hash(password, 10): angka 10 = "salt rounds", tingkat kerumitan acakan.
  // Makin besar makin aman tapi makin lambat; 10 adalah nilai standar.
  // Semua akun demo memakai password yang sama, jadi cukup di-hash sekali.
  const passwordHash = await bcrypt.hash("password123", 10);

  // Admin dibuat terpisah karena id-nya kita butuhkan untuk StockLog di bawah.
  const admin = await prisma.user.create({
    data: {
      name: "Rizal Chaniago",
      email: "rizal@awakpunyo.com",
      passwordHash,
      role: "ADMIN",
    },
  });

  // createMany = membuat banyak baris sekaligus dalam satu perintah.
  // role tidak diisi, jadi otomatis CASHIER (dari @default di schema).
  await prisma.user.createMany({
    data: [
      { name: "Nia Sari", email: "nia@awakpunyo.com", passwordHash },
      { name: "Dewi Anggraini", email: "dewi@awakpunyo.com", passwordHash },
      { name: "Fikri Hidayat", email: "fikri@awakpunyo.com", passwordHash },
      { name: "Rian Pratama", email: "rian@awakpunyo.com", passwordHash, isActive: false }, // akun nonaktif
    ],
  });

  // ───────── 3. KATEGORI ─────────
  const categories = [
    { code: "LK", name: "Lauk Utama", sortOrder: 1 },
    { code: "GK", name: "Gulai & Kuah", sortOrder: 2 },
    { code: "SY", name: "Sayur", sortOrder: 3 },
    { code: "PL", name: "Pelengkap", sortOrder: 4 },
    { code: "MN", name: "Minuman", sortOrder: 5 },
  ];

  // "Kamus" untuk mencari id kategori dari kodenya, contoh: categoryIds["LK"] → "7f3c..."
  // Record<string, string> = objek dengan kunci teks dan nilai teks.
  const categoryIds: Record<string, string> = {};

  for (const category of categories) {
    const created = await prisma.category.create({ data: category });
    categoryIds[category.code] = created.id; // simpan id-nya ke kamus
  }

  // ───────── 4. MENU + STOK AWAL ─────────
  // stock: null = stok tidak dilacak (selalu bisa dijual).
  const menus = [
    { code: "LK-001", name: "Rendang Daging", price: 19500, stock: 6 },
    { code: "LK-002", name: "Ayam Pop", price: 18000, stock: 15 },
    { code: "LK-003", name: "Dendeng Balado", price: 22000, stock: 27 },
    { code: "GK-001", name: "Gulai Ayam", price: 17500, stock: 21 },
    { code: "GK-002", name: "Gulai Tunjang", price: 20500, stock: 0 }, // habis
    { code: "GK-003", name: "Ikan Kakap Gulai", price: 24500, stock: 14 },
    { code: "SY-001", name: "Terong Balado", price: 6500, stock: 18 },
    { code: "SY-002", name: "Sayur Daun Singkong", price: 5500, stock: 44 },
    { code: "PL-001", name: "Telur Balado", price: 8500, stock: 33 },
    { code: "PL-002", name: "Perkedel", price: 4500, stock: 38 },
    { code: "PL-003", name: "Nasi Putih", price: 6000, stock: null },
    { code: "MN-001", name: "Es Teh Manis", price: 5500, stock: null },
  ];

  for (const item of menus) {
    // Ambil 2 huruf pertama kode menu sebagai kode kategori: "LK-001" → "LK"
    const categoryCode = item.code.slice(0, 2);

    const menu = await prisma.menu.create({
      data: {
        code: item.code,
        name: item.name,
        price: item.price,
        trackStock: item.stock !== null, // true kalau stock berupa angka, false kalau null
        stockQty: item.stock,
        categoryId: categoryIds[categoryCode],
      },
    });

    // Setiap perubahan stok wajib tercatat di StockLog, termasuk stok awal.
    // Hanya untuk menu yang dilacak DAN stoknya lebih dari 0 (tidak perlu mencatat "+0").
    if (item.stock !== null && item.stock > 0) {
      await prisma.stockLog.create({
        data: {
          menuId: menu.id,
          type: "ADD",
          change: item.stock, // positif karena stok bertambah
          stockAfter: item.stock,
          reason: "Stok awal",
          userId: admin.id, // dicatat atas nama admin
        },
      });
    }
  }

  // ───────── 5. RINGKASAN ─────────
  console.log("Seed selesai:");
  console.log("- Akun     :", await prisma.user.count());
  console.log("- Kategori :", await prisma.category.count());
  console.log("- Menu     :", await prisma.menu.count());
  console.log("- StockLog :", await prisma.stockLog.count());
  console.log("Login admin: rizal@awakpunyo.com / password123");
  console.log("Login kasir: nia@awakpunyo.com / password123");
}

// Jalankan main(), lalu apa pun hasilnya (berhasil/gagal) tutup koneksi database.
main()
  .catch((error) => {
    console.error("Seed gagal:", error);
    process.exitCode = 1; // tandai bahwa proses gagal (kode keluar bukan 0)
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
