const KhachHang = require("../models/KhachHang");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Register
exports.register = async (req, res) => {
  try {
    const { hoTen, email, matKhau } = req.body;

    const existing = await KhachHang.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email đã tồn tại" });

    const hash = await bcrypt.hash(matKhau, 10);

    const user = await KhachHang.create({
      hoTen,
      email,
      matKhau: hash
    });

    res.json(user);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, matKhau } = req.body;

    const user = await KhachHang.findOne({ email });
    if (!user) return res.status(404).json({ message: "Không tìm thấy user" });

    const isMatch = await bcrypt.compare(matKhau, user.matKhau);
    if (!isMatch) return res.status(400).json({ message: "Sai mật khẩu" });

    const token = jwt.sign({ id: user._id }, "secret", { expiresIn: "7d" });

    res.json({ user, token });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// Get profile
exports.getProfile = async (req, res) => {
  try {
    const user = await KhachHang.findById(req.user.id);
    res.json(user);
  } catch (err) {
    res.status(500).json(err.message);
  }
};