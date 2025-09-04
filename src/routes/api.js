const express = require('express');
const router = express.Router();

function createApiRoutes(apiController, authMiddleware) {
  // Generate new API key (protected route - would need admin auth in production)
  router.post('/keys', apiController.generateApiKey.bind(apiController));

  // List API keys
  router.get('/keys', apiController.listApiKeys.bind(apiController));

  // Revoke API key
  router.delete('/keys/:keyId', apiController.revokeApiKey.bind(apiController));

  // Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  // System status
  router.get('/status', 
    authMiddleware.authenticateApiKey(['read']),
    async (req, res) => {
      try {
        // Add system status checks here
        res.json({
          xrpl: 'connected',
          database: 'connected',
          validation: 'available',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  return router;
}

module.exports = createApiRoutes;