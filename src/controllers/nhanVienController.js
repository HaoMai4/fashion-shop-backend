const NhanVien = require("../models/NhanVien");

exports.createNhanVien = async (req, res) => {
  try {
    const nv = await NhanVien.create(req.body);
    res.json(nv);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.getAllNhanVien = async (req, res) => {
  try {
    const list = await NhanVien.find();
    res.json(list);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.updateNhanVien = async (req, res) => {
  try {
    const nv = await NhanVien.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(nv);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.deleteNhanVien = async (req, res) => {
  try {
    await NhanVien.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã xóa" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};