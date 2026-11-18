# PROJECT BRIEF — Awak Punyo (Web Kasir Rumah Makan Padang)

> Dokumen serah terima. Baca seluruhnya sebelum menulis kode. Dokumen ini menjelaskan apa yang sedang dibangun, kenapa bentuknya seperti ini, rencana awal yang lebih besar, aturan bisnis yang sudah diputuskan, dan urutan pengerjaan. Mockup layar dikirim terpisah oleh pemilik proyek. Mockup adalah acuan tampilan, sedangkan dokumen ini adalah acuan aturan. Kalau keduanya bertentangan, **dokumen ini yang benar**.

---

## 1. Ringkasan singkat

**Awak Punyo** adalah aplikasi web kasir (POS) untuk rumah makan Padang. Ada dua peran:

- **Admin (pemilik):** mengelola menu, kategori, stok, akun kasir, dan melihat transaksi serta ringkasan penjualan.
- **Kasir:** membuat pesanan (Makan di Tempat atau Bungkus), menerima pembayaran Tunai atau QRIS (Midtrans), mencetak struk, dan melihat riwayat transaksinya sendiri hari itu.

Proyek ini sedang dibuat sebagai **tugas yang dikumpulkan ke mentor**. Mentor mewajibkan:

1. Ada **CRUD** yang jelas.
2. Proyek benar-benar **fullstack** (frontend + backend + database + autentikasi).
3. Web kasir yang **sederhana**, hanya fitur wajib.

Setelah tugas lulus, pemilik proyek ingin mengembangkannya kembali ke rencana awal yang lebih lengkap dan **menjualnya ke pemilik warung nasi Padang**. Jadi kode versi tugas harus sederhana dan mudah dijelaskan, tetapi struktur dasarnya (snapshot harga, uang dalam Integer, log stok, idempotensi transaksi) tidak boleh asal, supaya nanti bisa dikembangkan tanpa membongkar ulang.

---

## 2. Rencana awal (sebelum disederhanakan)

Awalnya proyek ini dirancang sebagai sistem POS lengkap plus **asisten virtual berbasis AI untuk owner**. Rancangan awal dibuat dengan bantuan AI versi gratis, menghasilkan **85 gambar mockup** dan schema Prisma yang besar. Isi rencana awal:

### 2.1 Fitur operasional kasir
- Login kasir dengan **PIN** (bukan email/password), kode staf.
- **Shift kasir**: buka shift dengan kas awal laci, tutup shift dengan **blind close** (kasir menghitung uang tanpa melihat angka sistem), lalu **rekonsiliasi** selisih.
- **Hold/tahan pesanan** (pesanan disimpan sementara, dilanjut nanti).
- **Diskon** (preset diskon persen/nominal).
- **Void** transaksi dengan alasan dan persetujuan admin (VoidRequest, VoidDecision).
- **Bagi tagihan / split bill**.
- **Paket menu** (PackageItem: satu menu berisi beberapa menu lain).
- Menu **quick pick**, tandai **habis** manual, pembulatan kasir.
- Nomor meja, catatan pesanan, pesanan besar/katering, **kasbon** (utang pelanggan).

### 2.2 Fitur admin/owner
- Laporan lengkap (harian, mingguan, per menu, per kasir, per metode).
- **HPP** (harga pokok) per menu, **resep** dan **bahan baku**, **rencana masak**, pencatatan **sisa terbuang**, **biaya operasional**, laba kotor.
- **Ubah harga massal**.
- **Log aktivitas / audit log** semua aksi penting.
- Pengaturan toko (Settings), mode Midtrans, aturan pembulatan.

### 2.3 Fitur AI (V3)
- Asisten virtual owner: merangkum penjualan, menganalisis menu laris/tidak laris, menyarankan jumlah masak besok, menjawab pertanyaan owner dalam bahasa sehari-hari.

### 2.4 Schema lengkap yang sudah dibuat
Schema lengkap sudah ditulis dan **valid** (`npx prisma validate` lolos). Isinya antara lain enum `Role`, `Channel`, `PaymentMethod (CASH, QRIS)`, `TransactionStatus (HELD, PENDING, PAID, VOID_PENDING, VOIDED, EXPIRED, CANCELLED)`, `ShiftStatus`, `MenuType`, `RoundingMode`, `DiscountType`, `VoidReason`, `VoidDecision`, `StockMovementType (RESTOCK, SALE, VOID_RETURN, ADJUST)`, `MidtransMode`; dan model `User`, `Category`, `Menu`, `PackageItem`, `DiscountPreset`, `Settings`, `Shift`, `Transaction`, `TransactionItem`, `VoidRequest`, `StockMovement`, `AuditLog`.

