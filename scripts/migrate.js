import { closeDB, collection, connectDB } from '../src/db.js';

await connectDB();
try {
  const names = ['Central Government', 'State Government', 'Banking', 'Railways', 'Defence', 'Police', 'Teaching', 'Engineering', 'Medical', 'IT', 'Administrative', 'PSU', 'Research', 'Other'];
  await collection('job_categories').bulkWrite(names.map((name, index) => ({
    updateOne: { filter: { name }, update: { $setOnInsert: { id: index + 1, name } }, upsert: true }
  })));
  await collection('settings').updateOne({ key: 'scrape_interval_min' }, { $setOnInsert: { key: 'scrape_interval_min', value: '30' } }, { upsert: true });

  for (const name of ['users', 'jobs', 'job_categories', 'job_sources', 'scraper_runs', 'notifications', 'notification_logs', 'whatsapp_templates']) {
    const latest = await collection(name).findOne({}, { sort: { id: -1 }, projection: { id: 1 } });
    await collection('counters').updateOne({ _id: name }, { $max: { value: latest?.id || 0 } }, { upsert: true });
  }
  console.log(`MongoDB ${process.env.MONGODB_DATABASE || 'govjobs'} is initialized.`);
} finally {
  await closeDB();
}