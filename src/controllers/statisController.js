const mongoose = require("mongoose");
const Order = require("../models/Order");
const ProductVariant = require("../models/ProductVariant");
const Product = require("../models/Product");
const ExcelJS = require("exceljs");

function parseDate(value, endOfDay = false) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}

function getDateRangeFromQuery(query, fallbackDays = 90) {
  const startDate = parseDate(query.startDate);
  const endDate = parseDate(query.endDate, true);

  if (startDate && endDate) {
    return { startDate, endDate, periodDays: null };
  }

  const periodDays = Math.max(1, parseInt(query.periodDays, 10) || fallbackDays);
  const fallbackStart = new Date();
  fallbackStart.setDate(fallbackStart.getDate() - periodDays);
  fallbackStart.setHours(0, 0, 0, 0);

  const fallbackEnd = new Date();
  fallbackEnd.setHours(23, 59, 59, 999);

  return {
    startDate: fallbackStart,
    endDate: fallbackEnd,
    periodDays,
  };
}

function getSalesDateRange(query) {
  const explicitStart = parseDate(query.startDate);
  const explicitEnd = parseDate(query.endDate, true);

  const period = String(query.period || "day").toLowerCase();
  const range = Math.max(1, parseInt(query.range, 10) || 30);
  const now = new Date();

  if (explicitStart && explicitEnd) {
    return {
      period,
      range,
      startDate: explicitStart,
      endDate: explicitEnd,
      hasExplicitRange: true,
    };
  }

  const startDate = new Date();
  if (period === "day") {
    startDate.setDate(now.getDate() - (range - 1));
  } else if (period === "week") {
    startDate.setDate(now.getDate() - (range * 7 - 1));
  } else {
    startDate.setMonth(now.getMonth() - (range - 1));
  }

  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);

  return {
    period,
    range,
    startDate,
    endDate,
    hasExplicitRange: false,
  };
}

function getGroupId(period) {
  if (period === "week") {
    return {
      year: { $isoWeekYear: "$createdAt" },
      week: { $isoWeek: "$createdAt" },
    };
  }

  if (period === "month") {
    return {
      year: { $year: "$createdAt" },
      month: { $month: "$createdAt" },
    };
  }

  return {
    year: { $year: "$createdAt" },
    month: { $month: "$createdAt" },
    day: { $dayOfMonth: "$createdAt" },
  };
}

function getRowKey(row, period) {
  if (period === "week") {
    return `${row._id.year}-W${String(row._id.week).padStart(2, "0")}`;
  }

  if (period === "month") {
    return `${row._id.year}-${String(row._id.month).padStart(2, "0")}`;
  }

  return `${row._id.year}-${String(row._id.month).padStart(2, "0")}-${String(
    row._id.day
  ).padStart(2, "0")}`;
}

function getIsoWeek(date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = tmp.getUTCDay() || 7;

  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);

  return {
    year: tmp.getUTCFullYear(),
    week: weekNo,
  };
}