**Schema lengkap ini JANGAN dipakai untuk versi tugas.** Simpan sebagai arsip di `docs/schema-lengkap.prisma` untuk tahap 2. Versi tugas memakai schema yang dipangkas (bagian 7).

---

## 3. Kenapa disederhanakan

- Proyek ini untuk **belajar dan dinilai mentor**. Pemilik proyek harus bisa menjelaskan setiap bagian kode dengan mudah.
- 85 mockup terlalu detail dan banyak berisi fitur yang tidak wajib.
- Fitur seperti shift, void dengan persetujuan, split bill, HPP, resep, dan AI menambah kerumitan besar tanpa menambah nilai untuk penilaian CRUD + fullstack.
- Keputusannya: **bangun versi sederhana yang rapi dan lengkap secara alur**, lalu kembangkan setelah lulus.

Yang **dipertahankan** dari rencana awal karena penting dan tidak rumit:
- Uang disimpan sebagai **Integer Rupiah** (tidak pakai float).
- **Snapshot** nama dan harga menu di item transaksi (harga menu boleh berubah tanpa mengubah transaksi lama).
- **Nomor tiket harian** (A-001, A-002, ... reset tiap hari).
- **`clientRef` (UUID)** untuk mencegah transaksi dobel kalau tombol diklik dua kali atau jaringan putus.
- **Log stok** supaya setiap perubahan stok bisa ditelusuri.
- **QRIS via Midtrans** (pembayaran online), karena ini nilai tambah fullstack yang nyata.

Yang **dibuang dari versi tugas**: PIN, shift, kas awal, blind close, rekonsiliasi, hold, **diskon** (dipastikan tidak ada), void, split bill, paket, nomor meja, catatan, pembulatan, quick pick, HPP, resep, bahan, rencana masak, sisa terbuang, biaya, kasbon, pesanan besar, ubah harga massal, audit log, Settings, dark mode, AI. Semuanya masuk roadmap tahap 2 (bagian 14).

---

## 4. Ruang lingkup versi tugas

### 4.1 Autentikasi (semua peran)
- Login dengan **email + password** (bcrypt + JWT). Kasir juga pakai email + password, bukan PIN.
- Setelah login, Admin diarahkan ke dashboard admin; Kasir ke layar kasir.
- Logout.
- Token tidak valid/kedaluwarsa → backend balas **401** → frontend tampilkan modal **"Sesi Anda telah berakhir"** dengan tombol "Masuk Kembali". Keranjang kasir yang sedang dibuat tetap tersimpan (simpan di state/localStorage).
- Akses ke halaman peran lain → backend balas **403** → frontend tampilkan halaman **"Akses ditolak"**.
- Akun nonaktif tidak bisa login.

### 4.2 Admin
1. **Dashboard** — ringkasan hari ini: jumlah transaksi, omzet, menu terlaris, menu stok menipis/habis, transaksi terakhir. (Mockup dashboard memang belum sempurna; ikuti data dan aturan di dokumen ini, sesuaikan tampilannya saat ngoding.)
2. **Kategori** — CRUD kategori (kode, nama, urutan).
3. **Menu** — CRUD menu: daftar dengan pencarian dan filter kategori, tambah, ubah, arsipkan (soft delete). Kode menu dibuat **otomatis** dari kode kategori (contoh `LK-001`), tidak bisa diisi manual.
4. **Atur Stok** — tambah/kurangi stok dengan alasan, dan **Riwayat Stok** per menu.
5. **Transaksi** — daftar semua transaksi dengan filter tanggal, kasir, metode, dan detail transaksi.
6. **Akun Kasir** — CRUD akun kasir: tambah, ubah, aktif/nonaktifkan, reset password.

