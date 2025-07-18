import { Queue } from 'bullmq';
import redisInstance from '../config/redis.js'; 

export const signatureQueue = new Queue('signatureQueue', {
  connection: redisInstance,
});