function getLabelFromDate(date, period) {
  if (period === "week") {
    const iso = getIsoWeek(date);
    return `${iso.year}-W${String(iso.week).padStart(2, "0")}`;
  }

  if (period === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function buildLabels(period, startDate, endDate) {
  const labels = [];
  const cursor = new Date(startDate);

  if (period === "week") {
    while (cursor <= endDate) {
      const label = getLabelFromDate(cursor, "week");
      if (!labels.includes(label)) labels.push(label);
      cursor.setDate(cursor.getDate() + 7);
    }

    return labels;
  }

  if (period === "month") {
    cursor.setDate(1);

    while (cursor <= endDate) {
      labels.push(getLabelFromDate(cursor, "month"));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return labels;
  }

  while (cursor <= endDate) {
    labels.push(getLabelFromDate(cursor, "day"));
    cursor.setDate(cursor.getDate() + 1);
  }

  return labels;
}

function buildDateMatch(query, fallbackDays = 90) {
  const { startDate, endDate, periodDays } = getDateRangeFromQuery(query, fallbackDays);

  return {
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
    periodDays,
    startDate,
    endDate,
  };
}

function getStatusLabel(status) {
  const map = {
    pending: "Chờ xác nhận",
    confirm: "Chờ xác nhận",
    confirmed: "Đã xác nhận",
    processing: "Đang xử lý",
    shipped: "Đang giao",
    delivered: "Đã giao",
    completed: "Hoàn thành",
    cancelled: "Đã hủy",
    canceled: "Đã hủy",
    reported: "Chờ duyệt hủy",
    cho_xac_nhan: "Chờ xác nhận",
    da_xac_nhan: "Đã xác nhận",
    dang_xu_ly: "Đang xử lý",
    dang_giao: "Đang giao",
    da_giao: "Đã giao",
    hoan_thanh: "Hoàn thành",
    da_huy: "Đã hủy",
  };

  return map[status] || status || "Không rõ";
}

function getPaymentLabel(status) {
  const map = {
    paid: "Đã thanh toán",
    pending: "Chưa thanh toán",
    failed: "Thanh toán thất bại",
    cancelled: "Đã hủy",
    canceled: "Đã hủy",
  };

  return map[status] || status || "Không rõ";
}

exports.getAdminStats = async (req, res) => {
  try {
    const dateMatch = buildDateMatch(req.query, 90);

    const [overview] = await Order.aggregate([
      {
        $match: {
          createdAt: dateMatch.createdAt,
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenueAll: { $sum: "$totalAmount" },
                totalPaidRevenue: {
                  $sum: {
                    $cond: [
                      { $eq: ["$paymentMethod.status", "paid"] },
                      "$totalAmount",
                      0,
                    ],
                  },
                },
                totalPaidOrders: {
                  $sum: {
                    $cond: [{ $eq: ["$paymentMethod.status", "paid"] }, 1, 0],
                  },
                },
              },
            },
          ],
          byStatus: [
            {
              $group: {
                _id: "$orderStatus",
                count: { $sum: 1 },
              },
            },
          ],
          byPayment: [
            {
              $group: {
                _id: "$paymentMethod.status",
                count: { $sum: 1 },
              },
            },
          ],
          uniqueCustomers: [
            {
              $group: {
                _id: {
                  $ifNull: ["$userId", "$guestInfo.email"],
                },
              },
            },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
          recentOrders: [
            { $sort: { createdAt: -1 } },
            { $limit: 8 },
            {
              $project: {
                _id: 1,
                orderCode: 1,
                orderStatus: 1,
                "paymentMethod.status": 1,
                totalAmount: 1,
                createdAt: 1,
              },
            },
          ],
        },
      },
    ]);

    const totals = overview?.totals?.[0] || {};
    const statusCounts = (overview?.byStatus || []).reduce((acc, item) => {
      acc[item._id || "unknown"] = item.count;
      return acc;
    }, {});
    const paymentCounts = (overview?.byPayment || []).reduce((acc, item) => {
      acc[item._id || "unknown"] = item.count;
      return acc;
    }, {});
    const uniqueCustomers = overview?.uniqueCustomers?.[0]?.count || 0;

    return res.json({
      totalOrders: totals.totalOrders || 0,
      totalRevenueAll: totals.totalRevenueAll || 0,
      totalPaidRevenue: totals.totalPaidRevenue || 0,
      totalPaidOrders: totals.totalPaidOrders || 0,
      statusCounts,
      paymentCounts,
      uniqueCustomers,
      recentOrders: overview?.recentOrders || [],
    });
  } catch (err) {
    console.error("getAdminStats error:", err);
    return res.status(500).json({ message: "Lỗi khi lấy thống kê" });
  }
};

exports.getSalesByPeriod = async (req, res) => {
  try {
    const { period, range, startDate, endDate } = getSalesDateRange(req.query);
    const groupId = getGroupId(period);

    const rows = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lte: endDate,
          },
          "paymentMethod.status": "paid",
        },
      },
      {
        $group: {
          _id: groupId,
          orders: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
          "_id.week": 1,
          "_id.day": 1,
        },
      },
    ]);

    const rowMap = {};
    for (const row of rows) {
      rowMap[getRowKey(row, period)] = {
        orders: row.orders,
        revenue: row.revenue,
      };
    }

    const labels = buildLabels(period, startDate, endDate);
    const data = labels.map((label) => rowMap[label] || { orders: 0, revenue: 0 });

    return res.json({
      period,
      range,
      startDate,
      endDate,
      labels,
      data,
    });
  } catch (err) {
    console.error("getSalesByPeriod error:", err);
    return res.status(500).json({ message: "Lỗi khi lấy doanh thu theo thời gian" });
  }
};