### 4.3 Kasir
1. **Layar Kasir (POS)** — grid menu per kategori + pencarian; panel pesanan di kanan dengan pilihan **Makan di Tempat / Bungkus**, ubah jumlah, hapus item, kosongkan pesanan, rincian subtotal, biaya bungkus, PB1, total.
2. **Pembayaran** — pilih metode (Tunai atau QRIS).
   - **Tunai**: input uang diterima, tombol nominal cepat, hitung kembalian, tolak kalau uang kurang.
   - **QRIS**: tampilkan QR Midtrans, timer 15 menit, status dicek otomatis, bisa "Cek Status" manual, "Ganti ke Tunai", "Buat QR Baru" saat kedaluwarsa, pesan error saat gagal terhubung.
3. **Berhasil** — nomor tiket besar, ringkasan, pratinjau struk, tombol "Cetak Struk" (`window.print()` dengan CSS cetak 80mm) dan "Pesanan Baru".
4. **Riwayat** — transaksi kasir itu sendiri hari ini, total, pencarian nomor tiket, drawer detail, "Cetak Ulang Struk".

### 4.4 Status kosong, error, dan batas
Semua layar punya keadaan: memuat, kosong, error dengan tombol "Coba Lagi", dan validasi form. Contoh: menu gagal dimuat, riwayat kosong, gagal menyimpan transaksi, stok tidak cukup saat menambah item.

---

## 5. Teknologi

| Lapisan | Teknologi |
|---|---|
| Bahasa | TypeScript (ESM) |
| Backend | Node.js + Express, dijalankan dengan `tsx` |
| Validasi | Zod |
| Database | PostgreSQL di **Docker lokal** (`docker-compose.yml`) |
| ORM | **Prisma 7** dengan adapter `@prisma/adapter-pg` (`PrismaPg`) dan `prisma.config.ts` |
| Auth | bcrypt + JSON Web Token |
| Pembayaran | Midtrans **Core API** QRIS, mode **Sandbox** |
| Frontend | React + Vite + TypeScript |
| UI | Tailwind CSS + shadcn/ui (Button, Input, Dialog, Sheet, Table, Badge, Sonner, Tabs, Select, Switch) |
| Ikon | Phosphor Icons (garis 1.5px) |
| HTTP | Axios (dengan interceptor untuk token dan 401) |
| Routing | react-router-dom |
| State | Context API (AuthContext, CartContext) |

---

## 6. Aturan bisnis (WAJIB diikuti)

### 6.1 Uang
- Semua nilai uang adalah **`Int` dalam Rupiah**. Tidak ada desimal, tidak ada float.
- Tampilan: `Rp 66.550` (titik pemisah ribuan), angka memakai font monospace.

### 6.2 Harga, biaya bungkus, dan pajak
- Harga menu yang tersimpan adalah harga **sebelum pajak**.
- **Biaya bungkus Rp 2.000** hanya untuk kanal **Bungkus** (per pesanan), dan ikut dikenai pajak.
- **PB1 (Pajak Restoran) 10%**.
- Rumus:
  ```
  subtotal   = Σ (harga × qty)
  biayaBungkus = channel === 'TAKEAWAY' ? 2000 : 0
  pajak      = Math.round((subtotal + biayaBungkus) * 0.10)
  total      = subtotal + biayaBungkus + pajak
  ```
- **Total selalu dihitung ulang di server.** Frontend hanya mengirim `menuId` dan `qty`; harga dari frontend diabaikan.
- Contoh acuan (harus cocok dengan mockup):
  - Makan di Tempat: 1 Rendang 19.500 + 1 Ayam Pop 18.000 + 2 Nasi Putih 12.000 + 2 Es Teh Manis 11.000 → subtotal **60.500**, PB1 **6.050**, total **66.550**. Bayar 100.000 → kembalian **33.450**.
  - Bungkus: total **Rp 30.250** (subtotal 25.500 + bungkus 2.000 = 27.500, PB1 2.750).

