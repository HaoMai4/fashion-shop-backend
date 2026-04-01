const NhanVien = require("../models/NhanVien");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Thêm nhân viên
exports.createNhanVien = async (req, res) => {
  try {
    const { hoTen, email, matKhau, vaiTro } = req.body;

    const exist = await NhanVien.findOne({ email });
    if (exist) return res.status(400).json("Email đã tồn tại");

    const hash = await bcrypt.hash(matKhau, 10);

    const nv = await NhanVien.create({
      hoTen,
      email,
      matKhau: hash,
      vaiTro
    });

    res.json(nv);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// LOGIN NHÂN VIÊN
exports.loginNhanVien = async (req, res) => {
  try {
    const { email, matKhau } = req.body;

    const nv = await NhanVien.findOne({ email });
    if (!nv) return res.status(404).json("Không tìm thấy");

    const isMatch = await bcrypt.compare(matKhau, nv.matKhau);
    if (!isMatch) return res.status(400).json("Sai mật khẩu");

    const token = jwt.sign(
      { id: nv._id, role: nv.vaiTro },
      "secret",
      { expiresIn: "7d" }
    );

    nv.matKhau = undefined;

    res.json({ nv, token });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// Lấy danh sách
exports.getAllNhanVien = async (req, res) => {
  try {
    const list = await NhanVien.find();
    res.json(list);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// Update
exports.updateNhanVien = async (req, res) => {
  try {
    const nv = await NhanVien.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(nv);
  } catch (err) {
    res.status(500).json(err.message);
  }
};