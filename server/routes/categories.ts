import { Router } from "express";
import {z} from "zod" ;
import {prisma} from "../db.ts";
import { HttpError } from "../lib/http-error.ts";
import { idParamSchema } from "../lib/validations.ts";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

const router = Router();

router.use(authenticateToken);

const nameRule = z.string().trim().min(1, "Nama wajib diisi").max(50, "Nama maksimal 50 karakter");
const sortOrderRule = z.number().int("Urutan harus bilangan bulat").min(0, "Urutan minimal 0");

const createCategorySchema = z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, "Kode harus 2–4 huruf, contoh: LK"),
    name: nameRule,
    sortOrder: sortOrderRule.optional(),
});


const updateCategorySchema = z.strictObject({
    name: nameRule.optional(),
    sortOrder: sortOrderRule.optional(),
});


router.get("/", async (_req, res) => {
    const categories = await prisma.category.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { menus: { where: { archivedAt: null } } } } },
    });
    res.json(categories);
});


router.post("/", requireRole("ADMIN"), async (req, res) => {
    const data = createCategorySchema.parse(req.body);
    const existing = await prisma.category.findUnique({ where: { code: data.code} });

    if (existing) {
        throw new HttpError(409, `Kode ${data.code} sudah dipakai kategori lain`);
    }

    let sortOrder = data.sortOrder;

    if (sortOrder === undefined) {
        const result = await prisma.category.aggregate({ _max: {sortOrder: true } });
        sortOrder = (result._max.sortOrder ?? 0) + 1;
    }

    const category = await prisma.category.create({ data: { ...data, sortOrder} });

    res.status(201).json(category);
});

router.patch("/:id", requireRole("ADMIN"), async (req, res) => {
    const {id} = idParamSchema.parse(req.params);
    const data = updateCategorySchema.parse(req.body);

    const category = await prisma.category.update({ where: {id}, data });
    res.json(category);
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
    const {id} = idParamSchema.parse(req.params);


    const activeMenus = await prisma.menu.count({ where: { categoryId: id, archivedAt: null } });
    if (activeMenus > 0) {
        throw new HttpError(409, `Kategori masih punya ${activeMenus} menu aktif. Pindahkan atau arsipkan menunya dulu.`);
    }


    const archivedMenus = await prisma.menu.count({ where: { categoryId: id } });
    if (archivedMenus > 0) {
        throw new HttpError(409, "Kategori tidak bisa dihapus karena masih dipakai menu yang sudah diarsipkan.");
    }

    await prisma.category.delete({ where: { id } });
    res.json({ message: "Kategori berhasil dihapus"})
});

export default router;
