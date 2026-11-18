import jwt from "jsonwebtoken";
import type {Role} from "../generated/prisma/client.ts";

const JWT_SECRET: string = process.env.JWT_SECRET ?? "";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "8h"

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET belum diisi di file .env")
}

export type TokenPayload = {
    sub: string;
    role: Role;
}

export function signToken(payload: TokenPayload) {
    return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
});
}

export function verifyToken(token: string): TokenPayload {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
}