// src/routes/api.js
const express = require('express');
const router = express.Router();

function createApiRoutes(apiController, authMiddleware) {
  // Validate inputs
  if (!apiController) {
    throw new Error('API controller is required');
  }
  if (!authMiddleware) {
    throw new Error('Auth middleware is required');
  }

  // Generate new API key (protected route - would need admin auth in production)
  router.post('/keys', async (req, res) => {
    try {
      await apiController.generateApiKey(req, res);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // List API keys
  router.get('/keys', async (req, res) => {
    try {
      await apiController.listApiKeys(req, res);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Revoke API key
  router.delete('/keys/:keyId', async (req, res) => {
    try {
      await apiController.revokeApiKey(req, res);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage()
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
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          environment: process.env.NODE_ENV || 'development'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  return router;
}

module.exports = createApiRoutes;