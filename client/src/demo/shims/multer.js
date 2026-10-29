// multer: el archivo llega del FormData interceptado
import { putFile } from '../storage.js';
function multer({ storage, limits, fileFilter }) {
  return {
    single: () => (req, res, next) => {
      const f = req._formFile;
      if (!f) return next();
      const meta = { originalname: f.name, mimetype: f.type || 'application/octet-stream', size: f.size };
      if (limits?.fileSize && f.size > limits.fileSize) { const e = new Error('Archivo demasiado grande'); e.code = 'LIMIT_FILE_SIZE'; return next(e); }
      const go = () => storage.filename(req, meta, (err, filename) => {
        if (err) return next(err);
        putFile(filename, f).then(() => { req.file = { ...meta, filename, path: '/data/uploads/' + filename }; next(); }, next);
      });
      if (fileFilter) fileFilter(req, meta, (err, ok) => (err ? next(err) : ok ? go() : next()));
      else go();
    },
  };
}
multer.diskStorage = opts => opts;
export default multer;
