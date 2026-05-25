import express from 'express';
import { createIssue, deleteIssue, getIssues, updateIssue } from '../controllers/issueController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', getIssues);
router.post('/', requireAuth, createIssue);
router.put('/:id', requireAuth, updateIssue);
router.delete('/:id', requireAuth, deleteIssue);

export default router;
