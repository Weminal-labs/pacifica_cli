import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const keypair = Keypair.generate();
const secretKey = bs58.encode(keypair.secretKey);
const publicKey = keypair.publicKey.toBase58();

console.log("=== Pacifica Testnet Keypair ===");
console.log(`Public Key:  ${publicKey}`);
console.log(`Private Key: ${secretKey}`);
console.log("\nUse the Private Key when running: pacifica init --testnet");
