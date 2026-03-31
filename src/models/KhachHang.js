const mongoose = require("mongoose");

const KhachHangSchema = new mongoose.Schema({
  hoTen: String,
  email: { type: String, unique: true },
  matKhau: String,
  soDienThoai: String,
  trangThai: { type: String, default: "active" },
  diemKhachHang: { type: Number, default: 0 },
  diaChi: String
}, { timestamps: true });

module.exports =   mongoose.models.KhachHang || mongoose.model("KhachHang", KhachHangSchema);