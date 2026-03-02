/**
 * BrowserUI — The main browser interface with tabs, address bar, content frame,
 * bookmarks, history panel, settings panel, and keyboard shortcuts.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Plus,
  X,
  Star,
  StarOff,
  Search,
  Clock,
  Settings,
  Bookmark,
  ChevronDown,
  Globe,
  Shield,
  ZoomIn,
  ZoomOut,
  Copy,
  Trash2,
  User,
  Palette,
  Monitor,
} from 'lucide-react';
import {
  useRmhBrowserStore,
  NEW_TAB_URL,
  type BrowserTab,
  type BrowserTheme,
  type SearchEngine,
} from '@/lib/rmhbrowser/store';
import { toast } from '@/lib/rmhbrowser/toast-store';

/* ─── Quick Links for New Tab ───────────────────────────────────── */

const QUICK_LINKS = [
  { title: 'Google', url: 'https://www.google.com/webhp?igu=1', icon: '🔍' },
  { title: 'Wikipedia', url: 'https://en.m.wikipedia.org/', icon: '📚' },
  { title: 'Reddit', url: 'https://old.reddit.com', icon: '💬' },
  { title: 'GitHub', url: 'https://github.com', icon: '🐙' },
  { title: 'YouTube', url: 'https://www.youtube.com', icon: '▶️' },
  { title: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '📋' },
  { title: 'MDN Docs', url: 'https://developer.mozilla.org', icon: '📖' },
  { title: 'Hacker News', url: 'https://news.ycombinator.com', icon: '🗞️' },
];

const THEME_LABELS: Record<BrowserTheme, string> = {
  dark: 'Dark',
  light: 'Light',
  ocean: 'Ocean',
  sunset: 'Sunset',
  forest: 'Forest',
};

const THEME_COLORS: Record<BrowserTheme, string> = {
  dark: '#6366f1',
  light: '#4f46e5',
  ocean: '#64ffda',
  sunset: '#f97316',
  forest: '#22c55e',
};

const ENGINE_LABELS: Record<SearchEngine, string> = {
  google: 'Google',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
};

const PROFILE_COLORS = ['#6366f1', '#ef4444', '#f97316', '#22c55e', '#06b6d4', '#ec4899', '#8b5cf6'];

/** Scale factor for zoom: width/height = ZOOM_BASE / zoomLevel percent */
const ZOOM_BASE = 10000;

/* ─── Helper: display URL prettily ──────────────────────────────── */

function displayUrl(url: string): string {
  if (url === NEW_TAB_URL) return '';
  try {
    const u = new URL(url);
    return u.host + (u.pathname !== '/' ? u.pathname : '') + u.search;
  } catch {
    return url;
  }
}

function tabTitle(tab: BrowserTab): string {
  if (tab.url === NEW_TAB_URL) return 'New Tab';
  if (tab.title && tab.title !== tab.url) return tab.title;
  try {
    return new URL(tab.url).hostname;
  } catch {
    return tab.url.slice(0, 30);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   NEW TAB PAGE
   ═══════════════════════════════════════════════════════════════════ */

function NewTabPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [search, setSearch] = useState('');
  const searchEngine = useRmhBrowserStore((s) => s.settings.searchEngine);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = () => {
    if (search.trim()) {
      onNavigate(search.trim());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-4 py-16" style={{ backgroundColor: 'var(--rb-bg)' }}>
      <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--rb-accent)' }}>
        RMHbrowser
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--rb-text-muted)' }}>
        Fast, simple, and secure browsing
      </p>

      {/* Search Box */}
      <div
        className="flex items-center gap-2 w-full max-w-xl rounded-full px-5 py-3 mb-10"
        style={{
          backgroundColor: 'var(--rb-surface)',
          border: '1px solid var(--rb-border)',
        }}
      >
        <Search className="h-5 w-5 shrink-0" style={{ color: 'var(--rb-text-muted)' }} />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={`Search with ${ENGINE_LABELS[searchEngine]} or type a URL`}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: 'var(--rb-text)' }}
        />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-4 gap-4 w-full max-w-lg">
        {QUICK_LINKS.map((link) => (
          <button
            key={link.url}
            onClick={() => onNavigate(link.url)}
            className="rmhbrowser-quick-link flex flex-col items-center gap-2 rounded-xl p-4"
            style={{ backgroundColor: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}
          >
            <span className="text-2xl">{link.icon}</span>
            <span className="text-xs truncate w-full text-center" style={{ color: 'var(--rb-text-muted)' }}>
              {link.title}
            </span>
          </button>
        ))}
      </div>

      {/* Keyboard Shortcuts Hint */}
      <div className="mt-12 text-xs space-y-1 text-center" style={{ color: 'var(--rb-text-dim)' }}>
        <p>
          <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>Ctrl+T</kbd> New Tab
          {' · '}
          <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>Ctrl+W</kbd> Close Tab
          {' · '}
          <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>Ctrl+L</kbd> Address Bar
        </p>
        <p>
          <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>Ctrl+F</kbd> Find
          {' · '}
          <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>Ctrl+D</kbd> Bookmark
          {' · '}
          <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--rb-surface)', border: '1px solid var(--rb-border)' }}>Ctrl+H</kbd> History
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   HISTORY PANEL
   ═══════════════════════════════════════════════════════════════════ */

