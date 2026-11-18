import "dotenv/config"
import express from 'express';
import cors from 'cors';
import { z } from "zod";
import { errorHandler, notFound } from "./middleware/error.ts";
import authRouter from "./routes/auth.ts";
import categoryRouter from "./routes/categories.ts";
import menuRouter from "./routes/menus.ts";
import userRouter from "./routes/users.ts";

//pesan error zod pakai bahasa indonesia
z.config(z.locales.id());

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors({ origin: "http://localhost:5173"}));
app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({ message: "Backend Awak punyo aktif"});
});

app.use("/api/auth", authRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/menus", menuRouter);
app.use("/api/users", userRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server backend berjalan di http://localhost:${PORT}`);
});
