const app = require('./app');
const http = require('http');
const { connectDB } = require('./config/database');
const { startDeadlineNotificationJob } = require('./jobs/deadlineNotificationJob');
const realtimeSocket = require('./socket');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();
    const httpServer = http.createServer(app);
    realtimeSocket.init(httpServer);
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    startDeadlineNotificationJob();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
