import { HttpError } from "./http-error.ts";

//server key cuma ada di .env, gak pernah dikirim ke frontend
const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY ?? "";
const BASE_URL = process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

export const QRIS_EXPIRE_MINUTES = 15;

type MidtransResponse = {
    status_code: string;
    status_message?: string;
    transaction_status?: string;
    qr_string?: string;
    actions?: {name: string; url: string}[];
};

async function callMidtrans(path: string, method: "GET" | "POST", body?: unknown) {
    if (!SERVER_KEY) {
        throw new HttpError(503, "MIDTRANS_SERVER_KEY belum diisi di file .env");
    }

    //midtrans pakai basic auth: server key + ":" lalu diubah ke base64
    const auth = Buffer.from(`${SERVER_KEY}:`).toString("base64");

    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Basic ${auth}`,
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(15000),
        });
        return (await response.json()) as MidtransResponse;
    } catch {
        throw new HttpError(502, "Tidak bisa terhubung ke layanan QRIS");
    }
}

//buat QR baru
export async function createQrisCharge(orderId: string, amount: number) {
    const result = await callMidtrans("/v2/charge", "POST", {
        payment_type: "qris",
        transaction_details: {order_id: orderId, gross_amount: amount},
        custom_expiry: {expiry_duration: QRIS_EXPIRE_MINUTES, unit: "minute"},
    });

    if (result.status_code !== "201") {
        throw new HttpError(502, `QRIS gagal dibuat: ${result.status_message ?? "Midtrans menolak permintaan"}`);
    }

    const qrUrl = result.actions?.find((action) => action.name === "generate-qr-code")?.url;
    if (!qrUrl) {
        throw new HttpError(502, "QRIS gagal dibuat: link QR tidak ada");
    }

    return {qrUrl, qrString: result.qr_string};
}

//cek status pembayaran: pending, settlement, expire, cancel, dll
export async function getQrisStatus(orderId: string) {
    const result = await callMidtrans(`/v2/${orderId}/status`, "GET");
    if (result.status_code === "404") return "pending";
    return result.transaction_status ?? "pending";
}

export async function cancelQris(orderId: string) {
    await callMidtrans(`/v2/${orderId}/cancel`, "POST");
}
