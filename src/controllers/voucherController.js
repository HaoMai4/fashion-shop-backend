const Voucher = require("../models/Voucher");

const normalizeCode = (code) => {
  return String(code || "").trim().toUpperCase();
};

const normalizeText = (value) => {
  return String(value || "").trim();
};

const toNullableNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return Number(value);
};

const isUsageLimitReached = (voucher) => {
  return (
    voucher.usageLimit !== null &&
    voucher.usageLimit !== undefined &&
    Number(voucher.usedCount || 0) >= Number(voucher.usageLimit)
  );
};

const getUserUsedCount = (voucher, userId) => {
  if (!userId) return 0;

  const usedRecord = (voucher.usersUsed || []).find(
    (item) => item.user?.toString() === userId.toString()
  );

  return usedRecord ? Number(usedRecord.count || 0) : 0;
};

const isPerUserLimitReached = (voucher, userId) => {
  if (!userId) return false;

  return (
    voucher.perUserLimit !== null &&
    voucher.perUserLimit !== undefined &&
    getUserUsedCount(voucher, userId) >= Number(voucher.perUserLimit)
  );
};

const calculateDiscount = (voucher, orderTotal) => {
  const total = Number(orderTotal || 0);

  if (total <= 0) return 0;

  let discount = 0;

  if (voucher.type === "percent") {
    discount = Math.floor((total * Number(voucher.value || 0)) / 100);

    if (voucher.maxDiscount !== null && voucher.maxDiscount !== undefined) {
      discount = Math.min(discount, Number(voucher.maxDiscount || 0));
    }
  }

  if (voucher.type === "fixed") {
    discount = Number(voucher.value || 0);
  }

  return Math.min(discount, total);
};

const validateVoucherForAmount = ({ voucher, orderTotal, userId }) => {
  const now = new Date();
  const total = Number(orderTotal || 0);

  if (!voucher) {
    return {
      valid: false,
      message: "Mã voucher không tồn tại",
    };
  }

  if (!voucher.active) {
    return {
      valid: false,
      message: "Mã voucher đã bị tắt",
    };
  }

  if (voucher.startAt && now < new Date(voucher.startAt)) {
    return {
      valid: false,
      message: "Mã voucher chưa đến thời gian áp dụng",
    };
  }

  if (voucher.endAt && now > new Date(voucher.endAt)) {
    return {
      valid: false,
      message: "Mã voucher đã hết hạn",
    };
  }

  if (isUsageLimitReached(voucher)) {
    return {
      valid: false,
      message: "Mã voucher đã hết lượt sử dụng",
    };
  }

  if (isPerUserLimitReached(voucher, userId)) {
    return {
      valid: false,
      message: "Bạn đã sử dụng hết lượt cho mã voucher này",
    };
  }

  if (total < Number(voucher.minOrderValue || 0)) {
    return {
      valid: false,
      message: `Đơn hàng cần tối thiểu ${Number(
        voucher.minOrderValue || 0
      ).toLocaleString("vi-VN")}đ để áp dụng mã này`,
    };
  }

  return {
    valid: true,
    message: "Mã voucher hợp lệ",
  };
};

exports.getAllVouchers = async (req, res) => {
  try {
    const { active, visibleToUsers, q } = req.query;

    const filter = {};

    if (typeof active !== "undefined") {
      filter.active = active === "true";
    }

    if (typeof visibleToUsers !== "undefined") {
      filter.visibleToUsers = visibleToUsers === "true";
    }

    if (q) {
      filter.$or = [
        {
          code: {
            $regex: q.trim(),
            $options: "i",
          },
        },
        {
          title: {
            $regex: q.trim(),
            $options: "i",
          },
        },
        {
          description: {
            $regex: q.trim(),
            $options: "i",
          },
        },
      ];
    }

    const vouchers = await Voucher.find(filter).sort({ createdAt: -1 }).lean();

    return res.json(vouchers);
  } catch (err) {
    console.error("Get vouchers error:", err);
    return res.status(500).json({
      message: "Không thể tải danh sách voucher",
    });
  }
};

