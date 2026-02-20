const redis = require('redis');
const { Sequelize } = require('sequelize');
require('dotenv').config();

// PostgreSQL Configuration via Sequelize
// Support Railway's DATABASE_URL or individual env vars
let sequelize;

if (process.env.DATABASE_URL) {
    // Railway provides a single DATABASE_URL
    sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        logging: false,
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        }
    });
} else {
    // Local development with individual env vars
    sequelize = new Sequelize(
        process.env.PG_DB || 'musicsocialapp',
        process.env.PG_USER || 'postgres',
        process.env.PG_PASSWORD || 'postgres',
        {
            host: process.env.PG_HOST || '127.0.0.1',
            port: process.env.PG_PORT || 5432,
            dialect: 'postgres',
            logging: false,
        }
    );
}

const initPG = async () => {
    try {
        await sequelize.authenticate();
        console.log('PostgreSQL (Sequelize) connected successfully.');

        await sequelize.sync({ alter: true });
        console.log('All models were synchronized successfully.');
    } catch (error) {
        console.error('Unable to connect to PostgreSQL:', error);
    }
    return sequelize;
};

// Redis Configuration (optional — app works without it)
let redisClient = null;

const initRedis = async () => {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    if (!redisUrl && process.env.NODE_ENV === 'production') {
        console.log('Redis URL not configured, skipping Redis.');
        return null;
    }
    try {
        redisClient = redis.createClient({ url: redisUrl || 'redis://localhost:6379' });

        redisClient.on('error', (err) => console.log('Redis Client Error', err));

        await redisClient.connect();
        console.log('Redis connected successfully.');
    } catch (err) {
        console.warn('Failed to connect to Redis (non-fatal):', err.message);
        redisClient = null;
    }
    return redisClient;
};

const getRedisClient = () => redisClient;

module.exports = { sequelize, initPG, initRedis, getRedisClient };

