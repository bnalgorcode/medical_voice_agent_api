const express = require("express");
const router = express.Router();
const {
  fetchDoctors,
  fetchDoctorByProviderId,
  askDoctorLLM,
} = require("../controllers/doctorController");

router.get("/", fetchDoctors);
router.get("/:providerId", fetchDoctorByProviderId);
router.post("/:providerId/ask", askDoctorLLM);

module.exports = router;
