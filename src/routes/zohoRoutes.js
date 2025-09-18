
const express = require("express");
const router = express.Router();
const controller = require("../zoho/zohoController");

/**
 * OAuth
 */
router.get("/:providerId/auth/start", controller.startAuth);
router.get("/callback", controller.handleCallback);

/**
 * Lead upsert + note
 */
router.post("/:providerId/leads", controller.upsertLead);
router.post("/:providerId/leads/:leadId/convert", controller.convertLead);

module.exports = router;
