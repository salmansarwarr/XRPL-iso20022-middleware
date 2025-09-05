// src/routes/transactions.js
const express = require('express');
const router = express.Router();

function createTransactionRoutes(transactionController, authMiddleware) {
  // Validate inputs
  if (!transactionController) {
    throw new Error('Transaction controller is required');
  }
  if (!authMiddleware) {
    throw new Error('Auth middleware is required');
  }

  // Process XRPL transaction
  router.post('/process/:txHash', 
    authMiddleware.authenticateApiKey(['write']), 
    async (req, res) => {
      try {
        await transactionController.processXRPLTransaction(req, res);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  // Get transaction by ID
  router.get('/:id', 
    authMiddleware.authenticateApiKey(['read']), 
    async (req, res) => {
      try {
        await transactionController.getTransaction(req, res);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  // List transactions
  router.get('/', 
    authMiddleware.authenticateApiKey(['read']), 
    async (req, res) => {
      try {
        await transactionController.listTransactions(req, res);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  // Get ISO 20022 XML for transaction
  router.get('/:id/xml', 
    authMiddleware.authenticateApiKey(['read']), 
    async (req, res) => {
      try {
        await transactionController.getISO20022XML(req, res);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  // Revalidate transaction
  router.post('/:id/revalidate', 
    authMiddleware.authenticateApiKey(['write']), 
    async (req, res) => {
      try {
        await transactionController.revalidateTransaction(req, res);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  return router;
}

module.exports = createTransactionRoutes;