'use client';

import { useEffect, useState, useCallback } from 'react';
// @mui
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
// components
import Iconify from 'src/components/iconify';

// ----------------------------------------------------------------------

type DraftItem = { id: string; account: string; url: string; status: string; label: string };
type PublishItem = { id: string; account: string; device: string; title: string };
type ScheduledItem = PublishItem & { scheduledAt: string | null };
type MediaItem = { postId: string; account: string; title: string; phase: string; label: string; percent: number };

type Activity = {
  drafting: DraftItem[];
  publishing: PublishItem[];
  scheduled: ScheduledItem[];
  media: MediaItem[];
};

const EMPTY: Activity = { drafting: [], publishing: [], scheduled: [], media: [] };
const POLL_MS = 3000;
const MAX_ROWS = 6;

function hhmm(iso: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function Section({
  icon,
  color,
  title,
  children,
}: {
  icon: string;
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Stack spacing={0.75} sx={{ minWidth: 240, flex: 1 }}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Iconify icon={icon} width={16} sx={{ color }} />
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
      </Stack>
      {children}
    </Stack>
  );
}

function Row({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
      <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>
        {primary}
      </Typography>
      {secondary ? (
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {secondary}
        </Typography>
      ) : null}
    </Stack>
  );
}

export default function ActivityBar() {
  const [data, setData] = useState<Activity>(EMPTY);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/activity');
      const body = await res.json();
      if (body?.data) setData(body.data);
    } catch {
      // bỏ qua lỗi poll tạm thời
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await load();
      if (active) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load]);

  const total = data.drafting.length + data.publishing.length + data.scheduled.length + data.media.length;

  // Ẩn hoàn toàn khi không có việc gì.
  if (total === 0) return null;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (theme) => theme.zIndex.drawer - 1,
        borderTop: (theme) => `1px solid ${theme.palette.divider}`,
        borderRadius: 0,
      }}
    >
      {/* Thanh tóm tắt (luôn hiện) */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: 2, py: 0.75, cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <Iconify icon="solar:checklist-minimalistic-bold" width={18} />
        <Typography variant="subtitle2">Công việc đang chạy</Typography>
        {data.publishing.length > 0 && (
          <Chip size="small" color="warning" label={`Đang đăng ${data.publishing.length}`} />
        )}
        {data.drafting.length > 0 && (
          <Chip size="small" color="info" label={`Tạo nháp ${data.drafting.length}`} />
        )}
        {data.scheduled.length > 0 && (
          <Chip size="small" variant="outlined" label={`Chờ đăng ${data.scheduled.length}`} />
        )}
        {data.media.length > 0 && (
          <Chip size="small" color="secondary" label={`Media ${data.media.length}`} />
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={open ? 'Thu gọn' : 'Mở rộng'}>
          <IconButton size="small">
            <Iconify icon={open ? 'eva:chevron-down-fill' : 'eva:chevron-up-fill'} />
          </IconButton>
        </Tooltip>
      </Stack>

      <Collapse in={open}>
        <Divider />
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          divider={<Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />}
          sx={{ p: 2, maxHeight: 260, overflowY: 'auto' }}
        >
          {data.publishing.length > 0 && (
            <Section icon="solar:upload-bold" color="warning.main" title={`Đang đăng (${data.publishing.length})`}>
              {data.publishing.slice(0, MAX_ROWS).map((p) => (
                <Row key={p.id} primary={`${p.account} · ${p.title || 'Bài đăng'}`} secondary={p.device} />
              ))}
            </Section>
          )}

          {data.scheduled.length > 0 && (
            <Section icon="solar:clock-circle-bold" color="text.secondary" title={`Chờ đăng (${data.scheduled.length})`}>
              {data.scheduled.slice(0, MAX_ROWS).map((p) => (
                <Row key={p.id} primary={`${p.account} · ${p.title || 'Bài đăng'}`} secondary={hhmm(p.scheduledAt)} />
              ))}
              {data.scheduled.length > MAX_ROWS && (
                <Typography variant="caption" color="text.secondary">
                  +{data.scheduled.length - MAX_ROWS} bài nữa…
                </Typography>
              )}
            </Section>
          )}

          {data.drafting.length > 0 && (
            <Section icon="solar:magic-stick-3-bold" color="info.main" title={`Tạo nháp (${data.drafting.length})`}>
              {data.drafting.slice(0, MAX_ROWS).map((s) => (
                <Row key={s.id} primary={`${s.account} · ${s.url}`} secondary={s.label} />
              ))}
              {data.drafting.length > MAX_ROWS && (
                <Typography variant="caption" color="text.secondary">
                  +{data.drafting.length - MAX_ROWS} link nữa…
                </Typography>
              )}
            </Section>
          )}

          {data.media.length > 0 && (
            <Section icon="solar:videocamera-record-bold" color="secondary.main" title={`Vietsub / Lồng tiếng (${data.media.length})`}>
              {data.media.slice(0, MAX_ROWS).map((m) => (
                <Box key={m.postId} sx={{ minWidth: 0 }}>
                  <Row primary={`${m.account} · ${m.title}`} secondary={`${Math.round(m.percent)}%`} />
                  <LinearProgress variant="determinate" value={m.percent} sx={{ height: 4, borderRadius: 1 }} />
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {m.label}
                  </Typography>
                </Box>
              ))}
            </Section>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}