exports.getTopProducts = async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);

    const orderMatch = {
      "paymentMethod.status": "paid",
    };

    if (req.query.startDate || req.query.endDate) {
      orderMatch.createdAt = {};

      if (req.query.startDate) {
        const start = new Date(req.query.startDate);
        start.setHours(0, 0, 0, 0);
        orderMatch.createdAt.$gte = start;
      }

      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        orderMatch.createdAt.$lte = end;
      }
    } else {
      const periodDays = Math.max(
        1,
        parseInt(req.query.periodDays, 10) || 90
      );

      const since = new Date();
      since.setDate(since.getDate() - periodDays);
      since.setHours(0, 0, 0, 0);

      const now = new Date();
      now.setHours(23, 59, 59, 999);

      orderMatch.createdAt = {
        $gte: since,
        $lte: now,
      };
    }

    const orders = await Order.find(orderMatch)
      .populate("items.productId", "name slug")
      .populate("items.variantId", "color colorCode")
      .lean();

    const map = new Map();

    for (const order of orders) {
      for (const item of order.items || []) {
        const product = item.productId;
        const variant = item.variantId;

        const productId = product?._id || item.productId;
        const variantId = variant?._id || item.variantId || null;

        if (!productId) continue;

        const productName =
          product?.name ||
          item.productName ||
          item.name ||
          item.ten ||
          "Không rõ sản phẩm";

        const color =
          item.color ||
          item.colorName ||
          item.mauSac ||
          item.selectedColor ||
          variant?.color ||
          "Không rõ màu";

        const colorCode =
          item.colorCode ||
          item.maMau ||
          variant?.colorCode ||
          "#000000";

        const size =
          item.size ||
          item.kichCo ||
          item.selectedSize ||
          "Không rõ size";

        const quantity = Number(item.quantity || item.soLuong || 0);
        const price = Number(
          item.finalPrice ||
          item.price ||
          item.gia ||
          item.discountPrice ||
          0
        );

        if (quantity <= 0) continue;

        const key = `${String(productId)}-${String(variantId || "no-variant")}-${String(size)}`;

        const current = map.get(key) || {
          _id: key,
          productId,
          variantId,
          productName,
          color,
          colorCode,
          size,
          qtySold: 0,
          revenue: 0,
        };

        current.qtySold += quantity;
        current.revenue += quantity * price;

        map.set(key, current);
      }
    }

    const data = Array.from(map.values())
      .sort((a, b) => b.qtySold - a.qtySold || b.revenue - a.revenue)
      .slice(0, limit);

    return res.json({
      periodDays: req.query.periodDays ? Number(req.query.periodDays) : null,
      limit,
      data,
    });
  } catch (err) {
    console.error("getTopProducts error:", err);
    return res.status(500).json({
      message: "Lỗi khi lấy top sản phẩm bán chạy",
      error: err.message,
    });
  }
};

