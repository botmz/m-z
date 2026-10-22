import express, { type Express } from "express";
import helmet from "helmet";
import router from "./routes";
import { createHttpLogger } from "./lib/http-logger";

const app: Express = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));

app.use(createHttpLogger());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
