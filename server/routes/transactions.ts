import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../lib/http-error.ts";
import { cancelQris, createQrisCharge, getQrisStatus, QRIS_EXPIRE_MINUTES } from "../lib/midtrans.ts";
import { prepareOrder, reduceStock } from "../lib/order.ts";
import { formatTicket, getBusinessDate, getNextTicketNo, parseDate } from "../lib/ticket.ts";
import { idParamSchema } from "../lib/validations.ts";
import { authenticateToken, requireRole, type AuthUser } from "../middleware/auth.ts";

const router = Router();

router.use(authenticateToken);

//frontend cuma kirim menuId sama qty, harga diambil dari database
const itemsRule = z.array(z.object({
    menuId: z.uuid("ID menu tidak valid"),
    qty: z.number().int("Jumlah harus bilangan bulat").min(1, "Jumlah minimal 1").max(999, "Jumlah terlalu banyak"),
})).min(1, "Pesanan masih kosong");

const orderSchema = z.object({
    clientRef: z.uuid("clientRef tidak valid"),
    channel: z.enum(["DINE_IN", "TAKEAWAY"], "Channel harus DINE_IN atau TAKEAWAY"),
    items: itemsRule,
});

const cashSchema = orderSchema.extend({
    cashReceived: z.number().int("Uang diterima harus bilangan bulat").min(0, "Uang diterima tidak boleh minus"),
});

const dateRule = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
    .refine((text) => !Number.isNaN(parseDate(text).getTime()), "Tanggal tidak valid");

