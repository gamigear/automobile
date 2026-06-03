// @mui
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
// utils
import { fToNow } from 'src/utils/format-time';
// components
import Label from 'src/components/label';
import Iconify from 'src/components/iconify';

// ----------------------------------------------------------------------

type NotificationItemProps = {
  notification: {
    id: string;
    title: string;
    message?: string;
    category: string;
    createdAt: Date;
    isUnRead: boolean;
    type: string;
    severity?: string;
    avatarUrl: string | null;
    href?: string;
  };
  onClick?: () => void;
};

function notificationIcon(type: string) {
  if (type.includes('device')) return 'solar:monitor-bold-duotone';
  if (type.includes('post')) return 'solar:document-text-bold-duotone';
  if (type.includes('media')) return 'solar:gallery-bold-duotone';
  if (type.includes('job')) return 'solar:settings-bold-duotone';
  if (type.includes('verify')) return 'solar:shield-check-bold-duotone';

  return 'solar:bell-bing-bold-duotone';
}

function severityColor(severity?: string) {
  if (severity === 'success') return 'success';
  if (severity === 'warning') return 'warning';
  if (severity === 'error') return 'error';

  return 'info';
}

export default function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const renderAvatar = (
    <ListItemAvatar>
      {notification.avatarUrl ? (
        <Avatar src={notification.avatarUrl} sx={{ bgcolor: 'background.neutral' }} />
      ) : (
        <Stack
          alignItems="center"
          justifyContent="center"
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            bgcolor: 'background.neutral',
          }}
        >
          <Iconify icon={notificationIcon(notification.type)} width={24} />
        </Stack>
      )}
    </ListItemAvatar>
  );

  const renderText = (
    <ListItemText
      disableTypography
      primary={reader(notification.title)}
      secondary={
        <Stack spacing={0.75}>
          {!!notification.message && (
            <Typography variant="body2" color="text.secondary">
              {notification.message}
            </Typography>
          )}
          <Stack
            direction="row"
            alignItems="center"
            sx={{ typography: 'caption', color: 'text.disabled' }}
            divider={<Box sx={{ width: 2, height: 2, bgcolor: 'currentColor', mx: 0.5, borderRadius: '50%' }} />}
          >
            {fToNow(notification.createdAt)}
            {notification.category}
            <Label variant="soft" color={severityColor(notification.severity) as any}>
              {notification.severity || 'info'}
            </Label>
          </Stack>
        </Stack>
      }
    />
  );

  const renderUnReadBadge = notification.isUnRead && (
    <Box
      sx={{
        top: 26,
        width: 8,
        height: 8,
        right: 20,
        borderRadius: '50%',
        bgcolor: 'info.main',
        position: 'absolute',
      }}
    />
  );

  return (
    <ListItemButton
      disableRipple
      component={notification.href ? 'a' : 'div'}
      href={notification.href || undefined}
      onClick={onClick}
      sx={{
        p: 2.5,
        alignItems: 'flex-start',
        borderBottom: (theme) => `dashed 1px ${theme.palette.divider}`,
      }}
    >
      {renderUnReadBadge}

      {renderAvatar}

      <Stack sx={{ flexGrow: 1 }}>
        {renderText}
        {!!notification.href && (
          <Button size="small" variant="outlined" sx={{ mt: 1.5, alignSelf: 'flex-start' }}>
            Mở chi tiết
          </Button>
        )}
      </Stack>
    </ListItemButton>
  );
}

// ----------------------------------------------------------------------

function reader(data: string) {
  return (
    <Box
      dangerouslySetInnerHTML={{ __html: data }}
      sx={{
        mb: 0.5,
        '& p': { typography: 'body2', m: 0 },
        '& a': { color: 'inherit', textDecoration: 'none' },
        '& strong': { typography: 'subtitle2' },
      }}
    />
  );
}
