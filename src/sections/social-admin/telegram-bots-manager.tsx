'use client';

import { useEffect, useState, useCallback } from 'react';
// @mui
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import CardContent from '@mui/material/CardContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useSnackbar } from 'notistack';
// components
import Iconify from 'src/components/iconify';

// ----------------------------------------------------------------------
// Quản lý nhiều bot Telegram gán theo account/device. Tự fetch dữ liệu.

function headers() {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${typeof window !== 'undefined' ? sessionStorage.getItem('accessToken') || '' : ''}`,
  };
}

type Bot = {
  id: string;
  label: string;
  enabled: boolean;
  binding: 'ACCOUNT' | 'DEVICE';
  socialAccountId?: string | null;
  accountName?: string;
  deviceId?: string | null;
  deviceName?: string;
  allowedChatIds: string;
  tzOffset: string;
  tokenConfigured: boolean;
};

const EMPTY_FORM = {
  label: '',
  botToken: '',
  binding: 'DEVICE' as 'ACCOUNT' | 'DEVICE',
  socialAccountId: '',
  deviceId: '',
  allowedChatIds: '',
  tzOffset: '+07:00',
};

export default function TelegramBotsManager({ canAdmin }: { canAdmin: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const [bots, setBots] = useState<Bot[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const loadBots = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/telegram/bots/', { headers: headers() });
      const body = await res.json();
      // Bot theo account quản lý inline trong workspace tài khoản -> ở đây chỉ liệt kê bot device.
      if (Array.isArray(body?.data)) setBots(body.data.filter((b: Bot) => b.binding === 'DEVICE'));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadBots();
    fetch('/api/devices/?type=ANDROID_DEVICE', { headers: headers() })
      .then((r) => r.json())
      .then((b) => Array.isArray(b?.data) && setDevices(b.data))
      .catch(() => undefined);
  }, [loadBots]);

  const set = (key: keyof typeof form) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const createBot = useCallback(async () => {
    if (!form.label.trim() || !form.botToken.trim() || !form.deviceId) {
      enqueueSnackbar('Nhập tên, token và chọn thiết bị', { variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings/telegram/bots/', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ ...form, binding: 'DEVICE', socialAccountId: undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Không tạo được bot');
      enqueueSnackbar('Đã thêm bot');
      setForm({ ...EMPTY_FORM });
      await loadBots();
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Lỗi', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [form, enqueueSnackbar, loadBots]);

  const patchBot = useCallback(
    async (id: string, data: any, okMsg?: string) => {
      try {
        const res = await fetch(`/api/settings/telegram/bots/${id}/`, {
          method: 'PATCH',
          headers: headers(),
          body: JSON.stringify(data),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || 'Lỗi cập nhật');
        if (okMsg) enqueueSnackbar(okMsg);
        await loadBots();
      } catch (error) {
        enqueueSnackbar(error instanceof Error ? error.message : 'Lỗi', { variant: 'error' });
      }
    },
    [enqueueSnackbar, loadBots]
  );

  const deleteBot = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/settings/telegram/bots/${id}/`, { method: 'DELETE', headers: headers() });
        if (!res.ok) throw new Error((await res.json()).message || 'Không xoá được');
        enqueueSnackbar('Đã xoá bot');
        await loadBots();
      } catch (error) {
        enqueueSnackbar(error instanceof Error ? error.message : 'Lỗi', { variant: 'error' });
      }
    },
    [enqueueSnackbar, loadBots]
  );

  const testBot = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/settings/telegram/bots/${id}/test/`, { method: 'POST', headers: headers() });
        const body = await res.json();
        if (!res.ok || !body.data?.ok) throw new Error(body.message || 'Token không hợp lệ');
        enqueueSnackbar(`OK: @${body.data.username}`, { variant: 'success' });
      } catch (error) {
        enqueueSnackbar(error instanceof Error ? error.message : 'Lỗi', { variant: 'error' });
      }
    },
    [enqueueSnackbar]
  );

  return (
    <Card>
      <CardHeader
        title="Bot Telegram theo thiết bị"
        subheader="Gán bot cho 1 thiết bị (đăng vào các tài khoản của thiết bị đó). Bot theo tài khoản: nhập token ngay trong workspace tài khoản. Worker: npm run telegram:bot"
      />
      <CardContent>
        <Stack spacing={2}>
          {/* Danh sách bot */}
          {bots.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Chưa có bot nào. Thêm bên dưới.
            </Typography>
          )}
          {bots.map((bot) => (
            <Stack
              key={bot.id}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ sm: 'center' }}
              sx={{ p: 1, border: (t) => `1px solid ${t.palette.divider}`, borderRadius: 1 }}
            >
              <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap>
                  {bot.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {bot.binding === 'ACCOUNT' ? `Account: ${bot.accountName || bot.socialAccountId}` : `Device: ${bot.deviceName || bot.deviceId}`}
                  {bot.allowedChatIds ? ` · chat: ${bot.allowedChatIds}` : ''}
                </Typography>
              </Stack>
              <Chip size="small" color={bot.tokenConfigured ? 'success' : 'warning'} label={bot.tokenConfigured ? 'Có token' : 'Thiếu token'} />
              <FormControlLabel
                control={
                  <Switch
                    checked={bot.enabled}
                    disabled={!canAdmin}
                    onChange={(e) => patchBot(bot.id, { enabled: e.target.checked }, 'Đã cập nhật')}
                  />
                }
                label={bot.enabled ? 'Bật' : 'Tắt'}
              />
              <Button size="small" disabled={!canAdmin} onClick={() => testBot(bot.id)} startIcon={<Iconify icon="logos:telegram" />}>
                Test
              </Button>
              <Button size="small" color="error" disabled={!canAdmin} onClick={() => deleteBot(bot.id)}>
                Xoá
              </Button>
            </Stack>
          ))}

          <Divider />

          {/* Form thêm bot cho thiết bị */}
          <Typography variant="subtitle2">Thêm bot cho thiết bị</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
            <TextField size="small" label="Tên bot" value={form.label} onChange={set('label')} sx={{ minWidth: 180 }} disabled={!canAdmin} />
            <TextField size="small" label="Bot token" value={form.botToken} onChange={set('botToken')} sx={{ minWidth: 240 }} disabled={!canAdmin} />
            <TextField
              select
              size="small"
              label="Thiết bị"
              value={form.deviceId}
              onChange={set('deviceId')}
              sx={{ minWidth: 200 }}
              disabled={!canAdmin}
              helperText={devices.length === 0 ? 'Chưa có thiết bị Android' : undefined}
            >
              {devices.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" label="Allowed chat IDs (csv)" value={form.allowedChatIds} onChange={set('allowedChatIds')} sx={{ minWidth: 200 }} disabled={!canAdmin} />
            <TextField size="small" label="TZ offset" value={form.tzOffset} onChange={set('tzOffset')} sx={{ width: 110 }} disabled={!canAdmin} />
            <Box>
              <Button variant="contained" disabled={!canAdmin || saving} onClick={createBot} startIcon={<Iconify icon="mingcute:add-line" />}>
                Thêm bot
              </Button>
            </Box>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
