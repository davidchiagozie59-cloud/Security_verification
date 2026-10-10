import { Router, type IRouter } from "express";
import healthRouter from "./health";
import enrollmentRouter from "./enrollment";

const router: IRouter = Router();

router.use(healthRouter);
router.use(enrollmentRouter);

export default router;
