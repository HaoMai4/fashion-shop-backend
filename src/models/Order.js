const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant",
    },
    name: String,
    sku: String,
    color: String,
    size: String,
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    discountPrice: {
      type: Number,
      default: 0,
    },
    finalPrice: {
      type: Number,
      default: 0,
    },
    image: String,
  },
  { _id: false }
);

const ShippingAddressSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    addressLine1: {
      type: String,
      required: true,
      trim: true,
    },
    addressLine2: {
      type: String,
      default: "",
    },
    ward: {
      type: String,
      default: "",
    },
    district: {
      type: String,
      default: "",
    },
    city: {
      type: String,
      default: "",
    },
    postalCode: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const GuestInfoSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const PaymentMethodSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["COD", "PayOS"],
      default: "COD",
    },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled"],
      default: "pending",
    },
    transactionId: String,
    invoiceUrl: String,
    note: String,
    expiresAt: Date,
    paidAt: Date,
    cancelledAt: Date,
    failedAt: Date,
  },
  { _id: false }
);

const VoucherSnapshotItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    quantity: {
      type: Number,
      default: 1,
    },
    lineTotal: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const VoucherSnapshotSchema = new mongoose.Schema(
  {
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      default: null,
    },
    code: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: ["percent", "fixed", null],
      default: null,
    },
    value: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    totalBeforeVoucher: {
      type: Number,
      default: 0,
    },
    totalAfterVoucher: {
      type: Number,
      default: 0,
    },
    appliedItems: {
      type: [VoucherSnapshotItemSchema],
      default: [],
    },
    redeemed: {
      type: Boolean,
      default: false,
    },
    redeemedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const ConfirmationSchema = new mongoose.Schema(
  {
    token: String,
    confirmed: {
      type: Boolean,
      default: false,
    },
    expiresAt: Date,
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    guestInfo: GuestInfoSchema,

    orderCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    items: {
      type: [OrderItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "Đơn hàng phải có ít nhất một sản phẩm",
      },
    },

    shippingAddress: {
      type: ShippingAddressSchema,
      required: true,
    },

    paymentMethod: {
      type: PaymentMethodSchema,
      default: () => ({
        type: "COD",
        status: "pending",
      }),
    },

    orderStatus: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
        "completed",
        "reported",
      ],
      default: "pending",
      index: true,
    },

    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    discount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    customerNote: String,

    metadata: mongoose.Schema.Types.Mixed,

    voucher: {
      type: VoucherSnapshotSchema,
      default: undefined,
    },

    unconfirmed: {
      type: Boolean,
      default: false,
    },

    confirmation: {
      type: ConfirmationSchema,
      default: undefined,
    },
  },
  { timestamps: true }
);

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ orderStatus: 1, createdAt: -1 });
OrderSchema.index({ "paymentMethod.status": 1, createdAt: -1 });
OrderSchema.index({ "paymentMethod.transactionId": 1 }, { sparse: true });

module.exports = mongoose.model("Order", OrderSchema);