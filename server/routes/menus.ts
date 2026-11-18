import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.ts";
import { HttpError } from "../lib/http-error.ts";
import { idParamSchema } from "../lib/validations.ts";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

const router = Router();

router.use(authenticateToken);

//aturan kecil yang dipakai berulang
const nameRule = z.string().trim().min(1, "Nama menu wajib diisi").max(80, "Nama menu maksimal 80 karakter");
const priceRule = z.number().int("Harga harus bilangan bulat").min(1, "Harga minimal Rp 1").max(10_000_000, "Harga terlalu besar");
const stockRule = z.number().int("Stok harus bilangan bulat").min(0, "Stok tidak boleh minus");

//query di url isinya selalu teks, jadi includeArchived dicek "true"/"false"
const listQuerySchema = z.object({
    search: z.string().trim().optional(),
    categoryId: z.uuid("ID kategori tidak valid").optional(),
    includeArchived: z.enum(["true", "false"]).optional(),
});

//code tidak ada disini karena dibuat otomatis
const createMenuSchema = z.strictObject({
    name: nameRule,
    price: priceRule,
    categoryId: z.uuid("ID kategori tidak valid"),
    trackStock: z.boolean().default(true),
    stockQty: stockRule.optional(),
});

//stockQty sengaja tidak ada, stok cuma boleh diubah lewat atur stok
const updateMenuSchema = z.strictObject({
    name: nameRule.optional(),
    price: priceRule.optional(),
    categoryId: z.uuid("ID kategori tidak valid").optional(),
});

const noteRule = z.string().trim().max(200, "Catatan maksimal 200 karakter").optional();
const qtyRule = z.number().int("Jumlah harus bilangan bulat").min(1, "Jumlah minimal 1");

//alasan yang boleh beda tergantung type nya
const adjustStockSchema = z.discriminatedUnion("type", [
    z.strictObject({
        type: z.literal("ADD"),
        qty: qtyRule,
        reason: z.enum(["Hasil masak", "Salah hitung"], "Alasan tambah stok tidak valid"),
        note: noteRule,
    }),
    z.strictObject({
        type: z.literal("REDUCE"),
        qty: qtyRule,
        reason: z.enum(["Dibawa pulang", "Rusak/basi", "Salah hitung"], "Alasan kurangi stok tidak valid"),
        note: noteRule,
    }),
], "Tipe harus ADD atau REDUCE");

const categorySelect = { select: {id: true, code: true, name: true} };

//bikin kode menu otomatis, contoh LK-003 jadi LK-004
//menu yang diarsip tetap dihitung biar kodenya gak kepakai lagi
async function generateMenuCode(categoryCode: string) {
    const lastMenu = await prisma.menu.findFirst({
        where: {code: {startsWith: `${categoryCode}-`}},
        orderBy: {code: "desc"},
    });

    const lastNumber = lastMenu ? Number(lastMenu.code.split("-")[1]) : 0;

    return `${categoryCode}-${String(lastNumber + 1).padStart(3, "0")}`;
}

async function findCategoryOrFail(categoryId: string) {
    const category = await prisma.category.findUnique({ where: {id: categoryId} });
    if (!category) {
        throw new HttpError(404, "Kategori tidak ditemukan");
    }
    return category;
}

//daftar menu, kasir cuma bisa lihat menu yang aktif
router.get("/", async (req, res) => {
    const {search, categoryId, includeArchived} = listQuerySchema.parse(req.query);
    const showArchived = req.user!.role === "ADMIN" && includeArchived === "true";

    const menus = await prisma.menu.findMany({
        where: {
            archivedAt: showArchived ? undefined : null,
            categoryId: categoryId,
            OR: search
                ? [
                    {name: {contains: search, mode: "insensitive"}},
                    {code: {contains: search, mode: "insensitive"}},
                  ]
                : undefined,
        },
        include: {category: categorySelect},
        orderBy: [{category: {sortOrder: "asc"}}, {code: "asc"}],
    });
    res.json(menus);
});

router.get("/:id", requireRole("ADMIN"), async (req, res) => {
    const {id} = idParamSchema.parse(req.params);

    const menu = await prisma.menu.findUnique({
        where: {id},
        include: {category: categorySelect},
    });

    if (!menu) {
        throw new HttpError(404, "Menu tidak ditemukan");
    }

    res.json(menu);
});

