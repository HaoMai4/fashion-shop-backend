const mongoose = require("mongoose");

const CampaignProductSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            default: null,
        },
        sku: String,
        productName: String,
        category: String,
        brand: String,
        originalPrice: Number,
        promotionPrice: Number,
        discountPercent: Number,
        note: String,
    },
    { _id: false }
);

const CampaignGiftSchema = new mongoose.Schema(
    {
        giftCode: String,
        giftName: String,
        giftValue: Number,
        condition: String,
        note: String,
    },
    { _id: false }
);

const CampaignGiftRuleSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["buy_x_get_gift"],
            default: "buy_x_get_gift",
        },

        buyProductId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },

        minQuantity: {
            type: Number,
            default: 1,
            min: 1,
        },

        giftProductId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },

        giftVariantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ProductVariant",
            required: true,
        },

        giftSize: {
            type: String,
            required: true,
            trim: true,
        },

        giftQuantity: {
            type: Number,
            default: 1,
            min: 1,
        },

        note: {
            type: String,
            default: "",
        },

        active: {
            type: Boolean,
            default: true,
        },
    },
    { _id: true }
);

const CampaignPriorityProposalSchema = new mongoose.Schema(
    {
        sourceCampaign: String,
        whyChoose: String,
        suggestedDirection: String,
    },
    { _id: false }
);

const CampaignAiProposalSchema = new mongoose.Schema(
    {
        campaignName: String,
        objective: String,
        targetCustomers: String,
        mainOffer: String,
        marketingMessage: String,
        recommendedChannels: [String],
        kpiSuggestions: [String],
        reason: String,

        priorityCampaigns: [CampaignPriorityProposalSchema],
        nextActions: [String],
        risks: [String],

        rawText: String,
        generatedAt: Date,
        isFallback: { type: Boolean, default: false },
        model: String,
        error: String,
    },
    { _id: false }
);

const CampaignSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        objective: {
            type: String,
            default: "",
            trim: true,
        },

        description: {
            type: String,
            default: "",
            trim: true,
        },

        targetChannel: {
            type: String,
            default: "website",
            trim: true,
        },

        targetCustomers: {
            type: String,
            default: "",
            trim: true,
        },

        startDate: {
            type: Date,
            default: null,
        },

        endDate: {
            type: Date,
            default: null,
        },

        products: [CampaignProductSchema],
        gifts: [CampaignGiftSchema],

        giftRules: {
            type: [CampaignGiftRuleSchema],
            default: [],
        },

        promotionSummary: {
            type: String,
            default: "",
        },

        aiProposal: {
            type: CampaignAiProposalSchema,
            default: null,
        },

        source: {
            type: String,
            enum: ["manual", "excel", "ai_excel"],
            default: "manual",
        },

        status: {
            type: String,
            enum: ["draft", "active", "ended", "archived"],
            default: "draft",
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

CampaignSchema.index({ status: 1, createdAt: -1 });
CampaignSchema.index({ source: 1, createdAt: -1 });
CampaignSchema.index({ name: "text", objective: "text", description: "text" });
CampaignSchema.index({ status: 1, startDate: 1, endDate: 1 });
CampaignSchema.index({ "giftRules.buyProductId": 1, status: 1 });

module.exports = mongoose.model("Campaign", CampaignSchema);