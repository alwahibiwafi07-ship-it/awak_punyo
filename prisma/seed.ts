//isi data awal, jalankan: npx prisma db seed
import bcrypt from "bcrypt";
import { prisma } from "../server/db.ts";

async function main() {
    //hapus data lama dulu, anak dulu baru induk
    await prisma.stockLog.deleteMany();
    await prisma.transactionItem.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.menu.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();

    //semua akun demo passwordnya sama
    const passwordHash = await bcrypt.hash("password123", 10);

    const admin = await prisma.user.create({
        data: {name: "Rizal Chaniago", email: "rizal@awakpunyo.com", passwordHash, role: "ADMIN"},
    });

    await prisma.user.createMany({
        data: [
            {name: "Nia Sari", email: "nia@awakpunyo.com", passwordHash},
            {name: "Dewi Anggraini", email: "dewi@awakpunyo.com", passwordHash},
            {name: "Fikri Hidayat", email: "fikri@awakpunyo.com", passwordHash},
            {name: "Rian Pratama", email: "rian@awakpunyo.com", passwordHash, isActive: false},
        ],
    });

    const categories = [
        {code: "LK", name: "Lauk Utama", sortOrder: 1},
        {code: "GK", name: "Gulai & Kuah", sortOrder: 2},
        {code: "SY", name: "Sayur", sortOrder: 3},
        {code: "PL", name: "Pelengkap", sortOrder: 4},
        {code: "MN", name: "Minuman", sortOrder: 5},
    ];

    //simpan id kategori berdasarkan kodenya
    const categoryIds: Record<string, string> = {};

    for (const category of categories) {
        const created = await prisma.category.create({ data: category });
        categoryIds[category.code] = created.id;
    }

    //stock null artinya gak dilacak
    const menus = [
        {code: "LK-001", name: "Rendang Daging", price: 19500, stock: 6},
        {code: "LK-002", name: "Ayam Pop", price: 18000, stock: 15},
        {code: "LK-003", name: "Dendeng Balado", price: 22000, stock: 27},
        {code: "GK-001", name: "Gulai Ayam", price: 17500, stock: 21},
        {code: "GK-002", name: "Gulai Tunjang", price: 20500, stock: 0},
        {code: "GK-003", name: "Ikan Kakap Gulai", price: 24500, stock: 14},
        {code: "SY-001", name: "Terong Balado", price: 6500, stock: 18},
        {code: "SY-002", name: "Sayur Daun Singkong", price: 5500, stock: 44},
        {code: "PL-001", name: "Telur Balado", price: 8500, stock: 33},
        {code: "PL-002", name: "Perkedel", price: 4500, stock: 38},
        {code: "PL-003", name: "Nasi Putih", price: 6000, stock: null},
        {code: "MN-001", name: "Es Teh Manis", price: 5500, stock: null},
    ];

    for (const item of menus) {
        const categoryCode = item.code.slice(0, 2);

        const menu = await prisma.menu.create({
            data: {
                code: item.code,
                name: item.name,
                price: item.price,
                trackStock: item.stock !== null,
                stockQty: item.stock,
                categoryId: categoryIds[categoryCode],
            },
        });

        //stok awal juga dicatat di StockLog
        if (item.stock !== null && item.stock > 0) {
            await prisma.stockLog.create({
                data: {
                    menuId: menu.id,
                    type: "ADD",
                    change: item.stock,
                    stockAfter: item.stock,
                    reason: "Stok awal",
                    userId: admin.id,
                },
            });
        }
    }

    console.log("Seed selesai");
    console.log("Akun:", await prisma.user.count());
    console.log("Kategori:", await prisma.category.count());
    console.log("Menu:", await prisma.menu.count());
    console.log("Login admin: rizal@awakpunyo.com / password123");
    console.log("Login kasir: nia@awakpunyo.com / password123");
}

main()
    .catch((error) => {
        console.error("Seed gagal:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
