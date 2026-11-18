import type { Prisma } from "../generated/prisma/client.ts";

//tanggal hari ini menurut jam WIB, bukan jam server
//dipakai buat nomor tiket yang reset tiap hari
export function getBusinessDate(date = new Date()) {
    const text = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Jakarta"}).format(date);
    return new Date(`${text}T00:00:00.000Z`);
}

//ubah "2026-11-19" jadi Date, buat filter tanggal
export function parseDate(text: string) {
    return new Date(`${text}T00:00:00.000Z`);
}

//12 jadi "A-012"
export function formatTicket(ticketNo: number) {
    return `A-${String(ticketNo).padStart(3, "0")}`;
}

//nomor tiket terakhir hari ini + 1
export async function getNextTicketNo(db: Prisma.TransactionClient, businessDate: Date) {
    const result = await db.transaction.aggregate({
        where: {businessDate},
        _max: {ticketNo: true},
    });
    return (result._max.ticketNo ?? 0) + 1;
}
