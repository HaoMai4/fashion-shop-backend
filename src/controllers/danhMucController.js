const DanhMuc = require("../models/DanhMuc");

exports.createDanhMuc = async (req, res) => {
  try {
    const dm = await DanhMuc.create(req.body);
    res.json(dm);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.getAllDanhMuc = async (req, res) => {
  try {
    const list = await DanhMuc.find();
    res.json(list);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.updateDanhMuc = async (req, res) => {
  try {
    const dm = await DanhMuc.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(dm);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.deleteDanhMuc = async (req, res) => {
  try {
    await DanhMuc.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};