const User = require("../models/user.model");
const Wallet = require("../models/wallet.model");
const { AppError } = require("../middleware/error.middleware");
const multer = require("multer");
const path = require("path");
const jwt = require("jsonwebtoken");
const { getFollowCounts } = require("./follow.controller");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { uploadMiddleware } = require("../middleware/upload.middleware");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
      return cb(new Error("Only image files are allowed!"), false);
    }
    cb(null, true);
  },
}).single("profilePhoto");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

exports.sendPhoneOTP = async (req, res, next) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      throw new AppError("Phone number is required", 400);
    }

    const user = await User.findOne({ phone });
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    console.log(`OTP for ${phone}: ${otp}`);

    if (user) {
      user.otp = { code: otp, expiresAt: otpExpiry };
      user.lastOtpSent = new Date();
      await user.save();
    } else {
      await User.create({
        phone,
        otp: { code: otp, expiresAt: otpExpiry },
        lastOtpSent: new Date(),
      });
    }

    res.status(200).json({
      status: "success",
      message: "OTP sent successfully",
      isExistingUser: !!user,
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyPhoneOTP = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      throw new AppError("Phone number and OTP are required", 400);
    }

    const user = await User.findOne({ phone });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (!user.otp || !user.otp.code || !user.otp.expiresAt) {
      throw new AppError("No OTP was sent or it has expired", 400);
    }

    if (new Date() > user.otp.expiresAt) {
      throw new AppError("OTP has expired", 400);
    }

    if (user.otp.code !== otp) {
      throw new AppError("Invalid OTP", 400);
    }

    user.otp = undefined;
    user.isPhoneVerified = true;
    await user.save();

    let token;
    if (user.name && user.username) {
      token = generateToken(user._id);
    }

    res.status(200).json({
      status: "success",
      message: "Phone number verified successfully",
      isRegistered: !!(user.name && user.username),
      token: token || undefined,
    });
  } catch (error) {
    next(error);
  }
};

exports.registerUser = async (req, res, next) => {
  try {
    upload(req, res, async function (err) {
      if (err instanceof multer.MulterError) {
        return next(new AppError(err.message, 400));
      } else if (err) {
        return next(new AppError("Error uploading file", 400));
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const {
          phone,
          name,
          username,
          dateOfBirth,
          gender,
          preference,
          videoLanguage,
          location,
        } = req.body;

        if (!phone || !name || !username || !dateOfBirth || !gender) {
          throw new AppError("Missing required fields", 400);
        }

        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
          throw new AppError("Username already taken", 400);
        }

        const user = await User.findOne({ phone });
        if (!user || !user.isPhoneVerified) {
          throw new AppError("Phone number not verified", 400);
        }

        let profilePhotoUrl = "";
        if (req.file) {
          profilePhotoUrl = req.file.path;
        }

        user.isRegistered = true;
        user.name = name;
        user.username = username;
        user.dateOfBirth = new Date(dateOfBirth);
        user.gender = gender;
        user.preference = preference;
        user.profilePhoto = profilePhotoUrl;
        user.videoLanguage = videoLanguage;
        user.location = location;

        await user.save({ session });

        await Wallet.create(
          [
            {
              userId: user._id,
              balance: 0,
            },
          ],
          { session }
        );

        await session.commitTransaction();

        const token = generateToken(user._id);

        res.status(200).json({
          status: "success",
          message: "User registered successfully",
          token,
          data: {
            user: {
              phone: user.phone,
              name: user.name,
              username: user.username,
              dateOfBirth: user.dateOfBirth,
              gender: user.gender,
              preference: user.preference,
              profilePhoto: user.profilePhoto,
              videoLanguage: user.videoLanguage,
              location: user.location,
              followersCount: 0,
              followingCount: 0,
              walletBalance: 0,
            },
          },
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    });
  } catch (error) {
    next(error);
  }
};

const getUserWithWalletAndFollowInfo = async (userId, currentUserId = null) => {
  const user = await User.findById(userId).select("-__v");
  if (!user) return null;

  const [wallet, { followersCount, followingCount }] = await Promise.all([
    Wallet.findOne({ userId }),
    getFollowCounts(userId),
  ]);

  let isFollowing = false;
  if (currentUserId) {
    const Follow = require("../models/follow.model");
    isFollowing = await Follow.exists({
      follower: currentUserId,
      following: userId,
    });
  }

  return {
    ...user.toObject(),
    followersCount,
    followingCount,
    walletBalance: wallet ? wallet.balance : 0,
    isFollowing,
  };
};

exports.getMe = async (req, res) => {
  try {
    const userData = await getUserWithWalletAndFollowInfo(req.user.id);

    if (!userData) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      data: { user: userData },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching user profile",
      error: error.message,
    });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findOne({
      $or: [{ username: req.params.username }, { name: req.params.username }],
    }).select(
      "name username profilePhoto preference videoLanguage location createdAt"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userData = await getUserWithWalletAndFollowInfo(
      user._id,
      req.user?.id
    );

    res.json({
      success: true,
      data: { user: userData },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching user profile",
      error: error.message,
    });
  }
};

exports.login = async (req, res, next) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      throw new AppError("Please provide your phone number", 400);
    }

    const user = await User.findOne({ phone });

    if (!user) {
      throw new AppError("No user found with this phone number", 404);
    }

    if (!user.isPhoneVerified) {
      throw new AppError("Please verify your phone number first", 401);
    }

    if (!user.name || !user.username) {
      throw new AppError("Please complete your registration first", 401);
    }

    const userData = await getUserWithWalletAndFollowInfo(user._id);
    const token = generateToken(user._id);

    res.status(200).json({
      status: "success",
      token,
      data: { user: userData },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, bio } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (bio) updateData.bio = bio;
    if (req.file) {
      updateData.profilePhoto = `/uploads/${req.file.filename}`;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  }
};

exports.uploadProfilePhoto = uploadMiddleware("profilePhoto");
