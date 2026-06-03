import { useEffect, useState } from 'react';
// routes
import { paths } from 'src/routes/paths';
// components
import { SplashScreen } from 'src/components/loading-screen';
//
import { useAuthContext } from '../hooks';

// ----------------------------------------------------------------------

const loginPaths: Record<string, string> = {
  jwt: paths.auth.jwt.login,
  auth0: paths.auth.auth0.login,
  amplify: paths.auth.amplify.login,
  firebase: paths.auth.firebase.login,
};

// ----------------------------------------------------------------------

type AuthGuardProps = {
  children: React.ReactNode;
};

export default function AuthGuard({ children }: AuthGuardProps) {
  const { loading, authenticated, unauthenticated, method } = useAuthContext();

  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (unauthenticated) {
      const searchParams = new URLSearchParams({ returnTo: window.location.href }).toString();
      const loginPath = loginPaths[method];

      window.location.replace(`${loginPath}?${searchParams}`);
      setChecked(false);

      return;
    }

    if (authenticated) {
      setChecked(true);
    } else {
      setChecked(false);
    }
  }, [authenticated, loading, method, unauthenticated]);

  if (!checked) {
    return <SplashScreen />;
  }

  return <>{children}</>;
}
