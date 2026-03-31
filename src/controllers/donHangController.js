const DonHang = require("../models/DonHang");
const ChiTietDonHang = require("../models/ChiTietDonHang");

exports.createOrder = async (req, res) => {
  try {
    const { items } = req.body;

    const order = await DonHang.create({
      nguoiDungId: req.user.id,
      tongTien: 0
    });

    let total = 0;

    for (let item of items) {
      const ct = await ChiTietDonHang.create({
        donHangId: order._id,
        bienTheId: item.bienTheId,
        soLuong: item.soLuong,
        giaTien: item.giaTien,
        tongTien: item.soLuong * item.giaTien
      });

      total += ct.tongTien;
    }

    order.tongTien = total;
    await order.save();

    res.json(order);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.getOrders = async (req, res) => {
  try {
    const orders = await DonHang.find().populate("nguoiDungId");
    res.json(orders);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await DonHang.find({
      nguoiDungId: req.user.id
    }).populate("nguoiDungId");

    res.json(orders);
  } catch (err) {
    res.status(500).json(err.message);
  }
};