import { type ComponentType, type ReactNode } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getGetAuthQueryKey, useGetAuth } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Shell } from '@/components/shell';
import { ErrorBox, Logo } from '@/components/mz-ui';
import { ThemeProvider } from '@/lib/theme';
import NotFound from '@/pages/not-found';
import LoginPage from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import ChannelsPage from '@/pages/channels';
import RoutingPage from '@/pages/routing';
import MessagesPage from '@/pages/messages';
import LogsPage from '@/pages/logs';
import MarketPage from '@/pages/market';
import TranslationPage from '@/pages/translation';
import SettingsPage from '@/pages/settings';
import PreviewPage from '@/pages/preview';
import ServicesPage from '@/pages/services';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const isUnauthorized = (e: unknown) => (e as { status?: number } | null)?.status === 401;

const queryClient: QueryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  queryCache: new QueryCache({
    onError: (e, q) => {
      if (isUnauthorized(e) && q.queryKey[0] !== getGetAuthQueryKey()[0]) {
        queryClient.invalidateQueries({ queryKey: getGetAuthQueryKey() });
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (e) => {
      if (isUnauthorized(e)) queryClient.invalidateQueries({ queryKey: getGetAuthQueryKey() });
    },
  }),
});

function Protected({ children }: { children: ReactNode }) {
  const auth = useGetAuth({ query: { queryKey: getGetAuthQueryKey(), retry: false, staleTime: 30000 } });
  if (auth.isLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center" aria-busy="true" aria-label="جارٍ التحميل">
        <div className="animate-pulse"><Logo size={56} /></div>
      </div>
    );
  }
  if (auth.isError) {
    return <div className="mx-auto max-w-md p-6 pt-24"><ErrorBox error={auth.error} onRetry={() => auth.refetch()} /></div>;
  }
  if (!auth.data?.authenticated) return <Redirect to="/login" />;
  return <Shell>{children}</Shell>;
}

const guard = (C: ComponentType) => () => (
  <Protected>
    <C />
  </Protected>
);

const SourcesRoute = guard(() => <ChannelsPage kind="source" />);
const DestinationsRoute = guard(() => <ChannelsPage kind="destination" />);
const DashRoute = guard(Dashboard);
const RoutingRoute = guard(RoutingPage);
const MessagesRoute = guard(MessagesPage);
const LogsRoute = guard(LogsPage);
const MarketRoute = guard(MarketPage);
const TranslationRoute = guard(TranslationPage);
const SettingsRoute = guard(SettingsPage);
const PreviewRoute = guard(PreviewPage);
const ServicesRoute = guard(ServicesPage);

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/" component={DashRoute} />
        <Route path="/sources" component={SourcesRoute} />
        <Route path="/destinations" component={DestinationsRoute} />
        <Route path="/routing" component={RoutingRoute} />
        <Route path="/messages" component={MessagesRoute} />
        <Route path="/logs" component={LogsRoute} />
        <Route path="/market" component={MarketRoute} />
        <Route path="/translation" component={TranslationRoute} />
        <Route path="/settings" component={SettingsRoute} />
        <Route path="/preview" component={PreviewRoute} />
        <Route path="/services" component={ServicesRoute} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