function HistoryPanel() {
  const history = useRmhBrowserStore((s) => s.history);
  const clearHistory = useRmhBrowserStore((s) => s.clearHistory);
  const toggleHistory = useRmhBrowserStore((s) => s.toggleHistory);
  const activeTabId = useRmhBrowserStore((s) => s.activeTabId);
  const navigateTo = useRmhBrowserStore((s) => s.navigateTo);
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? history.filter(
        (h) =>
          h.url.toLowerCase().includes(filter.toLowerCase()) ||
          h.title.toLowerCase().includes(filter.toLowerCase()),
      )
    : history;

  return (
    <div
      className="rmhbrowser-panel absolute right-0 top-0 bottom-0 w-80 z-50 flex flex-col border-l"
      style={{ backgroundColor: 'var(--rb-surface)', borderColor: 'var(--rb-border)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--rb-border)' }}>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" style={{ color: 'var(--rb-accent)' }} />
          <span className="text-sm font-semibold">History</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              clearHistory();
              toast.success('History cleared');
            }}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--rb-text-muted)' }}
            title="Clear history"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={toggleHistory} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--rb-text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-3 py-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search history..."
          className="w-full rounded-md px-3 py-1.5 text-xs outline-none"
          style={{
            backgroundColor: 'var(--rb-addressbar-bg)',
            border: '1px solid var(--rb-border)',
            color: 'var(--rb-text)',
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--rb-text-dim)' }}>
            {filter ? 'No matches found' : 'No history yet'}
          </p>
        ) : (
          filtered.map((entry) => (
            <button
              key={entry.id}
              onClick={() => {
                navigateTo(activeTabId, entry.url);
                toggleHistory();
              }}
              className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors hover:bg-[var(--rb-surface-hover)]"
            >
              <Globe className="h-3 w-3 shrink-0" style={{ color: 'var(--rb-text-dim)' }} />
              <div className="flex-1 min-w-0">
                <p className="truncate" style={{ color: 'var(--rb-text)' }}>{entry.title}</p>
                <p className="truncate" style={{ color: 'var(--rb-text-dim)' }}>{displayUrl(entry.url)}</p>
              </div>
              <span className="shrink-0 text-[10px]" style={{ color: 'var(--rb-text-dim)' }}>
                {new Date(entry.visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SETTINGS PANEL
   ═══════════════════════════════════════════════════════════════════ */

function SettingsPanel() {
  const settings = useRmhBrowserStore((s) => s.settings);
  const profiles = useRmhBrowserStore((s) => s.profiles);
  const activeProfileId = useRmhBrowserStore((s) => s.activeProfileId);
  const setTheme = useRmhBrowserStore((s) => s.setTheme);
  const setSearchEngine = useRmhBrowserStore((s) => s.setSearchEngine);
  const setZoom = useRmhBrowserStore((s) => s.setZoom);
  const toggleBookmarksBar = useRmhBrowserStore((s) => s.toggleBookmarksBar);
  const toggleSettings = useRmhBrowserStore((s) => s.toggleSettings);
  const addProfile = useRmhBrowserStore((s) => s.addProfile);
  const removeProfile = useRmhBrowserStore((s) => s.removeProfile);
  const switchProfile = useRmhBrowserStore((s) => s.switchProfile);

  const [newProfileName, setNewProfileName] = useState('');

  return (
    <div
      className="rmhbrowser-panel absolute right-0 top-0 bottom-0 w-80 z-50 flex flex-col border-l overflow-y-auto"
      style={{ backgroundColor: 'var(--rb-surface)', borderColor: 'var(--rb-border)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--rb-border)' }}>
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" style={{ color: 'var(--rb-accent)' }} />
          <span className="text-sm font-semibold">Settings</span>
        </div>
        <button onClick={toggleSettings} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--rb-text-muted)' }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Themes */}
        <section>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--rb-text-muted)' }}>
            <Palette className="h-3.5 w-3.5" /> Theme
          </h3>
          <div className="grid grid-cols-5 gap-2">
            {(Object.keys(THEME_LABELS) as BrowserTheme[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className="flex flex-col items-center gap-1 rounded-lg p-2 transition-colors"
                style={{
                  backgroundColor: settings.theme === t ? 'var(--rb-accent-dim)' : 'transparent',
                  border: `1px solid ${settings.theme === t ? 'var(--rb-accent)' : 'var(--rb-border)'}`,
                }}
              >
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: THEME_COLORS[t] }} />
                <span className="text-[10px]" style={{ color: settings.theme === t ? 'var(--rb-accent)' : 'var(--rb-text-muted)' }}>
                  {THEME_LABELS[t]}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Profiles */}
        <section>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--rb-text-muted)' }}>
            <User className="h-3.5 w-3.5" /> Profiles
          </h3>
          <div className="space-y-2">
            {profiles.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{
                  backgroundColor: p.id === activeProfileId ? 'var(--rb-accent-dim)' : 'var(--rb-bg-subtle)',
                  border: `1px solid ${p.id === activeProfileId ? 'var(--rb-accent)' : 'var(--rb-border)'}`,
                }}
              >
                <div className="h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: p.color }}>
                  {p.name[0]}
                </div>
                <span className="flex-1 text-xs font-medium truncate">{p.name}</span>
                {p.id !== activeProfileId && (
                  <button
                    onClick={() => switchProfile(p.id)}
                    className="text-[10px] px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: 'var(--rb-surface-hover)', color: 'var(--rb-text-muted)' }}
                  >
                    Switch
                  </button>
                )}
                {p.id !== 'profile-default' && (
                  <button onClick={() => removeProfile(p.id)} className="p-1 rounded" style={{ color: 'var(--rb-danger)' }}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {/* Add Profile */}
            <div className="flex items-center gap-2 mt-2">
              <input
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="New profile name"
                className="flex-1 text-xs rounded-md px-2 py-1.5 outline-none"
                style={{
                  backgroundColor: 'var(--rb-addressbar-bg)',
                  border: '1px solid var(--rb-border)',
                  color: 'var(--rb-text)',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newProfileName.trim()) {
                    const color = PROFILE_COLORS[profiles.length % PROFILE_COLORS.length];
                    addProfile(newProfileName.trim(), color, settings.theme);
                    setNewProfileName('');
                    toast.success(`Profile "${newProfileName.trim()}" created`);
                  }
                }}
              />
              <button
                onClick={() => {
                  if (!newProfileName.trim()) return;
                  const color = PROFILE_COLORS[profiles.length % PROFILE_COLORS.length];
                  addProfile(newProfileName.trim(), color, settings.theme);
                  setNewProfileName('');
                  toast.success(`Profile "${newProfileName.trim()}" created`);
                }}
                className="p-1.5 rounded-md"
                style={{ backgroundColor: 'var(--rb-accent)', color: '#fff' }}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* Search Engine */}
        <section>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--rb-text-muted)' }}>
            <Search className="h-3.5 w-3.5" /> Search Engine
          </h3>
          <div className="space-y-1">
            {(Object.keys(ENGINE_LABELS) as SearchEngine[]).map((e) => (
              <button
                key={e}
                onClick={() => setSearchEngine(e)}
                className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors"
                style={{
                  backgroundColor: settings.searchEngine === e ? 'var(--rb-accent-dim)' : 'transparent',
                  color: settings.searchEngine === e ? 'var(--rb-accent)' : 'var(--rb-text)',
                }}
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: settings.searchEngine === e ? 'var(--rb-accent)' : 'var(--rb-border-bright)',
                  }}
                />
                {ENGINE_LABELS[e]}
              </button>
            ))}
          </div>
        </section>

        {/* Zoom */}
        <section>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--rb-text-muted)' }}>
            <Monitor className="h-3.5 w-3.5" /> Display
          </h3>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--rb-bg-subtle)', border: '1px solid var(--rb-border)' }}>
            <button onClick={() => setZoom(settings.zoomLevel - 10)} disabled={settings.zoomLevel <= 50} className="p-1 rounded disabled:opacity-30" style={{ color: 'var(--rb-text-muted)' }}>
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="flex-1 text-center text-xs font-medium">{settings.zoomLevel}%</span>
            <button onClick={() => setZoom(settings.zoomLevel + 10)} disabled={settings.zoomLevel >= 200} className="p-1 rounded disabled:opacity-30" style={{ color: 'var(--rb-text-muted)' }}>
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Toggles */}
        <section>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--rb-text-muted)' }}>
            <Shield className="h-3.5 w-3.5" /> Preferences
          </h3>
          <label className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer" style={{ backgroundColor: 'var(--rb-bg-subtle)', border: '1px solid var(--rb-border)' }}>
            <span className="text-xs">Show bookmarks bar</span>
            <input type="checkbox" checked={settings.showBookmarksBar} onChange={toggleBookmarksBar} className="accent-[var(--rb-accent)]" />
          </label>
        </section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN BROWSER UI
   ═══════════════════════════════════════════════════════════════════ */

