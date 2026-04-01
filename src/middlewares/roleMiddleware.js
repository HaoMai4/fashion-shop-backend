exports.isManager = (req, res, next) => {
  if (req.user.role !== "quanly") {
    return res.status(403).json("Không có quyền");
  }
  next();
};