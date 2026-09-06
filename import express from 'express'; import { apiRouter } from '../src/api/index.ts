import express from 'express';
import { apiRouter } from '../src/api';

const app = express();

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use('/api', apiRouter);

export default app;
