/**
 * TEST SUPPORT ONLY: the in-memory DataChannel pair on a fake clock now lives
 * in lib/shared/p2p/fake-channel.test-support.ts (shared with other
 * peer-to-peer apps); re-exported here for the TF2 tests. Not imported by any
 * runtime module.
 */

export {
  FakeNet,
  fakeChannelPair,
  fakeConnection,
  type FakeChannel,
  type PathConfig,
} from '../../../shared/p2p/fake-channel.test-support';
