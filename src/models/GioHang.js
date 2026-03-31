const mongoose = require("mongoose");

const GioHangSchema = new mongoose.Schema({
  nguoiDungId: { type: mongoose.Schema.Types.ObjectId, ref: "KhachHang" },
  trangThai: String
}, { timestamps: true });

module.exports = mongoose.models.GioHang || mongoose.model("GioHang", GioHangSchema);