router.post("/", requireRole("ADMIN"), async (req, res) => {
    const data = createMenuSchema.parse(req.body);
    const category = await findCategoryOrFail(data.categoryId);
    const code = await generateMenuCode(category.code);
    //kalau tidak dilacak stoknya null
    const stockQty = data.trackStock ? (data.stockQty ?? 0) : null;

    //pakai $transaction biar menu sama log stok awal tersimpan bareng
    const menu = await prisma.$transaction(async (tx) => {
        const newMenu = await tx.menu.create({
            data: {
                code,
                name: data.name,
                price: data.price,
                trackStock: data.trackStock,
                stockQty,
                categoryId: category.id,
            },
            include: {category: categorySelect},
        });

        if (stockQty !== null && stockQty > 0) {
            await tx.stockLog.create({
                data: {
                    menuId: newMenu.id,
                    type: "ADD",
                    change: stockQty,
                    stockAfter: stockQty,
                    reason: "Stok awal",
                    userId: req.user!.id,
                },
            });
        }
        return newMenu;
    });
    res.status(201).json(menu);
});

//kode menu tidak ikut berubah walaupun kategorinya diganti
router.patch("/:id", requireRole("ADMIN"), async (req, res) => {
    const {id} = idParamSchema.parse(req.params);
    const data = updateMenuSchema.parse(req.body);

    if (data.categoryId) {
        await findCategoryOrFail(data.categoryId);
    }

    const menu = await prisma.menu.update({
        where: {id},
        data,
        include: {category: categorySelect},
    });
    res.json(menu);
});

//soft delete, datanya gak dihapus cuma diisi archivedAt
router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
    const {id} = idParamSchema.parse(req.params);

    const menu = await prisma.menu.findUnique({ where: {id} });
    if (!menu) {
        throw new HttpError(404, "Menu tidak ditemukan");
    }
    if (menu.archivedAt) {
        throw new HttpError(409, "Menu ini sudah diarsipkan sebelumnya");
    }
    await prisma.menu.update({
        where: {id},
        data: {archivedAt: new Date()},
    });
    res.json({message: `Menu ${menu.name} berhasil diarsipkan`});
});

//atur stok
router.post("/:id/stock", requireRole("ADMIN"), async (req, res) => {
    const {id} = idParamSchema.parse(req.params);
    const data = adjustStockSchema.parse(req.body);
    const menu = await prisma.menu.findUnique({ where: {id} });

    if (!menu) {
        throw new HttpError(404, "Menu tidak ditemukan");
    }
    if (menu.archivedAt) {
        throw new HttpError(409, "Menu yang sudah diarsipkan tidak bisa diatur stoknya");
    }
    if (!menu.trackStock) {
        throw new HttpError(400, `${menu.name} tidak dilacak stoknya`);
    }

    const change = data.type === "ADD" ? data.qty : -data.qty;

    const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.menu.update({
            where: {id},
            data: {stockQty: {increment: change}},
        });

        //kalau jadi minus, throw disini bikin update diatas dibatalin
        if (updated.stockQty! < 0) {
            throw new HttpError(409, `Stok tidak cukup. Stok ${menu.name} sekarang ${menu.stockQty}`);
        }

        const log = await tx.stockLog.create({
            data: {
                menuId: id,
                type: data.type,
                change,
                stockAfter: updated.stockQty!,
                reason: data.reason,
                note: data.note,
                userId: req.user!.id,
            },
        });
        return {menu: updated, log};
    });
    res.status(201).json(result);
});

//riwayat stok, yang terbaru diatas
router.get("/:id/stock-logs", requireRole("ADMIN"), async (req, res) => {
    const {id} = idParamSchema.parse(req.params);

    const menu = await prisma.menu.findUnique({
        where: {id},
        select: {id: true, code: true, name: true, trackStock: true, stockQty: true},
    });
    if (!menu) {
        throw new HttpError(404, "Menu tidak ditemukan");
    }

    const logs = await prisma.stockLog.findMany({
        where: {menuId: id},
        orderBy: {createdAt: "desc"},
        take: 100,
        include: {
            user: {select: {id: true, name: true}},
            transaction: {select: {id: true, ticketNo: true}},
        },
    });

    res.json({menu, logs});
});

export default router;
