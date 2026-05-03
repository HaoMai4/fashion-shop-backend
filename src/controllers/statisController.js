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
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 10);
    const dateMatch = buildDateMatch(req.query, 90);

    const rows = await Order.aggregate([
      {
        $match: {
          createdAt: dateMatch.createdAt,
          "paymentMethod.status": "paid",
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          productName: { $first: "$items.name" },
          productCode: { $first: "$items.productId" },
          qtySold: { $sum: "$items.quantity" },
          revenue: {
            $sum: {
              $multiply: ["$items.quantity", "$items.price"],
            },
          },
        },
      },
      { $sort: { qtySold: -1, revenue: -1 } },
      { $limit: limit },
    ]);

    return res.json({
      periodDays: dateMatch.periodDays || null,
      limit,
      data: rows,
    });
  } catch (err) {
    console.error("getTopProducts error:", err);
    return res.status(500).json({ message: "Lỗi khi lấy top sản phẩm" });
  }
};

exports.getSlowestProducts = async (req, res) => {
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
          userId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$userId",
          totalSpent: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          userId: "$_id",
          name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$user.firstName", ""] },
                  " ",
                  { $ifNull: ["$user.lastName", ""] },
                ],
              },
            },
          },
          email: "$user.email",
          phone: "$user.phone",
          totalSpent: 1,
          orders: 1,
        },
      },
    ]);

    const topGuests = await Order.aggregate([
      {
        $match: {
          createdAt: dateMatch.createdAt,
          "paymentMethod.status": "paid",
          userId: null,
          "guestInfo.email": { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$guestInfo.email",
          totalSpent: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: limit },
    ]);

    const combined = [];
    let rank = 1;

    for (const user of topUsers) {
      combined.push({
        rank: rank++,
        name: user.name || user.email || "",
        email: user.email || "",
        phone: user.phone || "",
        orders: user.orders || 0,
        totalSpent: user.totalSpent || 0,
        userId: user.userId,
      });
    }

    for (const guest of topGuests) {
      combined.push({
        rank: rank++,
        name: guest._id || "",
        email: guest._id || "",
        phone: "",
        orders: guest.orders || 0,
        totalSpent: guest.totalSpent || 0,
      });
    }

    return res.json({
      periodDays: dateMatch.periodDays || null,
      limit,
      data: combined,
    });
  } catch (err) {
    console.error("getTopCustomers error:", err);
    return res.status(500).json({ message: "Lỗi khi lấy top khách hàng" });
  }
};

exports.getRevenueForecast = async (req, res) => {
  try {
    const period = req.query.period || null;
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 1);

    const db = mongoose.connection.db;
    const collection = db.collection("revenue_forecasts");

    const query = {};
    if (period) query.period = period;

    const docs = await collection.find(query).sort({ createdAt: -1 }).limit(limit).toArray();

    if (!docs || docs.length === 0) {
      return res.status(404).json({ message: "No forecast found" });
    }

    if (limit === 1) return res.json(docs[0]);
    return res.json(docs);
  } catch (err) {
    console.error("getRevenueForecast error:", err);
    return res.status(500).json({ message: "Lỗi khi lấy forecast" });
  }
};

