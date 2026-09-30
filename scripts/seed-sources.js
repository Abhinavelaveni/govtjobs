import { closeDB, collection, connectDB, nextId } from '../src/db.js';
import { PRESETS } from '../src/adapters/presets.js';

await connectDB();
try {
	for (const preset of PRESETS) {
		const existing = await collection('job_sources').findOne({ name: preset.name });
		if (existing) {
			await collection('job_sources').updateOne({ id: existing.id }, { $set: {
				url: preset.url, adapter: preset.adapter, config: preset.config,
				...(preset.enabled ? { enabled: true } : {})
			} });
		} else {
			await collection('job_sources').insertOne({ id: await nextId('job_sources'), ...preset, status: 'idle' });
		}
	}
	console.log('Source presets saved. SBI Careers is enabled; all other sources remain disabled for review. Tier 2 aggregators are marked in config.sourceTier and config.sourceAuthority.');
} finally {
	await closeDB();
}
