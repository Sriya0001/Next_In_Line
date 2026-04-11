require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./config/db');
const { startDecayScheduler } = require('./scheduler/decayScheduler');

const PORT = process.env.PORT || 4000;

async function bootstrap() {
  try {
    await connectDB();
    console.log('✅ Database connection established');

    startDecayScheduler();
    console.log('✅ Decay scheduler started');

    app.listen(PORT, () => {
      console.log(`🚀 Next In Line server running on http://localhost:${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
