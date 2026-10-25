import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { TokenService } from '../auth/token.service';
import { ReportRecord } from './reports.repository';
import { ReportsService } from './reports.service';

// El CSV solo sale por /download: acá se quita del resultado.
function publico(r: ReportRecord) {
  const { result, ...resto } = r;
  const sinCsv =
    result && typeof result === 'object' ? (({ csv: _csv, ...x }) => x)(result as { csv?: string }) : null;
  return { ...resto, result: sinCsv };
}

export function reportsRoutes(reports: ReportsService, tokens: TokenService): Router {
  const router = Router();
  const soloAdmin = [authenticate(tokens), authorize('ADMIN')];

  router.post('/', ...soloAdmin, async (req, res, next) => {
    try {
      const report = await reports.request(req.auth!.userId);
      res.status(202).json({ report: publico(report) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', ...soloAdmin, async (req, res, next) => {
    try {
      res.status(200).json({ report: publico(await reports.get(String(req.params.id))) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/download', ...soloAdmin, async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const csv = await reports.download(id);
      res
        .status(200)
        .type('text/csv; charset=utf-8')
        .set('Content-Disposition', `attachment; filename="reporte-ocupacion-${id}.csv"`)
        .send(csv);
    } catch (err) {
      next(err);
    }
  });

  return router;
}