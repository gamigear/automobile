'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import NextLink from 'next/link';
import { useParams, usePathname } from 'next/navigation';
// @mui
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControlLabel from '@mui/material/FormControlLabel';
import { DataGrid, GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';
// routes
import { paths } from 'src/routes/paths';
// auth
import { useAuthContext } from 'src/auth/hooks';
// components
import Iconify from 'src/components/iconify';
import { useSnackbar } from 'src/components/snackbar';
import { useSettingsContext } from 'src/components/settings';
import CustomBreadcrumbs from 'src/components/custom-breadcrumbs';
// data
import {
  devices,
  jobs,
  posts,
  users,
  sources,
  mediaAssets,
  statusLabels,
  socialAccounts,
} from './mock';

// ----------------------------------------------------------------------

type Module =
  | 'overview'
  | 'posts'
  | 'post-new'
  | 'post-detail'
  | 'post-edit'
  | 'calendar'
  | 'approvals'
  | 'media'
  | 'sources'
  | 'accounts'
  | 'account-workspace'
  | 'devices'
  | 'mostlogin-devices'
  | 'android-devices'
  | 'device-add'
  | 'device-detail'
  | 'jobs'
  | 'users'
  | 'settings';

type Props = {
  module: Module;
};

const labelColor = (status: string) => {
  if (['FAILED', 'failed', 'Hết hạn', 'Cần kết nối lại'].includes(status)) return 'error';
  if (['WAITING_APPROVAL', 'pending', 'Chờ duyệt'].includes(status)) return 'warning';
  if (['SCHEDULED', 'APPROVED', 'completed', 'Đã kết nối', 'Hợp lệ', 'Đang hoạt động', 'ONLINE'].includes(status)) {
    return 'success';
  }
  if (['OFFLINE', 'DISCONNECTED'].includes(status)) return 'warning';
  return 'default';
};

function StatusChip({ value }: { value: string }) {
  return <Chip size="small" color={labelColor(value) as any} label={(statusLabels as any)[value] || value} />;
}

function socialPlatformIcon(platform: string) {
  if (platform === 'FACEBOOK') return 'logos:facebook';
  if (platform === 'INSTAGRAM') return 'skill-icons:instagram';

  return 'solar:global-bold';
}

function SocialAccountIconButton({ icon, title, href }: { icon: string; title: string; href?: string }) {
  return (
    <Tooltip title={title} arrow>
      <Box
        component={href ? 'a' : 'span'}
        href={href}
        sx={{
          width: 28,
          height: 28,
          borderRadius: 1,
          display: 'grid',
          placeItems: 'center',
          border: (theme) => `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper',
          color: 'text.primary',
          textDecoration: 'none',
          cursor: href ? 'pointer' : 'default',
          '&:hover': href ? { bgcolor: 'action.hover' } : undefined,
        }}
      >
        <Iconify icon={icon} width={18} />
      </Box>
    </Tooltip>
  );
}

function SocialAccountChips({ accounts, deviceId }: { accounts: any[]; deviceId?: string }) {
  if (!accounts?.length) {
    return (
      <SocialAccountIconButton
        icon="solar:shield-warning-bold"
        title="Chưa xác minh Social Account đăng nhập. Click để xác minh."
        href={deviceId ? paths.dashboard.deviceDetails(deviceId) : undefined}
      />
    );
  }

  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
      {accounts.map((account) => (
        <SocialAccountIconButton
          key={`${account.platform}_${account.id}`}
          icon={socialPlatformIcon(account.platform)}
          title={`${account.name} · ${account.platform}`}
        />
      ))}
    </Stack>
  );
}

function useApiRows<T>(endpoint: string, fallbackRows: T[]) {
  const [rows, setRows] = useState<T[]>(fallbackRows);

  useEffect(() => {
    if (!endpoint) {
      setRows(fallbackRows);
      return undefined;
    }

    let active = true;

    fetch(endpoint)
      .then((response) => response.json())
      .then((response) => {
        if (active && Array.isArray(response.data)) setRows(response.data);
      })
      .catch(() => {
        if (active) setRows(fallbackRows);
      });

    return () => {
      active = false;
    };
  }, [endpoint]);

  return rows;
}

function usePollingApiRows<T>(endpoint: string, fallbackRows: T[], intervalMs: number, enabled = true) {
  const [rows, setRows] = useState<T[]>(fallbackRows);

  useEffect(() => {
    if (!endpoint || !enabled) {
      setRows(fallbackRows);
      return undefined;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const response = await fetch(endpoint);
        const body = await response.json();

        if (active && Array.isArray(body.data)) setRows(body.data);
      } catch {
        if (active) setRows(fallbackRows);
      }

      if (active && enabled) timer = setTimeout(load, intervalMs);
    };

    load();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, endpoint, intervalMs]);

  return rows;
}

function useApiData<T>(endpoint: string, fallbackData: T) {
  const [data, setData] = useState<T>(fallbackData);

  useEffect(() => {
    if (!endpoint) {
      setData(fallbackData);
      return undefined;
    }

    let active = true;

    fetch(endpoint)
      .then((response) => response.json())
      .then((response) => {
        if (active && response.data) setData(response.data);
      })
      .catch(() => {
        if (active) setData(fallbackData);
      });

    return () => {
      active = false;
    };
  }, [endpoint]);

  return data;
}

function authJsonHeaders() {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${sessionStorage.getItem('accessToken') || ''}`,
  };
}

function DataCard({
  title,
  rows,
  columns,
  checkboxSelection = false,
  rowSelectionModel,
  onRowSelectionModelChange,
}: {
  title: string;
  rows: any[];
  columns: GridColDef[];
  checkboxSelection?: boolean;
  rowSelectionModel?: GridRowSelectionModel;
  onRowSelectionModelChange?: (model: GridRowSelectionModel) => void;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <Box sx={{ height: 420, px: 2, pb: 2 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          checkboxSelection={checkboxSelection}
          rowSelectionModel={rowSelectionModel}
          onRowSelectionModelChange={onRowSelectionModelChange}
          disableRowSelectionOnClick
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          pageSizeOptions={[5, 10, 25]}
        />
      </Box>
    </Card>
  );
}

function KpiCard({ title, value, icon, color }: { title: string; value: string; icon: string; color: string }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {title}
            </Typography>
            <Typography variant="h3" sx={{ mt: 1 }}>
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 1,
              display: 'grid',
              color,
              bgcolor: `${color}14`,
              placeItems: 'center',
            }}
          >
            <Iconify icon={icon} width={28} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

const postColumns: GridColDef[] = [
  { field: 'title', headerName: 'Bài đăng', flex: 1, minWidth: 220 },
  { field: 'platform', headerName: 'Nền tảng', width: 170 },
  { field: 'accounts', headerName: 'Tài khoản', width: 190 },
  { field: 'owner', headerName: 'Người tạo', width: 140 },
  { field: 'scheduledAt', headerName: 'Lịch đăng', width: 160 },
  {
    field: 'status',
    headerName: 'Trạng thái',
    width: 150,
    renderCell: (params) => <StatusChip value={params.value} />,
  },
];

const mediaColumns: GridColDef[] = [
  { field: 'name', headerName: 'Media', flex: 1, minWidth: 220 },
  { field: 'type', headerName: 'Loại', width: 120 },
  { field: 'folder', headerName: 'Thư mục Drive', width: 260 },
  { field: 'category', headerName: 'Danh mục', width: 140 },
  { field: 'account', headerName: 'Tài khoản', width: 150 },
  { field: 'updatedAt', headerName: 'Cập nhật', width: 160 },
];

const mediaFolderColumns: GridColDef[] = [
  { field: 'name', headerName: 'Thư mục', flex: 1, minWidth: 220 },
  { field: 'provider', headerName: 'Nguồn', width: 150 },
  { field: 'externalId', headerName: 'Đường dẫn / ID', flex: 1, minWidth: 240 },
  { field: 'status', headerName: 'Trạng thái', width: 130, renderCell: (params) => <StatusChip value={params.value} /> },
  { field: 'lastSyncAt', headerName: 'Sync cuối', width: 170 },
];

const scheduleColumns: GridColDef[] = [
  { field: 'title', headerName: 'Bài viết', flex: 1, minWidth: 220 },
  { field: 'accounts', headerName: 'Social target', width: 180 },
  { field: 'scheduledAt', headerName: 'Thời gian lên lịch', width: 180 },
  { field: 'status', headerName: 'Trạng thái', width: 150, renderCell: (params) => <StatusChip value={params.value} /> },
];

const accountColumns: GridColDef[] = [
  { field: 'name', headerName: 'Tài khoản', flex: 1, minWidth: 180 },
  { field: 'type', headerName: 'Loại', width: 170 },
  { field: 'platform', headerName: 'Nền tảng', width: 180 },
  { field: 'primaryDevice', headerName: 'Primary device', width: 190 },
  { field: 'status', headerName: 'Kết nối', width: 160, renderCell: (params) => <StatusChip value={params.value} /> },
  {
    field: 'tokenStatus',
    headerName: 'Token',
    width: 140,
    renderCell: (params) => <StatusChip value={params.value} />,
  },
  { field: 'approvalRequired', headerName: 'Duyệt bài', width: 130 },
  {
    field: 'workspace',
    headerName: '',
    width: 120,
    sortable: false,
    renderCell: (params) => (
      <Button size="small" href={`${paths.dashboard.accounts}/${params.row.id}`}>
        Mở
      </Button>
    ),
  },
];

const jobColumns: GridColDef[] = [
  { field: 'type', headerName: 'Loại job', flex: 1, minWidth: 220 },
  { field: 'status', headerName: 'Trạng thái', width: 130, renderCell: (params) => <StatusChip value={params.value} /> },
  { field: 'attempts', headerName: 'Lần thử', width: 100 },
  { field: 'scheduledAt', headerName: 'Thời gian', width: 160 },
  { field: 'error', headerName: 'Lỗi cuối', flex: 1, minWidth: 240 },
];

const userColumns: GridColDef[] = [
  { field: 'name', headerName: 'Tên', flex: 1, minWidth: 160 },
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 220 },
  { field: 'role', headerName: 'Role', width: 140 },
  { field: 'status', headerName: 'Trạng thái', width: 130, renderCell: (params) => <StatusChip value={params.value} /> },
];

const sourceColumns: GridColDef[] = [
  { field: 'name', headerName: 'Nguồn', flex: 1, minWidth: 240 },
  { field: 'provider', headerName: 'Provider', width: 160 },
  { field: 'status', headerName: 'Trạng thái', width: 160, renderCell: (params) => <StatusChip value={params.value} /> },
  { field: 'lastSync', headerName: 'Sync cuối', width: 170 },
];

const sourceImportColumns: GridColDef[] = [
  { field: 'sourcePlatform', headerName: 'Nguồn', width: 110 },
  {
    field: 'sourceUrl',
    headerName: 'Link gốc',
    flex: 1,
    minWidth: 240,
    renderCell: (params) => (
      <Tooltip title={params.value || ''} arrow>
        <Typography variant="body2" noWrap>
          {params.value}
        </Typography>
      </Tooltip>
    ),
  },
  {
    field: 'translatedTitle',
    headerName: 'Tiêu đề Việt hóa',
    flex: 1,
    minWidth: 220,
    valueGetter: (params) => params.row.translatedTitle || params.row.sourceTitle || '',
  },
  { field: 'status', headerName: 'Trạng thái', width: 150, renderCell: (params) => <StatusChip value={params.value} /> },
  {
    field: 'errorMessage',
    headerName: 'Lỗi',
    flex: 1,
    minWidth: 180,
    renderCell: (params) => (
      <Tooltip title={params.value || ''} arrow>
        <Typography variant="body2" color="error" noWrap>
          {params.value}
        </Typography>
      </Tooltip>
    ),
  },
  {
    field: 'postId',
    headerName: '',
    width: 110,
    sortable: false,
    renderCell: (params) =>
      params.value ? (
        <Button size="small" href={`${paths.dashboard.accounts}/${params.row.socialAccountId}/posts/${params.value}`}>
          Mở nháp
        </Button>
      ) : null,
  },
];

export default function SocialAdminView({ module }: Props) {
  const settings = useSettingsContext();
  const { user } = useAuthContext();
  const role = user?.role || 'VIEWER';
  const canCreate = ['ADMIN', 'APPROVER', 'EDITOR', 'STAFF'].includes(role);
  const canApprove = ['ADMIN', 'APPROVER'].includes(role);
  const canAdmin = role === 'ADMIN';
  const title = useMemo(() => {
    const titles: Record<Module, string> = {
      overview: 'Tổng quan',
      posts: 'Bài đăng',
      'post-new': 'Tạo bài đăng',
      'post-detail': 'Chi tiết bài đăng',
      'post-edit': 'Sửa bài đăng',
      calendar: 'Lịch đăng',
      approvals: 'Phê duyệt',
      media: 'Media Library',
      sources: 'Nguồn nội dung',
      accounts: 'Tài khoản mạng xã hội',
      'account-workspace': 'Workspace tài khoản',
      devices: 'Devices',
      'mostlogin-devices': 'MostLogin Profiles',
      'android-devices': 'Android Devices',
      'device-add': 'Thêm device',
      'device-detail': 'Chi tiết device',
      jobs: 'Jobs / Đồng bộ',
      users: 'Nhân viên',
      settings: 'Cài đặt',
    };
    return titles[module];
  }, [module]);

  return (
    <Box sx={{ maxWidth: settings.themeStretch ? 'none' : 1440, mx: 'auto' }}>
      {module !== 'account-workspace' && (
        <CustomBreadcrumbs
          heading={title}
          links={[{ name: 'Dashboard', href: paths.dashboard.root }, { name: title }]}
          action={
            module === 'posts' && canCreate ? (
              <Button variant="contained" href={paths.dashboard.posts.new}>
                Tạo bài
              </Button>
            ) : null
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />
      )}

      {module === 'overview' && <OverviewModule />}
      {module === 'posts' && <PostsModule />}
      {['post-new', 'post-edit'].includes(module) && (
        <PostFormModule mode={module === 'post-new' ? 'create' : 'edit'} canSubmit={canCreate} />
      )}
      {module === 'post-detail' && <PostDetailModule />}
      {module === 'calendar' && <CalendarModule />}
      {module === 'approvals' && <ApprovalsModule canApprove={canApprove} />}
      {module === 'media' && <MediaModule />}
      {module === 'sources' && <SourcesModule canAdmin={canAdmin} />}
      {module === 'accounts' && <AccountsModule canAdmin={canAdmin} />}
      {module === 'account-workspace' && <AccountWorkspaceModule canAdmin={canAdmin} canCreate={canCreate} />}
      {module === 'devices' && <DevicesModule />}
      {module === 'mostlogin-devices' && <DeviceListModule canAdmin={canAdmin} provider="MOSTLOGIN" title="MostLogin Profiles" />}
      {module === 'android-devices' && <DeviceListModule canAdmin={canAdmin} type="ANDROID_DEVICE" title="Android Devices" />}
      {module === 'device-add' && <DeviceAddModule canAdmin={canAdmin} />}
      {module === 'device-detail' && <DeviceDetailModule canAdmin={canAdmin} />}
      {module === 'jobs' && <JobsModule canAdmin={canAdmin} />}
      {module === 'users' && <UsersModule canAdmin={canAdmin} />}
      {module === 'settings' && <SettingsModule canAdmin={canAdmin} />}
    </Box>
  );
}

function OverviewModule() {
  const postRows = useApiRows('/api/posts/', posts);
  const jobRows = useApiRows('/api/jobs/', jobs);

  return (
    <Stack spacing={3}>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard title="Chờ duyệt" value="4" icon="solar:clipboard-check-bold-duotone" color="#B76E00" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard title="Sắp đăng" value="12" icon="solar:calendar-bold-duotone" color="#118D57" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard title="Bài lỗi" value="2" icon="solar:danger-triangle-bold-duotone" color="#B71D18" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard title="Mất kết nối" value="1" icon="solar:link-broken-bold-duotone" color="#637381" />
        </Grid>
      </Grid>
      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <DataCard title="Bài sắp đăng và cần xử lý" rows={postRows} columns={postColumns} />
        </Grid>
        <Grid item xs={12} lg={4}>
          <DataCard title="Job gần nhất" rows={jobRows} columns={jobColumns.slice(0, 4)} />
        </Grid>
      </Grid>
    </Stack>
  );
}

function PostsModule() {
  const postRows = useApiRows('/api/posts/', posts);

  return (
    <Stack spacing={3}>
      <FilterBar fields={['Trạng thái', 'Nền tảng', 'Tài khoản', 'Người tạo']} />
      <DataCard title="Danh sách bài đăng" rows={postRows} columns={postColumns} />
    </Stack>
  );
}

function PostFormModule({ mode, canSubmit }: { mode: 'create' | 'edit'; canSubmit: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const mediaRows = useApiRows('/api/media/', mediaAssets);
  const accountRows = useApiRows('/api/accounts/', socialAccounts);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: mode === 'edit' ? posts[0].title : '',
    facebookCaption: '',
    instagramCaption: '',
    mediaAssetId: '',
    socialAccountId: accountRows[0]?.id || '',
    scheduledAt: '',
  });

  useEffect(() => {
    if (!form.socialAccountId && accountRows[0]?.id) {
      setForm((current) => ({ ...current, socialAccountId: accountRows[0].id }));
    }
  }, [accountRows, form.socialAccountId]);

  const updateForm = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const savePost = useCallback(
    async (submitForApproval: boolean) => {
      if (!canSubmit) return;

      setSubmitting(true);

      try {
        const response = await fetch('/api/posts/', {
          method: 'POST',
          headers: authJsonHeaders(),
          body: JSON.stringify({
            title: form.title,
            caption: form.facebookCaption || form.instagramCaption,
            mediaAssetId: form.mediaAssetId || null,
            socialAccountId: form.socialAccountId || null,
            scheduledAt: form.scheduledAt || null,
            submitForApproval,
          }),
        });

        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.message || 'Không thể lưu bài đăng');
        }

        enqueueSnackbar(submitForApproval ? 'Đã gửi bài chờ duyệt' : 'Đã lưu nháp');
      } catch (error) {
        enqueueSnackbar(error instanceof Error ? error.message : 'Không thể lưu bài đăng', {
          variant: 'error',
        });
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, enqueueSnackbar, form]
  );

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={8}>
        <Card>
          <CardHeader title={mode === 'create' ? 'Nội dung bài mới' : 'Nội dung chỉnh sửa'} />
          <CardContent>
            <Stack spacing={3}>
              <TextField label="Tiêu đề nội bộ" value={form.title} onChange={updateForm('title')} />
              <TextField
                label="Caption Facebook"
                value={form.facebookCaption}
                onChange={updateForm('facebookCaption')}
                multiline
                minRows={5}
              />
              <TextField
                label="Caption Instagram"
                value={form.instagramCaption}
                onChange={updateForm('instagramCaption')}
                multiline
                minRows={5}
              />
              <TextField
                select
                label="Media từ Google Drive"
                value={form.mediaAssetId}
                onChange={updateForm('mediaAssetId')}
              >
                <MenuItem value="">Chọn media</MenuItem>
                {mediaRows.map((asset) => (
                  <MenuItem key={asset.id} value={asset.id}>
                    {asset.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Thời gian đăng"
                type="datetime-local"
                value={form.scheduledAt}
                onChange={updateForm('scheduledAt')}
                InputLabelProps={{ shrink: true }}
              />
              <Stack direction="row" spacing={2}>
                <Button variant="contained" disabled={!canSubmit || submitting} onClick={() => savePost(false)}>
                  Lưu nháp
                </Button>
                <Button variant="outlined" disabled={!canSubmit || submitting} onClick={() => savePost(true)}>
                  Gửi duyệt
                </Button>
                <Button color="inherit">Hủy</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={4}>
        <Card>
          <CardHeader title="Preview nền tảng" />
          <CardContent>
            <Stack spacing={2}>
              <TextField
                select
                label="Tài khoản đăng"
                value={form.socialAccountId}
                onChange={updateForm('socialAccountId')}
              >
                {accountRows.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name}
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                <Typography variant="subtitle2">Facebook / Instagram preview</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Nội dung, media và hashtag sẽ được hiển thị tại đây trước khi gửi duyệt hoặc lên lịch.
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

function PostDetailModule() {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={8}>
        <DataCard title="Target tài khoản" rows={posts.slice(0, 2)} columns={postColumns} />
      </Grid>
      <Grid item xs={12} md={4}>
        <Card>
          <CardHeader title="Audit log" />
          <CardContent>
            <Stack spacing={2}>
              {['Tạo draft', 'Gửi duyệt', 'Approver yêu cầu chỉnh caption'].map((event) => (
                <Box key={event}>
                  <Typography variant="subtitle2">{event}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    2026-06-01 08:30
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

function CalendarModule() {
  const postRows = useApiRows('/api/posts/', posts);

  return (
    <Grid container spacing={3}>
      {postRows.map((post) => (
        <Grid key={post.id} item xs={12} md={6} lg={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="subtitle1">{post.title}</Typography>
                  <StatusChip value={post.status} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {post.scheduledAt}
                </Typography>
                <Typography variant="body2">{post.accounts}</Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

function ApprovalsModule({ canApprove }: { canApprove: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([]);
  const [handledIds, setHandledIds] = useState<string[]>([]);
  const approvalFallback = useMemo(
    () => posts.filter((post) => post.status === 'WAITING_APPROVAL'),
    []
  );
  const approvalRows = useApiRows('/api/approvals/', approvalFallback);
  const visibleRows = approvalRows.filter((row) => !handledIds.includes(String(row.id)));
  const selectedPostId = selectedRows[0] ? String(selectedRows[0]) : '';

  const runApproval = useCallback(
    async (action: 'approve' | 'request_changes' | 'reject') => {
      if (!selectedPostId) {
        enqueueSnackbar('Chọn một bài cần xử lý', { variant: 'warning' });
        return;
      }

      try {
        const response = await fetch('/api/approvals/', {
          method: 'PATCH',
          headers: authJsonHeaders(),
          body: JSON.stringify({ postId: selectedPostId, action }),
        });

        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.message || 'Không thể cập nhật phê duyệt');
        }

        setHandledIds((current) => [...current, selectedPostId]);
        setSelectedRows([]);
        enqueueSnackbar('Đã cập nhật trạng thái phê duyệt');
      } catch (error) {
        enqueueSnackbar(error instanceof Error ? error.message : 'Không thể cập nhật phê duyệt', {
          variant: 'error',
        });
      }
    },
    [enqueueSnackbar, selectedPostId]
  );

  return (
    <Stack spacing={3}>
      <DataCard
        title="Bài chờ phê duyệt"
        rows={visibleRows}
        columns={postColumns}
        checkboxSelection
        rowSelectionModel={selectedRows}
        onRowSelectionModelChange={setSelectedRows}
      />
      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          color="success"
          disabled={!canApprove || !selectedPostId}
          onClick={() => runApproval('approve')}
        >
          Duyệt
        </Button>
        <Button
          variant="outlined"
          color="warning"
          disabled={!canApprove || !selectedPostId}
          onClick={() => runApproval('request_changes')}
        >
          Yêu cầu sửa
        </Button>
        <Button
          variant="outlined"
          color="error"
          disabled={!canApprove || !selectedPostId}
          onClick={() => runApproval('reject')}
        >
          Từ chối
        </Button>
      </Stack>
    </Stack>
  );
}

function MediaModule() {
  const mediaRows = useApiRows('/api/media/', mediaAssets);

  return (
    <Stack spacing={3}>
      <FilterBar fields={['Thư mục Drive', 'Loại file', 'Danh mục', 'Tài khoản']} />
      <DataCard title="Media đồng bộ từ Google Drive" rows={mediaRows} columns={mediaColumns} />
    </Stack>
  );
}

function SourcesModule({ canAdmin }: { canAdmin: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([]);
  const [syncedIds, setSyncedIds] = useState<string[]>([]);
  const sourceRows = useApiRows('/api/sources/', sources);
  const selectedSourceId = selectedRows[0] ? String(selectedRows[0]) : '';
  const rows = sourceRows.map((source) =>
    syncedIds.includes(String(source.id)) ? { ...source, status: 'Đang hoạt động' } : source
  );

  const syncSource = useCallback(async () => {
    if (!selectedSourceId) {
      enqueueSnackbar('Chọn một nguồn cần sync', { variant: 'warning' });
      return;
    }

    try {
      const response = await fetch('/api/sources/', {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify({ sourceId: selectedSourceId }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Không thể tạo job sync');
      }

      setSyncedIds((current) => [...current, selectedSourceId]);
      setSelectedRows([]);
      enqueueSnackbar('Đã tạo job sync Google Drive');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể tạo job sync', {
        variant: 'error',
      });
    }
  }, [enqueueSnackbar, selectedSourceId]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2}>
        <Button variant="contained" disabled={!canAdmin} startIcon={<Iconify icon="solar:add-circle-bold" />}>
          Thêm folder Drive
        </Button>
        <Button
          variant="outlined"
          disabled={!canAdmin || !selectedSourceId}
          startIcon={<Iconify icon="solar:refresh-bold" />}
          onClick={syncSource}
        >
          Sync thủ công
        </Button>
      </Stack>
      <DataCard
        title="Nguồn nội dung"
        rows={rows}
        columns={sourceColumns}
        checkboxSelection
        rowSelectionModel={selectedRows}
        onRowSelectionModelChange={setSelectedRows}
      />
    </Stack>
  );
}

function AccountsModule({ canAdmin }: { canAdmin: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdAccounts, setCreatedAccounts] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: '',
    platform: 'FACEBOOK',
    type: 'FANPAGE',
    externalId: '',
    profileUrl: '',
    primaryDeviceId: '',
    approvalRequired: true,
  });
  const accountRows = useApiRows('/api/accounts/', socialAccounts);
  const deviceRows = useApiRows('/api/devices/?scope=pool', devices);
  const rows = [...createdAccounts, ...accountRows];

  useEffect(() => {
    if (!form.primaryDeviceId && deviceRows[0]?.id) {
      setForm((current) => ({ ...current, primaryDeviceId: deviceRows[0].id }));
    }
  }, [deviceRows, form.primaryDeviceId]);

  const updateForm = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = key === 'approvalRequired' ? event.target.checked : event.target.value;

    setForm((current) => {
      if (key === 'platform' && value === 'INSTAGRAM') {
        return { ...current, platform: value, type: 'INSTAGRAM_BUSINESS' };
      }

      if (key === 'platform' && value === 'FACEBOOK') {
        return { ...current, platform: value, type: current.type.startsWith('INSTAGRAM') ? 'FANPAGE' : current.type };
      }

      return { ...current, [key]: value };
    });
  };

  const syncMetaAccounts = useCallback(async () => {
    setSyncing(true);

    try {
      const response = await fetch('/api/accounts/', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ action: 'sync_meta' }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Không thể tạo job đồng bộ Meta');
      }

      enqueueSnackbar('Đã tạo job đồng bộ tài khoản Meta');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể tạo job đồng bộ Meta', {
        variant: 'error',
      });
    } finally {
      setSyncing(false);
    }
  }, [enqueueSnackbar]);

  const createAccount = useCallback(async () => {
    if (!canAdmin) return;

    setCreating(true);

    try {
      const response = await fetch('/api/accounts/', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          action: 'create_account',
          name: form.name,
          platform: form.platform,
          type: form.type,
          externalId: form.externalId || null,
          profileUrl: form.profileUrl || null,
          primaryDeviceId: form.primaryDeviceId,
          approvalRequired: form.approvalRequired,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Không thể tạo tài khoản');
      }

      const body = await response.json();

      setCreatedAccounts((current) => [body.data, ...current]);
      setForm({
        name: '',
        platform: 'FACEBOOK',
        type: 'FANPAGE',
        externalId: '',
        profileUrl: '',
        primaryDeviceId: deviceRows[0]?.id || '',
        approvalRequired: true,
      });
      enqueueSnackbar('Đã tạo tài khoản và gắn primary device');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể tạo tài khoản', {
        variant: 'error',
      });
    } finally {
      setCreating(false);
    }
  }, [canAdmin, deviceRows, enqueueSnackbar, form]);

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader title="Thêm tài khoản quản lý" />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Tên tài khoản" value={form.name} onChange={updateForm('name')} />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField fullWidth select label="Nền tảng" value={form.platform} onChange={updateForm('platform')}>
                <MenuItem value="FACEBOOK">Facebook</MenuItem>
                <MenuItem value="INSTAGRAM">Instagram</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField fullWidth select label="Loại" value={form.type} onChange={updateForm('type')}>
                {form.platform === 'FACEBOOK'
                  ? [
                      <MenuItem key="FANPAGE" value="FANPAGE">
                        Fanpage
                      </MenuItem>,
                      <MenuItem key="PROFILE" value="PROFILE">
                        Profile cá nhân
                      </MenuItem>,
                    ]
                  : [
                      <MenuItem key="INSTAGRAM_BUSINESS" value="INSTAGRAM_BUSINESS">
                        Instagram Business
                      </MenuItem>,
                      <MenuItem key="INSTAGRAM_CREATOR" value="INSTAGRAM_CREATOR">
                        Instagram Creator
                      </MenuItem>,
                    ]}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                label="External ID"
                value={form.externalId}
                onChange={updateForm('externalId')}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                select
                label="Primary device"
                value={form.primaryDeviceId}
                onChange={updateForm('primaryDeviceId')}
              >
                {deviceRows.map((device) => (
                  <MenuItem key={device.id} value={device.id}>
                    {device.name} · {device.provider}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={5}>
              <TextField
                fullWidth
                label="Profile URL"
                value={form.profileUrl}
                onChange={updateForm('profileUrl')}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel
                control={<Switch checked={form.approvalRequired} onChange={updateForm('approvalRequired')} />}
                label="Bắt buộc duyệt bài"
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                size="large"
                variant="contained"
                disabled={!canAdmin || creating || !form.name || !form.primaryDeviceId}
                startIcon={<Iconify icon="solar:user-plus-bold" />}
                onClick={createAccount}
              >
                Thêm
              </Button>
            </Grid>
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                size="large"
                variant="outlined"
                disabled={!canAdmin || syncing}
                startIcon={<Iconify icon="solar:link-bold" />}
                onClick={syncMetaAccounts}
              >
                Sync Meta
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      <DataCard title="Facebook Fanpage / Profile / Instagram" rows={rows} columns={accountColumns} />
    </Stack>
  );
}

function AccountWorkspaceModule({ canAdmin, canCreate }: { canAdmin: boolean; canCreate: boolean }) {
  const params = useParams();
  const pathname = usePathname();
  const { enqueueSnackbar } = useSnackbar();
  const accountId = String(params?.accountId || '');
  const postId = String(params?.postId || '');
  const [account, setAccount] = useState<any>(null);
  const [postDetail, setPostDetail] = useState<any>(null);
  const [postDetailForm, setPostDetailForm] = useState({ title: '', caption: '', scheduledAt: '', status: 'DRAFT' });
  const [assignedDevices, setAssignedDevices] = useState<any[]>([]);
  const [selectedDeviceRows, setSelectedDeviceRows] = useState<GridRowSelectionModel>([]);
  const [selectedSourceImportRows, setSelectedSourceImportRows] = useState<GridRowSelectionModel>([]);
  const [assigningDevice, setAssigningDevice] = useState(false);
  const [savingPostDetail, setSavingPostDetail] = useState(false);
  const [deviceForm, setDeviceForm] = useState({
    deviceId: '',
    role: 'BACKUP',
    isPrimary: false,
  });
  const [sourceImportForm, setSourceImportForm] = useState({ url: '', platform: 'auto' });
  const [importingSource, setImportingSource] = useState(false);
  const [localSourceImports, setLocalSourceImports] = useState<any[]>([]);
  const showDeviceManager = pathname.endsWith('/devices');
  const showPostDetail = Boolean(postId);
  const showMediaManager = pathname.endsWith('/media');
  const showSourceManager = pathname.endsWith('/sources');
  const showJobManager = pathname.endsWith('/jobs');
  const isAccountOverview = pathname === `/dashboard/accounts/${accountId}/` || pathname === `/dashboard/accounts/${accountId}`;
  const shouldLoadPosts = isAccountOverview || pathname.includes('/posts') || showPostDetail;
  const shouldLoadMedia = showMediaManager || showPostDetail || isAccountOverview;
  const shouldLoadSources = showSourceManager || isAccountOverview;
  const shouldLoadJobs = showJobManager || isAccountOverview;
  const summary = useApiData<any>(
    accountId ? `/api/accounts/${accountId}/summary/` : '',
    { postsCount: 0, draftsCount: 0, scheduledCount: 0, mediaCount: 0, jobsCount: 0, devicesCount: 0, sourceImportsCount: 0 }
  );
  const sourceImportRows = usePollingApiRows<any>(
    accountId ? `/api/accounts/${accountId}/source-imports/` : '',
    [],
    5000,
    Boolean(accountId)
  );
  const postRows = useApiRows(shouldLoadPosts && accountId ? `/api/accounts/${accountId}/posts/` : '', []);
  const mediaRows = useApiRows(shouldLoadMedia && accountId ? `/api/accounts/${accountId}/media/` : '', []);
  const sourceRows = useApiRows(shouldLoadSources && accountId ? `/api/accounts/${accountId}/sources/` : '', []);
  const jobRows = useApiRows(shouldLoadJobs && accountId ? `/api/accounts/${accountId}/jobs/` : '', []);
  const deviceRows = useApiRows(accountId ? `/api/accounts/${accountId}/devices/` : '', []);
  const devicePoolRows = useApiRows(showDeviceManager ? '/api/devices/?scope=pool' : '', devices);
  const accountDeviceRows = Array.from(
    new Map([...assignedDevices, ...deviceRows].map((device) => [device.mappingId || device.id, device])).values()
  );
  const selectedDeviceRowId = selectedDeviceRows[0] ? String(selectedDeviceRows[0]) : '';
  const selectedSourceImportId = selectedSourceImportRows[0] ? String(selectedSourceImportRows[0]) : '';
  const selectedMappingId =
    accountDeviceRows.find((device) => device.id === selectedDeviceRowId)?.mappingId || selectedDeviceRowId;
  const mergedSourceImports = Array.from(
    new Map([...localSourceImports, ...sourceImportRows].map((row) => [row.id, row])).values()
  );
  const workspacePostColumns = useMemo<GridColDef[]>(
    () => [
      ...postColumns,
      {
        field: 'open',
        headerName: '',
        width: 100,
        sortable: false,
        renderCell: (params) => (
          <Button size="small" href={`${paths.dashboard.accounts}/${accountId}/posts/${params.row.id}`}>
            Mở
          </Button>
        ),
      },
    ],
    [accountId]
  );

  useEffect(() => {
    if (!deviceForm.deviceId && devicePoolRows[0]?.id) {
      setDeviceForm((current) => ({ ...current, deviceId: devicePoolRows[0].id }));
    }
  }, [deviceForm.deviceId, devicePoolRows]);

  useEffect(() => {
    if (!accountId) return undefined;

    let active = true;

    fetch(`/api/accounts/${accountId}/`)
      .then((response) => response.json())
      .then((response) => {
        if (active) setAccount(response.data || null);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [accountId]);

  useEffect(() => {
    if (!accountId || !postId) return undefined;

    let active = true;

    fetch(`/api/accounts/${accountId}/posts/${postId}/`)
      .then((response) => response.json())
      .then((response) => {
        if (!active || !response.data) return;

        setPostDetail(response.data);
        setPostDetailForm({
          title: response.data.title || '',
          caption: response.data.caption || '',
          scheduledAt: response.data.scheduledAt ? String(response.data.scheduledAt).replace(' ', 'T') : '',
          status: response.data.status || 'DRAFT',
        });
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [accountId, postId]);

  const updateDeviceForm = (key: keyof typeof deviceForm) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = key === 'isPrimary' ? event.target.checked : event.target.value;

    setDeviceForm((current) => ({ ...current, [key]: value }));
  };

  const updateSourceImportForm = (key: keyof typeof sourceImportForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setSourceImportForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const updatePostDetailForm = (key: keyof typeof postDetailForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setPostDetailForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const createSourceImport = useCallback(async () => {
    if (!accountId || !sourceImportForm.url.trim()) {
      enqueueSnackbar('Nhập link XSH hoặc Douyin trước khi tạo nháp', { variant: 'warning' });
      return;
    }

    setImportingSource(true);

    try {
      const response = await fetch(`/api/accounts/${accountId}/source-imports/`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ url: sourceImportForm.url.trim(), platform: sourceImportForm.platform, async: true }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể tạo bài nháp từ link nguồn');

      if (body.data) {
        setLocalSourceImports((current) => [body.data, ...current.filter((row) => row.id !== body.data.id)]);
      }

      if (body.data?.status === 'FAILED') {
        enqueueSnackbar(body.message || 'Downloader chưa xử lý được link này', { variant: 'warning' });
      } else {
        setSourceImportForm((current) => ({ ...current, url: '' }));
        enqueueSnackbar(response.status === 202 ? 'Đã đưa link vào hàng xử lý' : 'Đã tải nguồn và tạo bài nháp');
      }
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể tạo bài nháp từ link nguồn', {
        variant: 'error',
      });
    } finally {
      setImportingSource(false);
    }
  }, [accountId, enqueueSnackbar, sourceImportForm]);

  const updateSourceImport = useCallback(
    async (action: 'retry' | 'cancel') => {
      if (!accountId || !selectedSourceImportId) {
        enqueueSnackbar('Chọn một import cần xử lý', { variant: 'warning' });
        return;
      }

      try {
        const response = await fetch(`/api/accounts/${accountId}/source-imports/${selectedSourceImportId}/${action}/`, {
          method: 'POST',
          headers: authJsonHeaders(),
        });
        const body = await response.json();

        if (!response.ok) throw new Error(body.message || 'Không thể cập nhật import');

        const data = body.data;

        if (data) {
          setLocalSourceImports((current) => [data, ...current.filter((row) => row.id !== data.id)]);
        }

        setSelectedSourceImportRows([]);
        enqueueSnackbar(action === 'retry' ? 'Đã retry import' : 'Đã hủy import');
      } catch (error) {
        enqueueSnackbar(error instanceof Error ? error.message : 'Không thể cập nhật import', { variant: 'error' });
      }
    },
    [accountId, enqueueSnackbar, selectedSourceImportId]
  );

  const savePostDetail = useCallback(async () => {
    if (!accountId || !postId || !canCreate) return;

    setSavingPostDetail(true);

    try {
      const response = await fetch(`/api/accounts/${accountId}/posts/${postId}/`, {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          title: postDetailForm.title,
          caption: postDetailForm.caption,
          scheduledAt: postDetailForm.scheduledAt || null,
          status: postDetailForm.status,
        }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể lưu bài nháp');

      setPostDetail(body.data);
      enqueueSnackbar('Đã lưu bài nháp');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể lưu bài nháp', { variant: 'error' });
    } finally {
      setSavingPostDetail(false);
    }
  }, [accountId, canCreate, enqueueSnackbar, postDetailForm, postId]);

  const assignDevice = useCallback(async () => {
    if (!canAdmin || !accountId) return;

    setAssigningDevice(true);

    try {
      const response = await fetch(`/api/accounts/${accountId}/devices/`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(deviceForm),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Không thể gán device');
      }

      const body = await response.json();

      setAssignedDevices((current) => [body.data, ...current.filter((device) => device.mappingId !== body.data.mappingId)]);
      enqueueSnackbar('Đã gán profile vận hành cho Social Account');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể gán profile vận hành', {
        variant: 'error',
      });
    } finally {
      setAssigningDevice(false);
    }
  }, [accountId, canAdmin, deviceForm, enqueueSnackbar]);

  const updateAccountDevice = useCallback(
    async (action: 'primary' | 'remove') => {
      if (!selectedMappingId || !accountId) {
        enqueueSnackbar('Chọn một device mapping cần xử lý', { variant: 'warning' });
        return;
      }

      try {
        const response = await fetch(`/api/accounts/${accountId}/devices/${selectedMappingId}/`, {
          method: action === 'remove' ? 'DELETE' : 'PATCH',
          headers: authJsonHeaders(),
          body: action === 'remove' ? undefined : JSON.stringify({ isPrimary: true }),
        });

        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.message || 'Không thể cập nhật device mapping');
        }

        const body = await response.json();

        setAssignedDevices((current) =>
          action === 'remove'
            ? current.filter((device) => device.mappingId !== selectedMappingId)
            : [
                body.data,
                ...accountDeviceRows
                  .filter((device) => device.mappingId !== selectedMappingId)
                  .map((device) => ({ ...device, isPrimary: false, role: device.role === 'PRIMARY' ? 'BACKUP' : device.role })),
              ]
        );
        setSelectedDeviceRows([]);
        enqueueSnackbar(action === 'remove' ? 'Đã bỏ gán device' : 'Đã đổi primary device');
      } catch (error) {
        enqueueSnackbar(error instanceof Error ? error.message : 'Không thể cập nhật device mapping', {
          variant: 'error',
        });
      }
    },
    [accountDeviceRows, accountId, enqueueSnackbar, selectedMappingId]
  );

  return (
    <Stack spacing={3}>
      <CustomBreadcrumbs
        heading={account?.name || 'Đang tải tài khoản'}
        links={[
          { name: 'Dashboard', href: paths.dashboard.root },
          { name: 'Tài khoản mạng xã hội', href: paths.dashboard.accounts },
          { name: account?.name || 'Đang tải tài khoản' },
        ]}
      />

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'flex-start', md: 'center' }}
            justifyContent="space-between"
          >
            <Stack spacing={0.75}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="h4">{account?.name || 'Social account'}</Typography>
                {account?.type && <Chip size="small" label={account.type} />}
                {account?.platform && <Chip size="small" label={account.platform} />}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Primary device: {account?.primaryDevice || 'Chưa gắn'} · Kết nối: {account?.deviceOnlineStatus || 'UNKNOWN'} · Health:{' '}
                {account?.deviceHealth || 'UNKNOWN'} · Token: {account?.tokenStatus || 'UNKNOWN'}
              </Typography>
              {account?.deviceOnlineStatus === 'OFFLINE' && (
                <Typography variant="body2" color="warning.main">
                  Device offline: vẫn tạo nháp, quản lý media và lên lịch được; đăng ngay sẽ chờ khi device online.
                </Typography>
              )}
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                disabled={!canCreate}
                href={`${paths.dashboard.accounts}/${accountId}/posts/new`}
                startIcon={<Iconify icon="solar:add-circle-bold" />}
              >
                Tạo bài
              </Button>
              <Button
                variant="outlined"
                disabled={!canAdmin}
                href={`${paths.dashboard.accounts}/${accountId}/devices`}
                startIcon={<Iconify icon="solar:monitor-smartphone-bold-duotone" />}
              >
                Thiết bị
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <KpiCard title="Bài đăng" value={String(summary.postsCount || 0)} icon="solar:document-text-bold-duotone" color="#2065D1" />
        </Grid>
        <Grid item xs={12} md={3}>
          <KpiCard title="Media" value={String(summary.mediaCount || 0)} icon="solar:folder-bold-duotone" color="#118D57" />
        </Grid>
        <Grid item xs={12} md={3}>
          <KpiCard title="Jobs" value={String(summary.jobsCount || 0)} icon="solar:server-bold-duotone" color="#B76E00" />
        </Grid>
        <Grid item xs={12} md={3}>
          <KpiCard title="Devices" value={String(summary.devicesCount || 0)} icon="solar:monitor-smartphone-bold-duotone" color="#637381" />
        </Grid>
      </Grid>

      <Card>
        <CardHeader title="Tạo bài từ nguồn" />
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={7}>
              <TextField
                fullWidth
                label="Link XSH hoặc Douyin"
                value={sourceImportForm.url}
                onChange={updateSourceImportForm('url')}
                placeholder="https://xhslink.com/... hoặc link Douyin"
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField fullWidth select label="Nền tảng" value={sourceImportForm.platform} onChange={updateSourceImportForm('platform')}>
                <MenuItem value="auto">Tự nhận diện</MenuItem>
                <MenuItem value="xsh">XSH</MenuItem>
                <MenuItem value="douyin">Douyin</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <Button
                fullWidth
                size="large"
                variant="contained"
                disabled={!canCreate || importingSource || !sourceImportForm.url.trim()}
                onClick={createSourceImport}
                startIcon={<Iconify icon={importingSource ? 'solar:refresh-bold' : 'solar:download-minimalistic-bold'} />}
              >
                {importingSource ? 'Đang tạo nháp' : 'Tải và tạo nháp'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {showPostDetail && (
        <Card>
          <CardHeader
            title={postDetail?.title || 'Chi tiết bài nháp'}
            action={<StatusChip value={postDetail?.status || postDetailForm.status} />}
          />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={8}>
                <Stack spacing={2}>
                  <TextField label="Tiêu đề" value={postDetailForm.title} onChange={updatePostDetailForm('title')} />
                  <TextField
                    label="Caption"
                    value={postDetailForm.caption}
                    onChange={updatePostDetailForm('caption')}
                    multiline
                    minRows={6}
                  />
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                      fullWidth
                      label="Thời gian đăng"
                      type="datetime-local"
                      value={postDetailForm.scheduledAt}
                      onChange={updatePostDetailForm('scheduledAt')}
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField fullWidth select label="Trạng thái" value={postDetailForm.status} onChange={updatePostDetailForm('status')}>
                      {['DRAFT', 'WAITING_APPROVAL', 'APPROVED', 'SCHEDULED'].map((status) => (
                        <MenuItem key={status} value={status}>
                          {(statusLabels as any)[status] || status}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Button variant="contained" disabled={!canCreate || savingPostDetail} onClick={savePostDetail}>
                      Lưu thay đổi
                    </Button>
                    <Button variant="outlined" href={`${paths.dashboard.accounts}/${accountId}`}>
                      Quay lại workspace
                    </Button>
                  </Stack>
                </Stack>
              </Grid>
              <Grid item xs={12} md={4}>
                <Stack spacing={2}>
                  <Typography variant="subtitle2">Media</Typography>
                  {postDetail?.media?.length ? (
                    postDetail.media.map((asset: any) => (
                      <Box key={asset.id} sx={{ p: 1.5, border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 1 }}>
                        <Typography variant="body2" noWrap>
                          {asset.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {asset.type} · {asset.folder}
                        </Typography>
                      </Box>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Chưa có media gắn với bài này.
                    </Typography>
                  )}
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {showDeviceManager && (
        <Card>
          <CardHeader title="Gán profile vận hành cho Social Account" />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={5}>
                <TextField fullWidth select label="Device pool" value={deviceForm.deviceId} onChange={updateDeviceForm('deviceId')}>
                  {devicePoolRows.map((device: any) => (
                    <MenuItem key={device.id} value={device.id}>
                      {device.name} · {device.profileName || device.externalId}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField fullWidth select label="Role" value={deviceForm.role} onChange={updateDeviceForm('role')}>
                  {['PRIMARY', 'BACKUP', 'RECOVERY', 'PUBLISHING', 'SYNC_ONLY'].map((role) => (
                    <MenuItem key={role} value={role}>
                      {role}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={2}>
                <FormControlLabel
                  control={<Switch checked={deviceForm.isPrimary} onChange={updateDeviceForm('isPrimary')} />}
                  label="Set primary"
                />
              </Grid>
              <Grid item xs={12} md={2}>
                <Button
                  fullWidth
                  size="large"
                  variant="contained"
                  disabled={!canAdmin || assigningDevice || !deviceForm.deviceId}
                  onClick={assignDevice}
                >
                  Gán profile
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <DataCard title="Bài đăng của tài khoản" rows={postRows} columns={workspacePostColumns} />
        </Grid>
        <Grid item xs={12} lg={4}>
          <Stack spacing={2}>
            {showDeviceManager && (
              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  disabled={!canAdmin || !selectedMappingId}
                  onClick={() => updateAccountDevice('primary')}
                >
                  Set primary
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  disabled={!canAdmin || !selectedMappingId}
                  onClick={() => updateAccountDevice('remove')}
                >
                  Bỏ gán
                </Button>
              </Stack>
            )}
            <DataCard
              title="Profile vận hành của Social Account"
              rows={accountDeviceRows}
              columns={deviceColumns.slice(0, 9)}
              checkboxSelection={showDeviceManager}
              rowSelectionModel={selectedDeviceRows}
              onRowSelectionModelChange={setSelectedDeviceRows}
            />
          </Stack>
        </Grid>
        <Grid item xs={12} md={6}>
          <DataCard title="Media theo tài khoản" rows={mediaRows} columns={mediaColumns.slice(0, 5)} />
        </Grid>
        <Grid item xs={12} md={6}>
          <DataCard title="Nguồn nội dung" rows={sourceRows} columns={sourceColumns} />
        </Grid>
        <Grid item xs={12} md={6}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" disabled={!canCreate || !selectedSourceImportId} onClick={() => updateSourceImport('retry')}>
                Retry
              </Button>
              <Button
                variant="outlined"
                color="error"
                disabled={!canCreate || !selectedSourceImportId}
                onClick={() => updateSourceImport('cancel')}
              >
                Hủy
              </Button>
            </Stack>
            <DataCard
              title="Import từ link nguồn"
              rows={mergedSourceImports}
              columns={sourceImportColumns}
              checkboxSelection
              rowSelectionModel={selectedSourceImportRows}
              onRowSelectionModelChange={setSelectedSourceImportRows}
            />
          </Stack>
        </Grid>
        <Grid item xs={12} md={6}>
          <DataCard title="Jobs theo tài khoản" rows={jobRows} columns={jobColumns.slice(0, 4)} />
        </Grid>
      </Grid>
    </Stack>
  );
}

const deviceColumns: GridColDef[] = [
  { field: 'name', headerName: 'Device', flex: 1, minWidth: 220 },
  { field: 'profileName', headerName: 'Profile', width: 170 },
  { field: 'type', headerName: 'Loại', width: 170 },
  { field: 'provider', headerName: 'Provider', width: 140 },
  { field: 'externalId', headerName: 'External / ADB ID', width: 220 },
  { field: 'proxySummary', headerName: 'Proxy/IP', width: 180 },
  {
    field: 'locked',
    headerName: 'Khóa',
    width: 100,
    renderCell: (params) => <StatusChip value={params.value ? 'LOCKED' : 'OPEN'} />,
  },
  { field: 'status', headerName: 'Trạng thái', width: 130, renderCell: (params) => <StatusChip value={params.value} /> },
  {
    field: 'onlineStatus',
    headerName: 'Online',
    width: 110,
    renderCell: (params) => <StatusChip value={params.value || 'UNKNOWN'} />,
  },
  {
    field: 'healthStatus',
    headerName: 'Health',
    width: 120,
    renderCell: (params) => <StatusChip value={params.value || 'UNKNOWN'} />,
  },
  {
    field: 'verifiedSocialAccounts',
    headerName: 'Social account đăng nhập',
    flex: 1,
    minWidth: 260,
    renderCell: (params) => <SocialAccountChips accounts={params.value || []} deviceId={params.row.id} />,
  },
  { field: 'role', headerName: 'Role', width: 130 },
  {
    field: 'isPrimary',
    headerName: 'Primary',
    width: 110,
    renderCell: (params) => <StatusChip value={params.value ? 'PRIMARY' : 'BACKUP'} />,
  },
  { field: 'lastSeenAt', headerName: 'Seen cuối', width: 160 },
  {
    field: 'detail',
    headerName: '',
    width: 90,
    sortable: false,
    renderCell: (params) => (
      <Button size="small" href={paths.dashboard.deviceDetails(params.row.id)}>
        View
      </Button>
    ),
  },
];

function DeviceProfileDetails({ device }: { device: any }) {
  const items = [
    ['Device', device.name],
    ['Profile', device.profileName],
    ['Loại', device.type],
    ['Provider', device.provider],
    ['External / ADB ID', device.externalId],
    ['Proxy/IP', device.proxySummary],
    ['Trạng thái', device.status],
    ['Health', device.healthStatus],
    ['Khóa', device.locked ? 'LOCKED' : 'OPEN'],
    ['Seen cuối', device.lastSeenAt],
    ['Social verified', device.accounts || 'Chưa xác minh'],
    ['Role', device.role],
    ['Primary', device.isPrimary ? 'PRIMARY' : 'BACKUP'],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');

  return (
    <Card>
      <CardHeader title="Thông tin profile" />
      <CardContent>
        <Grid container spacing={2}>
          {items.map(([label, value]) => (
            <Grid key={label} item xs={12} sm={6} md={4}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
                {String(value)}
              </Typography>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
}

function compactDeviceColumns(expandedDeviceId: string, onToggle: (deviceId: string) => void): GridColDef[] {
  return [
    { field: 'name', headerName: 'Device', flex: 1, minWidth: 220 },
    { field: 'profileName', headerName: 'Profile', flex: 1, minWidth: 180 },
    { field: 'proxySummary', headerName: 'Proxy/IP', width: 190 },
    {
      field: 'healthStatus',
      headerName: 'Health',
      width: 120,
      renderCell: (params) => <StatusChip value={params.value || 'UNKNOWN'} />,
    },
    {
      field: 'verifiedSocialAccounts',
      headerName: 'Social',
      width: 120,
      renderCell: (params) => <SocialAccountChips accounts={params.value || []} deviceId={params.row.id} />,
    },
    {
      field: 'locked',
      headerName: 'Khóa',
      width: 95,
      renderCell: (params) => <StatusChip value={params.value ? 'LOCKED' : 'OPEN'} />,
    },
    {
      field: 'detailToggle',
      headerName: '',
      width: 60,
      sortable: false,
      renderCell: (params) => {
        const isExpanded = expandedDeviceId === params.row.id;

        return (
          <Tooltip title={isExpanded ? 'Ẩn thông tin đầy đủ' : 'Xem thông tin đầy đủ'} arrow>
            <IconButton size="small" onClick={() => onToggle(params.row.id)}>
              <Iconify icon={isExpanded ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'} width={18} />
            </IconButton>
          </Tooltip>
        );
      },
    },
    {
      field: 'detail',
      headerName: '',
      width: 90,
      sortable: false,
      renderCell: (params) => (
        <Button size="small" href={paths.dashboard.deviceDetails(params.row.id)}>
          View
        </Button>
      ),
    },
  ];
}

function DeviceHubCard({
  title,
  icon,
  href,
}: {
  title: string;
  icon: string;
  href: string;
}) {
  return (
    <Card>
      <CardContent
        component="a"
        href={href}
        sx={{
          display: 'block',
          color: 'inherit',
          textDecoration: 'none',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 1,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'background.neutral',
              }}
            >
              <Iconify icon={icon} width={30} />
            </Box>
            <Box>
              <Typography variant="h6">{title}</Typography>
            </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function DevicesModule() {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={4}>
        <DeviceHubCard
          title="MostLogin"
          icon="solar:monitor-bold-duotone"
          href={paths.dashboard.devicesMostLogin}
        />
      </Grid>
      <Grid item xs={12} md={4}>
        <DeviceHubCard
          title="Android Devices"
          icon="solar:smartphone-2-bold-duotone"
          href={paths.dashboard.devicesAndroid}
        />
      </Grid>
      <Grid item xs={12} md={4}>
        <DeviceHubCard
          title="Thêm device"
          icon="solar:add-circle-bold-duotone"
          href={paths.dashboard.devicesAdd}
        />
      </Grid>
    </Grid>
  );
}

function DeviceListModule({
  canAdmin,
  provider,
  type,
  title,
}: {
  canAdmin: boolean;
  provider?: string;
  type?: string;
  title: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const query = new URLSearchParams();

  if (provider) query.set('provider', provider);
  if (type) query.set('type', type);

  const deviceRows = useApiRows(`/api/devices/${query.toString() ? `?${query.toString()}` : ''}`, devices);
  const [createdDevices, setCreatedDevices] = useState<any[]>([]);
  const [syncedDevices, setSyncedDevices] = useState<any[]>([]);
  const [updatedDevices, setUpdatedDevices] = useState<Record<string, any>>({});
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([]);
  const [expandedDeviceId, setExpandedDeviceId] = useState('');
  const [runningAction, setRunningAction] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [syncingProfiles, setSyncingProfiles] = useState(false);
  const [syncingAndroid, setSyncingAndroid] = useState(false);
  const [androidScanResult, setAndroidScanResult] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'ANTIDETECT_PROFILE',
    provider: 'MOSTLOGIN',
    externalId: '',
    profileName: '',
    adbId: '',
    deviceModel: '',
    androidVersion: '',
  });
  const rows = Array.from(
    new Map([...syncedDevices, ...createdDevices, ...deviceRows].map((device) => [device.id, device])).values()
  ).map((device) => updatedDevices[device.id] || device);
  const isAndroid = form.type === 'ANDROID_DEVICE';
  const selectedDeviceId = selectedRows[0] ? String(selectedRows[0]) : '';
  const visibleRows = rows.filter((row) => !row._deleted);
  const expandedDevice = visibleRows.find((row) => row.id === expandedDeviceId);
  const columns = compactDeviceColumns(expandedDeviceId, (deviceId) => {
    setExpandedDeviceId((current) => (current === deviceId ? '' : deviceId));
  });

  const updateForm = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;

    setForm((current) => {
      if (key === 'type' && value === 'ANDROID_DEVICE') {
        return { ...current, type: value, provider: 'ADB' };
      }

      if (key === 'type' && value === 'ANTIDETECT_PROFILE') {
        return { ...current, type: value, provider: current.provider === 'ADB' ? 'MOSTLOGIN' : current.provider };
      }

      return { ...current, [key]: value };
    });
  };

  const createDevice = useCallback(async () => {
    if (!canAdmin) return;

    setCreating(true);

    try {
      const response = await fetch('/api/devices/', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          provider: form.provider,
          externalId: isAndroid ? null : form.externalId || null,
          profileName: isAndroid ? null : form.profileName || null,
          adbId: isAndroid ? form.adbId || null : null,
          deviceModel: isAndroid ? form.deviceModel || null : null,
          androidVersion: isAndroid ? form.androidVersion || null : null,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Không thể tạo device');
      }

      const body = await response.json();

      setCreatedDevices((current) => [body.data, ...current]);
      setForm({
        name: '',
        type: 'ANTIDETECT_PROFILE',
        provider: 'MOSTLOGIN',
        externalId: '',
        profileName: '',
        adbId: '',
        deviceModel: '',
        androidVersion: '',
      });
      enqueueSnackbar('Đã tạo device');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể tạo device', {
        variant: 'error',
      });
    } finally {
      setCreating(false);
    }
  }, [canAdmin, enqueueSnackbar, form, isAndroid]);

  const syncMostLoginProfiles = useCallback(async () => {
    if (!canAdmin) return;

    setSyncingProfiles(true);

    try {
      const response = await fetch('/api/devices/sync-profiles/', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ provider: 'MOSTLOGIN' }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Không thể sync MostLogin profiles');
      }

      const body = await response.json();

      setSyncedDevices(body.data || []);
      enqueueSnackbar(
        `Đã đồng bộ ${body.synced || body.count || 0} MostLogin profiles (${body.created || 0} mới, ${body.updated || 0} cập nhật)`
      );
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể sync MostLogin profiles', {
        variant: 'error',
      });
    } finally {
      setSyncingProfiles(false);
    }
  }, [canAdmin, enqueueSnackbar]);

  const syncAndroidDevices = useCallback(async () => {
    if (!canAdmin) return;

    setSyncingAndroid(true);

    try {
      const response = await fetch('/api/devices/sync-android/', {
        method: 'POST',
        headers: authJsonHeaders(),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể sync Android ADB devices');

      setSyncedDevices(body.data || []);
      enqueueSnackbar(`Đã đồng bộ ${body.count || 0} Android device đang kết nối`);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể sync Android ADB devices', { variant: 'error' });
    } finally {
      setSyncingAndroid(false);
    }
  }, [canAdmin, enqueueSnackbar]);

  const scanAndroidSocialLogins = useCallback(async () => {
    if (!selectedDeviceId) {
      enqueueSnackbar('Chọn Android device cần quét', { variant: 'warning' });
      return;
    }

    setRunningAction('scan-social-logins');

    try {
      const response = await fetch(`/api/devices/${selectedDeviceId}/scan-social-logins/`, {
        method: 'POST',
        headers: authJsonHeaders(),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể quét social login trên Android');

      setAndroidScanResult(body.data);
      enqueueSnackbar(body.data?.message || 'Đã quét social login trên Android');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể quét social login trên Android', { variant: 'error' });
    } finally {
      setRunningAction('');
    }
  }, [enqueueSnackbar, selectedDeviceId]);

  const runDeviceAction = useCallback(
    async (action: 'health-check' | 'open' | 'close') => {
      if (!selectedDeviceId) {
        enqueueSnackbar('Chọn một device cần xử lý', { variant: 'warning' });
        return;
      }

      setRunningAction(action);

      try {
        const response = await fetch(`/api/devices/${selectedDeviceId}/${action}/`, {
          method: 'POST',
          headers: authJsonHeaders(),
        });

        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.message || 'Không thể chạy action device');
        }

        const body = await response.json();

        if (body.data) {
          setUpdatedDevices((current) => ({ ...current, [selectedDeviceId]: body.data }));
        }

        enqueueSnackbar(body.result?.message || 'Đã chạy action device');
      } catch (error) {
        enqueueSnackbar(error instanceof Error ? error.message : 'Không thể chạy action device', {
          variant: 'error',
        });
      } finally {
        setRunningAction('');
      }
    },
    [enqueueSnackbar, selectedDeviceId]
  );

  const runStateAction = useCallback(
    async (action: 'activate' | 'deactivate' | 'lock' | 'unlock') => {
      if (!selectedDeviceId) {
        enqueueSnackbar('Chọn một device cần xử lý', { variant: 'warning' });
        return;
      }

      setRunningAction(action);

      try {
        const response = await fetch(`/api/devices/${selectedDeviceId}/state/`, {
          method: 'POST',
          headers: authJsonHeaders(),
          body: JSON.stringify({ action, reason: action === 'lock' ? 'Khóa từ dashboard' : undefined }),
        });
        const body = await response.json();

        if (!response.ok) throw new Error(body.message || 'Không thể cập nhật trạng thái device');
        if (body.data) setUpdatedDevices((current) => ({ ...current, [selectedDeviceId]: body.data }));

        enqueueSnackbar('Đã cập nhật trạng thái device');
      } catch (error) {
        enqueueSnackbar(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái device', {
          variant: 'error',
        });
      } finally {
        setRunningAction('');
      }
    },
    [enqueueSnackbar, selectedDeviceId]
  );

  const deleteSelectedDevice = useCallback(async () => {
    if (!selectedDeviceId) {
      enqueueSnackbar('Chọn một device cần xóa', { variant: 'warning' });
      return;
    }

    setRunningAction('delete');

    try {
      const response = await fetch(`/api/devices/${selectedDeviceId}/`, {
        method: 'DELETE',
        headers: authJsonHeaders(),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể xóa device');

      setUpdatedDevices((current) => ({ ...current, [selectedDeviceId]: { id: selectedDeviceId, _deleted: true } }));
      setSelectedRows([]);
      enqueueSnackbar('Đã xóa device');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể xóa device', { variant: 'error' });
    } finally {
      setRunningAction('');
    }
  }, [enqueueSnackbar, selectedDeviceId]);

  return (
    <Stack spacing={3}>
      {false && <Card>
        <CardHeader title="Thêm device vận hành" />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Tên device" value={form.name} onChange={updateForm('name')} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth select label="Loại device" value={form.type} onChange={updateForm('type')}>
                <MenuItem value="ANTIDETECT_PROFILE">Antidetect Browser Profile</MenuItem>
                <MenuItem value="ANDROID_DEVICE">Android ADB Device</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField fullWidth select label="Provider" value={form.provider} onChange={updateForm('provider')}>
                {isAndroid ? (
                  <MenuItem value="ADB">ADB</MenuItem>
                ) : (
                  ['MOSTLOGIN', 'DONUT', 'NSTBROWSER', 'MANUAL'].map((providerOption) => (
                    <MenuItem key={providerOption} value={providerOption}>
                      {providerOption}
                    </MenuItem>
                  ))
                )}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              {isAndroid ? (
                <TextField fullWidth label="ADB ID" value={form.adbId} onChange={updateForm('adbId')} />
              ) : (
                <TextField
                  fullWidth
                  label="Profile external ID"
                  value={form.externalId}
                  onChange={updateForm('externalId')}
                />
              )}
            </Grid>
            <Grid item xs={12} md={4}>
              {isAndroid ? (
                <TextField
                  fullWidth
                  label="Model thiết bị"
                  value={form.deviceModel}
                  onChange={updateForm('deviceModel')}
                />
              ) : (
                <TextField
                  fullWidth
                  label="Tên profile"
                  value={form.profileName}
                  onChange={updateForm('profileName')}
                />
              )}
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                disabled={!isAndroid}
                label="Android version"
                value={form.androidVersion}
                onChange={updateForm('androidVersion')}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Button
                fullWidth
                size="large"
                variant="contained"
                disabled={!canAdmin || creating || !form.name}
                startIcon={<Iconify icon="solar:monitor-smartphone-bold-duotone" />}
                onClick={createDevice}
              >
                Thêm device
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>}

      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          disabled={!canAdmin || syncingProfiles || provider !== 'MOSTLOGIN'}
          startIcon={<Iconify icon="solar:refresh-bold" />}
          onClick={syncMostLoginProfiles}
        >
          Sync MostLogin Profiles
        </Button>
        <Button
          variant="contained"
          disabled={!canAdmin || syncingAndroid || provider !== 'ADB'}
          startIcon={<Iconify icon="solar:smartphone-update-bold" />}
          onClick={syncAndroidDevices}
        >
          Sync Android ADB
        </Button>
        <Button
          variant="outlined"
          disabled={!canAdmin || provider !== 'ADB' || !selectedDeviceId || !!runningAction}
          startIcon={<Iconify icon="solar:user-check-bold" />}
          onClick={scanAndroidSocialLogins}
        >
          Quét social login
        </Button>
        <Button
          variant="outlined"
          disabled={!canAdmin || !selectedDeviceId || !!runningAction}
          startIcon={<Iconify icon="solar:pulse-2-bold" />}
          onClick={() => runDeviceAction('health-check')}
        >
          Health check
        </Button>
        <Button
          variant="outlined"
          disabled={!canAdmin || !selectedDeviceId || !!runningAction}
          startIcon={<Iconify icon="solar:play-circle-bold" />}
          onClick={() => runDeviceAction('open')}
        >
          Open profile/device
        </Button>
        <Button
          variant="outlined"
          disabled={!canAdmin || !selectedDeviceId || !!runningAction}
          startIcon={<Iconify icon="solar:stop-circle-bold" />}
          onClick={() => runDeviceAction('close')}
        >
          Close profile/device
        </Button>
        <Button variant="outlined" disabled={!canAdmin || !selectedDeviceId || !!runningAction} onClick={() => runStateAction('activate')}>
          Kích hoạt
        </Button>
        <Button variant="outlined" disabled={!canAdmin || !selectedDeviceId || !!runningAction} onClick={() => runStateAction('deactivate')}>
          Ngưng kích hoạt
        </Button>
        <Button variant="outlined" color="warning" disabled={!canAdmin || !selectedDeviceId || !!runningAction} onClick={() => runStateAction('lock')}>
          Khóa
        </Button>
        <Button variant="outlined" disabled={!canAdmin || !selectedDeviceId || !!runningAction} onClick={() => runStateAction('unlock')}>
          Mở khóa
        </Button>
        <Button variant="outlined" color="error" disabled={!canAdmin || !selectedDeviceId || !!runningAction} onClick={deleteSelectedDevice}>
          Xóa
        </Button>
      </Stack>

      <DataCard
        title={title}
        rows={visibleRows}
        columns={columns}
        checkboxSelection
        rowSelectionModel={selectedRows}
        onRowSelectionModelChange={setSelectedRows}
      />
      {androidScanResult && (
        <Card>
          <CardHeader title="Kết quả quét social trên Android" subheader={androidScanResult.message} />
          <CardContent>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(androidScanResult.installedApps || []).map((app: any) => (
                  <Chip key={app.packageName} icon={<Iconify icon={socialPlatformIcon(app.platform)} width={16} /> as any} label={`${app.label} installed`} />
                ))}
                {!(androidScanResult.installedApps || []).length && <Chip label="Chưa thấy app Facebook/Instagram" />}
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(androidScanResult.detectedAccounts || []).map((account: any) => (
                  <Chip key={`${account.type}:${account.name}`} color="success" label={`${account.platform}: ${account.name}`} />
                ))}
                {!(androidScanResult.detectedAccounts || []).length && (
                  <Typography variant="body2" color="text.secondary">
                    ADB thường chỉ đọc được app đã cài; tên account thật chỉ có khi Android AccountManager cho phép dumpsys account hiển thị.
                  </Typography>
                )}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}
      {expandedDevice && <DeviceProfileDetails device={expandedDevice} />}
    </Stack>
  );
}

function DeviceAddModule({ canAdmin }: { canAdmin: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'ANDROID_DEVICE',
    provider: 'ADB',
    externalId: '',
    profileName: '',
    adbId: '',
    deviceModel: '',
    androidVersion: '',
    notes: '',
  });
  const isAndroid = form.type === 'ANDROID_DEVICE';

  const updateForm = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;

    setForm((current) => {
      if (key === 'type' && value === 'ANDROID_DEVICE') return { ...current, type: value, provider: 'ADB' };
      if (key === 'type' && value === 'ANTIDETECT_PROFILE') return { ...current, type: value, provider: 'MOSTLOGIN' };

      return { ...current, [key]: value };
    });
  };

  const createDevice = useCallback(async () => {
    if (!canAdmin) return;

    setCreating(true);

    try {
      const response = await fetch('/api/devices/', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          provider: form.provider,
          externalId: isAndroid ? null : form.externalId || null,
          profileName: isAndroid ? null : form.profileName || null,
          adbId: isAndroid ? form.adbId || null : null,
          deviceModel: isAndroid ? form.deviceModel || null : null,
          androidVersion: isAndroid ? form.androidVersion || null : null,
          notes: form.notes || null,
        }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể tạo device');

      enqueueSnackbar('Đã tạo device');
      window.location.href = paths.dashboard.deviceDetails(body.data.id);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể tạo device', { variant: 'error' });
    } finally {
      setCreating(false);
    }
  }, [canAdmin, enqueueSnackbar, form, isAndroid]);

  return (
    <Card>
      <CardHeader title="Thêm device vận hành" />
      <CardContent>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <TextField fullWidth disabled={!canAdmin} label="Tên device" value={form.name} onChange={updateForm('name')} />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField fullWidth select disabled={!canAdmin} label="Loại device" value={form.type} onChange={updateForm('type')}>
              <MenuItem value="ANTIDETECT_PROFILE">Antidetect Browser Profile</MenuItem>
              <MenuItem value="ANDROID_DEVICE">Android ADB Device</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField fullWidth select disabled={!canAdmin} label="Provider" value={form.provider} onChange={updateForm('provider')}>
              {isAndroid ? (
                <MenuItem value="ADB">ADB</MenuItem>
              ) : (
                ['MOSTLOGIN', 'DONUT', 'NSTBROWSER', 'MANUAL'].map((provider) => (
                  <MenuItem key={provider} value={provider}>
                    {provider}
                  </MenuItem>
                ))
              )}
            </TextField>
          </Grid>
          <Grid item xs={12} md={4}>
            {isAndroid ? (
              <TextField fullWidth disabled={!canAdmin} label="ADB ID" value={form.adbId} onChange={updateForm('adbId')} />
            ) : (
              <TextField fullWidth disabled={!canAdmin} label="Profile external ID" value={form.externalId} onChange={updateForm('externalId')} />
            )}
          </Grid>
          <Grid item xs={12} md={4}>
            {isAndroid ? (
              <TextField fullWidth disabled={!canAdmin} label="Model thiết bị" value={form.deviceModel} onChange={updateForm('deviceModel')} />
            ) : (
              <TextField fullWidth disabled={!canAdmin} label="Tên profile" value={form.profileName} onChange={updateForm('profileName')} />
            )}
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField fullWidth disabled={!canAdmin || !isAndroid} label="Android version" value={form.androidVersion} onChange={updateForm('androidVersion')} />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField fullWidth disabled={!canAdmin} label="Notes" value={form.notes} onChange={updateForm('notes')} />
          </Grid>
          <Grid item xs={12} md={3}>
            <Button fullWidth size="large" variant="contained" disabled={!canAdmin || creating || !form.name} onClick={createDevice}>
              Thêm device
            </Button>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

const deviceAccountColumns: GridColDef[] = [
  { field: 'accountName', headerName: 'Social account', flex: 1, minWidth: 180 },
  { field: 'platform', headerName: 'Nền tảng', width: 130 },
  { field: 'type', headerName: 'Loại', width: 170 },
  { field: 'role', headerName: 'Role', width: 130 },
  {
    field: 'isPrimary',
    headerName: 'Primary',
    width: 110,
    renderCell: (params) => <StatusChip value={params.value ? 'PRIMARY' : 'BACKUP'} />,
  },
  { field: 'accountStatus', headerName: 'Kết nối', width: 150, renderCell: (params) => <StatusChip value={params.value} /> },
  {
    field: 'verificationStatus',
    headerName: 'Login thật',
    width: 140,
    renderCell: (params) => <StatusChip value={params.value || 'UNVERIFIED'} />,
  },
  { field: 'detectedAccountName', headerName: 'Account phát hiện', width: 170 },
  { field: 'verifiedAt', headerName: 'Verified at', width: 160 },
  { field: 'postsCount', headerName: 'Posts', width: 90 },
  { field: 'mediaCount', headerName: 'Media', width: 90 },
  { field: 'scheduledPostsCount', headerName: 'Scheduled', width: 110 },
  { field: 'failedPostsCount', headerName: 'Failed', width: 90 },
];

const healthLogColumns: GridColDef[] = [
  { field: 'status', headerName: 'Health', width: 120, renderCell: (params) => <StatusChip value={params.value} /> },
  { field: 'message', headerName: 'Message', flex: 1, minWidth: 260 },
  { field: 'metadataSummary', headerName: 'Metadata', flex: 1, minWidth: 260 },
  { field: 'checkedAt', headerName: 'Checked at', width: 160 },
];

function DeviceDetailModule({ canAdmin }: { canAdmin: boolean }) {
  const params = useParams();
  const { enqueueSnackbar } = useSnackbar();
  const deviceId = String(params?.deviceId || '');
  const [device, setDevice] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [profilePosts, setProfilePosts] = useState<any[]>([]);
  const [profileMedia, setProfileMedia] = useState<any[]>([]);
  const [profileMediaFolders, setProfileMediaFolders] = useState<any[]>([]);
  const [jobsRows, setJobsRows] = useState<any[]>([]);
  const [healthRows, setHealthRows] = useState<any[]>([]);
  const [accountPool, setAccountPool] = useState<any[]>([]);
  const [runningAction, setRunningAction] = useState('');
  const [saving, setSaving] = useState(false);
  const [attachForm, setAttachForm] = useState({ platform: 'FACEBOOK', accountId: '', role: 'BACKUP', isPrimary: false });
  const [verifyForm, setVerifyForm] = useState({
    mappingId: '',
    accountId: '',
    detectedAccountName: '',
    detectedAccountUrl: '',
    detectedAccountId: '',
    note: '',
  });
  const [createForm, setCreateForm] = useState({
    name: '',
    platform: 'FACEBOOK',
    type: 'FANPAGE',
    externalId: '',
    profileUrl: '',
    approvalRequired: true,
  });
  const [settingsForm, setSettingsForm] = useState({ name: '', profileName: '', deviceModel: '', androidVersion: '', notes: '' });
  const [profilePostForm, setProfilePostForm] = useState({
    title: '',
    caption: '',
    socialAccountId: '',
    scheduledAt: '',
  });
  const [profileMediaForm, setProfileMediaForm] = useState({
    name: '',
    provider: 'local',
    folderName: '',
    category: '',
    webViewLink: '',
  });
  const [mediaFolderForm, setMediaFolderForm] = useState({ name: '', provider: 'local', externalId: '' });
  const [assignDraftForm, setAssignDraftForm] = useState({ postId: '', socialAccountId: '' });
  const [draftPreviewOpen, setDraftPreviewOpen] = useState(false);
  const [draftEditForm, setDraftEditForm] = useState({ title: '', caption: '', socialAccountId: '' });
  const [scheduleForm, setScheduleForm] = useState({ postId: '', socialAccountId: '', scheduledAt: '' });
  const [sourceDownloadForm, setSourceDownloadForm] = useState({
    url: '',
    platform: 'auto',
    submitForApproval: false,
    titleOverride: '',
    captionOverride: '',
  });
  const [sourceDownloadResult, setSourceDownloadResult] = useState<any>(null);

  const loadDevice = useCallback(async () => {
    if (!deviceId) return;

    const response = await fetch(`/api/devices/${deviceId}/`);
    const body = await response.json();

    if (!response.ok) throw new Error(body.message || 'Không thể tải device');

    setDevice(body.data);
    setSettingsForm({
      name: body.data.name || '',
      profileName: body.data.profileName || '',
      deviceModel: body.data.deviceModel || '',
      androidVersion: body.data.androidVersion || '',
      notes: body.data.notes || '',
    });
    setCreateForm((current) => ({ ...current, name: current.name || body.data.profileName || body.data.name || '' }));
  }, [deviceId]);

  const loadDeviceRelations = useCallback(async () => {
    if (!deviceId) return;

    const accountsResponse = await fetch(`/api/devices/${deviceId}/accounts/`);
    const accountsBody = await accountsResponse.json();

    setAccounts(Array.isArray(accountsBody.data) ? accountsBody.data : []);
  }, [deviceId]);

  useEffect(() => {
    loadDevice().catch((error) => enqueueSnackbar(error.message, { variant: 'error' }));
    loadDeviceRelations().catch(() => undefined);
  }, [enqueueSnackbar, loadDevice, loadDeviceRelations]);

  useEffect(() => {
    const firstAccount = accountPool.find((account) => account.platformCode === attachForm.platform) || accountPool[0];

    if (!attachForm.accountId && firstAccount?.id) {
      setAttachForm((current) => ({ ...current, platform: firstAccount.platformCode || current.platform, accountId: firstAccount.id }));
    }
  }, [accountPool, attachForm.accountId, attachForm.platform]);

  useEffect(() => {
    if (!verifyForm.mappingId && accounts[0]?.mappingId) {
      setVerifyForm((current) => ({
        ...current,
        mappingId: accounts[0].mappingId,
        accountId: accounts[0].accountId,
        detectedAccountName: current.detectedAccountName || accounts[0].accountName || '',
      }));
    }
  }, [accounts, verifyForm.mappingId]);

  const runDeviceAction = useCallback(
    async (action: 'health-check' | 'open' | 'close') => {
      if (!deviceId) return;

      setRunningAction(action);

      try {
        const response = await fetch(`/api/devices/${deviceId}/${action}/`, {
          method: 'POST',
          headers: authJsonHeaders(),
        });
        const body = await response.json();

        if (!response.ok) throw new Error(body.message || 'Không thể chạy action device');
        if (body.data) setDevice(body.data);

        enqueueSnackbar(body.result?.message || 'Đã chạy action device');
        loadDeviceRelations().catch(() => undefined);
      } catch (error) {
        enqueueSnackbar(error instanceof Error ? error.message : 'Không thể chạy action device', { variant: 'error' });
      } finally {
        setRunningAction('');
      }
    },
    [deviceId, enqueueSnackbar, loadDeviceRelations]
  );

  const verifiedAccounts = useMemo(
    () => accounts.filter((account) => account.verificationStatus === 'VERIFIED'),
    [accounts]
  );

  const attachAccountPool = useMemo(
    () => accountPool.filter((account) => account.platformCode === attachForm.platform),
    [accountPool, attachForm.platform]
  );

  const scheduledPosts = useMemo(
    () => profilePosts.filter((post) => post.scheduledAt || post.status === 'SCHEDULED'),
    [profilePosts]
  );

  const draftPosts = useMemo(
    () => profilePosts.filter((post) => ['DRAFT', 'WAITING_APPROVAL', 'APPROVED', 'FAILED', 'CANCELLED'].includes(post.status)),
    [profilePosts]
  );

  const selectedDraft = useMemo(
    () => profilePosts.find((post) => post.id === assignDraftForm.postId),
    [assignDraftForm.postId, profilePosts]
  );

  const devicePostColumns = useMemo<GridColDef[]>(
    () => [
      { field: 'title', headerName: 'Bài viết', flex: 1, minWidth: 260 },
      { field: 'accounts', headerName: 'Social', width: 180 },
      { field: 'scheduledAt', headerName: 'Lịch đăng', width: 170 },
      { field: 'mediaCount', headerName: 'Media', width: 90 },
      {
        field: 'status',
        headerName: 'Trạng thái',
        width: 140,
        renderCell: (params) => <StatusChip value={params.value} />,
      },
      {
        field: 'actions',
        headerName: '',
        width: 180,
        sortable: false,
        filterable: false,
        renderCell: (params) => (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Chọn bài">
              <IconButton
                size="small"
                onClick={() => {
                  setAssignDraftForm((current) => ({ ...current, postId: params.row.id }));
                  setScheduleForm((current) => ({ ...current, postId: params.row.id }));
                }}
              >
                <Iconify icon="solar:check-circle-bold" width={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Xem nháp">
              <IconButton
                size="small"
                onClick={() => {
                  setAssignDraftForm((current) => ({ ...current, postId: params.row.id }));
                  setScheduleForm((current) => ({ ...current, postId: params.row.id }));
                  setDraftPreviewOpen(true);
                }}
              >
                <Iconify icon="solar:eye-bold" width={18} />
              </IconButton>
            </Tooltip>
          </Stack>
        ),
      },
    ],
    []
  );
  const compactJobColumns = useMemo<GridColDef[]>(
    () => [
      { field: 'type', headerName: 'Job', flex: 1, minWidth: 160 },
      { field: 'status', headerName: 'Trạng thái', width: 120, renderCell: (params) => <StatusChip value={params.value} /> },
      { field: 'scheduledAt', headerName: 'Thời gian', width: 150 },
    ],
    []
  );
  const compactHealthColumns = useMemo<GridColDef[]>(
    () => [
      { field: 'status', headerName: 'Health', width: 110, renderCell: (params) => <StatusChip value={params.value} /> },
      { field: 'message', headerName: 'Message', flex: 1, minWidth: 220 },
      { field: 'checkedAt', headerName: 'Checked', width: 150 },
    ],
    []
  );

  useEffect(() => {
    const firstVerifiedAccount = verifiedAccounts[0];

    if (!firstVerifiedAccount?.accountId) return;

    setProfilePostForm((current) =>
      current.socialAccountId ? current : { ...current, socialAccountId: firstVerifiedAccount.accountId }
    );
    setAssignDraftForm((current) =>
      current.socialAccountId ? current : { ...current, socialAccountId: firstVerifiedAccount.accountId }
    );
    setScheduleForm((current) =>
      current.socialAccountId ? current : { ...current, socialAccountId: firstVerifiedAccount.accountId }
    );
  }, [verifiedAccounts]);

  useEffect(() => {
    const firstDraftPost = draftPosts[0];

    if (!firstDraftPost?.id) return;

    setAssignDraftForm((current) => (current.postId ? current : { ...current, postId: firstDraftPost.id }));
  }, [draftPosts]);

  useEffect(() => {
    if (!selectedDraft) return;

    setDraftEditForm({
      title: selectedDraft.title || '',
      caption: selectedDraft.caption || '',
      socialAccountId: selectedDraft.socialAccountId || assignDraftForm.socialAccountId || '',
    });
  }, [assignDraftForm.socialAccountId, selectedDraft]);

  const createProfilePost = useCallback(async () => {
    if (!canAdmin || !deviceId) return;

    try {
      const response = await fetch(`/api/devices/${deviceId}/posts/`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          title: profilePostForm.title,
          caption: profilePostForm.caption,
          socialAccountId: profilePostForm.socialAccountId || null,
          scheduledAt: profilePostForm.scheduledAt || null,
          submitForApproval: false,
        }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể tạo bài trong profile');

      setProfilePosts((current) => [body.data, ...current]);
      setProfilePostForm({ title: '', caption: '', socialAccountId: '', scheduledAt: '' });
      enqueueSnackbar('Đã lưu draft trong profile');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể tạo bài trong profile', { variant: 'error' });
    }
  }, [canAdmin, deviceId, enqueueSnackbar, profilePostForm]);

  const createPostFromSource = useCallback(async () => {
    if (!canAdmin || !deviceId) return;

    setRunningAction('source-download');
    setSourceDownloadResult(null);

    try {
      const response = await fetch(`/api/devices/${deviceId}/source-downloads/`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          url: sourceDownloadForm.url,
          platform: sourceDownloadForm.platform,
          submitForApproval: sourceDownloadForm.submitForApproval,
          titleOverride: sourceDownloadForm.titleOverride || null,
          captionOverride: sourceDownloadForm.captionOverride || null,
        }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể tải nguồn và tạo draft');

      setSourceDownloadResult(body.data);
      setSourceDownloadForm({ url: '', platform: 'auto', submitForApproval: false, titleOverride: '', captionOverride: '' });
      await loadDeviceRelations();
      enqueueSnackbar('Đã tải nguồn và tạo bài nháp');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể tải nguồn và tạo draft', { variant: 'error' });
    } finally {
      setRunningAction('');
    }
  }, [canAdmin, deviceId, enqueueSnackbar, loadDeviceRelations, sourceDownloadForm]);

  const createProfileMedia = useCallback(async () => {
    if (!canAdmin || !deviceId) return;

    try {
      const response = await fetch(`/api/devices/${deviceId}/media/`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          name: profileMediaForm.name,
          mimeType: 'image/jpeg',
          provider: profileMediaForm.provider,
          folderName: profileMediaForm.folderName || null,
          category: profileMediaForm.category || null,
          webViewLink: profileMediaForm.webViewLink || null,
        }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể thêm media trong profile');

      setProfileMedia((current) => [body.data, ...current]);
      setProfileMediaForm({ name: '', provider: 'local', folderName: '', category: '', webViewLink: '' });
      enqueueSnackbar('Đã thêm media vào profile');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể thêm media trong profile', { variant: 'error' });
    }
  }, [canAdmin, deviceId, enqueueSnackbar, profileMediaForm]);

  const createMediaFolder = useCallback(async () => {
    if (!canAdmin || !deviceId) return;

    try {
      const response = await fetch(`/api/devices/${deviceId}/media-folders/`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          name: mediaFolderForm.name,
          provider: mediaFolderForm.provider,
          externalId: mediaFolderForm.externalId || null,
        }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể thêm thư mục media');

      setProfileMediaFolders((current) => [body.data, ...current]);
      setMediaFolderForm({ name: '', provider: 'local', externalId: '' });
      enqueueSnackbar('Đã thêm thư mục media vào profile');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể thêm thư mục media', { variant: 'error' });
    }
  }, [canAdmin, deviceId, enqueueSnackbar, mediaFolderForm]);

  const scheduleProfilePost = useCallback(async () => {
    if (!canAdmin || !deviceId) return;

    try {
      const response = await fetch(`/api/devices/${deviceId}/posts/${scheduleForm.postId}/`, {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          socialAccountId: scheduleForm.socialAccountId,
          scheduledAt: scheduleForm.scheduledAt,
          status: 'SCHEDULED',
        }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể lên lịch bài viết');

      setProfilePosts((current) => current.map((post) => (post.id === body.data.id ? body.data : post)));
      setScheduleForm({ postId: '', socialAccountId: '', scheduledAt: '' });
      enqueueSnackbar('Đã lên lịch bài viết');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể lên lịch bài viết', { variant: 'error' });
    }
  }, [canAdmin, deviceId, enqueueSnackbar, scheduleForm]);

  const assignDraftToSocialAccount = useCallback(async () => {
    if (!canAdmin || !deviceId) return;

    try {
      const response = await fetch(`/api/devices/${deviceId}/posts/${assignDraftForm.postId}/`, {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify({ socialAccountId: assignDraftForm.socialAccountId }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể gán bài nháp cho Social Account');

      setProfilePosts((current) => current.map((post) => (post.id === body.data.id ? body.data : post)));
      setAssignDraftForm({ postId: '', socialAccountId: '' });
      enqueueSnackbar('Đã gán bài nháp cho Social Account');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể gán bài nháp cho Social Account', { variant: 'error' });
    }
  }, [assignDraftForm, canAdmin, deviceId, enqueueSnackbar]);

  const saveDraftPreview = useCallback(async () => {
    if (!canAdmin || !deviceId || !assignDraftForm.postId) return;

    try {
      const response = await fetch(`/api/devices/${deviceId}/posts/${assignDraftForm.postId}/`, {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          title: draftEditForm.title,
          caption: draftEditForm.caption,
          socialAccountId: draftEditForm.socialAccountId || null,
        }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể lưu bài nháp');

      setProfilePosts((current) => current.map((post) => (post.id === body.data.id ? body.data : post)));
      setAssignDraftForm((current) => ({ ...current, socialAccountId: body.data.socialAccountId || current.socialAccountId }));
      enqueueSnackbar('Đã lưu bài nháp');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể lưu bài nháp', { variant: 'error' });
    }
  }, [assignDraftForm.postId, canAdmin, deviceId, draftEditForm, enqueueSnackbar]);

  const translateDraftPreview = useCallback(async () => {
    if (!canAdmin || !deviceId || !assignDraftForm.postId) return;

    setRunningAction('translate-draft');

    try {
      const response = await fetch(`/api/devices/${deviceId}/posts/${assignDraftForm.postId}/translate/`, {
        method: 'POST',
        headers: authJsonHeaders(),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể Việt hóa bài nháp');

      setProfilePosts((current) => current.map((post) => (post.id === body.data.id ? body.data : post)));
      setDraftEditForm((current) => ({ ...current, title: body.data.title, caption: body.data.caption }));
      enqueueSnackbar('Đã Việt hóa bài nháp');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể Việt hóa bài nháp', { variant: 'error' });
    } finally {
      setRunningAction('');
    }
  }, [assignDraftForm.postId, canAdmin, deviceId, enqueueSnackbar]);

  const publishDraftNow = useCallback(async () => {
    if (!canAdmin || !deviceId || !assignDraftForm.postId) return;

    const socialAccountId = draftEditForm.socialAccountId || assignDraftForm.socialAccountId;

    if (!socialAccountId) {
      enqueueSnackbar('Cần chọn Social Account đã verify trước khi đăng ngay', { variant: 'warning' });
      return;
    }

    try {
      const response = await fetch(`/api/devices/${deviceId}/posts/${assignDraftForm.postId}/publish-now/`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ socialAccountId }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể đăng ngay bài nháp');

      setProfilePosts((current) => current.map((post) => (post.id === body.data.id ? body.data : post)));
      setDraftPreviewOpen(false);
      setAssignDraftForm({ postId: '', socialAccountId });
      enqueueSnackbar(body.message || 'Đã đưa bài vào hàng đợi đăng ngay');
      loadDeviceRelations().catch(() => undefined);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể đăng ngay bài nháp', { variant: 'error' });
    }
  }, [assignDraftForm, canAdmin, deviceId, draftEditForm.socialAccountId, enqueueSnackbar, loadDeviceRelations]);

  const attachAccount = useCallback(async () => {
    if (!canAdmin || !deviceId) return;

    try {
      const response = await fetch(`/api/devices/${deviceId}/accounts/`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ ...attachForm, action: 'attach_existing' }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể khai báo Social Account đăng nhập');

      setAccounts((current) => [body.data, ...current.filter((row) => row.mappingId !== body.data.mappingId)]);
      enqueueSnackbar('Đã khai báo Social Account đăng nhập trong profile');
      loadDevice().catch(() => undefined);
      loadDeviceRelations().catch(() => undefined);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể khai báo Social Account đăng nhập', { variant: 'error' });
    }
  }, [attachForm, canAdmin, deviceId, enqueueSnackbar, loadDevice, loadDeviceRelations]);

  const createAccountOnDevice = useCallback(async () => {
    if (!canAdmin || !deviceId) return;

    try {
      const response = await fetch(`/api/devices/${deviceId}/accounts/`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          ...createForm,
          action: 'create_account',
          externalId: createForm.externalId || null,
          profileUrl: createForm.profileUrl || null,
        }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể tạo account trên device');

      setAccounts((current) => [body.data, ...current]);
      setCreateForm({
        name: device?.profileName || device?.name || '',
        platform: 'FACEBOOK',
        type: 'FANPAGE',
        externalId: '',
        profileUrl: '',
        approvalRequired: true,
      });
      enqueueSnackbar('Đã tạo account và gắn primary device');
      loadDevice().catch(() => undefined);
      loadDeviceRelations().catch(() => undefined);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể tạo account trên device', { variant: 'error' });
    }
  }, [canAdmin, createForm, device, deviceId, enqueueSnackbar, loadDevice, loadDeviceRelations]);

  const verifyLoginManual = useCallback(async () => {
    if (!canAdmin || !verifyForm.mappingId || !verifyForm.accountId) return;

    try {
      const response = await fetch(
        `/api/accounts/${verifyForm.accountId}/devices/${verifyForm.mappingId}/verify-manual/`,
        {
          method: 'POST',
          headers: authJsonHeaders(),
          body: JSON.stringify({
            detectedAccountName: verifyForm.detectedAccountName,
            detectedAccountUrl: verifyForm.detectedAccountUrl || null,
            detectedAccountId: verifyForm.detectedAccountId || null,
            note: verifyForm.note || null,
          }),
        }
      );
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể xác minh login');

      setAccounts((current) =>
        current.map((row) =>
          row.mappingId === verifyForm.mappingId
            ? {
                ...row,
                verificationStatus: 'VERIFIED',
                detectedAccountName: body.data.detectedAccountName,
                detectedAccountUrl: body.data.detectedAccountUrl,
                verifiedAt: body.data.verifiedAt,
              }
            : row
        )
      );
      enqueueSnackbar('Đã xác minh tài khoản đang đăng nhập trong profile');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể xác minh login', { variant: 'error' });
    }
  }, [canAdmin, enqueueSnackbar, verifyForm]);

  const verifyLoginDirect = useCallback(async () => {
    if (!canAdmin || !deviceId || !verifyForm.mappingId) return;

    setRunningAction('verify-login');

    try {
      const response = await fetch(`/api/devices/${deviceId}/verify-login/`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify({ mappingId: verifyForm.mappingId }),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể verify trực tiếp từ profile');

      setAccounts((current) =>
        current.map((row) =>
          row.mappingId === verifyForm.mappingId
            ? {
                ...row,
                verificationStatus: body.data.verificationStatus,
                detectedAccountName: body.data.detectedAccountName,
                detectedAccountUrl: body.data.detectedAccountUrl,
                verifiedAt: body.data.verifiedAt,
                lastVerificationError: body.data.lastVerificationError,
              }
            : row
        )
      );
      setVerifyForm((current) => ({
        ...current,
        detectedAccountName: body.data.detectedAccountName || current.detectedAccountName,
        detectedAccountUrl: body.data.detectedAccountUrl || current.detectedAccountUrl,
      }));
      enqueueSnackbar(body.result?.message || 'Đã verify trực tiếp từ profile');
      loadDeviceRelations().catch(() => undefined);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể verify trực tiếp từ profile', { variant: 'error' });
    } finally {
      setRunningAction('');
    }
  }, [canAdmin, deviceId, enqueueSnackbar, loadDeviceRelations, verifyForm.mappingId]);

  const saveDeviceSettings = useCallback(async () => {
    if (!canAdmin || !deviceId) return;

    setSaving(true);

    try {
      const response = await fetch(`/api/devices/${deviceId}/`, {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify(settingsForm),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể lưu device');

      setDevice(body.data);
      enqueueSnackbar('Đã lưu device');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể lưu device', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [canAdmin, deviceId, enqueueSnackbar, settingsForm]);

  const runStateAction = useCallback(
    async (action: 'activate' | 'deactivate' | 'lock' | 'unlock') => {
      if (!canAdmin || !deviceId) return;

      setRunningAction(action);

      try {
        const response = await fetch(`/api/devices/${deviceId}/state/`, {
          method: 'POST',
          headers: authJsonHeaders(),
          body: JSON.stringify({ action, reason: action === 'lock' ? 'Khóa từ device detail' : undefined }),
        });
        const body = await response.json();

        if (!response.ok) throw new Error(body.message || 'Không thể cập nhật trạng thái device');
        if (body.data) setDevice(body.data);

        enqueueSnackbar('Đã cập nhật trạng thái device');
      } catch (error) {
        enqueueSnackbar(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái device', { variant: 'error' });
      } finally {
        setRunningAction('');
      }
    },
    [canAdmin, deviceId, enqueueSnackbar]
  );

  const deleteDevice = useCallback(async () => {
    if (!canAdmin || !deviceId) return;

    setRunningAction('delete');

    try {
      const response = await fetch(`/api/devices/${deviceId}/`, {
        method: 'DELETE',
        headers: authJsonHeaders(),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể xóa device');

      enqueueSnackbar('Đã xóa device');
      window.location.href = paths.dashboard.devices;
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể xóa device', { variant: 'error' });
    } finally {
      setRunningAction('');
    }
  }, [canAdmin, deviceId, enqueueSnackbar]);

  if (!device) {
    return (
      <Card>
        <CardContent>
          <Typography color="text.secondary">Đang tải device...</Typography>
        </CardContent>
      </Card>
    );
  }

  const profile = device.metadata?.profile || {};
  const deviceLocked = Boolean(device.locked);
  const deviceInactive = device.status === 'INACTIVE';
  const deviceOnline = device.onlineStatus === 'ONLINE';
  const deviceOffline = device.onlineStatus === 'OFFLINE';
  const liveActionDisabled = !canAdmin || !!runningAction || deviceLocked || deviceInactive || deviceOffline;
  const iconButtonSx = {
    width: 44,
    height: 44,
    borderRadius: 1,
    border: (theme: any) => `1px solid ${theme.palette.divider}`,
  };
  const deviceStatusItems = [
    {
      icon: device.provider === 'MOSTLOGIN' ? 'solar:monitor-bold' : 'solar:devices-bold',
      label: device.provider,
      color: 'default',
    },
    {
      icon: device.typeCode === 'ANDROID_DEVICE' ? 'solar:smartphone-bold' : 'solar:window-frame-bold',
      label: device.type,
      color: 'default',
    },
    {
      icon: deviceOnline ? 'solar:wifi-router-bold' : 'solar:wifi-router-minimalistic-bold',
      label: `Kết nối: ${device.onlineStatus || 'UNKNOWN'}`,
      color: deviceOnline ? 'success' : 'warning',
    },
    {
      icon: device.healthStatus === 'OK' ? 'solar:heart-pulse-bold' : 'solar:shield-warning-bold',
      label: `Health: ${device.healthStatus || 'UNKNOWN'}`,
      color: device.healthStatus === 'OK' ? 'success' : 'default',
    },
    {
      icon: device.status === 'ACTIVE' ? 'solar:play-circle-bold' : 'solar:pause-circle-bold',
      label: `Status: ${device.status || 'UNKNOWN'}`,
      color: device.status === 'ACTIVE' ? 'success' : 'warning',
    },
    ...(deviceLocked
      ? [{ icon: 'solar:lock-keyhole-bold', label: 'Đang khóa', color: 'error' }]
      : []),
  ];

  const scanAndroidLoginsFromDetail = async () => {
    if (!canAdmin || !deviceId) return;

    setRunningAction('scan-social-logins');

    try {
      const response = await fetch(`/api/devices/${deviceId}/scan-social-logins/`, {
        method: 'POST',
        headers: authJsonHeaders(),
      });
      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Không thể quét social login trên Android');

      const capturedCount = (body.data?.thumbnailResults || []).filter((item: any) => item.thumbnail?.captured).length;
      const skippedCount = (body.data?.thumbnailResults || []).length - capturedCount;

      enqueueSnackbar(
        capturedCount
          ? `Đã quét social login và lưu ${capturedCount} thumbnail trang cá nhân`
          : `${body.data?.message || 'Đã quét social login trên Android'}${skippedCount ? ' · Chưa lưu thumbnail vì màn hình chưa đúng profile/fanpage' : ''}`
      );
      await Promise.all([loadDevice(), loadDeviceRelations()]);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể quét social login trên Android', { variant: 'error' });
    } finally {
      setRunningAction('');
    }
  };

  if (device.typeCode === 'ANDROID_DEVICE' || device.type === 'Android ADB') {
    const androidMetadata = device.metadata?.lastAndroidSocialScan || {};
    const pageAccounts = accounts.filter((account) => account.type === 'FANPAGE');
    const profileAccounts = accounts.filter((account) => account.type !== 'FANPAGE');
    const renderAccountGroup = (title: string, groupAccounts: any[], emptyText: string) => (
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle1">{title}</Typography>
          <Chip size="small" label={groupAccounts.length} />
        </Stack>
        <Grid container spacing={1.25}>
          {groupAccounts.map((account) => (
            <Grid key={account.mappingId} item xs={12} sm={6} md={4} lg={3}>
              <Card
                component={NextLink}
                href={`${paths.dashboard.accounts}/${account.accountId}`}
                variant="outlined"
                sx={{
                  height: '100%',
                  maxWidth: 320,
                  display: 'block',
                  color: 'inherit',
                  textDecoration: 'none',
                  transition: (theme) => theme.transitions.create(['box-shadow', 'transform'], { duration: theme.transitions.duration.shorter }),
                  '&:hover': {
                    boxShadow: 6,
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <Box
                  sx={{
                    aspectRatio: '16 / 9',
                    bgcolor: 'grey.950',
                    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {account.avatarUrl ? (
                    <Box
                      component="img"
                      src={account.avatarUrl}
                      alt={account.accountName}
                      loading="lazy"
                      decoding="async"
                      sx={{
                        width: 1,
                        height: 1,
                        objectFit: 'cover',
                        objectPosition: 'top center',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <Stack alignItems="center" justifyContent="center" spacing={0.75} sx={{ height: 1, px: 1, textAlign: 'center', color: 'common.white' }}>
                      <Iconify icon={socialPlatformIcon(account.platformCode)} width={28} />
                      <Typography variant="caption" noWrap sx={{ maxWidth: 1, fontWeight: 700 }}>
                        {account.detectedAccountName || account.accountName}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'grey.500', fontSize: 10, lineHeight: 1.25 }}>
                        {account.lastVerificationError || 'Chưa có ảnh'}
                      </Typography>
                    </Stack>
                  )}
                  <Tooltip title={account.platform} arrow>
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        width: 26,
                        height: 26,
                        borderRadius: 0.75,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: 'background.paper',
                        boxShadow: 1,
                      }}
                    >
                      <Iconify icon={socialPlatformIcon(account.platformCode)} width={17} />
                    </Box>
                  </Tooltip>
                </Box>
                <CardContent sx={{ p: 1.1 }}>
                  <Stack spacing={0.8}>
                    <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {account.detectedAccountName || account.accountName}
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      <Chip size="small" color={account.verificationStatus === 'VERIFIED' ? 'success' : 'default'} label={account.verificationStatus || 'UNVERIFIED'} sx={{ height: 23, fontSize: 11 }} />
                      <Chip size="small" label={`${account.postsCount || 0} bài`} sx={{ height: 23, fontSize: 11 }} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>
                      {account.profileUrl || account.detectedAccountId || account.accountId}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
          {!groupAccounts.length && (
            <Grid item xs={12}>
              <Box sx={{ p: 2, borderRadius: 1, bgcolor: 'background.neutral', textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {emptyText}
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </Stack>
    );
    const compactAccountColumns: GridColDef[] = [
      { field: 'accountName', headerName: 'Social account', flex: 1, minWidth: 180 },
      { field: 'platform', headerName: 'Nền tảng', width: 130 },
      { field: 'verificationStatus', headerName: 'Login', width: 130, renderCell: (params) => <StatusChip value={params.value || 'UNVERIFIED'} /> },
      { field: 'verifiedAt', headerName: 'Verified', width: 150 },
    ];

    return (
      <Stack spacing={3}>
        <Card sx={{ borderRadius: 2 }}>
          <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ md: 'center' }} justifyContent="space-between">
              <Stack spacing={1.5}>
                <Typography variant="h3">{device.name}</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip icon={<Iconify icon="solar:smartphone-bold" width={18} /> as any} label="ADB" color="default" sx={{ borderRadius: 1, height: 44, px: 1 }} />
                  <Tooltip title={device.type} arrow>
                    <Chip icon={<Iconify icon="solar:sim-card-bold" width={18} /> as any} label="" sx={{ borderRadius: 1, width: 44, height: 44 }} />
                  </Tooltip>
                  <Tooltip title={`Health: ${device.healthStatus || 'UNKNOWN'}`} arrow>
                    <Chip color={device.healthStatus === 'OK' ? 'success' : 'warning'} icon={<Iconify icon="solar:heart-pulse-bold" width={18} /> as any} label="" sx={{ borderRadius: 1, width: 44, height: 44 }} />
                  </Tooltip>
                  <Tooltip title={`Kết nối: ${device.onlineStatus || 'UNKNOWN'}`} arrow>
                    <Chip color={deviceOnline ? 'success' : 'warning'} icon={<Iconify icon={deviceOnline ? 'solar:wifi-router-bold' : 'solar:wifi-router-minimalistic-bold'} width={18} /> as any} label="" sx={{ borderRadius: 1, width: 44, height: 44 }} />
                  </Tooltip>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {device.externalId || device.adbId} · Last seen: {device.lastSeenAt || 'Chưa có'}
                </Typography>
                {deviceOffline && (
                  <Typography variant="body2" color="warning.main">
                    Device đang offline. Vẫn có thể quản lý account, media, bài nháp và lịch đăng; chỉ các thao tác live cần thiết bị online.
                  </Typography>
                )}
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={`Model: ${device.deviceModel || '-'}`} />
                  <Chip size="small" label={`Android: ${device.androidVersion || '-'}`} />
                  <Chip size="small" label={`${accounts.length} social`} icon={<Iconify icon="solar:users-group-rounded-bold" width={16} /> as any} />
                </Stack>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ md: 'flex-end' }}>
                <Tooltip title="Health check" arrow><span><IconButton disabled={!canAdmin || !!runningAction} sx={iconButtonSx} onClick={() => runDeviceAction('health-check')}><Iconify icon="solar:heart-pulse-bold" width={22} /></IconButton></span></Tooltip>
                <Tooltip title={deviceOffline ? 'Device offline, chưa thể wake qua ADB' : 'Wake device'} arrow><span><IconButton disabled={liveActionDisabled} sx={iconButtonSx} onClick={() => runDeviceAction('open')}><Iconify icon="solar:play-bold" width={22} /></IconButton></span></Tooltip>
                <Tooltip title={deviceOffline ? 'Device offline, chưa thể sleep qua ADB' : 'Sleep device'} arrow><span><IconButton disabled={liveActionDisabled} sx={iconButtonSx} onClick={() => runDeviceAction('close')}><Iconify icon="solar:stop-bold" width={22} /></IconButton></span></Tooltip>
                <Tooltip title={deviceOffline ? 'Device offline, chưa thể quét social login' : 'Quét social login'} arrow><span><IconButton disabled={liveActionDisabled} sx={iconButtonSx} onClick={scanAndroidLoginsFromDetail}><Iconify icon="solar:user-check-bold" width={22} /></IconButton></span></Tooltip>
                <Tooltip title="Kích hoạt" arrow><span><IconButton disabled={!canAdmin || !!runningAction || deviceLocked} sx={iconButtonSx} onClick={() => runStateAction('activate')}><Iconify icon="solar:check-circle-bold" width={22} /></IconButton></span></Tooltip>
                <Tooltip title="Ngưng kích hoạt" arrow><span><IconButton disabled={!canAdmin || !!runningAction} sx={iconButtonSx} onClick={() => runStateAction('deactivate')}><Iconify icon="solar:pause-circle-bold" width={22} /></IconButton></span></Tooltip>
                <Tooltip title="Khóa" arrow><span><IconButton color="warning" disabled={!canAdmin || !!runningAction || deviceLocked} sx={iconButtonSx} onClick={() => runStateAction('lock')}><Iconify icon="solar:lock-keyhole-bold" width={22} /></IconButton></span></Tooltip>
                <Tooltip title="Mở khóa" arrow><span><IconButton disabled={!canAdmin || !!runningAction || !deviceLocked} sx={iconButtonSx} onClick={() => runStateAction('unlock')}><Iconify icon="solar:lock-keyhole-unlocked-bold" width={22} /></IconButton></span></Tooltip>
                <Tooltip title="Xóa device" arrow><span><IconButton color="error" disabled={!canAdmin || !!runningAction} sx={iconButtonSx} onClick={deleteDevice}><Iconify icon="solar:trash-bin-trash-bold" width={22} /></IconButton></span></Tooltip>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardHeader
                title="Social account đã phát hiện"
                subheader={`${accounts.length} account · ${(androidMetadata.installedApps || []).length} app social`}
                action={<Button size="small" variant="outlined" onClick={scanAndroidLoginsFromDetail} disabled={!canAdmin || !!runningAction}>Quét lại</Button>}
              />
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {(androidMetadata.installedApps || []).map((app: any) => (
                      <Chip key={app.packageName} icon={<Iconify icon={socialPlatformIcon(app.platform)} width={16} /> as any} label={app.label} />
                    ))}
                    {!(androidMetadata.installedApps || []).length && <Chip label="Chưa có dữ liệu app social" />}
                  </Stack>
                  {accounts.length ? (
                    <Stack spacing={1.75}>
                      {renderAccountGroup('Page', pageAccounts, 'Chưa phát hiện Page trên Android device này.')}
                      {renderAccountGroup('Profile cá nhân', profileAccounts, 'Chưa phát hiện profile cá nhân trên Android device này.')}
                    </Stack>
                  ) : (
                    <Box sx={{ p: 3, borderRadius: 1, bgcolor: 'background.neutral', textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Chưa phát hiện Social Account trên Android device này.
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
            <Stack spacing={1}>
              <Typography variant="h4">{device.name}</Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap">
                {deviceStatusItems.map((item) => (
                  <Tooltip key={item.label} title={item.label} arrow>
                    <Chip
                      size="small"
                      color={item.color as any}
                      icon={<Iconify icon={item.icon} width={16} /> as any}
                      label={item.label === device.provider ? device.provider : ''}
                      sx={{
                        height: 34,
                        minWidth: item.label === device.provider ? 88 : 34,
                        borderRadius: 1,
                        '& .MuiChip-label': { px: item.label === device.provider ? 1 : 0 },
                        '& .MuiChip-icon': { mx: item.label === device.provider ? 0.75 : 0 },
                      }}
                    />
                  </Tooltip>
                ))}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {device.profileName || device.externalId} · Last seen: {device.lastSeenAt || 'Chưa có'}
              </Typography>
              {deviceLocked && (
                <Typography variant="body2" color="error.main">
                  Device đang bị khóa{device.lockedReason ? `: ${device.lockedReason}` : ''}
                </Typography>
              )}
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ md: 'flex-end' }}>
              <Tooltip title="Health check" arrow>
                <span>
                  <IconButton disabled={!canAdmin || !!runningAction} sx={iconButtonSx} onClick={() => runDeviceAction('health-check')}>
                    <Iconify icon="solar:heart-pulse-bold" width={22} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Open profile" arrow>
                <span>
                  <IconButton disabled={!canAdmin || !!runningAction || deviceLocked || deviceInactive} sx={iconButtonSx} onClick={() => runDeviceAction('open')}>
                    <Iconify icon="solar:play-bold" width={22} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Close profile" arrow>
                <span>
                  <IconButton disabled={!canAdmin || !!runningAction} sx={iconButtonSx} onClick={() => runDeviceAction('close')}>
                    <Iconify icon="solar:stop-bold" width={22} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Kích hoạt" arrow>
                <span>
                  <IconButton disabled={!canAdmin || !!runningAction || deviceLocked} sx={iconButtonSx} onClick={() => runStateAction('activate')}>
                    <Iconify icon="solar:check-circle-bold" width={22} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Ngưng kích hoạt" arrow>
                <span>
                  <IconButton disabled={!canAdmin || !!runningAction} sx={iconButtonSx} onClick={() => runStateAction('deactivate')}>
                    <Iconify icon="solar:pause-circle-bold" width={22} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Khóa" arrow>
                <span>
                  <IconButton color="warning" disabled={!canAdmin || !!runningAction || deviceLocked} sx={iconButtonSx} onClick={() => runStateAction('lock')}>
                    <Iconify icon="solar:lock-keyhole-bold" width={22} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Mở khóa" arrow>
                <span>
                  <IconButton disabled={!canAdmin || !!runningAction || !deviceLocked} sx={iconButtonSx} onClick={() => runStateAction('unlock')}>
                    <Iconify icon="solar:lock-keyhole-unlocked-bold" width={22} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Xóa device" arrow>
                <span>
                  <IconButton color="error" disabled={!canAdmin || !!runningAction} sx={iconButtonSx} onClick={deleteDevice}>
                    <Iconify icon="solar:trash-bin-trash-bold" width={22} />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={5}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="h6">Tổng quan profile</Typography>
                  <Stack direction="row" spacing={0.75}>
                    <Tooltip title="Social Account verified" arrow>
                      <Chip size="small" icon={<Iconify icon="solar:users-group-rounded-bold" width={16} /> as any} label={device.accountsCount || 0} />
                    </Tooltip>
                    <Tooltip title="Primary login" arrow>
                      <Chip size="small" icon={<Iconify icon="solar:shield-check-bold" width={16} /> as any} label={device.primaryAccountsCount || 0} />
                    </Tooltip>
                    <Tooltip title={`Health: ${device.healthStatus || 'UNKNOWN'}`} arrow>
                      <Chip size="small" color={device.healthStatus === 'OK' ? 'success' : 'warning'} label={device.healthStatus || 'UNKNOWN'} />
                    </Tooltip>
                  </Stack>
                </Stack>
                <Grid container spacing={1.5}>
                  {[
                    ['Profile', device.profileName || '-'],
                    ['External/ADB', device.externalId || device.adbId || '-'],
                    ['Proxy/IP', device.proxySummary || '-'],
                    ['OS/Product', [profile.os, profile.product, profile.coreVersion].filter(Boolean).join(' · ') || '-'],
                  ].map(([label, value]) => (
                    <Grid key={label} item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">
                        {label}
                      </Typography>
                      <Typography variant="body2" noWrap>
                        {value}
                      </Typography>
                    </Grid>
                  ))}
                </Grid>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={7}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
                  <Typography variant="h6" sx={{ flex: 1 }}>
                    Social Account trong profile
                  </Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {accounts.map((account) => (
                      <Tooltip
                        key={account.mappingId}
                        title={`${account.detectedAccountName || account.accountName} · ${account.platform} · ${account.verificationStatus}`}
                        arrow
                      >
                        <Chip
                          size="small"
                          icon={<Iconify icon={socialPlatformIcon(account.platformCode)} width={16} /> as any}
                          label={account.detectedAccountName || account.accountName}
                          color={account.verificationStatus === 'VERIFIED' ? 'success' : 'default'}
                        />
                      </Tooltip>
                    ))}
                    {!accounts.length && <Chip size="small" label="Chưa khai báo" />}
                  </Stack>
                </Stack>
                <Grid container spacing={1.5} alignItems="center">
                  <Grid item xs={12} md={2.5}>
                  <TextField
                    fullWidth
                    size="small"
                    select
                    disabled={!canAdmin || deviceLocked}
                    label="Nền tảng"
                    value={attachForm.platform}
                    onChange={(event) => {
                      const nextPlatform = event.target.value;
                      const nextAccount = accountPool.find((account) => account.platformCode === nextPlatform);

                      setAttachForm((current) => ({
                        ...current,
                        platform: nextPlatform,
                        accountId: nextAccount?.id || '',
                      }));
                    }}
                  >
                    <MenuItem value="FACEBOOK">Facebook</MenuItem>
                    <MenuItem value="INSTAGRAM">Instagram</MenuItem>
                  </TextField>
                  </Grid>
                  <Grid item xs={12} md={3.5}>
                  <TextField
                    fullWidth
                    size="small"
                    select
                    disabled={!canAdmin || deviceLocked}
                    label="Social Account"
                    value={attachForm.accountId}
                    onChange={(event) => setAttachForm((current) => ({ ...current, accountId: event.target.value }))}
                  >
                    {attachAccountPool.map((account) => (
                      <MenuItem key={account.id} value={account.id}>
                        {account.name}
                      </MenuItem>
                    ))}
                    {!attachAccountPool.length && <MenuItem value="">Chưa có account cho nền tảng này</MenuItem>}
                  </TextField>
                  </Grid>
                  <Grid item xs={12} md={2.5}>
                  <TextField
                    fullWidth
                    size="small"
                    select
                    disabled={!canAdmin || deviceLocked}
                    label="Role"
                    value={attachForm.role}
                    onChange={(event) =>
                      setAttachForm((current) => ({
                        ...current,
                        role: event.target.value,
                        isPrimary: event.target.value === 'PRIMARY' || current.isPrimary,
                      }))
                    }
                  >
                    {['PRIMARY', 'BACKUP', 'RECOVERY', 'PUBLISHING', 'SYNC_ONLY'].map((role) => (
                      <MenuItem key={role} value={role}>
                        {role}
                      </MenuItem>
                    ))}
                  </TextField>
                  </Grid>
                  <Grid item xs={6} md={1.5}>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={attachForm.isPrimary}
                        onChange={(event) => setAttachForm((current) => ({ ...current, isPrimary: event.target.checked }))}
                      />
                    }
                    label="Primary"
                  />
                  </Grid>
                  <Grid item xs={6} md={2}>
                  <Button fullWidth variant="contained" disabled={!canAdmin || deviceLocked || !attachForm.accountId} onClick={attachAccount}>
                    Gắn
                  </Button>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardHeader title="Tạo bài viết từ nguồn" />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={5}>
                  <TextField
                    fullWidth
                    disabled={!canAdmin || deviceLocked || runningAction === 'source-download'}
                    label="Link nguồn XHS hoặc Douyin"
                    value={sourceDownloadForm.url}
                    onChange={(event) => setSourceDownloadForm((current) => ({ ...current, url: event.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    fullWidth
                    select
                    disabled={!canAdmin || deviceLocked || runningAction === 'source-download'}
                    label="Nền tảng"
                    value={sourceDownloadForm.platform}
                    onChange={(event) => setSourceDownloadForm((current) => ({ ...current, platform: event.target.value }))}
                  >
                    <MenuItem value="auto">Auto detect</MenuItem>
                    <MenuItem value="xiaohongshu">Xiaohongshu</MenuItem>
                    <MenuItem value="douyin">Douyin</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    disabled={!canAdmin || deviceLocked || runningAction === 'source-download'}
                    label="Tiêu đề tùy chỉnh"
                    value={sourceDownloadForm.titleOverride}
                    onChange={(event) => setSourceDownloadForm((current) => ({ ...current, titleOverride: event.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={sourceDownloadForm.submitForApproval}
                        onChange={(event) => setSourceDownloadForm((current) => ({ ...current, submitForApproval: event.target.checked }))}
                      />
                    }
                    label="Gửi duyệt"
                  />
                </Grid>
                <Grid item xs={12} md={10}>
                  <TextField
                    fullWidth
                    disabled={!canAdmin || deviceLocked || runningAction === 'source-download'}
                    label="Caption tùy chỉnh"
                    value={sourceDownloadForm.captionOverride}
                    onChange={(event) => setSourceDownloadForm((current) => ({ ...current, captionOverride: event.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <Button
                    fullWidth
                    size="large"
                    variant="contained"
                    disabled={!canAdmin || deviceLocked || runningAction === 'source-download' || !sourceDownloadForm.url}
                    onClick={createPostFromSource}
                  >
                    {runningAction === 'source-download' ? 'Đang tải...' : 'Tải và tạo draft'}
                  </Button>
                </Grid>
                {sourceDownloadResult && (
                  <Grid item xs={12}>
                    <Box sx={{ p: 2, borderRadius: 1, bgcolor: 'background.neutral' }}>
                      <Typography variant="subtitle2">Đã tạo draft từ nguồn</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {sourceDownloadResult.download?.platform} · {sourceDownloadResult.download?.jobId} · {sourceDownloadResult.media?.length || 0} media
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Bài viết: {sourceDownloadResult.post?.title}
                      </Typography>
                    </Box>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardHeader title="Tạo bài post trong profile" />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    disabled={!canAdmin || deviceLocked}
                    label="Tiêu đề"
                    value={profilePostForm.title}
                    onChange={(event) => setProfilePostForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    disabled={!canAdmin || deviceLocked}
                    label="Nội dung"
                    value={profilePostForm.caption}
                    onChange={(event) => setProfilePostForm((current) => ({ ...current, caption: event.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    select
                    disabled={!canAdmin || deviceLocked}
                    label="Social target tùy chọn"
                    value={profilePostForm.socialAccountId}
                    onChange={(event) => setProfilePostForm((current) => ({ ...current, socialAccountId: event.target.value }))}
                  >
                    <MenuItem value="">Chưa chọn</MenuItem>
                    {verifiedAccounts.map((account) => (
                      <MenuItem key={account.accountId} value={account.accountId}>
                        {account.detectedAccountName || account.accountName} · {account.platform}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    fullWidth
                    type="datetime-local"
                    disabled={!canAdmin || deviceLocked}
                    label="Lịch đăng"
                    InputLabelProps={{ shrink: true }}
                    value={profilePostForm.scheduledAt}
                    onChange={(event) => setProfilePostForm((current) => ({ ...current, scheduledAt: event.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <Button
                    fullWidth
                    size="large"
                    variant="contained"
                    disabled={!canAdmin || deviceLocked || !profilePostForm.title || !profilePostForm.caption}
                    onClick={createProfilePost}
                  >
                    Lưu draft
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardHeader title="Nội dung trong profile" />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Box sx={{ height: 360 }}>
                    <DataGrid
                      rows={profilePosts}
                      columns={devicePostColumns}
                      disableRowSelectionOnClick
                      initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
                      pageSizeOptions={[5, 10, 25]}
                    />
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    select
                    disabled={!canAdmin || deviceLocked || !profilePosts.length}
                    label="Bài đang thao tác"
                    value={assignDraftForm.postId || scheduleForm.postId}
                    onChange={(event) => {
                      setAssignDraftForm((current) => ({ ...current, postId: event.target.value }));
                      setScheduleForm((current) => ({ ...current, postId: event.target.value }));
                    }}
                  >
                    {profilePosts.map((post) => (
                      <MenuItem key={post.id} value={post.id}>
                        {post.title} · {post.status}
                      </MenuItem>
                    ))}
                    {!profilePosts.length && <MenuItem value="">Chưa có bài viết</MenuItem>}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    select
                    disabled={!canAdmin || deviceLocked || !verifiedAccounts.length}
                    label="Social Account"
                    value={assignDraftForm.socialAccountId}
                    onChange={(event) => {
                      setAssignDraftForm((current) => ({ ...current, socialAccountId: event.target.value }));
                      setScheduleForm((current) => ({ ...current, socialAccountId: event.target.value }));
                    }}
                  >
                    {verifiedAccounts.map((account) => (
                      <MenuItem key={account.accountId} value={account.accountId}>
                        {account.detectedAccountName || account.accountName} · {account.platform}
                      </MenuItem>
                    ))}
                    {!verifiedAccounts.length && <MenuItem value="">Chưa có Social Account verified</MenuItem>}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    type="datetime-local"
                    disabled={!canAdmin || deviceLocked}
                    label="Thời gian đăng"
                    InputLabelProps={{ shrink: true }}
                    value={scheduleForm.scheduledAt}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, scheduledAt: event.target.value }))}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <Stack direction={{ xs: 'column', sm: 'row', md: 'column' }} spacing={1}>
                    <Button
                      fullWidth
                      variant="outlined"
                      disabled={!assignDraftForm.postId}
                      onClick={() => setDraftPreviewOpen(true)}
                    >
                      Xem
                    </Button>
                    <Button
                      fullWidth
                      variant="contained"
                      disabled={!canAdmin || deviceLocked || !assignDraftForm.postId || !assignDraftForm.socialAccountId}
                      onClick={assignDraftToSocialAccount}
                    >
                      Gán
                    </Button>
                  </Stack>
                </Grid>
                <Grid item xs={12}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                      {selectedDraft
                        ? `${selectedDraft.title} · ${selectedDraft.status} · ${selectedDraft.mediaCount || 0} media`
                        : 'Chọn một bài viết để xem, gán account, lên lịch hoặc đăng ngay.'}
                    </Typography>
                    <Button
                      variant="outlined"
                      disabled={!canAdmin || deviceLocked || !scheduleForm.postId || !assignDraftForm.socialAccountId || !scheduleForm.scheduledAt}
                      onClick={scheduleProfilePost}
                    >
                      Lên lịch
                    </Button>
                    <Button
                      variant="soft"
                      color="primary"
                      disabled={!canAdmin || deviceLocked || !assignDraftForm.postId || !assignDraftForm.socialAccountId}
                      onClick={publishDraftNow}
                    >
                      Đăng ngay
                    </Button>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardHeader
              title="Media trong profile"
              subheader={`${profileMediaFolders.length} thư mục · ${profileMedia.length} media`}
            />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} lg={5}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Iconify icon="solar:folder-with-files-bold" width={22} />
                      <Typography variant="subtitle1">Thư mục</Typography>
                    </Stack>
                    <Grid container spacing={1.5}>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          fullWidth
                          size="small"
                          disabled={!canAdmin || deviceLocked}
                          label="Tên thư mục"
                          value={mediaFolderForm.name}
                          onChange={(event) => setMediaFolderForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <TextField
                          fullWidth
                          size="small"
                          select
                          disabled={!canAdmin || deviceLocked}
                          label="Nguồn"
                          value={mediaFolderForm.provider}
                          onChange={(event) => setMediaFolderForm((current) => ({ ...current, provider: event.target.value }))}
                        >
                          <MenuItem value="local">Local</MenuItem>
                          <MenuItem value="google_drive">Google Drive</MenuItem>
                          <MenuItem value="r2">R2</MenuItem>
                        </TextField>
                      </Grid>
                      <Grid item xs={12} sm={5}>
                        <TextField
                          fullWidth
                          size="small"
                          disabled={!canAdmin || deviceLocked}
                          label="Path / ID / prefix"
                          value={mediaFolderForm.externalId}
                          onChange={(event) => setMediaFolderForm((current) => ({ ...current, externalId: event.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Iconify icon="solar:add-folder-bold" />}
                          disabled={!canAdmin || deviceLocked || !mediaFolderForm.name}
                          onClick={createMediaFolder}
                        >
                          Thêm thư mục
                        </Button>
                      </Grid>
                    </Grid>
                    <Box sx={{ height: 220 }}>
                      <DataGrid
                        rows={profileMediaFolders}
                        columns={mediaFolderColumns.slice(0, 4)}
                        disableRowSelectionOnClick
                        hideFooter={profileMediaFolders.length <= 5}
                        initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
                        pageSizeOptions={[5, 10]}
                      />
                    </Box>
                  </Stack>
                </Grid>
                <Grid item xs={12} lg={7}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Iconify icon="solar:gallery-wide-bold" width={22} />
                      <Typography variant="subtitle1">Media</Typography>
                    </Stack>
                    <Grid container spacing={1.5}>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          fullWidth
                          size="small"
                          disabled={!canAdmin || deviceLocked}
                          label="Tên media"
                          value={profileMediaForm.name}
                          onChange={(event) => setProfileMediaForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <TextField
                          fullWidth
                          size="small"
                          select
                          disabled={!canAdmin || deviceLocked}
                          label="Nguồn"
                          value={profileMediaForm.provider}
                          onChange={(event) => setProfileMediaForm((current) => ({ ...current, provider: event.target.value }))}
                        >
                          <MenuItem value="local">Local</MenuItem>
                          <MenuItem value="google_drive">Google Drive</MenuItem>
                          <MenuItem value="r2">R2</MenuItem>
                          <MenuItem value="manual">Manual</MenuItem>
                        </TextField>
                      </Grid>
                      <Grid item xs={12} sm={2.5}>
                        <TextField
                          fullWidth
                          size="small"
                          disabled={!canAdmin || deviceLocked}
                          label="Thư mục"
                          value={profileMediaForm.folderName}
                          onChange={(event) => setProfileMediaForm((current) => ({ ...current, folderName: event.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12} sm={2.5}>
                        <TextField
                          fullWidth
                          size="small"
                          disabled={!canAdmin || deviceLocked}
                          label="Danh mục"
                          value={profileMediaForm.category}
                          onChange={(event) => setProfileMediaForm((current) => ({ ...current, category: event.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12} sm={8}>
                        <TextField
                          fullWidth
                          size="small"
                          disabled={!canAdmin || deviceLocked}
                          label="Link media"
                          value={profileMediaForm.webViewLink}
                          onChange={(event) => setProfileMediaForm((current) => ({ ...current, webViewLink: event.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <Button
                          fullWidth
                          size="small"
                          variant="contained"
                          startIcon={<Iconify icon="solar:add-square-bold" />}
                          disabled={!canAdmin || deviceLocked || !profileMediaForm.name}
                          onClick={createProfileMedia}
                        >
                          Thêm media
                        </Button>
                      </Grid>
                    </Grid>
                    <Box sx={{ height: 220 }}>
                      <DataGrid
                        rows={profileMedia}
                        columns={mediaColumns.slice(0, 5)}
                        disableRowSelectionOnClick
                        hideFooter={profileMedia.length <= 5}
                        initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
                        pageSizeOptions={[5, 10]}
                      />
                    </Box>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardHeader title="Social Account setup" subheader="Xác minh login thật hoặc tạo account mới cho profile" />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} lg={6}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Iconify icon="solar:shield-check-bold" width={22} />
                      <Typography variant="subtitle1">Xác minh login</Typography>
                    </Stack>
                    <Grid container spacing={1.5}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          size="small"
                          select
                          disabled={!canAdmin || accounts.length === 0}
                          label="Social Account"
                          value={verifyForm.mappingId}
                          onChange={(event) => {
                            const selected = accounts.find((row) => row.mappingId === event.target.value);

                            setVerifyForm((current) => ({
                              ...current,
                              mappingId: event.target.value,
                              accountId: selected?.accountId || '',
                              detectedAccountName: current.detectedAccountName || selected?.accountName || '',
                            }));
                          }}
                        >
                          {accounts.map((account) => (
                            <MenuItem key={account.mappingId} value={account.mappingId}>
                              {account.accountName} · {account.verificationStatus || 'UNVERIFIED'}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          size="small"
                          disabled={!canAdmin}
                          label="Tên login thật"
                          value={verifyForm.detectedAccountName}
                          onChange={(event) => setVerifyForm((current) => ({ ...current, detectedAccountName: event.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          size="small"
                          disabled={!canAdmin}
                          label="Profile URL"
                          value={verifyForm.detectedAccountUrl}
                          onChange={(event) => setVerifyForm((current) => ({ ...current, detectedAccountUrl: event.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          size="small"
                          disabled={!canAdmin}
                          label="Facebook/IG ID"
                          value={verifyForm.detectedAccountId}
                          onChange={(event) => setVerifyForm((current) => ({ ...current, detectedAccountId: event.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12} sm={7}>
                        <TextField
                          fullWidth
                          size="small"
                          disabled={!canAdmin}
                          label="Ghi chú"
                          value={verifyForm.note}
                          onChange={(event) => setVerifyForm((current) => ({ ...current, note: event.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={6} sm={2.5}>
                        <Button
                          fullWidth
                          size="small"
                          variant="contained"
                          disabled={!canAdmin || !verifyForm.mappingId || !verifyForm.detectedAccountName}
                          onClick={verifyLoginManual}
                        >
                          Verified
                        </Button>
                      </Grid>
                      <Grid item xs={6} sm={2.5}>
                        <Button
                          fullWidth
                          size="small"
                          variant="outlined"
                          disabled={!canAdmin || !verifyForm.mappingId || !!runningAction}
                          onClick={verifyLoginDirect}
                        >
                          Verify
                        </Button>
                      </Grid>
                    </Grid>
                  </Stack>
                </Grid>
                <Grid item xs={12} lg={6}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Iconify icon="solar:user-plus-bold" width={22} />
                      <Typography variant="subtitle1">Tạo account mới</Typography>
                    </Stack>
                    <Grid container spacing={1.5}>
                      <Grid item xs={12} sm={5}>
                        <TextField fullWidth size="small" disabled={!canAdmin || deviceLocked} label="Tên account" value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} />
                      </Grid>
                      <Grid item xs={6} sm={3.5}>
                        <TextField fullWidth size="small" select disabled={!canAdmin} label="Platform" value={createForm.platform} onChange={(event) => setCreateForm((current) => ({ ...current, platform: event.target.value, type: event.target.value === 'INSTAGRAM' ? 'INSTAGRAM_BUSINESS' : 'FANPAGE' }))}>
                          <MenuItem value="FACEBOOK">Facebook</MenuItem>
                          <MenuItem value="INSTAGRAM">Instagram</MenuItem>
                        </TextField>
                      </Grid>
                      <Grid item xs={6} sm={3.5}>
                        <TextField fullWidth size="small" select disabled={!canAdmin} label="Loại" value={createForm.type} onChange={(event) => setCreateForm((current) => ({ ...current, type: event.target.value }))}>
                          {createForm.platform === 'FACEBOOK'
                            ? [
                                <MenuItem key="FANPAGE" value="FANPAGE">Fanpage</MenuItem>,
                                <MenuItem key="PROFILE" value="PROFILE">Profile cá nhân</MenuItem>,
                              ]
                            : [
                                <MenuItem key="INSTAGRAM_BUSINESS" value="INSTAGRAM_BUSINESS">Instagram Business</MenuItem>,
                                <MenuItem key="INSTAGRAM_CREATOR" value="INSTAGRAM_CREATOR">Instagram Creator</MenuItem>,
                              ]}
                        </TextField>
                      </Grid>
                      <Grid item xs={12} sm={5}>
                        <TextField fullWidth size="small" disabled={!canAdmin} label="External ID" value={createForm.externalId} onChange={(event) => setCreateForm((current) => ({ ...current, externalId: event.target.value }))} />
                      </Grid>
                      <Grid item xs={12} sm={7}>
                        <TextField fullWidth size="small" disabled={!canAdmin} label="Profile URL" value={createForm.profileUrl} onChange={(event) => setCreateForm((current) => ({ ...current, profileUrl: event.target.value }))} />
                      </Grid>
                      <Grid item xs={12} sm={5}>
                        <FormControlLabel control={<Switch size="small" checked={createForm.approvalRequired} onChange={(event) => setCreateForm((current) => ({ ...current, approvalRequired: event.target.checked }))} />} label="Bắt buộc duyệt" />
                      </Grid>
                      <Grid item xs={12} sm={7}>
                        <Button fullWidth size="small" variant="contained" disabled={!canAdmin || deviceLocked || !createForm.name} onClick={createAccountOnDevice}>
                          Tạo account
                        </Button>
                      </Grid>
                    </Grid>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <DataCard title="Jobs của device" rows={jobsRows} columns={compactJobColumns} />
        </Grid>
        <Grid item xs={12} md={6}>
          <DataCard title="Health logs" rows={healthRows} columns={compactHealthColumns} />
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardHeader title="Settings" />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={3}>
                  <TextField fullWidth disabled={!canAdmin} label="Tên device" value={settingsForm.name} onChange={(event) => setSettingsForm((current) => ({ ...current, name: event.target.value }))} />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField fullWidth disabled={!canAdmin} label="Profile name" value={settingsForm.profileName} onChange={(event) => setSettingsForm((current) => ({ ...current, profileName: event.target.value }))} />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField fullWidth disabled={!canAdmin} label="Model" value={settingsForm.deviceModel} onChange={(event) => setSettingsForm((current) => ({ ...current, deviceModel: event.target.value }))} />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField fullWidth disabled={!canAdmin} label="Android" value={settingsForm.androidVersion} onChange={(event) => setSettingsForm((current) => ({ ...current, androidVersion: event.target.value }))} />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField fullWidth disabled={!canAdmin} label="Notes" value={settingsForm.notes} onChange={(event) => setSettingsForm((current) => ({ ...current, notes: event.target.value }))} />
                </Grid>
                <Grid item xs={12} md={2}>
                  <Button fullWidth size="large" variant="contained" disabled={!canAdmin || saving || !settingsForm.name} onClick={saveDeviceSettings}>
                    Lưu
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={draftPreviewOpen} onClose={() => setDraftPreviewOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Xem lại bài nháp</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              fullWidth
              disabled={!canAdmin || deviceLocked}
              label="Tiêu đề"
              value={draftEditForm.title}
              onChange={(event) => setDraftEditForm((current) => ({ ...current, title: event.target.value }))}
            />
            <TextField
              fullWidth
              multiline
              minRows={5}
              disabled={!canAdmin || deviceLocked}
              label="Caption / nội dung đăng"
              value={draftEditForm.caption}
              onChange={(event) => setDraftEditForm((current) => ({ ...current, caption: event.target.value }))}
            />
            <TextField
              fullWidth
              select
              disabled={!canAdmin || deviceLocked || !verifiedAccounts.length}
              label="Social Account đăng"
              value={draftEditForm.socialAccountId}
              onChange={(event) => {
                setDraftEditForm((current) => ({ ...current, socialAccountId: event.target.value }));
                setAssignDraftForm((current) => ({ ...current, socialAccountId: event.target.value }));
              }}
            >
              {verifiedAccounts.map((account) => (
                <MenuItem key={account.accountId} value={account.accountId}>
                  {account.detectedAccountName || account.accountName} · {account.platform}
                </MenuItem>
              ))}
              {!verifiedAccounts.length && <MenuItem value="">Chưa có Social Account verified</MenuItem>}
            </TextField>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Media trong bài
              </Typography>
              <Stack spacing={1}>
                {(selectedDraft?.media || []).map((media: any) => (
                  <Stack
                    key={media.id}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ p: 1, borderRadius: 1, border: (theme) => `1px solid ${theme.palette.divider}` }}
                  >
                    <Iconify icon={media.type === 'Video' ? 'solar:videocamera-record-bold' : 'solar:gallery-bold'} width={20} />
                    <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                      {media.name}
                    </Typography>
                    <Chip size="small" label={media.type} />
                  </Stack>
                ))}
                {!selectedDraft?.media?.length && (
                  <Typography variant="body2" color="text.secondary">
                    Bài nháp chưa có media.
                  </Typography>
                )}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraftPreviewOpen(false)}>Đóng</Button>
          <Button
            disabled={!canAdmin || deviceLocked || runningAction === 'translate-draft' || !assignDraftForm.postId}
            onClick={translateDraftPreview}
          >
            {runningAction === 'translate-draft' ? 'Đang Việt hóa...' : 'Việt hóa'}
          </Button>
          <Button disabled={!canAdmin || deviceLocked || !draftEditForm.title || !draftEditForm.caption} onClick={saveDraftPreview}>
            Lưu nháp
          </Button>
          <Button
            variant="contained"
            disabled={!canAdmin || deviceLocked || !draftEditForm.socialAccountId || !assignDraftForm.postId}
            onClick={publishDraftNow}
          >
            Đăng ngay
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function JobsModule({ canAdmin }: { canAdmin: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([]);
  const [retriedIds, setRetriedIds] = useState<string[]>([]);
  const jobRows = useApiRows('/api/jobs/', jobs);
  const rows = jobRows.map((job) =>
    retriedIds.includes(String(job.id)) ? { ...job, status: 'pending', attempts: 0, error: '' } : job
  );
  const selectedJobId = selectedRows[0] ? String(selectedRows[0]) : '';

  const retryJob = useCallback(async () => {
    if (!selectedJobId) {
      enqueueSnackbar('Chọn một job cần retry', { variant: 'warning' });
      return;
    }

    try {
      const response = await fetch('/api/jobs/', {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify({ jobId: selectedJobId }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Không thể retry job');
      }

      setRetriedIds((current) => [...current, selectedJobId]);
      setSelectedRows([]);
      enqueueSnackbar('Đã đưa job về trạng thái chờ xử lý');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể retry job', {
        variant: 'error',
      });
    }
  }, [enqueueSnackbar, selectedJobId]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          disabled={!canAdmin || !selectedJobId}
          startIcon={<Iconify icon="solar:refresh-bold" />}
          onClick={retryJob}
        >
          Retry job lỗi
        </Button>
        <Button variant="outlined" disabled={!canAdmin}>
          Xem pg-boss queue
        </Button>
      </Stack>
      <DataCard
        title="Job nền và đồng bộ"
        rows={rows}
        columns={jobColumns}
        checkboxSelection
        rowSelectionModel={selectedRows}
        onRowSelectionModelChange={setSelectedRows}
      />
    </Stack>
  );
}

function UsersModule({ canAdmin }: { canAdmin: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const [creating, setCreating] = useState(false);
  const [createdUsers, setCreatedUsers] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF',
  });
  const userRows = useApiRows('/api/users/', users);
  const rows = [...createdUsers, ...userRows];

  const updateForm = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const createUser = useCallback(async () => {
    if (!canAdmin) return;

    setCreating(true);

    try {
      const response = await fetch('/api/users/', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Không thể tạo nhân viên');
      }

      const body = await response.json();

      setCreatedUsers((current) => [body.data, ...current]);
      setForm({ name: '', email: '', password: '', role: 'STAFF' });
      enqueueSnackbar('Đã tạo nhân viên');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể tạo nhân viên', {
        variant: 'error',
      });
    } finally {
      setCreating(false);
    }
  }, [canAdmin, enqueueSnackbar, form]);

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader title="Tạo nhân viên" />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Tên" value={form.name} onChange={updateForm('name')} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Email" value={form.email} onChange={updateForm('email')} />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                label="Mật khẩu"
                type="password"
                value={form.password}
                onChange={updateForm('password')}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField fullWidth select label="Role" value={form.role} onChange={updateForm('role')}>
                {['ADMIN', 'APPROVER', 'EDITOR', 'STAFF', 'VIEWER'].map((role) => (
                  <MenuItem key={role} value={role}>
                    {role}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                size="large"
                variant="contained"
                disabled={!canAdmin || creating}
                startIcon={<Iconify icon="solar:user-plus-bold" />}
                onClick={createUser}
              >
                Thêm
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      <DataCard title="Nhân viên và phân quyền" rows={rows} columns={userColumns} />
    </Stack>
  );
}

function SettingsModule({ canAdmin }: { canAdmin: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const [saving, setSaving] = useState(false);
  const [testingMostLogin, setTestingMostLogin] = useState(false);
  const [testingMostLoginList, setTestingMostLoginList] = useState(false);
  const [settings, setSettings] = useState({
    timezone: 'Asia/Ho_Chi_Minh',
    approvalRequiredByDefault: true,
    approverRole: 'APPROVER',
    defaultScheduleSlots: '09:00, 12:00, 20:00',
    mostLoginApiBaseUrl: 'http://127.0.0.1:30898',
    mostLoginApiKey: '',
    mostLoginApiKeyConfigured: false,
    mostLoginAuthHeaderName: 'Authorization',
    mostLoginAuthHeaderPrefix: '',
    mostLoginListProfilesPath: '/api/profile/getProfiles',
    mostLoginListProfilesMethod: 'POST',
    mostLoginDetailProfilePath: '/api/profile/detail',
    mostLoginOpenProfilePath: '/api/browser/openBrowser',
    mostLoginCloseProfilePath: '/api/browser/closeProfiles',
  });

  useEffect(() => {
    fetch('/api/settings/')
      .then((response) => response.json())
      .then((response) => {
        const data = response.data || {};

        setSettings((current) => ({
          ...current,
          timezone: data.timezone || current.timezone,
          approvalRequiredByDefault:
            data.approvalRequiredByDefault ?? current.approvalRequiredByDefault,
          approverRole: data.approverRole || current.approverRole,
          defaultScheduleSlots: Array.isArray(data.defaultScheduleSlots)
            ? data.defaultScheduleSlots.join(', ')
            : current.defaultScheduleSlots,
          mostLoginApiBaseUrl: data.mostLoginApiBaseUrl || current.mostLoginApiBaseUrl,
          mostLoginApiKeyConfigured: data.mostLoginApiKeyConfigured ?? current.mostLoginApiKeyConfigured,
          mostLoginAuthHeaderName: data.mostLoginAuthHeaderName || current.mostLoginAuthHeaderName,
          mostLoginAuthHeaderPrefix: data.mostLoginAuthHeaderPrefix ?? current.mostLoginAuthHeaderPrefix,
          mostLoginListProfilesPath: data.mostLoginListProfilesPath || current.mostLoginListProfilesPath,
          mostLoginListProfilesMethod: data.mostLoginListProfilesMethod || current.mostLoginListProfilesMethod,
          mostLoginDetailProfilePath: data.mostLoginDetailProfilePath || current.mostLoginDetailProfilePath,
          mostLoginOpenProfilePath: data.mostLoginOpenProfilePath || current.mostLoginOpenProfilePath,
          mostLoginCloseProfilePath: data.mostLoginCloseProfilePath || current.mostLoginCloseProfilePath,
        }));
      })
      .catch(() => undefined);
  }, []);

  const updateSettings = (key: keyof typeof settings) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = key === 'approvalRequiredByDefault' ? event.target.checked : event.target.value;
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = useCallback(async () => {
    if (!canAdmin) return;

    setSaving(true);

    try {
      const response = await fetch('/api/settings/', {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify({
          timezone: settings.timezone,
          approvalRequiredByDefault: settings.approvalRequiredByDefault,
          approverRole: settings.approverRole,
          defaultScheduleSlots: settings.defaultScheduleSlots
            .split(',')
            .map((slot) => slot.trim())
            .filter(Boolean),
          mostLoginApiBaseUrl: settings.mostLoginApiBaseUrl,
          mostLoginApiKey: settings.mostLoginApiKey,
          mostLoginAuthHeaderName: settings.mostLoginAuthHeaderName,
          mostLoginAuthHeaderPrefix: settings.mostLoginAuthHeaderPrefix,
          mostLoginListProfilesPath: settings.mostLoginListProfilesPath,
          mostLoginListProfilesMethod: settings.mostLoginListProfilesMethod,
          mostLoginDetailProfilePath: settings.mostLoginDetailProfilePath,
          mostLoginOpenProfilePath: settings.mostLoginOpenProfilePath,
          mostLoginCloseProfilePath: settings.mostLoginCloseProfilePath,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Không thể lưu cài đặt');
      }

      setSettings((current) => ({
        ...current,
        mostLoginApiKey: '',
        mostLoginApiKeyConfigured: current.mostLoginApiKeyConfigured || Boolean(current.mostLoginApiKey),
      }));
      enqueueSnackbar('Đã lưu cài đặt');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể lưu cài đặt', {
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [canAdmin, enqueueSnackbar, settings]);

  const testMostLoginConnection = useCallback(async () => {
    if (!canAdmin) return;

    setTestingMostLogin(true);

    try {
      const response = await fetch('/api/settings/mostlogin-test/', {
        method: 'POST',
        headers: authJsonHeaders(),
      });
      const body = await response.json();

      if (!response.ok || body.data?.ok === false) {
        throw new Error(body.message || 'MostLogin connection failed');
      }

      enqueueSnackbar(body.message || 'MostLogin connection OK');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể test MostLogin', {
        variant: 'error',
      });
    } finally {
      setTestingMostLogin(false);
    }
  }, [canAdmin, enqueueSnackbar]);

  const testMostLoginListProfiles = useCallback(async () => {
    if (!canAdmin) return;

    setTestingMostLoginList(true);

    try {
      const response = await fetch('/api/settings/mostlogin-list-test/', {
        method: 'POST',
        headers: authJsonHeaders(),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || 'Không thể đọc MostLogin profiles');
      }

      enqueueSnackbar(body.message || 'Đọc profiles thành công');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Không thể test list profiles', {
        variant: 'error',
      });
    } finally {
      setTestingMostLoginList(false);
    }
  }, [canAdmin, enqueueSnackbar]);

  return (
    <Stack spacing={3}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
        <Card>
          <CardHeader title="Quy trình phê duyệt" />
          <CardContent>
            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.approvalRequiredByDefault}
                    disabled={!canAdmin}
                    onChange={updateSettings('approvalRequiredByDefault')}
                  />
                }
                label="Bắt buộc duyệt bài mặc định"
              />
              <TextField
                select
                disabled={!canAdmin}
                label="Role được duyệt bài"
                value={settings.approverRole}
                onChange={updateSettings('approverRole')}
              >
                <MenuItem value="APPROVER">Approver và Admin</MenuItem>
                <MenuItem value="ADMIN">Chỉ Admin</MenuItem>
              </TextField>
            </Stack>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader title="Lịch đăng mặc định" />
          <CardContent>
            <Stack spacing={2}>
              <TextField
                disabled={!canAdmin}
                label="Timezone"
                value={settings.timezone}
                onChange={updateSettings('timezone')}
              />
              <TextField
                disabled={!canAdmin}
                label="Khung giờ mặc định"
                value={settings.defaultScheduleSlots}
                onChange={updateSettings('defaultScheduleSlots')}
              />
            </Stack>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12}>
        <Card>
          <CardHeader title="MostLogin Local API" />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  disabled={!canAdmin}
                  label="Base URL"
                  value={settings.mostLoginApiBaseUrl}
                  onChange={updateSettings('mostLoginApiBaseUrl')}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  disabled={!canAdmin}
                  label={settings.mostLoginApiKeyConfigured ? 'API key mới (để trống để giữ key cũ)' : 'API key'}
                  type="password"
                  value={settings.mostLoginApiKey}
                  onChange={updateSettings('mostLoginApiKey')}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  disabled={!canAdmin}
                  label="Auth header name"
                  value={settings.mostLoginAuthHeaderName}
                  onChange={updateSettings('mostLoginAuthHeaderName')}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  disabled={!canAdmin}
                  label="Auth prefix"
                  value={settings.mostLoginAuthHeaderPrefix}
                  onChange={updateSettings('mostLoginAuthHeaderPrefix')}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  disabled={!canAdmin}
                  label="List profiles path"
                  value={settings.mostLoginListProfilesPath}
                  onChange={updateSettings('mostLoginListProfilesPath')}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  select
                  disabled={!canAdmin}
                  label="List profiles method"
                  value={settings.mostLoginListProfilesMethod}
                  onChange={updateSettings('mostLoginListProfilesMethod')}
                >
                  <MenuItem value="POST">POST</MenuItem>
                  <MenuItem value="GET">GET</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  disabled={!canAdmin}
                  label="Detail profile path"
                  value={settings.mostLoginDetailProfilePath}
                  onChange={updateSettings('mostLoginDetailProfilePath')}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  disabled={!canAdmin}
                  label="Open profile path"
                  value={settings.mostLoginOpenProfilePath}
                  onChange={updateSettings('mostLoginOpenProfilePath')}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  disabled={!canAdmin}
                  label="Close profile path"
                  value={settings.mostLoginCloseProfilePath}
                  onChange={updateSettings('mostLoginCloseProfilePath')}
                />
              </Grid>
              <Grid item xs={12}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Button
                    variant="outlined"
                    disabled={!canAdmin || testingMostLogin}
                    startIcon={<Iconify icon="solar:plug-circle-bold" />}
                    onClick={testMostLoginConnection}
                  >
                    Test connection
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={!canAdmin || testingMostLoginList}
                    startIcon={<Iconify icon="solar:list-check-bold" />}
                    onClick={testMostLoginListProfiles}
                  >
                    Test list profiles
                  </Button>
                  <Chip
                    size="small"
                    color={settings.mostLoginApiKeyConfigured ? 'success' : 'warning'}
                    label={settings.mostLoginApiKeyConfigured ? 'API key đã cấu hình' : 'Chưa có API key'}
                  />
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>
      </Grid>
      <Button
        variant="contained"
        disabled={!canAdmin || saving}
        onClick={saveSettings}
        sx={{ alignSelf: 'flex-start' }}
      >
        Lưu cài đặt
      </Button>
    </Stack>
  );
}

function FilterBar({ fields }: { fields: string[] }) {
  return (
    <Card>
      <CardContent>
        <Grid container spacing={2}>
          {fields.map((field) => (
            <Grid key={field} item xs={12} md={3}>
              <TextField fullWidth size="small" label={field} />
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
}
