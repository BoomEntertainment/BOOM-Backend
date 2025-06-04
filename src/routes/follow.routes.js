const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getUsers,
} = require("../controllers/follow.controller");

// Protected routes
router.post("/:userId/follow", protect, followUser);
router.delete("/:userId/unfollow", protect, unfollowUser);

// Public routes
router.get("/", getUsers);
router.get("/:userId/followers", getFollowers);
router.get("/:userId/following", getFollowing);

module.exports = router;
