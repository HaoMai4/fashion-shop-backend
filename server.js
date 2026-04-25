const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { ENV, connectDB } = require("./src/config");

const app = express();

app.use(express.json());

// CORS: support multiple allowed origins via env CLIENT_URLS
const rawClientUrls = process.env.CLIENT_URLS || process.env.CLIENT_URL || "";
const allowedOrigins = rawClientUrls
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (process.env.NODE_ENV !== "production") {
  [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
    "https://web-ecom-omega.vercel.app",
    "https://arc-ecommerce-pos.dfm-engineering.com",
  ].forEach((origin) => {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  });
}

console.log("Allowed CORS origins:", allowedOrigins);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn("Blocked CORS origin:", origin);
    return callback(
      new Error("CORS policy: This origin is not allowed - " + origin)
    );
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));

// Optional training cron. Keep disabled on Render unless needed.
if (process.env.ENABLE_TRAINING_CRON === "true") {
  require("./src/cron/trainModelJob");
}

// Routes
app.use("/api/users", require("./src/routes/userRoutes"));
app.use("/api/categories", require("./src/routes/categoryRoutes"));
app.use("/api/products", require("./src/routes/productRoutes"));
app.use("/api/variants", require("./src/routes/variantRoutes"));
app.use("/api/chat", require("./src/routes/chatRoutes"));
app.use("/api/cart", require("./src/routes/cartRoutes"));
app.use("/api/orders", require("./src/routes/orderRoutes"));
app.use("/api/vouchers", require("./src/routes/voucherRoutes"));
app.use("/api/admin/stats", require("./src/routes/statisRoutes"));

app.get("/ping", (req, res) => {
  res.status(200).send("ok");
});

app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Server error",
  });
});

const PORT = process.env.PORT || ENV.PORT || 8686;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server on ${PORT}`));
  })
  .catch((error) => {
    console.error("Failed to connect database:", error);
    process.exit(1);
  });