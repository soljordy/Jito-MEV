import { Connection, Keypair, VersionedTransaction, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import fetch from 'cross-fetch';
import { Wallet } from '@project-serum/anchor';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const parseEnvVar = (name, defaultValue = null, parser = (x) => x) => {
  const value = process.env[name];
  if (value == null) {
    if (defaultValue != null) return defaultValue;
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return parser(value);
};

const RPC_URL = parseEnvVar('RPC_URL');
const JITO_API_URL = parseEnvVar('JITO_API_URL');
const SLIPPAGE_BPS = parseEnvVar('SLIPPAGE_PERCENTAGE', 0, parseInt);
const JITO_TIP_AMOUNT_LAMPORTS = parseEnvVar('JITO_TIP_AMOUNT_SOL', 0, (v) => parseFloat(v) * 1000000000);
const SWAP_AMOUNT_LAMPORTS = parseEnvVar('SWAP_AMOUNT_SOL', 0, (v) => parseFloat(v) * 1000000000);
const PRIVATE_KEY = parseEnvVar('PRIVATE_KEY');
const CUSTOM_PRIORITIZATION_FEE_LAMPORTS = parseEnvVar('PRIORITIZATION_FEE_LAMPORTS', 0, parseInt);
const COMPUTE_UNIT_LIMIT_VALUE = parseEnvVar('COMPUTE_UNIT_LIMIT', 0, parseInt);
const JITO_SIGNATURE_FEE_LAMPORTS = parseEnvVar('JITO_SIGNATURE_FEE', 0, parseInt);
const SOL_MINT_ADDRESS = parseEnvVar('SOL_MINT_ADDRESS');
const USDC_MINT_ADDRESS = parseEnvVar('USDC_MINT_ADDRESS');
const TIP_ACCOUNTS = parseEnvVar('TIP_ACCOUNTS').split(',');
const QUOTE_API_URL = parseEnvVar('QUOTE_API_URL');
const SWAP_API_URL = parseEnvVar('SWAP_API_URL');
const ONLY_DIRECT_ROUTES = parseEnvVar('ONLY_DIRECT_ROUTES');

const connection = new Connection(RPC_URL);
const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY)));

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error: ${response.statusText} - ${errorText}`);
  }
  return data;
};

const getQuote = async (inputMint, outputMint, amount) => {
  const quoteUrl = `${QUOTE_API_URL}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${SLIPPAGE_BPS}&onlyDirectRoutes=${ONLY_DIRECT_ROUTES}`;
  return await fetchJson(quoteUrl);
};

const calculateOtherAmountThreshold = (expectedOutAmount, worstCaseSlippageBps) => {
  const worstCaseOutAmount = expectedOutAmount * (1 - worstCaseSlippageBps / 10000);
  return Math.floor(worstCaseOutAmount); // Round down to ensure safety
};

const getSwapTransaction = async (quoteResponse, computeUnitLimit, otherAmountThreshold) => {
  const response = await fetch(SWAP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: wallet.publicKey.toString(),
      computeUnitLimit,
      prioritizationFeeLamports: CUSTOM_PRIORITIZATION_FEE_LAMPORTS,
      otherAmountThreshold,
      wrapAndUnwrapSol: false
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error fetching swap transaction: ${response.statusText} - ${errorText}`);
  }
  return data.swapTransaction;
};

const getTransactionSignatures = (swapTransaction) => {
  if (!swapTransaction) {
    throw new Error("Invalid swap transaction");
  }
  const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  transaction.sign([wallet.payer]);
  const serializedTransaction = transaction.serialize();
  return [bs58.encode(serializedTransaction)];
};

let cachedBlockhash = null;
const getCachedBlockhash = async () => {
  if (!cachedBlockhash) {
    const { blockhash } = await connection.getRecentBlockhash();
    cachedBlockhash = blockhash;
  }
  return cachedBlockhash;
};

const createJitoTipTransaction = async () => {
  const targetAddress = TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)];
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: new PublicKey(targetAddress),
      lamports: JITO_TIP_AMOUNT_LAMPORTS,
    })
  );
  transaction.recentBlockhash = await getCachedBlockhash();
  transaction.sign(wallet.payer);
  return bs58.encode(transaction.serialize());
};

