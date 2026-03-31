require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/DB");

// Import routes
const khachHangRoutes = require("./routes/khachHangRoutes");
const nhanVienRoutes = require("./routes/nhanVienRoutes");
const sanPhamRoutes = require("./routes/sanPhamRoutes");
const gioHangRoutes = require("./routes/gioHangRoutes");
const donHangRoutes = require("./routes/donHangRoutes");
const bienTheRoutes = require("./routes/bienTheSanPhamRoutes");
const khuyenMaiRoutes = require("./routes/khuyenMaiRoutes");
const yeuThichRoutes = require("./routes/yeuThichRoutes");
const danhMucRoutes = require("./routes/danhMucRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect DB
connectDB();

// Routes
app.use("/api/users", khachHangRoutes);
app.use("/api/staff", nhanVienRoutes);
app.use("/api/products", sanPhamRoutes);
app.use("/api/cart", gioHangRoutes);
app.use("/api/orders", donHangRoutes);
app.use("/api/variants", bienTheRoutes);
app.use("/api/promotions", khuyenMaiRoutes);
app.use("/api/wishlist", yeuThichRoutes);
app.use("/api/categories", danhMucRoutes);

// Test API
app.get("/", (req, res) => {
  res.send("API is running...");
});

// 404 handler (optional nhưng nên có)
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));