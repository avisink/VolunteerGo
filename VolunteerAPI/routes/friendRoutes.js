const express = require("express");
const router = express.Router();
const friendController = require("../controllers/friendController");
const { verifyFirebaseToken } = require("../middleware/auth"); 
const { requireFeature } = require("../middleware/featureGate");
router.use(requireFeature("friends")); // before auth: 503 for everyone while off (FEATURE_FLAGS.md)
router.use(verifyFirebaseToken);

router.post("/request", friendController.sendFriendRequest);
router.get("/received-requests", friendController.getReceivedFriendRequests);
router.get("/sent-requests", friendController.getSentFriendRequests);
router.post("/accept", friendController.acceptFriendRequest);
router.post("/reject", friendController.rejectFriendRequest);
router.post("/unfriend", friendController.unfriend);
router.get("/list", friendController.getFriends);
router.post("/cancel", friendController.cancelFriendRequest);
module.exports = router;
