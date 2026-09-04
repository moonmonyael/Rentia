import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { authRouter } from './src/server/routes/authRoutes';
import { tenantRouter } from './src/server/routes/tenantRoutes';
import { leaseRouter } from './src/server/routes/leaseRoutes';
import { paymentRouter } from './src/server/routes/paymentRoutes';
import { publicRouter } from './src/server/routes/publicRoutes';
import { matchingRouter } from './src/server/routes/matchingRoutes';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middlewares
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(cookieParser());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Rentia Backend API', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/tenant', tenantRouter);
  app.use('/api/leases', leaseRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/public', publicRouter);
  app.use('/public', publicRouter);
  app.use('/api/matching', matchingRouter);


  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Une erreur interne est survenue. Veuillez réessayer ultérieurement.' });
  });

  // Vite middleware for development vs Static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Rentia Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Rentia server:', err);
  process.exit(1);
});
