import { Redis } from 'ioredis';

// const redisInstance = new Redis({
//     password: process.env.REDIS_PASSWORD
// })

const redisInstance = new Redis({
    maxRetriesPerRequest: null
});

export default redisInstance;