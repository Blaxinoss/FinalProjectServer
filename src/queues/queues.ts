import { Queue } from "bullmq";
import IORedis from "ioredis";
import {connection} from '../services/index.js'


export const ParkingEventQueue = new Queue('ParkingEventQueue',{
    connection, //to get redis
    defaultJobOptions:{
        // timestamp,
        removeOnComplete:5,
        removeOnFail:50
    },
    
})



// export const ParkingSessionQueue = new Queue('parkingSessionQueue',{
//     connection, //to get redis
//     defaultJobOptions:{
//         // timestamp,
//         removeOnComplete:5,
//         removeOnFail:50
//     },
    
// })



// export const PaymentQueue = new Queue('paymentQueue',{
//     connection,
//     defaultJobOptions:{
//         attempts:5,
//         backoff:{
//             type:'exponential',
//             delay:3000,
//         },
//         removeOnComplete:10,
//         removeOnFail:100,
//     }
// })

console.log('bullMQ Queues have been initialized1')