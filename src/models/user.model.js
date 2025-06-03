const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
    },
    name: {
      type: String,
      required: function () {
        return this.isPhoneVerified;
      },
    },
    username: {
      type: String,
      required: function () {
        return this.isPhoneVerified;
      },
      sparse: true,
    },
    dateOfBirth: {
      type: Date,
      required: function () {
        return this.isPhoneVerified;
      },
    },
    gender: {
      type: String,
      required: function () {
        return this.isPhoneVerified;
      },
      enum: ["male", "female", "other"],
    },
    preference: {
      type: [String],
      default: [],
    },
    profilePhoto: {
      type: String,
    },
    videoLanguage: {
      type: String,
    },
    location: {
      type: String,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    lastOtpSent: {
      type: Date,
    },
    otp: {
      code: String,
      expiresAt: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
