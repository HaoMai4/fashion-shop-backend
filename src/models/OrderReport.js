const mongoose = require('mongoose');

const OrderReportSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  reason: {
    type: String,
    required: true,
    trim: true,
  },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },

  previousStatus: {
    type: String,
    default: 'pending',
  },

  rejectReason: {
    type: String,
    default: '',
    trim: true,
  },

  adminNote: {
    type: String,
    default: '',
    trim: true,
  },

  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  processedAt: {
    type: Date,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('OrderReport', OrderReportSchema);