exports.exportStatsExcel = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();

    const dateMatch = buildDateMatch(req.query, 90);
    const salesRange = getSalesDateRange(req.query);

    const overviewRes = await new Promise((resolve, reject) => {
      const fakeRes = {
        json: resolve,
        status: () => ({
          json: reject,
        }),
      };

      exports.getAdminStats(req, fakeRes).catch(reject);
    });

    const topProductsRows = await Order.aggregate([
      {
        $match: {
          createdAt: dateMatch.createdAt,
          "paymentMethod.status": "paid",
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          productName: { $first: "$items.name" },
          qtySold: { $sum: "$items.quantity" },
          revenue: {
            $sum: {
              $multiply: ["$items.quantity", "$items.price"],
            },
          },
        },
      },
      { $sort: { qtySold: -1, revenue: -1 } },
      { $limit: 50 },
    ]);

    const salesRows = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: salesRange.startDate,
            $lte: salesRange.endDate,
          },
          "paymentMethod.status": "paid",
        },
      },
      {
        $group: {
          _id: getGroupId(salesRange.period),
          orders: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1, "_id.day": 1 } },
    ]);

    const salesMap = {};
    for (const row of salesRows) {
      salesMap[getRowKey(row, salesRange.period)] = {
        orders: row.orders,
        revenue: row.revenue,
      };
    }

    const salesLabels = buildLabels(
      salesRange.period,
      salesRange.startDate,
      salesRange.endDate
    );

    const overviewSheet = workbook.addWorksheet("Tổng quan");
    overviewSheet.columns = [
      { header: "Chỉ số", width: 36 },
      { header: "Giá trị", width: 24 },
    ];

    overviewSheet.addRow(["Chỉ số", "Giá trị"]);
    overviewSheet.addRow(["Tổng đơn hàng", overviewRes.totalOrders || 0]);
    overviewSheet.addRow(["Tổng doanh thu", overviewRes.totalRevenueAll || 0]);
    overviewSheet.addRow(["Doanh thu đã thanh toán", overviewRes.totalPaidRevenue || 0]);
    overviewSheet.addRow(["Đơn đã thanh toán", overviewRes.totalPaidOrders || 0]);
    overviewSheet.addRow(["Khách hàng", overviewRes.uniqueCustomers || 0]);

    overviewSheet.addRow([]);
    overviewSheet.addRow(["Đơn theo trạng thái", "Số lượng"]);

    Object.entries(overviewRes.statusCounts || {}).forEach(([status, count]) => {
      overviewSheet.addRow([getStatusLabel(status), count]);
    });

    overviewSheet.addRow([]);
    overviewSheet.addRow(["Thanh toán", "Số lượng"]);

    Object.entries(overviewRes.paymentCounts || {}).forEach(([status, count]) => {
      overviewSheet.addRow([getPaymentLabel(status), count]);
    });

    overviewSheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };

        if (typeof cell.value === "number" && rowNumber >= 3) {
          cell.numFmt = '#,##0';
        }
      });
    });

    overviewSheet.getRow(1).font = { bold: true };

    const salesSheet = workbook.addWorksheet("Doanh thu");
    salesSheet.columns = [
      { header: "Mốc thời gian", width: 22 },
      { header: "Số đơn", width: 14 },
      { header: "Doanh thu", width: 20 },
    ];

    salesSheet.addRow(["Mốc thời gian", "Số đơn", "Doanh thu"]);

    salesLabels.forEach((label) => {
      const row = salesMap[label] || { orders: 0, revenue: 0 };
      salesSheet.addRow([label, row.orders, row.revenue]);
    });

    salesSheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };

        if (rowNumber > 1 && typeof row.getCell(3).value === "number") {
          row.getCell(3).numFmt = '#,##0 "₫"';
        }
      });
    });

    salesSheet.getRow(1).font = { bold: true };

    const topProductsSheet = workbook.addWorksheet("Sản phẩm bán chạy");
    topProductsSheet.columns = [
      { header: "Hạng", width: 8 },
      { header: "Sản phẩm", width: 50 },
      { header: "Đã bán", width: 14 },
      { header: "Doanh thu", width: 20 },
    ];

    topProductsSheet.addRow(["Hạng", "Sản phẩm", "Đã bán", "Doanh thu"]);

    topProductsRows.forEach((item, index) => {
      topProductsSheet.addRow([
        index + 1,
        item.productName || "Không rõ",
        item.qtySold || 0,
        item.revenue || 0,
      ]);
    });

    topProductsSheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };

        if (rowNumber > 1 && typeof row.getCell(4).value === "number") {
          row.getCell(4).numFmt = '#,##0 "₫"';
        }
      });
    });

    topProductsSheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `thongke_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("exportStatsExcel error:", err);
    return res.status(500).json({ message: "Lỗi khi xuất Excel" });
  }
};