const TransactionModel = require("../models/Transaction");
const XRPLService = require("../services/XRPLService");
const MappingEngine = require("../services/MappingEngine");
const XMLGenerator = require("../services/XMLGenerator");
const ValidationService = require("../services/ValidationService");
const logger = require("../config/logger");

class TransactionController {
    constructor(sequelize) {
        this.Transaction = TransactionModel(sequelize);
        this.xrplService = new XRPLService();
        this.mappingEngine = new MappingEngine();
        this.xmlGenerator = new XMLGenerator();
        this.validationService = new ValidationService();
    }

    async processXRPLTransaction(req, res) {
        try {
            const { txHash } = req.params;

            // Check if already processed
            const existingTx = await this.Transaction.findOne({
                where: { xrplTxHash: txHash },
            });
            if (existingTx) {
                return res.json({
                    message: "Transaction already processed",
                    transaction: existingTx,
                });
            }

            // Get transaction from XRPL
            const xrplTx = await this.xrplService.getTransaction(txHash);

            if (!this.xrplService.isHCTTransaction(xrplTx)) {
                return res
                    .status(400)
                    .json({ error: "Not an HCT transaction" });
            }

            // Map to ISO 20022
            const mappedData = this.mappingEngine.mapXRPLToISO20022(xrplTx);

            // Generate XML
            const messageType = req.query.messageType || "pacs.008";
            let xmlString;
            if (messageType === "pacs.008") {
                xmlString = this.xmlGenerator.generatePacs008XML(mappedData);
            } else if (messageType === "pain.001") {
                xmlString = this.xmlGenerator.generatePain001XML(mappedData);
            } else {
                return res
                    .status(400)
                    .json({ error: "Unsupported message type" });
            }

            // Validate XML
            const validationResults = await this.validationService.validateXML(
                xmlString,
                messageType
            );

            // Save to database
            const transaction = await this.Transaction.create({
                xrplTxHash: txHash,
                fromAddress: xrplTx.Account,
                toAddress: xrplTx.Destination,
                amount: this.mappingEngine.extractAmount(xrplTx.Amount),
                currency: xrplTx.Amount.currency || "HCT",
                memo: this.xrplService.extractMemo(xrplTx),
                rawTransaction: xrplTx,
                iso20022Xml: xmlString,
                validationStatus: validationResults.isValid
                    ? "valid"
                    : "invalid",
                validationErrors: validationResults.errors,
                processed: true,
                processedAt: new Date(),
            });

            res.json({
                transactions: transaction.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: transaction.count,
                    pages: Math.ceil(transaction.count / limit),
                },
            });
        } catch (error) {
            logger.error("Error listing transactions:", error);
            res.status(500).json({ error: error.message });
        }
    }

    async getISO20022XML(req, res) {
        try {
            const { id } = req.params;
            const transaction = await this.Transaction.findByPk(id);

            if (!transaction) {
                return res.status(404).json({ error: "Transaction not found" });
            }

            if (!transaction.iso20022Xml) {
                return res
                    .status(404)
                    .json({
                        error: "ISO 20022 XML not generated for this transaction",
                    });
            }

            res.set("Content-Type", "application/xml");
            res.send(transaction.iso20022Xml);
        } catch (error) {
            logger.error("Error fetching ISO 20022 XML:", error);
            res.status(500).json({ error: error.message });
        }
    }

    async revalidateTransaction(req, res) {
        try {
            const { id } = req.params;
            const transaction = await this.Transaction.findByPk(id);

            if (!transaction) {
                return res.status(404).json({ error: "Transaction not found" });
            }

            if (!transaction.iso20022Xml) {
                return res.status(400).json({ error: "No XML to validate" });
            }

            const messageType = req.query.messageType || "pacs.008";
            const validationResults = await this.validationService.validateXML(
                transaction.iso20022Xml,
                messageType
            );

            await transaction.update({
                validationStatus: validationResults.isValid
                    ? "valid"
                    : "invalid",
                validationErrors: validationResults.errors,
            });

            res.json({
                transaction: transaction,
                validation: validationResults,
            });
        } catch (error) {
            logger.error("Error revalidating transaction:", error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = TransactionController;
