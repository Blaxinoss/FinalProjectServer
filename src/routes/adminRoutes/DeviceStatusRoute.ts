import { Router}from 'express';
import type { Request, Response } from 'express';
import DeviceStatus from '../../mongo_Models/deviceStatus.js'; // استيراد الموديل
// import { adminAuthMiddleware } from '../middleware/auth'; // ستحتاج middleware لحماية هذه المسارات

const router = Router();

/**
 * @route   GET /devices
 * @desc    جلب حالة كل الأجهزة المسجلة
 * @access  Private (Admin only)
 */
// router.get('/', adminAuthMiddleware, async (req: Request, res: Response) => {
router.get('/devices', async (req: Request, res: Response) => { // مؤقتًا بدون حماية
  try {
    const devices = await DeviceStatus.find().sort({ lastSeen: -1 }); // رتبهم حسب آخر ظهور
    res.status(200).json(devices);
  } catch (error: any) {
    console.error('Error fetching devices status:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @route   GET /devices/:deviceId
 * @desc    جلب حالة جهاز معين
 * @access  Private (Admin only)
 */
// router.get('/:deviceId', adminAuthMiddleware, async (req: Request, res: Response) => {
router.get('/devices/:deviceId', async (req: Request, res: Response) => { // مؤقتًا بدون حماية
  try {
    const device = await DeviceStatus.findOne({ deviceId: req.params.deviceId });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.status(200).json(device);
  } catch (error: any) {
    console.error(`Error fetching status for device ${req.params.deviceId}:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;