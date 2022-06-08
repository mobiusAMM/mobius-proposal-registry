import { getAddress } from "@ethersproject/address";
import { AddressZero } from "@ethersproject/constants";
import type { ContractInterface } from "@ethersproject/contracts";
import { Contract } from "@ethersproject/contracts";
import type { JsonRpcProvider } from "@ethersproject/providers";
import { StaticJsonRpcProvider } from "@ethersproject/providers";
import * as fs from "fs/promises";
import invariant from "tiny-invariant";

import GOV_ABI from "./abis/GovernorAlpha.json";
import type { GovernorAlpha } from "./generated";

// returns the checksummed address if the address is valid, otherwise returns false
export function isAddress(value: string): string | false {
  try {
    return getAddress(value);
  } catch {
    return false;
  }
}

// account is optional
export function getContract(
  address: string,
  ABI: ContractInterface,
  provider: JsonRpcProvider
): Contract {
  if (!isAddress(address) || address === AddressZero) {
    throw Error(`Invalid 'address' parameter '${address}'.`);
  }
  return new Contract(address, ABI, provider);
}

function useContract(
  address: string | undefined,
  ABI: ContractInterface,
  provider: JsonRpcProvider
): Contract | null {
  if (!address || !ABI) return null;
  try {
    return getContract(address, ABI, provider);
  } catch (error) {
    console.error("Failed to get contract", error);
    return null;
  }
}

export function useGovernorContract(
  provider: JsonRpcProvider
): GovernorAlpha | null {
  return useContract(
    "0xA5Eb84773633f33d442ECDaC48212B0dEBf3C84A",
    GOV_ABI.abi,
    provider
  ) as GovernorAlpha | null;
}

export const GOVERNANCE_GENESIS = 10609767;

export interface Log {
  topics: Array<string>;
  data: string;
  transactionIndex: number;
  logIndex: number;
  blockNumber: number;
}

interface Data {
  block: number;
  logs: Log[];
}

export const fetchAllProposals = async (): Promise<void> => {
  const rawFile = await fs.readFile("data/proposals.json");
  const oldLogs: Data = JSON.parse(rawFile.toString()) as Data;

  const provider = new StaticJsonRpcProvider("https://forno.celo.org");
  const blocknumber = await provider.getBlockNumber();

  const governanceContract = useGovernorContract(provider);
  invariant(governanceContract);

  const filter = {
    topics: [
      "0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0",
    ],
    address: governanceContract.address,
    fromBlock: oldLogs.block,
  };

  const proposalSet = new Set<Log>();
  oldLogs.logs.forEach((l) => proposalSet.add(l));
  const newLogData = (await provider.getLogs(filter)).filter(
    (l) => !proposalSet.has(l)
  );

  await fs.writeFile(
    "data/proposals.json",
    JSON.stringify(
      { logs: oldLogs.logs.concat(newLogData), block: blocknumber },
      null,
      2
    )
  );

  console.log(`Discovered and wrote ${newLogData.length} proposals`);
};

fetchAllProposals().catch((err) => {
  console.error(err);
});
