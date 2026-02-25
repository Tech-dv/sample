require('dotenv').config();
const express = require("express");
const cors = require("cors");
const { errorHandler, notFound } = require("./middleware/errorHandler");

// Import routes
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const customerRoutes = require("./routes/customerRoutes");
const userRoutes = require("./routes/userRoutes");
const trainRoutes = require("./routes/trainRoutes");
const reviewerRoutes = require("./routes/reviewerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const wagonRoutes = require("./routes/wagonRoutes");
const cameraRoutes = require("./routes/cameraRoutes");
const randomCountingRoutes = require("./routes/randomCountingRoutes");
const dropdownRoutes = require("./routes/dropdownRoutes");

const app = express();

require("./services/haulOutAlertService");

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/", authRoutes);
app.use("/", dashboardRoutes);
app.use("/", customerRoutes);
app.use("/", userRoutes);
app.use("/", trainRoutes);
app.use("/", reviewerRoutes);
app.use("/", adminRoutes);
app.use("/", wagonRoutes);
app.use("/", cameraRoutes);
app.use("/", randomCountingRoutes);
app.use("/", dropdownRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
