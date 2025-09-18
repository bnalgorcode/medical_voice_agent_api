const express = require("express");
const cors = require("cors");

const doctorRoutes = require("./routes/doctorRoutes");
const zohoRoutes = require("./routes/zohoRoutes");

const app = express();

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: [
      "https://creator.voiceflow.com",
      "https://general.voiceflow.com",
      "https://api.bastiongpt.com",
    ],
  })
);

// Routes
app.use("/api/doctors", doctorRoutes);
app.use("/api/zoho", zohoRoutes);

module.exports = app;
