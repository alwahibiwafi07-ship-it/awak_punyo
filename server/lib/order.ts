import type { Channel, Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "./http-error.ts";
import { calculateTotal } from "./money.ts";

export type OrderItemInput = {menuId: string; qty: number};

//ambil harga dari database (harga dari frontend gak dipakai), cek stok, terus hitung total
export async function prepareOrder(db: Prisma.TransactionClient, items: OrderItemInput[], channel: Channel) {
    //kalau menu yang sama dikirim 2 kali, qty nya digabung
    const qtyByMenu = new Map<string, number>();
    for (const item of items) {
        qtyByMenu.set(item.menuId, (qtyByMenu.get(item.menuId) ?? 0) + item.qty);
    }

    const menuIds = [...qtyByMenu.keys()];
    const menus = await db.menu.findMany({
        where: {id: {in: menuIds}, archivedAt: null},
    });

    if (menus.length !== menuIds.length) {
        throw new HttpError(400, "Ada menu yang tidak ditemukan atau sudah diarsipkan");
    }

    const lines = menus.map((menu) => {
        const qty = qtyByMenu.get(menu.id)!;

        if (menu.trackStock && (menu.stockQty ?? 0) < qty) {
            throw new HttpError(409, `Stok ${menu.name} tidak cukup, sisa ${menu.stockQty ?? 0}`);
        }

        //nama sama harga disimpan (snapshot) biar transaksi lama gak berubah kalau harga menu diganti
        return {
            menuId: menu.id,
            nameSnapshot: menu.name,
            priceSnapshot: menu.price,
            qty,
            lineTotal: menu.price * qty,
            trackStock: menu.trackStock,
        };
    });

    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

    return {lines, ...calculateTotal(subtotal, channel)};
}

type StockLine = {menuId: string; nameSnapshot: string; qty: number; trackStock: boolean};

//kurangi stok pas transaksi sudah lunas + catat di StockLog tipe SALE
//strict = false dipakai buat QRIS, karena uangnya sudah masuk jadi gak boleh ditolak
export async function reduceStock(db: Prisma.TransactionClient, lines: StockLine[], data: {transactionId: string; userId: string; ticket: string; strict?: boolean}) {
    for (const line of lines) {
        if (!line.trackStock) continue;

        const updated = await db.menu.update({
            where: {id: line.menuId},
            data: {stockQty: {decrement: line.qty}},
        });

        if (data.strict !== false && updated.stockQty! < 0) {
            throw new HttpError(409, `Stok ${line.nameSnapshot} tidak cukup`);
        }

        await db.stockLog.create({
            data: {
                menuId: line.menuId,
                type: "SALE",
                change: -line.qty,
                stockAfter: updated.stockQty!,
                reason: `Penjualan ${data.ticket}`,
                transactionId: data.transactionId,
                userId: data.userId,
            },
        });
    }
}
