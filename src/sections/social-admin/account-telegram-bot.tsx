'use client';

import { useEffect, useState, useCallback } from 'react';
// @mui
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useSnackbar } from 'notistack';
// components
import Iconify from 'src/components/iconify';

// ----------------------------------------------------------------------
// Nhập/sửa token bot Telegram gán riêng cho 1 tài khoản, ngay trong workspace account.

function headers() {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${typeof window !== 'undefined' ? sessionStorage.getItem('accessToken') || '' : ''}`,
  };
}

export default function AccountTelegramBot({ accountId, canAdmin }: { accountId: string; canAdmin: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const [status, setStatus] = useState<{ tokenConfigured: boolean; enabled: boolean; allowedChatIds: string } | null>(null);
  const [token, setToken] = useState('');
  const [chatIds, setChatIds] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  const base = `/api/accounts/${accountId}/telegram-bot/`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { headers: headers() });
      const body = await res.json();
      if (body?.data) {
        setStatus(body.data);
        setChatIds(body.data.allowedChatIds || '');
        setEnabled(body.data.enabled ?? true);
      } else {
        setStatus(null);
      }
    } catch {
      /* ignore */
    }
  }, [base]);

  useEffect(() => {
    if (accountId) load();
  }, [accountId, load]);

  const save = useCallback(async () => {
    if (!status?.tokenConfigured && !token.trim()) {
      enqueueSnackbar('Nhập bot token', { variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ botToken: token.trim() || undefined, allowedChatIds: chatIds, enabled }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Không lưu được');
      enqueueSnackbar('Đã lưu bot Telegram cho tài khoản');
      setToken('');
      await load();
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Lỗi', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [base, token, chatIds, enabled, status, enqueueSnackbar, load]);

  const test = useCallback(async () => {
    try {
      const res = await fetch(base, { method: 'POST', headers: headers() });
      const body = await res.json();
      if (!res.ok || !body.data?.ok) throw new Error(body.message || 'Token không hợp lệ');
      enqueueSnackbar(`OK: @${body.data.username}`, { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Lỗi', { variant: 'error' });
    }
  }, [base, enqueueSnackbar]);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(base, { method: 'DELETE', headers: headers() });
      if (!res.ok) throw new Error((await res.json()).message || 'Không xoá được');
      enqueueSnackbar('Đã gỡ bot Telegram khỏi tài khoản');
      setChatIds('');
      await load();
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Lỗi', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [base, enqueueSnackbar, load]);

  return (
    <Card>
      <CardHeader
        title="Bot Telegram của tài khoản"
        subheader="Gán 1 bot Telegram riêng cho tài khoản này để tạo nháp & lên lịch từ Telegram."
        action={
          <Chip
            size="small"
            color={status?.tokenConfigured ? 'success' : 'default'}
            label={status?.tokenConfigured ? 'Đã cấu hình' : 'Chưa có bot'}
          />
        }
      />
      <CardContent>
        <Stack spacing={2}>
          <TextField
            label={status?.tokenConfigured ? 'Bot token (để trống = giữ token cũ)' : 'Bot token'}
            placeholder="123456:ABC-DEF..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={!canAdmin || busy}
            fullWidth
          />
          <TextField
            label="Allowed chat IDs (cách nhau dấu phẩy)"
            value={chatIds}
            onChange={(e) => setChatIds(e.target.value)}
            disabled={!canAdmin || busy}
            fullWidth
          />
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControlLabel
              control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!canAdmin || busy} />}
              label={enabled ? 'Đang bật' : 'Đang tắt'}
            />
            <Button variant="contained" onClick={save} disabled={!canAdmin || busy} startIcon={<Iconify icon="solar:diskette-bold" />}>
              Lưu
            </Button>
            {status?.tokenConfigured && (
              <>
                <Button variant="outlined" onClick={test} disabled={!canAdmin} startIcon={<Iconify icon="logos:telegram" />}>
                  Test
                </Button>
                <Button variant="outlined" color="error" onClick={remove} disabled={!canAdmin || busy}>
                  Gỡ bot
                </Button>
              </>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
