'use client';

import { m } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
// @mui
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import List from '@mui/material/List';
import Stack from '@mui/material/Stack';
import Badge from '@mui/material/Badge';
import Drawer from '@mui/material/Drawer';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
// hooks
import { useBoolean } from 'src/hooks/use-boolean';
import { useResponsive } from 'src/hooks/use-responsive';
// components
import Label from 'src/components/label';
import Iconify from 'src/components/iconify';
import Scrollbar from 'src/components/scrollbar';
import { varHover } from 'src/components/animate';
//
import NotificationItem from './notification-item';

// ----------------------------------------------------------------------

const TABS = [
  {
    value: 'all',
    label: 'Tất cả',
  },
  {
    value: 'unread',
    label: 'Chưa đọc',
  },
  {
    value: 'archived',
    label: 'Lưu trữ',
  },
];

// ----------------------------------------------------------------------

export default function NotificationsPopover() {
  const drawer = useBoolean();

  const smUp = useResponsive('up', 'sm');

  const [currentTab, setCurrentTab] = useState('all');

  const handleChangeTab = useCallback((event: React.SyntheticEvent, newValue: string) => {
    setCurrentTab(newValue);
  }, []);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    const token = sessionStorage.getItem('accessToken') || '';

    if (!token) return;

    const response = await fetch(`/api/notifications/?status=${currentTab === 'archived' ? 'archived' : 'active'}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await response.json();

    if (response.ok) {
      setNotifications(Array.isArray(body.data) ? body.data : []);
      setUnreadCount(Number(body.unreadCount || 0));
    }
  }, [currentTab]);

  useEffect(() => {
    loadNotifications().catch(() => undefined);
  }, [loadNotifications]);

  const visibleNotifications = notifications.filter((item) => currentTab !== 'unread' || item.isUnRead);
  const totalUnRead = unreadCount;

  const updateNotification = useCallback(
    async (payload: Record<string, unknown>) => {
      const token = sessionStorage.getItem('accessToken') || '';

      if (!token) return;

      await fetch('/api/notifications/', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      await loadNotifications();
    },
    [loadNotifications]
  );

  const handleMarkAllAsRead = () => updateNotification({ action: 'mark_all_read' });

  const handleMarkAsRead = (id: string) => updateNotification({ action: 'mark_read', id });

  const renderHead = (
    <Stack direction="row" alignItems="center" sx={{ py: 2, pl: 2.5, pr: 1, minHeight: 68 }}>
      <Typography variant="h6" sx={{ flexGrow: 1 }}>
        Thông báo
      </Typography>

      {!!totalUnRead && (
        <Tooltip title="Đánh dấu tất cả đã đọc">
          <IconButton color="primary" onClick={handleMarkAllAsRead}>
            <Iconify icon="eva:done-all-fill" />
          </IconButton>
        </Tooltip>
      )}

      {!smUp && (
        <IconButton onClick={drawer.onFalse}>
          <Iconify icon="mingcute:close-line" />
        </IconButton>
      )}
    </Stack>
  );

  const renderTabs = (
    <Tabs value={currentTab} onChange={handleChangeTab}>
      {TABS.map((tab) => (
        <Tab
          key={tab.value}
          iconPosition="end"
          value={tab.value}
          label={tab.label}
          icon={
            <Label
              variant={((tab.value === 'all' || tab.value === currentTab) && 'filled') || 'soft'}
              color={(tab.value === 'unread' && 'info') || (tab.value === 'archived' && 'success') || 'default'}
            >
              {tab.value === 'unread' ? totalUnRead : visibleNotifications.length}
            </Label>
          }
          sx={{
            '&:not(:last-of-type)': {
              mr: 3,
            },
          }}
        />
      ))}
    </Tabs>
  );

  const renderList = (
    <Scrollbar>
      <List disablePadding>
        {visibleNotifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} onClick={() => handleMarkAsRead(notification.id)} />
        ))}
        {!visibleNotifications.length && (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Chưa có thông báo.
            </Typography>
          </Box>
        )}
      </List>
    </Scrollbar>
  );

  return (
    <>
      <IconButton
        component={m.button}
        whileTap="tap"
        whileHover="hover"
        variants={varHover(1.05)}
        color={drawer.value ? 'primary' : 'default'}
        onClick={drawer.onTrue}
      >
        <Badge badgeContent={totalUnRead} color="error">
          <Iconify icon="solar:bell-bing-bold-duotone" width={24} />
        </Badge>
      </IconButton>

      <Drawer
        open={drawer.value}
        onClose={drawer.onFalse}
        anchor="right"
        slotProps={{
          backdrop: { invisible: true },
        }}
        PaperProps={{
          sx: { width: 1, maxWidth: 420 },
        }}
      >
        {renderHead}

        <Divider />

        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ pl: 2.5, pr: 1 }}
        >
          {renderTabs}
          <IconButton onClick={handleMarkAllAsRead}>
            <Iconify icon="solar:settings-bold-duotone" />
          </IconButton>
        </Stack>

        <Divider />

        {renderList}

        <Box sx={{ p: 1 }}>
          <Button fullWidth size="large">
            Xem tất cả
          </Button>
        </Box>
      </Drawer>
    </>
  );
}