### 6.3 Stok
- Menu bisa **dilacak stoknya** (`trackStock = true`) atau **tidak dilacak** (contoh: Nasi Putih, Es Teh Manis). Menu tidak dilacak selalu bisa dijual.
- **Sisa kemarin terbawa** ke hari ini (makanan Padang dipanaskan dan dijual lagi). Tidak ada reset stok harian, admin **tidak** perlu membuat ulang menu setiap hari.
- Stok **berkurang otomatis** saat transaksi **lunas** (`PAID`). Untuk QRIS, stok baru berkurang saat Midtrans mengonfirmasi lunas, bukan saat QR dibuat.
- Admin mengubah stok **hanya lewat "Atur Stok"**. Field stok di form Ubah Menu **dikunci** (hanya tampil). Di form Tambah Menu ada switch **"Lacak stok"** dan stok awal.
- Alasan Atur Stok:
  - **Tambah**: `Hasil masak`, `Salah hitung`
  - **Kurangi**: `Dibawa pulang`, `Rusak/basi`, `Salah hitung`
- Setiap perubahan stok (penjualan, tambah, kurangi) dicatat di tabel **`StockLog`** dengan jumlah perubahan, stok sesudahnya, alasan, catatan opsional, siapa, dan kapan.
- Status stok di tampilan:
  - `0` → **Habis** (merah), tidak bisa ditambahkan ke pesanan.
  - `1–6` → **Menipis** (kuning), contoh badge "Sisa 6".
  - `> 6` → **Tersedia**.
  - Tidak dilacak → teks redup, tanpa angka.
- Kasir tidak bisa menambah qty melebihi stok (tampilkan toast). Server juga memeriksa ulang stok di dalam `$transaction` dan menolak kalau tidak cukup.

### 6.4 Nomor tiket
- Format `A-001`, `A-002`, ... **reset setiap hari**.
- Simpan `businessDate` (tanggal, zona waktu **Asia/Jakarta**) dan `ticketNo` (Int). Unik gabungan `@@unique([businessDate, ticketNo])`.
- Nomor diambil di dalam `$transaction` (ambil max hari ini + 1). Kalau bentrok unik, ulangi sekali.
- Panel pesanan menampilkan "Tiket berikutnya A-010" (dari endpoint, hanya perkiraan).

### 6.5 Idempotensi
- Frontend membuat `clientRef` (UUID, `crypto.randomUUID()`) saat pesanan mulai dibayar dan mengirimnya ke server.
- `clientRef` unik di database. Kalau server menerima `clientRef` yang sama, kembalikan transaksi yang sudah ada, jangan buat baru.

### 6.6 Simpan transaksi Tunai
Satu `prisma.$transaction`:
1. Validasi item dan ambil harga dari database.
2. Hitung subtotal, bungkus, pajak, total.
3. Validasi uang diterima ≥ total.
4. Cek dan kurangi stok menu yang dilacak, tulis `StockLog` tipe `SALE`.
5. Buat nomor tiket.
6. Simpan `Transaction` (status `PAID`) dan `TransactionItem` (snapshot nama + harga).

### 6.7 QRIS Midtrans
- Pakai **Core API** `POST /v2/charge` dengan `payment_type: "qris"` (Sandbox). Server key di `.env`, **tidak pernah** dikirim ke frontend.
- Alur:
  1. Kasir pilih QRIS → backend buat `Transaction` status **`PENDING`** (belum kurangi stok, cek stok cukup), buat charge ke Midtrans dengan `order_id` **unik per percobaan** (contoh `A-010-20261112-1`, percobaan berikutnya `-2`), simpan URL/string QR dan `expiresAt` (15 menit).
  2. Frontend menampilkan QR dan **polling** `GET /api/transactions/:id/status` setiap **3 detik**.
  3. Backend memanggil Midtrans `GET /v2/{order_id}/status`. Kalau `settlement` → dalam `$transaction`: kurangi stok + `StockLog`, ubah status ke **`PAID`**, isi `paidAt`. Kalau `expire` → **`EXPIRED`**.
  4. **Webhook tidak dipakai** karena server berjalan di localhost (Midtrans tidak bisa menjangkaunya). Polling sudah cukup untuk tugas.
  5. **Buat QR Baru** → charge baru dengan `order_id` baru untuk transaksi yang sama.
  6. **Ganti ke Tunai** → batalkan charge di Midtrans (`POST /v2/{order_id}/cancel`) dulu, transaksi QRIS jadi **`CANCELLED`**, lalu lanjut ke pembayaran tunai (transaksi tunai dibuat dengan alur 6.6).
  7. **Gagal terhubung** ke Midtrans → tampilkan pesan "Tidak bisa terhubung ke layanan QRIS", tombol "Coba Lagi" dan "Ganti ke Tunai".
