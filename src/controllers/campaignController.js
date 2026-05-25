const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const Campaign = require("../models/Campaign");
const ProductVariant = require("../models/ProductVariant");

const ALLOWED_STATUSES = ["draft", "active", "ended", "archived"];
const ALLOWED_SOURCES = ["manual", "excel", "ai_excel"];

function parseDate(value) {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date;
}

function isMidnightDate(date) {
    return (
        date.getUTCHours() === 0 &&
        date.getUTCMinutes() === 0 &&
        date.getUTCSeconds() === 0 &&
        date.getUTCMilliseconds() === 0
    );
}

function normalizeSaleBoundaryDate(value, boundary = "start") {
    const date = parseDate(value);

    if (!date) return null;

    const rawValue = String(value || "");
    const isDateOnlyInput = /^\d{4}-\d{2}-\d{2}$/.test(rawValue);
    const shouldNormalize = isDateOnlyInput || isMidnightDate(date);

    if (!shouldNormalize) {
        return date;
    }

    const normalized = new Date(date);

    if (boundary === "end") {
        normalized.setUTCHours(23, 59, 59, 999);
    } else {
        normalized.setUTCHours(0, 0, 0, 0);
    }

    return normalized;
}

function getUserId(req) {
    return req.user?.id || req.user?._id || null;
}

function removeTempFile(filePath) {
    if (!filePath) return;

    fs.unlink(filePath, (error) => {
        if (error && error.code !== "ENOENT") {
            console.warn("removeTempFile error:", error.message);
        }
    });
}

function runPythonCampaignParser(filePath) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.resolve(
            __dirname,
            "../../scripts/parse_campaign_excel.py"
        );

        if (!fs.existsSync(scriptPath)) {
            return reject(new Error("Không tìm thấy script parse_campaign_excel.py"));
        }

        const pythonExecutable =
            process.env.PYTHON_PATH ||
            (process.platform === "win32" ? "python" : "python3");

        const child = spawn(pythonExecutable, [scriptPath, filePath], {
            cwd: path.resolve(__dirname, "../.."),
            env: {
                ...process.env,
                PYTHONIOENCODING: "utf-8",
            },
        });

        let stdout = "";
        let stderr = "";
        let settled = false;

        const timeout = setTimeout(() => {
            if (settled) return;

            settled = true;
            child.kill("SIGKILL");
            reject(new Error("Python parser timeout"));
        }, 60 * 1000);

        child.stdout.on("data", (data) => {
            stdout += data.toString("utf8");
        });

        child.stderr.on("data", (data) => {
            stderr += data.toString("utf8");
        });

        child.on("error", (error) => {
            if (settled) return;

            settled = true;
            clearTimeout(timeout);
            reject(error);
        });

        child.on("close", (code) => {
            if (settled) return;

            settled = true;
            clearTimeout(timeout);

            if (code !== 0) {
                return reject(
                    new Error(stderr || stdout || `Python exited with code ${code}`)
                );
            }

            try {
                const parsed = JSON.parse(stdout);
                return resolve(parsed);
            } catch (error) {
                return reject(
                    new Error(`Không parse được JSON từ Python: ${error.message}`)
                );
            }
        });
    });
}

function compactCampaignForAi(campaign) {
    return {
        sheetName: campaign.sheetName || "",
        campaignName: campaign.campaignName || "",
        programType: campaign.programType || "",
        scope: campaign.scope || "",
        channel: campaign.channel || "",
        startDate: campaign.startDate || null,
        endDate: campaign.endDate || null,
        promoContent: campaign.promoContent || "",
        setupType: campaign.setupType || "",
        productCount: campaign.productCount || 0,
        giftCount: campaign.giftCount || 0,
        products: Array.isArray(campaign.products)
            ? campaign.products.slice(0, 8).map((item) => ({
                sku: item.sku || "",
                productName: item.productName || "",
                category: item.category || "",
                brand: item.brand || "",
                sellingPrice: item.sellingPrice ?? null,
                promotionPrice: item.promotionPrice ?? null,
                discountPercent: item.discountPercent ?? null,
                note: item.note || "",
            }))
            : [],
        gifts: Array.isArray(campaign.gifts)
            ? campaign.gifts.slice(0, 8).map((item) => ({
                giftCode: item.giftCode || "",
                giftName: item.giftName || "",
                giftValue: item.giftValue ?? null,
                condition: item.condition || "",
                note: item.note || "",
            }))
            : [],
    };
}

