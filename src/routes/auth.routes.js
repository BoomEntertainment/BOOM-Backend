const express = require("express");
const router = express.Router();
const {
  sendPhoneOTP,
  verifyOTP,
  registerUser,
  login,
  getMe,
  getUserProfile,
  updateProfile,
  uploadProfilePhoto,
} = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");

// Public routes
router.post("/send-otp", sendPhoneOTP);
router.post("/verify-otp", verifyOTP);
router.post("/register", registerUser);
router.get("/profile/:username", getUserProfile);

// Protected routes
router.post("/login", protect, login);
router.get("/me", protect, getMe);
router.put("/profile", protect, uploadProfilePhoto, updateProfile);

module.exports = router;
