const KhuyenMai = require("../models/KhuyenMai");

exports.createKhuyenMai = async (req, res) => {
  try {
    const km = await KhuyenMai.create(req.body);
    res.json(km);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.getAllKhuyenMai = async (req, res) => {
  try {
    const list = await KhuyenMai.find();
    res.json(list);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.updateKhuyenMai = async (req, res) => {
  try {
    const km = await KhuyenMai.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(km);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.deleteKhuyenMai = async (req, res) => {
  try {
    await KhuyenMai.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};