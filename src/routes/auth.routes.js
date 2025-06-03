const express = require("express");
const router = express.Router();
const {
  sendPhoneOTP,
  verifyPhoneOTP,
  registerUser,
  login,
  getMe,
  getUserProfile,
} = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");

// Public routes
router.post("/send-otp", sendPhoneOTP);
router.post("/verify-otp", verifyPhoneOTP);
router.post("/login", login);
router.post("/register", registerUser);
router.get("/profile/:username", getUserProfile);

// Protected routes
router.get("/me", protect, getMe);

module.exports = router;
