const express = require("express");
const cors = require("cors");

const doctorRoutes = require("./routes/doctorRoutes");

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
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

module.exports = app;
