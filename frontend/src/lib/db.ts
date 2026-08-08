import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/adaptiveweb';
const MONGODB_SEED_HOSTS = process.env.MONGODB_SEED_HOSTS;
const MONGODB_REPLICA_SET = process.env.MONGODB_REPLICA_SET;
const MONGODB_AUTH_SOURCE = process.env.MONGODB_AUTH_SOURCE || 'admin';

if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

function buildMongoConnectionUri() {
    if (!MONGODB_URI.startsWith('mongodb+srv://') || !MONGODB_SEED_HOSTS) {
        return MONGODB_URI;
    }

    const srvUri = new URL(MONGODB_URI);
    const credentials = srvUri.username
        ? `${srvUri.username}${srvUri.password ? `:${srvUri.password}` : ''}@`
        : '';
    const database = srvUri.pathname || '/adaptiveweb';
    const options = new URLSearchParams(srvUri.search);

    options.set('tls', 'true');
    options.set('authSource', MONGODB_AUTH_SOURCE);
    options.set('retryWrites', 'true');
    options.set('w', 'majority');
    if (MONGODB_REPLICA_SET) options.set('replicaSet', MONGODB_REPLICA_SET);

    return `mongodb://${credentials}${MONGODB_SEED_HOSTS}${database}?${options.toString()}`;
}

const MONGODB_CONNECTION_URI = buildMongoConnectionUri();

interface GlobalMongoose {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

declare global {
    var mongoose: GlobalMongoose;
}

let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
            serverSelectionTimeoutMS: 10000,
        };

        cached.promise = mongoose.connect(MONGODB_CONNECTION_URI, opts).then((mongoose) => {
            return mongoose;
        });
    }
    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

export default dbConnect;
