import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.ts";
import { HttpError } from "../lib/http-error.ts";
import { idParamSchema } from "../lib/validations.ts";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

const router = Router();

//semua endpoint akun cuma buat admin
router.use(authenticateToken, requireRole("ADMIN"));

const nameRule = z.string().trim().min(1, "Nama wajib diisi").max(60, "Nama maksimal 60 karakter");
const emailRule = z.string().trim().toLowerCase().pipe(z.email("Format email tidak valid"));
const passwordRule = z.string().min(8, "Password minimal 8 karakter").max(72, "Password maksimal 72 karakter");

const listQuerySchema = z.object({
    role: z.enum(["ADMIN", "CASHIER"]).optional(),
});

const createUserSchema = z.strictObject({
    name: nameRule,
    email: emailRule,
    password: passwordRule,
});

const updateUserSchema = z.strictObject({
    name: nameRule.optional(),
    email: emailRule.optional(),
    isActive: z.boolean().optional(),
});

const resetPasswordSchema = z.strictObject({
    password: passwordRule,
});

//passwordHash jangan pernah ikut dikirim
const userSelect = {id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true};

//cek email sudah dipakai akun lain atau belum
async function checkEmailUsed(email: string, exceptId?: string) {
    const existing = await prisma.user.findUnique({ where: {email} });
    if (existing && existing.id !== exceptId) {
        throw new HttpError(409, `Email ${email} sudah dipakai akun lain`);
    }
}

//yang boleh diubah lewat sini cuma akun kasir
async function findCashierOrFail(id: string) {
    const user = await prisma.user.findUnique({ where: {id} });
    if (!user || user.role !== "CASHIER") {
        throw new HttpError(404, "Akun kasir tidak ditemukan");
    }
    return user;
}

router.get("/", async (req, res) => {
    const {role} = listQuerySchema.parse(req.query);

    const users = await prisma.user.findMany({
        where: {role},
        select: userSelect,
        orderBy: [{isActive: "desc"}, {name: "asc"}],
    });
    res.json(users);
});

//admin cuma bisa bikin akun kasir
router.post("/", async (req, res) => {
    const data = createUserSchema.parse(req.body);
    await checkEmailUsed(data.email);

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
        data: {name: data.name, email: data.email, passwordHash, role: "CASHIER"},
        select: userSelect,
    });
    res.status(201).json(user);
});

router.patch("/:id", async (req, res) => {
    const {id} = idParamSchema.parse(req.params);
    const data = updateUserSchema.parse(req.body);
    await findCashierOrFail(id);

    if (data.email) {
        await checkEmailUsed(data.email, id);
    }

    const user = await prisma.user.update({
        where: {id},
        data,
        select: userSelect,
    });
    res.json(user);
});

router.post("/:id/reset-password", async (req, res) => {
    const {id} = idParamSchema.parse(req.params);
    const {password} = resetPasswordSchema.parse(req.body);
    const user = await findCashierOrFail(id);

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: {id}, data: {passwordHash} });

    res.json({message: `Password ${user.name} berhasil direset`});
});

export default router;
