// src/controllers/TransactionController.js
const TransactionModel = require('../models/Transaction');
const XRPLService = require('../services/XRPLService');
const MappingEngine = require('../services/MappingEngine');
const XMLGenerator = require('../services/XMLGenerator');
const ValidationService = require('../services/ValidationService');
const { Op } = require('sequelize');

class TransactionController {
  constructor(sequelize) {
    if (!sequelize) {
      throw new Error('Sequelize instance is required');
    }
    
    this.sequelize = sequelize;
    this.Transaction = TransactionModel(sequelize);
    this.xrplService = new XRPLService();
    this.mappingEngine = new MappingEngine();
    this.xmlGenerator = new XMLGenerator();
    this.validationService = new ValidationService();
    
    // Bind methods to preserve context
    this.processXRPLTransaction = this.processXRPLTransaction.bind(this);
    this.getTransaction = this.getTransaction.bind(this);
    this.listTransactions = this.listTransactions.bind(this);
    this.getISO20022XML = this.getISO20022XML.bind(this);
    this.revalidateTransaction = this.revalidateTransaction.bind(this);
  }

  async processXRPLTransaction(req, res) {
    try {
      const { txHash } = req.params;
      
      if (!txHash) {
        return res.status(400).json({ error: 'Transaction hash is required' });
      }

      // Check if already processed
      const existingTx = await this.Transaction.findOne({ 
        where: { xrplTxHash: txHash } 
      });
      
      if (existingTx) {
        return res.json({ 
          message: 'Transaction already processed', 
          transaction: existingTx 
        });
      }

      // Get transaction from XRPL
      console.log(`Fetching XRPL transaction: ${txHash}`)
      const xrplTx = await this.xrplService.getTransaction(txHash);
      
      if (!this.xrplService.isHCTTransaction(xrplTx)) {
        return res.status(400).json({ error: 'Not an HCT transaction' });
      }

      // Map to ISO 20022
      console.info(`Mapping transaction to ISO 20022: ${txHash}`);
      const mappedData = this.mappingEngine.mapXRPLToISO20022(xrplTx);
      
      // Generate XML
      const messageType = req.query.messageType || 'pacs.008';
      let xmlString;
      
      if (messageType === 'pacs.008') {
        xmlString = this.xmlGenerator.generatePacs008XML(mappedData);
      } else if (messageType === 'pain.001') {
        xmlString = this.xmlGenerator.generatePain001XML(mappedData);
      } else {
        return res.status(400).json({ error: 'Unsupported message type' });
      }

      // Validate XML
      console.info(`Validating XML for transaction: ${txHash}`);
      const validationResults = await this.validationService.validateXML(xmlString, messageType);

      // Save to database
      const transaction = await this.Transaction.create({
        xrplTxHash: txHash,
        fromAddress: xrplTx.Account,
        toAddress: xrplTx.Destination,
        amount: this.mappingEngine.extractAmount(xrplTx.Amount),
        currency: (xrplTx.Amount && xrplTx.Amount.currency) || 'HCT',
        memo: this.xrplService.extractMemo(xrplTx),
        rawTransaction: xrplTx,
        iso20022Xml: xmlString,
        validationStatus: validationResults.isValid ? 'valid' : 'invalid',
        validationErrors: validationResults.errors,
        processed: true,
        processedAt: new Date()
      });

      res.json({
        transaction: transaction,
        iso20022Xml: xmlString,
        validation: validationResults
      });

      console.info(`Successfully processed transaction: ${txHash}`);
    } catch (error) {
      console.error('Error processing transaction:', {
        error: error.message,
        stack: error.stack,
        txHash: req.params.txHash
      });
      res.status(500).json({ error: error.message });
    }
  }

  async getTransaction(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Transaction ID is required' });
      }

      const transaction = await this.Transaction.findByPk(id);
      
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      res.json(transaction);
    } catch (error) {
      console.error('Error fetching transaction:', {
        error: error.message,
        stack: error.stack,
        transactionId: req.params.id
      });
      res.status(500).json({ error: error.message });
    }
  }

  async listTransactions(req, res) {
    try {
      const { page = 1, limit = 20, status, address } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const whereClause = {};
      if (status) {
        whereClause.validationStatus = status;
      }
      if (address) {
        whereClause[Op.or] = [
          { fromAddress: address },
          { toAddress: address }
        ];
      }

      const transactions = await this.Transaction.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      res.json({
        transactions: transactions.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: transactions.count,
          pages: Math.ceil(transactions.count / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error listing transactions:', {
        error: error.message,
        stack: error.stack,
        query: req.query
      });
      res.status(500).json({ error: error.message });
    }
  }

  async getISO20022XML(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Transaction ID is required' });
      }

      const transaction = await this.Transaction.findByPk(id);
      
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      if (!transaction.iso20022Xml) {
        return res.status(404).json({ error: 'ISO 20022 XML not generated for this transaction' });
      }

      res.set('Content-Type', 'application/xml');
      res.send(transaction.iso20022Xml);
    } catch (error) {
      console.error('Error fetching ISO 20022 XML:', {
        error: error.message,
        stack: error.stack,
        transactionId: req.params.id
      });
      res.status(500).json({ error: error.message });
    }
  }

  async revalidateTransaction(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Transaction ID is required' });
      }

      const transaction = await this.Transaction.findByPk(id);
      
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      if (!transaction.iso20022Xml) {
        return res.status(400).json({ error: 'No XML to validate' });
      }

      const messageType = req.query.messageType || 'pacs.008';
      const validationResults = await this.validationService.validateXML(
        transaction.iso20022Xml, 
        messageType
      );

      await transaction.update({
        validationStatus: validationResults.isValid ? 'valid' : 'invalid',
        validationErrors: validationResults.errors
      });

      res.json({
        transaction: transaction,
        validation: validationResults
      });
    } catch (error) {
      console.error('Error revalidating transaction:', {
        error: error.message,
        stack: error.stack,
        transactionId: req.params.id
      });
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = TransactionController;