// debug-startup.js
require('dotenv').config();

console.log('🚀 Hoodie Chicken Middleware - Debug Startup');
console.log('==========================================\n');

// Step 1: Check environment variables
console.log('1️⃣ Environment Check:');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'undefined');
console.log('   PORT:', process.env.PORT || '3000 (default)');
console.log('   POSTGRES_URL:', process.env.POSTGRES_URL ? '✅ Set' : '❌ Missing');
console.log('   XRPL_NODE:', process.env.XRPL_NODE || 'wss://xrplcluster.com (default)');
console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set' : '❌ Missing');
console.log('');

// Step 2: Test individual components
async function debugStartup() {
  try {
    console.log('2️⃣ Loading Components:');
  
    // Load database manager
    console.log('   Loading database manager...');
    const DatabaseManager = require('./src/config/database');
    console.log('   ✅ Database manager loaded');
    
    // Load models
    console.log('   Loading transaction model...');
    const TransactionModel = require('./src/models/Transaction');
    console.log('   ✅ Transaction model loaded');
    
    // Load services
    console.log('   Loading services...');
    const XRPLService = require('./src/services/XRPLService');
    const MappingEngine = require('./src/services/MappingEngine');
    const XMLGenerator = require('./src/services/XMLGenerator');
    const ValidationService = require('./src/services/ValidationService');
    const SchedulerService = require('./src/services/SchedulerService');
    console.log('   ✅ Services loaded');
    
    // Load controllers
    console.log('   Loading controllers...');
    const TransactionController = require('./src/controllers/TransactionController');
    const ApiController = require('./src/controllers/ApiController');
    console.log('   ✅ Controllers loaded');
    
    // Load middleware
    console.log('   Loading auth middleware...');
    const AuthMiddleware = require('./src/middleware/auth');
    console.log('   ✅ Auth middleware loaded');
    
    // Load routes
    console.log('   Loading routes...');
    const createTransactionRoutes = require('./src/routes/transactions');
    const createApiRoutes = require('./src/routes/api');
    console.log('   ✅ Routes loaded');
    
    console.log('\n3️⃣ Testing Component Initialization:');
    
    // Test with mock sequelize
    console.log('   Testing with mock database...');
    const mockSequelize = {
      define: (name, schema, options) => ({
        findOne: () => Promise.resolve(null),
        findByPk: () => Promise.resolve(null),
        findAndCountAll: () => Promise.resolve({ rows: [], count: 0 }),
        create: () => Promise.resolve({ id: 'test-id' }),
        update: () => Promise.resolve([1])
      }),
      sync: () => Promise.resolve(),
      authenticate: () => Promise.resolve(),
      close: () => Promise.resolve()
    };
    
    // Test transaction controller
    console.log('   Initializing transaction controller...');
    const transactionController = new TransactionController(mockSequelize);
    console.log('   ✅ Transaction controller initialized');
    
    // Test API controller
    console.log('   Initializing API controller...');
    const apiController = new ApiController(mockSequelize);
    console.log('   ✅ API controller initialized');
    
    // Test auth middleware
    console.log('   Initializing auth middleware...');
    const authMiddleware = new AuthMiddleware(apiController);
    console.log('   ✅ Auth middleware initialized');
    
    // Test routes creation
    console.log('   Creating routes...');
    const transactionRoutes = createTransactionRoutes(transactionController, authMiddleware);
    const apiRoutes = createApiRoutes(apiController, authMiddleware);
    console.log('   ✅ Routes created successfully');
    
    console.log('\n4️⃣ Testing Main Application:');
    console.log('   Loading main application class...');
    const HoodieChickenMiddleware = require('./src/app');
    console.log('   ✅ Main application class loaded');
    
    console.log('\n🎉 All components loaded successfully!');
    console.log('📝 Next steps:');
    console.log('   1. Ensure PostgreSQL is running');
    console.log('   2. Update .env file with correct database URL');
    console.log('   3. Run: npm start');
    
  } catch (error) {
    console.error('\n❌ Component loading failed:');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
    console.error('\n🔧 Troubleshooting:');
    console.error('   - Check that all npm packages are installed: npm install');
    console.error('   - Verify .env file configuration');
    console.error('   - Ensure all required files exist in src/ directory');
  }
}

// Step 3: Test database connection (optional)
async function testDatabaseConnection() {
  if (!process.env.POSTGRES_URL) {
    console.log('\n⚠️  Skipping database test (POSTGRES_URL not set)');
    return;
  }
  
  console.log('\n5️⃣ Testing Database Connection:');
  try {
    const DatabaseManager = require('./src/config/database');
    console.log('   Attempting to connect to PostgreSQL...');
    const sequelize = await DatabaseManager.initPostgreSQL();
    console.log('   ✅ Database connection successful');
    await sequelize.close();
    console.log('   ✅ Database connection closed');
  } catch (error) {
    console.error('   ❌ Database connection failed:', error.message);
    console.error('   💡 Make sure PostgreSQL is running and credentials are correct');
  }
}

// Run debug startup
debugStartup()
  .then(() => testDatabaseConnection())
  .then(() => {
    console.log('\n✨ Debug startup completed!');
    console.log('🚀 Ready to run the full application with: npm start');
  })
  .catch(error => {
    console.error('\n💥 Debug startup failed:', error);
    process.exit(1);
  });