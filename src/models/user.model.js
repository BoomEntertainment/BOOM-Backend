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
        return this.isRegistered;
      },
    },
    username: {
      type: String,
      required: function () {
        return this.isRegistered;
      },
      sparse: true,
    },
    dateOfBirth: {
      type: Date,
      required: function () {
        return this.isRegistered;
      },
    },
    gender: {
      type: String,
      required: function () {
        return this.isRegistered;
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
    isRegistered: {
      type: Boolean,
      default: false,
    },
    bio: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