exports.getSlowProducts = async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 20);
    const dateMatch = buildDateMatch(req.query, 90);

    const rows = await Product.aggregate([
      {
        $lookup: {
          from: "productvariants",
          let: { pid: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$productId", "$$pid"] },
              },
            },
            {
              $unwind: {
                path: "$sizes",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $group: {
                _id: "$productId",
                totalStock: { $sum: { $ifNull: ["$sizes.stock", 0] } },
                sampleImage: { $first: { $arrayElemAt: ["$images", 0] } },
              },
            },
          ],
          as: "inv",
        },
      },
      {
        $lookup: {
          from: "orders",
          let: { pid: "$_id" },
          pipeline: [
            {
              $match: {
                "paymentMethod.status": "paid",
                createdAt: dateMatch.createdAt,
              },
            },
            { $unwind: "$items" },
            {
              $match: {
                $expr: { $eq: ["$items.productId", "$$pid"] },
              },
            },
            {
              $group: {
                _id: "$items.productId",
                qtySold: { $sum: "$items.quantity" },
              },
            },
          ],
          as: "sold",
        },
      },
      {
        $addFields: {
          totalStock: { $ifNull: [{ $arrayElemAt: ["$inv.totalStock", 0] }, 0] },
          sampleImage: { $ifNull: [{ $arrayElemAt: ["$inv.sampleImage", 0] }, null] },
          qtySold: { $ifNull: [{ $arrayElemAt: ["$sold.qtySold", 0] }, 0] },
        },
      },
      { $match: { totalStock: { $gt: 0 } } },
      {
        $addFields: {
          score: {
            $divide: ["$totalStock", { $add: ["$qtySold", 1] }],
          },
        },
      },
      { $sort: { score: -1, totalStock: -1, qtySold: 1 } },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          name: 1,
          slug: 1,
          totalStock: 1,
          qtySold: 1,
          score: 1,
          sampleImage: 1,
        },
      },
    ]);

    return res.json({
      periodDays: dateMatch.periodDays || null,
      limit,
      data: rows,
    });
  } catch (err) {
    console.error("getSlowestProducts error:", err);
    return res.status(500).json({ message: "Lỗi khi lấy sản phẩm bán chậm" });
  }
};

