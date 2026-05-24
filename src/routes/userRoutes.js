const express = require("express");
const router = express.Router();

const {
  register,
  login,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  updateMe,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  registerAdmin,
  socialLogin,
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  listCustomers,
  getCustomerDetail,
  listStaffs,
  createStaffByAdmin,
  updateStaff,
  deleteStaff,
  listPublicStaffs,
} = require("../controllers/userController");

const { authMiddleware, adminOnly } = require("../middlewares/authMiddleware");

router.get("/public/staffs", listPublicStaffs);

// Auth
router.post("/social-login", socialLogin);
router.post("/register", register);
router.post("/register-admin", authMiddleware, adminOnly, registerAdmin);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.put("/change-password", authMiddleware, changePassword);
router.get("/me", authMiddleware, getMe);
router.put("/me", authMiddleware, updateMe);

// Wishlist
router.get("/wishlist", authMiddleware, getWishlist);
router.post("/wishlist/:productId", authMiddleware, addToWishlist);
router.delete("/wishlist/:productId", authMiddleware, removeFromWishlist);

// Giữ lại để không làm hỏng frontend cũ nếu đang gửi productId trong body
router.post("/wishlist", authMiddleware, addToWishlist);
router.delete("/wishlist", authMiddleware, removeFromWishlist);

// Address routes
router.get("/address", authMiddleware, getAddresses);
router.post("/address", authMiddleware, addAddress);
router.put("/address/:addressId", authMiddleware, updateAddress);
router.delete("/address/:addressId", authMiddleware, deleteAddress);
router.patch("/address/:addressId/default", authMiddleware, setDefaultAddress);

// Admin customer routes
router.get("/admin/customers", authMiddleware, adminOnly, listCustomers);
router.get("/admin/customers/:id", authMiddleware, adminOnly, getCustomerDetail);

// Admin staff routes
router.get("/admin/staffs", authMiddleware, adminOnly, listStaffs);
router.post("/admin/staffs", authMiddleware, adminOnly, createStaffByAdmin);
router.put("/admin/staffs/:id", authMiddleware, adminOnly, updateStaff);
router.delete("/admin/staffs/:id", authMiddleware, adminOnly, deleteStaff);

module.exports = router;