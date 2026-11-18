import { Router } from "express";
import { prisma } from "../db.ts";
import { formatTicket, getBusinessDate } from "../lib/ticket.ts";
import { authenticateToken, requireRole } from "../middleware/auth.ts";

const router = Router();

router.use(authenticateToken, requireRole("ADMIN"));

//batas stok menipis sesuai brief (1-6)
const LOW_STOCK_LIMIT = 6;

//ringkasan hari ini, yang dihitung cuma transaksi PAID
router.get("/today", async (_req, res) => {
    const businessDate = getBusinessDate();
    const paidToday = {businessDate, status: "PAID" as const};

    const [summary, byMethod, topMenus, lowStock, recent] = await Promise.all([
        prisma.transaction.aggregate({
            where: paidToday,
            _count: true,
            _sum: {total: true},
        }),
        prisma.transaction.groupBy({
            by: ["paymentMethod"],
            where: paidToday,
            _count: true,
            _sum: {total: true},
        }),
        //menu terlaris dihitung dari jumlah qty yang terjual
        prisma.transactionItem.groupBy({
            by: ["menuId", "nameSnapshot"],
            where: {transaction: paidToday},
            _sum: {qty: true, lineTotal: true},
            orderBy: {_sum: {qty: "desc"}},
            take: 5,
        }),
        prisma.menu.findMany({
            where: {archivedAt: null, trackStock: true, stockQty: {lte: LOW_STOCK_LIMIT}},
            select: {id: true, code: true, name: true, stockQty: true},
            orderBy: [{stockQty: "asc"}, {code: "asc"}],
        }),
        prisma.transaction.findMany({
            where: paidToday,
            include: {cashier: {select: {id: true, name: true}}},
            orderBy: {paidAt: "desc"},
            take: 5,
        }),
    ]);

    res.json({
        date: businessDate.toISOString().slice(0, 10),
        transactionCount: summary._count,
        revenue: summary._sum.total ?? 0,
        byMethod: byMethod.map((row) => ({
            method: row.paymentMethod,
            count: row._count,
            total: row._sum.total ?? 0,
        })),
        topMenus: topMenus.map((row) => ({
            menuId: row.menuId,
            name: row.nameSnapshot,
            qty: row._sum.qty ?? 0,
            total: row._sum.lineTotal ?? 0,
        })),
        lowStock: lowStock.map((menu) => ({
            ...menu,
            status: (menu.stockQty ?? 0) <= 0 ? "HABIS" : "MENIPIS",
        })),
        recentTransactions: recent.map((trx) => ({...trx, ticket: formatTicket(trx.ticketNo)})),
    });
});

export default router;
