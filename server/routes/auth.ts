import bcrypt from "bcrypt";
import {Router} from "express";
import {z} from "zod";
import { prisma } from "../db.ts"; // DIPERBAIKI: yang dibutuhkan koneksi `prisma` dari db.ts, bukan `Prisma` dari generated
import { HttpError } from "../lib/http-error.ts"; // DIPERBAIKI: HttpError ada di http-error.ts (dan namanya HttpError, bukan HttpsError)
import { signToken } from "../lib/jwt.ts"; // DIPERBAIKI: jwt.ts hanya berisi signToken & verifyToken
import { authenticateToken } from "../middleware/auth.ts";

const router = Router();
const loginSchema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email("Format email tidak valid")), // DIPERBAIKI: "valid0" → "valid"
    password: z.string().min(1, "Password wajib diisi"),
});

router.post("/login", async (req, res) => {
    const {email, password} = loginSchema.parse(req.body); // DIPERBAIKI: req,body (koma) → req.body (titik)
    const user = await prisma.user.findUnique({ where: {email} });
    const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;

    if (!user || !passwordOk) {
        throw new HttpError(401, "Email atau password salah"); // DIPERBAIKI: HttpsError → HttpError
    }

    if (!user.isActive) {
        throw new HttpError(403, "Akun Anda dinonaktifkan. Hubungi admin."); // DIPERBAIKI: salah ketik "dinonaktikan"
    }

    const token = signToken({sub: user.id, role: user.role});

    res.json({
        token,
        user: {id: user.id, name: user.name, email: user.email, role: user.role }, // DIPERBAIKI: "id, user.id" → "id: user.id"
    });
});

router.get("/me",authenticateToken, (req, res) => {
    res.json({user: req.user});
});

export default router;