- Hanya transaksi `PAID` yang dihitung di omzet, riwayat kasir, dan dashboard.

### 6.8 Hak akses
- Middleware `authenticateToken` (401 kalau token hilang/invalid/kedaluwarsa) dan `requireRole('ADMIN')` (403).
- Kasir hanya bisa membaca menu aktif, membuat transaksi, dan melihat transaksinya sendiri hari ini.
- Password minimal 8 karakter. Jangan pernah mengembalikan `passwordHash` di response.

---

## 7. Schema Prisma versi tugas

Ini rancangan; boleh disesuaikan sedikit, tapi pertahankan konsepnya.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"   // sesuaikan dengan struktur proyek
}

datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN
  CASHIER
}

enum Channel {
  DINE_IN
  TAKEAWAY
}

enum PaymentMethod {
  CASH
  QRIS
}

enum TransactionStatus {
  PENDING
  PAID
  EXPIRED
  CANCELLED
}

enum StockLogType {
  SALE
  ADD
  REDUCE
}

model User {
  id           Int           @id @default(autoincrement())
  name         String
  email        String        @unique
  passwordHash String
  role         Role          @default(CASHIER)
  isActive     Boolean       @default(true)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  transactions Transaction[]
  stockLogs    StockLog[]
}

model Category {
  id        Int      @id @default(autoincrement())
  code      String   @unique          // LK, GK, SY, PL, MN
  name      String
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  menus     Menu[]
}

model Menu {
  id         Int               @id @default(autoincrement())
  code       String            @unique   // LK-001, dibuat otomatis
  name       String
  price      Int                          // Rupiah, sebelum pajak
  trackStock Boolean           @default(true)
  stockQty   Int?                         // null kalau tidak dilacak
  categoryId Int
  category   Category          @relation(fields: [categoryId], references: [id])
  archivedAt DateTime?                    // soft delete
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt
  items      TransactionItem[]
  stockLogs  StockLog[]
}

model Transaction {
  id              Int               @id @default(autoincrement())
  clientRef       String            @unique
  businessDate    DateTime          @db.Date
  ticketNo        Int
  channel         Channel
  paymentMethod   PaymentMethod
  status          TransactionStatus @default(PENDING)
  subtotal        Int
  takeoutFee      Int               @default(0)
  tax             Int
  total           Int
  cashReceived    Int?
  changeAmount    Int?
  midtransOrderId String?           @unique
  qrUrl           String?
  expiresAt       DateTime?
  paidAt          DateTime?
  cashierId       Int
  cashier         User              @relation(fields: [cashierId], references: [id])
  items           TransactionItem[]
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@unique([businessDate, ticketNo])
  @@index([cashierId, businessDate])
}

model TransactionItem {
  id            Int         @id @default(autoincrement())
  transactionId Int
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  menuId        Int
  menu          Menu        @relation(fields: [menuId], references: [id])
  nameSnapshot  String
  priceSnapshot Int
  qty           Int
  lineTotal     Int
}

model StockLog {
  id            Int          @id @default(autoincrement())
  menuId        Int
  menu          Menu         @relation(fields: [menuId], references: [id])
  type          StockLogType
  change        Int                    // negatif untuk SALE/REDUCE
  stockAfter    Int
  reason        String?                // Hasil masak, Dibawa pulang, dst.
  note          String?
  transactionId Int?
  userId        Int
  user          User         @relation(fields: [userId], references: [id])
  createdAt     DateTime     @default(now())

  @@index([menuId, createdAt])
}
```

Catatan:
- Nomor tiket tampil = `"A-" + String(ticketNo).padStart(3, "0")`.
- Catatan nomor tiket untuk transaksi QRIS: tiket dibuat saat transaksi dibuat (status PENDING). Kalau transaksi dibatalkan/kedaluwarsa nomornya terlewat, itu wajar dan tidak masalah untuk versi tugas.
- Migrasi lama dihapus, buat migrasi baru bernama `init`.

---

## 8. Rancangan API

Semua di bawah `/api`. Response error seragam: `{ "message": "..." , "errors"?: [...] }`.

### Auth
| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/auth/login` | publik | email + password → `{ token, user }` |
| GET | `/auth/me` | login | data user dari token |

