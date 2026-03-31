const YeuThich = require("../models/YeuThich");

exports.addToWishlist = async (req, res) => {
  try {
    const item = await YeuThich.create({
      nguoiDungId: req.user.id,
      sanPhamId: req.body.sanPhamId
    });
    res.json(item);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.getWishlist = async (req, res) => {
  try {
    const list = await YeuThich.find({
      nguoiDungId: req.user.id
    }).populate("sanPhamId");

    res.json(list);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    await YeuThich.findByIdAndDelete(req.params.id);
    res.json({ message: "Removed" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};