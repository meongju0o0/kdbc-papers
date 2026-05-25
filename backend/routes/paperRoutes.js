import express from 'express';
import { createPaper, deletePaper, getAllPapers, getPaperById, getPaperIssues, updatePaper } from '../controllers/paperController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { uploadPaperPdf } from '../middlewares/uploadMiddleware.js';

const router = express.Router();

router.get('/issues', getPaperIssues);
router.post('/', requireAuth, uploadPaperPdf, createPaper);
router.get('/', getAllPapers);
router.put('/:id', requireAuth, uploadPaperPdf, updatePaper);
router.delete('/:id', requireAuth, deletePaper);
router.get('/:id', getPaperById);

export default router;
