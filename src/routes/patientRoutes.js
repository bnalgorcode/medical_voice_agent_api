const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer();
const { createOrUpdatePatient } = require("../controllers/patientController");

// POST /api/patients
// Accept JSON, x-www-form-urlencoded, and multipart/form-data
router.post("/", upload.none(), createOrUpdatePatient);

module.exports = router;
