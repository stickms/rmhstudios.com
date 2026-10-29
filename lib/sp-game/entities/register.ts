/**
 * Imports every single-player entity module so their classes register with
 * the SP entity registry (entities/base.ts). The world imports this once.
 */
import './logic';
import './env';
import './brush';
import './triggers';
import './props';
import '../ai/actor';
import '../ai/scripted';
import '../ai/scene';
import '../portal/entities';