### Kategori
| GET | `/categories` | login | urut `sortOrder` |
|---|---|---|---|
| POST | `/categories` | admin | |
| PATCH | `/categories/:id` | admin | |
| DELETE | `/categories/:id` | admin | tolak kalau masih punya menu aktif |

### Menu
| GET | `/menus?search=&categoryId=&includeArchived=` | login | kasir hanya menu aktif |
|---|---|---|---|
| GET | `/menus/:id` | admin | |
| POST | `/menus` | admin | kode otomatis; stok awal → `StockLog ADD` alasan "Stok awal" |
| PATCH | `/menus/:id` | admin | **tidak** menerima `stockQty` |
| DELETE | `/menus/:id` | admin | isi `archivedAt` (soft delete) |
| POST | `/menus/:id/stock` | admin | `{ type: "ADD" \| "REDUCE", qty, reason, note? }` |
| GET | `/menus/:id/stock-logs` | admin | riwayat stok |

### Transaksi
| GET | `/transactions/next-ticket` | login | perkiraan nomor berikutnya |
|---|---|---|---|
| POST | `/transactions/cash` | login | `{ clientRef, channel, items:[{menuId, qty}], cashReceived }` |
| POST | `/transactions/qris` | login | `{ clientRef, channel, items }` → buat PENDING + charge |
| GET | `/transactions/:id/status` | login | polling, cek ke Midtrans |
| POST | `/transactions/:id/qris/regenerate` | login | QR baru |
| POST | `/transactions/:id/qris/cancel` | login | batalkan sebelum ganti ke tunai |
| GET | `/transactions/mine/today` | kasir | riwayat kasir hari ini |
| GET | `/transactions?from=&to=&cashierId=&method=&page=` | admin | semua transaksi |
| GET | `/transactions/:id` | login | kasir hanya miliknya |

### Dashboard
| GET | `/dashboard/today` | admin | jumlah transaksi, omzet, menu terlaris, stok menipis, transaksi terakhir |
|---|---|---|---|

### Akun kasir
| GET | `/users?role=CASHIER` | admin | |
|---|---|---|---|
| POST | `/users` | admin | |
| PATCH | `/users/:id` | admin | nama, email, isActive |
| POST | `/users/:id/reset-password` | admin | |

---

## 9. Frontend

### 9.1 Rute
```
/login
/admin                 → Dashboard
/admin/menu            → Daftar menu (+ dialog tambah/ubah, sheet Atur Stok & Riwayat Stok)
/admin/kategori        → Kategori
/admin/transaksi       → Daftar transaksi (+ drawer detail)
/admin/kasir           → Akun kasir
/kasir                 → Layar POS (+ modal pembayaran, tunai, QRIS, berhasil)
/kasir/riwayat         → Riwayat kasir hari ini
/akses-ditolak         → 403
```
Guard rute: belum login → `/login`; peran salah → `/akses-ditolak`.

### 9.2 Struktur yang disarankan
```
src/
  api/        axios instance + fungsi per resource
  context/    AuthContext, CartContext
  components/ ui (shadcn), layout (AdminLayout, CashierLayout), shared
  pages/      admin/*, kasir/*, Login, Forbidden
  lib/        format Rupiah, hitung total (sama dengan server, hanya untuk tampilan)
```

### 9.3 Sistem desain
- **Warna**: hijau pinus `#17352E` (sidebar, tombol utama), aktif `#234E44`, merah cabai `#D8432A` (error/habis), kuning kunyit `#E2A82E` (aksen, logo, menipis), hijau daun `#2F8F5B` (sukses/lunas), latar halaman `#F2F4F1`, garis `#DDE2DC`, teks utama `#14201C`, teks sekunder `#5F6B66`. Jadikan variabel CSS/Tailwind; mockup kadang terlihat hijau mint, abaikan dan pakai `#F2F4F1`.
- **Font**: Source Serif 4 (judul), IBM Plex Sans (isi), IBM Plex Mono (angka dan uang).
- **Sidebar/rail** bermotif garis diagonal tipis: `repeating-linear-gradient(45deg/-45deg, rgba(255,255,255,0.05) ..., 12px)`.
- **Admin**: dirancang 1440×900, sidebar 260px + top bar putih 64px.
- **Kasir**: dirancang 1280×800, rail kiri 88px berisi Kasir, Riwayat, Keluar; top bar berisi nama toko, tanggal, nama kasir.
- Kartu menu kasir: **tanpa foto**, grid 4 kolom, badge stok di baris atas, nama boleh 2 baris (`line-clamp-2`), harga di bawah. Kartu yang ada di keranjang diberi garis tepi hijau 2px dan lingkaran jumlah.
- Dark mode ditunda.

