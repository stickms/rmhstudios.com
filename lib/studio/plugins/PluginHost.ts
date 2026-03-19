import type * as ToneNS from 'tone';
import type { StudioPlugin, InstrumentPlugin, EffectPlugin } from './plugin-types';
import { RMHSynth } from './instruments/RMHSynth';
import { RMHDrums } from './instruments/RMHDrums';
import { RMHKeys } from './instruments/RMHKeys';
import { RMHBass } from './instruments/RMHBass';
import { RMHSampler } from './instruments/RMHSampler';
import { RMHPad } from './instruments/RMHPad';

/**
 * PluginHost — factory and lifecycle manager for plugin instances.
 */
export class PluginHost {
  private plugins = new Map<string, StudioPlugin>();

  /**
   * Create a new plugin instance by ID.
   */
  createPlugin(pluginId: string, tone: typeof ToneNS): StudioPlugin | null {
    let plugin: StudioPlugin;

    switch (pluginId) {
      case 'rmh-synth': plugin = new RMHSynth(); break;
      case 'rmh-drums': plugin = new RMHDrums(); break;
      case 'rmh-keys': plugin = new RMHKeys(); break;
      case 'rmh-bass': plugin = new RMHBass(); break;
      case 'rmh-sampler': plugin = new RMHSampler(); break;
      case 'rmh-pad': plugin = new RMHPad(); break;
      default:
        console.warn(`Unknown plugin: ${pluginId}`);
        return null;
    }

    plugin.createNode(tone);
    const instanceId = crypto.randomUUID();
    this.plugins.set(instanceId, plugin);
    return plugin;
  }

  /**
   * Get a plugin instance by its instance ID.
   */
  getPlugin(instanceId: string): StudioPlugin | undefined {
    return this.plugins.get(instanceId);
  }

  /**
   * Get a plugin as an instrument (with MIDI methods).
   */
  getInstrument(instanceId: string): InstrumentPlugin | undefined {
    const p = this.plugins.get(instanceId);
    return p?.type === 'instrument' ? (p as InstrumentPlugin) : undefined;
  }

  /**
   * Remove and dispose a plugin instance.
   */
  removePlugin(instanceId: string): void {
    const plugin = this.plugins.get(instanceId);
    if (plugin) {
      plugin.dispose();
      this.plugins.delete(instanceId);
    }
  }

  /**
   * Dispose all plugin instances.
   */
  disposeAll(): void {
    for (const [id] of this.plugins) this.removePlugin(id);
  }

  /**
   * List all active instance IDs.
   */
  getInstanceIds(): string[] {
    return Array.from(this.plugins.keys());
  }
}
