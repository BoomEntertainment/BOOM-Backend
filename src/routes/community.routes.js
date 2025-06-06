const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const { uploadMiddleware } = require("../middleware/upload.middleware");
const {
  createCommunity,
  getAllCommunities,
  getCommunity,
  updateCommunity,
  toggleFollow,
  becomeCreator,
  getCommunityMembers,
  getUserCommunities,
} = require("../controllers/community.controller");

const uploadCommunityPhoto = uploadMiddleware("profile_photo");

router.get("/", getAllCommunities);
router.get("/user", protect, getUserCommunities);
router.get("/:id", protect, getCommunity);
router.get("/:id/members", protect, getCommunityMembers);

router.post("/", protect, uploadCommunityPhoto, createCommunity);
router.put("/:id", protect, uploadCommunityPhoto, updateCommunity);
router.post("/:id/follow", protect, toggleFollow);
router.post("/:id/creator", protect, becomeCreator);

module.exports = router;
