import { closeDB, collection, connectDB, nextId } from '../src/db.js';
import { PRESETS } from '../src/adapters/presets.js';

await connectDB();
try {
	for (const preset of PRESETS) {
		const existing = await collection('job_sources').findOne({ name: preset.name });
		if (existing) {
			const changes = {
				url: preset.url, adapter: preset.adapter, config: preset.config,
				...(existing.status === 'error' ? { status: 'idle' } : {}),
				...(preset.enabled ? { enabled: true } : {})
			};
			await collection('job_sources').updateOne({ id: existing.id }, { $set: {
				...changes
			} });
		} else {
			await collection('job_sources').insertOne({ id: await nextId('job_sources'), ...preset, status: 'idle' });
		}
	}
	console.log('Source presets saved. SBI Careers and GovtJobGuru are enabled. Tier 2 aggregators are marked in config.sourceTier and config.sourceAuthority.');
} finally {
	await closeDB();
}
