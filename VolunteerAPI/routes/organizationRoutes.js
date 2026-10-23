const express = require("express");
const router = express.Router();
const controller = require("../controllers/organizationController.js");
const { verifyFirebaseToken, requireAdmin } = require("../middleware/auth");

// Writes are admin-only (D-API-007); reads stay public.
const adminOnly = [verifyFirebaseToken, requireAdmin];

router.post("/", adminOnly, controller.create);
router.get("/", controller.getAll);
router.get("/:id", controller.getById);
router.put("/:id", adminOnly, controller.update);
router.delete("/:id", adminOnly, controller.remove);

module.exports = router;