const listQuerySchema = z.object({
    from: dateRule.optional(),
    to: dateRule.optional(),
    cashierId: z.uuid("ID kasir tidak valid").optional(),
    method: z.enum(["CASH", "QRIS"]).optional(),
    status: z.enum(["PENDING", "PAID", "EXPIRED", "CANCELLED"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const detailInclude = {
    items: {orderBy: {nameSnapshot: "asc"}},
    cashier: {select: {id: true, name: true}},
} satisfies Prisma.TransactionInclude;

type TransactionDetail = Prisma.TransactionGetPayload<{include: typeof detailInclude}>;

//tambah field ticket biar frontend tinggal tampilin "A-001"
function withTicket<T extends {ticketNo: number}>(trx: T) {
    return {...trx, ticket: formatTicket(trx.ticketNo)};
}

//kasir cuma boleh lihat transaksinya sendiri
async function findTransactionOrFail(id: string, user: AuthUser) {
    const trx = await prisma.transaction.findUnique({ where: {id}, include: detailInclude });
    if (!trx || (user.role === "CASHIER" && trx.cashierId !== user.id)) {
        throw new HttpError(404, "Transaksi tidak ditemukan");
    }
    return trx;
}

function findByClientRef(clientRef: string) {
    return prisma.transaction.findUnique({ where: {clientRef}, include: detailInclude });
}

//kalau nomor tiket bentrok (2 kasir bayar barengan) dicoba ulang sekali
//kalau yang bentrok clientRef, berarti transaksinya sudah ada, kembalikan yang lama
async function saveOrder(clientRef: string, create: () => Promise<TransactionDetail>) {
    try {
        return await create();
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            const existing = await findByClientRef(clientRef);
            if (existing) return existing;
            return await create();
        }
        throw err;
    }
}

//data transaksi yang sama untuk tunai dan qris
type PreparedOrder = Awaited<ReturnType<typeof prepareOrder>>;

function transactionData(order: PreparedOrder, data: {clientRef: string; channel: "DINE_IN" | "TAKEAWAY"; businessDate: Date; ticketNo: number; cashierId: string}) {
    return {
        clientRef: data.clientRef,
        businessDate: data.businessDate,
        ticketNo: data.ticketNo,
        channel: data.channel,
        subtotal: order.subtotal,
        takeoutFee: order.takeoutFee,
        tax: order.tax,
        rounding: order.rounding,
        total: order.total,
        cashierId: data.cashierId,
        items: {
            create: order.lines.map((line) => ({
                menuId: line.menuId,
                nameSnapshot: line.nameSnapshot,
                priceSnapshot: line.priceSnapshot,
                qty: line.qty,
                lineTotal: line.lineTotal,
            })),
        },
    };
}

//buat QR ke midtrans, order_id beda tiap percobaan
//contoh A-010-20261119-1-3f9a2c, ujungnya potongan id biar gak bentrok kalau database direset
async function chargeQris(trx: {id: string; ticketNo: number; businessDate: Date; qrisAttempt: number; total: number}) {
    const attempt = trx.qrisAttempt + 1;
    const date = trx.businessDate.toISOString().slice(0, 10).replaceAll("-", "");
    const orderId = `${formatTicket(trx.ticketNo)}-${date}-${attempt}-${trx.id.slice(0, 6)}`;

    await prisma.transaction.update({ where: {id: trx.id}, data: {qrisAttempt: attempt} });

    const {qrUrl} = await createQrisCharge(orderId, trx.total);

    return prisma.transaction.update({
        where: {id: trx.id},
        data: {
            status: "PENDING",
            midtransOrderId: orderId,
            qrUrl,
            expiresAt: new Date(Date.now() + QRIS_EXPIRE_MINUTES * 60 * 1000),
        },
        include: detailInclude,
    });
}

//qris sudah dibayar: ubah jadi PAID lalu kurangi stok
async function markQrisPaid(id: string) {
    await prisma.$transaction(async (tx) => {
        //updateMany pakai syarat status bukan PAID, biar kalau polling dobel stok gak kepotong 2 kali
        const changed = await tx.transaction.updateMany({
            where: {id, status: {not: "PAID"}},
            data: {status: "PAID", paidAt: new Date()},
        });
        if (changed.count === 0) return;

        const trx = await tx.transaction.findUniqueOrThrow({
            where: {id},
            include: {items: {include: {menu: {select: {trackStock: true}}}}},
        });

        const lines = trx.items.map((item) => ({
            menuId: item.menuId,
            nameSnapshot: item.nameSnapshot,
            qty: item.qty,
            trackStock: item.menu.trackStock,
        }));

        //strict false, uang sudah masuk jadi transaksinya gak boleh ditolak
        await reduceStock(tx, lines, {transactionId: id, userId: trx.cashierId, ticket: formatTicket(trx.ticketNo), strict: false});
    });
}

function isPaidStatus(status: string) {
    return status === "settlement" || status === "capture";
}

//perkiraan nomor tiket berikutnya buat panel pesanan
router.get("/next-ticket", async (_req, res) => {
    const ticketNo = await getNextTicketNo(prisma, getBusinessDate());
    res.json({ticketNo, ticket: formatTicket(ticketNo)});
});

//riwayat kasir hari ini, cuma yang sudah lunas
router.get("/mine/today", requireRole("CASHIER"), async (req, res) => {
    const transactions = await prisma.transaction.findMany({
        where: {cashierId: req.user!.id, businessDate: getBusinessDate(), status: "PAID"},
        include: detailInclude,
        orderBy: {ticketNo: "desc"},
    });
    const total = transactions.reduce((sum, trx) => sum + trx.total, 0);

    res.json({count: transactions.length, total, transactions: transactions.map(withTicket)});
});

//bayar tunai, semua dalam satu $transaction
//kalau ada yang gagal (stok kurang, uang kurang) semuanya dibatalin
router.post("/cash", async (req, res) => {
    const data = cashSchema.parse(req.body);

    //clientRef sama = tombol bayar kepencet 2 kali, kembalikan transaksi yang sudah ada
    const existing = await findByClientRef(data.clientRef);
    if (existing) {
        res.json(withTicket(existing));
        return;
    }

    const cashierId = req.user!.id;

    const trx = await saveOrder(data.clientRef, () => prisma.$transaction(async (tx) => {
        const order = await prepareOrder(tx, data.items, data.channel);

        if (data.cashReceived < order.total) {
            throw new HttpError(400, `Uang yang diterima kurang dari total Rp ${order.total.toLocaleString("id-ID")}`);
        }

        const businessDate = getBusinessDate();
        const ticketNo = await getNextTicketNo(tx, businessDate);

        const created = await tx.transaction.create({
            data: {
                ...transactionData(order, {...data, businessDate, ticketNo, cashierId}),
                paymentMethod: "CASH",
                status: "PAID",
                cashReceived: data.cashReceived,
                changeAmount: data.cashReceived - order.total,
                paidAt: new Date(),
            },
            include: detailInclude,
        });

        await reduceStock(tx, order.lines, {transactionId: created.id, userId: cashierId, ticket: formatTicket(ticketNo)});

        return created;
    }));

    res.status(201).json(withTicket(trx));
});

//bayar qris: transaksi dibuat PENDING dulu, stok cuma dicek belum dikurangi
router.post("/qris", async (req, res) => {
    const data = orderSchema.parse(req.body);

    const existing = await findByClientRef(data.clientRef);
    if (existing) {
        res.json(withTicket(existing));
        return;
    }

    const cashierId = req.user!.id;

    const trx = await saveOrder(data.clientRef, () => prisma.$transaction(async (tx) => {
        const order = await prepareOrder(tx, data.items, data.channel);
        const businessDate = getBusinessDate();
        const ticketNo = await getNextTicketNo(tx, businessDate);

        return tx.transaction.create({
            data: {
                ...transactionData(order, {...data, businessDate, ticketNo, cashierId}),
                paymentMethod: "QRIS",
                status: "PENDING",
            },
            include: detailInclude,
        });
    }));

    //manggil midtrans diluar $transaction
    //kalau gagal, transaksinya tetap ada jadi kasir bisa coba lagi atau ganti ke tunai
    try {
        const updated = await chargeQris(trx);
        res.status(201).json(withTicket(updated));
    } catch (err) {
        if (err instanceof HttpError) {
            res.status(err.status).json({message: err.message, transaction: withTicket(trx)});
            return;
        }
        throw err;
    }
});

//daftar semua transaksi buat admin, pakai filter dan halaman
router.get("/", requireRole("ADMIN"), async (req, res) => {
    const q = listQuerySchema.parse(req.query);

    const where: Prisma.TransactionWhereInput = {
        businessDate: {
            gte: q.from ? parseDate(q.from) : undefined,
            lte: q.to ? parseDate(q.to) : undefined,
        },
        cashierId: q.cashierId,
        paymentMethod: q.method,
        status: q.status,
    };

    const [total, transactions] = await Promise.all([
        prisma.transaction.count({where}),
        prisma.transaction.findMany({
            where,
            include: detailInclude,
            orderBy: [{businessDate: "desc"}, {ticketNo: "desc"}],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
        }),
    ]);

    //omzet cuma dari transaksi yang lunas
    let revenue = 0;
    if (!q.status || q.status === "PAID") {
        const paid = await prisma.transaction.aggregate({ where: {...where, status: "PAID"}, _sum: {total: true} });
        revenue = paid._sum.total ?? 0;
    }

    res.json({
        transactions: transactions.map(withTicket),
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.ceil(total / q.pageSize),
        revenue,
    });
});

router.get("/:id", async (req, res) => {
    const {id} = idParamSchema.parse(req.params);
    const trx = await findTransactionOrFail(id, req.user!);
    res.json(withTicket(trx));
});

//dipanggil frontend tiap 3 detik selama QR tampil
router.get("/:id/status", async (req, res) => {
    const {id} = idParamSchema.parse(req.params);
    const trx = await findTransactionOrFail(id, req.user!);

    if (trx.status !== "PENDING" || !trx.midtransOrderId) {
        res.json(withTicket(trx));
        return;
    }

    const status = await getQrisStatus(trx.midtransOrderId);

    if (isPaidStatus(status)) {
        await markQrisPaid(id);
    } else if (status === "expire") {
        await prisma.transaction.updateMany({ where: {id, status: "PENDING"}, data: {status: "EXPIRED"} });
    } else if (status === "cancel" || status === "deny" || status === "failure") {
        await prisma.transaction.updateMany({ where: {id, status: "PENDING"}, data: {status: "CANCELLED"} });
    }

    const latest = await findTransactionOrFail(id, req.user!);
    res.json(withTicket(latest));
});

//buat QR baru, misal yang lama sudah kedaluwarsa
router.post("/:id/qris/regenerate", async (req, res) => {
    const {id} = idParamSchema.parse(req.params);
    const trx = await findTransactionOrFail(id, req.user!);

    if (trx.paymentMethod !== "QRIS" || (trx.status !== "PENDING" && trx.status !== "EXPIRED")) {
        throw new HttpError(409, "QR baru hanya bisa dibuat untuk transaksi QRIS yang belum lunas");
    }

    //QR lama dicek dulu, siapa tau ternyata sudah dibayar
    if (trx.midtransOrderId && trx.status === "PENDING") {
        const status = await getQrisStatus(trx.midtransOrderId);
        if (isPaidStatus(status)) {
            await markQrisPaid(id);
            res.json(withTicket(await findTransactionOrFail(id, req.user!)));
            return;
        }
        await cancelQris(trx.midtransOrderId).catch(() => undefined);
    }

    //stok dicek lagi karena bisa saja sudah kejual lewat transaksi lain
    await prepareOrder(prisma, trx.items.map((item) => ({menuId: item.menuId, qty: item.qty})), trx.channel);

    const updated = await chargeQris(trx);
    res.json(withTicket(updated));
});

//batalkan qris sebelum ganti ke tunai
router.post("/:id/qris/cancel", async (req, res) => {
    const {id} = idParamSchema.parse(req.params);
    const trx = await findTransactionOrFail(id, req.user!);

    if (trx.paymentMethod !== "QRIS") {
        throw new HttpError(409, "Transaksi ini bukan QRIS");
    }
    if (trx.status === "PAID") {
        throw new HttpError(409, "Transaksi sudah lunas, tidak bisa dibatalkan");
    }

    if (trx.midtransOrderId && trx.status === "PENDING") {
        //kalau midtrans gak bisa dihubungi tetap boleh dibatalkan, biar kasir bisa ganti ke tunai
        const status = await getQrisStatus(trx.midtransOrderId).catch(() => "unknown");
        if (isPaidStatus(status)) {
            await markQrisPaid(id);
            throw new HttpError(409, "Pembayaran QRIS sudah masuk, transaksi tidak bisa dibatalkan");
        }
        await cancelQris(trx.midtransOrderId).catch(() => undefined);
    }

    await prisma.transaction.updateMany({
        where: {id, status: {in: ["PENDING", "EXPIRED"]}},
        data: {status: "CANCELLED"},
    });

    res.json(withTicket(await findTransactionOrFail(id, req.user!)));
});

export default router;
