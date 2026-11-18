import bcrypt from "bcrypt";
import {Router} from "express";
import {z} from "zod";
import { prisma } from "../db.ts";
import { HttpError } from "../lib/http-error.ts";
import { signToken } from "../lib/jwt.ts";
import { authenticateToken } from "../middleware/auth.ts";

const router = Router();
const loginSchema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email("Format email tidak valid")),
    password: z.string().min(1, "Password wajib diisi"),
});

router.post("/login", async (req, res) => {
    const {email, password} = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: {email} });
    const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;

    if (!user || !passwordOk) {
        throw new HttpError(401, "Email atau password salah");
    }

    if (!user.isActive) {
        throw new HttpError(403, "Akun Anda dinonaktifkan. Hubungi admin.");
    }

    const token = signToken({sub: user.id, role: user.role});

    res.json({
        token,
        user: {id: user.id, name: user.name, email: user.email, role: user.role },
    });
});

router.get("/me",authenticateToken, (req, res) => {
    res.json({user: req.user});
});

export default router;