function buildCampaignAiInput(parsed) {
    const campaigns = Array.isArray(parsed?.campaigns) ? parsed.campaigns : [];

    return {
        fileName: parsed?.fileName || "",
        sheetCount: parsed?.sheetCount || 0,
        totalRows: parsed?.totalRows || 0,
        campaignCount: parsed?.campaignCount || campaigns.length,
        sheets: Array.isArray(parsed?.sheets) ? parsed.sheets : [],
        warnings: Array.isArray(parsed?.warnings) ? parsed.warnings : [],
        campaigns: campaigns.slice(0, 20).map(compactCampaignForAi),
    };
}

function extractJsonFromGeminiText(text) {
    if (!text) return null;

    let cleaned = String(text).trim();

    cleaned = cleaned
        .replace(/^```json/i, "")
        .replace(/^```/i, "")
        .replace(/```$/i, "")
        .trim();

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    try {
        return JSON.parse(cleaned);
    } catch (error) {
        console.warn("extractJsonFromGeminiText error:", error.message);
        return null;
    }
}

function createFallbackCampaignProposal(parsed, errorMessage = "") {
    const campaigns = Array.isArray(parsed?.campaigns) ? parsed.campaigns : [];
    const firstCampaign = campaigns[0] || {};

    return {
        campaignName:
            firstCampaign.campaignName ||
            "Đề xuất chiến dịch marketing từ dữ liệu Excel",
        objective:
            "Tận dụng dữ liệu chương trình khuyến mãi trong file Excel để xây dựng chiến dịch phù hợp cho website.",
        targetCustomers:
            firstCampaign.scope ||
            "Khách hàng mua sắm trên website, khách hàng mới và khách hàng có khả năng mua lại.",
        mainOffer:
            firstCampaign.promoContent ||
            "Ưu đãi theo nhóm sản phẩm, combo hoặc quà tặng tùy theo dữ liệu khuyến mãi.",
        marketingMessage:
            "Khám phá ưu đãi nổi bật trong thời gian giới hạn, áp dụng cho các sản phẩm được chọn trên website.",
        recommendedChannels: ["Website", "Email", "Social media"],
        kpiSuggestions: [
            "Doanh thu từ chiến dịch",
            "Số đơn hàng phát sinh",
            "Tỷ lệ chuyển đổi",
            "Giá trị đơn hàng trung bình",
        ],
        reason:
            "Đề xuất fallback được tạo từ dữ liệu đã parse vì Gemini không khả dụng hoặc không trả JSON hợp lệ.",
        priorityCampaigns: campaigns.slice(0, 3).map((item) => ({
            sourceCampaign: item.campaignName || "",
            whyChoose: `Có ${item.productCount || 0} sản phẩm và ${item.giftCount || 0} quà tặng hoặc ưu đãi.`,
            suggestedDirection:
                item.promoContent || "Có thể dùng làm chiến dịch ưu đãi nổi bật.",
        })),
        nextActions: [
            "Kiểm tra lại danh sách sản phẩm và quà tặng trước khi lưu chiến dịch.",
            "Chọn campaign phù hợp nhất với dữ liệu thời trang của website.",
            "Thiết lập thời gian chạy và kênh hiển thị trên website.",
        ],
        risks: [
            "Dữ liệu Excel có thể đến từ ngành khác nên cần admin duyệt lại trước khi áp dụng.",
        ],
        rawText: "",
        generatedAt: new Date().toISOString(),
        isFallback: true,
        error: errorMessage || null,
    };
}

async function generateCampaignAiProposal(parsed) {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
        return createFallbackCampaignProposal(
            parsed,
            "Thiếu GOOGLE_API_KEY nên dùng đề xuất fallback"
        );
    }

    const aiInput = buildCampaignAiInput(parsed);

    const prompt = `
Bạn là chuyên gia marketing e-commerce cho một website thời trang.

Nhiệm vụ:
- Đọc dữ liệu campaign đã được parse từ file Excel.
- Tạo đề xuất chiến dịch marketing phù hợp cho website thời trang.
- Nếu dữ liệu gốc thuộc ngành khác, chỉ rút ra logic khuyến mãi, không khuyến nghị bán trực tiếp sản phẩm không thuộc thời trang.
- Không tự bịa số liệu ngoài dữ liệu được cung cấp.
- Ưu tiên đề xuất chiến dịch dễ triển khai cho website thời trang: flash sale, combo, voucher, quà tặng kèm, khách hàng mới, khách hàng quay lại.
- Trả về JSON hợp lệ duy nhất, không markdown, không giải thích ngoài JSON.

Dữ liệu campaign:
${JSON.stringify(aiInput, null, 2)}

JSON output bắt buộc có dạng:
{
  "campaignName": "Tên chiến dịch đề xuất",
  "objective": "Mục tiêu chiến dịch",
  "targetCustomers": "Nhóm khách hàng mục tiêu",
  "mainOffer": "Ưu đãi chính",
  "marketingMessage": "Thông điệp truyền thông ngắn gọn",
  "recommendedChannels": ["Website", "Email", "Social media"],
  "kpiSuggestions": ["KPI 1", "KPI 2", "KPI 3"],
  "reason": "Lý do đề xuất",
  "priorityCampaigns": [
    {
      "sourceCampaign": "Tên campaign nguồn trong Excel",
      "whyChoose": "Vì sao nên ưu tiên",
      "suggestedDirection": "Hướng triển khai cho website thời trang"
    }
  ],
  "nextActions": ["Việc cần làm 1", "Việc cần làm 2"],
  "risks": ["Rủi ro hoặc lưu ý"]
}
`;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent(prompt);
        const rawText = result?.response?.text?.() || "";
        const json = extractJsonFromGeminiText(rawText);

        if (!json) {
            return createFallbackCampaignProposal(
                parsed,
                "Gemini không trả JSON hợp lệ"
            );
        }

        return {
            campaignName: json.campaignName || "Đề xuất chiến dịch từ Excel",
            objective: json.objective || "",
            targetCustomers: json.targetCustomers || "",
            mainOffer: json.mainOffer || "",
            marketingMessage: json.marketingMessage || "",
            recommendedChannels: Array.isArray(json.recommendedChannels)
                ? json.recommendedChannels
                : [],
            kpiSuggestions: Array.isArray(json.kpiSuggestions)
                ? json.kpiSuggestions
                : [],
            reason: json.reason || "",
            priorityCampaigns: Array.isArray(json.priorityCampaigns)
                ? json.priorityCampaigns
                : [],
            nextActions: Array.isArray(json.nextActions) ? json.nextActions : [],
            risks: Array.isArray(json.risks) ? json.risks : [],
            rawText,
            generatedAt: new Date().toISOString(),
            isFallback: false,
            model: modelName,
        };
    } catch (error) {
        console.error("generateCampaignAiProposal error:", error);

        return createFallbackCampaignProposal(parsed, error.message);
    }
}

function normalizeObjectIdValue(value) {
    if (!value) return null;

    if (typeof value === "object" && value._id) {
        return String(value._id);
    }

    return String(value);
}

function normalizeGiftRules(giftRules = []) {
    if (!Array.isArray(giftRules)) return [];

    return giftRules
        .map((rule) => {
            const buyProductId = normalizeObjectIdValue(rule.buyProductId);
            const giftProductId = normalizeObjectIdValue(rule.giftProductId);
            const giftVariantId = normalizeObjectIdValue(rule.giftVariantId);
            const giftSize = String(rule.giftSize || "").trim();

            if (
                !mongoose.Types.ObjectId.isValid(buyProductId) ||
                !mongoose.Types.ObjectId.isValid(giftProductId) ||
                !mongoose.Types.ObjectId.isValid(giftVariantId) ||
                !giftSize
            ) {
                return null;
            }

            return {
                type: "buy_x_get_gift",
                buyProductId,
                minQuantity: Math.max(1, Number(rule.minQuantity || 1)),
                giftProductId,
                giftVariantId,
                giftSize,
                giftQuantity: Math.max(1, Number(rule.giftQuantity || 1)),
                note: String(rule.note || "").trim(),
                active: rule.active !== false,
            };
        })
        .filter(Boolean);
}

function buildCampaignPayload(body = {}) {
    const startDate = parseDate(body.startDate);
    const endDate = parseDate(body.endDate);

    const payload = {
        name: String(body.name || "").trim(),
        objective: String(body.objective || "").trim(),
        description: String(body.description || "").trim(),
        targetChannel: String(body.targetChannel || "website").trim(),
        targetCustomers: String(body.targetCustomers || "").trim(),
        startDate,
        endDate,
        products: Array.isArray(body.products) ? body.products : [],
        gifts: Array.isArray(body.gifts) ? body.gifts : [],
        giftRules: normalizeGiftRules(body.giftRules),
        promotionSummary: String(body.promotionSummary || "").trim(),
    };

    if (body.source && ALLOWED_SOURCES.includes(body.source)) {
        payload.source = body.source;
    }

    if (body.status && ALLOWED_STATUSES.includes(body.status)) {
        payload.status = body.status;
    }

    if (body.aiProposal && typeof body.aiProposal === "object") {
        payload.aiProposal = {
            campaignName: body.aiProposal.campaignName || "",
            objective: body.aiProposal.objective || "",
            targetCustomers: body.aiProposal.targetCustomers || "",
            mainOffer: body.aiProposal.mainOffer || "",
            marketingMessage: body.aiProposal.marketingMessage || "",

            recommendedChannels: Array.isArray(body.aiProposal.recommendedChannels)
                ? body.aiProposal.recommendedChannels
                : [],

            kpiSuggestions: Array.isArray(body.aiProposal.kpiSuggestions)
                ? body.aiProposal.kpiSuggestions
                : [],

            reason: body.aiProposal.reason || "",

            priorityCampaigns: Array.isArray(body.aiProposal.priorityCampaigns)
                ? body.aiProposal.priorityCampaigns.map((item) => ({
                    sourceCampaign: item.sourceCampaign || "",
                    whyChoose: item.whyChoose || "",
                    suggestedDirection: item.suggestedDirection || "",
                }))
                : [],

            nextActions: Array.isArray(body.aiProposal.nextActions)
                ? body.aiProposal.nextActions
                : [],

            risks: Array.isArray(body.aiProposal.risks) ? body.aiProposal.risks : [],

            rawText: body.aiProposal.rawText || "",
            generatedAt: body.aiProposal.generatedAt || new Date(),
            isFallback: Boolean(body.aiProposal.isFallback),
            model: body.aiProposal.model || "",
            error: body.aiProposal.error || "",
        };
    }

    return payload;
}

function validateCampaignPayload(payload) {
    if (!payload.name) {
        return "Vui lòng nhập tên chiến dịch";
    }

    if (
        payload.startDate &&
        payload.endDate &&
        payload.startDate.getTime() > payload.endDate.getTime()
    ) {
        return "Ngày bắt đầu không được lớn hơn ngày kết thúc";
    }

    return null;
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value) {
    return Math.max(0, Math.round(toNumber(value)));
}

function normalizeSku(value) {
    return String(value || "").trim().toUpperCase();
}

function getBasePrice(sizeItem, campaignProduct) {
    const originalPrice = roundMoney(sizeItem.originalPrice);
    const price = roundMoney(sizeItem.price);
    const campaignOriginalPrice = roundMoney(campaignProduct.originalPrice);

    if (originalPrice > 0) return originalPrice;
    if (price > 0) return price;
    if (campaignOriginalPrice > 0) return campaignOriginalPrice;

    return 0;
}

function getDiscountPriceFromCampaign({ basePrice, campaignProduct }) {
    const promotionPrice = roundMoney(campaignProduct.promotionPrice);
    const discountPercent = toNumber(campaignProduct.discountPercent);

    if (basePrice <= 0) return 0;

    if (promotionPrice > 0 && promotionPrice < basePrice) {
        return promotionPrice;
    }

    if (discountPercent > 0 && discountPercent < 100) {
        return roundMoney(basePrice * (1 - discountPercent / 100));
    }

    return 0;
}

function calculateDiscountPercent(basePrice, discountPrice) {
    const safeBasePrice = roundMoney(basePrice);
    const safeDiscountPrice = roundMoney(discountPrice);

    if (safeBasePrice <= 0) return 0;
    if (safeDiscountPrice <= 0) return 0;
    if (safeDiscountPrice >= safeBasePrice) return 0;

    return Math.round(((safeBasePrice - safeDiscountPrice) / safeBasePrice) * 100);
}

exports.listCampaigns = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const q = String(req.query.q || "").trim();
        const status = String(req.query.status || "").trim();
        const source = String(req.query.source || "").trim();

        const filter = {};

        if (status && ALLOWED_STATUSES.includes(status)) {
            filter.status = status;
        } else {
            filter.status = { $ne: "archived" };
        }

        if (source && ALLOWED_SOURCES.includes(source)) {
            filter.source = source;
        }

        if (q) {
            const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = [
                { name: regex },
                { objective: regex },
                { description: regex },
                { targetCustomers: regex },
                { targetChannel: regex },
            ];
        }

        const [campaigns, total] = await Promise.all([
            Campaign.find(filter)
                .populate("createdBy", "firstName lastName email role")
                .populate("updatedBy", "firstName lastName email role")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Campaign.countDocuments(filter),
        ]);

        return res.json({
            data: campaigns,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("listCampaigns error:", error);
        return res.status(500).json({
            message: "Lỗi khi lấy danh sách chiến dịch",
            error: error.message,
        });
    }
};

exports.getCampaignById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "campaignId không hợp lệ" });
        }

        const campaign = await Campaign.findById(id)
            .populate("createdBy", "firstName lastName email role")
            .populate("updatedBy", "firstName lastName email role")
            .lean();

        if (!campaign) {
            return res.status(404).json({ message: "Không tìm thấy chiến dịch" });
        }

        return res.json({
            data: campaign,
        });
    } catch (error) {
        console.error("getCampaignById error:", error);
        return res.status(500).json({
            message: "Lỗi khi lấy chi tiết chiến dịch",
            error: error.message,
        });
    }
};

exports.createCampaign = async (req, res) => {
    try {
        const payload = buildCampaignPayload(req.body);
        const validationError = validateCampaignPayload(payload);

        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        payload.createdBy = getUserId(req);
        payload.updatedBy = getUserId(req);

        const campaign = await Campaign.create(payload);

        return res.status(201).json({
            message: "Đã tạo chiến dịch",
            data: campaign,
        });
    } catch (error) {
        console.error("createCampaign error:", error);
        return res.status(500).json({
            message: "Lỗi khi tạo chiến dịch",
            error: error.message,
        });
    }
};

exports.updateCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "campaignId không hợp lệ" });
        }

        const payload = buildCampaignPayload(req.body);
        const validationError = validateCampaignPayload(payload);

        if (validationError) {
            return res.status(400).json({ message: validationError });
        }

        payload.updatedBy = getUserId(req);

        const campaign = await Campaign.findByIdAndUpdate(
            id,
            { $set: payload },
            { new: true, runValidators: true }
        );

        if (!campaign) {
            return res.status(404).json({ message: "Không tìm thấy chiến dịch" });
        }

        return res.json({
            message: "Đã cập nhật chiến dịch",
            data: campaign,
        });
    } catch (error) {
        console.error("updateCampaign error:", error);
        return res.status(500).json({
            message: "Lỗi khi cập nhật chiến dịch",
            error: error.message,
        });
    }
};

exports.updateCampaignStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const status = String(req.body.status || "").trim();

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "campaignId không hợp lệ" });
        }

        if (!ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                message: "Trạng thái chiến dịch không hợp lệ",
            });
        }

        const campaign = await Campaign.findByIdAndUpdate(
            id,
            {
                $set: {
                    status,
                    updatedBy: getUserId(req),
                },
            },
            { new: true, runValidators: true }
        );

        if (!campaign) {
            return res.status(404).json({ message: "Không tìm thấy chiến dịch" });
        }

        return res.json({
            message: "Đã cập nhật trạng thái chiến dịch",
            data: campaign,
        });
    } catch (error) {
        console.error("updateCampaignStatus error:", error);
        return res.status(500).json({
            message: "Lỗi khi cập nhật trạng thái chiến dịch",
            error: error.message,
        });
    }
};

exports.deleteCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "campaignId không hợp lệ" });
        }

        const campaign = await Campaign.findByIdAndUpdate(
            id,
            {
                $set: {
                    status: "archived",
                    updatedBy: getUserId(req),
                },
            },
            { new: true }
        );

        if (!campaign) {
            return res.status(404).json({ message: "Không tìm thấy chiến dịch" });
        }

        return res.json({
            message: "Đã lưu trữ chiến dịch",
            data: campaign,
        });
    } catch (error) {
        console.error("deleteCampaign error:", error);
        return res.status(500).json({
            message: "Lỗi khi lưu trữ chiến dịch",
            error: error.message,
        });
    }
};

exports.importCampaignExcel = async (req, res) => {
    const uploadedPath = req.file?.path;

    try {
        if (!req.file) {
            return res.status(400).json({
                message: "Vui lòng upload file Excel",
            });
        }

        const parsed = await runPythonCampaignParser(uploadedPath);

        if (!parsed?.ok) {
            return res.status(400).json({
                message: parsed?.message || "Không thể phân tích file Excel",
                error: parsed?.error,
            });
        }

        const aiProposal = await generateCampaignAiProposal(parsed);

        return res.json({
            message: "Đã phân tích file Excel và tạo đề xuất AI",
            file: {
                originalName: req.file.originalname,
                filename: req.file.filename,
                size: req.file.size,
            },
            data: parsed,
            aiProposal,
            aiStatus: {
                usedGemini: !aiProposal?.isFallback,
                isFallback: Boolean(aiProposal?.isFallback),
                model: aiProposal?.model || process.env.GEMINI_MODEL || null,
                error: aiProposal?.error || null,
            },
        });
    } catch (error) {
        console.error("importCampaignExcel error:", error);

        return res.status(500).json({
            message: "Lỗi khi phân tích file Excel",
            error: error.message,
        });
    } finally {
        removeTempFile(uploadedPath);
    }
};

exports.applySaleFromCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "campaignId không hợp lệ" });
        }

        const {
            dryRun = false,
            force = true,
            setActive = true,
            saleStartAt,
            saleEndAt,
            saleNote,
        } = req.body || {};

        const campaign = await Campaign.findById(id);

        if (!campaign) {
            return res.status(404).json({ message: "Không tìm thấy chiến dịch" });
        }

        const campaignProducts = Array.isArray(campaign.products)
            ? campaign.products.filter((item) => item?.productId)
            : [];

        if (campaignProducts.length === 0) {
            return res.status(400).json({
                message:
                    "Campaign chưa có sản phẩm nào được liên kết với sản phẩm trong hệ thống. Vui lòng chọn sản phẩm thật từ database trước khi áp sale.",
            });
        }

        const effectiveSaleStartAt =
            saleStartAt !== undefined
                ? normalizeSaleBoundaryDate(saleStartAt, "start")
                : normalizeSaleBoundaryDate(campaign.startDate, "start");

        const effectiveSaleEndAt =
            saleEndAt !== undefined
                ? normalizeSaleBoundaryDate(saleEndAt, "end")
                : normalizeSaleBoundaryDate(campaign.endDate, "end");

        const effectiveSaleNote =
            String(saleNote || "").trim() ||
            `Campaign: ${campaign.name || "Chương trình khuyến mãi"}`;

        const results = [];

        let matchedProducts = 0;
        let matchedVariants = 0;
        let updatedSizes = 0;
        let skippedSizes = 0;

        for (const campaignProduct of campaignProducts) {
            const productId = campaignProduct.productId?._id || campaignProduct.productId;

            if (!mongoose.Types.ObjectId.isValid(productId)) {
                results.push({
                    productId,
                    productName: campaignProduct.productName || "",
                    status: "skipped",
                    reason: "productId không hợp lệ",
                });
                continue;
            }

            const campaignSku = normalizeSku(campaignProduct.sku);
            const promotionPrice = roundMoney(campaignProduct.promotionPrice);
            const discountPercent = toNumber(campaignProduct.discountPercent);

            if (promotionPrice <= 0 && discountPercent <= 0) {
                results.push({
                    productId,
                    productName: campaignProduct.productName || "",
                    status: "skipped",
                    reason:
                        "Sản phẩm trong campaign chưa có promotionPrice hoặc discountPercent hợp lệ",
                });
                continue;
            }

            const variants = await ProductVariant.find({ productId });

            if (!variants.length) {
                results.push({
                    productId,
                    productName: campaignProduct.productName || "",
                    status: "skipped",
                    reason: "Không tìm thấy biến thể nào của sản phẩm này",
                });
                continue;
            }

            matchedProducts += 1;

            const productResult = {
                productId,
                productName: campaignProduct.productName || "",
                campaignSku: campaignSku || null,
                status: "skipped",
                updatedSizes: 0,
                skippedSizes: 0,
                variants: [],
            };

            for (const variant of variants) {
                let variantChanged = false;

                const variantResult = {
                    variantId: variant._id,
                    color: variant.color,
                    updatedSizes: 0,
                    skippedSizes: 0,
                    sizes: [],
                };

                const sizes = Array.isArray(variant.sizes) ? variant.sizes : [];

                for (const sizeItem of sizes) {
                    const sizeSku = normalizeSku(sizeItem.sku);

                    if (campaignSku && sizeSku !== campaignSku) {
                        skippedSizes += 1;
                        productResult.skippedSizes += 1;
                        variantResult.skippedSizes += 1;

                        variantResult.sizes.push({
                            sizeId: sizeItem._id,
                            size: sizeItem.size,
                            sku: sizeItem.sku || "",
                            status: "skipped",
                            reason: "SKU không khớp với SKU trong campaign",
                        });

                        continue;
                    }

                    if (!force && sizeItem.onSale) {
                        skippedSizes += 1;
                        productResult.skippedSizes += 1;
                        variantResult.skippedSizes += 1;

                        variantResult.sizes.push({
                            sizeId: sizeItem._id,
                            size: sizeItem.size,
                            sku: sizeItem.sku || "",
                            status: "skipped",
                            reason: "Size này đang sale, force=false nên không ghi đè",
                        });

                        continue;
                    }

                    const basePrice = getBasePrice(sizeItem, campaignProduct);

                    const discountPrice = getDiscountPriceFromCampaign({
                        basePrice,
                        campaignProduct,
                    });

                    if (basePrice <= 0) {
                        skippedSizes += 1;
                        productResult.skippedSizes += 1;
                        variantResult.skippedSizes += 1;

                        variantResult.sizes.push({
                            sizeId: sizeItem._id,
                            size: sizeItem.size,
                            sku: sizeItem.sku || "",
                            status: "skipped",
                            reason: "Không xác định được giá gốc",
                        });

                        continue;
                    }

                    if (discountPrice <= 0 || discountPrice >= basePrice) {
                        skippedSizes += 1;
                        productResult.skippedSizes += 1;
                        variantResult.skippedSizes += 1;

                        variantResult.sizes.push({
                            sizeId: sizeItem._id,
                            size: sizeItem.size,
                            sku: sizeItem.sku || "",
                            status: "skipped",
                            reason: "Giá khuyến mãi không hợp lệ hoặc không nhỏ hơn giá gốc",
                            basePrice,
                            discountPrice,
                            promotionPrice,
                            discountPercent,
                        });

                        continue;
                    }

                    const nextDiscountPercent = calculateDiscountPercent(
                        basePrice,
                        discountPrice
                    );

                    if (!dryRun) {
                        sizeItem.price = basePrice;
                        sizeItem.originalPrice = basePrice;
                        sizeItem.discountPrice = discountPrice;
                        sizeItem.discountPercent = nextDiscountPercent;
                        sizeItem.onSale = true;
                        sizeItem.saleStartAt = effectiveSaleStartAt;
                        sizeItem.saleEndAt = effectiveSaleEndAt;
                        sizeItem.saleNote = effectiveSaleNote;
                    }

                    variantChanged = true;
                    updatedSizes += 1;
                    productResult.updatedSizes += 1;
                    variantResult.updatedSizes += 1;

                    variantResult.sizes.push({
                        sizeId: sizeItem._id,
                        size: sizeItem.size,
                        sku: sizeItem.sku || "",
                        status: dryRun ? "will_apply" : "applied",
                        basePrice,
                        discountPrice,
                        discountPercent: nextDiscountPercent,
                    });
                }

                if (variantChanged) {
                    matchedVariants += 1;

                    if (!dryRun) {
                        variant.markModified("sizes");
                        await variant.save();
                    }
                }

                if (
                    variantResult.updatedSizes > 0 ||
                    variantResult.skippedSizes > 0
                ) {
                    productResult.variants.push(variantResult);
                }
            }

            if (productResult.updatedSizes > 0) {
                productResult.status = dryRun ? "will_apply" : "applied";
            }

            results.push(productResult);
        }

        let updatedCampaign = campaign;

        if (!dryRun && setActive && updatedSizes > 0) {
            campaign.status = "active";
            campaign.updatedBy = getUserId(req);

            updatedCampaign = await campaign.save();
        }

        const responsePayload = {
            message: dryRun
                ? "Đã kiểm tra campaign, chưa áp sale thật"
                : updatedSizes > 0
                    ? "Đã áp sale từ campaign vào sản phẩm"
                    : "Chưa áp được sale nào từ campaign",
            data: updatedCampaign,
            dryRun: Boolean(dryRun),
            summary: {
                matchedProducts,
                matchedVariants,
                updatedSizes,
                skippedSizes,
            },
            results,
        };

        if (!dryRun && updatedSizes === 0) {
            return res.status(400).json(responsePayload);
        }

        return res.json(responsePayload);
    } catch (error) {
        console.error("applySaleFromCampaign error:", error);

        return res.status(500).json({
            message: "Lỗi khi áp sale từ campaign",
            error: error.message,
        });
    }
};