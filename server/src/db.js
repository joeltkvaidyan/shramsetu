import mongoose from "mongoose";
import { config } from "./config.js";

/**
 * Connect to MongoDB.
 * - MONGODB_URI=memory (default, development): starts an embedded mongod via
 *   mongodb-memory-server — zero local install, fresh DB each boot, and the
 *   demo seeder repopulates it. This is a DEVELOPMENT convenience only.
 * - Any other value is treated as a real connection string (production).
 */
export async function connectDB() {
  if (config.mongodbUri === "memory") {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const mem = await MongoMemoryServer.create();
    const uri = mem.getUri("shramsetu");
    console.log(`[db] embedded MongoDB (dev) at ${uri}`);
    await mongoose.connect(uri);
    return;
  }
  await mongoose.connect(config.mongodbUri);
  const host = mongoose.connection.host;
  console.log(`[db] MongoDB connected at ${host}`);
}
