const mongoose = require("mongoose");

const NhanVienSchema = new mongoose.Schema({
  hoTen: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  matKhau: { type: String, required: true },
  vaiTro: { 
    type: String, 
    enum: ["quanly", "nhanvien"], 
    default: "nhanvien" 
  },
  soDienThoai: String,
  trangThai: { type: String, default: "active" },
  ngayLam: Date
}, { timestamps: true });

module.exports =
  mongoose.models.NhanVien ||
  mongoose.model("NhanVien", NhanVienSchema);