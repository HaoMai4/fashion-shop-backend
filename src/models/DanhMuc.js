const mongoose = require("mongoose");

const DanhMucSchema = new mongoose.Schema({
  tenDanhMuc: String,
  moTa: String
}, { timestamps: true });

module.exports = mongoose.models.DanhMuc || mongoose.model("DanhMuc", DanhMucSchema);