export default function BrowserUI() {
  const tabs = useRmhBrowserStore((s) => s.tabs);
  const activeTabId = useRmhBrowserStore((s) => s.activeTabId);
  const settings = useRmhBrowserStore((s) => s.settings);
  const bookmarks = useRmhBrowserStore((s) => s.bookmarks);
  const showHistory = useRmhBrowserStore((s) => s.showHistory);
  const showSettings = useRmhBrowserStore((s) => s.showSettings);
  const showFind = useRmhBrowserStore((s) => s.showFind);
  const findText = useRmhBrowserStore((s) => s.findText);

  const addTab = useRmhBrowserStore((s) => s.addTab);
  const closeTab = useRmhBrowserStore((s) => s.closeTab);
  const switchTab = useRmhBrowserStore((s) => s.switchTab);
  const navigateTo = useRmhBrowserStore((s) => s.navigateTo);
  const goBack = useRmhBrowserStore((s) => s.goBack);
  const goForward = useRmhBrowserStore((s) => s.goForward);
  const reload = useRmhBrowserStore((s) => s.reload);
  const updateTabTitle = useRmhBrowserStore((s) => s.updateTabTitle);
  const addBookmark = useRmhBrowserStore((s) => s.addBookmark);
  const removeBookmark = useRmhBrowserStore((s) => s.removeBookmark);
  const toggleHistory = useRmhBrowserStore((s) => s.toggleHistory);
  const toggleSettings = useRmhBrowserStore((s) => s.toggleSettings);
  const toggleFind = useRmhBrowserStore((s) => s.toggleFind);
  const setFindText = useRmhBrowserStore((s) => s.setFindText);
  const duplicateTab = useRmhBrowserStore((s) => s.duplicateTab);

  const addressRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [addressValue, setAddressValue] = useState('');
  const [tabContextMenu, setTabContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  // Sync address bar with active tab
  useEffect(() => {
    if (activeTab) {
      setAddressValue(activeTab.url === NEW_TAB_URL ? '' : activeTab.url);
    }
  }, [activeTab?.id, activeTab?.url]);

  // Mark tab as loaded when iframe loads
  const handleIframeLoad = useCallback(() => {
    if (activeTab) {
      try {
        const doc = iframeRef.current?.contentDocument;
        const title = doc?.title;
        if (title) {
          updateTabTitle(activeTab.id, title);
        } else {
          updateTabTitle(activeTab.id, activeTab.url);
        }
      } catch {
        // Cross-origin — can't read title
        updateTabTitle(activeTab.id, activeTab.url);
      }
    }
  }, [activeTab, updateTabTitle]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 't') {
        e.preventDefault();
        addTab();
      } else if (ctrl && e.key === 'w') {
        e.preventDefault();
        closeTab(activeTabId);
      } else if (ctrl && e.key === 'l') {
        e.preventDefault();
        addressRef.current?.focus();
        addressRef.current?.select();
      } else if (ctrl && e.key === 'f') {
        e.preventDefault();
        toggleFind();
      } else if (ctrl && e.key === 'd') {
        e.preventDefault();
        handleBookmarkToggle();
      } else if (ctrl && e.key === 'h') {
        e.preventDefault();
        toggleHistory();
      } else if (ctrl && e.key === 'r') {
        e.preventDefault();
        reload(activeTabId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, addTab, closeTab, toggleFind, toggleHistory, reload]);

  // Close context menu on click
  useEffect(() => {
    if (!tabContextMenu) return;
    const close = () => setTabContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [tabContextMenu]);

  const handleAddressSubmit = () => {
    if (addressValue.trim()) {
      navigateTo(activeTabId, addressValue.trim());
    }
  };

  const handleBookmarkToggle = () => {
    if (!activeTab || activeTab.url === NEW_TAB_URL) return;
    const existing = bookmarks.find((b) => b.url === activeTab.url);
    if (existing) {
      removeBookmark(existing.id);
      toast.info('Bookmark removed');
    } else {
      addBookmark(tabTitle(activeTab), activeTab.url);
      toast.success('Bookmark added');
    }
  };

  const isCurrentBookmarked = activeTab ? bookmarks.some((b) => b.url === activeTab.url) : false;
  const canGoBack = activeTab ? activeTab.navIndex > 0 : false;
  const canGoForward = activeTab ? activeTab.navIndex < activeTab.navHistory.length - 1 : false;

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--rb-bg)' }}>
      {/* ─── Tab Bar ──────────────────────────────────────────── */}
      <div
        className="flex items-center gap-0 px-2 pt-2 shrink-0"
        style={{ backgroundColor: 'var(--rb-tab-bg)' }}
      >
        <div className="flex items-center flex-1 min-w-0 overflow-x-auto gap-0.5 no-scrollbar">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onContextMenu={(e) => {
                e.preventDefault();
                setTabContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
              }}
              onClick={() => switchTab(tab.id)}
              className={`rmhbrowser-tab group relative flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs max-w-[180px] min-w-[100px] select-none ${
                tab.id === activeTabId ? 'active' : ''
              }`}
              style={{
                backgroundColor: tab.id === activeTabId ? 'var(--rb-tab-active)' : 'transparent',
                color: tab.id === activeTabId ? 'var(--rb-text)' : 'var(--rb-text-muted)',
              }}
            >
              {tab.isLoading ? (
                <RotateCw className="h-3 w-3 shrink-0 animate-spin" style={{ color: 'var(--rb-accent)' }} />
              ) : (
                <Globe className="h-3 w-3 shrink-0" style={{ color: 'var(--rb-text-dim)' }} />
              )}
              <span className="flex-1 truncate">{tabTitle(tab)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--rb-surface-active)]"
                style={{ color: 'var(--rb-text-muted)' }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* New Tab Button */}
        <button
          onClick={() => addTab()}
          className="shrink-0 p-1.5 rounded-md mx-1 transition-colors hover:bg-[var(--rb-surface-hover)]"
          style={{ color: 'var(--rb-text-muted)' }}
          title="New Tab (Ctrl+T)"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Toolbar ──────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 shrink-0"
        style={{ backgroundColor: 'var(--rb-toolbar-bg)', borderBottom: '1px solid var(--rb-border)' }}
      >
        {/* Nav Buttons */}
        <button
          onClick={() => goBack(activeTabId)}
          disabled={!canGoBack}
          className="p-1.5 rounded-md transition-colors disabled:opacity-30 hover:bg-[var(--rb-surface-hover)]"
          style={{ color: 'var(--rb-text-muted)' }}
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => goForward(activeTabId)}
          disabled={!canGoForward}
          className="p-1.5 rounded-md transition-colors disabled:opacity-30 hover:bg-[var(--rb-surface-hover)]"
          style={{ color: 'var(--rb-text-muted)' }}
          title="Forward"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => reload(activeTabId)}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--rb-surface-hover)]"
          style={{ color: 'var(--rb-text-muted)' }}
          title="Reload (Ctrl+R)"
        >
          <RotateCw className="h-4 w-4" />
        </button>
        <button
          onClick={() => navigateTo(activeTabId, NEW_TAB_URL)}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--rb-surface-hover)]"
          style={{ color: 'var(--rb-text-muted)' }}
          title="Home"
        >
          <Home className="h-4 w-4" />
        </button>

        {/* Address Bar */}
        <div
          className="flex-1 flex items-center gap-2 rounded-full px-3 py-1"
          style={{
            backgroundColor: 'var(--rb-addressbar-bg)',
            border: '1px solid var(--rb-border)',
          }}
        >
          <Shield className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--rb-text-dim)' }} />
          <input
            ref={addressRef}
            value={addressValue}
            onChange={(e) => setAddressValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddressSubmit();
                addressRef.current?.blur();
              }
            }}
            onFocus={() => addressRef.current?.select()}
            placeholder="Search or enter URL"
            className="flex-1 bg-transparent outline-none text-xs"
            style={{ color: 'var(--rb-text)' }}
          />
          {addressValue && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(addressValue);
                toast.info('URL copied');
              }}
              className="p-0.5 rounded"
              style={{ color: 'var(--rb-text-dim)' }}
              title="Copy URL"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Right Actions */}
        <button
          onClick={handleBookmarkToggle}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--rb-surface-hover)]"
          style={{ color: isCurrentBookmarked ? 'var(--rb-warning)' : 'var(--rb-text-muted)' }}
          title="Bookmark (Ctrl+D)"
        >
          {isCurrentBookmarked ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
        </button>
        <button
          onClick={toggleHistory}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--rb-surface-hover)]"
          style={{ color: showHistory ? 'var(--rb-accent)' : 'var(--rb-text-muted)' }}
          title="History (Ctrl+H)"
        >
          <Clock className="h-4 w-4" />
        </button>
        <button
          onClick={toggleSettings}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--rb-surface-hover)]"
          style={{ color: showSettings ? 'var(--rb-accent)' : 'var(--rb-text-muted)' }}
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Bookmarks Bar ────────────────────────────────────── */}
      {settings.showBookmarksBar && (
        <div
          className="flex items-center gap-1 px-3 py-1 shrink-0 overflow-x-auto no-scrollbar"
          style={{ backgroundColor: 'var(--rb-toolbar-bg)', borderBottom: '1px solid var(--rb-border)' }}
        >
          <Bookmark className="h-3 w-3 shrink-0 mr-1" style={{ color: 'var(--rb-text-dim)' }} />
          {bookmarks.length === 0 ? (
            <span className="text-[10px]" style={{ color: 'var(--rb-text-dim)' }}>
              No bookmarks yet — press Ctrl+D to add one
            </span>
          ) : (
            bookmarks.map((bk) => (
              <button
                key={bk.id}
                onClick={() => navigateTo(activeTabId, bk.url)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  removeBookmark(bk.id);
                  toast.info(`"${bk.title}" removed`);
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors hover:bg-[var(--rb-surface-hover)] shrink-0"
                style={{ color: 'var(--rb-text-muted)' }}
                title={`${bk.title}\n${bk.url}\nRight-click to remove`}
              >
                <Globe className="h-3 w-3" style={{ color: 'var(--rb-text-dim)' }} />
                {bk.title}
              </button>
            ))
          )}
        </div>
      )}

      {/* ─── Find Bar ─────────────────────────────────────────── */}
      {showFind && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 shrink-0"
          style={{ backgroundColor: 'var(--rb-surface)', borderBottom: '1px solid var(--rb-border)' }}
        >
          <Search className="h-3.5 w-3.5" style={{ color: 'var(--rb-text-dim)' }} />
          <input
            autoFocus
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && toggleFind()}
            placeholder="Find on page..."
            className="flex-1 bg-transparent outline-none text-xs"
            style={{ color: 'var(--rb-text)' }}
          />
          <button onClick={toggleFind} className="p-1 rounded" style={{ color: 'var(--rb-text-muted)' }}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ─── Loading Bar ──────────────────────────────────────── */}
      {activeTab?.isLoading && (
        <div className="h-0.5 w-full shrink-0 overflow-hidden" style={{ backgroundColor: 'var(--rb-bg-subtle)' }}>
          <div className="rmhbrowser-loading-bar h-full absolute" style={{ backgroundColor: 'var(--rb-accent)' }} />
        </div>
      )}

      {/* ─── Content Area ─────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {activeTab?.url === NEW_TAB_URL ? (
          <NewTabPage onNavigate={(url) => navigateTo(activeTabId, url)} />
        ) : (
          <iframe
            ref={iframeRef}
            key={`${activeTab?.id}-${activeTab?.url}`}
            src={activeTab?.url}
            onLoad={handleIframeLoad}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
            className="w-full h-full border-0"
            style={{
              backgroundColor: '#fff',
              transform: `scale(${settings.zoomLevel / 100})`,
              transformOrigin: 'top left',
              width: `${ZOOM_BASE / settings.zoomLevel}%`,
              height: `${ZOOM_BASE / settings.zoomLevel}%`,
            }}
            title="Browser content"
          />
        )}

        {/* Side Panels */}
        {showHistory && <HistoryPanel />}
        {showSettings && <SettingsPanel />}
      </div>

      {/* ─── Status Bar ───────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-1 shrink-0 text-[10px]"
        style={{
          backgroundColor: 'var(--rb-tab-bg)',
          borderTop: '1px solid var(--rb-border)',
          color: 'var(--rb-text-dim)',
        }}
      >
        <span>{activeTab?.url === NEW_TAB_URL ? 'Ready' : displayUrl(activeTab?.url ?? '')}</span>
        <div className="flex items-center gap-3">
          <span>{tabs.length} tab{tabs.length !== 1 ? 's' : ''}</span>
          <span>{settings.zoomLevel}%</span>
        </div>
      </div>

      {/* ─── Tab Context Menu ─────────────────────────────────── */}
      {tabContextMenu && (
        <div
          className="fixed z-[200] rounded-lg py-1 shadow-lg border min-w-[160px]"
          style={{
            left: tabContextMenu.x,
            top: tabContextMenu.y,
            backgroundColor: 'var(--rb-surface)',
            borderColor: 'var(--rb-border)',
          }}
        >
          {[
            { label: 'Duplicate Tab', action: () => duplicateTab(tabContextMenu.tabId) },
            { label: 'Close Tab', action: () => closeTab(tabContextMenu.tabId) },
            {
              label: 'Close Other Tabs',
              action: () => {
                tabs.filter((t) => t.id !== tabContextMenu.tabId).forEach((t) => closeTab(t.id));
              },
            },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => {
                item.action();
                setTabContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-[var(--rb-surface-hover)]"
              style={{ color: 'var(--rb-text)' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
