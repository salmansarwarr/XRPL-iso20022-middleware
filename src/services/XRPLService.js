const xrpl = require('xrpl');

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
      console.info('XRPL client connected');
    } catch (error) {
      console.error('XRPL connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client && this.connected) {
      await this.client.disconnect();
      this.connected = false;
      console.info('XRPL client disconnected');
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
      console.error('Error fetching account transactions:', error);
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
      console.error('Error fetching transaction:', error);
      throw error;
    }
  }

  isHCTTransaction(transaction) {
    console.log(transaction);
    
    // Check if it's a Payment transaction
    if (transaction.TransactionType !== 'Payment') {
      return false;
    }

    // Check if Amount exists
    if (!transaction.Amount) {
      return false;
    }

    // Handle XRP native payments (Amount is a string)
    if (typeof transaction.Amount === 'string') {
      // This is an XRP payment - you can add additional criteria here
      // For example, minimum amount thresholds or specific address patterns
      return this.isValidXRPPayment(transaction);
    }

    // Handle token payments (Amount is an object)
    if (typeof transaction.Amount === 'object') {
      return transaction.Amount.currency === process.env.HCT_CURRENCY_CODE &&
             transaction.Amount.issuer === process.env.HCT_TOKEN_ISSUER;
    }

    return false;
  }

  isValidXRPPayment(transaction) {
    // Add your criteria for what constitutes a valid HCT XRP payment
    // Examples:
    
    // 1. Minimum amount threshold (15 XRP = 15,000,000 drops)
    const minAmountDrops = parseInt(process.env.MIN_XRP_AMOUNT_DROPS || '1000000');
    const amountDrops = parseInt(transaction.Amount);
    
    if (amountDrops < minAmountDrops) {
      return false;
    }

    return true;
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

    // Helper method to get currency info from Amount
    getCurrencyInfo(amount) {
      if (typeof amount === 'string') {
        return {
          currency: 'XRP',
          value: (parseInt(amount) / 1000000).toString(), // Convert drops to XRP
          issuer: null
        };
      } else if (typeof amount === 'object') {
        return {
          currency: amount.currency,
          value: amount.value,
          issuer: amount.issuer
        };
      }
      return null;
    }
}

module.exports = XRPLService;