exports.createVoucher = async (req, res) => {
  try {
    const data = { ...req.body };

    data.code = normalizeCode(data.code);

    if (!data.code) {
      return res.status(400).json({
        message: "Vui lòng nhập mã voucher",
      });
    }

    if (!["percent", "fixed"].includes(data.type)) {
      return res.status(400).json({
        message: "Loại voucher không hợp lệ",
      });
    }

    if (Number(data.value || 0) <= 0) {
      return res.status(400).json({
        message: "Giá trị giảm giá phải lớn hơn 0",
      });
    }

    if (data.type === "percent" && Number(data.value) > 100) {
      return res.status(400).json({
        message: "Voucher phần trăm không được vượt quá 100%",
      });
    }

    if (!data.endAt) {
      return res.status(400).json({
        message: "Vui lòng nhập ngày kết thúc voucher",
      });
    }

    const startAt = data.startAt ? new Date(data.startAt) : new Date();
    const endAt = new Date(data.endAt);

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return res.status(400).json({
        message: "Ngày áp dụng voucher không hợp lệ",
      });
    }

    if (startAt > endAt) {
      return res.status(400).json({
        message: "Ngày kết thúc phải sau ngày bắt đầu",
      });
    }

    const existed = await Voucher.findOne({ code: data.code });

    if (existed) {
      return res.status(400).json({
        message: "Mã voucher đã tồn tại",
      });
    }

    const voucher = await Voucher.create({
      code: data.code,
      title: normalizeText(data.title),
      description: normalizeText(data.description),
      detail: normalizeText(data.detail),
      terms: normalizeText(data.terms),
      type: data.type,
      value: Number(data.value),
      maxDiscount: toNullableNumber(data.maxDiscount),
      startAt,
      endAt,
      usageLimit: toNullableNumber(data.usageLimit),
      usedCount: Number(data.usedCount || 0),
      perUserLimit:
        data.perUserLimit === null ||
          data.perUserLimit === undefined ||
          data.perUserLimit === ""
          ? 1
          : Number(data.perUserLimit),
      applicableProducts: data.applicableProducts || [],
      applicableCategories: data.applicableCategories || [],
      minOrderValue: Number(data.minOrderValue || 0),
      active: typeof data.active === "boolean" ? data.active : true,
      visibleToUsers:
        typeof data.visibleToUsers === "boolean" ? data.visibleToUsers : true,
      combinable: typeof data.combinable === "boolean" ? data.combinable : false,
      createdBy: req.user?.id,
    });

    return res.status(201).json(voucher);
  } catch (err) {
    console.error("Create voucher error:", err);
    return res.status(500).json({
      message: "Không thể tạo voucher",
    });
  }
};

exports.updateVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body };

    const voucher = await Voucher.findById(id);

    if (!voucher) {
      return res.status(404).json({
        message: "Không tìm thấy voucher",
      });
    }

    if (data.code !== undefined) {
      const nextCode = normalizeCode(data.code);

      if (!nextCode) {
        return res.status(400).json({
          message: "Mã voucher không hợp lệ",
        });
      }

      const existed = await Voucher.findOne({
        code: nextCode,
        _id: { $ne: id },
      });

      if (existed) {
        return res.status(400).json({
          message: "Mã voucher đã tồn tại",
        });
      }

      voucher.code = nextCode;
    }

    if (data.title !== undefined) {
      voucher.title = normalizeText(data.title);
    }

    if (data.description !== undefined) {
      voucher.description = normalizeText(data.description);
    }

    if (data.detail !== undefined) {
      voucher.detail = normalizeText(data.detail);
    }

    if (data.terms !== undefined) {
      voucher.terms = normalizeText(data.terms);
    }

    if (data.type !== undefined) {
      if (!["percent", "fixed"].includes(data.type)) {
        return res.status(400).json({
          message: "Loại voucher không hợp lệ",
        });
      }

      voucher.type = data.type;
    }

    if (data.value !== undefined) {
      if (Number(data.value || 0) <= 0) {
        return res.status(400).json({
          message: "Giá trị giảm giá phải lớn hơn 0",
        });
      }

      const nextType = data.type || voucher.type;

      if (nextType === "percent" && Number(data.value) > 100) {
        return res.status(400).json({
          message: "Voucher phần trăm không được vượt quá 100%",
        });
      }

      voucher.value = Number(data.value);
    }

    if (data.maxDiscount !== undefined) {
      voucher.maxDiscount = toNullableNumber(data.maxDiscount);
    }

    if (data.startAt !== undefined) {
      const startAt = new Date(data.startAt);

      if (Number.isNaN(startAt.getTime())) {
        return res.status(400).json({
          message: "Ngày bắt đầu không hợp lệ",
        });
      }

      voucher.startAt = startAt;
    }

    if (data.endAt !== undefined) {
      const endAt = new Date(data.endAt);

      if (Number.isNaN(endAt.getTime())) {
        return res.status(400).json({
          message: "Ngày kết thúc không hợp lệ",
        });
      }

      voucher.endAt = endAt;
    }

    if (voucher.startAt > voucher.endAt) {
      return res.status(400).json({
        message: "Ngày kết thúc phải sau ngày bắt đầu",
      });
    }

    if (data.usageLimit !== undefined) {
      voucher.usageLimit = toNullableNumber(data.usageLimit);
    }

    if (data.perUserLimit !== undefined) {
      voucher.perUserLimit =
        data.perUserLimit === null || data.perUserLimit === ""
          ? null
          : Number(data.perUserLimit);
    }

    if (data.applicableProducts !== undefined) {
      voucher.applicableProducts = data.applicableProducts || [];
    }

    if (data.applicableCategories !== undefined) {
      voucher.applicableCategories = data.applicableCategories || [];
    }

    if (data.minOrderValue !== undefined) {
      voucher.minOrderValue = Number(data.minOrderValue || 0);
    }

    if (typeof data.active === "boolean") {
      voucher.active = data.active;
    }

    if (typeof data.visibleToUsers === "boolean") {
      voucher.visibleToUsers = data.visibleToUsers;
    }

    if (typeof data.combinable === "boolean") {
      voucher.combinable = data.combinable;
    }

    await voucher.save();

    return res.json(voucher);
  } catch (err) {
    console.error("Update voucher error:", err);
    return res.status(500).json({
      message: "Không thể cập nhật voucher",
    });
  }
};

