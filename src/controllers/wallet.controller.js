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
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await WalletHistory.countDocuments({ userId });

    res.json({
      success: true,
      data: {
        wallet,
        history,
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

// Add money to wallet (Razorpay integration placeholder)
exports.addMoney = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    // TODO: Integrate Razorpay here
    // For now, we'll just add the money directly
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Update wallet balance
      const wallet = await Wallet.findOneAndUpdate(
        { userId },
        { $inc: { balance: amount } },
        { new: true, upsert: true, session }
      );

      // Create history record
      const history = await WalletHistory.create(
        [
          {
            userId,
            type: "payin",
            amount,
            reason: {
              name: "video", // placeholder
              id: userId, // placeholder
            },
            status: "completed",
          },
        ],
        { session }
      );

      await session.commitTransaction();

      res.json({
        success: true,
        data: { wallet, history: history[0] },
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

// Process payment for various items (video, subscription, comment, community)
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
      // Check and update wallet balance
      const wallet = await Wallet.findOne({ userId }).session(session);

      if (!wallet || wallet.balance < amount) {
        throw new Error("Insufficient balance");
      }

      // Update wallet
      await Wallet.findOneAndUpdate(
        { userId },
        { $inc: { balance: -amount } },
        { session }
      );

      // Create history record
      const history = await WalletHistory.create(
        [
          {
            userId,
            type: "payout",
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
