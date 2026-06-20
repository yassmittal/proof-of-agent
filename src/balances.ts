import { getClient, getKeypair, WAL_COIN_TYPE } from './env';
import { MIST_PER_SUI } from '@mysten/sui/utils';

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
