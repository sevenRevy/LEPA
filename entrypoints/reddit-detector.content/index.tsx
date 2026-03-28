import ReactDOM, { type Root } from 'react-dom/client';
import { ContentScriptContext } from 'wxt/utils/content-script-context';
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';

import '@/assets/ui.css';
import { REDDIT_PAGE_MATCHES } from '@/features/reddit-detector/config';
import { shouldRunOnPath } from '@/features/reddit-detector/api';
import { DetectorPanel } from '@/features/reddit-detector/components/detector-panel';
import { DetectorProvider } from '@/features/reddit-detector/components/detector-root';

function renderMountError(error: unknown) {
  console.error('[low-effort-post-alarm] failed to mount content script', error);

  const existing = document.getElementById('low-effort-post-alarm-fallback');
  if (existing) {
    return;
  }

  const fallback = document.createElement('div');
  fallback.id = 'low-effort-post-alarm-fallback';
  fallback.textContent = 'Low-Effort Post Alarm failed to mount';
  Object.assign(fallback.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    padding: '10px 14px',
    borderRadius: '999px',
    background: 'rgba(127, 29, 29, 0.94)',
    color: '#fff',
    font: '600 12px/1.2 system-ui, sans-serif',
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
  });

  document.documentElement.append(fallback);
}

function getSameOriginLinkHref(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest('a[href]');
  if (!anchor) {
    return null;
  }

  const href = anchor.getAttribute('href');
  if (!href) {
    return null;
  }

  const nextUrl = new URL(href, globalThis.location.href);
  return nextUrl.origin === globalThis.location.origin ? nextUrl.href : null;
}

function watchRouteChanges(onChange: () => void) {
  let previousHref = globalThis.location.href;
  let scheduledCheck: ReturnType<typeof globalThis.setTimeout> | null = null;

  const notifyWhenChanged = () => {
    const nextHref = globalThis.location.href;
    if (nextHref === previousHref) {
      return;
    }

    previousHref = nextHref;
    onChange();
  };

  const scheduleNotifyWhenChanged = (delayMs = 0) => {
    if (scheduledCheck !== null) {
      globalThis.clearTimeout(scheduledCheck);
    }

    scheduledCheck = globalThis.setTimeout(() => {
      scheduledCheck = null;
      notifyWhenChanged();
    }, delayMs);
  };

  const handleDocumentClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const nextHref = getSameOriginLinkHref(event.target);
    if (!nextHref || nextHref === previousHref) {
      return;
    }

    scheduleNotifyWhenChanged();
    scheduleNotifyWhenChanged(300);
  };

  const { history } = globalThis;
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = ((...args) => {
    originalPushState(...args);
    scheduleNotifyWhenChanged();
  }) as History['pushState'];

  history.replaceState = ((...args) => {
    originalReplaceState(...args);
    scheduleNotifyWhenChanged();
  }) as History['replaceState'];

  document.addEventListener('click', handleDocumentClick, true);
  globalThis.addEventListener('popstate', notifyWhenChanged);
  globalThis.addEventListener('hashchange', notifyWhenChanged);
  const fallbackTimer = globalThis.setInterval(notifyWhenChanged, 4_000);

  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    document.removeEventListener('click', handleDocumentClick, true);
    globalThis.removeEventListener('popstate', notifyWhenChanged);
    globalThis.removeEventListener('hashchange', notifyWhenChanged);
    globalThis.clearInterval(fallbackTimer);
    if (scheduledCheck !== null) {
      globalThis.clearTimeout(scheduledCheck);
    }
  };
}

async function createDetectorUi(ctx: ContentScriptContext): Promise<ShadowRootContentScriptUi<Root>> {
  const ui = await createShadowRootUi<Root>(ctx, {
    name: 'low-effort-post-alarm',
    position: 'inline',
    anchor: 'body',
    isolateEvents: true,
    onMount(container: HTMLElement) {
      const mountPoint = document.createElement('div');
      mountPoint.id = 'low-effort-post-alarm-root';
      Object.assign(mountPoint.style, {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: '2147483647',
        width: 'min(384px, calc(100vw - 16px))',
        maxWidth: 'calc(100vw - 16px)',
        display: 'block',
        pointerEvents: 'auto',
      });
      container.append(mountPoint);

      const root = ReactDOM.createRoot(mountPoint);
      root.render(
        <DetectorProvider>
          <DetectorPanel />
        </DetectorProvider>,
      );

      return root;
    },
    onRemove(root: Root | undefined) {
      root?.unmount();
    },
  });

  Object.assign(ui.shadowHost.style, {
    position: 'static',
    display: 'block',
    width: '0',
    height: '0',
  });

  Object.assign(ui.uiContainer.style, {
    position: 'static',
    display: 'block',
    width: '0',
    height: '0',
  });

  return ui;
}

export default defineContentScript({
  matches: REDDIT_PAGE_MATCHES,
  cssInjectionMode: 'ui',
  runAt: 'document_idle',
  async main(ctx: ContentScriptContext) {
    let ui: ShadowRootContentScriptUi<Root> | null = null;
    let uiPromise: Promise<ShadowRootContentScriptUi<Root>> | null = null;
    let mountedHref: string | null = null;
    let syncVersion = 0;

    const ensureUi = async () => {
      if (ui) {
        return ui;
      }

      if (!uiPromise) {
        uiPromise = createDetectorUi(ctx)
          .then((createdUi) => {
            ui = createdUi;
            return createdUi;
          })
          .catch((error) => {
            uiPromise = null;
            throw error;
          });
      }

      return uiPromise;
    };

    const syncUiForRoute = async () => {
      const currentVersion = ++syncVersion;
      const activeHref = globalThis.location.href;
      const activePath = globalThis.location.pathname;
      const canRunOnRoute = shouldRunOnPath(activePath);

      if (!canRunOnRoute) {
        ui?.remove();
        mountedHref = null;
        return;
      }

      const detectorUi = await ensureUi();
      if (currentVersion !== syncVersion || !shouldRunOnPath(globalThis.location.pathname)) {
        return;
      }

      if (detectorUi.mounted && mountedHref === activeHref) {
        return;
      }

      if (detectorUi.mounted) {
        detectorUi.remove();
      }

      detectorUi.mount();
      mountedHref = activeHref;
    };

    try {
      const stopWatchingRoutes = watchRouteChanges(() => {
        void syncUiForRoute().catch(renderMountError);
      });
      ctx.onInvalidated(stopWatchingRoutes);

      await syncUiForRoute();
    } catch (error) {
      renderMountError(error);
    }
  },
});