exports.getTopCustomers = async (req, res) => {
  try {
    const limit = Math.min(500, parseInt(req.query.limit, 10) || 50);
    const dateMatch = buildDateMatch(req.query, 90);

    const topUsers = await Order.aggregate([
      {
        $match: {
          createdAt: dateMatch.createdAt,
          "paymentMethod.status": "paid",
        },
      },
      {
        $group: {
          _id: {
            $ifNull: ["$userId", "$guestInfo.email"],
          },
          orders: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
          name: {
            $first: {
              $ifNull: ["$shippingAddress.fullName", "$guestInfo.fullName"],
            },
          },
          email: {
            $first: {
              $ifNull: ["$guestInfo.email", "$shippingAddress.email"],
            },
          },
          phone: {
            $first: {
              $ifNull: ["$shippingAddress.phone", "$guestInfo.phone"],
            },
          },
        },
      },
      { $sort: { totalSpent: -1, orders: -1 } },
      { $limit: limit },
    ]);

    const data = topUsers.map((item, index) => ({
      rank: index + 1,
      userId:
        item._id && mongoose.Types.ObjectId.isValid(String(item._id))
          ? String(item._id)
          : null,
      name: item.name || "Khách hàng",
      email: item.email || "",
      phone: item.phone || "",
      orders: item.orders || 0,
      totalSpent: item.totalSpent || 0,
    }));

    return res.json({
      periodDays: dateMatch.periodDays || null,
      limit,
      data,
    });
  } catch (err) {
    console.error("getTopCustomers error:", err);
    return res.status(500).json({ message: "Lỗi khi lấy top khách hàng" });
  }
};
exports.getForecast = async (req, res) => {
  try {
    const days = Math.max(1, parseInt(req.query.days, 10) || 7);
    const dateMatch = buildDateMatch(req.query, 30);

    const rows = await Order.aggregate([
      {
        $match: {
          createdAt: dateMatch.createdAt,
          "paymentMethod.status": "paid",
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          orders: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    const totalRevenue = rows.reduce((sum, item) => sum + (item.revenue || 0), 0);
    const totalOrders = rows.reduce((sum, item) => sum + (item.orders || 0), 0);
    const activeDays = Math.max(1, rows.length);

    const avgDailyRevenue = totalRevenue / activeDays;
    const avgDailyOrders = totalOrders / activeDays;

    const forecast = Array.from({ length: days }).map((_, index) => {
      const date = new Date();
      date.setDate(date.getDate() + index + 1);

      return {
        date: date.toISOString().slice(0, 10),
        expectedRevenue: Math.round(avgDailyRevenue),
        expectedOrders: Math.round(avgDailyOrders),
      };
    });

    return res.json({
      days,
      avgDailyRevenue,
      avgDailyOrders,
      forecast,
    });
  } catch (err) {
    console.error("getForecast error:", err);
    return res.status(500).json({ message: "Lỗi khi dự báo doanh thu" });
  }
};

exports.exportStatsToExcel = async (req, res) => {
  try {
    const dateMatch = buildDateMatch(req.query, 90);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "StyleHub";
    workbook.created = new Date();

    const overviewSheet = workbook.addWorksheet("Tong quan");
    overviewSheet.columns = [
      { header: "Chi so", key: "label", width: 32 },
      { header: "Gia tri", key: "value", width: 22 },
    ];

    const [overview] = await Order.aggregate([
      {
        $match: {
          createdAt: dateMatch.createdAt,
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenueAll: { $sum: "$totalAmount" },
                totalPaidRevenue: {
                  $sum: {
                    $cond: [
                      { $eq: ["$paymentMethod.status", "paid"] },
                      "$totalAmount",
                      0,
                    ],
                  },
                },
                totalPaidOrders: {
                  $sum: {
                    $cond: [{ $eq: ["$paymentMethod.status", "paid"] }, 1, 0],
                  },
                },
              },
            },
          ],
          uniqueCustomers: [
            {
              $group: {
                _id: {
                  $ifNull: ["$userId", "$guestInfo.email"],
                },
              },
            },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
        },
      },
    ]);

    const totals = overview?.totals?.[0] || {};
    overviewSheet.addRows([
      { label: "Tong don hang", value: totals.totalOrders || 0 },
      { label: "Tong doanh thu", value: totals.totalRevenueAll || 0 },
      { label: "Doanh thu da thanh toan", value: totals.totalPaidRevenue || 0 },
      { label: "Don da thanh toan", value: totals.totalPaidOrders || 0 },
      { label: "Khach hang", value: overview?.uniqueCustomers?.[0]?.count || 0 },
      {
        label: "Tu ngay",
        value: dateMatch.startDate ? dateMatch.startDate.toISOString().slice(0, 10) : "",
      },
      {
        label: "Den ngay",
        value: dateMatch.endDate ? dateMatch.endDate.toISOString().slice(0, 10) : "",
      },
    ]);

    const salesSheet = workbook.addWorksheet("Doanh thu");
    salesSheet.columns = [
      { header: "Ngay", key: "label", width: 18 },
      { header: "So don", key: "orders", width: 14 },
      { header: "Doanh thu", key: "revenue", width: 20 },
    ];

    const salesRows = await Order.aggregate([
      {
        $match: {
          createdAt: dateMatch.createdAt,
          "paymentMethod.status": "paid",
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          orders: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    salesSheet.addRows(
      salesRows.map((item) => ({
        label: `${item._id.year}-${String(item._id.month).padStart(2, "0")}-${String(
          item._id.day
        ).padStart(2, "0")}`,
        orders: item.orders || 0,
        revenue: item.revenue || 0,
      }))
    );

    const topProductsSheet = workbook.addWorksheet("Top san pham");
    topProductsSheet.columns = [
      { header: "San pham", key: "productName", width: 36 },
      { header: "Mau", key: "color", width: 18 },
      { header: "Size", key: "size", width: 14 },
      { header: "Da ban", key: "qtySold", width: 14 },
      { header: "Doanh thu", key: "revenue", width: 20 },
    ];

    const fakeReq = {
      query: {
        ...req.query,
        limit: 50,
      },
    };

    const topProductRows = await getTopProductRowsForExport(fakeReq.query);

    topProductsSheet.addRows(
      topProductRows.map((item) => ({
        productName: item.productName || "Khong ro",
        color: item.color || "Khong ro mau",
        size: item.size || "Khong ro size",
        qtySold: item.qtySold || 0,
        revenue: item.revenue || 0,
      }))
    );

    const customersSheet = workbook.addWorksheet("Top khach hang");
    customersSheet.columns = [
      { header: "Hang", key: "rank", width: 10 },
      { header: "Khach hang", key: "name", width: 28 },
      { header: "Email", key: "email", width: 32 },
      { header: "So dien thoai", key: "phone", width: 18 },
      { header: "So don", key: "orders", width: 14 },
      { header: "Tong chi", key: "totalSpent", width: 20 },
    ];

    const topUsers = await Order.aggregate([
      {
        $match: {
          createdAt: dateMatch.createdAt,
          "paymentMethod.status": "paid",
        },
      },
      {
        $group: {
          _id: {
            $ifNull: ["$userId", "$guestInfo.email"],
          },
          orders: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
          name: {
            $first: {
              $ifNull: ["$shippingAddress.fullName", "$guestInfo.fullName"],
            },
          },
          email: {
            $first: {
              $ifNull: ["$guestInfo.email", "$shippingAddress.email"],
            },
          },
          phone: {
            $first: {
              $ifNull: ["$shippingAddress.phone", "$guestInfo.phone"],
            },
          },
        },
      },
      { $sort: { totalSpent: -1, orders: -1 } },
      { $limit: 50 },
    ]);

    customersSheet.addRows(
      topUsers.map((item, index) => ({
        rank: index + 1,
        name: item.name || "Khach hang",
        email: item.email || "",
        phone: item.phone || "",
        orders: item.orders || 0,
        totalSpent: item.totalSpent || 0,
      }))
    );

    [overviewSheet, salesSheet, topProductsSheet, customersSheet].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).alignment = { vertical: "middle" };
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=stylehub-stats.xlsx");

    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error("exportStatsToExcel error:", err);
    return res.status(500).json({
      message: "Lỗi khi xuất Excel",
      error: err.message,
    });
  }
};

async function getTopProductRowsForExport(query) {
  const limit = Math.min(100, parseInt(query.limit, 10) || 50);

  const orderMatch = {
    "paymentMethod.status": "paid",
  };

  if (query.startDate || query.endDate) {
    orderMatch.createdAt = {};

    if (query.startDate) {
      const start = new Date(query.startDate);
      start.setHours(0, 0, 0, 0);
      orderMatch.createdAt.$gte = start;
    }

    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      orderMatch.createdAt.$lte = end;
    }
  } else {
    const periodDays = Math.max(1, parseInt(query.periodDays, 10) || 90);
    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    since.setHours(0, 0, 0, 0);

    const now = new Date();
    now.setHours(23, 59, 59, 999);

    orderMatch.createdAt = {
      $gte: since,
      $lte: now,
    };
  }

  const orders = await Order.find(orderMatch)
    .populate("items.productId", "name slug")
    .populate("items.variantId", "color colorCode")
    .lean();

  const map = new Map();

  for (const order of orders) {
    for (const item of order.items || []) {
      const product = item.productId;
      const variant = item.variantId;

      const productId = product?._id || item.productId;
      const variantId = variant?._id || item.variantId || null;

      if (!productId) continue;

      const productName =
        product?.name ||
        item.productName ||
        item.name ||
        item.ten ||
        "Không rõ sản phẩm";

      const color =
        item.color ||
        item.colorName ||
        item.mauSac ||
        item.selectedColor ||
        variant?.color ||
        "Không rõ màu";

      const colorCode =
        item.colorCode ||
        item.maMau ||
        variant?.colorCode ||
        "#000000";

      const size =
        item.size ||
        item.kichCo ||
        item.selectedSize ||
        "Không rõ size";

      const quantity = Number(item.quantity || item.soLuong || 0);
      const price = Number(
        item.finalPrice ||
        item.price ||
        item.gia ||
        item.discountPrice ||
        0
      );

      if (quantity <= 0) continue;

      const key = `${String(productId)}-${String(variantId || "no-variant")}-${String(size)}`;

      const current = map.get(key) || {
        _id: key,
        productId,
        variantId,
        productName,
        color,
        colorCode,
        size,
        qtySold: 0,
        revenue: 0,
      };

      current.qtySold += quantity;
      current.revenue += quantity * price;

      map.set(key, current);
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.qtySold - a.qtySold || b.revenue - a.revenue)
    .slice(0, limit);
}