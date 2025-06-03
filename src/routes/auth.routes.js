const express = require("express");
const router = express.Router();
const {
  sendPhoneOTP,
  verifyPhoneOTP,
  registerUser,
  login,
} = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");

// Public routes
router.post("/send-otp", sendPhoneOTP);
router.post("/verify-otp", verifyPhoneOTP);
router.post("/login", login);

// Protected routes
router.post("/register", registerUser);

module.exports = router;
