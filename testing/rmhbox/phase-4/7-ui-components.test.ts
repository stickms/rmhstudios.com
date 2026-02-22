/**
 * Phase 4 §7 — Core UI Component Tests
 *
 * Verifies that all required component files exist and export
 * the expected interfaces. Since components require a React
 * rendering environment, we test module-level exports and
 * file existence.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

const componentsDir = resolve(__dirname, '../../../components/rmhbox');

describe('Core UI Components (§7)', () => {
  const requiredComponents = [
    'LobbyView.tsx',
    'GameVoting.tsx',
    'InstructionsScreen.tsx',
    'PreloadScreen.tsx',
    'ResultsScreen.tsx',
    'SpectatorBanner.tsx',
    'PlayerList.tsx',
    'RoomCodeDisplay.tsx',
    'HostControls.tsx',
    'ReadyButton.tsx',
    'ChatOverlay.tsx',
    'LeaderboardPanel.tsx',
    'GameShell.tsx',
    'minigames/MinigameRenderer.tsx',
  ];

  for (const component of requiredComponents) {
    it(`should have ${component} file`, () => {
      const filePath = resolve(componentsDir, component);
      expect(existsSync(filePath)).toBe(true);
    });
  }

  it('should have LobbyView as default export', async () => {
    const mod = await import('../../../components/rmhbox/LobbyView');
    expect(mod.default).toBeDefined();
  });

  it('should have GameVoting as default export', async () => {
    const mod = await import('../../../components/rmhbox/GameVoting');
    expect(mod.default).toBeDefined();
  });

  it('should have InstructionsScreen as default export', async () => {
    const mod = await import('../../../components/rmhbox/InstructionsScreen');
    expect(mod.default).toBeDefined();
  });

  it('should have PreloadScreen as default export', async () => {
    const mod = await import('../../../components/rmhbox/PreloadScreen');
    expect(mod.default).toBeDefined();
  });

  it('should have ResultsScreen as default export', async () => {
    const mod = await import('../../../components/rmhbox/ResultsScreen');
    expect(mod.default).toBeDefined();
  });

  it('should have SpectatorBanner as default export', async () => {
    const mod = await import('../../../components/rmhbox/SpectatorBanner');
    expect(mod.default).toBeDefined();
  });

  it('should have MinigameRenderer as default export', async () => {
    const mod = await import('../../../components/rmhbox/minigames/MinigameRenderer');
    expect(mod.default).toBeDefined();
  });

  it('should have GameShell as default export', async () => {
    const mod = await import('../../../components/rmhbox/GameShell');
    expect(mod.default).toBeDefined();
  });

  it('should have PlayerList as default export', async () => {
    const mod = await import('../../../components/rmhbox/PlayerList');
    expect(mod.default).toBeDefined();
  });

  it('should have RoomCodeDisplay as default export', async () => {
    const mod = await import('../../../components/rmhbox/RoomCodeDisplay');
    expect(mod.default).toBeDefined();
  });

  it('should have ReadyButton as default export', async () => {
    const mod = await import('../../../components/rmhbox/ReadyButton');
    expect(mod.default).toBeDefined();
  });

  it('should have HostControls as default export', async () => {
    const mod = await import('../../../components/rmhbox/HostControls');
    expect(mod.default).toBeDefined();
  });

  it('should have ChatOverlay as default export', async () => {
    const mod = await import('../../../components/rmhbox/ChatOverlay');
    expect(mod.default).toBeDefined();
  });

  it('should have LeaderboardPanel as default export', async () => {
    const mod = await import('../../../components/rmhbox/LeaderboardPanel');
    expect(mod.default).toBeDefined();
  });
});
