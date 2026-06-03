export type PostStatus =
  | 'DRAFT'
  | 'WAITING_APPROVAL'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELLED';

export const statusLabels: Record<PostStatus, string> = {
  DRAFT: 'Nháp',
  WAITING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  SCHEDULED: 'Đã lên lịch',
  PUBLISHING: 'Đang đăng',
  PUBLISHED: 'Đã đăng',
  FAILED: 'Lỗi',
  CANCELLED: 'Đã hủy',
};

export const posts = [
  {
    id: 'post_001',
    title: 'Ra mắt bộ sưu tập tháng 6',
    platform: 'Facebook, Instagram',
    accounts: 'Gami Studio, Gami IG',
    owner: 'Nguyen Anh',
    scheduledAt: '2026-06-01 09:00',
    status: 'WAITING_APPROVAL' as PostStatus,
  },
  {
    id: 'post_002',
    title: 'Video hậu trường sản xuất',
    platform: 'Instagram',
    accounts: 'Gami IG',
    owner: 'Tran Linh',
    scheduledAt: '2026-06-01 20:00',
    status: 'SCHEDULED' as PostStatus,
  },
  {
    id: 'post_003',
    title: 'Ưu đãi cuối tuần',
    platform: 'Facebook',
    accounts: 'Gami Studio',
    owner: 'Le Minh',
    scheduledAt: '2026-06-02 12:00',
    status: 'FAILED' as PostStatus,
  },
  {
    id: 'post_004',
    title: 'Album khách hàng nổi bật',
    platform: 'Facebook, Instagram',
    accounts: 'Gami Studio, Gami IG',
    owner: 'Nguyen Anh',
    scheduledAt: '2026-06-03 18:30',
    status: 'APPROVED' as PostStatus,
  },
];

export const mediaAssets = [
  {
    id: 'media_001',
    name: 'launch-cover.jpg',
    type: 'Image',
    folder: 'Drive / Campaigns / June',
    category: 'Campaign',
    account: 'Gami Studio',
    updatedAt: '2026-06-01 08:10',
  },
  {
    id: 'media_002',
    name: 'behind-the-scenes.mp4',
    type: 'Video',
    folder: 'Drive / Reels',
    category: 'Short video',
    account: 'Gami IG',
    updatedAt: '2026-05-31 21:40',
  },
  {
    id: 'media_003',
    name: 'weekend-sale.png',
    type: 'Image',
    folder: 'Drive / Promotions',
    category: 'Promotion',
    account: 'Gami Studio',
    updatedAt: '2026-05-31 14:20',
  },
];

export const socialAccounts = [
  {
    id: 'acc_001',
    name: 'Gami Studio',
    platform: 'Facebook Page',
    status: 'Đã kết nối',
    tokenStatus: 'Hợp lệ',
    approvalRequired: 'Bật',
  },
  {
    id: 'acc_002',
    name: 'Gami IG',
    platform: 'Instagram Business',
    status: 'Đã kết nối',
    tokenStatus: 'Hợp lệ',
    approvalRequired: 'Bật',
  },
  {
    id: 'acc_003',
    name: 'Gami Archive',
    platform: 'Facebook Page',
    status: 'Cần kết nối lại',
    tokenStatus: 'Hết hạn',
    approvalRequired: 'Tắt',
  },
];

export const jobs = [
  {
    id: 'job_001',
    type: 'drive.syncFolder',
    status: 'completed',
    attempts: 1,
    scheduledAt: '2026-06-01 08:00',
    error: '',
  },
  {
    id: 'job_002',
    type: 'post.publishTarget',
    status: 'failed',
    attempts: 3,
    scheduledAt: '2026-06-01 12:00',
    error: 'Meta API rejected media format',
  },
  {
    id: 'job_003',
    type: 'meta.syncAccounts',
    status: 'pending',
    attempts: 0,
    scheduledAt: '2026-06-01 23:00',
    error: '',
  },
];

export const users = [
  { id: 'user_001', name: 'Admin', email: 'admin@gami.local', role: 'ADMIN', status: 'Active' },
  { id: 'user_002', name: 'Nguyen Anh', email: 'anh@gami.local', role: 'APPROVER', status: 'Active' },
  { id: 'user_003', name: 'Tran Linh', email: 'linh@gami.local', role: 'EDITOR', status: 'Active' },
  { id: 'user_004', name: 'Le Minh', email: 'minh@gami.local', role: 'STAFF', status: 'Active' },
];

export const sources = [
  {
    id: 'src_001',
    name: 'Google Drive - Campaigns',
    provider: 'Google Drive',
    status: 'Đang hoạt động',
    lastSync: '2026-06-01 08:00',
  },
  {
    id: 'src_002',
    name: 'Google Drive - Reels',
    provider: 'Google Drive',
    status: 'Đang hoạt động',
    lastSync: '2026-05-31 21:00',
  },
];

export const devices = [
  {
    id: 'device_001',
    name: 'MostLogin - Gami Studio',
    type: 'Antidetect Profile',
    provider: 'MostLogin',
    externalId: 'mostlogin-profile-gami-studio',
    status: 'ACTIVE',
    healthStatus: 'OK',
    locked: false,
    lockedReason: '',
    notes: 'MostLogin profile chính',
    accounts: 'Gami Studio',
    lastSeenAt: '2026-06-01 09:00',
  },
  {
    id: 'device_002',
    name: 'Android Emulator - Gami Backup',
    type: 'Android ADB',
    provider: 'ADB',
    externalId: 'emulator-5554',
    status: 'INACTIVE',
    healthStatus: 'UNKNOWN',
    locked: false,
    lockedReason: '',
    notes: 'Android backup device',
    accounts: 'Gami Studio',
    lastSeenAt: '',
  },
];
