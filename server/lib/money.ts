import type { Channel } from "../generated/prisma/client.ts";

export const TAKEOUT_FEE = 2000;
export const TAX_RATE = 0.1;
export const ROUND_TO = 500;

//hitung total dari subtotal
//pajak 10% dari subtotal + bungkus, terus total dibulatkan keatas ke kelipatan 500
export function calculateTotal(subtotal: number, channel: Channel) {
    const takeoutFee = channel === "TAKEAWAY" ? TAKEOUT_FEE : 0;
    const tax = Math.round((subtotal + takeoutFee) * TAX_RATE);
    const beforeRounding = subtotal + takeoutFee + tax;
    const total = Math.ceil(beforeRounding / ROUND_TO) * ROUND_TO;
    const rounding = total - beforeRounding;

    return {subtotal, takeoutFee, tax, rounding, total};
}
