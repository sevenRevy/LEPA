import { StrictMode } from 'react';
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

function watchRouteChanges(onChange: () => void) {
  let previousHref = globalThis.location.href;

  const notifyWhenChanged = () => {
    const nextHref = globalThis.location.href;
    if (nextHref === previousHref) {
      return;
    }

    previousHref = nextHref;
    onChange();
  };

  const observer = new MutationObserver(() => {
    notifyWhenChanged();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  globalThis.addEventListener('popstate', notifyWhenChanged);
  globalThis.addEventListener('hashchange', notifyWhenChanged);

  const timer = globalThis.setInterval(notifyWhenChanged, 500);

  return () => {
    observer.disconnect();
    globalThis.removeEventListener('popstate', notifyWhenChanged);
    globalThis.removeEventListener('hashchange', notifyWhenChanged);
    globalThis.clearInterval(timer);
  };
}

async function createDetectorUi(ctx: ContentScriptContext): Promise<ShadowRootContentScriptUi<Root>> {
  console.info('[low-effort-post-alarm] shadow:create:start');
  const ui = await createShadowRootUi<Root>(ctx, {
    name: 'low-effort-post-alarm',
    position: 'inline',
    anchor: 'body',
    isolateEvents: true,
    onMount(container: HTMLElement) {
      console.info('[low-effort-post-alarm] shadow:onMount', {
        childCount: container.childElementCount,
        tagName: container.tagName,
      });
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
      console.info('[low-effort-post-alarm] react:root-created');
      root.render(
        <StrictMode>
          <DetectorProvider>
            <DetectorPanel />
          </DetectorProvider>
        </StrictMode>,
      );
      console.info('[low-effort-post-alarm] react:render-dispatched');

      return root;
    },
    onRemove(root: Root | undefined) {
      console.info('[low-effort-post-alarm] shadow:onRemove', {
        hasRoot: Boolean(root),
      });
      root?.unmount();
    },
  });
  console.info('[low-effort-post-alarm] shadow:create:done');

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
    console.info('[low-effort-post-alarm] content script starting on', globalThis.location.href);
    console.info('[low-effort-post-alarm] dom:ready', {
      body: Boolean(document.body),
      readyState: document.readyState,
    });

    let ui: ShadowRootContentScriptUi<Root> | null = null;
    let uiPromise: Promise<ShadowRootContentScriptUi<Root>> | null = null;
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
      const activePath = globalThis.location.pathname;
      const canRunOnRoute = shouldRunOnPath(activePath);

      console.info('[low-effort-post-alarm] route:sync', {
        canRunOnRoute,
        pathname: activePath,
      });

      if (!canRunOnRoute) {
        ui?.remove();
        return;
      }

      const detectorUi = await ensureUi();
      if (currentVersion !== syncVersion || !shouldRunOnPath(globalThis.location.pathname)) {
        return;
      }

      if (detectorUi.mounted) {
        return;
      }

      console.info('[low-effort-post-alarm] shadow:mount:start');
      detectorUi.mount();
      console.info('[low-effort-post-alarm] shadow:mount:done', {
        hostConnected: detectorUi.shadowHost.isConnected,
      });

      globalThis.setTimeout(() => {
        console.info('[low-effort-post-alarm] shadow:post-mount-check', {
          hostConnected: detectorUi.shadowHost.isConnected,
          hostTag: detectorUi.shadowHost.tagName,
          root: detectorUi.shadow.getElementById('low-effort-post-alarm-root') ? 'found' : 'missing',
          rootChildren: detectorUi.uiContainer.childElementCount,
        });
      }, 1500);
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
