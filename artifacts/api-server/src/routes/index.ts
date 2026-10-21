import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mzRouter from "./mz";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/mz", mzRouter);

export default router;
