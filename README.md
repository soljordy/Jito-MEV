# Jito-MEV
MEV bot to find and execute profitable trades with jito bundles and the jupiter api


RPC_URL=REPLACE WITH YOUR RPC URL
JITO_API_URL=https://mainnet.block-engine.jito.wtf/api/v1/bundles
SLIPPAGE_PERCENTAGE=100 (100 = 1%)
JITO_TIP_AMOUNT_SOL=(Jito tip amount https://jito-labs.metabaseapp.com/public/dashboard/016d4d60-e168-4a8f-93c7-4cd5ec6c7c8d)
SWAP_AMOUNT_SOL=(amount to trade with example 1 = 1 sol)
PRIVATE_KEY=(bs58 encoded private key for your solana wallet)
ONLY_DIRECT_ROUTES=(true or false refer to jupiter api)
PRIORITIZATION_FEE_LAMPORTS=0 (set to 0 as its going in a bundle and no need for priority fees)
COMPUTE_UNIT_LIMIT=750000 (leave as 750k)
QUOTE_API_URL=https://quote-api.jup.ag/v6 (leave these as they are unless you're self hosting the api)
SWAP_API_URL=https://quote-api.jup.ag/v6/swap (leave these as they are unless you're self hosting the api)
TIP_ACCOUNT_METHOD=getTipAccounts (leave this and TIP_ACCOUNTS as they are)
TIP_ACCOUNTS=3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT,96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5,HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe,Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY,ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49,DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh,ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt,DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL
JITO_SIGNATURE_FEE=5000 (5000 lamport fee the bare minimum that is needed)
SOL_MINT_ADDRESS=So11111111111111111111111111111111111111112
USDC_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

npm install @solana/web3.js cross-fetch @project-serum/anchor bs58 dotenv axios


Set your .env file and you're good to go, this is a work in progress, can be severly optimised with a dedicated geyser node lots of imporvement to make but in its current state works and is 100% profitable 
