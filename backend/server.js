require('dotenv').config();
const app = require("./src/app");
const { startCameraAlertPoller, stopCameraAlertPoller } = require("./src/services/cameraAlertService");
const { startLoadingAlertPoller, stopLoadingAlertPoller } = require("./src/services/loadingAlertService");

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`Backend running on ${HOST}:${PORT}`);

  // Start email alert pollers once the server is ready
  startCameraAlertPoller();
  startLoadingAlertPoller();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  stopCameraAlertPoller();
  stopLoadingAlertPoller();
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  stopCameraAlertPoller();
  stopLoadingAlertPoller();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
