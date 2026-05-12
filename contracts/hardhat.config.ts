import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.OG_PRIVATE_KEY ?? "";
const TESTNET_RPC = process.env.OG_EVM_RPC_TESTNET ?? "https://evmrpc-testnet.0g.ai";
const MAINNET_RPC = process.env.OG_EVM_RPC_MAINNET ?? "https://evmrpc.0g.ai";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    zerog_galileo: {
      url: TESTNET_RPC,
      chainId: 16602,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    zerog_mainnet: {
      url: MAINNET_RPC,
      chainId: 16661,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  }
};

export default config;
