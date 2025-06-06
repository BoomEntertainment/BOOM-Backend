const mongoose = require("mongoose");

const communitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Community name is required"],
      unique: true,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
    },
    profile_photo: {
      type: String,
    },
    founder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cost: {
      type: Number,
      default: 0,
      min: [0, "Cost cannot be negative"],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Community", communitySchema);
