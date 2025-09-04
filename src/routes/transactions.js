const express = require('express');
const router = express.Router();

function createTransactionRoutes(transactionController, authMiddleware) {
  console.log(transactionController.processXRPLTransaction)
  // Process XRPL transaction
  router.post('/process/:txHash', 
    authMiddleware.authenticateApiKey(['write']), 
    transactionController.processXRPLTransaction.bind(transactionController)
  );
  
  // Get transaction by ID
  router.get('/:id', 
    authMiddleware.authenticateApiKey(['read']), 
    transactionController.getTransaction.bind(transactionController)
  );

  // List transactions
  router.get('/', 
    authMiddleware.authenticateApiKey(['read']), 
    transactionController.listTransactions.bind(transactionController)
  );

  // Get ISO 20022 XML for transaction
  router.get('/:id/xml', 
    authMiddleware.authenticateApiKey(['read']), 
    transactionController.getISO20022XML.bind(transactionController)
  );

  // Revalidate transaction
  router.post('/:id/revalidate', 
    authMiddleware.authenticateApiKey(['write']), 
    transactionController.revalidateTransaction.bind(transactionController)
  );

  return router;
}

module.exports = createTransactionRoutes;