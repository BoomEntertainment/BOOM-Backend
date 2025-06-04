const express = require("express");
const router = express.Router();
const walletController = require("../controllers/wallet.controller");
const { protect } = require("../middleware/auth.middleware");

router.get("/", protect, walletController.getWalletAndHistory);
router.post("/add", protect, walletController.addMoney);
router.post("/pay", protect, walletController.processPayment);
router.post("/withdraw", protect, walletController.withdraw);

module.exports = router;
