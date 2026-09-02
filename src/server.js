import http from "node:http";
import { config } from "./config/index.js";
import { createDatabase } from "./database/db.js";
import { Repository } from "./database/repository.js";
import { normalizeTelemetry } from "./processing/normalizer.js";
import { evaluateRules } from "./processing/rulesEngine.js";
import { LocalMLProcessor } from "./ml/LocalMLProcessor.js";
import { AssessmentService } from "./services/assessmentService.js";
import { JobQueue } from "./services/jobQueue.js";
import { ProcessingService } from "./services/processingService.js";
import { DeviceService } from "./services/deviceService.js";
import { startOfflineMonitor } from "./services/offlineMonitor.js";
import { createWebSocketGateway } from "./websocket/gateway.js";
import { createApp } from "./app.js";

export async function createGateway({ runtimeConfig = config, databasePath } = {}) {
  const db=createDatabase(databasePath || runtimeConfig.databasePath, runtimeConfig.mine); const repository=new Repository(db); const mlProcessor=new LocalMLProcessor(runtimeConfig.ml); await mlProcessor.load();
  let gateway; const broadcaster=(event)=>gateway?.broadcast(event); const assessmentService=new AssessmentService(repository,broadcaster); const processingService=new ProcessingService({repository,rulesEngine:{normalize:normalizeTelemetry,evaluate:evaluateRules},mlProcessor,assessmentService,config:runtimeConfig,broadcaster}); const queue=new JobQueue({concurrency:1}); const deviceService=new DeviceService(repository,runtimeConfig); const app=createApp({config:runtimeConfig,repository,deviceService,queue,processingService,mlProcessor,broadcaster}); const server=http.createServer(app); gateway=createWebSocketGateway(server,{authorize:(request)=>{const queryToken=new URL(request.url || "/", "http://localhost").searchParams.get("token"); return !runtimeConfig.dashboardAuthToken || request.headers["x-dashboard-token"]===runtimeConfig.dashboardAuthToken || request.headers.authorization===`Bearer ${runtimeConfig.dashboardAuthToken}` || queryToken===runtimeConfig.dashboardAuthToken;}}); const stopOffline=startOfflineMonitor({repository,config:runtimeConfig,broadcaster});
  return { app,server,db,repository,mlProcessor,queue, close:()=>{stopOffline();gateway.close();server.close();db.close();} };
}

export async function startServer() { const gateway=await createGateway(); gateway.server.listen(config.port,config.host,()=>console.log(`Mine Edge Gateway listening on http://${config.host}:${config.port}`, { mineId: config.mine.id, databasePath: config.databasePath })); const shutdown=(signal)=>{console.log(`${signal} received; shutting down`); gateway.close();}; process.on("SIGINT",()=>shutdown("SIGINT")); process.on("SIGTERM",()=>shutdown("SIGTERM")); return gateway; }
