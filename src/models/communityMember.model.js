const mongoose = require("mongoose");

const communityMemberSchema = new mongoose.Schema({
  community: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Community",
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  role: {
    type: String,
    enum: ["follower", "creator"],
    default: "follower",
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
});

communityMemberSchema.index(
  { community: 1, user: 1, role: 1 },
  { unique: true }
);

module.exports = mongoose.model("CommunityMember", communityMemberSchema);
