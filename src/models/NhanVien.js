const mongoose = require("mongoose");

const NhanVienSchema = new mongoose.Schema({
  hoTen: String,
  email: String,
  matKhau: String,
  vaiTro: String,
  soDienThoai: String,
  trangThai: String,
  ngayLam: Date
}, { timestamps: true });

module.exports =  mongoose.models.NhanVien || mongoose.model("NhanVien", NhanVienSchema);