import { TESTNET_WALRUS_PACKAGE_CONFIG } from '@mysten/walrus';
import { getFaucetHost, requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { coinWithBalance, Transaction } from '@mysten/sui/transactions';
import { MIST_PER_SUI, parseStructTag } from '@mysten/sui/utils';
import { getClient, getKeypair } from './env';
import { WAL_COIN_TYPE } from './config';

// Tops the project wallet up so it can pay for gas (SUI) and Walrus storage (WAL).
async function main() {
  const client = getClient();
  const keypair = getKeypair();
  const address = keypair.toSuiAddress();
  console.log('wallet:', address);

  // The wallet is usually pre-funded from the CLI; only fall back to the faucet if nearly empty.
  const sui = await client.getBalance({ owner: address });
  console.log('SUI balance:', sui.balance.balance);
  if (BigInt(sui.balance.balance) < MIST_PER_SUI / 10n) {
    console.log('SUI low -> requesting from faucet...');
    try {
      await requestSuiFromFaucetV2({ host: getFaucetHost('testnet'), recipient: address });
    } catch (e) {
      console.warn('faucet failed (rate limit?). Pre-fund this address manually, then re-run.', e);
    }
  }

  // Swap 0.5 SUI for WAL through the wal_exchange contract when WAL runs low.
  const wal = await client.getBalance({ owner: address, coinType: WAL_COIN_TYPE });
  console.log('WAL balance:', wal.balance.balance);
  if (Number(wal.balance.balance) < Number(MIST_PER_SUI) / 2) {
    console.log('WAL low -> swapping 0.5 SUI for WAL...');
    const tx = new Transaction();

    const exchange = await client.getObject({
      objectId: TESTNET_WALRUS_PACKAGE_CONFIG.exchangeIds[0],
    });
    const exchangePackageId = parseStructTag(exchange.object.type).address;

    const walCoin = tx.moveCall({
      package: exchangePackageId,
      module: 'wal_exchange',
      function: 'exchange_all_for_wal',
      arguments: [
        tx.object(TESTNET_WALRUS_PACKAGE_CONFIG.exchangeIds[0]),
        coinWithBalance({ balance: MIST_PER_SUI / 2n }),
      ],
    });
    tx.transferObjects([walCoin], address);

    const result = await client.signAndExecuteTransaction({ transaction: tx, signer: keypair });
    const exec = result.Transaction ?? result.FailedTransaction;
    await client.waitForTransaction({ digest: exec.digest });
    console.log('swap digest:', exec.digest);
  }

  const finalWal = await client.getBalance({ owner: address, coinType: WAL_COIN_TYPE });
  console.log('done. WAL balance:', finalWal.balance.balance);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
