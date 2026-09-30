import 'dotenv/config';
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
export const databaseName = process.env.MONGODB_DATABASE || 'govjobs';
export let db;

export async function connectDB() {
	if (db) return db;
	await client.connect();
	db = client.db(databaseName);
	await Promise.all([
		db.collection('users').createIndex({ email: 1 }, { unique: true }),
		db.collection('jobs').createIndex({ fingerprint: 1 }, { unique: true, sparse: true }),
		db.collection('job_sources').createIndex({ name: 1 }, { unique: true }),
		db.collection('job_categories').createIndex({ name: 1 }, { unique: true }),
		db.collection('notifications').createIndex({ user_id: 1, job_id: 1 }, { unique: true }),
		db.collection('saved_jobs').createIndex({ user_id: 1, job_id: 1 }, { unique: true }),
		db.collection('settings').createIndex({ key: 1 }, { unique: true })
	]);
	return db;
}

export async function closeDB() {
	await client.close();
	db = undefined;
}

export function collection(name) {
	if (!db) throw new Error('MongoDB is not connected. Call connectDB() first.');
	return db.collection(name);
}

export async function nextId(name) {
	const counters = collection('counters');
	const result = await counters.findOneAndUpdate(
		{ _id: name },
		{ $inc: { value: 1 } },
		{ upsert: true, returnDocument: 'after', includeResultMetadata: false }
	);
	return result.value;
}
