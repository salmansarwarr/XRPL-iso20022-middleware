const xrpl = require('xrpl');
const logger = require('../config/logger');

class XRPLService {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  async connect() {
    try {
      this.client = new xrpl.Client(process.env.XRPL_NODE);
      await this.client.connect();
      this.connected = true;
      logger.info('XRPL client connected');
    } catch (error) {
      logger.error('XRPL connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client && this.connected) {
      await this.client.disconnect();
      this.connected = false;
      logger.info('XRPL client disconnected');
    }
  }

  async getAccountTransactions(address, marker = null, limit = 200) {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const request = {
        command: 'account_tx',
        account: address,
        limit: limit,
        ledger_index_min: -1,
        ledger_index_max: -1
      };

      if (marker) {
        request.marker = marker;
      }

      const response = await this.client.request(request);
      return response.result;
    } catch (error) {
      logger.error('Error fetching account transactions:', error);
      throw error;
    }
  }

  async getTransaction(txHash) {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const response = await this.client.request({
        command: 'tx',
        transaction: txHash
      });
      return response.result;
    } catch (error) {
      logger.error('Error fetching transaction:', error);
      throw error;
    }
  }

  isHCTTransaction(transaction) {
    return transaction.TransactionType === 'Payment' && 
           transaction.Amount && 
           typeof transaction.Amount === 'object' &&
           transaction.Amount.currency === process.env.HCT_CURRENCY_CODE &&
           transaction.Amount.issuer === process.env.HCT_TOKEN_ISSUER;
  }

  extractMemo(transaction) {
    if (transaction.Memos && transaction.Memos.length > 0) {
      const memo = transaction.Memos[0].Memo;
      if (memo.MemoData) {
        return Buffer.from(memo.MemoData, 'hex').toString('utf8');
      }
    }
    return null;
  }
}

module.exports = XRPLService;
