import  type {NextFunction, Request, Response} from "express";
import {prisma} from "../db.ts";
import type {Role} from "../generated/prisma/client.ts";
import { HttpError } from "../lib/http-error.ts";
import { verifyToken } from "../lib/jwt.ts"; // DIPERBAIKI: verityToken → verifyToken

export type AuthUser = {
    id: string;
    name: string;
    email: string;
    role: Role;
};

declare global {
    namespace Express {
        interface Request { // DIPERBAIKI: "request" → "Request" (R besar, harus sama persis dengan nama tipe bawaan Express)
          user?: AuthUser;  
        }
    }
}

export async function authenticateToken(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization ;
    
      const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

    if (!token) {
        throw new HttpError(401, "token tidak ditemukan, silahkan login");
    }

    let payload;
    try {
        payload = verifyToken(token); // DIPERBAIKI: verityToken → verifyToken
    } catch {
        throw new HttpError(401, 'Sesi Anda telah berakhir, silahkan login kembali');
    }

    const user = await prisma.user.findUnique({
        where: {id : payload.sub},
        select: { id: true, name: true, email: true, role: true, isActive: true},
    });

    if (!user || !user. isActive) {
        throw new HttpError(401, 'akun tidak ditemukan atau sudah dinonaktifkan');
    }

    req.user = { id: user.id, name: user.name, email: user.email, role: user.role};

    next();
}

export function requireRole(...roles: Role[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            throw new HttpError(403, "Akses ditolak: Anda tidak punya izin untuk fitur ini")
        }
        next();
    }
}