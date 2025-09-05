// test/setup.js - Component verification test
require('dotenv').config();

// Mock logger for testing
const mockLogger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args)
};

// Test individual components
async function testComponents() {
  console.log('🧪 Testing Hoodie Chicken Middleware Components...\n');

  try {
    // Test 1: Logger
    console.log('1️⃣ Testing Logger...');
    const logger = require('../src/config/logger');
    logger.info('Logger test successful');
    console.log('✅ Logger working\n');

    // Test 2: Database Manager
    console.log('2️⃣ Testing Database Manager...');
    const DatabaseManager = require('../src/config/database');
    console.log('✅ Database Manager loaded\n');

    // Test 3: Controllers (without database)
    console.log('3️⃣ Testing Controllers...');
    
    // Mock Sequelize for testing
    const mockSequelize = {
      define: () => ({
        findOne: () => Promise.resolve(null),
        findByPk: () => Promise.resolve(null),
        findAndCountAll: () => Promise.resolve({ rows: [], count: 0 }),
        create: () => Promise.resolve({ id: 'test' }),
        update: () => Promise.resolve([1])
      })
    };

    const TransactionController = require('../src/controllers/TransactionController');
    const transactionController = new TransactionController(mockSequelize);
    console.log('✅ Transaction Controller initialized');

    const ApiController = require('../src/controllers/ApiController');
    const apiController = new ApiController(mockSequelize);
    console.log('✅ API Controller initialized');

    const AuthMiddleware = require('../src/middleware/auth');
    const authMiddleware = new AuthMiddleware(apiController);
    console.log('✅ Auth Middleware initialized\n');

    // Test 4: Routes
    console.log('4️⃣ Testing Routes...');
    const createTransactionRoutes = require('../src/routes/transactions');
    const createApiRoutes = require('../src/routes/api');
    
    const transactionRoutes = createTransactionRoutes(transactionController, authMiddleware);
    const apiRoutes = createApiRoutes(apiController, authMiddleware);
    console.log('✅ Routes created successfully\n');

    // Test 5: Services
    console.log('5️⃣ Testing Services...');
    const XRPLService = require('../src/services/XRPLService');
    const xrplService = new XRPLService();
    console.log('✅ XRPL Service initialized');

    const MappingEngine = require('../src/services/MappingEngine');
    const mappingEngine = new MappingEngine();
    console.log('✅ Mapping Engine initialized');

    const XMLGenerator = require('../src/services/XMLGenerator');
    const xmlGenerator = new XMLGenerator();
    console.log('✅ XML Generator initialized');

    const ValidationService = require('../src/services/ValidationService');
    const validationService = new ValidationService();
    console.log('✅ Validation Service initialized\n');

    // Test 6: Main Application Class (without starting)
    console.log('6️⃣ Testing Main Application Class...');
    const HoodieChickenMiddleware = require('../src/app');
    const app = new HoodieChickenMiddleware();
    console.log('✅ Main application class created\n');

    console.log('🎉 All components loaded successfully!');
    console.log('📋 Component Summary:');
    console.log('   - Logger: ✅');
    console.log('   - Database Manager: ✅');
    console.log('   - Transaction Controller: ✅');
    console.log('   - API Controller: ✅');
    console.log('   - Auth Middleware: ✅');
    console.log('   - Routes: ✅');
    console.log('   - Services: ✅');
    console.log('   - Main App: ✅');

  } catch (error) {
    console.error('❌ Component test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Test API key functionality
function testApiKeyFunctionality() {
  console.log('\n🔐 Testing API Key Functionality...');
  
  const ApiController = require('../src/controllers/ApiController');
  const mockSequelize = { define: () => ({}) };
  const apiController = new ApiController(mockSequelize);
  
  // Test API key validation
  const testKey = 'default_api_key_12345';
  const keyData = apiController.validateApiKey(testKey);
  
  if (keyData) {
    console.log('✅ Default API key validation working');
    console.log('   Key ID:', keyData.id);
    console.log('   Permissions:', keyData.permissions);
  } else {
    console.log('❌ API key validation failed');
  }
}

// Test XML generation
function testXMLGeneration() {
  console.log('\n📄 Testing XML Generation...');
  
  const XMLGenerator = require('../src/services/XMLGenerator');
  const xmlGenerator = new XMLGenerator();
  
  const mockMappedData = {
    messageId: 'TEST-MSG-001',
    creationDateTime: new Date().toISOString(),
    numberOfTransactions: '1',
    controlSum: '100.00',
    instructionId: 'INST-001',
    endToEndId: 'E2E-001',
    transactionId: 'TXN-001',
    instructedAmount: {
      currency: 'HCT',
      value: '100.00'
    },
    debtor: {
      name: 'Test Debtor',
      identification: 'rTestDebtor123'
    },
    debtorAccount: {
      identification: 'rTestDebtor123',
      currency: 'HCT'
    },
    creditor: {
      name: 'Test Creditor',
      identification: 'rTestCreditor456'
    },
    creditorAccount: {
      identification: 'rTestCreditor456',
      currency: 'HCT'
    },
    remittanceInformation: {
      unstructured: 'Test payment'
    },
    chargeBearer: 'SLEV',
    purposeCode: 'CBFF'
  };
  
  try {
    const pacs008XML = xmlGenerator.generatePacs008XML(mockMappedData);
    console.log('✅ pacs.008 XML generation working');
    console.log('   XML length:', pacs008XML.length, 'characters');
    
    const pain001XML = xmlGenerator.generatePain001XML(mockMappedData);
    console.log('✅ pain.001 XML generation working');
    console.log('   XML length:', pain001XML.length, 'characters');
  } catch (error) {
    console.error('❌ XML generation failed:', error.message);
  }
}

// Run tests
if (require.main === module) {
  testComponents()
    .then(() => {
      testApiKeyFunctionality();
      testXMLGeneration();
      console.log('\n🚀 Ready to start the application!');
      console.log('💡 Run: npm start');
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testComponents,
  testApiKeyFunctionality,
  testXMLGeneration
};