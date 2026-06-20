import { MIST_PER_SUI } from '@mysten/sui/utils';
import { getClient, getKeypair } from './env';
import { WAL_COIN_TYPE } from './config';

const fmt = (raw: string) => (Number(raw) / Number(MIST_PER_SUI)).toFixed(4);

async function main() {
  const client = getClient();
  const address = getKeypair().toSuiAddress();

  const sui = await client.getBalance({ owner: address });
  const wal = await client.getBalance({ owner: address, coinType: WAL_COIN_TYPE });

  console.log('address:', address);
  console.log('SUI    :', fmt(sui.balance.balance), `(${sui.balance.balance} MIST)`);
  console.log('WAL    :', fmt(wal.balance.balance), `(${wal.balance.balance} FROST)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
