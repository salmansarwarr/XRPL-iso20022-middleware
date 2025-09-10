const cron = require('cron');
const XRPLService = require('./XRPLService');
const TransactionController = require('../controllers/TransactionController');

class SchedulerService {
  constructor(sequelize) {
    this.xrplService = new XRPLService();
    this.transactionController = new TransactionController(sequelize);
    this.jobs = [];
  }

  startTransactionMonitoring() {
    // Monitor for new HCT transactions every minute
    const job = new cron.CronJob('0 * * * * *', async () => {
      try {
        await this.scanForNewTransactions();
      } catch (error) {
        console.error('Error in transaction monitoring job:', error);
      }
    });

    job.start();
    this.jobs.push(job);
    console.info('Started transaction monitoring job');
  }

  startValidationCleanup() {
    // Clean up old validation results daily at midnight
    const job = new cron.CronJob('0 0 0 * * *', async () => {
      try {
        await this.cleanupOldValidations();
      } catch (error) {
        console.error('Error in validation cleanup job:', error);
      }
    });

    job.start();
    this.jobs.push(job);
    console.info('Started validation cleanup job');
  }

  async scanForNewTransactions() {
    try {
      // Get recent transactions for monitored addresses
      const monitoredAddresses = process.env.MONITORED_ADDRESSES?.split(',') || [];
      
      for (const address of monitoredAddresses) {
        const transactions = await this.xrplService.getAccountTransactions(address.trim(), null, 10);
        
        for (const tx of transactions.transactions || []) {
          if (this.xrplService.isHCTTransaction(tx.tx)) {
            // Check if we've already processed this transaction
            const existing = await this.transactionController.Transaction.findOne({
              where: { xrplTxHash: tx.tx.hash }
            });
            
            if (!existing) {
              console.info(`Found new HCT transaction: ${tx.tx.hash}`);
              // Process automatically
              const req = { params: { txHash: tx.tx.hash }, query: {} };
              const res = {
                json: () => {},
                status: () => ({ json: () => {} })
              };
              await this.transactionController.processXRPLTransaction(req, res);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error scanning for new transactions:', error);
    }
  }

  async cleanupOldValidations() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // Clean up old validation errors for processed transactions
      const result = await this.transactionController.Transaction.update(
        { validationErrors: null },
        {
          where: {
            processed: true,
            processedAt: { [Op.lt]: thirtyDaysAgo }
          }
        }
      );

      console.info(`Cleaned up validation data for ${result[0]} old transactions`);
    } catch (error) {
      console.error('Error cleaning up old validations:', error);
    }
  }

  stopAllJobs() {
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    console.info('Stopped all scheduled jobs');
  }
}

module.exports = SchedulerService;