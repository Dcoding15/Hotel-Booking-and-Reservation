import fs from 'fs';
import path from 'path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const dbPath = path.resolve('./.mongo-data');
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

console.log('Starting standalone MongoDB replica set on port 27017...');

const replSet = await MongoMemoryReplSet.create({
  replSet: {
    count: 1,
    name: 'rs0',
    storageEngine: 'wiredTiger',
  },
  instanceOpts: [
    {
      port: 27017,
      dbPath,
    },
  ],
});

console.log('MongoDB Replica Set ready at:', replSet.getUri());

// Keep running
process.on('SIGINT', async () => {
  console.log('Stopping MongoDB...');
  await replSet.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Stopping MongoDB...');
  await replSet.stop();
  process.exit(0);
});

// Keep event loop alive
setInterval(() => {}, 60000);