const calculateFinalSolAmount = (worstCaseReturnOutAmount, totalTransactionFeeLamports, additionalFees) => {
  const totalFees = totalTransactionFeeLamports + additionalFees;
  return (worstCaseReturnOutAmount / 1000000000) - (totalFees / 1000000000);
};

const sendJitoBundle = async (signatures) => {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendBundle",
    params: [signatures]
  };
  const response = await axios.post(JITO_API_URL, payload, {
    headers: { 'Content-Type': 'application/json' }
  });
  return response.data;
};

const mainLoop = async () => {
  while (true) {
    try {
      const [initialQuoteResponse, jitoTipSignature, blockhash] = await Promise.all([
        getQuote(SOL_MINT_ADDRESS, USDC_MINT_ADDRESS, SWAP_AMOUNT_LAMPORTS),
        createJitoTipTransaction(),
        getCachedBlockhash()
      ]);

      const worstCaseInitialOutAmount = calculateOtherAmountThreshold(initialQuoteResponse.outAmount, SLIPPAGE_BPS);

      const initialSwapTransaction = await getSwapTransaction(initialQuoteResponse, COMPUTE_UNIT_LIMIT_VALUE, worstCaseInitialOutAmount);
      if (!initialSwapTransaction) {
        console.error("Failed to get the initial swap transaction. Skipping this iteration.");
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds
        continue;
      }

      const returnQuoteResponse = await getQuote(USDC_MINT_ADDRESS, SOL_MINT_ADDRESS, worstCaseInitialOutAmount);
      const worstCaseReturnOutAmount = calculateOtherAmountThreshold(returnQuoteResponse.outAmount, SLIPPAGE_BPS);

      const returnSwapTransaction = await getSwapTransaction(returnQuoteResponse, COMPUTE_UNIT_LIMIT_VALUE, worstCaseReturnOutAmount);
      if (!returnSwapTransaction) {
        console.error("Failed to get the return swap transaction. Skipping this iteration.");
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds
        continue;
      }

      const initialSignatures = getTransactionSignatures(initialSwapTransaction);
      const returnSignatures = getTransactionSignatures(returnSwapTransaction);
      const allSignatures = [...initialSignatures, ...returnSignatures, jitoTipSignature];
      const totalSignatureFeeLamports = allSignatures.length * JITO_SIGNATURE_FEE_LAMPORTS;
      const totalTransactionFeeLamports = totalSignatureFeeLamports + JITO_TIP_AMOUNT_LAMPORTS;

      const initialFeeAmount = parseFloat(initialQuoteResponse.routePlan[0]?.swapInfo?.feeAmount || '0');
      const returnFeeAmount = parseFloat(returnQuoteResponse.routePlan[0]?.swapInfo?.feeAmount || '0');
      const additionalFees = initialFeeAmount + returnFeeAmount;

      const finalSolAmount = calculateFinalSolAmount(worstCaseReturnOutAmount, totalTransactionFeeLamports, additionalFees);

      const profit = finalSolAmount - (SWAP_AMOUNT_LAMPORTS / 1000000000);

      // Logging for debugging purposes
      console.log(`Initial SOL Amount: ${(SWAP_AMOUNT_LAMPORTS / 1000000000).toFixed(9)} SOL`);
      console.log(`Worst-case USDC from Quote: ${worstCaseInitialOutAmount / 1000000} USDC`);
      console.log(`Worst-case SOL from Return Quote: ${worstCaseReturnOutAmount / 1000000000} SOL`);
      console.log(`Total Fees: ${(totalTransactionFeeLamports / 1000000000 + additionalFees / 1000000000).toFixed(9)} SOL`);
      console.log(`Final SOL Amount: ${finalSolAmount.toFixed(9)} SOL`);
      console.log(`Profit: ${profit.toFixed(9)} SOL`);

      if (profit > 0) {
        await sendJitoBundle(allSignatures);
        console.log('Trade sent successfully.');
      } else {
        console.log('No profit detected. Trade will not be sent.');
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds
    } catch (error) {
      console.error('Error in main loop:', error);
    }
  }
};

mainLoop().catch(console.error);