---

## 10. Data seed

**Akun** (password contoh semua `password123`, ganti sesuai kebutuhan):
- Admin: **Rizal Chaniago**
- Kasir: **Nia Sari**, **Dewi Anggraini**, **Fikri Hidayat**, **Rian Pratama** (nonaktif)

**Kategori**: `LK` Lauk Utama, `GK` Gulai & Kuah, `SY` Sayur, `PL` Pelengkap, `MN` Minuman.

**Menu** (12):
| Kode | Nama | Harga | Stok |
|---|---|---|---|
| LK-001 | Rendang Daging | 19.500 | 6 |
| LK-002 | Ayam Pop | 18.000 | 15 |
| LK-003 | Dendeng Balado | 22.000 | 27 |
| GK-001 | Gulai Ayam | 17.500 | 21 |
| GK-002 | Gulai Tunjang | 20.500 | 0 (habis) |
| GK-003 | Ikan Kakap Gulai | 24.500 | 14 |
| SY-001 | Terong Balado | 6.500 | 18 |
| SY-002 | Sayur Daun Singkong | 5.500 | 44 |
| PL-001 | Telur Balado | 8.500 | 33 |
| PL-002 | Perkedel | 4.500 | 38 |
| PL-003 | Nasi Putih | 6.000 | tidak dilacak |
| MN-001 | Es Teh Manis | 5.500 | tidak dilacak |

Data transaksi di mockup (tanggal **Kamis, 12 Nov 2026**): 9 transaksi hari itu (A-001 s.d. A-009) dengan total **Rp 410.850**, pesanan baru **A-010** pukul 13:05 (contoh 6.2). Riwayat Nia Sari setelah A-010: 5 transaksi total **Rp 218.350** (66.550 + 34.100 + 56.100 + 32.450 + 29.150). A-009 = 1 Rendang + 1 Nasi Putih + 1 Es Teh Manis = 31.000 + PB1 3.100 = **34.100**, bayar 50.000, kembalian 15.900. Seed transaksi contoh boleh dibuat agar dashboard dan riwayat tidak kosong.

---

## 11. Kondisi kode saat ini dan perbaikan yang perlu

