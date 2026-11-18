import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from "@prisma/client";

dotenv.config();

const app = express();
const prisma = new PrismaClient(); // Sekarang sudah aman
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Menguji koneksi database sederhana dengan prisma
app.get('/', async (_req, res) => {
  try {
    // Tes kecil untuk menggunakan prisma
    await prisma.$queryRaw`SELECT 1`;
    res.json({ message: 'Server backend & Database PostgreSQL terhubung!' });
  } catch (error) {
    res.status(500).json({ message: 'Koneksi database gagal', error });
  }
});

app.listen(PORT, () => {
  console.log(`Server backend sedang jalan di localhost:${PORT}`);
});