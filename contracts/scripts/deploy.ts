import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "A0GI");

  const Factory = await ethers.getContractFactory("FrameworkRegistry");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\nFrameworkRegistry deployed to:", address);
  console.log("\nAdd to your .env:");
  console.log(`OG_REGISTRY_CONTRACT=${address}`);

  // Register 0G Forge as the first framework entry
  const tx = await contract.registerFramework(
    "0G Forge",
    "0.1.11",
    "https://github.com/karagozemin/0g-forge"
  );
  await tx.wait();
  console.log("\n0G Forge framework registered on-chain. tx:", tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
