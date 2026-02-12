/* =====================================================
   ERROR HANDLING MIDDLEWARE
===================================================== */
const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Default error
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

// 404 handler
const notFound = (req, res, next) => {
  res.status(404).json({ message: "Route not found" });
};

module.exports = {
  errorHandler,
  notFound,
};
