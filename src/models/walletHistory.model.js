const mongoose = require("mongoose");

const walletHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: ["payin", "payout"],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  razorpayId: {
    type: String,
    sparse: true,
  },
  reason: {
    name: {
      type: String,
      enum: ["Video", "Subscription", "Comment", "Community"],
      required: true,
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "reason.name",
    },
  },
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

walletHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("WalletHistory", walletHistorySchema);