exports.deleteVoucher = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Voucher.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        message: "Không tìm thấy voucher",
      });
    }

    return res.json({
      message: "Đã xóa voucher",
      id: deleted._id,
    });
  } catch (err) {
    console.error("Delete voucher error:", err);
    return res.status(500).json({
      message: "Không thể xóa voucher",
    });
  }
};

exports.applyVoucher = async (req, res, next) => {
  try {
    const code = normalizeCode(req.body?.code);
    const orderTotal = Number(req.body?.orderTotal || req.body?.orderAmount || 0);
    const userId = req.user?.id;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Mã voucher bắt buộc",
      });
    }

    if (orderTotal <= 0) {
      return res.status(400).json({
        success: false,
        message: "Giá trị đơn hàng không hợp lệ",
      });
    }

    const voucher = await Voucher.findOne({ code, active: true });

    const validation = validateVoucherForAmount({
      voucher,
      orderTotal,
      userId,
    });

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    const discount = calculateDiscount(voucher, orderTotal);
    const totalAfter = Math.max(0, orderTotal - discount);

    return res.json({
      success: true,
      message: validation.message,
      data: {
        voucher: {
          id: voucher._id,
          code: voucher.code,
          title: voucher.title || "",
          description: voucher.description || "",
          detail: voucher.detail || "",
          terms: voucher.terms || "",
          type: voucher.type,
          value: voucher.value,
          maxDiscount: voucher.maxDiscount,
          minOrderValue: voucher.minOrderValue,
          startAt: voucher.startAt,
          endAt: voucher.endAt,
        },
        discount,
        totalBefore: orderTotal,
        totalAfter,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getUserVouchers = async (req, res) => {
  try {
    const userId = req.user?.id;
    const now = new Date();

    const vouchers = await Voucher.find({
      active: true,
      visibleToUsers: { $ne: false },
      startAt: { $lte: now },
      endAt: { $gte: now },
    }).lean();

    const result = vouchers.map((v) => {
      const usedRecord = (v.usersUsed || []).find(
        (u) => u.user?.toString() === (userId || "").toString()
      );

      const perUserUsed = usedRecord ? Number(usedRecord.count || 0) : 0;

      const userRemainingUses =
        v.perUserLimit === null || v.perUserLimit === undefined
          ? null
          : Math.max(0, Number(v.perUserLimit || 0) - perUserUsed);

      const exhausted =
        v.usageLimit !== null &&
        v.usageLimit !== undefined &&
        Number(v.usedCount || 0) >= Number(v.usageLimit);

      const perUserExceeded =
        v.perUserLimit !== null &&
        v.perUserLimit !== undefined &&
        perUserUsed >= Number(v.perUserLimit);

      return {
        _id: v._id,
        code: v.code,
        title: v.title || "",
        description: v.description || "",
        detail: v.detail || "",
        terms: v.terms || "",
        type: v.type,
        value: v.value,
        maxDiscount: v.maxDiscount,
        startAt: v.startAt,
        endAt: v.endAt,
        minOrderValue: v.minOrderValue,
        applicableProducts: v.applicableProducts || [],
        applicableCategories: v.applicableCategories || [],
        usageLimit: v.usageLimit,
        usedCount: v.usedCount || 0,
        perUserLimit: v.perUserLimit,
        perUserUsed,
        userRemainingUses,
        exhausted,
        perUserExceeded,
        usable: !exhausted && !perUserExceeded,
        visibleToUsers: v.visibleToUsers !== false,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error("Get user vouchers error:", err);
    return res.status(500).json({
      message: "Không thể tải voucher của người dùng",
    });
  }
};

exports.redeemVoucher = async (req, res) => {
  try {
    const code = normalizeCode(req.body.code);
    const userId = req.user?.id;

    if (!code) {
      return res.status(400).json({
        message: "Mã voucher bắt buộc",
      });
    }

    const voucher = await Voucher.findOne({ code, active: true });

    const validation = validateVoucherForAmount({
      voucher,
      orderTotal:
        req.body.orderTotal ||
        req.body.orderAmount ||
        voucher?.minOrderValue ||
        1,
      userId,
    });

    if (!validation.valid) {
      return res.status(400).json({
        message: validation.message,
      });
    }

    voucher.usedCount = Number(voucher.usedCount || 0) + 1;

    if (userId) {
      const userRecord = voucher.usersUsed.find(
        (item) => item.user?.toString() === userId.toString()
      );

      if (userRecord) {
        userRecord.count = Number(userRecord.count || 0) + 1;
      } else {
        voucher.usersUsed.push({
          user: userId,
          count: 1,
        });
      }
    }

    await voucher.save();

    return res.json({
      message: "Voucher đã được ghi nhận",
    });
  } catch (err) {
    console.error("Redeem voucher error:", err);
    return res.status(500).json({
      message: "Không thể ghi nhận voucher",
    });
  }
};