Kode lama dibuat dengan AI gratis dan belum sesuai. Sebelum lanjut:
1. Rename `prisma7.config.ts` → **`prisma.config.ts`**.
2. Hapus `src/index.tsx` yang berisi kode backend (salah tempat).
3. Pisahkan backend (`server/`) dan frontend (`src/` Vite) dengan jelas.
4. Buat `server/db.ts` yang membuat `PrismaClient` dengan adapter `PrismaPg` dari `DATABASE_URL`.
5. Tambahkan ke `.env`: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION=false`, `PORT`. Buat `.env.example` tanpa nilai rahasia.
6. Ganti schema lama dengan schema versi tugas (bagian 7); arsipkan schema lengkap di `docs/schema-lengkap.prisma`. Hapus folder migrasi lama, jalankan `npx prisma migrate dev --name init`.
7. Tulis ulang `seed.ts` (seed lama pasti error dengan schema baru).
8. Tulis ulang route `auth.ts`, `menu.ts`, `transaction.ts` sesuai bagian 6 dan 8.
9. Pasang di frontend: Tailwind, shadcn/ui, axios, react-router-dom, Phosphor Icons.

---

## 12. Urutan pengerjaan

1. **Fondasi backend**: struktur folder, `.env`, Docker Postgres jalan, schema tugas, migrasi `init`, `db.ts`, seed.
2. **Auth**: login, `/auth/me`, middleware 401/403.
3. **CRUD kategori dan menu** (kode otomatis, soft delete), lalu **Atur Stok + riwayat**.
4. **Akun kasir** CRUD.
5. **Transaksi tunai** (hitung di server, `$transaction`, stok, tiket harian, `clientRef`), riwayat kasir, daftar transaksi admin, dashboard.
6. **QRIS Midtrans** Sandbox (charge, polling status, buat ulang, batal).
7. **Uji semua endpoint di Postman** sebelum frontend.
8. **Frontend**: layout + login + guard → admin (menu, kategori, stok, kasir, transaksi, dashboard) → kasir (POS, tunai, berhasil, riwayat) → QRIS → keadaan kosong/error → CSS cetak struk.
9. Rapikan, tulis README (cara menjalankan, akun demo, penjelasan alur untuk mentor).

---

## 13. Tentang mockup

Pemilik proyek mengirim gambar mockup terpisah. Mockup dibuat dengan AI desain berdasarkan prompt per batch, jadi **ada kekurangan yang diketahui**:

- **Admin**: batch B0–B7 (layout/komponen dasar, login, dashboard, daftar menu, form/stok menu, transaksi, akun kasir, keadaan khusus seperti akses ditolak dan gagal memuat).
- **Kasir**: K1 (POS), K2 (bayar tunai, uang kurang, berhasil, gagal simpan), K3 (kosongkan pesanan, riwayat, detail, riwayat kosong), K4 (sesi berakhir, gagal memuat menu), K5 (pilih metode, QRIS menunggu, berhasil, kedaluwarsa, gagal terhubung).
- Total ada 52 file, dengan beberapa layar QRIS punya dua versi.

**Abaikan elemen berikut kalau muncul di mockup** (karangan AI desain, tidak termasuk ruang lingkup):
- Foto makanan di kartu menu, deskripsi menu, badge "Laris/Pokok/Segar".
- Tombol **Diskon, Pisah, Cetak Bill Sementara, Debit EDC, QRIS Statis**, pembulatan, catatan tambahan.
- Semua teks **"Meja"**, "Terminal POS", "Lantai 1", "Reg: #01", NMID, "Merchant Settled", "KDS Dapur", "Printer Dapur Siap", barcode, breadcrumb, pil status sinkronisasi, "terenkripsi", kartu shift/kas awal laci.
- Badge pintasan keyboard (F1, F2, P, Spasi, Ctrl+P). Pintasannya boleh dibuat nanti, tapi tidak ditampilkan.
- Nomor tiket selain format `A-xxx` (contoh `#A-042`, `#ORD-084`) dan menu/harga yang tidak ada di daftar seed.
- Latar halaman yang terlihat hijau mint (pakai `#F2F4F1`).
- Dashboard admin belum sempurna; susun ulang berdasarkan data endpoint `/dashboard/today`.

Kalau ada keraguan antara mockup dan dokumen ini, ikuti dokumen ini dan konfirmasi ke pemilik proyek.

---

## 14. Roadmap setelah tugas lulus (tahap 2)

Jangan dikerjakan sekarang. Dicatat supaya struktur kode tidak menutup jalan ke sana.

- **V1 lanjutan (operasional)**: login PIN kasir, shift + kas awal + blind close + rekonsiliasi, hold pesanan, diskon, void dengan persetujuan admin, paket menu, log aktivitas, laporan lengkap, webhook Midtrans saat sudah di-deploy, pengaturan toko.
- **V2 (bisnis)**: HPP, resep dan bahan baku, rencana masak, sisa terbuang, biaya operasional, laba, kasbon, pesanan besar/katering, bagi tagihan, ubah harga massal.
- **V3 (AI)**: asisten virtual owner untuk merangkum dan menganalisis penjualan serta menyarankan jumlah masak.

Schema lengkap di `docs/schema-lengkap.prisma` adalah titik awal tahap 2.

---

## 15. Cara bekerja dengan pemilik proyek

- Pemilik proyek sedang **belajar**. Jelaskan perubahan dengan bahasa Indonesia yang sederhana, terutama bagian yang akan ditanya mentor (alur auth, CRUD, `$transaction`, perhitungan pajak, alur QRIS).
- Kerjakan bertahap sesuai bagian 12, dan pastikan tiap tahap bisa dijalankan dan dites sebelum lanjut.
- Jangan menambahkan fitur di luar ruang lingkup bagian 4 tanpa bertanya.
- Jangan menyimpan rahasia (JWT secret, server key Midtrans) di kode atau di repo.
