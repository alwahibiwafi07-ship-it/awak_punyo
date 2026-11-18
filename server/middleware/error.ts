import type {NextFunction, Request, Response } from "express";
import {z} from "zod";
import {Prisma} from "../generated/prisma/client.ts"
import {HttpError} from "../lib/http-error.ts";

export function notFound(req: Request, res: Response) {
    res.status(404).json({ message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`})
}


export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
    if (err instanceof HttpError) {
        res.status(err.status).json({ message: err.message});
        return;
    }

    if (err instanceof z.ZodError) {
        res.status(400).json({
            message: "data yang dikirim tidak valid",
            errors: err.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
            })),
        });
        return;
    }
    
if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
        res.status(409).json({ message: "Data dengan nilai yang sama sudah ada"});
        return;
    }

    if (err.code === "P2025") {
        res.status(404).json({ message: "data tidak ditemukan"})
        return;
    }
}

if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({message: "Format JSON tidak Valid"})
    return;
}

console.error(err);
res.status(500).json({message: "Terjadi kesalahan di server"})
}