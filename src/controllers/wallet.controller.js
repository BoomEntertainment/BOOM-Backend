const Wallet = require("../models/wallet.model");
const WalletHistory = require("../models/walletHistory.model");
const mongoose = require("mongoose");

exports.getWalletAndHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({ userId });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const history = await WalletHistory.find({ userId })
      .populate({
        path: "reason.id",
        select: function () {
          switch (this.reason?.name) {
            case "Video":
              return "title thumbnailUrl duration views";
            case "Subscription":
              return "name price duration";
            case "Comment":
              return "content";
            case "Community":
              return "name description";
            default:
              return "";
          }
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await WalletHistory.countDocuments({ userId });

    const transformedHistory = history.map((record) => {
      const historyObj = record.toObject();

      if (historyObj.reason && historyObj.reason.id) {
        historyObj.reasonDetails = {
          type: historyObj.reason.name,
          details: historyObj.reason.id,
        };

        delete historyObj.reason.id;
      }

      return historyObj;
    });

    res.json({
      success: true,
      data: {
        wallet,
        history: transformedHistory,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching wallet details",
      error: error.message,
    });
  }
};

exports.addMoney = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, transactionType = "recharge" } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    if (!["recharge", "reward", "refund", "other"].includes(transactionType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction type",
      });
    }

    // TODO: Integrate Razorpay here for recharge type
    if (transactionType === "recharge") {
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOneAndUpdate(
        { userId },
        { $inc: { balance: amount } },
        { new: true, upsert: true, session }
      );

      const history = await WalletHistory.create(
        [
          {
            userId,
            type: "payin",
            transactionType,
            amount,
            status: transactionType === "recharge" ? "pending" : "completed",
          },
        ],
        { session }
      );

      await session.commitTransaction();

      res.json({
        success: true,
        data: {
          wallet,
          history: history[0],
          paymentDetails:
            transactionType === "recharge"
              ? {
                  message: "Payment integration pending",
                }
              : undefined,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding money to wallet",
      error: error.message,
    });
  }
};

exports.processPayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, reason } = req.body;

    if (!amount || amount <= 0 || !reason || !reason.name || !reason.id) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment details",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOne({ userId }).session(session);

      if (!wallet || wallet.balance < amount) {
        throw new Error("Insufficient balance");
      }

      await Wallet.findOneAndUpdate(
        { userId },
        { $inc: { balance: -amount } },
        { session }
      );

      const history = await WalletHistory.create(
        [
          {
            userId,
            type: "payout",
            transactionType: "other",
            amount,
            reason,
            status: "completed",
          },
        ],
        { session }
      );

      await session.commitTransaction();

      res.json({
        success: true,
        data: {
          remainingBalance: wallet.balance - amount,
          transaction: history[0],
        },
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error processing payment",
      error: error.message,
    });
  }
};

exports.withdraw = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, bankDetails } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal amount",
      });
    }

    if (
      !bankDetails ||
      !bankDetails.accountNumber ||
      !bankDetails.ifscCode ||
      !bankDetails.accountHolderName
    ) {
      return res.status(400).json({
        success: false,
        message: "Bank details are required for withdrawal",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOne({ userId }).session(session);

      if (!wallet) {
        throw new Error("Wallet not found");
      }

      if (wallet.balance < amount) {
        throw new Error("Insufficient balance for withdrawal");
      }

      await Wallet.findOneAndUpdate(
        { userId },
        { $inc: { balance: -amount } },
        { session }
      );

      const history = await WalletHistory.create(
        [
          {
            userId,
            type: "payout",
            amount,
            transactionType: "withdrawal",
            status: "completed",
          },
        ],
        { session }
      );

      await session.commitTransaction();

      res.json({
        success: true,
        data: {
          message: "Withdrawal successful",
          remainingBalance: wallet.balance - amount,
          withdrawal: {
            id: history[0]._id,
            amount,
            status: "completed",
            bankDetails: {
              accountNumber: bankDetails.accountNumber,
              ifscCode: bankDetails.ifscCode,
              accountHolderName: bankDetails.accountHolderName,
            },
            createdAt: history[0].createdAt,
          },
        },
      });
    } catch (error) {
      await session.abortTransaction();

      await WalletHistory.create({
        userId,
        type: "payout",
        amount,
        transactionType: "withdrawal",
        status: "failed",
      });

      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error processing withdrawal request",
      error: error.message,
    });
  }
};
